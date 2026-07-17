import React from "react";

// Paper dimensions at 96 DPI (standard for CSS/screen).
// Letter: 8.5 × 11 in.  A4: 8.27 × 11.69 in.
// Content height = paper height minus top+bottom margins (0.6in each per print CSS).
const PAPERS = {
  letter: { widthIn: 8.5, heightIn: 11 },
  a4:     { widthIn: 8.27, heightIn: 11.69 },
};
const MARGIN_IN = 0.6; // matches @page margin in index.css
const DPI = 96;

function contentHeightPx(paperKey) {
  const p = PAPERS[paperKey] || PAPERS.letter;
  return (p.heightIn - MARGIN_IN * 2) * DPI;
}
function pageWidthPx(paperKey) {
  const p = PAPERS[paperKey] || PAPERS.letter;
  return p.widthIn * DPI;
}

function SectionTitle({ children, t }) {
  const base = {
    color: t.accent, fontSize: t.sizes.title, fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: t.titleStyle === "rule" ? "0.12em" : "0.06em",
    marginBottom: 6, paddingBottom: 2,
  };
  if (t.titleStyle === "underline") base.borderBottom = "1px solid #ccc";
  if (t.titleStyle === "rule") base.borderBottom = "1px solid " + t.accent;
  if (t.titleStyle === "bar") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 14, height: 3, background: t.accent, display: "inline-block" }} />
        <span style={{ ...base, marginBottom: 0, paddingBottom: 0 }}>{children}</span>
      </div>
    );
  }
  return <div style={base}>{children}</div>;
}

function Entry({ en, t }) {
  const bl = en.bullets.filter((b) => b.on);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: t.sizes.body }}>{en.org}</span>
        <span style={{ fontSize: t.sizes.sub, color: "#555" }}>{en.dates}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontStyle: "italic", fontSize: t.sizes.body - 1, color: "#444" }}>
        <span>{en.role}</span>
        <span style={{ fontStyle: "normal", color: "#777" }}>{en.loc}</span>
      </div>
      {en.sub && <div style={{ fontSize: t.sizes.sub, color: "#777", fontStyle: "italic" }}>{en.sub}</div>}
      {bl.length > 0 && (
        <ul style={{ listStyle: "disc", marginLeft: 18, marginTop: 4, fontSize: t.sizes.body }}>
          {bl.map((b) => (<li key={b.id} style={{ marginBottom: 2 }}>{b.text}</li>))}
        </ul>
      )}
    </div>
  );
}

