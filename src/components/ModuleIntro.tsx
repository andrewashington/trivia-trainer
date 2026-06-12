"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { sortedModules } from "@/modules/registry";
import { PixelIcon } from "@/components/icons";
import { Button } from "@/components/ui";

// Accents dark enough to need white label text.
const DARK_ACCENTS = new Set([
  "bg-accent-blue",
  "bg-accent-forest",
  "bg-accent-indigo",
  "bg-accent-magenta",
  "bg-ink",
]);

/**
 * Per-tab onboarding, tour edition: the first visit to a module opens
 * a step-through overlay — a hero slide, then one slide per tip — in
 * the module's accent color. Finishing (or skipping) records the
 * module in User.introsSeen; a floating "?" replays the tour any time.
 */
export function ModuleIntro({ introsSeen }: { introsSeen: string[] }) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [replayOpen, setReplayOpen] = useState(false);
  const [step, setStep] = useState(0);

  const mod = sortedModules().find((m) => pathname.startsWith(m.href));

  // Entering a different module resets the tour position and any replay.
  useEffect(() => {
    setStep(0);
    setReplayOpen(false);
  }, [mod?.key]);

  if (!mod || mod.customIntro) return null;

  const seen = introsSeen.includes(mod.key) || dismissed.includes(mod.key);
  const open = replayOpen || !seen;
  const dark = DARK_ACCENTS.has(mod.accentBg);
  const slides = mod.tips.length + 1; // hero + one per tip
  const last = step === slides - 1;

  function close() {
    setReplayOpen(false);
    setStep(0);
    if (seen) return; // replays don't need recording
    setDismissed((d) => [...d, mod!.key]);
    // Fire-and-forget: a lost request just means the tour shows once more.
    fetch("/api/me/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "intro-seen", module: mod!.key }),
    }).catch(() => {});
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setStep(0);
          setReplayOpen(true);
        }}
        title={`How ${mod.label} works`}
        aria-label={`How ${mod.label} works`}
        className="brutal-press fixed bottom-20 right-4 z-[1000] flex h-10 w-10 items-center justify-center border-3 border-ink bg-accent-yellow font-display text-lg font-bold shadow-brutal md:bottom-6 md:right-6"
      >
        ?
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-ink/50 p-4">
      <div className="brutal-card w-full max-w-md overflow-hidden p-0">
        {/* Accent header */}
        <div
          className={`flex items-center justify-between border-b-3 border-ink px-4 py-2.5 ${mod.accentBg} ${
            dark ? "text-white" : "text-ink"
          }`}
        >
          <span className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider">
            <PixelIcon name={mod.icon} size={16} />
            {seen ? mod.label : `New: ${mod.label}`}
          </span>
          <button onClick={close} aria-label="Skip tour">
            <PixelIcon name="close" size={18} />
          </button>
        </div>

        {/* Slide — keyed by step so each one pops in fresh */}
        <div key={step} className="animate-pop-in px-6 pb-2 pt-6">
          {step === 0 ? (
            <div className="text-center">
              <span
                className={`mx-auto flex h-20 w-20 items-center justify-center border-3 border-ink shadow-brutal ${mod.accentBg} ${
                  dark ? "text-white" : "text-ink"
                }`}
              >
                <PixelIcon name={mod.icon} size={44} />
              </span>
              <h2 className="mt-5 font-display text-2xl font-bold">{mod.label}</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink/70">
                {mod.intro}
              </p>
            </div>
          ) : (
            <div className="min-h-[10rem]">
              <span className="inline-block border-2 border-ink bg-paper px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest shadow-brutal-sm">
                Tip {step} / {mod.tips.length}
              </span>
              <p className="mt-4 font-display text-xl font-bold leading-snug">
                {mod.tips[step - 1]}
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-6 pb-5 pt-3">
          <div className="flex gap-1.5">
            {Array.from({ length: slides }, (_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-2.5 w-2.5 border-2 border-ink ${i === step ? "bg-ink" : "bg-card"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button variant="green" onClick={close}>
                Let&apos;s go
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)}>Next</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
