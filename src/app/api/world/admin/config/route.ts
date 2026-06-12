import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { setConfig } from "@/modules/world/content";

const putInput = z.object({
  key: z.enum(["cosmetics", "dialog", "houses"]),
  value: z.unknown(),
});

/** GET /api/world/admin/config — all WorldConfig override documents. */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const rows = await db.worldConfig.findMany();
  return NextResponse.json({
    config: Object.fromEntries(rows.map((r) => [r.key, r.value])),
  });
});

/** PUT /api/world/admin/config — upsert one override document. */
export const PUT = apiHandler(async (req: Request) => {
  await requireAdmin();
  const { key, value } = await parseBody(req, putInput);
  await setConfig(key, value);
  return NextResponse.json({ ok: true });
});
