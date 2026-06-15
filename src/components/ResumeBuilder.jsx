import React, { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import Preview from "./Preview.jsx";
import JobMatcher from "./JobMatcher.jsx";
import { TAG_COLORS } from "../lib/constants.js";
import { uid } from "../lib/util.js";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON, mapParsed } from "../lib/parse.js";
import { defaultResume } from "../data/defaultResume.js";
import { loadResume, saveResume, clearResume, loadTemplate, saveTemplate } from "../lib/storage.js";
import { TEMPLATES, getTemplate } from "../lib/templates.js";

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

export default function ResumeBuilder() {
  const [resume, setResume] = useState(() => loadResume() || defaultResume());
  const [templateId, setTemplateId] = useState(() => loadTemplate() || "classic");
  const [loadingMap, setLoadingMap] = useState({});
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const fileRef = useRef(null);

  useEffect(() => { saveResume(resume); }, [resume]);
  useEffect(() => { saveTemplate(templateId); }, [templateId]);

  const template = getTemplate(templateId);

  const mapSec = (secId, fn) => setResume((r) => ({ ...r, sections: r.sections.map((s) => (s.id === secId ? fn(s) : s)) }));
  const patchEntry = (secId, enId, patch) => mapSec(secId, (s) => ({ ...s, entries: s.entries.map((e) => (e.id === enId ? { ...e, ...patch } : e)) }));
  const patchBullet = (secId, enId, bId, patch) => mapSec(secId, (s) => ({
    ...s, entries: s.entries.map((e) => e.id !== enId ? e : { ...e, bullets: e.bullets.map((b) => (b.id === bId ? { ...b, ...patch } : b)) })
  }));
  const delEntry = (secId, enId) => mapSec(secId, (s) => ({ ...s, entries: s.entries.filter((e) => e.id !== enId) }));
  const delBullet = (secId, enId, bId) => mapSec(secId, (s) => ({
    ...s, entries: s.entries.map((e) => e.id !== enId ? e : { ...e, bullets: e.bullets.filter((b) => b.id !== bId) })
  }));
  const addBullets = (secId, enId, texts, tag) => mapSec(secId, (s) => ({
    ...s, entries: s.entries.map((e) => e.id !== enId ? e : {
      ...e, bullets: [...e.bullets, ...texts.map((t) => ({ id: uid(), on: true, tag, text: String(t) }))]
    })
  }));
  const addEntry = (sec) => {
    const blank = sec.kind === "entries"
      ? { id: uid(), on: true, org: "New entry", loc: "", role: "", dates: "", sub: "", bullets: [] }
      : { id: uid(), on: true, tag: "IMPACT", label: "", text: "New item" };
    mapSec(sec.id, (s) => ({ ...s, entries: [...s.entries, blank] }));
  };
  const setContact = (k, v) => setResume((r) => ({ ...r, contact: { ...r.contact, [k]: v } }));
  const setLoading = (id, v) => setLoadingMap((m) => ({ ...m, [id]: v }));

  const reset = () => { clearResume(); setResume(defaultResume()); };

  async function genBullets(secId, entry, mode) {
    setLoading(entry.id, mode); setErr("");
    try {
      const system = "You are an expert resume writer. Return ONLY a JSON array of exactly 5 strings. Each string is one concise, achievement-oriented resume bullet (max ~25 words), no leading dash, no numbering, no markdown.";
      const user = mode === "web"
        ? `Search the web for the role "${entry.role}" at "${entry.org}". Using real current job listings for this or similar roles at this company, write 5 resume bullets reflecting the key responsibilities and requirements.`
        : `Write 5 strong, specific, achievement-oriented resume bullets for the role "${entry.role}" at "${entry.org}". Make them credible and concrete.`;
      const body = { system, messages: [{ role: "user", content: user }] };
      if (mode === "web") body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
      const data = await callClaude(body);
      const arr = extractJSON(extractText(data));
      if (Array.isArray(arr) && arr.length) addBullets(secId, entry.id, arr, mode === "web" ? "WEB" : "AI");
      else setErr("Couldn't parse the suggestions — try again.");
    } catch (e) { setErr("Generation failed: " + e.message); }
    finally { setLoading(entry.id, null); }
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const system = 'Extract this resume into JSON with this exact schema: {"contact":{"name":"","location":"","email":"","phone":"","linkedin":"","github":""},"profile":"","experience":[{"org":"","role":"","dates":"","loc":"","bullets":[]}],"education":[{"org":"","role":"","dates":"","loc":"","bullets":[]}],"skills":[{"label":"","text":""}],"certs":[],"projects":[{"label":"","text":""}]}. Limit to the 5 most recent jobs with up to 6 bullets each. Return ONLY the JSON, no markdown, no commentary.';
      const name = file.name.toLowerCase();
      let content;
      if (name.endsWith(".pdf")) {
        const b64 = (await readFile(file, "dataURL")).split(",")[1];
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Extract this resume to JSON per the schema." },
        ];
      } else if (name.endsWith(".docx")) {
        const buf = await readFile(file, "arrayBuffer");
        const out = await mammoth.extractRawText({ arrayBuffer: buf });
        content = "Extract this resume to JSON per the schema:\n\n" + out.value;
      } else if (/\.(png|jpe?g|webp|gif)$/.test(name)) {
        const b64 = (await readFile(file, "dataURL")).split(",")[1];
        const mt = "image/" + (name.endsWith(".png") ? "png" : name.endsWith(".webp") ? "webp" : name.endsWith(".gif") ? "gif" : "jpeg");
        content = [
          { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
          { type: "text", text: "Extract this resume to JSON per the schema." },
        ];
      } else {
        const text = await readFile(file, "text");
        content = "Extract this resume to JSON per the schema:\n\n" + text;
      }
      const data = await callClaude({ system, messages: [{ role: "user", content }], max_tokens: 2000 });
      const parsed = extractJSON(extractText(data));
      if (parsed) setResume(mapParsed(parsed));
      else setErr("Couldn't parse that file. Try a .docx or .txt version.");
    } catch (e) { setErr("Upload failed: " + e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const selectedCount = resume.sections.reduce(
    (n, s) => n + (s.kind === "list"
      ? s.entries.filter((e) => e.on).length
      : s.entries.filter((e) => e.on).reduce((m, e) => m + e.bullets.filter((b) => b.on).length, 0)),
    0
  );

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }} className="w-full min-h-screen bg-stone-100 text-stone-800">
      {/* Top bar */}
      <div className="no-print sticky top-0 z-20 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-stone-900">Résumé Forge</div>
          <div className="text-xs text-stone-500">{selectedCount} bullets selected · toggle whole jobs or single lines, then export</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-stone-500 flex items-center gap-1.5">
            Template:
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="border border-stone-300 rounded px-2 py-1.5 text-sm bg-white">
              {TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </label>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} className="px-3 py-2 rounded-md text-sm font-medium border border-stone-300 hover:bg-stone-50 disabled:opacity-50">
            {uploading ? "Parsing…" : "Upload CV"}
          </button>
          <button onClick={reset} className="px-3 py-2 rounded-md text-sm border border-stone-200 text-stone-500 hover:bg-stone-50">Reset</button>
          <button onClick={() => window.print()} className="px-4 py-2 rounded-md text-white text-sm font-medium hover:opacity-90" style={{ background: template.accent }}>Generate PDF →</button>
        </div>
      </div>

      {err && (
        <div className="no-print bg-red-50 border-b border-red-200 text-red-700 text-sm px-5 py-2">
          {err} <button onClick={() => setErr("")} className="underline ml-2">dismiss</button>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
        {/* BUILDER */}
        <div className="no-print space-y-5">
          {/* Job description matcher */}
          <JobMatcher resume={resume} applyResume={setResume} />

          {/* Contact */}
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Contact</div>
            <div className="grid grid-cols-2 gap-2">
              {[["name","Full name"],["location","City, State"],["email","Email"],["phone","Phone"],["linkedin","LinkedIn"],["github","GitHub / portfolio"]].map(([k, ph]) => (
                <input key={k} value={resume.contact[k]} onChange={(e) => setContact(k, e.target.value)} placeholder={ph} className="border border-stone-200 rounded px-2 py-1.5 text-sm focus:border-stone-400 outline-none" />
              ))}
            </div>
          </div>

          {/* Profile */}
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={resume.profile.on} onChange={() => setResume((r) => ({ ...r, profile: { ...r.profile, on: !r.profile.on } }))} className="mt-1 w-4 h-4 accent-teal-800" />
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1">Profile summary</div>
                <textarea value={resume.profile.text} onChange={(e) => setResume((r) => ({ ...r, profile: { ...r.profile, text: e.target.value } }))} rows={3} className={`w-full text-sm border border-stone-200 rounded p-2 outline-none focus:border-stone-400 ${resume.profile.on ? "" : "line-through text-stone-300"}`} />
              </div>
            </label>
          </div>

          {/* Sections */}
          {resume.sections.map((sec) => (
            <div key={sec.id} className="bg-white rounded-lg border border-stone-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
                <button onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))} className="font-semibold text-stone-800 text-sm flex items-center gap-2">
                  <span className="text-stone-400">{collapsed[sec.id] ? "▸" : "▾"}</span>{sec.title}
                </button>
              </div>
              {!collapsed[sec.id] && (
                <div className="p-3 space-y-3">
                  {sec.kind === "entries"
                    ? sec.entries.map((en) => (
                        <div key={en.id} className={`rounded-md border p-3 ${en.on ? "border-stone-200 bg-stone-50" : "border-stone-100 bg-stone-100/50"}`}>
                          <div className="flex items-start gap-2">
                            <input type="checkbox" checked={en.on} onChange={() => patchEntry(sec.id, en.id, { on: !en.on })} title="Include this whole entry" className="mt-1.5 w-4 h-4 accent-teal-800 shrink-0" />
                            <div className="flex-1">
                              <div className="grid grid-cols-2 gap-1.5">
                                <input className="bare text-sm font-semibold border-b border-stone-200 px-1 py-0.5" value={en.org} onChange={(e) => patchEntry(sec.id, en.id, { org: e.target.value })} />
                                <input className="bare text-sm text-stone-500 border-b border-stone-200 px-1 py-0.5 text-right" value={en.dates} onChange={(e) => patchEntry(sec.id, en.id, { dates: e.target.value })} />
                                <input className="bare text-xs italic text-stone-600 border-b border-stone-100 px-1 py-0.5" value={en.role} onChange={(e) => patchEntry(sec.id, en.id, { role: e.target.value })} />
                                <input className="bare text-xs text-stone-500 border-b border-stone-100 px-1 py-0.5 text-right" value={en.loc} onChange={(e) => patchEntry(sec.id, en.id, { loc: e.target.value })} />
                              </div>
                              {sec.id === "exp" && (
                                <div className="flex gap-2 mt-2 flex-wrap">
                                  <button onClick={() => genBullets(sec.id, en, "web")} disabled={!!loadingMap[en.id]} className="text-[11px] px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                                    {loadingMap[en.id] === "web" ? "Searching…" : "🔍 Find bullets (web)"}
                                  </button>
                                  <button onClick={() => genBullets(sec.id, en, "ai")} disabled={!!loadingMap[en.id]} className="text-[11px] px-2 py-1 rounded border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                                    {loadingMap[en.id] === "ai" ? "Writing…" : "✨ AI write"}
                                  </button>
                                  <button onClick={() => addBullets(sec.id, en.id, ["New bullet"], "IMPACT")} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-500 hover:bg-white">+ bullet</button>
                                  <button onClick={() => delEntry(sec.id, en.id)} className="text-[11px] px-2 py-1 rounded text-stone-400 hover:text-red-600 ml-auto">Delete job</button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={`mt-2 space-y-1.5 ${en.on ? "" : "opacity-40"}`}>
                            {en.bullets.map((b) => (
                              <div key={b.id} className="flex items-start gap-2">
                                <input type="checkbox" checked={b.on} onChange={() => patchBullet(sec.id, en.id, b.id, { on: !b.on })} className="mt-1.5 w-4 h-4 accent-teal-800 shrink-0" />
                                <span className="pill mt-0.5 shrink-0" style={{ background: TAG_COLORS[b.tag] || "#888" }}>{b.tag}</span>
                                <textarea value={b.text} onChange={(e) => patchBullet(sec.id, en.id, b.id, { text: e.target.value })} rows={1} className={`bare flex-1 text-sm leading-snug resize-none border border-transparent hover:border-stone-200 rounded px-1 py-0.5 ${b.on ? "text-stone-800" : "line-through text-stone-300"}`} />
                                <button onClick={() => delBullet(sec.id, en.id, b.id)} className="text-stone-300 hover:text-red-500 text-xs mt-1">✕</button>
                              </div>
                            ))}
                            {sec.id === "edu" && (
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => addBullets(sec.id, en.id, ["New detail"], "DATA")} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-500 hover:bg-white">+ detail</button>
                                <button onClick={() => delEntry(sec.id, en.id)} className="text-[11px] px-2 py-1 rounded text-stone-400 hover:text-red-600 ml-auto">Delete school</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    : sec.entries.map((it) => (
                        <div key={it.id} className="flex items-start gap-2">
                          <input type="checkbox" checked={it.on} onChange={() => patchEntry(sec.id, it.id, { on: !it.on })} className="mt-1.5 w-4 h-4 accent-teal-800 shrink-0" />
                          <div className="flex-1">
                            {sec.id !== "certs" && (
                              <input className="bare text-xs font-semibold text-stone-700 mb-0.5 border-b border-stone-100 px-1" placeholder="Label" value={it.label} onChange={(e) => patchEntry(sec.id, it.id, { label: e.target.value })} />
                            )}
                            <textarea value={it.text} onChange={(e) => patchEntry(sec.id, it.id, { text: e.target.value })} rows={1} className={`bare w-full text-sm leading-snug resize-none border border-transparent hover:border-stone-200 rounded px-1 py-0.5 ${it.on ? "text-stone-800" : "line-through text-stone-300"}`} />
                          </div>
                          <button onClick={() => delEntry(sec.id, it.id)} className="text-stone-300 hover:text-red-500 text-xs mt-1">✕</button>
                        </div>
                      ))}
                  <button onClick={() => addEntry(sec)} className="text-xs text-teal-700 hover:underline mt-1">{sec.addLabel}</button>
                </div>
              )}
            </div>
          ))}
          <div className="text-xs text-stone-400 px-1 pb-6">Keep ~3–5 bullets per job. Coloured tags are picking aids and don't print. Your work auto-saves in this browser.</div>
        </div>

        {/* PREVIEW */}
        <div>
          <div className="lg:sticky lg:top-20">
            <Preview resume={resume} template={template} />
            <div className="no-print text-center text-xs text-stone-400 mt-2">Live preview — exactly what exports to PDF.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
