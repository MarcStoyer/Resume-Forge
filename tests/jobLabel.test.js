import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { guessJobLabel, guessCompany } from "../src/lib/jobLabel.js";

// The real shape of a pasted LinkedIn/Indeed posting: the logo's alt text
// comes along with the copy, ahead of any actual content.
const PASTED_LINKEDIN = `Company logo for, Kovari.
Kovari Robot Operator
San Francisco, CA · 4 months ago · Over 100 applicants
Promoted by hirer · Actively reviewing applicants`;

const PASTED_SILA = `Company logo for, Sila Nanotechnologies, Inc..
Sila Nanotechnologies, Inc. Research Associate, R&D Operations
Alameda, CA · Reposted`;

describe("guessJobLabel", () => {
  test("does not return the logo alt-text line verbatim", () => {
    const label = guessJobLabel(PASTED_LINKEDIN);
    assert.ok(!/company logo/i.test(label), `label still contains logo junk: ${label}`);
  });

  test("unwraps the company out of a logo line rather than returning it raw", () => {
    assert.equal(guessJobLabel(PASTED_LINKEDIN), "Kovari");
  });

  test("handles the doubled period in the Sila posting", () => {
    assert.equal(guessJobLabel(PASTED_SILA), "Sila Nanotechnologies, Inc");
  });

  test("uses the first real line when there's no logo junk", () => {
    assert.equal(guessJobLabel("Staff Engineer, Platform\nAcme Corp\nRemote"), "Staff Engineer, Platform");
  });

  test("skips navigation chrome", () => {
    assert.equal(guessJobLabel("Skip to main content\nApply now\nData Analyst\n"), "Data Analyst");
  });

  test("returns empty string for empty input", () => {
    assert.equal(guessJobLabel(""), "");
    assert.equal(guessJobLabel(null), "");
  });

  test("caps length at 80 characters", () => {
    assert.ok(guessJobLabel("x".repeat(200)).length <= 80);
  });

  test("collapses runaway whitespace", () => {
    assert.equal(guessJobLabel("   Senior    Data   Scientist   \n"), "Senior Data Scientist");
  });
});

describe("guessCompany", () => {
  test("extracts the employer from the logo alt line", () => {
    assert.equal(guessCompany(PASTED_LINKEDIN), "Kovari");
  });

  test("extracts a company containing its own periods", () => {
    assert.equal(guessCompany(PASTED_SILA), "Sila Nanotechnologies, Inc");
  });

  test("returns empty when there is no logo line", () => {
    assert.equal(guessCompany("Staff Engineer\nAcme Corp"), "");
  });
});
