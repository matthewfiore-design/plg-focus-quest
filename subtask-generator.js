/**
 * Subtask generation for designer roadmap items.
 * Workflow aligned with async design review guidance:
 * https://vigilant-adventure-v6k24pn.pages.github.io/matthew
 */

import { getSavedEstimate } from "./design-estimator.js";

const REVIEW_STAGES = {
  concept: {
    key: "design-review-concept",
    label: "Concept / Low-Fi",
    slackTitle: "Concept/Low-Fi",
  },
  mid: {
    key: "design-review-mid",
    label: "Mid-Fi",
    slackTitle: "Mid-Fi",
  },
  final: {
    key: "design-review-final",
    label: "Final / High-Fi",
    slackTitle: "Final/High-Fi",
  },
};

export function reviewCountForProject(item) {
  const estimate = getSavedEstimate(item?.id);
  const fromSize = reviewsFromEstimate(estimate);
  const name = (item.name || "").toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const stars = (item.launchCompass || "").replace(/[^\u2b50]/g, "").length;

  let fromSignals = 1;
  if (name.includes("[big rock]") || stars >= 2) fromSignals = 3;
  else if (
    name.includes("experiment") ||
    name.includes("revamp") ||
    desc.length > 220 ||
    (item.state || "").startsWith("2.")
  ) {
    fromSignals = 2;
  }

  return Math.max(fromSignals, fromSize);
}

function reviewsFromEstimate(estimate) {
  const letter = estimate?.size?.letter;
  if (letter === "XL" || letter === "L") return 3;
  if (letter === "M") return 2;
  if (letter === "S" || letter === "XS") return 1;
  return 1;
}

function reviewStagesForCount(count) {
  if (count >= 3) return [REVIEW_STAGES.concept, REVIEW_STAGES.mid, REVIEW_STAGES.final];
  if (count === 2) return [REVIEW_STAGES.mid, REVIEW_STAGES.final];
  return [REVIEW_STAGES.final];
}

function scheduleDate(weekDates, index, total) {
  if (!weekDates.length) return null;
  const slot = Math.min(weekDates.length - 1, Math.floor((index / Math.max(total, 1)) * weekDates.length));
  return weekDates[slot];
}

function baseDiscoveryTasks(item, weekDates) {
  const pm = item.productManager || "PM";
  return [
    {
      title: `Align with ${pm} on requirements & open questions`,
      note: "Clarify problem, success metric, and scope before heavy design work.",
      milestone: "discovery",
      scheduledDate: scheduleDate(weekDates, 0, 5),
      xp: 20,
    },
    {
      title: "Internal design collab pass (designers + PM if needed)",
      note: "One pass with the design team before posting to #plg-design-reviews.",
      milestone: "collab",
      scheduledDate: scheduleDate(weekDates, 0, 5),
      xp: 20,
    },
  ];
}

function reviewTasks(item, stage, index, total, weekDates) {
  const pm = item.productManager || "PM";
  const eng = item.engTeam || "eng team";
  return [
    {
      title: `${stage.label} — prepare Figma & recorded walkthrough`,
      note: `Materials for ${item.name}. Be explicit about what feedback you need at this fidelity.`,
      milestone: stage.key,
      scheduledDate: scheduleDate(weekDates, index + 1, total + 2),
      xp: 25,
    },
    {
      title: `${stage.label} — post async review to #plg-design-reviews`,
      note: `Slack post: Async ${stage.slackTitle} design review. Tag @matthew.fiore @kaylee.prior @kkalyanaraman. Include Figma, walkthrough, feedback doc, PRD link. cc design team + triad.`,
      milestone: stage.key,
      scheduledDate: scheduleDate(weekDates, index + 1, total + 2),
      xp: 30,
    },
    {
      title: `${stage.label} — incorporate feedback & resolve open threads`,
      note: `Close the loop on async comments. Cross-post in ${eng} channel if the work affects their roadmap.`,
      milestone: stage.key,
      scheduledDate: scheduleDate(weekDates, index + 2, total + 2),
      xp: 20,
    },
  ];
}

