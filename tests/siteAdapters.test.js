import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { adapterFor, normalizeLinkedInUrl } from "../extension/src/lib/siteAdapters.js";

// Minimal stand-in for a document: enough querySelector for the adapters,
// without pulling in a DOM library.
function fakeDoc(map) {
  return {
    querySelector(sel) {
      const hit = map[sel];
      if (!hit) return null;
      return typeof hit === "string"
        ? { textContent: hit, innerHTML: hit }
        : { textContent: hit.text ?? "", innerHTML: hit.html ?? "" };
    },
  };
}

describe("LinkedIn adapter", () => {
  const doc = fakeDoc({
    ".job-details-jobs-unified-top-card__job-title": "Custom Research Analyst",
    ".job-details-jobs-unified-top-card__company-name a": "Ergo",
    ".job-details-jobs-unified-top-card__primary-description-container":
      "New York City Metropolitan Area · 3 weeks ago · Over 100 applicants",
    "#job-details": { html: "<p>You will research <strong>things</strong>.</p>" },
    ".job-details-jobs-unified-top-card__job-insight": "Hybrid · Full-time · $95,000 - $120,000/yr",
  });

  test("reads the posting out of the split-pane right rail", () => {
    const a = adapterFor("www.linkedin.com").parse(doc);
    assert.equal(a.role, "Custom Research Analyst");
    assert.equal(a.company, "Ergo");
    assert.equal(a.confidence, "high");
  });

  test("takes only the location from the dot-separated meta line", () => {
    const a = adapterFor("www.linkedin.com").parse(doc);
    assert.equal(a.location, "New York City Metropolitan Area");
  });

  test("pulls a salary range out of the insight pills", () => {
    const a = adapterFor("www.linkedin.com").parse(doc);
    assert.match(a.salary, /\$95,000/);
  });

  test("a title with no description is only medium confidence", () => {
    const thin = fakeDoc({ ".job-details-jobs-unified-top-card__job-title": "Analyst" });
    assert.equal(adapterFor("linkedin.com").parse(thin).confidence, "medium");
  });

  test("an empty page is low confidence, not a false positive", () => {
    assert.equal(adapterFor("linkedin.com").parse(fakeDoc({})).confidence, "low");
  });
});

describe("adapterFor", () => {
  test("matches the hosts it should and nothing else", () => {
    assert.ok(adapterFor("www.linkedin.com"));
    assert.ok(adapterFor("acme.myworkdayjobs.com"));
    assert.equal(adapterFor("boards.greenhouse.io"), null); // JSON-LD covers it
  });
});

describe("normalizeLinkedInUrl", () => {
  test("leaves non-LinkedIn URLs alone", () => {
    const url = "https://jobs.lever.co/acme/x?currentJobId=9";
    assert.equal(normalizeLinkedInUrl(url), url);
  });
  test("ignores a non-numeric currentJobId", () => {
    const url = "https://www.linkedin.com/jobs/collections/?currentJobId=nonsense";
    assert.equal(normalizeLinkedInUrl(url), url);
  });
});
