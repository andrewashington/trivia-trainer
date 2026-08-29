import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { HttpError } from "@/lib/session";
import { QUOTES } from "./quotes";
import { WORD_LIST } from "./words";
import {
  applyStrokeDeltas,
  assertLogSane,
  buildWorkout,
  dailyPassage,
  isCleared,
  isRated,
  markWasWeak,
  pickTargets,
  scoreRun,
  userMedianLatency,
  utcDateKey,
  utcDayNumber,
  wordsForConfig,
  type KeyRow,
  type RunConfig,
  type Stroke,
  type WorkoutPiece,
} from "./engine";
import type { SessionSubmit } from "./schema";

const MAX_WPM = 250;

function requirePlaced(placed: boolean) {
  if (!placed) throw new HttpError(403, "placement_required");
}

async function profile(userId: string) {
  return db.typingProfile.findUnique({ where: { userId } });
}

export async function isPlaced(userId: string): Promise<boolean> {
  const p = await profile(userId);
  return !!p?.placementCompletedAt;
}

export async function getOrCreateWorkout(userId: string) {
  requirePlaced(await isPlaced(userId));
  const date = utcDateKey();
  const existing = await db.typingWorkout.findUnique({ where: { userId_date: { userId, date } } });
  if (existing) return existing;
  const stats = await db.typingKeyStat.findMany({ where: { userId } });
  const targets = pickTargets(stats);
  const plan = buildWorkout({ date, targets, quotePack: QUOTES });
  return db.typingWorkout.create({
    data: { userId, date, pieces: plan.pieces as unknown as Prisma.InputJsonValue },
  });
}

export async function getOrCreateDaily(date = utcDateKey()) {
  const existing = await db.typingDaily.findUnique({ where: { date } });
  if (existing) return existing;
  const passage = dailyPassage({ date, wordList: WORD_LIST, quotePack: QUOTES });
  try {
    return await db.typingDaily.create({
      data:
        passage.kind === "words"
          ? { date, kind: "words", words: passage.words }
          : { date, kind: "quote", quoteId: passage.quoteId },
    });
  } catch {
    const raced = await db.typingDaily.findUnique({ where: { date } });
    if (!raced) throw new HttpError(500, "Could not create today's race.");
    return raced;
  }
}

export function dailyWords(row: { kind: string; words: Prisma.JsonValue; quoteId: string | null }): string[] {
  if (row.kind === "quote" && row.quoteId) {
    const q = QUOTES.find((x) => x.id === row.quoteId);
    return q ? q.text.split(/\s+/) : [];
  }
  return Array.isArray(row.words) ? (row.words as string[]) : [];
}

