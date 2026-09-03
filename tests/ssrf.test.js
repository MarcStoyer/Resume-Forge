import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPrivateAddress, resolveAndValidate, safeFetch, SsrfError } from "../api/_lib/ssrf.js";

function headersOf(obj) {
  const map = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (k) => map.get(k.toLowerCase()) ?? null };
}

// Builds a fetch-shaped Response with a real streamable body, so readBody's
// reader.read() loop (the code path that matters for the size-cap tests) is
// exercised the same way it would be against a real fetch().
function fakeResponse({ status = 200, headers = {}, text = "" }) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const CHUNK = 16;
  return {
    status,
    headers: headersOf(headers),
    body: {
      getReader() {
        return {
          async read() {
            if (offset >= bytes.length) return { done: true, value: undefined };
            const chunk = bytes.slice(offset, offset + CHUNK);
            offset += CHUNK;
            return { done: false, value: chunk };
          },
          async cancel() {},
        };
      },
    },
    async text() { return text; },
  };
}

// Simulates a fetch() call that hangs until either `delayMs` passes or the
// passed AbortSignal fires — same contract real fetch has, so it correctly
// exercises safeFetch's timeout-handling branch instead of just sleeping.
function hangingFetch(delayMs, thenResponse) {
  return (url, opts) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(thenResponse), delayMs);
    opts.signal?.addEventListener("abort", () => {
      clearTimeout(t);
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
}

describe("isPrivateAddress", () => {
  const privateCases = [
    ["10.0.0.1", "RFC1918 private"],
    ["172.16.5.1", "RFC1918 private"],
    ["192.168.1.1", "RFC1918 private"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["0.0.0.0", "unspecified"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast/reserved"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["::1", "IPv6 loopback"],
    ["fc00::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link-local"],
    ["::ffff:169.254.169.254", "IPv4-mapped IPv6 metadata address"],
    ["not-an-ip", "unparsable"],
  ];
  for (const [ip, label] of privateCases) {
    test(`blocks ${ip} (${label})`, () => {
      assert.equal(isPrivateAddress(ip), true);
    });
  }

  const publicCases = [
    ["8.8.8.8", "public IPv4"],
    ["93.184.216.34", "public IPv4"],
    ["2606:4700:4700::1111", "public IPv6"],
  ];
  for (const [ip, label] of publicCases) {
    test(`allows ${ip} (${label})`, () => {
      assert.equal(isPrivateAddress(ip), false);
    });
  }
});

describe("resolveAndValidate", () => {
  test("rejects a literal private IP without needing DNS", async () => {
    await assert.rejects(
      () => resolveAndValidate("http://169.254.169.254/latest/meta-data/", { lookupFn: async () => { throw new Error("should not be called"); } }),
      SsrfError
    );
  });

  test("allows a literal public IP", async () => {
    const parsed = await resolveAndValidate("http://93.184.216.34/", {});
    assert.equal(parsed.hostname, "93.184.216.34");
  });

  test("rejects a hostname that resolves to a private address", async () => {
    const lookupFn = async () => [{ address: "10.1.2.3", family: 4 }];
    await assert.rejects(() => resolveAndValidate("http://internal.example.com/", { lookupFn }), SsrfError);
  });

  test("allows a hostname that resolves to a public address", async () => {
    const lookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
    const parsed = await resolveAndValidate("http://example.com/jobs/123", { lookupFn });
    assert.equal(parsed.hostname, "example.com");
  });

  test("rejects if ANY resolved address is private, even with a public one present", async () => {
    const lookupFn = async () => [{ address: "93.184.216.34" }, { address: "169.254.169.254" }];
    await assert.rejects(() => resolveAndValidate("http://mixed.example.com/", { lookupFn }), SsrfError);
  });

  test("rejects non-http(s) schemes", async () => {
    await assert.rejects(() => resolveAndValidate("file:///etc/passwd", {}), SsrfError);
  });

  test("rejects an unparsable URL", async () => {
    await assert.rejects(() => resolveAndValidate("not a url", {}), SsrfError);
  });
});

describe("safeFetch", () => {
  test("returns the body for a normal public text/html response", async () => {
    const fetchImpl = async () => fakeResponse({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, text: "<h1>Job</h1>" });
    const result = await safeFetch("http://93.184.216.34/", { fetchImpl });
    assert.equal(result.status, 200);
    assert.equal(result.text, "<h1>Job</h1>");
  });

  test("rejects when a redirect points at a private address, and does not follow it", async () => {
    let calls = 0;
    const lookupFn = async (host) => {
      if (host === "public.example.com") return [{ address: "93.184.216.34" }];
      throw new Error(`unexpected lookup for ${host}`);
    };
    const fetchImpl = async () => {
      calls += 1;
      return fakeResponse({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    };
    await assert.rejects(
      () => safeFetch("http://public.example.com/redirector", { fetchImpl, lookupFn }),
      SsrfError
    );
    assert.equal(calls, 1, "must not have made a second request to the redirect target");
  });

  test("caps the number of redirects", async () => {
    const fetchImpl = async () => fakeResponse({ status: 302, headers: { location: "http://93.184.216.34/next" } });
    await assert.rejects(
      () => safeFetch("http://93.184.216.34/start", { fetchImpl, maxRedirects: 3 }),
      /Too many redirects/
    );
  });

  test("rejects an oversized response via Content-Length before reading the body", async () => {
    const fetchImpl = async () => fakeResponse({ status: 200, headers: { "content-type": "text/html", "content-length": "99999999" }, text: "hi" });
    await assert.rejects(() => safeFetch("http://93.184.216.34/", { fetchImpl, maxBytes: 1000 }), /too large/i);
  });

  test("rejects an oversized response while streaming, when Content-Length is absent or wrong", async () => {
    const big = "x".repeat(5000);
    const fetchImpl = async () => fakeResponse({ status: 200, headers: { "content-type": "text/plain" }, text: big });
    await assert.rejects(() => safeFetch("http://93.184.216.34/", { fetchImpl, maxBytes: 100 }), /too large/i);
  });

  test("times out a hanging response instead of waiting forever", async () => {
    const fetchImpl = hangingFetch(5000, fakeResponse({ status: 200, text: "too slow" }));
    const start = Date.now();
    await assert.rejects(() => safeFetch("http://93.184.216.34/", { fetchImpl, timeoutMs: 50 }), /timed out/i);
    assert.ok(Date.now() - start < 2000, "should reject promptly on timeout, not wait for the hang");
  });

  test("rejects an unsafe content-type", async () => {
    const fetchImpl = async () => fakeResponse({ status: 200, headers: { "content-type": "application/octet-stream" }, text: "binary!" });
    await assert.rejects(() => safeFetch("http://93.184.216.34/", { fetchImpl }), /content-type/i);
  });

  test("allows a missing content-type header", async () => {
    const fetchImpl = async () => fakeResponse({ status: 200, headers: {}, text: "plain body" });
    const result = await safeFetch("http://93.184.216.34/", { fetchImpl });
    assert.equal(result.text, "plain body");
  });
});
