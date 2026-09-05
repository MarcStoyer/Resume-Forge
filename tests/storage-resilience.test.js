import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// storage.js can't be imported under node --test (it constructs the Supabase
// client, which needs Vite's import.meta.env), so these assert the source
// contract instead. Crude, but they pin the two properties that actually broke
// production — an explicit column list, and a hard failure on an unmigrated
// column — so a future edit can't silently reintroduce either.
const src = fs.readFileSync(new URL("../src/lib/storage.js", import.meta.url), "utf8");

describe("storage load/save resilience to unmigrated columns", () => {
  test("reads select * rather than naming columns", () => {
    // Naming columns means a column shipped before its migration fails the
    // whole load: "column user_data.ai_settings does not exist".
    assert.match(src, /\.select\("\*"\)/);
    assert.ok(!/const COLUMNS = \[/.test(src), "explicit COLUMNS list is back");
  });

  test("writes swallow a missing-column error instead of raising", () => {
    assert.match(src, /PGRST204/);
    assert.match(src, /isMissingColumnError/);
  });

  test("writes still raise on every other error", () => {
    assert.match(src, /throwStorageError\(`save \$\{column\}`, error\)/);
  });
});
