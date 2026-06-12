"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * The beta terms gate — shown by /world until the user accepts (stored
 * as introsSeen "world", which also stops the nav glow). Legally
 * binding in spirit only.
 */
const CLAUSES = [
  {
    n: "1",
    t: "This is a beta.",
    d: "The World is brand new and under active construction. If a tree is floating, the tree is floating on purpose (it is not).",
  },
  {
    n: "2",
    t: "Your coins are now in danger.",
    d: "There is a shop. It sells outfits. They cost the coins you've been hoarding. This is the entire economic model and we're proud of it.",
  },
  {
    n: "3",
    t: "It's for fun.",
    d: "Walk around, find your friends' ghosts wandering about, talk to the shopkeep (he's lonely). There are no objectives. Touching grass counts.",
  },
  {
    n: "4",
    t: "Complaints are content.",
    d: "Found a bug? Have an idea? Put it in Ideas or yell at management. Beta testers who report things get... the warm glow of civic duty.",
  },
];

export function WorldBetaTerms() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      await fetch("/api/me/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "intro-seen", module: "world" }),
      });
    } catch {}
    router.refresh(); // server now passes the gate → avatar setup / world
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="animate-pop-in border-3 border-ink bg-card shadow-brutal-lg">
        <div className="relative overflow-hidden border-b-3 border-ink bg-accent-meadow p-5 text-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <p className="animate-float text-4xl">🌍</p>
          <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-tight">
            The World
          </h1>
          <p className="mx-auto mt-1 inline-block -rotate-1 border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-white">
            open beta · terms of enjoyment
          </p>
        </div>

        <div className="space-y-3 p-5">
          {CLAUSES.map((c, i) => (
            <div
              key={c.n}
              className="animate-drop-in border-2 border-ink p-3"
              style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}
            >
              <p className="text-sm font-black">
                <span className="mr-2 inline-block border border-ink bg-accent-yellow px-1.5 font-mono text-[10px]">
                  §{c.n}
                </span>
                {c.t}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/70">{c.d}</p>
            </div>
          ))}

          <div className="pt-2 text-center">
            <Button type="button" variant="green" disabled={busy} onClick={accept} className="!px-6 !py-3 !text-base">
              {busy ? "Notarizing…" : "I agree to have fun"}
            </Button>
            <p className="mt-2 font-mono text-[10px] text-ink/40">
              by clicking you waive nothing and gain a small video game
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
