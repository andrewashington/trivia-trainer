import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { HttpError } from "@/lib/session";
import { buildTableView } from "@/modules/poker/server";
import { PokerTableView } from "@/modules/poker/PokerTableView";

export const metadata = { title: "Poker" };
export const dynamic = "force-dynamic";

export default async function PokerTablePage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  let table;
  try {
    table = await buildTableView(params.id, user.id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={table.name}
        icon="crown"
        accentBg="bg-accent-baize"
        action={
          <Link href="/poker" className="font-mono text-xs font-bold uppercase tracking-wide underline">
            ← All tables
          </Link>
        }
      />
      <p className="font-mono text-xs text-ink/60">
        {table.smallBlind}/{table.bigBlind} blinds · {table.clockHours}h clock
      </p>
      <PokerTableView initial={table} meId={user.id} />
    </div>
  );
}
