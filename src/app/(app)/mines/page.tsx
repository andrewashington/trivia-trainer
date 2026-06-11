import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { MinesGame } from "@/modules/mines/MinesGame";

export const metadata = { title: "Mines" };
export const dynamic = "force-dynamic";

export default async function MinesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Mines"
        icon="warning-diamond"
        accentBg="bg-accent-frost"
        action={<Badge className="bg-accent-frost text-ink">{user.coins} coins</Badge>}
      />
      <MinesGame initialCoins={user.coins} />
    </div>
  );
}
