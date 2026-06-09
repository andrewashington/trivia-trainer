import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Everyone's contact cards (members without a card appear with null
// fields so the directory always shows the whole group).
export const GET = apiHandler(async () => {
  await requireUser();
  const users = await db.user.findMany({
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      email: true,
      contactCard: { include: { relatedParties: true } },
    },
  });
  return NextResponse.json({ people: users });
});
