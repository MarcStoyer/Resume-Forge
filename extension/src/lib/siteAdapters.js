// Per-site DOM extraction, for pages that don't publish JobPosting JSON-LD.
//
// The big one is LinkedIn's split-pane browse view (/jobs/collections/...,
// /jobs/search/...), where the posting lives in the right rail and nothing is
// embedded as structured data. That view is how most people actually read
// postings, so relying on JSON-LD alone means detecting almost nothing on
// LinkedIn.
//
// Selectors are deliberately given as ordered lists: LinkedIn renames classes
// often, so each field tries several and takes the first that yields text.

function textFrom(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const text = el?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function htmlFrom(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el?.innerHTML) return el.innerHTML;
  }
  return "";
}

// "New York City Metropolitan Area · 3 weeks ago · Over 100 applicants" —
// the location is the first segment.
function firstSegment(text) {
  return (text || "").split("·")[0].replace(/\s+/g, " ").trim();
}

// LinkedIn shows pay as "$67K/yr" or "$95,000 - $120,000" in the insight
// pills. Pull the first money-looking run rather than parsing the whole card.
function salaryFrom(text) {
  if (!text) return "";
  const m = text.match(/\$[\d,]+(?:\.\d+)?\s*[KkMm]?(?:\s*[-–—]\s*\$[\d,]+(?:\.\d+)?\s*[KkMm]?)?(?:\s*\/\s*\w+|\s*(?:per|an?)\s+\w+)?/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

const linkedin = {
  test: (host) => /(^|\.)linkedin\.com$/.test(host),
  parse(doc) {
    const role = textFrom(doc, [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".t-24.job-details-jobs-unified-top-card__job-title",
      "h1.topcard__title",
      ".jobs-details-top-card__job-title",
    ]);
    const company = textFrom(doc, [
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      "a.topcard__org-name-link",
      ".jobs-details-top-card__company-url",
    ]);
    const meta = textFrom(doc, [
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".job-details-jobs-unified-top-card__tertiary-description-container",
      ".jobs-unified-top-card__primary-description",
      ".topcard__flavor-row",
    ]);
    const jdHtml = htmlFrom(doc, [
      "#job-details",
      ".jobs-description__content .jobs-box__html-content",
      ".jobs-description-content__text",
      ".jobs-box__html-content",
      ".description__text",
    ]);
    const insights = textFrom(doc, [
      ".job-details-jobs-unified-top-card__job-insight",
      ".jobs-unified-top-card__job-insight",
      ".salary-main-rail-card",
      ".compensation__salary",
    ]);

    return {
      role,
      company,
      location: firstSegment(meta),
      salary: salaryFrom(insights) || salaryFrom(meta),
      jdHtml,
      // A title alone isn't proof; a title plus a description is.
      confidence: role && jdHtml ? "high" : role ? "medium" : "low",
    };
  },
};

// Workday renders everything client-side into data-automation-id hooks, which
// are far more stable than its class names.
const workday = {
  test: (host) => /(^|\.)myworkdayjobs\.com$/.test(host),
  parse(doc) {
    const role = textFrom(doc, ['[data-automation-id="jobPostingHeader"]', "h1"]);
    const jdHtml = htmlFrom(doc, ['[data-automation-id="jobPostingDescription"]']);
    const location = textFrom(doc, ['[data-automation-id="locations"] dd', '[data-automation-id="locations"]']);
    return {
      role,
      company: "",
      location,
      salary: salaryFrom(textFrom(doc, ['[data-automation-id="jobPostingDescription"]'])),
      jdHtml,
      confidence: role && jdHtml ? "high" : role ? "medium" : "low",
    };
  },
};

const ADAPTERS = [linkedin, workday];

export function adapterFor(host) {
  return ADAPTERS.find((a) => a.test(host)) || null;
}

// LinkedIn's browse view keeps the posting id in ?currentJobId= while the
// canonical page is /jobs/view/<id>. Normalising means saving from the split
// pane and from the standalone page dedupe to the same application instead of
// creating two.
export function normalizeLinkedInUrl(url) {
  let u;
  try { u = new URL(url); } catch { return url; }
  if (!/(^|\.)linkedin\.com$/.test(u.hostname)) return url;

  const current = u.searchParams.get("currentJobId");
  if (current && /^\d+$/.test(current)) {
    return `https://www.linkedin.com/jobs/view/${current}`;
  }
  const m = u.pathname.match(/\/jobs\/view\/(\d+)/);
  if (m) return `https://www.linkedin.com/jobs/view/${m[1]}`;
  return url;
}
