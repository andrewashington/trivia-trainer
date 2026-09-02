import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { discordApi } from "@/lib/discord/bot";
import { actionRow, button, container, textDisplay, IS_COMPONENTS_V2 } from "@/lib/discord/components";
import { randomBoard, randomCategories, type GameCategory, type GameClue } from "@/lib/discord/jeopardy/clues";
import { gradeAnswer } from "@/lib/discord/jeopardy/grade";

/**
 * Jeopardy game engine (Discord-only, no coins).
 *
 * One active game per channel. The entire game lives in JeopardyGame.state and
 * every transition is `mutate()`: an in-process per-game lock plus a
 * compare-and-swap on `version`, so two friends answering in the same 100ms
 * can't both claim the clue. Timers (clue deadline, chat cooldown, pick
 * timeout) are setTimeouts in this process, with a 10s sweep as the backstop
 * after a restart.
 *
 * Rules (locked with the owner):
 *   - any human message in the channel while a clue is open is an answer;
 *   - first correct answer wins the value; a wrong answer only costs you if you
 *     were the FIRST responder to that clue — late wrong answers are free, but
 *     every wrong answer locks you out of that clue;
 *   - 5s of chat cooldown between clues;
 *   - quickfire is endless (announces 5 categories, refills when they run dry)
 *     until /jeopardy stop or five straight unanswered clues; board mode is a
 *     6×5 board where the last correct answerer picks the next clue.
 */

export const DEFAULT_CLUE_SECONDS = 20;
const COOLDOWN_MS = 5_000;
const BOARD_COOLDOWN_MS = 3_000;
const PICK_TIMEOUT_MS = 25_000;
const WRONG_ANSWER_GRACE_MS = 8_000;
const QUICKFIRE_CATEGORIES = 5;
const IDLE_CLUES_TO_END = 5;
const SWEEP_MS = 10_000;
const JEOPARDY_BLUE = 0x060ce9;
const GOLD = 0xe5b800;

export type Player = { name: string; score: number; correct: number; wrong: number };

export type Phase =
  | { kind: "cooldown"; until: number }
  | {
      kind: "clue";
      clue: GameClue;
      deadline: number;
      firstResponderId: string | null;
      lockedOut: string[];
      attempts: number;
    }
  | {
      kind: "picking";
      pickerId: string;
      pickerName: string;
      deadline: number;
      boardMessageId: string | null;
      categoryIndex: number | null;
    }
  | { kind: "ended" };

export type BoardCell = GameClue & { taken: boolean };

export type GameState = {
  mode: "quickfire" | "board";
  clueSeconds: number;
  /** quickfire: clues to play, 0 = endless */
  limit: number;
  players: Record<string, Player>;
  phase: Phase;
  played: number;
  unansweredStreak: number;
  usedIds: number[];
  // quickfire
  categories: string[];
  queue: GameClue[];
  // board
  board: { name: string; clues: BoardCell[] }[];
  controlId: string | null;
  controlName: string | null;
};

type GameRow = {
  id: string;
  channelId: string;
  guildId: string | null;
  mode: string;
  status: string;
  startedById: string;
  startedByName: string;
  version: number;
  state: GameState;
};

// ── in-process bookkeeping ──────────────────────────────────────────────────

const activeByChannel = new Map<string, string>(); // channelId → gameId
const locks = new Map<string, Promise<unknown>>();
const timers = new Map<string, NodeJS.Timeout>();
let loaded = false;
let sweeper: NodeJS.Timeout | null = null;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const rows = await db.jeopardyGame.findMany({
    where: { status: "active" },
    select: { id: true, channelId: true },
  });
  for (const r of rows) activeByChannel.set(r.channelId, r.id);
}

/** Boot hook (instrumentation.ts): reload active games and start the sweep. */
export function startJeopardyEngine(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    void sweep().catch((err) => console.error("[jeopardy] sweep failed", err));
  }, SWEEP_MS);
  void ensureLoaded()
    .then(() => sweep())
    .catch((err) => console.error("[jeopardy] boot load failed", err));
}

