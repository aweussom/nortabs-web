# NorTabs Web — Plan

A static, single-page rewrite of `C:\devel\python\nortabs-app` (a Flet Python desktop app for nortabs.net guitar tabs). This repo replaces it — same data source, new platform, with features the original site lacks.

## Why this exists

The owner of nortabs.no has shipped his own ad-supported app. Tommy has his explicit blessing to use the API but does **not** want to compete commercially or take ad revenue. This rewrite is a hobby project to:

1. Fix what frustrates him on nortabs.no: **bad search**, **no shareable songbooks**, **slow page loads**.
2. Be polite about API usage — the live site should hit nortabs.net's API as little as possible. Almost all browsing happens against a pre-crawled static catalog. Only the nightly crawler talks to the API.

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
| LLM enrichment | Sidecar `enrichment.json` produced by a **local cron job on Tommy's machine**, not in GitHub Actions. Invokes a local LLM CLI (copilot-cli with free Haiku, or claude-code with Sonnet 4.6). Pushes only the sidecar back to the repo. | Keeps API keys out of CI; cron uses existing local subscriptions. Crawler stays simple and free. |
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
1. **Search**: client-side, weighted, multi-source. Inputs: artist + song enriched `search_text` (from `enrichment.json`), tab `body` (via inverted index built at load), favorites/songbook membership (vekter skyhøyt). Layout: pinned search field at top; results stream into three hidden frames (artists / songs / lyrics) that reveal as matches appear. Includes:
   - Diakritisk-folding for ISO-8859-1-challenged folk: `ø↔o↔oe`, `æ↔a↔ae`, `å↔a↔aa`. Exact (med diakritisk) scorer høyere enn single-char-fold som scorer høyere enn bigram-fold.
   - Fuzzy match (Damerau-Levenshtein, edit-distance ≤ 2) for skrivefeil.
   - "Mente du …" suggestions when top hit has edit-distance > 2.
   - **Fall-through**: 0 hits → "Søk live på nortabs.net"-knapp åpner ny tab. Ingen embedding, ingen CORS.
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

- **Tolerant JSON parser for LLM output in enrich.py**: Sonnet 4.6 occasionally produces JSON-ish text with unquoted keys, single quotes, or trailing commas. Current `extract_json()` uses strict `json.loads` → such entries fail and get retried on the next run. Failure rate is small (1 in ~240 during letter A's first pass) but non-zero. Three implementation options when failure rate gets annoying:
  1. **`json5` (PyPI)** — handles JS-style relaxed JSON cleanly. Adds a dep, but only on the local enrichment machine — not on the GitHub Actions crawler or the shipped web app. Pip install + a one-line import swap.
  2. **Hand-rolled `_repair_json()`** — regex passes for: quote unquoted keys, replace single quotes with double quotes (carefully — strings might contain apostrophes), strip trailing commas. Zero-dep but brittle.
  3. **Stricter prompt** — add "USE DOUBLE QUOTES ON ALL KEYS AND VALUES; NO TRAILING COMMAS; NO COMMENTS" to ARTIST_PROMPT and SONG_PROMPT. Doesn't fix existing failures but reduces future rate.
  
  Recommendation: do (3) as a free first pass; if failures persist, add (1) — `json5` is well-maintained, < 1 KB on import, and the dep cost is acceptable for a local-only tool. (2) only if we want truly zero-dep at the cost of robustness.

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
