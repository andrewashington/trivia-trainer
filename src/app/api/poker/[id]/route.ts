import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { buildTableView } from "@/modules/poker/server";

type Ctx = { params: { id: string } };

/**
 * GET — full table state for the current user, with secrets stripped. This is
 * also where lazy timeout advancement runs (inside buildTableView): loading
 * the table auto-acts for any player whose clock expired.
 */
export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const table = await buildTableView(params.id, user.id);
  return NextResponse.json({ table });
});
