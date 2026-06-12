/**
 * worldBridge — the typed event bus between the Phaser scene and the
 * React layer above it. This is THE pattern for world interactivity:
 *
 *   scene  ──open-panel──▶  React renders a modal over the canvas
 *   React  ──panel-closed─▶ scene re-enables movement input
 *   React  ──avatar-updated▶ scene hot-swaps the player spritesheet
 *   React  ──music-muted──▶ scene mutes/unmutes the world music loop
 *   React  ──chat-send────▶ scene relays a room chat message
 *   scene  ──chat-message─▶ React renders chat history
 *
 * New interactive elements (vendors, minigames, mailboxes…) add an event
 * here, emit it from the scene's NPC/object action table, and render
 * their UI in WorldClient. Game state stays in Phaser; anything with
 * forms, money, or persistence is React + API routes.
 */

export type WorldBridgeEvents = {
  /** Scene asks React to open a UI panel (player input freezes). */
  "open-panel": { panel: "shop"; npc: string };
  /** React closed whatever panel was open (input unfreezes). */
  "panel-closed": void;
  /** The player's composited sheet changed (e.g. equipped an outfit). */
  "avatar-updated": { sheetPath: string };
  /** React toggled the world music mute state. */
  "music-muted": { muted: boolean };
  /** React submitted a room chat message. */
  "chat-send": { text: string };
  /** React focused/blurred the chat input; scene pauses movement keys while focused. */
  "chat-focus": { focused: boolean };
  /** Scene received a room chat message to render. */
  "chat-message": {
    id: string;
    userId: string;
    name: string;
    text: string;
    at: number;
    mine?: boolean;
  };
  /** Scene reports whether websocket chat is currently available. */
  "chat-status": { available: boolean };
};

type Handler<T> = (payload: T) => void;

class WorldBridge {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof WorldBridgeEvents>(event: K, fn: Handler<WorldBridgeEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof WorldBridgeEvents>(event: K, payload: WorldBridgeEvents[K]): void {
    for (const fn of this.handlers.get(event) ?? []) {
      (fn as Handler<WorldBridgeEvents[K]>)(payload);
    }
  }
}

export const worldBridge = new WorldBridge();
