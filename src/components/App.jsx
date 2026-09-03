import React, { useState, useEffect, useRef } from "react";
import Builder from "./Builder.jsx";
import Preview from "./Preview.jsx";
import CoverLetterTab from "./CoverLetterTab.jsx";
import ApplicationsTab from "./ApplicationsTab.jsx";
import SaveApplicationDialog from "./SaveApplicationDialog.jsx";
import { guessJobLabel, guessCompany } from "../lib/jobLabel.js";
import { useAuth } from "./AuthProvider.jsx";

import {
  loadUserData,
  saveResume, saveTemplate, saveHonesty, saveCoverLetter,
  saveJD, saveJobUrl, savePaper, saveApps,
  saveInterviewPrepAuto, saveInterviewHonesty, saveInterviewPrepSettings,
} from "../lib/storage.js";
import { defaultResume } from "../data/defaultResume.js";
import { TEMPLATES, getTemplate } from "../lib/templates.js";
import { exportDocx } from "../lib/docxExport.js";
import { extractResumeFromFile, confirmAndExtractResume } from "../lib/cvExtract.js";
import { deepClone, uid } from "../lib/util.js";
import { historyEntry } from "../lib/funnel.js";
import { generateInterviewPrep, DEFAULT_INTERVIEW_PREP_SETTINGS } from "../lib/interviewPrep.js";

