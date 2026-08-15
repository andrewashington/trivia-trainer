import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, LinkButton } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { CommentThread } from "@/modules/comments/CommentThread";
import { coerceDoc, PlanDocView } from "@/modules/fitness/PlanDocView";
import { countLifts } from "@/modules/fitness/schema";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: { id: string } }) {
  const [user, plan] = await Promise.all([
    currentUser(),
    db.fitnessPlan.findUnique({ where: { id: params.id } }),
  ]);
  if (!plan) notFound();

  const [author, commentCount] = await Promise.all([
    db.user.findUnique({
      where: { id: plan.authorId },
      select: { id: true, displayName: true, avatarUrl: true },
    }),
    db.comment.count({ where: { targetType: "fitnessplan", targetId: plan.id } }),
  ]);

  const canModify = user && (user.id === plan.authorId || user.role === "admin");
  const doc = coerceDoc(plan.doc);

  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-3xl sm:text-4xl">{plan.title}</h1>
        {plan.blurb && <p className="mt-2 text-ink/70">{plan.blurb}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink/60">
          {author && (
            <Link
              href={`/people/${author.id}`}
              className="inline-flex items-center gap-2 text-ink/60 no-underline hover:text-accent-blue"
            >
              <Avatar name={author.displayName} src={author.avatarUrl} size="sm" />
              {author.displayName}
            </Link>
          )}
          <span>
            ·{" "}
            {plan.createdAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <p className="mt-3 flex flex-wrap gap-1.5">
          {plan.goal && <Badge className="bg-accent-bronze/20">{plan.goal}</Badge>}
          {plan.daysPerWeek && <Badge>{plan.daysPerWeek}×/week</Badge>}
          {doc && <Badge>{countLifts(doc)} lifts</Badge>}
          {plan.equipment && <Badge>{plan.equipment}</Badge>}
          {plan.status === "retired" && <Badge className="bg-ink text-paper">retired</Badge>}
        </p>
      </div>

      {doc ? (
        <PlanDocView doc={doc} />
      ) : (
        <Card>
          <p className="text-sm text-ink/60">
            This program's structure didn't survive — the original text below is still intact.
          </p>
        </Card>
      )}

      {plan.sourceText && (
        <details className="brutal-card p-4">
          <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-ink/60">
            {plan.aiUsed ? "✨ Forged from the original scripture — read it raw" : "The original scripture"}
          </summary>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-ink/80">{plan.sourceText}</pre>
        </details>
      )}

      {user && (
        <Card>
          <CommentThread
            targetType="fitnessplan"
            targetId={plan.id}
            initialCount={commentCount}
            viewerId={user.id}
            viewerIsAdmin={user.role === "admin"}
          />
        </Card>
      )}

      {canModify && (
        <div className="flex gap-3">
          <LinkButton href={`/pump/${plan.id}/edit`} variant="yellow">
            Edit
          </LinkButton>
          <DeleteButton endpoint={`/api/fitness/plans/${plan.id}`} redirectTo="/pump" />
        </div>
      )}
    </article>
  );
}
