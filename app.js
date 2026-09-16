import { initRoadmap, getRoadmapData, getProjectsForDesigner, getRoadmapItem, getDesignerOptions, getRoadmapDesignerPhotos, setRoadmapPanelActions, refreshRoadmapPanel, refreshAfterRoadmapFieldSave, resetSheetLinkState, openRoadmapItem, setRoadmapDesignerFilter } from "./roadmap.js?v=20260916h";
import {
  generateSubtasksWithLLM,
  reviewCountForProject,
  milestoneLabel,
} from "./subtask-generator.js";
import {
  connectGoogleAccount,
  getAppsScriptUrl,
  getGoogleClientId,
  getSheetProxyStatus,
  isSheetSyncAuthorized,
  isSheetSyncConfigured,
  probeSheetProxy,
  saveGoogleClientId,
  setAppsScriptUrl,
  updateRoadmapField,
  ensureItemLinks,
} from "./sheet-sync.js?v=20260916c";
import { initDatePicker, resetDatePicker } from "./date-picker.js?v=20260916g";
import { mountDesignerPicker, setDesignerPickerValue } from "./designer-picker.js";
import { initDesignEstimatorDialog, openDesignEstimator, getSavedEstimate, estimateChipLabel } from "./design-estimator.js?v=20260916f";
import { firstLinkHref, linkInputHtml, linkListHtml, mergeLinkItems, prdFieldHtml, wireOpenLinks } from "./link-utils.js?v=20260916c";
import {
  defaultXpForType,
  isGoalsPanelType,
  isTodayTaskType,
  migrateTaskTypes,
  normalizeTaskType,
  parseTaskType,
  taskRollsOver,
  taskTypeLabel,
  taskTypeMeta,
} from "./task-types.js";
import { maybeStartProductTour, startProductTour } from "./product-tour.js";
import {
  fetchProgressBoard,
  getProgressSyncStatus,
  mergeRemoteBoard,
  mergeRemoteTaskCompletions,
  scheduleProgressPush,
  scheduleProgressTasksPush,
} from "./progress-sync.js";
import { healthForItems, healthSummary, missingFigmaInProgress } from "./initiative-health.js";

const STORAGE_KEY = "plg-focus-quest-v1";
const VIEW_KEY = "plg-focus-quest-view";
const DESIGNER_KEY = "plg-focus-quest-designer";
const OPENAI_KEY = "plg-focus-quest-openai-key";
const WORK_MODE_KEY = "plg-focus-quest-work-mode";
const LEADERBOARD_TAB_KEY = "plg-focus-quest-leaderboard-tab";
const DAY_FOCUS_LIMIT = 5;
const DAY_SHOW_MORE = 5;
const PERSONAL_OWNER = "Matthew Fiore";
const LEVELS = [
  { level: 1, title: "Rookie", xp: 0 },
  { level: 2, title: "Scout", xp: 100 },
  { level: 3, title: "Operator", xp: 250 },
  { level: 4, title: "Strategist", xp: 450 },
  { level: 5, title: "PLG Captain", xp: 700 },
  { level: 6, title: "Legend", xp: 1000 },
];

const els = {
  weekTitle: document.getElementById("week-title"),
  levelLabel: document.getElementById("level-label"),
  levelNum: document.getElementById("level-num"),
  xpFill: document.getElementById("xp-fill"),
  xpText: document.getElementById("xp-text"),
  streakCount: document.getElementById("streak-count"),
  todayLabel: document.getElementById("today-label"),
  todayTasks: document.getElementById("today-tasks"),
  todayEmpty: document.getElementById("today-empty"),
  btnShowMoreToday: document.getElementById("btn-show-more-today"),
  outcomeTasks: document.getElementById("outcome-tasks"),
  weekNav: document.getElementById("week-nav"),
  ringProgress: document.getElementById("ring-progress"),
  ringPct: document.getElementById("ring-pct"),
  toast: document.getElementById("toast"),
  confettiRoot: document.getElementById("confetti-root"),
  taskDialog: document.getElementById("task-dialog"),
  taskForm: document.getElementById("task-form"),
  taskDialogTitle: document.getElementById("task-dialog-title"),
  taskIdInput: document.getElementById("task-id"),
  taskSaveBtn: document.getElementById("task-save"),
  taskDeleteBtn: document.getElementById("task-delete"),
  btnAdd: document.getElementById("btn-add"),
  btnAddTop: document.getElementById("btn-add-top"),
  btnQuestGuide: document.getElementById("btn-quest-guide"),
  btnSettings: document.getElementById("btn-settings"),
  btnExport: document.getElementById("btn-export"),
  btnReset: document.getElementById("btn-reset"),
  taskCancel: document.getElementById("task-cancel"),
  viewTasks: document.getElementById("view-tasks"),
  viewRoadmap: document.getElementById("view-roadmap"),
  viewSettings: document.getElementById("view-settings"),
  navTabs: document.querySelectorAll(".nav-tab[data-view]"),
  hudStats: document.querySelector(".hud__stats"),
  hudEyebrow: document.querySelector(".hud__eyebrow"),
  myProjects: document.getElementById("my-projects"),
  projectsEmpty: document.getElementById("projects-empty"),
  projectsMeta: document.getElementById("projects-meta"),
  projectsHeading: document.getElementById("projects-heading"),
  panelToday: document.getElementById("panel-today"),
  panelProjects: document.getElementById("panel-projects"),
  panelDays: document.getElementById("panel-days"),
  daysBoard: document.getElementById("days-board"),
  daysMeta: document.getElementById("days-meta"),
  workToggleBtns: document.querySelectorAll("[data-work-mode]"),
  leaderboardList: document.getElementById("leaderboard-list"),
  leaderboardHint: document.getElementById("leaderboard-hint"),
  leaderboardTabs: document.querySelectorAll("[data-board]"),
  designerProfile: document.getElementById("designer-profile"),
  openaiKey: document.getElementById("openai-key"),
  appsScriptUrl: document.getElementById("apps-script-url"),
  btnCopySheetScript: document.getElementById("btn-copy-sheet-script"),
  btnCheckScript: document.getElementById("btn-check-script"),
  sheetScriptAlert: document.getElementById("sheet-script-alert"),
  sheetScriptAlertBody: document.getElementById("sheet-script-alert-body"),
  btnGoogleConnect: document.getElementById("btn-google-connect"),
  googleSyncStatus: document.getElementById("google-sync-status"),
  subtaskDialog: document.getElementById("subtask-dialog"),
  subtaskForm: document.getElementById("subtask-form"),
  subtaskDialogTitle: document.getElementById("subtask-dialog-title"),
  subtaskRoadmapId: document.getElementById("subtask-roadmap-id"),
  subtaskProjectName: document.getElementById("subtask-project-name"),
  subtaskCancel: document.getElementById("subtask-cancel"),
  taskDuePicker: document.getElementById("task-due-picker"),
  healthTitle: document.getElementById("health-title"),
  healthMeta: document.getElementById("health-meta"),
  healthList: document.getElementById("health-list"),
  healthFilters: document.querySelectorAll("[data-health-scope]"),
};

let currentView = localStorage.getItem(VIEW_KEY) === "roadmap" ? "roadmap" : "tasks";
let workMode = localStorage.getItem(WORK_MODE_KEY) === "days" ? "days" : "work";
let leaderboardTab = localStorage.getItem(LEADERBOARD_TAB_KEY) === "xp" ? "xp" : "week";
let healthScope = localStorage.getItem("plg-focus-quest-health-scope") === "squad" ? "squad" : "you";

let state = null;
let viewDate = todayISO();
let todayFocusLimit = DAY_FOCUS_LIMIT;
let pendingTodayFocus = true;
const expandedProjects = new Set();

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso, days) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return formatISO(d);
}

