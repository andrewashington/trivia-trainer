import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PokerLobby, type LobbyTable } from "@/modules/poker/PokerLobby";

export const metadata = { title: "Poker" };
export const dynamic = "force-dynamic";

const userSelect = { select: { id: true, displayName: true, avatarUrl: true } };

export default async function PokerLobbyPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const tables = await db.pokerTable.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    include: {
      seats: { include: { user: userSelect } },
      hands: { where: { status: "betting" }, select: { id: true } },
    },
  });

  const initial: LobbyTable[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    smallBlind: t.smallBlind,
    bigBlind: t.bigBlind,
    clockHours: t.clockHours,
    seatCount: t.seats.length,
    handLive: t.hands.length > 0,
    players: t.seats.map((s) => ({
      userId: s.userId,
      displayName: s.user.displayName,
      avatarUrl: s.user.avatarUrl,
      stack: s.stack,
    })),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Poker" icon="crown" accentBg="bg-accent-baize" />
      <PokerLobby initial={initial} />
    </div>
  );
}
