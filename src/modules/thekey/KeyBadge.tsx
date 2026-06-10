"use client";

import Link from "next/link";
import { useState } from "react";
import { PixelIcon } from "@/components/icons";

/**
 * The discreet profile artifact: a 🗝️ chip that reveals the owner's
 * encoded key string on click. The code is the ONLY thing that ever
 * leaves the quiz — readable solely by people holding the chart.
 */
export function KeyBadge({ keyCode, isMe }: { keyCode: string; isMe: boolean }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Reveal the key…"
        className="brutal-press inline-flex items-center gap-1 border-2 border-ink bg-paper px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm"
      >
        <PixelIcon name="lock" size={14} />{" "}
        <span className="tracking-widest text-ink/40">·······</span> reveal
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 border-2 border-ink bg-accent-eggplant px-2 py-1 shadow-brutal-sm">
      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider text-white">
        <PixelIcon name="unlock" size={14} /> {keyCode}
      </span>
      {isMe && (
        <Link href="/key" className="font-mono text-[10px] text-white/70 underline">
          edit
        </Link>
      )}
    </span>
  );
}
