import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseDelimited, detectDelimiter, autoMapColumns,
  normalizeStatus, parseAppliedDate, rowsToApplications,
} from "../src/lib/csvImport.js";

describe("parseDelimited", () => {
  test("parses a simple CSV", () => {
    const rows = parseDelimited("Company,Role\nAcme,Engineer\n");
    assert.deepEqual(rows, [["Company", "Role"], ["Acme", "Engineer"]]);
  });

  test("honours quoted fields containing commas", () => {
    const rows = parseDelimited('Company,Notes\n"Sila Nanotechnologies, Inc.","Applied, then followed up"\n');
    assert.deepEqual(rows[1], ["Sila Nanotechnologies, Inc.", "Applied, then followed up"]);
  });

  test('unescapes doubled quotes', () => {
    const rows = parseDelimited('Note\n"They said ""maybe"""\n');
    assert.equal(rows[1][0], 'They said "maybe"');
  });

  test("handles newlines inside quoted fields", () => {
    const rows = parseDelimited('Company,Notes\nAcme,"line one\nline two"\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1][1], "line one\nline two");
  });

  test("handles CRLF line endings", () => {
    const rows = parseDelimited("A,B\r\n1,2\r\n");
    assert.deepEqual(rows, [["A", "B"], ["1", "2"]]);
  });

  test("parses TSV pasted from a spreadsheet", () => {
    const rows = parseDelimited("Company\tRole\nAcme\tEngineer\n");
    assert.deepEqual(rows, [["Company", "Role"], ["Acme", "Engineer"]]);
  });

  test("drops blank spacer rows", () => {
    const rows = parseDelimited("A,B\n1,2\n\n , \n3,4\n");
    assert.deepEqual(rows, [["A", "B"], ["1", "2"], ["3", "4"]]);
  });

  test("keeps empty trailing cells", () => {
    const rows = parseDelimited("A,B,C\n1,,3\n");
    assert.deepEqual(rows[1], ["1", "", "3"]);
  });
});

describe("detectDelimiter", () => {
  test("detects tabs", () => assert.equal(detectDelimiter("a\tb\tc\n"), "\t"));
  test("detects commas", () => assert.equal(detectDelimiter("a,b,c\n"), ","));
  test("detects semicolons", () => assert.equal(detectDelimiter("a;b;c\n"), ";"));
});

describe("autoMapColumns", () => {
  test("maps a typical tracking sheet", () => {
    const m = autoMapColumns(["Company", "Job Title", "Date Applied", "Status", "Where Applied", "Resume Link", "Notes"]);
    assert.deepEqual(m, ["company", "role", "appliedAt", "status", "source", "resumeUrl", "notes"]);
  });

  test("does not let a loose rule steal the cover letter column", () => {
    const m = autoMapColumns(["Company", "Cover Letter", "Resume"]);
    assert.deepEqual(m, ["company", "coverLetter", "resumeUrl"]);
  });

  test("distinguishes job URL from résumé link", () => {
    const m = autoMapColumns(["Job Link", "Resume Link"]);
    assert.deepEqual(m, ["jobUrl", "resumeUrl"]);
  });

  test("leaves unrecognised columns unmapped", () => {
    const m = autoMapColumns(["Company", "Salary Expectation"]);
    assert.deepEqual(m, ["company", null]);
  });

  test("never assigns the same field to two columns", () => {
    const m = autoMapColumns(["Company", "Employer"]);
    assert.equal(m.filter((x) => x === "company").length, 1);
  });
});

describe("normalizeStatus", () => {
  const cases = [
    ["Applied", "applied"], ["submitted", "applied"], ["In Review", "applied"],
    ["Rejected", "rejected"], ["rejected after interview", "rejected"],
    ["Ghosted", "rejected"], ["Offer!", "offer"],
    ["Phone Screen", "screen"], ["Onsite interview", "interview"],
    ["saved for later", "saved"], ["", "applied"], ["nonsense value", "applied"],
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" -> ${expected}`, () => assert.equal(normalizeStatus(input), expected));
  }
});

describe("parseAppliedDate", () => {
  test("parses ISO dates", () => {
    assert.equal(new Date(parseAppliedDate("2026-09-03")).getUTCFullYear(), 2026);
  });
  test("parses US-style slashes", () => {
    assert.equal(new Date(parseAppliedDate("9/3/2026")).getFullYear(), 2026);
  });
  test("parses written dates", () => {
    assert.equal(new Date(parseAppliedDate("Sep 3, 2026")).getFullYear(), 2026);
  });
  test("falls back for unparseable input", () => {
    assert.equal(parseAppliedDate("sometime last spring", 12345), 12345);
  });
  test("falls back for empty input", () => {
    assert.equal(parseAppliedDate("", 999), 999);
  });
});

describe("rowsToApplications", () => {
  const rows = parseDelimited(
    "Company,Role,Status,Where Applied,Date Applied,Resume Link,Notes\n" +
    "Kovari,Robot Operator,Applied,LinkedIn,9/3/2026,https://drive.google.com/x,Referred by Sam\n" +
    "Sila,Research Associate,Rejected,Company site,8/1/2026,,\n"
  );
  const mapping = autoMapColumns(rows[0]);

  test("builds records with the expected shape", () => {
    const apps = rowsToApplications(rows, mapping);
    assert.equal(apps.length, 2);
    const [first] = apps;
    assert.equal(first.company, "Kovari");
    assert.equal(first.role, "Robot Operator");
    assert.equal(first.status, "applied");
    assert.equal(first.source, "LinkedIn");
    assert.equal(first.resumeUrl, "https://drive.google.com/x");
    assert.equal(first.notes, "Referred by Sam");
    assert.equal(first.resume, null, "imported rows carry no résumé snapshot yet");
    assert.ok(first.id);
  });

  test("composes a label from company and role", () => {
    const [first] = rowsToApplications(rows, mapping);
    assert.equal(first.label, "Kovari — Robot Operator");
  });

  test("dates the status history to the applied date, not now", () => {
    const [first] = rowsToApplications(rows, mapping);
    assert.equal(first.statusHistory[0].at, first.savedAt);
    assert.equal(new Date(first.savedAt).getFullYear(), 2026);
  });

  test("normalises status per row", () => {
    const apps = rowsToApplications(rows, mapping);
    assert.equal(apps[1].status, "rejected");
  });

  test("skips rows with nothing identifying in them", () => {
    const sparse = parseDelimited("Company,Role,Notes\n,,orphaned note\nAcme,Engineer,\n");
    const apps = rowsToApplications(sparse, autoMapColumns(sparse[0]));
    assert.equal(apps.length, 1);
    assert.equal(apps[0].company, "Acme");
  });
});
