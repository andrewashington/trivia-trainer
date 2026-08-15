import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { fitnessPrInput } from "@/modules/fitness/schema";
import { setPr } from "@/modules/fitness/service";

// Claim a PR. Anything that doesn't beat the ledger's best e1RM for that
// lift is rejected with the taunt it deserves (see service.setPr).
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, fitnessPrInput);
  const { pr, prev, e1rm } = await setPr(user.id, input);
  return NextResponse.json({ pr, previousBest: prev?.e1rm ?? null, e1rm }, { status: 201 });
});
