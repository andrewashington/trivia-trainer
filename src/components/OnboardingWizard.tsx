"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { categories } from "@/modules/registry";
import { defaultAvatarConfig, type AvatarConfig } from "@/lib/avatar";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { PixelIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { Button, Field, Input } from "@/components/ui";

// Accents dark enough to need white label text.
const DARK_ACCENTS = new Set(["bg-accent-blue", "bg-ink"]);

/**
 * The first-login wizard: shown (from the app layout) until the user
 * completes it, which stamps User.onboardedAt. Three beats — welcome,
 * pick your name, meet the four shelves.
 */
export function OnboardingWizard({
  userId,
  initialName,
}: {
  userId: string;
  initialName: string;
}) {
  // Draft state survives reloads/app-switches so the wizard resumes
  // where it left off. Keyed per user so a shared browser never shows
  // someone else's half-typed name. Cleared on completion.
  const DRAFT_KEY = `udm.onboarding.draft.${userId}`;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<AvatarConfig>(() => defaultAvatarConfig(initialName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a draft after mount (not in the initializer — the overlay is
  // server-rendered, and reading localStorage during hydration would
  // mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { step?: number; name?: string; avatar?: AvatarConfig };
      if (typeof draft.step === "number") setStep(Math.min(Math.max(draft.step, 0), 3));
      if (typeof draft.name === "string" && draft.name.trim()) setName(draft.name);
      if (draft.avatar && typeof draft.avatar.seed === "string") setAvatar(draft.avatar);
    } catch {
      // A corrupt draft just means starting from the top.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, name, avatar }));
    } catch {}
  }, [step, name, avatar]);

  async function finish() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/me/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        displayName: name.trim() || undefined,
        avatarConfig: avatar,
      }),
    });
    if (!res.ok) {
      setSaving(false);
      setError("That didn't save — try again?");
      return;
    }
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    router.refresh();
  }

  const steps = [
    <div key="welcome" className="text-center">
      <div className="flex justify-center">
        <Logo size="xl" />
      </div>
      <h2 className="mt-6 font-display text-2xl font-bold">
        Welcome to the home base.
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/70">
        This is the group&apos;s private corner of the internet — the
        persistent stuff the chat is bad at. Invite-only, no algorithm,
        no ads, no strangers. Just us.
      </p>
    </div>,

    <div key="name">
      <h2 className="font-display text-2xl font-bold">What should we call you?</h2>
      <p className="mt-2 text-sm text-ink/70">
        This is the name everyone sees — on recipes, RSVPs, bets, all of it.
      </p>
      <div className="mt-4">
        <Field label="Display name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </Field>
      </div>
    </div>,

    <div key="avatar">
      <h2 className="font-display text-2xl font-bold">Make your peep.</h2>
      <p className="mt-2 text-sm text-ink/70">
        We drew you a face. It shows up on everything you do here —
        tweak the hair, skin tone, and backdrop, or reroll for a fresh one.
      </p>
      <div className="mt-4">
        <AvatarBuilder name={name} value={avatar} onChange={setAvatar} />
      </div>
    </div>,

    <div key="shelves">
      <h2 className="font-display text-2xl font-bold">Everything lives on four shelves.</h2>
      <p className="mt-2 text-sm text-ink/70">
        Find them in the sidebar — or the bottom tabs on your phone.
      </p>
      <div className="mt-4 space-y-2">
        {categories.map((cat) => (
          <div key={cat.key} className="flex items-center gap-3 border-2 border-ink bg-paper p-2.5 shadow-brutal-sm">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink ${cat.accentBg} ${
                DARK_ACCENTS.has(cat.accentBg) ? "text-white" : "text-ink"
              }`}
            >
              <PixelIcon name={cat.icon} size={20} />
            </span>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wider">
                {cat.label}
              </p>
              <p className="font-mono text-[10px] uppercase text-ink/50">{cat.tagline}</p>
            </div>
          </div>
        ))}
      </div>
    </div>,
  ];

  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-paper/95 p-4">
      <div className="brutal-card w-full max-w-md p-6 sm:p-8">
        {steps[step]}

        {error && (
          <p className="mt-4 border-2 border-ink bg-accent-red px-3 py-2 font-mono text-xs font-bold uppercase text-white">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 border-2 border-ink ${i === step ? "bg-ink" : "bg-card"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                Back
              </Button>
            )}
            {last ? (
              <Button onClick={finish} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Let's go"}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  // Arriving at the avatar step: seed the face off the
                  // name they just typed, unless they've already rerolled
                  // or customized it (seed no longer matches the name).
                  if (step === 1 && avatar.seed === defaultAvatarConfig(initialName).seed) {
                    setAvatar((a) => ({ ...a, seed: name.trim() || "friend" }));
                  }
                  setStep(step + 1);
                }}
                disabled={step === 1 && !name.trim()}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
