import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rowToRecord, recordToRow } from "../src/lib/applicationRow.js";

const FULL_RECORD = {
  id: "abc123",
  label: "Sila Nanotechnologies — Research Associate",
  company: "Sila Nanotechnologies",
  role: "Research Associate",
  source: "LinkedIn",
  salary: "$95,000 – $120,000",
  status: "interview",
  statusHistory: [{ status: "applied", at: 1756000000000, note: "" }],
  savedAt: 1756000000000,
  jd: "Research Associate, R&D Operations…",
  jobUrl: "https://boards.greenhouse.io/sila/jobs/1",
  resumeUrl: "https://drive.google.com/file/d/xyz",
  coverLetter: "Dear Hiring Manager,",
  notes: "Recruiter: Dana",
  resume: { contact: { name: "Marc Andrew Stoyer" }, sections: [] },
  interviewPrep: { status: "done", questions: [] },
  templateId: "classic",
  honesty: 75,
  origin: "extension",
};

describe("application row mapping", () => {
  test("survives a full round trip without losing a field", () => {
    const back = rowToRecord(recordToRow(FULL_RECORD, "user-1"));
    for (const [k, v] of Object.entries(FULL_RECORD)) {
      assert.deepEqual(back[k], v, `field "${k}" did not survive the round trip`);
    }
  });

  test("carries user_id onto the row for RLS", () => {
    assert.equal(recordToRow(FULL_RECORD, "user-1").user_id, "user-1");
  });

  test("savedAt survives as the same instant", () => {
    const row = recordToRow(FULL_RECORD, "u");
    assert.equal(new Date(row.saved_at).getTime(), FULL_RECORD.savedAt);
    assert.equal(rowToRecord(row).savedAt, FULL_RECORD.savedAt);
  });

  test("a sparse record fills in defaults rather than writing nulls into not-null columns", () => {
    const row = recordToRow({ id: "x" }, "u");
    for (const col of ["label", "company", "role", "source", "salary", "status", "jd", "job_url", "resume_url", "cover_letter", "notes", "origin"]) {
      assert.equal(typeof row[col], "string", `${col} should be a string, got ${row[col]}`);
    }
    assert.ok(Array.isArray(row.status_history));
  });

  test("an absent résumé stays null rather than becoming an empty object", () => {
    assert.equal(recordToRow({ id: "x" }, "u").resume, null);
    assert.equal(rowToRecord({ id: "x", resume: null }).resume, null);
  });

  test("a malformed status_history degrades to an empty array", () => {
    assert.deepEqual(rowToRecord({ id: "x", status_history: "not an array" }).statusHistory, []);
  });
});
