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
  if (v >= 95) return "HONESTY MODE: VERBATIM. Do not rewrite. Return content EXACTLY as provided.";
  if (v >= 75) return `HONESTY MODE: FAITHFUL (level ${v}/100). You may reword and reframe existing content. Use stronger verbs, surface relevant keywords from the JD that are ALREADY supported by the original. You MUST NOT invent facts, add specific numbers/metrics that weren't there, claim new tools or technologies, or fabricate outcomes.`;
  if (v >= 50) return `HONESTY MODE: BALANCED (level ${v}/100). Reword for impact and add reasonable inferences. Do not invent specific numerical claims, named technologies the candidate didn't mention, or fabricated outcomes.`;
  if (v >= 25) return `HONESTY MODE: LIBERAL (level ${v}/100). Aggressively rewrite to match the JD. May add plausible accomplishments and inferred metrics. WARNING: candidate must verify each bullet.`;
  return `HONESTY MODE: AGGRESSIVE (level ${v}/100). Optimize for keyword match. May invent specific accomplishments and metrics. HIGH FABRICATION RISK.`;
}
export function honestyPromptForSynthesis(v) {
  if (v >= 95) return "Use only language and facts directly present in the source résumé. No additions, no inferences.";
  if (v >= 75) return `Stay faithful to the candidate's actual experience (honesty ${v}/100). Reframe and emphasize for the role, but do not invent new accomplishments, skills, tools, or metrics.`;
  if (v >= 50) return `Balanced tailoring (honesty ${v}/100). May make reasonable inferences from context. Do not invent specific metrics or named technologies the candidate didn't claim.`;
  if (v >= 25) return `Liberal tailoring (honesty ${v}/100). May add plausible accomplishments. Candidate must verify.`;
  return `Aggressive (honesty ${v}/100). Optimize freely. HIGH fabrication risk.`;
}