async function sweep(): Promise<void> {
  await ensureLoaded();
  for (const gameId of activeByChannel.values()) await advance(gameId);
}

function withLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(gameId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(gameId, next.catch(() => undefined));
  return next;
}

function schedule(gameId: string, at: number): void {
  const existing = timers.get(gameId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(50, at - Date.now() + 100);
  const t = setTimeout(() => {
    timers.delete(gameId);
    void advance(gameId).catch((err) => console.error("[jeopardy] advance failed", err));
  }, delay);
  timers.set(gameId, t);
}

async function loadGame(gameId: string): Promise<GameRow | null> {
  const row = await db.jeopardyGame.findUnique({ where: { id: gameId } });
  if (!row) return null;
  return { ...row, state: row.state as unknown as GameState };
}

/**
 * Apply `fn` to the current state under the game lock and persist it with a
 * version check. `fn` returns the side-effects to run after the write (posts),
 * or null to leave the game untouched.
 */
async function mutate(
  gameId: string,
  fn: (game: GameRow) => Promise<{ state: GameState; after?: () => Promise<void> } | null>
): Promise<boolean> {
  return withLock(gameId, async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const game = await loadGame(gameId);
      if (!game || game.status !== "active") {
        activeByChannel.delete(game?.channelId ?? "");
        return false;
      }
      const result = await fn(game);
      if (!result) return false;
      const ended = result.state.phase.kind === "ended";
      const written = await db.jeopardyGame.updateMany({
        where: { id: gameId, version: game.version },
        data: {
          state: result.state as unknown as Prisma.InputJsonValue,
          version: game.version + 1,
          ...(ended ? { status: "ended", endedAt: new Date() } : {}),
        },
      });
      if (written.count === 0) continue; // lost the race — re-read and retry
      if (ended) {
        activeByChannel.delete(game.channelId);
        const t = timers.get(gameId);
        if (t) clearTimeout(t);
        timers.delete(gameId);
      } else {
        const at = phaseDeadline(result.state.phase);
        if (at) schedule(gameId, at);
      }
      if (result.after) {
        await result.after().catch((err) => console.error("[jeopardy] post failed", err));
      }
      return true;
    }
    return false;
  });
}

function phaseDeadline(phase: Phase): number | null {
  if (phase.kind === "cooldown") return phase.until;
  if (phase.kind === "clue") return phase.deadline;
  if (phase.kind === "picking") return phase.deadline;
  return null;
}

// ── Discord helpers ─────────────────────────────────────────────────────────

