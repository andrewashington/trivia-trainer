"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sortedModules } from "@/modules/registry";

export function NavTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { key: "home", label: "Home", icon: "🏠", href: "/", accentBg: "bg-card" },
    ...sortedModules(),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-3 border-ink bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-2 no-underline transition-transform ${
                active ? `${tab.accentBg} border-x-2 border-ink -translate-y-0.5` : ""
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span
                className={`font-mono text-[10px] font-bold uppercase tracking-wide ${
                  active && tab.accentBg === "bg-accent-blue" ? "text-white" : "text-ink"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-2 no-underline ${
              pathname.startsWith("/admin")
                ? "bg-accent-grape border-x-2 border-ink -translate-y-0.5"
                : ""
            }`}
          >
            <span className="text-xl leading-none">🔧</span>
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-wide ${
                pathname.startsWith("/admin") ? "text-white" : "text-ink"
              }`}
            >
              Admin
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
