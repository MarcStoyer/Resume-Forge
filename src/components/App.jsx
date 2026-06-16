import React, { useState, useEffect } from "react";
import Builder from "./Builder.jsx";
import Preview from "./Preview.jsx";
import CoverLetterTab from "./CoverLetterTab.jsx";
import {
  loadResume, saveResume, clearResume,
  loadTemplate, saveTemplate,
  loadHonesty, saveHonesty,
  loadCoverLetter, saveCoverLetter,
  loadJD, saveJD,
} from "../lib/storage.js";
import { defaultResume } from "../data/defaultResume.js";
import { TEMPLATES, getTemplate } from "../lib/templates.js";
import { exportDocx } from "../lib/docxExport.js";

export default function App() {
  const [tab, setTab] = useState("resume"); // 'resume' | 'cover'
  const [resume, setResume] = useState(() => loadResume() || defaultResume());
  const [templateId, setTemplateId] = useState(() => loadTemplate() || "classic");
  const [honesty, setHonesty] = useState(() => loadHonesty());
  const [coverLetter, setCoverLetter] = useState(() => loadCoverLetter());
  const [jd, setJd] = useState(() => loadJD());

  useEffect(() => { saveResume(resume); }, [resume]);
  useEffect(() => { saveTemplate(templateId); }, [templateId]);
  useEffect(() => { saveHonesty(honesty); }, [honesty]);
  useEffect(() => { saveCoverLetter(coverLetter); }, [coverLetter]);
  useEffect(() => { saveJD(jd); }, [jd]);

  const template = getTemplate(templateId);

  function reset() {
    if (!confirm("Reset everything to defaults? This clears your CV, cover letter, and pasted JD.")) return;
    clearResume();
    setResume(defaultResume());
    setCoverLetter("");
    setJd("");
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }} className="w-full min-h-screen bg-stone-100 text-stone-800">
      {/* Top bar */}
      <div className="no-print sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="font-semibold text-stone-900">Résumé Forge</div>
          <div className="flex bg-stone-100 rounded-md p-0.5 text-sm">
            <button onClick={() => setTab("resume")} className={`px-3 py-1 rounded ${tab === "resume" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>Résumé</button>
            <button onClick={() => setTab("cover")} className={`px-3 py-1 rounded ${tab === "cover" ? "bg-white shadow-sm font-medium" : "text-stone-500"}`}>Cover Letter</button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {tab === "resume" ? (
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
      ) : (
        <CoverLetterTab
          resume={resume}
          jd={jd} setJd={setJd}
          honesty={honesty}
          coverLetter={coverLetter}
          setCoverLetter={setCoverLetter}
        />
      )}
    </div>
  );
}
