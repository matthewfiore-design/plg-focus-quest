const TOKEN_KEY = "plg-focus-quest-google-token";
const CLIENT_ID_KEY = "plg-focus-quest-google-client-id";
const TOKEN_EXPIRY_KEY = "plg-focus-quest-google-token-expiry";
const OVERRIDES_KEY = "plg-focus-quest-sheet-overrides";

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient = null;
let pendingTokenCallback = null;
let proxyStatus = {
  probed: false,
  available: false,
  authorized: false,
  canReadLinks: false,
  scriptStatus: "",
  message: "",
  method: "",
  appsScriptUrl: "",
};

export function getGoogleClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || "";
}

export function getSheetProxyStatus() {
  return { ...proxyStatus };
}

function persistFieldOverride(item, field, value) {
  if (!item) return;
  let all = {};
  try {
    all = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}") || {};
  } catch {
    all = {};
  }
  const key = item.id || `${String(item.name || "").trim()}|${String(item.expectedLaunchQuarter || "").trim().toUpperCase()}`;
  all[key] = {
    ...(all[key] || {}),
    name: item.name,
    expectedLaunchQuarter: item.expectedLaunchQuarter || "",
    [field]: value,
  };
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
}

export async function fetchSheetLinks(item = null) {
  try {
    const params = new URLSearchParams();
    if (item?.name) {
      params.set("name", item.name);
      params.set("quarter", item.expectedLaunchQuarter || "");
    }
    const qs = params.toString();
    const res = await fetch(`/api/sheet-links${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = new Error(
        data.message || "Could not read sheet hyperlinks. Copy script, paste into Apps Script, and deploy a new version."
      );
      err.status = res.status;
      document.dispatchEvent(new CustomEvent("plg-sheet-links-error", { detail: err.message }));
      throw err;
    }
    return data.links && typeof data.links === "object" ? data.links : null;
  } catch (err) {
    if (err?.status || err?.message) throw err;
    return null;
  }
}

function placeholderLinkText(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^https?:\/\//i.test(v)) return false;
  return /^(figma(?: link)?|here|link|tbd|n\/?a|prd|one pager|1-pager|offer sheet|lovable)$/i.test(v);
}

export async function ensureItemLinks(item) {
  if (!item) return item;
  if (item.linksResolved === true) return item;
  if (getSheetProxyStatus().canReadLinks === false && getSheetProxyStatus().scriptStatus === "old") {
    return item;
  }
  const map = await fetchSheetLinks(item);
  const entry = map?.[`${String(item.name || "").trim()}|${String(item.expectedLaunchQuarter || "").trim().toUpperCase()}`];
  if (!entry) {
    item.linksResolved = true;
    return item;
  }
  item.prdLinks = entry.prd || [];
  item.figmaHrefs = entry.figma || [];
  item.prototypeHrefs = entry.prototype || [];
  item.jiraLinks = entry.jira || [];
  if (typeof entry.designer === "string" && entry.designer.trim()) {
    item.designer = entry.designer.trim().replace(/^@+/, "");
  }
  if (item.figmaHrefs[0]?.href && placeholderLinkText(item.figmaLinks)) {
    item.figmaLinks = item.figmaHrefs[0].href;
  }
  if (item.prototypeHrefs[0]?.href && placeholderLinkText(item.prototypeLinks)) {
    item.prototypeLinks = item.prototypeHrefs[0].href;
  }
  persistFieldOverride(item, "prdLinks", item.prdLinks);
  persistFieldOverride(item, "figmaHrefs", item.figmaHrefs);
  persistFieldOverride(item, "figmaLinks", item.figmaLinks);
  persistFieldOverride(item, "prototypeHrefs", item.prototypeHrefs);
  persistFieldOverride(item, "prototypeLinks", item.prototypeLinks);
  persistFieldOverride(item, "jiraLinks", item.jiraLinks);
  item.linksResolved = true;
  return item;
}

export async function probeSheetProxy({ refresh = false } = {}) {
  try {
    const res = await fetch(`/api/sheet-status${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!res.ok) {
      proxyStatus = { probed: true, available: false, authorized: false, canReadLinks: false, scriptStatus: "", message: "", method: "", appsScriptUrl: "" };
      return proxyStatus;
    }
    const data = await res.json();
    proxyStatus = {
      probed: true,
      available: data?.via === "local-proxy",
      authorized: Boolean(data?.authorized),
      canReadLinks: Boolean(data?.canReadLinks),
      scriptStatus: data?.scriptStatus || "",
      message: data?.message || "",
      method: data?.method || "",
      appsScriptUrl: data?.appsScriptUrl || "",
    };
  } catch {
    proxyStatus = { probed: true, available: false, authorized: false, canReadLinks: false, scriptStatus: "", message: "" };
  }
  return proxyStatus;
}

export async function authorizeSheetProxy() {
  if (!proxyStatus.probed) await probeSheetProxy();
  if (!proxyStatus.available) return false;
  const res = await fetch("/api/sheet-auth", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  await probeSheetProxy();
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Google Sheets authorization failed.");
  }
  return true;
}

export function saveGoogleClientId(clientId) {
  const trimmed = (clientId || "").trim();
  if (trimmed) localStorage.setItem(CLIENT_ID_KEY, trimmed);
  else localStorage.removeItem(CLIENT_ID_KEY);
  tokenClient = null;
}

function getStoredToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
  if (!token || Date.now() >= expiry - 60_000) return null;
  return token;
}

