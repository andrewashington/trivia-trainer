"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { OptionArt } from "./art";
import { KeyCodeDisplay, KeyLegend } from "./KeyCodeDisplay";
import {
  CURVE_INTENSITIES,
  CURVE_LATERALS,
  CURVE_VERTICALS,
  FORESKIN_STATUSES,
  GIRTH_MM,
  GLANS_SHAPES,
  LENGTH_MM,
  OPTION_SUBTITLES,
  OPTION_TITLES,
  PUBIC_HAIR,
  SHAFT_PROFILES,
  VEIN_VISIBILITY,
  inchBand,
} from "./schema";

export type KeyFormInitial = {
  lengthMm: number | null;
  girthMm: number | null;
  glansShape: string | null;
  shaftProfile: string | null;
  foreskinStatus: string | null;
  pubicHair: string | null;
  veinVisibility: string | null;
  curveVertical: string | null;
  curveLateral: string | null;
  curveIntensity: string | null;
  visibility: string;
  keyCode: string | null;
  archetypeLabel: string | null;
  archetypeBlurb: string | null;
} | null;

/** Eggplant-and-gold volley for a freshly filed card. No sound. */
async function keyfetti(): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#7B2FBE", "#FFD60A", "#101010", "#FFFFFF"];
  void confetti({ particleCount: 80, spread: 75, origin: { y: 0.7 }, colors });
  setTimeout(
    () => void confetti({ particleCount: 40, spread: 110, origin: { y: 0.6 }, colors }),
    250
  );
}

