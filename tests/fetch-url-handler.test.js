import { test, describe } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/fetch-url.js";
import { mockReq, mockRes, fakeAuthenticate } from "./helpers.js";

describe("api/fetch-url.js handler", () => {
  test("rejects non-POST methods", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "GET" }), res);
    assert.equal(res.statusCode, 405);
  });

  test("rejects an unauthenticated request — real authenticate(), no Authorization header", async () => {
    const res = mockRes();
    await handler(mockReq({ headers: {}, body: { url: "http://example.com" } }), res);
    assert.equal(res.statusCode, 401);
  });

  test("rejects a missing url", async () => {
    const res = mockRes();
    await handler(mockReq({ headers: { authorization: "Bearer good" }, body: {} }), res, {
      authenticate: fakeAuthenticate(),
    });
    assert.equal(res.statusCode, 400);
  });

  test("rejects once the per-user rate limit is exceeded", async () => {
    const res = mockRes();
    await handler(mockReq({ headers: { authorization: "Bearer good" }, body: { url: "http://example.com" } }), res, {
      authenticate: fakeAuthenticate(),
      checkRateLimit: async () => false,
    });
    assert.equal(res.statusCode, 429);
  });

  test("blocks a metadata/private URL end-to-end, through the real SSRF guard, with no network call", async () => {
    const res = mockRes();
    // No `safeFetch` override: this is the real api/_lib/ssrf.js safeFetch,
    // proving the guard is actually wired into the handler, not just
    // unit-tested in isolation. A literal private IP is rejected before any
    // network access is attempted (no DNS, no fetch), so this is safe and
    // fast to run as part of the normal test suite.
    await handler(
      mockReq({ headers: { authorization: "Bearer good" }, body: { url: "http://169.254.169.254/latest/meta-data/" } }),
      res,
      { authenticate: fakeAuthenticate(), checkRateLimit: async () => true }
    );
    assert.equal(res.statusCode, 200); // this endpoint's established contract: soft failures are 200 + ok:false
    assert.equal(res.body.ok, false);
    assert.match(res.body.message, /can't be fetched/i);
  });

  test("a normal authenticated request still works end-to-end, and strips HTML to text", async () => {
    const res = mockRes();
    const fakeSafeFetch = async (url) => {
      assert.equal(url, "https://jobs.example.com/posting/42");
      return { status: 200, text: "<html><body><script>evil()</script><h1>Senior Widget Engineer</h1></body></html>" };
    };

    await handler(
      mockReq({ headers: { authorization: "Bearer good" }, body: { url: "https://jobs.example.com/posting/42" } }),
      res,
      { authenticate: fakeAuthenticate(), checkRateLimit: async () => true, safeFetch: fakeSafeFetch }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.text.includes("Senior Widget Engineer"));
    assert.ok(!res.body.text.includes("evil()"), "script contents must be stripped");
  });

  test("reports a non-2xx upstream status as a soft failure", async () => {
    const res = mockRes();
    const fakeSafeFetch = async () => ({ status: 404, text: "" });
    await handler(
      mockReq({ headers: { authorization: "Bearer good" }, body: { url: "https://jobs.example.com/gone" } }),
      res,
      { authenticate: fakeAuthenticate(), checkRateLimit: async () => true, safeFetch: fakeSafeFetch }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.status, 404);
  });
});
