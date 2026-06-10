"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PixelIcon, type IconName } from "@/components/icons";

export type QuickAction = { label: string; href: string; icon: IconName; bg: string };

/**
 * The single "+ Do something" launcher that replaces the old wall of
 * fourteen quick-action chips. Opens a brutal-card dropdown of every
 * create-action in the app.
 */
export function DoSomethingMenu({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="brutal-press border-3 border-ink bg-ink px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-white shadow-[4px_4px_0_0_#2563FF]"
      >
        + Do something
      </button>
      {open && (
        <div className="brutal-card absolute right-0 z-30 mt-2 grid w-72 grid-cols-1 gap-1.5 p-2 sm:w-96 sm:grid-cols-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              onClick={() => setOpen(false)}
              className={`brutal-press flex items-center gap-2 border-2 border-ink px-2.5 py-1.5 font-display text-xs font-bold uppercase tracking-wide no-underline shadow-brutal-sm ${a.bg}`}
            >
              <PixelIcon name={a.icon} size={14} />
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
