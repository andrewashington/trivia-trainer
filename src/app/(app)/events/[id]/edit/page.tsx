import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EventForm } from "@/modules/events/EventForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const [user, event] = await Promise.all([
    currentUser(),
    db.event.findUnique({ where: { id: params.id } }),
  ]);
  if (!event) notFound();
  if (!user || (user.id !== event.creatorId && user.role !== "admin")) {
    redirect(`/events/${event.id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit event" accentBg="bg-accent-blue text-white" />
      <EventForm event={event} />
    </div>
  );
}
