import { db } from "@/lib/db";
import { avatarPngUrl } from "@/lib/avatar";
import { bookStatus } from "@/lib/discord/cardStatus";
import type { CardSpec } from "@/lib/discord/feed";

/**
 * The Book's Discord card: a collage of bettors' faces on each side of the line,
 * re-rendered as people pile in. `bookAvatars` feeds both the first post (via
 * cardData) and every in-place refresh (`refreshBookCard`); the faces are
 * pre-rasterized to data URIs here so Satori never has to fetch a remote SVG.
 */

const MAX_FACES = 6;

/** Fetch a remote PNG avatar and inline it as a data URI; null if it fails. */
async function avatarDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export type BookAvatars = {
  yes: string[];
  no: string[];
  yesMore: number;
  noMore: number;
};

/** Unique bettors per side (earliest first), as inlined avatar data URIs. */
export async function bookAvatars(marketId: string): Promise<BookAvatars> {
  const bets = await db.bookBet.findMany({
    where: { marketId },
    select: {
      outcome: true,
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const sideUsers = (side: string) => {
    const seen = new Set<string>();
    const users: { id: string; displayName: string; avatarUrl: string | null }[] = [];
    for (const b of bets) {
      if (b.outcome === side && !seen.has(b.user.id)) {
        seen.add(b.user.id);
        users.push(b.user);
      }
    }
    return users;
  };

  const toUris = async (users: { id: string; displayName: string; avatarUrl: string | null }[]) =>
    (await Promise.all(users.slice(0, MAX_FACES).map((u) => avatarDataUri(avatarPngUrl(u))))).filter(
      (x): x is string => !!x
    );

  const yesU = sideUsers("Yes");
  const noU = sideUsers("No");
  return {
    yes: await toUris(yesU),
    no: await toUris(noU),
    yesMore: Math.max(0, yesU.length - MAX_FACES),
    noMore: Math.max(0, noU.length - MAX_FACES),
  };
}

/**
 * Re-render the tracked market card with the latest avatar collage + tally and
 * PATCH it in place (new image upload + status line). No-op when the bot is off
 * or the card was never posted.
 */
export async function refreshBookCard(marketId: string): Promise<void> {
  const { botConfig } = await import("@/lib/discord/bot");
  if (!botConfig().canPost) return;

  const market = await db.bookMarket.findUnique({
    where: { id: marketId },
    select: { question: true },
  });
  if (!market) return;

  const grouped = await db.bookBet.groupBy({
    by: ["outcome"],
    where: { marketId },
    _count: { _all: true },
    _sum: { stake: true },
  });
  const yesCount = grouped.find((g) => g.outcome === "Yes")?._count._all ?? 0;
  const noCount = grouped.find((g) => g.outcome === "No")?._count._all ?? 0;
  const totalStake = grouped.reduce((sum, g) => sum + (g._sum.stake ?? 0), 0);

  const spec: CardSpec = {
    module: "book",
    kicker: "THE BOOK",
    headline: market.question,
    sub: `${yesCount} on yes · ${noCount} on no — pick a side`,
    path: "/book",
  };
  const avatars = await bookAvatars(marketId);

  const [{ renderCardPng }, { restyleTrackedCard }] = await Promise.all([
    import("@/lib/discord/card"),
    import("@/lib/discord/messageState"),
  ]);
  const png = await renderCardPng(spec, null, { avatars });
  await restyleTrackedCard("book", marketId, { png, status: bookStatus(yesCount, noCount, totalStake) });
}
