# NorTabs Web — Plan

A static, single-page rewrite of `C:\devel\python\nortabs-app` (a Flet Python desktop app for nortabs.net guitar tabs). This repo replaces it — same data source, new platform, with features the original site lacks.

## Why this exists

Two motivations, in order:

**1. A constraint as creative driver.** Someone wrote Windows 95 as a JavaScript emulator running in a browser tab. Reading about that prompted a rule for web apps:

> **If it can be done in JavaScript, it shall be done in JavaScript.**

No bundler, no transpiler, no framework, no backend. Vanilla ES modules + one HTML file + one `<div id="app">`. Open `index.html` in any browser and it works; offline too. The catalog ships as one ~5 MB gzipped JSON embedded in the page. The shipped web app makes zero network calls to nortabs.net — only the nightly crawler does that, and only the server-side crawler runs Python. The goal is to find out how far the "browser is a complete computer" idea goes when taken seriously.

**2. Build a search engine that isn't stupid.** Most search is a substring match with Levenshtein on top. That's fine when you remember the title; it falls apart the moment you want to search by *vibe*. The Flet desktop app that came first (see [`nortabs-app`](C:\devel\python\nortabs-app)) was already obsoleted by nortabs.no's own official app, so the only reason to keep building was: how good can search get when an LLM-generated semantic layer feeds an in-browser inverted index with hand-tuned weighting? See the [Search](#search--current-state-and-journey) section — it's most of what this project actually *is*.

A polite-to-the-API constraint sits underneath both: explicit blessing from the nortabs.net owner, no ads, no tracking, no account, and almost all browsing happens against the pre-crawled static catalog so the live site barely touches their servers.

## Constraints and decisions (already settled)

| Decision | Choice | Why |
|---|---|---|
| Hosting | GitHub Pages (static) | Free, fast CDN, no infra to maintain. |
| Stack | **Vanilla JS + HTML + CSS, no build step** | App has ~6 views and tiny state. Frameworks are overhead, not leverage. Open `index.html` → it works. |
| State | Single `state.js` module | Centralized, predictable. Re-render current view on state change. |
| Routing | `window.location.hash` + one `hashchange` listener | Shareable URLs, works under Pages' SPA limitations. |
| Data delivery | **Embed full catalog as one `catalog.json`** | Per-letter buckets: `{ crawled_at, letters: { a: {artists: [...]}, ... } }`. Whole site ~9 MB gzipped at current crawl (see below). One download → site is offline-capable, instant. |
| Favorites | `localStorage` | Simple, ~5 MB headroom is plenty. |
| Songbooks | Named groups of favorites, **shareable via URL hash** (`#/songbook?ids=12,847,3320`) | No backend needed for sharing — it's the killer feature versus nortabs.no. |
| Crawler | Scheduled GitHub Action — **incremental Mon-Sat + full Sun**, Python stdlib only | Daily incremental diffs `/collections/browse` (which carries `tab_count` + `song_count` per artist) against the existing catalog and only fetches changed artists/songs/tabs. Typical no-change night: ~80 reqs / ~1 min. Sunday full crawl: ~15 600 reqs at 200 ms ≈ 52 min, catches tab-body edits and same-count tab swaps that incremental can't see. Per-letter checkpoints in `crawler/data/<letter>.json` make crawls resumable. Commits updated `catalog.json` back to the repo. |
| API access pattern | Crawler only. **The shipped web app never hits nortabs.net for data.** Search fall-through is the only browser→nortabs touchpoint, and it just opens nortabs.net in a new tab (no embedding, no CORS). | Reduces load on the owner's API; site stays fast and offline-capable. |
| Search fall-through | When local search returns 0 hits, show a "Søk live på nortabs.net" link that opens `https://nortabs.net/?q=...` in a new tab. No embedding, no proxy. | Honest UX; preserves offline-first; zero CORS/infra cost. |
| LLM enrichment | Sidecar `enrichment.json` produced by a **Windows Task Scheduler job at 06:00 Oslo on Tommy's machine**, not in GitHub Actions. `scheduled-enrich.ps1` pulls latest catalog, calls `run-enrich.ps1` (Claude via `claude -p --model sonnet`), commits + pushes the sidecar. Optional parallel path: `run-enrich-parallel.ps1` adds an OpenAI API worker on a disjoint letter set. | Keeps API keys + LLM bills out of CI; the scheduler uses Tommy's existing personal subscriptions. Crawler stays simple and free. |
| CORS | Not relevant for the running app (no live API calls). Only the crawler hits the API, server-to-server. | — |

## Measured data sizes (full A-Z + 0-9 crawl, 2026-05-14)

