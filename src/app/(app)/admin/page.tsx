import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MemberManager } from "@/modules/admin/MemberManager";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") redirect("/");

  const members = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, displayName: true, role: true },
  });

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="🔧 Admin" accentBg="bg-accent-grape text-white" />
      <MemberManager members={members} selfId={user.id} />
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
