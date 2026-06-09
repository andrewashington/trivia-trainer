import { EventForm } from "@/modules/events/EventForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New event" accentBg="bg-accent-blue text-white" />
      <EventForm />
    </div>
  );
}
