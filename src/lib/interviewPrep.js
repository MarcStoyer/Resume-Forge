import { callClaude } from "./api.js";
import { extractText, extractJSON } from "./parse.js";
import { honestyPromptForInterview } from "./honesty.js";
import { flattenBullets, flattenEntries } from "./resumeFlatten.js";

// Per-user interview prep settings, stored alongside interview_prep_auto /
// interview_honesty (see storage.js -> interview_prep_settings). Spread over
// this default so a partial/older stored object still works after new keys
// are added here later.
export const DEFAULT_INTERVIEW_PREP_SETTINGS = {
  // When interviewPrepAuto is on, "applied" fires at save/mark-applied time
  // (the original behavior); "interview" waits until the application's status
  // is moved to the Interview stage — no point prepping before one's scheduled.
  trigger: "applied", // "applied" | "interview"
  reasoning: true, // include a one-line "why likely" for each question
  examples: true, // include cited evidence from the résumé/cover letter/notes
  answers: true, // include the answer outline, missing-evidence flag, and suggestion
  depth: "standard", // "quick" | "standard" | "deep"
};

// Question count target + token budget per depth. max_tokens is capped at
// 8000 across the board (matches the résumé-extraction call, which has
// similar output complexity and is known not to get clamped/truncated) —
// "deep" asks for richer per-question detail within that same budget rather
// than a larger one, since asking for more than the model reliably supports
// re-creates the truncation bug this replaced.
const DEPTH = {
  quick: {
    questions: "4-6",
    maxTokens: 3000,
    note: "Keep 'whyLikely' and 'answerOutline' to one short sentence each, and cite at most one evidence item per question — prioritize breadth over depth.",
  },
  standard: { questions: "8-12", maxTokens: 8000, note: "" },
  deep: {
    questions: "8-12",
    maxTokens: 8000,
    note: "Go deeper per question rather than adding more questions: cite up to 4 evidence items where available, and write fuller multi-sentence answer outlines that anticipate a likely follow-up — but stay concise enough that every question still fits in the response.",
  },
};

// Split one résumé snapshot into two evidence views:
// - submitted: only what was actually sent (on:true), using the final tailored text.
// - master: everything true about the candidate — on and off — using the original,
//   pre-tailor text. Nothing is fetched from anywhere else; a saved application's own
//   résumé snapshot already carries both, since tailoring only toggles on/off and never
//   deletes a bullet or entry.
export function buildCatalogs(resume) {
  const flatB = flattenBullets(resume);
  const flatE = flattenEntries(resume);
  const keptEntryIds = new Set(flatE.filter((e) => e.on !== false).map((e) => e.entryId));

  const submitted = flatB
    .filter((b) => b.on && (!b.entryId || keptEntryIds.has(b.entryId)))
    .map((b) => (b.org ? `${b.org} — ${b.role}: ${b.text}` : b.text));

  const master = flatB.map((b) => {
    const text = b.original || b.text;
    return b.org ? `${b.org} — ${b.role}: ${text}` : text;
  });

  return { submitted, master };
}

function formatList(items) {
  return items.length ? items.map((t) => `- ${t}`).join("\n") : "(none)";
}

export async function generateInterviewPrep({ jd, company, role, resume, coverLetter, notes, honesty, settings }) {
  const s = { ...DEFAULT_INTERVIEW_PREP_SETTINGS, ...(settings || {}) };
  const depth = DEPTH[s.depth] || DEPTH.standard;
  const { submitted, master } = buildCatalogs(resume);
  const candidateName = resume?.contact?.name || "the candidate";

  const schemaFields = ['"category":"behavioral|technical|role-fit|company|gap-probe"', '"question":"..."'];
  if (s.reasoning) schemaFields.push('"whyLikely":"..."');
  if (s.examples) {
    schemaFields.push('"evidence":[{"source":"resume|masterCV|coverLetter|notes","ref":"Org — Role or short label","text":"..."}]');
  }
  if (s.answers) schemaFields.push('"answerOutline":"...","missingEvidence":true|false,"suggestion":"..."|null');

  const system = [
    "You are an expert interview coach. Given a job description and everything known about a candidate, produce likely interview questions" +
      (s.answers ? " and evidence-grounded answer prep." : "."),
    "",
    `QUESTIONS: Propose ${depth.questions} questions blending three kinds — (a) questions clearly tied to specific JD requirements or the submitted résumé, (b) gap-probing questions where the JD wants something the submitted résumé doesn't obviously cover, and (c) standard/typical questions a candidate for this kind of role and company would commonly face, drawing on your general knowledge of interview practice — not only résumé-derived ones.` +
      (s.reasoning ? " Give each a one-line 'whyLikely' tied to the JD, the role, the company, or an identified gap." : ""),
  ];

  if (s.examples) {
    system.push(
      "",
      "EVIDENCE: For each question, cite real evidence from the sources given below (submitted résumé, master CV, cover letter, notes) in the 'evidence' array, tagging each item's 'source'. Prefer the submitted résumé, then the master CV, then the cover letter or notes. Evidence must be things the candidate actually wrote — do not paraphrase into something untrue."
    );
  }

  if (s.answers) {
    system.push(
      "",
      "ANSWER OUTLINE: Write 'answerOutline' as a short structured outline (e.g. STAR: situation/task/action/result) grounded in real specifics from the résumé, cover letter, or notes below" +
        (s.examples ? ", matching what you cited in 'evidence'" : "") +
        ". If there is no real evidence to answer the question honestly, set missingEvidence:true and keep answerOutline brief (state what's missing and what kind of example the candidate should prepare) — do not invent a fabricated answer here.",
      "",
      honestyPromptForInterview(typeof honesty === "number" ? honesty : 75)
    );
  }

  if (depth.note) system.push("", depth.note);

  system.push(
    "",
    `Return ONLY JSON: {"questions":[{${schemaFields.join(",")}}]}`,
    "No markdown, no extra commentary outside the JSON."
  );

  const user = [
    `JOB DESCRIPTION:\n${jd}`,
    company ? `COMPANY: ${company}` : "",
    role ? `ROLE: ${role}` : "",
    `CANDIDATE NAME: ${candidateName}`,
    `SUBMITTED RÉSUMÉ (what was actually sent for this application):\n${formatList(submitted)}`,
    `MASTER CV (everything true about the candidate, including bullets not used in this submission):\n${formatList(master)}`,
    coverLetter?.trim() ? `COVER LETTER FOR THIS APPLICATION:\n${coverLetter.trim()}` : "",
    notes?.trim() ? `CANDIDATE'S OWN NOTES ON THIS APPLICATION:\n${notes.trim()}` : "",
  ].filter(Boolean).join("\n\n");

  const data = await callClaude({ system: system.join("\n"), messages: [{ role: "user", content: user }], max_tokens: depth.maxTokens });
  const parsed = extractJSON(extractText(data));
  if (!parsed || !Array.isArray(parsed.questions)) {
    const truncated = data?.stop_reason === "max_tokens";
    throw new Error(
      truncated
        ? "The response was cut off before finishing (hit the token limit) — try again."
        : "Couldn't parse interview prep from the response — try again."
    );
  }
  return parsed.questions;
}
