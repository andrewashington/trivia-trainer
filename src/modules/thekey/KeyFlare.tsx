"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PixelIcon } from "@/components/icons";

const DISMISS_KEY = "udm-key-flare-dismissed";

/**
 * The breadcrumb to the hidden room: a dismissable flare pinned to the
 * bottom of the nav advertising the bounty. Disappears forever once
 * dismissed or once the viewer has filed their card.
 */
export function KeyFlare() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {}
    let alive = true;
    api<{ submission: unknown }>("/api/key")
      .then((res) => {
        if (alive && !res.submission) setShow(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setShow(false);
  }

  if (!show) return null;

  // No words, no explanations: a glowing door and a number. Those who
  // know, click.
  return (
    <div className="m-3 flex items-center gap-2">
      <Link
        href="/key"
        onClick={() => setShow(false)}
        title="?"
        className="brutal-press inline-flex items-center gap-2 border-2 border-ink bg-accent-eggplant px-3 py-2 no-underline shadow-brutal-sm"
      >
        <PixelIcon name="door-closed" size={18} className="animate-pulse text-white" />
        <span className="inline-flex items-center gap-1 border border-ink bg-accent-yellow px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">
          +500 <PixelIcon name="money" size={12} />
        </span>
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="border-2 border-transparent px-1 font-mono text-[10px] font-bold text-ink/30 hover:border-ink hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
