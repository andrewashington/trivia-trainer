"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { confettiBurst } from "@/lib/confetti";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { GameChat } from "@/modules/gamechat/GameChat";
import { ANSWERS, type Answer, type Category } from "@/modules/twentyq/schema";
import type { TwentyQEntryPayload, TwentyQGamePayload } from "@/modules/twentyq/server";

const POLL_MS = 3000;

const CATEGORY_LABEL: Record<Category, string> = {
  person: "a Person",
  place: "a Place",
  thing: "a Thing",
};

const ANSWER_STYLE: Record<Answer, string> = {
  yes: "bg-accent-green",
  no: "bg-accent-red text-white",
  sometimes: "bg-accent-yellow",
};

export function TwentyQGame({
  initial,
  meId,
}: {
  initial: TwentyQGamePayload;
  meId: string;
}) {
  const [game, setGame] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const wasActive = useRef(initial.status === "active");

  // Poll while the round is live.
  useEffect(() => {
    if (game.status !== "active") return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await api<{ game: TwentyQGamePayload }>(`/api/twentyq/${game.id}`);
        if (alive) setGame(res.game);
      } catch {
        // transient
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [game.id, game.status]);

  // Celebrate the moment a solve lands.
  useEffect(() => {
    if (wasActive.current && game.status === "solved") confettiBurst();
    wasActive.current = game.status === "active";
  }, [game.status]);

  async function act<T>(key: string, fn: () => Promise<T>) {
    if (busy) return;
    setBusy(key);
    try {
      const res = (await fn()) as { game: TwentyQGamePayload };
      setGame(res.game);
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const over = game.status !== "active";
  const questions = game.entries.filter((e) => e.kind === "question");
  const guesses = game.entries.filter((e) => e.kind === "guess");
  const pendingQ = questions.filter((e) => e.pending);
  const pendingG = guesses.filter((e) => e.pending);
  const pct = Math.min(100, (game.answered / game.budget) * 100);

  return (
    <div className="space-y-5">
      {/* --- Header / status --- */}
      <Card className="bg-accent-riddle/15">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar name={game.host.displayName} src={game.host.avatarUrl} size="sm" />
            <span className="text-sm">
              <span className="font-bold">{game.host.displayName.split(" ")[0]}</span> is hiding{" "}
              <span className="font-bold">{CATEGORY_LABEL[game.category]}</span>
            </span>
          </div>
          {game.isHost && !over && <Badge className="bg-accent-riddle">You're the host</Badge>}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wide text-ink/60">
            <span>Question budget</span>
            <span className="tabular-nums">
              {game.answered} of {game.budget} spent
            </span>
          </div>
          <div className="mt-1 h-4 border-3 border-ink bg-paper">
            <div className="h-full bg-accent-riddle" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      {/* --- End banner --- */}
      {game.status === "solved" && (
        <Card className="animate-stamp-in border-4 bg-accent-green text-center">
          <PixelIcon name="trophy" size={36} className="mx-auto" />
          <p className="mt-1 font-display text-2xl font-bold uppercase">Cracked it!</p>
          <p className="mt-1 text-sm">
            <span className="font-bold">{game.winner?.displayName}</span> guessed{" "}
            <span className="font-bold">{game.secret}</span> in {game.answered} questions.
          </p>
        </Card>
      )}
      {game.status === "revealed" && (
        <Card className="animate-stamp-in border-4 bg-card text-center">
          <PixelIcon name="eye" size={32} className="mx-auto text-ink/60" />
          <p className="mt-1 font-display text-xl font-bold uppercase">Host folded.</p>
          <p className="mt-1 text-sm">
            It was <span className="font-bold">{game.secret}</span>. Nobody saw it coming.
          </p>
        </Card>
      )}

      {/* --- HOST controls --- */}
      {game.isHost && !over && (
        <Card>
          <p className="brutal-label mb-3">Your verdicts</p>
          {pendingQ.length === 0 && pendingG.length === 0 ? (
            <p className="text-sm text-ink/60">Nothing waiting on you. Sit back and sweat.</p>
          ) : (
            <ul className="space-y-2">
              {pendingG.map((e) => (
                <li
                  key={e.id}
                  className="border-3 border-ink bg-accent-riddle/10 px-3 py-2 shadow-brutal-sm"
                >
                  <p className="text-sm">
                    <span className="font-mono text-[10px] font-bold uppercase text-ink/50">
                      Guess
                    </span>{" "}
                    <span className="font-bold">{e.text}</span>
                    <span className="text-ink/50"> — {e.asker.displayName.split(" ")[0]}</span>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="green"
                      className="px-3 py-1 text-sm"
                      disabled={busy !== null}
                      onClick={() =>
                        act(`g${e.id}`, () =>
                          api(`/api/twentyq/${game.id}/answer`, {
                            method: "POST",
                            body: { entryId: e.id, correct: true },
                          })
                        )
                      }
                    >
                      Correct
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3 py-1 text-sm"
                      disabled={busy !== null}
                      onClick={() =>
                        act(`g${e.id}`, () =>
                          api(`/api/twentyq/${game.id}/answer`, {
                            method: "POST",
                            body: { entryId: e.id, correct: false },
                          })
                        )
                      }
                    >
                      Wrong
                    </Button>
                  </div>
                </li>
              ))}
              {pendingQ.map((e) => (
                <li key={e.id} className="border-3 border-ink bg-paper px-3 py-2 shadow-brutal-sm">
                  <p className="text-sm">
                    <span className="font-bold">{e.text}</span>
                    <span className="text-ink/50"> — {e.asker.displayName.split(" ")[0]}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ANSWERS.map((a) => (
                      <Button
                        key={a}
                        className={`px-3 py-1 text-sm ${ANSWER_STYLE[a]}`}
                        disabled={busy !== null || game.remaining === 0}
                        onClick={() =>
                          act(`q${e.id}${a}`, () =>
                            api(`/api/twentyq/${game.id}/answer`, {
                              method: "POST",
                              body: { entryId: e.id, answer: a },
                            })
                          )
                        }
                      >
                        {a}
                      </Button>
                    ))}
                  </div>
                  {game.remaining === 0 && (
                    <p className="mt-1 font-mono text-[11px] text-accent-red">
                      Budget's gone — they can only guess now.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t-3 border-ink pt-3">
            <Button
              variant="ghost"
              className="text-sm"
              disabled={busy !== null}
              onClick={() => {
                if (confirm("Give up and reveal your secret? No winner, no glory."))
                  act("reveal", () =>
                    api(`/api/twentyq/${game.id}/answer`, {
                      method: "POST",
                      body: { reveal: true },
                    })
                  );
              }}
            >
              Reveal / give up
            </Button>
          </div>
        </Card>
      )}

      {/* --- NON-HOST input --- */}
      {!game.isHost && !over && <Asker game={game} busy={busy} act={act} />}

      {/* --- Transcript --- */}
      <Card>
        <p className="brutal-label mb-3">The interrogation</p>
        {game.entries.length === 0 ? (
          <p className="text-sm text-ink/60">No questions yet. Someone be brave.</p>
        ) : (
          <ul className="space-y-1.5">
            {game.entries.map((e) => (
              <Transcript key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="brutal-label mb-2">Peanut gallery</p>
        <GameChat channel={`twentyq:${game.id}`} meId={meId} isPlayer={!game.isHost} />
      </Card>
    </div>
  );
}

function Transcript({ e }: { e: TwentyQEntryPayload }) {
  if (e.kind === "guess") {
    return (
      <li className="flex items-center gap-2 border-2 border-ink bg-paper px-3 py-1.5 text-sm shadow-brutal-sm">
        <span className="font-mono text-[10px] font-bold uppercase text-ink/50">Guess</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-bold">{e.text}</span>
          <span className="text-ink/50"> — {e.asker.displayName.split(" ")[0]}</span>
        </span>
        {e.correct === true && <Badge className="bg-accent-green">Right!</Badge>}
        {e.correct === false && <Badge className="bg-accent-red text-white">Nope</Badge>}
        {e.correct === null && <Badge className="bg-card text-ink/50">Pending</Badge>}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 border-2 border-ink bg-paper px-3 py-1.5 text-sm shadow-brutal-sm">
      <span className="min-w-0 flex-1 truncate">
        {e.text}
        <span className="text-ink/40"> — {e.asker.displayName.split(" ")[0]}</span>
      </span>
      {e.answer ? (
        <Badge className={ANSWER_STYLE[e.answer]}>{e.answer}</Badge>
      ) : (
        <Badge className="bg-card text-ink/50">…</Badge>
      )}
    </li>
  );
}

function Asker({
  game,
  busy,
  act,
}: {
  game: TwentyQGamePayload;
  busy: string | null;
  act: <T>(key: string, fn: () => Promise<T>) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [guess, setGuess] = useState("");
  const outOfQuestions = game.remaining === 0;

  return (
    <Card>
      <p className="brutal-label mb-3">Your move</p>
      <div className="space-y-4">
        <div>
          <p className="mb-1 font-mono text-[11px] font-bold uppercase text-ink/50">
            Ask a yes/no question
          </p>
          {outOfQuestions ? (
            <p className="text-sm font-bold text-accent-red">
              That's all twenty. Guess or go home.
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                className="brutal-input flex-1"
                placeholder="Is it bigger than a breadbox?"
                value={question}
                maxLength={200}
                onChange={(ev) => setQuestion(ev.target.value)}
              />
              <Button
                className="bg-accent-riddle text-ink"
                disabled={busy !== null || !question.trim()}
                onClick={() =>
                  act("ask", async () => {
                    const r = await api(`/api/twentyq/${game.id}/ask`, {
                      method: "POST",
                      body: { kind: "question", text: question.trim() },
                    });
                    setQuestion("");
                    return r;
                  })
                }
              >
                Ask
              </Button>
            </div>
          )}
        </div>
        <div className="border-t-3 border-ink pt-3">
          <p className="mb-1 font-mono text-[11px] font-bold uppercase text-ink/50">
            Or take a swing
          </p>
          <div className="flex gap-2">
            <input
              className="brutal-input flex-1"
              placeholder="It's Pikachu, isn't it?"
              value={guess}
              maxLength={200}
              onChange={(ev) => setGuess(ev.target.value)}
            />
            <Button
              variant="yellow"
              disabled={busy !== null || !guess.trim()}
              onClick={() =>
                act("guess", async () => {
                  const r = await api(`/api/twentyq/${game.id}/ask`, {
                    method: "POST",
                    body: { kind: "guess", text: guess.trim() },
                  });
                  setGuess("");
                  return r;
                })
              }
            >
              Guess
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
