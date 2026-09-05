import React, { useState } from "react";
import { MODELS, TIERS, getModel, relativeCost, DEFAULT_AI_SETTINGS } from "../lib/models.js";

// Which model handles which kind of work. Split by tier rather than one global
// setting because the two kinds of call have very different economics: parsing
// is mechanical and high-volume, writing is judgement-heavy and is where model
// quality actually shows up in the output.
export default function AiSettingsPopover({ settings, setSettings }) {
  const [open, setOpen] = useState(false);
  const set = (tier, id) => setSettings({ ...settings, [tier]: id });

  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        title="AI model settings" aria-label="AI model settings"
        className={`px-3 py-2 rounded-md text-sm border ${open ? "bg-stone-100 border-stone-400" : "border-stone-300 hover:bg-stone-50"}`}
      >
        🧠 Models
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-[22rem] bg-white border border-stone-200 rounded-lg shadow-lg p-3 space-y-3 text-xs">
            {TIERS.map((tier) => {
              const current = settings[tier.id] || DEFAULT_AI_SETTINGS[tier.id];
              return (
                <div key={tier.id} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <div className="font-semibold text-stone-700">{tier.label}</div>
                  <div className="text-[10px] text-stone-500 mb-1.5">{tier.what}</div>
                  <select
                    value={current} onChange={(e) => set(tier.id, e.target.value)}
                    className="w-full text-xs border border-stone-300 rounded px-2 py-1.5 bg-white outline-none focus:border-teal-700"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — ${m.inPrice}/${m.outPrice} per 1M
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] text-stone-500 mt-1">{getModel(current).blurb}</div>
                  <div className="text-[10px] text-stone-400 mt-0.5">{tier.hint}</div>
                </div>
              );
            })}

            <div className="text-[10px] text-stone-400 border-t border-stone-100 pt-2">
              Prices are per million tokens, input/output. Relative to the default:
              parsing {relativeCost(settings.extraction)}×, writing {relativeCost(settings.writing)}×.
              Applies to the next request — nothing already generated changes.
            </div>

            <button
              type="button" onClick={() => setSettings({ ...DEFAULT_AI_SETTINGS })}
              className="text-[10px] text-stone-500 hover:text-stone-800 underline"
            >
              Reset to defaults
            </button>
          </div>
        </>
      )}
    </div>
  );
}
