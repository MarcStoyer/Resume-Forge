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
    org: e.org || e.company || e.school || "",
    loc: e.loc || e.location || "",
    role: e.role || e.title || e.degree || "",
    dates: e.dates || "", sub: e.sub || "",
    bullets: mkBullets(e.bullets),
  }));
  const mkList = (arr) => (Array.isArray(arr) ? arr : []).map((it) =>
    typeof it === "string"
      ? { id: uid(), on: true, tag: "IMPACT", label: "", text: it }
      : { id: uid(), on: true, tag: "DATA", label: it.label || it.category || "", text: it.text || it.value || "" });
  return {
    contact: {
      name: p?.contact?.name || "[Name]",
      location: p?.contact?.location || "", email: p?.contact?.email || "",
      phone: p?.contact?.phone || "", linkedin: p?.contact?.linkedin || "",
      github: p?.contact?.github || "",
    },
    profile: { on: !!p?.profile, text: p?.profile || "", original: p?.profile || "" },
    sections: [
      { id: "exp", title: "Experience", kind: "entries", addLabel: "+ Add job", entries: mkEntries(p?.experience), removable: false },
      { id: "edu", title: "Education", kind: "entries", addLabel: "+ Add school", entries: mkEntries(p?.education), removable: false },
      { id: "skills", title: "Technical Skills", kind: "list", addLabel: "+ Add skill line", entries: mkList(p?.skills), removable: false },
      { id: "certs", title: "Certifications", kind: "list", addLabel: "+ Add certification", entries: mkList(p?.certs), removable: false },
      { id: "awards", title: "Honors & Awards", kind: "list", addLabel: "+ Add award", entries: mkList(p?.awards), removable: false },
      { id: "proj", title: "Projects & Builds", kind: "list", addLabel: "+ Add project", entries: mkList(p?.projects), removable: false },
    ],
  };
}
