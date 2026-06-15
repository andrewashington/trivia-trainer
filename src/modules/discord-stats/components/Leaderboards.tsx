"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";

export type LeaderView = {
  authorId: string;
  name: string;
  avatarUrl: string | null;
  messages: number;
  reactionsReceived: number;
  reactionRate: number;
  avgLen: number;
  channels: number;
};

type MetricKey = keyof Omit<LeaderView, "authorId" | "name" | "avatarUrl">;

const METRICS: { key: MetricKey; label: string; fmt: (n: number) => string }[] = [
  { key: "messages", label: "Messages", fmt: (n) => n.toLocaleString() },
  { key: "reactionsReceived", label: "Reactions won", fmt: (n) => n.toLocaleString() },
  { key: "reactionRate", label: "Reaction rate", fmt: (n) => `${n.toFixed(2)}/msg` },
  { key: "avgLen", label: "Avg length", fmt: (n) => `${n} ch` },
  { key: "channels", label: "Channels", fmt: (n) => `${n}` },
];

export function Leaderboards({ rows }: { rows: LeaderView[] }) {
  const [metric, setMetric] = useState<MetricKey>("messages");
  const active = METRICS.find((m) => m.key === metric)!;
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const max = Math.max(1, ...sorted.map((r) => r[metric]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`brutal-press border-3 border-ink px-3 py-1 font-display text-sm font-bold uppercase tracking-wide shadow-brutal-sm ${
              m.key === metric ? "bg-accent-blurple text-white" : "bg-card text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ol className="space-y-2">
        {sorted.map((r, i) => (
          <li key={r.authorId}>
            <Link
              href={`/discord-stats/people/${r.authorId}`}
              className="flex items-center gap-3 no-underline text-ink"
            >
              <span className="w-6 shrink-0 text-right font-display text-lg font-bold text-ink/40 tabular-nums">
                {i + 1}
              </span>
              <Avatar name={r.name} src={r.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-display font-bold">{r.name}</span>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-accent-blurple">
                    {active.fmt(r[metric])}
                  </span>
                </div>
                <div className="mt-1 h-3 border-2 border-ink bg-paper">
                  <div className="h-full bg-accent-blurple" style={{ width: `${(r[metric] / max) * 100}%` }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
