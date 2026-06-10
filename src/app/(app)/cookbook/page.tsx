import Link from "next/link";
import { db } from "@/lib/db";
import { presignView } from "@/lib/storage";
import { Avatar, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { HeroBanner, HeroCta } from "@/components/Hero";
import { PixelIcon } from "@/components/icons";

export const metadata = { title: "Cookbook" };
export const dynamic = "force-dynamic";

export default async function CookbookPage() {
  const recipes = await db.recipe.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  const thumbs = new Map<string, string>();
  await Promise.all(
    recipes
      .filter((r) => r.imageKey)
      .map(async (r) => {
        try {
          thumbs.set(r.id, await presignView(r.imageKey!));
        } catch {
          // Storage hiccup: render the card without a thumb.
        }
      })
  );

  return (
    <div>
      <PageHeader
        title="Cookbook"
        icon="book-open"
        accentBg="bg-accent-red text-white"
        action={<LinkButton href="/cookbook/new" variant="yellow">+ Recipe</LinkButton>}
      />

      {recipes.length > 0 && (
        <HeroBanner accentBg="bg-accent-red text-white" pattern="rays" kicker="Fresh out the kitchen" kickerIcon="fire" className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                {recipes[0].title}
              </h2>
              <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-white/80">
                by{" "}
                <Link
                  href={`/people/${recipes[0].author.id}`}
                  className="inline-flex items-center gap-1.5 text-white no-underline"
                >
                  <Avatar name={recipes[0].author.displayName} src={recipes[0].author.avatarUrl} size="sm" />{" "}
                  {recipes[0].author.displayName}
                </Link>{" "}
                · who's making it first?
              </p>
            </div>
            <HeroCta href={`/cookbook/${recipes[0].id}`} className="bg-accent-yellow text-ink">
              Cook it →
            </HeroCta>
          </div>
        </HeroBanner>
      )}

      {recipes.length === 0 ? (
        <EmptyState
          icon="fire"
          title="No recipes yet"
          hint="Add the first one — the group is hungry."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {recipes.map((recipe, i) => (
            <Link key={recipe.id} href={`/cookbook/${recipe.id}`} className="no-underline">
              <Card
                className={`h-full overflow-hidden !p-0 transition-transform hover:-translate-y-1 ${
                  i % 2 === 0 ? "tilt-l" : "tilt-r"
                }`}
              >
                {thumbs.has(recipe.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs.get(recipe.id)}
                    alt=""
                    className="h-40 w-full border-b-3 border-ink object-cover"
                  />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center border-b-3 border-ink bg-accent-yellow">
                    <PixelIcon name="coffee" size={48} className="text-ink/70" />
                  </div>
                )}
                <div className="p-4">
                  <p className="font-display text-lg font-bold leading-tight">
                    {recipe.title}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs uppercase text-ink/50">
                    by <Avatar name={recipe.author.displayName} src={recipe.author.avatarUrl} size="sm" />{" "}
                    {recipe.author.displayName}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