function renderSection(sec, t) {
  if (!sec) return null;
  if (sec.kind === "entries") {
    const vis = sec.entries.filter((e) => e.on);
    if (!vis.length) return null;
    return (
      <div key={sec.id} style={{ marginBottom: t.sectionGap }}>
        <SectionTitle t={t}>{sec.title}</SectionTitle>
        {vis.map((en) => <Entry key={en.id} en={en} t={t} />)}
      </div>
    );
  }
  const vis = sec.entries.filter((it) => it.on);
  if (!vis.length) return null;
  return (
    <div key={sec.id} style={{ marginBottom: t.sectionGap }}>
      <SectionTitle t={t}>{sec.title}</SectionTitle>
      {sec.id === "certs" || sec.id === "awards" ? (
        <ul style={{ listStyle: "disc", marginLeft: 18, fontSize: t.sizes.body }}>
          {vis.map((it) => (<li key={it.id} style={{ marginBottom: 2 }}>{it.label ? <><b>{it.label}: </b>{it.text}</> : it.text}</li>))}
        </ul>
      ) : (
        <div style={{ fontSize: t.sizes.body }}>
          {vis.map((it) => (
            <div key={it.id} style={{ marginBottom: 3 }}>
              {it.label && <span style={{ fontWeight: 600 }}>{it.label}: </span>}
              <span>{it.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Page-break guides: absolutely-positioned lines at multiples of the content height.
// They live inside a relative-positioned container that wraps the paper.
function PageGuides({ paperKey }) {
  const h = contentHeightPx(paperKey);
  const w = pageWidthPx(paperKey);
  // Padding on the sheet is p-10 = 40px. So the *actual* content region starts at y=40.
  // We'll draw guides at 40 + h, 40 + 2h, ... offset from the top of the paper wrapper.
  // Cap at 5 pages to keep the DOM light.
  const guides = [];
  for (let i = 1; i <= 5; i++) {
    const y = 40 + h * i;
    guides.push(
      <div key={i} style={{
        position: "absolute", left: 0, right: 0, top: y,
        borderTop: "1px dashed #cbd5e1", pointerEvents: "none",
      }}>
        <div style={{
          position: "absolute", right: 8, top: 4, fontSize: 10,
          color: "#94a3b8", background: "#f8fafc", padding: "1px 4px", borderRadius: 3,
        }}>
          Page {i + 1}
        </div>
      </div>
    );
  }
  return <>{guides}</>;
}

export default function Preview({ resume, template: t, paper = "letter", printMode = false }) {
  const c = resume.contact;
  const contactBits = [c.location, c.email, c.phone, c.linkedin, c.github].filter((x) => x && x.trim());
  const byId = (id) => resume.sections.find((s) => s.id === id);
  const fixedSectionIds = new Set(["exp", "edu", "skills", "certs", "awards", "proj"]);
  const extraSections = resume.sections.filter((section) => !fixedSectionIds.has(section.id));
  const profileBlock = resume.profile.on && resume.profile.text.trim() ? (
    <p style={{ marginBottom: t.sectionGap, textAlign: "justify", fontSize: t.sizes.body }}>{resume.profile.text}</p>
  ) : null;

  const Header = (
    <div style={{
      textAlign: t.layout === "twoColumn" ? "left" : t.headerAlign,
      borderBottom: t.layout === "twoColumn" ? "none" : "2px solid " + t.accent,
      paddingBottom: t.layout === "twoColumn" ? 4 : 12, marginBottom: 12,
    }}>
      <div style={{ fontSize: t.sizes.name, fontWeight: 700, color: "#111", letterSpacing: "0.02em" }}>{c.name}</div>
      {t.layout !== "twoColumn" && (
        <div style={{ fontSize: t.sizes.contact, color: "#555", marginTop: 4 }}>{contactBits.join("  •  ")}</div>
      )}
    </div>
  );

  const sheetWidth = pageWidthPx(paper);

  const sheet = (
    <div className="print-area bg-white shadow-lg mx-auto p-10 text-stone-900"
      style={{ width: sheetWidth, maxWidth: "100%", fontFamily: t.fontFamily, fontSize: t.sizes.body, lineHeight: 1.5 }}>
      {Header}
      {t.layout === "twoColumn" ? (
        <div style={{ display: "flex", gap: 22 }}>
          <div style={{ width: "32%", borderRight: "1px solid #ddd", paddingRight: 16 }}>
            <div style={{ marginBottom: t.sectionGap }}>
              <SectionTitle t={t}>Contact</SectionTitle>
              <div style={{ fontSize: t.sizes.contact, color: "#444", lineHeight: 1.7 }}>
                {contactBits.map((x, i) => (<div key={i}>{x}</div>))}
              </div>
            </div>
            {renderSection(byId("skills"), t)}
            {renderSection(byId("certs"), t)}
            {renderSection(byId("awards"), t)}
          </div>
          <div style={{ width: "68%" }}>
            {profileBlock}
            {renderSection(byId("exp"), t)}
            {renderSection(byId("edu"), t)}
            {renderSection(byId("proj"), t)}
            {extraSections.map((section) => renderSection(section, t))}
          </div>
        </div>
      ) : (
        <>
          {profileBlock}
          {resume.sections.map((sec) => renderSection(sec, t))}
        </>
      )}
    </div>
  );

  // In print mode, drop the guides and the wrapper — let the browser handle pagination.
  if (printMode) return sheet;

  return (
    <div style={{ position: "relative", width: sheetWidth, maxWidth: "100%", margin: "0 auto" }}>
      {sheet}
      <PageGuides paperKey={paper} />
    </div>
  );
}
