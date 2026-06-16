import React, { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import Builder from "./Builder.jsx";
import Preview from "./Preview.jsx";
import CoverLetterTab from "./CoverLetterTab.jsx";
import ApplicationsTab from "./ApplicationsTab.jsx";

import {
  loadResume, saveResume, clearResume,
  loadTemplate, saveTemplate,
  loadHonesty, saveHonesty,
  loadCoverLetter, saveCoverLetter,
  loadJD, saveJD,
  loadApps, saveApps,
} from "../lib/storage.js";
import { defaultResume } from "../data/defaultResume.js";
import { TEMPLATES, getTemplate } from "../lib/templates.js";
import { exportDocx } from "../lib/docxExport.js";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON, mapParsed } from "../lib/parse.js";
import { deepClone, uid } from "../lib/util.js";

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
  const [tab, setTab] = useState("resume"); // 'resume' | 'cover' | 'apps'
  const [resume, setResume] = useState(() => loadResume() || defaultResume());
  const [templateId, setTemplateId] = useState(() => loadTemplate() || "classic");
  const [honesty, setHonesty] = useState(() => loadHonesty());
  const [coverLetter, setCoverLetter] = useState(() => loadCoverLetter());
  const [jd, setJd] = useState(() => loadJD());
  const [apps, setApps] = useState(() => loadApps());
  // The "previous state" snapshot, populated when a saved application is Loaded.
  const [appSnapshot, setAppSnapshot] = useState(null);

  // Upload state lives here so it survives tab switches
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { saveResume(resume); }, [resume]);
  useEffect(() => { saveTemplate(templateId); }, [templateId]);
  useEffect(() => { saveHonesty(honesty); }, [honesty]);
  useEffect(() => { saveCoverLetter(coverLetter); }, [coverLetter]);
  useEffect(() => { saveJD(jd); }, [jd]);
  useEffect(() => { saveApps(apps); }, [apps]);

  const template = getTemplate(templateId);

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setUploadErr("");
    try {
      const system = 'Extract this résumé into JSON with this exact schema: {"contact":{"name":"","location":"","email":"","phone":"","linkedin":"","github":""},"profile":"","experience":[{"org":"","role":"","dates":"","loc":"","bullets":[]}],"education":[{"org":"","role":"","dates":"","loc":"","bullets":[]}],"skills":[{"label":"","text":""}],"certs":[],"awards":[],"projects":[{"label":"","text":""}]}. Include EVERY job and EVERY bullet from the source. Do not truncate. Return ONLY the JSON, no markdown, no commentary.';
      const name = file.name.toLowerCase();
      let content;
      if (name.endsWith(".pdf")) {
        const b64 = (await readFile(file, "dataURL")).split(",")[1];
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Extract this résumé to JSON per the schema. Include every job and every bullet." },
        ];
      } else if (name.endsWith(".docx")) {
        const buf = await readFile(file, "arrayBuffer");
        const out = await mammoth.extractRawText({ arrayBuffer: buf });
        content = "Extract this résumé to JSON per the schema. Include every job and every bullet:\n\n" + out.value;
      } else if (/\.(png|jpe?g|webp|gif)$/.test(name)) {
        const b64 = (await readFile(file, "dataURL")).split(",")[1];
        const mt = "image/" + (name.endsWith(".png") ? "png" : name.endsWith(".webp") ? "webp" : name.endsWith(".gif") ? "gif" : "jpeg");
        content = [
          { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
          { type: "text", text: "Extract this résumé to JSON per the schema. Include every job and every bullet." },
        ];
      } else {
        const text = await readFile(file, "text");
        content = "Extract this résumé to JSON per the schema. Include every job and every bullet:\n\n" + text;
      }
      const data = await callClaude({ system, messages: [{ role: "user", content }], max_tokens: 8000 });
      const parsed = extractJSON(extractText(data));
      if (parsed) setResume(mapParsed(parsed));
      else setUploadErr("Couldn't parse that file. Try a .docx or .txt version.");
    } catch (e) {
      setUploadErr("Upload failed: " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function saveApplication() {
    // Try to guess label/company/role from JD first line
    let label = "";
    let role = "";
    let company = "";
    const firstLine = (jd || "").split("\n").find((l) => l.trim().length > 0) || "";
    if (firstLine) {
      label = firstLine.trim().slice(0, 80);
    }
    label = prompt("Label for this application?", label) || label;
    if (!label) return;
    company = prompt("Company name? (optional)", company) || "";
    role = prompt("Role title? (optional)", role) || "";
    const app = {
      id: uid(),
      label, company, role,
      savedAt: Date.now(),
      jd,
      resume: deepClone(resume),
      coverLetter,
      templateId,
      honesty,
    };
    setApps((a) => [...a, app]);
    alert("Saved! Find it in the Applications tab.");
  }

  function loadApplication(app) {
    // Accepts either a full app object or a {resume, coverLetter, jd} snapshot.
    if (app.resume) setResume(deepClone(app.resume));
    if (typeof app.coverLetter === "string") setCoverLetter(app.coverLetter);
    if (typeof app.jd === "string") setJd(app.jd);
    if (app.templateId) setTemplateId(app.templateId);
    if (typeof app.honesty === "number") setHonesty(app.honesty);
    setTab("resume");
  }

  function reset() {
    if (!confirm("Reset to defaults? Clears your current résumé, cover letter, and pasted JD. (Saved Applications are kept.)")) return;
    clearResume();
    setResume(defaultResume());
    setCoverLetter("");
    setJd("");
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
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-2 rounded-md text-sm font-medium border border-stone-300 hover:bg-stone-50 disabled:opacity-50">
            {uploading ? "Parsing…" : "📥 Upload CV"}
          </button>
          <button onClick={saveApplication} disabled={!jd && !resume.profile.text} className="px-3 py-2 rounded-md text-sm border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50" title="Save current résumé+cover+JD as an application">
            ★ Save application
          </button>
          <label className="text-xs text-stone-500 flex items-center gap-1.5">
            Template:
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="border border-stone-300 rounded px-2 py-1.5 text-sm bg-white">
              {TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </label>
          <button onClick={reset} className="px-3 py-2 rounded-md text-sm border border-stone-200 text-stone-500 hover:bg-stone-50">Reset</button>
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
          <div className="no-print">
            <Builder
              resume={resume} setResume={setResume}
              honesty={honesty} setHonesty={setHonesty}
              jd={jd} setJd={setJd}
              setCoverLetter={setCoverLetter}
              openCoverTab={() => setTab("cover")}
            />
          </div>
          <div>
            <div className="lg:sticky lg:top-20">
              <Preview resume={resume} template={template} />
              <div className="no-print text-center text-xs text-stone-400 mt-2">Live preview — exactly what exports.</div>
            </div>
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
