// See https://docs.claude.com/en/docs/about-claude/models/overview
// claude-sonnet-4-6 balances quality and cost; swap to claude-opus-4-7 for max capability.
export const MODEL = "claude-sonnet-4-6";

// All requests go through the local Express proxy at /api/claude, which adds the
// API key server-side. The browser never sees the key.
export async function callClaude({ system, messages, tools, max_tokens = 1024, model = MODEL }) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens, system, messages, tools }),
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("Bad response from server (HTTP " + res.status + ")");
  }
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || "HTTP " + res.status);
  }
  return data;
}