- **1202 artists, 6876 songs, 7435 tabs** across all 36 letters.
- `catalog.json`: **22.7 MB raw, 4.6 MB gzipped** (~4.9× compression on chord/lyric text).
- Pagination: `/collections/browse?sw=X` caps at 50 results; use `&page=N` (0-indexed) until empty.
- Empty letter buckets in catalog: 0, 2-8, q, x (just present as `{artists: []}`). Letter 1 has 4 artists, 9 has 4 artists, y has 8 artists, z has 5 artists. Largest: S (155 artists), T (115).
- Earlier reference numbers in `C:\Users\wossn\catalog_a.json` (159 KB, unpaginated 10-artist sample) and PLAN-doc estimates of ~2500 artists / ~13 k tabs / ~9 MB gzipped are now obsolete — actual catalog is roughly half the estimated size.

## Reference: the Python app

When in doubt about UX or data flow, read the existing app at `C:\devel\python\nortabs-app`. Pointers:

- **Overall GUI flow + architecture diagram**: `README.md` (sections "Detailed Flow" and "Component Responsibilities"). This is the canonical view of artist → song → tab → tab-content navigation, favorites flow, auto-scroll playback, and the back/forward history stack. The web app should mirror this UX.
- **API shape**: `api.py` (`NorTabsAPI` class). All endpoints, query params, and observed response shapes are documented in docstrings. The crawler in this repo should match this exactly.
- **View-by-view UI**: `views/views_main.py`, `views_collections.py`, `views_songs.py`, `views_tabs.py`, `views_favorites.py`, `views_search.py`. Each is one screen.
- **Favorites data shape**: `favorites.py` (`FavoritesManager`). Useful as a starting point for the localStorage schema — though we'll likely add songbook grouping.
- **History/back-forward stack pattern**: `navigation.py`. Concept transfers cleanly to hash routing.
- **Auto-scroll playback**: `app.py` — `start_playback`, `start_preparation_countdown`, `start_auto_scroll`. The 5-second countdown UX should carry over.

The Python app does **not** need to be kept in sync — it's a frozen reference.

## Search — current state and journey

Search is the star player. Everything else (browse, songbooks, auto-scroll, exports) is plumbing around it. The current implementation lives entirely in [`search.js`](search.js) — about 360 lines, zero dependencies, runs entirely in the browser against the embedded catalog + enrichment.

### Current capabilities

**Indexes**, built once at page load:

- `_artistIndex: Map<token, Set<artistId>>` — fed by artist name + LLM `search_text` + (for pseudo-artists) hand-curated tag string + token-alias expansions.
- `_songIndex: Map<token, Set<songId>>` — fed by artist name + artist enrichment + song name + song enrichment.
- `_bodyIndex: Map<token, Set<tabId>>` — fed by tab body (the chord-over-lyric text).
- `_artistIdf / _songIdf / _bodyIdf` — IDF weights, `log((total+1)/(df+1))` clamped to `[0.05, 1.0]`. Distinctive tokens (`tjene`, `kroppen`, `fairytale`) win; filler tokens (`jeg`, `vil`, `på`) lose.

**Query pipeline**, in order:

1. **Fold** the query: lowercase, then `ø→o`, `æ→a`, `å→a`, then bigram aliases `oe→o`, `ae→a`, `aa→a`, then NFD-normalize and strip remaining diacritics. `Bjørn`, `bjoern`, `bjorn`, `BJØRN` collapse to the same token.
2. **Tokenize and classify**: ≤3 tokens → *exploratory*, 4+ tokens → *phrase*. Phrase mode disables the name indexes entirely, so the pasted lyric `jeg vil tjene penger på kroppen min` lands on the song via body match alone — `jeg`/`vil`/`på` can no longer drag every artist named "Vilde" into the song frame.
3. **Match**:
   - Short queries get prefix-expanded against `_allTokens` (sorted, binary search). Exact match scores ×1.0, prefix match scores ×0.6. Artist hits weighted ×10 × `artistIdf`, song hits ×5 × `songIdf`.
   - Body matches are always exact, weighted by `bodyIdf × 4`.
4. **Songbook boost**: any tab in the user's local songbooks gets a **×4 score multiplier**. The user's own taste re-weights everything.
5. **Body → song propagation**: the best body match per song boosts that song's score by ×3 of its max tab score. A lyric query surfaces the *song* on the songs frame, not just an isolated tab number.
6. **Multi-tab dedup**: body propagation uses `MAX` across the song's tabs, not `SUM`. A popular song with five user-uploaded tabs no longer auto-wins over a niche song with one tab.
7. **Three result frames**: Songs → Artists → Lyrics, twenty entries each, sorted by `(score desc, hits desc)`.
8. **"Mente du …?"**: only when zero hits *and* the query is a single token. Damerau-Levenshtein distance ≤ 2 against `_allTokens`, early-exit at distance 1. Multi-token zero-hit suggestions are usually worse than nothing.
9. **Fall-through**: a `Søk live på nortabs.net` link is always rendered at the bottom of the result list (zero-hit *or* with-hits), opening `https://nortabs.net/?q=...` in a new tab. Honest UX, no embedding, no CORS.

### Two hand-curated layers on top of the LLM enrichment

Most semantic metadata is LLM-generated and lives in `enrichment.json`. Two small data tables in `search.js` sit on top:

