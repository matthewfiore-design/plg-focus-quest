const STATUS = {
  idle: "local",
  live: "live",
  error: "error",
};

let lastStatus = { state: STATUS.idle, message: "", sheetUrl: "" };
let pushTimer = 0;
let taskPushTimer = 0;

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

export async function fetchProgressBoard() {
  try {
    const res = await fetch("/api/progress", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      lastStatus = {
        state: res.status === 404 || res.status === 401 ? STATUS.idle : STATUS.error,
        message: data.message || "Squad board is local to this browser.",
        sheetUrl: data.sheetUrl || "",
      };
      return null;
    }
    lastStatus = {
      state: STATUS.live,
      message: "Squad board and Tasks tab are live from the Progress sheet.",
      sheetUrl: data.sheetUrl || "",
    };
    return data;
  } catch {
    lastStatus = {
      state: STATUS.idle,
      message: "Squad board is local until the Focus Quest server can reach the Progress sheet.",
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
  try {
    const res = await fetch("/api/progress-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designer: name, tasks }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      lastStatus = {
        state: lastStatus.state === STATUS.live ? STATUS.live : STATUS.error,
        message: data.message || lastStatus.message || "Could not write Tasks tab.",
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

export function scheduleProgressTasksPush(designer, tasks, delay = 700) {
  clearTimeout(taskPushTimer);
  taskPushTimer = window.setTimeout(() => {
    pushProgressTasks(designer, tasks).catch(() => {});
  }, delay);
}
