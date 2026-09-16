#!/usr/bin/env bash
# Push scripts/DesignUpdate.gs to Apps Script and point the live web app at it,
# replacing the copy-paste-and-deploy dance.
#
# The remote project also holds PMreminders, ENGreminders, LaunchSummary and
# "ge offer calendar", which belong to other people. `clasp push` deletes any
# remote file missing locally, so we always pull the project first and overwrite
# only DesignUpdate.js.
#
# One-time setup: npx @google/clasp login, plus the Apps Script API enabled at
# https://script.google.com/home/usersettings
#
# Usage: scripts/deploy-apps-script.sh ["deploy description"]
set -euo pipefail

SCRIPT_ID="${APPS_SCRIPT_ID:-1Ffr2PzrCd0LWoX6m4et6Hm4JetpY4PDZosYTQ53JFea5Nt7D-uUXb42n}"
DEPLOYMENT_ID="${APPS_SCRIPT_DEPLOYMENT_ID:-AKfycbyd_htKu_ZxJG1GGSbQ2jxz4Ttn7F82uBn0fLd3u8kPX-3c6CA1S3tIWnYmsjxh1vG7FQ}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$REPO_ROOT/scripts/DesignUpdate.gs"
CLASP="npx -y @google/clasp@latest"
DESCRIPTION="${1:-Deploy DesignUpdate v$(grep -m1 'SCRIPT_VERSION' "$SOURCE" | grep -o '[0-9]\+')}"

[ -f "$SOURCE" ] || { echo "Missing $SOURCE" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > .clasp.json

echo "==> Pulling remote project"
$CLASP pull 2>&1 | grep -v '^npm warn' || true
[ -f appsscript.json ] || { echo "Pull failed; no manifest." >&2; exit 1; }

cp "$SOURCE" DesignUpdate.js

echo "==> Pushing"
$CLASP push -f 2>&1 | grep -v '^npm warn'

echo "==> Creating version"
VERSION_OUT="$($CLASP create-version "$DESCRIPTION" 2>&1 | grep -v '^npm warn')"
echo "$VERSION_OUT"
VERSION="$(echo "$VERSION_OUT" | grep -o '[0-9]\+' | tail -1)"
[ -n "$VERSION" ] || { echo "Could not parse version number." >&2; exit 1; }

echo "==> Pointing deployment at version $VERSION"
$CLASP redeploy "$DEPLOYMENT_ID" -V "$VERSION" -d "$DESCRIPTION" 2>&1 | grep -v '^npm warn'

echo "==> Live version check"
curl -sL --max-time 60 \
  "https://script.google.com/macros/s/$DEPLOYMENT_ID/exec?field=ping&_=$(date +%s)"
echo
