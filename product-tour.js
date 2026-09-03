const TOUR_KEY = "plg-focus-quest-tour-v1";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to Focus Quest",
    body: "This is the PLG design workboard — today’s focus, your initiatives, and a light bit of squad competition. This tour takes about a minute.",
  },
  {
    id: "identity",
    title: "Start with who you are",
    body: "Open Settings and pick your name under I am. That loads your initiatives and credits completions to you on the leaderboard.",
    target: "#tour-identity",
    view: "settings",
  },
  {
    id: "hud",
    title: "Rank, XP, and streak",
    body: "Checking off quests earns XP and builds a daily streak. Rank is your lifetime level in this browser.",
    target: "#hud-stats",
    view: "tasks",
  },
  {
    id: "nav",
    title: "Two home screens",
    body: "My Tasks is your run for the week. PLG Roadmap is the shared initiative board from the source-of-truth sheet.",
    target: "#hud-nav",
    view: "tasks",
  },
  {
    id: "today",
    title: "Today's run",
    body: "This is the focus list. Incomplete quests from earlier days land here automatically. Use + in the header to add a personal quest.",
    target: "#tour-today-head",
    view: "tasks",
    mode: "work",
  },
  {
    id: "projects",
    title: "Initiatives and subtasks",
    body: "Your roadmap work lives here. Generate a review plan, add a subtask, or open Estimate — those choices also shape generated subtasks.",
    target: "#tour-projects-head",
    view: "tasks",
    mode: "work",
  },
  {
    id: "board",
    title: "Squad board",
    body: "This week ranks designers by tasks finished and resets Monday. Lifetime XP never resets. Completions count for whoever is selected in I am.",
    target: "#panel-leaderboard",
    highlight: "full",
    view: "tasks",
  },
  {
    id: "roadmap",
    title: "PLG Roadmap",
    body: "Filter the team board, open an initiative for PRD and Figma, then Estimate or Generate subtasks. Designer and Figma edits can write back to the sheet.",
    target: "#tour-roadmap-board",
    highlight: "full",
    view: "roadmap",
  },
];

let hooks = null;
let stepIndex = 0;
let root = null;
let positionTimer = 0;

export function hasCompletedTour() {
  return localStorage.getItem(TOUR_KEY) === "done";
}

export function markTourComplete() {
  localStorage.setItem(TOUR_KEY, "done");
}

function ensureRoot() {
  if (root) return root;
  root = document.createElement("div");
  root.id = "product-tour";
  root.className = "tour hidden";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="tour__scrim" data-tour-scrim></div>
    <div class="tour__spot" data-tour-spot hidden></div>
    <div class="tour__card" role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body">
      <p class="tour__eyebrow" data-tour-step></p>
      <h3 id="tour-title" data-tour-title></h3>
      <p id="tour-body" data-tour-body></p>
      <div class="tour__actions">
        <button type="button" class="btn btn--ghost" data-tour-skip>Skip</button>
        <span class="tour__actions-spacer"></span>
        <button type="button" class="btn btn--ghost" data-tour-back>Back</button>
        <button type="button" class="btn btn--primary" data-tour-next>Next</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  root.querySelector("[data-tour-skip]").addEventListener("click", finishTour);
  root.querySelector("[data-tour-back]").addEventListener("click", () => go(-1));
  root.querySelector("[data-tour-next]").addEventListener("click", () => go(1));
  return root;
}

function currentStep() {
  return STEPS[stepIndex];
}

function go(delta) {
  const next = stepIndex + delta;
  if (next < 0) return;
  if (next >= STEPS.length) {
    finishTour();
    return;
  }
  stepIndex = next;
  renderStep();
}

function finishTour() {
  markTourComplete();
  if (hooks?.setView) hooks.setView("tasks");
  if (hooks?.setWorkMode) hooks.setWorkMode("work");
  if (hooks?.render) hooks.render();
  hideTour();
}

function hideTour() {
  if (!root) return;
  clearTimeout(positionTimer);
  root.classList.add("hidden");
  root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tour-active");
  document.removeEventListener("keydown", onKey);
  document.removeEventListener("click", onPageInteract, true);
  document.removeEventListener("input", onPageInteract, true);
  document.removeEventListener("change", onPageInteract, true);
  window.removeEventListener("resize", positionHighlight);
  window.removeEventListener("scroll", positionHighlight, true);
}

function onPageInteract(event) {
  if (!root || root.classList.contains("hidden")) return;
  if (event.target?.closest?.(".tour__card")) return;
  afterLayout(() => {
    positionHighlight();
    clearTimeout(positionTimer);
    positionTimer = window.setTimeout(positionHighlight, 80);
  });
}

