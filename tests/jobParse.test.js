import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseJobPosting, formatSalary, sourceFromUrl, canonicalJobUrl, stripTags, flattenJsonLd,
} from "../extension/src/lib/jobParse.js";

// Shaped like what Greenhouse/Lever actually emit.
const GREENHOUSE = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Research Associate, R&D Operations",
  hiringOrganization: { "@type": "Organization", name: "Sila Nanotechnologies" },
  jobLocation: { "@type": "Place", address: { addressLocality: "Alameda", addressRegion: "CA", addressCountry: "US" } },
  baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { "@type": "QuantitativeValue", minValue: 95000, maxValue: 120000, unitText: "YEAR" } },
  datePosted: "2026-08-14",
  employmentType: "FULL_TIME",
  description: "<p>You will <strong>run</strong> experiments.</p><ul><li>Operate equipment</li></ul>",
};

describe("parseJobPosting", () => {
  test("pulls the fields the tracker needs out of a JobPosting", () => {
    const job = parseJobPosting([GREENHOUSE]);
    assert.equal(job.role, "Research Associate, R&D Operations");
    assert.equal(job.company, "Sila Nanotechnologies");
    assert.equal(job.location, "Alameda, CA, US");
    assert.equal(job.salary, "$95,000 – $120,000");
    assert.equal(job.datePosted, "2026-08-14");
  });

  test("strips markup out of the description but keeps the text", () => {
    const job = parseJobPosting([GREENHOUSE]);
    assert.ok(job.jd.includes("run experiments"));
    assert.ok(job.jd.includes("Operate equipment"));
    assert.ok(!job.jd.includes("<"), `markup survived: ${job.jd}`);
  });

  test("finds a JobPosting nested in an @graph", () => {
    const job = parseJobPosting([{ "@graph": [{ "@type": "WebSite" }, GREENHOUSE] }]);
    assert.equal(job.company, "Sila Nanotechnologies");
  });

  test("finds one in an array of blocks", () => {
    assert.ok(parseJobPosting([{ "@type": "Organization" }, [GREENHOUSE]]));
  });

  test("handles @type given as an array", () => {
    assert.ok(parseJobPosting([{ ...GREENHOUSE, "@type": ["JobPosting", "Thing"] }]));
  });

  test("returns null when the page has no JobPosting", () => {
    assert.equal(parseJobPosting([{ "@type": "WebSite", name: "Careers" }]), null);
    assert.equal(parseJobPosting([]), null);
  });

  test("reports remote roles as a location", () => {
    const job = parseJobPosting([{ ...GREENHOUSE, jobLocation: null, jobLocationType: "TELECOMMUTE" }]);
    assert.equal(job.location, "Remote");
  });
});

describe("formatSalary", () => {
  test("formats a yearly range with thousands separators", () => {
    assert.equal(formatSalary({ value: { minValue: 95000, maxValue: 120000, unitText: "YEAR" } }), "$95,000 – $120,000");
  });
  test("marks hourly rates as hourly", () => {
    assert.equal(formatSalary({ value: { minValue: 25, maxValue: 32, unitText: "HOUR" } }), "$25 – $32/hr");
  });
  test("collapses a range whose ends are equal", () => {
    assert.equal(formatSalary({ value: { minValue: 100000, maxValue: 100000, unitText: "YEAR" } }), "$100,000");
  });
  test("prefixes a non-USD currency", () => {
    assert.match(formatSalary({ currency: "GBP", value: { minValue: 50000, maxValue: 60000 } }), /^GBP /);
  });
  test("returns empty for a missing or unusable value", () => {
    assert.equal(formatSalary(null), "");
    assert.equal(formatSalary({ value: {} }), "");
  });
});

describe("canonicalJobUrl", () => {
  test("strips tracking parameters so one job is one URL", () => {
    // Without this the same posting arrives as several different URLs and the
    // dedupe never fires.
    assert.equal(
      canonicalJobUrl("https://linkedin.com/jobs/view/123?utm_source=x&refId=abc&trk=z"),
      "https://linkedin.com/jobs/view/123"
    );
  });
  test("keeps parameters that actually identify the job", () => {
    assert.match(canonicalJobUrl("https://x.myworkdayjobs.com/job?jobId=R-42&utm_medium=email"), /jobId=R-42/);
  });
  test("drops the fragment and trailing slash", () => {
    assert.equal(canonicalJobUrl("https://jobs.lever.co/acme/abc/#apply"), "https://jobs.lever.co/acme/abc");
  });
  test("passes a malformed URL through rather than throwing", () => {
    assert.equal(canonicalJobUrl("not a url"), "not a url");
  });
});

describe("sourceFromUrl", () => {
  for (const [url, expected] of [
    ["https://www.linkedin.com/jobs/view/1", "LinkedIn"],
    ["https://boards.greenhouse.io/sila/jobs/1", "Greenhouse"],
    ["https://jobs.lever.co/acme/x", "Lever"],
    ["https://acme.myworkdayjobs.com/en-US/careers/job/x", "Workday"],
    ["https://careers.acme.com/jobs/1", "Company site"],
  ]) {
    test(`${url} → ${expected}`, () => assert.equal(sourceFromUrl(url), expected));
  }
});

describe("stripTags", () => {
  test("turns list items into bullets and keeps paragraph breaks", () => {
    const out = stripTags("<p>Intro</p><ul><li>One</li><li>Two</li></ul>");
    assert.ok(out.includes("• One"));
    assert.ok(out.includes("• Two"));
  });
  test("decodes entities", () => {
    assert.equal(stripTags("<p>R&amp;D &quot;ops&quot;</p>"), 'R&D "ops"');
  });
});

describe("flattenJsonLd", () => {
  test("flattens nested arrays and @graph wrappers together", () => {
    const nodes = flattenJsonLd([{ "@graph": [{ a: 1 }] }, [{ b: 2 }]]);
    assert.equal(nodes.length, 3); // the wrapper itself, plus both children
  });
});
