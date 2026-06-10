import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { ProfileForm } from "@/components/ProfileForm";
import { parseAvatarConfig } from "@/lib/avatar";
import { ContactCardForm } from "@/modules/contacts/ContactCardForm";

export const metadata = { title: "You" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // The same card the People tab shows — edited here, in one place.
  const card = await db.contactCard.findUnique({
    where: { userId: user.id },
    include: { relatedParties: true },
  });

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user.displayName} src={user.avatarUrl} size="lg" />
          <div>
            <p className="font-display text-xl font-bold">{user.displayName}</p>
            <p className="text-sm text-ink/60">{user.email}</p>
          </div>
        </div>
        <div className="mt-4">
          <Badge className={user.role === "admin" ? "bg-accent-grape text-white" : "bg-paper"}>
            {user.role}
          </Badge>
        </div>
      </Card>

      <ProfileForm
        initialName={user.displayName}
        initialVenmo={user.venmoHandle ? `@${user.venmoHandle}` : ""}
        initialAvatarConfig={parseAvatarConfig(user.avatarConfig)}
      />

      <div id="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 border-2 border-ink bg-accent-pink px-3 py-1 font-display text-lg font-bold shadow-brutal-sm">
            <PixelIcon name="contact" size={18} />
            My contact card
          </h2>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wide text-ink/60 no-underline hover:text-ink"
          >
            Shown on the People tab
            <PixelIcon name="chevron-right" size={13} />
          </Link>
        </div>
        <ContactCardForm
          userId={user.id}
          initial={{
            phone: card?.phone ?? "",
            email: card?.email ?? "",
            birthday: card?.birthday ? card.birthday.toISOString().slice(0, 10) : "",
            address: card?.address ?? "",
            notes: card?.notes ?? "",
            relatedParties: (card?.relatedParties ?? []).map((p) => ({
              name: p.name,
              relation: p.relation ?? "",
              phone: p.phone ?? "",
              email: p.email ?? "",
            })),
          }}
        />
      </div>

      <form action={doSignOut}>
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