function onKey(event) {
  const inTour = Boolean(event.target?.closest?.(".tour__card"));
  if (event.key === "Escape" && inTour) {
    event.preventDefault();
    finishTour();
    return;
  }
  if (!inTour) return;
  if (event.key === "ArrowRight" || event.key === "Enter") {
    event.preventDefault();
    go(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    go(-1);
  }
}

function prepareStep(step) {
  if (step.view && hooks?.setView) hooks.setView(step.view);
  if (step.mode && hooks?.setWorkMode) hooks.setWorkMode(step.mode);
  if (hooks?.render) hooks.render();
}

function afterLayout(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function placeCard(card, spotRect) {
  const pad = 16;
  const cardW = card.offsetWidth;
  const cardH = card.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top;
  let left;

  if (!spotRect) {
    top = Math.max(pad, (vh - cardH) / 2);
    left = Math.max(pad, (vw - cardW) / 2);
    card.style.top = `${Math.round(top)}px`;
    card.style.left = `${Math.round(left)}px`;
    return;
  }

  const below = vh - spotRect.bottom - pad;
  const above = spotRect.top - pad;
  const right = vw - spotRect.right - pad;
  const leftSpace = spotRect.left - pad;

  if (below >= cardH + 8) {
    top = spotRect.bottom + 12;
    left = clamp(spotRect.left, pad, vw - cardW - pad);
  } else if (leftSpace >= cardW + 8) {
    left = spotRect.left - cardW - 12;
    top = clamp(spotRect.top, pad, vh - cardH - pad);
  } else if (right >= cardW + 8) {
    left = spotRect.right + 12;
    top = clamp(spotRect.top, pad, vh - cardH - pad);
  } else if (above >= cardH + 8) {
    top = spotRect.top - cardH - 12;
    left = clamp(spotRect.left, pad, vw - cardW - pad);
  } else {
    top = clamp(spotRect.bottom + 12, pad, Math.max(pad, vh - cardH - pad));
    left = clamp(pad, pad, vw - cardW - pad);
  }

  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
}

function hudOffset() {
  const hud = document.querySelector(".hud");
  return hud ? Math.ceil(hud.getBoundingClientRect().height) + 12 : 88;
}

function positionHighlight() {
  if (!root || root.classList.contains("hidden")) return;
  const step = currentStep();
  const card = root.querySelector(".tour__card");
  const spot = root.querySelector("[data-tour-spot]");
  const scrim = root.querySelector("[data-tour-scrim]");
  const target = step.target ? document.querySelector(step.target) : null;

  if (!target) {
    spot.hidden = true;
    scrim.classList.remove("tour__scrim--clear");
    placeCard(card, null);
    return;
  }

  const rect = target.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) {
    spot.hidden = true;
    scrim.classList.remove("tour__scrim--clear");
    placeCard(card, null);
    return;
  }

  const padding = 6;
  const top = Math.round(rect.top - padding);
  const left = Math.round(rect.left - padding);
  const width = Math.round(rect.width + padding * 2);
  const maxHeight = step.highlight === "full"
    ? window.innerHeight - Math.max(8, top) - 8
    : window.innerHeight * 0.55;
  const height = Math.round(Math.min(rect.height + padding * 2, maxHeight));

  spot.hidden = false;
  scrim.classList.add("tour__scrim--clear");
  spot.style.top = `${top}px`;
  spot.style.left = `${left}px`;
  spot.style.width = `${width}px`;
  spot.style.height = `${height}px`;
  placeCard(card, { top, left, bottom: top + height, right: left + width });
}

function scrollTargetIntoView(target) {
  const margin = hudOffset();
  target.style.scrollMarginTop = `${margin}px`;
  target.style.scrollMarginBottom = "24px";
  target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
}

function renderStep() {
  if (!root || root.classList.contains("hidden")) return;
  const step = currentStep();
  prepareStep(step);

  const card = root.querySelector(".tour__card");
  const spot = root.querySelector("[data-tour-spot]");
  const nextBtn = root.querySelector("[data-tour-next]");
  const backBtn = root.querySelector("[data-tour-back]");
  root.querySelector("[data-tour-step]").textContent = `${stepIndex + 1} / ${STEPS.length}`;
  root.querySelector("[data-tour-title]").textContent = step.title;
  root.querySelector("[data-tour-body]").textContent = step.body;
  backBtn.disabled = stepIndex === 0;
  nextBtn.textContent = stepIndex === STEPS.length - 1 ? "Let’s go" : "Next";
  spot.hidden = true;

  const layout = () => {
    const target = step.target ? document.querySelector(step.target) : null;
    if (target) scrollTargetIntoView(target);
    afterLayout(() => {
      positionHighlight();
      clearTimeout(positionTimer);
      positionTimer = window.setTimeout(positionHighlight, 60);
    });
  };

  afterLayout(layout);
}

export function startProductTour(nextHooks) {
  hooks = nextHooks || {};
  ensureRoot();
  stepIndex = 0;
  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  document.body.classList.add("tour-active");
  document.addEventListener("keydown", onKey);
  document.addEventListener("click", onPageInteract, true);
  document.addEventListener("input", onPageInteract, true);
  document.addEventListener("change", onPageInteract, true);
  window.addEventListener("resize", positionHighlight);
  window.addEventListener("scroll", positionHighlight, true);
  renderStep();
  root.querySelector("[data-tour-next]")?.focus();
}

export function maybeStartProductTour(nextHooks) {
  if (hasCompletedTour()) return;
  startProductTour(nextHooks);
}
