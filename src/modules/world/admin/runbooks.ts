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
        heading: "Open World Studio",
        owner: "you",
        intro:
          "Double-click `World Studio.command` on your Desktop. A control panel opens in the browser — no commands, no file paths. (First time, macOS may ask you to allow it: right-click → Open.)",
        steps: [
          "In Studio → \"New map\": type an id (e.g. `cafe-interior`), pick interior/exterior, optional label → Create. Every layer is pre-named, tilesets loaded, collision border + `spawn` point placed, the map is registered with the game, and Tiled opens on it automatically.",
          "No Studio handy? Same thing via `npm run world:new-map -- cafe-interior --kind interior`, or just ask Claude.",
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
        heading: "Ship + hand off",
        owner: "you",
        steps: [
          "In Studio: hit \"🚢 Ship maps\" — it validates, commits, pushes, and syncs assets. If validation fails it tells you exactly what to fix in Tiled.",
          "Then tell Claude: \"cafe-interior is shipped — the door connects to the cafe storefront on the neighborhood map\" (or wherever). Claude wires the doors + dialog.",
        ],
      },
      {
        heading: "What happens next",
        owner: "claude",
        steps: [
          "Wires portals both ways + a return spawn outside the door",
          "Adds NPC dialog defaults (editable in the Dialogue tab after)",
          "Re-validates, ships the wiring — live in minutes",
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
        owner: "info",
        steps: [
          "Maps: World Studio's \"🚢 Ship maps\" button does the whole chain (validate → commit → push → S3 sync). You can do this yourself.",
          "Under the hood / other assets: `npm run world:export` then `railway run --service trivia-trainer npx tsx scripts/world-sync-assets.ts` — Claude's department.",
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
