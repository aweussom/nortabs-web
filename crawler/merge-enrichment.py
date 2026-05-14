#!/usr/bin/env python3
"""Merge enrichment.json (Claude) and enrichment-gpt.json (Azure OpenAI) into
a single enrichment.json that the web app loads.

Strategy:
  - Take union of artists + songs from both files.
  - On overlap (same ID enriched by both), prefer the entry with the longer
    `search_text` — that's a rough quality proxy: more terms = more recall
    potential at runtime. Tweak with --prefer flag if you have a stronger
    opinion.

Idempotent: re-running with no changes produces the same merged file.

Usage:
    python crawler/merge-enrichment.py
    python crawler/merge-enrichment.py --prefer claude
    python crawler/merge-enrichment.py --prefer gpt
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def _len(d, key):
    """Length of d[key] if string, else 0. For ranking overlap entries."""
    v = d.get(key)
    return len(v) if isinstance(v, str) else 0


def pick(a, b, prefer):
    if prefer == "claude":
        return a if a else b
    if prefer == "gpt":
        return b if b else a
    # auto: longer search_text wins
    if not a:
        return b
    if not b:
        return a
    return a if _len(a, "search_text") >= _len(b, "search_text") else b


def main():
    p = argparse.ArgumentParser(description="Merge enrichment-*.json files")
    p.add_argument("--claude", default="enrichment.json")
    p.add_argument("--gpt", default="enrichment-gpt.json")
    p.add_argument("--out", default="enrichment.json",
                   help="Output (default overwrites the Claude file).")
    p.add_argument("--prefer", choices=("auto", "claude", "gpt"), default="auto",
                   help="On overlap: auto = longer search_text wins (default), "
                        "or force claude/gpt.")
    args = p.parse_args()

    cp = Path(args.claude)
    gp = Path(args.gpt)
    op = Path(args.out)

    claude = json.loads(cp.read_text(encoding="utf-8")) if cp.exists() else {"artists": {}, "songs": {}}
    gpt = json.loads(gp.read_text(encoding="utf-8")) if gp.exists() else {"artists": {}, "songs": {}}

    c_a = claude.get("artists", {}) or {}
    c_s = claude.get("songs", {}) or {}
    g_a = gpt.get("artists", {}) or {}
    g_s = gpt.get("songs", {}) or {}

    merged_a = {}
    merged_s = {}
    overlaps_a = 0
    overlaps_s = 0
    for k in set(c_a) | set(g_a):
        if k in c_a and k in g_a:
            overlaps_a += 1
        merged_a[k] = pick(c_a.get(k), g_a.get(k), args.prefer)
    for k in set(c_s) | set(g_s):
        if k in c_s and k in g_s:
            overlaps_s += 1
        merged_s[k] = pick(c_s.get(k), g_s.get(k), args.prefer)

    merged = {
        "version": 1,
        "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": f"merged ({args.prefer}-preferred)",
        "artists": merged_a,
        "songs": merged_s,
    }
    text = json.dumps(merged, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    op.write_text(text, encoding="utf-8")

    print(
        f"merged {len(merged_a)} artists ({len(c_a)} claude, {len(g_a)} gpt, "
        f"{overlaps_a} overlap)",
        file=sys.stderr,
    )
    print(
        f"merged {len(merged_s)} songs ({len(c_s)} claude, {len(g_s)} gpt, "
        f"{overlaps_s} overlap)",
        file=sys.stderr,
    )
    print(f"out: {op}", file=sys.stderr)


if __name__ == "__main__":
    main()
