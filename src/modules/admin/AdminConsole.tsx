"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PixelIcon, type IconName } from "@/components/icons";
import { MemberManager } from "@/modules/admin/MemberManager";
import { CoinsPanel } from "@/modules/admin/CoinsPanel";
import { PromosPanel, type Promo } from "@/modules/admin/PromosPanel";
import { DiscordPanel, type DiscordFeedEvent } from "@/modules/admin/DiscordPanel";
import { AiAssistantPanel } from "@/modules/admin/AiAssistantPanel";
import { EconomyPanel, type KnobGame } from "@/modules/admin/EconomyPanel";
import { FeedbackList, type FeedbackItem } from "@/modules/admin/FeedbackList";
import type { DiscordSettings } from "@/lib/discord/settings";

type Member = { id: string; email: string; displayName: string; role: "member" | "admin"; coins: number };

export type AdminConsoleProps = {
  selfId: string;
  members: Member[];
  feedback: FeedbackItem[];
  promos: Promo[];
  discord: { events: DiscordFeedEvent[]; disabled: string[]; mode: string; settings: DiscordSettings };
  knobs: { games: KnobGame[]; overrides: Record<string, Record<string, unknown>> };
  stats: { circulation: number; memberCount: number; openFeedback: number; feedMode: string };
};

const TABS: { key: string; label: string; icon: IconName; accent: string }[] = [
  { key: "members", label: "Members", icon: "users", accent: "bg-accent-grape text-white" },
  { key: "coins", label: "Coins", icon: "money", accent: "bg-accent-yellow" },
  { key: "promos", label: "Promos", icon: "gift", accent: "bg-accent-green" },
  { key: "discord", label: "Discord", icon: "megaphone", accent: "bg-accent-blue text-white" },
  { key: "assistant", label: "Assistant", icon: "robot-face-happy", accent: "bg-accent-grape text-white" },
  { key: "economy", label: "Economy", icon: "gamepad", accent: "bg-accent-red text-white" },
  { key: "world", label: "World", icon: "earth", accent: "bg-accent-green" },
  { key: "feedback", label: "Feedback", icon: "megaphone", accent: "bg-accent-yellow" },
];

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-2 border-ink bg-card px-3 py-2">
      <p className="font-display text-xl font-black leading-none">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">{label}</p>
    </div>
  );
}

export function AdminConsole(props: AdminConsoleProps) {
  const [tab, setTab] = useState("members");
  const { stats } = props;

  return (
    <div className="space-y-4">
      {/* dashboard stat strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="coins in circulation" value={stats.circulation.toLocaleString("en-US")} />
        <Stat label="members" value={stats.memberCount} />
        <Stat label="open feedback" value={stats.openFeedback} />
        <Stat label="discord feed" value={<span className="text-base">{stats.feedMode}</span>} />
      </div>

      {/* tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 border-3 border-ink px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              tab === t.key ? t.accent : "bg-card"
            }`}
          >
            <PixelIcon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "members" && <MemberManager members={props.members} selfId={props.selfId} />}
      {tab === "coins" && <CoinsPanel members={props.members} />}
      {tab === "promos" && <PromosPanel initial={props.promos} />}
      {tab === "discord" && (
        <DiscordPanel
          events={props.discord.events}
          initialDisabled={props.discord.disabled}
          initialSettings={props.discord.settings}
          mode={props.discord.mode}
        />
      )}
      {tab === "assistant" && <AiAssistantPanel />}
      {tab === "economy" && (
        <EconomyPanel games={props.knobs.games} overrides={props.knobs.overrides} />
      )}
      {tab === "world" && (
        <div className="brutal-card space-y-3 p-6 text-center">
          <p className="font-display text-xl font-bold">The World has its own console</p>
          <p className="mx-auto max-w-md text-sm text-ink/60">
            Shop prices, NPC dialogue, maps and runbooks live in the World Console — the
            benevolent-dictator tools for the in-game economy.
          </p>
          <Link
            href="/world/admin"
            className="brutal-press inline-block border-3 border-ink bg-accent-green px-4 py-2 font-display font-bold uppercase tracking-wide no-underline shadow-brutal"
          >
            Open World Console →
          </Link>
        </div>
      )}
      {tab === "feedback" && <FeedbackList items={props.feedback} />}
    </div>
  );
}