- **`PSEUDO_ARTIST_TAGS`** — eight nortabs.net "artists" are actually thematic buckets (Lovsanger, Julesanger, Barnesanger, Fotballsanger, Salmer, 17. mai-sanger, Sørlandsviser, Folkeviser). LLM enrichment treats them as obscure artists and produces thin tags. Each gets a hand-picked synonym string instead, so `jul`, `advent`, `gospel`, `kirke`, `tilbedelse`, `kystkultur`, `fedreland` etc. all resolve. Cutoff: ≥7 songs per bucket. Children inherit the tags through the existing artist-enrichment path.
- **`TOKEN_ALIASES`** — equivalence groups for tokens that mean the same place. `[trondheim, trondhjem, tronder, tronderrock, trondelag, nidaros]` collapse into one search class; same for Oslo/Kristiania/Christiania, Bergen/bergensk/bergenser, Stavanger/siddis. Members must be written in folded form. Append as gaps surface.

Both are small, append-only data tables. No plumbing, no migration step.

### The LLM enrichment pipeline

`enrichment.json` carries the semantic layer that makes "search by vibe" work. Per-artist fields: `country`, `region`, `era`, `genre[]`, `notable`, `similar[]`, `search_text`. Per-song fields: `language`, `themes[]`, `mood[]`, `occasion[]`, `alt_titles{no,en}`, `key_phrases[]`, `search_text`. The `search_text` is a flat lowercase keyword blob that the index actually consumes — the other fields are there so a human (or future feature) can see the structured reasoning.

Two implementations:

- **`crawler/enrich.py`** — local Claude via `claude -p --model sonnet`. Quota-aware (reads `~/.claude/quota-data.json`). Wrapper `run-enrich.ps1` sleeps through 5-hour Max resets, resumable letter-by-letter.
- **`crawler/enrich-gpt.py`** — OpenAI API variant, concurrent in-flight requests via ThreadPoolExecutor.

Both write to per-letter files (`enrichment/<letter>.json`) under file locks so they can run in parallel against disjoint letter sets. The default split is Claude `a–m`, OpenAI `n–9`; `merge-enrichment.py` assembles the per-letter files into `enrichment.json` at the end.

### Journey: what worked, what failed

The repo's git log reads like a search-tuning diary. Notable stops:

| Commit | Change | Why |
|---|---|---|
| (initial) | Inverted index + exact match + prefix expansion + Damerau-Levenshtein fuzzy + Norwegian diacritic folding | Baseline. Felt good on simple queries, terrible on quoted lyrics. |
| `5716980` | Enrich quota-awareness | Claude-Max 5h resets stopped serial enrichment mid-letter. `run-enrich.ps1` reads quota-data.json and sleeps through resets. |
| `b43ef05`, `be9ad42` | Add OpenAI variant via the `openai` SDK | Second LLM lets us run parallel + cross-check. |
| `303c689` | Split prompt into stable prefix + per-entry suffix | Prompt caching cut input-token cost on long runs. |
| `7c940a4`, `18d391a` | Refactor enrichment to per-letter files + locks | Required for safe parallel writes; also made partial enrichments resumable. |
| `2ffe873` | Parallel enrichment: cross-check + reverse + merge | Run each LLM on the other's letters → diff. Surfaces hallucinations (one model claims certainty where the other admits ignorance) and genuinely ambiguous catalog entries. |
| `40ec4cb` | Concurrent in-flight requests in `enrich-gpt.py` (ThreadPool) | Make OpenAI runs an order of magnitude faster than serial. |
| `110fb3f` | Graceful Ctrl+C + content-filter handling | Long unattended runs need to interrupt cleanly. |
| `90ebb69` | Body search: IDF weighting + exact-match only | **Big one.** Body prefix expansion was the worst noise source: chord-over-lyric text contains thousands of 2-3 char prefixes. Switched to exact-only on bodies, plus IDF weighting on all three indexes so `tjene`/`kroppen` dominate `jeg`/`vil`/`på`. |
| `a6c9cc0` | Phrase mode + multi-tab dedup + Hjem-clears-search | Even with IDF, 4+ token queries dragged artists into the song frame via name index. Fix was structural: phrase queries skip name indexes entirely. Same commit: `MAX` body score per song, not `SUM`. |
| `7e18b62` | Always show "Søk live på nortabs.net" at bottom of results | Users want the live-search second-opinion button even when local results exist, not only on zero-hit. |
| `ce687e3` | Pseudo-artist tag search | Discovered that some "artists" are curated thematic buckets. Hand-picked synonym strings replace the LLM's thin output for those eight. |
| `71f45f7` | Token aliases | `tronder` was missing songs tagged `trondheim`. A 4-line data table covers the common cases; LLM doesn't need to be exhaustive about every transliteration. |

What was tried and ripped out:

