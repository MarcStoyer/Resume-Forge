// Bulk import of already-submitted applications from a spreadsheet export.
//
// Accepts CSV or TSV (the latter is what you get pasting straight out of
// Google Sheets / Excel). Everything here is pure so it can be unit tested
// without a browser.

import { STAGE_IDS } from "./funnel.js";
import { buildApplication } from "./applications.js";

function tidy(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

// RFC4180-ish: honours quoted fields, "" escapes, and commas/newlines inside
// quotes. Hand-rolled rather than pulling in a parser dependency — this is
// the whole grammar, and a résumé app doesn't need a CSV engine.
export function parseDelimited(text, delimiter) {
  const s = String(text || "").replace(/\r\n?/g, "\n");
  const d = delimiter || detectDelimiter(s);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let sawAny = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; sawAny = true; }
    else if (ch === d) { row.push(field); field = ""; sawAny = true; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; sawAny = false; }
    else { field += ch; sawAny = true; }
  }
  if (sawAny || field !== "" || row.length) { row.push(field); rows.push(row); }

  // Drop entirely blank lines (trailing newline, spacer rows).
  return rows.filter((r) => r.some((c) => tidy(c) !== ""));
}

export function detectDelimiter(text) {
  const firstLine = String(text || "").split("\n")[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

// Target fields an imported column can be mapped onto. `null` means "ignore".
export const IMPORT_FIELDS = [
  { id: "company", label: "Company" },
  { id: "role", label: "Role" },
  { id: "label", label: "Label" },
  { id: "status", label: "Status" },
  { id: "source", label: "Where applied" },
  { id: "appliedAt", label: "Date applied" },
  { id: "jobUrl", label: "Job posting URL" },
  { id: "resumeUrl", label: "Résumé link" },
  { id: "coverLetter", label: "Cover letter" },
  { id: "jd", label: "Job description" },
  { id: "notes", label: "Notes" },
];

// Longest/most-specific phrases first — "cover letter" has to win before a
// bare "letter" or "cover" match, and "resume link" before "link".
const HEADER_SYNONYMS = [
  ["coverLetter", ["cover letter", "coverletter", "cover_letter", "cover"]],
  ["resumeUrl", ["resume link", "resume url", "cv link", "cv url", "resume file", "resume", "résumé", "cv"]],
  ["jobUrl", ["job url", "job link", "posting url", "posting link", "job posting", "posting", "url", "link"]],
  ["appliedAt", ["date applied", "applied on", "application date", "date submitted", "submitted on", "applied date", "date", "applied", "submitted"]],
  ["source", ["where applied", "where you applied", "applied via", "job board", "source", "platform", "channel", "board", "via", "where", "site"]],
  ["company", ["company name", "employer", "organization", "organisation", "company", "org"]],
  ["role", ["job title", "position title", "role title", "position", "title", "role"]],
  ["status", ["status", "stage", "outcome", "result"]],
  ["jd", ["job description", "description", "details", "jd"]],
  ["notes", ["notes", "note", "comments", "comment"]],
  ["label", ["label", "nickname"]],
];

// Best-effort header → field guess. Exact matches win over substring ones so
// a "Notes" column never gets stolen by a looser rule.
export function autoMapColumns(headers) {
  const mapping = headers.map(() => null);
  const taken = new Set();

  const claim = (idx, field) => {
    if (mapping[idx] || taken.has(field)) return;
    mapping[idx] = field;
    taken.add(field);
  };

  for (const exact of [true, false]) {
    headers.forEach((raw, idx) => {
      const h = tidy(raw).toLowerCase();
      if (!h) return;
      for (const [field, names] of HEADER_SYNONYMS) {
        const hit = exact ? names.includes(h) : names.some((n) => h.includes(n));
        if (hit) { claim(idx, field); return; }
      }
    });
  }
  return mapping;
}

// Free-text status → one of the funnel's stage ids. Order matters: a
// "rejected after interview" cell is a rejection, not an interview.
export function normalizeStatus(raw) {
  const s = tidy(raw).toLowerCase();
  if (!s) return "applied";
  if (/reject|declin|denied|no longer|not select|unsuccessful|closed|ghost/.test(s)) return "rejected";
  if (/offer|accepted|hired/.test(s)) return "offer";
  if (/screen|phone call|recruiter call/.test(s)) return "screen";
  if (/interview|onsite|final round/.test(s)) return "interview";
  if (/saved|bookmark|wishlist|to apply|planned|draft/.test(s)) return "saved";
  if (/applied|submitted|sent|in review|pending|waiting/.test(s)) return "applied";
  return STAGE_IDS.includes(s) ? s : "applied";
}

// Dates come out of spreadsheets in every shape imaginable. Date.parse covers
// ISO and the common US formats; anything it can't read falls back rather
// than failing the whole import. Ambiguous d/m vs m/d is resolved by
// Date.parse's US interpretation — noted rather than solved.
export function parseAppliedDate(raw, fallback = Date.now()) {
  const s = tidy(raw);
  if (!s) return fallback;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const year = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
    const guess = new Date(year, Number(m[1]) - 1, Number(m[2])).getTime();
    if (!Number.isNaN(guess)) return guess;
  }
  return fallback;
}

// Turns parsed rows + a column mapping into application records shaped like
// the ones the app creates itself. Imported rows have no résumé snapshot —
// that's attached separately, so `resume` stays null here.
export function rowsToApplications(rows, mapping, { headerRow = true } = {}) {
  const body = headerRow ? rows.slice(1) : rows;
  const out = [];

  for (const row of body) {
    const get = (field) => {
      const idx = mapping.indexOf(field);
      return idx === -1 ? "" : tidy(row[idx]);
    };

    const company = get("company");
    const role = get("role");
    const explicitLabel = get("label");

    // A row with nothing identifying in it is spacer junk, not an application.
    if (!company && !role && !explicitLabel) continue;

    out.push(buildApplication({
      label: explicitLabel,
      company,
      role,
      source: get("source"),
      status: normalizeStatus(get("status")),
      appliedAt: parseAppliedDate(get("appliedAt")),
      jd: get("jd"),
      jobUrl: get("jobUrl"),
      resumeUrl: get("resumeUrl"),
      coverLetter: get("coverLetter"),
      notes: get("notes"),
      origin: "import",
    }));
  }
  return out;
}
