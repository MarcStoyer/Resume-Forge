import React, { useRef, useState } from "react";
import { saveAs } from "file-saver";
import { deepClone, uid } from "../lib/util.js";

function fmtDate(ms) {
  try {
    const d = new Date(ms);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}

export default function ApplicationsTab({
  apps, setApps, currentResume, currentCoverLetter, currentJd, currentSnapshot, setCurrentSnapshot,
  loadApplication,
}) {
  const fileRef = useRef(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function exportAll() {
    const blob = new Blob([JSON.stringify(apps, null, 2)], { type: "application/json" });
    saveAs(blob, "resume-forge-applications.json");
  }
  async function importAll(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("expected an array");
      if (!confirm(`Import ${data.length} applications? This will append to your current ${apps.length}.`)) return;
      // Rewrite ids to avoid collisions
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

  return (
    <div className="max-w-4xl mx-auto p-5 space-y-4">
      <div className="bg-white rounded-lg border border-stone-200 p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-semibold text-stone-800">Saved Applications</div>
          <div className="text-xs text-stone-500">{apps.length} saved · click <b>Load</b> to use a saved application as your starting point</div>
        </div>
        <div className="flex items-center gap-2">
          {currentSnapshot && (
            <button onClick={restorePrevious} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">↶ Restore previous state</button>
          )}
          <input ref={fileRef} type="file" accept=".json" onChange={importAll} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">Import JSON</button>
          <button onClick={exportAll} disabled={!apps.length} className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50 disabled:opacity-50">Export JSON</button>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white rounded-lg border border-stone-200 p-8 text-center text-stone-500 text-sm">
          You haven't saved any applications yet. After tailoring a résumé to a job, click <b>★ Save application</b> in the top bar to bookmark this {`{résumé + cover letter + JD}`} combination.
        </div>
      ) : (
        <div className="space-y-2">
          {apps.slice().sort((a, b) => b.savedAt - a.savedAt).map((app) => (
            <div key={app.id} className="bg-white rounded-lg border border-stone-200 p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-stone-800 text-sm">{app.label || "Untitled"}</div>
                  {app.company && <div className="text-xs text-stone-500">@ {app.company}</div>}
                  {app.role && <div className="text-xs text-stone-500">— {app.role}</div>}
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">{fmtDate(app.savedAt)}</div>
                {app.jd && <div className="text-xs text-stone-500 mt-1 line-clamp-2">{app.jd.slice(0, 220)}{app.jd.length > 220 ? "…" : ""}</div>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => load(app)} className="text-xs px-2.5 py-1 rounded-md text-white" style={{ background: "#1f4e5f" }}>Load</button>
                {confirmDeleteId === app.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => deleteApp(app.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white">Confirm</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] px-1.5 py-0.5 rounded border border-stone-300">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(app.id)} className="text-[11px] px-2 py-0.5 rounded text-stone-400 hover:text-red-600">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
