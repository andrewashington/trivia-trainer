import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { gameInclude, gamePayload } from "@/modules/twentyq/server";
import { TwentyQGame } from "@/modules/twentyq/TwentyQGame";

export const metadata = { title: "20 Questions" };
export const dynamic = "force-dynamic";

export default async function TwentyQRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id } = await params;
  const game = await db.twentyQuestionsGame.findUnique({
    where: { id },
    include: gameInclude,
  });
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="20 Questions"
        icon="circle-question"
        accentBg="bg-accent-riddle"
        action={
          <Link
            href="/twentyq"
            className="font-mono text-xs font-bold uppercase tracking-wide underline"
          >
            ← All rounds
          </Link>
        }
      />
      <TwentyQGame initial={gamePayload(game, user.id)} meId={user.id} />
    </div>
  );
}
