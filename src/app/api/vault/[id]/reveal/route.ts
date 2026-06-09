import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

// The only place a vault password ever leaves the server.
export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  const entry = await db.vaultEntry.findUnique({ where: { id: params.id } });
  if (!entry) throw new HttpError(404, "Vault entry not found.");
  return NextResponse.json({ password: decryptSecret(entry.passwordEnc) });
});
