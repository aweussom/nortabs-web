#!/usr/bin/env python3
"""LLM enrichment via Azure OpenAI (e.g. GPT-5-mini).

Mirror of crawler/enrich.py that hits an Azure OpenAI deployment instead of
the local `claude` CLI. Useful for:
  - Benchmarking enrichment quality between Sonnet 4.6 and GPT-5-mini
  - Filling entries without burning the Claude Max quota
  - Side-by-side comparison: output goes to enrichment-gpt.json by default
    so it doesn't clobber the canonical enrichment.json

Uses Azure's `response_format: {"type":"json_object"}` so the model is
guaranteed to return valid JSON — this avoids the parse failures we
occasionally see with Claude (unquoted keys, single quotes, etc.).

Reads Azure config from environment variables:
  AZURE_OPENAI_ENDPOINT     e.g. https://my-resource.openai.azure.com
  AZURE_OPENAI_API_KEY      the secret
  AZURE_OPENAI_DEPLOYMENT   e.g. gpt-5-mini
  AZURE_OPENAI_API_VERSION  optional, default 2024-08-01-preview

Zero dependencies (stdlib urllib only). Reuses prompts and helpers from
enrich.py so prompt structure is identical for fair quality comparison.

Typical use:
    $env:AZURE_OPENAI_ENDPOINT   = "https://...azure.com"
    $env:AZURE_OPENAI_API_KEY    = "..."
    $env:AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini"
    python crawler/enrich-gpt.py --letter å --limit 5
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Reuse prompts and shared helpers from the Claude enrich script.
sys.path.insert(0, str(Path(__file__).parent))
from enrich import (
    ARTIST_PROMPT,
    SONG_PROMPT,
    extract_json,
    iter_entries,
    load_enrichment,
    reconfigure_streams,
    write_enrichment,
)

DEFAULT_API_VERSION = "2024-08-01-preview"
DEFAULT_MODEL_TAG = "azure-openai-gpt5-mini"


def call_azure(prompt, endpoint, deployment, api_key, api_version, timeout=60):
    """POST to Azure OpenAI chat completions. Returns the model's content string."""
    url = (
        f"{endpoint.rstrip('/')}/openai/deployments/{deployment}/chat/completions"
        f"?api-version={api_version}"
    )
    body = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 1500,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "api-key": api_key,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


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
    p.add_argument("--ids", default="")
    p.add_argument("--force", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--rate-limit-per-min",
        type=int,
        default=25,
        help="Max requests per minute (default 25, safe under 20k TPM cap "
        "for ~700-token requests).",
    )
    p.add_argument("--max-consecutive-failures", type=int, default=3)
    args = p.parse_args()

    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
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
    explicit_ids = (
        {int(x) for x in args.ids.split(",") if x.strip()} if args.ids else None
    )
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

    def log(msg):
        print(msg, file=sys.stderr, flush=True)

    enriched = 0
    skipped = 0
    failed = 0
    consec_fail = 0
    last_call = 0.0
    t0 = time.time()

    def do_call(prompt):
        return extract_json(
            call_azure(prompt, endpoint, deployment, api_key, api_version)
        )

    for kind, ident, payload, letter in iter_entries(catalog, letters_filter):
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
            label = f"artist #{ident} [{letter}] '{payload['name']}'"
        else:
            tabs = payload["song"].get("tabs", [])
            body_excerpt = (
                tabs[0].get("body", "")[:800] if tabs else "(no tab body)"
            )
            prompt = SONG_PROMPT.format(
                artist=payload["artist_name"],
                song=payload["song"]["name"],
                body=body_excerpt,
            )
            label = (
                f"song #{ident} [{letter}] '{payload['artist_name']}'"
                f" - '{payload['song']['name']}'"
            )

        if args.dry_run:
            log(f"[dry] would enrich {label} ({len(prompt)} char prompt)")
            enriched += 1
        else:
            elapsed = time.time() - last_call
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)

            log(f"enriching {label}…")
            try:
                data = do_call(prompt)
                last_call = time.time()
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    log("  ! 429 rate limit; sleeping 30s and retrying")
                    time.sleep(30)
                    try:
                        data = do_call(prompt)
                        last_call = time.time()
                    except Exception as e2:
                        log(f"  ! failed after 429 retry: {e2}")
                        failed += 1
                        consec_fail += 1
                        if consec_fail >= args.max_consecutive_failures:
                            log(f"  ! {consec_fail} consecutive failures — exiting")
                            sys.exit(2)
                        continue
                else:
                    log(f"  ! HTTP {e.code}: {e.reason}")
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
