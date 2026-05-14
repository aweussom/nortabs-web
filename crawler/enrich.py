#!/usr/bin/env python3
"""Local LLM enrichment for the nortabs-web catalog.

Reads `catalog.json`, diffs against `enrichment.json`, and enriches missing
artist/song entries by invoking a local LLM CLI (default: `claude -p`).
Writes incrementally so a crash never loses work. Idempotent: re-runs skip
already-enriched entries unless --force.

Designed to run as a local cron job on Tommy's machine — keeps the LLM-API
cost out of GitHub Actions and lets him use whichever local CLI subscription
he prefers (claude-code with Sonnet 4.6 or copilot-cli with Haiku).

Typical use:
    # First-time dry run to see what would be enriched:
    python crawler/enrich.py --dry-run --limit 5

    # Small real run to inspect output quality:
    python crawler/enrich.py --limit 5 --types artist

    # Full enrichment of everything missing:
    python crawler/enrich.py

    # Override the CLI command:
    python crawler/enrich.py --cli "copilot suggest"

Zero dependencies (stdlib only).
"""
import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_CLI = "claude -p --model sonnet"
DEFAULT_MODEL_TAG = "claude-sonnet-4-6"

ARTIST_PROMPT = """\
You are enriching a Norwegian guitar-tab catalog with search metadata for a web app.
Output ONE JSON object only — no markdown fences, no commentary, no surrounding text.

Artist name: {name}

Produce JSON with these fields (all optional except search_text):
{{
  "search_text": "flat string of lowercase keywords blending Norwegian and English: artist name(s), aliases, country, region, era (decade), genre tags, similar artists. 30-60 words.",
  "country": "norge | uk | usa | sverige | ...",
  "region": "optional city/region",
  "era": "e.g. '1990-2010', '1950-1970'",
  "genre": ["pop", "folk", "rock", ...],
  "notable": "one-line note if there is something noteworthy",
  "similar": ["artists similar in style"]
}}

Rules:
- If you do not know the artist, output minimal JSON: {{"search_text": "<artist name lowercased>"}}.
- For Norwegian artists: include both Norwegian and English mood/genre terms in search_text.
- For artists you do know, lean toward broad recall — include common misspellings and aliases.
- No markdown fences. No commentary. Just the JSON object.
"""

SONG_PROMPT = """\
You are enriching a Norwegian guitar-tab catalog with search metadata for a web app.
Output ONE JSON object only — no markdown fences, no commentary, no surrounding text.

Artist: {artist}
Song: {song}
First 800 chars of one tab body (for lyric/style context):
---
{body}
---

Produce JSON with these fields (all optional except search_text):
{{
  "search_text": "flat lowercase keywords blending Norwegian and English: themes, mood, occasion, alt-titles, key lyric phrases. 30-80 words.",
  "language": "norsk | english | mixed | unknown",
  "themes": ["love", "heartbreak", "childhood", "faith", ...],
  "mood": ["melancholy", "joyful", "anthemic", "trist", "lystig", ...],
  "occasion": ["wedding", "christmas", "funeral", "breakup", ...],
  "alt_titles": {{"no": "...", "en": "..."}},
  "key_phrases": ["3-5 memorable lyric phrases from the body, verbatim or near-verbatim"]
}}

Rules:
- For Norwegian songs: include English equivalents of mood/genre/themes in search_text.
- For English songs: include Norwegian equivalents.
- key_phrases must come from the body text (verbatim or very close).
- No markdown fences. No commentary. Just the JSON object.
"""

_JSON_OBJ_RE = re.compile(r"\{[\s\S]*\}")


def reconfigure_streams():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def call_llm(cli_cmd, prompt, timeout=120):
    """Run cli_cmd with prompt appended as a final argv. Returns stdout."""
    cmd = list(cli_cmd) + [prompt]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8"
    )
    if result.returncode != 0:
        snippet = (result.stderr or result.stdout or "")[:500]
        raise RuntimeError(f"CLI failed (rc={result.returncode}): {snippet}")
    return result.stdout