function estimateInformedTasks(item, estimate, weekDates, startIndex) {
  if (!estimate?.inputs) return [];
  const inputs = estimate.inputs;
  const tasks = [];
  const slot = (offset) => scheduleDate(weekDates, startIndex + offset, startIndex + 8);
  const pm = item.productManager || "PM";

  if (inputs.ambiguity && inputs.ambiguity !== "Well-defined") {
    tasks.push({
      title: `Spike unknowns (${inputs.ambiguity.toLowerCase()})`,
      note: "Write down what is not known, who can answer it, and what would change the design if we are wrong.",
      milestone: "discovery",
      scheduledDate: slot(0),
      xp: 20,
    });
  }

  if (inputs.alignment === "Mostly aligned" || inputs.alignment === "Misaligned") {
    tasks.push({
      title: `Stakeholder alignment session with ${pm} and triad`,
      note: `${inputs.alignment} stakeholders — lock problem, success metric, and in/out of scope before the first review.`,
      milestone: "discovery",
      scheduledDate: slot(0),
      xp: 25,
    });
  }

  if (inputs.research) {
    tasks.push({
      title: "Kick off UXR study — brief, sample, and timeline",
      note: "Estimator flagged a dedicated research study. Partner with UXR; do not treat this as designer-only testing.",
      milestone: "discovery",
      scheduledDate: slot(1),
      xp: 25,
    });
    tasks.push({
      title: "Synthesize research into design implications",
      note: "Share findings with PM/eng before mid-fi so the study actually changes the work.",
      milestone: "discovery",
      scheduledDate: slot(2),
      xp: 25,
    });
  }

  if (inputs.userTesting) {
    tasks.push({
      title: "Plan designer-led usability sessions",
      note: "Prototype, script, and participants. This is designer-run testing, not a UXR study.",
      milestone: "prep",
      scheduledDate: slot(2),
      xp: 20,
    });
    tasks.push({
      title: "Run sessions and fold findings into the next fidelity",
      note: "Capture 3–5 issues with severity. Change the design before Final/High-Fi.",
      milestone: "prep",
      scheduledDate: slot(3),
      xp: 25,
    });
  }

  if (inputs.designSystem === false) {
    tasks.push({
      title: "Inventory net-new components vs one-offs",
      note: "No design system available — decide what must be net-new vs. local. Flag Flora/PLG owners early.",
      milestone: "prep",
      scheduledDate: slot(1),
      xp: 20,
    });
  }

  if (inputs.contentDesign === "Full flow") {
    tasks.push({
      title: "Content design pass across the full flow",
      note: "States, empty/error, and CTA language. Review before Final/High-Fi.",
      milestone: "prep",
      scheduledDate: slot(3),
      xp: 20,
    });
  }

  if (inputs.contentDesign === "Strategy") {
    tasks.push({
      title: "Content strategy: naming, terminology, and narrative",
      note: "Estimator set content to Strategy. Align terms with PM before high-fi; this is not a string review.",
      milestone: "discovery",
      scheduledDate: slot(1),
      xp: 25,
    });
  }

  if (inputs.experiment) {
    const variants = Math.min(5, Math.max(2, Number(inputs.experimentVariants) || 2));
    tasks.push({
      title: `Define experiment hypothesis and ${variants} variants`,
      note: "Control + variants, primary metric, and what would cause a ship/kill. Design each variant at the same fidelity.",
      milestone: "prep",
      scheduledDate: slot(2),
      xp: 25,
    });
    tasks.push({
      title: "Align instrumentation and analysis plan with PM/eng",
      note: "Estimator included experiment setup time. Confirm tracking before handoff.",
      milestone: "handoff",
      scheduledDate: slot(4),
      xp: 20,
    });
  }

  if (inputs.complexity === "High" || inputs.complexity === "Very High") {
    tasks.push({
      title: "Sequence the work into design slices",
      note: `${inputs.complexity} complexity — split delivery so reviews are on a vertical slice, not a dump of every screen.`,
      milestone: "prep",
      scheduledDate: slot(0),
      xp: 20,
    });
  }

  return tasks;
}

export function generateSubtasksHeuristic(item, weekDates) {
  const estimate = getSavedEstimate(item?.id);
  const reviewCount = reviewCountForProject(item);
  const stages = reviewStagesForCount(reviewCount);
  const tasks = [...baseDiscoveryTasks(item, weekDates)];

  stages.forEach((stage, index) => {
    tasks.push(...reviewTasks(item, stage, index, stages.length, weekDates));
  });

  tasks.push(...estimateInformedTasks(item, estimate, weekDates, tasks.length));

  if ((item.state || "").startsWith("4.") || (item.state || "").startsWith("5.")) {
    tasks.push({
      title: "Design QA on staging / pre-handoff polish",
      note: "Compare implementation to approved Final designs before launch.",
      milestone: "handoff",
      scheduledDate: weekDates[weekDates.length - 1] || null,
      xp: 25,
    });
  }

  return {
    reviewCount,
    stages: stages.map((s) => s.label),
    tasks: tasks.filter((t) => t.scheduledDate),
    estimateSize: estimate?.size?.letter || null,
  };
}