/** A picker of diagram cards. */
function CardPicker({
  legend,
  hint,
  field,
  options,
  titles,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  field: string;
  options: readonly string[];
  titles: Record<string, string>;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <fieldset>
      <legend className="brutal-label">{legend}</legend>
      {hint && (
        <p className="-mt-1 mb-2 font-mono text-[10px] uppercase tracking-wide text-ink/40">
          {hint}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt;
          const subtitle = (OPTION_SUBTITLES as Record<string, Record<string, string>>)[
            field
          ]?.[opt];
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active ? null : opt)}
              aria-pressed={active}
              className={`brutal-press flex w-[96px] flex-col items-center gap-1 border-2 border-ink p-2 text-center shadow-brutal-sm ${
                active ? "bg-accent-eggplant text-white" : "bg-card text-ink"
              }`}
            >
              <OptionArt field={field} value={opt} />
              <span className="text-[11px] font-bold leading-tight">{titles[opt]}</span>
              {subtitle && (
                <span
                  className={`font-mono text-[9px] uppercase leading-tight ${
                    active ? "text-white/70" : "text-ink/45"
                  }`}
                >
                  {subtitle}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Field-guide scale: everyday objects by circumference, so the
 * wrap-around number means something while you drag. Rough on purpose.
 */
const GIRTH_LANDMARKS: [number, string][] = [
  [50, "a Sharpie marker"],
  [63, "a highlighter"],
  [75, "a wine cork"],
  [88, "a broom handle"],
  [100, "a garden hose"],
  [113, "a kosher dill pickle"],
  [126, "a cucumber"],
  [140, "a toilet-paper tube"],
  [155, "a flashlight handle"],
  [168, "a Red Bull can"],
  [182, "a billiard ball"],
  [196, "a peanut butter jar lid"],
  [210, "a Coke can"],
  [229, "a baseball"],
];

function girthLandmark(mm: number): string {
  let best = GIRTH_LANDMARKS[0];
  for (const lm of GIRTH_LANDMARKS) {
    if (Math.abs(lm[0] - mm) < Math.abs(best[0] - mm)) best = lm;
  }
  const [target, label] = best;
  if (mm > target + 6) return `a bit thicker than ${label}`;
  if (mm < target - 6) return `not quite ${label}`;
  return `about ${label} around`;
}

/** Slider in half-inches; canonical millimetres under the hood. */
function InchSlider({
  legend,
  hint,
  minMm,
  maxMm,
  value,
  onChange,
  landmark,
}: {
  legend: string;
  hint: string;
  minMm: number;
  maxMm: number;
  value: number;
  onChange: (mm: number) => void;
  /** Optional live comparison line rendered under the slider. */
  landmark?: (mm: number) => string;
}) {
  const minIn = Math.ceil((minMm / 25.4) * 2) / 2;
  const maxIn = Math.floor((maxMm / 25.4) * 2) / 2;
  const inches = Math.min(maxIn, Math.max(minIn, Math.round((value / 25.4) * 2) / 2));
  const atTop = inches >= maxIn;
  return (
    <fieldset>
      <legend className="brutal-label">{legend}</legend>
      <p className="-mt-1 mb-2 font-mono text-[10px] uppercase tracking-wide text-ink/40">
        {hint}
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={minIn}
          max={maxIn}
          step={0.5}
          value={inches}
          onChange={(e) => onChange(Math.round(Number(e.target.value) * 25.4))}
          className="w-full max-w-xs accent-accent-eggplant"
        />
        <span className="whitespace-nowrap border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm">
          {atTop ? `${maxIn}+"` : `${inches}"`} · {atTop ? `${maxIn}+ inches` : inchBand(value)}
        </span>
      </div>
      {landmark && (
        <p className="mt-2 inline-flex items-center gap-1.5 border-2 border-ink bg-paper px-2 py-1 font-mono text-[11px] font-bold">
          <PixelIcon name="arrows-horizontal" size={13} /> {landmark(value)}
        </p>
      )}
    </fieldset>
  );
}

export function KeyQuizForm({ initial }: { initial: KeyFormInitial }) {
  const router = useRouter();
  // Clamp loaded values: cards saved before the scale narrowed to 9+
  // may sit above today's ceiling.
  const [lengthMm, setLengthMm] = useState<number>(
    Math.min(initial?.lengthMm ?? 152, LENGTH_MM.max)
  );
  const [girthMm, setGirthMm] = useState<number>(
    Math.min(initial?.girthMm ?? 121, GIRTH_MM.max)
  );
  const [glansShape, setGlansShape] = useState(initial?.glansShape ?? null);
  const [shaftProfile, setShaftProfile] = useState(initial?.shaftProfile ?? null);
  const [foreskinStatus, setForeskinStatus] = useState(initial?.foreskinStatus ?? null);
  const [pubicHair, setPubicHair] = useState(initial?.pubicHair ?? null);
  const [veinVisibility, setVeinVisibility] = useState(initial?.veinVisibility ?? null);
  const [curveVertical, setCurveVerticalRaw] = useState(initial?.curveVertical ?? null);
  const [curveLateral, setCurveLateralRaw] = useState(initial?.curveLateral ?? null);
  const [curveIntensity, setCurveIntensityRaw] = useState(initial?.curveIntensity ?? null);
  const [showOnProfile, setShowOnProfile] = useState(initial?.visibility !== "concealed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyCode, setKeyCode] = useState<string | null>(initial?.keyCode ?? null);
  const [bounty, setBounty] = useState(0);
  const [copied, setCopied] = useState(false);
  const [archetype, setArchetype] = useState<{ label: string; blurb: string } | null>(
    initial?.archetypeLabel
      ? { label: initial.archetypeLabel, blurb: initial.archetypeBlurb ?? "" }
      : null
  );

  // Coherence: straight on BOTH axes means no bend amount, and a "none"
  // intensity means straight on both axes.
  const isStraight = (v: string | null) => v === null || v === "straight";
  function setCurveVertical(v: string | null) {
    setCurveVerticalRaw(v);
    if (v === "straight" && isStraight(curveLateral)) setCurveIntensityRaw("straight");
    else if (v && v !== "straight" && curveIntensity === "straight")
      setCurveIntensityRaw(null);
  }
  function setCurveLateral(v: string | null) {
    setCurveLateralRaw(v);
    if (v === "straight" && isStraight(curveVertical)) setCurveIntensityRaw("straight");
    else if (v && v !== "straight" && curveIntensity === "straight")
      setCurveIntensityRaw(null);
  }
  function setCurveIntensity(v: string | null) {
    setCurveIntensityRaw(v);
    if (v === "straight") {
      setCurveVerticalRaw("straight");
      setCurveLateralRaw("straight");
    }
  }

  // A card is all-or-nothing: every picker must have an answer before
  // filing (the sliders always carry a value).
  const unanswered = [
    glansShape,
    shaftProfile,
    foreskinStatus,
    pubicHair,
    veinVisibility,
    curveVertical,
    curveLateral,
    curveIntensity,
  ].filter((v) => v === null).length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        archetype: { label: string; blurb: string };
        keyCode: string;
        bounty: number;
      }>("/api/key", {
        method: "POST",
        body: {
          lengthMm,
          girthMm,
          glansShape,
          shaftProfile,
          foreskinStatus,
          pubicHair,
          veinVisibility,
          curveVertical,
          curveLateral,
          curveIntensity,
          visibility: showOnProfile ? "group" : "concealed",
        },
      });
      setArchetype(res.archetype);
      setKeyCode(res.keyCode);
      setBounty(res.bounty);
      void keyfetti();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lab rejected that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <InchSlider
        legend="H. Length"
        hint="Ballpark is fine — slide, don't stress. Nobody's bringing a ruler."
        minMm={LENGTH_MM.min}
        maxMm={LENGTH_MM.max}
        value={lengthMm}
        onChange={setLengthMm}
      />
      <InchSlider
        legend="I. Circumference"
        hint="The wrap-around number, at the widest point."
        minMm={GIRTH_MM.min}
        maxMm={GIRTH_MM.max}
        value={girthMm}
        onChange={setGirthMm}
        landmark={girthLandmark}
      />

      <CardPicker
        legend="A. Head shape"
        hint="Pick by picture — pure variety, no rankings here."
        field="glansShape"
        options={GLANS_SHAPES}
        titles={OPTION_TITLES.glansShape}
        value={glansShape}
        onChange={setGlansShape}
      />
      <CardPicker
        legend="C. Shaft profile"
        hint="Where the thickness lives."
        field="shaftProfile"
        options={SHAFT_PROFILES}
        titles={OPTION_TITLES.shaftProfile}
        value={shaftProfile}
        onChange={setShaftProfile}
      />
      <CardPicker
        legend="G. Hood status"
        hint="Describes a state, ranks nothing."
        field="foreskinStatus"
        options={FORESKIN_STATUSES}
        titles={OPTION_TITLES.foreskinStatus}
        value={foreskinStatus}
        onChange={setForeskinStatus}
      />
      <CardPicker
        legend="D. Groundskeeping"
        hint="Grooming, not grading."
        field="pubicHair"
        options={PUBIC_HAIR}
        titles={OPTION_TITLES.pubicHair}
        value={pubicHair}
        onChange={setPubicHair}
      />
      <CardPicker
        legend="E. Vein situation"
        hint="Smooth through scenic-route."
        field="veinVisibility"
        options={VEIN_VISIBILITY}
        titles={OPTION_TITLES.veinVisibility}
        value={veinVisibility}
        onChange={setVeinVisibility}
      />
      <CardPicker
        legend="F1. Curve — up or down"
        hint="The vertical axis, viewed from the side."
        field="curveVertical"
        options={CURVE_VERTICALS}
        titles={OPTION_TITLES.curveVertical}
        value={curveVertical}
        onChange={setCurveVertical}
      />
      <CardPicker
        legend="F2. Curve — left or right"
        hint="The lateral axis. Both at once is a real thing — own it."
        field="curveLateral"
        options={CURVE_LATERALS}
        titles={OPTION_TITLES.curveLateral}
        value={curveLateral}
        onChange={setCurveLateral}
      />
      <CardPicker
        legend="J. Curve — how much"
        hint="Total bend, whatever the direction."
        field="curveIntensity"
        options={CURVE_INTENSITIES}
        titles={OPTION_TITLES.curveIntensity}
        value={curveIntensity}
        onChange={setCurveIntensity}
      />

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={showOnProfile}
          onChange={(e) => setShowOnProfile(e.target.checked)}
          className="h-4 w-4 accent-accent-eggplant"
        />
        <span className="text-sm font-bold">Show my key string on my profile</span>
        <span className="font-mono text-[10px] uppercase text-ink/40">
          just the code — never the answers
        </span>
      </label>
      <p className="-mt-3 font-mono text-[10px] uppercase tracking-wide text-ink/40">
        Filing is hush-hush (no Discord, no feed) — and the code only means
        something to people who&apos;ve filed one of their own.
      </p>

      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="yellow"
        disabled={busy || unanswered > 0}
        className="w-full"
      >
        {busy
          ? "Consulting the chart…"
          : unanswered > 0
            ? `Answer everything to file — ${unanswered} to go`
            : initial
              ? "Update my card"
              : "File my card"}
      </Button>

      {bounty > 0 && (
        <p className="flex items-center justify-center gap-1.5 border-2 border-ink bg-accent-yellow px-3 py-2 text-center font-display text-sm font-bold shadow-brutal-sm">
          <PixelIcon name="money" size={15} /> Bounty claimed — +{bounty} coins for finding
          the secret quiz
        </p>
      )}

      {archetype && (
        <div className="brutal-card -rotate-1 bg-accent-eggplant p-4 text-white">
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-70">
            The chart has spoken
          </p>
          <p className="font-display text-2xl font-bold">{archetype.label}</p>
          {archetype.blurb && <p className="mt-1 text-sm">{archetype.blurb}</p>}
          {keyCode && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-white/30 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                your key
              </span>
              <KeyCodeDisplay code={keyCode} />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(keyCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="brutal-press border-2 border-white/60 px-2 py-1 font-mono text-xs font-bold"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
              <KeyLegend className="w-full opacity-60" />
            </div>
          )}
        </div>
      )}
    </form>
  );
}
