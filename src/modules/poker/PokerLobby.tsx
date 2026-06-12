"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { Avatar, Badge, Button, Card, Field, Input } from "@/components/ui";
import { CLOCK_CHOICES } from "@/modules/poker/schema";

export type LobbyTable = {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  clockHours: number;
  seatCount: number;
  handLive: boolean;
  players: { userId: string; displayName: string; avatarUrl: string | null; stack: number }[];
};

const CLOCK_LABEL: Record<number, string> = { 1: "1h", 6: "6h", 24: "24h" };

export function PokerLobby({ initial }: { initial: LobbyTable[] }) {
  const router = useRouter();
  const [tables, setTables] = useState(initial);
  const [name, setName] = useState("");
  const [smallBlind, setSmallBlind] = useState(1);
  const [bigBlind, setBigBlind] = useState(2);
  const [clockHours, setClockHours] = useState<number>(24);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const res = await api<{ id: string }>("/api/poker", {
        method: "POST",
        body: { name: name.trim() || "No-Limit Table", smallBlind, bigBlind, clockHours },
      });
      router.push(`/poker/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create table.");
      setCreating(false);
    }
  }

  async function refresh() {
    try {
      const res = await api<{ tables: LobbyTable[] }>("/api/poker");
      setTables(res.tables);
    } catch {
      /* transient */
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <p className="brutal-label">Open a table</p>
        <p className="mb-3 text-sm text-ink/60">
          Drop-in, drop-out No-Limit Hold&apos;em. Buy in with your coins; cash out whenever
          you stand. The clock auto-checks (or folds) anyone who ghosts.
        </p>
        <div className="space-y-3">
          <Field label="Table name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Felt of Regret"
              maxLength={40}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Small blind">
              <Input
                type="number"
                min={1}
                value={smallBlind}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1);
                  setSmallBlind(v);
                  if (bigBlind <= v) setBigBlind(v * 2);
                }}
              />
            </Field>
            <Field label="Big blind">
              <Input
                type="number"
                min={smallBlind + 1}
                value={bigBlind}
                onChange={(e) => setBigBlind(Math.max(smallBlind + 1, Number(e.target.value) || 2))}
              />
            </Field>
          </div>
          <div>
            <span className="brutal-label">Action clock</span>
            <div className="mt-1 flex gap-2">
              {CLOCK_CHOICES.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setClockHours(h)}
                  className={`brutal-press border-3 border-ink px-4 py-2 font-display font-bold uppercase shadow-brutal-sm ${
                    clockHours === h ? "bg-accent-baize text-ink" : "bg-card"
                  }`}
                >
                  {CLOCK_LABEL[h]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm font-bold text-accent-red">{error}</p>}
          <Button onClick={create} disabled={creating} className="bg-accent-baize text-ink">
            {creating ? "Dealing…" : "Open table"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="brutal-label">Tables</p>
          <button onClick={refresh} className="font-mono text-xs font-bold uppercase underline">
            Refresh
          </button>
        </div>
        {tables.length === 0 ? (
          <p className="text-sm text-ink/60">No tables yet. Open one above and pull up a chair.</p>
        ) : (
          <ul className="space-y-2">
            {tables.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/poker/${t.id}`}
                  className="flex items-center gap-3 border-3 border-ink bg-paper px-3 py-2 no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold">{t.name}</p>
                    <p className="font-mono text-[11px] text-ink/60">
                      {t.smallBlind}/{t.bigBlind} blinds · {CLOCK_LABEL[t.clockHours]} clock ·{" "}
                      {t.seatCount} seated
                    </p>
                  </div>
                  <div className="flex -space-x-2">
                    {t.players.slice(0, 5).map((p) => (
                      <Avatar key={p.userId} name={p.displayName} src={p.avatarUrl} size="sm" />
                    ))}
                  </div>
                  {t.handLive && <Badge className="bg-accent-baize">Live</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
