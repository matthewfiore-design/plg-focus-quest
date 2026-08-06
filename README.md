# PLG Focus Quest

A gamified weekly focus tracker for PLG design leadership work. Runs entirely in the browser — no backend, no Google OAuth headaches.

**Live demo:** enable GitHub Pages (see below) at  
`https://matthewfiore-design.github.io/plg-focus-quest/`

## Features

- **Daily quest board** with XP, levels, streaks, and confetti
- **Boss objectives** for weekly outcomes (Friday targets)
- **Auto-rollover** — incomplete daily tasks move to the next day when you open the app
- **Carried badge** shows how many times a task rolled
- **Local save** via `localStorage` (export JSON backup included)
- **Edit & remove** any quest — pencil to edit title, note, date, or type; × to remove
- **Add quests** — **+** in the header (or sidebar) opens the new-quest dialog; defaults to the day you're viewing
- **Seed data** from your Aug 3–7 plan in `seed.json`

## Run locally

```bash
cd plg-focus-quest
python3 -m http.server 8080
# open http://localhost:8080
```

> Needs a local server so `seed.json` can load on first visit.

## Push to GitHub

```bash
cd /Users/matthew.fiore/Documents/Github-Projects/plg-focus-quest
git init
git add .
git commit -m "Add PLG Focus Quest weekly task app"
gh repo create plg-focus-quest --public --source=. --push
```

Then enable **GitHub Pages**: repo Settings → Pages → Deploy from branch `main` → `/ (root)`.

## Customize a new week

1. Edit `seed.json` with new tasks (`due` = YYYY-MM-DD, `type` = `daily` or `outcome`)
2. In the app, click **Reset week** to reload from seed
3. Or export your save, edit JSON, and re-import (import UI: coming soon — use Reset for now)

## Rollover rules

Each calendar day you open the app:
- Incomplete **daily** tasks scheduled for yesterday (or any missed day) bump forward one day at a time
- **Boss objectives** never roll — they stay on their due date until you complete them

## Tech

Vanilla HTML / CSS / JS. No build step. GitHub Pages ready.
