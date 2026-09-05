// Selectable Claude models, with the pricing that drives the cost hints in the
// settings UI. Prices are USD per 1M tokens, first-party Anthropic API rates.
//
// Note on the old default: this app shipped on claude-sonnet-4-6, which is both
// older and more expensive than claude-sonnet-5 ($3/$15 vs $2/$10 per 1M). The
// default moved to Sonnet 5 — strictly newer and cheaper, no quality tradeoff.
export const MODELS = [
  {
    id: "claude-opus-5",
    label: "Opus 5",
    inPrice: 5,
    outPrice: 25,
    blurb: "Most capable. Best judgement on tailoring and cover letters.",
    modernWebSearch: true,
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    inPrice: 2,
    outPrice: 10,
    blurb: "Balanced quality and cost. Recommended for everything.",
    modernWebSearch: true,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    inPrice: 3,
    outPrice: 15,
    blurb: "Previous generation — costs more than Sonnet 5 for no gain.",
    modernWebSearch: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    inPrice: 1,
    outPrice: 5,
    blurb: "Cheapest and fastest. Fine for parsing; weaker at writing.",
    modernWebSearch: false,
  },
];

export const MODEL_IDS = MODELS.map((m) => m.id);
export const getModel = (id) => MODELS.find((m) => m.id === id) || MODELS[1];

// Two tiers, matching what the app actually asks the model to do:
// - extraction: pulling structure out of a document (CV parsing, stripping nav
//   junk off a scraped job page). Mechanical; a cheaper model mostly holds up.
// - writing: tailoring bullets, cover letters, interview prep. Judgement-heavy;
//   this is where model quality is actually visible in the output.
export const TIERS = [
  {
    id: "extraction",
    label: "Parsing",
    what: "Reading uploaded CVs and cleaning up fetched job postings.",
    hint: "Mechanical work. Haiku is a third of Sonnet's price here, but parses complex two-column layouts less reliably — check the result after switching.",
  },
  {
    id: "writing",
    label: "Writing",
    what: "Tailoring bullets, cover letters, résumé summaries, interview prep.",
    hint: "Where model quality actually shows. Worth spending more here than on parsing.",
  },
];

export const DEFAULT_AI_SETTINGS = {
  extraction: "claude-sonnet-5",
  writing: "claude-sonnet-5",
};

// The web-search tool type is model-gated: the 2026 variant (with dynamic
// filtering) needs Sonnet 4.6 / Sonnet 5 / Opus 4.6+, while older models such
// as Haiku 4.5 only accept the original. Sending the wrong one is a 400, so the
// bullet-generation web search has to pick per selected model.
export function webSearchTool(modelId, maxUses = 3) {
  return {
    type: getModel(modelId).modernWebSearch ? "web_search_20260209" : "web_search_20250305",
    name: "web_search",
    max_uses: maxUses,
  };
}

// Rough relative cost vs. the default, for the settings UI.
export function relativeCost(modelId, baseId = DEFAULT_AI_SETTINGS.writing) {
  const m = getModel(modelId);
  const base = getModel(baseId);
  const ratio = (m.inPrice + m.outPrice) / (base.inPrice + base.outPrice);
  return Math.round(ratio * 100) / 100;
}

// Which model each tier currently resolves to. Held at module level rather than
// passed as props: callClaude is reached from plain libs (cvExtract.js,
// interviewPrep.js) with no React context, and threading a model argument
// through all nine call sites would be noise. App.jsx pushes the user's saved
// settings in here once they load.
let activeModels = { ...DEFAULT_AI_SETTINGS };

export function setActiveModels(next) {
  const merged = { ...DEFAULT_AI_SETTINGS, ...(next || {}) };
  // Ignore anything not in the catalogue, so a stale stored id (a model since
  // retired) falls back instead of 400ing every request.
  for (const [tier, id] of Object.entries(merged)) {
    if (!MODEL_IDS.includes(id)) merged[tier] = DEFAULT_AI_SETTINGS[tier];
  }
  activeModels = merged;
}

export function modelFor(tier) {
  return activeModels[tier] || activeModels.writing || DEFAULT_AI_SETTINGS.writing;
}
