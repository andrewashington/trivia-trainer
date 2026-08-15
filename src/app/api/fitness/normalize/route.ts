import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { normalizeRequest } from "@/modules/fitness/schema";
import { normalizePlan } from "@/modules/fitness/normalize";

// The Forge: paste/link in, editable draft out. Nothing is saved until
// POST /api/fitness/plans — the human approves the draft first.
export const maxDuration = 60; // the model reads whole programs; give it room

export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const input = await parseBody(req, normalizeRequest);
  const draft = await normalizePlan(input);
  return NextResponse.json({ draft });
});
