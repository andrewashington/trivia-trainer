/**
 * Houses — the neighborhood's six buyable plots. Each plot is a door on
 * the neighborhood map (portal rects named "plot-N"); buying one claims
 * the plot globally (WorldHouse row, one per user, first come first
 * served) and the buyer "owns" the home-generic interior behind it.
 *
 * Interiors are instanced by plot: everyone loads the same home-generic
 * map, but presence/chat rooms are keyed per plot so visitors to plot 3
 * only see other people in plot 3's house. Doors are unlocked — anyone
 * may wander into an owned house (phase 2 may add locks); unowned doors
 * open the for-sale panel instead.
 */

export const HOUSE_PLOTS = [1, 2, 3, 4, 5, 6] as const;

/** Default sticker price; admin-tunable via WorldConfig key "houses". */
export const DEFAULT_HOUSE_PRICE = 20000;

/** Presence/chat room key for one plot's interior instance. */
export function houseRoomKey(plot: number): string {
  return `home-generic#plot-${plot}`;
}

/** The portal-object prefix on the neighborhood map ("plot-3" → 3). */
export function parsePlotPortal(name: string): number | null {
  const m = /^plot-(\d+)$/.exec(name);
  if (!m) return null;
  const plot = Number(m[1]);
  return (HOUSE_PLOTS as readonly number[]).includes(plot) ? plot : null;
}
