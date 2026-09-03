#!/usr/bin/env python3
"""Export roadmap rows from PLG Roadmap 2026 sheet to roadmap-q3.json.

By default includes Expected Launch Quarter = Q2, Q3, and Q4.

Usage (after fetching Sheet1 CSV via Google Drive MCP or manual export):
  python3 scripts/sync-roadmap.py /path/to/sheet1.csv

Or set PLG_ROADMAP_CSV env var. Override quarters with PLG_ROADMAP_QUARTERS=Q2,Q3,Q4.
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
DEFAULT_QUARTERS = ("Q2", "Q3", "Q4")
# Source of truth — PLG Roadmap 2026, Sheet1 (gid=0)
SHEET_URL = "https://docs.google.com/spreadsheets/d/1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8/edit?gid=0#gid=0"
SHEET_TAB = "Sheet1"

STATE_PRIORITY = {
    "3. design": 1,
    "design": 1,
    "2. definition / discovery": 2,
    "definition / discovery": 2,
    "1. planned": 3,
    "planned": 3,
    "4. development": 4,
    "development": 4,
    "5. live experiment": 5,
    "live experiment": 5,
    "5. staging": 5,
    "staging": 5,
    "6. launched": 6,
    "launched": 6,
    "7. ended": 7,
    "ended": 7,
    "8. deprioritized": 8,
    "deprioritized": 8,
    "9. blocked": 9,
    "blocked": 9,
}


def state_priority_rank(state: str) -> int:
    key = (state or "").strip().lower()
    if key in STATE_PRIORITY:
        return STATE_PRIORITY[key]
    stripped = re.sub(r"^\d+\.\s*", "", key)
    if stripped in STATE_PRIORITY:
        return STATE_PRIORITY[stripped]
    if "design" in stripped:
        return 1
    if "definition" in stripped or "discovery" in stripped:
        return 2
    if "planned" in stripped:
        return 3
    if "development" in stripped:
        return 4
    if "live experiment" in stripped or "experiment" in stripped:
        return 5
    if "launched" in stripped:
        return 6
    if "ended" in stripped:
        return 7
    if "depriorit" in stripped:
        return 8
    if "blocked" in stripped:
        return 9
    return 99


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:80] or "item"


def col_index_to_letter(index: int) -> str:
    n = index + 1
    letters = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def column_letters(headers: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for idx, header in enumerate(headers):
        h = (header or "").strip()
        if h == "Designer":
            mapping["designer"] = col_index_to_letter(idx)
        elif h == "Figma Links":
            mapping["figmaLinks"] = col_index_to_letter(idx)
        elif h in ("Prototype Link", "Prototype Links"):
            mapping["prototypeLinks"] = col_index_to_letter(idx)
        elif h == "Project Name":
            mapping["projectName"] = col_index_to_letter(idx)
        elif h == "Expected Launch Quarter":
            mapping["expectedLaunchQuarter"] = col_index_to_letter(idx)
    return mapping


def parse_quarters() -> set[str]:
    raw = os.environ.get("PLG_ROADMAP_QUARTERS", "")
    if raw.strip():
        return {q.strip().upper() for q in raw.split(",") if q.strip()}
    return set(DEFAULT_QUARTERS)


def assign_item_ids(items: list[dict[str, str]]) -> None:
    grouped: dict[str, list[dict[str, str]]] = {}
    for item in items:
        grouped.setdefault(slug(item["name"]), []).append(item)

    quarter_rank = {"Q3": 0, "Q2": 1, "Q4": 2}

    for base, group in grouped.items():
        if len(group) == 1:
            group[0]["id"] = base
            continue
        group.sort(
            key=lambda x: (
                quarter_rank.get((x.get("expectedLaunchQuarter") or "").upper(), 9),
                x["name"].lower(),
            )
        )
        group[0]["id"] = base
        for extra in group[1:]:
            quarter = (extra.get("expectedLaunchQuarter") or "item").lower()
            extra["id"] = f"{base}-{quarter}"


def row_to_item(row: dict[str, str], *, sheet_row: int | None = None) -> dict[str, str]:
    item = {
        "name": (row.get("Project Name") or "").strip(),
        "description": (row.get("Description") or "").strip(),
        "state": (row.get("Project State") or "").strip(),
        "designer": (row.get("Designer") or "").strip().lstrip("@").strip() or "Unassigned",
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
        "prototypeLinks": (row.get("Prototype Links") or row.get("Prototype Link") or "").strip(),
        "productManager": (row.get("Product Manager") or "").strip(),
        "engineeringManager": (row.get("Engineering Manager") or "").strip(),
        "analyticsLead": (row.get("Analytics Lead") or "").strip(),
        "engTeam": (row.get("Eng Team") or "").strip(),
        "priority": (row.get("Team Specific Priority Order from Planning") or "").strip(),
        "launchCompass": (row.get("Launch Compass") or "").strip(),
    }
    if sheet_row is not None:
        item["sheetRow"] = sheet_row
    return item


def main() -> None:
    csv_path = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PLG_ROADMAP_CSV", ""))
    if not csv_path or not csv_path.exists():
        print("Provide Sheet1 CSV path: python3 scripts/sync-roadmap.py sheet1.csv", file=sys.stderr)
        sys.exit(1)

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = []
        for sheet_row, row in enumerate(reader, start=2):
            if not row or not row[0].strip():
                continue
            while len(row) < len(headers):
                row.append("")
            rows.append((sheet_row, dict(zip(headers, row))))

    quarters = parse_quarters()
    items = [
        row_to_item(r, sheet_row=sheet_row)
        for sheet_row, r in rows
        if (r.get("Expected Launch Quarter") or "").strip().upper() in quarters
    ]
    assign_item_ids(items)

    quarter_list = sorted(quarters, key=lambda q: int(q[1:]) if q[1:].isdigit() else q)
    quarter_label = "–".join(quarter_list) if len(quarter_list) > 1 else quarter_list[0]

    payload = {
        "source": "PLG Roadmap 2026",
        "sourceOfTruth": SHEET_URL,
        "sheetUrl": SHEET_URL,
        "sheetTab": SHEET_TAB,
        "sheetHeaders": headers,
        "sheetColumnLetters": column_letters(headers),
        "quarter": quarter_label,
        "quarters": quarter_list,
        "quarterField": "Expected Launch Quarter",
        "syncedAt": date.today().isoformat(),
        "items": sorted(
            items,
            key=lambda x: (
                x.get("expectedLaunchQuarter", ""),
                x["designer"],
                state_priority_rank(x["state"]),
                x["name"].lower(),
            ),
        ),
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {q: sum(1 for i in items if i.get("expectedLaunchQuarter", "").upper() == q) for q in quarter_list}
    summary = ", ".join(f"{q}: {counts[q]}" for q in quarter_list)
    print(f"Wrote {len(items)} items ({summary}) to {OUT}")


if __name__ == "__main__":
    main()
