import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { LimboGame } from "@/modules/limbo/LimboGame";

export const metadata = { title: "Limbo" };
export const dynamic = "force-dynamic";

export default async function LimboPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Limbo"
        icon="bullseye-arrow"
        accentBg="bg-accent-neon"
        action={<Badge className="bg-accent-neon text-ink">{user.coins} coins</Badge>}
      />
      <LimboGame initialCoins={user.coins} />
    </div>
  );
}
