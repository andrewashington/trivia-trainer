import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { avatarUrlFromConfig, parseAvatarConfig } from "@/lib/avatar";
import { modules } from "@/modules/registry";

// One-off announcement keys that ride introsSeen but aren't modules.
const EXTRA_SEEN_KEYS = ["world-banner"];

const onboardingInput = z.discriminatedUnion("action", [
  // Finish the first-login wizard (optionally setting a name + avatar).
  z.object({
    action: z.literal("complete"),
    displayName: z.string().trim().min(1).max(100).optional(),
    // Structured Open Peeps config; URL rebuilt server-side (see /api/me).
    avatarConfig: z.unknown().optional(),
  }),
  // Dismiss one module's first-visit intro card (or a one-off
  // announcement key like the world-beta home banner).
  z.object({
    action: z.literal("intro-seen"),
    module: z
      .string()
      .refine(
        (k) => modules.some((m) => m.key === k) || EXTRA_SEEN_KEYS.includes(k),
        "Unknown module."
      ),
  }),
]);

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, onboardingInput);

  if (input.action === "complete") {
    const config = input.avatarConfig !== undefined ? parseAvatarConfig(input.avatarConfig) : null;
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        onboardedAt: user.onboardedAt ?? new Date(),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(config ? { avatarConfig: config, avatarUrl: avatarUrlFromConfig(config) } : {}),
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
