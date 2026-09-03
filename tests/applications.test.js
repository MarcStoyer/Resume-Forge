import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildApplication, dateInputToTimestamp, timestampToDateInput } from "../src/lib/applications.js";

describe("buildApplication", () => {
  test("composes a label from company and role", () => {
    const a = buildApplication({ company: "Kovari", role: "Robot Operator" });
    assert.equal(a.label, "Kovari — Robot Operator");
  });

  test("an explicit label wins over the composed one", () => {
    const a = buildApplication({ company: "Kovari", role: "Robot Operator", label: "Dream job" });
    assert.equal(a.label, "Dream job");
  });

  test("falls back to Untitled when there is nothing to name it with", () => {
    assert.equal(buildApplication({}).label, "Untitled");
  });

  test("trims surrounding whitespace", () => {
    const a = buildApplication({ company: "  Acme  ", role: "  Engineer  " });
    assert.equal(a.company, "Acme");
    assert.equal(a.label, "Acme — Engineer");
  });

  test("backdates savedAt and the opening status entry to appliedAt", () => {
    const when = Date.parse("2026-01-15T12:00:00Z");
    const a = buildApplication({ company: "Acme", status: "interview", appliedAt: when });
    assert.equal(a.savedAt, when);
    assert.equal(a.statusHistory.length, 1);
    assert.equal(a.statusHistory[0].at, when);
    assert.equal(a.statusHistory[0].status, "interview");
  });

  test("defaults to applied with no résumé attached", () => {
    const a = buildApplication({ company: "Acme" });
    assert.equal(a.status, "applied");
    assert.equal(a.resume, null);
  });

  test("gives every record a distinct id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => buildApplication({ company: "A" }).id));
    assert.equal(ids.size, 50);
  });
});

describe("date input conversion", () => {
  test("parses a date input as local midnight, not UTC", () => {
    // The bug this guards: new Date("2026-09-03") is UTC midnight, which is
    // Sep 2nd anywhere west of Greenwich. Reading the date back out has to
    // return the same calendar day it went in as.
    const ts = dateInputToTimestamp("2026-09-03");
    const d = new Date(ts);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 8);
    assert.equal(d.getDate(), 3);
  });

  test("round-trips through the input format unchanged", () => {
    for (const value of ["2026-01-01", "2026-09-03", "2025-12-31"]) {
      assert.equal(timestampToDateInput(dateInputToTimestamp(value)), value);
    }
  });

  test("falls back for malformed input", () => {
    assert.equal(dateInputToTimestamp("not a date", 4242), 4242);
    assert.equal(dateInputToTimestamp("", 4242), 4242);
    assert.equal(dateInputToTimestamp("09/03/2026", 4242), 4242);
  });

  test("zero-pads single-digit months and days", () => {
    const ts = new Date(2026, 0, 5).getTime();
    assert.equal(timestampToDateInput(ts), "2026-01-05");
  });
});
