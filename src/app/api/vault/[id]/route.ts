import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { vaultEntryPatch } from "@/modules/vault/schema";

type Ctx = { params: { id: string } };

async function findEntry(id: string) {
  const entry = await db.vaultEntry.findUnique({ where: { id } });
  if (!entry) throw new HttpError(404, "Vault entry not found.");
  return entry;
}

// Shared credentials go stale while their creator is on vacation, so
// ANY member may edit an entry (unlike other modules). Deletion stays
// owner-or-admin.
export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findEntry(params.id);
  const data = await parseBody(req, vaultEntryPatch);

  const { password, ...rest } = data;
  const entry = await withOutbox(
    (tx) =>
      tx.vaultEntry.update({
        where: { id: existing.id },
        data: {
          ...rest,
          ...(password ? { passwordEnc: encryptSecret(password) } : {}),
        },
        select: { id: true, siteName: true },
      }),
    (e) => ({
      type: "vault.updated",
      payload: { entryId: e.id, siteName: e.siteName, editedBy: user.id },
    })
  );
  return NextResponse.json({ entry });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findEntry(params.id);
  assertCanModify(user, existing.creatorId);

  await withOutbox(
    (tx) => tx.vaultEntry.delete({ where: { id: existing.id } }),
    () => ({
      type: "vault.deleted",
      payload: { entryId: existing.id, siteName: existing.siteName, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
