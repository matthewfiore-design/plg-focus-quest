export const TASK_TYPES = {
  daily: {
    label: "Daily Quest",
    xp: 20,
    rollsOver: true,
    inToday: true,
    inGoalsPanel: false,
    cssClass: "task--daily",
    badgeClass: "badge--daily",
  },
  feature: {
    label: "Feature",
    xp: 20,
    rollsOver: true,
    inToday: true,
    inGoalsPanel: false,
    cssClass: "task--feature",
    badgeClass: "badge--feature",
  },
  annual: {
    label: "Annual Goal",
    xp: 50,
    rollsOver: false,
    inToday: false,
    inGoalsPanel: true,
    cssClass: "task--annual",
    badgeClass: "badge--annual",
  },
  other: {
    label: "Other",
    xp: 20,
    rollsOver: true,
    inToday: true,
    inGoalsPanel: false,
    cssClass: "task--other",
    badgeClass: "badge--other",
  },
};

export const MANUAL_TASK_TYPE_IDS = ["daily", "annual", "other"];

export function normalizeTaskType(type) {
  if (type === "outcome") return "annual";
  if (type === "roadmap") return "feature";
  if (TASK_TYPES[type]) return type;
  return "daily";
}

export function taskTypeMeta(type) {
  return TASK_TYPES[normalizeTaskType(type)] || TASK_TYPES.daily;
}

export function taskTypeLabel(type) {
  return taskTypeMeta(type).label;
}

export function defaultXpForType(type) {
  return taskTypeMeta(type).xp;
}

export function isTodayTaskType(type) {
  return taskTypeMeta(type).inToday;
}

export function isGoalsPanelType(type) {
  return taskTypeMeta(type).inGoalsPanel;
}

export function taskRollsOver(type) {
  return taskTypeMeta(type).rollsOver;
}

export function parseTaskType(value) {
  const normalized = normalizeTaskType(String(value || "").trim());
  return TASK_TYPES[normalized] ? normalized : "daily";
}

export function migrateTaskTypes(tasks) {
  tasks.forEach((task) => {
    task.type = normalizeTaskType(task.type);
  });
}
