/**
 * Server-side presence store for the world (v1 polling transport).
 *
 * In-memory Map<mapId, Map<userId, entry>> with a TTL sweep — same
 * pattern as src/modules/trivia/store.ts. Single Railway instance, so
 * module memory is the source of truth; nothing is persisted. A peer
 * that stops heartbeating simply ages out.
 */

import type { FacingDirection } from "./types";

export type PresenceEntry = {
  userId: string;
  name: string;
  /** Asset-relative spritesheet path incl. cache-bust, e.g. "avatars/x.png?v=123". */
  sheetPath: string;
  x: number;
  y: number;
  facing: FacingDirection;
  moving: boolean;
  at: number; // last heartbeat, ms epoch
};

/** Peers older than this are considered gone (heartbeat is ~2s). */
const PRESENCE_TTL_MS = 10_000;

const maps = new Map<string, Map<string, PresenceEntry>>();

function sweep(entries: Map<string, PresenceEntry>): void {
  const now = Date.now();
  for (const [id, e] of entries) {
    if (now - e.at > PRESENCE_TTL_MS) entries.delete(id);
  }
}

export function heartbeat(
  mapId: string,
  entry: Omit<PresenceEntry, "at">
): void {
  let entries = maps.get(mapId);
  if (!entries) {
    entries = new Map();
    maps.set(mapId, entries);
  }
  entries.set(entry.userId, { ...entry, at: Date.now() });
}

export function leave(mapId: string, userId: string): void {
  maps.get(mapId)?.delete(userId);
}

/** Everyone on the map except the caller, freshly swept. */
export function peers(mapId: string, exceptUserId: string): PresenceEntry[] {
  const entries = maps.get(mapId);
  if (!entries) return [];
  sweep(entries);
  return [...entries.values()].filter((e) => e.userId !== exceptUserId);
}
