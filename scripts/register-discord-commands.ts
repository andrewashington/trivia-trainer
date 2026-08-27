/**
 * REGISTER DISCORD SLASH COMMANDS — run whenever the command set changes.
 *
 *   npm run discord:register                  # uses local .env
 *   railway run npm run discord:register      # uses prod env vars
 *
 * Bulk-overwrites the application's command list. With DISCORD_GUILD_ID set it
 * registers to that guild (instant propagation — best for iteration); without
 * it, registers globally (can take ~1h on first registration). Needs
 * DISCORD_APP_ID and DISCORD_BOT_TOKEN.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// tsx doesn't load .env — fill in anything missing with a minimal parse.
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

// Option types: 1 sub-command, 3 string, 6 user.
const COMMANDS = [
  {
    name: "link",
    description: "Link this Discord account to your UDM+ profile",
    type: 1,
  },
  {
    name: "unlink",
    description: "Disconnect this Discord account from UDM+",
    type: 1,
  },
  {
    name: "events",
    description: "The next few events, with RSVP counts and your status",
    type: 1,
  },
  {
    name: "countdowns",
    description: "Active countdown clocks",
    type: 1,
  },
  {
    name: "coins",
    description: "Coin balance and recent earnings",
    type: 1,
    options: [
      { name: "user", description: "Whose balance (default: you)", type: 6, required: false },
    ],
  },
  {
    name: "pet",
    description: "Check on the pet (and give it a pat)",
    type: 1,
  },
  {
    name: "idea",
    description: "Pitch an idea to the suggestion box",
    type: 1,
    options: [
      { name: "title", description: "The idea", type: 3, required: true, max_length: 200 },
      { name: "detail", description: "Optional detail", type: 3, required: false, max_length: 1000 },
    ],
  },
  { name: "polls", description: "Open polls, with vote buttons", type: 1 },
  {
    name: "poll",
    description: "Quick native poll",
    type: 1,
    options: [
      { name: "question", description: "What are we deciding?", type: 3, required: true, max_length: 300 },
      { name: "options", description: "Answers, comma-separated (2–10)", type: 3, required: true },
    ],
  },
  {
    name: "udm",
    description: "Ask UDM+ anything — a question, or to make / do something",
    type: 1,
    options: [
      { name: "message", description: "What do you want?", type: 3, required: true, max_length: 400 },
    ],
  },
  {
    name: "clear",
    description: "Start a fresh conversation — clears UDM+'s memory of this channel's recent exchanges",
    type: 1,
  },
  {
    name: "uwu",
    description: "Toggle uwu-ify on a member (all channels, until turned off)",
    type: 1,
    default_member_permissions: "8",
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
  },
  {
    name: "oxford",
    description: "Toggle Oxford-comma enforcement on a member (all channels, until turned off)",
    type: 1,
    default_member_permissions: "8",
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
  },
  {
    name: "chandler-mode",
    description: "Toggle l→r rewrite on a member (all channels, until turned off)",
    type: 1,
    default_member_permissions: "8",
    options: [
      { name: "user", description: "Who to chandler-ify", type: 6, required: true },
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
  },
  { name: "marketplace", description: "What's for sale, with claim buttons", type: 1 },
  { name: "ideas", description: "Top open ideas, with upvote buttons", type: 1 },
  { name: "recipes", description: "Latest cookbook additions", type: 1 },
  { name: "nowplaying", description: "What everyone's watching, reading & playing", type: 1 },
  { name: "map", description: "Freshest pins on the shared atlas", type: 1 },
  { name: "stakes", description: "Open bets and when they resolve", type: 1 },
  { name: "birthdays", description: "Upcoming birthdays", type: 1 },
  { name: "arcade", description: "Game leaderboards", type: 1 },
  { name: "tanks", description: "Your active duels and whose turn it is", type: 1 },
  {
    name: "wishlist",
    description: "Wishlist quick actions",
    type: 1,
    options: [
      {
        name: "add",
        description: "Add a link to your wishlist",
        type: 1,
        options: [
          { name: "url", description: "Product link", type: 3, required: true },
          { name: "title", description: "Override the auto-detected title", type: 3, required: false, max_length: 200 },
        ],
      },
    ],
  },
];

async function putCommands(appId: string, token: string, endpoint: string, commands: unknown[]) {
  const res = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  return (await res.json()) as { name: string }[];
}

async function main() {
  const appId = process.env.DISCORD_APP_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !token) {
    console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first.");
    process.exit(1);
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const base = `https://discord.com/api/v10/applications/${appId}`;

  if (guildId) {
    // Register to guild (instant propagation) and clear global commands so
    // they don't show up as duplicates alongside the guild-scoped ones.
    const registered = await putCommands(appId, token, `${base}/guilds/${guildId}/commands`, COMMANDS).catch(
      (err) => { console.error(err.message); process.exit(1); }
    );
    console.log(`Registered ${registered.length} commands (guild ${guildId}): ${registered.map((c) => c.name).join(", ")}`);

    const global = await putCommands(appId, token, `${base}/commands`, []).catch(
      (err) => console.error("Warning: could not clear global commands:", err.message)
    );
    if (global !== undefined) console.log("Global commands cleared (was causing duplicates).");
  } else {
    const registered = await putCommands(appId, token, `${base}/commands`, COMMANDS).catch(
      (err) => { console.error(err.message); process.exit(1); }
    );
    console.log(`Registered ${registered.length} commands (global): ${registered.map((c) => c.name).join(", ")}`);
  }
}

void main();
