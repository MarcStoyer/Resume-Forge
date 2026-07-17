import { uid } from "./util.js";
export function extractText(data) {
  if (!data || !Array.isArray(data.content)) return "";
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
export function extractJSON(text) {
  if (!text) return null;
  const t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const firstObj = t.indexOf("{"), firstArr = t.indexOf("[");
  let start = -1, closeCh = "}";
  if (firstArr !== -1 && (firstArr < firstObj || firstObj === -1)) { start = firstArr; closeCh = "]"; }
  else if (firstObj !== -1) { start = firstObj; }
  if (start === -1) return null;
  const last = t.lastIndexOf(closeCh);
  if (last <= start) return null;
  try { return JSON.parse(t.slice(start, last + 1)); } catch (e) { return null; }
}
export function mapParsed(p) {
  const mkBullets = (arr) => (Array.isArray(arr) ? arr : []).map((tx) => ({
    id: uid(), on: true, tag: "AI", text: String(tx), original: String(tx),
  }));
  const mkEntries = (arr) => (Array.isArray(arr) ? arr : []).map((e) => ({
    id: uid(), on: true,
    org: e.org || e.company || e.school || e.project || e.name || "",
    loc: e.loc || e.location || "",
    role: e.role || e.title || e.degree || e.technologies || "",
    dates: e.dates || "", sub: e.sub || "",
    bullets: mkBullets(e.bullets),
  }));
  const mkList = (arr) => (Array.isArray(arr) ? arr : []).map((it) =>
    typeof it === "string"
      ? { id: uid(), on: true, tag: "IMPACT", label: "", text: it }
      : { id: uid(), on: true, tag: "DATA", label: it.label || it.category || "", text: it.text || it.value || "" });
  const projects = Array.isArray(p?.projects) ? p.projects : [];
  const projectsAreEntries = projects.some((item) => item && typeof item === "object" && (
    Array.isArray(item.bullets) || item.dates || item.org || item.project || item.name || item.role || item.technologies
  ));
  const sections = [
    { id: "exp", title: "Experience", kind: "entries", addLabel: "+ Add job", entries: mkEntries(p?.experience), removable: false },
    { id: "edu", title: "Education", kind: "entries", addLabel: "+ Add school", entries: mkEntries(p?.education), removable: false },
    { id: "skills", title: "Technical Skills", kind: "list", addLabel: "+ Add skill line", entries: mkList(p?.skills), removable: false },
    { id: "certs", title: "Certifications", kind: "list", addLabel: "+ Add certification", entries: mkList(p?.certs), removable: false },
    { id: "awards", title: "Honors & Awards", kind: "list", addLabel: "+ Add award", entries: mkList(p?.awards), removable: false },
    {
      id: "proj", title: "Projects & Builds", kind: projectsAreEntries ? "entries" : "list",
      addLabel: "+ Add project", entries: projectsAreEntries ? mkEntries(projects) : mkList(projects), removable: false,
    },
  ];
  if (Array.isArray(p?.extracurriculars) && p.extracurriculars.length) {
    sections.push({ id: uid(), title: "Extracurriculars", kind: "entries", addLabel: "+ Add activity", entries: mkEntries(p.extracurriculars), removable: true });
  }
  if (Array.isArray(p?.interests) && p.interests.length) {
    sections.push({ id: uid(), title: "Interests", kind: "list", addLabel: "+ Add interest", entries: mkList(p.interests), removable: true });
  }
  return {
    contact: {
      name: p?.contact?.name || "[Name]",
      location: p?.contact?.location || "", email: p?.contact?.email || "",
      phone: p?.contact?.phone || "", linkedin: p?.contact?.linkedin || "",
      github: p?.contact?.github || "",
    },
    profile: { on: !!p?.profile, text: p?.profile || "", original: p?.profile || "" },
    sections,
  };
}