def extract_json(text):
    """Best-effort JSON extraction: strip fences, find first {...} block."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _JSON_OBJ_RE.search(text)
    if not m:
        raise ValueError(f"No JSON object in LLM output: {text[:200]}")
    return json.loads(m.group(0))


def load_enrichment(path):
    if not path.exists():
        return {"version": 1, "enriched_at": None, "model": None, "artists": {}, "songs": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("artists", {})
    data.setdefault("songs", {})
    return data


def write_enrichment(path, data, model_tag):
    data["enriched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data["model"] = model_tag
    data.setdefault("version", 1)
    text = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")


def iter_entries(catalog):
    """Yields ('artist'|'song', id, payload) tuples in catalog order."""
    for letter, bucket in (catalog.get("letters") or {}).items():
        for artist in bucket.get("artists", []):
            yield ("artist", artist["id"], artist)
            for song in artist.get("songs", []):
                yield ("song", song["id"], {"artist_name": artist["name"], "song": song})


def main():
    reconfigure_streams()
    p = argparse.ArgumentParser(description="LLM enrichment for nortabs catalog")
    p.add_argument("--catalog", default="catalog.json")
    p.add_argument("--out", default="enrichment.json")
    p.add_argument("--cli", default=DEFAULT_CLI,
                   help='Shell command to invoke the LLM (default: "claude -p"). '
                        "The prompt is appended as a final argv.")
    p.add_argument("--model-tag", default=DEFAULT_MODEL_TAG,
                   help="Label written to enrichment.json's 'model' field.")
    p.add_argument("--types", default="artist,song",
                   help="Comma-separated types to enrich: artist, song.")
    p.add_argument("--limit", type=int, default=0,
                   help="Stop after enriching N entries (0 = no limit).")
    p.add_argument("--delay-ms", type=int, default=200,
                   help="Sleep between LLM calls (default 200ms).")
    p.add_argument("--ids", default="",
                   help="Comma-separated artist/song IDs to enrich (overrides diff).")
    p.add_argument("--force", action="store_true",
                   help="Re-enrich entries that already have data.")
    p.add_argument("--dry-run", action="store_true",
                   help="Show what would be enriched without calling the LLM.")
    args = p.parse_args()

    catalog_path = Path(args.catalog)
    out_path = Path(args.out)
    cli_cmd = args.cli.split()
    types = {t.strip() for t in args.types.split(",") if t.strip()}
    explicit_ids = {int(x) for x in args.ids.split(",") if x.strip()} if args.ids else None
    delay_s = args.delay_ms / 1000.0

    if not catalog_path.exists():
        print(f"catalog not found: {catalog_path}", file=sys.stderr)
        sys.exit(1)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    enrichment = load_enrichment(out_path)

    def log(msg):
        print(msg, file=sys.stderr, flush=True)

    enriched = 0
    skipped = 0
    failed = 0
    t0 = time.time()

    for kind, ident, payload in iter_entries(catalog):
        if kind not in types:
            continue
        if explicit_ids is not None and ident not in explicit_ids:
            continue
        bucket = enrichment["artists"] if kind == "artist" else enrichment["songs"]
        if not args.force and str(ident) in bucket:
            skipped += 1
            continue

        if kind == "artist":
            prompt = ARTIST_PROMPT.format(name=payload["name"])
            label = f"artist #{ident} '{payload['name']}'"
        else:
            tabs = payload["song"].get("tabs", [])
            body_excerpt = tabs[0].get("body", "")[:800] if tabs else "(no tab body)"
            prompt = SONG_PROMPT.format(
                artist=payload["artist_name"],
                song=payload["song"]["name"],
                body=body_excerpt,
            )
            label = f"song #{ident} '{payload['artist_name']}' - '{payload['song']['name']}'"

        if args.dry_run:
            log(f"[dry] would enrich {label} ({len(prompt)} char prompt)")
            enriched += 1
        else:
            log(f"enriching {label}…")
            try:
                output = call_llm(cli_cmd, prompt)
                data = extract_json(output)
            except Exception as e:
                log(f"  ! failed: {e}")
                failed += 1
                time.sleep(delay_s)
                continue
            bucket[str(ident)] = data
            write_enrichment(out_path, enrichment, args.model_tag)
            enriched += 1
            time.sleep(delay_s)

        if args.limit and enriched >= args.limit:
            log(f"reached --limit {args.limit}, stopping.")
            break

    elapsed = time.time() - t0
    log(f"done. enriched={enriched} skipped={skipped} failed={failed} in {elapsed:.1f}s.")
    if not args.dry_run:
        log(f"out: {out_path}")


if __name__ == "__main__":
    main()