function storeToken(accessToken, expiresIn = 3600) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

export function clearGoogleToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  tokenClient = null;
}

export function isSheetSyncConfigured() {
  return Boolean(getGoogleClientId()) || proxyStatus.available;
}

export function isSheetSyncAuthorized() {
  return Boolean(getStoredToken()) || (proxyStatus.available && proxyStatus.authorized);
}

function spreadsheetIdFromRoadmap(roadmapData) {
  const url = roadmapData?.sourceOfTruth || roadmapData?.sheetUrl || "";
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || null;
}

function colIndexToLetter(index) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function columnLetter(roadmapData, field) {
  const letters = roadmapData?.sheetColumnLetters;
  if (letters?.[field]) return letters[field];

  const defaults = {
    designer: "Designer",
    figmaLinks: "Figma Links",
    prototypeLinks: "Prototype Links",
    projectName: "Project Name",
  };
  const headers = roadmapData?.sheetHeaders;
  const headerName = defaults[field];
  if (headers && headerName) {
    const idx = headers.indexOf(headerName);
    if (idx >= 0) return colIndexToLetter(idx);
  }
  return null;
}

async function sheetsFetch(path, token, options = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(parseSheetsError(err, res.status));
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function parseSheetsError(raw, status) {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message;
    if (message) {
      if (status === 403) {
        return `${message} Check that your Google account can edit the PLG Roadmap sheet.`;
      }
      return message;
    }
  } catch {
    // fall through
  }
  return raw || `Sheets API error (${status})`;
}

