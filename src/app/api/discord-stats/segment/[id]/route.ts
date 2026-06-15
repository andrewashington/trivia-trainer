import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Full text of one conversation segment — backs the galaxy's click-to-read. */
export const GET = apiHandler(async (_req: Request, ctx: { params: { id: string } }) => {
  await requireUser();
  const id = ctx.params.id;
  const [seg] = await db.$queryRaw<
    { content: string; channel_id: string; guild_id: string | null; start_at: Date; name: string | null }[]
  >`
    SELECT s.content, s.channel_id, s.guild_id, s.start_at, c.name
    FROM discord_archive.message_segments s
    LEFT JOIN discord_archive.channels c ON c.id = s.channel_id
    WHERE s.id = ${id}
  `;
  if (!seg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    text: seg.content,
    channelName: seg.name,
    channelId: seg.channel_id,
    guildId: seg.guild_id,
    at: seg.start_at.toISOString(),
  });
});
