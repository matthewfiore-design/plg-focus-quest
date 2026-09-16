export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function linkKey(name, quarter) {
  return `${String(name || "").trim().replace(/\s+/g, " ")}|${String(quarter || "").trim().toUpperCase()}`;
}

const DESIGNER_BY_EMAIL = {
  "alexastahl@zendesk.com": "Alexa Stahl",
  "ankit.bansod@zendesk.com": "Ankit Bansod",
  "dheeraj.kumar@zendesk.com": "Dheeraj Kumar",
  "lliwanag@zendesk.com": "Lynette Liwanag",
  "nicaela.rivera@zendesk.com": "Nicaela Rivera",
  "suhail.shaikh@zendesk.com": "Suhail Shaikh",
  "matthew.fiore@zendesk.com": "Matthew Fiore",
};

export function normalizeDesignerName(value) {
  const raw = String(value || "").trim().replace(/^@+/, "").replace(/\s+/g, " ");
  if (!raw) return "Unassigned";
  const byEmail = DESIGNER_BY_EMAIL[raw.toLowerCase()];
  return byEmail || raw;
}

export function normalizeHref(value) {
  const raw = String(value || "").trim().replace(/[),.;]+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (/^(docs|drive|figma|www)\./i.test(raw) || raw.startsWith("figma.com/")) {
    return `https://${raw}`;
  }
  return "";
}

