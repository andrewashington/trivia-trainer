import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

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
  const data = await parseBody(req, mePatch);
  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { id: true, displayName: true, venmoHandle: true },
  });
  return NextResponse.json({ user: updated });
});
