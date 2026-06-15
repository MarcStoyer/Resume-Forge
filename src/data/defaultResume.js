import { uid } from "../lib/util.js";

export const DEFAULT_PROFILE =
  "Quantitatively trained generalist with a Columbia astrophysics background and a strong hands-on, build-oriented bent. Combines applied Python data-engineering experience with practical fabrication and field skills, comfortable moving between rigorous analysis and physical, real-world problem solving.";

export function defaultResume() {
  return {
    contact: {
      name: "Marc [Last Name]",
      location: "[City, State]",
      email: "[email]",
      phone: "[phone]",
      linkedin: "[linkedin.com/in/…]",
      github: "[github / portfolio]",
    },
    profile: { on: true, text: DEFAULT_PROFILE },
    sections: [
      {
        id: "exp", title: "Experience", kind: "entries", addLabel: "+ Add job",
        entries: [
          {
            id: uid(), on: true,
            org: "Amplify Endowment Management", loc: "[City / Remote]",
            role: "[Title — e.g., Business Development Associate]",
            dates: "[Start] – Present",
            sub: "Boutique OCIO firm serving foundations & nonprofits ($30–150M AUM)",
            bullets: [
              { id: uid(), on: true,  tag: "IMPACT",   text: "Built the firm's prospect-intelligence pipeline from scratch as a junior team member, replacing a manual research process with an automated system." },
              { id: uid(), on: true,  tag: "DATA",     text: "Architected an end-to-end Python pipeline that filtered 20,011 nonprofit organizations from IRS Business Master File data down to 1,534 qualified targets via automated rule-based screening." },
              { id: uid(), on: false, tag: "DATA",     text: "Built XML-parsing workflows to extract structured financial and governance fields from raw IRS Form 990 filings at scale." },
              { id: uid(), on: false, tag: "DATA",     text: "Integrated the ProPublica Nonprofit Explorer API to programmatically enrich organizational records with financial data." },
              { id: uid(), on: true,  tag: "DATA",     text: "Designed and shipped amplify-rfp-intel, a modular RFP-monitoring system with discrete ingestion, classification, and matching components (httpx, BeautifulSoup, pdfplumber, feedparser, SQLite, PyYAML)." },
              { id: uid(), on: false, tag: "DATA",     text: "Implemented a keyword-based classifier to automatically score and rank incoming RFP documents by relevance." },
              { id: uid(), on: false, tag: "DATA",     text: "Modeled prospect data in SQLite as a 1,534-row enriched database serving as the pipeline's single source of truth." },
              { id: uid(), on: true,  tag: "BD",       text: "Targeted foundations and nonprofits holding $30–150M in investable assets, generating a qualified pipeline of 1,534 prospective institutional clients." },
              { id: uid(), on: false, tag: "BD",       text: "Evaluated and integrated contact-discovery platforms (Apollo.io, Hunter.io, Candid) to source decision-maker contacts for outreach." },
              { id: uid(), on: false, tag: "BD",       text: "Cross-referenced live RFP opportunities against the prospect database to surface timely, high-fit leads." },
              { id: uid(), on: false, tag: "ANALYSIS", text: "Conducted a cost-benefit analysis comparing cold-email outreach against automated RFP monitoring to prioritize the firm's go-to-market strategy." },
              { id: uid(), on: false, tag: "ANALYSIS", text: "Translated unstructured public filings and RFP documents into structured, decision-ready intelligence for firm leadership." },
            ],
          },
          {
            id: uid(), on: false,
            org: "[Texas Trades / Manual Labor Employer]", loc: "[City, TX]",
            role: "[Role — e.g., Solar Installation Technician]", dates: "[dates]", sub: "",
            bullets: [
              { id: uid(), on: false, tag: "IMPACT", text: "[What you built, installed, operated, or repaired — equipment, scale, materials]" },
              { id: uid(), on: false, tag: "IMPACT", text: "[A safety or teamwork responsibility — crew size, OSHA practices, site coordination]" },
              { id: uid(), on: false, tag: "IMPACT", text: "[A result with a number — units installed, throughput, projects completed]" },
            ],
          },
        ],
      },
      {
        id: "edu", title: "Education", kind: "entries", addLabel: "+ Add school",
        entries: [
          {
            id: uid(), on: true,
            org: "Columbia University, School of General Studies", loc: "New York, NY",
            role: "B.A. in Astrophysics; Minor in Mathematical Probability",
            dates: "Expected May 2026", sub: "",
            bullets: [
              { id: uid(), on: false, tag: "DATA", text: "GPA: [add if strong]" },
              { id: uid(), on: false, tag: "DATA", text: "Relevant coursework: Electrodynamics, Order-of-Magnitude Physics, [add probability/statistics, numerical methods, linear algebra]" },
              { id: uid(), on: false, tag: "DATA", text: "[Honors / awards / Dean's List — if any]" },
            ],
          },
          {
            id: uid(), on: false,
            org: "[Community College Name]", loc: "[City, State]",
            role: "[Associate degree / coursework focus]", dates: "[dates]", sub: "", bullets: [],
          },
        ],
      },
      {
        id: "skills", title: "Technical Skills", kind: "list", addLabel: "+ Add skill line",
        entries: [
          { id: uid(), on: true, tag: "DATA",     label: "Programming & Data",      text: "Python (httpx, BeautifulSoup, pdfplumber, feedparser, PyYAML), SQL / SQLite, XML parsing, REST APIs, web scraping, ETL & data-pipeline design, Git, Linux / WSL" },
          { id: uid(), on: true, tag: "ANALYSIS", label: "Quantitative",            text: "Probability & statistics, [numerical methods, modeling, linear algebra — trim to what's true]" },
          { id: uid(), on: true, tag: "IMPACT",   label: "Fabrication & Hardware", text: "Welding, electronics, robotics, prototyping [specify: MIG/TIG/stick, soldering, Arduino, CAD, machining, 3D printing]" },
        ],
      },
      {
        id: "certs", title: "Certifications", kind: "list", addLabel: "+ Add certification",
        entries: [
          { id: uid(), on: true, tag: "IMPACT", label: "", text: "OSHA 30 — Occupational Safety and Health (30-hour)" },
          { id: uid(), on: true, tag: "IMPACT", label: "", text: "Wilderness First Responder (WFR)" },
        ],
      },
      {
        id: "proj", title: "Projects & Builds", kind: "list", addLabel: "+ Add project",
        entries: [
          { id: uid(), on: false, tag: "DATA",   label: "AI Homework Annotation App", text: "Designed an Android app concept for real-time AI-assisted annotation of handwritten physics problem sets (Samsung Tab S10 / OneNote workflow)." },
          { id: uid(), on: false, tag: "IMPACT", label: "[Hardware / Robotics Build]", text: "[What you built, materials, tools/process, outcome]" },
        ],
      },
    ],
  };
}
