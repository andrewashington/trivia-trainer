"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst, confettiCelebrate } from "@/lib/confetti";
import { playSfx } from "@/lib/sfx";
import { Button, Card, EmptyState } from "@/components/ui";
import { MIN_BET } from "@/modules/arcade/constants";
import { SYMBOLS } from "@/modules/slots/engine";
import type { SlotsSpinResult } from "@/modules/slots/schema";

const BET_PRESETS = [10, 25, 50, 100, 250];
const GLYPHS = SYMBOLS.map((s) => s.glyph);

/** Per-reel stop delay (ms) — left-to-right stagger. */
const STOP_DELAYS = [600, 950, 1300];
const SPIN_TICK_MS = 70;

type HistoryEntry = {
  reels: [number, number, number];
  multiplier: number;
  winnings: number;
  jackpot: boolean;
};

type WinTier = "loss" | "small" | "big" | "jackpot";

function tierFor(r: { multiplier: number; jackpot: boolean }): WinTier {
  if (r.jackpot) return "jackpot";
  if (r.multiplier === 0) return "loss";
  if (r.multiplier >= 40) return "big";
  return "small";
}

const LOSS_LINES = [
  "The machine ate it. Try again.",
  "Nothing lines up. The void is hungry.",
  "So close. Not really, but it's nicer to say.",
  "The reels conspired against you.",
];

function lossLine(seed: number): string {
  return LOSS_LINES[seed % LOSS_LINES.length];
}

function bannerFor(r: SlotsSpinResult): { text: string; cls: string } {
  if (r.jackpot) return { text: "👑👑👑 ABSOLUTE UNIT", cls: "slots-rainbow-text" };
  if (r.multiplier >= 40) return { text: `MASSIVE +${r.winnings}`, cls: "bg-accent-yellow text-ink" };
  if (r.multiplier > 0) return { text: `WIN +${r.winnings}`, cls: "bg-accent-slot text-white" };
  return { text: `−${Math.abs(r.net)}`, cls: "bg-ink text-white" };
}

function historyChipClass(h: HistoryEntry): string {
  if (h.jackpot) return "slots-rainbow-chip text-white";
  if (h.multiplier >= 40) return "bg-accent-yellow text-ink";
  if (h.multiplier > 0) return "bg-accent-slot/85 text-white";
  return "bg-ink/80 text-white";
}

