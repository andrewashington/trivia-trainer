import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MemberManager } from "@/modules/admin/MemberManager";
import { FeedbackList, type FeedbackContext } from "@/modules/admin/FeedbackList";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") redirect("/");

  const [members, feedback] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, displayName: true, role: true },
    }),
    db.feedback.findMany({
      orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { displayName: true } } },
    }),
  ]);
  const feedbackItems = feedback.map((f) => ({
    id: f.id,
    kind: f.kind,
    severity: f.severity,
    message: f.message,
    path: f.path,
    userAgent: f.userAgent,
    context: (f.context as FeedbackContext | null) ?? null,
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    userName: f.user.displayName,
  }));

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Admin" icon="settings-cog" accentBg="bg-accent-grape text-white" />
      <MemberManager members={members} selfId={user.id} />
      <FeedbackList items={feedbackItems} />
      <form action={doSignOut} className="pt-4">
        <button
          type="submit"
          className="brutal-press w-full border-3 border-ink bg-card px-4 py-3 font-display font-bold uppercase tracking-wide shadow-brutal"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
