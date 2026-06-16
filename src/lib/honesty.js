// The honesty slider controls how freely AI features may invent or embellish.
// 0   = will fabricate freely to match the JD (DANGEROUS)
// 50  = may add reasonable-sounding details and infer accomplishments
// 75  = rewords/reframes only what's already in the bullet (DEFAULT — safe sweet spot)
// 100 = literally cannot change a single word; refuses to rewrite

export function honestyLabel(v) {
  if (v <= 10) return "Aggressive (may fabricate)";
  if (v <= 35) return "Liberal (adds details)";
  if (v <= 60) return "Balanced (infers from context)";
  if (v <= 85) return "Faithful (rewords only)";
  return "Verbatim (no changes)";
}

export function honestyColor(v) {
  if (v <= 35) return "#dc2626";  // red — danger
  if (v <= 60) return "#d97706";  // amber — caution
  if (v <= 85) return "#0f766e";  // teal — safe
  return "#475569";                // slate — locked
}

// Returns a prompt fragment to inject into any rewrite request.
export function honestyPromptFragment(v) {
  if (v >= 95) {
    return "HONESTY MODE: VERBATIM. Do not rewrite. Return the bullets EXACTLY as provided.";
  }
  if (v >= 75) {
    return `HONESTY MODE: FAITHFUL (level ${v}/100). You may reword and reframe existing content to better match the job description. Reorder phrases, use stronger verbs, surface relevant keywords from the JD that are ALREADY supported by the original bullet. You MUST NOT invent new facts, add specific numbers/metrics that weren't there, claim new tools or technologies, or fabricate outcomes.`;
  }
  if (v >= 50) {
    return `HONESTY MODE: BALANCED (level ${v}/100). You may reword for impact and add reasonable inferences (e.g., implied responsibilities, plausible scale). Do not invent specific numerical claims, named technologies the candidate didn't mention, or fabricated outcomes. Flag any added detail with [inferred] if you're uncertain.`;
  }
  if (v >= 25) {
    return `HONESTY MODE: LIBERAL (level ${v}/100). Aggressively rewrite to match the JD. May add plausible accomplishments and inferred metrics. WARNING: candidate must verify each bullet is defensible in an interview before submitting.`;
  }
  return `HONESTY MODE: AGGRESSIVE (level ${v}/100). Optimize for keyword match with the job description. May invent specific accomplishments and metrics. ⚠ HIGH FABRICATION RISK — candidate must extensively edit before use.`;
}

// Cover letter / summary use a softer phrasing
export function honestyPromptForSynthesis(v) {
  if (v >= 95) return "Use only language and facts directly present in the source résumé. No additions, no inferences.";
  if (v >= 75) return `Stay faithful to the candidate's actual experience (honesty ${v}/100). Reframe and emphasize for the role, but do not invent new accomplishments, skills, tools, or metrics.`;
  if (v >= 50) return `Balanced tailoring (honesty ${v}/100). You may make reasonable inferences from context. Do not invent specific metrics or named technologies the candidate didn't claim.`;
  if (v >= 25) return `Liberal tailoring (honesty ${v}/100). May add plausible accomplishments to fit the role. Candidate must verify.`;
  return `Aggressive (honesty ${v}/100). Optimize freely for the role. HIGH fabrication risk.`;
}
