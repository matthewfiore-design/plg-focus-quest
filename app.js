const STORAGE_KEY = "plg-focus-quest-v1";
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
  btnExport: document.getElementById("btn-export"),
  btnReset: document.getElementById("btn-reset"),
  taskCancel: document.getElementById("task-cancel"),
};

let state = null;
let viewDate = todayISO();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function uid() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadSeed() {
  const res = await fetch("./seed.json");
  if (!res.ok) throw new Error("Could not load seed.json");
  return res.json();
}

function tasksFromSeed(seed) {
  return seed.tasks.map((t) => ({
    id: uid(),
    title: t.title,
    note: t.note || "",
    scheduledDate: t.due,
    originalDate: t.due,
    type: t.type || "daily",
    xp: t.xp || (t.type === "outcome" ? 50 : 20),
    completed: false,
    completedAt: null,
    rolloverCount: 0,
  }));
}

function createInitialState(seed) {
  const today = todayISO();
  return {
    version: 1,
    weekOf: seed.weekOf,
    title: seed.title,
    lastRolloverDate: today,
    stats: {
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      tasksCompleted: 0,
    },
    tasks: tasksFromSeed(seed),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function processRollover() {
  const today = todayISO();
  if (!state.lastRolloverDate || state.lastRolloverDate >= today) {
    state.lastRolloverDate = today;
    return [];
  }

  const rolled = [];
  let cursor = state.lastRolloverDate;

  while (cursor < today) {
    const next = addDays(cursor, 1);
    for (const task of state.tasks) {
      if (task.completed || task.type === "outcome") continue;
      if (task.scheduledDate === cursor) {
        task.scheduledDate = next;
        task.rolloverCount = (task.rolloverCount || 0) + 1;
        rolled.push(task);
      }
    }
    cursor = next;
  }

  state.lastRolloverDate = today;
  return rolled;
}

function updateStreak() {
  const today = todayISO();
  const dailyToday = state.tasks.filter((t) => t.type === "daily" && t.scheduledDate === today);
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
    showToast(`+${task.xp} XP — ${task.title.slice(0, 40)}${task.title.length > 40 ? "…" : ""}`);
    burstConfetti(12);
    checkLevelUp();
    updateStreak();
    maybeCelebrateDay();
  } else {
    state.stats.xp = Math.max(0, state.stats.xp - task.xp);
    state.stats.tasksCompleted = Math.max(0, state.stats.tasksCompleted - 1);
  }

  saveState();
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
  const daily = state.tasks.filter((t) => t.type === "daily" && t.scheduledDate === viewDate);
  if (daily.length && daily.every((t) => t.completed)) {
    showToast("Daily run cleared!");
    burstConfetti(60);
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function defaultXp(type) {
  return type === "outcome" ? 50 : 20;
}

function revokeTaskRewards(task) {
  if (!task.completed) return;
  state.stats.xp = Math.max(0, state.stats.xp - task.xp);
  state.stats.tasksCompleted = Math.max(0, state.stats.tasksCompleted - 1);
  task.completed = false;
  task.completedAt = null;
}

function deleteTask(task) {
  if (!confirm(`Remove "${task.title}"? This cannot be undone.`)) return;
  revokeTaskRewards(task);
  state.tasks = state.tasks.filter((t) => t.id !== task.id);
  saveState();
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
    form.due.value = task.scheduledDate;
    form.type.value = task.type;
    els.taskDeleteBtn.classList.remove("hidden");
  } else {
    els.taskDialogTitle.textContent = "New quest";
    els.taskSaveBtn.textContent = "Add";
    els.taskIdInput.value = "";
    form.reset();
    form.due.value = viewDate;
    form.type.value = "daily";
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
  const type = String(data.get("type")) === "outcome" ? "outcome" : "daily";

  if (id) {
    const task = findTask(id);
    if (!task) return;
    task.title = title;
    task.note = note;
    task.scheduledDate = scheduledDate;
    task.type = type;
    if (task.xp == null) task.xp = defaultXp(type);
    saveState();
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
  });
  saveState();
  els.taskDialog.close();
  els.taskForm.reset();
  render();
  showToast("Quest added");
}

function burstConfetti(count) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#5cffb8", "#c77dff", "#ffb347", "#3dd6ff", "#ff6b8a"];
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

function renderTask(task, { compact = false } = {}) {
  const li = document.createElement("li");
  li.className = "task";
  if (task.completed) li.classList.add("task--done");
  if (task.rolloverCount > 0 && !task.completed) li.classList.add("task--rolled");
  if (task.type === "outcome") li.classList.add("task--boss");

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

  if (task.type === "outcome") {
    const boss = document.createElement("span");
    boss.className = "badge badge--boss";
    boss.textContent = "Boss";
    meta.appendChild(boss);
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

  dates.forEach((iso) => {
    const pending = state.tasks.filter(
      (t) => t.type === "daily" && t.scheduledDate === iso && !t.completed
    ).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "week-btn";
    if (iso === viewDate) btn.classList.add("is-active");
    if (iso === today) btn.innerHTML = `<span>${dayLabel(iso)} · Today</span>`;
    else btn.innerHTML = `<span>${dayLabel(iso)}</span>`;
    const count = document.createElement("span");
    count.className = "week-btn__count";
    count.textContent = pending ? `${pending} open` : "done";
    btn.appendChild(count);
    btn.addEventListener("click", () => {
      viewDate = iso;
      render();
    });
    els.weekNav.appendChild(btn);
  });
}

function renderToday() {
  const isToday = viewDate === todayISO();
  els.todayLabel.textContent = isToday ? "Today" : dayLabel(viewDate);

  const daily = state.tasks.filter((t) => t.type === "daily" && t.scheduledDate === viewDate);
  els.todayTasks.innerHTML = "";
  daily.sort((a, b) => Number(a.completed) - Number(b.completed));

  if (!daily.length) {
    els.todayEmpty.classList.remove("hidden");
  } else {
    els.todayEmpty.classList.add("hidden");
    daily.forEach((task) => els.todayTasks.appendChild(renderTask(task)));
  }

  const done = daily.filter((t) => t.completed).length;
  const pct = daily.length ? Math.round((done / daily.length) * 100) : 100;
  els.ringProgress.setAttribute("stroke-dasharray", `${pct}, 100`);
  els.ringPct.textContent = `${pct}%`;
}

function renderOutcomes() {
  els.outcomeTasks.innerHTML = "";
  const outcomes = state.tasks.filter((t) => t.type === "outcome");
  outcomes.forEach((task) => els.outcomeTasks.appendChild(renderTask(task, { compact: true })));
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

function render() {
  renderStats();
  renderWeekNav();
  renderToday();
  renderOutcomes();
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
  if (!confirm("Reset this week? Progress and checkboxes will be cleared.")) return;
  const seed = await loadSeed();
  state = createInitialState(seed);
  processRollover();
  saveState();
  viewDate = todayISO();
  render();
  showToast("Week reset from seed");
}

function wireUI() {
  els.btnAdd.addEventListener("click", () => openTaskDialog());
  els.btnAddTop.addEventListener("click", () => openTaskDialog());
  els.taskCancel.addEventListener("click", () => els.taskDialog.close());
  els.taskForm.addEventListener("submit", saveTaskFromForm);
  els.taskDeleteBtn.addEventListener("click", () => {
    const task = findTask(els.taskIdInput.value);
    if (task) deleteTask(task);
  });
  els.btnExport.addEventListener("click", exportSave);
  els.btnReset.addEventListener("click", resetWeek);
}

async function init() {
  wireUI();
  state = loadState();
  if (!state) {
    const seed = await loadSeed();
    state = createInitialState(seed);
  }

  const rolled = processRollover();
  if (rolled.length) {
    showToast(`${rolled.length} quest${rolled.length > 1 ? "s" : ""} rolled forward`);
  }

  saveState();
  viewDate = todayISO();
  render();
}

init().catch((err) => {
  document.body.innerHTML = `<pre style="padding:2rem;color:#ff6b8a;">Failed to load: ${err.message}</pre>`;
});
