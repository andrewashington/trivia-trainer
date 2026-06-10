import { randomInt } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const GRID_SIZE = 10;
export const BASE_POT = 500;

/** The treasure day rolls on UTC, matching the coin ledger's daily caps. */
export function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get (or lazily create) today's treasure. A new day buries the chest in
 * a random cell and absorbs the most recent unfound day's pot, so a cold
 * streak builds a jackpot. Each older row is only ever absorbed once:
 * the chain always reads just the latest row before today.
 */
export async function ensureTreasureDay(tx: Prisma.TransactionClient, day: string) {
  const existing = await tx.treasureDay.findUnique({ where: { day } });
  if (existing) return existing;

  const prev = await tx.treasureDay.findFirst({
    where: { day: { lt: day } },
    orderBy: { day: "desc" },
  });
  const pot = BASE_POT + (prev && prev.foundById === null ? prev.pot : 0);

  try {
    return await tx.treasureDay.create({
      data: { day, x: randomInt(GRID_SIZE), y: randomInt(GRID_SIZE), pot },
    });
  } catch {
    // Two requests raced the first creation — the PK won; read it back.
    const row = await tx.treasureDay.findUnique({ where: { day } });
    if (!row) throw new Error("treasure day create raced and vanished");
    return row;
  }
}

export type TreasureState = {
  day: string;
  gridSize: number;
  pot: number;
  digs: {
    x: number;
    y: number;
    found: boolean;
    userId: string;
    name: string;
    avatarUrl: string | null;
  }[];
  myDig: { x: number; y: number; found: boolean } | null;
  foundBy: { id: string; name: string } | null;
  /** Revealed only once the chest has been found. */
  treasure: { x: number; y: number } | null;
};

export async function treasureState(viewerId: string): Promise<TreasureState> {
  const day = utcDay();
  const row = await db.$transaction((tx) => ensureTreasureDay(tx, day));
  const digs = await db.treasureDig.findMany({
    where: { day },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  const foundBy = row.foundById
    ? await db.user.findUnique({
        where: { id: row.foundById },
        select: { id: true, displayName: true },
      })
    : null;
  const mine = digs.find((d) => d.userId === viewerId) ?? null;

  return {
    day,
    gridSize: GRID_SIZE,
    pot: row.pot,
    digs: digs.map((d) => ({
      x: d.x,
      y: d.y,
      found: d.found,
      userId: d.user.id,
      name: d.user.displayName,
      avatarUrl: d.user.avatarUrl,
    })),
    myDig: mine ? { x: mine.x, y: mine.y, found: mine.found } : null,
    foundBy: foundBy ? { id: foundBy.id, name: foundBy.displayName } : null,
    treasure: row.foundById ? { x: row.x, y: row.y } : null,
  };
}