export async function getMe(userId: string) {
  const [p, stats, badges, recent] = await Promise.all([
    profile(userId),
    db.typingKeyStat.findMany({ where: { userId } }),
    db.typingBadge.findMany({ where: { userId } }),
    db.typingSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const placed = !!p?.placementCompletedAt;
  const workout = placed ? await getOrCreateWorkout(userId) : null;
  const daily = placed ? await getOrCreateDaily() : null;
  const official = placed
    ? await db.typingDailyResult.findUnique({
        where: { userId_date: { userId, date: utcDateKey() } },
      })
    : null;
  return {
    placed,
    profile: p,
    stats,
    badges: badges.map((b) => b.badgeKey),
    recent,
    workout,
    daily: daily
      ? {
          date: daily.date,
          kind: daily.kind,
          words: dailyWords(daily),
          official,
        }
      : null,
    targets: pickTargets(stats),
  };
}

export async function getLeaderboard(board: "daily" | "alltime", date = utcDateKey()) {
  if (board === "daily") {
    const rows = await db.typingDailyResult.findMany({
      where: { date },
      orderBy: [{ wpm: "desc" }, { accuracy: "desc" }],
    });
    const users = await names(rows.map((r) => r.userId));
    return rows.map((r) => ({
      userId: r.userId,
      displayName: users.get(r.userId)?.displayName ?? "Someone",
      avatarUrl: users.get(r.userId)?.avatarUrl ?? null,
      wpm: r.wpm,
      accuracy: r.accuracy,
    }));
  }
  const profiles = await db.typingProfile.findMany({
    where: { bestStandardWpm: { not: null } },
    orderBy: [{ bestStandardWpm: "desc" }, { bestStandardAccuracy: "desc" }],
  });
  const users = await names(profiles.map((p) => p.userId));
  return profiles.map((p) => ({
    userId: p.userId,
    displayName: users.get(p.userId)?.displayName ?? "Someone",
    avatarUrl: users.get(p.userId)?.avatarUrl ?? null,
    wpm: p.bestStandardWpm ?? 0,
    accuracy: p.bestStandardAccuracy ?? 0,
  }));
}

async function names(ids: string[]) {
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

function validateDuration(config: RunConfig, durationMs: number) {
  if (config.mode === "time") {
    const want = (config.durationSec ?? 60) * 1000;
    if (Math.abs(durationMs - want) > 2000) throw new HttpError(400, "Duration mismatch.");
  }
}

export async function submitSession(userId: string, displayName: string, body: SessionSubmit) {
  const existing = await db.typingSession.findUnique({ where: { id: body.id } });
  if (existing) return { session: existing, replay: true as const, newBadges: [] as string[] };

  const placed = await isPlaced(userId);
  if (body.config.kind !== "placement") requirePlaced(placed);

  const bad = assertLogSane(body.prompt, body.log);
  if (bad) throw new HttpError(400, "Invalid log.");
  validateDuration(body.config, body.durationMs);

  const ratedClaim = isRated(body.config);
  if (body.config.kind === "placement" && !ratedClaim) {
    throw new HttpError(400, "Placement must be a rated 60s run.");
  }

  if (body.config.kind === "daily") {
    const date = body.config.dailyDate ?? utcDateKey();
    const daily = await getOrCreateDaily(date);
    const words = dailyWords(daily);
    if (body.prompt !== words.join(" ")) throw new HttpError(400, "Daily prompt mismatch.");
  }

  if (body.config.kind === "workout") {
    const date = body.config.workoutId ?? utcDateKey();
    const workout = await db.typingWorkout.findUnique({
      where: { userId_date: { userId, date } },
    });
    if (!workout) throw new HttpError(400, "No workout for that day.");
  }

  const score = scoreRun(body.prompt, body.log as Stroke[], body.durationMs);
  if (score.wpm > MAX_WPM) throw new HttpError(400, "Impossible score.");

  const priorStats = await db.typingKeyStat.findMany({ where: { userId } });
  const merged = applyStrokeDeltas(
    new Map(priorStats.map((s) => [s.grapheme, s as KeyRow])),
    body.log as Stroke[]
  );
  markWasWeak(merged.values());

  const date = utcDateKey();
  let officialDaily = false;
  if (body.config.kind === "daily") {
    const already = await db.typingDailyResult.findUnique({
      where: { userId_date: { userId, date: body.config.dailyDate ?? date } },
    });
    officialDaily = !already;
  }

  const newBadges: string[] = [];
  const events: { type: "type.placed" | "type.workout.completed" | "type.daily.finished" | "type.pb" | "type.badge.earned" | "arcade.highscore"; payload: Prisma.InputJsonValue }[] = [];

  const session = await db.$transaction(async (tx) => {
    const created = await tx.typingSession.create({
      data: {
        id: body.id,
        userId,
        kind: body.config.kind,
        mode: body.config.mode,
        durationSec: body.config.durationSec,
        wordCount: body.config.wordCount,
        punctuation: body.config.punctuation,
        numbers: body.config.numbers,
        targetKeys: body.config.targetKeys,
        rated: ratedClaim,
        dailyDate: body.config.dailyDate,
        quoteId: body.config.quoteId,
        workoutId: body.config.workoutId,
        pieceId: body.config.pieceId,
        official: officialDaily,
        seed: body.config.seed,
        wpm: score.wpm,
        rawWpm: score.rawWpm,
        accuracy: score.accuracy,
        correctChars: score.correctChars,
        incorrectChars: score.incorrectChars,
      },
    });

    for (const row of merged.values()) {
      await tx.typingKeyStat.upsert({
        where: { userId_grapheme: { userId, grapheme: row.grapheme } },
        create: {
          userId,
          grapheme: row.grapheme,
          hits: row.hits,
          misses: row.misses,
          latencyEmaMs: row.latencyEmaMs,
          wasWeakAt: row.wasWeakAt ? new Date(row.wasWeakAt) : null,
        },
        update: {
          hits: row.hits,
          misses: row.misses,
          latencyEmaMs: row.latencyEmaMs,
          wasWeakAt: row.wasWeakAt ? new Date(row.wasWeakAt) : null,
        },
      });
    }

    const prof = await tx.typingProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const firstPlacement = body.config.kind === "placement" && !prof.placementCompletedAt;
    const isPb = ratedClaim && score.wpm > (prof.bestStandardWpm ?? 0);

    await tx.typingProfile.update({
      where: { userId },
      data: {
        ...(body.config.kind === "placement"
          ? {
              placementCompletedAt: prof.placementCompletedAt ?? new Date(),
              lastPlacementWpm: score.wpm,
              lastPlacementAccuracy: score.accuracy,
            }
          : {}),
        ...(isPb
          ? {
              bestStandardWpm: score.wpm,
              bestStandardAccuracy: score.accuracy,
              bestStandardSessionId: created.id,
            }
          : {}),
      },
    });

    let workoutJustDone = false;
    if (body.config.kind === "workout" && body.config.pieceId && body.config.workoutId) {
      const workout = await tx.typingWorkout.findUnique({
        where: { userId_date: { userId, date: body.config.workoutId } },
      });
      if (workout && !workout.completedAt) {
        const pieces = workout.pieces as unknown as WorkoutPiece[];
        const nextPieces = pieces.map((p) =>
          p.id === body.config.pieceId ? { ...p, sessionId: created.id } : p
        );
        const done = nextPieces.every((p) => "sessionId" in p && p.sessionId);
        let streak = prof.workoutStreak;
        let last = prof.lastWorkoutDate;
        if (done) {
          const prev = last ? utcDayNumber(last) : null;
          const today = utcDayNumber(body.config.workoutId);
          streak = prev != null && today === prev + 1 ? streak + 1 : 1;
          last = body.config.workoutId;
          workoutJustDone = true;
        }
        await tx.typingWorkout.update({
          where: { id: workout.id },
          data: {
            pieces: nextPieces as unknown as Prisma.InputJsonValue,
            completedAt: done ? new Date() : null,
          },
        });
        if (done) {
          await tx.typingProfile.update({
            where: { userId },
            data: { workoutStreak: streak, lastWorkoutDate: last },
          });
        }
      }
    }

    if (officialDaily) {
      await tx.typingDailyResult.create({
        data: {
          userId,
          date: body.config.dailyDate ?? date,
          sessionId: created.id,
          wpm: score.wpm,
          accuracy: score.accuracy,
        },
      });
    }

    const earned = await tx.typingBadge.findMany({ where: { userId } });
    const have = new Set(earned.map((b) => b.badgeKey));
    const want: string[] = [];
    if (firstPlacement) want.push("placed");
    if (ratedClaim && score.wpm >= 40) want.push("wpm_40");
    if (ratedClaim && score.wpm >= 60) want.push("wpm_60");
    if (ratedClaim && score.wpm >= 80) want.push("wpm_80");
    const streakNow = workoutJustDone
      ? (prof.lastWorkoutDate && utcDayNumber(body.config.workoutId ?? date) === utcDayNumber(prof.lastWorkoutDate) + 1
          ? prof.workoutStreak + 1
          : 1)
      : prof.workoutStreak;
    if (streakNow >= 7) want.push("streak_7");
    if (officialDaily) {
      const better = await tx.typingDailyResult.count({
        where: { date: body.config.dailyDate ?? date, wpm: { gt: score.wpm } },
      });
      if (better === 0) want.push("daily_1");
    }
    const runCount = await tx.typingSession.count({ where: { userId } });
    if (runCount >= 100) want.push("runs_100");
    const median = userMedianLatency([...merged.values()]);
    for (const row of merged.values()) {
      if (isCleared(row, median)) want.push(`cleared_${row.grapheme}`);
    }
    for (const key of want) {
      if (have.has(key)) continue;
      await tx.typingBadge.create({ data: { userId, badgeKey: key } });
      newBadges.push(key);
    }

    let groupRecord = false;
    if (ratedClaim) {
      const top = await tx.arcadeScore.findFirst({
        where: { game: "type" },
        orderBy: { score: "desc" },
        select: { score: true },
      });
      const rounded = Math.round(score.wpm);
      if (rounded > 0 && rounded > (top?.score ?? 0)) {
        groupRecord = true;
        await tx.arcadeScore.create({
          data: { userId, game: "type", score: rounded, meta: { wpm: score.wpm, accuracy: score.accuracy } },
        });
      }
    }

    if (firstPlacement) {
      events.push({
        type: "type.placed",
        payload: { userId, displayName, wpm: score.wpm, accuracy: score.accuracy },
      });
    }
    if (workoutJustDone) {
      events.push({
        type: "type.workout.completed",
        payload: { userId, displayName, date: body.config.workoutId ?? date },
      });
    }
    if (officialDaily) {
      events.push({
        type: "type.daily.finished",
        payload: { userId, displayName, wpm: score.wpm, date: body.config.dailyDate ?? date },
      });
    }
    if (isPb) {
      events.push({
        type: "type.pb",
        payload: { userId, displayName, wpm: score.wpm },
      });
    }
    for (const key of newBadges) {
      events.push({ type: "type.badge.earned", payload: { userId, displayName, badgeKey: key } });
    }
    if (groupRecord) {
      events.push({
        type: "arcade.highscore",
        payload: { userId, displayName, game: "type", score: Math.round(score.wpm) },
      });
    }

    for (const ev of events) {
      await emitOutbox(tx, ev.type, ev.payload);
    }

    return created;
  });

  return { session, replay: false as const, newBadges, score };
}

export function runWords(config: RunConfig): string[] {
  if (config.kind === "daily") return [];
  return wordsForConfig(config, WORD_LIST, QUOTES);
}

export function quoteById(id: string) {
  return QUOTES.find((q) => q.id === id) ?? null;
}
