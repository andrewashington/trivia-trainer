import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";

// Channel-scoped game chat ("tanks:<gameId>", later "snake:…", "trivia:…").
// Any signed-in member may read or post — spectators are the crowd.

const CHANNEL_RE = /^[a-z]+:[A-Za-z0-9_-]{1,40}$/;
const MAX_MESSAGES = 60;

const userSelect = { select: { id: true, displayName: true, avatarUrl: true } };

function messagePayload(m: {
  id: string;
  text: string;
  createdAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null };
}) {
  return {
    id: m.id,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    user: m.user,
  };
}

export type GameChatMessagePayload = ReturnType<typeof messagePayload>;

export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const channel = new URL(req.url).searchParams.get("channel") ?? "";
  if (!CHANNEL_RE.test(channel)) throw new HttpError(400, "Bad channel.");

  const rows = await db.gameChatMessage.findMany({
    where: { channel },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
    include: { user: userSelect },
  });
  return NextResponse.json({ messages: rows.reverse().map(messagePayload) });
});

const postSchema = z.object({
  channel: z.string().regex(CHANNEL_RE, "Bad channel."),
  text: z.string().trim().min(1, "Say something.").max(200, "Keep it under 200 characters."),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { channel, text } = await parseBody(req, postSchema);

  const message = await db.gameChatMessage.create({
    data: { channel, userId: user.id, text },
    include: { user: userSelect },
  });
  return NextResponse.json({ message: messagePayload(message) });
});
