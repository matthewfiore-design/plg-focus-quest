const STATE_META = {
  "1. planned": { label: "Planned", tone: "muted" },
  "2. definition / discovery": { label: "Discovery", tone: "warn" },
  "3. design": { label: "Design", tone: "design" },
  "4. development": { label: "Development", tone: "dev" },
  "5. staging": { label: "Staging", tone: "staging" },
  "6. launched": { label: "Launched", tone: "done" },
};

const els = {
  grid: null,
  panel: null,
  scrim: null,
  panelBody: null,
  panelTitle: null,
  panelClose: null,
  count: null,
  filters: null,
  subtitle: null,
  sourceLink: null,
};

let roadmapData = null;
let activeDesigner = "all";
let selectedId = null;

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

function truncate(text, max = 140) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function linkOrText(value) {
  const v = (value || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    return { href: v, label: "Open link" };
  }
  return { href: null, label: v };
}

function renderFilters() {
  if (!els.filters || !roadmapData) return;
  els.filters.innerHTML = "";

  const designers = ["all", ...new Set(roadmapData.items.map((i) => i.designer))].sort((a, b) => {
    if (a === "all") return -1;
    if (b === "all") return 1;
    return a.localeCompare(b);
  });

  designers.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip";
    if (name === activeDesigner) btn.classList.add("is-active");
    btn.textContent = name === "all" ? "All designers" : name;
    btn.addEventListener("click", () => {
      activeDesigner = name;
      renderFilters();
      renderGrid();
    });
    els.filters.appendChild(btn);
  });
}

function renderGrid() {
  if (!els.grid || !roadmapData) return;

  const items = roadmapData.items.filter(
    (item) => activeDesigner === "all" || item.designer === activeDesigner
  );

  if (els.count) {
    els.count.textContent = `${items.length} Q3 initiative${items.length === 1 ? "" : "s"}`;
  }

  els.grid.innerHTML = "";
  if (!items.length) {
    els.grid.innerHTML = `<p class="roadmap-empty">No roadmap items for this filter.</p>`;
    return;
  }

  items.forEach((item) => {
    const meta = stateMeta(item.state);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "roadmap-card";
    if (selectedId === item.id) card.classList.add("is-selected");
    card.innerHTML = `
      <div class="roadmap-card__top">
        <span class="state-pill state-pill--${meta.tone}">${meta.label}</span>
        <span class="roadmap-card__team">${item.engTeam || ""}</span>
      </div>
      <h3 class="roadmap-card__title">${escapeHtml(item.name)}</h3>
      <p class="roadmap-card__desc">${escapeHtml(truncate(item.description))}</p>
      <div class="roadmap-card__footer">
        <span class="designer-chip">
          <span class="designer-chip__avatar">${designerInitials(item.designer)}</span>
          <span>${escapeHtml(item.designer)}</span>
        </span>
      </div>
    `;
    card.addEventListener("click", () => openPanel(item.id));
    els.grid.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function detailLink(label, value) {
  const link = linkOrText(value);
  if (!link) return "";
  if (link.href) {
    return `
      <div class="detail-row">
        <dt>${escapeHtml(label)}</dt>
        <dd><a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a></dd>
      </div>
    `;
  }
  return detailRow(label, link.label);
}

function openPanel(id) {
  const item = roadmapData.items.find((i) => i.id === id);
  if (!item || !els.panel) return;
  selectedId = id;
  renderGrid();

  const meta = stateMeta(item.state);
  els.panelTitle.textContent = item.name;
  els.panelBody.innerHTML = `
    <div class="detail-hero">
      <span class="state-pill state-pill--${meta.tone}">${meta.label}</span>
      <span class="detail-hero__designer">${escapeHtml(item.designer)}</span>
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
        ${detailRow("Designer", item.designer)}
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
        ${detailLink("PRD", item.prdLink)}
        ${detailLink("Jira / plan", item.jiraLink)}
        ${detailLink("Figma", item.figmaLinks)}
        ${roadmapData?.sheetUrl ? detailLink("Roadmap sheet (source of truth)", roadmapData.sheetUrl) : ""}
      </dl>
    </section>
  `;

  els.panel.classList.add("is-open");
  els.panel.setAttribute("aria-hidden", "false");
  els.scrim?.classList.remove("hidden");
  document.body.classList.add("panel-open");
}

function closePanel() {
  selectedId = null;
  els.panel?.classList.remove("is-open");
  els.panel?.setAttribute("aria-hidden", "true");
  els.scrim?.classList.add("hidden");
  document.body.classList.remove("panel-open");
  renderGrid();
}

async function loadRoadmap() {
  const res = await fetch("./roadmap-q3.json");
  if (!res.ok) throw new Error("Could not load roadmap-q3.json");
  return res.json();
}

export async function initRoadmap(dom) {
  els.grid = dom.grid;
  els.panel = dom.panel;
  els.scrim = dom.scrim;
  els.panelBody = dom.panelBody;
  els.panelTitle = dom.panelTitle;
  els.panelClose = dom.panelClose;
  els.count = dom.count;
  els.filters = dom.filters;
  els.subtitle = dom.subtitle;
  els.sourceLink = dom.sourceLink;

  dom.panelClose?.addEventListener("click", closePanel);
  dom.scrim?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectedId) closePanel();
  });

  roadmapData = await loadRoadmap();
  const sheetUrl = roadmapData.sourceOfTruth || roadmapData.sheetUrl;
  if (els.subtitle) {
    els.subtitle.textContent = `${roadmapData.quarter} from ${roadmapData.sheetTab || "Sheet1"} · synced ${roadmapData.syncedAt}`;
  }
  if (els.sourceLink && sheetUrl) {
    els.sourceLink.href = sheetUrl;
    els.sourceLink.classList.remove("hidden");
  }
  renderFilters();
  renderGrid();
}

export function refreshRoadmapView() {
  if (roadmapData) renderGrid();
}
