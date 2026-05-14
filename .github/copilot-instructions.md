# Copilot Instructions for NorTabs Web

## Project Overview

NorTabs Web is a static single-page application for browsing guitar tabs and chord sheets from nortabs.net. It's a rewrite of an existing Flet desktop app, with a focus on offline-first browsing via an embedded catalog.

**Key architectural principle**: The shipped web app never makes network calls to nortabs.net. All data comes from an embedded `catalog.json`. Only the Python crawler (Phase 3) calls the API.

See `PLAN.md` for the full roadmap, data sizes, and design decisions.

## Stack

- **Vanilla JavaScript modules + HTML + CSS** (no bundler, no build step)
- **State management**: Single `state.js` module with `getState()`, `setState()`, `subscribe()`
- **Routing**: Hash-based (`window.location.hash`) with a single `hashchange` listener
- **Data**: Pre-crawled `catalog.json` loaded once at startup, indexed in-memory
- **Dev loop**: Open `index.html` directly or run `python -m http.server` from repo root for ES module CORS

## High-Level Architecture

### Core Modules (Flat Layout)

- **`index.html`** — Single `<div id="app">` root, loads `app.js` as a module
- **`app.js`** — Entry point; wires router, state, views, and search
- **`state.js`** — Central state store; notifies subscribers on changes, triggers re-render of current view
- **`router.js`** — Parses hash route, dispatches to handler, updates state; supports nested routes like `#/artist/123?...`
- **`catalog.js`** — In-memory catalog accessor; loads `catalog.json` once, indexes by id for O(1) lookups. **Never calls nortabs.net.**
- **`search.js`** — Builds full-text index at startup; exports `buildIndex(catalogData, enrichment)` for weighted, fuzzy, diacritic-aware search
- **`storage.js`** — localStorage helpers for favorites, songbooks, scroll positions, playback state
- **`playback.js`** — Auto-scroll countdown + smooth scroll logic (5-second countdown, requestAnimationFrame-driven)
- **`util.js`** — Utility functions (diacritic folding, fuzzy matching, formatting)

### Views (`views/*.js`)

Each exports a `render(state, root)` function:

- **`letter-index.js`** — Artist list for a letter (A-Z, 0-9)
- **`artist.js`** — Songs for a given artist
- **`song.js`** — Tabs for a given song
- **`tab.js`** — Displays tab body with playback controls; has lifecycle hooks (`teardownTabBindings()`)
- **`search-bar.js`** — Search UI (pinned header); renders results in hidden frames that show/hide as matches appear
- **`songbooks.js`** — List of user's saved songbooks (favorites + custom)
- **`songbook.js`** — Display a saved songbook (list of tabs with reorder, delete)
- **`share.js`** — Shared songbook view (from URL hash); offers "Save to my songbooks"

### Crawler (`crawler/crawl.py`)

Python (stdlib only) that crawls nortabs.net via paginated API endpoints:

- Fetches `/collections/browse?sw={letter}&limit=50&page={N}` (paginates until empty)
- Fetches song details and tab bodies per collection
- Per-letter checkpoint files in `crawler/data/<letter>.json` make crawls resumable
- Output: deterministic JSON with sorted keys to minimize git diffs
- **Args**: `--letters` (default all), `--delay-ms` (default 100), `--user-agent`, `--checkpoint-dir`, `--out`, `--merge-only`, `--force`

## Data Structures

### catalog.json
```json
{
  "crawled_at": "2026-05-14T19:33:00Z",
  "letters": {
    "a": {
      "artists": [
        {
          "id": 123,
          "name": "Artist Name",
          "songs": [
            {
              "id": 456,
              "name": "Song Title",
              "tabs": [
                {
                  "id": 789,
                  "body": "chord/lyric text",
                  "chordnames": ["Am", "C", "G"]
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

### enrichment.json (sidecar, optional)
```json
{
  "crawled_at": "2026-05-14T...",
  "artists": {
    "123": { "search_text": "extra searchable text" }
  },
  "songs": {
    "456": { "search_text": "..." }
  },
  "tabs": {
    "789": {
      "youtube_url": "...",
      "youtube_duration_s": 180,
      "scroll_from_line": 5,
      "scroll_verified": "llm-auto" | "human"
    }
  }
}
```

### localStorage (nortabs:v1)
```json
{
  "songbooks": [
    { "id": "fav", "name": "Favoritter", "tab_ids": [789, ...] },
    { "id": "custom-id", "name": "Sommerleir 2026", "tab_ids": [...] }
  ],
  "scrollStarts": { "789": 5 },
  "playbackDurations": { "456": 200 }
}
```

## Key Conventions

### Hash Routes

- `#/` — Home (letter index)
- `#/letter/a` — Artist list for letter "a"
- `#/artist/{id}` — Songs for artist
- `#/song/{id}` — Tabs for song
- `#/tab/{id}` — Display tab (chord sheet + playback)
- `#/songbooks` — List saved songbooks
- `#/songbook/{id}` — Display saved songbook
- `#/share?name=Foo&ids=789,456` — Shared songbook (no persistence)

