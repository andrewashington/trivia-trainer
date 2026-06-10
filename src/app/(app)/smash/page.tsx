import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Badge, EmptyState, UserLink } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddDeckForm } from "@/modules/smash/AddDeckForm";

export const metadata = { title: "Smash or Pass" };
export const dynamic = "force-dynamic";

export default async function SmashPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const decks = await db.smashDeck.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      cards: {
        select: { votes: { where: { userId: user.id }, select: { id: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Smash or Pass"
        icon="fire"
        accentBg="bg-accent-smooch text-white"
        addLabel="Deck"
        tagline="Deal a deck, render your verdicts, see who agrees"
      >
        <AddDeckForm />
      </ModuleHeader>

      {decks.length === 0 ? (
        <EmptyState
          icon="fire"
          title="No decks dealt yet"
          hint="Pick a theme, list some names, and let the judging begin."
        />
      ) : (
        <ul className="space-y-3">
          {decks.map((deck) => {
            const cardCount = deck.cards.length;
            const judged = deck.cards.filter((c) => c.votes.length > 0).length;
            const done = cardCount > 0 && judged >= cardCount;
            return (
              <li key={deck.id} className="brutal-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/smash/${deck.id}`}
                    className="font-display text-lg font-bold leading-tight text-ink no-underline hover:text-accent-smooch"
                  >
                    {deck.title}
                  </Link>
                  <Badge className="bg-card">{cardCount} cards</Badge>
                  {done ? (
                    <Badge className="bg-accent-smooch text-white">VERDICTS IN ✓</Badge>
                  ) : judged > 0 ? (
                    <Badge className="bg-accent-yellow">
                      {judged}/{cardCount} judged
                    </Badge>
                  ) : (
                    <Badge className="bg-card">unjudged</Badge>
                  )}
                </div>
                {deck.detail && <p className="mt-1 text-sm text-ink/70">{deck.detail}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/40">
                    dealt by{" "}
                    <UserLink
                      userId={deck.creator.id}
                      name={deck.creator.displayName}
                      avatarUrl={deck.creator.avatarUrl}
                      size="sm"
                    />
                  </span>
                  <Link
                    href={`/smash/${deck.id}`}
                    className="brutal-press border-2 border-ink bg-accent-smooch px-2 py-1 font-mono text-[10px] font-bold uppercase text-white no-underline shadow-brutal-sm"
                  >
                    {done ? "See results →" : judged > 0 ? "Keep judging →" : "Start judging →"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
