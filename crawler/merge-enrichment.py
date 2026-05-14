#!/usr/bin/env python3
"""Merge per-letter enrichment files into a single enrichment.json.

enrichment/<letter>.json files are the source of truth, written by
enrich.py and enrich-gpt.py. The web app loads `enrichment.json` (this
script's output). Run after any enrichment work to refresh the merged file.

Idempotent: re-running with no changes produces the same merged file.
Deterministic: sorted keys, compact separators.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description="Merge per-letter enrichment files")
    p.add_argument("--in-dir", default="enrichment",
                   help="Directory of <letter>.json files (default: enrichment/).")
    p.add_argument("--out", default="enrichment.json",
                   help="Merged output file (default: enrichment.json).")
    args = p.parse_args()

    in_dir = Path(args.in_dir)
    out_path = Path(args.out)

    if not in_dir.exists():
        print(f"input dir not found: {in_dir}", file=sys.stderr)
        sys.exit(1)

    merged = {
        "version": 1,
        "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": "merged",
        "artists": {},
        "songs": {},
    }

    letter_count = 0
    models = set()
    for f in sorted(in_dir.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        a = data.get("artists") or {}
        s = data.get("songs") or {}
        merged["artists"].update(a)
        merged["songs"].update(s)
        m = data.get("model")
        if m:
            models.add(m)
        letter_count += 1
        print(f"  {f.stem}: +{len(a)} artists, +{len(s)} songs", file=sys.stderr)

    if models:
        merged["model"] = "+".join(sorted(models))

    text = json.dumps(merged, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    out_path.write_text(text, encoding="utf-8")

    print(
        f"merged {letter_count} letters → {out_path} "
        f"({len(merged['artists'])} artists, {len(merged['songs'])} songs, "
        f"{out_path.stat().st_size:,} bytes)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
