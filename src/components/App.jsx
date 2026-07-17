import React, { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import Builder from "./Builder.jsx";
import Preview from "./Preview.jsx";
import CoverLetterTab from "./CoverLetterTab.jsx";
import ApplicationsTab from "./ApplicationsTab.jsx";
import { useAuth } from "./AuthProvider.jsx";

import {
  loadUserData,
  saveResume, saveTemplate, saveHonesty, saveCoverLetter,
  saveJD, saveJobUrl, savePaper, saveApps,
} from "../lib/storage.js";
import { defaultResume } from "../data/defaultResume.js";
import { TEMPLATES, getTemplate } from "../lib/templates.js";
import { exportDocx } from "../lib/docxExport.js";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON, mapParsed } from "../lib/parse.js";
import { CV_EXTRACTION_REQUEST, CV_EXTRACTION_SYSTEM, parseStructuredDocxHtml } from "../lib/cvParse.js";
import { deepClone, uid } from "../lib/util.js";
import { historyEntry } from "../lib/funnel.js";

function readFile(file, as) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("file read failed"));
    if (as === "dataURL") r.readAsDataURL(file);
    else if (as === "arrayBuffer") r.readAsArrayBuffer(file);
    else r.readAsText(file);
  });
}

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
  const [storageReady, setStorageReady] = useState(false);
  const [storageErr, setStorageErr] = useState("");

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
      const system = CV_EXTRACTION_SYSTEM;
      const name = file.name.toLowerCase();
      let content;
      let parsed = null;
      if (name.endsWith(".pdf")) {
        const b64 = (await readFile(file, "dataURL")).split(",")[1];
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: CV_EXTRACTION_REQUEST },
        ];
      } else if (name.endsWith(".docx")) {
        const buf = await readFile(file, "arrayBuffer");
        const out = await mammoth.convertToHtml({ arrayBuffer: buf });
        parsed = parseStructuredDocxHtml(out.value);
        if (!parsed) {
          content = CV_EXTRACTION_REQUEST + "\n\nThe source below is semantic HTML converted from DOCX. Preserve table-row relationships:\n\n" + out.value;
        }
      } else if (/\.(png|jpe?g|webp|gif)$/.test(name)) {
        const b64 = (await readFile(file, "dataURL")).split(",")[1];
        const mt = "image/" + (name.endsWith(".png") ? "png" : name.endsWith(".webp") ? "webp" : name.endsWith(".gif") ? "gif" : "jpeg");
        content = [
          { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
          { type: "text", text: CV_EXTRACTION_REQUEST },
        ];
      } else {
        const text = await readFile(file, "text");
        content = CV_EXTRACTION_REQUEST + "\n\n" + text;
      }
      if (!parsed) {
        const data = await callClaude({ system, messages: [{ role: "user", content }], max_tokens: 8000 });
        parsed = extractJSON(extractText(data));
      }
      if (parsed) setResume(mapParsed(parsed));
      else setUploadErr("Couldn't parse that file. Try a DOCX or text-based PDF.");
    } catch (e) {
      setUploadErr("Upload failed: " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function buildAppRecord(status = "saved") {
    const firstLine = (jd || "").split("\n").find((l) => l.trim().length > 0) || "";
    const guessLabel = firstLine.trim().slice(0, 80) || "Untitled";
    const label = prompt("Label?", guessLabel) || guessLabel;
    if (!label) return null;
    const company = prompt("Company name? (optional)", "") || "";
    const role = prompt("Role title? (optional)", "") || "";
    return {
      id: uid(),
      label, company, role,
      savedAt: Date.now(),
      jd, jobUrl,
      resume: deepClone(resume),
      coverLetter,
      templateId,
      honesty,
      status,
      statusHistory: [historyEntry(status)],
      notes: "",
    };
  }
  function saveApplication() {
    const rec = buildAppRecord("saved");
    if (!rec) return;
    setApps((a) => [...a, rec]);
    alert("Saved! Find it in the Applications tab.");
  }
  function markAppliedNow() {
    const rec = buildAppRecord("applied");
    if (!rec) return;
    setApps((a) => [...a, rec]);
    setTab("apps");
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
        />
      )}

      {tab === "apps" && (
        <ApplicationsTab
          apps={apps} setApps={setApps}
          currentResume={resume} currentCoverLetter={coverLetter} currentJd={jd}
          currentSnapshot={appSnapshot} setCurrentSnapshot={setAppSnapshot}
          loadApplication={loadApplication}
        />
      )}
    </div>
  );
}
