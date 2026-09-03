function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  if (!name || name === "Unassigned" || name === "N/A") return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function photoSrc(name, photos) {
  const entry = photos?.[name];
  if (!entry) return null;
  return entry.local || entry.url || null;
}

function avatarMarkup(name, photos, { sizeClass = "", show = true } = {}) {
  if (!show) return "";
  const src = photoSrc(name, photos);
  if (src) {
    return `<img class="designer-chip__photo ${sizeClass}" src="${escapeHtml(src)}" alt="" loading="lazy" />`;
  }
  return `<span class="designer-chip__avatar ${sizeClass}">${initials(name)}</span>`;
}

function closePicker(root, state) {
  state.open = false;
  state.menu.hidden = true;
  state.trigger.setAttribute("aria-expanded", "false");
}

function renderValue(root, state) {
  state.input.value = state.value;
  const label = state.formatLabel(state.value);
  const showAvatar = state.showAvatar(state.value);
  state.trigger.innerHTML = `
    <span class="designer-picker__value">
      ${avatarMarkup(state.value, state.photos, { sizeClass: "designer-picker__photo", show: showAvatar })}
      <span class="designer-picker__name">${escapeHtml(label)}</span>
    </span>
    <span class="designer-picker__caret" aria-hidden="true">▾</span>
  `;
}

function renderMenu(root, state) {
  state.menu.innerHTML = state.options
    .map((name) => {
      const selected = name === state.value ? " is-selected" : "";
      const label = state.formatLabel(name);
      const showAvatar = state.showAvatar(name);
      return `
        <li>
          <button type="button" class="designer-picker__option${selected}" data-value="${escapeHtml(name)}" role="option" aria-selected="${name === state.value ? "true" : "false"}">
            ${avatarMarkup(name, state.photos, { sizeClass: "designer-picker__photo", show: showAvatar })}
            <span>${escapeHtml(label)}</span>
          </button>
        </li>
      `;
    })
    .join("");

  state.menu.querySelectorAll("[data-value]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = btn.getAttribute("data-value");
      if (!next || next === state.value) {
        closePicker(root, state);
        return;
      }
      state.value = next;
      renderValue(root, state);
      closePicker(root, state);
      state.onChange?.(next);
    });
  });
}

export function mountDesignerPicker(
  root,
  { value, options, photos = {}, onChange, formatLabel = (name) => name, showAvatar = () => true } = {}
) {
  if (!root) return null;

  root._designerPickerCleanup?.();

  root.classList.add("designer-picker");
  root.innerHTML = `
    <input type="hidden" data-edit-field="designer" value="${escapeHtml(value || "")}" />
    <button type="button" class="designer-picker__trigger" aria-haspopup="listbox" aria-expanded="false"></button>
    <ul class="designer-picker__menu" hidden role="listbox"></ul>
  `;

  const state = {
    root,
    value: value || "",
    options: options || [],
    photos,
    onChange,
    formatLabel,
    showAvatar,
    open: false,
    input: root.querySelector('[data-edit-field="designer"]'),
    trigger: root.querySelector(".designer-picker__trigger"),
    menu: root.querySelector(".designer-picker__menu"),
  };

  renderMenu(root, state);
  renderValue(root, state);

  state.trigger.addEventListener("click", () => {
    state.open = !state.open;
    state.menu.hidden = !state.open;
    state.trigger.setAttribute("aria-expanded", state.open ? "true" : "false");
  });

  const onDocClick = (e) => {
    if (!state.open) return;
    if (root.contains(e.target)) return;
    closePicker(root, state);
  };
  document.addEventListener("click", onDocClick);
  root._designerPickerCleanup = () => document.removeEventListener("click", onDocClick);

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) {
      e.preventDefault();
      closePicker(root, state);
    }
  });

  return state;
}

export function setDesignerPickerValue(pickerState, value) {
  if (!pickerState?.root) return;
  pickerState.value = value || "";
  renderValue(pickerState.root, pickerState);
  renderMenu(pickerState.root, pickerState);
}
