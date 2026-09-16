import { initDatePicker, setDatePickerValue } from "./date-picker.js?v=20260916g";
import { mountDesignerPicker, setDesignerPickerValue } from "./designer-picker.js";
import { openDesignEstimator, initDesignEstimatorDialog, getSavedEstimate, estimateChipLabel } from "./design-estimator.js?v=20260916f";
import { missingFigmaInProgress } from "./initiative-health.js";
import { applyLinkMap, ensureItemLinks, fetchSheetLinks } from "./sheet-sync.js?v=20260916c";
import {
  escapeHtml,
  firstLinkHref,
  linkInputHtml,
  linkKey,
  linkListHtml,
  mergeJiraLinkItems,
  mergeLinkItems,
  normalizeDesignerName,
  prdFieldHtml,
  wireOpenLinks,
} from "./link-utils.js?v=20260916c";

const STATE_META = {
  "1. planned": { label: "Planned", tone: "muted" },
  "2. definition / discovery": { label: "Discovery", tone: "warn" },
  "3. design": { label: "Design", tone: "design" },
  "4. development": { label: "Development", tone: "dev" },
  "5. staging": { label: "Staging", tone: "staging" },
  "5. live experiment": { label: "Live experiment", tone: "staging" },
  "6. launched": { label: "Launched", tone: "done" },
  "7. ended": { label: "Ended", tone: "muted" },
  "8. deprioritized": { label: "Deprioritized", tone: "muted" },
  "9. blocked": { label: "Blocked", tone: "warn" },
};

/** Designer priority order (lower = higher priority). */
const STATE_PRIORITY = {
  "3. design": 1,
  design: 1,
  "2. definition / discovery": 2,
  "definition / discovery": 2,
  "1. planned": 3,
  planned: 3,
  "4. development": 4,
  development: 4,
  "5. live experiment": 5,
  "live experiment": 5,
  "5. staging": 5,
  staging: 5,
  "6. launched": 6,
  launched: 6,
  "7. ended": 7,
  ended: 7,
  "8. deprioritized": 8,
  deprioritized: 8,
  "9. blocked": 9,
  blocked: 9,
};

function statePriorityRank(state) {
  const key = (state || "").trim().toLowerCase();
  if (STATE_PRIORITY[key] != null) return STATE_PRIORITY[key];

  const stripped = key.replace(/^\d+\.\s*/, "");
  if (STATE_PRIORITY[stripped] != null) return STATE_PRIORITY[stripped];

  if (stripped.includes("design")) return 1;
  if (stripped.includes("definition") || stripped.includes("discovery")) return 2;
  if (stripped.includes("planned")) return 3;
  if (stripped.includes("development")) return 4;
  if (stripped.includes("live experiment") || stripped.includes("experiment")) return 5;
  if (stripped.includes("launched")) return 6;
  if (stripped.includes("ended")) return 7;
  if (stripped.includes("depriorit")) return 8;
  if (stripped.includes("blocked")) return 9;

  return 99;
}

export function sortProjectsByState(items) {
  return [...items].sort((a, b) => {
    const byState = statePriorityRank(a.state) - statePriorityRank(b.state);
    if (byState !== 0) return byState;
    return a.name.localeCompare(b.name);
  });
}

const els = {
  grid: null,
  panel: null,
  scrim: null,
  panelBody: null,
  panelTitle: null,
  panelClose: null,
  estimateBtn: null,
  estimateValue: null,
  count: null,
  filters: null,
  subtitle: null,
  sourceLink: null,
};

let roadmapData = null;
let designerPhotos = {};
let activeDesigner = "all";
let activeStatus = "all";
let activeTeam = "all";
let activeQuarter = "all";
let selectedId = null;
let panelActions = null;

function designerFilterValue(name) {
  const normalized = normalizeDesignerName(name);
  if (!normalized || !roadmapData) return "all";
  const options = getDesignerOptions();
  return (
    options.find((option) => option === normalized) ||
    options.find((option) => option.toLowerCase() === normalized.toLowerCase()) ||
    "all"
  );
}

export function setRoadmapDesignerFilter(name) {
  activeDesigner = designerFilterValue(name);
  if (!roadmapData) return;
  renderFilters();
  renderGrid();
}

const SPECIAL_FILTERS = new Set(["Unassigned", "N/A"]);

export function setRoadmapPanelActions(actions) {
  panelActions = actions;
}

