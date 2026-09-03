// Verifies that a request carries a valid Supabase session, so
// api/claude.js and api/fetch-url.js are only usable by this app's
// logged-in users — not the open internet. Reuses the same project URL
// and anon key the frontend already ships (both are meant to be public;
// Row Level Security, not secrecy, is what protects the anon key). No
// service-role key is needed: supabase.auth.getUser(token) verifies the
// JWT against Supabase's own auth server.
import { createClient } from "@supabase/supabase-js";

function defaultCreateSupabaseClient(token) {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Returns { user, supabase } on success (supabase is a client scoped to
// this user's token, so RLS-gated calls like the rate-limit RPC run as
// them), or { error } on failure. Never throws — callers just check which
// key is present.
export async function authenticate(req, { createSupabaseClient = defaultCreateSupabaseClient } = {}) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: "Sign in required." };

  const supabase = createSupabaseClient(token);
  if (!supabase) return { error: "Supabase is not configured on the server." };

  let data, error;
  try {
    ({ data, error } = await supabase.auth.getUser(token));
  } catch (e) {
    return { error: "Could not verify session: " + String(e.message || e) };
  }
  if (error || !data?.user) return { error: "Invalid or expired session." };

  return { user: data.user, supabase };
}
