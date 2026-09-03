#!/usr/bin/env python3
"""Local static server + Google Sheets write-back for PLG Focus Quest.

Replaces `python3 -m http.server`. Designer / Figma / prototype edits POST to
/api/roadmap-field and are written to the PLG Roadmap sheet.

  python3 scripts/setup-sheets-auth.py   # once
  python3 scripts/serve.py               # then open http://localhost:8080
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from google_sheets_auth import TOKEN_PATH, authorize_sheets  # noqa: E402

SPREADSHEET_ID = "1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8"
SHEET_TAB = "Sheet1"
CONFIG_PATH = Path.home() / ".config" / "plg-focus-quest" / "config.json"
SCRIPT_PATH = Path(__file__).resolve().parent / "DesignUpdate.gs"
SETUP_MESSAGE = (
    "Paste the Apps Script web app URL on the PLG Roadmap tab. "
    "Deploy DesignUpdate.gs as a Web app (Execute as: Me, Who has access: Anyone)."
)
ALLOWED_FIELDS = {
    "designer": "Designer",
    "figmaLinks": "Figma Links",
    "prototypeLinks": "Prototype Links",
}
DESIGNER_EMAILS_PATH = ROOT / "designer-emails.json"
PROGRESS_HEADERS = [
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


class SheetsError(Exception):
    def __init__(self, message: str, status: int = 500) -> None:
        super().__init__(message)
        self.status = status


def load_credentials(authorize_if_needed: bool = False):
    if not TOKEN_PATH.exists():
        if authorize_if_needed:
            try:
                authorize_sheets()
            except Exception as err:  # noqa: BLE001
                raise SheetsError(str(err), 401) from err
        else:
            raise SheetsError(
                "Sheets not authorized. Click Connect Google or pick a designer to approve access.",
                401,
            )
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError as exc:
        raise SheetsError(
            "Run: pip3 install google-api-python-client google-auth-oauthlib",
            500,
        ) from exc

    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH))
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json())
    if not creds.valid:
        if authorize_if_needed:
            authorize_sheets()
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH))
        else:
            raise SheetsError(
                "Sheets token expired. Click Connect Google to approve access again.",
                401,
            )
    return creds


def sheets_service(authorize_if_needed: bool = False):
    from googleapiclient.discovery import build

    return build(
        "sheets",
        "v4",
        credentials=load_credentials(authorize_if_needed=authorize_if_needed),
        cache_discovery=False,
    )


def col_index_to_letter(index: int) -> str:
    n = index + 1
    letters = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def header_map(service) -> dict[str, str]:
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=SPREADSHEET_ID, range=f"{SHEET_TAB}!1:1")
        .execute()
    )
    headers = result.get("values", [[]])[0]
    mapping: dict[str, str] = {}
    for idx, header in enumerate(headers):
        name = (header or "").strip()
        if name == "Project Name":
            mapping["projectName"] = col_index_to_letter(idx)
        elif name == "Expected Launch Quarter":
            mapping["expectedLaunchQuarter"] = col_index_to_letter(idx)
        elif name in ALLOWED_FIELDS.values() or name == "Prototype Link":
            for field, label in ALLOWED_FIELDS.items():
                if name == label or (field == "prototypeLinks" and name == "Prototype Link"):
                    mapping[field] = col_index_to_letter(idx)
    return mapping


def col_letter_to_index(letters: str) -> int:
    index = 0
    for char in letters.upper():
        index = index * 26 + (ord(char) - 64)
    return index - 1


def resolve_row(service, columns: dict[str, str], payload: dict) -> int:
    sheet_row = payload.get("sheetRow")
    if isinstance(sheet_row, int) and sheet_row > 1:
        return sheet_row

    name = (payload.get("name") or "").strip()
    if not name:
        raise SheetsError("Missing project name.", 400)

    project_col = columns.get("projectName")
    if not project_col:
        raise SheetsError('Could not find "Project Name" column.', 500)

    quarter_col = columns.get("expectedLaunchQuarter")
    project_idx = col_letter_to_index(project_col)
    quarter_idx = col_letter_to_index(quarter_col) if quarter_col else project_idx
    start_idx = min(project_idx, quarter_idx)
    end_idx = max(project_idx, quarter_idx)
    start_col = col_index_to_letter(start_idx)
    end_col = col_index_to_letter(end_idx)

    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=SPREADSHEET_ID, range=f"{SHEET_TAB}!{start_col}:{end_col}")
        .execute()
    )
    rows = result.get("values", [])
    target_quarter = (payload.get("expectedLaunchQuarter") or "").strip().upper()
    name_offset = project_idx - start_idx
    quarter_offset = quarter_idx - start_idx

    for i, row in enumerate(rows[1:], start=2):
        padded = list(row) + [""] * (max(name_offset, quarter_offset) + 1 - len(row))
        if (padded[name_offset] or "").strip() != name:
            continue
        if target_quarter and quarter_col:
            row_quarter = (padded[quarter_offset] or "").strip().upper()
            if row_quarter and row_quarter != target_quarter:
                continue
        return i

    raise SheetsError(f'Could not find "{name}" in the roadmap sheet.', 404)


def load_writeback_config() -> dict:
    config: dict = {}
    for path in (ROOT / "google-config.json", CONFIG_PATH):
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            config.update(data)
    return config


def save_writeback_config(patch: dict) -> dict:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    current = {}
    if CONFIG_PATH.exists():
        try:
            current = json.loads(CONFIG_PATH.read_text())
        except json.JSONDecodeError:
            current = {}
    if not isinstance(current, dict):
        current = {}
    current.update(patch)
    CONFIG_PATH.write_text(json.dumps(current, indent=2) + "\n")
    bundled = ROOT / "google-config.json"
    try:
        bundled.write_text(json.dumps(current, indent=2) + "\n")
    except OSError:
        pass
    invalidate_script_probe()
    return current


def apps_script_url() -> str:
    env_url = os.environ.get("PLG_APPS_SCRIPT_URL", "").strip()
    if env_url:
        return env_url
    return str(load_writeback_config().get("appsScriptUrl") or "").strip()


_script_probe: dict | None = None
_script_probe_at = 0.0


def invalidate_script_probe() -> None:
    global _script_probe, _script_probe_at, _links_cache, _links_cache_at
    _script_probe = None
    _script_probe_at = 0.0
    _links_cache = None
    _links_cache_at = 0.0


def call_apps_script(params: dict, timeout: int = 20) -> dict:
    url = apps_script_url()
    if not url:
        raise SheetsError(SETUP_MESSAGE, 401)
    full = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise SheetsError(
            "Apps Script did not return JSON. Redeploy as Web app with access Anyone.",
            502,
        ) from err
    if not isinstance(data, dict):
        raise SheetsError("Apps Script returned an unexpected payload.", 502)
    return data


def probe_apps_script(force: bool = False) -> dict:
    global _script_probe, _script_probe_at
    now = time.time()
    if not force and _script_probe is not None and now - _script_probe_at < 30:
        return _script_probe
    url = apps_script_url()
    if not url:
        _script_probe = {
            "canReadLinks": False,
            "scriptVersion": None,
            "scriptStatus": "missing",
            "message": SETUP_MESSAGE,
        }
        _script_probe_at = now
        return _script_probe
    try:
        data = call_apps_script({"field": "ping", "action": "ping", "_": str(int(now * 1000))}, timeout=20)
    except SheetsError as err:
        _script_probe = {
            "canReadLinks": False,
            "scriptVersion": None,
            "scriptStatus": "error",
            "message": str(err),
        }
        _script_probe_at = now
        return _script_probe
    message = str(data.get("message") or "")
    if data.get("ok") and (data.get("canReadLinks") or data.get("version")):
        _script_probe = {
            "canReadLinks": True,
            "scriptVersion": data.get("version"),
            "scriptStatus": "ok",
            "message": "Link reader is live.",
        }
    elif "Unsupported field" in message:
        _script_probe = {
            "canReadLinks": False,
            "scriptVersion": None,
            "scriptStatus": "old",
            "message": (
                "This /exec URL is still the old script — it cannot read PRD/Figma hyperlinks. "
                "Copy script, select all in Apps Script, paste, Save (Cmd-S), then "
                "Deploy → Manage deployments → pencil → New version."
            ),
        }
    else:
        _script_probe = {
            "canReadLinks": bool(data.get("ok")),
            "scriptVersion": data.get("version"),
            "scriptStatus": "ok" if data.get("ok") else "error",
            "message": message or "Could not verify the live script.",
        }
    _script_probe_at = now
    print("Apps Script probe:", _script_probe.get("scriptStatus"), flush=True)
    return _script_probe


def designer_name(value: object) -> str:
    return str(value or "").strip().lstrip("@").strip()


def designer_email(value: object) -> str:
    name = designer_name(value)
    if not name or name in {"Unassigned", "N/A"}:
        return ""
    try:
        emails = json.loads(DESIGNER_EMAILS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        emails = {}
    if not isinstance(emails, dict):
        return ""
    return str(emails.get(name) or "").strip()


def progress_sheet_id() -> str:
    return str(load_writeback_config().get("questSheetId") or "").strip()


def progress_sheet_url() -> str:
    return str(load_writeback_config().get("questSheetUrl") or "").strip()


def _header_index(headers: list[str]) -> dict[str, int]:
    return {str(name or "").strip(): idx for idx, name in enumerate(headers) if str(name or "").strip()}


def _cell(row: list, index: int | None) -> str:
    if index is None or index < 0 or index >= len(row):
        return ""
    return str(row[index] or "").strip()


def resolve_progress_tab(service, spreadsheet_id: str) -> tuple[str, list[str]]:
    meta = (
        service.spreadsheets()
        .get(spreadsheetId=spreadsheet_id, fields="spreadsheetUrl,sheets.properties.title")
        .execute()
    )
    titles = [sheet["properties"]["title"] for sheet in meta.get("sheets", [])]
    for title in ("Designers", "Designer", "Sheet1"):
        if title not in titles:
            continue
        result = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=f"{title}!1:1")
            .execute()
        )
        headers = [str(cell or "").strip() for cell in (result.get("values") or [[]])[0]]
        if "Designer" in headers and ("Lifetime XP" in headers or "Weekly tasks" in headers):
            return title, headers
        if title == "Designers" and not any(headers):
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range="Designers!A1",
                valueInputOption="RAW",
                body={"values": [PROGRESS_HEADERS]},
            ).execute()
            return "Designers", list(PROGRESS_HEADERS)
    raise SheetsError(
        "Progress sheet needs a Designer tab with Designer / Lifetime XP / Weekly tasks headers.",
        500,
    )


def _sheet_titles(service, spreadsheet_id: str) -> list[str]:
    meta = (
        service.spreadsheets()
        .get(spreadsheetId=spreadsheet_id, fields="sheets.properties.title")
        .execute()
    )
    return [sheet["properties"]["title"] for sheet in meta.get("sheets", [])]


def resolve_tasks_tab(service, spreadsheet_id: str) -> tuple[str, list[str]]:
    titles = _sheet_titles(service, spreadsheet_id)
    if "Tasks" not in titles:
        raise SheetsError("Progress sheet needs a Tasks tab.", 500)
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range="Tasks!1:1")
        .execute()
    )
    headers = [str(cell or "").strip() for cell in (result.get("values") or [[]])[0]]
    if "Title" not in headers or "Task ID" not in headers:
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range="Tasks!A1",
            valueInputOption="RAW",
            body={"values": [TASK_HEADERS]},
        ).execute()
        return "Tasks", list(TASK_HEADERS)
    return "Tasks", headers


def _truthy(value: object) -> bool:
    return str(value or "").strip().upper() in {"TRUE", "YES", "1", "CHECKED"}


def _task_match_key(designer: str, title: str, typ: str, original: str) -> str:
    return "|".join(
        [
            designer_name(designer).lower(),
            str(title or "").strip().lower(),
            str(typ or "").strip().lower(),
            str(original or "").strip()[:10],
        ]
    )


def _row_empty(row: list) -> bool:
    return not any(str(cell or "").strip() for cell in row)


def _parse_task_row(row: list, cols: dict[str, int]) -> dict | None:
    title = _cell(row, cols.get("Title"))
    task_id = _cell(row, cols.get("Task ID"))
    designer = designer_name(_cell(row, cols.get("Designer")))
    if not title and not task_id:
        return None
    return {
        "id": task_id,
        "designer": designer,
        "title": title,
        "type": _cell(row, cols.get("Type")) or "daily",
        "roadmapId": _cell(row, cols.get("Roadmap ID")),
        "roadmapName": _cell(row, cols.get("Roadmap name")),
        "milestone": _cell(row, cols.get("Milestone")),
        "scheduledDate": _cell(row, cols.get("Scheduled date"))[:10],
        "originalDate": _cell(row, cols.get("Original date"))[:10],
        "completed": _truthy(_cell(row, cols.get("Completed"))),
        "completedAt": _cell(row, cols.get("Completed at")),
        "xp": _safe_int(_cell(row, cols.get("XP"))),
        "rolloverCount": _safe_int(_cell(row, cols.get("Rollover count"))),
        "creditedTo": designer_name(_cell(row, cols.get("Credited to"))),
        "generated": _truthy(_cell(row, cols.get("Generated"))),
        "note": _cell(row, cols.get("Note")),
        "updatedAt": _cell(row, cols.get("Updated at")),
    }


def read_progress_tasks(service, spreadsheet_id: str) -> list[dict]:
    tab, headers = resolve_tasks_tab(service, spreadsheet_id)
    cols = _header_index(headers)
    last_col = col_index_to_letter(max(len(headers) - 1, 0))
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{tab}!A:{last_col}")
        .execute()
    )
    tasks = []
    for row in (result.get("values") or [])[1:]:
        parsed = _parse_task_row(row, cols)
        if parsed:
            tasks.append(parsed)
    return tasks


def read_progress() -> dict:
    spreadsheet_id = progress_sheet_id()
    if not spreadsheet_id:
        raise SheetsError("Progress sheet is not configured on this machine.", 404)
    service = sheets_service(authorize_if_needed=False)
    tab, headers = resolve_progress_tab(service, spreadsheet_id)
    cols = _header_index(headers)
    last_col = col_index_to_letter(max(len(headers) - 1, 0))
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{tab}!A:{last_col}")
        .execute()
    )
    rows = result.get("values") or []
    designers = []
    for row in rows[1:]:
        name = designer_name(_cell(row, cols.get("Designer")))
        if not name:
            continue
        designers.append(
            {
                "designer": name,
                "email": _cell(row, cols.get("Email")),
                "lifetimeXp": _safe_int(_cell(row, cols.get("Lifetime XP"))),
                "weeklyTasks": _safe_int(_cell(row, cols.get("Weekly tasks"))),
                "weekOf": _cell(row, cols.get("Week of")),
                "streak": _safe_int(_cell(row, cols.get("Streak"))),
                "lastActive": _cell(row, cols.get("Last active")),
                "updatedAt": _cell(row, cols.get("Updated at")),
            }
        )
    tasks = []
    try:
        tasks = read_progress_tasks(service, spreadsheet_id)
    except SheetsError:
        tasks = []

    return {
        "ok": True,
        "via": "local-proxy",
        "tab": tab,
        "sheetId": spreadsheet_id,
        "sheetUrl": progress_sheet_url(),
        "designers": designers,
        "tasks": tasks,
    }


def _safe_int(value: object) -> int:
    try:
        return max(0, int(float(str(value).strip() or 0)))
    except (TypeError, ValueError):
        return 0


def upsert_progress(payload: dict) -> dict:
    name = designer_name(payload.get("designer"))
    if not name or name in {"Unassigned", "N/A"}:
        raise SheetsError("Pick a designer in I am before syncing the squad board.", 400)

    spreadsheet_id = progress_sheet_id()
    if not spreadsheet_id:
        raise SheetsError("Progress sheet is not configured on this machine.", 404)

    service = sheets_service(authorize_if_needed=False)
    tab, headers = resolve_progress_tab(service, spreadsheet_id)
    cols = _header_index(headers)
    last_col = col_index_to_letter(max(len(headers) - 1, 0))
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{tab}!A:{last_col}")
        .execute()
    )
    rows = result.get("values") or [headers]
    row_number = None
    existing: list[str] = [""] * len(headers)
    for index, row in enumerate(rows[1:], start=2):
        if designer_name(_cell(row, cols.get("Designer"))) == name:
            row_number = index
            existing = list(row) + [""] * max(0, len(headers) - len(row))
            break

    now = datetime.now(timezone.utc).astimezone().replace(microsecond=0).isoformat()
    out = existing[: len(headers)] + [""] * max(0, len(headers) - len(existing))

    def set_col(header: str, value: object) -> None:
        idx = cols.get(header)
        if idx is None:
            return
        out[idx] = "" if value is None else str(value)

    set_col("Designer", name)
    if not _cell(out, cols.get("Email")):
        set_col("Email", designer_email(name))
    set_col("Lifetime XP", _safe_int(payload.get("lifetimeXp")))
    set_col("Weekly tasks", _safe_int(payload.get("weeklyTasks")))
    set_col("Week of", str(payload.get("weekOf") or "").strip())
    set_col("Streak", _safe_int(payload.get("streak")))
    set_col("Last active", str(payload.get("lastActive") or "")[:10] or now[:10])
    set_col("Updated at", now)

    if row_number:
        range_a1 = f"{tab}!A{row_number}:{last_col}{row_number}"
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_a1,
            valueInputOption="RAW",
            body={"values": [out]},
        ).execute()
    else:
        range_a1 = f"{tab}!A{len(rows) + 1}:{last_col}{len(rows) + 1}"
        service.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range=f"{tab}!A1",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": [out]},
        ).execute()

    return {"ok": True, "via": "local-proxy", "range": range_a1, "designer": name}


def _task_row_values(task: dict, designer: str, headers: list[str], now: str) -> list[str]:
    cols = _header_index(headers)
    out = [""] * len(headers)

    def set_col(header: str, value: object) -> None:
        idx = cols.get(header)
        if idx is None:
            return
        out[idx] = "" if value is None else str(value)

    set_col("Task ID", str(task.get("id") or "").strip())
    set_col("Designer", designer)
    set_col("Title", str(task.get("title") or "").strip())
    set_col("Type", str(task.get("type") or "daily").strip())
    set_col("Roadmap ID", str(task.get("roadmapId") or "").strip())
    set_col("Roadmap name", str(task.get("roadmapName") or "").strip())
    set_col("Milestone", str(task.get("milestone") or "").strip())
    set_col("Scheduled date", str(task.get("scheduledDate") or "")[:10])
    set_col("Original date", str(task.get("originalDate") or task.get("scheduledDate") or "")[:10])
    set_col("Completed", "TRUE" if _truthy(task.get("completed")) else "FALSE")
    set_col("Completed at", str(task.get("completedAt") or "").strip())
    set_col("XP", _safe_int(task.get("xp")))
    set_col("Rollover count", _safe_int(task.get("rolloverCount")))
    set_col("Credited to", designer_name(task.get("creditedTo")))
    set_col("Generated", "TRUE" if _truthy(task.get("generated")) else "FALSE")
    set_col("Note", str(task.get("note") or "").strip())
    set_col("Updated at", now)
    return out


def upsert_progress_tasks(payload: dict) -> dict:
    name = designer_name(payload.get("designer"))
    if not name or name in {"Unassigned", "N/A"}:
        raise SheetsError("Pick a designer in I am before syncing tasks.", 400)
    incoming = payload.get("tasks")
    if not isinstance(incoming, list):
        raise SheetsError("tasks must be an array.", 400)

    spreadsheet_id = progress_sheet_id()
    if not spreadsheet_id:
        raise SheetsError("Progress sheet is not configured on this machine.", 404)

    service = sheets_service(authorize_if_needed=False)
    tab, headers = resolve_tasks_tab(service, spreadsheet_id)
    cols = _header_index(headers)
    last_col = col_index_to_letter(max(len(headers) - 1, 0))
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{tab}!A:{last_col}")
        .execute()
    )
    rows = result.get("values") or [headers]
    by_id: dict[str, int] = {}
    by_key: dict[str, int] = {}
    empty_rows: list[int] = []
    for index, row in enumerate(rows[1:], start=2):
        if _row_empty(row):
            empty_rows.append(index)
            continue
        task_id = _cell(row, cols.get("Task ID"))
        designer = designer_name(_cell(row, cols.get("Designer")))
        title = _cell(row, cols.get("Title"))
        typ = _cell(row, cols.get("Type"))
        original = _cell(row, cols.get("Original date")) or _cell(row, cols.get("Scheduled date"))
        if task_id:
            by_id[task_id] = index
        if designer and title:
            by_key[_task_match_key(designer, title, typ, original)] = index

    now = datetime.now(timezone.utc).astimezone().replace(microsecond=0).isoformat()
    updates = []
    appends = []
    for raw in incoming:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()
        task_id = str(raw.get("id") or "").strip()
        if not title and not task_id:
            continue
        owner = designer_name(raw.get("designer")) or name
        original = str(raw.get("originalDate") or raw.get("scheduledDate") or "")[:10]
        row_number = by_id.get(task_id) if task_id else None
        if row_number is None:
            row_number = by_key.get(_task_match_key(owner, title, raw.get("type") or "daily", original))
        values = _task_row_values(raw, owner, headers, now)
        if row_number:
            updates.append({"range": f"{tab}!A{row_number}:{last_col}{row_number}", "values": [values]})
        elif empty_rows:
            row_number = empty_rows.pop(0)
            updates.append({"range": f"{tab}!A{row_number}:{last_col}{row_number}", "values": [values]})
            if task_id:
                by_id[task_id] = row_number
            by_key[_task_match_key(owner, title, raw.get("type") or "daily", original)] = row_number
        else:
            appends.append(values)
            next_row = len(rows) + len(appends)
            if task_id:
                by_id[task_id] = next_row
            by_key[_task_match_key(owner, title, raw.get("type") or "daily", original)] = next_row

    if updates:
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"valueInputOption": "RAW", "data": updates},
        ).execute()
    if appends:
        service.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range=f"{tab}!A1",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": appends},
        ).execute()

    return {
        "ok": True,
        "via": "local-proxy",
        "designer": name,
        "updated": len(updates),
        "appended": len(appends),
        "count": len(updates) + len(appends),
    }


def update_via_apps_script(payload: dict) -> dict | None:
    url = apps_script_url()
    if not url:
        return None
    params = {
        "field": payload.get("field") or "",
        "value": "" if payload.get("value") is None else str(payload.get("value")),
        "name": payload.get("name") or "",
        "expectedLaunchQuarter": payload.get("expectedLaunchQuarter") or "",
        "_": str(int(time.time() * 1000)),
    }
    email = designer_email(payload.get("value")) if payload.get("field") == "designer" else ""
    if email:
        params["email"] = email
    full = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, method="GET")
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read().decode("utf-8")
    print("Apps Script write:", raw[:500], flush=True)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise SheetsError(
            "Apps Script did not return JSON. Redeploy as Web app with access Anyone.",
            502,
        ) from err
    if not data.get("ok"):
        raise SheetsError(data.get("message") or "Apps Script write failed.", 500)
    return data


_links_cache: dict | None = None
_links_cache_at = 0.0


def fetch_sheet_links(name: str = "", quarter: str = "") -> dict:
    global _links_cache, _links_cache_at
    now = time.time()
    named = bool(name.strip())
    if not named and _links_cache is not None and now - _links_cache_at < 60:
        return _links_cache

    probe = probe_apps_script()
    if probe.get("scriptStatus") == "old":
        raise SheetsError(probe.get("message") or "The live web app is still the old script.", 500)

    url = apps_script_url()
    if not url:
        raise SheetsError(SETUP_MESSAGE, 401)
    params = {"field": "links", "action": "links", "_": str(int(now * 1000))}
    if named:
        params["name"] = name.strip()
        params["expectedLaunchQuarter"] = quarter.strip()
    data = call_apps_script(params, timeout=90)
    print("Apps Script links:", str(data)[:500], flush=True)
    if not data.get("ok"):
        message = data.get("message") or "Could not read sheet links."
        if "Unsupported field" in str(message):
            invalidate_script_probe()
            probe_apps_script(force=True)
            message = (
                "This /exec URL is still the old script — it cannot read PRD/Figma hyperlinks. "
                "Copy script, select all in Apps Script, paste, Save (Cmd-S), then "
                "Deploy → Manage deployments → pencil → New version."
            )
        raise SheetsError(message, 500)
    if not named:
        _links_cache = data
        _links_cache_at = now
    return data


def update_field(payload: dict) -> dict:
    field = payload.get("field")
    if field not in ALLOWED_FIELDS:
        raise SheetsError(f"Unsupported field: {field}", 400)

    apps = update_via_apps_script(payload)
    if apps:
        patch_roadmap_cache(payload)
        return apps

    if not TOKEN_PATH.exists():
        raise SheetsError(SETUP_MESSAGE, 401)

    value = payload.get("value")
    if field == "designer" and (not value or designer_name(value) == "Unassigned"):
        sheet_value = ""
    else:
        sheet_value = "" if value is None else str(value)

    service = sheets_service(authorize_if_needed=False)
    columns = header_map(service)
    col = columns.get(field)
    if not col:
        raise SheetsError(f'Could not find "{ALLOWED_FIELDS[field]}" column.', 500)

    row = resolve_row(service, columns, payload)
    range_a1 = f"{SHEET_TAB}!{col}{row}"
    if field == "designer":
        sheet_value = write_designer_chip(service, col, row, value)
    else:
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=range_a1,
            valueInputOption="USER_ENTERED",
            body={"values": [[sheet_value]]},
        ).execute()
    patch_roadmap_cache(payload)
    return {"ok": True, "range": range_a1, "value": sheet_value, "via": "local-proxy"}


def patch_roadmap_cache(payload: dict) -> None:
    global _links_cache
    _links_cache = None
    path = ROOT / "roadmap-q3.json"
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return
    items = data.get("items")
    if not isinstance(items, list):
        return

    field = payload.get("field")
    name = str(payload.get("name") or "").strip()
    quarter = str(payload.get("expectedLaunchQuarter") or "").strip().upper()
    if field not in ALLOWED_FIELDS or not name:
        return

    if field == "designer":
        cached = designer_name(payload.get("value")) or "Unassigned"
    else:
        cached = "" if payload.get("value") is None else str(payload.get("value"))

    updated = False
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("name") or "").strip() != name:
            continue
        item_quarter = str(item.get("expectedLaunchQuarter") or "").strip().upper()
        if quarter and item_quarter and item_quarter != quarter:
            continue
        item[field] = cached
        updated = True
        if quarter:
            break
    if updated:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def write_designer_chip(service, col: str, row: int, value: object) -> str:
    name = designer_name(value)
    if not name or name == "Unassigned":
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_TAB}!{col}{row}",
            valueInputOption="USER_ENTERED",
            body={"values": [[""]]},
        ).execute()
        return ""
    if name == "N/A":
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_TAB}!{col}{row}",
            valueInputOption="USER_ENTERED",
            body={"values": [["N/A"]]},
        ).execute()
        return "N/A"

    email = designer_email(name)
    tagged = f"@{name}"
    col_idx = col_letter_to_index(col)
    if email:
        service.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID,
            body={
                "requests": [
                    {
                        "updateCells": {
                            "rows": [
                                {
                                    "values": [
                                        {
                                            "userEnteredValue": {"stringValue": "@"},
                                            "chipRuns": [
                                                {
                                                    "startIndex": 0,
                                                    "chip": {
                                                        "personProperties": {
                                                            "email": email,
                                                            "displayFormat": "DEFAULT",
                                                        }
                                                    },
                                                }
                                            ],
                                        }
                                    ]
                                }
                            ],
                            "fields": "userEnteredValue,chipRuns",
                            "range": {
                                "sheetId": 0,
                                "startRowIndex": row - 1,
                                "endRowIndex": row,
                                "startColumnIndex": col_idx,
                                "endColumnIndex": col_idx + 1,
                            },
                        }
                    }
                ]
            },
        ).execute()
        return tagged

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_TAB}!{col}{row}",
        valueInputOption="USER_ENTERED",
        body={"values": [[tagged]]},
    ).execute()
    return tagged


def sheet_status(probe: bool = False) -> dict:
    if apps_script_url():
        result = {
            "ok": True,
            "authorized": True,
            "via": "local-proxy",
            "method": "apps-script",
            "appsScriptUrl": apps_script_url(),
            "canReadLinks": False,
            "scriptStatus": "unknown",
            "scriptVersion": None,
            "message": "",
        }
        if probe or _script_probe is not None:
            info = probe_apps_script(force=probe)
            result["canReadLinks"] = bool(info.get("canReadLinks"))
            result["scriptStatus"] = info.get("scriptStatus") or "unknown"
            result["scriptVersion"] = info.get("scriptVersion")
            result["message"] = info.get("message") or ""
        return result
    if TOKEN_PATH.exists():
        try:
            load_credentials()
            return {"ok": True, "authorized": True, "via": "local-proxy", "method": "oauth"}
        except SheetsError as err:
            return {
                "ok": True,
                "authorized": False,
                "via": "local-proxy",
                "message": str(err),
            }
    return {
        "ok": True,
        "authorized": False,
        "via": "local-proxy",
        "method": "setup",
        "message": SETUP_MESSAGE,
    }


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/sheet-status":
            qs = urllib.parse.parse_qs(urlparse(self.path).query)
            refresh = (qs.get("refresh") or [""])[0].lower() in {"1", "true", "yes"}
            if refresh:
                invalidate_script_probe()
            self._json(200, sheet_status(probe=refresh or _script_probe is not None))
            return
        if path == "/api/sheet-links":
            qs = urllib.parse.parse_qs(urlparse(self.path).query)
            name = (qs.get("name") or [""])[0]
            quarter = (qs.get("quarter") or [""])[0]
            try:
                self._json(200, fetch_sheet_links(name, quarter))
            except SheetsError as err:
                self._json(err.status, {"ok": False, "message": str(err)})
            except Exception as err:  # noqa: BLE001
                self._json(502, {"ok": False, "message": str(err)})
            return
        if path == "/api/progress":
            try:
                self._json(200, read_progress())
            except SheetsError as err:
                self._json(err.status, {"ok": False, "message": str(err)})
            except Exception as err:  # noqa: BLE001
                self._json(502, {"ok": False, "message": str(err)})
            return
        if path == "/api/sheet-script":
            body = SCRIPT_PATH.read_text().encode("utf-8") if SCRIPT_PATH.exists() else b""
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}") if raw else {}
        except json.JSONDecodeError:
            payload = {}
            if path != "/api/sheet-auth":
                self._json(400, {"ok": False, "message": "Invalid JSON"})
                return

        if path == "/api/config":
            url = str((payload or {}).get("appsScriptUrl") or "").strip()
            save_writeback_config({"appsScriptUrl": url})
            self._json(200, sheet_status())
            return
        if path == "/api/sheet-auth":
            try:
                authorize_sheets()
                self._json(200, {"ok": True, "authorized": True, "via": "local-proxy"})
            except Exception as err:  # noqa: BLE001
                self._json(401, {"ok": False, "authorized": False, "message": str(err)})
            return
        if path == "/api/progress":
            try:
                self._json(200, upsert_progress(payload or {}))
            except SheetsError as err:
                self._json(err.status, {"ok": False, "message": str(err)})
            except Exception as err:  # noqa: BLE001
                self._json(500, {"ok": False, "message": str(err)})
            return
        if path == "/api/progress-tasks":
            try:
                self._json(200, upsert_progress_tasks(payload or {}))
            except SheetsError as err:
                self._json(err.status, {"ok": False, "message": str(err)})
            except Exception as err:  # noqa: BLE001
                self._json(500, {"ok": False, "message": str(err)})
            return
        if path != "/api/roadmap-field":
            self.send_error(404, "Not found")
            return
        try:
            result = update_field(payload)
            self._json(200, result)
        except SheetsError as err:
            self._json(err.status, {"ok": False, "message": str(err)})
        except Exception as err:  # noqa: BLE001
            self._json(500, {"ok": False, "message": str(err)})


def main() -> None:
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8080))
    handler = partial(Handler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"PLG Focus Quest → http://127.0.0.1:{port}")
    if apps_script_url():
        print("Sheet write-back: Apps Script URL configured")
    elif TOKEN_PATH.exists():
        print("Sheet write-back: OAuth token ready")
    else:
        print("Sheet write-back: add Apps Script URL in Tools")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
