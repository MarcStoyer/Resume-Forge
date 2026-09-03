// Shared résumé flattening — every bullet/entry regardless of on/off state.
// Used by JobMatcher (tailoring) and interviewPrep (evidence catalogs), which
// both need the complete set, not just what's currently toggled on.
export function flattenBullets(resume) {
  const out = [];
  // Bulk-imported applications carry no résumé snapshot until one is attached,
  // so callers can legitimately hand us an empty record.
  if (!resume || !Array.isArray(resume.sections)) return out;
  resume.sections.forEach((sec) => {
    if (sec.kind === "entries") {
      sec.entries.forEach((en) => {
        en.bullets.forEach((b) => {
          out.push({
            sectionId: sec.id, entryId: en.id, bulletId: b.id,
            text: b.text, original: b.original || b.text, on: b.on,
            org: en.org, role: en.role,
          });
        });
      });
    } else {
      sec.entries.forEach((it) => {
        out.push({ sectionId: sec.id, itemId: it.id, text: (it.label ? it.label + ": " : "") + it.text, on: it.on });
      });
    }
  });
  return out;
}

export function flattenEntries(resume) {
  const out = [];
  if (!resume || !Array.isArray(resume.sections)) return out;
  resume.sections.forEach((sec) => {
    if (sec.kind !== "entries") return;
    sec.entries.forEach((en) => {
      out.push({ sectionId: sec.id, entryId: en.id, org: en.org, role: en.role, dates: en.dates, on: en.on });
    });
  });
  return out;
}
