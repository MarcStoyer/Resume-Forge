// Basic per-user rate limiting for api/claude.js and api/fetch-url.js,
// backed by the check_rate_limit() Postgres function added in
// SUPABASE_PHASE_5.sql (an atomic upsert, so concurrent requests from the
// same user don't race each other into double-counting).
//
// This is a soft/abuse-prevention control, not the primary access gate
// (authenticate() in auth.js is) — so it fails OPEN on infrastructure
// error (e.g. Phase 5 hasn't been run yet, or a transient DB error) rather
// than taking the whole app down over a missing rate-limit table. Failures
// are logged server-side either way.
export async function checkRateLimit(supabase, endpoint, { limit, windowSeconds }) {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_endpoint: endpoint,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error(`[rateLimit] check_rate_limit(${endpoint}) failed, failing open: ${error.message}`);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error(`[rateLimit] check_rate_limit(${endpoint}) threw, failing open: ${String(e.message || e)}`);
    return true;
  }
}
