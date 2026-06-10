"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sortedModules } from "@/modules/registry";

/**
 * Invisible companion to the nav badges: whenever the user lands on a
 * module's route, mark that module seen (clearing its unread count) and
 * refresh so the sidebar badge updates. One POST per module-entry, not
 * per render — guarded by a ref.
 */
export function SeenTracker() {
  const pathname = usePathname();
  const router = useRouter();
  const lastMarked = useRef<string | null>(null);

  useEffect(() => {
    const mod = sortedModules().find((m) => pathname.startsWith(m.href));
    if (!mod || lastMarked.current === mod.key) return;
    lastMarked.current = mod.key;
    fetch("/api/me/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: mod.key }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
      })
      .catch(() => {
        // A missed mark just means the badge lingers — no user impact.
      });
  }, [pathname, router]);

  return null;
}
