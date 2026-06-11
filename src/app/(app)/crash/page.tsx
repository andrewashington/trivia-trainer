import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { CrashGame } from "@/modules/crash/CrashGame";

export const metadata = { title: "Crash" };
export const dynamic = "force-dynamic";

export default async function CrashPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Crash"
        icon="chart-bar-big"
        accentBg="bg-accent-rocket"
        action={<Badge className="bg-accent-rocket text-white">{user.coins} coins</Badge>}
      />
      <CrashGame initialCoins={user.coins} />
    </div>
  );
}
