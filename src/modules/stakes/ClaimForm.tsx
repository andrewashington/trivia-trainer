"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { useCloseModuleForm } from "@/components/ModuleHeader";

type Team = { id: string; name: string; league: string; badge: string | null };
type Fixture = { id: string; league: string; homeTeam: string; awayTeam: string; startsAt: string };

/**
 * Sports mode: search a team → its next game → pick a winner. The claim
 * text and deadline derive from the game; the oracle settles it.
 */
function GamePicker({
  fixture,
  pickTeam,
  onChange,
}: {
  fixture: Fixture | null;
  pickTeam: string;
  onChange: (fixture: Fixture | null, pickTeam: string) => void;
}) {
  const [q, setQ] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setTeams([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<{ teams: Team[] }>(
          `/api/stakes/teams?q=${encodeURIComponent(query)}`
        );
        setTeams(res.teams);
        setNotice(res.teams.length === 0 ? "No major-league team by that name." : null);
      } catch {
        setTeams([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function pickTeamNext(team: Team) {
    setLoading(true);
    setNotice(null);
    try {
      const res = await api<{ fixture: Fixture }>(`/api/stakes/teams/${team.id}/next`);
      onChange(res.fixture, "");
      setTeams([]);
      setQ("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't fetch the next game.");
    } finally {
      setLoading(false);
    }
  }

  if (fixture) {
    return (
      <div className="space-y-2 border-2 border-ink bg-paper p-2.5 shadow-brutal-sm">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink/50">
          {fixture.league} · {new Date(fixture.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <p className="font-bold leading-snug">
          {fixture.homeTeam} vs {fixture.awayTeam}
        </p>
        <p className="font-mono text-[10px] uppercase text-ink/50">Who wins?</p>
        <div className="flex flex-wrap gap-1.5">
          {[fixture.homeTeam, fixture.awayTeam].map((team) => (
            <button
              key={team}
              type="button"
              onClick={() => onChange(fixture, team)}
              className={`brutal-press border-2 border-ink px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
                pickTeam === team ? "bg-accent-forest text-white" : "bg-card"
              }`}
            >
              {team}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(null, "")}
            className="brutal-press ml-auto border-2 border-ink bg-card px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a team — Yankees, Arsenal, Lakers…"
        disabled={loading}
      />
      {teams.length > 0 && (
        <ul className="border-2 border-ink bg-card shadow-brutal-sm">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => pickTeamNext(t)}
                disabled={loading}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm font-bold hover:bg-paper"
              >
                {t.badge && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.badge} alt="" className="h-5 w-5 object-contain" />
                )}
                {t.name}
                <span className="ml-auto font-mono text-[10px] uppercase text-ink/40">
                  {t.league}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && <p className="font-mono text-[10px] uppercase text-ink/50">Fetching the next game…</p>}
      {notice && <p className="font-mono text-[10px] uppercase text-ink/50">{notice}</p>}
    </div>
  );
}

export function ClaimForm({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [text, setText] = useState("");
  const [resolvesAt, setResolvesAt] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [stake, setStake] = useState("");
  const [hidden, setHidden] = useState(false);
  const [sports, setSports] = useState(false);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [pickTeam, setPickTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sportsReady = sports && fixture && pickTeam;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sports && !sportsReady) {
      setError("Pick a game and a winner first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const other = fixture
        ? pickTeam === fixture.homeTeam
          ? fixture.awayTeam
          : fixture.homeTeam
        : null;
      await api("/api/stakes/claims", {
        method: "POST",
        body: sportsReady
          ? {
              text: `${pickTeam} beat ${other} (${new Date(fixture.startsAt).toLocaleDateString([], { month: "short", day: "numeric" })})`,
              resolvesAt: new Date(new Date(fixture.startsAt).getTime() + 4 * 3_600_000).toISOString(),
              counterpartyId: counterpartyId || null,
              stake: stake || null,
              hidden: false,
              fixtureId: fixture.id,
              pickTeam,
            }
          : {
              text,
              resolvesAt: new Date(resolvesAt).toISOString(),
              counterpartyId: counterpartyId || null,
              stake: stake || null,
              hidden: counterpartyId ? false : hidden,
            },
      });
      closeForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't lock that in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="font-mono text-[11px] text-ink/50">
        A prediction about the real world — it locks the moment you post it, and
        reality (plus a verdict) settles it.
      </p>
      <div className="flex gap-1.5">
        {([
          ["Anything", false, "sparkles"],
          ["A real game", true, "trophy"],
        ] as const).map(([label, isSports, icon]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setSports(isSports);
              if (!isSports) {
                setFixture(null);
                setPickTeam("");
              }
            }}
            className={`brutal-press flex-1 border-2 border-ink px-2 py-1.5 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              sports === isSports ? "bg-ink text-white" : "bg-card"
            }`}
          >
            <PixelIcon name={icon} size={13} className="-mt-0.5 mr-1 inline" />
            {label}
          </button>
        ))}
      </div>
      {sports ? (
        <Field label="The game (auto-settles from the final score)">
          <GamePicker
            fixture={fixture}
            pickTeam={pickTeam}
            onChange={(f, p) => {
              setFixture(f);
              setPickTeam(p);
            }}
          />
        </Field>
      ) : (
        <>
          <Field label="The claim">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Dave will be 20+ min late to game night"
              required
              maxLength={500}
            />
          </Field>
          <Field label="Resolves by">
            <Input
              type="datetime-local"
              value={resolvesAt}
              onChange={(e) => setResolvesAt(e.target.value)}
              required
            />
          </Field>
        </>
      )}
      <Field label="Against someone? (makes it a bet)">
        <select
          value={counterpartyId}
          onChange={(e) => setCounterpartyId(e.target.value)}
          className="brutal-input"
        >
          <option value="">Nobody — just a prediction</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {counterpartyId && (
        <Field label="The stake (a favor or chore — never money)">
          <Input
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Loser buys coffee / does the dishes"
            maxLength={300}
          />
        </Field>
      )}
      {!counterpartyId && !sports && (
        <button
          type="button"
          onClick={() => setHidden(!hidden)}
          aria-pressed={hidden}
          className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
            hidden ? "bg-ink text-white" : "bg-card"
          }`}
        >
          <PixelIcon name={hidden ? "sunglasses" : "eye"} size={13} className="-mt-0.5 mr-1 inline" />
          {hidden
            ? "Hidden until it resolves — maximum smug"
            : "Visible now (tap to hide until resolution)"}
        </button>
      )}
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? (
          "…"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <PixelIcon name="lock" size={14} /> Lock it in
          </span>
        )}
      </Button>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
        Just want a group vote? <Link href="/polls" className="font-bold underline">Polls</Link> ·
        Blind answers? <Link href="/reveal" className="font-bold underline">Reveal</Link>
      </p>
    </form>
  );
}
