# PLG Focus Quest · Team Hub

Gamified weekly focus tracker for PLG design leadership, plus a **PLG Roadmap** view for ICs synced from the product roadmap sheet.

**Live:** https://matthewfiore-design.github.io/plg-focus-quest/

## Views

| Tab | Audience | Source |
|-----|----------|--------|
| **My Tasks** | Manager personal quests | `seed.json` + localStorage |
| **PLG Roadmap** | All PLG designers | [PLG Roadmap 2026 — Sheet1](https://docs.google.com/spreadsheets/d/1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8/edit?gid=0#gid=0) (**source of truth**) → cached in `roadmap-q3.json` |

Roadmap cards show **Project name, description, state, designer**. Click a card for the side panel (status, people, timeline, links).

## Features

- **Daily quest board** with XP, levels, streaks, and confetti
- **Annual goals** for long-horizon outcomes (high XP)
- **Task types** — Daily Quest, Feature (roadmap subtasks), Annual Goal, Other
- **PLG Roadmap** — filter by quarter, designer, status, and team; detail side panel
- **Auto-rollover** — incomplete daily, feature, and other tasks move to the next day when you open the app
- **Local save** via `localStorage` (export JSON backup included)
- **Edit & remove** any quest — pencil to edit; × to remove
- **Add quests** — **+** in the header opens the new-quest dialog
- **Seed data** from your Aug 31–Sep 4 plan in `seed.json`

## Run locally

**Production** talks to the Apps Script web app from the browser. After you change `scripts/DesignUpdate.gs`, ship it with:

```sh
scripts/deploy-apps-script.sh "what changed"
```

That pushes the file, cuts a version, and repoints the existing web app, so the `/exec` URL never changes. One-time setup: `npx @google/clasp login` and turn on the Apps Script API at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).

Locally, use the proxy server (not `python3 -m http.server`) so writes go through `/api`:

```bash
cd plg-focus-quest
python3 scripts/setup-sheets-auth.py   # once — Google Sheets API + Desktop OAuth
python3 scripts/serve.py               # http://127.0.0.1:8080
```

`setup-sheets-auth.py` uses the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` Desktop OAuth app as mcp-gdocs. Enable **Google Sheets API** in that Cloud project first.

> `python3 -m http.server` still loads the UI, but cannot write to the sheet.

## Sync roadmap from Google Sheet

**Source of truth:** [PLG Roadmap 2026 — Sheet1 (gid=0)](https://docs.google.com/spreadsheets/d/1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8/edit?gid=0#gid=0)

The app caches Q2, Q3, and Q4 rows in `roadmap-q3.json`. Re-sync when the sheet changes:

1. Export **Sheet1** (or fetch via Drive MCP).
2. Run:

```bash
python3 scripts/sync-roadmap.py /path/to/sheet1.csv
git add roadmap-q3.json && git commit -m "Sync roadmap (Q2–Q4)" && git push
```

GitHub Pages redeploys automatically.

## Write assignee & Figma edits back to the sheet

1. In Tools, click **Copy sheet script**.
2. Open the [PLG Roadmap sheet](https://docs.google.com/spreadsheets/d/1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8/edit?gid=0#gid=0) → **Extensions → Apps Script**.
3. Replace the stub with the copied script → **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Paste the `/exec` URL into Tools and click **Save script URL**.

Assigned designer changes then write to the **Designer** column as a people `@` mention (smart chip). After updating `DesignUpdate.gs`, run `scripts/deploy-apps-script.sh`.

## Customize a new week

1. Edit `seed.json` with new tasks (`due` = YYYY-MM-DD, `type` = `daily`, `annual`, or `other`)
2. In the app, click **Reset week** to reload from seed

## Tech

Vanilla HTML / CSS / JS (ES modules). No build step. GitHub Pages ready.
