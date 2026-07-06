import React, { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove as dndArrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";

import Sortable from "./Sortable.jsx";
import JobMatcher from "./JobMatcher.jsx";
import HonestySlider from "./HonestySlider.jsx";
import { TAG_COLORS } from "../lib/constants.js";
import { uid } from "../lib/util.js";
import { callClaude } from "../lib/api.js";
import { extractText, extractJSON } from "../lib/parse.js";
import { honestyPromptFragment } from "../lib/honesty.js";

export default function Builder({
  resume, setResume, honesty, setHonesty, jd, setJd,
  jobUrl, setJobUrl,
  setCoverLetter, openCoverTab,
}) {
  const [loadingMap, setLoadingMap] = useState({});
  const [err, setErr] = useState("");
  const [collapsed, setCollapsed] = useState({});         // sectionId -> bool
  const [entryCollapsed, setEntryCollapsed] = useState({}); // entryId -> bool

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
      ...e, bullets: [...e.bullets, ...texts.map((t) => ({ id: uid(), on: true, tag, text: String(t), original: String(t) }))]
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

  const setAllInSection = (secId, on) => mapSec(secId, (s) => {
    if (s.kind === "entries") {
      return { ...s, entries: s.entries.map((e) => ({ ...e, on, bullets: e.bullets.map((b) => ({ ...b, on })) })) };
    }
    return { ...s, entries: s.entries.map((e) => ({ ...e, on })) };
  });
  const setAllBullets = (secId, enId, on) => mapSec(secId, (s) => ({
    ...s, entries: s.entries.map((e) => e.id !== enId ? e : { ...e, bullets: e.bullets.map((b) => ({ ...b, on })) })
  }));

  function addCustomSection() {
    const name = prompt("Section name? (e.g., Publications, Languages, Volunteer)");
    if (!name || !name.trim()) return;
    const kind = confirm("OK = list-style (simple items). Cancel = entries-style (jobs/schools with bullets).") ? "list" : "entries";
    const newSec = {
      id: "custom_" + uid(),
      title: name.trim(), kind,
      addLabel: kind === "entries" ? "+ Add entry" : "+ Add item",
      removable: true, entries: [],
    };
    setResume((r) => ({ ...r, sections: [...r.sections, newSec] }));
  }
  function deleteSection(secId) {
    if (!confirm("Delete this entire section?")) return;
    setResume((r) => ({ ...r, sections: r.sections.filter((s) => s.id !== secId) }));
  }
  function renameSection(secId) {
    const sec = resume.sections.find((s) => s.id === secId);
    const name = prompt("New section name?", sec?.title || "");
    if (!name || !name.trim()) return;
    mapSec(secId, (s) => ({ ...s, title: name.trim() }));
  }

  // Collapse-all shortcuts
  function collapseAllInSection(secId) {
    const sec = resume.sections.find((s) => s.id === secId);
    if (!sec || sec.kind !== "entries") return;
    setEntryCollapsed((m) => {
      const n = { ...m };
      sec.entries.forEach((e) => { n[e.id] = true; });
      return n;
    });
  }
  function expandAllInSection(secId) {
    const sec = resume.sections.find((s) => s.id === secId);
    if (!sec || sec.kind !== "entries") return;
    setEntryCollapsed((m) => {
      const n = { ...m };
      sec.entries.forEach((e) => { n[e.id] = false; });
      return n;
    });
  }

  function onDragEndSections(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setResume((r) => {
      const ids = r.sections.map((s) => s.id);
      const oldI = ids.indexOf(active.id), newI = ids.indexOf(over.id);
      return { ...r, sections: dndArrayMove(r.sections, oldI, newI) };
    });
  }
  function onDragEndBullets(secId, enId) {
    return (e) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      mapSec(secId, (s) => ({
        ...s, entries: s.entries.map((en) => {
          if (en.id !== enId) return en;
          const ids = en.bullets.map((b) => b.id);
          const oldI = ids.indexOf(active.id), newI = ids.indexOf(over.id);
          return { ...en, bullets: dndArrayMove(en.bullets, oldI, newI) };
        })
      }));
    };
  }
  function onDragEndEntries(secId) {
    return (e) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      mapSec(secId, (s) => {
        const ids = s.entries.map((en) => en.id);
        const oldI = ids.indexOf(active.id), newI = ids.indexOf(over.id);
        return { ...s, entries: dndArrayMove(s.entries, oldI, newI) };
      });
    };
  }

  async function genBullets(secId, entry, mode) {
    setLoading(entry.id, mode); setErr("");
    try {
      const system = "You are an expert résumé writer. Return ONLY a JSON array of exactly 5 strings. Each is one concise, achievement-oriented résumé bullet (max ~25 words) using implied-subject action verbs (e.g. 'Built', 'Architected'). Never start with 'I'. No leading dash, no numbering, no markdown.";
      const user = mode === "web"
        ? `Search the web for the role "${entry.role}" at "${entry.org}". Using real current job listings for this or similar roles, write 5 résumé bullets reflecting key responsibilities.`
        : `Write 5 strong, specific, achievement-oriented résumé bullets for the role "${entry.role}" at "${entry.org}". Be concrete.`;
      const body = { system, messages: [{ role: "user", content: user }] };
      if (mode === "web") body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
      const data = await callClaude(body);
      const arr = extractJSON(extractText(data));
      if (Array.isArray(arr) && arr.length) addBullets(secId, entry.id, arr, mode === "web" ? "WEB" : "AI");
      else setErr("Couldn't parse the suggestions — try again.");
    } catch (e) { setErr("Generation failed: " + e.message); }
    finally { setLoading(entry.id, null); }
  }

  async function rewriteBullet(secId, enId, bullet) {
    if (!jd.trim()) { setErr("Paste a job description in the Tailor panel first."); return; }
    setLoading(bullet.id, "rw"); setErr("");
    try {
      const honestyDir = honestyPromptFragment(honesty);
      const system = "You rewrite a single résumé bullet to better match a job description. " + honestyDir +
        " Return ONLY a JSON object: {\"text\":\"<rewritten bullet>\"}. No markdown.";
      const user = `JOB DESCRIPTION:\n${jd}\n\nORIGINAL BULLET:\n${bullet.original || bullet.text}`;
      const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 400 });
      const parsed = extractJSON(extractText(data));
      if (parsed && parsed.text) {
        patchBullet(secId, enId, bullet.id, { text: parsed.text, tag: "TAILORED" });
      } else setErr("Couldn't parse the rewrite.");
    } catch (e) { setErr("Rewrite failed: " + e.message); }
    finally { setLoading(bullet.id, null); }
  }

  function revertBullet(secId, enId, bullet) {
    if (bullet.original) patchBullet(secId, enId, bullet.id, { text: bullet.original, tag: bullet.tag === "TAILORED" ? "IMPACT" : bullet.tag });
  }

  async function genSummary() {
    setLoading("__profile", "ai"); setErr("");
    try {
      const honestyDir = honestyPromptFragment(honesty);
      const allBullets = [];
      resume.sections.forEach((s) => {
        if (s.kind === "entries") s.entries.forEach((e) => e.bullets.forEach((b) => allBullets.push(b.original || b.text)));
      });
      const system = "You write a 2-3 sentence professional summary for a résumé. Write in FIRST PERSON, FORMAL register (no contractions). " + honestyDir + " " +
        (jd.trim() ? "Tailor it to the job description provided. " : "") +
        "Return ONLY a JSON object: {\"text\":\"<summary>\"}. No markdown.";
      const user = (jd.trim() ? `JOB DESCRIPTION:\n${jd}\n\n` : "") +
        `CANDIDATE NAME: ${resume.contact.name}\n\nCURRENT SUMMARY:\n${resume.profile.original || resume.profile.text}\n\nCANDIDATE BULLETS:\n${allBullets.map((b) => "- " + b).join("\n")}`;
      const data = await callClaude({ system, messages: [{ role: "user", content: user }], max_tokens: 500 });
      const parsed = extractJSON(extractText(data));
      if (parsed && parsed.text) setResume((r) => ({ ...r, profile: { ...r.profile, text: parsed.text, on: true } }));
      else setErr("Couldn't generate summary.");
    } catch (e) { setErr("Summary failed: " + e.message); }
    finally { setLoading("__profile", null); }
  }
  function revertSummary() {
    if (resume.profile.original) setResume((r) => ({ ...r, profile: { ...r.profile, text: r.profile.original } }));
  }

  const selectedCount = resume.sections.reduce(
    (n, s) => n + (s.kind === "list"
      ? s.entries.filter((e) => e.on).length
      : s.entries.filter((e) => e.on).reduce((m, e) => m + e.bullets.filter((b) => b.on).length, 0)), 0);

  return (
    <div className="space-y-5">
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
          {err} <button onClick={() => setErr("")} className="underline ml-2">dismiss</button>
        </div>
      )}
      <div className="text-xs text-stone-500 text-right">{selectedCount} bullets selected</div>

      <HonestySlider value={honesty} onChange={setHonesty} />
      <JobMatcher resume={resume} applyResume={setResume} honesty={honesty} jd={jd} setJd={setJd} jobUrl={jobUrl} setJobUrl={setJobUrl} setCoverLetter={setCoverLetter} openCoverTab={openCoverTab} />

      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Contact</div>
        <div className="grid grid-cols-2 gap-2">
          {[["name","Full name"],["location","City, State"],["email","Email"],["phone","Phone"],["linkedin","LinkedIn"],["github","GitHub / portfolio"]].map(([k, ph]) => (
            <input key={k} value={resume.contact[k]} onChange={(e) => setContact(k, e.target.value)} placeholder={ph} className="border border-stone-200 rounded px-2 py-1.5 text-sm focus:border-stone-400 outline-none" />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={resume.profile.on} onChange={() => setResume((r) => ({ ...r, profile: { ...r.profile, on: !r.profile.on } }))} className="mt-1 w-4 h-4 accent-teal-800" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Profile summary</div>
              <div className="flex gap-1">
                <button onClick={genSummary} disabled={loadingMap.__profile === "ai"} className="text-[11px] px-2 py-1 rounded border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                  {loadingMap.__profile === "ai" ? "Writing…" : "✨ AI rewrite"}
                </button>
                {resume.profile.original && resume.profile.original !== resume.profile.text && (
                  <button onClick={revertSummary} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-500 hover:bg-stone-50">↶ Revert</button>
                )}
              </div>
            </div>
            <textarea
              value={resume.profile.text}
              onChange={(e) => setResume((r) => ({ ...r, profile: { ...r.profile, text: e.target.value } }))}
              rows={3}
              className={`w-full text-sm border border-stone-200 rounded p-2 outline-none focus:border-stone-400 ${resume.profile.on ? "" : "line-through text-stone-300"}`}
            />
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndSections}>
        <SortableContext items={resume.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {resume.sections.map((sec) => {
            const secCollapsed = collapsed[sec.id];
            return (
              <Sortable key={sec.id} id={sec.id}>
                {({ dragHandleProps }) => (
                  <div className="bg-white rounded-lg border border-stone-200">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-100">
                      <div className="flex items-center gap-1">
                        <span className="drag-handle" {...dragHandleProps} title="Drag section">⋮⋮</span>
                        <button onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))} className="font-semibold text-stone-800 text-sm flex items-center gap-2">
                          <span className="text-stone-400">{secCollapsed ? "▸" : "▾"}</span>{sec.title}
                          {secCollapsed && sec.kind === "entries" && (
                            <span className="text-[10px] text-stone-400 font-normal">
                              ({sec.entries.filter((e) => e.on).length}/{sec.entries.length} entries)
                            </span>
                          )}
                          {secCollapsed && sec.kind !== "entries" && (
                            <span className="text-[10px] text-stone-400 font-normal">
                              ({sec.entries.filter((e) => e.on).length}/{sec.entries.length} items)
                            </span>
                          )}
                        </button>
                        <button onClick={() => renameSection(sec.id)} className="text-[10px] text-stone-400 hover:text-stone-700 ml-1">✎</button>
                      </div>
                      <div className="flex gap-2 text-[11px] items-center">
                        {!secCollapsed && sec.kind === "entries" && (
                          <>
                            <button onClick={() => collapseAllInSection(sec.id)} className="text-stone-500 hover:text-stone-800" title="Collapse all entries in this section">⇈</button>
                            <button onClick={() => expandAllInSection(sec.id)} className="text-stone-500 hover:text-stone-800" title="Expand all entries in this section">⇊</button>
                            <span className="text-stone-300">|</span>
                          </>
                        )}
                        <button onClick={() => setAllInSection(sec.id, true)} className="text-stone-500 hover:text-teal-700">All</button>
                        <span className="text-stone-300">|</span>
                        <button onClick={() => setAllInSection(sec.id, false)} className="text-stone-500 hover:text-red-600">None</button>
                        {sec.removable && (
                          <>
                            <span className="text-stone-300">|</span>
                            <button onClick={() => deleteSection(sec.id)} className="text-stone-400 hover:text-red-600">Delete</button>
                          </>
                        )}
                      </div>
                    </div>

                    {!secCollapsed && (
                      <div className="p-3 space-y-3">
                        {sec.kind === "entries" ? (
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndEntries(sec.id)}>
                            <SortableContext items={sec.entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                              {sec.entries.map((en) => {
                                const enCollapsed = entryCollapsed[en.id];
                                const onCount = en.bullets.filter((b) => b.on).length;
                                return (
                                  <Sortable key={en.id} id={en.id}>
                                    {({ dragHandleProps: enHandle }) => (
                                      <div className={`rounded-md border p-3 ${en.on ? "border-stone-200 bg-stone-50" : "border-stone-100 bg-stone-100/50"}`}>
                                        <div className="flex items-start gap-2">
                                          <span className="drag-handle mt-1" {...enHandle}>⋮⋮</span>
                                          <input type="checkbox" checked={en.on} onChange={() => patchEntry(sec.id, en.id, { on: !en.on })} title="Include this whole entry" className="mt-1.5 w-4 h-4 accent-teal-800 shrink-0" />
                                          <button
                                            onClick={() => setEntryCollapsed((m) => ({ ...m, [en.id]: !m[en.id] }))}
                                            className="text-stone-400 hover:text-stone-700 mt-1 text-xs shrink-0"
                                            title={enCollapsed ? "Expand bullets" : "Collapse bullets"}
                                          >
                                            {enCollapsed ? "▸" : "▾"}
                                          </button>
                                          <div className="flex-1">
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <input className="bare text-sm font-semibold border-b border-stone-200 px-1 py-0.5" value={en.org} onChange={(e) => patchEntry(sec.id, en.id, { org: e.target.value })} />
                                              <input className="bare text-sm text-stone-500 border-b border-stone-200 px-1 py-0.5 text-right" value={en.dates} onChange={(e) => patchEntry(sec.id, en.id, { dates: e.target.value })} />
                                              <input className="bare text-xs italic text-stone-600 border-b border-stone-100 px-1 py-0.5" value={en.role} onChange={(e) => patchEntry(sec.id, en.id, { role: e.target.value })} />
                                              <input className="bare text-xs text-stone-500 border-b border-stone-100 px-1 py-0.5 text-right" value={en.loc} onChange={(e) => patchEntry(sec.id, en.id, { loc: e.target.value })} />
                                            </div>
                                            {enCollapsed ? (
                                              <div className="mt-1.5 text-[11px] text-stone-500 italic">
                                                {onCount}/{en.bullets.length} bullets · click ▸ to expand
                                              </div>
                                            ) : (
                                              <div className="flex gap-2 mt-2 flex-wrap">
                                                <button onClick={() => genBullets(sec.id, en, "web")} disabled={!!loadingMap[en.id]} className="text-[11px] px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50">{loadingMap[en.id] === "web" ? "Searching…" : "🔍 Find bullets"}</button>
                                                <button onClick={() => genBullets(sec.id, en, "ai")} disabled={!!loadingMap[en.id]} className="text-[11px] px-2 py-1 rounded border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50">{loadingMap[en.id] === "ai" ? "Writing…" : "✨ AI write"}</button>
                                                <button onClick={() => addBullets(sec.id, en.id, ["New bullet"], "IMPACT")} className="text-[11px] px-2 py-1 rounded border border-stone-200 text-stone-500 hover:bg-white">+ bullet</button>
                                                <button onClick={() => setAllBullets(sec.id, en.id, true)} className="text-[11px] px-2 py-1 rounded text-stone-500 hover:text-teal-700">All</button>
                                                <button onClick={() => setAllBullets(sec.id, en.id, false)} className="text-[11px] px-2 py-1 rounded text-stone-500 hover:text-red-600">None</button>
                                                <button onClick={() => delEntry(sec.id, en.id)} className="text-[11px] px-2 py-1 rounded text-stone-400 hover:text-red-600 ml-auto">Delete</button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        {!enCollapsed && (
                                          <div className={`mt-2 space-y-1.5 ${en.on ? "" : "opacity-40"}`}>
                                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndBullets(sec.id, en.id)}>
                                              <SortableContext items={en.bullets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                                                {en.bullets.map((b) => (
                                                  <Sortable key={b.id} id={b.id}>
                                                    {({ dragHandleProps: bHandle }) => (
                                                      <div className="flex items-start gap-2">
                                                        <span className="drag-handle mt-1" {...bHandle}>⋮⋮</span>
                                                        <input type="checkbox" checked={b.on} onChange={() => patchBullet(sec.id, en.id, b.id, { on: !b.on })} className="mt-1.5 w-4 h-4 accent-teal-800 shrink-0" />
                                                        <span className="pill mt-0.5 shrink-0" style={{ background: TAG_COLORS[b.tag] || "#888" }}>{b.tag}</span>
                                                        <textarea
                                                          value={b.text}
                                                          onChange={(e) => patchBullet(sec.id, en.id, b.id, { text: e.target.value })}
                                                          rows={1}
                                                          className={`bare flex-1 text-sm leading-snug resize-none border border-transparent hover:border-stone-200 rounded px-1 py-0.5 ${b.on ? "text-stone-800" : "line-through text-stone-300"}`}
                                                        />
                                                        <button
                                                          onClick={() => rewriteBullet(sec.id, en.id, b)}
                                                          disabled={!!loadingMap[b.id]}
                                                          title={jd.trim() ? "Rewrite this bullet for the pasted JD" : "Paste a JD in the Tailor panel first"}
                                                          className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-200 text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                                                        >{loadingMap[b.id] === "rw" ? "…" : "JD"}</button>
                                                        {b.original && b.original !== b.text && (
                                                          <button onClick={() => revertBullet(sec.id, en.id, b)} title="Revert to original" className="text-stone-300 hover:text-stone-700 text-xs mt-1">↶</button>
                                                        )}
                                                        <button onClick={() => delBullet(sec.id, en.id, b.id)} className="text-stone-300 hover:text-red-500 text-xs mt-1">✕</button>
                                                      </div>
                                                    )}
                                                  </Sortable>
                                                ))}
                                              </SortableContext>
                                            </DndContext>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </Sortable>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        ) : (
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndEntries(sec.id)}>
                            <SortableContext items={sec.entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                              {sec.entries.map((it) => (
                                <Sortable key={it.id} id={it.id}>
                                  {({ dragHandleProps: itHandle }) => (
                                    <div className="flex items-start gap-2">
                                      <span className="drag-handle mt-1" {...itHandle}>⋮⋮</span>
                                      <input type="checkbox" checked={it.on} onChange={() => patchEntry(sec.id, it.id, { on: !it.on })} className="mt-1.5 w-4 h-4 accent-teal-800 shrink-0" />
                                      <div className="flex-1">
                                        {sec.id !== "certs" && (
                                          <input className="bare text-xs font-semibold text-stone-700 mb-0.5 border-b border-stone-100 px-1" placeholder="Label" value={it.label} onChange={(e) => patchEntry(sec.id, it.id, { label: e.target.value })} />
                                        )}
                                        <textarea value={it.text} onChange={(e) => patchEntry(sec.id, it.id, { text: e.target.value })} rows={1} className={`bare w-full text-sm leading-snug resize-none border border-transparent hover:border-stone-200 rounded px-1 py-0.5 ${it.on ? "text-stone-800" : "line-through text-stone-300"}`} />
                                      </div>
                                      <button onClick={() => delEntry(sec.id, it.id)} className="text-stone-300 hover:text-red-500 text-xs mt-1">✕</button>
                                    </div>
                                  )}
                                </Sortable>
                              ))}
                            </SortableContext>
                          </DndContext>
                        )}
                        <button onClick={() => addEntry(sec)} className="text-xs text-teal-700 hover:underline mt-1">{sec.addLabel}</button>
                      </div>
                    )}
                  </div>
                )}
              </Sortable>
            );
          })}
        </SortableContext>
      </DndContext>

      <button onClick={addCustomSection} className="w-full text-sm py-2 rounded-lg border-2 border-dashed border-stone-300 text-stone-500 hover:border-teal-400 hover:text-teal-700">
        + Add a custom section
      </button>

      <div className="text-xs text-stone-400 px-1 pb-6">
        Tip: ▾/▸ on an entry hides its bullets. ⇈/⇊ collapse or expand every entry in a section. Section title ▾/▸ hides the whole section.
      </div>
    </div>
  );
}
