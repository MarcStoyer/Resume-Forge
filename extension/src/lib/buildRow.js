// Builds an applications-table row from a scraped job.
//
// Mirrors buildApplication() in the web app (src/lib/applications.js): same
// label rule (Company — Role), same backdating of saved_at and the opening
// status-history entry. Kept as its own module so the pill and the popup
// can't drift apart.
export function buildRow(job, status, extra = {}) {
  const company = (job.company || "").trim();
  const role = (job.role || "").trim();
  const label = [company, role].filter(Boolean).join(" — ") || job.jobUrl || "Untitled";
  const at = Date.now();

  return {
    id: crypto.randomUUID(),
    label,
    company,
    role,
    source: job.source || "",
    salary: job.salary || "",
    status,
    status_history: [{ status, at, note: "" }],
    saved_at: new Date(at).toISOString(),
    jd: job.jd || "",
    job_url: job.jobUrl || "",
    resume_url: "",
    cover_letter: "",
    notes: [job.location && `Location: ${job.location}`, job.employmentType && `Type: ${job.employmentType}`]
      .filter(Boolean).join("\n"),
    resume: null,
    interview_prep: null,
    template_id: null,
    honesty: null,
    origin: "extension",
    updated_at: new Date(at).toISOString(),
    ...extra,
  };
}
