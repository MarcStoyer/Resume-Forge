import React, { useState, useEffect, useRef } from "react";
import { APPLICATION_SOURCES } from "../lib/jobLabel.js";

// Replaces the old chain of three window.prompt() calls. Beyond being far
// less unpleasant, a real form is what makes the label fixable: the label
// auto-composes from Company + Role as you type, so accepting the default
// no longer means keeping whatever junk happened to be line 1 of the JD.
export default function SaveApplicationDialog({
  status, defaultLabel = "", defaultCompany = "", hasCoverLetter = false, onCancel, onSave,
}) {
  const [company, setCompany] = useState(defaultCompany);
  const [role, setRole] = useState("");
  const [label, setLabel] = useState(defaultLabel);
  const [labelEdited, setLabelEdited] = useState(false);
  const [source, setSource] = useState("");
  const [attachCoverLetter, setAttachCoverLetter] = useState(hasCoverLetter);
  const firstFieldRef = useRef(null);

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  // Until the user types their own label, keep it in sync with Company/Role.
  useEffect(() => {
    if (labelEdited) return;
    const composed = [company.trim(), role.trim()].filter(Boolean).join(" — ");
    if (composed) setLabel(composed);
  }, [company, role, labelEdited]);

  function submit(e) {
    e?.preventDefault();
    const finalLabel = label.trim() || [company.trim(), role.trim()].filter(Boolean).join(" — ") || "Untitled";
    onSave({
      label: finalLabel,
      company: company.trim(),
      role: role.trim(),
      source: source.trim(),
      attachCoverLetter: hasCoverLetter && attachCoverLetter,
    });
  }

  const heading = status === "applied" ? "Mark applied" : "Save application";

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="bg-white rounded-lg shadow-xl w-full max-w-md mt-16 p-5 space-y-3"
      >
        <div>
          <div className="font-semibold text-stone-800">{heading}</div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            Saves a snapshot of the current résumé{hasCoverLetter ? ", cover letter," : ""} and job description.
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-stone-600">Company</span>
          <input
            ref={firstFieldRef} value={company} onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Inc."
            className="mt-1 w-full text-sm border border-stone-300 rounded px-2 py-1.5 outline-none focus:border-teal-700"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-stone-600">Role</span>
          <input
            value={role} onChange={(e) => setRole(e.target.value)}
            placeholder="Research Associate"
            className="mt-1 w-full text-sm border border-stone-300 rounded px-2 py-1.5 outline-none focus:border-teal-700"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-stone-600">Label</span>
          <input
            value={label}
            onChange={(e) => { setLabelEdited(true); setLabel(e.target.value); }}
            placeholder="How this shows up in your list"
            className="mt-1 w-full text-sm border border-stone-300 rounded px-2 py-1.5 outline-none focus:border-teal-700"
          />
          <span className="text-[10px] text-stone-400">
            {labelEdited ? "Custom label." : "Follows Company — Role until you edit it."}
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-stone-600">Where you applied</span>
          <input
            value={source} onChange={(e) => setSource(e.target.value)}
            list="application-sources" placeholder="LinkedIn, company site, referral…"
            className="mt-1 w-full text-sm border border-stone-300 rounded px-2 py-1.5 outline-none focus:border-teal-700"
          />
          <datalist id="application-sources">
            {APPLICATION_SOURCES.map((s) => (<option key={s} value={s} />))}
          </datalist>
        </label>

        {hasCoverLetter && (
          <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
            <input
              type="checkbox" checked={attachCoverLetter}
              onChange={(e) => setAttachCoverLetter(e.target.checked)}
              className="w-4 h-4 accent-teal-800"
            />
            Attach the current cover letter to this application
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">
            Cancel
          </button>
          <button type="submit" className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: "#1f4e5f" }}>
            {status === "applied" ? "Mark applied" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
