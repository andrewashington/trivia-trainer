"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { DISCORD_EVENTS } from "@/modules/admin/discordEvents";

export type DiscordFeedEvent = { type: string; label: string; group: string };

const MODE_COPY: Record<string, { tint: string; text: string }> = {
  bot: { tint: "bg-accent-green", text: "Bot connected — cards post with buttons." },
  webhook: { tint: "bg-accent-yellow", text: "Webhook mode — cards post, no buttons." },
  off: { tint: "bg-accent-red text-white", text: "Feed off — no token/webhook configured." },
};

export function DiscordPanel({
  events = DISCORD_EVENTS,
  initialDisabled,
  mode,
}: {
  events?: DiscordFeedEvent[];
  initialDisabled: string[];
  mode: string;
}) {
  const [disabled, setDisabled] = useState<Set<string>>(new Set(initialDisabled));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byGroup: Record<string, DiscordFeedEvent[]> = {};
    for (const e of events) (byGroup[e.group] ??= []).push(e);
    return Object.entries(byGroup);
  }, [events]);

  function toggle(type: string) {
    setDisabled((d) => {
      const next = new Set(d);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setStatus(null);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/discord", { method: "PUT", body: { disabled: [...disabled] } });
      setStatus("Saved. Live on the next drain tick (~30s).");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const m = MODE_COPY[mode] ?? MODE_COPY.off;

  return (
    <div className="space-y-4">
      <div className={`border-3 border-ink px-3 py-2 font-mono text-xs font-bold shadow-brutal-sm ${m.tint}`}>
        {m.text}
      </div>
      <p className="font-mono text-[11px] text-ink/50">
        toggle which moments post to the channel · off = the event is still recorded, just not
        announced · only events that render a card are listed
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(([group, evs]) => (
          <div key={group} className="brutal-card p-3">
            <p className="brutal-label mb-1.5">{group}</p>
            <ul className="space-y-1">
              {evs.map((e) => {
                const on = !disabled.has(e.type);
                return (
                  <li key={e.type}>
                    <button
                      onClick={() => toggle(e.type)}
                      className={`flex w-full items-center justify-between gap-2 border-2 border-ink px-2 py-1 text-left text-sm ${
                        on ? "bg-card" : "bg-ink/10 text-ink/40"
                      }`}
                    >
                      <span>{e.label}</span>
                      <span
                        className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
                          on ? "bg-accent-green" : "bg-card"
                        }`}
                      >
                        {on ? "on" : "muted"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="yellow" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save feed settings"}
        </Button>
        {status && <p className="font-mono text-xs font-bold">{status}</p>}
      </div>
    </div>
  );
}
