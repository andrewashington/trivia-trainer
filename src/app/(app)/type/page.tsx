import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { Hub } from "@/modules/type/Hub";

export const metadata = { title: "Type" };
export const dynamic = "force-dynamic";

export default async function TypePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Type" icon="keyboard" accentBg="bg-accent-typewriter" />
      <Hub userId={user.id} />
    </div>
  );
}