function estimatePromptBlock(estimate) {
  if (!estimate?.inputs) {
    return "No design estimate has been saved for this project. Use project signals only.";
  }
  const i = estimate.inputs;
  const extras = [];
  if (i.ambiguity && i.ambiguity !== "Well-defined") extras.push(`extra discovery for ${i.ambiguity.toLowerCase()} scope`);
  if (i.alignment === "Mostly aligned" || i.alignment === "Misaligned") extras.push("stakeholder alignment session");
  if (i.research) extras.push("dedicated UXR study kickoff + synthesis");
  if (i.userTesting) extras.push("designer-led usability sessions");
  if (i.designSystem === false) extras.push("inventory net-new components (no design system)");
  if (i.contentDesign === "Full flow") extras.push("full-flow content design pass");
  if (i.contentDesign === "Strategy") extras.push("content strategy / naming / terminology");
  if (i.experiment) extras.push(`experiment with ${i.experimentVariants || 2} variants + instrumentation`);
  if (i.complexity === "High" || i.complexity === "Very High") extras.push("sequence work into design slices");
  return `Design estimate (from the planning tool — honor these selections):
- Size: ${estimate.size.letter} (${estimate.size.name}, ${estimate.size.range}, ${estimate.totalWeeks} weeks)
- Complexity: ${i.complexity}
- Ambiguity: ${i.ambiguity}
- Stakeholder alignment: ${i.alignment}
- Content design: ${i.contentDesign}
- User testing: ${i.userTesting ? "yes" : "no"}
- Research study: ${i.research ? "yes" : "no"}
- Design system available: ${i.designSystem ? "yes" : "no"}
- Experiment: ${i.experiment ? `yes (${i.experimentVariants || 2} variants)` : "no"}
Required extras from the estimate: ${extras.length ? extras.join("; ") : "none beyond the standard review workflow"}.`;
}

function buildLLMPrompt(item, reviewCount, weekDates, estimate) {
  const stages = reviewStagesForCount(reviewCount).map((s) => s.label).join(", ");
  return `You are a PLG design ops assistant at Zendesk. Generate a weekly subtask plan for a product designer.

Roadmap item:
- Name: ${item.name}
- Description: ${item.description || "N/A"}
- State: ${item.state || "Unknown"}
- PM: ${item.productManager || "TBD"}
- Eng team: ${item.engTeam || "TBD"}
- L2: ${item.l2 || "N/A"}

${estimatePromptBlock(estimate)}

Design workflow (async reviews — see PLG design review guide):
1. Align with PM on requirements before heavy design.
2. Internal design collab pass with designers (and PM when needed) BEFORE #plg-design-reviews.
3. Design review milestones at: ${stages} (${reviewCount} review${reviewCount === 1 ? "" : "s"} total for this project size).
4. Each async review post needs: Slack title with fidelity stage, Figma link, recorded walkthrough, feedback doc, product doc (PRD), deadline, tag approvers @matthew.fiore @kaylee.prior @kkalyanaraman, cc design team + triad.
5. Content must be reviewed before Final/High-Fi review.
6. Add subtasks for every estimate extra listed above. Do not drop the required review stages.

Week dates available (Mon–Fri): ${weekDates.join(", ")}

Return ONLY valid JSON (no markdown):
{
  "tasks": [
    {
      "title": "short action title",
      "note": "1-2 sentence context",
      "milestone": "discovery|collab|design-review-concept|design-review-mid|design-review-final|handoff|prep",
      "scheduledDate": "YYYY-MM-DD from the week list"
    }
  ]
}

Include 8-16 tasks. Every design review stage listed above must appear as at least one milestone task.`;
}

function normalizeLLMTasks(raw, item, weekDates) {
  const list = Array.isArray(raw?.tasks) ? raw.tasks : Array.isArray(raw) ? raw : [];
  const validDates = new Set(weekDates);

  return list
    .map((t) => ({
      title: String(t.title || "").trim(),
      note: String(t.note || "").trim(),
      milestone: String(t.milestone || "prep").trim(),
      scheduledDate: validDates.has(t.scheduledDate)
        ? t.scheduledDate
        : scheduleDate(weekDates, 0, list.length),
      xp: 20,
    }))
    .filter((t) => t.title);
}

export async function generateSubtasksWithLLM(item, weekDates, apiKey) {
  const estimate = getSavedEstimate(item?.id);
  const reviewCount = reviewCountForProject(item);
  const fallback = generateSubtasksHeuristic(item, weekDates);

  if (!apiKey) {
    return { ...fallback, source: "heuristic", message: "No API key — used built-in generator." };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate structured design project subtasks for PLG designers. Output JSON only.",
          },
          { role: "user", content: buildLLMPrompt(item, reviewCount, weekDates, estimate) },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const tasks = normalizeLLMTasks(parsed, item, weekDates);

    if (!tasks.length) throw new Error("Empty LLM response");

    return {
      reviewCount,
      stages: reviewStagesForCount(reviewCount).map((s) => s.label),
      tasks,
      source: "llm",
      estimateSize: estimate?.size?.letter || null,
    };
  } catch (err) {
    return {
      ...fallback,
      source: "heuristic",
      message: `LLM unavailable (${err.message}) — used built-in generator.`,
    };
  }
}

export function milestoneLabel(key) {
  const map = {
    "design-review-concept": "DR · Concept",
    "design-review-mid": "DR · Mid-Fi",
    "design-review-final": "DR · Final",
    discovery: "Discovery",
    collab: "Design collab",
    handoff: "Handoff",
    prep: "Prep",
    manual: "Custom",
  };
  return map[key] || key;
}
