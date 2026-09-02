import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { clueBankSize } from "@/lib/discord/jeopardy/clues";
import { importStatus, runImport } from "@/lib/discord/jeopardy/import";

export const dynamic = "force-dynamic";

/** GET — clue-bank size + import progress (admin panel → Discord tab). */
export const GET = apiHandler(async () => {
  await requireAdmin();
  return NextResponse.json({ clues: await clueBankSize(), import: importStatus() });
});

/** POST — (re)import the clue bank from GitHub; returns immediately, runs in the background. */
export const POST = apiHandler(async () => {
  await requireAdmin();
  if (importStatus().status === "running") {
    return NextResponse.json({ ok: false, error: "An import is already running." }, { status: 409 });
  }
  void runImport();
  return NextResponse.json({ ok: true });
});
