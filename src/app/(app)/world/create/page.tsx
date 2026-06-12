import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import type { AvatarConfig } from "@/modules/world/avatar";
import { OUTFIT_COLORS } from "@/modules/world/cosmetics";
import { CreatorClient } from "./CreatorClient";

export const metadata = { title: "Character Creator" };
export const dynamic = "force-dynamic";

/**
 * /world/create — character creator + onboarding step for The World.
 * Hidden from nav like /world itself. Re-visitable to re-style anytime.
 */
export default async function WorldCreatePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const [avatar, owned] = await Promise.all([
    db.worldAvatar.findUnique({ where: { userId: user.id } }),
    db.worldOwnedCosmetic.findMany({
      where: { userId: user.id, kind: "outfit" },
      select: { itemKey: true },
    }),
  ]);
  // Purchased outfit styles → colors, merged into the starter manifest
  // client-side so bought looks are pickable here too.
  const ownedOutfits = Object.fromEntries(
    owned
      .map((o) => o.itemKey)
      .filter((k) => OUTFIT_COLORS[k])
      .map((k) => [k, OUTFIT_COLORS[k]])
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight">
          Character Creator
        </h1>
        <p className="mt-1 font-mono text-[11px] text-ink/50">
          this is you now · choose wisely (you can come back)
        </p>
      </div>
      <CreatorClient
        initialConfig={(avatar?.config as AvatarConfig | undefined) ?? null}
        ownedOutfits={ownedOutfits}
      />
    </div>
  );
}
