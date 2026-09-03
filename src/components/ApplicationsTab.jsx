import React, { useRef, useState, useMemo } from "react";
import { saveAs } from "file-saver";
import { deepClone, uid } from "../lib/util.js";
import { STAGES, STAGE_IDS, stageById, computeFunnel, historyEntry } from "../lib/funnel.js";
import HonestySlider from "./HonestySlider.jsx";
import ImportApplicationsDialog from "./ImportApplicationsDialog.jsx";

const PREP_CATEGORY_LABEL = {
  behavioral: "Behavioral", technical: "Technical", "role-fit": "Role fit",
  company: "Company", "gap-probe": "Gap probe",
};
const PREP_SOURCE_LABEL = {
  resume: "Submitted résumé", masterCV: "Master CV", coverLetter: "Cover letter", notes: "Your notes",
};

const DEPTH_OPTIONS = [
  { id: "quick", label: "Quick", hint: "4-6 questions, terse — cheapest and fastest." },
  { id: "standard", label: "Standard", hint: "8-12 questions, full detail." },
  { id: "deep", label: "Deep", hint: "8-12 questions, richer evidence and answer outlines." },
];

// Gear icon next to the auto-generate toggle. Opens a small popover of
// interview-prep settings — when auto-generate fires, and what content each
// generation includes/how thorough it is. Purely a settings editor; actual
// generation stays in runInterviewPrep (App.jsx).
function InterviewPrepSettingsPopover({ settings, setSettings }) {
  const [open, setOpen] = useState(false);
  function patch(p) { setSettings({ ...settings, ...p }); }

  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        title="Interview prep settings" aria-label="Interview prep settings"
        className={`text-sm leading-none w-6 h-6 rounded flex items-center justify-center ${open ? "bg-stone-100 text-stone-700" : "text-stone-400 hover:text-stone-700 hover:bg-stone-100"}`}
      >
        ⚙
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-72 bg-white border border-stone-200 rounded-lg shadow-lg p-3 space-y-3 text-xs">
            <div>
              <div className="font-semibold text-stone-700 mb-1">Auto-generate when</div>
              <label className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input
                  type="radio" name="prep-trigger" checked={settings.trigger === "applied"}
                  onChange={() => patch({ trigger: "applied" })} className="accent-teal-800"
                />
                Saved or marked Applied
              </label>
              <label className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input
                  type="radio" name="prep-trigger" checked={settings.trigger === "interview"}
                  onChange={() => patch({ trigger: "interview" })} className="accent-teal-800"
                />
                Status set to Interview
              </label>
            </div>

            <div className="border-t border-stone-100 pt-2">
              <div className="font-semibold text-stone-700 mb-1">Depth</div>
              <div className="flex bg-stone-100 rounded-md p-0.5">
                {DEPTH_OPTIONS.map((d) => (
                  <button
                    key={d.id} type="button" onClick={() => patch({ depth: d.id })} title={d.hint}
                    className={`flex-1 px-1.5 py-1 rounded text-[11px] ${settings.depth === d.id ? "bg-white shadow-sm font-medium text-stone-800" : "text-stone-500"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-stone-400 mt-1">{(DEPTH_OPTIONS.find((d) => d.id === settings.depth) || DEPTH_OPTIONS[1]).hint}</div>
            </div>

            <div className="border-t border-stone-100 pt-2 space-y-1">
              <div className="font-semibold text-stone-700 mb-1">Include</div>
              <label className="flex items-center justify-between py-0.5 cursor-pointer">
                <span>Reasoning <span className="text-stone-400">— why each question is likely</span></span>
                <input type="checkbox" checked={settings.reasoning} onChange={(e) => patch({ reasoning: e.target.checked })} className="accent-teal-800" />
              </label>
              <label className="flex items-center justify-between py-0.5 cursor-pointer">
                <span>Examples <span className="text-stone-400">— evidence cited from your history</span></span>
                <input type="checkbox" checked={settings.examples} onChange={(e) => patch({ examples: e.target.checked })} className="accent-teal-800" />
              </label>
              <label className="flex items-center justify-between py-0.5 cursor-pointer">
                <span>Answers <span className="text-stone-400">— answer outlines & suggestions</span></span>
                <input type="checkbox" checked={settings.answers} onChange={(e) => patch({ answers: e.target.checked })} className="accent-teal-800" />
              </label>
            </div>

            <div className="text-[10px] text-stone-400 border-t border-stone-100 pt-2">Applies next time prep is generated for an application.</div>
          </div>
        </>
      )}
    </div>
  );
}

function fmtDate(ms) {
  try {
    const d = new Date(ms);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}

export default function ApplicationsTab({
  apps, setApps, currentResume, currentCoverLetter, currentJd,
  currentSnapshot, setCurrentSnapshot, loadApplication,
  interviewPrepAuto, setInterviewPrepAuto, interviewHonesty, setInterviewHonesty,
  interviewPrepSettings, setInterviewPrepSettings, runInterviewPrep, cancelInterviewPrep,
  attachResumeToApp, willUseApi,
}) {
  const fileRef = useRef(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [view, setView] = useState("list"); // 'list' | 'kanban' | 'funnel'
  const [expandedId, setExpandedId] = useState(null);
  const [importing, setImporting] = useState(false);

  // Migrate any old saved app missing status fields (defensive)
  const safeApps = useMemo(() => apps.map((a) => ({
    ...a,
    status: a.status || "saved",
    statusHistory: Array.isArray(a.statusHistory) && a.statusHistory.length
      ? a.statusHistory
      : [historyEntry(a.status || "saved")],
    notes: a.notes || "",
  })), [apps]);

  function exportAll() {
    const blob = new Blob([JSON.stringify(safeApps, null, 2)], { type: "application/json" });
    saveAs(blob, "resume-forge-applications.json");
  }
  async function importAll(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("expected an array");
      if (!confirm(`Import ${data.length} applications? Appends to current ${apps.length}.`)) return;
      const merged = [...apps, ...data.map((a) => ({ ...a, id: uid() }))];
      setApps(merged);
    } catch (err) {
      alert("Import failed: " + err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function deleteApp(id) {
    setApps(apps.filter((a) => a.id !== id));
    setConfirmDeleteId(null);
  }
  function load(app) {
    setCurrentSnapshot(deepClone({ resume: currentResume, coverLetter: currentCoverLetter, jd: currentJd }));
    loadApplication(app);
  }
  function restorePrevious() {
    if (!currentSnapshot) return;
    loadApplication({ resume: currentSnapshot.resume, coverLetter: currentSnapshot.coverLetter, jd: currentSnapshot.jd });
    setCurrentSnapshot(null);
  }

  function updateApp(id, patch) {
    setApps(apps.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function setStatus(app, newStatus, note = "") {
    if (newStatus === app.status) return;
    const history = [...(app.statusHistory || []), historyEntry(newStatus, note)];
    updateApp(app.id, { status: newStatus, statusHistory: history });
    if (
      interviewPrepAuto && interviewPrepSettings.trigger === "interview" &&
      newStatus === "interview" && !app.interviewPrep
    ) {
      runInterviewPrep(app);
    }
  }

  const counts = useMemo(() => computeFunnel(safeApps), [safeApps]);
  const totalSaved = counts.saved || 0;

  return (
    <div className="max-w-5xl mx-auto p-5 space-y-4">
      <div className="bg-white rounded-lg border border-stone-200 p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-semibold text-stone-800">Saved Applications</div>
          <div className="text-xs text-stone-500">{apps.length} saved — track each application's progress and load any as a starting point.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-stone-100 rounded-md p-0.5 text-xs">
            <button onClick={() => setView("list")} className={`px-2.5 py-1 rounded ${view === "list" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>List</button>
            <button onClick={() => setView("kanban")} className={`px-2.5 py-1 rounded ${view === "kanban" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>Kanban</button>
            <button onClick={() => setView("funnel")} className={`px-2.5 py-1 rounded ${view === "funnel" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>Funnel</button>
          </div>
          {currentSnapshot && (
            <button onClick={restorePrevious} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">↶ Restore previous state</button>
          )}
          <input ref={fileRef} type="file" accept=".json" onChange={importAll} className="hidden" />
          <button onClick={() => setImporting(true)} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">📊 Import sheet</button>
          <button onClick={() => fileRef.current?.click()} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">Import JSON</button>
          <button onClick={exportAll} disabled={!apps.length} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50 disabled:opacity-50">Export</button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 cursor-pointer">
              <input
                type="checkbox" checked={!!interviewPrepAuto}
                onChange={(e) => setInterviewPrepAuto(e.target.checked)}
                className="w-4 h-4 accent-teal-800"
              />
              🎯 Auto-generate interview prep
            </label>
            <InterviewPrepSettingsPopover settings={interviewPrepSettings} setSettings={setInterviewPrepSettings} />
          </div>
          <div className="text-[11px] text-stone-400 mt-1 max-w-md">
            Uses AI credits every time {interviewPrepSettings.trigger === "interview"
              ? "an application's status moves to Interview"
              : "you save or mark an application applied"}. Off by default —
            leave it off and generate per-application from the Details panel to control spend.
          </div>
        </div>
        <div className="w-full sm:w-72">
          <HonestySlider
            value={interviewHonesty} onChange={setInterviewHonesty} compact
            title="Interview prep honesty"
            hint="How far answer suggestions may go beyond verified evidence when it's thin. Evidence citations and missing-evidence flags stay honest either way."
          />
          <div className="text-[10px] text-stone-400 mt-1">Interview prep honesty — applies next time you generate.</div>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white rounded-lg border border-stone-200 p-8 text-center text-stone-500 text-sm">
          You haven't saved any applications yet. Click <b>★ Save application</b> in the top bar to bookmark one, or <b>Mark Applied with this résumé</b> after tailoring.
        </div>
      ) : view === "funnel" ? (
        <FunnelView counts={counts} apps={safeApps} />
      ) : view === "kanban" ? (
        <KanbanView apps={safeApps} setStatus={setStatus} load={load} />
      ) : (
        <ListView
          apps={safeApps} setStatus={setStatus} updateApp={updateApp}
          load={load} confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId}
          deleteApp={deleteApp} expandedId={expandedId} setExpandedId={setExpandedId}
          runInterviewPrep={runInterviewPrep} cancelInterviewPrep={cancelInterviewPrep}
          currentCoverLetter={currentCoverLetter}
          attachResumeToApp={attachResumeToApp} willUseApi={willUseApi}
        />
      )}

      {importing && (
        <ImportApplicationsDialog
          onCancel={() => setImporting(false)}
          onImport={(records) => setApps([...apps, ...records])}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = stageById(status);
  return <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide text-white" style={{ background: s.color }}>{s.label}</span>;
}

function ListView({ apps, setStatus, updateApp, load, confirmDeleteId, setConfirmDeleteId, deleteApp, expandedId, setExpandedId, runInterviewPrep, cancelInterviewPrep, currentCoverLetter, attachResumeToApp, willUseApi }) {
  return (
    <div className="space-y-2">
      {apps.slice().sort((a, b) => b.savedAt - a.savedAt).map((app) => {
        const isOpen = expandedId === app.id;
        return (
          <div key={app.id} className="bg-white rounded-lg border border-stone-200">
            <div className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={app.status} />
                  <div className="font-semibold text-stone-800 text-sm">{app.label || "Untitled"}</div>
                  {app.company && <div className="text-xs text-stone-500">@ {app.company}</div>}
                  {app.role && <div className="text-xs text-stone-500">— {app.role}</div>}
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  Saved {fmtDate(app.savedAt)}
                  {app.source && <span> · via {app.source}</span>}
                </div>
                {app.jobUrl && <div className="text-[11px] text-blue-700 underline truncate"><a href={app.jobUrl} target="_blank" rel="noreferrer">{app.jobUrl}</a></div>}
                {app.jd && !isOpen && <div className="text-xs text-stone-500 mt-1 line-clamp-2">{app.jd.slice(0, 220)}{app.jd.length > 220 ? "…" : ""}</div>}
              </div>
              <div className="flex flex-col gap-1 shrink-0 items-end">
                <select value={app.status} onChange={(e) => setStatus(app, e.target.value)} className="text-xs border border-stone-300 rounded px-1.5 py-0.5 bg-white">
                  {STAGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
                </select>
                <div className="flex gap-1">
                  <button onClick={() => load(app)} className="text-[11px] px-2 py-0.5 rounded text-white" style={{ background: "#1f4e5f" }}>Load</button>
                  <button onClick={() => setExpandedId(isOpen ? null : app.id)} className="text-[11px] px-2 py-0.5 rounded border border-stone-300 hover:bg-stone-50">{isOpen ? "Close" : "Details"}</button>
                </div>
                {confirmDeleteId === app.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => deleteApp(app.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white">Confirm</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] px-1.5 py-0.5 rounded border border-stone-300">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(app.id)} className="text-[10px] px-2 py-0.5 rounded text-stone-400 hover:text-red-600">Delete</button>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-stone-100 p-3 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Status history</div>
                  <ol className="space-y-1 text-xs">
                    {(app.statusHistory || []).slice().reverse().map((h, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <StatusBadge status={h.status} />
                        <span className="text-stone-500">{fmtDate(h.at)}</span>
                        {h.note && <span className="text-stone-700">— {h.note}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Notes</div>
                  <textarea
                    value={app.notes || ""}
                    onChange={(e) => updateApp(app.id, { notes: e.target.value })}
                    rows={3}
                    placeholder="Recruiter name, interview prep notes, follow-up dates…"
                    className="w-full text-xs border border-stone-200 rounded p-1.5 outline-none focus:border-stone-400"
                  />
                </div>
                <ApplicationCoverLetter app={app} updateApp={updateApp} currentCoverLetter={currentCoverLetter} />
                <ApplicationResume app={app} attachResumeToApp={attachResumeToApp} willUseApi={willUseApi} />
                {app.jd && (
                  <details>
                    <summary className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide cursor-pointer">Job description</summary>
                    <pre className="text-xs text-stone-600 whitespace-pre-wrap mt-1 max-h-60 overflow-y-auto bg-stone-50 p-2 rounded">{app.jd}</pre>
                  </details>
                )}
                <InterviewPrepSection app={app} runInterviewPrep={runInterviewPrep} cancelInterviewPrep={cancelInterviewPrep} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InterviewPrepSection({ app, runInterviewPrep, cancelInterviewPrep }) {
  const prep = app.interviewPrep;
  const status = prep?.status;

  function generate() {
    runInterviewPrep(app);
  }
  function regenerate() {
    if (confirm("Regenerate interview prep? This makes another AI request.")) runInterviewPrep(app);
  }
  function cancel() {
    cancelInterviewPrep(app);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Interview prep</div>
        {status === "done" && (
          <button onClick={regenerate} className="text-[10px] px-2 py-0.5 rounded border border-stone-200 text-stone-500 hover:bg-stone-50">🔁 Regenerate</button>
        )}
      </div>

      {!status && (
        <button onClick={generate} className="text-xs px-2.5 py-1.5 rounded-md border border-teal-300 text-teal-800 hover:bg-teal-50">
          🎯 Generate Interview Prep
        </button>
      )}
      {status === "pending" && (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <span className="animate-pulse">●</span> Generating interview prep… usually under 2 minutes.
          <button onClick={cancel} className="underline">Cancel</button>
        </div>
      )}
      {status === "error" && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <span>Failed: {prep.error}</span>
          <button onClick={generate} className="underline">Retry</button>
          {prep.previous && <button onClick={cancel} className="underline">Restore previous</button>}
        </div>
      )}
      {status === "done" && (
        <div className="space-y-2 mt-1">
          {(prep.questions || []).map((q, i) => (
            <div key={i} className="border border-stone-200 rounded p-2.5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide bg-stone-100 text-stone-600">
                  {PREP_CATEGORY_LABEL[q.category] || q.category || "Question"}
                </span>
                {q.missingEvidence && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 text-amber-700 border border-amber-200">⚠ No verified evidence</span>
                )}
              </div>
              <div className="font-semibold text-stone-800">{q.question}</div>
              {q.whyLikely && <div className="text-stone-500 italic">Why likely: {q.whyLikely}</div>}

              {Array.isArray(q.evidence) && q.evidence.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Evidence</div>
                  <ul className="mt-0.5 space-y-0.5">
                    {q.evidence.map((e, j) => (
                      <li key={j} className="text-stone-600">
                        <span className="text-[10px] px-1 py-0.5 rounded bg-stone-100 text-stone-500 mr-1">{PREP_SOURCE_LABEL[e.source] || e.source}</span>
                        {e.ref && <span className="text-stone-400">{e.ref}: </span>}
                        {e.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {q.answerOutline && (
                <div>
                  <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Answer outline</div>
                  <div className="text-stone-700 whitespace-pre-wrap">{q.answerOutline}</div>
                </div>
              )}

              {q.suggestion && (
                <div className="bg-violet-50 border border-violet-200 rounded p-1.5">
                  <div className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">💡 Suggested angle — illustrative, not verified</div>
                  <div className="text-violet-800 whitespace-pre-wrap">{q.suggestion}</div>
                </div>
              )}
            </div>
          ))}
          <div className="text-[10px] text-stone-400">Generated {fmtDate(prep.generatedAt)}.</div>
        </div>
      )}
    </div>
  );
}

// The cover letter as submitted for this application. Editable in place,
// because the copy that actually went out is often tweaked by hand after
// generation — and interview prep cites this text as evidence, so it should
// reflect what the interviewer actually read.
// The résumé as submitted for this application. Bulk-imported rows arrive with
// only a link — and Drive/Dropbox links can't be fetched server-side — so this
// is where the actual document gets attached. The file runs through the same
// extraction pipeline as the main CV upload and is stored structured, which
// means no binary blobs in the applications column and the result is usable as
// interview-prep evidence.
function ApplicationResume({ app, attachResumeToApp, willUseApi }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const attached = !!app.resume;

  async function onPick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !attachResumeToApp) return;
    setErr("");
    try {
      if (willUseApi && (await willUseApi(file))) {
        const ok = confirm(
          `"${file.name}" can't be read locally, so parsing it costs one AI request.\n\n` +
          "A DOCX saved from Word or Google Docs is usually free to parse. Continue?"
        );
        if (!ok) return;
      }
      setBusy(true);
      await attachResumeToApp(app.id, file);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!attached && !app.resumeUrl) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Résumé submitted</div>
        <div className="flex gap-1">
          <input
            ref={inputRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            onChange={onPick} className="hidden"
          />
          <button
            onClick={() => inputRef.current?.click()} disabled={busy}
            className="text-[10px] px-2 py-0.5 rounded border border-teal-300 text-teal-800 hover:bg-teal-50 disabled:opacity-50"
          >
            {busy ? "Parsing…" : attached ? "Replace file" : "Upload file"}
          </button>
        </div>
      </div>

      {app.resumeUrl && (
        <a href={app.resumeUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline break-all">{app.resumeUrl}</a>
      )}

      {attached ? (
        <div className="text-[11px] text-teal-800 mt-0.5">
          ✓ Résumé attached — {(app.resume.sections || []).reduce((n, sec) => n + (sec.entries || []).length, 0)} entries, usable as interview-prep evidence.
        </div>
      ) : (
        <div className="text-[10px] text-amber-700 mt-0.5">
          No résumé attached yet{app.resumeUrl ? " — open the link above and upload the file here." : "."}
        </div>
      )}
      {err && <div className="text-[10px] text-red-700 mt-0.5">{err}</div>}
    </div>
  );
}

function ApplicationCoverLetter({ app, updateApp, currentCoverLetter }) {
  const [open, setOpen] = useState(false);
  const attached = !!(app.coverLetter || "").trim();

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
          Cover letter {attached ? "" : <span className="font-normal normal-case text-stone-400">— none attached</span>}
        </div>
        <div className="flex gap-1">
          {attached && (
            <button onClick={() => setOpen((o) => !o)} className="text-[10px] px-2 py-0.5 rounded border border-stone-200 text-stone-500 hover:bg-stone-50">
              {open ? "Hide" : "Edit"}
            </button>
          )}
          {!attached && (currentCoverLetter || "").trim() && (
            <button
              onClick={() => { updateApp(app.id, { coverLetter: currentCoverLetter }); setOpen(true); }}
              className="text-[10px] px-2 py-0.5 rounded border border-teal-300 text-teal-800 hover:bg-teal-50"
            >
              Attach current
            </button>
          )}
          {attached && (
            <button
              onClick={() => { if (confirm("Remove the cover letter from this application?")) { updateApp(app.id, { coverLetter: "" }); setOpen(false); } }}
              className="text-[10px] px-2 py-0.5 rounded text-stone-400 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {attached && !open && (
        <div className="text-xs text-stone-500 line-clamp-2">{app.coverLetter.slice(0, 220)}{app.coverLetter.length > 220 ? "…" : ""}</div>
      )}
      {attached && open && (
        <>
          <textarea
            value={app.coverLetter}
            onChange={(e) => updateApp(app.id, { coverLetter: e.target.value })}
            rows={10}
            className="w-full text-xs border border-stone-200 rounded p-2 outline-none focus:border-stone-400 leading-relaxed"
          />
          <div className="text-[10px] text-stone-400">
            Edits are saved to this application only — the cover letter on the Cover Letter tab is untouched.
          </div>
        </>
      )}
    </div>
  );
}

function KanbanView({ apps, setStatus, load }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STAGES.map((stage) => {
        const inStage = apps.filter((a) => a.status === stage.id).sort((a, b) => b.savedAt - a.savedAt);
        return (
          <div key={stage.id} className="bg-stone-50 rounded-lg border border-stone-200 p-2 min-w-[220px] w-[220px] shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: stage.color }}></span>
                {stage.label}
              </div>
              <span className="text-[10px] text-stone-400">{inStage.length}</span>
            </div>
            <div className="space-y-1.5">
              {inStage.map((app) => (
                <div key={app.id} className="bg-white rounded border border-stone-200 p-2 text-xs">
                  <div className="font-semibold truncate">{app.label || "Untitled"}</div>
                  {app.company && <div className="text-[11px] text-stone-500 truncate">{app.company}</div>}
                  <div className="flex gap-1 mt-1">
                    <select value={app.status} onChange={(e) => setStatus(app, e.target.value)} className="text-[10px] border border-stone-200 rounded px-1 py-0.5 bg-white flex-1">
                      {STAGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
                    </select>
                    <button onClick={() => load(app)} className="text-[10px] px-1.5 rounded text-white" style={{ background: "#1f4e5f" }}>Load</button>
                  </div>
                </div>
              ))}
              {inStage.length === 0 && (<div className="text-[11px] text-stone-400 italic px-1 py-2">—</div>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelView({ counts, apps }) {
  const max = Math.max(1, counts.saved || 0);
  // Show the linear funnel for the 5 forward stages, plus rejected as a side metric.
  const linear = ["saved", "applied", "screen", "interview", "offer"];
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-5 space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Application funnel</div>
        <div className="space-y-1.5">
          {linear.map((id) => {
            const s = stageById(id);
            const c = counts[id] || 0;
            const pct = (c / max) * 100;
            // Trapezoidal: width shrinks per stage to give a funnel feel
            return (
              <div key={id} className="flex items-center gap-2">
                <div className="w-24 text-xs text-stone-600 text-right">{s.label}</div>
                <div className="flex-1 bg-stone-100 rounded relative h-7">
                  <div
                    className="h-7 rounded flex items-center justify-between px-2 text-xs font-semibold text-white"
                    style={{ width: pct + "%", background: s.color, minWidth: c > 0 ? "44px" : "0" }}
                  >
                    {c > 0 && <span>{c}</span>}
                    {c > 0 && id !== "saved" && (
                      <span className="text-[10px] font-normal opacity-90">
                        {Math.round((c / max) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
          <div className="w-24 text-right text-stone-600">Rejected</div>
          <div className="px-2.5 py-1 rounded text-white font-semibold" style={{ background: stageById("rejected").color }}>
            {counts.rejected || 0}
          </div>
          <div className="text-[11px] text-stone-400">(terminal state, not part of the forward funnel)</div>
        </div>
      </div>

      <div className="border-t border-stone-100 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Conversion rates</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Rate label="Saved → Applied" num={counts.applied} den={counts.saved} />
          <Rate label="Applied → Screen" num={counts.screen} den={counts.applied} />
          <Rate label="Screen → Interview" num={counts.interview} den={counts.screen} />
          <Rate label="Interview → Offer" num={counts.offer} den={counts.interview} />
        </div>
      </div>
    </div>
  );
}

function Rate({ label, num, den }) {
  const pct = den > 0 ? Math.round((num / den) * 100) : null;
  return (
    <div className="bg-stone-50 rounded p-2">
      <div className="text-[11px] text-stone-500">{label}</div>
      <div className="text-stone-800 font-semibold">
        {num}/{den}
        {pct !== null && <span className="text-stone-500 ml-2 text-xs">({pct}%)</span>}
      </div>
    </div>
  );
}
