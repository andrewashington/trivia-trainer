import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { SHOP_OUTFITS, STARTER_OUTFITS } from "@/modules/world/cosmetics";
import { getDialog, getEffectiveCatalog, DEFAULT_DIALOG } from "@/modules/world/content";
import { MAP_REGISTRY } from "@/modules/world/maps";
import { RUNBOOKS } from "@/modules/world/admin/runbooks";
import { WorldAdminClient } from "./WorldAdminClient";

export const metadata = { title: "World Console" };
export const dynamic = "force-dynamic";

/**
 * /world/admin — the game-management console. Tabs: shop pricing,
 * NPC dialogue, map registry, and process runbooks. Everything saved
 * here lands in WorldConfig and takes effect without a deploy.
 */
export default async function WorldAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") redirect("/world");

  const [catalog, dialog, ownedCounts, spend] = await Promise.all([
    getEffectiveCatalog(),
    getDialog(),
    db.worldOwnedCosmetic.groupBy({
      by: ["itemKey"],
      where: { kind: "outfit" },
      _count: true,
    }),
    db.coinTransaction.aggregate({
      where: { reason: "world.cosmetic.purchased" },
      _sum: { amount: true },
    }),
  ]);
  const ownedByStyle = Object.fromEntries(ownedCounts.map((o) => [o.itemKey, o._count]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight">
          World Console
        </h1>
        <p className="mt-1 font-mono text-[11px] text-ink/50">
          benevolent dictator tools · total cosmetics revenue:{" "}
          {Math.abs(spend._sum.amount ?? 0)} coins
        </p>
      </div>
      <WorldAdminClient
        catalog={catalog.map((o) => {
          const def = SHOP_OUTFITS.find((d) => d.style === o.style)!;
          return {
            ...o,
            defaultName: def.name,
            defaultPrice: def.price,
            ownedCount: ownedByStyle[o.style] ?? 0,
          };
        })}
        starters={STARTER_OUTFITS}
        dialog={dialog}
        defaultDialog={DEFAULT_DIALOG}
        maps={MAP_REGISTRY}
        runbooks={RUNBOOKS}
      />
    </div>
  );
}
