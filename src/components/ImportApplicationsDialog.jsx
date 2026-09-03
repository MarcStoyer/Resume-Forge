import React, { useState, useMemo } from "react";
import {
  parseDelimited, autoMapColumns, rowsToApplications, IMPORT_FIELDS,
} from "../lib/csvImport.js";
import { authHeaders } from "../lib/api.js";

const PREVIEW_ROWS = 4;

// Tries to retrieve a résumé behind a link from an imported sheet.
//
// Worth being clear-eyed about the odds: /api/fetch-url only returns text
// (it strips HTML and rejects non-text content types), and Drive/Dropbox/
// OneDrive links require auth and answer with a login page rather than the
// file. So this succeeds only for a résumé published as plain HTML/text at a
// public URL; everything else falls through to "grab it yourself", which is
// why the result is reported per row rather than silently swallowed.
async function tryFetchResume(url) {
  try {
    const r = await fetch("/api/fetch-url", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ url }),
    });
    const data = await r.json();
    if (!data.ok || !data.text || data.text.trim().length < 200) {
      return { ok: false, reason: data.message || data.error?.message || "Nothing readable at that link." };
    }
    if (/sign in|log in|request access|you need access/i.test(data.text.slice(0, 400))) {
      return { ok: false, reason: "Link needs sign-in — returned a login page." };
    }
    return { ok: true, text: data.text };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export default function ImportApplicationsDialog({ onCancel, onImport }) {
  const [raw, setRaw] = useState("");
  const [mapping, setMapping] = useState(null);
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");

  const rows = useMemo(() => (raw.trim() ? parseDelimited(raw) : []), [raw]);
  const headers = rows[0] || [];
  const effectiveMapping = mapping || (headers.length ? autoMapColumns(headers) : []);
  const preview = rows.slice(1, 1 + PREVIEW_ROWS);
  const candidates = useMemo(
    () => (rows.length > 1 ? rowsToApplications(rows, effectiveMapping) : []),
    [rows, effectiveMapping]
  );

  function loadText(text) {
    setRaw(text);
    setMapping(null);
    setErr("");
    setReport(null);
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { loadText(await file.text()); }
    catch (e2) { setErr("Couldn't read that file: " + e2.message); }
    finally { e.target.value = ""; }
  }

  function setColumn(idx, field) {
    const next = [...effectiveMapping];
    // A field can only be claimed once — moving it clears the previous holder.
    if (field) next.forEach((f, i) => { if (f === field && i !== idx) next[i] = null; });
    next[idx] = field || null;
    setMapping(next);
  }

  async function doImport() {
    if (!candidates.length) { setErr("Nothing to import — check the column mapping."); return; }
    setChecking(true);
    setErr("");
    try {
      const withLinks = candidates.filter((a) => a.resumeUrl);
      const unresolved = [];
      for (const app of withLinks) {
        const result = await tryFetchResume(app.resumeUrl);
        if (result.ok) app.resumeLinkText = result.text;
        else unresolved.push({ label: app.label, url: app.resumeUrl, reason: result.reason });
      }
      onImport(candidates);
      setReport({ imported: candidates.length, checked: withLinks.length, unresolved });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mt-10 p-5 space-y-3">
        <div>
          <div className="font-semibold text-stone-800">Import applications from a sheet</div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            Upload a CSV, or paste straight from Google Sheets / Excel. Already-submitted
            applications land in the tracker with their status and date preserved.
          </div>
        </div>

        {report ? (
          <div className="space-y-3">
            <div className="text-sm text-teal-900 bg-teal-50 border border-teal-200 rounded px-3 py-2">
              Imported <b>{report.imported}</b> application{report.imported === 1 ? "" : "s"}.
              {report.checked > 0 && (
                <> Checked {report.checked} résumé link{report.checked === 1 ? "" : "s"}; {report.checked - report.unresolved.length} retrieved.</>
              )}
            </div>
            {report.unresolved.length > 0 && (
              <div className="text-xs border border-amber-200 bg-amber-50 rounded p-3 space-y-1.5">
                <div className="font-semibold text-amber-800">
                  These résumé links couldn't be read automatically — open each and upload the file to that application:
                </div>
                <ul className="space-y-1">
                  {report.unresolved.map((u, i) => (
                    <li key={i} className="text-amber-900">
                      <b>{u.label}</b> — <a href={u.url} target="_blank" rel="noreferrer" className="underline break-all">{u.url}</a>
                      <span className="text-amber-700"> ({u.reason})</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[10px] text-amber-700">
                  Drive, Dropbox and OneDrive links require sign-in, so they can't be fetched server-side.
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: "#1f4e5f" }}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs px-2.5 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50 cursor-pointer">
                <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} className="hidden" />
                Choose CSV file
              </label>
              <span className="text-[11px] text-stone-400">or paste below</span>
            </div>

            <textarea
              value={raw} onChange={(e) => loadText(e.target.value)} rows={5}
              placeholder={"Company,Role,Status,Where Applied,Date Applied,Resume Link\nKovari,Robot Operator,Applied,LinkedIn,9/3/2026,https://…"}
              className="w-full text-xs font-mono border border-stone-200 rounded p-2 outline-none focus:border-stone-400"
            />

            {headers.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
                  Column mapping — {candidates.length} row{candidates.length === 1 ? "" : "s"} ready
                </div>
                <div className="overflow-x-auto border border-stone-200 rounded">
                  <table className="text-[11px] w-full">
                    <thead>
                      <tr className="bg-stone-50">
                        {headers.map((h, i) => (
                          <th key={i} className="p-1.5 text-left align-top border-b border-stone-200 min-w-[120px]">
                            <div className="font-semibold text-stone-700 truncate">{h || <span className="text-stone-400">(no header)</span>}</div>
                            <select
                              value={effectiveMapping[i] || ""}
                              onChange={(e) => setColumn(i, e.target.value)}
                              className="mt-1 w-full text-[11px] border border-stone-300 rounded px-1 py-0.5 bg-white font-normal"
                            >
                              <option value="">— ignore —</option>
                              {IMPORT_FIELDS.map((f) => (<option key={f.id} value={f.id}>{f.label}</option>))}
                            </select>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, ri) => (
                        <tr key={ri} className="border-b border-stone-100 last:border-0">
                          {headers.map((_, ci) => (
                            <td key={ci} className="p-1.5 text-stone-600 align-top max-w-[200px] truncate">{r[ci]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length - 1 > preview.length && (
                  <div className="text-[10px] text-stone-400">Showing {preview.length} of {rows.length - 1} rows.</div>
                )}
              </div>
            )}

            {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{err}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50">Cancel</button>
              <button
                onClick={doImport} disabled={!candidates.length || checking}
                className="text-xs px-3 py-1.5 rounded-md text-white font-medium disabled:opacity-50"
                style={{ background: "#1f4e5f" }}
              >
                {checking ? "Importing…" : `Import ${candidates.length || ""}`.trim()}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
