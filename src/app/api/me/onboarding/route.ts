import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isDicebearUrl } from "@/lib/avatar";
import { modules } from "@/modules/registry";

const onboardingInput = z.discriminatedUnion("action", [
  // Finish the first-login wizard (optionally setting a name + avatar).
  z.object({
    action: z.literal("complete"),
    displayName: z.string().trim().min(1).max(100).optional(),
    avatarUrl: z
      .string()
      .max(300)
      .refine(isDicebearUrl, "Avatars must come from DiceBear.")
      .optional(),
  }),
  // Dismiss one module's first-visit intro card.
  z.object({
    action: z.literal("intro-seen"),
    module: z
      .string()
      .refine((k) => modules.some((m) => m.key === k), "Unknown module."),
  }),
]);

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, onboardingInput);

  if (input.action === "complete") {
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        onboardedAt: user.onboardedAt ?? new Date(),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      },
      select: { id: true, displayName: true, avatarUrl: true, onboardedAt: true },
    });
    return NextResponse.json({ user: updated });
  }

  // intro-seen — idempotent: re-dismissing is a no-op.
  if (!user.introsSeen.includes(input.module)) {
    await db.user.update({
      where: { id: user.id },
      data: { introsSeen: { push: input.module } },
    });
  }
  return NextResponse.json({ ok: true });
});
