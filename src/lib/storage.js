import { getSupabase } from "./supabase.js";

const TABLE = "user_data";

const COLUMNS = [
  "resume",
  "template",
  "honesty",
  "cover_letter",
  "jd",
  "job_url",
  "paper",
  "applications",
].join(",");

function throwStorageError(action, error) {
  throw new Error(`Could not ${action}: ${error.message}`);
}

function requireUserId(userId) {
  if (!userId) throw new Error("You must be signed in to access saved data.");
  return userId;
}

export async function loadUserData(userId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("user_id", requireUserId(userId))
    .maybeSingle();

  if (error) throwStorageError("load saved data", error);
  return data;
}

async function loadField(userId, column, fallback = null) {
  const data = await loadUserData(userId);
  return data?.[column] ?? fallback;
}

async function saveField(userId, column, value) {
  const { error } = await getSupabase()
    .from(TABLE)
    .upsert(
      {
        user_id: requireUserId(userId),
        [column]: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) throwStorageError(`save ${column}`, error);
}

export const loadResume = async (userId) => loadField(userId, "resume");
export const saveResume = async (resume, userId) => saveField(userId, "resume", resume);
export const clearResume = async (userId) => saveField(userId, "resume", null);

export const loadTemplate = async (userId) => loadField(userId, "template");
export const saveTemplate = async (template, userId) => saveField(userId, "template", template);

export const loadHonesty = async (userId) => loadField(userId, "honesty", 75);
export const saveHonesty = async (honesty, userId) => saveField(userId, "honesty", honesty);

export const loadCoverLetter = async (userId) => loadField(userId, "cover_letter", "");
export const saveCoverLetter = async (coverLetter, userId) => saveField(userId, "cover_letter", coverLetter);

export const loadJD = async (userId) => loadField(userId, "jd", "");
export const saveJD = async (jd, userId) => saveField(userId, "jd", jd);

export const loadJobUrl = async (userId) => loadField(userId, "job_url", "");
export const saveJobUrl = async (jobUrl, userId) => saveField(userId, "job_url", jobUrl);

export const loadPaper = async (userId) => loadField(userId, "paper", "letter");
export const savePaper = async (paper, userId) => saveField(userId, "paper", paper);

export const loadApps = async (userId) => loadField(userId, "applications", []);
export const saveApps = async (applications, userId) => saveField(userId, "applications", applications);
