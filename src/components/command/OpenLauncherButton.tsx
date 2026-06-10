"use client";

import { OPEN_LAUNCHER_EVENT } from "@/components/command/CommandLauncher";

/** Home-page CTA that opens the global "+ New" launcher in the header. */
export function OpenLauncherButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_LAUNCHER_EVENT))}
      className="brutal-press border-3 border-ink bg-ink px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-white shadow-[4px_4px_0_0_#2563FF]"
    >
      + Do something
    </button>
  );
}
