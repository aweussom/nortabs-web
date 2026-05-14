#!/usr/bin/env python3
"""LLM enrichment via Azure OpenAI (e.g. gpt-5-mini).

Mirror of crawler/enrich.py that hits an Azure OpenAI deployment instead of
the local `claude` CLI. Useful for:
  - Benchmarking enrichment quality between Sonnet 4.6 and gpt-5-mini
  - Filling entries without burning the Claude Max quota
  - Side-by-side comparison: output goes to enrichment-gpt.json by default
    so it doesn't clobber the canonical enrichment.json (Sonnet output).

Quirks baked in for the Q-Free NOC resource (per project notes):
  - api_version pinned to 2024-12-01-preview (minimum for chat.completions
    on this resource).
  - No `temperature` kwarg — gpt-5-mini errors out on anything except the
    default 1.0.
  - /responses API is region-locked off here; stick with chat.completions.
    Worth re-testing ~2026-08-06 — if it opens, swap to client.responses.create
    unchanged otherwise.

Config via environment variables:
  AZURE_OPENAI_ENDPOINT       e.g. https://...openai.azure.com
  AZURE_OPENAI_API_KEY        the secret
  AZURE_OPENAI_DEPLOYMENT     e.g. gpt-5-mini (deployment NAME, not family)
  AZURE_OPENAI_API_VERSION    optional, default 2024-12-01-preview

Requires `pip install openai`. Reuses prompts and helpers from enrich.py
so prompt structure is identical for fair quality comparison.

Typical use:
    $env:AZURE_OPENAI_ENDPOINT   = "https://...openai.azure.com"
    $env:AZURE_OPENAI_API_KEY    = "..."
    $env:AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini"
    python crawler/enrich-gpt.py --letter å --limit 5
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

# Reuse shared helpers from the Claude enrich script (catalog iteration,
# JSON extraction, IO). Prompts are NOT reused — gpt-5-mini benefits a lot
# from prompt caching, which needs the static instructions split into a
# `system` message and only the variable bits in the `user` message. See
# ARTIST_SYSTEM / SONG_SYSTEM below.
sys.path.insert(0, str(Path(__file__).parent))
from enrich import (
    extract_json,
    iter_entries,
    load_enrichment,
    reconfigure_streams,
    write_enrichment,
)

# Split prompts: identical system prefix → automatic prompt-cache hit on
# every call after the first within the cache window (~5 min on Azure
# OpenAI). System message is ~600 tokens; user message is 10-200 tokens.
# Same instructions as enrich.py's ARTIST_PROMPT/SONG_PROMPT — restructured
# so the static content comes FIRST and stays bit-identical between calls.

ARTIST_SYSTEM = """\
You are enriching a Norwegian guitar-tab catalog with search metadata for a web app.
Output ONE JSON object only — no markdown fences, no commentary, no surrounding text.

Schema (all fields optional except search_text):
{
  "search_text": "flat string of lowercase keywords blending Norwegian and English: artist name(s), aliases, country, region, era (decade), genre tags, similar artists. 30-60 words.",
  "country": "norge | uk | usa | sverige | ...",
  "region": "optional city/region",
  "era": "e.g. '1990-2010', '1950-1970'",
  "genre": ["pop", "folk", "rock", ...],
  "notable": "one-line note if there is something noteworthy",
  "similar": ["artists similar in style"]
}

Rules:
- If you do not know the artist, output minimal JSON: {"search_text": "<artist name lowercased>"}.
- For Norwegian artists: include both Norwegian and English mood/genre terms in search_text.
- For artists you do know, lean toward broad recall — include common misspellings and aliases.
- No markdown fences. No commentary. Just the JSON object.

The next user message names the artist."""

ARTIST_USER = "Artist name: {name}"

SONG_SYSTEM = """\
You are enriching a Norwegian guitar-tab catalog with search metadata for a web app.
Output ONE JSON object only — no markdown fences, no commentary, no surrounding text.

