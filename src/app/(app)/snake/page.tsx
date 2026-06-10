import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { SnakeGame } from "@/modules/snake/SnakeGame";
import { getSnakeBoard } from "@/modules/snake/leaderboard";

export const metadata = { title: "Snake" };
export const dynamic = "force-dynamic";

const MEDALS = ["bg-accent-yellow", "bg-paper", "bg-accent-orange"];

export default async function SnakePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const board = await getSnakeBoard(user.id);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Snake"
        icon="apple"
        accentBg="bg-accent-grape"
        action={
          board.myBest != null ? (
            <Badge className="bg-accent-grape text-white">
              Your best · {board.myBest}
            </Badge>
          ) : undefined
        }
      />

      <SnakeGame />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="brutal-label">Leaderboard</p>
          {board.totalPlays > 0 && (
            <span className="font-mono text-[10px] uppercase text-ink/40">
              {board.totalPlays} run{board.totalPlays === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {board.rows.length === 0 ? (
          <EmptyState
            icon="apple"
            title="No scores yet"
            hint="Be the first to feed the snake."
          />
        ) : (
          <ol className="space-y-2">
            {board.rows.map((row, i) => {
              const mine = row.userId === user.id;
              return (
                <li
                  key={row.userId}
                  className={`flex items-center gap-3 border-3 border-ink px-3 py-2 shadow-brutal-sm ${
                    mine ? "bg-accent-grape/20" : "bg-paper"
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
                    {row.best}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <p className="font-mono text-[11px] leading-relaxed text-ink/40">
        Every run feeds the pet — so even a flameout counts for something.
        Chain snacks for a multiplier and grab the golden one before it
        vanishes.
      </p>
    </div>
  );
}