export function refreshRoadmapPanel() {
  if (selectedId) openPanel(selectedId);
}

function stateMeta(state) {
  const key = (state || "").trim().toLowerCase();
  return STATE_META[key] || { label: state || "Unknown", tone: "muted" };
}

function designerInitials(name) {
  if (!name || name === "Unassigned" || name === "N/A") return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function designerPhotoSrc(name) {
  const entry = designerPhotos[name];
  if (!entry) return null;
  return entry.local || entry.url || null;
}

function designerAvatarHtml(name) {
  const src = designerPhotoSrc(name);
  if (src) {
    return `<img class="designer-chip__photo" src="${escapeHtml(src)}" alt="" loading="lazy" />`;
  }
  return `<span class="designer-chip__avatar">${designerInitials(name)}</span>`;
}

function truncate(text, max = 140) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function sortFilterNames(names) {
  const unique = [...new Set(names)];
  const regular = unique.filter((n) => n !== "all" && !SPECIAL_FILTERS.has(n)).sort((a, b) => a.localeCompare(b));
  const special = [];
  if (unique.includes("Unassigned")) special.push("Unassigned");
  if (unique.includes("N/A")) special.push("N/A");
  return ["all", ...regular, ...special];
}

export function getDesignerOptions() {
  if (!roadmapData) return [];
  const fromItems = roadmapData.items.map((i) => i.designer).filter(Boolean);
  const fromPhotos = Object.keys(designerPhotos || {});
  return sortFilterNames([...fromItems, ...fromPhotos, "Unassigned", "N/A"]).filter((n) => n !== "all");
}

function figmaDisplayValue(value) {
  const v = (value || "").trim();
  if (!v || v === "N/A" || v === "TBD") return "";
  if (/^https?:\/\//i.test(v)) return v;
  return v;
}

function getQuarterOptions() {
  if (!roadmapData) return [];
  const fromMeta = roadmapData.quarters || [];
  if (fromMeta.length) return fromMeta;
  return [...new Set(roadmapData.items.map((i) => i.expectedLaunchQuarter).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

function formatQuarterFilterLabel(value) {
  if (value === "all") return "All quarters";
  return value;
}

function formatSyncedDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getStatusOptions() {
  if (!roadmapData) return [];
  const states = [...new Set(roadmapData.items.map((i) => i.state).filter(Boolean))];
  return states.sort((a, b) => statePriorityRank(a) - statePriorityRank(b));
}

function getTeamOptions() {
  if (!roadmapData) return [];
  return [...new Set(roadmapData.items.map((i) => i.engTeam).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function formatDesignerFilterLabel(value) {
  if (value === "all") return "All designers";
  return value;
}

function formatStatusFilterLabel(value) {
  if (value === "all") return "All statuses";
  return stateMeta(value).label;
}

function formatTeamFilterLabel(value) {
  if (value === "all") return "All teams";
  return value;
}

function createFilterSelect(label, id, values, activeValue, onChange, formatLabel = (value) => value) {
  const wrap = document.createElement("label");
  wrap.className = "roadmap-filter";
  wrap.htmlFor = id;

  const labelEl = document.createElement("span");
  labelEl.className = "roadmap-filter__label";
  labelEl.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  select.className = "roadmap-filter__select";

  values.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = formatLabel(value);
    if (value === activeValue) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => onChange(select.value));

  wrap.appendChild(labelEl);
  wrap.appendChild(select);
  return wrap;
}

function createDesignerFilter(designers, activeValue, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "roadmap-filter roadmap-filter--designer";

  const labelEl = document.createElement("span");
  labelEl.className = "roadmap-filter__label";
  labelEl.textContent = "Designer";

  const pickerRoot = document.createElement("div");
  pickerRoot.id = "roadmap-filter-designer";
  pickerRoot.className = "roadmap-filter__picker";

  mountDesignerPicker(pickerRoot, {
    value: activeValue,
    options: designers,
    photos: designerPhotos,
    formatLabel: formatDesignerFilterLabel,
    showAvatar: (name) => name !== "all",
    onChange,
  });

  wrap.appendChild(labelEl);
  wrap.appendChild(pickerRoot);
  return wrap;
}

function matchesRoadmapFilters(item) {
  if (activeQuarter !== "all" && item.expectedLaunchQuarter !== activeQuarter) return false;
  if (activeDesigner !== "all" && item.designer !== activeDesigner) return false;
  if (activeStatus !== "all" && item.state !== activeStatus) return false;
  if (activeTeam !== "all" && item.engTeam !== activeTeam) return false;
  return true;
}

function renderFilters() {
  if (!els.filters || !roadmapData) return;
  els.filters.querySelectorAll(".roadmap-filter__picker").forEach((el) => el._designerPickerCleanup?.());
  els.filters.innerHTML = "";

  const designers = sortFilterNames(["all", ...roadmapData.items.map((i) => i.designer)]);
  const quarters = ["all", ...getQuarterOptions()];
  const statuses = ["all", ...getStatusOptions()];
  const teams = ["all", ...getTeamOptions()];

  els.filters.appendChild(
    createFilterSelect(
      "Quarter",
      "roadmap-filter-quarter",
      quarters,
      activeQuarter,
      (value) => {
        activeQuarter = value;
        renderGrid();
      },
      formatQuarterFilterLabel
    )
  );

  els.filters.appendChild(
    createDesignerFilter(designers, activeDesigner, (value) => {
      activeDesigner = value;
      renderGrid();
    })
  );

  els.filters.appendChild(
    createFilterSelect(
      "Status",
      "roadmap-filter-status",
      statuses,
      activeStatus,
      (value) => {
        activeStatus = value;
        renderGrid();
      },
      formatStatusFilterLabel
    )
  );

  els.filters.appendChild(
    createFilterSelect(
      "Team",
      "roadmap-filter-team",
      teams,
      activeTeam,
      (value) => {
        activeTeam = value;
        renderGrid();
      },
      formatTeamFilterLabel
    )
  );
}

function renderGrid() {
  if (!els.grid || !roadmapData) return;

  const items = sortProjectsByState(roadmapData.items.filter(matchesRoadmapFilters));

  if (els.count) {
    els.count.textContent = `${items.length} initiative${items.length === 1 ? "" : "s"}`;
  }

  els.grid.innerHTML = "";
  if (!items.length) {
    els.grid.innerHTML = `<p class="roadmap-empty">No roadmap items for this filter.</p>`;
    return;
  }

  items.forEach((item) => {
    const meta = stateMeta(item.state);
    const figmaWarn = missingFigmaInProgress(item);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "roadmap-card";
    if (selectedId === item.id) card.classList.add("is-selected");
    if (figmaWarn) card.classList.add("roadmap-card--figma-warn");
    card.dataset.roadmapId = item.id;
    card.innerHTML = `
      <div class="roadmap-card__top">
        <span class="state-pill state-pill--${meta.tone}">${meta.label}</span>
        <span class="roadmap-card__team">${escapeHtml(item.expectedLaunchQuarter || "")}${item.expectedLaunchQuarter && item.engTeam ? " · " : ""}${escapeHtml(item.engTeam || "")}${
          figmaWarn ? `<span class="badge badge--figma-warn">Figma not on sheet</span>` : ""
        }</span>
      </div>
      <h3 class="roadmap-card__title">${escapeHtml(item.name)}</h3>
      <p class="roadmap-card__desc">${escapeHtml(truncate(item.description))}</p>
      <div class="roadmap-card__footer">
        <span class="designer-chip">
          ${designerAvatarHtml(item.designer)}
          <span>${escapeHtml(item.designer)}</span>
        </span>
      </div>
    `;
    card.addEventListener("click", () => openPanel(item.id));
    els.grid.appendChild(card);
  });
}

const OVERRIDES_KEY = "plg-focus-quest-sheet-overrides";

function loadFieldOverrides() {
  try {
    const data = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function saveFieldOverride(item, field, value) {
  if (!item) return;
  const all = loadFieldOverrides();
  const key = item.id || linkKey(item.name, item.expectedLaunchQuarter);
  all[key] = {
    ...(all[key] || {}),
    name: item.name,
    expectedLaunchQuarter: item.expectedLaunchQuarter || "",
    [field]: value,
  };
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
}

function applyFieldOverrides() {
  if (!roadmapData?.items) return;
  const all = loadFieldOverrides();
  for (const item of roadmapData.items) {
    const patch = all[item.id] || all[linkKey(item.name, item.expectedLaunchQuarter)];
    if (!patch) continue;
    if (patch.designer != null) item.designer = normalizeDesignerName(patch.designer);
    if (patch.designHandoffDate != null) item.designHandoffDate = patch.designHandoffDate;
    if (patch.designStatus != null) item.designStatus = patch.designStatus;
    if (patch.figmaLinks != null) item.figmaLinks = patch.figmaLinks;
    if (patch.prototypeLinks != null) item.prototypeLinks = patch.prototypeLinks;
    if (patch.prdLinks) item.prdLinks = patch.prdLinks;
    if (patch.figmaHrefs) item.figmaHrefs = patch.figmaHrefs;
    if (patch.prototypeHrefs) item.prototypeHrefs = patch.prototypeHrefs;
    if (patch.jiraLinks) item.jiraLinks = patch.jiraLinks;
    if (item.prdLinks?.length || item.figmaHrefs?.length) item.linksResolved = true;
  }
}

function applyCachedHyperlinks() {
  if (!roadmapData?.items) return;
  for (const item of roadmapData.items) {
    if (item.prdLinks?.length || item.figmaHrefs?.length || item.prototypeHrefs?.length || item.jiraLinks?.length) {
      item.linksResolved = true;
    }
  }
}

function notifyLinksReady() {
  renderGrid();
  if (selectedId) {
    const item = getRoadmapItem(selectedId);
    if (item) renderPanel(item);
  }
  document.dispatchEvent(new CustomEvent("plg-sheet-links-ready"));
}

async function refreshLiveSheetLinks() {
  try {
    const map = await fetchSheetLinks(null);
    if (!map) return;
    applyLinkMap(roadmapData?.items, map);
    for (const item of roadmapData.items || []) item.linksResolved = true;
    notifyLinksReady();
  } catch (err) {
    console.warn("Could not refresh roadmap hyperlinks", err);
  }
}

function detailRow(label, value) {
  const v = (value || "").trim();
  if (!v) return "";
  return `
    <div class="detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(v)}</dd>
    </div>
  `;
}

function detailLink(label, value, extras = [], { jira = false } = {}) {
  const items = jira ? mergeJiraLinkItems(value, extras) : mergeLinkItems(value, extras);
  if (!items.length) {
    const text = String(value || "").trim();
    return text ? detailRow(label, text) : "";
  }
  return `
    <div class="detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${linkListHtml(items)}</dd>
    </div>
  `;
}

const DESIGN_STATUS_OPTIONS = [
  "Not Started",
  "Research",
  "Concepting",
  "Design Review",
  "Iterating",
  "Handed off",
  "Blocked",
  "Archived",
];

function designStatusValue(item) {
  const current = String(item?.designStatus || "").trim().toLowerCase();
  return DESIGN_STATUS_OPTIONS.find((option) => option.toLowerCase() === current) || DESIGN_STATUS_OPTIONS[0];
}

function designStatusFieldHtml(item) {
  const selected = designStatusValue(item);
  const options = DESIGN_STATUS_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(option)}</option>`
  ).join("");
  return `
    <div class="detail-field">
      <span class="detail-field__label">Design status</span>
      <select class="detail-field__select" data-design-status aria-label="Design status">${options}</select>
    </div>
  `;
}

function wireDesignStatus(item) {
  const select = els.panelBody.querySelector("[data-design-status]");
  select?.addEventListener("change", () => {
    item.designStatus = select.value;
    saveFieldOverride(item, "designStatus", select.value);
  });
}

function formatHandoffDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The picker's calendar is appended outside the panel, so the previous one has
// to go whenever the panel re-renders.
let handoffPopover = null;

function wireHandoffDate(item) {
  const root = els.panelBody.querySelector("[data-handoff-picker]");
  if (!root) return;
  const clearBtn = els.panelBody.querySelector("[data-handoff-clear]");
  const statusEl = els.panelBody.querySelector("[data-handoff-status]");

  handoffPopover?.remove();
  handoffPopover = initDatePicker(root, {
    name: `handoff-${item.id}`,
    value: item.designHandoffDate || "",
    required: false,
  });

  const save = (iso) => {
    item.designHandoffDate = iso;
    saveFieldOverride(item, "designHandoffDate", iso);
    clearBtn?.classList.toggle("hidden", !iso);
    if (statusEl) {
      statusEl.textContent = iso ? `Handoff ${formatHandoffDate(iso)} · saved in this browser` : "No handoff date set";
    }
  };

  if (statusEl) {
    statusEl.textContent = item.designHandoffDate
      ? `Handoff ${formatHandoffDate(item.designHandoffDate)} · saved in this browser`
      : "No handoff date set";
  }

  root.querySelector('input[type="hidden"]')?.addEventListener("change", (event) => {
    save(event.target.value || "");
  });

  clearBtn?.addEventListener("click", () => {
    setDatePickerValue(root, "");
    save("");
  });
}

function wirePanelEditors(item) {
  const figmaInput = els.panelBody.querySelector('[data-edit-field="figmaLinks"]');
  const prototypeInput = els.panelBody.querySelector('[data-edit-field="prototypeLinks"]');
  const designerRoot = els.panelBody.querySelector("[data-designer-picker]");
  const statusEl = els.panelBody.querySelector("[data-sheet-sync-status]");
  wireOpenLinks(els.panelBody);

  const setStatus = (message, tone = "muted") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const persistField = async (field, value) => {
    setStatus("Saving to sheet…", "pending");
    const previousDesigner = item.designer;
    if (!panelActions?.onUpdateField) {
      const message = "Save is not ready yet — refresh the page and try again.";
      setStatus(message, "error");
      panelActions?.showToast?.(message);
      return;
    }
    try {
      await panelActions.onUpdateField(item.id, field, value);
      setStatus("Saved to roadmap sheet", "ok");
    } catch (err) {
      console.error(err);
      if (field === "designer") {
        setDesignerPickerValue(pickerState, previousDesigner);
      }
      const message = err.message || "Could not save to sheet";
      setStatus(message, "error");
    }
  };

  figmaInput?.addEventListener("change", () => {
    persistField("figmaLinks", figmaInput.value.trim());
  });
  figmaInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      figmaInput.blur();
    }
  });

  prototypeInput?.addEventListener("change", () => {
    persistField("prototypeLinks", prototypeInput.value.trim());
  });
  prototypeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      prototypeInput.blur();
    }
  });

  const pickerState = mountDesignerPicker(designerRoot, {
    value: item.designer,
    options: getDesignerOptions(),
    photos: designerPhotos,
    onChange: (name) => persistField("designer", name),
  });

  wireHandoffDate(item);
  wireDesignStatus(item);

  if (panelActions?.isSheetSyncReady?.()) {
    setStatus("Changes save to the roadmap sheet", "muted");
  } else {
    setStatus("Sheet sync is not connected — see Settings for setup", "warn");
  }
}

function renderEstimateChip(item) {
  const valueEl = els.estimateValue || document.getElementById("roadmap-estimate-value");
  if (!valueEl) return;
  const estimate = item ? getSavedEstimate(item.id) : null;
  if (!estimate) {
    valueEl.textContent = "";
    valueEl.classList.add("hidden");
    return;
  }
  valueEl.textContent = estimateChipLabel(estimate);
  valueEl.classList.remove("hidden");
  valueEl.title = `${estimate.size.name} · ${estimate.size.range}`;
}

export function openRoadmapItem(id) {
  return openPanel(id);
}

function openPanel(id) {
  const item = roadmapData.items.find((i) => i.id === id);
  if (!item || !els.panel) return;
  selectedId = id;
  renderPanel(item);
  if (item.linksResolved !== true && item.linksResolved !== "error") {
    ensureItemLinks(item)
      .then(() => {
        if (selectedId === item.id) renderPanel(item);
      })
      .catch((err) => {
        item.linksResolved = "error";
        item.linksError = err.message || "Could not load sheet hyperlinks.";
        if (selectedId === item.id) renderPanel(item);
      });
  }
}

function renderPanel(item) {
  if (!item || !els.panel) return;
  const meta = stateMeta(item.state);
  els.panelTitle.textContent = item.name;
  renderEstimateChip(item);
  els.panelBody.innerHTML = `
    <section class="detail-section detail-section--editable">
      <div class="detail-top-fields">
        ${prdFieldHtml(item.prdLink, item.prdLinks)}
        <div class="detail-field detail-field--handoff">
          <div class="detail-field__label-row">
            <span class="detail-field__label">Design handoff date</span>
            <button type="button" class="detail-field__clear${item.designHandoffDate ? "" : " hidden"}" data-handoff-clear>Clear</button>
          </div>
          <div data-handoff-picker></div>
          <p class="detail-field__hint" data-handoff-status></p>
        </div>
      </div>
      ${item.linksResolved === "error" ? `<p class="detail-sheet-status" data-tone="warn">PRD/Figma URLs need the updated sheet script — see the yellow steps at the top of this tab.</p>` : ""}
      <div class="detail-top-fields">
        <div class="detail-field">
          <span class="detail-field__label">Assigned designer</span>
          <div data-designer-picker></div>
        </div>
        ${designStatusFieldHtml(item)}
      </div>
      <div class="detail-link-fields">
        <label class="detail-field${missingFigmaInProgress(item) ? " detail-field--warn" : ""}">
          <span class="detail-field__label">Figma link${missingFigmaInProgress(item) ? " · add to the roadmap sheet" : ""}</span>
          ${linkListHtml(mergeLinkItems(item.figmaLinks, item.figmaHrefs))}
          ${linkInputHtml({
            field: "figmaLinks",
            inputValue: figmaDisplayValue(item.figmaLinks),
            href: firstLinkHref(item.figmaLinks, item.figmaHrefs),
            placeholder: "https://figma.com/file/…",
          })}
        </label>
        <label class="detail-field">
          <span class="detail-field__label">Prototype link</span>
          ${linkListHtml(mergeLinkItems(item.prototypeLinks, item.prototypeHrefs))}
          ${linkInputHtml({
            field: "prototypeLinks",
            inputValue: figmaDisplayValue(item.prototypeLinks),
            href: firstLinkHref(item.prototypeLinks, item.prototypeHrefs),
          })}
        </label>
      </div>
      <p class="detail-sheet-status" data-sheet-sync-status data-tone="muted"></p>
    </section>

    <section class="detail-section detail-section--subtasks detail-section--subtasks-top">
      <div class="detail-section__head detail-section__head--subtasks">
        <h4>Subtasks</h4>
        <div class="detail-subtask-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-panel-add="${escapeHtml(item.id)}">+ Subtask</button>
          <button type="button" class="btn btn--primary btn--sm" data-panel-generate="${escapeHtml(item.id)}">Generate subtasks</button>
        </div>
      </div>
      <div class="panel-subtasks"></div>
    </section>

    <div class="detail-hero">
      <span class="state-pill state-pill--${meta.tone}">${meta.label}</span>
      <span class="detail-hero__designer">
        ${designerAvatarHtml(item.designer)}
        <span>${escapeHtml(item.designer)}</span>
      </span>
    </div>

    <section class="detail-section">
      <h4>Description</h4>
      <p class="detail-copy">${escapeHtml(item.description || "No description provided.")}</p>
    </section>

    <section class="detail-section">
      <h4>Latest status</h4>
      <p class="detail-copy">${escapeHtml(item.status || "No status update yet.")}</p>
      ${item.statusUpdated ? `<p class="detail-meta">Updated ${escapeHtml(item.statusUpdated)}</p>` : ""}
    </section>

    <section class="detail-section">
      <h4>People</h4>
      <dl class="detail-list">
        ${detailRow("Product manager", item.productManager)}
        ${detailRow("Engineering manager", item.engineeringManager)}
        ${detailRow("Analytics lead", item.analyticsLead)}
        ${detailRow("Eng team", item.engTeam)}
      </dl>
    </section>

    <section class="detail-section">
      <h4>Timeline</h4>
      <dl class="detail-list">
        ${detailRow("Expected quarter", item.expectedLaunchQuarter)}
        ${detailRow("Expected month", item.expectedLaunchMonth)}
        ${detailRow("Launch date", item.launchDate)}
        ${detailRow("Priority", item.priority)}
        ${detailRow("Launch compass", item.launchCompass)}
      </dl>
    </section>

    <section class="detail-section">
      <h4>Strategy</h4>
      <dl class="detail-list">
        ${detailRow("L2", item.l2)}
        ${detailRow("Success metric", item.successMetric)}
      </dl>
    </section>

    <section class="detail-section">
      <h4>Links</h4>
      <dl class="detail-list">
        ${detailLink("Jira / plan", item.jiraLink, item.jiraLinks, { jira: true })}
        ${roadmapData?.sheetUrl ? detailLink("Roadmap sheet (source of truth)", roadmapData.sheetUrl) : ""}
      </dl>
    </section>
  `;

  els.panel.classList.add("is-open");
  els.panel.setAttribute("aria-hidden", "false");

  wirePanelEditors(item);

  const subtaskRoot = els.panelBody.querySelector(".panel-subtasks");
  try {
    panelActions?.renderSubtasks?.(subtaskRoot, item.id);
  } catch (err) {
    console.error("Could not render subtasks in panel", err);
  }

  els.panelBody.querySelector(`[data-panel-add="${CSS.escape(item.id)}"]`)?.addEventListener("click", () => {
    panelActions?.onAddSubtask?.(item.id);
  });
  els.panelBody.querySelector(`[data-panel-generate="${CSS.escape(item.id)}"]`)?.addEventListener("click", (e) => {
    panelActions?.onGenerateSubtasks?.(item.id, e.currentTarget);
  });

  renderGrid();
}

function closePanel() {
  selectedId = null;
  els.panel?.classList.remove("is-open");
  els.panel?.setAttribute("aria-hidden", "true");
  renderGrid();
}

async function loadRoadmap() {
  const res = await fetch("./roadmap-q3.json");
  if (!res.ok) throw new Error("Could not load roadmap-q3.json");
  return res.json();
}

async function loadDesignerPhotos() {
  try {
    const res = await fetch("./designer-photos.json");
    if (!res.ok) return {};
    const data = await res.json();
    return data.photos || {};
  } catch {
    return {};
  }
}

export async function initRoadmap(dom) {
  els.grid = dom.grid;
  els.panel = dom.panel;
  els.scrim = dom.scrim;
  els.panelBody = dom.panelBody;
  els.panelTitle = dom.panelTitle;
  els.panelClose = dom.panelClose;
  els.estimateBtn = dom.estimateBtn;
  els.estimateValue = document.getElementById("roadmap-estimate-value");
  els.count = dom.count;
  els.filters = dom.filters;
  els.subtitle = dom.subtitle;
  els.sourceLink = dom.sourceLink;

  dom.panelClose?.addEventListener("click", closePanel);
  dom.estimateBtn?.addEventListener("click", () => {
    const item = selectedId ? getRoadmapItem(selectedId) : null;
    if (item) openDesignEstimator(item);
  });
  dom.scrim?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectedId) closePanel();
  });

  [roadmapData, designerPhotos] = await Promise.all([loadRoadmap(), loadDesignerPhotos()]);
  applyFieldOverrides();
  applyCachedHyperlinks();
  if (dom.designerName) activeDesigner = designerFilterValue(dom.designerName);
  const sheetUrl = roadmapData.sourceOfTruth || roadmapData.sheetUrl;
  if (els.subtitle) {
    els.subtitle.textContent = roadmapData.syncedAt ? `Synced ${formatSyncedDate(roadmapData.syncedAt)}` : "";
  }
  if (els.sourceLink && sheetUrl) {
    els.sourceLink.href = sheetUrl;
    els.sourceLink.classList.remove("hidden");
  }
  renderFilters();
  renderGrid();
  refreshLiveSheetLinks();
  document.addEventListener("plg-estimate-saved", (event) => {
    if (selectedId && event.detail?.projectId === selectedId) {
      const item = getRoadmapItem(selectedId);
      if (item) renderEstimateChip(item);
    }
  });
}

export function refreshAfterRoadmapFieldSave(field, item) {
  if (!roadmapData || !item) return;

  if (field === "designer") {
    if (activeDesigner !== "all" && item.designer !== activeDesigner) {
      activeDesigner = item.designer === "Unassigned" || item.designer === "N/A" ? "all" : item.designer;
    }
    renderFilters();
  }

  renderGrid();

  if (selectedId === item.id) {
    refreshRoadmapPanel();
  }
}

export function refreshRoadmapView({ refreshFilters = false } = {}) {
  if (!roadmapData) return;
  if (refreshFilters) renderFilters();
  renderGrid();
}

export function resetSheetLinkState() {
  if (!roadmapData?.items) return;
  for (const item of roadmapData.items) {
    item.linksResolved = undefined;
    item.linksError = "";
    item._linksPromise = null;
  }
}

export function getProjectsForDesigner(designerName) {
  if (!roadmapData || !designerName) return [];
  return sortProjectsByState(
    roadmapData.items.filter(
      (item) => item.designer === designerName && item.designer !== "Unassigned" && item.designer !== "N/A"
    )
  );
}

export function getRoadmapData() {
  return roadmapData;
}

export function getRoadmapItem(id) {
  return roadmapData?.items.find((i) => i.id === id) || null;
}

export function updateRoadmapItemLocal(id, patch) {
  const item = getRoadmapItem(id);
  if (!item) return null;
  Object.assign(item, patch);
  return item;
}

export function getRoadmapDesignerPhotos() {
  return designerPhotos;
}
