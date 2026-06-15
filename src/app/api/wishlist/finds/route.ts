import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { coolFindInput } from "@/modules/wishlist/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const finds = await db.coolFind.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return NextResponse.json({ finds });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, coolFindInput);
  const find = await db.coolFind.create({
    data: {
      userId: user.id,
      title: data.title,
      url: data.url,
      category: data.category,
      note: data.note ?? null,
      imageUrl: data.imageUrl ?? null,
      siteName: data.siteName ?? null,
    },
  });
  return NextResponse.json({ find }, { status: 201 });
});