export function extractUrlsFromText(value) {
  const text = String(value || "");
  if (!text.trim()) return [];
  const found = [];
  const seen = new Set();
  const pattern =
    /https?:\/\/[^\s<>"'()]+|(?:www\.|docs\.google\.com|drive\.google\.com|www\.figma\.com|figma\.com)[^\s<>"'()]*/gi;
  for (const match of text.match(pattern) || []) {
    const href = normalizeHref(match);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    found.push({ href, label: prettyLinkLabel("", href) });
  }
  return found;
}

export function prettyLinkLabel(label, href) {
  const text = String(label || "").trim();
  if (text && !/^https?:\/\//i.test(text) && text.length < 80) return text;
  try {
    const url = new URL(href);
    const jiraKey = jiraKeyFromHref(href);
    if (jiraKey) return jiraKey;
    if (url.hostname.includes("figma.com")) return "Figma";
    if (url.hostname.includes("atlassian.net") || url.hostname.includes("jira")) return "Jira";
    if (url.pathname.includes("/document/")) return "Google Doc";
    if (url.pathname.includes("/spreadsheets/")) return "Google Sheet";
    if (url.pathname.includes("/presentation/")) return "Google Slides";
    if (url.hostname.includes("docs.google.com")) return "Google Doc";
  } catch {
    /* ignore */
  }
  return text || "Open link";
}

export function mergeLinkItems(value, extras = []) {
  const merged = [];
  const seen = new Set();
  for (const item of [...(extras || []), ...extractUrlsFromText(value)]) {
    const href = normalizeHref(item?.href || item);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    merged.push({
      href,
      label: prettyLinkLabel(item?.label || "", href),
    });
  }
  return merged;
}

export function isPlaceholderLinkText(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^https?:\/\//i.test(v)) return false;
  return /^(figma(?: link)?|here|link|tbd|n\/?a|prd|one pager|1-pager|offer sheet|lovable)$/i.test(v);
}

/** First real URL for a field, preferring hyperlinks pulled from the sheet. */
export function firstLinkHref(value, extras = []) {
  return mergeLinkItems(value, extras)[0]?.href || "";
}

/**
 * Editable link field. The input stays writable so edits reach the sheet, and
 * the adjacent anchor gives the URL somewhere to actually be clicked.
 */
export function linkInputHtml({ field, inputValue = "", href = "", placeholder = "https://…" }) {
  return `
    <div class="detail-field__input-row">
      <input
        class="detail-field__input"
        type="url"
        data-edit-field="${escapeHtml(field)}"
        value="${escapeHtml(inputValue)}"
        placeholder="${escapeHtml(placeholder)}"
      />
      <a
        class="detail-field__open"
        data-open-link
        href="${escapeHtml(href)}"
        target="_blank"
        rel="noopener noreferrer"
        title="Open in a new tab"${href ? "" : "\n        hidden"}
      >Open ↗</a>
    </div>
  `;
}

/** Keep each Open button pointed at whatever the user has typed. */
export function wireOpenLinks(root) {
  root?.querySelectorAll?.(".detail-field__input-row").forEach((row) => {
    const input = row.querySelector("input");
    const open = row.querySelector("[data-open-link]");
    if (!input || !open) return;
    const sync = () => {
      const href = normalizeHref(input.value);
      open.setAttribute("href", href);
      open.hidden = !href;
    };
    input.addEventListener("input", sync);
    // These fields sit inside a <label>, which would otherwise forward the
    // click to the input and swallow it before the anchor navigates.
    open.addEventListener("click", (event) => event.stopPropagation());
  });
}

const JIRA_BROWSE = "https://zendesk.atlassian.net/browse";
const JIRA_KEY_RE = /\b([A-Z]{2,}[A-Z0-9]*-\d+)\b/g;
const JIRA_PLACEHOLDER = /^(tbd|n\/a|na|none|-|—)$/i;

export function jiraBrowseHref(key) {
  return `${JIRA_BROWSE}/${encodeURIComponent(String(key || "").trim().toUpperCase())}`;
}

export function jiraKeyFromHref(href) {
  try {
    const url = new URL(href);
    const match = url.pathname.match(/\/(?:browse|issues)\/([A-Z]{2,}[A-Z0-9]*-\d+)/i);
    return match ? match[1].toUpperCase() : "";
  } catch {
    return "";
  }
}

export function mergeJiraLinkItems(value, extras = []) {
  const items = [];
  const seen = new Set();

  const add = (href, label) => {
    const url = normalizeHref(href);
    if (!url) return;
    const key = jiraKeyFromHref(url);
    const id = key || url;
    if (seen.has(id) || seen.has(url)) return;
    seen.add(id);
    seen.add(url);
    items.push({
      href: url,
      label: prettyLinkLabel(label || key, url),
    });
  };

  for (const extra of extras || []) {
    add(extra?.href || extra, extra?.label || "");
  }

  const text = String(value || "").trim();
  if (!text || JIRA_PLACEHOLDER.test(text)) return items;

  for (const found of extractUrlsFromText(text)) {
    add(found.href, found.label);
  }

  for (const match of text.matchAll(JIRA_KEY_RE)) {
    const key = match[1].toUpperCase();
    if (seen.has(key)) continue;
    add(jiraBrowseHref(key), key);
  }

  return items;
}

export function linkListHtml(items, { empty = "" } = {}) {
  if (!items?.length) {
    return empty
      ? `<div class="detail-link-list detail-link-list--empty">${escapeHtml(empty)}</div>`
      : "";
  }
  return `
    <div class="detail-link-list">
      ${items
        .map(
          (item) =>
            `<a class="detail-link-list__link" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`
        )
        .join("")}
    </div>
  `;
}

export function prdFieldHtml(value, extras = [], { compact = false } = {}) {
  const text = String(value || "").trim();
  const items = mergeLinkItems(text, extras);
  const compactClass = compact ? " detail-field--compact" : "";
  if (!text && !items.length) {
    return `
      <div class="detail-field detail-field--prd${compactClass}">
        <span class="detail-field__label">PRD</span>
        <div class="detail-prd-value detail-prd-value--empty">No PRD</div>
      </div>
    `;
  }
  if (items.length) {
    return `
      <div class="detail-field detail-field--prd${compactClass}">
        <span class="detail-field__label">PRD</span>
        ${linkListHtml(items)}
      </div>
    `;
  }
  return `
    <div class="detail-field detail-field--prd${compactClass}">
      <span class="detail-field__label">PRD</span>
      <div class="detail-prd-value detail-prd-value--text">${escapeHtml(text)}</div>
    </div>
  `;
}
