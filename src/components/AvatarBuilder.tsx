"use client";

import {
  AVATAR_BACKGROUNDS,
  AVATAR_STYLES,
  DICEBEAR_STYLE,
  avatarUrlFromConfig,
  styleOptions,
  type AvatarConfig,
} from "@/lib/avatar";
import { PixelIcon } from "@/components/icons";

/**
 * Make-your-own-avatar builder: live preview, a base-style switcher,
 * and a control for every part the chosen style supports (driven by
 * the generated per-style schemas in src/lib/avatar-options.ts).
 * Each part cycles "random" → (optionally "none") → every value; color
 * palettes render as swatches. Hands a structured {@link AvatarConfig}
 * up to the parent (wizard or profile).
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
  const style = value.style ?? DICEBEAR_STYLE;
  const defs = styleOptions(style);

  const setOption = (key: string, v: string | undefined) => {
    const options = { ...(value.options ?? {}) };
    if (v === undefined) delete options[key];
    else options[key] = v;
    onChange({ ...value, options: Object.keys(options).length ? options : undefined });
  };

  // Reroll the unpinned features by nudging the seed.
  const reroll = () => {
    const base = (value.seed || name || "friend").replace(/~\d+$/, "");
    const n = Number(value.seed.match(/~(\d+)$/)?.[1] ?? 0);
    onChange({ ...value, seed: `${base}~${n + 1}` });
  };

  const cycleStyle = (dir: 1 | -1) => {
    const next = (AVATAR_STYLES.indexOf(style) + dir + AVATAR_STYLES.length) % AVATAR_STYLES.length;
    const nextStyle = AVATAR_STYLES[next];
    // Pins are style-specific; start the new style fresh.
    onChange({
      seed: value.seed,
      style: nextStyle === DICEBEAR_STYLE ? undefined : nextStyle,
      backgroundColor: value.backgroundColor,
    });
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
        <p className="max-w-28 text-center font-mono text-[9px] uppercase leading-snug text-ink/40">
          Reroll shuffles anything left on random
        </p>
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(defs).map(([key, def]) =>
            def.kind === "enum" ? (
              <CycleRow
                key={`${style}:${key}`}
                label={optionLabel(key)}
                options={def.values}
                allowNone={def.hasProbability}
                value={value.options?.[key]}
                onChange={(v) => setOption(key, v)}
              />
            ) : (
              <SwatchRow
                key={`${style}:${key}`}
                label={optionLabel(key)}
                colors={def.values}
                value={value.options?.[key]}
                onChange={(v) => setOption(key, v)}
              />
            )
          )}

          {/* Backdrop applies to every style */}
          <SwatchRow
            label="Backdrop"
            colors={AVATAR_BACKGROUNDS}
            transparentFirst
            value={value.backgroundColor ?? ""}
            onChange={(v) => onChange({ ...value, backgroundColor: v || undefined })}
          />
        </div>
      </div>
    </div>
  );
}

/** "headContrastColor" → "Hair color", "facialHair" → "Facial hair". */
function optionLabel(key: string): string {
  if (key === "headContrastColor") return "Hair color";
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  transparentFirst,
}: {
  label: string;
  colors: readonly string[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  /** Backdrop palette starts with "" = transparent. */
  transparentFirst?: boolean;
}) {
  return (
    <div>
      <span className="brutal-label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((hex) => (
          <Swatch
            key={hex || "none"}
            hex={hex}
            transparent={transparentFirst && hex === ""}
            selected={value === hex}
            onClick={() =>
              onChange(transparentFirst ? hex : value === hex ? undefined : hex)
            }
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
