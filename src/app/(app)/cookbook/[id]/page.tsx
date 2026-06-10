import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { Avatar, Card, LinkButton } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { CommentThread } from "@/modules/comments/CommentThread";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: { id: string } }) {
  const [user, recipe] = await Promise.all([
    currentUser(),
    db.recipe.findUnique({
      where: { id: params.id },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    }),
  ]);
  if (!recipe) notFound();

  const commentCount = await db.comment.count({
    where: { targetType: "recipe", targetId: recipe.id },
  });

  const canModify = user && (user.id === recipe.authorId || user.role === "admin");
  let imageUrl: string | null = null;
  if (recipe.imageKey) {
    try {
      imageUrl = await presignView(recipe.imageKey);
    } catch {
      imageUrl = null;
    }
  }

  return (
    <article className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-3xl sm:text-4xl">{recipe.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-ink/60">
          <Link
            href={`/people/${recipe.author.id}`}
            className="inline-flex items-center gap-2 text-ink/60 no-underline hover:text-accent-blue"
          >
            <Avatar name={recipe.author.displayName} src={recipe.author.avatarUrl} size="sm" />
            {recipe.author.displayName}
          </Link>
          <span>
            {" "}·{" "}
            {recipe.createdAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={recipe.title}
          className="brutal-card w-full !p-0 object-cover"
        />
      )}

      <div className="brutal-card prose-brutal p-5 [&_a]:font-bold [&_a]:text-accent-blue [&_code]:bg-paper [&_code]:px-1 [&_h1]:mt-4 [&_h1]:text-2xl [&_h2]:mt-4 [&_h2]:text-xl [&_h3]:mt-3 [&_h3]:text-lg [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
        {/* remark-breaks: honor single newlines as line breaks, so a recipe
            typed with plain returns keeps its structure (CommonMark would
            otherwise collapse them into one paragraph). */}
        <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{recipe.body}</Markdown>
      </div>

      {user && (
        <Card>
          <CommentThread
            targetType="recipe"
            targetId={recipe.id}
            initialCount={commentCount}
            viewerId={user.id}
            viewerIsAdmin={user.role === "admin"}
          />
        </Card>
      )}

      {canModify && (
        <div className="flex gap-3">
          <LinkButton href={`/cookbook/${recipe.id}/edit`} variant="yellow">
            Edit
          </LinkButton>
          <DeleteButton endpoint={`/api/recipes/${recipe.id}`} redirectTo="/cookbook" />
        </div>
      )}
    </article>
  );
}
