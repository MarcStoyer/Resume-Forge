import React from "react";
import { honestyLabel, honestyColor } from "../lib/honesty.js";

export default function HonestySlider({ value, onChange, compact = false }) {
  const c = honestyColor(value);
  const label = honestyLabel(value);

  return (
    <div className={compact ? "" : "bg-white rounded-lg border border-stone-200 p-4"}>
      {!compact && (
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Honesty</div>
      )}
      <div className="flex items-center gap-3">
        <input
          type="range" min={0} max={100} step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ accentColor: c, flex: 1 }}
        />
        <div className="text-xs font-semibold w-24 text-right" style={{ color: c }}>{value}/100</div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[11px]" style={{ color: c, fontWeight: 600 }}>{label}</div>
        {value <= 35 && (
          <div className="text-[10px] text-red-600 font-semibold">⚠ may fabricate</div>
        )}
      </div>
      {!compact && (
        <div className="text-[10px] text-stone-400 mt-1.5 leading-snug">
          Controls every AI rewrite, summary, and cover letter. 75 = reword without inventing. 100 = no changes.
        </div>
      )}
    </div>
  );
}
