import { PageHeader } from "@/components/ui";
import { ForgeClient } from "@/modules/fitness/ForgeClient";

export const metadata = { title: "The Forge · The Pump" };
export const dynamic = "force-dynamic";

export default function NewProgramPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="The Forge" icon="dumbbell" accentBg="bg-accent-bronze text-ink" />
      <ForgeClient />
    </div>
  );
}
