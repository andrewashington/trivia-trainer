import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { askArchive } from "@/modules/discord-stats/ask";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ question: z.string().min(1).max(400) });

/** Ask the Archive — RAG Q&A over the full Discord history. Members only. */
export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const { question } = await parseBody(req, schema);
  const result = await askArchive(question);
  return NextResponse.json(result);
});
