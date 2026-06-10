import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { sweepReveals } from "@/modules/reveal/engine";

type Ctx = { params: { id: string } };

/**
 * Toggle the caller's early-unseal ballot on a sealed prompt. When the
 * threshold is met, the regular reveal sweep flips the prompt (with its
 * usual outbox event) — same path as a date unlock.
 */
export const PUT = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const prompt = await db.revealPrompt.findUnique({
    where: { id: params.id },
    include: { unlockVotes: true },
  });
  if (!prompt) throw new HttpError(404, "Prompt not found.");
  if (prompt.type !== "sealed") {
    throw new HttpError(400, "Only sealed prompts can be vote-unsealed.");
  }
  if (prompt.status === "revealed") {
    throw new HttpError(400, "Already unsealed.");
  }
  if (prompt.unlockVotesNeeded === null) {
    throw new HttpError(400, "This seal only opens on its date.");
  }

  const mine = prompt.unlockVotes.find((v) => v.userId === user.id);
  if (mine) {
    await db.revealUnlockVote.delete({ where: { id: mine.id } });
    return NextResponse.json({ voted: false, count: prompt.unlockVotes.length - 1 });
  }

  await db.revealUnlockVote.create({
    data: { promptId: prompt.id, userId: user.id },
  });
  await sweepReveals(); // threshold met → reveals via the normal path
  return NextResponse.json({ voted: true, count: prompt.unlockVotes.length + 1 });
});
