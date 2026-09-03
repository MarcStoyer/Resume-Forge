// Deriving a sane label/company from pasted job-description text.
//
// Job boards render the employer's logo as an <img> whose alt text reads
// "Company logo for, Acme Inc." — and browsers include alt text when you
// copy a rendered page, so that string routinely lands as line 1 of a
// pasted JD. The old code took the first non-empty line verbatim as the
// application's label, which is how "Company logo for, Kovari." ended up
// as a title in the applications list.
//
// Rather than just dropping that line, we mine it: the name inside it IS
// the employer, so it seeds the company field.

// Lines that are chrome/navigation rather than the actual posting.
const JUNK_LINE = /^(company\s+logo|logo\s+for|posted\s+by|promoted\s+by|reposted|apply\s+now|easy\s+apply|save\s+job|sign\s+in|skip\s+to|share\s+this|back\s+to\s+search|show\s+more|see\s+more)\b/i;

// "Company logo for, Acme Inc." / "Company logo for Acme Inc"
const LOGO_ALT = /^company\s+logo\s+for[,:]?\s*/i;

function tidy(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// Strips a trailing sentence period without eating "Inc." / "Co." style
// abbreviations mid-string — we only touch the very end of the line.
function trimTrailingPeriod(text) {
  return text.replace(/\.+$/, "").trim();
}

function lines(jd) {
  return String(jd || "").split("\n").map(tidy).filter(Boolean);
}

// The employer name carried inside a "Company logo for, X" line, if present.
export function guessCompany(jd) {
  for (const line of lines(jd)) {
    if (!LOGO_ALT.test(line)) continue;
    const name = trimTrailingPeriod(line.replace(LOGO_ALT, ""));
    if (name) return name.slice(0, 80);
  }
  return "";
}

// First line that looks like actual posting content rather than page chrome.
// A "Company logo for, X" line is unwrapped to X instead of being skipped, so
// something useful still surfaces on pages where that's genuinely all there is.
export function guessJobLabel(jd) {
  for (const line of lines(jd)) {
    const unwrapped = LOGO_ALT.test(line)
      ? trimTrailingPeriod(line.replace(LOGO_ALT, ""))
      : line;
    if (!unwrapped || unwrapped.length < 3) continue;
    if (JUNK_LINE.test(unwrapped)) continue;
    return unwrapped.slice(0, 80);
  }
  return "";
}

// Where the application was submitted. Free text is allowed too — this is
// just the quick-pick list.
export const APPLICATION_SOURCES = [
  "Company site",
  "LinkedIn",
  "Indeed",
  "Handshake",
  "Referral",
  "Recruiter",
  "Other",
];
