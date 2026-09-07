// Mapping between the applications table's snake_case rows and the camelCase
// record shape the UI works in. Pure, and kept out of storage.js so it can be
// imported and tested without constructing the Supabase client (which needs
// Vite's import.meta.env and is unavailable under node --test).
//
// The round trip has to be lossless: this is what a real migration of someone's
// tracked applications runs through.

export function rowToRecord(row) {
  return {
    id: row.id,
    label: row.label,
    company: row.company,
    role: row.role,
    source: row.source,
    salary: row.salary || "",
    status: row.status,
    statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
    savedAt: row.saved_at ? new Date(row.saved_at).getTime() : Date.now(),
    jd: row.jd,
    jobUrl: row.job_url,
    resumeUrl: row.resume_url,
    coverLetter: row.cover_letter,
    notes: row.notes,
    resume: row.resume ?? null,
    interviewPrep: row.interview_prep ?? undefined,
    templateId: row.template_id ?? undefined,
    honesty: typeof row.honesty === "number" ? row.honesty : undefined,
    origin: row.origin,
  };
}

export function recordToRow(rec, userId) {
  return {
    id: rec.id,
    user_id: userId,
    label: rec.label || "Untitled",
    company: rec.company || "",
    role: rec.role || "",
    source: rec.source || "",
    salary: rec.salary || "",
    status: rec.status || "saved",
    status_history: Array.isArray(rec.statusHistory) ? rec.statusHistory : [],
    saved_at: new Date(rec.savedAt || Date.now()).toISOString(),
    jd: rec.jd || "",
    job_url: rec.jobUrl || "",
    resume_url: rec.resumeUrl || "",
    cover_letter: rec.coverLetter || "",
    notes: rec.notes || "",
    resume: rec.resume ?? null,
    interview_prep: rec.interviewPrep ?? null,
    template_id: rec.templateId ?? null,
    honesty: typeof rec.honesty === "number" ? rec.honesty : null,
    origin: rec.origin || "manual",
    updated_at: new Date().toISOString(),
  };
}
