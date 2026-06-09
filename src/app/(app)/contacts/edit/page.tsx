import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ContactCardForm } from "@/modules/contacts/ContactCardForm";

export const metadata = { title: "My card" };
export const dynamic = "force-dynamic";

export default async function EditContactPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const card = await db.contactCard.findUnique({
    where: { userId: user.id },
    include: { relatedParties: true },
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="My card" accentBg="bg-accent-pink" />
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
  );
}
