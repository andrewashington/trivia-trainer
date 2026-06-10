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
import { PixelIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";

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
 * Desktop navigation: a persistent left sidebar with the modules
 * grouped under their category headers. Rendered from md: up; the
 * bottom tab bar takes over below that.
 */
// Which sidebar sections the user has collapsed, persisted per browser.
const COLLAPSED_KEY = "udm.nav.collapsed";

export function SideNav({ isAdmin, counts }: { isAdmin: boolean; counts: Counts }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<CategoryKey[]>([]);

  // Restore after mount — the sidebar is server-rendered expanded, and
  // reading localStorage during hydration would mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {}
  }, []);

  function toggle(key: CategoryKey) {
    setCollapsed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
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
          <PixelIcon name="home" size={18} />
          Home
        </Link>

        {categories.map((cat) => {
          const isCollapsed = collapsed.includes(cat.key);
          const containsActive = modulesByCategory(cat.key).some((m) =>
            pathname.startsWith(m.href)
          );
          return (
            <div key={cat.key} className="mb-4">
              <button
                onClick={() => toggle(cat.key)}
                aria-expanded={!isCollapsed}
                className={`flex w-full items-center gap-2 border-2 border-ink px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wider shadow-brutal-sm ${cat.accentBg} ${activeText(cat.accentBg)}`}
              >
                <PixelIcon name={cat.icon} size={16} />
                {cat.label}
                {/* When collapsed, a dot marks "you are in here somewhere". */}
                {isCollapsed && containsActive && (
                  <span className="h-2 w-2 border border-ink bg-card" />
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {/* Collapsed sections surface their modules' unread total. */}
                  {isCollapsed && <NavBadge count={categoryTotal(counts, cat.key)} />}
                  <PixelIcon
                    name="chevron-down"
                    size={14}
                    className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </span>
              </button>
              {!isCollapsed && (
                <div className="mt-1.5 space-y-0.5">
                  {modulesByCategory(cat.key).map((m) => {
                    const active = pathname.startsWith(m.href);
                    return (
                      <Link
                        key={m.key}
                        href={m.href}
                        className={`flex items-center gap-2.5 border-2 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wide no-underline ${
                          active
                            ? `border-ink shadow-brutal-sm ${m.accentBg} ${activeText(m.accentBg)}`
                            : "border-transparent text-ink/70 hover:border-ink hover:text-ink"
                        }`}
                      >
                        <PixelIcon name={m.icon} size={16} />
                        {m.label}
                        <NavBadge count={counts[m.key] ?? 0} className="ml-auto" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
            <PixelIcon name="settings-cog" size={18} />
            Admin
          </Link>
        </div>
      )}
    </aside>
  );
}

/**
 * Mobile navigation: Home + the four categories — five fixed,
 * thumb-sized tabs, no horizontal scrolling. Tapping a category opens
 * a sheet with its modules.
 */
export function MobileNav({ isAdmin, counts }: { isAdmin: boolean; counts: Counts }) {
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
          className="fixed inset-0 z-[1030] bg-ink/40"
        />
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[1040] border-t-3 border-ink bg-card">
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
              {modulesByCategory(open.key).map((m) => (
                <Link
                  key={m.key}
                  href={m.href}
                  className={`flex items-center gap-2.5 border-2 border-ink px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wide no-underline shadow-brutal-sm ${
                    pathname.startsWith(m.href)
                      ? `${m.accentBg} ${activeText(m.accentBg)}`
                      : "bg-paper text-ink"
                  }`}
                >
                  <PixelIcon name={m.icon} size={18} />
                  {m.label}
                  <NavBadge count={counts[m.key] ?? 0} className="ml-auto" />
                </Link>
              ))}
              {isAdmin && open.key === "quests" && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-2.5 border-2 border-ink px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wide no-underline shadow-brutal-sm ${
                    pathname.startsWith("/admin")
                      ? "bg-accent-grape text-white"
                      : "bg-paper text-ink"
                  }`}
                >
                  <PixelIcon name="settings-cog" size={18} />
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
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 no-underline ${
              pathname === "/" && !openCat ? "bg-ink text-white" : "text-ink"
            }`}
          >
            <PixelIcon name="home" size={20} />
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
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 ${
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
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
