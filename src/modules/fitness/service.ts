import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { emitOutbox, withOutbox } from "@/lib/outbox";
import { pumpStatus } from "@/lib/discord/cardStatus";
import { HttpError } from "@/lib/session";
import { e1rmLb, normalizeLift, prDisplay } from "@/modules/fitness/lifts";
import { coerceDoc } from "@/modules/fitness/PlanDocView";
import type { fitnessLogInput, fitnessPrInput } from "@/modules/fitness/schema";
import type { z } from "zod";

/**
 * The Grind — shared write paths for adoptions, logs, and PRs. The web
 * routes, the Discord "Run it" button, and the assistant tools all call
 * THESE, so every door fires the identical outbox events + coins (§0.1 of
 * the Discord spec: the app is the source of truth, one invariant per
 * action).
 */

const TZ = process.env.FEED_TZ || "America/New_York";

/** Calendar day ("2026-08-15") in group time — the unit of the daily coin drip. */
export function groupDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

// ── Adoption ────────────────────────────────────────────────────────────────

export async function adoptPlan(userId: string, planId: string) {
  const plan = await db.fitnessPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "Program not found.");
  try {
    await withOutbox(
      (tx) => tx.fitnessAdoption.create({ data: { planId, userId } }),
      () => ({
        type: "fitness.plan.adopted",
        payload: { planId, title: plan.title, userId },
      })
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Already running it.");
    }
    throw err;
  }
  void refreshPlanCard(planId);
  return plan;
}

export async function abandonPlan(userId: string, planId: string) {
  await db.fitnessAdoption.deleteMany({ where: { planId, userId } });
  void refreshPlanCard(planId);
}

// ── Logging a session ───────────────────────────────────────────────────────

export type LogResult = {
  log: { id: string; dayName: string | null };
  firstToday: boolean;
  weekSessions: number;
  weekConquered: boolean;
};

export async function logWorkout(
  userId: string,
  input: z.infer<typeof fitnessLogInput>
): Promise<LogResult> {
  let dayName: string | null = null;
  let planTitle: string | null = null;
  if (input.planId) {
    const plan = await db.fitnessPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new HttpError(404, "Program not found.");
    planTitle = plan.title;
    if (input.dayIndex != null) {
      const doc = coerceDoc(plan.doc);
      dayName = doc?.days[input.dayIndex]?.name ?? null;
    }
  }

  // The daily coin drip keys off distinct GROUP-TZ days, computed in JS over
  // the last week of this user's logs (a handful of rows) rather than tz math
  // in SQL. First log of the day emits the coin-bearing event; extras save
  // without one, so spam check-ins pay nothing.
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 8 * 864e5);
  const recent = await db.fitnessLog.findMany({
    where: { userId, createdAt: { gte: weekAgo } },
    select: { createdAt: true },
  });
  const today = groupDay(now);
  const firstToday = !recent.some((l) => groupDay(l.createdAt) === today);

  const data = {
    userId,
    planId: input.planId ?? null,
    dayIndex: input.dayIndex ?? null,
    dayName,
    note: input.note ?? null,
    durationMin: input.durationMin ?? null,
  };
  const log = firstToday
    ? await withOutbox(
        (tx) => tx.fitnessLog.create({ data }),
        (l) => ({
          type: "fitness.log.created",
          payload: { logId: l.id, userId, planId: input.planId ?? null, dayName, planTitle },
        })
      )
    : await db.fitnessLog.create({ data });

  // "Week conquered" = third DISTINCT training day inside the current
  // Mon-anchored group-tz week. Only the transition to 3 fires (firstToday
  // guards the double-count), so it's once per week by construction.
  const weekDays = new Set(
    recent
      .concat([{ createdAt: now }])
      .map((l) => groupDay(l.createdAt))
      .filter((day) => sameGroupWeek(day, today))
  );
  const weekConquered = firstToday && weekDays.size === 3;
  if (weekConquered) {
    await db.$transaction(async (tx) => {
      await emitOutbox(tx, "fitness.week.conquered", { userId, sessions: weekDays.size, planTitle });
    });
  }

  if (input.planId) void refreshPlanCard(input.planId);
  return { log: { id: log.id, dayName }, firstToday, weekSessions: weekDays.size, weekConquered };
}

/**
 * Distinct training days per user inside the current group-tz week — feeds
 * the "This week" strip. Pass logs from the last ~8 days.
 */
export function sessionDaysThisWeek(
  logs: { userId: string; createdAt: Date }[]
): Map<string, number> {
  const today = groupDay(new Date());
  const days = new Map<string, Set<string>>();
  for (const l of logs) {
    const day = groupDay(l.createdAt);
    if (!sameGroupWeek(day, today)) continue;
    if (!days.has(l.userId)) days.set(l.userId, new Set());
    days.get(l.userId)!.add(day);
  }
  return new Map([...days.entries()].map(([u, set]) => [u, set.size]));
}

/** Both days ("YYYY-MM-DD") inside the same Monday-anchored week? */
function sameGroupWeek(a: string, b: string): boolean {
  return mondayOf(a) === mondayOf(b);
}
function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`); // noon dodges DST edges
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// ── PRs ─────────────────────────────────────────────────────────────────────

export async function setPr(userId: string, raw: z.input<typeof fitnessPrInput>) {
  // Defaults land here (not via zod .default()) because parseBody's generic
  // resolves ZodDefault schemas to their input type.
  const input = { ...raw, reps: raw.reps ?? 1, unit: raw.unit ?? "lb" };
  const liftKey = normalizeLift(input.lift);
  const e1rm = e1rmLb(input.weight, input.reps, input.unit);
  const prev = await db.fitnessPr.findFirst({
    where: { userId, liftKey },
    orderBy: { e1rm: "desc" },
  });
  if (prev && prev.e1rm >= e1rm) {
    throw new HttpError(
      400,
      `The ledger already shows ${prDisplay(prev.weight, prev.reps, prev.unit)} (${Math.round(prev.e1rm)} e1RM). That's not a PR, that's a Tuesday.`
    );
  }
  const pr = await withOutbox(
    (tx) =>
      tx.fitnessPr.create({
        data: {
          userId,
          lift: input.lift,
          liftKey,
          weight: input.weight,
          reps: input.reps,
          unit: input.unit,
          e1rm,
          note: input.note ?? null,
        },
      }),
    (p) => ({
      type: "fitness.pr.set",
      payload: {
        prId: p.id,
        userId,
        lift: input.lift,
        liftKey,
        display: prDisplay(input.weight, input.reps, input.unit),
        e1rm,
        isFirst: !prev,
      },
    })
  );
  return { pr, prev, e1rm };
}

// ── The live Discord card ───────────────────────────────────────────────────

/**
 * Rewrite a program card's status line in place (runners + sessions). Fire
 * and forget from every mutation — no-ops when the bot is off or the card
 * was never posted.
 */
export async function refreshPlanCard(planId: string): Promise<void> {
  try {
    const [running, sessions] = await Promise.all([
      db.fitnessAdoption.count({ where: { planId } }),
      db.fitnessLog.count({ where: { planId } }),
    ]);
    const { editTrackedMessage } = await import("@/lib/discord/messageState");
    await editTrackedMessage("fitnessplan", planId, { status: pumpStatus(running, sessions) });
  } catch (err) {
    console.error(`[fitness] refreshPlanCard failed for ${planId}`, err);
  }
}
