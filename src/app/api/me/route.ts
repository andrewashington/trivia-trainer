import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { avatarUrlFromConfig, parseAvatarConfig } from "@/lib/avatar";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    venmoHandle: user.venmoHandle,
  });
});

const mePatch = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  // Structured Open Peeps choices; the URL is rebuilt server-side so we
  // never trust a client-supplied avatarUrl. Anything malformed is dropped.
  avatarConfig: z.unknown().optional(),
  venmoHandle: z
    .string()
    .trim()
    .max(60)
    .regex(/^@?[\w.-]*$/, "Just the handle, like @your-name")
    .transform((v) => v.replace(/^@/, "") || null)
    .nullish(),
});

export const PATCH = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { avatarConfig, ...rest } = await parseBody(req, mePatch);

  // Validate + rebuild the avatar server-side; ignore an unparseable config.
  const config = avatarConfig !== undefined ? parseAvatarConfig(avatarConfig) : undefined;

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...rest,
      ...(config ? { avatarConfig: config, avatarUrl: avatarUrlFromConfig(config) } : {}),
    },
    select: { id: true, displayName: true, avatarUrl: true, venmoHandle: true },
  });
  return NextResponse.json({ user: updated });
});
