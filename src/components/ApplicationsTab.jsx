import React, { useRef, useState, useMemo } from "react";
import { saveAs } from "file-saver";
import { deepClone, uid } from "../lib/util.js";
import { STAGES, STAGE_IDS, stageById, computeFunnel, historyEntry } from "../lib/funnel.js";

function fmtDate(ms) {
  try {
    const d = new Date(ms);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}

export default function ApplicationsTab({
  apps, setApps, currentResume, currentCoverLetter, currentJd,
  currentSnapshot, setCurrentSnapshot, loadApplication,
}) {
  const fileRef = useRef(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [view, setView] = useState("list"); // 'list' | 'kanban' | 'funnel'
  const [expandedId, setExpandedId] = useState(null);

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
          <button onClick={() => fileRef.current?.click()} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">Import</button>
          <button onClick={exportAll} disabled={!apps.length} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50 disabled:opacity-50">Export</button>
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
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = stageById(status);
  return <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide text-white" style={{ background: s.color }}>{s.label}</span>;
}

function ListView({ apps, setStatus, updateApp, load, confirmDeleteId, setConfirmDeleteId, deleteApp, expandedId, setExpandedId }) {
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
                <div className="text-[11px] text-stone-400 mt-0.5">Saved {fmtDate(app.savedAt)}</div>
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
                {app.jd && (
                  <details>
                    <summary className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide cursor-pointer">Job description</summary>
                    <pre className="text-xs text-stone-600 whitespace-pre-wrap mt-1 max-h-60 overflow-y-auto bg-stone-50 p-2 rounded">{app.jd}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
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
