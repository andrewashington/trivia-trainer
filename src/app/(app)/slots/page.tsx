import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { SlotsGame } from "@/modules/slots/SlotsGame";

export const metadata = { title: "Slots" };
export const dynamic = "force-dynamic";

export default async function SlotsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Slots"
        icon="sparkles"
        accentBg="bg-accent-slot"
        action={<Badge className="bg-accent-slot text-white">{user.coins} coins</Badge>}
      />
      <SlotsGame initialCoins={user.coins} />
    </div>
  );
}