function dayLabel(iso) {
  const d = parseDate(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function isWeekend(iso) {
  const day = parseDate(iso).getDay();
  return day === 0 || day === 6;
}

function mondayOf(iso) {
  const d = parseDate(iso);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return formatISO(d);
}

function nextWorkday(iso) {
  let next = addDays(iso, 1);
  while (isWeekend(next)) next = addDays(next, 1);
  return next;
}

function focusDate() {
  const today = todayISO();
  return isWeekend(today) ? nextWorkday(today) : today;
}

function syncWeekOf() {
  if (!state) return;
  const monday = mondayOf(focusDate());
  if (state.weekOf === monday) return;
  state.weekOf = monday;
  const start = parseDate(monday);
  const end = parseDate(addDays(monday, 4));
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, { day: "numeric" });
  state.title = `PLG Week ${startLabel}–${endLabel}`;
  ensureLeaderboard();
}

function workdayHops(fromIso, toIso) {
  if (!fromIso || !toIso || fromIso >= toIso) return 0;
  let hops = 0;
  let cursor = fromIso;
  while (cursor < toIso && hops < 80) {
    cursor = nextWorkday(cursor);
    hops += 1;
  }
  return hops;
}

function sortDayTasks(a, b) {
  const roll = (b.rolloverCount || 0) - (a.rolloverCount || 0);
  if (roll) return roll;
  const orig = String(a.originalDate || a.scheduledDate || "").localeCompare(
    String(b.originalDate || b.scheduledDate || "")
  );
  if (orig) return orig;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function setViewDate(iso) {
  const next = String(iso || "");
  if (viewDate !== next) todayFocusLimit = DAY_FOCUS_LIMIT;
  viewDate = next;
}

function partitionDayItems(items, limit = DAY_FOCUS_LIMIT) {
  const completed = items.filter((t) => t.completed);
  const open = items.filter((t) => !t.completed).sort(sortDayTasks);
  return {
    completed,
    open,
    active: open.slice(0, limit),
    queued: open.slice(limit),
  };
}

function dayQueueHint(queued) {
  if (!queued.length) return null;
  const hint = document.createElement("li");
  hint.className = "day-queue";
  hint.textContent = `${queued.length} more waiting — finish one to bring the next in`;
  return hint;
}

function uid() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadSeed() {
  const res = await fetch("./seed.json?v=20260916a");
  if (!res.ok) throw new Error("Could not load seed.json");
  return res.json();
}

function tasksFromSeed(seed) {
  const owner = seed.owner || PERSONAL_OWNER;
  return seed.tasks.map((t) => ({
    id: uid(),
    title: t.title,
    note: t.note || "",
    scheduledDate: t.due,
    originalDate: t.due,
    type: normalizeTaskType(t.type || "daily"),
    xp: t.xp || defaultXpForType(t.type || "daily"),
    completed: false,
    completedAt: null,
    rolloverCount: 0,
    owner: t.owner || owner,
  }));
}

function taskTitleKey(title) {
  return String(title || "")
    .trim()
    .toLowerCase();
}

function mergeNewSeedTasks(current, seed) {
  const existing = new Set((current.tasks || []).map((task) => taskTitleKey(task.title)));
  const added = [];
  for (const raw of seed.tasks || []) {
    if (existing.has(taskTitleKey(raw.title))) continue;
    const [task] = tasksFromSeed({ ...seed, tasks: [raw] });
    current.tasks.push(task);
    existing.add(taskTitleKey(task.title));
    added.push(task);
  }
  if (seed.weekOf) current.weekOf = seed.weekOf;
  if (seed.title) current.title = seed.title;
  return added;
}

function createInitialState(seed) {
  const today = todayISO();
  return {
    version: 1,
    weekOf: seed.weekOf,
    title: seed.title,
    lastRolloverDate: today,
    profile: {
      designerName: localStorage.getItem(DESIGNER_KEY) || "",
    },
    stats: {
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      tasksCompleted: 0,
    },
    leaderboard: {},
    leaderboardMigrated: false,
    tasks: tasksFromSeed(seed),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.profile) {
      parsed.profile = { designerName: localStorage.getItem(DESIGNER_KEY) || "" };
    }
    if (Array.isArray(parsed.tasks)) {
      migrateTaskTypes(parsed.tasks);
      migratePersonalOwners(parsed.tasks);
    }
    if (!parsed.leaderboard || typeof parsed.leaderboard !== "object") parsed.leaderboard = {};
    return parsed;
  } catch {
    return null;
  }
}

function getDesignerName() {
  return state?.profile?.designerName || localStorage.getItem(DESIGNER_KEY) || "";
}

function squadDesignerNames() {
  return getDesignerOptions().filter((n) => n && n !== "Unassigned" && n !== "N/A");
}

function currentWeekOf() {
  return state?.weekOf || mondayOf(focusDate());
}

function inCurrentWeek(iso) {
  const week = currentWeekOf();
  const day = String(iso || "").slice(0, 10);
  return Boolean(day && day >= week && day <= addDays(week, 4));
}

function emptyLeaderboardRow() {
  return { lifetimeXp: 0, weeklyTasks: 0, weekOf: currentWeekOf() };
}

function ensureLeaderboard() {
  if (!state.leaderboard || typeof state.leaderboard !== "object") state.leaderboard = {};
  const week = currentWeekOf();
  for (const name of squadDesignerNames()) {
    if (!state.leaderboard[name]) state.leaderboard[name] = emptyLeaderboardRow();
  }
  for (const row of Object.values(state.leaderboard)) {
    if (row.weekOf && row.weekOf !== week) {
      row.weeklyTasks = 0;
      row.weekOf = week;
    } else if (!row.weekOf) {
      row.weekOf = week;
    }
  }
  const current = getDesignerName();
  if (current && !state.leaderboardMigrated && (state.stats?.xp || 0) > 0) {
    const row = state.leaderboard[current] || emptyLeaderboardRow();
    if (row.lifetimeXp === 0) row.lifetimeXp = state.stats.xp;
    state.leaderboard[current] = row;
    state.leaderboardMigrated = true;
  }
}

function reconcileLeaderboardFromTasks() {
  ensureLeaderboard();
  const me = getDesignerName();
  const week = currentWeekOf();
  if (me) {
    for (const task of state.tasks || []) {
      if (!task.completed || task.creditedTo) continue;
      const when = String(task.completedAt || "").slice(0, 10) || task.scheduledDate;
      if (inCurrentWeek(when)) task.creditedTo = me;
    }
  }
  const names = new Set(
    [...squadDesignerNames(), ...Object.keys(state.leaderboard || {}), me].filter(
      (name) => name && name !== "Unassigned" && name !== "N/A"
    )
  );
  for (const name of names) {
    const credited = (state.tasks || []).filter((task) => task.completed && task.creditedTo === name);
    const weekCount = credited.filter((task) =>
      inCurrentWeek(String(task.completedAt || "").slice(0, 10) || task.scheduledDate)
    ).length;
    const xpFromTasks = credited.reduce((sum, task) => sum + (Number(task.xp) || 0), 0);
    const row = state.leaderboard[name] || emptyLeaderboardRow();
    row.weeklyTasks = Math.max(row.weeklyTasks || 0, weekCount);
    row.lifetimeXp = Math.max(row.lifetimeXp || 0, xpFromTasks, name === me ? state.stats?.xp || 0 : 0);
    row.weekOf = week;
    state.leaderboard[name] = row;
  }
}

function creditLeaderboard(name, xpDelta, taskDelta) {
  if (!name) return;
  ensureLeaderboard();
  const row = state.leaderboard[name] || emptyLeaderboardRow();
  row.lifetimeXp = Math.max(0, (row.lifetimeXp || 0) + xpDelta);
  row.weeklyTasks = Math.max(0, (row.weeklyTasks || 0) + taskDelta);
  row.weekOf = currentWeekOf();
  state.leaderboard[name] = row;
  if (name === getDesignerName()) syncMyProgress();
}

function currentBoardRow(name = getDesignerName()) {
  if (!name) return emptyLeaderboardRow();
  ensureLeaderboard();
  return state.leaderboard[name] || emptyLeaderboardRow();
}

function taskBelongsOnSheet(task, designer = getDesignerName()) {
  if (!task || !designer) return false;
  if (isPersonalTask(task)) return taskOwner(task) === designer;
  if (task.type === "feature" || task.roadmapId) {
    const ids = designerProjectIds();
    return Boolean(ids?.has(task.roadmapId));
  }
  return false;
}

function serializeTaskForSheet(task, designer = getDesignerName()) {
  return {
    id: task.id,
    designer: isPersonalTask(task) ? taskOwner(task) || designer : designer,
    title: task.title,
    type: task.type,
    roadmapId: task.roadmapId || "",
    roadmapName: task.roadmapName || "",
    milestone: task.milestone || "",
    scheduledDate: task.scheduledDate || "",
    originalDate: task.originalDate || task.scheduledDate || "",
    completed: Boolean(task.completed),
    completedAt: task.completedAt || "",
    xp: task.xp || 0,
    rolloverCount: task.rolloverCount || 0,
    creditedTo: task.creditedTo || "",
    generated: Boolean(task.generated),
    note: task.note || "",
  };
}

function syncMyProgress() {
  const name = getDesignerName();
  if (!name) return;
  const row = currentBoardRow(name);
  scheduleProgressPush({
    designer: name,
    lifetimeXp: row.lifetimeXp || 0,
    weeklyTasks: row.weeklyTasks || 0,
    weekOf: state.weekOf || mondayOf(focusDate()),
    streak: state.stats?.streak || 0,
    lastActive: todayISO(),
  });
  syncMyTasks();
}

function syncMyTasks() {
  const name = getDesignerName();
  if (!name || !state?.tasks) return;
  const tasks = state.tasks.filter((task) => taskBelongsOnSheet(task, name)).map((task) => serializeTaskForSheet(task, name));
  scheduleProgressTasksPush(name, tasks);
}

async function pullProgressBoard() {
  const remote = await fetchProgressBoard();
  if (!remote) {
    renderLeaderboard();
    return;
  }
  if (remote.designers) {
    ensureLeaderboard();
    state.leaderboard = mergeRemoteBoard(
      state.leaderboard,
      remote.designers,
      state.weekOf || mondayOf(focusDate()),
      getDesignerName()
    );
  }
  const who = getDesignerName();
  const restored = who ? mergeRemoteTaskCompletions(state.tasks, remote.tasks || [], who) : 0;
  if (restored) reconcileLeaderboardFromTasks();
  saveState();
  renderLeaderboard();
  render();
  if (who) syncMyProgress();
  if (restored) showToast(`${restored} checked quest${restored > 1 ? "s" : ""} restored from the Tasks sheet`);
}

function designerBoardAvatar(name) {
  const photos = getRoadmapDesignerPhotos() || {};
  const entry = photos[name];
  const src = entry?.local || entry?.url || "";
  if (src) {
    return `<img class="leaderboard__photo" src="${escapeHtml(src)}" alt="" loading="lazy" />`;
  }
  const initials = String(name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
  return `<span class="leaderboard__avatar">${escapeHtml(initials)}</span>`;
}

function setDesignerName(name) {
  if (!state.profile) state.profile = {};
  state.profile.designerName = name;
  localStorage.setItem(DESIGNER_KEY, name);
  reconcileLeaderboardFromTasks();
  saveState();
  syncMyProgress();
  setRoadmapDesignerFilter(name);
}

function getOpenAIKey() {
  return els.openaiKey?.value.trim() || localStorage.getItem(OPENAI_KEY) || "";
}

function saveOpenAIKey(key) {
  if (key) localStorage.setItem(OPENAI_KEY, key);
  else localStorage.removeItem(OPENAI_KEY);
}

async function saveAppsScriptUrl(url) {
  setAppsScriptUrl(url);
  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appsScriptUrl: url }),
    });
  } catch {
    // GitHub Pages has no local config endpoint — the URL is stored in the browser.
  }
  await probeSheetProxy({ refresh: true });
  updateGoogleSyncStatus();
}

