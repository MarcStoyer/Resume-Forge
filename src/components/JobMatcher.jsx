import React, { useState } from "react";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON } from "../lib/parse.js";
import { honestyPromptFragment, honestyPromptForSynthesis } from "../lib/honesty.js";
import { deepClone } from "../lib/util.js";

function flattenBullets(resume) {
  const out = [];
  resume.sections.forEach((sec) => {
    if (sec.kind === "entries") {
      sec.entries.forEach((en) => {
        en.bullets.forEach((b) => {
          out.push({
            sectionId: sec.id, entryId: en.id, bulletId: b.id,
            text: b.text, original: b.original || b.text, on: b.on,
            org: en.org, role: en.role,
          });
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
function flattenEntries(resume) {
  const out = [];
  resume.sections.forEach((sec) => {
    if (sec.kind !== "entries") return;
    sec.entries.forEach((en) => {
      out.push({ sectionId: sec.id, entryId: en.id, org: en.org, role: en.role, dates: en.dates });
    });
  });
  return out;
}

export default function JobMatcher({ resume, applyResume, honesty, jd, setJd, setCoverLetter, openCoverTab, jobUrl, setJobUrl }) {
  const [mode, setMode] = useState("pick");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [snapshotBefore, setSnapshotBefore] = useState(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [collapsedResult, setCollapsedResult] = useState(false); // NEW — hides picks after Apply
  const [appliedSummary, setAppliedSummary] = useState(null);    // NEW — small summary line to show once collapsed

  async function fetchFromUrl() {
    if (!jobUrl?.trim()) { setErr("Paste a job posting URL first."); return; }
    setErr(""); setFetchingUrl(true);
    try {
      const r = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: jobUrl.trim() }),
      });
      const data = await r.json();
      if (!data.ok || !data.text) {
        setErr((data.message || "Couldn't fetch that page.") + " Try pasting the description text instead.");
        return;
      }
      const system = "You are given the raw text content of a job-posting web page (with nav, footer, and other noise). Extract ONLY the job description — title, responsibilities, qualifications, and about-the-role content. Omit navigation, cookie notices, footers, related jobs, application instructions. Return plain text, no markdown.";
      const cd = await callClaude({ system, messages: [{ role: "user", content: data.text }], max_tokens: 3000 });
      const clean = extractText(cd).trim();
      if (clean) setJd(clean);
      else setErr("Fetched the page but couldn't extract a job description. Try pasting it.");
    } catch (e) {
      setErr("URL fetch failed: " + e.message);
    } finally {
      setFetchingUrl(false);
    }
  }

  async function analyze() {
    if (!jd.trim()) { setErr("Paste the job description first (or fetch from a URL)."); return; }
    setErr(""); setLoading(true); setResult(null); setCollapsedResult(false); setAppliedSummary(null);
    try {
      const flatB = flattenBullets(resume);
      const flatE = flattenEntries(resume);
      const bulletCatalog = flatB.map((b, i) => `[B${i}] ${b.original || b.text}`).join("\n");
      const entryCatalog = flatE.map((e, i) => `[E${i}] ${e.org} — ${e.role} (${e.dates})`).join("\n");
      const candidateName = resume.contact.name || "the candidate";
      const synthDir = honestyPromptForSynthesis(honesty);

      if (mode === "pick") {
        setPhase("Picking your best bullets and entries...");
        const system =
          'You are an expert résumé tailorer. Choose the bullets that BEST match the role, and decide which whole entries (jobs/schools) to KEEP or REMOVE — remove an entry entirely if it does not fit the role.\n' +
          'Return ONLY JSON: {"picks":[{"i":<index>,"why":"<≤12 words>"}],"entries":[{"i":<index>,"keep":<true|false>,"why":"<≤12 words>"}],"rationale":"<one sentence>"}\n' +
          'Pick 6–12 bullets. For entries, include EVERY entry in the input with explicit keep:true/false. No markdown, no extra fields.';
        const user = `JOB DESCRIPTION:\n${jd}\n\nENTRY CATALOG:\n${entryCatalog}\n\nBULLET CATALOG:\n${bulletCatalog}`;
        const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 2000 });
        const parsed = extractJSON(extractText(data));
        if (!parsed || !Array.isArray(parsed.picks)) { setErr("Couldn't parse the suggestions — try again."); return; }
        const picks = parsed.picks.map((p) => ({ ...flatB[p.i], why: p.why, checked: true, edited: null }))
          .filter((p) => p && p.text);
        const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).map((e) => ({
          ...flatE[e.i], keep: e.keep !== false, why: e.why, checked: true,
        })).filter((e) => e && e.entryId);
        setResult({ mode: "pick", picks, entries, rationale: parsed.rationale || "" });
      } else {
        setPhase("Tailoring bullets, summary, and cover letter...");
        const honestyDir = honestyPromptFragment(honesty);
        const system =
          "You are an expert résumé and cover-letter writer. Given a job description, a candidate's bullets, and their entries, choose bullets that best match the role, decide which whole entries to KEEP or REMOVE, rewrite chosen bullets, and write a tailored professional summary and cover letter.\n\n" +
          honestyDir + "\n\n" +
          'Return ONLY JSON in this shape:\n' +
          '{"picks":[{"i":<index>,"rewrite":"<rewritten bullet>","why":"<≤12 words>"}],' +
          '"entries":[{"i":<index>,"keep":<true|false>,"why":"<≤12 words>"}],' +
          '"summary":"<2–3 sentence first-person professional summary>",' +
          '"coverLetter":"<300–400 word first-person formal cover letter starting with \\"Dear Hiring Manager,\\" — no date, no address block, no markdown>",' +
          '"rationale":"<one sentence>"}\n\n' +
          "Pick 6–12 bullets. For entries, include EVERY entry with explicit keep. Each rewrite must honor the bullet voice/honesty rules above (action verbs, no 'I'). " +
          synthDir + " Escape newlines in strings as \\n. No markdown, no extras.";
        const user =
          `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE NAME: ${candidateName}\n\n` +
          `CURRENT SUMMARY:\n${resume.profile.original || resume.profile.text}\n\n` +
          `ENTRY CATALOG:\n${entryCatalog}\n\nBULLET CATALOG:\n${bulletCatalog}`;
        const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 5000 });
        const parsed = extractJSON(extractText(data));
        if (!parsed || !Array.isArray(parsed.picks)) { setErr("Couldn't parse the full tailor result — try again, or use 'Just pick'."); return; }
        const picks = parsed.picks.map((p) => ({ ...flatB[p.i], rewrite: p.rewrite, why: p.why, checked: true, edited: null }))
          .filter((p) => p && p.text);
        const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).map((e) => ({
          ...flatE[e.i], keep: e.keep !== false, why: e.why, checked: true,
        })).filter((e) => e && e.entryId);
        setResult({
          mode: "full", picks, entries,
          summary: parsed.summary || "", summaryChecked: true,
          coverLetter: parsed.coverLetter || "", coverChecked: true,
          rationale: parsed.rationale || "",
        });
      }
    } catch (e) {
      setErr("Failed: " + e.message);
    } finally {
      setLoading(false); setPhase("");
    }
  }

  function togglePick(i) { setResult((r) => { const n = deepClone(r); n.picks[i].checked = !n.picks[i].checked; return n; }); }
  function editPick(i, text) { setResult((r) => { const n = deepClone(r); n.picks[i].edited = text; return n; }); }
  function toggleEntry(i) { setResult((r) => { const n = deepClone(r); n.entries[i].checked = !n.entries[i].checked; return n; }); }
  function flipEntryKeep(i) { setResult((r) => { const n = deepClone(r); n.entries[i].keep = !n.entries[i].keep; return n; }); }
  function setAllPicks(on) { setResult((r) => { const n = deepClone(r); n.picks.forEach((p) => (p.checked = on)); return n; }); }

  function applyPicks() {
    if (!result) return;
    setSnapshotBefore(deepClone(resume));
    const acceptedPicks = result.picks.filter((p) => p.checked);
    const pickSet = new Set(acceptedPicks.map((p) => p.bulletId || p.itemId));
    const rewrites = {};
    if (result.mode === "full") {
      acceptedPicks.forEach((p) => {
        if (p.bulletId) {
          const finalText = p.edited != null ? p.edited : p.rewrite;
          if (finalText) rewrites[p.bulletId] = finalText;
        }
      });
    } else {
      acceptedPicks.forEach((p) => {
        if (p.bulletId && p.edited != null && p.edited !== p.text) rewrites[p.bulletId] = p.edited;
      });
    }
    const entryKeep = {};
    (result.entries || []).filter((e) => e.checked).forEach((e) => { entryKeep[e.entryId] = e.keep; });

    let next = {
      ...resume,
      profile:
        result.mode === "full" && result.summary && result.summaryChecked
          ? { ...resume.profile, text: result.summary, on: true }
          : resume.profile,
      sections: resume.sections.map((sec) => {
        if (sec.kind === "entries") {
          return {
            ...sec,
            entries: sec.entries.map((en) => {
              const explicitKeep = en.id in entryKeep ? entryKeep[en.id] : null;
              const acceptedBulletIds = en.bullets.filter((b) => pickSet.has(b.id)).map((b) => b.id);
              const newBullets = en.bullets.map((b) => {
                const isPicked = pickSet.has(b.id);
                const rw = rewrites[b.id];
                return { ...b, on: isPicked, text: rw ? rw : b.text, tag: rw ? "TAILORED" : b.tag };
              });
              let entryOn;
              if (explicitKeep === false) entryOn = false;
              else if (explicitKeep === true) entryOn = true;
              else entryOn = acceptedBulletIds.length > 0;
              if (entryOn && acceptedBulletIds.length === 0) entryOn = false;
              return { ...en, on: entryOn, bullets: newBullets };
            }),
          };
        }
        return { ...sec, entries: sec.entries.map((it) => ({ ...it, on: pickSet.has(it.id) })) };
      }),
    };
    applyResume(next);
    if (result.mode === "full" && result.coverLetter && result.coverChecked && setCoverLetter) {
      setCoverLetter(result.coverLetter);
    }

    // Auto-collapse the results panel after applying
    const removedEntries = (result.entries || []).filter((e) => e.checked && !e.keep).length;
    setAppliedSummary({
      bullets: acceptedPicks.length,
      removedEntries,
      appliedSummary: result.mode === "full" && result.summaryChecked && !!result.summary,
      appliedCover: result.mode === "full" && result.coverChecked && !!result.coverLetter,
      at: Date.now(),
    });
    setCollapsedResult(true);
  }

  function undo() {
    if (snapshotBefore) { applyResume(snapshotBefore); setSnapshotBefore(null); setAppliedSummary(null); }
  }

  const checkedCount = result ? result.picks.filter((p) => p.checked).length : 0;
  const removeCount = result && result.entries ? result.entries.filter((e) => e.checked && !e.keep).length : 0;

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Tailor to a job</div>
        {snapshotBefore && (
          <button onClick={undo} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-600 hover:bg-stone-50">↶ Undo apply</button>
        )}
      </div>

      <div className="mb-2 flex gap-2">
        <input
          value={jobUrl || ""}
          onChange={(e) => setJobUrl && setJobUrl(e.target.value)}
          placeholder="Job posting URL (optional — many sites need login; pasting text is usually faster)"
          className="flex-1 text-xs border border-stone-200 rounded px-2 py-1.5 outline-none focus:border-stone-400"
        />
        <button
          onClick={fetchFromUrl} disabled={fetchingUrl || !jobUrl?.trim()}
          className="text-xs px-3 py-1.5 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
        >
          {fetchingUrl ? "Fetching…" : "Fetch"}
        </button>
      </div>

      <textarea
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        rows={5}
        placeholder="…or paste the job description here directly."
        className="w-full text-sm border border-stone-200 rounded p-2 outline-none focus:border-stone-400"
      />

      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={mode === "pick"} onChange={() => setMode("pick")} className="accent-teal-800" />
          <span>Just pick (bullets + remove unfit jobs)</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} className="accent-teal-800" />
          <span>Full auto-tailor (also rewrite + summary + cover)</span>
        </label>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={analyze} disabled={loading} className="px-3 py-1.5 rounded-md text-white text-xs font-medium disabled:opacity-50" style={{ background: "#1f4e5f" }}>
          {loading ? (phase || "Working…") : (mode === "full" ? "🚀 Auto-Tailor" : "🎯 Match my bullets")}
        </button>
        {result && !collapsedResult && (
          <>
            <button onClick={applyPicks} className="px-3 py-1.5 rounded-md text-xs font-medium border border-teal-300 text-teal-800 hover:bg-teal-50">
              Apply ({checkedCount} bullets{removeCount ? `, ${removeCount} entries removed` : ""}{result.mode === "full" ? " + summary + cover" : ""})
            </button>
            {result.mode === "full" && result.coverLetter && openCoverTab && (
              <button onClick={openCoverTab} className="text-xs underline text-stone-600 hover:text-stone-900">Cover letter tab →</button>
            )}
          </>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {/* Applied summary — collapsed state */}
      {result && collapsedResult && appliedSummary && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-teal-700 flex items-center gap-2">
              <span className="font-semibold">✓ Applied.</span>
              <span className="text-stone-600">
                {appliedSummary.bullets} bullets
                {appliedSummary.removedEntries > 0 && `, ${appliedSummary.removedEntries} entries removed`}
                {appliedSummary.appliedSummary && ", summary updated"}
                {appliedSummary.appliedCover && ", cover letter updated"}
              </span>
            </div>
            <button
              onClick={() => setCollapsedResult(false)}
              className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-600 hover:bg-stone-50"
            >
              Show details ▾
            </button>
          </div>
        </div>
      )}

      {/* Expanded results — visible before apply, or after "Show details" */}
      {result && !collapsedResult && (
        <div className="mt-3 border-t border-stone-100 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            {result.rationale && <div className="text-xs text-stone-600 italic">{result.rationale}</div>}
            {appliedSummary && (
              <button onClick={() => setCollapsedResult(true)} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-500 hover:bg-stone-50">Hide ▴</button>
            )}
          </div>

          {result.entries && result.entries.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Entries</div>
              <div className="space-y-1 text-xs">
                {result.entries.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="checkbox" checked={e.checked} onChange={() => toggleEntry(i)} className="w-3.5 h-3.5 accent-teal-800" />
                    <button onClick={() => flipEntryKeep(i)} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${e.keep ? "bg-teal-50 text-teal-700 border border-teal-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{e.keep ? "KEEP" : "REMOVE"}</button>
                    <span className="text-stone-700">{e.org}</span>
                    <span className="text-stone-400 italic">— {e.role}</span>
                    {e.why && <span className="text-stone-400 italic ml-1">({e.why})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Bullets ({checkedCount}/{result.picks.length} kept)</div>
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => setAllPicks(true)} className="text-stone-500 hover:text-teal-700">All</button>
                <span className="text-stone-300">|</span>
                <button onClick={() => setAllPicks(false)} className="text-stone-500 hover:text-red-600">None</button>
              </div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {result.picks.map((p, i) => {
                const display = p.edited != null ? p.edited : (p.rewrite || p.text);
                const isRewritten = !!p.rewrite && p.rewrite !== p.text;
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={p.checked} onChange={() => togglePick(i)} className="mt-1.5 w-3.5 h-3.5 accent-teal-800 shrink-0" />
                    <div className={`flex-1 min-w-0 ${p.checked ? "" : "opacity-40"}`}>
                      <textarea value={display} onChange={(e) => editPick(i, e.target.value)} rows={2} className="w-full text-xs leading-snug border border-stone-200 rounded px-1.5 py-1 outline-none focus:border-stone-400 resize-none bg-white" />
                      {isRewritten && <div className="text-stone-400 text-[10px] italic truncate mt-0.5">original: {p.text}</div>}
                      {p.why && <div className="text-stone-500 text-[10px] italic">{p.why}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {result.mode === "full" && (
            <>
              {result.summary && (
                <div className="border-t border-stone-100 pt-2">
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">
                    <input type="checkbox" checked={!!result.summaryChecked} onChange={() => setResult((r) => ({ ...r, summaryChecked: !r.summaryChecked }))} className="w-3.5 h-3.5 accent-teal-800" />
                    Apply new summary
                  </label>
                  <textarea value={result.summary} onChange={(e) => setResult((r) => ({ ...r, summary: e.target.value }))} rows={3} className="w-full text-xs border border-stone-200 rounded p-1.5 outline-none focus:border-stone-400" />
                </div>
              )}
              {result.coverLetter && (
                <div className="border-t border-stone-100 pt-2">
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">
                    <input type="checkbox" checked={!!result.coverChecked} onChange={() => setResult((r) => ({ ...r, coverChecked: !r.coverChecked }))} className="w-3.5 h-3.5 accent-teal-800" />
                    Apply new cover letter (editable in Cover Letter tab)
                  </label>
                  <textarea value={result.coverLetter} onChange={(e) => setResult((r) => ({ ...r, coverLetter: e.target.value }))} rows={6} className="w-full text-xs border border-stone-200 rounded p-1.5 outline-none focus:border-stone-400 font-mono" />
                </div>
              )}
            </>
          )}
          <div className="text-[11px] text-stone-400">Review and edit each suggestion → uncheck what you don't want → click <b>Apply</b>. Use <b>Undo apply</b> to revert.</div>
        </div>
      )}
    </div>
  );
}