function Reel({
  spinning,
  glyph,
  flash,
}: {
  spinning: boolean;
  glyph: string;
  flash: boolean;
}) {
  return (
    <div
      className={`relative flex h-24 w-full items-center justify-center overflow-hidden border-3 border-ink bg-paper ${
        flash ? "slots-reel-flash" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/15 via-transparent to-ink/15" />
      <span
        className={`select-none leading-none ${
          spinning ? "slots-reel-spin text-4xl blur-[1px]" : "text-5xl"
        }`}
      >
        {glyph}
      </span>
    </div>
  );
}

export function SlotsGame({ initialCoins }: { initialCoins: number }) {
  const router = useRouter();
  const [bet, setBet] = useState(10);
  const [coins, setCoins] = useState(initialCoins);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SlotsSpinResult | null>(null);
  const [settled, setSettled] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [jackpotShow, setJackpotShow] = useState(false);

  // Per-reel display state.
  const [reelGlyphs, setReelGlyphs] = useState<[string, string, string]>([
    GLYPHS[0],
    GLYPHS[1],
    GLYPHS[2],
  ]);
  const [spinning, setSpinning] = useState<[boolean, boolean, boolean]>([false, false, false]);

  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const settle = useCallback(
    (data: SlotsSpinResult) => {
      setSettled(true);
      setCoins(data.coins);
      setHistory((h) =>
        [{ reels: data.reels, multiplier: data.multiplier, winnings: data.winnings, jackpot: data.jackpot }, ...h].slice(0, 10)
      );

      if (data.jackpot) {
        setJackpotShow(true);
        confettiCelebrate(); // plays fanfare
        const t = setTimeout(() => setJackpotShow(false), 4200);
        timeoutsRef.current.push(t);
      } else if (data.multiplier >= 40) {
        confettiCelebrate();
      } else if (data.multiplier > 0) {
        confettiBurst(); // plays win
      } else {
        playSfx("lose");
      }
      router.refresh();
    },
    [router]
  );

  const play = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setSettled(false);
    setJackpotShow(false);
    setSpinning([true, true, true]);
    playSfx("blip");

    // Cycle glyphs on spinning reels for the slot-machine churn.
    cycleRef.current = setInterval(() => {
      setReelGlyphs((prev) => {
        const next = [...prev] as [string, string, string];
        for (let i = 0; i < 3; i++) {
          next[i] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        return next;
      });
    }, SPIN_TICK_MS);

    try {
      const data = await api<SlotsSpinResult>("/api/slots", {
        method: "POST",
        body: { bet },
      });
      setResult(data);

      // Stop reels left-to-right with staggered timing, snapping each to its
      // final symbol.
      STOP_DELAYS.forEach((delay, i) => {
        const t = setTimeout(() => {
          setReelGlyphs((prev) => {
            const next = [...prev] as [string, string, string];
            next[i] = GLYPHS[data.reels[i]];
            return next;
          });
          setSpinning((prev) => {
            const next = [...prev] as [boolean, boolean, boolean];
            next[i] = false;
            return next;
          });
          playSfx("chirp");
          if (i === 2) {
            if (cycleRef.current) clearInterval(cycleRef.current);
            cycleRef.current = null;
            settle(data);
            setBusy(false);
          }
        }, delay);
        timeoutsRef.current.push(t);
      });
    } catch (e) {
      if (cycleRef.current) clearInterval(cycleRef.current);
      cycleRef.current = null;
      setSpinning([false, false, false]);
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }, [busy, bet, settle]);

  const broke = coins < MIN_BET;
  const canPlay = !busy && bet >= MIN_BET && bet <= coins;
  const banner = settled && result ? bannerFor(result) : null;
  const winFlash = settled && result !== null && result.multiplier > 0;

  if (broke) {
    return (
      <Card>
        <EmptyState
          icon="sparkles"
          title="The lever won't budge"
          hint="You're flat broke. The one-armed bandit has standards — go earn some coins and come back to feed it."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <style>{CSS}</style>

      <Card className="relative space-y-5 overflow-hidden">
        {jackpotShow && <JackpotOverlay />}

        {/* Reels */}
        <div className="relative grid grid-cols-3 gap-2 border-3 border-ink bg-ink p-2">
          {/* payline */}
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 -translate-y-1/2 border-t-2 border-dashed border-accent-slot/70" />
          {[0, 1, 2].map((i) => (
            <Reel key={i} spinning={spinning[i]} glyph={reelGlyphs[i]} flash={winFlash && !spinning[i]} />
          ))}
        </div>

        {/* Result banner */}
        <div className="flex min-h-[2.5rem] items-center justify-center">
          {banner ? (
            <span
              className={`animate-stamp-in border-2 border-ink px-4 py-1 font-display text-lg font-bold uppercase tracking-widest shadow-brutal-sm ${banner.cls}`}
            >
              {banner.text}
            </span>
          ) : (
            <span className="font-mono text-xs uppercase tracking-widest text-ink/35">
              {busy ? "spinning…" : "pull the lever"}
            </span>
          )}
        </div>

        {result && settled && result.multiplier === 0 && (
          <p className="text-center font-mono text-xs text-ink/55">{lossLine(history.length)}</p>
        )}

        {/* Bet presets */}
        <div className="space-y-2">
          <p className="brutal-label text-[10px]">Bet</p>
          <div className="flex flex-wrap gap-1.5">
            {BET_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy || p > coins}
                onClick={() => setBet(p)}
                className={`border-2 border-ink px-3 py-1 font-mono text-sm font-bold shadow-brutal-sm transition disabled:opacity-30 ${
                  bet === p ? "bg-accent-slot text-white" : "bg-paper text-ink hover:bg-accent-slot/15"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || coins < MIN_BET}
              onClick={() => setBet(coins)}
              className={`border-2 border-ink px-3 py-1 font-mono text-sm font-bold shadow-brutal-sm transition disabled:opacity-30 ${
                bet === coins ? "bg-ink text-white" : "bg-paper text-ink hover:bg-ink/10"
              }`}
            >
              All in
            </button>
          </div>
        </div>

        {/* Spin button */}
        <Button onClick={play} disabled={!canPlay} className="w-full bg-accent-slot text-white">
          {busy ? "Spinning…" : `Spin — ${bet} coins`}
        </Button>

        {!canPlay && !busy && bet > coins && (
          <p className="font-mono text-xs text-accent-red">Not enough coins for that bet.</p>
        )}

        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">{error}</p>
        )}

        <p className="text-right font-mono text-xs text-ink/50">balance {coins}</p>
        <p className="font-mono text-[10px] uppercase text-ink/35">
          Three of a kind pays · two 🍒 pays small · 👑👑👑 = 225× jackpot
        </p>
      </Card>

      {/* Paytable */}
      <Card className="space-y-2">
        <p className="brutal-label text-[10px]">Paytable</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {SYMBOLS.map((s) => (
            <div key={s.id} className="flex items-center justify-between font-mono text-sm">
              <span className="text-lg">
                {s.glyph}
                {s.glyph}
                {s.glyph}
              </span>
              <span className="font-bold">{s.triple}×</span>
            </div>
          ))}
          <div className="flex items-center justify-between font-mono text-sm">
            <span className="text-lg">🍒🍒·</span>
            <span className="font-bold">2×</span>
          </div>
        </div>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="space-y-2">
          <p className="brutal-label text-[10px]">Recent spins</p>
          <div className="flex flex-wrap gap-1.5">
            {history.map((h, i) => (
              <span
                key={`${i}-${h.reels.join("")}`}
                className={`border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm ${historyChipClass(h)} ${
                  i === 0 ? "animate-pop-in" : ""
                }`}
                title={h.multiplier > 0 ? `${h.multiplier}× · +${h.winnings}` : "no win"}
              >
                {h.reels.map((r) => GLYPHS[r]).join("")}
                {h.multiplier > 0 ? ` ${h.multiplier}×` : ""}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function JackpotOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden" aria-hidden>
      <div className="slots-jackpot-glow absolute inset-0" />
      {["👑", "👑", "👑", "✦", "✧", "👑", "✦", "✧"].map((g, i) => (
        <span key={i} className={`slots-crown slots-crown-${i + 1} absolute text-3xl`}>
          {g}
        </span>
      ))}
      <span className="slots-rainbow-text relative font-display text-3xl font-black uppercase tracking-widest">
        JACKPOT
      </span>
    </div>
  );
}

const CSS = `
@keyframes slots-spin-cycle {
  0% { transform: translateY(-6%); }
  100% { transform: translateY(6%); }
}
.slots-reel-spin {
  animation: slots-spin-cycle 0.12s linear infinite alternate;
}
@keyframes slots-flash {
  0%, 100% { background-color: var(--tw-bg, transparent); }
  50% { background-color: #FFE600; }
}
.slots-reel-flash {
  animation: slots-flash 0.5s ease-in-out 2;
}
@keyframes slots-rainbow {
  0% { color: #ff004d; }
  20% { color: #ff8800; }
  40% { color: #ffe600; }
  60% { color: #00e676; }
  80% { color: #2979ff; }
  100% { color: #d500f9; }
}
.slots-rainbow-text {
  animation: slots-rainbow 1s linear infinite;
  -webkit-text-stroke: 1px #111;
}
.slots-rainbow-chip {
  background: linear-gradient(90deg,#ff004d,#ff8800,#ffe600,#00e676,#2979ff,#d500f9);
  background-size: 300% 100%;
  animation: slots-chip-pan 1.5s linear infinite;
}
@keyframes slots-chip-pan {
  0% { background-position: 0% 0; }
  100% { background-position: 300% 0; }
}
@keyframes slots-glow-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.55; }
}
.slots-jackpot-glow {
  background: radial-gradient(circle at center, rgba(255,31,143,0.6), transparent 70%);
  animation: slots-glow-pulse 0.8s ease-in-out infinite;
}
@keyframes slots-crown-fall {
  0% { transform: translateY(-120%) rotate(0deg); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(420%) rotate(360deg); opacity: 0; }
}
.slots-crown { top: 0; animation: slots-crown-fall 2.4s ease-in infinite; }
.slots-crown-1 { left: 8%; animation-delay: 0s; }
.slots-crown-2 { left: 22%; animation-delay: 0.3s; }
.slots-crown-3 { left: 38%; animation-delay: 0.1s; }
.slots-crown-4 { left: 52%; animation-delay: 0.5s; }
.slots-crown-5 { left: 66%; animation-delay: 0.2s; }
.slots-crown-6 { left: 80%; animation-delay: 0.4s; }
.slots-crown-7 { left: 92%; animation-delay: 0.15s; }
.slots-crown-8 { left: 15%; animation-delay: 0.6s; }
@media (prefers-reduced-motion: reduce) {
  .slots-reel-spin, .slots-reel-flash, .slots-rainbow-text, .slots-rainbow-chip,
  .slots-jackpot-glow, .slots-crown { animation: none; }
}
`;