async function copySheetScript(button) {
  let text = "";
  try {
    const res = await fetch("/api/sheet-script", { cache: "no-store" });
    if (res.ok) text = await res.text();
  } catch {
    text = "";
  }
  if (!text.trim()) {
    const res = await fetch("./scripts/DesignUpdate.gs", { cache: "no-store" });
    text = await res.text();
  }
  if (!text.trim()) throw new Error("Could not load sheet script.");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("Clipboard copy was blocked. Allow paste, then try again.");
  }

  const label = "Copied to clipboard";
  showToast(`${label} — paste into Extensions → Apps Script, then deploy a new version`, 4500);
  if (els.googleSyncStatus) {
    els.googleSyncStatus.textContent = `${label}. Paste DesignUpdate.gs into the sheet: Extensions → Apps Script.`;
  }

  const buttons = [button, els.btnCopySheetScript].filter(Boolean);
  const seen = new Set();
  buttons.forEach((btn) => {
    if (seen.has(btn)) return;
    seen.add(btn);
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent.trim();
    btn.textContent = label;
    btn.classList.add("btn--copied");
    btn.setAttribute("aria-label", label);
    clearTimeout(btn._copiedTimer);
    btn._copiedTimer = setTimeout(() => {
      btn.textContent = btn.dataset.defaultLabel;
      btn.classList.remove("btn--copied");
      btn.removeAttribute("aria-label");
    }, 4000);
  });
}

function roadmapTasks(roadmapId) {
  return state.tasks.filter((t) => t.type === "feature" && t.roadmapId === roadmapId);
}

function designerProjectIds() {
  const designer = getDesignerName();
  if (!designer) return null;
  return new Set(getProjectsForDesigner(designer).map((p) => p.id));
}

function isPersonalTask(task) {
  return Boolean(task && !task.roadmapId && task.type !== "feature");
}

function taskOwner(task) {
  if (!isPersonalTask(task)) return "";
  return String(task.owner || PERSONAL_OWNER).trim();
}

function migratePersonalOwners(tasks) {
  for (const task of tasks || []) {
    if (isPersonalTask(task) && !task.owner) task.owner = PERSONAL_OWNER;
  }
}

function isDesignerWorkTask(task) {
  if (!task || isGoalsPanelType(task.type)) return false;
  if (task.type === "feature" || task.roadmapId) {
    const ids = designerProjectIds();
    if (!ids) return false;
    return ids.has(task.roadmapId);
  }
  const designer = getDesignerName();
  if (!designer) return false;
  return taskOwner(task) === designer;
}

function designerWorkTasks() {
  return state.tasks.filter(isDesignerWorkTask);
}

function removeRoadmapSubtasks(roadmapId, { generatedOnly = false } = {}) {
  state.tasks = state.tasks.filter((t) => {
    if (t.type !== "feature" || t.roadmapId !== roadmapId) return true;
    if (generatedOnly && !t.generated) return true;
    revokeTaskRewards(t);
    return false;
  });
}

function addRoadmapSubtasks(item, subtasks, { generated = false } = {}) {
  subtasks.forEach((st) => {
    state.tasks.push({
      id: uid(),
      title: st.title,
      note: st.note || "",
      scheduledDate: st.scheduledDate,
      originalDate: st.scheduledDate,
      type: "feature",
      roadmapId: item.id,
      roadmapName: item.name,
      milestone: st.milestone || "manual",
      generated,
      xp: st.xp || 20,
      completed: false,
      completedAt: null,
      rolloverCount: 0,
    });
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function processRollover() {
  const today = todayISO();
  const target = focusDate();
  const rolled = [];

  for (const task of state.tasks) {
    if (task.completed || !taskRollsOver(task.type) || !task.scheduledDate) continue;
    if (task.scheduledDate >= target) continue;
    const hops = Math.max(1, workdayHops(task.scheduledDate, target));
    task.scheduledDate = target;
    task.rolloverCount = (task.rolloverCount || 0) + hops;
    rolled.push(task);
  }

  state.lastRolloverDate = today;
  return rolled;
}

function applyDayRollover({ snapToToday = false } = {}) {
  if (!state) return [];
  const previousFocus = focusDate();
  syncWeekOf();
  const rolled = processRollover();
  if (snapToToday || previousFocus !== focusDate()) {
    setViewDate(focusDate());
    pendingTodayFocus = true;
  }
  saveState();
  return rolled;
}

function updateStreak() {
  const today = todayISO();
  const who = getDesignerName();
  const dailyToday = state.tasks.filter(
    (t) => t.type === "daily" && t.scheduledDate === today && taskOwner(t) === who
  );
  const doneToday = dailyToday.filter((t) => t.completed).length;
  const allDone = dailyToday.length > 0 && doneToday === dailyToday.length;

  if (allDone) {
    if (state.stats.lastActiveDate === addDays(today, -1)) {
      state.stats.streak += 1;
    } else if (state.stats.lastActiveDate !== today) {
      state.stats.streak = 1;
    }
    state.stats.lastActiveDate = today;
  }
}

function levelInfo(xp) {
  let current = LEVELS[0];
  let next = LEVELS[1] || null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  const floor = current.xp;
  const ceiling = next ? next.xp : floor + 200;
  const pct = Math.min(100, Math.round(((xp - floor) / (ceiling - floor)) * 100));
  return { current, next, pct, ceiling };
}

function completeTask(task, checked) {
  if (task.completed === checked) return;

  task.completed = checked;
  task.completedAt = checked ? new Date().toISOString() : null;

  if (checked) {
    state.stats.xp += task.xp;
    state.stats.tasksCompleted += 1;
    const who = getDesignerName();
    if (who) {
      creditLeaderboard(who, task.xp, 1);
      task.creditedTo = who;
    }
    showToast(
      who
        ? `+${task.xp} XP — ${task.title.slice(0, 40)}${task.title.length > 40 ? "…" : ""}`
        : `+${task.xp} XP — set I am in Settings to credit the squad board`
    );
    burstConfetti(12);
    checkLevelUp();
    updateStreak();
    maybeCelebrateDay();
  } else {
    state.stats.xp = Math.max(0, state.stats.xp - task.xp);
    state.stats.tasksCompleted = Math.max(0, state.stats.tasksCompleted - 1);
    if (task.creditedTo) {
      creditLeaderboard(task.creditedTo, -task.xp, -1);
      task.creditedTo = null;
    }
  }

  saveState();
  syncMyProgress();
  render();
}

function checkLevelUp() {
  const before = levelInfo(state.stats.xp - 0);
  const after = levelInfo(state.stats.xp);
  if (after.current.level > before.current.level) {
    showToast(`Level up! ${after.current.title}`);
    burstConfetti(40);
  }
}

function maybeCelebrateDay() {
  const daily = designerWorkTasks().filter(
    (t) => isTodayTaskType(t.type) && t.scheduledDate === focusDate()
  );
  if (daily.length && daily.filter((t) => !t.completed).length === 0) {
    showToast("Daily run cleared!");
    burstConfetti(60);
  }
}

function showToast(message, duration = 2600) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), duration);
}

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function defaultXp(type) {
  return defaultXpForType(type);
}

