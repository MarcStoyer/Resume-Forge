import React, { useState } from "react";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON } from "../lib/parse.js";

// Returns a flat list of every bullet across all sections, with ids and section refs.
function flattenBullets(resume) {
  const out = [];
  resume.sections.forEach((sec) => {
    if (sec.kind === "entries") {
      sec.entries.forEach((en) => {
        en.bullets.forEach((b) => {
          out.push({ sectionId: sec.id, entryId: en.id, bulletId: b.id, text: b.text, on: b.on, org: en.org, role: en.role });
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

export default function JobMatcher({ resume, applyResume }) {
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { picks: [{id, why}], rationale }
  const [snapshotBefore, setSnapshotBefore] = useState(null);

  async function analyze() {
    if (!jd.trim()) { setErr("Paste the job description first."); return; }
    setErr(""); setLoading(true); setResult(null);
    try {
      // Build a numbered catalog so the model returns indices, not free-form text.
      const flat = flattenBullets(resume);
      const catalog = flat.map((b, i) => `[${i}] ${b.text}`).join("\n");
      const system =
        'You are an expert résumé tailorer. Given a job description and a numbered list of bullet candidates from a candidate\'s résumé, choose the bullets that BEST match this specific role. Prefer concrete, achievement-oriented bullets that reflect the role\'s top requirements. Return ONLY JSON in this exact shape: {"picks":[{"i":<integer index>,"why":"<short reason, max 12 words>"}],"rationale":"<one sentence overall strategy>"}. Pick between 6 and 12 bullets total. Do not invent indices outside the provided list. No markdown, no commentary, no extra fields.';
      const user = `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE BULLET CATALOG:\n${catalog}`;
      const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 1200 });
      const parsed = extractJSON(extractText(data));
      if (!parsed || !Array.isArray(parsed.picks)) { setErr("Couldn't parse the suggestions — try again."); return; }
      // Map indices back to the actual bullet/item ids.
      const picks = parsed.picks
        .map((p) => ({ ...flat[p.i], why: p.why }))
        .filter((p) => p && p.text);
      setResult({ picks, rationale: parsed.rationale || "" });
    } catch (e) {
      setErr("Match failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // Apply: turn ON the recommended bullets, turn OFF everything else (and make sure
  // their parent entries are also ON). Snapshot first so user can undo.
  function applyPicks() {
    if (!result) return;
    setSnapshotBefore(JSON.parse(JSON.stringify(resume)));
    const pickSet = new Set(result.picks.map((p) => p.bulletId || p.itemId));
    const entriesWithPicks = new Set(result.picks.filter((p) => p.entryId).map((p) => p.entryId));
    const next = {
      ...resume,
      sections: resume.sections.map((sec) => {
        if (sec.kind === "entries") {
          return {
            ...sec,
            entries: sec.entries.map((en) => ({
              ...en,
              on: entriesWithPicks.has(en.id) ? true : en.on, // keep entries the user already had on; force-on those that have picks
              bullets: en.bullets.map((b) => ({ ...b, on: pickSet.has(b.id) })),
            })),
          };
        }
        return {
          ...sec,
          entries: sec.entries.map((it) => ({ ...it, on: pickSet.has(it.id) })),
        };
      }),
    };
    applyResume(next);
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
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={analyze}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-white text-xs font-medium disabled:opacity-50"
          style={{ background: "#1f4e5f" }}
        >
          {loading ? "Analyzing…" : "🎯 Match my bullets"}
        </button>
        {result && (
          <button onClick={applyPicks} className="px-3 py-1.5 rounded-md text-xs font-medium border border-teal-300 text-teal-800 hover:bg-teal-50">
            Apply selection ({result.picks.length} bullets)
          </button>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {result && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          {result.rationale && <div className="text-xs text-stone-600 mb-2 italic">{result.rationale}</div>}
          <div className="space-y-1.5">
            {result.picks.map((p, i) => (
              <div key={i} className="text-xs flex gap-2">
                <span className="text-teal-700 font-semibold shrink-0">✓</span>
                <div>
                  <div className="text-stone-800">{p.text}</div>
                  {p.why && <div className="text-stone-400 text-[11px] italic">{p.why}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-stone-400 mt-2">Review the picks first — then click <b>Apply selection</b> to update the résumé. Use <b>Undo apply</b> to revert.</div>
        </div>
      )}
    </div>
  );
}
