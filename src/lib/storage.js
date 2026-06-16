const KEYS = {
  resume: "resumeforge:v3",
  template: "resumeforge:template",
  honesty: "resumeforge:honesty",
  coverLetter: "resumeforge:coverLetter",
  jd: "resumeforge:jd",
  apps: "resumeforge:applications",
};
function get(k, def = null) {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; }
}
function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
const getRaw = (k, def = "") => { try { return localStorage.getItem(k) ?? def; } catch (e) { return def; } };
const setRaw = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

export const loadResume = () => get(KEYS.resume);
export const saveResume = (r) => set(KEYS.resume, r);
export const clearResume = () => del(KEYS.resume);

export const loadTemplate = () => getRaw(KEYS.template) || null;
export const saveTemplate = (id) => setRaw(KEYS.template, id);

export const loadHonesty = () => { const v = getRaw(KEYS.honesty); return v === "" ? 75 : Number(v); };
export const saveHonesty = (v) => setRaw(KEYS.honesty, String(v));

export const loadCoverLetter = () => getRaw(KEYS.coverLetter);
export const saveCoverLetter = (s) => setRaw(KEYS.coverLetter, s);

export const loadJD = () => getRaw(KEYS.jd);
export const saveJD = (s) => setRaw(KEYS.jd, s);

export const loadApps = () => get(KEYS.apps, []);
export const saveApps = (apps) => set(KEYS.apps, apps);
