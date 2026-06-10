import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { TreasureGrid } from "@/modules/treasure/TreasureGrid";
import { treasureState } from "@/modules/treasure/state";

export const metadata = { title: "Buried Treasure" };
export const dynamic = "force-dynamic";

export default async function TreasurePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const state = await treasureState(user.id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Buried Treasure" icon="money" accentBg="bg-accent-gold" />
      <TreasureGrid initial={state} />
    </div>
  );
}
