"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  categories,
  modulesByCategory,
  sortedModules,
  type CategoryKey,
} from "@/modules/registry";
import { PixelIcon, solidIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { KeyFlare } from "@/modules/thekey/KeyFlare";

// Accents dark enough to need white label text when active.
const DARK_ACCENTS = new Set([
  "bg-accent-blue",
  "bg-accent-forest",
  "bg-accent-indigo",
  "bg-accent-magenta",
  "bg-ink",
]);

function activeText(accentBg: string) {
  return DARK_ACCENTS.has(accentBg) ? "text-white" : "text-ink";
}

function categoryOf(pathname: string): CategoryKey | null {
  const mod = sortedModules().find((m) => pathname.startsWith(m.href));
  return mod?.category ?? null;
}

type Counts = Record<string, number>;

function categoryTotal(counts: Counts, key: CategoryKey): number {
  return modulesByCategory(key).reduce((sum, m) => sum + (counts[m.key] ?? 0), 0);
}

/** A small red count chip; nothing renders when the count is 0. */
function NavBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center border border-ink bg-accent-red px-1 font-mono text-[9px] font-bold leading-none text-white ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * A module row in the sidebar / mobile sheet. Top-level items keep the
 * loud filled-box treatment; these sub-items signal "selected" quietly:
 * bold label + the icon's filled (Pro) variant.
 */
function ModuleLink({
  href,
  icon,
  label,
  active,
  count,
  glow = false,
  className = "",
}: {
  href: string;
  icon: Parameters<typeof PixelIcon>[0]["name"];
  label: string;
  active: boolean;
  count: number;
  /** Beta-launch come-hither: pulses until the user accepts/visits. */
  glow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 border-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide no-underline transition-[color,transform] duration-150 ${
        active
          ? "border-transparent font-bold text-ink"
          : glow
            ? "animate-beta-glow border-ink bg-accent-meadow font-bold text-ink"
            : "border-transparent font-normal text-ink/60 hover:translate-x-0.5 hover:text-ink"
      } ${className}`}
    >
      <PixelIcon name={active ? solidIcon(icon) : icon} size={16} />
      {label}
      {glow && !active && (
        <span className="animate-sparkle font-mono text-[9px] font-bold">✦ BETA</span>
      )}
      <NavBadge count={count} className="ml-auto" />
    </Link>
  );
}

/**
 * Desktop navigation: a persistent left sidebar with the modules
 * grouped under their category headers. Rendered from md: up; the
 * bottom tab bar takes over below that.
 */
// Which sidebar sections the user has opened, persisted per browser.
// Everything starts collapsed; the section you're inside opens itself.
const EXPANDED_KEY = "udm.nav.expanded";

export function SideNav({ isAdmin, counts, glowKeys = [] }: { isAdmin: boolean; counts: Counts; glowKeys?: string[] }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<CategoryKey[]>([]);

  // Restore after mount — the sidebar is server-rendered collapsed, and
  // reading localStorage during hydration would mismatch. First visit
  // (nothing stored): open just the section containing the current page.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) {
        setExpanded(JSON.parse(raw));
        return;
      }
    } catch {}
    const cat = categoryOf(pathname);
    if (cat) setExpanded([cat]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: CategoryKey) {
    setExpanded((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r-3 border-ink bg-card md:flex">
      <div className="border-b-3 border-ink p-4">
        <Link href="/" className="no-underline">
          <Logo size="md" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <Link
          href="/"
          className={`mb-3 flex items-center gap-2.5 border-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide no-underline ${
            pathname === "/"
              ? "border-ink bg-ink text-white shadow-brutal-sm"
              : "border-transparent text-ink hover:border-ink"
          }`}
        >
          <PixelIcon name={pathname === "/" ? "home-solid" : "home"} size={18} />
          Home
        </Link>

        {categories.map((cat) => {
          const isExpanded = expanded.includes(cat.key);
          const containsActive = modulesByCategory(cat.key).some((m) =>
            pathname.startsWith(m.href)
          );
          return (
            <div key={cat.key} className="mb-4">
              <button
                onClick={() => toggle(cat.key)}
                aria-expanded={isExpanded}
                className={`brutal-press flex w-full items-center gap-2 border-2 border-ink px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wider shadow-brutal-sm ${cat.accentBg} ${activeText(cat.accentBg)}`}
              >
                <PixelIcon name={cat.icon} size={16} />
                {cat.label}
                {/* When collapsed, a dot marks "you are in here somewhere". */}
                {!isExpanded && containsActive && (
                  <span className="h-2 w-2 border border-ink bg-card" />
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {/* Collapsed sections surface their modules' unread total. */}
                  {!isExpanded &&
                    modulesByCategory(cat.key).some((m) => glowKeys.includes(m.key)) && (
                      <span className="animate-sparkle border border-ink bg-accent-meadow px-1 font-mono text-[9px] font-bold">
                        ✦ NEW
                      </span>
                    )}
                  {!isExpanded && <NavBadge count={categoryTotal(counts, cat.key)} />}
                  <PixelIcon
                    name="chevron-down"
                    size={14}
                    className={`transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                  />
                </span>
              </button>
              {/* 0fr→1fr grid keeps the list mounted so height animates. */}
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div
                  className={`overflow-hidden transition-[visibility] duration-200 ${
                    isExpanded ? "visible" : "invisible"
                  }`}
                >
                  <div className="mt-1.5 space-y-0.5" aria-hidden={!isExpanded}>
                    {modulesByCategory(cat.key).map((m) => (
                      <ModuleLink
                        key={m.key}
                        href={m.href}
                        icon={m.icon}
                        label={m.label}
                        active={pathname.startsWith(m.href)}
                        count={counts[m.key] ?? 0}
                        glow={glowKeys.includes(m.key)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <KeyFlare />

      {isAdmin && (
        <div className="border-t-3 border-ink p-3">
          <Link
            href="/admin"
            className={`flex items-center gap-2.5 border-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide no-underline ${
              pathname.startsWith("/admin")
                ? "border-ink bg-accent-grape text-white shadow-brutal-sm"
                : "border-transparent text-ink hover:border-ink"
            }`}
          >
            <PixelIcon
              name={pathname.startsWith("/admin") ? solidIcon("settings-cog") : "settings-cog"}
              size={18}
            />
            Admin
          </Link>
        </div>
      )}
    </aside>
  );
}

/**
 * Mobile navigation: Home + the categories as fixed, thumb-sized
 * tabs, no horizontal scrolling. Tapping a category opens a sheet
 * with its modules.
 */
export function MobileNav({ isAdmin, counts, glowKeys = [] }: { isAdmin: boolean; counts: Counts; glowKeys?: string[] }) {
  const pathname = usePathname();
  const [openCat, setOpenCat] = useState<CategoryKey | null>(null);

  // Route change = a module was picked (or back was pressed): close the sheet.
  useEffect(() => setOpenCat(null), [pathname]);

  const currentCat = categoryOf(pathname);
  const open = openCat ? categories.find((c) => c.key === openCat)! : null;

  return (
    <div className="md:hidden">
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpenCat(null)}
          className="fixed inset-0 z-[1030] animate-fade-in bg-ink/40"
        />
      )}

      {open && (
        <div
          key={open.key}
          className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[1040] animate-sheet-up border-t-3 border-ink bg-card"
        >
          <div className="mx-auto max-w-3xl p-3">
            <div
              className={`mb-2 flex items-center justify-between border-2 border-ink px-3 py-1.5 shadow-brutal-sm ${open.accentBg} ${activeText(open.accentBg)}`}
            >
              <span className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider">
                <PixelIcon name={open.icon} size={16} />
                {open.label}
              </span>
              <span className="font-mono text-[10px] uppercase opacity-70">
                {open.tagline}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {modulesByCategory(open.key).map((m) => {
                const active = pathname.startsWith(m.href);
                return (
                  <Link
                    key={m.key}
                    href={m.href}
                    className={`flex items-center gap-2.5 border-2 border-ink px-3 py-2.5 font-mono text-xs uppercase tracking-wide no-underline ${
                      active
                        ? "bg-card font-bold text-ink shadow-brutal-sm"
                        : glowKeys.includes(m.key)
                          ? "animate-beta-glow bg-accent-meadow font-bold text-ink"
                          : "bg-paper font-normal text-ink/70"
                    }`}
                  >
                    <PixelIcon name={active ? solidIcon(m.icon) : m.icon} size={18} />
                    {m.label}
                    {glowKeys.includes(m.key) && !active && (
                      <span className="animate-sparkle font-mono text-[9px] font-bold">✦</span>
                    )}
                    <NavBadge count={counts[m.key] ?? 0} className="ml-auto" />
                  </Link>
                );
              })}
              {isAdmin && open.key === "quests" && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-2.5 border-2 border-ink px-3 py-2.5 font-mono text-xs uppercase tracking-wide no-underline ${
                    pathname.startsWith("/admin")
                      ? "bg-card font-bold text-ink shadow-brutal-sm"
                      : "bg-paper font-normal text-ink/70"
                  }`}
                >
                  <PixelIcon
                    name={pathname.startsWith("/admin") ? solidIcon("settings-cog") : "settings-cog"}
                    size={18}
                  />
                  Admin
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-[1050] border-t-3 border-ink bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-14 max-w-3xl items-stretch">
          <Link
            href="/"
            onClick={() => setOpenCat(null)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 no-underline transition-colors duration-150 ${
              pathname === "/" && !openCat ? "bg-ink text-white" : "text-ink"
            }`}
          >
            <PixelIcon name={pathname === "/" && !openCat ? "home-solid" : "home"} size={20} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-wide">
              Home
            </span>
          </Link>
          {categories.map((cat) => {
            const lit = openCat === cat.key || (!openCat && currentCat === cat.key);
            const total = categoryTotal(counts, cat.key);
            return (
              <button
                key={cat.key}
                onClick={() =>
                  setOpenCat(openCat === cat.key ? null : cat.key)
                }
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 ${
                  lit ? `${cat.accentBg} ${activeText(cat.accentBg)} border-x-2 border-ink` : "text-ink"
                }`}
              >
                <PixelIcon name={cat.icon} size={20} />
                <span className="font-mono text-[9px] font-bold uppercase tracking-wide">
                  {cat.label}
                </span>
                {total > 0 && (
                  <NavBadge count={total} className="absolute right-1.5 top-1" />
                )}
                {modulesByCategory(cat.key).some((m) => glowKeys.includes(m.key)) && (
                  <span className="absolute left-1.5 top-0.5 animate-sparkle text-[10px]">✦</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
