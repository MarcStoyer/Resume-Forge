import React, { useState } from "react";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON } from "../lib/parse.js";
import { honestyPromptFragment, honestyPromptForSynthesis } from "../lib/honesty.js";

function flattenBullets(resume) {
  const out = [];
  resume.sections.forEach((sec) => {
    if (sec.kind === "entries") {
      sec.entries.forEach((en) => {
        en.bullets.forEach((b) => {
          out.push({ sectionId: sec.id, entryId: en.id, bulletId: b.id, text: b.text, original: b.original || b.text, on: b.on, org: en.org, role: en.role });
        });
      });
    } else {
      sec.entries.forEach((it) => {
        out.push({ sectionId: sec.id, itemId: it.id, text: (it.label ? it.label + ": " : "") + it.text, on: it.on });
      });
    }
  });
  return out;
}

export default function JobMatcher({ resume, applyResume, honesty, jd, setJd, setCoverLetter, openCoverTab }) {
  const [mode, setMode] = useState("pick"); // 'pick' | 'full'
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { picks, rewrites, summary, coverLetter, rationale }
  const [snapshotBefore, setSnapshotBefore] = useState(null);

  async function analyze() {
    if (!jd.trim()) { setErr("Paste the job description first."); return; }
    setErr(""); setLoading(true); setResult(null);
    try {
      const flat = flattenBullets(resume);
      const catalog = flat.map((b, i) => `[${i}] ${b.original || b.text}`).join("\n");

      if (mode === "pick") {
        setPhase("Picking your best bullets...");
        const system =
          'You are an expert résumé tailorer. Given a job description and a numbered list of bullet candidates from a candidate\'s résumé, choose the bullets that BEST match this specific role. Prefer concrete, achievement-oriented bullets that reflect the role\'s top requirements. Return ONLY JSON in this exact shape: {"picks":[{"i":<integer index>,"why":"<short reason, max 12 words>"}],"rationale":"<one sentence overall strategy>"}. Pick between 6 and 12 bullets total. Do not invent indices outside the provided list. No markdown, no commentary, no extra fields.';
        const user = `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE BULLET CATALOG:\n${catalog}`;
        const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 1500 });
        const parsed = extractJSON(extractText(data));
        if (!parsed || !Array.isArray(parsed.picks)) { setErr("Couldn't parse the suggestions — try again."); return; }
        const picks = parsed.picks.map((p) => ({ ...flat[p.i], why: p.why })).filter((p) => p && p.text);
        setResult({ mode: "pick", picks, rationale: parsed.rationale || "" });
      } else {
        // FULL TAILOR — bullets picked + rewritten, plus summary + cover letter, in ONE call
        setPhase("Tailoring everything (bullets, summary, cover letter)...");
        const honestyDir = honestyPromptFragment(honesty);
        const synthDir = honestyPromptForSynthesis(honesty);
        const candidateName = resume.contact.name || "the candidate";

        const system =
          `You are an expert résumé and cover-letter writer. You will receive a job description, a numbered list of bullet candidates from a candidate's résumé, and the candidate's current profile summary.\n\n` +
          honestyDir + "\n\n" +
          "Return ONLY JSON in this exact shape:\n" +
          '{"picks":[{"i":<index>,"rewrite":"<rewritten bullet>","why":"<reason, max 12 words>"}],' +
          '"summary":"<2-3 sentence professional summary tailored to the JD>",' +
          '"coverLetter":"<300-400 word cover letter, 3-4 paragraphs, no salutation date or address blocks, starts with \\"Dear Hiring Manager,\\">",' +
          '"rationale":"<one sentence overall strategy>"}\n\n' +
          "Pick 6-12 bullets total. For each pick, the 'rewrite' field MUST follow the honesty mode above. " +
          synthDir + " " +
          "No markdown, no commentary, no extra fields. Strings must be valid JSON (escape newlines as \\n).";
        const user =
          `JOB DESCRIPTION:\n${jd}\n\n` +
          `CANDIDATE NAME: ${candidateName}\n\n` +
          `CURRENT PROFILE SUMMARY:\n${resume.profile.original || resume.profile.text}\n\n` +
          `CANDIDATE BULLET CATALOG:\n${catalog}`;
        const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 4000 });
        const parsed = extractJSON(extractText(data));
        if (!parsed || !Array.isArray(parsed.picks)) { setErr("Couldn't parse the full tailor result — try again, or use 'Just pick'."); return; }
        const picks = parsed.picks.map((p) => ({ ...flat[p.i], rewrite: p.rewrite, why: p.why })).filter((p) => p && p.text);
        setResult({
          mode: "full", picks,
          summary: parsed.summary || "",
          coverLetter: parsed.coverLetter || "",
          rationale: parsed.rationale || "",
        });
      }
    } catch (e) {
      setErr("Failed: " + e.message);
    } finally {
      setLoading(false); setPhase("");
    }
  }

  function applyPicks() {
    if (!result) return;
    setSnapshotBefore(JSON.parse(JSON.stringify(resume)));
    const pickSet = new Set(result.picks.map((p) => p.bulletId || p.itemId));
    const rewrites = {};
    if (result.mode === "full") {
      result.picks.forEach((p) => {
        if (p.bulletId && p.rewrite) rewrites[p.bulletId] = p.rewrite;
      });
    }
    const entriesWithPicks = new Set(result.picks.filter((p) => p.entryId).map((p) => p.entryId));
    const next = {
      ...resume,
      profile: result.mode === "full" && result.summary
        ? { ...resume.profile, text: result.summary }
        : resume.profile,
      sections: resume.sections.map((sec) => {
        if (sec.kind === "entries") {
          return {
            ...sec,
            entries: sec.entries.map((en) => ({
              ...en,
              on: entriesWithPicks.has(en.id) ? true : en.on,
              bullets: en.bullets.map((b) => {
                const isPicked = pickSet.has(b.id);
                const rw = rewrites[b.id];
                return {
                  ...b,
                  on: isPicked,
                  text: rw ? rw : b.text,
                  tag: rw ? "TAILORED" : b.tag,
                };
              }),
            })),
          };
        }
        return { ...sec, entries: sec.entries.map((it) => ({ ...it, on: pickSet.has(it.id) })) };
      }),
    };
    applyResume(next);
    if (result.mode === "full" && result.coverLetter && setCoverLetter) {
      setCoverLetter(result.coverLetter);
    }
  }

  function undo() {
    if (snapshotBefore) {
      applyResume(snapshotBefore);
      setSnapshotBefore(null);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Tailor to a job</div>
        {snapshotBefore && (
          <button onClick={undo} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-600 hover:bg-stone-50">↶ Undo apply</button>
        )}
      </div>
      <textarea
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        rows={5}
        placeholder="Paste the full job description here…"
        className="w-full text-sm border border-stone-200 rounded p-2 outline-none focus:border-stone-400"
      />

      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={mode === "pick"} onChange={() => setMode("pick")} className="accent-teal-800" />
          <span>Just pick my best bullets</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} className="accent-teal-800" />
          <span>Full auto-tailor (bullets + summary + cover letter)</span>
        </label>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={analyze}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-white text-xs font-medium disabled:opacity-50"
          style={{ background: "#1f4e5f" }}
        >
          {loading ? (phase || "Working…") : (mode === "full" ? "🚀 Auto-Tailor" : "🎯 Match my bullets")}
        </button>
        {result && (
          <button onClick={applyPicks} className="px-3 py-1.5 rounded-md text-xs font-medium border border-teal-300 text-teal-800 hover:bg-teal-50">
            Apply ({result.picks.length} bullets{result.mode === "full" ? " + summary + cover" : ""})
          </button>
        )}
        {result && result.mode === "full" && result.coverLetter && openCoverTab && (
          <button onClick={openCoverTab} className="text-xs underline text-stone-600 hover:text-stone-900">View cover letter →</button>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {result && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          {result.rationale && <div className="text-xs text-stone-600 mb-2 italic">{result.rationale}</div>}
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {result.picks.map((p, i) => (
              <div key={i} className="text-xs flex gap-2">
                <span className="text-teal-700 font-semibold shrink-0">✓</span>
                <div className="min-w-0">
                  <div className="text-stone-800">{p.rewrite || p.text}</div>
                  {p.rewrite && p.text !== p.rewrite && (
                    <div className="text-stone-400 text-[10px] italic line-through truncate">{p.text}</div>
                  )}
                  {p.why && <div className="text-stone-500 text-[10px] italic">{p.why}</div>}
                </div>
              </div>
            ))}
          </div>
          {result.mode === "full" && result.summary && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">New summary</div>
              <div className="text-xs text-stone-700">{result.summary}</div>
            </div>
          )}
          <div className="text-[11px] text-stone-400 mt-2">Review the picks first — then click <b>Apply</b>. Use <b>Undo apply</b> to revert.</div>
        </div>
      )}
    </div>
  );
}
