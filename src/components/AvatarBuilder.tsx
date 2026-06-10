"use client";

import {
  AVATAR_ACCESSORIES,
  AVATAR_BACKGROUNDS,
  AVATAR_CLOTHING_COLORS,
  AVATAR_FACES,
  AVATAR_FACIAL_HAIR,
  AVATAR_HAIR_COLORS,
  AVATAR_HEADS,
  AVATAR_SKIN_COLORS,
  AVATAR_STYLES,
  DICEBEAR_STYLE,
  avatarUrlFromConfig,
  type AvatarConfig,
} from "@/lib/avatar";
import { PixelIcon } from "@/components/icons";

/**
 * Make-your-own-peep builder: live preview, a base-style switcher, and
 * (for Open Peeps) a control for every part. Each part cycles through
 * "random" → (optionally "none") → every pinned value. Other styles
 * draw all their parts from the seed — reroll to shuffle. Hands a
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
  const style = value.style ?? DICEBEAR_STYLE;
  const isPeeps = style === DICEBEAR_STYLE;

  // Reroll the unpinned features by nudging the seed.
  const reroll = () => {
    const base = (value.seed || name || "friend").replace(/~\d+$/, "");
    const n = Number(value.seed.match(/~(\d+)$/)?.[1] ?? 0);
    set({ seed: `${base}~${n + 1}` });
  };

  const cycleStyle = (dir: 1 | -1) => {
    const styles = AVATAR_STYLES as readonly string[];
    const next = (styles.indexOf(style) + dir + styles.length) % styles.length;
    // Part pins are open-peeps-specific; clear them when leaving it.
    const nextStyle = styles[next];
    if (nextStyle === DICEBEAR_STYLE) {
      set({ style: undefined });
    } else {
      onChange({
        seed: value.seed,
        style: nextStyle,
        backgroundColor: value.backgroundColor,
      });
    }
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
        {/* Base style */}
        <div>
          <span className="brutal-label">Style</span>
          <div className="flex items-center gap-2">
            <CycleButton dir={-1} label="style" onClick={() => cycleStyle(-1)} />
            <span className="flex-1 truncate border-2 border-ink bg-card px-2 py-1 text-center font-mono text-xs font-bold uppercase">
              {style}
            </span>
            <CycleButton dir={1} label="style" onClick={() => cycleStyle(1)} />
          </div>
        </div>

        {isPeeps ? (
          <>
            <CycleRow
              label="Hair"
              options={AVATAR_HEADS}
              value={value.head}
              onChange={(head) => set({ head })}
            />
            <CycleRow
              label="Expression"
              options={AVATAR_FACES}
              value={value.face}
              onChange={(face) => set({ face })}
            />
            <CycleRow
              label="Facial hair"
              options={AVATAR_FACIAL_HAIR}
              value={value.facialHair}
              onChange={(facialHair) => set({ facialHair })}
              allowNone
            />
            <CycleRow
              label="Accessory"
              options={AVATAR_ACCESSORIES}
              value={value.accessory}
              onChange={(accessory) => set({ accessory })}
              allowNone
            />

            <SwatchRow
              label="Hair color"
              colors={AVATAR_HAIR_COLORS}
              value={value.hairColor}
              onChange={(hairColor) => set({ hairColor })}
            />
            <SwatchRow
              label="Skin tone"
              colors={AVATAR_SKIN_COLORS}
              value={value.skinColor}
              onChange={(skinColor) => set({ skinColor })}
            />
            <SwatchRow
              label="Outfit"
              colors={AVATAR_CLOTHING_COLORS}
              value={value.clothingColor}
              onChange={(clothingColor) => set({ clothingColor })}
            />
          </>
        ) : (
          <p className="border-2 border-dashed border-ink/30 bg-paper px-3 py-2 font-mono text-[11px] text-ink/60">
            This style rolls all its features from the dice — hit reroll until
            you like the look. Switch back to open-peeps for part-by-part
            control.
          </p>
        )}

        {/* Backdrop applies to every style */}
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

/**
 * A part picker that cycles "random" → ("none" →) each pinned value.
 * undefined = random (the dice decide); "none" = forced off.
 */
function CycleRow({
  label,
  options,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  options: readonly string[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allowNone?: boolean;
}) {
  const all: (string | undefined)[] = [undefined, ...(allowNone ? ["none"] : []), ...options];
  const index = all.indexOf(value);
  const cycle = (dir: 1 | -1) => {
    const next = ((index === -1 ? 0 : index) + dir + all.length) % all.length;
    onChange(all[next]);
  };
  return (
    <div>
      <span className="brutal-label">{label}</span>
      <div className="flex items-center gap-2">
        <CycleButton dir={-1} label={label} onClick={() => cycle(-1)} />
        <span
          className={`flex-1 truncate border-2 border-ink bg-card px-2 py-1 text-center font-mono text-xs font-bold uppercase ${
            value === undefined ? "text-ink/40" : ""
          }`}
        >
          {value ?? "random"}
        </span>
        <CycleButton dir={1} label={label} onClick={() => cycle(1)} />
      </div>
    </div>
  );
}

function SwatchRow({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: readonly string[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <span className="brutal-label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((hex) => (
          <Swatch
            key={hex}
            hex={hex}
            selected={value === hex}
            onClick={() => onChange(value === hex ? undefined : hex)}
          />
        ))}
      </div>
    </div>
  );
}

function CycleButton({
  dir,
  label,
  onClick,
}: {
  dir: 1 | -1;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? `Next ${label}` : `Previous ${label}`}
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