Schema (all fields optional except search_text):
{
  "search_text": "flat lowercase keywords blending Norwegian and English: themes, mood, occasion, alt-titles, key lyric phrases. 30-80 words.",
  "language": "norsk | english | mixed | unknown",
  "themes": ["love", "heartbreak", "childhood", "faith", ...],
  "mood": ["melancholy", "joyful", "anthemic", "trist", "lystig", ...],
  "occasion": ["wedding", "christmas", "funeral", "breakup", ...],
  "alt_titles": {"no": "...", "en": "..."},
  "key_phrases": ["3-5 memorable lyric phrases from the body, verbatim or near-verbatim"]
}

Rules:
- For Norwegian songs: include English equivalents of mood/genre/themes in search_text.
- For English songs: include Norwegian equivalents.
- key_phrases must come from the body text (verbatim or very close).
- No markdown fences. No commentary. Just the JSON object.

The next user message provides the artist, song name, and the first 800 chars of one tab body."""

SONG_USER = """\
Artist: {artist}
Song: {song}
First 800 chars of one tab body:
---
{body}
---"""

DEFAULT_API_VERSION = "2024-12-01-preview"
DEFAULT_MODEL_TAG = "azure-openai-gpt5-mini"

# Deferred — only required when actually making calls, so --dry-run works
# without the openai SDK installed.
_openai_mod = None
_openai_errors = None


def _ensure_openai():
    """Lazy-import openai SDK. Exits with a clear message if missing."""
    global _openai_mod, _openai_errors
    if _openai_mod is not None:
        return _openai_mod, _openai_errors
    try:
        from openai import AzureOpenAI, APIStatusError, RateLimitError
    except ImportError:
        print(
            "missing dependency: pip install openai\n"
            "(only crawler/enrich-gpt.py needs this; enrich.py via "
            "`claude -p` has no such dependency.)",
            file=sys.stderr,
        )
        sys.exit(1)
    _openai_mod = AzureOpenAI
    _openai_errors = (APIStatusError, RateLimitError)
    return _openai_mod, _openai_errors


def make_client(endpoint, api_key, api_version):
    AzureOpenAI, _ = _ensure_openai()
    return AzureOpenAI(
        api_key=api_key,
        api_version=api_version,
        azure_endpoint=endpoint,
        timeout=120,
    )


def call_azure(client, deployment, system_msg, user_msg):
    """One round-trip to the deployment. Returns the model's content string.

    Notes:
      - System + user split exists for prompt caching: identical system
        prefix across calls lets gpt-5-mini reuse the cached prefix tokens
        (cheaper + faster from the 2nd call within the cache window).
      - No `temperature` — gpt-5-mini rejects anything except default 1.0.
      - `response_format={"type":"json_object"}` guarantees valid JSON when
        supported. If the deployment errors on it, retry once without and
        rely on extract_json()'s best-effort parsing.
    """
    _, (APIStatusError, _RateLimitError) = _ensure_openai()
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]
    try:
        resp = client.chat.completions.create(
            model=deployment,  # deployment NAME (not family)
            messages=messages,
            response_format={"type": "json_object"},
        )
    except APIStatusError as e:
        # Some deployments don't support response_format — retry plain.
        if e.status_code == 400 and "response_format" in str(e).lower():
            resp = client.chat.completions.create(
                model=deployment,
                messages=messages,
            )
        else:
            raise
    return resp.choices[0].message.content


def main():
    reconfigure_streams()
    p = argparse.ArgumentParser(
        description="Azure OpenAI enrichment for nortabs catalog"
    )
    p.add_argument("--catalog", default="catalog.json")
    p.add_argument(
        "--out",
        default="enrichment-gpt.json",
        help="Output file (default: enrichment-gpt.json — separate from "
        "enrichment.json so benchmarks don't clobber the Sonnet output).",
    )
    p.add_argument("--model-tag", default=DEFAULT_MODEL_TAG)
    p.add_argument("--types", default="artist,song")
    p.add_argument("--letter", default="")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument(
        "--ids",
        default="",
        help="DEPRECATED: matches both artist AND song IDs (no disambiguation). "
        "Use --artist-ids / --song-ids for clean filtering.",
    )
    p.add_argument(
        "--artist-ids",
        default="",
        help="Comma-separated artist IDs to enrich. Songs are ignored unless "
        "--song-ids is also passed.",
    )
    p.add_argument(
        "--song-ids",
        default="",
        help="Comma-separated song IDs to enrich. Artists are ignored unless "
        "--artist-ids is also passed.",
    )
    p.add_argument("--force", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--reverse",
        action="store_true",
        help="Iterate letters in reverse. Use this with enrich.py running "
        "forward so they meet in the middle.",
    )
    p.add_argument(
        "--cross-check",
        default="",
        help="Path to another enrichment file (e.g. enrichment.json). Entries "
        "present there are skipped, so two parallel enrichers don't duplicate work.",
    )
    p.add_argument(
        "--rate-limit-per-min",
        type=int,
        default=10,
        help="Max requests per minute (default 10). Each call is ~1500-2000 "
        "tokens total (system ~280 + user ~220 + output 500-1000), so 10 req/min "
        "≈ 15-20k TPM — safely under the 20k TPM cap on the Q-Free resource. "
        "Halve it (5) if sharing the resource with other tasks.",
    )
    p.add_argument("--max-consecutive-failures", type=int, default=3)
    args = p.parse_args()

    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    # Accept either AZURE_OPENAI_API_KEY (script default) or AZURE_API_KEY
    # (the shorter name used elsewhere in Tommy's tooling).
    api_key = os.environ.get("AZURE_OPENAI_API_KEY") or os.environ.get("AZURE_API_KEY")
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", DEFAULT_API_VERSION)

    if not args.dry_run:
        missing = [
            n
            for n, v in [
                ("AZURE_OPENAI_ENDPOINT", endpoint),
                ("AZURE_OPENAI_API_KEY", api_key),
                ("AZURE_OPENAI_DEPLOYMENT", deployment),
            ]
            if not v
        ]
        if missing:
            print(f"missing env vars: {', '.join(missing)}", file=sys.stderr)
            sys.exit(1)

    catalog_path = Path(args.catalog)
    out_path = Path(args.out)
    types = {t.strip() for t in args.types.split(",") if t.strip()}
    explicit_any_ids = (
        {int(x) for x in args.ids.split(",") if x.strip()} if args.ids else None
    )
    explicit_artist_ids = (
        {int(x) for x in args.artist_ids.split(",") if x.strip()}
        if args.artist_ids else None
    )
    explicit_song_ids = (
        {int(x) for x in args.song_ids.split(",") if x.strip()}
        if args.song_ids else None
    )

    def id_filter_allows(kind, ident):
        """Apply --artist-ids / --song-ids / --ids filters.

        - If EITHER type-specific filter is set, type-specific filters are
          authoritative: a kind without its own filter is rejected entirely
          (so `--artist-ids 24` enriches only artist 24, no songs).
        - Otherwise, fall back to legacy --ids (matches any-type, deprecated).
        - With no filter set, accept all.
        """
        if explicit_artist_ids is not None or explicit_song_ids is not None:
            if kind == "artist":
                return explicit_artist_ids is not None and ident in explicit_artist_ids
            if kind == "song":
                return explicit_song_ids is not None and ident in explicit_song_ids
        if explicit_any_ids is not None:
            return ident in explicit_any_ids
        return True

    letters_filter = (
        {l.strip().lower() for l in args.letter.split(",") if l.strip()}
        if args.letter
        else None
    )
    min_interval = 60.0 / max(1, args.rate_limit_per_min)

    if not catalog_path.exists():
        print(f"catalog not found: {catalog_path}", file=sys.stderr)
        sys.exit(1)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    enrichment = load_enrichment(out_path)

    cross_path = Path(args.cross_check) if args.cross_check else None
    cross_data = (
        load_enrichment(cross_path) if (cross_path and cross_path.exists()) else None
    )
    cross_last_read = time.time()

    def is_already_done(kind, ident):
        nonlocal cross_data, cross_last_read
        bucket = enrichment["artists"] if kind == "artist" else enrichment["songs"]
        if str(ident) in bucket:
            return True
        if cross_path is not None:
            if time.time() - cross_last_read > 30 and cross_path.exists():
                try:
                    cross_data = load_enrichment(cross_path)
                except Exception:
                    pass
                cross_last_read = time.time()
            if cross_data:
                cbucket = cross_data.get(
                    "artists" if kind == "artist" else "songs", {}
                )
                if str(ident) in cbucket:
                    return True
        return False

    if args.dry_run:
        client = None
        RateLimitError = Exception  # placeholder, never raised in dry-run
    else:
        client = make_client(endpoint, api_key, api_version)
        _, (_, RateLimitError) = _ensure_openai()

    def log(msg):
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] {msg}", file=sys.stderr, flush=True)

    enriched = 0
    skipped = 0
    failed = 0
    consec_fail = 0
    last_call = 0.0
    t0 = time.time()

    for kind, ident, payload, letter in iter_entries(catalog, letters_filter, reverse=args.reverse):
        if kind not in types:
            continue
        if not id_filter_allows(kind, ident):
            continue
        bucket = enrichment["artists"] if kind == "artist" else enrichment["songs"]
        if not args.force and is_already_done(kind, ident):
            skipped += 1
            continue

        if kind == "artist":
            system_msg = ARTIST_SYSTEM
            user_msg = ARTIST_USER.format(name=payload["name"])
            label = f"artist #{ident} [{letter}] '{payload['name']}'"
        else:
            tabs = payload["song"].get("tabs", [])
            body_excerpt = (
                tabs[0].get("body", "")[:800] if tabs else "(no tab body)"
            )
            system_msg = SONG_SYSTEM
            user_msg = SONG_USER.format(
                artist=payload["artist_name"],
                song=payload["song"]["name"],
                body=body_excerpt,
            )
            label = (
                f"song #{ident} [{letter}] '{payload['artist_name']}'"
                f" - '{payload['song']['name']}'"
            )

        if args.dry_run:
            prompt_chars = len(system_msg) + len(user_msg)
            log(f"[dry] would enrich {label} ({prompt_chars} char prompt: {len(system_msg)} system + {len(user_msg)} user)")
            enriched += 1
        else:
            elapsed = time.time() - last_call
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)

            log(f"enriching {label}…")
            try:
                content = call_azure(client, deployment, system_msg, user_msg)
                data = extract_json(content)
                last_call = time.time()
            except RateLimitError:
                log("  ! rate limit; sleeping 30s and retrying")
                time.sleep(30)
                try:
                    content = call_azure(client, deployment, system_msg, user_msg)
                    data = extract_json(content)
                    last_call = time.time()
                except Exception as e2:
                    log(f"  ! failed after rate-limit retry: {e2}")
                    failed += 1
                    consec_fail += 1
                    if consec_fail >= args.max_consecutive_failures:
                        log(f"  ! {consec_fail} consecutive failures — exiting")
                        sys.exit(2)
                    continue
            except Exception as e:
                log(f"  ! failed: {e}")
                failed += 1
                consec_fail += 1
                if consec_fail >= args.max_consecutive_failures:
                    log(f"  ! {consec_fail} consecutive failures — exiting")
                    sys.exit(2)
                continue

            bucket[str(ident)] = data
            write_enrichment(out_path, enrichment, args.model_tag)
            enriched += 1
            consec_fail = 0

        if args.limit and enriched >= args.limit:
            log(f"reached --limit {args.limit}, stopping.")
            break

    total = time.time() - t0
    log(f"done. enriched={enriched} skipped={skipped} failed={failed} in {total:.1f}s.")
    if not args.dry_run:
        log(f"out: {out_path}")


if __name__ == "__main__":
    main()