- **Prefix expansion on body tokens.** Killed in `90ebb69`. Body text contains every short prefix imaginable; prefix matching turned every body token into a noise generator.
- **`SUM` body scores across a song's tabs.** Killed in `a6c9cc0`. Multi-upload-popular songs were drowning niche songs with stronger actual matches.
- **"Mente du …?" on multi-token queries.** Single-token only now. Damerau-Levenshtein on `jeg vil tjeen pegnen` produces nonsense suggestions — better to show nothing than wrong.
- **Showing the live-search button only on zero results.** Always visible now.
- **Single-LLM enrichment.** Claude alone produced gaps; OpenAI alone produced different gaps. Cross-check + reverse runs are how the catalog reached usable coverage.

### Open search questions

- **Re-ranking the songs frame when both body match and song enrichment fire on the same song.** Current behavior sums; might want to clip or take a logarithm so a song that wins on both signals doesn't completely starve nearby contenders.
- **Per-tab body weighting by tab-type.** The catalog distinguishes "chords", "tab", "bass", etc. A lyric phrase match probably means more when it's in a "chords" tab (always has lyrics) than in a "tab" tab (might be instrumental). Currently all tab types are treated equally.
- **Multi-pass enrichment for `key_phrases` quality.** LLMs occasionally hallucinate phrases that don't appear in the body. A regex check + retry-with-stricter-prompt pass would tighten this.
- **Search history / typeahead.** Not yet built. The folded-token sorted array (`_allTokens`) is half the data structure already; surfacing it as a suggestion list is small work.

## Roadmap

### Phase 1 — Local UI shell (current focus)
Goal: a static page that loads `catalog.json` (letter A) and lets you click through artist → song → tab → tab body. No polish, no styling beyond legible.

Tasks:
1. Copy `C:\Users\wossn\catalog_a.json` → `catalog.json` in this repo.
2. Scaffold:
   - `index.html` — single root `<div id="app">`, loads `app.js` as a module.
   - `state.js` — central state object (current view, current letter, current artist/song/tab, favorites, songbooks, history). Exposes `getState()`, `setState(patch)`, and a `subscribe(fn)` for re-render.
   - `router.js` — parses `location.hash`, dispatches to view, updates state on navigation.
   - `catalog.js` — in-memory catalog accessor (loads `catalog.json` once, indexes by id; no network calls to nortabs.net).
   - `views/` — one file per screen: `letter-index.js`, `artist.js`, `song.js`, `tab.js`, `favorites.js`, `songbook.js`. Each exports a `render(state, root)`.
   - `app.js` — wires router + state + views, mounts on `<div id="app">`.
   - `style.css` — minimal, readable.
3. Implement letter-A end-to-end browsing. Hash URLs:
   - `#/` — letter index (A-Z + 0-9). Only "A" works.
   - `#/letter/a` — artists for A.
   - `#/artist/:id` — songs for artist.
   - `#/song/:id` — tabs for song.
   - `#/tab/:id` — tab body.

