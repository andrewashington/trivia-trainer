"use client";

import { useState } from "react";
import { PixelIcon } from "@/components/icons";

/** "Subscribe in your calendar" — copies the per-user .ics URL. */
export function CopyIcalLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/api/events/ical?token=${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm"
    >
      {copied ? (
        "✓ Copied!"
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <PixelIcon name="calendar" size={13} /> Subscribe in your calendar
        </span>
      )}
    </button>
  );
}
