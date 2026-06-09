import type { RevealPrompt, RevealSubmission, User } from "@prisma/client";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";

type PromptWithSubs = RevealPrompt & {
  creator: { id: string; displayName: string };
  submissions: (RevealSubmission & {
    user: { id: string; displayName: string };
  })[];
};

/**
 * Everything a client may know about a prompt. This shape is the
 * concealment boundary: raw submissions never cross it. Open prompts
 * expose only who-has-submitted counts; revealed prompts expose only
 * computed aggregates plus the viewer's own delta.
 */
export type PromptView = {
  id: string;
  type: "rank" | "sealed" | "oracle";
  status: "open" | "revealed";
  title: string;
  creatorName: string;
  isMine: boolean;
  isAdmin: boolean;
  createdAt: string;
  deadline: string | null;
  unlockAt: string | null;
  items: string[] | null;
  scaleMax: number | null;
  // open-state info
  submittedCount: number;
  memberCount: number;
  minSubmitters: number;
  iSubmitted: boolean;
  // revealed-state aggregates (null until revealed)
  results: RankResults | OracleResults | SealedResults | null;
};

export type RankResults = {
  kind: "rank";
  consensus: { label: string; meanRank: number }[];
  mostOff: { name: string; delta: number } | null;
  myDelta: number | null;
};

export type OracleResults = {
  kind: "oracle";
  average: number;
  median: number;
  count: number;
  myValue: number | null;
  myDistance: number | null;
};

export type SealedResults = {
  kind: "sealed";
  body: string;
};

function rankResults(prompt: PromptWithSubs, viewerId: string): RankResults {
  const items = (prompt.items as string[]) ?? [];
  const orders = prompt.submissions.map((s) => ({
    userId: s.userId,
    name: s.user.displayName,
    order: (s.payload as { order: number[] }).order,
  }));

  // Consensus: mean position per item, ascending.
  const meanRank = items.map((_, idx) => {
    const positions = orders.map((o) => o.order.indexOf(idx));
    return positions.reduce((a, b) => a + b, 0) / Math.max(1, positions.length);
  });
  const consensusIdx = items
    .map((_, idx) => idx)
    .sort((a, b) => meanRank[a] - meanRank[b]);
  const consensusPos = new Map(consensusIdx.map((itemIdx, pos) => [itemIdx, pos]));

  // Footrule distance from consensus per submitter.
  const deltas = orders.map((o) => ({
    userId: o.userId,
    name: o.name,
    delta: o.order.reduce(
      (sum, itemIdx, pos) => sum + Math.abs(pos - (consensusPos.get(itemIdx) ?? 0)),
      0
    ),
  }));
  const mostOff = deltas.reduce<(typeof deltas)[number] | null>(
    (worst, d) => (worst === null || d.delta > worst.delta ? d : worst),
    null
  );

  return {
    kind: "rank",
    consensus: consensusIdx.map((idx) => ({
      label: items[idx],
      meanRank: Math.round(meanRank[idx] * 10) / 10 + 1,
    })),
    mostOff: mostOff ? { name: mostOff.name, delta: mostOff.delta } : null,
    myDelta: deltas.find((d) => d.userId === viewerId)?.delta ?? null,
  };
}

function oracleResults(prompt: PromptWithSubs, viewerId: string): OracleResults {
  const values = prompt.submissions.map((s) => (s.payload as { value: number }).value);
  const sortedVals = [...values].sort((a, b) => a - b);
  const average =
    Math.round((values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) * 10) / 10;
  const mid = Math.floor(sortedVals.length / 2);
  const median =
    sortedVals.length % 2 === 1
      ? sortedVals[mid]
      : (sortedVals[mid - 1] + sortedVals[mid]) / 2;
  const mine = prompt.submissions.find((s) => s.userId === viewerId);
  const myValue = mine ? (mine.payload as { value: number }).value : null;
  return {
    kind: "oracle",
    average,
    median,
    count: values.length,
    myValue,
    myDistance: myValue === null ? null : Math.round(Math.abs(myValue - average) * 10) / 10,
  };
}

function shouldReveal(prompt: PromptWithSubs, memberCount: number, now: Date): boolean {
  if (prompt.status === "revealed") return false;
  if (prompt.type === "sealed") {
    return prompt.unlockAt !== null && prompt.unlockAt <= now;
  }
  const subs = prompt.submissions.length;
  if (subs >= Math.min(prompt.minSubmitters, memberCount) && subs >= memberCount) {
    return true; // everyone's in
  }
  if (
    prompt.deadline !== null &&
    prompt.deadline <= now &&
    subs >= Math.min(prompt.minSubmitters, memberCount)
  ) {
    return true; // deadline hit with enough cover
  }
  return false;
}

/**
 * Lazy reveal sweep — no cron infrastructure: any request that lists
 * prompts first flips the ones whose trigger has fired. Each flip
 * writes its outbox event transactionally like every other mutation.
 */
export async function sweepReveals(): Promise<void> {
  const now = new Date();
  const [open, memberCount] = await Promise.all([
    db.revealPrompt.findMany({
      where: { status: "open" },
      include: {
        creator: { select: { id: true, displayName: true } },
        submissions: { include: { user: { select: { id: true, displayName: true } } } },
      },
    }),
    db.user.count(),
  ]);

  for (const prompt of open) {
    if (!shouldReveal(prompt, memberCount, now)) continue;
    await withOutbox(
      (tx) =>
        tx.revealPrompt.update({
          where: { id: prompt.id, status: "open" },
          data: { status: "revealed", revealedAt: now },
        }),
      () => ({
        type: "reveal.revealed",
        payload: { promptId: prompt.id, title: prompt.title, type: prompt.type },
      })
    ).catch(() => {
      // Concurrent sweep already flipped it — fine.
    });
  }
}

export function toPromptView(
  prompt: PromptWithSubs,
  viewer: User,
  memberCount: number
): PromptView {
  const revealed = prompt.status === "revealed";

  let results: PromptView["results"] = null;
  if (revealed) {
    if (prompt.type === "rank") results = rankResults(prompt, viewer.id);
    else if (prompt.type === "oracle") results = oracleResults(prompt, viewer.id);
    else {
      const sub = prompt.submissions[0];
      results = {
        kind: "sealed",
        body: sub ? (sub.payload as { body: string }).body : "",
      };
    }
  }

  return {
    id: prompt.id,
    type: prompt.type,
    status: prompt.status,
    title: prompt.title,
    creatorName: prompt.creator.displayName,
    isMine: prompt.creatorId === viewer.id,
    isAdmin: viewer.role === "admin",
    createdAt: prompt.createdAt.toISOString(),
    deadline: prompt.deadline?.toISOString() ?? null,
    unlockAt: prompt.unlockAt?.toISOString() ?? null,
    items: (prompt.items as string[] | null) ?? null,
    scaleMax: prompt.scaleMax,
    submittedCount: prompt.type === "sealed" ? 0 : prompt.submissions.length,
    memberCount,
    minSubmitters: prompt.minSubmitters,
    iSubmitted: prompt.submissions.some((s) => s.userId === viewer.id),
    results,
  };
}
