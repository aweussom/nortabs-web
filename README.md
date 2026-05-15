# NorTabs

A static, single-page web app for browsing Norwegian guitar tabs from [nortabs.net](https://nortabs.net), with smart search, shareable songbooks, and auto-scroll playback.

**Live**: [aweussom.github.io/nortabs-web](https://aweussom.github.io/nortabs-web/)

A hobby rewrite of an [existing Flet desktop app](../nortabs-app), built with explicit blessing from the nortabs.net owner. Not a commercial competitor — no ads, no tracking, no account required.

---

## What this is

Three frustrations with the official nortabs.no drove this:

1. **Search is shallow.** You can only search by exact title fragments.
2. **No shareable songbooks.** You can favorite tabs but not group them or send a setlist to a band member.
3. **Slow page loads** with full server round-trips between every artist / song / tab click.

This app addresses all three by trading "always-live" for "weekly-snapshot":

- A nightly crawler fetches the entire nortabs.net catalog into one `catalog.json` (~5 MB gzipped, ~7600 tabs).
- The catalog is embedded in the page. Every navigation is instant — no API calls during normal use.
- An LLM-generated `enrichment.json` adds **semantic metadata** to each artist and song: genres, regions, themes, moods, occasions, alternate titles, and key lyric phrases. This is what makes search actually useful — searching `eurovision`, `barnesanger`, `melankolsk`, or even a half-remembered lyric line all work.
- Songbooks are stored in `localStorage` and shared via URL hash. No backend.

When the local search comes up empty (or you want broader coverage), a small "Søk live på nortabs.net" link is always visible at the bottom of the results.

---

## Search examples

After enrichment, all of these work — none of the terms appear in raw tab data:

| Query | Why it matches |
|---|---|
| `eurovision` | Tagged on artists who have competed |
| `melankolsk` / `melancholic` | Mood tag — Norwegian + English equivalents |
| `barnesanger` | Genre — Prøysen, Egner, etc. |
| `trondheim` | Region tag for trønderrock artists |
| `roadtrip` | Occasion tag |
| `jeg vil tjene penger på kroppen min` | Verbatim lyric from a song (body match) |
| `bjoern eidsvaag` | ø↔oe and å↔aa folding for ASCII keyboards |
| `rybek` | Typo for "rybak" — "Mente du …?" suggestion |

---

## Architecture

Vanilla JS modules, no build step. Open `index.html` in any browser — it works.

```
nortabs-web/
├── index.html              # single root, loads app.js as a module
├── app.js                  # router + state + view dispatch
├── state.js                # central state with pub/sub
├── router.js               # hash routing
├── catalog.js              # loads catalog.json once, indexes by id
├── search.js               # inverted index with IDF + folding + fuzzy
├── chord-wrap.js           # context-sensitive line wrapping for mobile
├── storage.js              # localStorage for songbooks + playback
├── playback.js             # auto-scroll engine
├── exporter.js             # songbook → standalone HTML export
├── version.js              # cache-busting stamp (auto-bumped on commit)
├── views/
│   ├── letter-index.js     # home page (A-Z + Æ Ø Å + 0-9)
│   ├── artist.js           # one artist's songs
│   ├── song.js             # one song's tabs
│   ├── tab.js              # tab body + heart + auto-scroll
│   ├── songbook.js         # songbook detail + share
│   ├── songbooks.js        # list of songbooks
│   ├── share.js            # hydrate a shared songbook from URL
│   └── search-bar.js       # sticky search across all views
├── catalog.json            # crawler output (committed)
├── enrichment.json         # merged enrichment (committed, web app loads this)
├── enrichment/<letter>.json # per-letter enrichment checkpoints
├── home-wordcloud.svg      # decorative background, regenerated on enrich
├── style.css
└── crawler/
    ├── crawl.py            # nortabs.net catalog crawler (stdlib only)
    ├── enrich.py           # local LLM enrichment via `claude -p`
    ├── enrich-gpt.py       # Azure OpenAI variant (concurrent, openai SDK)
    ├── merge-enrichment.py # combine per-letter → enrichment.json
    ├── generate-wordcloud.py # build home-wordcloud.svg
    ├── run-enrich.ps1      # quota-aware serial wrapper for Claude
    └── run-enrich-parallel.ps1 # disjoint-letter parallel driver
```

See `CLAUDE.md` for the operational details and `PLAN.md` for the full design history and backlog.

---

## Running locally

```sh
# In one terminal: serve the static site
python -m http.server 8765

# Open http://localhost:8765/ in any browser.
```

That's it. There is no build step.

---

## Crawling and enrichment

The crawler and enrichment scripts are local-only tools — they don't ship to the browser.

```sh
# Refresh the catalog (~3 hours at 200 ms politeness delay):
python crawler/crawl.py

# Local LLM enrichment via `claude -p` (Sonnet 4.6 by default):
python crawler/enrich.py

# Or via Azure OpenAI (e.g. gpt-5-mini, concurrent):
$env:AZURE_OPENAI_ENDPOINT   = "https://...openai.azure.com"
$env:AZURE_OPENAI_API_KEY    = "..."
$env:AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini"
python crawler/enrich-gpt.py

# Parallel: Claude does a-m, GPT does the rest, then merge.
pwsh -File crawler/run-enrich-parallel.ps1

# Manual merge if you've added per-letter files:
python crawler/merge-enrichment.py

# Refresh the homepage wordcloud:
python crawler/generate-wordcloud.py
```

Dependencies:
- Crawler: stdlib only.
- `enrich.py`: needs `claude` CLI on PATH.
- `enrich-gpt.py`: `pip install openai`.
- `generate-wordcloud.py`: `pip install wordcloud pillow numpy`.

---

## For nortabs.net's owner

If you're reading this and you maintain nortabs.net: **feel free to grab `enrichment.json` and use it however you want.** The MIT license below makes it explicit; this section is the friendlier version.

The semantic search dimensions (genres, moods, themes, occasions, regions, alternate titles, lyric phrases) took roughly 50,000 LLM calls and a day of compute. If they would help your search on the live site, please just take them. No attribution required, though obviously appreciated.

The crawler is rate-limited (200 ms between requests, ~28k requests for a full sweep) so it doesn't hammer your servers. If you'd prefer a different cadence or want me to consume from a feed instead, drop me a note.

---

## License

MIT — see [LICENSE](LICENSE). The catalog content itself is sourced from nortabs.net and remains the property of its users; the enrichment metadata, source code, and aggregations in this repository are MIT-licensed.

---

## Acknowledgments

- The owner of nortabs.net for graciously permitting API access.
- All the uploaders on nortabs.net who painstakingly transcribed these tabs.
- The Flet desktop app (`nortabs-app`) that came first.
