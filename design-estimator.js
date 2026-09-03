const STORAGE_KEY = "plg-focus-quest-estimates";

const COMPLEXITY_OPTIONS = ["Low", "Medium", "High", "Very High"];
const AMBIGUITY_OPTIONS = ["Well-defined", "Some unknowns", "Ambiguous", "Highly ambiguous"];
const ALIGNMENT_OPTIONS = ["Aligned", "Mostly aligned", "Misaligned"];
const CONTENT_OPTIONS = ["Few strings", "Full flow", "Strategy"];

const PARAM_INFO = {
  complexity: {
    summary: "Sets the base design effort for the project.",
    rows: [
      { label: "Low", weight: "+0.5 weeks" },
      { label: "Medium", weight: "+1.5 weeks" },
      { label: "High", weight: "+3 weeks" },
      { label: "Very High", weight: "+5 weeks" },
    ],
  },
  ambiguity: {
    summary: "Adds discovery and iteration time when scope is unclear.",
    rows: [
      { label: "Well-defined", weight: "+0 weeks" },
      { label: "Some unknowns", weight: "+1 week" },
      { label: "Ambiguous", weight: "+2 weeks" },
      { label: "Highly ambiguous", weight: "+3 weeks" },
    ],
  },
  alignment: {
    summary: "Misaligned stakeholders add review and rework cycles.",
    rows: [
      { label: "Aligned", weight: "+0 weeks" },
      { label: "Mostly aligned", weight: "+0.5 weeks" },
      { label: "Misaligned", weight: "+1.5 weeks" },
    ],
  },
  userTesting: {
    summary: "Designer runs their own usability sessions and prototype tests.",
    rows: [
      { label: "Off", weight: "+0 weeks" },
      { label: "On", weight: "+2 weeks" },
    ],
  },
  research: {
    summary: "Requires dedicated UXR resourcing for the study and synthesis.",
    rows: [
      { label: "Off", weight: "+0 weeks" },
      { label: "On", weight: "+4 weeks" },
    ],
  },
  designSystem: {
    summary: "An existing design system speeds up delivery.",
    rows: [
      { label: "Available", weight: "+0 weeks" },
      { label: "Not available", weight: "+1 week" },
    ],
  },
  contentDesign: {
    summary: "Scope of content design work required for the project.",
    rows: [
      { label: "Few strings — quick review, 2–4 strings (2 days)", weight: "+0.5 weeks" },
      { label: "Full flow — multi-screen journey/states (3 days–1 week)", weight: "+1 week" },
      { label: "Strategy — content-first experiences, frameworks, narrative, naming, terminology (1.5–2 weeks)", weight: "+1.75 weeks" },
    ],
  },
  experiment: {
    summary:
      "A/B or multivariate experiment adds setup, instrumentation, and analysis time. Each variant beyond the first adds design effort.",
    rows: [
      { label: "Off", weight: "+0 weeks" },
      { label: "On (base)", weight: "+1 week" },
      { label: "Each variant beyond 2", weight: "+0.5 weeks" },
      { label: "Maximum (5 variants)", weight: "+2.5 weeks" },
    ],
  },
};

const SIZE_KEY = [
  { letter: "XS", name: "Extra Small", range: "1–5 days", maxWeeks: 1 },
  { letter: "S", name: "Small", range: "6–10 days", maxWeeks: 2 },
  { letter: "M", name: "Medium", range: "2–4 weeks", maxWeeks: 4 },
  { letter: "L", name: "Large", range: "4–8 weeks", maxWeeks: 8 },
  { letter: "XL", name: "Extra Large", range: "8–12 weeks", maxWeeks: Infinity },
];

const DEFAULT_INPUTS = {
  complexity: "Low",
  ambiguity: "Well-defined",
  alignment: "Aligned",
  contentDesign: "Few strings",
  userTesting: false,
  research: false,
  designSystem: true,
  experiment: false,
  experimentVariants: 2,
};

function loadAllEstimates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEstimate(projectId, inputs) {
  const all = loadAllEstimates();
  all[projectId] = inputs;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  document.dispatchEvent(new CustomEvent("plg-estimate-saved", { detail: { projectId } }));
}