function revokeTaskRewards(task) {
  if (!task.completed) return;
  state.stats.xp = Math.max(0, state.stats.xp - task.xp);
  state.stats.tasksCompleted = Math.max(0, state.stats.tasksCompleted - 1);
  if (task.creditedTo) {
    creditLeaderboard(task.creditedTo, -task.xp, -1);
    task.creditedTo = null;
  }
  task.completed = false;
  task.completedAt = null;
}

function deleteTask(task) {
  if (!confirm(`Remove "${task.title}"? This cannot be undone.`)) return;
  revokeTaskRewards(task);
  state.tasks = state.tasks.filter((t) => t.id !== task.id);
  saveState();
  syncMyTasks();
  els.taskDialog.close();
  render();
  showToast("Quest removed");
}

function openTaskDialog(task = null) {
  const form = els.taskForm;
  if (task) {
    els.taskDialogTitle.textContent = "Edit quest";
    els.taskSaveBtn.textContent = "Save";
    els.taskIdInput.value = task.id;
    form.title.value = task.title;
    form.note.value = task.note || "";
    resetDatePicker(els.taskDuePicker, task.scheduledDate);
    form.type.value = normalizeTaskType(task.type);
    if (task.roadmapId) {
      form.type.value = "feature";
      form.type.disabled = true;
    } else {
      form.type.disabled = false;
    }
    els.taskDeleteBtn.classList.remove("hidden");
  } else {
    els.taskDialogTitle.textContent = "New quest";
    els.taskSaveBtn.textContent = "Add";
    els.taskIdInput.value = "";
    form.reset();
    resetDatePicker(els.taskDuePicker, viewDate);
    form.type.value = "daily";
    form.type.disabled = false;
    els.taskDeleteBtn.classList.add("hidden");
  }
  els.taskDialog.showModal();
}

function saveTaskFromForm(e) {
  e.preventDefault();
  const data = new FormData(els.taskForm);
  const id = String(data.get("id") || "").trim();
  const title = String(data.get("title")).trim();
  const note = String(data.get("note") || "").trim();
  const scheduledDate = String(data.get("due"));
  let type = parseTaskType(data.get("type"));

  if (id) {
    const task = findTask(id);
    if (!task) return;
    if (task.roadmapId) type = "feature";
    task.title = title;
    task.note = note;
    task.scheduledDate = scheduledDate;
    task.type = type;
    if (task.xp == null) task.xp = defaultXp(type);
    saveState();
    syncMyTasks();
    els.taskDialog.close();
    render();
    showToast("Quest updated");
    return;
  }

  state.tasks.push({
    id: uid(),
    title,
    note,
    scheduledDate,
    originalDate: scheduledDate,
    type,
    xp: defaultXp(type),
    completed: false,
    completedAt: null,
    rolloverCount: 0,
    owner: type === "feature" ? undefined : getDesignerName() || PERSONAL_OWNER,
  });
  saveState();
  syncMyTasks();
  els.taskDialog.close();
  els.taskForm.reset();
  render();
  showToast("Quest added");
}

function burstConfetti(count) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#c6e8a1", "#c6aed7", "#a47ebf", "#54356a", "#dcdcda"];
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti";
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = `${1.2 + Math.random() * 1.4}s`;
    bit.style.animationDelay = `${Math.random() * 0.3}s`;
    els.confettiRoot.appendChild(bit);
    setTimeout(() => bit.remove(), 2800);
  }
}

function figmaDisplayValue(value) {
  const v = (value || "").trim();
  if (!v || v === "N/A" || v === "TBD") return "";
  if (/^https?:\/\//i.test(v)) return v;
  return v;
}

async function updateProjectField(roadmapId, field, value) {
  const item = getRoadmapItem(roadmapId);
  const roadmapData = getRoadmapData();
  if (!item || !roadmapData) throw new Error("Project not found.");

  const normalized =
    field === "designer"
      ? value || "Unassigned"
      : field === "figmaLinks" || field === "prototypeLinks"
        ? value.trim()
        : value;

  const proxy = getSheetProxyStatus();
  if (proxy.available && !proxy.authorized) {
    throw new Error(
      proxy.message ||
        "Add the Apps Script web app URL in Settings, then try the assignment again."
    );
  }

  try {
    const result = await updateRoadmapField(item, field, normalized, roadmapData, {
      interactive: true,
    });
    populateDesignerSelect();
    renderMyProjects();
    refreshAfterRoadmapFieldSave(field, item);
    if (field === "designer") {
      showToast(`${normalized} assigned — saved to sheet (${result.range})`);
    } else {
      showToast(`Saved to roadmap sheet (${result.range})`);
    }
    return normalized;
  } catch (err) {
    showToast(err.message || "Could not save to the roadmap sheet.");
    throw err;
  }
}

function wireProjectEditors(card, project) {
  const figmaInput = card.querySelector('[data-edit-field="figmaLinks"]');
  const prototypeInput = card.querySelector('[data-edit-field="prototypeLinks"]');
  const designerRoot = card.querySelector("[data-designer-picker]");
  const statusEl = card.querySelector("[data-sheet-sync-status]");
  wireOpenLinks(card);

  const setStatus = (message, tone = "muted") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const persistField = async (field, value) => {
    setStatus("Saving…", "pending");
    const previousDesigner = project.designer;
    try {
      await updateProjectField(project.id, field, value);
      setStatus("Saved to roadmap sheet", "ok");
    } catch (err) {
      console.error(err);
      if (field === "designer") {
        setDesignerPickerValue(pickerState, previousDesigner);
      }
      setStatus(err.message || "Save failed", "error");
    }
  };

  figmaInput?.addEventListener("change", () => persistField("figmaLinks", figmaInput.value.trim()));
  figmaInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      figmaInput.blur();
    }
  });
  prototypeInput?.addEventListener("change", () => persistField("prototypeLinks", prototypeInput.value.trim()));
  prototypeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      prototypeInput.blur();
    }
  });

  const pickerState = mountDesignerPicker(designerRoot, {
    value: project.designer,
    options: getDesignerOptions(),
    photos: getRoadmapDesignerPhotos(),
    onChange: (name) => persistField("designer", name),
  });

  const proxy = getSheetProxyStatus();
  if (proxy.available && proxy.authorized) {
    setStatus(
      proxy.via === "local-proxy" ? "Edits sync to sheet via local proxy" : "Edits save to the roadmap sheet",
      "muted"
    );
  } else if (isSheetSyncConfigured() && isSheetSyncAuthorized()) {
    setStatus("Edits sync to sheet", "muted");
  } else if (proxy.message && (proxy.scriptStatus === "old" || proxy.scriptStatus === "error")) {
    setStatus(proxy.message, "warn");
  } else if (proxy.available) {
    setStatus(proxy.message || "Authorize sheets, then restart serve.py", "warn");
  } else if (isSheetSyncConfigured()) {
    setStatus("Checking the sheet script…", "warn");
  } else {
    setStatus("Add the Apps Script URL in Settings to save assignments", "warn");
  }
}

function isMatthewAdmin() {
  return getDesignerName() === "Matthew Fiore";
}

function sheetScriptBroken(proxy = getSheetProxyStatus()) {
  return proxy.scriptStatus === "old" || proxy.scriptStatus === "error";
}

function notifyMatthewSheetIssue(message) {
  updateSheetScriptAlert(message);
  if (!isMatthewAdmin() || !message) return;
  if (notifyMatthewSheetIssue._last === message) return;
  notifyMatthewSheetIssue._last = message;
  showToast(message, 4200);
}

function updateSheetScriptAlert(message = "") {
  const alert = els.sheetScriptAlert;
  if (!alert) return;
  const proxy = getSheetProxyStatus();
  const broken = Boolean(message) || sheetScriptBroken(proxy);
  const show = isMatthewAdmin() && broken;
  alert.hidden = !show;
  if (!show) return;
  if (els.sheetScriptAlertBody) {
    els.sheetScriptAlertBody.textContent =
      message ||
      proxy.message ||
      "The live sheet script cannot read PRD or Figma URLs. Copy the script in Settings, paste into Apps Script, Save, then deploy a new version.";
  }
}

function updateGoogleSyncStatus() {
  const proxy = getSheetProxyStatus();
  const oldScript = proxy.scriptStatus === "old";
  const connected =
    proxy.available && proxy.authorized && proxy.canReadLinks
      ? "Link reader is live — PRD and Figma URLs load from the sheet."
      : oldScript
        ? proxy.message ||
          "This /exec URL is still the old script. Copy, select all in Apps Script, paste, Save, then deploy a new version."
        : proxy.scriptStatus === "unknown"
          ? "Checking the live /exec URL for the PRD/Figma link reader…"
        : proxy.message ||
          "Copy the script, then in the Google Sheet use Extensions → Apps Script (not Tools).";
  if (els.googleSyncStatus) els.googleSyncStatus.textContent = connected;
  const url = proxy.appsScriptUrl || getAppsScriptUrl();
  if (els.appsScriptUrl && !els.appsScriptUrl.value) els.appsScriptUrl.value = url;
  if (sheetScriptBroken(proxy)) {
    notifyMatthewSheetIssue(connected);
  } else {
    notifyMatthewSheetIssue._last = "";
    updateSheetScriptAlert();
  }
}

