import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { gameInclude, gamePayload } from "@/modules/twentyq/server";
import { TwentyQList } from "@/modules/twentyq/TwentyQList";

export const metadata = { title: "20 Questions" };
export const dynamic = "force-dynamic";

export default async function TwentyQPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const games = await db.twentyQuestionsGame.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 40,
    include: gameInclude,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="20 Questions" icon="circle-question" accentBg="bg-accent-riddle" />
      <TwentyQList initial={games.map((g) => gamePayload(g, user.id))} meId={user.id} />
    </div>
  );
}
