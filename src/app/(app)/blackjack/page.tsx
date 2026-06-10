import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { BlackjackGame } from "@/modules/blackjack/BlackjackGame";

export const metadata = { title: "Blackjack" };
export const dynamic = "force-dynamic";

export default async function BlackjackPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Blackjack"
        icon="chess"
        accentBg="bg-accent-felt"
        action={<Badge className="bg-accent-felt text-white">{user.coins} coins</Badge>}
      />
      <BlackjackGame />
    </div>
  );
}
