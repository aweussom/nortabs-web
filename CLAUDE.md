# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read PLAN.md first

`PLAN.md` is the canonical spec for this project — architecture, stack decisions, data sizes, roadmap phases, and open questions. Read it before doing anything substantive. This file does not duplicate its contents; it only adds the operational context a fresh session would otherwise miss.

## Repository state

This is a **greenfield project**. As of this writing the repo contains only `PLAN.md` and a sample `catalog.json` (letter-A crawl, ~159 KB). There is no code yet, no `package.json`, no build step, no test runner, no lint config. Do not invent build/test commands — there are none until someone writes them.

When Phase 1 begins, the stack is **vanilla JS modules + HTML + CSS, no bundler**. Opening `index.html` in a browser is the dev loop. Local serving (when needed for ES module CORS) is `python -m http.server` from the repo root — do not introduce node tooling without asking.

## Architecture (when files start existing)

Per PLAN.md the intended module layout is flat:

- `index.html` — single `<div id="app">`, loads `app.js` as a module.
- `state.js` — central state + `getState()` / `setState(patch)` / `subscribe(fn)`. Re-render the current view on change.
- `router.js` — parses `location.hash`, dispatches to a view, updates state.
- `catalog.js` — **in-memory catalog accessor**. Loads `catalog.json` once, indexes by id. It does **not** hit nortabs.net. (Deliberately *not* called `api.js` — the shipped web app makes no network calls; only the Phase-3 Python crawler does.)
- `views/` — one file per screen, each exports `render(state, root)`.
- `crawler/` (Phase 3) — Python; the **only** code in the project that calls nortabs.net.

The hard architectural rule: **the shipped web app never makes network calls to nortabs.net's API.** All browsing is served from the embedded `catalog.json`. Only the nightly GitHub Action crawler talks to the upstream API. Preserve this boundary — it's the whole reason the project exists.

## Reference: the Python app at `C:\devel\python\nortabs-app`

The web app is a rewrite of an existing Flet desktop app. When a UX or data-shape question comes up, that app is authoritative:

- `README.md` — overall flow + component responsibilities. UX should mirror this.
- `api.py` (`NorTabsAPI`) — endpoints, params, observed response shapes in docstrings. The Python crawler in *this* repo must match.
- `views/views_*.py` — one file per screen, matches the intended `views/` layout here.
- `favorites.py`, `navigation.py`, `app.py` (`start_playback` etc.) — starting points for localStorage schema, history stack, and auto-scroll countdown.

The Python app is a **frozen reference**, not a sibling to keep in sync.

## API gotchas (see PLAN.md "Resolved API facts" for confirmed shapes)

- `/collections/browse?sw={letter}` paginates with `limit` (cap 50) and `page` (0-indexed). Without those params it silently returns 10 — easy to mistake for "this letter has only 10 artists." `crawler/crawl.py` iterates until empty.
- Tab content is in `body` (not `content`). `chordnames` is a JSON array, not a space-separated string.
- Some songs return 0 tabs. Open question whether to filter them out of the catalog.
- Songbook share URLs: PLAN.md leans toward raw IDs with title-match fallback if an ID 404s. Don't switch to base64-encoded title lists without revisiting that decision.

## Catalog format

`catalog.json` is `{ crawled_at, letters: { a: {artists: [...]}, b: {...}, ... } }`. Per-letter buckets — partial crawls remain valid. `catalog.js` is the only module that reads this shape; views call `getArtistsForLetter(l)` / `getArtist(id)` / `getSong(id)` / `getTab(id)`. The latter three return `{ artist|song|tab, ..., letter }` for back-link routing.

## Crawler

`crawler/crawl.py` — zero-dep stdlib Python (urllib). Args: `--letters`, `--delay-ms` (default 100), `--user-agent`, `--checkpoint-dir` (default `crawler/data/`), `--out` (default `catalog.json`), `--merge-only`, `--force`. Per-letter checkpoint files in `crawler/data/<letter>.json` survive interruptions; the merge step assembles `catalog.json` from whatever checkpoints exist. Default delay 100 ms is "obviously polite"; full A-Z + 0-9 crawl is ~3 hours at 200 ms, ~9 MB gzipped catalog.

## Working artifacts outside the repo

- `C:\Users\wossn\catalog_a.json` and `nortabs_crawl_test.py` — early unpaginated samples; superseded by `crawler/crawl.py`. Keep for historical reference only.
- `C:\Users\wossn\nortabs_a.json`, `nortabs_artist.json`, `nortabs_tab.json` — raw single-endpoint samples for verifying API shape.
