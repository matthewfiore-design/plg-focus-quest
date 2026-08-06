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
- **Boss objectives** for weekly outcomes (Friday targets)
- **PLG Roadmap (Q3)** — filter by designer, detail side panel
- **Auto-rollover** — incomplete daily tasks move to the next day when you open the app
- **Local save** via `localStorage` (export JSON backup included)
- **Edit & remove** any quest — pencil to edit; × to remove
- **Add quests** — **+** in the header opens the new-quest dialog
- **Seed data** from your Aug 3–7 plan in `seed.json`

## Run locally

```bash
cd plg-focus-quest
python3 -m http.server 8080
# open http://localhost:8080
```

> Needs a local server so JSON files can load on first visit.

## Sync roadmap from Google Sheet

**Source of truth:** [PLG Roadmap 2026 — Sheet1 (gid=0)](https://docs.google.com/spreadsheets/d/1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8/edit?gid=0#gid=0)

The app caches Q3 rows (`Expected Launch Quarter = Q3`) in `roadmap-q3.json`. Re-sync when the sheet changes:

1. Export **Sheet1** (or fetch via Drive MCP).
2. Run:

```bash
python3 scripts/sync-roadmap.py /path/to/sheet1.csv
git add roadmap-q3.json && git commit -m "Sync Q3 roadmap" && git push
```

GitHub Pages redeploys automatically.

## Customize a new week

1. Edit `seed.json` with new tasks (`due` = YYYY-MM-DD, `type` = `daily` or `outcome`)
2. In the app, click **Reset week** to reload from seed

## Tech

Vanilla HTML / CSS / JS (ES modules). No build step. GitHub Pages ready.
