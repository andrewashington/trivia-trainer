"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { DISCORD_EVENTS } from "@/modules/admin/discordEvents";
import type { DiscordSettings } from "@/lib/discord/settings";

export type DiscordFeedEvent = { type: string; label: string; group: string };

const MODE_COPY: Record<string, { tint: string; text: string }> = {
  bot: { tint: "bg-accent-green", text: "Bot connected — cards post with buttons." },
  webhook: { tint: "bg-accent-yellow", text: "Webhook mode — cards post, no buttons." },
  off: { tint: "bg-accent-red text-white", text: "Feed off — no token/webhook configured." },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SettingToggle({
  label,
  help,
  on,
  onClick,
  warn,
}: {
  label: string;
  help?: string;
  on: boolean;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 border-2 border-ink px-3 py-2 text-left ${
        on ? (warn ? "bg-accent-yellow" : "bg-card") : "bg-ink/10 text-ink/40"
      }`}
    >
      <span>
        <span className="text-sm font-bold">{label}</span>
        {help && <span className="block font-mono text-[10px] text-ink/50">{help}</span>}
      </span>
      <span
        className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
          on ? "bg-accent-green" : "bg-card"
        }`}
      >
        {on ? "on" : "off"}
      </span>
    </button>
  );
}

export function DiscordPanel({
  events = DISCORD_EVENTS,
  initialDisabled,
  initialSettings,
  mode,
}: {
  events?: DiscordFeedEvent[];
  initialDisabled: string[];
  initialSettings: DiscordSettings;
  mode: string;
}) {
  const [disabled, setDisabled] = useState<Set<string>>(new Set(initialDisabled));
  const [settings, setSettings] = useState<DiscordSettings>(initialSettings);
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

  function setFlag<K extends keyof DiscordSettings>(key: K, value: DiscordSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setStatus(null);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/discord", {
        method: "PUT",
        body: { disabled: [...disabled], settings },
      });
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

      {/* Feature settings (AppConfig discord.settings) */}
      <div className="brutal-card space-y-3 p-3">
        <p className="brutal-label">Features</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <SettingToggle
            label="Tips"
            help="/tip moves coins between people — makes them transferable"
            on={settings.tipsEnabled}
            warn
            onClick={() => setFlag("tipsEnabled", !settings.tipsEnabled)}
          />
          <SettingToggle
            label="Coin drops"
            help="/drop — first-come or split coin drops"
            on={settings.dropsEnabled}
            onClick={() => setFlag("dropsEnabled", !settings.dropsEnabled)}
          />
          <SettingToggle
            label="AI Concierge"
            help="/udm, /ask, @mention drafting"
            on={settings.aiEnabled}
            onClick={() => setFlag("aiEnabled", !settings.aiEnabled)}
          />
          <SettingToggle
            label="Message archive"
            help="Store Discord message history for search"
            on={settings.archiveEnabled}
            onClick={() => setFlag("archiveEnabled", !settings.archiveEnabled)}
          />
          <SettingToggle
            label="Engagement rewards"
            help="Future coin rewards from archived message activity"
            on={settings.rewardsEnabled}
            warn
            onClick={() => setFlag("rewardsEnabled", !settings.rewardsEnabled)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="brutal-label">Digest day</span>
            <select
              value={settings.digestDay}
              onChange={(e) => setFlag("digestDay", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="brutal-label">Digest hour</span>
            <input
              type="number"
              min={0}
              max={23}
              value={settings.digestHour}
              onChange={(e) => setFlag("digestHour", Math.max(0, Math.min(23, Number(e.target.value))))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="brutal-label">AI model</span>
            <input
              type="text"
              value={settings.aiModel}
              placeholder="default"
              onChange={(e) => setFlag("aiModel", e.target.value)}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
        </div>
        <p className="font-mono text-[10px] text-ink/50">
          tips are off by default — flipping them on lets coins move between people · digest
          day/hour drive the periodic DM · AI model overrides OPENROUTER_MODEL when set ·
          archive search also needs APP_INGEST_URL on the gateway
        </p>
      </div>

      {/* Feed event toggles (AppConfig discord.feeds) */}
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
          {busy ? "Saving…" : "Save Discord settings"}
        </Button>
        {status && <p className="font-mono text-xs font-bold">{status}</p>}
      </div>
    </div>
  );
}
