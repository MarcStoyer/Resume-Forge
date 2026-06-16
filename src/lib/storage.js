const KEYS = {
  resume: "resumeforge:v2",
  template: "resumeforge:template",
  honesty: "resumeforge:honesty",
  coverLetter: "resumeforge:coverLetter",
  jd: "resumeforge:jd",
};

function get(k, def = null) {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; }
}
function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

export const loadResume = () => get(KEYS.resume);
export const saveResume = (r) => set(KEYS.resume, r);
export const clearResume = () => del(KEYS.resume);

export const loadTemplate = () => { try { return localStorage.getItem(KEYS.template) || null; } catch (e) { return null; } };
export const saveTemplate = (id) => { try { localStorage.setItem(KEYS.template, id); } catch (e) {} };

export const loadHonesty = () => { try { const v = localStorage.getItem(KEYS.honesty); return v === null ? 75 : Number(v); } catch (e) { return 75; } };
export const saveHonesty = (v) => { try { localStorage.setItem(KEYS.honesty, String(v)); } catch (e) {} };

export const loadCoverLetter = () => { try { return localStorage.getItem(KEYS.coverLetter) || ""; } catch (e) { return ""; } };
export const saveCoverLetter = (s) => { try { localStorage.setItem(KEYS.coverLetter, s); } catch (e) {} };

export const loadJD = () => { try { return localStorage.getItem(KEYS.jd) || ""; } catch (e) { return ""; } };
export const saveJD = (s) => { try { localStorage.setItem(KEYS.jd, s); } catch (e) {} };
