/**
 * MAP_REGISTRY — the single list of world maps. The exporter
 * (scripts/world-export-map.ts) reads it to know what to export, the
 * admin console lists it, and portals/presence reference maps by `id`.
 *
 * Adding a map (full runbook in /world/admin → Runbooks): save the .tmx
 * under assets-src/runtime/world/maps/, register it here, export, sync.
 */
export type WorldMapDef = {
  id: string; // map id used by portals + presence rooms
  tmx: string; // authoring source, repo-relative
  label: string; // human name for the admin console
  kind: "exterior" | "interior";
};

export const MAP_REGISTRY: WorldMapDef[] = [
  {
    id: "neighborhood",
    tmx: "assets-src/runtime/world/maps/neighborhood.tmx",
    label: "The Neighborhood",
    kind: "exterior",
  },
  {
    id: "market-interior",
    tmx: "assets-src/runtime/world/maps/market-interior.tmx",
    label: "Threads & Such (market)",
    kind: "interior",
  },
  {
    id: "house-interior-1",
    tmx: "assets-src/runtime/world/maps/house-interior-1.tmx",
    label: "House Interior",
    kind: "interior",
  },
  {
    id: "home-generic",
    tmx: "assets-src/runtime/world/maps/home-generic.tmx",
    label: "Home (buyable house interior)",
    kind: "interior",
  },
];
