import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../api/_lib/rateLimit.js";

function fakeSupabase(rpcResult) {
  return {
    rpc: async (fn, args) => {
      assert.equal(fn, "check_rate_limit");
      assert.equal(typeof args.p_endpoint, "string");
      return rpcResult;
    },
  };
}

describe("checkRateLimit", () => {
  test("allows when the RPC says within limit", async () => {
    const allowed = await checkRateLimit(fakeSupabase({ data: true, error: null }), "claude", { limit: 20, windowSeconds: 60 });
    assert.equal(allowed, true);
  });

  test("blocks when the RPC says over limit", async () => {
    const allowed = await checkRateLimit(fakeSupabase({ data: false, error: null }), "claude", { limit: 20, windowSeconds: 60 });
    assert.equal(allowed, false);
  });

  test("fails open (does not block) if the RPC errors — e.g. Phase 5 not migrated yet", async () => {
    const allowed = await checkRateLimit(fakeSupabase({ data: null, error: { message: "function does not exist" } }), "claude", { limit: 20, windowSeconds: 60 });
    assert.equal(allowed, true);
  });

  test("fails open if the client throws", async () => {
    const supabase = { rpc: async () => { throw new Error("network down"); } };
    const allowed = await checkRateLimit(supabase, "fetch-url", { limit: 20, windowSeconds: 60 });
    assert.equal(allowed, true);
  });
});
