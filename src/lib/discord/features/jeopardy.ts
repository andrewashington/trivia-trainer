import { registerFeature } from "@/lib/discord/registry";
import type { Interaction, CommandOption } from "@/lib/discord/interactions";
import {
  DEFAULT_CLUE_SECONDS,
  allTimeStandings,
  currentScores,
  handleBoardPick,
  skipClue,
  startGame,
  stopGame,
} from "@/lib/discord/jeopardy/engine";

/**
 * /jeopardy — a Discord-only game, no UDM+ link required (same gate as /uwu:
 * anyone in the server). Answers are plain channel messages, handled by the
 * ingest hook (src/lib/discord/jeopardy/engine.ts handleJeopardyMessage).
 */

const EPHEMERAL = 64;

export const JEOPARDY_COMMAND = {
  name: "jeopardy",
  description: "Run a Jeopardy! game in this channel",
  type: 1,
  options: [
    {
      name: "start",
      description: "Start a game here",
      type: 1,
      options: [
        {
          name: "mode",
          description: "quickfire = endless rapid clues · board = pick from a 6×5 board",
          type: 3,
          required: false,
          choices: [
            { name: "quickfire (endless, rapid-fire)", value: "quickfire" },
            { name: "board (6×5, winner picks next)", value: "board" },
          ],
        },
        {
          name: "seconds",
          description: `Seconds per clue (default ${DEFAULT_CLUE_SECONDS})`,
          type: 4,
          required: false,
          min_value: 8,
          max_value: 90,
        },
        {
          name: "clues",
          description: "Quickfire only: stop after this many clues (default endless)",
          type: 4,
          required: false,
          min_value: 5,
          max_value: 100,
        },
        {
          name: "round",
          description: "Board only: Jeopardy ($200–$1000) or Double Jeopardy ($400–$2000)",
          type: 3,
          required: false,
          choices: [
            { name: "Jeopardy", value: "1" },
            { name: "Double Jeopardy", value: "2" },
          ],
        },
      ],
    },
    { name: "stop", description: "End the game running here", type: 1 },
    { name: "skip", description: "Throw out the current clue", type: 1 },
    { name: "scores", description: "Scores for this game, or all-time standings", type: 1 },
  ],
};

function reply(content: string, opts: { ephemeral?: boolean } = {}) {
  return { type: 4, data: { content, ...(opts.ephemeral ? { flags: EPHEMERAL } : {}) } };
}

function sub(interaction: Interaction): { name: string; options: CommandOption[] } | null {
  const s = interaction.data?.options?.find((o) => o.type === 1);
  return s ? { name: s.name, options: s.options ?? [] } : null;
}

function opt(options: CommandOption[], name: string): string | undefined {
  const v = options.find((o) => o.name === name)?.value;
  return v === undefined ? undefined : String(v);
}

function who(interaction: Interaction): { id: string; name: string } | null {
  const u = interaction.member?.user ?? interaction.user;
  if (!u?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: u.id, name: nick || u.global_name || u.username || "someone" };
}

export async function handleJeopardy(interaction: Interaction): Promise<object> {
  const channelId = interaction.channel_id;
  if (!interaction.guild_id || !channelId) return reply("This only works in a server channel.", { ephemeral: true });
  const actor = who(interaction);
  if (!actor) return reply("Couldn't tell who you are. Try again.", { ephemeral: true });
  const s = sub(interaction);
  if (!s) return reply("Pick a subcommand.", { ephemeral: true });

  switch (s.name) {
    case "start": {
      const mode = opt(s.options, "mode") === "board" ? "board" : "quickfire";
      const seconds = Number(opt(s.options, "seconds")) || DEFAULT_CLUE_SECONDS;
      const limit = Number(opt(s.options, "clues")) || 0;
      const round = opt(s.options, "round") === "2" ? 2 : 1;
      // Fire the start off the interaction's clock; the opener is posted as the bot.
      void startGame({
        channelId,
        guildId: interaction.guild_id,
        mode,
        round,
        clueSeconds: Math.min(90, Math.max(8, seconds)),
        limit,
        starterId: actor.id,
        starterName: actor.name,
      }).catch(async (err) => {
        const { discordApi } = await import("@/lib/discord/bot");
        await discordApi(`/channels/${channelId}/messages`, {
          body: { content: `Couldn't start: ${err instanceof Error ? err.message : "unknown error"}` },
        }).catch(() => undefined);
      });
      return reply(`🎙️ Setting up **${mode}**… answers are just messages in this channel.`);
    }
    case "stop": {
      const stopped = await stopGame(channelId, actor.name);
      return stopped ? reply("Stopping…", { ephemeral: true }) : reply("No game running here.", { ephemeral: true });
    }
    case "skip":
      return reply(await skipClue(channelId, actor.name), { ephemeral: true });
    case "scores": {
      const live = await currentScores(channelId);
      if (live) return reply(`📊 **This game**\n${live}`);
      return reply(`🏛️ **All-time standings**\n${await allTimeStandings()}`);
    }
    default:
      return reply("Unknown subcommand.", { ephemeral: true });
  }
}

/** `jeopardy:<cat|val|back>:<gameId>:…` board buttons. No link required. */
export async function handleJeopardyComponent(interaction: Interaction, rest: string[]): Promise<object> {
  const actor = who(interaction);
  if (!actor) return reply("Couldn't tell who you are.", { ephemeral: true });
  const [action, gameId, ...args] = rest;
  if ((action !== "cat" && action !== "val" && action !== "back") || !gameId) {
    return reply("Stale button.", { ephemeral: true });
  }
  return handleBoardPick(gameId, action, args, actor);
}

registerFeature({
  key: "jeopardy",
  commands: [JEOPARDY_COMMAND],
});
