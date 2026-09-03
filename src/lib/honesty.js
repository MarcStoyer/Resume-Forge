// Voice rules per content type (the bug fix you spotted):
// - Bullets: implied-subject action verbs ("Built X", "Architected Y") — NO "I"
// - Summary & Cover Letter: full first person, formal, no contractions

export const BULLET_VOICE_RULE =
  "VOICE: Use implied-subject action verbs (e.g. 'Built', 'Architected', 'Designed'). Do NOT start any bullet with 'I' or use 'my'. This is résumé bullet convention.";

export const SYNTHESIS_VOICE_RULE =
  "VOICE: First person, formal register. Use 'I'. Do not use contractions (write 'I am' not 'I'm', 'do not' not 'don't').";

export function honestyLabel(v) {
  if (v <= 10) return "Aggressive (may fabricate)";
  if (v <= 35) return "Liberal (adds details)";
  if (v <= 60) return "Balanced (infers from context)";
  if (v <= 85) return "Faithful (rewords only)";
  return "Verbatim (no changes)";
}
export function honestyColor(v) {
  if (v <= 35) return "#dc2626";
  if (v <= 60) return "#d97706";
  if (v <= 85) return "#0f766e";
  return "#475569";
}

export function honestyPromptFragment(v) {
  const voice = BULLET_VOICE_RULE + " ";
  if (v >= 95) return voice + "HONESTY MODE: VERBATIM. Do not rewrite. Return content EXACTLY as provided.";
  if (v >= 75) return voice + `HONESTY MODE: FAITHFUL (level ${v}/100). You may reword and reframe existing content. Use stronger verbs, surface relevant keywords from the JD that are ALREADY supported by the original. You MUST NOT invent facts, add specific numbers/metrics that weren't there, claim new tools or technologies, or fabricate outcomes.`;
  if (v >= 50) return voice + `HONESTY MODE: BALANCED (level ${v}/100). Reword for impact and add reasonable inferences. Do not invent specific numerical claims, named technologies the candidate didn't mention, or fabricated outcomes.`;
  if (v >= 25) return voice + `HONESTY MODE: LIBERAL (level ${v}/100). Aggressively rewrite to match the JD. May add plausible accomplishments and inferred metrics. WARNING: candidate must verify each bullet.`;
  return voice + `HONESTY MODE: AGGRESSIVE (level ${v}/100). Optimize for keyword match. May invent specific accomplishments and metrics. HIGH FABRICATION RISK.`;
}

// Interview prep has two kinds of content: evidence-backed (from the résumé/cover
// letter/notes) and illustrative "suggestion" content when evidence is thin. This
// controls how freely the suggestion side is offered — evidence citation and the
// missingEvidence flag stay honest regardless of this setting; only "suggestion" scales.
export function honestyPromptForInterview(v) {
  if (v >= 95) return `INTERVIEW-PREP HONESTY: VERBATIM (${v}/100). Build every answer outline strictly from the evidence provided (submitted résumé, master CV, cover letter, notes). Do not write a "suggestion" — leave it null. If evidence is missing, set missingEvidence:true and stop there.`;
  if (v >= 75) return `INTERVIEW-PREP HONESTY: FAITHFUL (${v}/100). Prefer the candidate's real evidence. Only write a "suggestion" when evidence is genuinely thin, and keep it structural/generic (e.g. "use the STAR format, focus on your role in the outcome") — no invented specifics: no fabricated metrics, employers, or outcomes attributed to the candidate.`;
  if (v >= 50) return `INTERVIEW-PREP HONESTY: BALANCED (${v}/100). Ground answers in evidence first. When evidence is thin, write a fuller "suggestion" using general interview-coaching wisdom (a plausible shape of example for this kind of question) — always phrase it as an illustrative approach to adapt, never as a claim about the candidate's real history.`;
  if (v >= 25) return `INTERVIEW-PREP HONESTY: LIBERAL (${v}/100). Offer generous illustrative "suggestion" content drawing on general wisdom for this kind of question, even when some evidence exists — the point is to give the candidate something to react to and adapt. Always phrase suggestions as illustrative, never as fact about the candidate.`;
  return `INTERVIEW-PREP HONESTY: AGGRESSIVE (${v}/100). Freely generate a full illustrative example for every question, even without supporting evidence. Still phrase every "suggestion" as illustrative practice material, not a factual claim — this mode is for brainstorming only; the candidate must swap in a real example before using it.`;
}

export function honestyPromptForSynthesis(v) {
  const voice = SYNTHESIS_VOICE_RULE + " ";
  if (v >= 95) return voice + "Use only language and facts directly present in the source résumé. No additions, no inferences.";
  if (v >= 75) return voice + `Stay faithful to the candidate's actual experience (honesty ${v}/100). Reframe and emphasize for the role, but do not invent new accomplishments, skills, tools, or metrics.`;
  if (v >= 50) return voice + `Balanced tailoring (honesty ${v}/100). May make reasonable inferences from context. Do not invent specific metrics or named technologies the candidate didn't claim.`;
  if (v >= 25) return voice + `Liberal tailoring (honesty ${v}/100). May add plausible accomplishments. Candidate must verify.`;
  return voice + `Aggressive (honesty ${v}/100). Optimize freely. HIGH fabrication risk.`;
}
