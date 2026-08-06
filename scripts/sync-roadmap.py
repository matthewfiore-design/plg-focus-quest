#!/usr/bin/env python3
"""Export Q3 rows from PLG Roadmap 2026 sheet to roadmap-q3.json.

Usage (after fetching Sheet1 CSV via Google Drive MCP or manual export):
  python3 scripts/sync-roadmap.py /path/to/sheet1.csv

Or set PLG_ROADMAP_CSV env var.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "roadmap-q3.json"
# Source of truth — PLG Roadmap 2026, Sheet1 (gid=0)
SHEET_URL = "https://docs.google.com/spreadsheets/d/1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8/edit?gid=0#gid=0"
SHEET_TAB = "Sheet1"


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:80] or "item"


def row_to_item(row: dict[str, str]) -> dict[str, str]:
    return {
        "id": slug((row.get("Project Name") or "").strip()),
        "name": (row.get("Project Name") or "").strip(),
        "description": (row.get("Description") or "").strip(),
        "state": (row.get("Project State") or "").strip(),
        "designer": (row.get("Designer") or "").strip() or "Unassigned",
        "l2": (row.get("L2") or "").strip(),
        "successMetric": (row.get("Success Metric ") or row.get("Success Metric") or "").strip(),
        "statusUpdated": (row.get("Status Updated") or "").strip(),
        "status": (row.get("Status (Risks, Blockers, Escalations, Updates)") or "").strip(),
        "launchDate": (row.get("Launch Date") or "").strip(),
        "expectedLaunchMonth": (row.get("Expected Launch Month") or "").strip(),
        "expectedLaunchQuarter": (row.get("Expected Launch Quarter") or "").strip(),
        "prdLink": (row.get("PRD Link") or "").strip(),
        "jiraLink": (row.get("JIRA PLAN Link") or "").strip(),
        "figmaLinks": (row.get("Figma Links") or "").strip(),
        "productManager": (row.get("Product Manager") or "").strip(),
        "engineeringManager": (row.get("Engineering Manager") or "").strip(),
        "analyticsLead": (row.get("Analytics Lead") or "").strip(),
        "engTeam": (row.get("Eng Team") or "").strip(),
        "priority": (row.get("Team Specific Priority Order from Planning") or "").strip(),
        "launchCompass": (row.get("Launch Compass") or "").strip(),
    }


def main() -> None:
    csv_path = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PLG_ROADMAP_CSV", ""))
    if not csv_path or not csv_path.exists():
        print("Provide Sheet1 CSV path: python3 scripts/sync-roadmap.py sheet1.csv", file=sys.stderr)
        sys.exit(1)

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = []
        for row in reader:
            if not row or not row[0].strip():
                continue
            while len(row) < len(headers):
                row.append("")
            rows.append(dict(zip(headers, row)))

    items = [
        row_to_item(r)
        for r in rows
        if (r.get("Expected Launch Quarter") or "").strip().upper() == "Q3"
    ]

    payload = {
        "source": "PLG Roadmap 2026",
        "sourceOfTruth": SHEET_URL,
        "sheetUrl": SHEET_URL,
        "sheetTab": SHEET_TAB,
        "quarter": "Q3",
        "quarterField": "Expected Launch Quarter",
        "syncedAt": date.today().isoformat(),
        "items": sorted(items, key=lambda x: (x["designer"], x["state"], x["name"])),
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(items)} Q3 items to {OUT}")


if __name__ == "__main__":
    main()
