"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, LinkButton } from "@/components/ui";
import { BADGE_CATALOG } from "./badges";
import type { KeyRow, RunConfig, WorkoutPiece } from "./engine";
import { Heatmap } from "./Heatmap";
import { searchFromConfig } from "./runQuery";
import { utcDateKey } from "./engine";

type BoardRow = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  wpm: number;
  accuracy: number;
};

type Me = {
  placed: boolean;
  profile: {
    lastPlacementWpm: number | null;
    bestStandardWpm: number | null;
    workoutStreak: number;
  } | null;
  stats: KeyRow[];
  badges: string[];
  recent: { id: string; kind: string; wpm: number; accuracy: number; rated: boolean; createdAt: string }[];
  workout: { date: string; pieces: WorkoutPiece[]; completedAt: string | null } | null;
  daily: { date: string; official: { wpm: number } | null } | null;
  targets: string[];
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

export function Hub({ userId }: { userId: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [mode, setMode] = useState<"time" | "words" | "quote">("time");
  const [sec, setSec] = useState(60);
  const [n, setN] = useState(25);
  const [punct, setPunct] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [dailyBoard, setDailyBoard] = useState<BoardRow[]>([]);
  const [alltime, setAlltime] = useState<BoardRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/type/me");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setMe(json);
        if (json.placed) {
          const [d, a] = await Promise.all([
            fetch("/api/type/leaderboard?board=daily").then((r) => r.json()),
            fetch("/api/type/leaderboard?board=alltime").then((r) => r.json()),
          ]);
          setDailyBoard(d.rows ?? []);
          setAlltime(a.rows ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const sandboxHref = useMemo(() => {
    const config: RunConfig = {
      kind: keys.length ? "targeted" : "sandbox",
      mode,
      durationSec: sec,
      wordCount: n,
      punctuation: punct,
      numbers,
      targetKeys: keys,
      seed: `sandbox:${Date.now()}`,
    };
    return searchFromConfig(config);
  }, [keys, mode, sec, n, punct, numbers]);

  if (error) return <p className="text-accent-red">{error}</p>;
  if (!me) return <p className="font-mono text-sm text-ink/50">Loading…</p>;

  if (!me.placed) {
    return (
      <Card className="space-y-4">
        <p className="font-display text-xl font-bold">Qualify first.</p>
        <p className="text-sm text-ink/70">
          60 seconds. Common English. Letters only. Same test as everyone. Then we start assigning the letters you miss.
        </p>
        <LinkButton href={searchFromConfig({
          kind: "placement",
          mode: "time",
          durationSec: 60,
          punctuation: false,
          numbers: false,
          targetKeys: [],
          seed: `placement:${Date.now()}`,
        })}>
          Take the test
        </LinkButton>
      </Card>
    );
  }

  const pieces = (me.workout?.pieces ?? []) as WorkoutPiece[];
  const nextPiece = pieces.find((p) => !("sessionId" in p && (p as WorkoutPiece & { sessionId?: string }).sessionId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {me.profile?.bestStandardWpm != null && (
          <Badge className="bg-accent-typewriter text-white">
            PB · {me.profile.bestStandardWpm.toFixed(0)} WPM
          </Badge>
        )}
        <Badge className="bg-paper">Streak · {me.profile?.workoutStreak ?? 0}</Badge>
        {me.targets.length > 0 && (
          <Badge className="bg-paper">Weak · {me.targets.join(" ").toUpperCase()}</Badge>
        )}
      </div>

      <Card className="space-y-3">
        <p className="brutal-label">Today&apos;s workout</p>
        {me.workout?.completedAt ? (
          <p className="text-sm">Done. Come back tomorrow, or open the sandbox.</p>
        ) : (
          <ol className="space-y-2">
            {pieces.map((p) => {
              const done = Boolean((p as WorkoutPiece & { sessionId?: string }).sessionId);
              return (
                <li key={p.id} className="flex items-center justify-between border-2 border-ink px-3 py-2">
                  <span className={done ? "text-ink/40 line-through" : "font-bold"}>
                    {p.kind === "warmup" && "Warmup · 30s"}
                    {p.kind === "weak" && `Weak keys · ${p.config.targetKeys.join(" ").toUpperCase()}`}
                    {p.kind === "mixed" && "Mixed"}
                    {p.kind === "quote" && "Quote"}
                  </span>
                  {done ? (
                    <span className="font-mono text-xs uppercase text-ink/40">done</span>
                  ) : p.id === nextPiece?.id ? (
                    <LinkButton href={searchFromConfig(p.config)} className="!px-3 !py-1 text-sm">
                      Start
                    </LinkButton>
                  ) : (
                    <span className="font-mono text-xs uppercase text-ink/30">locked</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="brutal-label">Target keys</p>
        <div className="flex flex-wrap gap-1">
          {LETTERS.map((g) => {
            const on = keys.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => setKeys((k) => (on ? k.filter((x) => x !== g) : [...k, g]))}
                className={`h-8 w-8 border-2 border-ink font-mono text-sm font-bold uppercase ${
                  on ? "bg-accent-typewriter text-white" : "bg-paper"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
        <LinkButton href={searchFromConfig({
          kind: keys.length ? "targeted" : "sandbox",
          mode: "time",
          durationSec: 30,
          punctuation: false,
          numbers: false,
          targetKeys: keys,
          seed: `target:${keys.join("")}:${Date.now()}`,
        })}>
          Drill {keys.length ? keys.join(" ").toUpperCase() : "common words"}
        </LinkButton>
      </Card>

      <Card className="space-y-3">
        <p className="brutal-label">Sandbox</p>
        <div className="flex flex-wrap gap-2">
          {(["time", "words", "quote"] as const).map((m) => (
            <Button key={m} type="button" variant={mode === m ? "primary" : "ghost"} onClick={() => setMode(m)}>
              {m}
            </Button>
          ))}
        </div>
        {mode === "time" && (
          <div className="flex flex-wrap gap-2">
            {[15, 30, 60, 120].map((s) => (
              <Button key={s} type="button" variant={sec === s ? "yellow" : "ghost"} onClick={() => setSec(s)}>
                {s}s
              </Button>
            ))}
          </div>
        )}
        {mode === "words" && (
          <div className="flex flex-wrap gap-2">
            {[10, 25, 50, 100].map((w) => (
              <Button key={w} type="button" variant={n === w ? "yellow" : "ghost"} onClick={() => setN(w)}>
                {w}
              </Button>
            ))}
          </div>
        )}
        <label className="mr-4 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={punct} onChange={(e) => setPunct(e.target.checked)} />
          Punctuation
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} />
          Numbers
        </label>
        <div>
          <LinkButton href={sandboxHref}>Start sandbox</LinkButton>
        </div>
        {mode === "time" && sec === 60 && !punct && !numbers && keys.length === 0 && (
          <p className="font-mono text-[10px] uppercase text-accent-typewriter">This setting counts for the all-time board</p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="brutal-label">Daily race</p>
          <LinkButton
            href={searchFromConfig({
              kind: "daily",
              mode: "time",
              durationSec: 60,
              punctuation: false,
              numbers: false,
              targetKeys: [],
              dailyDate: utcDateKey(),
              seed: `daily:${utcDateKey()}`,
            })}
          >
            {me.daily?.official ? "Practice" : "Race"}
          </LinkButton>
        </div>
        {me.daily?.official && (
          <p className="text-sm">Official: {me.daily.official.wpm.toFixed(1)} WPM. Retries are practice.</p>
        )}
        <Board rows={dailyBoard} userId={userId} empty="Nobody has raced today." />
      </Card>

      <Card className="space-y-3">
        <p className="brutal-label">All-time rated</p>
        <Board rows={alltime} userId={userId} empty="No rated 60s yet." />
      </Card>

      <Card className="space-y-3">
        <p className="brutal-label">Heatmap</p>
        <Heatmap stats={me.stats} />
      </Card>

      <Card className="space-y-3">
        <p className="brutal-label">WPM history</p>
        {me.recent.filter((r) => r.rated).length === 0 ? (
          <p className="text-sm text-ink/50">Rated runs will line up here.</p>
        ) : (
          <ul className="space-y-1 font-mono text-sm">
            {me.recent.filter((r) => r.rated).slice(0, 10).map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                <span>{r.wpm.toFixed(1)} · {Math.round(r.accuracy * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="brutal-label">Awards</p>
        <div className="flex flex-wrap gap-2">
          {BADGE_CATALOG.filter((b) => !b.key.startsWith("cleared_") || me.badges.includes(b.key)).map((b) => {
            const on = me.badges.includes(b.key);
            return (
              <span
                key={b.key}
                title={b.hint}
                className={`border-2 border-ink px-2 py-1 font-mono text-[10px] uppercase ${
                  on ? "bg-accent-typewriter text-white" : "bg-paper text-ink/35"
                }`}
              >
                {b.label}
              </span>
            );
          })}
        </div>
      </Card>

      <p className="text-center">
        <LinkButton
          href={searchFromConfig({
            kind: "placement",
            mode: "time",
            durationSec: 60,
            punctuation: false,
            numbers: false,
            targetKeys: [],
            seed: `placement:${Date.now()}`,
          })}
          variant="ghost"
        >
          Re-test
        </LinkButton>
      </p>
    </div>
  );
}

function Board({ rows, userId, empty }: { rows: BoardRow[]; userId: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink/50">{empty}</p>;
  return (
    <ol className="space-y-2">
      {rows.map((row, i) => {
        const mine = row.userId === userId;
        return (
          <li
            key={row.userId}
            className={`flex items-center gap-3 border-2 border-ink px-3 py-2 ${mine ? "bg-accent-typewriter/20" : "bg-paper"}`}
          >
            <span className="w-6 font-mono text-sm">{i + 1}</span>
            <Avatar name={row.displayName} src={row.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate font-display font-bold">
              {row.displayName}
              {mine && <span className="text-ink/40"> (you)</span>}
            </span>
            <span className="font-mono text-sm tabular-nums">{row.wpm.toFixed(1)}</span>
          </li>
        );
      })}
    </ol>
  );
}
