/**
 * Search module: builds inverted indexes from catalog + enrichment at load,
 * then answers queries with folded match + prefix scan + fuzzy fallback.
 *
 * Folding rules (Norwegian):
 *   ø, oe → o
 *   æ, ae → a
 *   å, aa → a
 *   plus NFD diacritic stripping (è é ê → e, etc.)
 */

let _artistIndex = new Map(); // token → Set<artistId>
let _songIndex = new Map();   // token → Set<songId>
let _bodyIndex = new Map();   // token → Set<tabId>
let _allTokens = [];          // sorted array of unique tokens (for prefix scan)

let _artistById = new Map();
let _songById = new Map();
let _tabById = new Map();

export function fold(s) {
  return String(s).toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'a').replace(/å/g, 'a')
    .replace(/oe/g, 'o').replace(/ae/g, 'a').replace(/aa/g, 'a')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokenize(folded) {
  if (!folded) return [];
  return folded.split(' ').filter(t => t.length >= 2);
}

function addToIndex(index, token, id) {
  let set = index.get(token);
  if (!set) { set = new Set(); index.set(token, set); }
  set.add(id);
}

export function buildIndex(catalog, enrichment) {
  _artistIndex = new Map();
  _songIndex = new Map();
  _bodyIndex = new Map();
  _artistById = new Map();
  _songById = new Map();
  _tabById = new Map();
  const allTokenSet = new Set();

  for (const [letter, bucket] of Object.entries(catalog?.letters ?? {})) {
    for (const artist of bucket.artists) {
      const aEnrich = enrichment?.artists?.[artist.id]?.search_text ?? '';
      const aTokens = tokenize(fold(`${artist.name} ${aEnrich}`));
      for (const t of aTokens) {
        addToIndex(_artistIndex, t, artist.id);
        allTokenSet.add(t);
      }
      _artistById.set(artist.id, { artist, letter });

      for (const song of artist.songs) {
        const sEnrich = enrichment?.songs?.[song.id]?.search_text ?? '';
        const sTokens = tokenize(fold(`${artist.name} ${aEnrich} ${song.name} ${sEnrich}`));
        for (const t of sTokens) {
          addToIndex(_songIndex, t, song.id);
          allTokenSet.add(t);
        }
        _songById.set(song.id, { song, artist, letter });

        for (const tab of song.tabs) {
          const bTokens = tokenize(fold(tab.body || ''));
          for (const t of bTokens) {
            addToIndex(_bodyIndex, t, tab.id);
            allTokenSet.add(t);
          }
          _tabById.set(tab.id, { tab, song, artist, letter });
        }
      }
    }
  }

  _allTokens = [...allTokenSet].sort();
  return {
    artistTokens: _artistIndex.size,
    songTokens: _songIndex.size,
    bodyTokens: _bodyIndex.size,
    uniqueTokens: _allTokens.length,
  };
}

function prefixMatches(prefix) {
  if (!prefix) return [];
  let lo = 0, hi = _allTokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (_allTokens[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < _allTokens.length; i++) {
    if (!_allTokens[i].startsWith(prefix)) break;
    out.push(_allTokens[i]);
  }
  return out;
}

// Damerau-Levenshtein distance, capped at maxDist for speed.
function distance(a, b, maxDist = 3) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev2 = new Array(n + 1).fill(0);
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev2, prev, curr] = [prev, curr, prev2];
  }
  return prev[n];
}

function bumpScore(map, id, delta) {
  const cur = map.get(id) ?? { hits: 0, score: 0 };
  cur.hits++;
  cur.score += delta;
  map.set(id, cur);
}

export function search(query, opts = {}) {
  const { favoriteTabIds = new Set() } = opts;
  const folded = fold(query);
  const tokens = tokenize(folded);
  if (!tokens.length) return { artists: [], songs: [], bodyHits: [], suggest: null, total: 0 };

  const artistScores = new Map();
  const songScores = new Map();
  const tabScores = new Map();
  let anyHit = false;

  for (const qt of tokens) {
    const matched = prefixMatches(qt);
    for (const t of matched) {
      const exactBonus = t === qt ? 1.0 : 0.6;
      for (const aid of (_artistIndex.get(t) ?? [])) {
        bumpScore(artistScores, aid, exactBonus * 10);
        anyHit = true;
      }
      for (const sid of (_songIndex.get(t) ?? [])) {
        bumpScore(songScores, sid, exactBonus * 5);
        anyHit = true;
      }
      for (const tid of (_bodyIndex.get(t) ?? [])) {
        bumpScore(tabScores, tid, exactBonus * 1);
        anyHit = true;
      }
    }
  }

  // Songbook boost: tabs the user has bookmarked get a 4x score multiplier.
  // Per user direction: "Høyt — stor boost, men kvalitet kan fortsatt slo."
  for (const [tid, cur] of tabScores) {
    if (favoriteTabIds.has(tid)) cur.score *= 4;
  }

  // Lyrics frame is keyed by song: multiple tabs of the same song should
  // collapse to one row. Keep the highest-scoring tab as the representative.
  const bodySongMap = new Map(); // songId → { song, artist, letter, score, hits, bestTabId }
  for (const [tid, cur] of tabScores) {
    const ref = _tabById.get(tid);
    if (!ref) continue;
    const existing = bodySongMap.get(ref.song.id);
    if (!existing || cur.score > existing.score) {
      bodySongMap.set(ref.song.id, {
        song: ref.song,
        artist: ref.artist,
        letter: ref.letter,
        score: cur.score,
        hits: cur.hits,
        bestTabId: tid,
      });
    }
  }

  const sortByScore = (a, b) => b[1].score - a[1].score || b[1].hits - a[1].hits;
  const sortBodyHits = (a, b) => b.score - a.score || b.hits - a.hits;
  const limit = 20;

  const sortedArtists = [...artistScores.entries()].sort(sortByScore).slice(0, limit)
    .map(([id]) => _artistById.get(id)).filter(Boolean);
  const sortedSongs = [...songScores.entries()].sort(sortByScore).slice(0, limit)
    .map(([id]) => _songById.get(id)).filter(Boolean);
  const sortedBodyHits = [...bodySongMap.values()].sort(sortBodyHits).slice(0, limit);

  // "Mente du..." only when nothing hit and we have a single query token
  // worth correcting. Multi-token miss is usually a hopeless query.
  let suggest = null;
  if (!anyHit && tokens.length === 1) {
    const qt = tokens[0];
    if (qt.length >= 3) {
      let best = null, bestDist = Infinity;
      for (const t of _allTokens) {
        if (Math.abs(t.length - qt.length) > 2) continue;
        const d = distance(qt, t, 2);
        if (d < bestDist) {
          bestDist = d;
          best = t;
          if (d === 1) break;
        }
      }
      if (best && bestDist <= 2 && bestDist > 0) suggest = best;
    }
  }

  return {
    artists: sortedArtists,
    songs: sortedSongs,
    bodyHits: sortedBodyHits,
    suggest,
    total: sortedArtists.length + sortedSongs.length + sortedBodyHits.length,
  };
}
