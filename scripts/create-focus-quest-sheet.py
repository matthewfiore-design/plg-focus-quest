#!/usr/bin/env python3
"""Create the PLG Focus Quest progress workbook (separate from the roadmap sheet)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from google_sheets_auth import TOKEN_PATH, authorize_sheets  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path.home() / ".config" / "plg-focus-quest" / "config.json"
EMAILS_PATH = ROOT / "designer-emails.json"

TITLE = "PLG Focus Quest — Progress"

DESIGNER_HEADERS = [
    "Designer",
    "Email",
    "Lifetime XP",
    "Weekly tasks",
    "Week of",
    "Streak",
    "Last active",
    "Updated at",
]

TASK_HEADERS = [
    "Task ID",
    "Designer",
    "Title",
    "Type",
    "Roadmap ID",
    "Roadmap name",
    "Milestone",
    "Scheduled date",
    "Original date",
    "Completed",
    "Completed at",
    "XP",
    "Rollover count",
    "Credited to",
    "Generated",
    "Note",
    "Updated at",
]

README_ROWS = [
    ["PLG Focus Quest — Progress"],
    [""],
    ["This workbook stores game progress. Keep it separate from the PLG Roadmap sheet."],
    [""],
    ["Tabs"],
    ["Designers", "One row per designer. Weekly tasks reset when Week of changes (Monday). Lifetime XP never resets."],
    ["Tasks", "Every quest and subtask. Completed = TRUE/FALSE. Type = daily | feature | annual | other."],
    [""],
    ["Sharing"],
    ["Share this file with PLG designers as Editor if the squad leaderboard should be shared."],
    ["Do not add these columns to the roadmap Sheet1."],
]


def load_credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    if not TOKEN_PATH.exists():
        authorize_sheets()
    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH))
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json())
    if not creds.valid:
        authorize_sheets()
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH))
    return creds


def designer_rows() -> list[list[str]]:
    emails = {}
    if EMAILS_PATH.exists():
        emails = json.loads(EMAILS_PATH.read_text())
    rows = [DESIGNER_HEADERS]
    for name in sorted(emails):
        rows.append([name, emails[name], "0", "0", "", "0", "", ""])
    return rows


def freeze_and_format(service, spreadsheet_id: str, sheet_id: int, column_count: int) -> None:
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {
                    "updateSheetProperties": {
                        "properties": {
                            "sheetId": sheet_id,
                            "gridProperties": {"frozenRowCount": 1},
                        },
                        "fields": "gridProperties.frozenRowCount",
                    }
                },
                {
                    "repeatCell": {
                        "range": {
                            "sheetId": sheet_id,
                            "startRowIndex": 0,
                            "endRowIndex": 1,
                            "startColumnIndex": 0,
                            "endColumnIndex": column_count,
                        },
                        "cell": {
                            "userEnteredFormat": {
                                "backgroundColor": {"red": 0.07, "green": 0.09, "blue": 0.14},
                                "textFormat": {
                                    "foregroundColor": {"red": 0.36, "green": 1, "blue": 0.72},
                                    "bold": True,
                                },
                            }
                        },
                        "fields": "userEnteredFormat(backgroundColor,textFormat)",
                    }
                },
                {
                    "autoResizeDimensions": {
                        "dimensions": {
                            "sheetId": sheet_id,
                            "dimension": "COLUMNS",
                            "startIndex": 0,
                            "endIndex": column_count,
                        }
                    }
                },
            ]
        },
    ).execute()


def save_config(spreadsheet_id: str, url: str) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {}
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text()) or {}
        except json.JSONDecodeError:
            data = {}
    data["questSheetId"] = spreadsheet_id
    data["questSheetUrl"] = url
    CONFIG_PATH.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    from googleapiclient.discovery import build

    creds = load_credentials()
    service = build("sheets", "v4", credentials=creds)

    created = (
        service.spreadsheets()
        .create(
            body={
                "properties": {"title": TITLE},
                "sheets": [
                    {"properties": {"title": "Designers", "index": 0}},
                    {"properties": {"title": "Tasks", "index": 1}},
                    {"properties": {"title": "README", "index": 2}},
                ],
            }
        )
        .execute()
    )
    spreadsheet_id = created["spreadsheetId"]
    url = created["spreadsheetUrl"]
    sheets = {s["properties"]["title"]: s["properties"]["sheetId"] for s in created["sheets"]}

    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Designers!A1",
        valueInputOption="RAW",
        body={"values": designer_rows()},
    ).execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Tasks!A1",
        valueInputOption="RAW",
        body={"values": [TASK_HEADERS]},
    ).execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="README!A1",
        valueInputOption="RAW",
        body={"values": README_ROWS},
    ).execute()

    freeze_and_format(service, spreadsheet_id, sheets["Designers"], len(DESIGNER_HEADERS))
    freeze_and_format(service, spreadsheet_id, sheets["Tasks"], len(TASK_HEADERS))
    freeze_and_format(service, spreadsheet_id, sheets["README"], 2)

    save_config(spreadsheet_id, url)
    print(url)
    print(spreadsheet_id)


if __name__ == "__main__":
    main()
