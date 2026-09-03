#!/usr/bin/env python3
"""Sync designer headshots from zendesk/plg-viz org-chart.html.

The org chart (https://animated-adventure-ww27rkk.pages.github.io/org-chart.html)
uses Slack avatar URLs. This script pulls them via GitHub API and caches JPEGs
locally for offline use in PLG Focus Quest.

Usage:
  python3 scripts/sync-designer-photos.py
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "designer-photos.json"
OUT_DIR = ROOT / "assets" / "designers"
ORG_CHART_API = "repos/zendesk/plg-viz/contents/org-chart.html"
SOURCE_URL = "https://animated-adventure-ww27rkk.pages.github.io/org-chart.html"

# Designers on the Q3 roadmap plus manager for filters/panel reuse.
DEFAULT_NAMES = [
    "Alexa Stahl",
    "Ankit Bansod",
    "Dheeraj Kumar",
    "Lynette Liwanag",
    "Nicaela Rivera",
    "Suhail Shaikh",
    "Matthew Fiore",
]


def slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def fetch_org_chart_html() -> str:
    encoded = subprocess.check_output(
        ["gh", "api", ORG_CHART_API, "--jq", ".content"],
        text=True,
    )
    return base64.b64decode(encoded).decode("utf-8")


def parse_photos(html: str) -> dict[str, str]:
    pairs = re.findall(r'src="([^"]+)"\s+alt="([^"]+)"', html)
    seen: dict[str, str] = {}
    for src, name in pairs:
        if name not in seen:
            seen[name] = src
    return seen


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "plg-focus-quest-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        dest.write_bytes(resp.read())


def main() -> None:
    html = fetch_org_chart_html()
    all_photos = parse_photos(html)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    payload_photos: dict[str, dict[str, str | None]] = {}
    for name in DEFAULT_NAMES:
        url = all_photos.get(name)
        if not url:
            print(f"WARN: no photo found for {name}")
            continue

        local_rel = f"assets/designers/{slug(name)}.jpg"
        dest = ROOT / local_rel
        try:
            download(url, dest)
            print(f"OK {name} -> {local_rel}")
            payload_photos[name] = {"url": url, "local": local_rel}
        except OSError as exc:
            print(f"WARN {name}: download failed ({exc}); keeping URL only")
            payload_photos[name] = {"url": url, "local": None, "error": str(exc)}

    payload = {
        "source": SOURCE_URL,
        "repo": "zendesk/plg-viz",
        "syncedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "photos": payload_photos,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUT_JSON} ({len(payload_photos)} designers)")


if __name__ == "__main__":
    main()