function renderTask(task, { compact = false } = {}) {
  const li = document.createElement("li");
  li.className = "task";
  if (task.completed) li.classList.add("task--done");
  if (task.rolloverCount > 0 && !task.completed) li.classList.add("task--rolled");
  if (task.type === "annual") li.classList.add("task--annual");
  if (task.type === "feature") li.classList.add("task--feature");
  if (task.type === "other") li.classList.add("task--other");

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "task__check";
  check.checked = task.completed;
  check.setAttribute("aria-label", `Complete ${task.title}`);
  check.addEventListener("change", () => {
    li.classList.add("task--pop");
    completeTask(task, check.checked);
    setTimeout(() => li.classList.remove("task--pop"), 450);
  });

  const body = document.createElement("div");
  const title = document.createElement("p");
  title.className = "task__title";
  title.textContent = task.title;
  body.appendChild(title);

  if (task.note && !compact) {
    const note = document.createElement("p");
    note.className = "task__note";
    note.textContent = task.note;
    body.appendChild(note);
  }

  if (task.roadmapName && !compact) {
    const project = document.createElement("p");
    project.className = "task__project";
    project.textContent = task.roadmapName;
    body.appendChild(project);
  }

  const meta = document.createElement("div");
  meta.className = "task__meta";

  const xp = document.createElement("span");
  xp.className = "badge badge--xp";
  xp.textContent = `+${task.xp} XP`;
  meta.appendChild(xp);

  if (task.rolloverCount > 0 && !task.completed) {
    const roll = document.createElement("span");
    roll.className = "badge badge--roll";
    roll.textContent = `Carried ×${task.rolloverCount}`;
    meta.appendChild(roll);
  }

  const typeBadge = document.createElement("span");
  typeBadge.className = `badge ${taskTypeMeta(task.type).badgeClass}`;
  typeBadge.textContent = taskTypeLabel(task.type);
  meta.appendChild(typeBadge);

  if (task.type === "feature" && task.milestone && task.milestone !== "manual") {
    const road = document.createElement("span");
    road.className = "badge badge--milestone";
    road.textContent = milestoneLabel(task.milestone);
    meta.appendChild(road);
  }

  const roadmapItem = task.roadmapId ? getRoadmapItem(task.roadmapId) : null;
  if (roadmapItem && missingFigmaInProgress(roadmapItem) && !task.completed) {
    li.classList.add("task--figma-warn");
    const warn = document.createElement("span");
    warn.className = "badge badge--figma-warn";
    warn.title = "Figma is expected once this initiative is in progress. Add the file URL on the roadmap sheet.";
    warn.textContent = "Figma not on sheet";
    meta.appendChild(warn);
  }

  const actions = document.createElement("div");
  actions.className = "task__actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.title = "Edit quest";
  editBtn.setAttribute("aria-label", `Edit ${task.title}`);
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", () => openTaskDialog(task));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon-btn icon-btn--danger";
  deleteBtn.title = "Remove quest";
  deleteBtn.setAttribute("aria-label", `Remove ${task.title}`);
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", () => deleteTask(task));

  actions.append(editBtn, deleteBtn);
  li.append(check, body, meta, actions);
  return li;
}

function weekDates() {
  const start = parseDate(state.weekOf);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return formatISO(d);
  });
}

