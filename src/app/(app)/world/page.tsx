import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { WorldClient } from "./WorldClient";

export const metadata = { title: "World" };
export const dynamic = "force-dynamic";

/**
 * /world — Phase 0 spike.
 *
 * Hidden from nav (not registered in registry.ts). Reachable by URL only.
 * Renders a Phaser game: walkable character on a Tiled outdoor map.
 */
export default async function WorldPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-black uppercase tracking-tight">
            The World
          </h1>
          <p className="mt-1 font-mono text-[11px] text-ink/50">
            Phase 0 spike · WASD / arrow keys · click to walk
          </p>
        </div>
        <span className="border-3 border-ink bg-accent-yellow px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm">
          spike
        </span>
      </div>

      <WorldClient />
    </div>
  );
}
