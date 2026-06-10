"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Badge, Button, Input } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { LottiePet } from "./LottiePet";
import { MOOD_LABEL, STAGE_TITLE, type PetMood } from "./engine";
import type { PetFace } from "./animations";

type Burst = { id: number; left: number; delay: number; size: number };

export function PetStage({
  name,
  mood,
  moodLine,
  moodBg,
  canNudge,
  stage,
  beloved,
  partOfDay,
}: {
  name: string;
  mood: PetMood;
  moodLine: string;
  moodBg: string;
  canNudge: boolean;
  stage: number;
  beloved: boolean;
  partOfDay: "day" | "night";
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [patted, setPatted] = useState(false);
  const [ecstatic, setEcstatic] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const burstId = useRef(0);
  const ecstaticTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (ecstaticTimer.current !== null) window.clearTimeout(ecstaticTimer.current);
    },
    []
  );

  function celebrate() {
    setEcstatic(true);
    if (ecstaticTimer.current !== null) window.clearTimeout(ecstaticTimer.current);
    ecstaticTimer.current = window.setTimeout(() => setEcstatic(false), 1500);
    const next: Burst[] = Array.from({ length: 6 }, () => ({
      id: burstId.current++,
      left: 18 + Math.random() * 64,
      delay: Math.random() * 0.2,
      size: 14 + Math.random() * 10,
    }));
    setBursts(next);
    window.setTimeout(() => setBursts([]), 900);
  }

  async function pat() {
    setBusy(true);
    try {
      await api("/api/pet/nudge", { method: "POST" });
      setPatted(true);
      playSfx("chirp");
      celebrate();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Pat failed?!");
    } finally {
      setBusy(false);
    }
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/pet", { method: "PATCH", body: { name: newName } });
      setRenaming(false);
      setSuggestions([]);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const { names } = await api<{ names: string[] }>("/api/pet/names");
      setSuggestions(names);
    } catch {
      // suggestions are sugar — fail quietly
    } finally {
      setSuggesting(false);
    }
  }

  const isNight = partOfDay === "night";
  const face: PetFace = ecstatic ? "ecstatic" : mood;

  return (
    <div className="space-y-3">
      {/* The habitat + creature */}
      <div className={`brutal-card relative flex flex-col items-center gap-3 overflow-hidden p-8 ${moodBg}`}>
        {/* sky body: sun by day, moon + stars by night */}
        {isNight ? (
          <>
            <span className="absolute right-5 top-4 text-ink/70">
              <PixelIcon name="moon" size={26} />
            </span>
            <span className="absolute left-8 top-6 animate-sparkle text-ink/40">
              <PixelIcon name="sparkles" size={12} />
            </span>
            <span
              className="absolute right-16 top-9 animate-sparkle text-ink/40"
              style={{ animationDelay: "0.7s" }}
            >
              <PixelIcon name="sparkles" size={9} />
            </span>
          </>
        ) : (
          <span className="absolute right-4 top-3 h-7 w-7 rounded-full border-3 border-ink bg-accent-yellow shadow-brutal-sm" />
        )}

        {/* pat hearts */}
        <div className="pointer-events-none absolute inset-0">
          {bursts.map((b) => (
            <span
              key={b.id}
              className="absolute bottom-16 animate-pat-burst text-accent-red"
              style={{ left: `${b.left}%`, animationDelay: `${b.delay}s` }}
            >
              <PixelIcon name="heart" size={b.size} />
            </span>
          ))}
        </div>

        <LottiePet face={face} size={200} />
        {/* the ground the pet stands on */}
        <div className="h-[3px] w-32 bg-ink/80" />

        <p className="text-center font-display text-xl font-bold">
          {name} {moodLine}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge className="bg-card">{MOOD_LABEL[mood]}</Badge>
          <Badge className="bg-card">
            {STAGE_TITLE[stage]}
            {beloved ? " · beloved" : ""}
          </Badge>
        </div>
      </div>

      {/* actions */}
      {renaming ? (
        <div className="space-y-2">
          <form onSubmit={rename} className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} required />
            <Button
              type="button"
              variant="ghost"
              onClick={suggest}
              disabled={suggesting}
              className="shrink-0"
              title="Suggest a name"
            >
              <PixelIcon name={suggesting ? "loader" : "sparkles"} size={16} />
            </Button>
            <Button type="submit" disabled={busy} className="shrink-0">
              {busy ? "…" : "Name it"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRenaming(false);
                setSuggestions([]);
              }}
              className="shrink-0"
            >
              ✕
            </Button>
          </form>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewName(s)}
                  className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs uppercase shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="yellow" onClick={pat} disabled={busy || !canNudge || patted} className="flex-1">
            <span className="inline-flex items-center gap-2">
              <PixelIcon name="hand" size={16} />
              {patted || !canNudge ? "Patted today ✓" : "Pat the pet"}
            </span>
          </Button>
          <Button variant="ghost" onClick={() => setRenaming(true)} className="shrink-0">
            Rename
          </Button>
        </div>
      )}
    </div>
  );
}
