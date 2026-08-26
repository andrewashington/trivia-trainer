import { db } from "@/lib/db";
import { registerFeature } from "@/lib/discord/registry";
import type { Interaction } from "@/lib/discord/interactions";

/**
 * /oxford — server-admin toggle. Same gate as /uwu: Discord Administrator,
 * no linked UDM+ account required.
 */

const EPHEMERAL = 64;
const ADMINISTRATOR = 8n;

export const OXFORD_COMMAND = {
  name: "oxford",
  description: "Toggle Oxford-comma enforcement on a member (all channels, until turned off)",
  type: 1,
  default_member_permissions: String(ADMINISTRATOR),
  options: [
    { name: "user", description: "Who to Oxford-comma-ify", type: 6, required: true },
    {
      name: "mode",
      description: "on or off",
      type: 3,
      required: true,
      choices: [
        { name: "on", value: "on" },
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

export async function handleOxford(interaction: Interaction): Promise<object> {
  if (!interaction.guild_id) {
    return ephemeral("This only works in a server.");
  }
  if (!isAdministrator(interaction)) {
    return ephemeral("You need the Administrator permission to Oxford-comma-ify people.");
  }

  const targetId = opt(interaction, "user");
  const mode = opt(interaction, "mode")?.trim().toLowerCase();
  if (!targetId || (mode !== "on" && mode !== "off")) {
    return ephemeral("Pick a member and on or off.");
  }

  const mention = `<@${targetId}>`;
  const actorId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!actorId) return ephemeral("Couldn't tell who you are. Try again.");

  if (mode === "off") {
    await db.discordOxfordTarget.deleteMany({ where: { discordUserId: targetId } });
    return ephemeral(`Oxford-comma enforcement is **off** for ${mention}.`);
  }

  await db.discordOxfordTarget.upsert({
    where: { discordUserId: targetId },
    create: {
      discordUserId: targetId,
      enabledByDiscordUserId: actorId,
    },
    update: {
      enabledByDiscordUserId: actorId,
      enabledAt: new Date(),
    },
  });

  return ephemeral(
    `Oxford-comma enforcement is **on** for ${mention}. Lists of three or more get the serial comma, every channel, until an admin turns it off.`
  );
}

registerFeature({
  key: "oxford",
  commands: [OXFORD_COMMAND],
});
