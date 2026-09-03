import { uid } from "./util.js";
import { historyEntry } from "./funnel.js";

// One definition of an application record, shared by every path that creates
// one — the save dialog, CSV import, and manual entry — so the shape can't
// drift between them.
//
// `appliedAt` backdates both savedAt and the opening status-history entry, so
// an application entered after the fact lands on its real date rather than
// showing up as submitted today.
export function buildApplication({
  label = "",
  company = "",
  role = "",
  source = "",
  status = "applied",
  appliedAt = Date.now(),
  jd = "",
  jobUrl = "",
  resumeUrl = "",
  coverLetter = "",
  notes = "",
  resume = null,
  origin = "manual",
} = {}) {
  const cleanCompany = String(company).trim();
  const cleanRole = String(role).trim();
  const finalLabel =
    String(label).trim() ||
    [cleanCompany, cleanRole].filter(Boolean).join(" — ") ||
    "Untitled";

  return {
    id: uid(),
    label: finalLabel,
    company: cleanCompany,
    role: cleanRole,
    source: String(source).trim(),
    status,
    statusHistory: [{ ...historyEntry(status), at: appliedAt }],
    savedAt: appliedAt,
    jd,
    jobUrl,
    resumeUrl,
    coverLetter,
    notes,
    resume,
    origin,
  };
}

// <input type="date"> hands back "YYYY-MM-DD". Parsing that with `new Date()`
// treats it as UTC midnight, which reads as the previous day anywhere west of
// Greenwich — so build it as local midnight instead.
export function dateInputToTimestamp(value, fallback = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!m) return fallback;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? fallback : t;
}

export function timestampToDateInput(ms) {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