function loadEstimate(projectId) {
  const all = loadAllEstimates();
  const saved = all[projectId];
  if (!saved || saved.surface !== undefined) return { ...DEFAULT_INPUTS };
  return { ...DEFAULT_INPUTS, ...saved };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWeeks(value) {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function formatSprints(weeks) {
  const sprints = Math.round((weeks / 2) * 10) / 10;
  const label = sprints === 1 ? "sprint" : "sprints";
  const text = sprints % 1 === 0 ? String(sprints) : sprints.toFixed(1);
  return `${text} ${label}`;
}

function sizeFromWeeks(weeks) {
  return SIZE_KEY.find((entry) => weeks <= entry.maxWeeks) || SIZE_KEY[SIZE_KEY.length - 1];
}

export function calculateEstimate(inputs) {
  const breakdown = [];

  const complexityPts = { Low: 0.5, Medium: 1.5, High: 3, "Very High": 5 }[inputs.complexity] ?? 0;
  breakdown.push({ label: `${inputs.complexity} complexity`, pts: complexityPts });

  const ambiguityPts = {
    "Well-defined": 0,
    "Some unknowns": 1,
    Ambiguous: 2,
    "Highly ambiguous": 3,
  }[inputs.ambiguity] ?? 0;
  if (ambiguityPts > 0) breakdown.push({ label: `${inputs.ambiguity} scope`, pts: ambiguityPts });

  if (inputs.userTesting) breakdown.push({ label: "User testing required", pts: 2 });
  if (inputs.research) breakdown.push({ label: "Research study required", pts: 4 });

  const alignmentPts = { Aligned: 0, "Mostly aligned": 0.5, Misaligned: 1.5 }[inputs.alignment] ?? 0;
  if (alignmentPts > 0) breakdown.push({ label: `${inputs.alignment} stakeholders`, pts: alignmentPts });

  if (!inputs.designSystem) breakdown.push({ label: "No design system", pts: 1 });

  if (inputs.experiment) {
    const variants = Math.min(5, Math.max(2, Number(inputs.experimentVariants) || 2));
    const pts = 1 + (variants - 2) * 0.5;
    breakdown.push({ label: `Experiment · ${variants} variants`, pts });
  }

  const contentPts = { "Few strings": 0.5, "Full flow": 1, Strategy: 1.75 }[inputs.contentDesign] ?? 0;
  if (contentPts > 0) breakdown.push({ label: `${inputs.contentDesign} content design`, pts: contentPts });

  const totalWeeks = breakdown.reduce((sum, item) => sum + item.pts, 0);
  const size = sizeFromWeeks(totalWeeks);
  const summary = buildSummary(breakdown, size.letter);

  return { breakdown, totalWeeks, size, summary };
}

export function getSavedEstimate(projectId) {
  if (!projectId) return null;
  const all = loadAllEstimates();
  const saved = all[projectId];
  if (!saved || saved.surface !== undefined) return null;
  const inputs = { ...DEFAULT_INPUTS, ...saved };
  return { inputs, ...calculateEstimate(inputs) };
}

export function estimateChipLabel(estimate) {
  if (!estimate?.size) return "";
  const weeks = estimate.totalWeeks % 1 === 0 ? String(estimate.totalWeeks) : estimate.totalWeeks.toFixed(1);
  return `${estimate.size.letter} · ${weeks}w`;
}

function sentenceCase(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function buildSummary(breakdown, sizeLetter) {
  if (breakdown.length === 0) return `No contributing factors yet for ${sizeLetter}.`;
  const ranked = [...breakdown].sort((a, b) => b.pts - a.pts);
  const formatLabel = (text, index) => {
    if (index === 0) return sentenceCase(text);
    return text.charAt(0).toLowerCase() + text.slice(1);
  };
  const picks = ranked.slice(0, 2).map((item, index) => formatLabel(item.label, index));
  const lead = picks.length === 1 ? picks[0] : `${picks[0]} and ${picks[1]}`;
  return `${lead} pushed this to ${sizeLetter}.`;
}

function infoPopoverHtml(key, label) {
  const info = PARAM_INFO[key];
  if (!info) return "";
  const rows = info.rows
    .map(
      (row) =>
        `<li><span class="estimator-info-popover__label">${escapeHtml(row.label)}</span><span class="estimator-info-popover__weight">${escapeHtml(row.weight)}</span></li>`
    )
    .join("");
  return `
    <div class="estimator-info-wrap">
      <button type="button" class="estimator-info-btn" data-info-key="${key}" aria-label="How ${escapeHtml(label)} is weighted" aria-expanded="false">
        <span aria-hidden="true">i</span>
      </button>
      <div class="estimator-info-popover" data-info-popover="${key}" hidden>
        <p class="estimator-info-popover__title">${escapeHtml(label)}</p>
        <p class="estimator-info-popover__summary">${escapeHtml(info.summary)}</p>
        <ul class="estimator-info-popover__list">${rows}</ul>
      </div>
    </div>
  `;
}

function radioGroupHtml(name, options, value) {
  return `
    <div class="estimator-segment" role="radiogroup" aria-label="${escapeHtml(name)}">
      ${options
        .map(
          (option) => `
            <button
              type="button"
              class="estimator-segment__btn${option === value ? " is-active" : ""}"
              data-field="${name}"
              data-value="${escapeHtml(option)}"
              role="radio"
              aria-checked="${option === value ? "true" : "false"}"
            >${escapeHtml(option)}</button>
          `
        )
        .join("")}
    </div>
  `;
}

function toggleRowHtml(key, label, checked) {
  return `
    <div class="estimator-field estimator-field--toggle">
      <div class="estimator-field__head">
        <span class="estimator-field__label">${escapeHtml(label)}</span>
        ${infoPopoverHtml(key, label)}
      </div>
      <label class="estimator-switch">
        <input type="checkbox" data-field="${key}"${checked ? " checked" : ""} />
        <span class="estimator-switch__track" aria-hidden="true"></span>
      </label>
    </div>
  `;
}

function renderResult(root, inputs) {
  const result = calculateEstimate(inputs);
  const resultEl = root.querySelector("[data-estimator-result]");
  if (!resultEl) return;

  const breakdownItems =
    result.breakdown.length === 0
      ? `<li class="estimator-breakdown__empty">No contributing factors yet.</li>`
      : result.breakdown
          .map(
            (item) => `
              <li>
                <span>${escapeHtml(item.label)}</span>
                <span>+${formatWeeks(item.pts)}w</span>
              </li>
            `
          )
          .join("");

  const sizeKey = SIZE_KEY.map(
    (entry) => `
      <li class="estimator-size-key__item${entry.letter === result.size.letter ? " is-active" : ""}">
        <span class="estimator-size-key__letter">${entry.letter}</span>
        <span class="estimator-size-key__meta">
          <span class="estimator-size-key__name">${entry.name}</span>
          <span class="estimator-size-key__range">${entry.range}</span>
        </span>
      </li>
    `
  ).join("");

  resultEl.innerHTML = `
    <article class="estimator-card estimator-card--result">
      <div class="estimator-result__head">
        <p class="estimator-result__eyebrow">Estimated effort</p>
        <h3 class="estimator-result__title">${escapeHtml(result.size.name)}</h3>
      </div>
      <div class="estimator-result__body">
        <div class="estimator-result__badge estimator-result__badge--${result.size.letter.toLowerCase()}">${result.size.letter}</div>
        <p class="estimator-result__range">${escapeHtml(result.size.range)}</p>
        <p class="estimator-result__summary">${escapeHtml(result.summary)}</p>
        <div class="estimator-breakdown">
          <p class="estimator-breakdown__head">
            Effort breakdown · ${formatWeeks(result.totalWeeks)} weeks
            <span class="estimator-breakdown__sprints">(${formatSprints(result.totalWeeks)})</span>
          </p>
          <ul class="estimator-breakdown__list">${breakdownItems}</ul>
        </div>
      </div>
    </article>
    <article class="estimator-card estimator-card--size-key">
      <div class="estimator-size-key__head">
        <h3>Size key</h3>
        <p>Reference ranges for each t-shirt size.</p>
      </div>
      <ul class="estimator-size-key__list">${sizeKey}</ul>
    </article>
  `;
}

function renderParameters(root, inputs) {
  const paramsEl = root.querySelector("[data-estimator-params]");
  if (!paramsEl) return;

  paramsEl.innerHTML = `
    <article class="estimator-card estimator-card--params">
      <div class="estimator-params__head">
        <h3>Project parameters</h3>
        <p>Tune these to match the work in front of you.</p>
      </div>
      <div class="estimator-params__fields">
        <div class="estimator-field">
          <div class="estimator-field__head">
            <span class="estimator-field__label">Complexity</span>
            ${infoPopoverHtml("complexity", "Complexity")}
          </div>
          ${radioGroupHtml("complexity", COMPLEXITY_OPTIONS, inputs.complexity)}
        </div>
        <div class="estimator-field">
          <div class="estimator-field__head">
            <span class="estimator-field__label">Ambiguity</span>
            ${infoPopoverHtml("ambiguity", "Ambiguity")}
          </div>
          ${radioGroupHtml("ambiguity", AMBIGUITY_OPTIONS, inputs.ambiguity)}
        </div>
        <div class="estimator-field">
          <div class="estimator-field__head">
            <span class="estimator-field__label">Stakeholder alignment</span>
            ${infoPopoverHtml("alignment", "Stakeholder alignment")}
          </div>
          ${radioGroupHtml("alignment", ALIGNMENT_OPTIONS, inputs.alignment)}
        </div>
        <div class="estimator-field">
          <div class="estimator-field__head">
            <span class="estimator-field__label">Content design</span>
            ${infoPopoverHtml("contentDesign", "Content design")}
          </div>
          ${radioGroupHtml("contentDesign", CONTENT_OPTIONS, inputs.contentDesign)}
        </div>
        ${toggleRowHtml("userTesting", "User testing required", inputs.userTesting)}
        ${toggleRowHtml("research", "Research study required", inputs.research)}
        ${toggleRowHtml("designSystem", "Design system available", inputs.designSystem)}
        ${toggleRowHtml("experiment", "Experiment", inputs.experiment)}
        <div class="estimator-field estimator-field--variants${inputs.experiment ? "" : " hidden"}" data-variants-row>
          <span class="estimator-field__label">Variants</span>
          <input
            class="estimator-field__number"
            type="number"
            min="2"
            max="5"
            step="1"
            data-field="experimentVariants"
            value="${Number(inputs.experimentVariants) || 2}"
          />
        </div>
      </div>
    </article>
  `;
}

function wireInfoPopovers(root) {
  root.querySelectorAll(".estimator-info-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const key = btn.getAttribute("data-info-key");
      const panel = root.querySelector(`[data-info-popover="${key}"]`);
      if (!panel) return;
      const willOpen = panel.hidden;
      root.querySelectorAll(".estimator-info-popover").forEach((openPanel) => {
        openPanel.hidden = true;
      });
      root.querySelectorAll(".estimator-info-btn").forEach((openBtn) => {
        openBtn.setAttribute("aria-expanded", "false");
      });
      panel.hidden = !willOpen;
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  });
}

function wireParameters(root, inputs, onChange) {
  root.querySelectorAll(".estimator-segment__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.getAttribute("data-field");
      const value = btn.getAttribute("data-value");
      if (!field || value == null) return;
      inputs[field] = value;
      onChange(inputs);
      renderParameters(root, inputs);
      wireParameters(root, inputs, onChange);
      wireInfoPopovers(root);
    });
  });

  root.querySelectorAll('[data-field="userTesting"], [data-field="research"], [data-field="designSystem"], [data-field="experiment"]').forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.getAttribute("data-field");
      inputs[field] = input.checked;
      onChange(inputs);
      renderParameters(root, inputs);
      wireParameters(root, inputs, onChange);
      wireInfoPopovers(root);
    });
  });

  root.querySelector('[data-field="experimentVariants"]')?.addEventListener("change", (event) => {
    const value = Math.min(5, Math.max(2, Number(event.target.value) || 2));
    inputs.experimentVariants = value;
    event.target.value = String(value);
    onChange(inputs);
    renderResult(root, inputs);
  });
}

