#!/usr/bin/env python3
"""nortabs.net catalog crawler. Polite (configurable delay), resumable via per-letter checkpoints.

Zero dependencies (stdlib only) — runs in GitHub Actions without a setup step.

Output shape (root catalog.json):
    {
      "crawled_at": "2026-05-14T19:33:00Z",
      "letters": {
        "a": { "artists": [{id, name, songs: [{id, name, tabs: [{id, body, ...}]}]}] },
        ...
      }
    }
"""
import argparse
import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://nortabs.net/api/v1"
DEFAULT_UA = (
    "NorTabsWebCrawler/1.0 "
    "(hobby project; contact: tommy.leonhardsen@q-free.com)"
)
DEFAULT_DELAY_MS = 100
# Norwegian alphabet adds æ, ø, å after z. nortabs.net's browse endpoint
# accepts these (URL-encoded). Digits last so the natural index order matches
# what users expect.
ALL_LETTERS = list("abcdefghijklmnopqrstuvwxyzæøå0123456789")


def fetch_json(url, user_agent, timeout=15):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "application/json",
            "Referer": "https://nortabs.net/",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


PAGE_SIZE = 50  # API caps limit at 50; pages are 0-indexed.


def fetch_artists_for_letter(letter, delay_s, user_agent, log):
    """Paginate /collections/browse?sw={letter} until empty."""
    artists = []
    page = 0
    sw = urllib.parse.quote(letter)  # æ/ø/å need percent-encoding
    while True:
        url = f"{BASE}/collections/browse?sw={sw}&limit={PAGE_SIZE}&page={page}"
        batch = fetch_json(url, user_agent).get("collections", [])
        time.sleep(delay_s)
        if not batch:
            break
        artists.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        page += 1
    return artists


def crawl_letter(letter, delay_s, user_agent, log):
    t0 = time.time()
    log(f"[{letter}] fetching artist list (paginated)")
    artists = fetch_artists_for_letter(letter, delay_s, user_agent, log)
    log(f"[{letter}] {len(artists)} artists")

    out_artists = []
    n_songs = n_tabs = 0
    # browse pages: ceil(artists/PAGE_SIZE) plus one final empty page (unless exact multiple)
    browse_pages = max(1, (len(artists) + PAGE_SIZE - 1) // PAGE_SIZE)
    if len(artists) % PAGE_SIZE == 0 and len(artists) > 0:
        browse_pages += 1
    req_count = browse_pages

    for ai, artist in enumerate(artists, 1):
        aid, aname = artist["id"], artist["name"]
        log(f"[{letter}] ({ai:>3}/{len(artists)}) {aname}")
        try:
            adata = fetch_json(
                f"{BASE}/collections/collection?id={aid}&songs=1", user_agent
            )
            req_count += 1
            time.sleep(delay_s)
        except (urllib.error.URLError, json.JSONDecodeError) as e:
            log(f"  ! artist {aid} fetch failed: {e}")
            time.sleep(delay_s)
            continue
        songs = adata.get("songs") or adata.get("tabs") or []

        out_songs = []
        for song in songs:
            sid, sname = song["id"], song["name"]
            try:
                sdata = fetch_json(f"{BASE}/songs/song?id={sid}", user_agent)
                req_count += 1
                time.sleep(delay_s)
            except (urllib.error.URLError, json.JSONDecodeError) as e:
                log(f"  ! song {sid} failed: {e}")
                time.sleep(delay_s)
                continue
            tabs = sdata.get("tabs", [])

            out_tabs = []
            for tab in tabs:
                tid = tab["id"]
                try:
                    tdata = fetch_json(f"{BASE}/tabs/tab?id={tid}", user_agent)
                    req_count += 1
                    time.sleep(delay_s)
                except (urllib.error.URLError, json.JSONDecodeError) as e:
                    log(f"    ! tab {tid} failed: {e}")
                    time.sleep(delay_s)
                    continue
                out_tabs.append({
                    "id": tid,
                    "tab_type_id": tab.get("tab_type_id"),
                    "rating_stars": tab.get("rating_stars"),
                    "uploaded_by_name": tab.get("uploaded_by_name"),
                    "body": tdata.get("body", ""),
                    "chordnames": tdata.get("chordnames"),
                    "chordfingerings": tdata.get("chordfingerings"),
                    "formatting_id": tdata.get("formatting_id"),
                    "transposing": tdata.get("transposing"),
                })
                n_tabs += 1
            out_songs.append({"id": sid, "name": sname, "tabs": out_tabs})
            n_songs += 1
        out_artists.append({"id": aid, "name": aname, "songs": out_songs})

    elapsed = time.time() - t0
    log(
        f"[{letter}] done: {len(out_artists)} artists, "
        f"{n_songs} songs, {n_tabs} tabs, {req_count} reqs in {elapsed:.1f}s"
    )
    return {"artists": out_artists}


def write_json(path, obj):
    """Deterministic JSON: sorted keys, compact separators, utf-8 unescaped."""
    text = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")


def merge_checkpoints(checkpoint_dir, out_path, log):
    """Merge ALL checkpoint files in the directory, regardless of --letters.

    A partial crawl (e.g. `--letters å,æ,ø`) must not wipe the other letters
    from the merged catalog. We always read every `*.json` checkpoint and let
    them all in.
    """
    merged = {
        "crawled_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "letters": {},
    }
    for cp in sorted(checkpoint_dir.glob("*.json")):
        letter = cp.stem
        try:
            merged["letters"][letter] = json.loads(cp.read_text(encoding="utf-8"))
        except Exception as e:
            log(f"  ! could not read checkpoint {cp}: {e}")
    write_json(out_path, merged)
    raw = out_path.read_bytes()
    gz = gzip.compress(raw)
    log(
        f"merged {len(merged['letters'])} letters → {out_path} "
        f"({len(raw):,} B, gzip {len(gz):,} B)"
    )


def main():
    # On Windows, sys.stderr defaults to the active code page (cp1252) and mangles
    # non-ASCII names like "Bør Børson". Force UTF-8 so logs roundtrip cleanly.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    p = argparse.ArgumentParser(description="nortabs.net catalog crawler")
    p.add_argument(
        "--letters",
        default=",".join(ALL_LETTERS),
        help="comma-separated letters to crawl (default: all a-z + 0-9)",
    )
    p.add_argument("--delay-ms", type=int, default=DEFAULT_DELAY_MS)
    p.add_argument("--user-agent", default=DEFAULT_UA)
    p.add_argument("--checkpoint-dir", default="crawler/data")
    p.add_argument("--out", default="catalog.json")
    p.add_argument(
        "--merge-only",
        action="store_true",
        help="skip crawl, just merge existing checkpoints",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="re-crawl letters that already have a checkpoint",
    )
    args = p.parse_args()

    letters = [l.strip().lower() for l in args.letters.split(",") if l.strip()]
    checkpoint_dir = Path(args.checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out)
    delay_s = args.delay_ms / 1000.0

    def log(msg):
        print(msg, file=sys.stderr, flush=True)

    if not args.merge_only:
        for letter in letters:
            cp = checkpoint_dir / f"{letter}.json"
            if cp.exists() and not args.force:
                log(f"[{letter}] checkpoint exists, skip (--force to re-crawl)")
                continue
            try:
                result = crawl_letter(letter, delay_s, args.user_agent, log)
            except Exception as e:
                log(f"[{letter}] FAILED: {e}")
                continue
            write_json(cp, result)
            log(f"[{letter}] wrote {cp}")

    merge_checkpoints(checkpoint_dir, out_path, log)


if __name__ == "__main__":
    main()
