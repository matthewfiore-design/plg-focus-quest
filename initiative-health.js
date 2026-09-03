import { getSavedEstimate } from "./design-estimator.js";
import { mergeLinkItems } from "./link-utils.js";

const INACTIVE = /launched|ended|depriorit/i;
const EARLY = /planned|definition|discovery/i;

export const HEALTH_FLAGS = {
  prd: { id: "prd", label: "No PRD" },
  figma: { id: "figma", label: "No Figma" },
  estimate: { id: "estimate", label: "No estimate" },
};

function isActiveInitiative(item) {
  const state = String(item?.state || "");
  return !INACTIVE.test(state);
}

function hasUrl(value, extras) {
  return mergeLinkItems(value, extras).length > 0;
}

export function hasFigmaLink(item) {
  return hasUrl(item?.figmaLinks, item?.figmaHrefs);
}

export function isFigmaExpected(item) {
  if (!item || !isActiveInitiative(item)) return false;
  return !EARLY.test(String(item.state || ""));
}

export function missingFigmaInProgress(item) {
  return isFigmaExpected(item) && !hasFigmaLink(item);
}

export function flagsForItem(item) {
  if (!item || !isActiveInitiative(item)) return [];
  const flags = [];
  if (!hasUrl(item.prdLink, item.prdLinks)) flags.push(HEALTH_FLAGS.prd);
  if (!hasFigmaLink(item)) {
    flags.push({
      ...HEALTH_FLAGS.figma,
      label: isFigmaExpected(item) ? "Figma not on sheet" : "No Figma yet",
      tone: isFigmaExpected(item) ? "warn" : "muted",
    });
  }
  if (!getSavedEstimate(item.id)) flags.push(HEALTH_FLAGS.estimate);
  return flags;
}

export function healthForItems(items, { designer = "" } = {}) {
  const source = (items || []).filter((item) => {
    if (!isActiveInitiative(item)) return false;
    if (!designer) return Boolean(item.designer && item.designer !== "Unassigned" && item.designer !== "N/A");
    return item.designer === designer;
  });

  return source
    .map((item) => ({ item, flags: flagsForItem(item) }))
    .filter((row) => row.flags.length)
    .sort((a, b) => b.flags.length - a.flags.length || a.item.name.localeCompare(b.item.name));
}

export function healthSummary(rows) {
  const counts = { prd: 0, figma: 0, estimate: 0 };
  for (const row of rows) {
    for (const flag of row.flags) counts[flag.id] += 1;
  }
  return counts;
}
