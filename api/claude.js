import { authenticate as defaultAuthenticate } from "./_lib/auth.js";
import { checkRateLimit as defaultCheckRateLimit } from "./_lib/rateLimit.js";

const RATE_LIMIT = { limit: 20, windowSeconds: 60 };

// `deps` is only ever passed by tests — Vercel always calls handler(req, res)
// with the real implementations below.
export default async function handler(req, res, deps = {}) {
  const authenticate = deps.authenticate || defaultAuthenticate;
  const checkRateLimit = deps.checkRateLimit || defaultCheckRateLimit;
  const fetchImpl = deps.fetch || fetch;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const { user, supabase, error: authError } = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: { message: authError || "Sign in required." } });
  }

  const allowed = await checkRateLimit(supabase, "claude", RATE_LIMIT);
  if (!allowed) {
    return res.status(429).json({ error: { message: "Too many requests — please slow down and try again shortly." } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: "ANTHROPIC_API_KEY is not configured on the server." },
    });
  }

  try {
    const upstream = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({
      error: { message: "Upstream request failed: " + String(e) },
    });
  }
}
