// Supabase over plain fetch.
//
// Deliberately no supabase-js: pulling it in would mean a bundler, a build
// step, and a review burden on AMO, to use maybe four endpoints. PostgREST and
// GoTrue are both ordinary REST, so this stays dependency-free and the
// extension ships as readable source.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SESSION_KEY = "rf_session";

async function getStored() {
  const out = await browser.storage.local.get(SESSION_KEY);
  return out[SESSION_KEY] || null;
}
async function setStored(session) {
  await browser.storage.local.set({ [SESSION_KEY]: session });
}
export async function signOut() {
  await browser.storage.local.remove(SESSION_KEY);
}

// Adopts the session read off the Résumé Forge tab. This is the only sign-in
// path: the app uses magic links, so there is no password to collect.
export async function adoptSession(session) {
  if (!session) return signOut();
  await setStored(session);
  return session;
}

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Sign in failed.");
  await setStored({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user?.id,
    email: data.user?.email,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });
  return data.user;
}

async function refresh(session) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) { await signOut(); throw new Error("Session expired — sign in again."); }
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user?.id ?? session.userId,
    email: data.user?.email ?? session.email,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  await setStored(next);
  return next;
}

// Access tokens last an hour. Refresh a minute early so a call never lands
// mid-expiry.
export async function getSession() {
  let session = await getStored();
  if (!session) return null;
  if (Date.now() > session.expiresAt - 60_000) session = await refresh(session);
  return session;
}

async function rest(path, { method = "GET", body, headers = {} } = {}) {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.hint || `Request failed (${res.status})`);
  return { data, session };
}

// The dedupe lookup the whole toggle depends on — one indexed query against
// (user_id, job_url), which is why applications needed their own table.
export async function findByJobUrl(jobUrl) {
  if (!jobUrl) return null;
  const { data } = await rest(`applications?job_url=eq.${encodeURIComponent(jobUrl)}&select=*&limit=1`);
  return data?.[0] || null;
}

export async function insertApplication(row) {
  const session = await getSession();
  const { data } = await rest("applications", {
    method: "POST",
    body: { ...row, user_id: session.userId },
    headers: { Prefer: "return=representation" },
  });
  return data?.[0] || null;
}

export async function updateApplication(id, patch) {
  const { data } = await rest(`applications?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { ...patch, updated_at: new Date().toISOString() },
    headers: { Prefer: "return=representation" },
  });
  return data?.[0] || null;
}
