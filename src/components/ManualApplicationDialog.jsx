import React, { useState, useEffect, useRef } from "react";
import { STAGES } from "../lib/funnel.js";
import { APPLICATION_SOURCES } from "../lib/jobLabel.js";
import { buildApplication, dateInputToTimestamp, timestampToDateInput } from "../lib/applications.js";
import { confirmAndExtractResume } from "../lib/cvExtract.js";

const inputClass = "mt-1 w-full text-sm border border-stone-300 rounded px-2 py-1.5 outline-none focus:border-teal-700";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-stone-600">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-stone-400">{hint}</span>}
    </label>
  );
}

// Adds one application straight to the tracker, without needing a résumé and
// job description loaded in the workspace first. The path for logging
// something you applied to elsewhere, or backfilling a single row without
// building a whole spreadsheet to import.
export default function ManualApplicationDialog({ onCancel, onSave }) {
  const [f, setF] = useState({
    company: "", role: "", label: "", status: "applied", source: "",
    appliedAt: timestampToDateInput(Date.now()),
    jobUrl: "", resumeUrl: "", jd: "", coverLetter: "", notes: "",
  });
  const [labelEdited, setLabelEdited] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  // The résumé actually submitted, parsed to the app's structured shape up
  // front so it saves with the application rather than needing a second trip
  // through the Details panel.
  const [resume, setResume] = useState(null);
  const [resumeName, setResumeName] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeErr, setResumeErr] = useState("");
  const firstRef = useRef(null);
  const resumeInputRef = useRef(null);

  async function pickResume(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setResumeErr("");
    setResumeBusy(true);
    try {
      const parsed = await confirmAndExtractResume(file);
      if (!parsed) return; // declined the cost warning
      setResume(parsed);
      setResumeName(file.name);
    } catch (err) {
      setResumeErr(err.message);
    } finally {
      setResumeBusy(false);
    }
  }

  useEffect(() => { firstRef.current?.focus(); }, []);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  // Label tracks Company — Role until the user takes it over.
  useEffect(() => {
    if (labelEdited) return;
    const composed = [f.company.trim(), f.role.trim()].filter(Boolean).join(" — ");
    setF((prev) => (prev.label === composed ? prev : { ...prev, label: composed }));
  }, [f.company, f.role, labelEdited]);

  const canSave = !!(f.company.trim() || f.role.trim() || f.label.trim());

  function submit(e) {
    e.preventDefault();
    if (!canSave) return;
    onSave(buildApplication({
      ...f,
      appliedAt: dateInputToTimestamp(f.appliedAt),
      resume,
      origin: "manual",
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mt-10 p-5 space-y-3"
      >
        <div>
          <div className="font-semibold text-stone-800">Add an application</div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            Logs one application directly — no résumé or job description needed in the workspace.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <input ref={firstRef} value={f.company} onChange={set("company")} placeholder="Acme Inc." className={inputClass} />
          </Field>
          <Field label="Role">
            <input value={f.role} onChange={set("role")} placeholder="Research Associate" className={inputClass} />
          </Field>
        </div>

        <Field label="Label" hint={labelEdited ? "Custom label." : "Follows Company — Role until you edit it."}>
          <input
            value={f.label}
            onChange={(e) => { setLabelEdited(true); set("label")(e); }}
            placeholder="How this shows up in your list"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Status">
            <select value={f.status} onChange={set("status")} className={inputClass}>
              {STAGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
            </select>
          </Field>
          <Field label="Date applied">
            <input type="date" value={f.appliedAt} onChange={set("appliedAt")} className={inputClass} />
          </Field>
          <Field label="Where applied">
            <input value={f.source} onChange={set("source")} list="manual-application-sources" placeholder="LinkedIn" className={inputClass} />
            <datalist id="manual-application-sources">
              {APPLICATION_SOURCES.map((s) => (<option key={s} value={s} />))}
            </datalist>
          </Field>
        </div>

        <button
          type="button" onClick={() => setShowOptional((v) => !v)}
          className="text-[11px] text-stone-500 hover:text-stone-800 underline"
        >
          {showOptional ? "Hide" : "Add"} job description, links and notes
        </button>

        {showOptional && (
          <div className="space-y-3 border-t border-stone-100 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job posting URL">
                <input value={f.jobUrl} onChange={set("jobUrl")} placeholder="https://…" className={inputClass} />
              </Field>
              <Field label="Résumé link">
                <input value={f.resumeUrl} onChange={set("resumeUrl")} placeholder="https://…" className={inputClass} />
              </Field>
            </div>
            <Field label="Job description" hint="Used for interview-prep questions.">
              <textarea value={f.jd} onChange={set("jd")} rows={4} className={inputClass + " font-normal"} />
            </Field>
            <Field label="Cover letter" hint="Cited as evidence in interview prep. Editable later from the application.">
              <textarea value={f.coverLetter} onChange={set("coverLetter")} rows={3} className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea value={f.notes} onChange={set("notes")} rows={2} className={inputClass} />
            </Field>
          </div>
        )}

        <div className="border-t border-stone-100 pt-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-stone-600">Résumé submitted</span>
            <div className="flex items-center gap-1">
              <input
                ref={resumeInputRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                onChange={pickResume} className="hidden"
              />
              <button
                type="button" onClick={() => resumeInputRef.current?.click()} disabled={resumeBusy}
                className="text-[11px] px-2 py-0.5 rounded border border-teal-300 text-teal-800 hover:bg-teal-50 disabled:opacity-50"
              >
                {resumeBusy ? "Parsing…" : resume ? "Replace" : "Upload file"}
              </button>
              {resume && (
                <button
                  type="button" onClick={() => { setResume(null); setResumeName(""); }}
                  className="text-[11px] px-2 py-0.5 rounded text-stone-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {resume ? (
            <div className="text-[11px] text-teal-800 mt-1">
              ✓ {resumeName} — {(resume.sections || []).reduce((n, sec) => n + (sec.entries || []).length, 0)} entries parsed, usable as interview-prep evidence.
            </div>
          ) : (
            <div className="text-[10px] text-stone-400 mt-1">
              Optional. Attach the résumé you actually sent and interview prep can cite it — otherwise add it later from the application's Details panel.
            </div>
          )}
          {resumeErr && <div className="text-[10px] text-red-700 mt-0.5">{resumeErr}</div>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">Cancel</button>
          <button
            type="submit" disabled={!canSave}
            className="text-xs px-3 py-1.5 rounded-md text-white font-medium disabled:opacity-50"
            style={{ background: "#1f4e5f" }}
          >
            Add application
          </button>
        </div>
      </form>
    </div>
  );
}
