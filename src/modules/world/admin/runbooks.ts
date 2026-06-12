/**
 * Process runbooks shown in /world/admin — Andrew's side of every world
 * workflow, kept where he'll actually look for them. Structured data so
 * the console can render real steps with YOU/CLAUDE badges; the deep
 * technical versions live in docs/world-design.md.
 *
 * Inline `backticks` render as code chips in the console.
 */

export type RunbookSection = {
  heading: string;
  /** Who does this part. Colors the section badge. */
  owner: "you" | "claude" | "info";
  intro?: string;
  steps?: string[];
};

export type Runbook = {
  id: string;
  title: string;
  tagline: string;
  sections: RunbookSection[];
};

export const RUNBOOKS: Runbook[] = [
  {
    id: "new-map",
    title: "Add a new map",
    tagline: "one command scaffolds it — you only paint",
    sections: [
      {
        heading: "Scaffold the map",
        owner: "you",
        intro:
          "Never copy or save-as a template again. One command creates the file with every layer pre-named, the right tilesets loaded, a collision border, and a spawn point — and registers it with the game.",
        steps: [
          "In the repo: `npm run world:new-map -- cafe-interior --kind interior --label \"The Cafe\"`",
          "Kinds: `interior` (40x30, I1–I6 tilesets) or `exterior` (50x50, outdoor tilesets, grass pre-filled). Custom size: `--size 60x40`",
          "Too lazy to run a command? Just tell Claude \"scaffold me an interior map called cafe-interior\" — same result.",
        ],
      },
      {
        heading: "Paint it in Tiled",
        owner: "you",
        intro: "Open `assets-src/world.tiled-project` in Tiled, pick your new map. The layers already exist — paint into them, don't create new ones.",
        steps: [
          "Tile layers (bottom→top, already created): interiors `subfloor` → `floor` → `props`, exteriors `ground` → `props`. Put anything that should draw ABOVE players (awnings, treetops, tall furniture tops) on `overhead`.",
          "`collision` layer: draw rectangles over everything solid. The map border is pre-drawn. Use the Rectangle tool — avoid single clicks (they make zero-size objects that collide with nothing).",
          "`spawns` layer: a point named `spawn` already exists — drag it to where players should arrive (usually just inside the door).",
          "`npcs` layer (optional): Insert Point where an NPC stands. Name = its dialog key (e.g. `barista`). Class = display name (e.g. `Barista`).",
          "`portals` layer: leave it — Claude wires doors during handoff.",
          "Save. That's it for Tiled.",
        ],
      },
      {
        heading: "Hand off",
        owner: "you",
        steps: [
          "Tell Claude: \"cafe-interior is painted — the door connects to the cafe storefront on the neighborhood map\" (or wherever).",
        ],
      },
      {
        heading: "What happens next",
        owner: "claude",
        steps: [
          "Wires portals both ways + a return spawn outside the door",
          "Runs `npm run world:export` — this VALIDATES the map contract (layers, spawn, portal targets) and fails loudly with exact fix-its",
          "Adds NPC dialog defaults (editable in the Dialogue tab after)",
          "Typechecks, commits, pushes, syncs assets to S3 — live in minutes",
        ],
      },
    ],
  },
  {
    id: "new-interactive",
    title: "Add an interactive element",
    tagline: "vendors, minigames, mailboxes — the shop is the template",
    sections: [
      {
        heading: "Your part",
        owner: "you",
        steps: [
          "Place an NPC point on the map (`npcs` layer — see Add a new map), or pick an existing NPC.",
          "Describe the interaction to Claude: \"the barista sells coffee buffs\", \"the arcade cabinet plays snake for tickets\".",
          "After it ships: tune its prices/dialog right here in the console — no deploy.",
        ],
      },
      {
        heading: "How Claude builds it (the invariant pattern)",
        owner: "claude",
        steps: [
          "One entry in `NPC_PANELS` (WorldScene) — talking to the NPC freezes the game and opens a React panel",
          "A modal in `src/modules/world/`, rendered by WorldClient, talking to `/api/world/<thing>/` routes",
          "Anything tunable gets code defaults + WorldConfig overrides → it shows up in this console",
          "Money always flows through the coin ledger in one transaction",
        ],
      },
    ],
  },
  {
    id: "shipping",
    title: "How things ship",
    tagline: "three pipelines — know which one you're touching",
    sections: [
      {
        heading: "This console (instant)",
        owner: "info",
        steps: [
          "Prices, item names, NPC dialogue → saved to the database, live on the player's next page load. No deploy, no sync, no Claude.",
        ],
      },
      {
        heading: "Assets: maps, tilesets, character parts (minutes, no deploy)",
        owner: "claude",
        steps: [
          "`npm run world:export` (also validates the map contract)",
          "`railway run --service trivia-trainer npx tsx scripts/world-sync-assets.ts`",
          "Live on next page load — the game fetches assets from S3.",
        ],
      },
      {
        heading: "Code: features, scene logic, catalog defaults (~5 min)",
        owner: "claude",
        steps: [
          "Commit → push → Railway auto-builds. DB migrations run automatically on boot.",
          "Rollback: Railway dashboard → Deployments → last good → Redeploy.",
        ],
      },
    ],
  },
];
