const pickerState = new WeakMap();

function parseISO(iso) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso) {
  const date = parseISO(iso);
  if (!date) return "Select date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function sameDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function positionPopover(state) {
  const rect = state.control.getBoundingClientRect();
  const popover = state.popover;
  const gap = 6;
  const width = 288;
  const height = popover.offsetHeight || 320;

  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - gap);
  }

  let left = rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function closePicker(root) {
  const state = pickerState.get(root);
  if (!state || !state.open) return;
  state.open = false;
  state.popover.hidden = true;
  state.trigger.setAttribute("aria-expanded", "false");
  window.removeEventListener("resize", state.onReposition);
  window.removeEventListener("scroll", state.onReposition, true);
}

function openPicker(root) {
  const state = pickerState.get(root);
  if (!state) return;
  state.open = true;
  state.popover.hidden = false;
  state.trigger.setAttribute("aria-expanded", "true");
  renderPicker(root);
  positionPopover(state);
  state.onReposition = () => {
    if (state.open) positionPopover(state);
  };
  window.addEventListener("resize", state.onReposition);
  window.addEventListener("scroll", state.onReposition, true);
}

function togglePicker(root) {
  const state = pickerState.get(root);
  if (!state) return;
  if (state.open) closePicker(root);
  else openPicker(root);
}

function renderPicker(root) {
  const state = pickerState.get(root);
  if (!state) return;

  const selected = parseISO(state.input.value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  state.trigger.textContent = formatDisplay(state.input.value);
  state.monthLabel.textContent = monthLabel(state.viewDate);

  state.grid.innerHTML = "";
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  weekdays.forEach((label) => {
    const head = document.createElement("span");
    head.className = "date-picker__weekday";
    head.textContent = label;
    state.grid.appendChild(head);
  });

  buildMonthDays(state.viewDate).forEach((date) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-picker__day";
    if (!date) {
      btn.classList.add("date-picker__day--empty");
      btn.disabled = true;
      btn.tabIndex = -1;
      state.grid.appendChild(btn);
      return;
    }

    btn.textContent = String(date.getDate());
    if (sameDay(date, today)) btn.classList.add("is-today");
    if (selected && sameDay(date, selected)) btn.classList.add("is-selected");

    btn.addEventListener("click", () => {
      state.input.value = formatISO(date);
      state.viewDate = new Date(date);
      renderPicker(root);
      closePicker(root);
      state.input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    state.grid.appendChild(btn);
  });

  if (state.open) positionPopover(state);
}

function createPopover(root) {
  const popover = document.createElement("div");
  popover.className = "date-picker__popover";
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Choose due date");
  popover.innerHTML = `
    <div class="date-picker__head">
      <button type="button" class="date-picker__nav" data-action="prev" aria-label="Previous month">‹</button>
      <span class="date-picker__month"></span>
      <button type="button" class="date-picker__nav" data-action="next" aria-label="Next month">›</button>
    </div>
    <div class="date-picker__grid"></div>
  `;

  const host = root.closest("dialog") || document.body;
  host.appendChild(popover);
  return popover;
}

// Returns the popover element, which lives outside `root` and so must be
// removed by callers that re-render their picker host.
export function initDatePicker(root, { name = "due", value = "", required = true } = {}) {
  if (!root) return null;
  if (pickerState.has(root)) return pickerState.get(root).popover;

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  if (required) input.required = true;
  input.value = value;

  root.classList.add("date-picker");
  root.innerHTML = `
    <div class="date-picker__control">
      <button type="button" class="date-picker__trigger" aria-expanded="false" aria-haspopup="dialog">
        Select date
      </button>
      <button type="button" class="date-picker__icon-btn" data-action="toggle" aria-label="Open calendar">📅</button>
    </div>
  `;
  root.appendChild(input);

  const popover = createPopover(root);
  const control = root.querySelector(".date-picker__control");

  const state = {
    input,
    open: false,
    viewDate: parseISO(value) || new Date(),
    control,
    trigger: root.querySelector(".date-picker__trigger"),
    popover,
    monthLabel: popover.querySelector(".date-picker__month"),
    grid: popover.querySelector(".date-picker__grid"),
    onReposition: null,
  };
  state.viewDate.setHours(0, 0, 0, 0);
  pickerState.set(root, state);

  state.trigger.addEventListener("click", () => togglePicker(root));
  root.querySelector('[data-action="toggle"]')?.addEventListener("click", () => togglePicker(root));

  popover.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() - 1, 1);
    renderPicker(root);
  });

  popover.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + 1, 1);
    renderPicker(root);
  });

  document.addEventListener("click", (e) => {
    if (!state.open) return;
    if (root.contains(e.target) || popover.contains(e.target)) return;
    closePicker(root);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) {
      e.preventDefault();
      closePicker(root);
    }
  });

  root.closest("dialog")?.addEventListener("close", () => closePicker(root));

  renderPicker(root);
  return popover;
}

export function setDatePickerValue(root, iso) {
  const state = pickerState.get(root);
  if (!state) return;
  state.input.value = iso || "";
  state.viewDate = parseISO(iso) || new Date();
  state.viewDate.setHours(0, 0, 0, 0);
  renderPicker(root);
}

export function getDatePickerValue(root) {
  return pickerState.get(root)?.input.value || "";
}

export function resetDatePicker(root, iso) {
  setDatePickerValue(root, iso);
  closePicker(root);
}