### State Shape

```javascript
{
  route: { name, ...args },
  // Additional state added by views/modules as needed
}
```

### View Rendering

- Call `getState()` to read current state
- Return HTML string or use `root.replaceWith()` / `root.appendChild()`
- State changes trigger `subscribe()` listeners, which call the current view's render function
- Use `window.scrollTo(0, 0)` to reset scroll on navigation

### Naming

- **Modules**: kebab-case (`search.js`, `search-bar.js`)
- **Functions**: camelCase (`getArtistsForLetter`, `fetchJson`)
- **IDs/classes**: kebab-case (CSS, DOM)
- **Storage keys**: `nortabs:*` namespace

### Search

- Input: artist name, song name, lyrics (from tab `body`), enriched `search_text`
- Diacritic folding: `ø↔o↔oe`, `æ↔a↔ae`, `å↔a↔aa`
- Fuzzy match: Damerau-Levenshtein (edit-distance ≤ 2)
- Weighting: songbook membership boosts score, exact matches score higher than fuzzy
- Zero hits: show "Søk live på nortabs.net" link (opens new tab, no embedding)

### Playback (Auto-Scroll)

- Default duration: 180 s (3 min)
- UX: 5-second countdown before auto-scroll starts
- User scroll position overrides jump-to-line suggestion
- `requestAnimationFrame`-driven smooth scroll
- Per-tab overrides stored in `enrichment.tabs[id].youtube_duration_s` or user-adjusted durations in localStorage

### Songbooks

- "Favoritter" is the default songbook (special slot in UI)
- Shareable via URL hash: `#/share?name=Foo&ids=123,456,789`
- Tab can belong to multiple songbooks
- Heart icon quick-adds to "Favoritter"; "+ Legg til i sangbok" picker for others

## API Gotchas (Confirmed)

- `/collections/browse?sw={letter}` returns max 10 results without `&limit` and `&page` params. Must paginate (limit 50, pages 0-indexed) until empty.
- Tab content is in `body` field, not `content`.
- `tab.chordnames` is a JSON array of strings, not space-separated.
- Some songs return 0 tabs; decision pending whether to filter them.

## Reference Implementation

The Python desktop app at `C:\devel\python\nortabs-app` is the UX reference (frozen, not to be kept in sync):

- **`README.md`** — Overall flow, component responsibilities, auto-scroll countdown
- **`api.py`** — API shapes and endpoints (Python crawler should match)
- **`views/views_*.py`** — One-to-one correspondence with `views/*.js` files
- **`favorites.py`**, **`navigation.py`**, **`app.py`** — Patterns for favorites schema, history stack, playback logic

## Testing and Validation

- No build step, no test runner yet (greenfield project)
- Manual testing: open `index.html` in a browser
- For CORS with ES modules, run `python -m http.server` from repo root and visit `http://localhost:8000`
- Check browser console for search index stats on load: `[search] index built: {...}`

## Crawler Execution

**Local test run** (letter A only):
```bash
cd crawler
python3 crawl.py --letters a --delay-ms 200
```

**Full crawl** (A-Z + 0-9, ~3 hours at 200 ms):
```bash
cd crawler
python3 crawl.py --delay-ms 200
```

**Resume interrupted crawl**:
```bash
cd crawler
python3 crawl.py --merge-only
```

**Force re-crawl a letter**:
```bash
cd crawler
python3 crawl.py --letters a --force
```

Output: `catalog.json` in repo root; checkpoints in `crawler/data/<letter>.json`.

## Important Files to Know

- **`PLAN.md`** — Project spec, roadmap phases, resolved API facts, open questions
- **`CLAUDE.md`** — Implementation context (read first when starting work)
- **`catalog.json`** — Current catalog (letter A, ~158 KB raw, ~9 MB expected when full)
- **`enrichment.json`** — Optional sidecar (LLM metadata, scroll start points, YouTube links)
- **`.git/hooks/`** — Future: commit message formatting, pre-push checks

## Open Questions

- Should shared songbook URLs use compact IDs or base64-encoded title lists (resilient to upstream ID changes)?
- Filter songs with 0 tabs from the catalog?
- Add "Søk på Ultimate Guitar" as a second search fall-through?

## Hard Boundaries

1. **Web app ↔ API boundary**: The shipped app never calls nortabs.net. Period. Only the crawler does.
2. **State management**: Centralized in `state.js`. Views are pure functions of state.
3. **Vanilla stack**: No npm, no bundler, no transpiler. ES6+ modules + standard DOM APIs.
