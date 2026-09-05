import { getSupabase } from "./supabase.js";

const TABLE = "user_data";

// Selected with "*" rather than an explicit column list on purpose.
//
// Naming columns explicitly means a deploy that ships code for a column before
// its migration has been run fails the ENTIRE load with
// "column user_data.<x> does not exist" — the app can't read anything, not just
// the new setting. That happened with ai_settings (Phase 6).
//
// With "*", a column that doesn't exist yet is simply absent from the result,
// and every reader already merges over a default
// (`{ ...DEFAULTS, ...(data?.some_settings || {}) }`), so a not-yet-migrated
// column degrades to its default instead of breaking the app. That is what
// makes adding a settings column genuinely non-blocking.

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
    .select("*")
    .eq("user_id", requireUserId(userId))
    .maybeSingle();

  if (error) throwStorageError("load saved data", error);
  return data;
}

async function loadField(userId, column, fallback = null) {
  const data = await loadUserData(userId);
  return data?.[column] ?? fallback;
}

// PostgREST reports a write to a column that doesn't exist as PGRST204
// ("Could not find the 'x' column of 'y' in the schema cache").
function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === "PGRST204") return true;
  return /could not find the .* column|does not exist/i.test(error.message || "");
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

  if (error) {
    // A column whose migration hasn't been run yet shouldn't surface as a
    // "Save failed" banner on every keystroke — the read path already falls
    // back to defaults for it, so the app works, the value just isn't durable
    // yet. Warn in the console and carry on; every other error still raises.
    if (isMissingColumnError(error)) {
      console.warn(`[storage] "${column}" isn't in the database yet — not persisted. Run the matching SUPABASE_PHASE_*.sql.`);
      return;
    }
    throwStorageError(`save ${column}`, error);
  }
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

export const loadInterviewPrepAuto = async (userId) => loadField(userId, "interview_prep_auto", false);
export const saveInterviewPrepAuto = async (v, userId) => saveField(userId, "interview_prep_auto", v);

export const loadInterviewHonesty = async (userId) => loadField(userId, "interview_honesty", 75);
export const saveInterviewHonesty = async (v, userId) => saveField(userId, "interview_honesty", v);

export const loadAiSettings = async (userId) => loadField(userId, "ai_settings", null);
export const saveAiSettings = async (v, userId) => saveField(userId, "ai_settings", v);

export const loadInterviewPrepSettings = async (userId) => loadField(userId, "interview_prep_settings", null);
export const saveInterviewPrepSettings = async (v, userId) => saveField(userId, "interview_prep_settings", v);
