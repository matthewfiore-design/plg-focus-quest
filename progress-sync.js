import { getAppsScriptUrl } from "./sheet-sync.js";

const STATUS = {
  idle: "local",
  live: "live",
  error: "error",
};

const LIVE_MESSAGE = "Squad board and Tasks tab are live from the Progress sheet.";

// Positional order the Apps Script expects for compact task rows.
const TASK_FIELD_ORDER = [
  "id",
  "designer",
  "title",
  "type",
  "roadmapId",
  "roadmapName",
  "milestone",
  "scheduledDate",
  "originalDate",
  "completed",
  "completedAt",
  "xp",
  "rolloverCount",
  "creditedTo",
  "generated",
  "note",
];

// JSONP rides on the query string, so batches stay well under browser URL limits.
const MAX_CHUNK_CHARS = 3800;

let lastStatus = { state: STATUS.idle, message: "", sheetUrl: "" };
let pushTimer = 0;
let taskPushTimer = 0;
let localProxyAvailable = null;
const pushedSignatures = new Map();

function callScript(params, { timeoutMs = 25000 } = {}) {
  const base = getAppsScriptUrl();
  if (!base) return Promise.reject(new Error("No Apps Script URL configured."));

  return new Promise((resolve, reject) => {
    const callback = `plgQuestTasksCb${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    };

    const fail = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const timer = window.setTimeout(() => fail("Tasks sheet script timed out."), timeoutMs);

    window[callback] = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data && typeof data === "object" ? data : {});
    };

    script.onerror = () => fail("Could not reach the Tasks sheet script.");

    const url = new URL(base);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value == null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    url.searchParams.set("callback", callback);
    url.searchParams.set("_", String(Date.now()));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function compactRow(task) {
  return TASK_FIELD_ORDER.map((key) => {
    const value = task[key];
    if (value === true) return 1;
    if (value === false || value == null) return "";
    return value;
  });
}

function signatureFor(task) {
  return JSON.stringify(compactRow(task));
}

function chunkRows(rows) {
  const chunks = [];
  let current = [];
  let size = 2;
  for (const row of rows) {
    const encoded = encodeURIComponent(JSON.stringify(row)).length + 1;
    if (current.length && size + encoded > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(row);
    size += encoded;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Writes quest tasks straight to the Progress sheet when no local proxy exists
 * (GitHub Pages). Only rows that changed since the last successful write are
 * sent, so a single checkbox toggle is a single request.
 */
async function pushTasksViaScript(name, tasks) {
  const changed = tasks.filter((task) => {
    const key = `${name}::${task.id || taskMatchKey(task)}`;
    return pushedSignatures.get(key) !== signatureFor(task);
  });
  if (!changed.length) return { ok: true, updated: 0, appended: 0, via: "apps-script" };

  const chunks = chunkRows(changed.map(compactRow));
  let updated = 0;
  let appended = 0;
  let sheetUrl = lastStatus.sheetUrl;

  for (const chunk of chunks) {
    const data = await callScript({ field: "tasks", designer: name, rows: JSON.stringify(chunk) });
    if (!data || data.ok === false) {
      throw new Error(data?.message || "Tasks sheet rejected the write.");
    }
    updated += Number(data.updated) || 0;
    appended += Number(data.appended) || 0;
    if (data.sheetUrl) sheetUrl = data.sheetUrl;
  }

  changed.forEach((task) => {
    pushedSignatures.set(`${name}::${task.id || taskMatchKey(task)}`, signatureFor(task));
  });

  lastStatus = { state: STATUS.live, message: LIVE_MESSAGE, sheetUrl };
  return { ok: true, updated, appended, sheetUrl, via: "apps-script" };
}

function isRemoteCompleted(value) {
  return value === true || String(value || "").trim().toUpperCase() === "TRUE";
}

function taskMatchKey(task) {
  const designer = String(task.designer || task.owner || "").trim().toLowerCase();
  const title = String(task.title || "").trim().toLowerCase();
  const type = String(task.type || "daily").trim().toLowerCase();
  const original = String(task.originalDate || task.scheduledDate || "").trim().slice(0, 10);
  return `${designer}|${title}|${type}|${original}`;
}

export function getProgressSyncStatus() {
  return { ...lastStatus };
}

/**
 * The local Python server always answers /api with JSON carrying an `ok` flag.
 * A static host answers with an HTML error page — 404 for GET, 405 for POST —
 * which means there is no proxy here and the Apps Script should handle it.
 */
async function tryLocalProxy(path, init) {
  if (localProxyAvailable === false) return { absent: true };
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    localProxyAvailable = false;
    return { absent: true };
  }
  let data = null;
  try {
    data = JSON.parse(await res.text());
  } catch {
    data = null;
  }
  if (!data || typeof data.ok === "undefined") {
    localProxyAvailable = false;
    return { absent: true };
  }
  localProxyAvailable = true;
  return { absent: false, status: res.status, ok: res.ok && data.ok !== false, data };
}

async function fetchTasksViaScript() {
  const data = await callScript({ field: "tasksRead" });
  if (!data || data.ok === false) {
    throw new Error(data?.message || "Tasks sheet could not be read.");
  }
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  tasks.forEach((task) => {
    const owner = String(task.designer || "").trim();
    if (owner) pushedSignatures.set(`${owner}::${task.id || taskMatchKey(task)}`, signatureFor(task));
  });
  lastStatus = { state: STATUS.live, message: "Tasks tab is live from the Progress sheet.", sheetUrl: data.sheetUrl || "" };
  return { ok: true, tasks, via: "apps-script" };
}

export async function fetchProgressBoard() {
  const local = await tryLocalProxy("/api/progress", { cache: "no-store" });
  if (!local.absent) {
    if (local.ok) {
      lastStatus = { state: STATUS.live, message: LIVE_MESSAGE, sheetUrl: local.data.sheetUrl || "" };
      return local.data;
    }
    lastStatus = {
      state: local.status === 401 || local.status === 404 ? STATUS.idle : STATUS.error,
      message: local.data.message || "Squad board is local to this browser.",
      sheetUrl: local.data.sheetUrl || "",
    };
    return null;
  }

  try {
    return await fetchTasksViaScript();
  } catch (err) {
    lastStatus = {
      state: STATUS.idle,
      message: err.message || "Squad board is local until the Tasks sheet script is reachable.",
      sheetUrl: "",
    };
    return null;
  }
}

export function mergeRemoteBoard(localBoard, remoteRows, weekOf, me) {
  const next = { ...(localBoard || {}) };
  for (const row of remoteRows || []) {
    const name = String(row.designer || "").trim();
    if (!name) continue;
    const weekly = row.weekOf === weekOf ? Number(row.weeklyTasks) || 0 : 0;
    const lifetimeXp = Number(row.lifetimeXp) || 0;
    const current = next[name] || { lifetimeXp: 0, weeklyTasks: 0, weekOf };
    next[name] = {
      lifetimeXp: Math.max(current.lifetimeXp || 0, lifetimeXp),
      weeklyTasks: Math.max(current.weeklyTasks || 0, weekly),
      weekOf,
    };
  }
  return next;
}

export async function pushProgressRow(row) {
  if (!row?.designer) return null;
  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      lastStatus = {
        state: lastStatus.state === STATUS.live ? STATUS.live : STATUS.error,
        message: data.message || lastStatus.message,
        sheetUrl: lastStatus.sheetUrl,
      };
      return null;
    }
    lastStatus = {
      state: STATUS.live,
      message: "Squad board and Tasks tab are live from the Progress sheet.",
      sheetUrl: lastStatus.sheetUrl,
    };
    return data;
  } catch {
    return null;
  }
}

export function scheduleProgressPush(row, delay = 700) {
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushProgressRow(row).catch(() => {});
  }, delay);
}

export function mergeRemoteTaskCompletions(localTasks, remoteTasks, designer) {
  const who = String(designer || "").trim();
  if (!who || !Array.isArray(localTasks) || !Array.isArray(remoteTasks)) return 0;
  const mine = remoteTasks.filter((row) => String(row.designer || "").trim() === who);
  const used = new Set();
  let restored = 0;

  for (const task of localTasks) {
    const localKey = taskMatchKey({ ...task, designer: who, owner: task.owner || who });
    const remote =
      mine.find((row, index) => row.id && row.id === task.id && !used.has(`id:${row.id}`) && !used.has(`i:${index}`)) ||
      mine.find((row, index) => {
        if (used.has(`i:${index}`) || (row.id && used.has(`id:${row.id}`))) return false;
        return taskMatchKey({ ...row, designer: row.designer, owner: row.designer }) === localKey;
      });
    if (!remote) continue;
    const index = mine.indexOf(remote);
    used.add(`i:${index}`);
    if (remote.id) used.add(`id:${remote.id}`);
    if (isRemoteCompleted(remote.completed) && !task.completed) {
      task.completed = true;
      task.completedAt = remote.completedAt || task.completedAt || new Date().toISOString();
      task.creditedTo = remote.creditedTo || task.creditedTo || who;
      restored += 1;
    }
  }
  return restored;
}

export async function pushProgressTasks(designer, tasks) {
  const name = String(designer || "").trim();
  if (!name || !Array.isArray(tasks)) return null;

  const local = await tryLocalProxy("/api/progress-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ designer: name, tasks }),
  });
  if (!local.absent) {
    if (local.ok) {
      lastStatus = { state: STATUS.live, message: LIVE_MESSAGE, sheetUrl: lastStatus.sheetUrl };
      return local.data;
    }
    lastStatus = {
      state: lastStatus.state === STATUS.live ? STATUS.live : STATUS.error,
      message: local.data.message || lastStatus.message || "Could not write Tasks tab.",
      sheetUrl: lastStatus.sheetUrl,
    };
    return null;
  }

  try {
    return await pushTasksViaScript(name, tasks);
  } catch (err) {
    lastStatus = {
      state: STATUS.error,
      message: err.message || "Could not write the Tasks tab.",
      sheetUrl: lastStatus.sheetUrl,
    };
    return null;
  }
}

export function scheduleProgressTasksPush(designer, tasks, delay = 700) {
  clearTimeout(taskPushTimer);
  taskPushTimer = window.setTimeout(() => {
    pushProgressTasks(designer, tasks).catch(() => {});
  }, delay);
}
