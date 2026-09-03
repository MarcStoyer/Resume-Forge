import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { authenticate } from "../api/_lib/auth.js";
import { mockReq } from "./helpers.js";

describe("authenticate", () => {
  test("fails closed when there is no Authorization header", async () => {
    const result = await authenticate(mockReq({ headers: {} }));
    assert.equal(result.user, undefined);
    assert.ok(result.error);
  });

  test("fails closed on a malformed Authorization header (no Bearer prefix)", async () => {
    const result = await authenticate(mockReq({ headers: { authorization: "sometoken" } }));
    assert.ok(result.error);
  });

  test("fails when Supabase rejects the token", async () => {
    const createSupabaseClient = () => ({
      auth: { getUser: async () => ({ data: { user: null }, error: { message: "invalid JWT" } }) },
    });
    const result = await authenticate(
      mockReq({ headers: { authorization: "Bearer bad-token" } }),
      { createSupabaseClient }
    );
    assert.equal(result.user, undefined);
    assert.ok(result.error);
  });

  test("succeeds when Supabase confirms the token, and returns a scoped client", async () => {
    const scopedClient = {
      auth: { getUser: async (t) => ({ data: { user: { id: "user-1", email: "a@b.com" } }, error: null }) },
    };
    const createSupabaseClient = () => scopedClient;
    const result = await authenticate(
      mockReq({ headers: { authorization: "Bearer good-token" } }),
      { createSupabaseClient }
    );
    assert.equal(result.user.id, "user-1");
    assert.equal(result.supabase, scopedClient);
    assert.equal(result.error, undefined);
  });

  test("fails closed when Supabase env/config is missing", async () => {
    const result = await authenticate(
      mockReq({ headers: { authorization: "Bearer whatever" } }),
      { createSupabaseClient: () => null }
    );
    assert.ok(result.error);
  });
});
