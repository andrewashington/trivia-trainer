/**
 * REGISTER DISCORD SLASH COMMANDS — run whenever the command set changes.
 *
 *   npm run discord:register                  # uses local .env
 *   railway run npm run discord:register      # uses prod env vars
 *
 * Bulk-overwrites the application's GLOBAL command list (global commands
 * can take up to ~1 hour to propagate on first registration; usually
 * minutes). Needs DISCORD_APP_ID and DISCORD_BOT_TOKEN.
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

async function main() {
  const appId = process.env.DISCORD_APP_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !token) {
    console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first.");
    process.exit(1);
  }

  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS),
  });
  if (!res.ok) {
    console.error(`Discord ${res.status}:`, await res.text());
    process.exit(1);
  }
  const registered = (await res.json()) as { name: string }[];
  console.log(`Registered ${registered.length} commands: ${registered.map((c) => c.name).join(", ")}`);
}

void main();
