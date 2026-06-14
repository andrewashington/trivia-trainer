"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

/**
 * Link/unlink the signed-in user's Discord account. The code comes
 * from running /link in the Discord server (the bot replies with it
 * privately); redeeming it sets User.discordUserId. When linked, also
 * exposes the DM notification opt-ins (DiscordNotifyPref).
 */

type Prefs = {
  dmTurn: boolean;
  dmClaims: boolean;
  dmStakes: boolean;
  dmMentions: boolean;
  dmDigest: boolean;
  digestDaily: boolean;
};

const NOTIFY_ROWS: { key: keyof Prefs; label: string; help: string }[] = [
  { key: "dmTurn", label: "Your turn", help: "Tanks / 20 Questions / Poker" },
  { key: "dmClaims", label: "Claimed / outbid", help: "someone snags what you wanted" },
  { key: "dmStakes", label: "Stakes resolving", help: "a bet you're in is coming due" },
  { key: "dmMentions", label: "Replies & @mentions", help: "someone pings or replies to you" },
  { key: "dmDigest", label: "Digest", help: "a periodic round-up DM" },
];

function NotifyPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<Prefs>("/api/me/discord/prefs")
      .then((p) => alive && setPrefs(p))
      .catch(() => alive && setStatus("Couldn't load notification settings."));
    return () => {
      alive = false;
    };
  }, []);

  async function save(next: Prefs) {
    setBusy(true);
    setStatus(null);
    try {
      const saved = await api<Prefs>("/api/me/discord/prefs", { method: "PUT", body: next });
      setPrefs(saved);
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) {
    return <p className="font-mono text-[11px] text-ink/40">{status ?? "Loading notifications…"}</p>;
  }

  const toggle = (key: keyof Prefs) => save({ ...prefs, [key]: !prefs[key] });

  return (
    <div className="space-y-2 border-t-2 border-dashed border-ink/20 pt-3">
      <p className="brutal-label">DM alerts</p>
      <ul className="space-y-1">
        {NOTIFY_ROWS.map((r) => {
          const on = prefs[r.key];
          return (
            <li key={r.key}>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(r.key)}
                className={`flex w-full items-center justify-between gap-3 border-2 border-ink px-2 py-1 text-left ${
                  on ? "bg-card" : "bg-ink/10 text-ink/40"
                }`}
              >
                <span>
                  <span className="text-sm font-bold">{r.label}</span>
                  <span className="block font-mono text-[10px] text-ink/50">{r.help}</span>
                </span>
                <span
                  className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
                    on ? "bg-accent-green" : "bg-card"
                  }`}
                >
                  {on ? "on" : "off"}
                </span>
              </button>
              {r.key === "dmDigest" && on && (
                <div className="mt-1 flex gap-1 pl-2">
                  {(["weekly", "daily"] as const).map((cadence) => {
                    const active = (cadence === "daily") === prefs.digestDaily;
                    return (
                      <button
                        key={cadence}
                        type="button"
                        disabled={busy}
                        onClick={() => save({ ...prefs, digestDaily: cadence === "daily" })}
                        className={`border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          active ? "bg-accent-blue text-white" : "bg-card"
                        }`}
                      >
                        {cadence}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {status && <p className="font-mono text-[11px] text-ink/50">{status}</p>}
    </div>
  );
}

export function DiscordLinkCard({ linked }: { linked: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedAs, setLinkedAs] = useState<string | null>(null);

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ discordUsername: string }>("/api/me/discord", {
        method: "POST",
        body: { code },
      });
      setLinkedAs(res.discordUsername);
      setCode("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't link.");
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/discord", { method: "DELETE" });
      setLinkedAs(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlink.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brutal-card space-y-3 p-5">
      <span className="brutal-label">Discord</span>
      {linked ? (
        <>
          <p className="text-sm">
            Connected{linkedAs ? ` as ${linkedAs}` : ""}. Buttons and slash commands in the
            server now act as you.
          </p>
          <NotifyPrefs />
          <Button type="button" disabled={busy} onClick={onUnlink} className="w-full">
            {busy ? "Working…" : "Disconnect Discord"}
          </Button>
        </>
      ) : (
        <form onSubmit={onLink} className="space-y-3">
          <p className="text-sm text-ink/70">
            Run <code className="font-mono font-bold">/link</code> in the Discord server, then
            enter the code the bot gives you.
          </p>
          <Field label="Link code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={16}
              required
              className="font-mono uppercase tracking-widest"
            />
          </Field>
          {error && (
            <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !code.trim()} className="w-full">
            {busy ? "Linking…" : "Link Discord account"}
          </Button>
        </form>
      )}
    </div>
  );
}
