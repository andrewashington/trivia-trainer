/**
 * Process runbooks shown in /world/admin — Andrew's side of every world
 * workflow, kept where he'll actually look for them. The deep technical
 * versions live in docs/world-design.md; these are the operator's view.
 */

export type Runbook = { id: string; title: string; body: string };

export const RUNBOOKS: Runbook[] = [
  {
    id: "new-map",
    title: "Add a new map",
    body: `YOUR PART (in Tiled)

1. Open assets-src/world.tiled-project in Tiled.
2. For interiors: open maps/interior-template.tmx and immediately
   "Save As" a NEW file in assets-src/runtime/world/maps/
   (e.g. cafe-interior.tmx). Never build inside the template.
3. Paint tile layers bottom-to-top. Any names are fine
   (subfloor/floor/props...) EXCEPT "overhead", which is reserved for
   things that draw above players (awnings, tall furniture tops).
4. Add object layers (names exact):
   - collision: rectangles over every solid thing + the walls
   - spawns:    a point named "spawn" where players arrive
   - npcs:      (optional) a point per NPC; name = its dialog/shop key
   - portals:   (optional, Claude can do this part) a rectangle per
     door; Name = target map id, Class = spawn point to arrive at
5. Save. Done with Tiled.

HAND OFF TO CLAUDE — say:
  "New map saved at maps/<file>.tmx, call it <map-id>. The door
   connects to <where on which map>."

CLAUDE'S PART (so you know what happens next): registers the map in
MAP_REGISTRY, wires portals + a return spawn on the source map, adds
NPC dialog, exports, typechecks, commits, pushes, syncs assets to S3.`,
  },
  {
    id: "new-interactive",
    title: "Add an interactive element (vendor, minigame…)",
    body: `The shop is the reference implementation. The shape is always:

1. An NPC point on the map (your part, in Tiled — see "Add a new map"
   step 4) or an existing NPC.
2. Scene-side: one entry in NPC_PANELS (WorldScene.ts) mapping the NPC
   name to a panel id. Talking to it freezes the game and opens React.
3. A modal component in src/modules/world/, rendered by WorldClient,
   talking to API routes under /api/world/<thing>/.
4. Anything tunable (prices, dialog, drop rates) gets defaults in code
   and admin overrides via WorldConfig — then it's editable right here
   in this console without a deploy.

YOUR PART: describe the interaction ("the barista sells coffee buffs",
"the arcade cabinet plays snake for tickets") and place the NPC point.
Claude builds the rest following the shop's pattern.`,
  },
  {
    id: "shipping",
    title: "How things ship (and what edits skip the deploy)",
    body: `TWO PIPELINES, know which one you're touching:

CODE (scene logic, new features, catalog defaults)
  → commit → push → Railway auto-builds (~3-5 min). Claude handles it.

ASSETS (maps, tilesets, character parts)
  → npx tsx scripts/world-export-map.ts
  → railway run --service trivia-trainer npx tsx scripts/world-sync-assets.ts
  → live on next page load, NO deploy needed. Claude handles it.

NO PIPELINE AT ALL (this console)
  Prices, item names, NPC dialog — saved straight to the database,
  players see it on their next page load / shop open.

DB migrations ship with code and run automatically on boot.
Rollback: Railway dashboard → Deployments → last good → Redeploy.`,
  },
];
