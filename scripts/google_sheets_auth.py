"""Shared Google Sheets OAuth helpers for PLG Focus Quest."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

TOKEN_PATH = Path.home() / ".config" / "plg-focus-quest" / "sheets-token.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def load_client_env() -> tuple[str, str]:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    if client_id and client_secret:
        return client_id, client_secret

    zshrc = Path.home() / ".zshrc"
    if not zshrc.exists():
        return client_id, client_secret

    result = subprocess.run(
        ["zsh", "-lic", 'printf "%s\\0%s" "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET"'],
        capture_output=True,
        check=False,
        timeout=8,
    )
    if result.returncode != 0 or not result.stdout:
        return client_id, client_secret

    parts = result.stdout.split(b"\0", 1)
    if len(parts) != 2:
        return client_id, client_secret

    loaded_id = parts[0].decode("utf-8", "ignore").strip()
    loaded_secret = parts[1].decode("utf-8", "ignore").strip()
    if loaded_id:
        os.environ["GOOGLE_CLIENT_ID"] = loaded_id
        client_id = loaded_id
    if loaded_secret:
        os.environ["GOOGLE_CLIENT_SECRET"] = loaded_secret
        client_secret = loaded_secret
    return client_id, client_secret


def authorize_sheets() -> Path:
    client_id, client_secret = load_client_env()
    if not client_id or not client_secret:
        raise RuntimeError(
            "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. "
            "Add the Desktop OAuth client (same as mcp-gdocs) to ~/.zshrc."
        )

    from google_auth_oauthlib.flow import InstalledAppFlow

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True)
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(creds.to_json())
    return TOKEN_PATH