export function mountDesignEstimator(root, project) {
  if (!root || !project) return;
  const inputs = loadEstimate(project.id);

  const onChange = (next) => {
    saveEstimate(project.id, next);
    renderResult(root, next);
  };

  root.innerHTML = `
    <div class="estimator-intro">
      <p class="panel__eyebrow">Design Ops · Quarterly Planning</p>
      <p class="estimator-intro__lead">Ballpark t-shirt size estimates for UX &amp; product design projects. Adjust the inputs — the result updates instantly.</p>
    </div>
    <div class="estimator-layout">
      <div data-estimator-params></div>
      <div class="estimator-layout__result" data-estimator-result></div>
    </div>
  `;

  renderParameters(root, inputs);
  renderResult(root, inputs);
  wireParameters(root, inputs, onChange);
  wireInfoPopovers(root);

  root.addEventListener("click", () => {
    root.querySelectorAll(".estimator-info-popover").forEach((panel) => {
      panel.hidden = true;
    });
    root.querySelectorAll(".estimator-info-btn").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  });
}

let dialogEls = null;

export function initDesignEstimatorDialog(dom) {
  dialogEls = dom;
  dom.closeBtn?.addEventListener("click", () => dom.dialog?.close());
}

export function openDesignEstimator(project) {
  if (!dialogEls?.dialog || !project) return;
  if (dialogEls.projectName) dialogEls.projectName.textContent = project.name;
  mountDesignEstimator(dialogEls.root, project);
  dialogEls.dialog.showModal();
}
