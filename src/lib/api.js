import { getSupabase } from "./supabase.js";

export const MODEL = "claude-sonnet-4-6";

// Every call gets a hard ceiling so a hung request surfaces as an error
// instead of leaving the UI stuck on "Generating…" indefinitely. Callers can
// pass their own `signal` (e.g. to cancel on unmount) to opt out of this one.
const DEFAULT_TIMEOUT_MS = 120000;

// /api/claude requires a signed-in Supabase session (see api/_lib/auth.js) —
// attach the current session's access token so the server can verify it.
export async function authHeaders() {
  const { data } = await getSupabase().auth.getSession();
  const token = data?.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function callClaude({ system, messages, tools, max_tokens = 1500, model = MODEL, signal, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let res;
  try {
    res = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ model, max_tokens, system, messages, tools }),
      signal: signal || AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s — the AI service may be slow or unreachable. Try again.`);
    }
    throw new Error("Network error: " + e.message);
  }
  let data;
  try { data = await res.json(); }
  catch (e) { throw new Error("Bad response from server (HTTP " + res.status + ")"); }
  if (!res.ok || data?.error) throw new Error(data?.error?.message || "HTTP " + res.status);
  return data;
}