export default function App() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [tab, setTab] = useState("resume");
  const [resume, setResume] = useState(() => defaultResume());
  const [templateId, setTemplateId] = useState("classic");
  const [honesty, setHonesty] = useState(75);
  const [coverLetter, setCoverLetter] = useState("");
  const [jd, setJd] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [apps, setApps] = useState([]);
  const [appSnapshot, setAppSnapshot] = useState(null);
  const [paper, setPaper] = useState("letter"); // letter | a4
  const [interviewPrepAuto, setInterviewPrepAuto] = useState(false);
  const [interviewHonesty, setInterviewHonesty] = useState(75);
  const [interviewPrepSettings, setInterviewPrepSettings] = useState(DEFAULT_INTERVIEW_PREP_SETTINGS);
  const [storageReady, setStorageReady] = useState(false);
  const [storageErr, setStorageErr] = useState("");

  // Whether the current cover letter rides along when an application is saved.
  // Session-level on purpose: it is a per-application decision, mirrored between
  // the cover letter page and the save dialog rather than a stored preference.
  const [attachCoverLetter, setAttachCoverLetter] = useState(true);
  const [saveDialog, setSaveDialog] = useState(null); // { status } while the save dialog is open
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setStorageReady(false);
      setStorageErr("");
      try {
        const data = await loadUserData(user.id);
        if (cancelled) return;
        setResume(data?.resume || defaultResume());
        setTemplateId(data?.template || "classic");
        setHonesty(typeof data?.honesty === "number" ? data.honesty : 75);
        setCoverLetter(typeof data?.cover_letter === "string" ? data.cover_letter : "");
        setJd(typeof data?.jd === "string" ? data.jd : "");
        setJobUrl(typeof data?.job_url === "string" ? data.job_url : "");
        setPaper(data?.paper || "letter");
        setApps(Array.isArray(data?.applications) ? data.applications : []);
        setInterviewPrepAuto(!!data?.interview_prep_auto);
        setInterviewHonesty(typeof data?.interview_honesty === "number" ? data.interview_honesty : 75);
        setInterviewPrepSettings({ ...DEFAULT_INTERVIEW_PREP_SETTINGS, ...(data?.interview_prep_settings || {}) });
        setStorageReady(true);
      } catch (e) {
        if (!cancelled) setStorageErr(e.message);
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [user.id]);

  function persist(save, value) {
    if (!storageReady) return undefined;
    const timer = setTimeout(() => {
      save(value, user.id).catch((e) => setStorageErr(e.message));
    }, 350);
    return () => clearTimeout(timer);
  }

  useEffect(() => persist(saveResume, resume), [resume, storageReady, user.id]);
  useEffect(() => persist(saveTemplate, templateId), [templateId, storageReady, user.id]);
  useEffect(() => persist(saveHonesty, honesty), [honesty, storageReady, user.id]);
  useEffect(() => persist(saveCoverLetter, coverLetter), [coverLetter, storageReady, user.id]);
  useEffect(() => persist(saveJD, jd), [jd, storageReady, user.id]);
  useEffect(() => persist(saveJobUrl, jobUrl), [jobUrl, storageReady, user.id]);
  useEffect(() => persist(saveApps, apps), [apps, storageReady, user.id]);
  useEffect(() => persist(savePaper, paper), [paper, storageReady, user.id]);
  useEffect(() => persist(saveInterviewPrepAuto, interviewPrepAuto), [interviewPrepAuto, storageReady, user.id]);
  useEffect(() => persist(saveInterviewHonesty, interviewHonesty), [interviewHonesty, storageReady, user.id]);
  useEffect(() => persist(saveInterviewPrepSettings, interviewPrepSettings), [interviewPrepSettings, storageReady, user.id]);

  async function logout() {
    setSigningOut(true);
    setStorageErr("");
    try {
      await signOut();
    } catch (e) {
      setStorageErr(e.message);
      setSigningOut(false);
    }
  }

  const template = getTemplate(templateId);

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setUploadErr("");
    try {
      setResume(await extractResumeFromFile(file));
    } catch (e2) {
      setUploadErr("Upload failed: " + e2.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Attaches a résumé file to one saved application, so bulk-imported rows
  // (whose résumé lives behind a link we can't fetch) can carry the document
  // that was actually submitted — which is what interview prep reasons over.
  async function attachResumeToApp(appId, file) {
    const parsed = await confirmAndExtractResume(file);
    if (!parsed) return; // declined the cost warning
    patchApp(appId, { resume: parsed });
  }

  // Builds the record from the values the save dialog collected. The label no
  // longer falls back to "first non-empty line of the JD" — that's what put
  // scraped logo alt-text ("Company logo for, Kovari.") into the list.
  function buildAppRecord(status, fields) {
    return {
      id: uid(),
      label: fields.label,
      company: fields.company,
      role: fields.role,
      source: fields.source,
      savedAt: Date.now(),
      jd, jobUrl,
      resume: deepClone(resume),
      coverLetter: fields.attachCoverLetter ? coverLetter : "",
      templateId,
      honesty,
      status,
      statusHistory: [historyEntry(status)],
      notes: "",
    };
  }
  function saveApplication() { setSaveDialog({ status: "saved" }); }
  function markAppliedNow() { setSaveDialog({ status: "applied" }); }

  function commitSaveDialog(fields) {
    const status = saveDialog?.status || "saved";
    const rec = buildAppRecord(status, fields);
    setApps((a) => [...a, rec]);
    setSaveDialog(null);
    if (interviewPrepAuto && interviewPrepSettings.trigger === "applied") runInterviewPrep(rec);
    if (status === "applied") setTab("apps");
    else alert("Saved! Find it in the Applications tab.");
  }

  function patchApp(id, patch) {
    setApps((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  // Generates (or regenerates) interview prep for one saved application and
  // writes the result back onto it. Shared by the auto-trigger above, the
  // status-change trigger in ApplicationsTab, and the manual
  // "Generate"/"Regenerate" button.
  async function runInterviewPrep(app) {
    // Keep whatever prep already existed so a stuck/failed regenerate can be
    // canceled back to it instead of losing a previously-generated result.
    const previous = app.interviewPrep && app.interviewPrep.status !== "pending" ? app.interviewPrep : null;
    patchApp(app.id, { interviewPrep: { status: "pending", startedAt: Date.now(), previous } });
    try {
      const questions = await generateInterviewPrep({
        jd: app.jd, company: app.company, role: app.role,
        resume: app.resume, coverLetter: app.coverLetter, notes: app.notes,
        honesty: interviewHonesty, settings: interviewPrepSettings,
      });
      patchApp(app.id, { interviewPrep: { status: "done", generatedAt: Date.now(), questions } });
    } catch (e) {
      patchApp(app.id, { interviewPrep: { status: "error", error: e.message, previous } });
    }
  }
  // Escape hatch for a stuck "pending" state (a hung request, or one orphaned
  // by a page refresh/navigation mid-generation, which otherwise has no way
  // back through the UI) and for backing out of a failed regenerate. Restores
  // whatever prep existed before this run, or clears it if there wasn't one.
  function cancelInterviewPrep(app) {
    patchApp(app.id, { interviewPrep: app.interviewPrep?.previous || null });
  }

  function loadApplication(app) {
    if (app.resume) setResume(deepClone(app.resume));
    if (typeof app.coverLetter === "string") setCoverLetter(app.coverLetter);
    if (typeof app.jd === "string") setJd(app.jd);
    if (typeof app.jobUrl === "string") setJobUrl(app.jobUrl);
    if (app.templateId) setTemplateId(app.templateId);
    if (typeof app.honesty === "number") setHonesty(app.honesty);
    setTab("resume");
  }

  function reset() {
    if (!confirm("Reset to defaults? Clears your current résumé, cover letter, and pasted JD. (Saved Applications are kept.)")) return;
    setResume(defaultResume());
    setCoverLetter("");
    setJd("");
    setJobUrl("");
  }

  // Approx: top bar height + surrounding padding. Panels each get their own scroll region.
  const panelHeight = "calc(100vh - 100px)";

  if (!storageReady) {
    return (
      <div className="w-full min-h-screen bg-stone-100 text-stone-800 flex items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          {storageErr ? (
            <>
              <div className="font-semibold text-red-700">Could not load your saved data</div>
              <div className="mt-2 text-sm text-stone-600">{storageErr}</div>
              <div className="mt-3 text-xs text-stone-500">Check your Supabase table and Vite environment variables, then reload.</div>
            </>
          ) : (
            <div className="text-sm text-stone-600">Loading your résumé data…</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }} className="w-full min-h-screen bg-stone-100 text-stone-800">
      <div className="no-print sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="font-semibold text-stone-900">Résumé Forge</div>
          <div className="flex bg-stone-100 rounded-md p-0.5 text-sm">
            <button onClick={() => setTab("resume")} className={`px-3 py-1 rounded ${tab === "resume" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>Résumé</button>
            <button onClick={() => setTab("cover")} className={`px-3 py-1 rounded ${tab === "cover" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>Cover Letter</button>
            <button onClick={() => setTab("apps")} className={`px-3 py-1 rounded ${tab === "apps" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>
              Applications {apps.length > 0 && <span className="ml-1 text-[10px] bg-stone-200 rounded-full px-1.5">{apps.length}</span>}
            </button>
          </div>
          {uploading && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 flex items-center gap-1">
              <span className="animate-pulse">●</span> Parsing CV in background…
            </div>
          )}
          {uploadErr && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {uploadErr} <button onClick={() => setUploadErr("")} className="underline ml-1">dismiss</button>
            </div>
          )}
          {storageErr && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              Save failed: {storageErr} <button onClick={() => setStorageErr("")} className="underline ml-1">dismiss</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-2 rounded-md text-sm font-medium border border-stone-300 hover:bg-stone-50 disabled:opacity-50">
            {uploading ? "Parsing…" : "📥 Upload CV"}
          </button>
          <button onClick={markAppliedNow} disabled={!jd} className="px-3 py-2 rounded-md text-sm border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50" title="Save a snapshot of this résumé+cover+JD with status 'Applied'">
            ✓ Applied with this
          </button>
          <button onClick={saveApplication} disabled={!jd && !resume.profile.text} className="px-3 py-2 rounded-md text-sm border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50" title="Bookmark current state (status 'Saved')">
            ★ Save
          </button>
          <label className="text-xs text-stone-500 flex items-center gap-1.5">
            Template:
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="border border-stone-300 rounded px-2 py-1.5 text-sm bg-white">
              {TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </label>
          <label className="text-xs text-stone-500 flex items-center gap-1.5">
            Paper:
            <select value={paper} onChange={(e) => setPaper(e.target.value)} className="border border-stone-300 rounded px-2 py-1.5 text-sm bg-white">
              <option value="letter">US Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <span className="max-w-44 truncate text-xs text-stone-400" title={user.email}>{user.email}</span>
          <button onClick={reset} className="px-3 py-2 rounded-md text-sm border border-stone-200 text-stone-500 hover:bg-stone-50">Reset</button>
          <button onClick={logout} disabled={signingOut} className="px-3 py-2 rounded-md text-sm border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50">{signingOut ? "Signing out…" : "Log out"}</button>
          {tab === "resume" && (
            <>
              <button onClick={() => exportDocx(resume, template)} className="px-3 py-2 rounded-md text-sm font-medium border border-stone-300 hover:bg-stone-50">⬇ DOCX</button>
              <button onClick={() => window.print()} className="px-4 py-2 rounded-md text-white text-sm font-medium hover:opacity-90" style={{ background: template.accent }}>🖨 PDF</button>
            </>
          )}
        </div>
      </div>

      {tab === "resume" && (
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
          {/* Left — independent scroll */}
          <div className="no-print overflow-y-auto pr-1" style={{ height: panelHeight }}>
            <Builder
              resume={resume} setResume={setResume}
              honesty={honesty} setHonesty={setHonesty}
              jd={jd} setJd={setJd}
              jobUrl={jobUrl} setJobUrl={setJobUrl}
              setCoverLetter={setCoverLetter}
              openCoverTab={() => setTab("cover")}
            />
          </div>
          {/* Right — independent scroll */}
          <div className="no-print overflow-y-auto pl-1" style={{ height: panelHeight }}>
            <Preview resume={resume} template={template} paper={paper} />
            <div className="text-center text-xs text-stone-400 mt-2 pb-4">Live preview — page guides show approximate breaks.</div>
          </div>
          {/* Print-only preview at document root so printing renders correctly */}
          <div className="hidden print:block">
            <Preview resume={resume} template={template} paper={paper} printMode />
          </div>
        </div>
      )}

      {tab === "cover" && (
        <CoverLetterTab
          resume={resume}
          jd={jd} setJd={setJd}
          honesty={honesty}
          coverLetter={coverLetter}
          setCoverLetter={setCoverLetter}
          attachCoverLetter={attachCoverLetter}
          setAttachCoverLetter={setAttachCoverLetter}
        />
      )}

      {tab === "apps" && (
        <ApplicationsTab
          apps={apps} setApps={setApps}
          currentResume={resume} currentCoverLetter={coverLetter} currentJd={jd}
          currentSnapshot={appSnapshot} setCurrentSnapshot={setAppSnapshot}
          loadApplication={loadApplication}
          interviewPrepAuto={interviewPrepAuto} setInterviewPrepAuto={setInterviewPrepAuto}
          interviewHonesty={interviewHonesty} setInterviewHonesty={setInterviewHonesty}
          interviewPrepSettings={interviewPrepSettings} setInterviewPrepSettings={setInterviewPrepSettings}
          runInterviewPrep={runInterviewPrep} cancelInterviewPrep={cancelInterviewPrep}
          attachResumeToApp={attachResumeToApp}
        />
      )}

      {saveDialog && (
        <SaveApplicationDialog
          status={saveDialog.status}
          defaultLabel={guessJobLabel(jd)}
          defaultCompany={guessCompany(jd)}
          hasCoverLetter={!!coverLetter.trim()}
          defaultAttachCoverLetter={attachCoverLetter}
          onCancel={() => setSaveDialog(null)}
          onSave={commitSaveDialog}
        />
      )}
    </div>
  );
}
