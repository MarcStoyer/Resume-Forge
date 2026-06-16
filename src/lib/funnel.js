// Ordered application stages. Adding new stages later: append before "Rejected".
export const STAGES = [
  { id: "saved",      label: "Saved",        color: "#94a3b8" }, // slate
  { id: "applied",    label: "Applied",      color: "#0ea5e9" }, // sky
  { id: "screen",     label: "Phone screen", color: "#8b5cf6" }, // violet
  { id: "interview",  label: "Interview",    color: "#f59e0b" }, // amber
  { id: "offer",      label: "Offer",        color: "#10b981" }, // emerald
  { id: "rejected",   label: "Rejected",     color: "#ef4444" }, // red
];

export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

// Counts of how many apps EVER reached each stage.
// An app that's in "interview" counts toward saved, applied, screen, AND interview.
// Rejected is a terminal state — counts toward Rejected only (not toward higher stages it didn't reach).
export function computeFunnel(apps) {
  const ord = ["saved", "applied", "screen", "interview", "offer"];
  const counts = Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
  for (const app of apps) {
    const status = app.status || "saved";
    if (status === "rejected") {
      // Count rejected separately; also count it as having reached every prior stage in its history.
      counts.rejected += 1;
      const reached = new Set((app.statusHistory || []).map((h) => h.status));
      for (const id of ord) if (reached.has(id)) counts[id] += 1;
      // ensure 'saved' (everyone was saved at some point) is counted
      if (!reached.has("saved")) counts.saved += 1;
      continue;
    }
    const idx = ord.indexOf(status);
    if (idx === -1) { counts.saved += 1; continue; }
    for (let i = 0; i <= idx; i++) counts[ord[i]] += 1;
  }
  return counts;
}

// Make a brand-new status history entry
export function historyEntry(status, note = "") {
  return { status, at: Date.now(), note };
}