function renderWeekNav() {
  els.weekNav.innerHTML = "";
  const dates = weekDates();
  const today = todayISO();
  const focus = focusDate();

  dates.forEach((iso) => {
    const dayItems = designerWorkTasks().filter(
      (t) => isTodayTaskType(t.type) && t.scheduledDate === iso
    );
    const { open, queued } = partitionDayItems(dayItems);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "week-btn";
    if (iso === viewDate) btn.classList.add("is-active");
    if (iso === focus) btn.classList.add("is-today");
    const label = iso === today ? `${dayLabel(iso)} · Today` : iso === focus ? `${dayLabel(iso)} · Next workday` : dayLabel(iso);
    btn.innerHTML = `<span>${label}</span>`;
    const count = document.createElement("span");
    count.className = "week-btn__count";
    if (!dayItems.length) count.textContent = "empty";
    else if (!open.length) count.textContent = "done";
    else if (queued.length) count.textContent = `${DAY_FOCUS_LIMIT} in focus · ${queued.length} waiting`;
    else count.textContent = `${open.length} open`;
    btn.appendChild(count);
    btn.addEventListener("click", () => {
      setViewDate(iso);
      if (iso === focus) pendingTodayFocus = true;
      render();
      if (workMode === "days") {
        document.getElementById(`day-${iso}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    els.weekNav.appendChild(btn);
  });
}

function renderToday() {
  const iso = focusDate();
  const calendarToday = todayISO();
  els.todayLabel.textContent = iso === calendarToday ? `Today · ${dayLabel(iso)}` : `${dayLabel(iso)} · Next workday`;

  const items = designerWorkTasks().filter(
    (t) => isTodayTaskType(t.type) && t.scheduledDate === iso
  );
  const { completed, active, queued, open } = partitionDayItems(items, todayFocusLimit);
  els.todayTasks.innerHTML = "";

  const visible = [...active, ...completed];
  if (!visible.length) {
    els.todayEmpty.classList.remove("hidden");
  } else {
    els.todayEmpty.classList.add("hidden");
    visible.forEach((task) => els.todayTasks.appendChild(renderTask(task)));
  }
  if (els.btnShowMoreToday) {
    const remaining = queued.length;
    els.btnShowMoreToday.classList.toggle("hidden", remaining === 0);
    els.btnShowMoreToday.textContent = "Show 5 more";
    els.btnShowMoreToday.setAttribute(
      "aria-label",
      remaining ? `Show 5 more, ${remaining} waiting` : "Show 5 more"
    );
  }

  const denom = completed.length + open.length;
  const pct = denom ? Math.round((completed.length / denom) * 100) : 100;
  els.ringProgress.setAttribute("stroke-dasharray", `${pct}, 100`);
  els.ringPct.textContent = `${pct}%`;
}

function renderOutcomes() {
  els.outcomeTasks.innerHTML = "";
  const designer = getDesignerName();
  const goals = state.tasks.filter((t) => isGoalsPanelType(t.type) && taskOwner(t) === designer);
  goals.forEach((task) => els.outcomeTasks.appendChild(renderTask(task, { compact: true })));
}

function setWorkMode() {
  workMode = "work";
}

function focusTodayColumn() {
  const iso = focusDate();
  document.getElementById(`day-${iso}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDaysBoard() {
  if (!els.daysBoard) return;
  const designer = getDesignerName();
  const dates = weekDates();
  const today = todayISO();
  const focus = focusDate();
  const weekSet = new Set(dates);
  const items = designerWorkTasks().filter((t) => isTodayTaskType(t.type));
  const leftover = items.filter((t) => t.scheduledDate && !weekSet.has(t.scheduledDate) && t.completed);

  if (els.daysMeta) {
    const open = items.filter((t) => !t.completed && weekSet.has(t.scheduledDate)).length;
    const waiting = dates.reduce(
      (sum, iso) => sum + partitionDayItems(items.filter((t) => t.scheduledDate === iso)).queued.length,
      0
    );
    if (!designer) {
      els.daysMeta.textContent =
        "Select your name in Settings — day view includes your quests and that designer’s subtasks.";
    } else if (waiting) {
      els.daysMeta.textContent = `${open} open for ${designer} · ${waiting} waiting behind the 5-per-day cap`;
    } else {
      els.daysMeta.textContent = `${open} open item${open === 1 ? "" : "s"} this week for ${designer}`;
    }
  }

  const daysHeading = document.getElementById("days-heading");
  if (daysHeading) {
    daysHeading.textContent = focus === today ? `Today · ${dayLabel(focus)}` : `Next workday · ${dayLabel(focus)}`;
  }

  els.daysBoard.innerHTML = "";
  const columns = [...dates.map((iso) => ({ iso, label: dayLabel(iso), items: items.filter((t) => t.scheduledDate === iso) }))];
  if (leftover.length) {
    leftover.sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
    columns.push({ iso: "other", label: "Outside this week", items: leftover });
  }

  columns.forEach((col) => {
    const section = document.createElement("section");
    section.className = "day-col";
    if (col.iso === focus) section.classList.add("is-today");
    if (col.iso === viewDate) section.classList.add("is-selected");
    if (col.iso !== "other") section.id = `day-${col.iso}`;

    const { completed, active, queued, open } = partitionDayItems(col.items);
    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "day-col__head";
    const focusLabel = col.iso === today ? " · Today" : col.iso === focus ? " · Next workday" : "";
    const meta = queued.length
      ? `${active.length} in focus · ${queued.length} waiting`
      : open.length
        ? `${open.length} open`
        : col.items.length
          ? "All done"
          : "No items";
    heading.innerHTML = `
      <div>
        <p class="day-col__label">${escapeHtml(col.label)}${focusLabel}</p>
        <p class="day-col__meta">${meta}</p>
      </div>
      <span class="day-col__count">${completed.length}/${Math.min(col.items.length, completed.length + DAY_FOCUS_LIMIT)}${queued.length ? `+${queued.length}` : ""}</span>
    `;
    if (col.iso !== "other") {
      heading.addEventListener("click", () => {
        setViewDate(col.iso);
        if (col.iso === focus) pendingTodayFocus = true;
        render();
      });
    }

    const visible = [...active, ...completed];
    if (!visible.length && !queued.length) {
      const empty = document.createElement("p");
      empty.className = "empty day-col__empty";
      empty.textContent = "Nothing scheduled.";
      section.append(heading, empty);
    } else {
      const list = document.createElement("ul");
      list.className = "task-list";
      visible.forEach((task) => list.appendChild(renderTask(task)));
      const hint = dayQueueHint(queued);
      if (hint) list.appendChild(hint);
      section.append(heading, list);
    }
    els.daysBoard.appendChild(section);
  });

  if (pendingTodayFocus && workMode === "days") {
    pendingTodayFocus = false;
    requestAnimationFrame(() => focusTodayColumn());
  }
}

function renderSubtasksInto(container, roadmapId) {
  let root = container;
  let id = roadmapId;
  if (typeof container === "string" && roadmapId instanceof Element) {
    root = roadmapId;
    id = container;
  }
  if (!root || typeof root === "string" || !id) return;
  const subtasks = roadmapTasks(id);
  root.innerHTML = "";

  if (!subtasks.length) {
    root.innerHTML =
      '<p class="project-card__empty">No subtasks yet — generate a plan or add one manually.</p>';
    return;
  }

  const list = document.createElement("ul");
  list.className = "task-list task-list--nested";
  subtasks
    .sort(
      (a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) || Number(a.completed) - Number(b.completed)
    )
    .forEach((task) => list.appendChild(renderTask(task, { compact: true })));
  root.appendChild(list);
}

function renderMyProjects() {
  if (!els.myProjects) return;
  const designer = getDesignerName();
  const projects = getProjectsForDesigner(designer);

  if (els.projectsHeading) {
    els.projectsHeading.textContent = designer ? `${designer.split(" ")[0]}'s initiatives` : "Roadmap work";
  }
  if (els.projectsMeta) {
    els.projectsMeta.textContent = designer
      ? `${projects.length} roadmap initiative${projects.length === 1 ? "" : "s"} assigned to ${designer}`
      : "Select your name in Settings to see assigned initiatives.";
  }

  els.myProjects.innerHTML = "";
  if (!designer || !projects.length) {
    els.projectsEmpty?.classList.remove("hidden");
    return;
  }
  els.projectsEmpty?.classList.add("hidden");

  projects.forEach((project) => {
    const subtasks = roadmapTasks(project.id);
    const done = subtasks.filter((t) => t.completed).length;
    const reviewCount = reviewCountForProject(project);
    const estimate = getSavedEstimate(project.id);
    const estimateLabel = estimate ? estimateChipLabel(estimate) : "";
    const expanded = expandedProjects.has(project.id);

    const figmaWarn = missingFigmaInProgress(project);
    const card = document.createElement("article");
    card.className = "project-card";
    if (expanded) card.classList.add("project-card--expanded");
    if (figmaWarn) card.classList.add("project-card--figma-warn");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "project-card__toggle";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.innerHTML = `
      <div class="project-card__summary">
        <p class="project-card__state">${escapeHtml(project.state || "")}${
          figmaWarn
            ? `<span class="badge badge--figma-warn" title="Add the Figma URL on the source-of-truth roadmap sheet">Figma not on sheet</span>`
            : ""
        }</p>
        <h3 class="project-card__title">${escapeHtml(project.name)}</h3>
        <p class="project-card__meta">${reviewCount} design review${reviewCount === 1 ? "" : "s"} · ${done}/${subtasks.length} subtasks done${estimateLabel ? ` · ${escapeHtml(estimateLabel)}` : ""}</p>
      </div>
      <span class="project-card__chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
    `;

    const body = document.createElement("div");
    body.className = "project-card__body";
    body.hidden = !expanded;
    body.innerHTML = `
      <div class="project-card__editable">
        ${prdFieldHtml(project.prdLink, project.prdLinks, { compact: true })}
        ${project.linksResolved === "error" ? `<p class="detail-sheet-status detail-sheet-status--compact" data-tone="warn">PRD/Figma URLs need the updated sheet script — see the steps on the PLG Roadmap tab.</p>` : ""}
        <div class="detail-field detail-field--compact">
          <span class="detail-field__label">Assigned designer</span>
          <div data-designer-picker></div>
        </div>
        <div class="detail-link-fields detail-link-fields--compact">
          <label class="detail-field detail-field--compact${figmaWarn ? " detail-field--warn" : ""}">
            <span class="detail-field__label">Figma link${figmaWarn ? " · add to sheet" : ""}</span>
            ${linkListHtml(mergeLinkItems(project.figmaLinks, project.figmaHrefs))}
            ${linkInputHtml({
              field: "figmaLinks",
              inputValue: figmaDisplayValue(project.figmaLinks),
              href: firstLinkHref(project.figmaLinks, project.figmaHrefs),
              placeholder: "https://figma.com/file/…",
            })}
          </label>
          <label class="detail-field detail-field--compact">
            <span class="detail-field__label">Prototype link</span>
            ${linkListHtml(mergeLinkItems(project.prototypeLinks, project.prototypeHrefs))}
            ${linkInputHtml({
              field: "prototypeLinks",
              inputValue: figmaDisplayValue(project.prototypeLinks),
              href: firstLinkHref(project.prototypeLinks, project.prototypeHrefs),
            })}
          </label>
        </div>
        <p class="detail-sheet-status detail-sheet-status--compact" data-sheet-sync-status data-tone="muted"></p>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "project-card__actions project-card__actions--inline project-card__actions--always";
    actions.innerHTML = `
      ${estimateLabel ? `<span class="estimate-chip" title="${escapeHtml(estimate.size.name)} · ${escapeHtml(estimate.size.range)}">${escapeHtml(estimateLabel)}</span>` : ""}
      <button type="button" class="btn btn--ghost btn--sm" data-action="estimate" data-id="${escapeHtml(project.id)}">Estimate</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="add-subtask" data-id="${escapeHtml(project.id)}">+ Subtask</button>
      <button type="button" class="btn btn--primary btn--sm" data-action="generate" data-id="${escapeHtml(project.id)}">Generate subtasks</button>
    `;

    const subtasksWrap = document.createElement("div");
    subtasksWrap.className = "project-card__subtasks";
    subtasksWrap.dataset.subtasks = project.id;

    toggle.addEventListener("click", () => {
      if (expandedProjects.has(project.id)) expandedProjects.delete(project.id);
      else expandedProjects.add(project.id);
      renderMyProjects();
    });

    card.append(toggle, actions, subtasksWrap, body);
    renderSubtasksInto(subtasksWrap, project.id);
    wireProjectEditors(card, project);

    if (expanded && project.linksResolved !== true && project.linksResolved !== "error" && !project._linksPromise) {
      project._linksPromise = ensureItemLinks(project)
        .catch((err) => {
          project.linksResolved = "error";
          project.linksError = err.message || "Could not load sheet hyperlinks.";
        })
        .finally(() => {
          project._linksPromise = null;
          renderMyProjects();
        });
    }

    card.querySelector('[data-action="estimate"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      openDesignEstimator(project);
    });
    card.querySelector('[data-action="add-subtask"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      openSubtaskDialog(project.id);
    });
    card.querySelector('[data-action="generate"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      generateSubtasksForProject(project.id, e.currentTarget);
    });

    els.myProjects.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function generateSubtasksForProject(roadmapId, triggerBtn = null) {
  const item = getRoadmapItem(roadmapId);
  if (!item) return;

  const existing = roadmapTasks(roadmapId);
  const generated = existing.filter((t) => t.generated);
  if (generated.length) {
    const ok = confirm(
      `Replace ${generated.length} generated subtasks for "${item.name}"? Manual subtasks are kept.`
    );
    if (!ok) return;
    removeRoadmapSubtasks(roadmapId, { generatedOnly: true });
  }

  const buttons = triggerBtn
    ? [triggerBtn]
    : [
        ...(els.myProjects?.querySelectorAll(`[data-action="generate"][data-id="${roadmapId}"]`) || []),
        ...(document.querySelectorAll(`[data-panel-generate="${roadmapId}"]`) || []),
      ];

  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.textContent = "Generating…";
  });

  expandedProjects.add(roadmapId);

  const result = await generateSubtasksWithLLM(item, weekDates(), getOpenAIKey());
  addRoadmapSubtasks(item, result.tasks, { generated: true });
  saveState();
  syncMyTasks();
  render();
  refreshRoadmapPanel();
  showToast(
    result.message ||
      `Added ${result.tasks.length} subtasks (${result.reviewCount} design review${result.reviewCount === 1 ? "" : "s"}${result.estimateSize ? ` · ${result.estimateSize}` : ""})`
  );

  buttons.forEach((btn) => {
    btn.disabled = false;
    btn.textContent = "Generate subtasks";
  });
}

function openSubtaskDialog(roadmapId) {
  const item = getRoadmapItem(roadmapId);
  if (!item || !els.subtaskDialog) return;
  els.subtaskRoadmapId.value = roadmapId;
  els.subtaskProjectName.textContent = item.name;
  els.subtaskForm.reset();
  els.subtaskForm.due.value = viewDate;
  els.subtaskDialog.showModal();
}

function saveSubtaskFromForm(e) {
  e.preventDefault();
  const data = new FormData(els.subtaskForm);
  const roadmapId = String(data.get("roadmapId") || "").trim();
  const item = getRoadmapItem(roadmapId);
  if (!item) return;

  addRoadmapSubtasks(
    item,
    [
      {
        title: String(data.get("title")).trim(),
        note: String(data.get("note") || "").trim(),
        scheduledDate: String(data.get("due")),
        milestone: "manual",
        xp: 20,
      },
    ],
    { generated: false }
  );
  expandedProjects.add(roadmapId);
  saveState();
  els.subtaskDialog.close();
  render();
  refreshRoadmapPanel();
  showToast("Subtask added");
}

function populateDesignerSelect() {
  if (!els.designerProfile) return;
  const designers = getDesignerOptions().filter((n) => n !== "Unassigned" && n !== "N/A");

  const current = getDesignerName();
  els.designerProfile.innerHTML = '<option value="">Select designer…</option>';
  designers.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    els.designerProfile.appendChild(opt);
  });

  if (els.openaiKey) {
    els.openaiKey.value = localStorage.getItem(OPENAI_KEY) || "";
  }
  if (els.appsScriptUrl) {
    const proxy = getSheetProxyStatus();
    els.appsScriptUrl.value = proxy.appsScriptUrl || localStorage.getItem("plg-focus-quest-apps-script-url") || "";
  }
  updateGoogleSyncStatus();
}

function renderLeaderboard() {
  if (!els.leaderboardList) return;
  reconcileLeaderboardFromTasks();
  const current = getDesignerName();
  const names = [...new Set([...squadDesignerNames(), ...Object.keys(state.leaderboard || {})])].filter(
    (n) => n && n !== "Unassigned" && n !== "N/A"
  );
  const rows = names.map((name) => {
    const row = state.leaderboard[name] || emptyLeaderboardRow();
    return {
      name,
      lifetimeXp: row.lifetimeXp || 0,
      weeklyTasks: row.weeklyTasks || 0,
    };
  });
  const byWeek = leaderboardTab === "week";
  rows.sort((a, b) => {
    const primary = byWeek ? b.weeklyTasks - a.weeklyTasks : b.lifetimeXp - a.lifetimeXp;
    if (primary) return primary;
    const secondary = byWeek ? b.lifetimeXp - a.lifetimeXp : b.weeklyTasks - a.weeklyTasks;
    if (secondary) return secondary;
    return a.name.localeCompare(b.name);
  });

  els.leaderboardTabs.forEach((btn) => {
    const on = btn.dataset.board === leaderboardTab;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (els.leaderboardHint) {
    const sync = getProgressSyncStatus();
    const live = sync.state === "live" ? " · live sheet" : " · this browser";
    els.leaderboardHint.textContent = !current
      ? "Set I am in Settings to credit completions"
      : byWeek
        ? `Completions this week · resets ${dayLabel(currentWeekOf())}${live}`
        : `Lifetime XP · never resets${live}`;
  }

  if (!rows.length) {
    els.leaderboardList.innerHTML = `<li class="leaderboard__empty">Roadmap designers will appear here.</li>`;
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  els.leaderboardList.innerHTML = rows
    .map((row, index) => {
      const me = row.name === current;
      const value = byWeek ? row.weeklyTasks : row.lifetimeXp;
      const unit = byWeek ? (row.weeklyTasks === 1 ? "task" : "tasks") : "XP";
      return `
        <li class="leaderboard__row${me ? " is-you" : ""}${index < 3 && value ? " is-podium" : ""}">
          <span class="leaderboard__rank" aria-hidden="true">${medals[index] || index + 1}</span>
          ${designerBoardAvatar(row.name)}
          <span class="leaderboard__name">${escapeHtml(row.name.split(" ")[0])}${me ? " · you" : ""}</span>
          <span class="leaderboard__score">${value}<small>${unit}</small></span>
        </li>
      `;
    })
    .join("");
}

function renderStats() {
  els.weekTitle.textContent = state.title;
  const { current, pct, ceiling } = levelInfo(state.stats.xp);
  els.levelLabel.textContent = current.title;
  els.levelNum.textContent = `Lv ${current.level}`;
  els.xpFill.style.width = `${pct}%`;
  els.xpText.textContent = `${state.stats.xp} / ${ceiling} XP`;
  els.streakCount.textContent = String(state.stats.streak);
}

function renderHealthRadar() {
  const items = getRoadmapData()?.items || [];
  const me = getDesignerName();
  const scope = healthScope === "you" && me ? me : "";
  const rows = healthForItems(items, { designer: scope });
  const counts = healthSummary(rows);

  els.healthFilters.forEach((btn) => {
    const on = btn.dataset.healthScope === healthScope;
    btn.classList.toggle("is-active", on);
  });

  if (els.healthTitle) {
    els.healthTitle.textContent = "Data gaps";
  }
  if (els.healthMeta) {
    if (healthScope === "you" && !me) {
      els.healthMeta.textContent = "Select I am to see your gaps, or switch to Squad.";
    } else if (!rows.length) {
      els.healthMeta.textContent = "PRD, Figma, and estimates look complete on the sheet.";
    } else {
      els.healthMeta.textContent = `${rows.length} initiative${rows.length === 1 ? "" : "s"} · ${counts.prd} PRD · ${counts.figma} Figma · ${counts.estimate} estimate. Figma is expected once work is in progress — Planned / Discovery can wait.`;
    }
  }

  if (!els.healthList) return;
  els.healthList.innerHTML = "";
  if (!rows.length && !(healthScope === "you" && !me)) {
    els.healthList.innerHTML = `<p class="empty">No sheet gaps for this view.</p>`;
    return;
  }
  rows.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "health-radar__row";
    btn.innerHTML = `
      <span><span class="health-radar__name">${escapeHtml(row.item.name)}</span>${
        !scope ? `<span class="health-radar__owner">${escapeHtml((row.item.designer || "").split(" ")[0] || "")}</span>` : ""
      }</span>
      <span class="health-flags">${row.flags
        .map((flag) => `<span class="health-flag${flag.tone === "muted" ? " health-flag--muted" : flag.tone === "warn" ? " health-flag--warn" : ""}">${escapeHtml(flag.label)}</span>`)
        .join("")}</span>
    `;
    btn.addEventListener("click", () => {
      setView("roadmap");
      openRoadmapItem(row.item.id);
    });
    els.healthList.appendChild(btn);
  });
}

function openDataGaps() {
  setView("settings");
  renderHealthRadar();
  document.getElementById("settings-gaps")?.scrollIntoView({ block: "start" });
}

function render() {
  setWorkMode(workMode);
  renderStats();
  renderWeekNav();
  renderToday();
  renderMyProjects();
  renderDaysBoard();
  renderOutcomes();
  renderLeaderboard();
  renderHealthRadar();
  refreshRoadmapPanel();
}

function tourHooks() {
  return {
    setView,
    setWorkMode,
    render,
  };
}

function exportSave() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plg-focus-quest-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function resetWeek() {
  if (!confirm("Reload seed quests? Checks already saved on the Progress Tasks sheet stay checked.")) return;
  const seed = await loadSeed();
  const board = state.leaderboard;
  const migrated = state.leaderboardMigrated;
  state = createInitialState(seed);
  state.leaderboard = board || {};
  state.leaderboardMigrated = migrated;
  migratePersonalOwners(state.tasks);
  applyDayRollover({ snapToToday: true });
  render();
  await pullProgressBoard();
  showToast("Week reset from seed");
}

function setView(view) {
  currentView = view === "roadmap" || view === "settings" ? view : "tasks";
  if (currentView === "tasks" || currentView === "roadmap") {
    localStorage.setItem(VIEW_KEY, currentView);
  }

  els.viewTasks?.classList.toggle("view--active", currentView === "tasks");
  if (els.viewRoadmap) els.viewRoadmap.hidden = currentView !== "roadmap";
  els.viewSettings?.classList.toggle("view--active", currentView === "settings");
  if (els.viewSettings) els.viewSettings.hidden = currentView !== "settings";

  els.navTabs.forEach((tab) => {
    tab.classList.toggle("is-active", currentView !== "settings" && tab.dataset.view === currentView);
  });
  els.btnSettings?.classList.toggle("is-active", currentView === "settings");
  els.btnSettings?.setAttribute("aria-pressed", currentView === "settings" ? "true" : "false");

  if (currentView === "tasks") {
    setViewDate(focusDate());
    pendingTodayFocus = true;
  }
  if (currentView === "settings") renderHealthRadar();
}

function wireNavigation() {
  els.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setView(tab.dataset.view);
      if (currentView === "tasks" || currentView === "settings") render();
    });
  });
  setView(currentView);
}

function wireUI() {
  els.btnAdd?.addEventListener("click", () => openTaskDialog());
  els.btnShowMoreToday?.addEventListener("click", () => {
    todayFocusLimit += DAY_SHOW_MORE;
    renderToday();
    renderWeekNav();
  });
  els.btnAddTop.addEventListener("click", () => openTaskDialog());
  els.btnQuestGuide?.addEventListener("click", () => startProductTour(tourHooks()));
  els.btnSettings?.addEventListener("click", () => {
    if (currentView === "settings") {
      setView(localStorage.getItem(VIEW_KEY) === "roadmap" ? "roadmap" : "tasks");
      if (currentView === "tasks") render();
      return;
    }
    setView("settings");
    renderHealthRadar();
  });
  els.taskCancel.addEventListener("click", () => els.taskDialog.close());
  els.taskForm.addEventListener("submit", saveTaskFromForm);
  els.taskDeleteBtn.addEventListener("click", () => {
    const task = findTask(els.taskIdInput.value);
    if (task) deleteTask(task);
  });
  els.btnExport.addEventListener("click", exportSave);
  els.btnReset.addEventListener("click", resetWeek);
  els.leaderboardTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      leaderboardTab = btn.dataset.board === "xp" ? "xp" : "week";
      localStorage.setItem(LEADERBOARD_TAB_KEY, leaderboardTab);
      renderLeaderboard();
    });
  });
  els.designerProfile?.addEventListener("change", () => {
    setDesignerName(els.designerProfile.value);
    render();
    pullProgressBoard();
    updateSheetScriptAlert();
    showToast(els.designerProfile.value ? `Viewing ${els.designerProfile.value}'s projects` : "Designer cleared");
  });
  els.healthFilters.forEach((btn) => {
    btn.addEventListener("click", () => {
      healthScope = btn.dataset.healthScope === "squad" ? "squad" : "you";
      localStorage.setItem("plg-focus-quest-health-scope", healthScope);
      renderHealthRadar();
    });
  });
  els.openaiKey?.addEventListener("change", () => saveOpenAIKey(els.openaiKey.value.trim()));
  els.appsScriptUrl?.addEventListener("change", () => saveAppsScriptUrl(els.appsScriptUrl.value.trim()));
  els.btnCopySheetScript?.addEventListener("click", (e) => copySheetScript(e.currentTarget).catch((err) => showToast(err.message)));
  const saveUrl = async (input) => {
    try {
      await saveAppsScriptUrl(input?.value.trim() || "");
      if (els.appsScriptUrl && input) els.appsScriptUrl.value = input.value.trim();
      resetSheetLinkState();
      const proxy = getSheetProxyStatus();
      if (proxy.canReadLinks) {
        showToast("Link reader is live — reopen a project for PRD/Figma URLs");
      } else {
        showToast(proxy.message || "Saved, but Google is still serving the old script");
      }
    } catch (err) {
      showToast(err.message || "Could not save script URL");
    }
  };
  const checkScript = async (button) => {
    const label = button?.textContent;
    if (button) button.textContent = "Checking…";
    try {
      await probeSheetProxy({ refresh: true });
      updateGoogleSyncStatus();
      const proxy = getSheetProxyStatus();
      showToast(
        proxy.canReadLinks
          ? "Link reader is live"
          : proxy.message || "Still the old script"
      );
    } catch (err) {
      showToast(err.message || "Could not check the live script");
    } finally {
      if (button && label) button.textContent = label;
    }
  };
  els.btnGoogleConnect?.addEventListener("click", () => saveUrl(els.appsScriptUrl));
  els.btnCheckScript?.addEventListener("click", (e) => checkScript(e.currentTarget));
  els.subtaskCancel?.addEventListener("click", () => els.subtaskDialog.close());
  els.subtaskForm?.addEventListener("submit", saveSubtaskFromForm);
  document.addEventListener("plg-roadmap-links-ready", () => {
    renderMyProjects();
    renderHealthRadar();
  });
  document.addEventListener("plg-estimate-saved", () => {
    renderMyProjects();
    renderHealthRadar();
  });
  document.addEventListener("plg-sheet-links-error", (event) => {
    const proxy = getSheetProxyStatus();
    if (proxy.available) {
      notifyMatthewSheetIssue(event.detail || "The live sheet script cannot read PRD or Figma URLs.");
    }
    renderMyProjects();
  });
}

async function loadGoogleConfig() {
  const saved = localStorage.getItem("plg-focus-quest-apps-script-url")?.trim();
  try {
    const res = await fetch("./google-config.json");
    if (!res.ok) return;
    const data = await res.json();
    const fileUrl = String(data.appsScriptUrl || "").trim();
    if (!fileUrl || saved) return;
    setAppsScriptUrl(fileUrl);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appsScriptUrl: fileUrl }),
    }).catch(() => {});
  } catch {
    // optional local config
  }
}

async function init() {
  wireNavigation();
  wireUI();
  initDatePicker(els.taskDuePicker, { name: "due", value: viewDate, required: true });
  state = loadState();
  const seed = await loadSeed();
  let seededNew = 0;
  if (!state) {
    state = createInitialState(seed);
  } else {
    seededNew = mergeNewSeedTasks(state, seed).length;
  }
  migratePersonalOwners(state.tasks);

  const rolled = applyDayRollover({ snapToToday: true });
  const visibleRolled = rolled.filter(isDesignerWorkTask);
  if (visibleRolled.length && seededNew) {
    showToast(
      `${visibleRolled.length} unfinished quest${visibleRolled.length > 1 ? "s" : ""} moved to today · ${seededNew} new from transcripts`
    );
  } else if (visibleRolled.length) {
    showToast(`${visibleRolled.length} unfinished quest${visibleRolled.length > 1 ? "s" : ""} moved to today`);
  } else if (seededNew) {
    showToast(`${seededNew} quest${seededNew > 1 ? "s" : ""} added from the last two weeks`);
  }

  saveState();
  setViewDate(focusDate());
  await loadGoogleConfig();
  await probeSheetProxy();
  const savedUrl = getSheetProxyStatus().appsScriptUrl || getAppsScriptUrl();
  if (els.appsScriptUrl && !els.appsScriptUrl.value) els.appsScriptUrl.value = savedUrl;
  updateGoogleSyncStatus();
  probeSheetProxy({ refresh: true }).then(() => updateGoogleSyncStatus()).catch(() => {});
  render();

  await initRoadmap({
    designerName: getDesignerName(),
    grid: document.getElementById("roadmap-grid"),
    filters: document.getElementById("roadmap-filters"),
    count: document.getElementById("roadmap-count"),
    subtitle: document.getElementById("roadmap-subtitle"),
    sourceLink: document.getElementById("roadmap-source-link"),
    panel: document.getElementById("roadmap-panel"),
    panelBody: document.getElementById("roadmap-panel-body"),
    panelTitle: document.getElementById("roadmap-panel-title"),
    panelClose: document.getElementById("roadmap-panel-close"),
    estimateBtn: document.getElementById("roadmap-estimate-btn"),
    scrim: document.getElementById("roadmap-scrim"),
  });

  initDesignEstimatorDialog({
    dialog: document.getElementById("estimator-dialog"),
    root: document.getElementById("estimator-root"),
    projectName: document.getElementById("estimator-project-name"),
    closeBtn: document.getElementById("estimator-close"),
  });

  setRoadmapPanelActions({
    onGenerateSubtasks: generateSubtasksForProject,
    onAddSubtask: openSubtaskDialog,
    renderSubtasks: renderSubtasksInto,
    onUpdateField: updateProjectField,
    isSheetSyncReady: () => isSheetSyncConfigured() && isSheetSyncAuthorized(),
    showToast,
  });

  populateDesignerSelect();
  renderMyProjects();
  renderHealthRadar();
  document.addEventListener("plg-sheet-links-ready", () => {
    renderMyProjects();
    renderToday();
    renderHealthRadar();
  });
  pullProgressBoard();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const rolled = applyDayRollover({ snapToToday: true });
    const visibleRolled = rolled.filter(isDesignerWorkTask);
    if (visibleRolled.length) {
      showToast(`${visibleRolled.length} unfinished quest${visibleRolled.length > 1 ? "s" : ""} moved to today`);
    }
    render();
    pullProgressBoard();
  });

  requestAnimationFrame(() => maybeStartProductTour(tourHooks()));
}

init().catch((err) => {
  document.body.innerHTML = `<pre style="padding:2rem;color:#ff6b8a;">Failed to load: ${err.message}</pre>`;
});
