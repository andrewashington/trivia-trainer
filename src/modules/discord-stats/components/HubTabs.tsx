"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PixelIcon, type IconName } from "@/components/icons";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/discord-stats", label: "Pulse", icon: "chart-bar-big" },
  { href: "/discord-stats/ask", label: "Ask", icon: "robot-face-happy" },
  { href: "/discord-stats/galaxy", label: "Galaxy", icon: "sparkles" },
  { href: "/discord-stats/people", label: "People", icon: "users" },
  { href: "/discord-stats/channels", label: "Channels", icon: "megaphone" },
  { href: "/discord-stats/hall-of-fame", label: "Hall of Fame", icon: "trophy" },
  { href: "/discord-stats/rhythms", label: "Rhythms", icon: "clock" },
  { href: "/discord-stats/soulmates", label: "Soulmates", icon: "heart" },
  { href: "/discord-stats/lexicon", label: "Lexicon", icon: "book-open" },
];

export function HubTabs() {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const active = t.href === "/discord-stats" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-display text-sm font-bold no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5 ${
              active ? "bg-accent-blurple text-white" : "bg-card text-ink"
            }`}
          >
            <PixelIcon name={t.icon} size={13} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
