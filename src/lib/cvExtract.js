import mammoth from "mammoth";
import { callClaude } from "./api.js";
import { extractText, extractJSON, mapParsed } from "./parse.js";
import { CV_EXTRACTION_REQUEST, CV_EXTRACTION_SYSTEM, parseStructuredDocxHtml } from "./cvParse.js";

// Shared résumé-file extraction, used both by the main "Upload CV" button and
// by attaching a résumé to an individual application. Returns a résumé object
// in the app's structured shape.
//
// Cost note worth keeping in mind when calling this: a DOCX whose layout the
// local table parser recognises never reaches the API and is free. PDFs,
// images and plain text always cost one Claude call.

export function readFile(file, as) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("file read failed"));
    if (as === "dataURL") r.readAsDataURL(file);
    else if (as === "arrayBuffer") r.readAsArrayBuffer(file);
    else r.readAsText(file);
  });
}

// True when the file can be parsed locally without spending an API call, so
// callers can tell the user what a given upload will cost before it runs.
export async function willUseApi(file) {
  const name = (file?.name || "").toLowerCase();
  if (!name.endsWith(".docx")) return true;
  try {
    const buf = await readFile(file, "arrayBuffer");
    const out = await mammoth.convertToHtml({ arrayBuffer: buf });
    return !parseStructuredDocxHtml(out.value);
  } catch {
    return true;
  }
}

// Wraps extraction with the cost warning, so every entry point words it the
// same way and none of them can quietly spend a request. Returns null when the
// user declines.
export async function confirmAndExtractResume(file, { confirmFn } = {}) {
  const ask = confirmFn || ((msg) => window.confirm(msg));
  if (await willUseApi(file)) {
    const ok = ask(
      `"${file.name}" can't be read locally, so parsing it costs one AI request.\n\n` +
      "A DOCX saved from Word or Google Docs is usually free to parse. Continue?"
    );
    if (!ok) return null;
  }
  return extractResumeFromFile(file);
}

export async function extractResumeFromFile(file) {
  const name = (file.name || "").toLowerCase();
  let content;
  let parsed = null;

  if (name.endsWith(".pdf")) {
    const b64 = (await readFile(file, "dataURL")).split(",")[1];
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      { type: "text", text: CV_EXTRACTION_REQUEST },
    ];
  } else if (name.endsWith(".docx")) {
    const buf = await readFile(file, "arrayBuffer");
    const out = await mammoth.convertToHtml({ arrayBuffer: buf });
    parsed = parseStructuredDocxHtml(out.value);
    if (!parsed) {
      content = CV_EXTRACTION_REQUEST + "\n\nThe source below is semantic HTML converted from DOCX. Preserve table-row relationships:\n\n" + out.value;
    }
  } else if (/\.(png|jpe?g|webp|gif)$/.test(name)) {
    const b64 = (await readFile(file, "dataURL")).split(",")[1];
    const mt = "image/" + (name.endsWith(".png") ? "png" : name.endsWith(".webp") ? "webp" : name.endsWith(".gif") ? "gif" : "jpeg");
    content = [
      { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
      { type: "text", text: CV_EXTRACTION_REQUEST },
    ];
  } else {
    content = CV_EXTRACTION_REQUEST + "\n\n" + (await readFile(file, "text"));
  }

  if (!parsed) {
    const data = await callClaude({
      system: CV_EXTRACTION_SYSTEM,
      messages: [{ role: "user", content }],
      max_tokens: 8000,
    });
    parsed = extractJSON(extractText(data));
  }
  if (!parsed) throw new Error("Couldn't parse that file. Try a DOCX or text-based PDF.");
  return mapParsed(parsed);
}
