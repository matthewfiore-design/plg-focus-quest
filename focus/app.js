const principles = [
  {
    id: "fast",
    letter: "F",
    name: "Fast",
    statement:
      "Product and engineering are already moving. Design keeps pace—decide, hand off, and ship in the same rhythm. Do not stall the bigger picture on small debates. If it meets the need, it goes out; we refine after.",
    critique: "Matching partner velocity versus blocking on minutiae.",
    watch: "Waiting for a perfect system before shipping.",
  },
  {
    id: "outcome",
    letter: "O",
    name: "Outcome",
    statement:
      "Name the problem AND the metric we intend to move. If we cannot say both, stop. Do not churn on an unspecified problem. Evidence chooses the problem, defines success, and checks if work moved the number.",
    critique: "Can the designer name the metric?",
    watch: "Taste arguments with no number.",
  },
  {
    id: "context",
    letter: "C",
    name: "Context",
    statement:
      "Finish the job where the user already is. Design for this moment in the journey, on the surface they are on. Do not send them elsewhere to read, configure, or come back later. Action in place beats information elsewhere.",
    critique: "Does this complete the job here, now?",
    watch: "A new tab or another surface with no way back.",
  },
  {
    id: "unified",
    letter: "U",
    name: "Unified",
    statement:
      "Act as one PLG in pattern, style, and collaboration. Know the full journey including mobile before optimizing one touchpoint. Shared patterns across Trial, Onboarding, Cart, Expansion, and Adoption.",
    critique: "Would this feel like the same product two steps later?",
    watch: "A local pattern that fights the rest of PLG.",
  },
  {
    id: "spark",
    letter: "S",
    name: "Spark",
    statement:
      "Design motion and delight that belong directly on the user's path so that progress is highly visible. Use animation that clarifies and rewards, rather than acting as mere decoration on a spinner. The product journey should truly feel like a journey.",
    critique: "Does the UI show progress and earn confidence?",
    watch: "Motion without meaning.",
  },
];

const dialog = document.querySelector("#principle-dialog");
const dialogContent = document.querySelector(".detail-content");
const dialogKicker = document.querySelector("#dialog-kicker");
const dialogLetter = document.querySelector("#dialog-letter");
const dialogTitle = document.querySelector("#dialog-title");
const dialogStatement = document.querySelector("#dialog-statement");
const dialogCritique = document.querySelector("#dialog-critique");
const dialogWatch = document.querySelector("#dialog-watch");
const dialogCount = document.querySelector("#dialog-count");
const closeButton = document.querySelector(".close-button");
const previousButton = document.querySelector("#previous-principle");
const nextButton = document.querySelector("#next-principle");
let activeIndex = 0;
let isBusy = false;
let swapToken = 0;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function waitForAnimation(element, fallbackMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      element.removeEventListener("animationend", onEnd);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === element) finish();
    };
    element.addEventListener("animationend", onEnd);
    window.setTimeout(finish, fallbackMs);
  });
}

function restartAnimation(element, className) {
  element.classList.remove("is-leave-next", "is-leave-prev", "is-enter-next", "is-enter-prev");
  if (className) {
    void element.offsetWidth;
    element.classList.add(className);
  }
}

function getIndexFromHash() {
  const id = window.location.hash.slice(1);
  return principles.findIndex((principle) => principle.id === id);
}

function directionBetween(from, to) {
  if (from === to) return null;
  const forward = (to - from + principles.length) % principles.length;
  const back = (from - to + principles.length) % principles.length;
  return forward <= back ? "next" : "prev";
}

function populateDialog(index) {
  const principle = principles[index];
  activeIndex = index;
  dialogKicker.textContent = "FOCUS";
  dialogLetter.textContent = principle.letter;
  dialogTitle.textContent = principle.name;
  dialogStatement.textContent = principle.statement;
  dialogCritique.textContent = principle.critique;
  dialogWatch.textContent = principle.watch;
  dialogCount.textContent = `${String(index + 1).padStart(2, "0")} / ${String(principles.length).padStart(2, "0")}`;
  previousButton.textContent = index === 0 ? `← ${principles.at(-1).name}` : `← ${principles[index - 1].name}`;
  nextButton.textContent = index === principles.length - 1 ? `${principles[0].name} →` : `${principles[index + 1].name} →`;
}

async function swapPrinciple(index, direction) {
  const token = ++swapToken;
  isBusy = true;
  restartAnimation(dialogContent, direction === "next" ? "is-leave-next" : "is-leave-prev");
  await waitForAnimation(dialogContent, 340);
  if (token !== swapToken) return;
  populateDialog(index);
  restartAnimation(dialogContent, direction === "next" ? "is-enter-next" : "is-enter-prev");
  await waitForAnimation(dialogContent, 500);
  if (token === swapToken) {
    dialogContent.classList.remove("is-enter-next", "is-enter-prev");
    isBusy = false;
  }
}

function openPrinciple(index, direction) {
  const nextIndex = (index + principles.length) % principles.length;
  if (dialog.open && nextIndex === activeIndex) return;
  if (dialog.open && isBusy) return;

  window.history.replaceState(null, "", `#${principles[nextIndex].id}`);

  if (dialog.open && nextIndex !== activeIndex) {
    const travel = direction || directionBetween(activeIndex, nextIndex);
    if (travel && !prefersReducedMotion()) {
      swapPrinciple(nextIndex, travel);
      return;
    }
    populateDialog(nextIndex);
    return;
  }

  populateDialog(nextIndex);
  if (!dialog.open) {
    dialog.classList.remove("is-closing");
    dialog.showModal();
  }
}

function closePrinciple() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;

  const finish = () => {
    dialog.classList.remove("is-closing");
    if (dialog.open) dialog.close();
    window.history.replaceState(null, "", window.location.pathname);
  };

  if (prefersReducedMotion()) {
    finish();
    return;
  }

  dialog.classList.add("is-closing");
  waitForAnimation(dialog, 300).then(finish);
}

document.querySelectorAll("[data-principle]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openPrinciple(principles.findIndex((principle) => principle.id === link.dataset.principle));
  });
});

closeButton.addEventListener("click", closePrinciple);
previousButton.addEventListener("click", () => {
  if (isBusy) return;
  openPrinciple(activeIndex - 1, "prev");
});
nextButton.addEventListener("click", () => {
  if (isBusy) return;
  openPrinciple(activeIndex + 1, "next");
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closePrinciple();
});

dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePrinciple();
});

dialog.addEventListener("close", () => {
  isBusy = false;
  dialog.classList.remove("is-closing");
  dialogContent.classList.remove("is-leave-next", "is-leave-prev", "is-enter-next", "is-enter-prev");
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
});

window.addEventListener("hashchange", () => {
  const index = getIndexFromHash();
  if (index >= 0) {
    openPrinciple(index);
  } else if (dialog.open) {
    closePrinciple();
  }
});

const initialIndex = getIndexFromHash();
if (initialIndex >= 0) openPrinciple(initialIndex);
