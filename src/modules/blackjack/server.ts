import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicView, type HandState, type HandStatus } from "@/modules/blackjack/engine";
import type { TableView } from "@/modules/blackjack/schema";

/** Strip a DB hand down to what the client may see (hole card hidden). */
export function toView(
  hand: {
    id: string;
    bet: number;
    doubled: boolean;
    status: string;
    payout: number;
    state: Prisma.JsonValue;
  } | null
): TableView["hand"] {
  if (!hand) return null;
  const status = hand.status as HandStatus;
  const view = publicView(hand.state as unknown as HandState, status);
  return {
    id: hand.id,
    bet: hand.bet,
    doubled: hand.doubled,
    status,
    payout: hand.payout,
    ...view,
  };
}

/** The whole table: active hand (if any), balance, recent results. */
export async function tableView(userId: string): Promise<TableView> {
  const [active, user, history] = await Promise.all([
    db.blackjackHand.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
    db.blackjackHand.findMany({
      where: { userId, status: { not: "active" } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, bet: true, status: true, payout: true, createdAt: true },
    }),
  ]);
  return {
    hand: toView(active),
    coins: user.coins,
    history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
  };
}
