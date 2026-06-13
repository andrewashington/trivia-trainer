"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Button } from "@/components/ui";

type Member = {
  id: string;
  displayName: string;
  coins: number;
};

type LedgerRow = {
  id: string;
  amount: number;
  reason: string;
  label: string;
  createdAt: string;
};

const fmt = (n: number) => n.toLocaleString("en-US");

export function CoinsPanel({ members: initial }: { members: Member[] }) {
  // local copy so a balance edit reflects instantly without a full refresh
  const [members, setMembers] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const sorted = [...members].sort((a, b) => b.coins - a.coins);
  const total = members.reduce((s, m) => s + m.coins, 0);
  const target = members.find((m) => m.id === selected) ?? null;

  async function pick(id: string) {
    setSelected(id);
    setStatus(null);
    setError(null);
    setAmount("");
    setNote("");
    setLedger([]);
    try {
      const res = await api<{ coins: number; ledger: LedgerRow[] }>(
        `/api/admin/coins?userId=${id}`
      );
      setLedger(res.ledger);
      setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, coins: res.coins } : m)));
    } catch {
      /* leaderboard balance is good enough if the ledger fetch hiccups */
    }
  }

  async function apply(sign: 1 | -1) {
    if (!target) return;
    const n = Math.round(Number(amount)) * sign;
    if (!Number.isFinite(n) || n === 0) {
      setError("Enter a non-zero amount.");
      return;
    }
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await api<{ coins: number }>("/api/admin/coins", {
        method: "POST",
        body: { userId: target.id, amount: n, note },
      });
      setMembers((ms) => ms.map((m) => (m.id === target.id ? { ...m, coins: res.coins } : m)));
      setStatus(
        `${n > 0 ? "Credited" : "Docked"} ${fmt(Math.abs(n))} — ${target.displayName} now holds ${fmt(res.coins)}.`
      );
      setAmount("");
      setNote("");
      // refresh the ledger to show the new row
      const fresh = await api<{ ledger: LedgerRow[] }>(`/api/admin/coins?userId=${target.id}`);
      setLedger(fresh.ledger);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      {/* ── Wallet leaderboard / member picker ── */}
      <div className="brutal-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="brutal-label">The treasury</p>
          <p className="font-mono text-xs text-ink/60">{fmt(total)} in circulation</p>
        </div>
        <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
          {sorted.map((m, i) => (
            <li key={m.id}>
              <button
                onClick={() => pick(m.id)}
                className={`flex w-full items-center gap-2 border-2 border-ink px-2 py-1.5 text-left ${
                  selected === m.id ? "bg-accent-yellow" : "bg-card"
                }`}
              >
                <span className="w-5 shrink-0 font-mono text-[10px] text-ink/40">#{i + 1}</span>
                <Avatar name={m.displayName} size="sm" />
                <span className="min-w-0 flex-1 truncate font-bold">{m.displayName}</span>
                <span className="shrink-0 font-mono text-xs">{fmt(m.coins)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Adjuster + ledger ── */}
      <div className="brutal-card p-4">
        {!target ? (
          <p className="py-12 text-center font-mono text-xs text-ink/50">
            ← pick a wallet to tinker with the books
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Avatar name={target.displayName} size="md" />
              <div>
                <p className="font-display text-lg font-bold leading-none">{target.displayName}</p>
                <p className="font-mono text-xs text-ink/60">{fmt(target.coins)} coins on hand</p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="amount"
                className="w-28 border-2 border-ink bg-card px-2 py-1.5 font-mono text-sm"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="note (required — the ledger remembers)"
                className="min-w-0 flex-1 border-2 border-ink bg-card px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="green" disabled={busy} onClick={() => apply(1)}>
                {busy ? "…" : "Credit"}
              </Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => apply(-1)}>
                {busy ? "…" : "Dock"}
              </Button>
            </div>

            {status && (
              <p className="border-2 border-ink bg-accent-green px-3 py-2 text-sm font-bold">
                {status}
              </p>
            )}
            {error && (
              <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
                {error}
              </p>
            )}

            <div className="border-t-2 border-ink pt-2">
              <p className="brutal-label mb-1">recent ledger</p>
              {ledger.length === 0 ? (
                <p className="font-mono text-[11px] text-ink/40">no transactions yet</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {ledger.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 border-b border-ink/10 py-1 font-mono text-[11px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink/70">{t.label}</span>
                      <span
                        className={`shrink-0 font-bold ${t.amount < 0 ? "text-accent-red" : "text-accent-green"}`}
                      >
                        {t.amount > 0 ? "+" : ""}
                        {fmt(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
