import { db } from "@/lib/db";
import { registerFeature } from "@/lib/discord/registry";
import type { Interaction } from "@/lib/discord/interactions";
import { parseUwuLevel } from "@/lib/discord/uwuify";

/**
 * /uwu — server-admin toggle. Intentionally does NOT require a linked UDM+
 * account: Discord Administrator is the gate (the command is also hidden
 * from everyone else via default_member_permissions).
 */

const EPHEMERAL = 64;
const ADMINISTRATOR = 8n;

export const UWU_COMMAND = {
  name: "uwu",
  description: "Toggle uwu-ify on a member (all channels, until turned off)",
  type: 1,
  default_member_permissions: String(ADMINISTRATOR),
  options: [
    { name: "user", description: "Who to uwu-ify", type: 6, required: true },
    {
      name: "level",
      description: "1 light · 2 medium · 3 heavy · off",
      type: 3,
      required: true,
      choices: [
        { name: "1 — light (lisp only)", value: "1" },
        { name: "2 — medium (some uwu)", value: "2" },
        { name: "3 — heavy (a lot)", value: "3" },
        { name: "off", value: "off" },
      ],
    },
  ],
};

function ephemeral(content: string) {
  return { type: 4, data: { content, flags: EPHEMERAL } };
}

function isAdministrator(interaction: Interaction): boolean {
  const raw = interaction.member?.permissions;
  if (!raw) return false;
  try {
    const bits = BigInt(raw);
    return (bits & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

function opt(interaction: Interaction, name: string): string | undefined {
  const v = interaction.data?.options?.find((o) => o.name === name)?.value;
  return v === undefined ? undefined : String(v);
}

export async function handleUwu(interaction: Interaction): Promise<object> {
  if (!interaction.guild_id) {
    return ephemeral("This only works in a server.");
  }
  if (!isAdministrator(interaction)) {
    return ephemeral("You need the Administrator permission to uwu-ify people.");
  }

  const targetId = opt(interaction, "user");
  const levelRaw = opt(interaction, "level");
  const parsed = parseUwuLevel(levelRaw);
  if (!targetId || !parsed) {
    return ephemeral("Pick a member and a level (1, 2, 3, or off).");
  }

  const mention = `<@${targetId}>`;
  const actorId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!actorId) return ephemeral("Couldn't tell who you are. Try again.");

  if (parsed === "off") {
    await db.discordUwuTarget.deleteMany({ where: { discordUserId: targetId } });
    return ephemeral(`uwu-ify is **off** for ${mention}.`);
  }

  await db.discordUwuTarget.upsert({
    where: { discordUserId: targetId },
    create: {
      discordUserId: targetId,
      level: parsed,
      enabledByDiscordUserId: actorId,
    },
    update: {
      level: parsed,
      enabledByDiscordUserId: actorId,
      enabledAt: new Date(),
    },
  });

  const label = parsed === 1 ? "light" : parsed === 2 ? "medium" : "heavy";
  return ephemeral(`uwu-ify is **on** for ${mention} at level **${parsed}** (${label}). Every channel, until an admin turns it off.`);
}

registerFeature({
  key: "uwu",
  commands: [UWU_COMMAND],
});
