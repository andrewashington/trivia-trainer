"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { GameChat } from "@/modules/gamechat/GameChat";
import { playSfx } from "@/lib/sfx";
import { confettiCelebrate } from "@/lib/confetti";
import { PlayingCard } from "./PlayingCard";
import { CATEGORY_NAMES } from "./evaluate";
import type { TableView, HandView } from "./server";

const POLL_MS = 2500;
const MAX_SEATS = 9;

function fmt(n: number): string {
  return n.toLocaleString();
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, deadline - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return <span className="font-mono tabular-nums">{ms <= 0 ? "time's up" : label}</span>;
}

export function PokerTableView({ initial, meId }: { initial: TableView; meId: string }) {
  const [table, setTable] = useState<TableView>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyIn, setBuyIn] = useState(Math.max(initial.bigBlind * 50, initial.bigBlind));
  const [raiseTo, setRaiseTo] = useState(0);
  const lastHandRef = useRef<string | null>(initial.hand?.id ?? null);
  const lastResultRef = useRef<string | null>(null);

  const seated = table.seats.find((s) => s.userId === meId);
  const hand = table.hand;
  const myMoves = hand?.myMoves ?? null;
  const myTurn = !!myMoves;

  const poll = useCallback(async () => {
    try {
      const res = await api<{ table: TableView }>(`/api/poker/${table.id}`);
      setTable(res.table);
    } catch {
      /* transient */
    }
  }, [table.id]);

  useEffect(() => {
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // SFX/confetti when a completed hand result arrives and I won.
  useEffect(() => {
    const h = table.hand;
    if (h?.status === "complete" && h.result && lastResultRef.current !== h.id) {
      lastResultRef.current = h.id;
      const myAward = h.result.awards.find(
        (a) => h.seats.find((s) => s.seatIndex === a.seatIndex)?.userId === meId
      );
      if (myAward && myAward.amount > 0) {
        confettiCelebrate();
      }
    }
    if (h && h.id !== lastHandRef.current) {
      lastHandRef.current = h.id;
    }
  }, [table.hand, meId]);

  // Keep the raise sizer sensible as the hand state changes.
  useEffect(() => {
    if (myMoves) {
      const init = myMoves.canBet
        ? Math.min(myMoves.maxRaiseTo, Math.max(table.bigBlind, myMoves.minRaiseTo))
        : myMoves.minRaiseTo;
      setRaiseTo((prev) =>
        prev >= myMoves.minRaiseTo && prev <= myMoves.maxRaiseTo ? prev : init
      );
    }
  }, [hand?.id, hand?.toAct, hand?.currentBet, table.bigBlind]);

  async function act(kind: string, amount?: number) {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ table: TableView }>(`/api/poker/${table.id}/action`, {
        method: "POST",
        body: { kind, amount },
      });
      setTable(res.table);
      playSfx("blip");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sit() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ table: TableView }>(`/api/poker/${table.id}/sit`, {
        method: "POST",
        body: { buyIn },
      });
      setTable(res.table);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sit.");
    } finally {
      setBusy(false);
    }
  }

  async function stand() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ table: TableView }>(`/api/poker/${table.id}/stand`, {
        method: "POST",
      });
      setTable(res.table);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stand.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Felt table={table} hand={hand} meId={meId} />

      {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

      {/* Action / seating controls */}
      {seated ? (
        <Card>
          {myTurn && hand ? (
            <ActionBar
              hand={hand}
              moves={myMoves!}
              raiseTo={raiseTo}
              setRaiseTo={setRaiseTo}
              busy={busy}
              act={act}
              bigBlind={table.bigBlind}
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink/60">
                {hand && hand.status === "betting"
                  ? "Waiting on the other players…"
                  : "Waiting for the next hand to deal…"}
              </p>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t-2 border-ink/10 pt-3">
            <span className="font-mono text-xs text-ink/60">
              Your stack: <b className="text-ink">{fmt(seated.stack)}</b>
            </span>
            <Button variant="danger" onClick={stand} disabled={busy}>
              Stand &amp; cash out
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="brutal-label mb-2">Take a seat</p>
          {table.seats.length >= MAX_SEATS ? (
            <p className="text-sm text-ink/60">Table is full. Spectating for now.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="brutal-label">Buy-in (coins)</span>
                <input
                  className="brutal-input w-40"
                  type="number"
                  min={table.bigBlind}
                  value={buyIn}
                  onChange={(e) => setBuyIn(Math.max(table.bigBlind, Number(e.target.value) || 0))}
                />
              </label>
              <Button onClick={sit} disabled={busy} className="bg-accent-baize text-ink">
                Sit down
              </Button>
            </div>
          )}
        </Card>
      )}

      <GameChat channel={`poker:${table.id}`} meId={meId} isPlayer={!!seated} />
    </div>
  );
}

function Felt({ table, hand, meId }: { table: TableView; hand: HandView | null; meId: string }) {
  const myHole =
    hand?.seats.find((s) => s.userId === meId && s.hole)?.hole ?? null;

  return (
    <div className="border-3 border-ink bg-accent-baize p-4 shadow-brutal">
      {/* Pot + board */}
      <div className="mb-4 text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-paper/70">Pot</p>
        <p className="font-display text-2xl font-bold text-paper">{fmt(hand?.pot ?? 0)}</p>
        <div className="mt-2 flex justify-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => {
            const c = hand?.board[i];
            return c !== undefined ? (
              <PlayingCard key={i} card={c} dealt />
            ) : (
              <span key={i} className="h-14 w-10 border-2 border-dashed border-paper/30" />
            );
          })}
        </div>
        {hand?.status === "complete" && hand.result && (
          <p className="mt-2 font-display font-bold text-paper">
            {hand.result.wonByFold
              ? "Won uncontested"
              : `Showdown — ${hand.result.pots
                  .map((p) =>
                    p.winners
                      .map((w) => table.seats.find((s) => s.seatIndex === w)?.displayName ?? "?")
                      .join(" & ")
                  )
                  .join(", ")} takes it`}
          </p>
        )}
      </div>

      {/* Seats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {table.seats.map((s) => {
          const hs = hand?.seats.find((h) => h.seatIndex === s.seatIndex);
          const isButton = hand?.buttonSeat === s.seatIndex;
          const isToAct = hand?.toAct === s.seatIndex;
          const folded = hs?.folded;
          const reveal = hs?.hole && s.userId !== meId; // shown only at showdown
          return (
            <div
              key={s.seatIndex}
              className={`border-2 border-ink bg-paper px-2 py-1.5 ${
                folded ? "opacity-40" : ""
              } ${isToAct ? "ring-4 ring-accent-yellow" : ""}`}
            >
              <div className="flex items-center gap-2">
                <Avatar name={s.displayName} src={s.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">
                    {s.displayName.split(" ")[0]}
                    {s.userId === meId && <span className="text-ink/40"> (you)</span>}
                  </p>
                  <p className="font-mono text-[10px] text-ink/60">
                    {fmt(hs ? hs.stackBehind : s.stack)}
                    {hs && hs.streetCommit > 0 && ` · bet ${fmt(hs.streetCommit)}`}
                  </p>
                </div>
                {isButton && <Badge className="bg-accent-yellow">D</Badge>}
                {hs?.allIn && <Badge className="bg-accent-red text-white">ALL-IN</Badge>}
              </div>
              {reveal && (
                <div className="mt-1 flex gap-1">
                  {hs!.hole!.map((c, i) => (
                    <PlayingCard key={i} card={c} size="sm" />
                  ))}
                  {hs!.showdownCategory !== null && (
                    <span className="ml-1 self-center font-mono text-[9px] uppercase text-ink/60">
                      {CATEGORY_NAMES[hs!.showdownCategory!]}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Your hole cards */}
      {myHole && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="font-mono text-xs uppercase text-paper/70">Your hand</span>
          {myHole.map((c, i) => (
            <PlayingCard key={i} card={c} dealt />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBar({
  hand,
  moves,
  raiseTo,
  setRaiseTo,
  busy,
  act,
  bigBlind,
}: {
  hand: HandView;
  moves: NonNullable<HandView["myMoves"]>;
  raiseTo: number;
  setRaiseTo: (n: number) => void;
  busy: boolean;
  act: (kind: string, amount?: number) => void;
  bigBlind: number;
}) {
  const callAmt = moves.callAmount;
  const canSlide = moves.canBet || moves.canRaise;
  const isBet = moves.canBet;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="brutal-label">Your move</p>
        {hand.deadline && (
          <span className="font-mono text-xs text-ink/60">
            clock: <Countdown deadline={hand.deadline} />
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {moves.canFold && (
          <Button variant="danger" onClick={() => act("fold")} disabled={busy}>
            Fold
          </Button>
        )}
        {moves.canCheck && (
          <Button onClick={() => act("check")} disabled={busy} className="bg-card text-ink">
            Check
          </Button>
        )}
        {moves.canCall && (
          <Button onClick={() => act("call")} disabled={busy} variant="green">
            Call {fmt(callAmt)}
          </Button>
        )}
      </div>
      {canSlide && (
        <div className="space-y-2 border-t-2 border-ink/10 pt-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={moves.minRaiseTo}
              max={moves.maxRaiseTo}
              value={Math.min(Math.max(raiseTo, moves.minRaiseTo), moves.maxRaiseTo)}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="flex-1 accent-accent-baize"
            />
            <input
              type="number"
              className="brutal-input w-28"
              min={moves.minRaiseTo}
              max={moves.maxRaiseTo}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["½ pot", Math.round(hand.pot / 2)],
              ["¾ pot", Math.round((hand.pot * 3) / 4)],
              ["Pot", hand.pot],
            ].map(([label, add]) => {
              const target = Math.min(
                moves.maxRaiseTo,
                Math.max(moves.minRaiseTo, hand.currentBet + (add as number) || moves.minRaiseTo)
              );
              return (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => setRaiseTo(target)}
                  className="brutal-press border-2 border-ink bg-card px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm"
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setRaiseTo(moves.maxRaiseTo)}
              className="brutal-press border-2 border-ink bg-card px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm"
            >
              All-in
            </button>
          </div>
          <Button
            onClick={() => act(isBet ? "bet" : "raise", raiseTo)}
            disabled={busy}
            className="bg-accent-baize text-ink"
          >
            {raiseTo >= moves.maxRaiseTo
              ? `All-in ${fmt(moves.maxRaiseTo)}`
              : isBet
                ? `Bet ${fmt(raiseTo)}`
                : `Raise to ${fmt(raiseTo)}`}
          </Button>
        </div>
      )}
    </div>
  );
}
