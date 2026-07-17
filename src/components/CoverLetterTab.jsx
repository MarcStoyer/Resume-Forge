import React, { useState } from "react";
import { callClaude } from "../lib/api.js";
import { extractText } from "../lib/parse.js";
import { honestyPromptForSynthesis } from "../lib/honesty.js";
import { exportCoverLetterDocx } from "../lib/docxExport.js";

function buildResumeSummary(resume) {
  const lines = [];
  lines.push(`Name: ${resume.contact.name}`);
  if (resume.profile.text) lines.push(`Summary: ${resume.profile.text}`);
  const exp = resume.sections.find((s) => s.id === "exp");
  if (exp) {
    lines.push("\nExperience:");
    exp.entries.filter((e) => e.on).forEach((en) => {
      lines.push(`- ${en.role} at ${en.org} (${en.dates})`);
      en.bullets.filter((b) => b.on).forEach((b) => lines.push(`  • ${b.text}`));
    });
  }
  const skills = resume.sections.find((s) => s.id === "skills");
  if (skills) {
    lines.push("\nSkills:");
    skills.entries.filter((e) => e.on).forEach((it) => lines.push(`- ${it.label ? it.label + ": " : ""}${it.text}`));
  }
  return lines.join("\n");
}

export default function CoverLetterTab({ resume, jd, setJd, honesty, coverLetter, setCoverLetter }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function regenerate() {
    if (!jd.trim()) { setErr("Paste a job description first."); return; }
    setErr(""); setLoading(true);
    try {
      const synthDir = honestyPromptForSynthesis(honesty);
      const system =
        "You are an expert cover letter writer. Write a focused, specific, 300–400 word cover letter (3–4 paragraphs) tailored to the job description, using ONLY the facts in the candidate's résumé below. " +
        "Write in FIRST PERSON, FORMAL register. Do not use contractions. " +
        synthDir + " " +
        "Start with 'Dear Hiring Manager,' and end with the candidate's name. No address blocks, no date, no markdown. Plain prose only.";
      const user = `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE RÉSUMÉ:\n${buildResumeSummary(resume)}`;
      const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 1200 });
      const text = extractText(data).trim();
      setCoverLetter(text);
    } catch (e) {
      setErr("Failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function copyText() {
    navigator.clipboard.writeText(coverLetter).then(() => {}).catch(() => {});
  }

  return (
    <div className="max-w-4xl mx-auto p-5 space-y-4">
      <div className="bg-white rounded-lg border border-stone-200 p-4 no-print">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Job description</div>
        <textarea
          value={jd} onChange={(e) => setJd(e.target.value)} rows={5}
          placeholder="Paste the full job description here…"
          className="w-full text-sm border border-stone-200 rounded p-2 outline-none focus:border-stone-400"
        />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            onClick={regenerate} disabled={loading}
            className="px-3 py-1.5 rounded-md text-white text-xs font-medium disabled:opacity-50"
            style={{ background: "#1f4e5f" }}
          >
            {loading ? "Writing…" : (coverLetter ? "🔁 Regenerate" : "✍ Write cover letter")}
          </button>
          {coverLetter && (
            <>
              <button onClick={copyText} className="px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 hover:bg-stone-50">📋 Copy</button>
              <button onClick={() => exportCoverLetterDocx(coverLetter, resume.contact)} className="px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 hover:bg-stone-50">⬇ DOCX</button>
              <button onClick={() => window.print()} className="px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 hover:bg-stone-50">🖨 PDF</button>
            </>
          )}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-6 print-area">
        <textarea
          value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={20}
          placeholder="Your cover letter will appear here. You can edit freely after generation."
          className="w-full text-sm border-none outline-none resize-none leading-relaxed"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.6 }}
        />
      </div>
    </div>
  );
}
