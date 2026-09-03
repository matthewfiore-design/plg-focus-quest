#!/usr/bin/env python3
"""One-time Google Sheets authorization for PLG Focus Quest write-back.

Uses GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (same Desktop OAuth app as
mcp-gdocs / meeting-agenda-prep). Enable Google Sheets API in that Cloud
project before running.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from google_sheets_auth import authorize_sheets  # noqa: E402


def main() -> None:
    try:
        path = authorize_sheets()
    except Exception as err:  # noqa: BLE001
        print(str(err), file=sys.stderr)
        sys.exit(1)
    print(f"Saved token to {path}")
    print("Then run: python3 scripts/serve.py")


if __name__ == "__main__":
    main()