async function say(channelId: string, content: string): Promise<string | null> {
  try {
    const res = await discordApi(`/channels/${channelId}/messages`, { body: { content } });
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch (err) {
    console.error("[jeopardy] say failed", err);
    return null;
  }
}

async function postCard(channelId: string, components: object[]): Promise<string | null> {
  try {
    const res = await discordApi(`/channels/${channelId}/messages`, {
      body: { flags: IS_COMPONENTS_V2, components },
    });
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch (err) {
    console.error("[jeopardy] card post failed", err);
    return null;
  }
}

async function deleteMessage(channelId: string, messageId: string | null): Promise<void> {
  if (!messageId) return;
  await discordApi(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" }).catch(() => undefined);
}

export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clueCard(clue: GameClue, seconds: number): object[] {
  return [
    container({
      accentColor: JEOPARDY_BLUE,
      components: [
        textDisplay(`**${clue.category.toUpperCase()}** · **${money(clue.value)}**`),
        textDisplay(`## ${clue.clue}`),
        textDisplay(`-# ${seconds}s on the clock · just type your answer`),
      ],
    }),
  ];
}

function scoreboardLines(players: Record<string, Player>): string[] {
  const rows = Object.entries(players).sort((a, b) => b[1].score - a[1].score);
  if (!rows.length) return ["_Nobody on the board yet._"];
  return rows.map(([, p], i) => `${i === 0 ? "👑" : `${i + 1}.`} **${p.name}** — ${money(p.score)}`);
}

export function boardComponents(gameId: string, state: GameState, phase: Extract<Phase, { kind: "picking" }>): object[] {
  const lines = state.board.map((cat, i) => {
    const values = cat.clues.map((c) => (c.taken ? `~~${money(c.value)}~~` : `**${money(c.value)}**`)).join(" · ");
    return `**${i + 1}. ${cat.name.toUpperCase()}**\n${values}`;
  });
  const children: object[] = [
    textDisplay(`🎯 **${phase.pickerName}** has control — pick a category.`),
    textDisplay(lines.join("\n")),
  ];

  if (phase.categoryIndex == null) {
    const buttons = state.board.map((cat, i) =>
      button(2, `${i + 1}. ${cat.name.slice(0, 22)}`, `jeopardy:cat:${gameId}:${i}`, {
        disabled: cat.clues.every((c) => c.taken),
      })
    );
    children.push(actionRow(...buttons.slice(0, 3)), actionRow(...buttons.slice(3, 6)));
  } else {
    const cat = state.board[phase.categoryIndex];
    children.push(textDisplay(`**${cat.name.toUpperCase()}** — how much?`));
    const values = cat.clues.map((c, j) =>
      button(1, money(c.value), `jeopardy:val:${gameId}:${phase.categoryIndex}:${j}`, { disabled: c.taken })
    );
    children.push(actionRow(...values));
    children.push(actionRow(button(2, "← categories", `jeopardy:back:${gameId}`)));
  }
  children.push(textDisplay(`-# ${scoreboardLines(state.players).join(" · ")}`));
  return [container({ accentColor: JEOPARDY_BLUE, components: children })];
}

// ── game lifecycle ──────────────────────────────────────────────────────────

export type StartOptions = {
  channelId: string;
  guildId: string | null;
  mode: "quickfire" | "board";
  round: 1 | 2;
  clueSeconds: number;
  limit: number;
  starterId: string;
  starterName: string;
};

export async function activeGameId(channelId: string): Promise<string | null> {
  await ensureLoaded();
  return activeByChannel.get(channelId) ?? null;
}

/** Create the game and post its opener. Throws with a player-facing message on failure. */
export async function startGame(opts: StartOptions): Promise<void> {
  await ensureLoaded();
  if (activeByChannel.has(opts.channelId)) {
    throw new Error("There's already a game running in this channel — `/jeopardy stop` it first.");
  }

  const base: GameState = {
    mode: opts.mode,
    clueSeconds: opts.clueSeconds,
    limit: opts.limit,
    players: {},
    phase: { kind: "cooldown", until: Date.now() + 2_500 },
    played: 0,
    unansweredStreak: 0,
    usedIds: [],
    categories: [],
    queue: [],
    board: [],
    controlId: null,
    controlName: null,
  };

  let opener: string;
  if (opts.mode === "quickfire") {
    const cats = await randomCategories(QUICKFIRE_CATEGORIES);
    if (cats.length < 2) throw new Error("The clue bank is empty — an admin needs to import it first.");
    fillQuickfire(base, cats);
    opener =
      `🎙️ **JEOPARDY! — quickfire** (started by ${opts.starterName})\n` +
      `${opts.limit ? `${opts.limit} clues` : "Endless"} · ${opts.clueSeconds}s each · first correct answer wins the money · ` +
      `a wrong answer only costs the *first* responder.\n` +
      `📚 Categories in play: ${cats.map((c) => `**${c.name}**`).join(" · ")}`;
  } else {
    const board = await randomBoard(opts.round);
    if (board.length < 2) throw new Error("The clue bank is empty — an admin needs to import it first.");
    base.board = board.map((c) => ({ name: c.name, clues: c.clues.map((cl) => ({ ...cl, taken: false })) }));
    base.controlId = opts.starterId;
    base.controlName = opts.starterName;
    base.usedIds = board.flatMap((c) => c.clues.map((cl) => cl.id));
    opener =
      `🎙️ **JEOPARDY! — ${opts.round === 2 ? "Double Jeopardy" : "the Jeopardy round"}** (started by ${opts.starterName})\n` +
      `30 clues · ${opts.clueSeconds}s each · whoever answers correctly picks next · ` +
      `a wrong answer only costs the *first* responder.`;
  }

  const row = await db.jeopardyGame.create({
    data: {
      channelId: opts.channelId,
      guildId: opts.guildId,
      mode: opts.mode,
      status: "active",
      startedById: opts.starterId,
      startedByName: opts.starterName,
      state: base as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  activeByChannel.set(opts.channelId, row.id);
  await say(opts.channelId, opener);
  schedule(row.id, base.phase.kind === "cooldown" ? base.phase.until : Date.now());
}

function fillQuickfire(state: GameState, cats: GameCategory[]): void {
  state.categories = cats.map((c) => c.name);
  state.queue = shuffle(cats.flatMap((c) => c.clues));
  state.usedIds = [...state.usedIds, ...state.queue.map((c) => c.id)].slice(-2000);
}

/** `/jeopardy stop` — end now with a summary. */
export async function stopGame(channelId: string, byName: string): Promise<boolean> {
  const gameId = await activeGameId(channelId);
  if (!gameId) return false;
  return mutate(gameId, async (game) => {
    const state = structuredClone(game.state);
    const reveal =
      state.phase.kind === "clue" ? `The answer was **${state.phase.clue.response}**.\n` : "";
    state.phase = { kind: "ended" };
    return {
      state,
      after: async () => {
        await say(channelId, `🛑 ${byName} stopped the game. ${reveal}`.trim());
        await finishGame(game, state);
      },
    };
  });
}

/** `/jeopardy skip` — throw out the open clue. */
export async function skipClue(channelId: string, byName: string): Promise<string> {
  const gameId = await activeGameId(channelId);
  if (!gameId) return "No game running here.";
  let msg = "Nothing to skip right now.";
  await mutate(gameId, async (game) => {
    if (game.state.phase.kind !== "clue") return null;
    const state = structuredClone(game.state);
    const clue = (state.phase as Extract<Phase, { kind: "clue" }>).clue;
    msg = "Skipped.";
    return afterClue(game, state, null, `⏭️ ${byName} skipped it. It was **${clue.response}**.`);
  });
  return msg;
}

export async function currentScores(channelId: string): Promise<string | null> {
  const gameId = await activeGameId(channelId);
  if (!gameId) return null;
  const game = await loadGame(gameId);
  if (!game) return null;
  return scoreboardLines(game.state.players).join("\n");
}

async function finishGame(game: GameRow, state: GameState): Promise<void> {
  const players = Object.entries(state.players);
  if (players.length) {
    await db.jeopardyResult
      .createMany({
        data: players.map(([id, p]) => ({
          gameId: game.id,
          discordUserId: id,
          name: p.name,
          score: p.score,
          correct: p.correct,
          wrong: p.wrong,
        })),
        skipDuplicates: true,
      })
      .catch((err) => console.error("[jeopardy] results write failed", err));
  }
  const sorted = players.sort((a, b) => b[1].score - a[1].score);
  const winner = sorted[0];
  const lines = [
    `🏁 **FINAL** — ${state.played} clue${state.played === 1 ? "" : "s"} played`,
    ...scoreboardLines(state.players),
  ];
  if (winner) lines.push(winner[1].score > 0 ? `\nCongratulations, **${winner[1].name}**. Nobody can take this from you (there are no coins).` : `\n**${winner[1].name}** wins with ${money(winner[1].score)}. Somehow.`);
  await say(game.channelId, lines.join("\n"));
}

// ── phase transitions ───────────────────────────────────────────────────────

/** Timer / sweep entry point: move the game along if its phase has expired. */
export async function advance(gameId: string): Promise<void> {
  await mutate(gameId, async (game) => {
    const { phase } = game.state;
    const now = Date.now();
    if (phase.kind === "cooldown" && now >= phase.until) return openNext(game);
    if (phase.kind === "clue" && now >= phase.deadline) {
      const state = structuredClone(game.state);
      return afterClue(game, state, null, `⏰ Time! It was **${phase.clue.response}**.`);
    }
    if (phase.kind === "picking" && now >= phase.deadline) {
      const state = structuredClone(game.state);
      const open = state.board.flatMap((c, ci) => c.clues.map((cl, i) => ({ ci, i, cl })).filter((x) => !x.cl.taken));
      if (!open.length) {
        state.phase = { kind: "ended" };
        return { state, after: () => finishGame(game, state) };
      }
      const pick = open[Math.floor(Math.random() * open.length)];
      const boardMessageId = phase.boardMessageId;
      const result = openBoardClue(game, state, pick.ci, pick.i);
      return {
        state: result.state,
        after: async () => {
          await deleteMessage(game.channelId, boardMessageId);
          await say(game.channelId, `💤 ${phase.pickerName} dozed off — random pick: **${pick.cl.category}** for ${money(pick.cl.value)}.`);
          await result.after();
        },
      };
    }
    return null;
  });
}

/** Cooldown over: quickfire opens the next clue, board mode posts the board. */
async function openNext(game: GameRow): Promise<{ state: GameState; after: () => Promise<void> }> {
  const state = structuredClone(game.state);
  if (state.mode === "quickfire") {
    let announce: string | null = null;
    if (!state.queue.length) {
      const cats = await randomCategories(QUICKFIRE_CATEGORIES, state.usedIds);
      if (!cats.length) {
        state.phase = { kind: "ended" };
        return { state, after: () => finishGame(game, state) };
      }
      fillQuickfire(state, cats);
      announce = `📚 Fresh categories: ${cats.map((c) => `**${c.name}**`).join(" · ")}`;
    }
    const clue = state.queue.shift()!;
    state.phase = {
      kind: "clue",
      clue,
      deadline: Date.now() + state.clueSeconds * 1000,
      firstResponderId: null,
      lockedOut: [],
      attempts: 0,
    };
    return {
      state,
      after: async () => {
        if (announce) await say(game.channelId, announce);
        await postCard(game.channelId, clueCard(clue, state.clueSeconds));
      },
    };
  }

  // board mode → picking
  const remaining = state.board.some((c) => c.clues.some((cl) => !cl.taken));
  if (!remaining) {
    state.phase = { kind: "ended" };
    return { state, after: () => finishGame(game, state) };
  }
  const phase: Extract<Phase, { kind: "picking" }> = {
    kind: "picking",
    pickerId: state.controlId ?? game.startedById,
    pickerName: state.controlName ?? game.startedByName,
    deadline: Date.now() + PICK_TIMEOUT_MS,
    boardMessageId: null,
    categoryIndex: null,
  };
  state.phase = phase;
  return {
    state,
    after: async () => {
      const id = await postCard(game.channelId, boardComponents(game.id, state, phase));
      if (id) {
        // Remember the board message so it can be swapped out later. A plain
        // update (no version bump) — the id is cosmetic, not game logic.
        await db.jeopardyGame.updateMany({
          where: { id: game.id },
          data: { state: { ...state, phase: { ...phase, boardMessageId: id } } as unknown as Prisma.InputJsonValue },
        });
      }
    },
  };
}

function openBoardClue(
  game: GameRow,
  state: GameState,
  ci: number,
  i: number
): { state: GameState; after: () => Promise<void> } {
  const cell = state.board[ci].clues[i];
  cell.taken = true;
  const clue: GameClue = { id: cell.id, category: cell.category, value: cell.value, clue: cell.clue, response: cell.response };
  state.phase = {
    kind: "clue",
    clue,
    deadline: Date.now() + state.clueSeconds * 1000,
    firstResponderId: null,
    lockedOut: [],
    attempts: 0,
  };
  return {
    state,
    after: async () => {
      await postCard(game.channelId, clueCard(clue, state.clueSeconds));
    },
  };
}

/** A clue is over (answered, timed out, skipped): announce, then cool down. */
function afterClue(
  game: GameRow,
  state: GameState,
  winnerId: string | null,
  announcement: string
): { state: GameState; after: () => Promise<void> } {
  const phase = state.phase as Extract<Phase, { kind: "clue" }>;
  state.played += 1;
  state.unansweredStreak = phase.attempts === 0 ? state.unansweredStreak + 1 : 0;
  if (winnerId) {
    state.controlId = winnerId;
    state.controlName = state.players[winnerId]?.name ?? state.controlName;
  }

  const idle = state.unansweredStreak >= IDLE_CLUES_TO_END;
  const hitLimit = state.mode === "quickfire" && state.limit > 0 && state.played >= state.limit;
  const boardDone = state.mode === "board" && !state.board.some((c) => c.clues.some((cl) => !cl.taken));
  if (idle || hitLimit || boardDone) {
    state.phase = { kind: "ended" };
    return {
      state,
      after: async () => {
        await say(game.channelId, announcement + (idle ? "\n🦗 Five in a row with no takers — calling it." : ""));
        await finishGame(game, state);
      },
    };
  }

  const wait = state.mode === "board" ? BOARD_COOLDOWN_MS : COOLDOWN_MS;
  state.phase = { kind: "cooldown", until: Date.now() + wait };
  const tally =
    state.mode === "quickfire" && state.played % 5 === 0
      ? `\n📊 ${scoreboardLines(state.players).join(" · ")}`
      : "";
  return {
    state,
    after: async () => {
      await say(game.channelId, announcement + tally);
    },
  };
}

// ── answers ─────────────────────────────────────────────────────────────────

export type IncomingMessage = {
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  isBot: boolean;
};

/** Ingest hook: treat a channel message as an answer if a clue is open. */
export async function handleJeopardyMessage(msg: IncomingMessage): Promise<void> {
  if (msg.isBot) return;
  await ensureLoaded();
  const gameId = activeByChannel.get(msg.channelId);
  if (!gameId) return;
  const text = msg.content.trim();
  if (!text || text.length > 200) return;

  await mutate(gameId, async (game) => {
    const phase = game.state.phase;
    if (phase.kind !== "clue") return null;
    if (Date.now() >= phase.deadline) return null; // the timer will reveal it
    if (phase.lockedOut.includes(msg.authorId)) return null;

    const state = structuredClone(game.state);
    const p = state.phase as Extract<Phase, { kind: "clue" }>;
    const player = (state.players[msg.authorId] ??= { name: msg.authorName, score: 0, correct: 0, wrong: 0 });
    player.name = msg.authorName;
    p.attempts += 1;

    const verdict = gradeAnswer(text, p.clue.response);
    if (verdict.correct) {
      player.score += p.clue.value;
      player.correct += 1;
      return afterClue(
        game,
        state,
        msg.authorId,
        `✅ **${player.name}** — *${p.clue.response}* (+${money(p.clue.value)} → ${money(player.score)})`
      );
    }

    player.wrong += 1;
    p.lockedOut.push(msg.authorId);
    let line: string;
    if (!p.firstResponderId) {
      p.firstResponderId = msg.authorId;
      player.score -= p.clue.value;
      line = `❌ **${player.name}**: ~~${text.slice(0, 80)}~~ (−${money(p.clue.value)} → ${money(player.score)})`;
    } else {
      line = `❌ **${player.name}**: ~~${text.slice(0, 80)}~~ (no penalty — you weren't first)`;
    }
    // Give everyone else a real shot after a miss.
    p.deadline = Math.max(p.deadline, Date.now() + WRONG_ANSWER_GRACE_MS);
    return { state, after: () => say(game.channelId, line).then(() => undefined) };
  });
}

// ── board picks (button handlers) ───────────────────────────────────────────

type PickResult = { type: number; data: Record<string, unknown> };

const EPHEMERAL = 64;
const ephemeral = (content: string): PickResult => ({ type: 4, data: { content, flags: EPHEMERAL } });
const updateMessage = (components: object[]): PickResult => ({
  type: 7,
  data: { flags: IS_COMPONENTS_V2, components },
});

/** `jeopardy:cat|val|back` button clicks. */
export async function handleBoardPick(
  gameId: string,
  action: "cat" | "val" | "back",
  args: string[],
  clicker: { id: string; name: string }
): Promise<PickResult> {
  let reply: PickResult = ephemeral("That board is stale.");
  await mutate(gameId, async (game) => {
    const phase = game.state.phase;
    if (phase.kind !== "picking") {
      reply = ephemeral("Nobody's picking right now.");
      return null;
    }
    if (phase.pickerId !== clicker.id) {
      reply = ephemeral(`It's **${phase.pickerName}**'s pick.`);
      return null;
    }
    const state = structuredClone(game.state);
    const p = state.phase as Extract<Phase, { kind: "picking" }>;

    if (action === "cat") {
      const ci = Number(args[0]);
      if (!state.board[ci] || state.board[ci].clues.every((c) => c.taken)) {
        reply = ephemeral("That category is cleared out.");
        return null;
      }
      p.categoryIndex = ci;
      p.deadline = Date.now() + PICK_TIMEOUT_MS;
      reply = updateMessage(boardComponents(gameId, state, p));
      return { state };
    }
    if (action === "back") {
      p.categoryIndex = null;
      reply = updateMessage(boardComponents(gameId, state, p));
      return { state };
    }
    const ci = Number(args[0]);
    const i = Number(args[1]);
    const cell = state.board[ci]?.clues[i];
    if (!cell || cell.taken) {
      reply = ephemeral("That one's gone.");
      return null;
    }
    const result = openBoardClue(game, state, ci, i);
    reply = updateMessage([
      container({
        accentColor: GOLD,
        components: [textDisplay(`🎯 **${clicker.name}** picks **${cell.category.toUpperCase()}** for **${money(cell.value)}**.`)],
      }),
    ]);
    return { state: result.state, after: result.after };
  });
  return reply;
}

/** All-time standings across finished games. */
export async function allTimeStandings(): Promise<string> {
  const rows = await db.jeopardyResult.groupBy({
    by: ["discordUserId"],
    _sum: { score: true, correct: true, wrong: true },
    _count: { gameId: true },
    orderBy: { _sum: { score: "desc" } },
    take: 10,
  });
  if (!rows.length) return "No finished games yet.";
  const names = await db.jeopardyResult.findMany({
    where: { discordUserId: { in: rows.map((r) => r.discordUserId) } },
    orderBy: { createdAt: "desc" },
    distinct: ["discordUserId"],
    select: { discordUserId: true, name: true },
  });
  const nameOf = new Map(names.map((n) => [n.discordUserId, n.name]));
  return rows
    .map(
      (r, i) =>
        `${i === 0 ? "👑" : `${i + 1}.`} **${nameOf.get(r.discordUserId) ?? "?"}** — ${money(r._sum.score ?? 0)} ` +
        `(${r._count.gameId} game${r._count.gameId === 1 ? "" : "s"}, ${r._sum.correct ?? 0}✅ ${r._sum.wrong ?? 0}❌)`
    )
    .join("\n");
}
