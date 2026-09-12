import { adapterFor, normalizeLinkedInUrl } from "./siteAdapters.js";
// Turning a job page into application fields.
//
// The primary source is schema.org JobPosting embedded as JSON-LD, which most
// boards emit for Google's job search (Greenhouse, Lever, Ashby, Indeed,
// LinkedIn, SmartRecruiters, Workable). That gives title, employer, salary and
// posting date as structured data rather than scraped text — far more reliable
// than DOM selectors, which break whenever a site reskins.
//
// collectJsonLd/parseJobPage need a DOM; everything below them is pure so the
// extraction rules are actually testable.

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function stripTags(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return num >= 1000
    ? "$" + Math.round(num).toLocaleString("en-US")
    : "$" + num;
}

// schema.org baseSalary is a MonetaryAmount whose `value` is a
// QuantitativeValue — either a single `value` or a min/max range, with a
// unitText telling you whether it's hourly or yearly.
export function formatSalary(baseSalary) {
  if (!baseSalary) return "";
  if (typeof baseSalary === "string" || typeof baseSalary === "number") return String(baseSalary);

  const v = baseSalary.value || baseSalary;
  const currency = baseSalary.currency || baseSalary.currencyCode || "";
  const unit = String(v.unitText || "").toUpperCase();
  const suffix = unit === "HOUR" ? "/hr" : unit === "MONTH" ? "/mo" : unit === "WEEK" ? "/wk" : unit === "DAY" ? "/day" : "";

  let core = "";
  if (v.minValue != null && v.maxValue != null && String(v.minValue) !== String(v.maxValue)) {
    core = `${money(v.minValue)} – ${money(v.maxValue)}`;
  } else if (v.minValue != null || v.maxValue != null || v.value != null) {
    core = money(v.value ?? v.minValue ?? v.maxValue);
  }
  if (!core) return "";
  const prefix = currency && currency !== "USD" ? currency + " " : "";
  return (prefix + core + suffix).trim();
}

function orgName(org) {
  if (!org) return "";
  if (typeof org === "string") return org;
  return org.name || "";
}

function placeName(loc) {
  if (!loc) return "";
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (typeof first === "string") return first;
  const a = first.address || first;
  if (typeof a === "string") return a;
  return [a.addressLocality, a.addressRegion, a.addressCountry]
    .map((x) => (typeof x === "string" ? x : x?.name))
    .filter(Boolean)
    .join(", ");
}

// JSON-LD blocks come in several shapes: a bare object, an array, or a @graph
// wrapper. Flatten them all before looking for JobPosting.
export function flattenJsonLd(parsed) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(visit);
    out.push(node);
  };
  visit(parsed);
  return out;
}

function isJobPosting(node) {
  const t = node && node["@type"];
  if (!t) return false;
  return Array.isArray(t) ? t.includes("JobPosting") : t === "JobPosting";
}

// Given every JSON-LD object found on the page, produce application fields.
export function parseJobPosting(nodes) {
  const job = flattenJsonLd(nodes).find(isJobPosting);
  if (!job) return null;

  const salary = formatSalary(job.baseSalary) || formatSalary(job.estimatedSalary);
  return {
    role: (job.title || "").trim(),
    company: orgName(job.hiringOrganization).trim(),
    location: placeName(job.jobLocation) || (job.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
    salary,
    jd: stripTags(job.description || ""),
    datePosted: job.datePosted || "",
    employmentType: Array.isArray(job.employmentType) ? job.employmentType.join(", ") : (job.employmentType || ""),
    confidence: "high",
  };
}

// Where the application was submitted, from the hostname. Feeds the tracker's
// existing "Where you applied" field.
export function sourceFromUrl(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  const map = [
    [/(^|\.)linkedin\.com$/, "LinkedIn"],
    [/(^|\.)indeed\.com$/, "Indeed"],
    [/(^|\.)greenhouse\.io$/, "Greenhouse"],
    [/(^|\.)lever\.co$/, "Lever"],
    [/(^|\.)ashbyhq\.com$/, "Ashby"],
    [/(^|\.)myworkdayjobs\.com$/, "Workday"],
    [/(^|\.)smartrecruiters\.com$/, "SmartRecruiters"],
    [/(^|\.)workable\.com$/, "Workable"],
    [/(^|\.)joinhandshake\.com$/, "Handshake"],
    [/(^|\.)glassdoor\.com$/, "Glassdoor"],
    [/(^|\.)ziprecruiter\.com$/, "ZipRecruiter"],
  ];
  for (const [re, name] of map) if (re.test(host)) return name;
  return "Company site";
}

// Postings carry tracking junk that makes the same job look like several
// different URLs, which would defeat the dedupe. Strip it.
const TRACKING_PARAMS = /^(utm_|ref$|refId$|trk$|trackingId$|src$|source$|gh_src$|lever-source|_gl$|fbclid$|gclid$)/i;

export function canonicalJobUrl(url) {
  try {
    const u = new URL(normalizeLinkedInUrl(url));
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url || "";
  }
}

// ---------------------------------------------------------------------------
// DOM-dependent
// ---------------------------------------------------------------------------

export function collectJsonLd(doc) {
  const out = [];
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { out.push(JSON.parse(el.textContent)); } catch { /* malformed block */ }
  }
  return out;
}

// Fallback when a page has no JobPosting JSON-LD (Workday being the usual
// culprit). Deliberately conservative: better to hand the user a mostly-empty
// form they complete than to confidently fill in the wrong company.
export function parseFromDom(doc, url) {
  const meta = (p) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content?.trim() || "";
  const title = meta("og:title") || doc.title || "";
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  // Titles are commonly "Role - Company" or "Role | Company".
  let role = title, company = "";
  const split = title.split(/\s+[|\-–—]\s+/);
  if (split.length >= 2) {
    role = split[0].trim();
    company = split[split.length - 1].trim();
    if (/careers?|jobs?|hiring/i.test(company)) company = split.length > 2 ? split[split.length - 2].trim() : "";
  }
  return {
    role,
    company: company || meta("og:site_name") || "",
    location: "",
    salary: "",
    jd: stripTags(doc.querySelector("main, article, #content, .content")?.innerHTML || ""),
    datePosted: "",
    employmentType: "",
    confidence: "low",
    host,
  };
}

export function parseJobPage(doc, url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep empty */ }

  // JSON-LD first when it's there — it's structured and doesn't rot.
  let base = parseJobPosting(collectJsonLd(doc));

  // Then a site adapter. LinkedIn's split-pane browse view (and Workday)
  // publish no JobPosting at all, and that view is how most postings are
  // actually read, so without this LinkedIn detects almost nothing.
  if (!base) {
    const adapter = adapterFor(host);
    if (adapter) {
      const a = adapter.parse(doc);
      if (a.role) {
        base = {
          role: a.role,
          company: a.company,
          location: a.location,
          salary: a.salary,
          jd: stripTags(a.jdHtml),
          datePosted: "",
          employmentType: "",
          confidence: a.confidence,
        };
      }
    }
  }

  if (!base) base = parseFromDom(doc, url);

  return {
    ...base,
    jobUrl: canonicalJobUrl(url),
    source: sourceFromUrl(url),
  };
}
