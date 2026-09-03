import { test, describe } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/claude.js";
import { mockReq, mockRes, fakeAuthenticate } from "./helpers.js";

// Handler checks this is configured before proxying upstream; set a dummy
// value so the test suite is hermetic and doesn't depend on .env being
// loaded (or on a real secret being present) to exercise the success path.
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";

describe("api/claude.js handler", () => {
  test("rejects non-POST methods", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "GET" }), res);
    assert.equal(res.statusCode, 405);
  });

  test("rejects an unauthenticated request — real authenticate(), no Authorization header", async () => {
    const res = mockRes();
    // No deps override for authenticate: this exercises the actual
    // production code path, which returns early (no network call) when
    // there's no bearer token at all.
    await handler(mockReq({ headers: {} }), res);
    assert.equal(res.statusCode, 401);
    assert.ok(res.body.error.message);
  });

  test("rejects when authenticate() reports an invalid/expired session", async () => {
    const res = mockRes();
    await handler(mockReq({ headers: { authorization: "Bearer bad" } }), res, {
      authenticate: fakeAuthenticate({ error: "Invalid or expired session." }),
    });
    assert.equal(res.statusCode, 401);
  });

  test("rejects once the per-user rate limit is exceeded", async () => {
    const res = mockRes();
    await handler(mockReq({ headers: { authorization: "Bearer good" } }), res, {
      authenticate: fakeAuthenticate(),
      checkRateLimit: async () => false,
    });
    assert.equal(res.statusCode, 429);
  });

  test("a normal authenticated request still works end-to-end", async () => {
    const res = mockRes();
    let upstreamCall = null;
    const fakeFetch = async (url, opts) => {
      upstreamCall = { url, opts };
      return {
        status: 200,
        json: async () => ({ id: "msg_123", content: [{ type: "text", text: "hello" }] }),
      };
    };

    await handler(
      mockReq({
        headers: { authorization: "Bearer good" },
        body: { model: "claude-sonnet-4-6", max_tokens: 100, messages: [{ role: "user", content: "hi" }] },
      }),
      res,
      { authenticate: fakeAuthenticate(), checkRateLimit: async () => true, fetch: fakeFetch }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.content[0].text, "hello");
    assert.equal(upstreamCall.url, "https://api.anthropic.com/v1/messages");
    assert.match(JSON.parse(upstreamCall.opts.body).model, /claude/);
  });
});
