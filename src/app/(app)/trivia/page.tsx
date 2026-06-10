import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { TriviaGame } from "@/modules/trivia/TriviaGame";
import { getTriviaBoard } from "@/modules/trivia/leaderboard";

export const metadata = { title: "Trivia" };
export const dynamic = "force-dynamic";

const MEDALS = ["bg-accent-yellow", "bg-paper", "bg-accent-orange"];

export default async function TriviaPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const board = await getTriviaBoard(user.id);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Trivia"
        icon="zap"
        accentBg="bg-accent-ocean"
        action={
          board.myBest != null ? (
            <Badge className="bg-accent-ocean text-white">
              Your best · {board.myBest}/10
            </Badge>
          ) : undefined
        }
      />

      <TriviaGame />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="brutal-label">Leaderboard</p>
          {board.totalPlays > 0 && (
            <span className="font-mono text-[10px] uppercase text-ink/40">
              {board.totalPlays} round{board.totalPlays === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {board.rows.length === 0 ? (
          <EmptyState
            icon="zap"
            title="No rounds yet"
            hint="Be the first to put up a score."
          />
        ) : (
          <ol className="space-y-2">
            {board.rows.map((row, i) => {
              const mine = row.userId === user.id;
              return (
                <li
                  key={row.userId}
                  className={`flex items-center gap-3 border-3 border-ink px-3 py-2 shadow-brutal-sm ${
                    mine ? "bg-accent-ocean/20" : "bg-paper"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink font-display text-sm font-bold ${
                      MEDALS[i] ?? "bg-card"
                    }`}
                  >
                    {i === 0 ? <PixelIcon name="crown" size={16} /> : i + 1}
                  </span>
                  <Avatar name={row.displayName} src={row.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-display font-bold">
                    {row.displayName}
                    {mine && <span className="text-ink/40"> (you)</span>}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                    {row.best}/10
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <p className="font-mono text-[11px] leading-relaxed text-ink/40">
        Questions come fresh from Open Trivia DB, so the well never runs dry.
        Only your best round counts on the board — flameouts stay between us.
      </p>
    </div>
  );
}