### Phase 2 — Differentiating features
1. **Search**: see the [Search — current state and journey](#search--current-state-and-journey) section above. That's the star player; everything else is plumbing around it.
2. **Favorites & Songbooks**: see dedicated section below.
3. **Auto-scroll playback**: port the 5-second countdown + smooth scroll from `app.py`. `requestAnimationFrame`-driven.

### Favorites and songbooks (extended scope)

Concept: a **songbook** is a named, ordered collection of tabs. "Favorites" is just the default songbook ("Favoritter") — same data model, special slot in UI.

- Storage: `localStorage`, namespaced `nortabs:songbooks:v1`. Shape:
  ```json
  {
    "songbooks": [
      { "id": "fav", "name": "Favoritter", "created_at": "...", "tab_ids": [2783, 6127, ...] },
      { "id": "sommerleir-2026", "name": "Sommerleir 2026", "tab_ids": [...] }
    ]
  }
  ```
- A tab can live in multiple songbooks.
- UI: heart icon on tab view → quick-add to "Favoritter"; "+ Legg til i sangbok" → picker for other songbooks (create new from same dialog).
- **Sharing without backend**: `#/songbook/shared?name=Sommerleir+2026&ids=2783,6127,5675` — the URL *is* the share. Recipient opens it, songbook hydrates from URL params, then optionally "Lagre til mine sangbøker" persists locally. No auth, no server, no shortener. This is the killer feature versus nortabs.no.
- **Search weighting**: tabs in any of the user's local songbooks get a large score boost. Effectively: "if I've bookmarked Bjørn Eidsvåg, his name should win over a less-known same-letter artist."
- Future (Phase 4+ maybe): if we later add a backend for discovery/listing other people's public songbooks, the URL-hash share continues to work for private collections.

### Phase 3 — Full crawler + automation
1. `crawler/crawl.py` — Python script that mirrors `nortabs-app/api.py` endpoints to produce `catalog.json`. Politeness delay configurable (default 100 ms). Outputs deterministic JSON (sorted keys) so git diffs are minimal. Supports `--incremental`, which loads the existing `catalog.json`, seeds per-letter checkpoints from it (so a partial run still merges into a complete catalog), then diffs `/collections/browse` against the previous state and only fetches changed artists/songs/tabs. Empties existing tab metadata is reused for unchanged tab IDs — only new tab IDs trigger a `/tabs/tab` body fetch.
2. `.github/workflows/crawl.yml` — two cron triggers in one workflow: **Mon-Sat 03:00 UTC** runs `--incremental` (typical ~1 min); **Sun 03:00 UTC** runs a full crawl (~52 min) to catch tab-body edits and same-count tab swaps that incremental can't detect. Plus `workflow_dispatch` with a `mode` choice for manual rebuilds. Single `concurrency: catalog-crawl` group prevents overlap. Bumps `version.js` (cache-bust epoch) in the same commit when `catalog.json` changes. Requires the repo's "Workflow permissions" to be set to "Read and write" so `GITHUB_TOKEN` can push.
3. `.github/workflows/pages.yml` — deploy to GitHub Pages on push to `main`.

### Phase 5+ — Long-term vision (no concrete plans yet)

**Multi-user / band-sharing with real backend.** Eventually: login + persistent shared storage so a band or kulturskole-gruppe can pool their private tabs (UG imports, Word docs, ChordPro) into a single shared library. Each member's personal tabs flow into the group's collective bookshelf. Songbooks become collaborative.

This is a *deliberate* departure from the "no infra" decision settled in Phase 1. It only happens when:
1. The single-user offline app has proved its core value.
2. Sharing-via-URL-hash has shown its limits in practice (probably around the multi-user-private-tabs case where shared songbook URLs can't transport bodies).
3. A clear group of users actually wants this — not just hypothetically.

When the time comes, candidates for the backend: Supabase (free tier, Postgres + auth), Firebase, or a tiny custom Cloudflare Worker + KV. The shipped GitHub Pages frontend stays as-is; backend is purely additive for users who opt in. Anonymous/offline-only usage continues to work without ever touching a server.

### Phase 4 — Polish
1. Responsive layout (this needs to work well on a phone in front of a music stand).
2. Dark mode (chord sheets are read for long stretches).
3. Service worker → real PWA, full offline support, "Add to home screen".
4. Open Graph metadata for shared songbook URLs.

## Open questions for future sessions

- Should songbook URLs carry full tab IDs (compact) or a base64-encoded title list (resilient to ID changes upstream)? Probably IDs for v1, fall back to title-match if an ID 404s.
- Some songs in the letter-A crawl returned 0 tabs (47 songs, 52 tabs total — close to 1:1 but a few empties). Worth checking whether `tab_count > 0` is reliable, and whether to filter empty songs from the catalog.

## Backlog / TODO

- **Tolerant JSON parser for LLM output in enrich.py** (✅ implemented): `extract_json()` now does (a) a string-aware balanced `{...}` finder so the first complete top-level object wins regardless of trailing prose or a second emitted object, then (b) falls back from strict `json.loads` to `json5.loads` so unquoted keys / single quotes / trailing commas / comments parse cleanly. `json5` is a local-only dep (`pip install json5`) — never installed on the GitHub Actions crawler or shipped to the browser. The failure mode that motivated this was "Extra data" on Børge Rømma 2026-05-15 — LLM emitted a clean JSON object followed by an apologetic prose paragraph; greedy regex matched everything, `json.loads` choked. Smoke-tested against 8 cases covering trailing prose, two emitted objects, leading prose, braces inside strings, code fences, trailing commas, and unquoted keys.

- **Take direct control of catalog/enrichment compression in the browser** (planned, not yet built):
  - Today: GitHub Pages serves `catalog.json` with HTTP `Content-Encoding: gzip` (~5 MB on the wire). The browser decompresses transparently; JS receives a ~24 MB string and parses to a ~30+ MB object tree in heap. This is fine while [[feedback_perf_over_memory]] holds ("client RAM is not a constraint, optimize for perceived speed"), but worth revisiting if any of these change:
    1. UG/Word/ChordPro private-tab imports start growing heap noticeably.
    2. We want true offline-first via service worker — own-controlled compression on disk simplifies cache management.
    3. Cold-start parse time surfaces as a measurable bottleneck on low-end devices.
  - Three layers we could own ourselves, roughly ordered by cost:
    1. **On-wire: ship `catalog.json.br` (Brotli)**. Build step gzip-compresses or brotli-compresses the catalog after each crawl; the browser fetches the compressed asset directly and uses `DecompressionStream` (native, no library) to inflate. Brotli typically beats gzip by 15-25% on text-heavy JSON. Cost: tiny — one line in the crawler workflow, ~5 lines in `catalog.js`. Wins: removes our dependency on Pages' content-encoding plumbing, smaller bytes on the wire.
    2. **At rest in heap: per-letter compressed buckets**. Keep the catalog as a `Map<letter, Uint8Array>` of compressed letter buckets in memory. When the user navigates to letter `X`, decompress `X`'s bucket lazily into the working set. The "compressed filesystem in browser memory" pattern Tommy remembers — `fflate` (~10 KB minified, streaming inflate) or `pako` (battle-tested) are the obvious libraries; `LZ-string` if we want pure-JS-string in/out for compatibility with `localStorage`. Wins: heap footprint drops by ~5×, and we can fan out lazy decompression across `requestIdleCallback` ticks so home-page render stays fast. Costs: per-letter access is no longer free; needs careful coordination with search-index build (which currently walks the whole catalog at startup).
    3. **Binary format: MessagePack or CBOR instead of JSON**. ~30% smaller than JSON pre-compression, but post-gzip the JSON-vs-binary delta is small because JSON's repetitive structure compresses well already. Probably only worth it as a follow-up to (2), where we want fast random-access deserialization of a single compressed bucket.
  - Likely path: do (1) the moment Pages' gzip handling ever feels insufficient (~half a day of work). Graduate to (2) only when real heap-pressure measurements demand it. Skip (3) unless cold-start parse time becomes a real complaint.
  - Cross-cutting concern: cache-busting (`?v=${APP_VERSION}`) needs to apply to whichever asset(s) we ship, including the per-letter buckets in path (2).

- **Capo-first visegrep transposition** (planned, not yet built):
  - nortabs.net offers per-semitone transposition. That's not what most casual players want — semitone shifts often land in keys like F♯ or C♯ where every other chord becomes a barre, and you've made the song *harder* to play. Tommy's principle, transcribed verbatim: *"Transponering bør IMNHO KUN gå til 'spillbare visegrep'"*.
  - **Capo is the default, strongly hinted; chord-letter shifts only via an "Advanced" toggle.** Default UX presents capo positions that keep the player on open shapes they already know (C, D, E, G, A, Am, Em, Dm). The escape hatch *"Advanced mode → vanlig transponering"* unlocks the per-semitone chord-letter shifts for users who can't (or won't) use a capo, but the default path doesn't expose them.
  - **Example UX**:
    > **Transponer G → A**
    > → *"Sett capo i 2. bånd — spill som G-dur (anbefalt — alt åpent)"*
    > → *"Advanced mode → vanlig transponering"* (unfolds chord-letter shifts at +2 semitones)
  - **Algorithm** (default capo path):
    1. Determine the song's effective key Y (from the chord set, or just from `tab.chordnames`).
    2. For each candidate capo position N (0-7; higher than 7 is impractical and silly-looking):
       - Compute "play as" key X = Y − N semitones.
       - Score X by **% of the song's chords whose transposed equivalent has an open / non-barre fingering** in `chord-data.js`. Likely flag each fingering entry with `visegrep: true | false` rather than infer from `barre`.
    3. Surface the **top 2-3 (N, X) pairs**, not all 12 semitones. Buttons read e.g. *"Capo 3 — spill som D-dur (alt åpent)"* or *"Capo 0 — som vist (1 barré: Hm)"*. The N=0 (no-capo) option is always offered as the "what's on screen" baseline.
    4. **Capo preserves audible pitch.** Capo can only raise pitch, never lower. The capo path is therefore explicitly *"keep the song sounding the same but fingerings simpler"*. Players who genuinely want to *change* audible key (e.g. lower their voice's comfort) take the Advanced-mode path.
  - **UX details**:
    - When user picks a capo+key, the chord-name strings in the tab body and the chord-diagram foldout both re-render with the transposed names. The fingerings stay open-shape.
    - Persist the choice per-tab in localStorage (same store as `getTextScale` / `getPlaybackDuration`) so reopening the tab restores the player's preferred capo position.
    - Advanced-mode toggle is per-user (not per-tab) — once a player turns it on, every tab shows the full per-semitone transpose controls.
  - **First surface already shipped**: the chord-display `vise ↔ barré` toggle wired through `getChordMode`/`setChordMode` in `storage.js`. Chords with both an open visegrep voicing and a barre alternative (currently F, F#m, Bb, Fm, Cm, Hm) flip together when the user clicks the toggle in the chord foldout. When per-semitone transposition lands, the natural design is for it to read the SAME `nortabs:chord-mode` key (or live next to it as a second Advanced-mode flag if we find users want them independent).
  - Builds on the existing `chord-data.js` + `chord-diagrams.js`: the same fingering database that drives the foldout tells us which keys are "playable" for a given song's chord set.

- **Reorder tabs within a songbook**: musicians need to rearrange set lists. Implement up/down arrow buttons next to each tab in the songbook detail view. Don't bother with HTML5 native drag-and-drop — bad on touch, and the music-stand-on-phone use case is touch-first. Vanilla ↑/↓ buttons work everywhere, accessible, ~30 lines of code.

- **Export to ChordPro / other formats**: musicians often want to import songs into ChordPro-aware apps (OnSong, SongBook+, ChordSheetJS-based readers, etc.). Three implementation tiers:
  1. *Trivial*: wrap the body in `{start_of_tab}…{end_of_tab}` ChordPro directives. Preserves chord-over-lyric formatting, accepted by most readers but rendered less prettily than inline syntax.
  2. *Heuristic parser*: detect chord-line-over-lyric-line patterns, emit inline `[Cm]lyric` ChordPro syntax. ~100 lines, hits ~80 % cleanly.
  3. *LLM conversion*: extend `enrich.py` to produce `chordpro_body` per tab, with `chordpro_verified` ∈ {`heuristic`, `llm-high`, `human`}. Same human-in-the-loop pattern as scroll-start-point. ~95 % clean output for ChordPro-compliant readers.
  
  Start with (1) for immediate value; graduate to (3) when `enrich.py` grows per-tab fields (alongside scroll-start-line and YouTube-duration). PDF export is already implicitly available via `window.print()` on the HTML export.

- **Secondary search fall-through to Ultimate Guitar**: when local search has 0 hits, alongside the existing "Søk live på nortabs.net" link, add a "Søk på Ultimate Guitar" link. Format: `https://www.ultimate-guitar.com/search.php?search_type=title&value=<encoded query>`. Useful when nortabs.net also has nothing (Norwegian site, narrower coverage than UG's English-dominant catalog). Same approach: new tab, no embedding, no CORS.

- **Songbook HTML export — Lite shipped, Full Fat planned (eventually replaces Lite)**:
  - **Lite** (`exporter.js`) — static HTML, the songbook's tabs only, TOC + auto-scroll HUD. ~200-500 KB. Works offline, prints cleanly, no app dependency. Email-friendly. *Shipped — to be deprecated once Full Fat is proven.*
  - **Full Fat** — bundles the entire NorTabs app + the full catalog as embedded JSON, with the user-selected songbook pre-loaded as favorites and the URL pre-set to `#/songbook/<id>` so the file opens directly on that songbook. Recipient gets a portable copy of the whole site: full search, browse, all artists. Filesize: ~5 MB (catalog dominates) — under Gmail's 25 MB limit. Recipient can also drop in their own JSON (UG-imported or otherwise) to extend the bundle. Kulturskole/teacher use case: share a baseline with the whole catalog browsable, students add their own tabs on top. A `@media print` block in Full Fat replicates Lite's print output, so once Full Fat lands, Lite becomes redundant.
  
  Implementation notes for Full Fat:
  - Concat all `.js` modules into a single inline `<script type="module">` block (ES modules can't import-relative inside a single HTML file). A small build step in Python/Node walks the import graph.
  - Embed catalog as `<script type="application/json" id="embedded-catalog">…</script>`. Modify `catalog.js`'s `loadCatalog()` to check for that block first and fall back to `fetch('catalog.json')`.
  - Embed `enrichment.json` the same way if/when it exists at build time.
  - Pre-populate `localStorage["nortabs:songbooks:v1"]` with the user-selected songbook so it appears as a favoriter automatically on first open.
  - Add a `#/import` page (or extend `#/songbooks`) so recipient can drop in private-tab JSON files.

- **Personal library import (Word docs + ChordPro)** (planned, not yet built):
  - Tommy has thousands of personal Word documents — both single songs and multi-song "sangbøker" — plus a small set of ChordPro files. These should land in the same `nortabs:private-tabs:v1` store as UG imports, just with different `source` tags.
  - Schema extension: `source` becomes `"ultimate-guitar" | "word" | "chordpro" | "manual"`, with optional `source_filename` for traceability.
  - **ChordPro** files: parse natively (well-defined format — `{title:}`, `{artist:}`, `[Chord]lyric` syntax). ~80 lines of JS. Map directives to our schema, output bodies in chord-over-lyric format for consistency with nortabs/UG entries.
  - **Word documents** (.docx): trickier. Two implementation tiers:
    1. *Single-song doc*: unzip `.docx` (it's a ZIP), extract `word/document.xml`, parse text content. Heuristics to identify title (first heading/large text) and artist (often line 2). Body is the rest as chord-over-lyric. ~150 lines, hits ~70 % cleanly.
    2. *Multi-song "sangbok" doc*: needs splitting. Use LLM (same `enrich.py` pipeline) to: extract raw text, send to Sonnet/Opus, ask "split into songs, identify title + artist for each, return JSON array". Each result becomes a private tab. Costs O(N tokens per document), worth it given Tommy's Max subscription.
  - **Import UX**: extend the planned `#/import` page (currently UG-only) to accept multiple file types. Drag-drop or file picker, sniff format from extension/content, route to the right parser. Show preview before commit ("Found 12 songs in 'sangbok-2024.docx', import all?").
  - Same songbook/search/export integration as UG private tabs — once a tab is in `nortabs:private-tabs:v1`, it's first-class regardless of source.

- **Ultimate Guitar bookmark import** (planned, not yet built):
  - **Acquisition**: user installs a TamperMonkey/GreaseMonkey userscript that runs on ultimate-guitar.com, scrapes the logged-in user's bookmarked tabs (artist, song name, body, chordnames, source URL), and downloads a JSON file.
  - **Import UX**: new `#/import` page in the app with a `<input type="file">` (drag-drop welcome). User picks the JSON, app parses it, shows a confirm dialog with the count ("Found 47 tabs from Ultimate Guitar. Import all?"), then writes to `localStorage["nortabs:private-tabs:v1"]`.
  - **Storage schema**:
    ```json
    { "version": 1, "tabs": {
        "ug-12345": {
          "id": "ug-12345",
          "source": "ultimate-guitar",
          "source_url": "https://www.ultimate-guitar.com/...",
          "artist": "Townes Van Zandt",
          "song": "Tecumseh Valley",
          "body": "...chord text...",
          "chordnames": ["C","G","Am"],
          "imported_at": "..."
        }
    }}
    ```
  - **Catalog integration**: `getTab(id)` (catalog.js) checks the private-tabs store as a fallback when the ID is a string starting with `ug-`. Tab view, search index builder, and songbook membership all treat private tabs identically to catalog tabs (with a small visual "UG"-badge). Routes `#/tab/ug-12345` work natively.
  - **Songbook sharing**: a shared songbook URL containing `ug-12345` IDs is meaningless to the recipient — they don't have the body. Two options to decide later: (a) inline the tab body in the share URL for private tabs (URLs become big — ~7 KB per private tab uncompressed), or (b) render placeholders with "private tab, ask sender for an export". Default to (b) for v1.
  - **Re-import**: identify by `source_url`. Same URL → replace body (preserve songbook memberships). Different URL → new entry.
  - **Storage budget**: 5-10 MB localStorage limit. Avg UG tab body ~5-15 KB. Hundreds of imported tabs fit comfortably.

## Auto-scroll playback duration (planned)

Default playback duration is **180 s** (3 min — radio-edit length). Sing-along guitar tabs are essentially never used with solo-extended versions, so 180 s is the right fallback. Per-tab user adjustments persist and override.

Future enrichment: LLM finds the song on YouTube, reads the video duration, writes to `enrichment.songs[sid]`:
```json
{
  "youtube_url": "...",
  "youtube_duration_s": 247,
  "youtube_verified": "llm-auto" | "needs-human" | "human"
}
```

Auto-accept threshold: **240 s**. LLM-found duration ≤ 240 s → `llm-auto`, used as default. Duration > 240 s → `needs-human`, stored but **not** used as default until a human confirms (same "ask me + save forever" pattern as scroll-start-point). This rules out live versions, extended jams, etc. as accidental defaults.

## Auto-scroll scroll-start-point (planned)

70-90 % of tabs have "noise" at the top (uploader notes, capo info, tips). For now, auto-scroll always starts from the user's current scroll position — they scroll past the noise themselves, then hit play. Future iterations should add a smart default jump-to-line:

1. **Heuristic**: first line with ≥2 chord-shaped tokens (G, Am, C#m, F#7…). Free baseline, catches most tabs.
2. **LLM-augmented**: enrichment job analyzes each tab body, stores `scroll_from_line` and `scroll_verified` ∈ {`heuristic`, `llm-high`, `human`} in `enrichment.tabs[tid]`.
3. **Human-in-the-loop for edge cases**: when LLM is unsure (or heuristic disagrees with LLM), the app shows a "Stemmer startpunktet?"-prompt — the user confirms or corrects, app saves `scroll_verified: "human"` to the sidecar. Tab IDs are stable and bodies don't change in practice, so a human verification holds "for all eternity" — future LLM runs skip the entry entirely.

User position **always** overrides the suggested jump: if user has scrolled before hitting play, that position wins regardless of what's stored.

## Resolved API facts

- `/tabs/tab?id={id}` returns the chord/lyric text in **`body`**, not `content`. The Python app's `api.py:326` `data.get("content")` is wrong. Crawler uses `body`. ✓
- `tab.chordnames` is a **JSON array of strings** (e.g. `["Am","Bb","C"]`), not a space-separated string. Crawler stores it as-is; views must join for display. ✓
- `/collections/browse?sw={letter}` paginates with **`&limit={N}` (cap 50) and `&page={N}` (0-indexed)**. Without pagination params, it returns 10 results — easy to mistake for "this letter has 10 artists". Loop until response is empty. ✓
- Both `/collections/browse` and `/collections/collection?id=X` carry **cheap change-detection signals**: browse entries include `tab_count` + `song_count` per artist; collection entries include `tab_count` per song. The incremental crawler diffs these against the existing catalog and skips deeper fetches when counts match. Caveat: a tab being replaced (one removed + one added on the same song, same total count) is invisible to this diff — only the weekly full crawl catches it. ✓

## Working artifacts (outside the repo)

- `C:\Users\wossn\catalog_a.json` — superseded; the 10-artist unpaginated sample. Do not use.
- `C:\Users\wossn\nortabs_crawl_test.py` — proto-crawler (also unpaginated, also superseded). `crawler/crawl.py` in this repo is the real one.
- `C:\Users\wossn\nortabs_a.json`, `nortabs_artist.json`, `nortabs_tab.json` — raw single-endpoint samples, useful when verifying API shape.
