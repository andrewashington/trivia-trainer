import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { TanksGame } from "@/modules/tanks/TanksGame";
import { gameInclude, gamePayload } from "@/modules/tanks/server";

export const metadata = { title: "Tanks" };
export const dynamic = "force-dynamic";

export default async function TanksMatchPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const game = await db.tanksGame.findUnique({
    where: { id: params.id },
    include: gameInclude,
  });
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Tanks"
        icon="bullseye-arrow"
        accentBg="bg-accent-orange"
        action={
          <Link
            href="/tanks"
            className="font-mono text-xs font-bold uppercase tracking-wide underline"
          >
            ← All duels
          </Link>
        }
      />
      <TanksGame initial={gamePayload(game)} meId={user.id} />
    </div>
  );
}
