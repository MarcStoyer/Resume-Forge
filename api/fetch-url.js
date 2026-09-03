import { authenticate as defaultAuthenticate } from "./_lib/auth.js";
import { checkRateLimit as defaultCheckRateLimit } from "./_lib/rateLimit.js";
import { safeFetch as defaultSafeFetch, SsrfError } from "./_lib/ssrf.js";

const RATE_LIMIT = { limit: 20, windowSeconds: 60 };

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);
}

// `deps` is only ever passed by tests — Vercel always calls handler(req, res)
// with the real implementations below.
export default async function handler(req, res, deps = {}) {
  const authenticate = deps.authenticate || defaultAuthenticate;
  const checkRateLimit = deps.checkRateLimit || defaultCheckRateLimit;
  const safeFetch = deps.safeFetch || defaultSafeFetch;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const { user, supabase, error: authError } = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: { message: authError || "Sign in required." } });
  }

  const allowed = await checkRateLimit(supabase, "fetch-url", RATE_LIMIT);
  if (!allowed) {
    return res.status(429).json({ error: { message: "Too many requests — please slow down and try again shortly." } });
  }

  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({
      error: { message: "Missing 'url' in request body." },
    });
  }

  try {
    const result = await safeFetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (result.status < 200 || result.status >= 300) {
      return res.status(200).json({
        ok: false,
        status: result.status,
        html: "",
        text: "",
        message: `HTTP ${result.status} — site may require login or block automated fetches.`,
      });
    }

    return res.status(200).json({ ok: true, status: result.status, text: htmlToText(result.text) });
  } catch (e) {
    // SSRF/validation rejections and ordinary fetch failures both surface
    // the same way the original endpoint always reported them: 200 with
    // ok:false, so the existing frontend contract (JobMatcher.jsx) doesn't
    // need to change to keep working.
    const message = e instanceof SsrfError ? e.message : "Couldn't fetch that URL: " + String(e);
    return res.status(200).json({ ok: false, status: 0, html: "", text: "", message });
  }
}