async function ensureAccessToken({ interactive = false } = {}) {
  const existing = getStoredToken();
  if (existing) return existing;

  if (!interactive) {
    throw new Error("Connect Google in Settings to sync changes to the sheet.");
  }

  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("Add a Google OAuth Client ID in Tools (Web application type).");
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google sign-in is still loading — try again in a moment.");
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingTokenCallback = null;
      reject(new Error("Google sign-in timed out. Check the popup wasn’t blocked, then try Connect Google again."));
    }, 90_000);

    pendingTokenCallback = (response) => {
      clearTimeout(timeout);
      pendingTokenCallback = null;
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      if (!response.access_token) {
        reject(new Error("Google did not return an access token."));
        return;
      }
      storeToken(response.access_token, Number(response.expires_in) || 3600);
      resolve(response.access_token);
    };

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => pendingTokenCallback?.(response),
        error_callback: (err) => {
          pendingTokenCallback?.({
            error: err?.type || "access_denied",
            error_description: err?.message || "Google sign-in was closed or blocked.",
          });
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

async function updateViaLocalProxy(item, field, value) {
  if (!proxyStatus.probed) await probeSheetProxy();
  if (!proxyStatus.available) return null;

  const res = await fetch("/api/roadmap-field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      field,
      value,
      name: item.name,
      sheetRow: item.sheetRow || null,
      expectedLaunchQuarter: item.expectedLaunchQuarter || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Local sheet proxy failed (${res.status})`);
  }
  return data;
}

async function loadHeaderMeta(roadmapData, token) {
  if (roadmapData.sheetHeaders?.length && roadmapData.sheetColumnLetters?.designer) {
    return roadmapData.sheetColumnLetters;
  }

  const sheetTab = roadmapData.sheetTab || "Sheet1";
  const spreadsheetId = spreadsheetIdFromRoadmap(roadmapData);
  const data = await sheetsFetch(
    `${spreadsheetId}/values/${encodeURIComponent(`${sheetTab}!1:1`)}`,
    token
  );
  const headers = data.values?.[0] || [];
  roadmapData.sheetHeaders = headers;

  const map = {};
  headers.forEach((header, idx) => {
    const h = (header || "").trim();
    if (h === "Designer") map.designer = colIndexToLetter(idx);
    if (h === "Figma Links") map.figmaLinks = colIndexToLetter(idx);
    if (h === "Prototype Links" || h === "Prototype Link") map.prototypeLinks = colIndexToLetter(idx);
    if (h === "Project Name") map.projectName = colIndexToLetter(idx);
    if (h === "Expected Launch Quarter") map.expectedLaunchQuarter = colIndexToLetter(idx);
  });
  roadmapData.sheetColumnLetters = map;
  return map;
}

async function resolveSheetRow(item, roadmapData, token) {
  if (item.sheetRow) return item.sheetRow;

  const spreadsheetId = spreadsheetIdFromRoadmap(roadmapData);
  const sheetTab = roadmapData.sheetTab || "Sheet1";
  const columns = await loadHeaderMeta(roadmapData, token);
  const projectCol = columns.projectName;
  if (!projectCol) throw new Error('Could not find "Project Name" column in sheet.');

  const projectIdx = colLetterToIndex(projectCol);
  const quarterCol = columns.expectedLaunchQuarter;
  const quarterIdx = quarterCol ? colLetterToIndex(quarterCol) : projectIdx;
  const startIdx = Math.min(projectIdx, quarterIdx);
  const endIdx = Math.max(projectIdx, quarterIdx);
  const startCol = colIndexToLetter(startIdx);
  const endCol = colIndexToLetter(endIdx);

  const data = await sheetsFetch(
    `${spreadsheetId}/values/${encodeURIComponent(`${sheetTab}!${startCol}:${endCol}`)}`,
    token
  );
  const rows = data.values || [];
  const targetQuarter = (item.expectedLaunchQuarter || "").trim().toUpperCase();
  const nameOffset = projectIdx - startIdx;
  const quarterOffset = quarterIdx - startIdx;

  for (let i = 1; i < rows.length; i += 1) {
    const name = (rows[i][nameOffset] || "").trim();
    if (name !== item.name) continue;

    if (targetQuarter && quarterCol) {
      const rowQuarter = (rows[i][quarterOffset] || "").trim().toUpperCase();
      if (rowQuarter && rowQuarter !== targetQuarter) continue;
    }

    item.sheetRow = i + 1;
    return item.sheetRow;
  }
  throw new Error(`Could not find "${item.name}" in the roadmap sheet.`);
}

function colLetterToIndex(letters) {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

export async function connectGoogleAccount() {
  return ensureAccessToken({ interactive: true });
}

export async function updateRoadmapField(item, field, value, roadmapData, { interactive = true } = {}) {
  if (!item || !roadmapData) throw new Error("Missing roadmap item.");
  if (field !== "designer" && field !== "figmaLinks" && field !== "prototypeLinks") {
    throw new Error(`Unsupported field: ${field}`);
  }

  const proxyResult = await updateViaLocalProxy(item, field, value);
  if (proxyResult) {
    item[field] = value;
    persistFieldOverride(item, field, value);
    if (proxyResult.range) {
      const rowMatch = String(proxyResult.range).match(/(\d+)$/);
      if (rowMatch) item.sheetRow = Number(rowMatch[1]);
    }
    return { range: proxyResult.range, value: proxyResult.value ?? value };
  }

  const spreadsheetId = spreadsheetIdFromRoadmap(roadmapData);
  if (!spreadsheetId) throw new Error("Roadmap sheet URL is missing from cached data.");

  const token = await ensureAccessToken({ interactive });
  const columns = await loadHeaderMeta(roadmapData, token);
  const col = columns[field];
  if (!col) throw new Error(`Could not find "${field}" column in sheet.`);

  const row = await resolveSheetRow(item, roadmapData, token);
  const sheetTab = roadmapData.sheetTab || "Sheet1";
  const range = `${sheetTab}!${col}${row}`;

  let sheetValue = value;
  if (field === "designer" && (!sheetValue || sheetValue === "Unassigned")) {
    sheetValue = "";
  }

  await sheetsFetch(`${spreadsheetId}/values:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [{ range, values: [[sheetValue]] }],
    }),
  });

  item[field] = value;
  persistFieldOverride(item, field, value);
  return { range, value: sheetValue };
}
