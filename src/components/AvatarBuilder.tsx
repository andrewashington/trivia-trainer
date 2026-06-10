"use client";

import {
  AVATAR_BACKGROUNDS,
  AVATAR_HEADS,
  AVATAR_SKIN_COLORS,
  avatarUrlFromConfig,
  type AvatarConfig,
} from "@/lib/avatar";
import { PixelIcon } from "@/components/icons";

/**
 * Lightweight make-your-own-peep builder. A live preview plus a few
 * high-impact controls — hair, skin tone, backdrop — and a reroll for
 * the bits we leave to chance (expression, accessories). Hands a
 * structured {@link AvatarConfig} up to the parent (wizard or profile).
 */
export function AvatarBuilder({
  name,
  value,
  onChange,
}: {
  name: string;
  value: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
}) {
  const set = (patch: Partial<AvatarConfig>) => onChange({ ...value, ...patch });

  // Cycle hair forward/back through the offered styles. No head pinned
  // yet = treat the first style as the current spot.
  const headIndex = value.head ? AVATAR_HEADS.indexOf(value.head as never) : -1;
  const cycleHead = (dir: 1 | -1) => {
    const next = (headIndex + dir + AVATAR_HEADS.length) % AVATAR_HEADS.length;
    set({ head: AVATAR_HEADS[next] });
  };

  // Reroll the random features by nudging the seed.
  const reroll = () => {
    const base = (value.seed || name || "friend").replace(/~\d+$/, "");
    set({ seed: `${base}~${(headIndex + 7) * 13 + value.seed.length + 1}` });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* Live preview */}
      <div className="flex flex-col items-center gap-2">
        <span className="h-28 w-28 shrink-0 overflow-hidden border-2 border-ink bg-paper shadow-brutal-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrlFromConfig(value)} alt="your avatar" className="h-full w-full" />
        </span>
        <button
          type="button"
          onClick={reroll}
          className="brutal-press inline-flex items-center gap-1.5 border-2 border-ink bg-paper px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide shadow-brutal-sm"
        >
          <PixelIcon name="reload" size={13} />
          Reroll
        </button>
      </div>

      {/* Controls */}
      <div className="flex-1 space-y-3">
        {/* Hair */}
        <div>
          <span className="brutal-label">Hair</span>
          <div className="flex items-center gap-2">
            <CycleButton dir={-1} onClick={() => cycleHead(-1)} />
            <span className="flex-1 truncate border-2 border-ink bg-card px-2 py-1 text-center font-mono text-xs font-bold uppercase">
              {value.head ?? "default"}
            </span>
            <CycleButton dir={1} onClick={() => cycleHead(1)} />
          </div>
        </div>

        {/* Skin tone */}
        <div>
          <span className="brutal-label">Skin tone</span>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_SKIN_COLORS.map((hex) => (
              <Swatch
                key={hex}
                hex={hex}
                selected={value.skinColor === hex}
                onClick={() => set({ skinColor: value.skinColor === hex ? undefined : hex })}
              />
            ))}
          </div>
        </div>

        {/* Backdrop */}
        <div>
          <span className="brutal-label">Backdrop</span>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_BACKGROUNDS.map((hex) => (
              <Swatch
                key={hex || "none"}
                hex={hex}
                transparent={hex === ""}
                selected={(value.backgroundColor ?? "") === hex}
                onClick={() => set({ backgroundColor: hex || undefined })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CycleButton({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? "Next hair" : "Previous hair"}
      className="brutal-press inline-flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ink bg-paper shadow-brutal-sm"
    >
      <span className={dir === -1 ? "inline-flex -scale-x-100" : "inline-flex"}>
        <PixelIcon name="chevron-right" size={14} />
      </span>
    </button>
  );
}

function Swatch({
  hex,
  selected,
  transparent,
  onClick,
}: {
  hex: string;
  selected: boolean;
  transparent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={transparent ? "No backdrop" : `#${hex}`}
      style={transparent ? undefined : { backgroundColor: `#${hex}` }}
      className={`h-7 w-7 border-2 transition-transform ${
        transparent ? "bg-paper" : ""
      } ${selected ? "border-ink shadow-brutal-sm -translate-y-0.5" : "border-ink/30 hover:border-ink"}`}
    >
      {transparent && <PixelIcon name="close" size={12} />}
    </button>
  );
}
