// Minimal stand-ins for the req/res objects Vercel's Node runtime passes to
// a handler (req: plain object with method/headers/body; res: an object
// with the .status().json() / .setHeader() convenience methods Vercel adds
// on top of Node's ServerResponse). Good enough to exercise the real
// handler functions directly, without needing a live HTTP server.
export function mockReq({ method = "POST", headers = {}, body = {} } = {}) {
  return { method, headers, body };
}

export function mockRes() {
  return {
    statusCode: 200,
    headersSent: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headersSent[k] = v; return this; },
  };
}

export function fakeAuthenticate({ user = { id: "user-1" }, error } = {}) {
  return async () => (error ? { error } : { user, supabase: { rpc: async () => ({ data: true }) } });
}
