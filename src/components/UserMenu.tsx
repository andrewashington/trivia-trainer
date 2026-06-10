"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { PixelIcon } from "@/components/icons";

/**
 * The header avatar, made legible: a labeled dropdown with Profile,
 * Admin (when applicable), and Sign out — so none of them hide behind
 * an unmarked initials square.
 */
export function UserMenu({
  name,
  avatarUrl,
  isAdmin,
  signOutAction,
}: {
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 border-2 px-1.5 py-1 ${
          open ? "border-ink bg-paper shadow-brutal-sm" : "border-transparent"
        }`}
      >
        <Avatar name={name} src={avatarUrl} title={name} />
        <PixelIcon name="chevron-down" size={14} className="text-ink" />
      </button>

      {open && (
        <div className="brutal-card absolute right-0 top-full z-[1100] mt-2 w-52 p-0">
          <p className="border-b-2 border-ink px-3 py-2 font-display text-sm font-bold">
            {name}
          </p>
          <Link
            href="/me"
            className="flex items-center gap-2.5 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-ink no-underline hover:bg-paper"
          >
            <PixelIcon name="user" size={16} />
            Profile
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2.5 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-ink no-underline hover:bg-paper"
            >
              <PixelIcon name="settings-cog" size={16} />
              Admin
            </Link>
          )}
          <form action={signOutAction} className="border-t-2 border-ink">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-accent-red hover:bg-paper"
            >
              <PixelIcon name="logout" size={16} />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
