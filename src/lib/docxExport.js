import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, LevelFormat } from "docx";
import { saveAs } from "file-saver";

const FONT = "Calibri";
function sectionHeader(text, accent) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent.replace("#", ""), space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: accent.replace("#", ""), font: FONT })],
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 21, font: FONT })],
  });
}
function jobHeader(en) {
  return new Paragraph({
    spacing: { before: 120, after: 20 },
    tabStops: [{ type: "right", position: 9360 }],
    children: [
      new TextRun({ text: en.org, bold: true, size: 22, font: FONT }),
      new TextRun({ text: "\t" + (en.dates || ""), italics: true, size: 21, font: FONT, color: "555555" }),
    ],
  });
}
function jobSub(en) {
  if (!en.role && !en.loc) return null;
  return new Paragraph({
    spacing: { after: 40 },
    tabStops: [{ type: "right", position: 9360 }],
    children: [
      new TextRun({ text: en.role || "", italics: true, size: 21, font: FONT, color: "333333" }),
      new TextRun({ text: "\t" + (en.loc || ""), size: 21, font: FONT, color: "555555" }),
    ],
  });
}

export async function exportDocx(resume, template) {
  const c = resume.contact;
  const accent = template.accent;
  const children = [];
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: c.name, bold: true, size: 40, font: FONT })],
  }));
  const bits = [c.location, c.email, c.phone, c.linkedin, c.github].filter((x) => x && x.trim()).join("  •  ");
  if (bits) children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: bits, size: 20, color: "555555", font: FONT })],
  }));
  if (resume.profile.on && resume.profile.text.trim()) {
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: resume.profile.text, size: 21, font: FONT })],
    }));
  }
  for (const sec of resume.sections) {
    if (sec.kind === "entries") {
      const vis = sec.entries.filter((e) => e.on);
      if (!vis.length) continue;
      children.push(sectionHeader(sec.title, accent));
      for (const en of vis) {
        children.push(jobHeader(en));
        const sub = jobSub(en); if (sub) children.push(sub);
        if (en.sub) children.push(new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: en.sub, italics: true, size: 20, color: "777777", font: FONT })],
        }));
        for (const b of en.bullets.filter((b) => b.on)) children.push(bullet(b.text));
      }
    } else {
      const vis = sec.entries.filter((it) => it.on);
      if (!vis.length) continue;
      children.push(sectionHeader(sec.title, accent));
      if (sec.id === "certs") {
        for (const it of vis) children.push(bullet(it.text));
      } else {
        for (const it of vis) {
          children.push(new Paragraph({
            spacing: { after: 50 },
            children: [
              it.label ? new TextRun({ text: it.label + ": ", bold: true, size: 21, font: FONT }) : new TextRun({ text: "" }),
              new TextRun({ text: it.text, size: 21, font: FONT }),
            ],
          }));
        }
      }
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 200 } } } }],
      }],
    },
    sections: [{ properties: { page: { margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } } }, children }],
  });
  const blob = await Packer.toBlob(doc);
  const fname = (c.name || "resume").replace(/[^a-z0-9]+/gi, "_") + ".docx";
  saveAs(blob, fname);
}

export async function exportCoverLetterDocx(text, contact) {
  const lines = (text || "").split(/\n+/).map((line) =>
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: line, size: 22, font: FONT })] })
  );
  const header = [];
  if (contact?.name) header.push(new Paragraph({ children: [new TextRun({ text: contact.name, bold: true, size: 28, font: FONT })] }));
  const bits = [contact?.location, contact?.email, contact?.phone].filter(Boolean).join("  •  ");
  if (bits) header.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: bits, size: 20, color: "555555", font: FONT })] }));
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } } }, children: [...header, ...lines] }],
  });
  const blob = await Packer.toBlob(doc);
  const fname = ((contact?.name || "cover_letter").replace(/[^a-z0-9]+/gi, "_")) + "_cover_letter.docx";
  saveAs(blob, fname);
}
