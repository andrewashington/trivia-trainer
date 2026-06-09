import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { vaultEntryInput } from "@/modules/vault/schema";

// List never includes passwords — reveal is a separate per-entry call.
export const GET = apiHandler(async () => {
  await requireUser();
  const entries = await db.vaultEntry.findMany({
    orderBy: { siteName: "asc" },
    select: {
      id: true,
      siteName: true,
      siteUrl: true,
      username: true,
      notes: true,
      updatedAt: true,
      creator: { select: { id: true, displayName: true } },
      creatorId: true,
    },
  });
  return NextResponse.json({ entries });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, vaultEntryInput);

  const entry = await withOutbox(
    (tx) =>
      tx.vaultEntry.create({
        data: {
          creatorId: user.id,
          siteName: data.siteName,
          siteUrl: data.siteUrl ?? null,
          username: data.username,
          passwordEnc: encryptSecret(data.password),
          notes: data.notes ?? null,
        },
        select: { id: true, siteName: true },
      }),
    // Never put the secret (or anything derived from it) in the outbox.
    (e) => ({
      type: "vault.created",
      payload: { entryId: e.id, siteName: e.siteName, createdBy: user.id },
    })
  );

  return NextResponse.json({ entry }, { status: 201 });
});
