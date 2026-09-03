import { callClaude } from "./api.js";
import { extractText, extractJSON } from "./parse.js";
import { honestyPromptForInterview } from "./honesty.js";
import { flattenBullets, flattenEntries } from "./resumeFlatten.js";

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

export async function generateInterviewPrep({ jd, company, role, resume, coverLetter, notes, honesty }) {
  const { submitted, master } = buildCatalogs(resume);
  const candidateName = resume?.contact?.name || "the candidate";
  const honestyDir = honestyPromptForInterview(typeof honesty === "number" ? honesty : 75);

  const system = [
    "You are an expert interview coach. Given a job description and everything known about a candidate, produce likely interview questions and evidence-grounded answer prep.",
    "",
    "QUESTIONS: Propose 8-12 questions blending three kinds — (a) questions clearly tied to specific JD requirements or the submitted résumé, (b) gap-probing questions where the JD wants something the submitted résumé doesn't obviously cover, and (c) standard/typical questions a candidate for this kind of role and company would commonly face, drawing on your general knowledge of interview practice — not only résumé-derived ones. Give each a one-line 'whyLikely' tied to the JD, the role, the company, or an identified gap.",
    "",
    "EVIDENCE: For each question, cite real evidence from the sources given below (submitted résumé, master CV, cover letter, notes) in the 'evidence' array, tagging each item's 'source'. Prefer the submitted résumé, then the master CV, then the cover letter or notes. Evidence must be things the candidate actually wrote — do not paraphrase into something untrue.",
    "",
    "ANSWER OUTLINE: Write 'answerOutline' as a short structured outline (e.g. STAR: situation/task/action/result) built from the cited evidence. If there is no real evidence to answer the question honestly, set missingEvidence:true and keep answerOutline brief (state what's missing and what kind of example the candidate should prepare) — do not invent a fabricated answer here.",
    "",
    honestyDir,
    "",
    'Return ONLY JSON: {"questions":[{"category":"behavioral|technical|role-fit|company|gap-probe","question":"...","whyLikely":"...","evidence":[{"source":"resume|masterCV|coverLetter|notes","ref":"Org — Role or short label","text":"..."}],"answerOutline":"...","missingEvidence":true|false,"suggestion":"..."|null}]}',
    "No markdown, no extra commentary outside the JSON.",
  ].join("\n");

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

  const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 8000 });
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
