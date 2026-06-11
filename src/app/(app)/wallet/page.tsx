import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { WalletView } from "./WalletView";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const recent = await db.coinTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, amount: true, reason: true, meta: true, createdAt: true },
  });

  return (
    <WalletView
      coins={user.coins}
      recent={recent.map((t) => ({
        id: t.id,
        amount: t.amount,
        reason: t.reason,
        label:
          (t.meta && typeof t.meta === "object" && "label" in t.meta
            ? String((t.meta as { label?: unknown }).label ?? "")
            : "") || t.reason,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
