import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CanvasBoard, type CanvasStrokeDTO } from "@/modules/canvas/CanvasBoard";

export const metadata = { title: "Canvas" };
export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const recent = await db.canvasStroke.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
    include: { user: { select: { displayName: true } } },
  });

  const initialStrokes: CanvasStrokeDTO[] = recent.reverse().map((s) => ({
    id: s.id,
    tool: s.tool,
    color: s.color,
    size: s.size,
    points: s.points as [number, number][],
    stamp: s.stamp,
    createdAt: s.createdAt.toISOString(),
    userId: s.userId,
    userName: s.user.displayName,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Canvas" icon="sparkles" accentBg="bg-accent-lagoon" />
      <CanvasBoard initialStrokes={initialStrokes} />
    </div>
  );
}
