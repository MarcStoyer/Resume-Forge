export const MODEL = "claude-sonnet-4-6";

export async function callClaude({ system, messages, tools, max_tokens = 1500, model = MODEL }) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens, system, messages, tools }),
  });
  let data;
  try { data = await res.json(); }
  catch (e) { throw new Error("Bad response from server (HTTP " + res.status + ")"); }
  if (!res.ok || data?.error) throw new Error(data?.error?.message || "HTTP " + res.status);
  return data;
}
