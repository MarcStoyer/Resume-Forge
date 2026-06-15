const KEY = "resumeforge:v1";
const TKEY = "resumeforge:template";

export function loadResume() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
  catch (e) { return null; }
}
export function saveResume(resume) {
  try { localStorage.setItem(KEY, JSON.stringify(resume)); } catch (e) {}
}
export function clearResume() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
export function loadTemplate() {
  try { return localStorage.getItem(TKEY) || null; } catch (e) { return null; }
}
export function saveTemplate(id) {
  try { localStorage.setItem(TKEY, id); } catch (e) {}
}
