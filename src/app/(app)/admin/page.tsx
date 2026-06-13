import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { getConfig } from "@/lib/appConfig";
import { allPromos } from "@/lib/coinRewards";
import { PageHeader } from "@/components/ui";
import { AdminConsole } from "@/modules/admin/AdminConsole";
import { type FeedbackContext } from "@/modules/admin/FeedbackList";
import { KNOB_REGISTRY } from "@/modules/admin/knobs";
import { DISCORD_EVENTS } from "@/modules/admin/discordEvents";
import { feedMode } from "@/lib/discord/bot";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") redirect("/");

  const [members, feedback, promos, discordDisabled, knobOverrides] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, displayName: true, role: true, coins: true },
    }),
    db.feedback.findMany({
      orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { displayName: true } } },
    }),
    allPromos(),
    getConfig<{ disabled?: string[] }>("discord.feeds"),
    getConfig<Record<string, Record<string, unknown>>>("knobs"),
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

  const mode = feedMode();
  const stats = {
    circulation: members.reduce((s, m) => s + m.coins, 0),
    memberCount: members.length,
    openFeedback: feedbackItems.filter((f) => !f.resolvedAt).length,
    feedMode: mode === "off" ? "off" : mode,
  };

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Admin" icon="settings-cog" accentBg="bg-accent-grape text-white" />
      <AdminConsole
        selfId={user.id}
        members={members}
        feedback={feedbackItems}
        promos={promos}
        discord={{ events: DISCORD_EVENTS, disabled: discordDisabled?.disabled ?? [], mode }}
        knobs={{ games: KNOB_REGISTRY, overrides: knobOverrides ?? {} }}
        stats={stats}
      />
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
