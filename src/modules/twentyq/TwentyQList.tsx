"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Avatar, Badge, Button, Card, EmptyState } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { CATEGORIES, type Category } from "@/modules/twentyq/schema";
import type { TwentyQGamePayload } from "@/modules/twentyq/server";

const CATEGORY_LABEL: Record<Category, string> = {
  person: "Person",
  place: "Place",
  thing: "Thing",
};

function statusBadge(g: TwentyQGamePayload) {
  if (g.status === "solved")
    return <Badge className="bg-accent-green">Solved by {g.winner?.displayName.split(" ")[0]}</Badge>;
  if (g.status === "revealed") return <Badge className="bg-card text-ink/60">Revealed</Badge>;
  return <Badge className="bg-accent-riddle">{g.remaining} left</Badge>;
}

export function TwentyQList({ initial, meId }: { initial: TwentyQGamePayload[]; meId: string }) {
  const router = useRouter();
  const [games] = useState(initial);
  const [category, setCategory] = useState<Category>("thing");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = games.filter((g) => g.status === "active");
  const done = games.filter((g) => g.status !== "active");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { game } = await api<{ game: TwentyQGamePayload }>("/api/twentyq", {
        method: "POST",
        body: { category, secret: secret.trim() },
      });
      router.push(`/twentyq/${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the round.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <p className="brutal-label">Host a round</p>
        <p className="mb-3 text-sm text-ink/60">
          Pick a person, place, or thing. The group gets twenty answered questions to drag it out of
          you.
        </p>
        <form onSubmit={create} className="space-y-3">
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`brutal-press flex-1 border-3 border-ink px-3 py-2 font-display font-bold uppercase tracking-wide shadow-brutal-sm ${
                  category === c ? "bg-accent-riddle" : "bg-paper text-ink/60"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            className="brutal-input"
            placeholder="Your secret answer (e.g. Pikachu)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            maxLength={120}
          />
          <p className="font-mono text-[11px] text-ink/40">
            Nobody sees this until someone nails it or you give up.
          </p>
          {error && <p className="text-sm font-bold text-accent-red">{error}</p>}
          <Button type="submit" className="bg-accent-riddle text-ink" disabled={busy}>
            {busy ? "Dealing…" : "Start round"}
          </Button>
        </form>
      </Card>

      <Card>
        <p className="brutal-label mb-3">In play</p>
        {active.length === 0 ? (
          <EmptyState
            icon="circle-question"
            title="Nobody's stumping anybody."
            hint="Host a round."
          />
        ) : (
          <ul className="space-y-2">
            {active.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/twentyq/${g.id}`}
                  className="flex items-center gap-3 border-3 border-ink bg-paper px-3 py-2 no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                >
                  <Avatar name={g.host.displayName} src={g.host.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-bold">{g.host.displayName.split(" ")[0]}</span>
                    <span className="text-ink/60">
                      {" "}
                      is hiding a {CATEGORY_LABEL[g.category].toLowerCase()}
                      {g.isHost && " (yours)"}
                    </span>
                  </span>
                  {statusBadge(g)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card>
          <p className="brutal-label mb-3">Settled</p>
          <ul className="space-y-1.5">
            {done.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/twentyq/${g.id}`}
                  className="flex items-center gap-2 border-2 border-ink bg-paper px-3 py-1.5 text-sm no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                >
                  <PixelIcon
                    name={g.status === "solved" ? "trophy" : "eye"}
                    size={14}
                    className="shrink-0 text-ink/50"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold">{g.secret ?? "???"}</span>
                    <span className="text-ink/60">
                      {g.status === "solved"
                        ? ` — ${g.winner?.displayName.split(" ")[0]} got it`
                        : " — host gave up"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-ink/40">
                    {g.answered} asked
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
