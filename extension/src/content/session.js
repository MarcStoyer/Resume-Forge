// Runs only on the Résumé Forge tab. Reads the session supabase-js already
// keeps in that origin's localStorage and hands it to the extension, so
// signing in happens once, on the site, the way it always has.
//
// A content script shares localStorage with the page it runs in, so this needs
// no page-script injection and no credentials. It reads one key, on one
// origin, and never writes.
// Content scripts are classic scripts — "type": "module" is not a real
// content_scripts property, so a top-level import here is a syntax error and
// the whole file silently never runs. Dynamic import of a web-accessible
// resource is the supported way to share code with a content script.
let SESSION_STORAGE_KEY;

function readSession() {
  let raw;
  try { raw = window.localStorage.getItem(SESSION_STORAGE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s?.access_token || !s?.refresh_token) return null;
    return {
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      userId: s.user?.id,
      email: s.user?.email,
      // supabase-js stores expires_at in seconds.
      expiresAt: (s.expires_at ? s.expires_at * 1000 : Date.now() + 3600_000),
    };
  } catch { return null; }
}

let lastSent = "";
function sync() {
  const session = readSession();
  const fingerprint = session ? session.accessToken : "signed-out";
  if (fingerprint === lastSent) return;
  lastSent = fingerprint;
  browser.runtime.sendMessage({ type: "session-from-app", session }).catch(() => {});
}

(async function boot() {
  ({ SESSION_STORAGE_KEY } = await import(browser.runtime.getURL("src/lib/config.js")));
  console.debug("[Résumé Forge] session bridge active");
  sync();
  // The magic-link redirect lands back here and writes the session a moment
  // later, so keep watching rather than reading once on load.
  setInterval(sync, 2000);
  window.addEventListener("storage", sync);
})();
