"use client";

import { useState } from "react";
import { dicebearUrl } from "@/lib/avatar";
import { PixelIcon } from "@/components/icons";

/**
 * Pick-a-face: a grid of DiceBear pixel-art avatars seeded off the
 * user's name, with a shuffle for fresh batches. Selecting hands the
 * full URL up to the parent (wizard or profile form).
 */
export function AvatarPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [batch, setBatch] = useState(0);

  const seeds = Array.from({ length: 8 }, (_, i) => `${name || "friend"}-${batch * 8 + i}`);

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {seeds.map((seed) => {
          const url = dicebearUrl(seed);
          const selected = value === url;
          return (
            <button
              key={seed}
              type="button"
              onClick={() => onChange(selected ? null : url)}
              aria-pressed={selected}
              className={`aspect-square overflow-hidden border-2 bg-paper p-1 transition-transform ${
                selected
                  ? "border-ink bg-accent-yellow shadow-brutal-sm -translate-y-0.5"
                  : "border-ink/30 hover:border-ink"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="avatar option" className="h-full w-full" />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setBatch((b) => b + 1)}
          className="brutal-press inline-flex items-center gap-1.5 border-2 border-ink bg-paper px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide shadow-brutal-sm"
        >
          <PixelIcon name="reload" size={13} />
          More faces
        </button>
        <p className="font-mono text-[10px] uppercase text-ink/40">
          {value ? "Nice pick" : "None picked = one's chosen for you"}
        </p>
      </div>
    </div>
  );
}
