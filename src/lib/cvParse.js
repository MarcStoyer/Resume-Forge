const ENTRY_SECTIONS = new Set(["education", "experience", "extracurriculars", "projects"]);

const SECTION_ALIASES = new Map([
  ["EDUCATION", "education"],
  ["WORK EXPERIENCE", "experience"],
  ["EXPERIENCE", "experience"],
  ["PROFESSIONAL EXPERIENCE", "experience"],
  ["EXTRACURRICULARS", "extracurriculars"],
  ["HONORS & AWARDS", "awards"],
  ["HONORS AND AWARDS", "awards"],
  ["AWARDS", "awards"],
  ["PROJECTS", "projects"],
  ["ADDITIONAL INFORMATION", "additional"],
]);

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

function elementChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1);
}

function directParagraphs(cell) {
  return elementChildren(cell)
    .filter((el) => el.tagName?.toUpperCase() === "P")
    .map((el) => clean(el.textContent))
    .filter(Boolean);
}

function directListItems(cell) {
  const lists = elementChildren(cell).filter((el) => ["UL", "OL"].includes(el.tagName?.toUpperCase()));
  return lists.flatMap((list) => elementChildren(list)
    .filter((el) => el.tagName?.toUpperCase() === "LI")
    .map((item) => {
      const clone = item.cloneNode(true);
      const nestedLists = [
        ...Array.from(clone.getElementsByTagName("ul")),
        ...Array.from(clone.getElementsByTagName("ol")),
      ];
      nestedLists.forEach((nested) => nested.parentNode?.removeChild(nested));
      return clean(clone.textContent);
    })
    .filter(Boolean));
}

function parseContact(cells) {
  const left = directParagraphs(cells[0]);
  const right = directParagraphs(cells[1]);
  const all = [...left.slice(1), ...right];
  const joined = all.join(" | ");
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = joined.match(/(?:\+?\d[\d().\s-]{7,}\d)/)?.[0] || "";
  const linkedin = joined.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/i)?.[0] || "";
  const github = joined.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|]+/i)?.[0] || "";
  return {
    name: left[0] || "",
    location: right[0] || "",
    email,
    phone: clean(phone),
    linkedin,
    github,
  };
}

function splitCommaList(value) {
  return value.split(/\s*,\s*/).map(clean).filter(Boolean);
}

function parseAdditional(paragraphs, result) {
  for (const paragraph of paragraphs) {
    const match = paragraph.match(/^([^:]{2,40}):\s*(.+)$/);
    if (!match) continue;
    const label = clean(match[1]);
    const text = clean(match[2]);
    if (/certification/i.test(label)) result.certs.push(...splitCommaList(text));
    else if (/interest/i.test(label)) result.interests.push(...splitCommaList(text));
    else result.skills.push({ label, text });
  }
}

function createEntry(section, cells) {
  const left = directParagraphs(cells[0]);
  const right = directParagraphs(cells[1]);
  if (!left.length) return null;

  if (section === "projects") {
    const parts = left.join(" ").split(/\s*\|\s*/, 2).map(clean);
    return {
      org: parts[0] || "",
      role: parts[1] || "",
      dates: right.join(" | "),
      loc: "",
      bullets: [],
    };
  }

  return {
    org: left[0] || "",
    role: left.slice(1).join(" | "),
    loc: right[0] || "",
    dates: right.slice(1).join(" | "),
    bullets: [],
  };
}

export function parseStructuredDocxHtml(html) {
  if (!html || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.getElementsByTagName("tr"));
  if (rows.length < 3) return null;

  const result = {
    contact: { name: "", location: "", email: "", phone: "", linkedin: "", github: "" },
    profile: "",
    experience: [],
    education: [],
    skills: [],
    certs: [],
    awards: [],
    projects: [],
    extracurriculars: [],
    interests: [],
  };

  let section = "";
  let currentEntry = null;
  let recognizedEntries = 0;

  rows.forEach((row, index) => {
    const cells = elementChildren(row).filter((el) => ["TD", "TH"].includes(el.tagName?.toUpperCase()));
    if (!cells.length) return;
    if (index === 0 && cells.length >= 2) result.contact = parseContact(cells);

    const rowText = clean(cells.map((cell) => cell.textContent).join(" "));
    const heading = SECTION_ALIASES.get(rowText.toUpperCase());
    if (heading) {
      section = heading;
      currentEntry = null;
      return;
    }

    const bullets = cells.flatMap(directListItems);
    if (bullets.length) {
      if (section === "awards") result.awards.push(...bullets);
      else if (currentEntry) currentEntry.bullets.push(...bullets);
      return;
    }

    if (section === "additional") {
      parseAdditional(cells.flatMap(directParagraphs), result);
      return;
    }

    if (ENTRY_SECTIONS.has(section) && cells.length >= 2) {
      const entry = createEntry(section, cells);
      if (entry) {
        result[section].push(entry);
        currentEntry = entry;
        recognizedEntries += 1;
      }
    }
  });

  return recognizedEntries >= 2 ? result : null;
}

export const CV_EXTRACTION_SYSTEM = [
  "Extract the complete resume into JSON using exactly this schema:",
  "{\"contact\":{\"name\":\"\",\"location\":\"\",\"email\":\"\",\"phone\":\"\",\"linkedin\":\"\",\"github\":\"\"},\"profile\":\"\",\"experience\":[{\"org\":\"\",\"role\":\"\",\"dates\":\"\",\"loc\":\"\",\"bullets\":[]}],\"education\":[{\"org\":\"\",\"role\":\"\",\"dates\":\"\",\"loc\":\"\",\"bullets\":[]}],\"skills\":[{\"label\":\"\",\"text\":\"\"}],\"certs\":[],\"awards\":[],\"projects\":[{\"org\":\"\",\"role\":\"\",\"dates\":\"\",\"loc\":\"\",\"bullets\":[]}],\"extracurriculars\":[{\"org\":\"\",\"role\":\"\",\"dates\":\"\",\"loc\":\"\",\"bullets\":[]}],\"interests\":[]}.",
  "",
  "Rules:",
  "- Return only valid JSON. No markdown or commentary.",
  "- Include every entry and every bullet. Preserve source order and wording; do not summarize, rewrite, invent, or truncate.",
  "- This resume may use organizational two-column rows. Pair the left side (organization/project and role) with the right side (location and dates) on the same visual row.",
  "- Full-width bullets immediately following a two-column row belong to that preceding entry.",
  "- For projects, put the project name in org, technologies/subtitle in role, and preserve dates and bullets.",
  "- Keep extracurriculars, awards, certifications, skills, and interests instead of dropping them.",
  "- Use empty strings or arrays for missing values.",
].join("\n");

export const CV_EXTRACTION_REQUEST = "Extract this entire resume using the required JSON schema and layout-pairing rules.";
