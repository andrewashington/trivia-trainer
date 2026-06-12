/**
 * WorldScene — Phase 0 spike.
 *
 * Loads a Tiled JSON map + spritesheet from /api/world/assets/*,
 * creates tile layers, arcade collision bodies from the "collision"
 * object layer, spawns the player at the "spawns" layer's "spawn" point,
 * and handles keyboard + tap/click-to-walk movement.
 *
 * Frame layout (Premade_Character_01.png, 896×656, frameW=16, frameH=32 —
 * characters are TWO tiles tall; verified visually via labeled crops):
 *   Sheet cols = 56.  Frame index = row * 56 + col (rows are 32px).
 *   Row 0: idle (4 frames), direction order RIGHT, UP, LEFT, DOWN
 *     0 = idle right, 1 = idle up, 2 = idle left, 3 = idle down
 *   Row 1: 6-frame idle cycles; Row 2 (frames 112+): walk cycles, 6 frames each, same order
 *     right cols 0–5   → frames 56–61
 *     up    cols 6–11  → frames 62–67
 *     left  cols 12–17 → frames 68–73
 *     down  cols 18–23 → frames 74–79
 */

import Phaser from "phaser";
import type { FacingDirection, PlayerState } from "./types";
import {
  SocketTransport,
  type ChatMessage,
  type Peer,
  type PresenceTransport,
} from "./transport";
import { worldBridge } from "./bridge";
import { houseRoomKey, parsePlotPortal } from "./houses";
import { parseSpriteKey, type FurniturePlacePayload, type ScenePlacedItem } from "./furniture";

// Context while inside (or entering) a plot's house instance. Carried
// across the scene restart so the interior knows whose door to exit to
// and which presence room to join.
type HouseCtx = { plot: number; ownerId: string; ownerName: string; mine: boolean };

// A furniture piece currently rendered in the room. `x`/`y` are the
// sprite's floor-contact point (origin is bottom-center). `rotation` is
// 0 (as-drawn) or 1 (mirrored) — 2D sprites flip, they don't spin.
type PlacedFurniture = {
  sprite: Phaser.GameObjects.Sprite;
  data: FurniturePlacePayload;
  x: number;
  y: number;
  rotation: number;
};

// Asset base URL — served (and auth-gated) by our API route.
const ASSET_BASE = "/api/world/assets";

const TILE = 16;

/**
 * Depth bands. The world is y-sorted: characters and furniture share an
 * "entity" band where depth tracks the floor-contact Y, so you walk behind
 * a tall bookshelf and in front of a rug. Bands are kept far apart so a
 * piece near the bottom of the room (y≈250) never crosses into the layer
 * above it (tiles < decals < entities < overhead < names/ghosts < bubbles).
 */
const DEPTH_TILE_CLAMP = 8; // non-overhead tile layers clamp here
const DEPTH_DECAL = 100; // rugs/flat floor items: DEPTH_DECAL + y
const DEPTH_ENTITY = 1000; // player, ghosts, npcs, furniture: DEPTH_ENTITY + floorY
const DEPTH_OVERHEAD = 9000; // roof/treetops/tall furniture tops
const DEPTH_NAME = 9500; // name tags float above the décor
const DEPTH_PLACING = 9700; // the ghost being placed sits on top
const DEPTH_BUBBLE = 9800; // chat bubbles win
const DEPTH_GRID = 90; // decorate grid overlay (above tiles, under décor)
const DEPTH_LOADING = 1_000_000;
const WORLD_MUSIC_KEY = "world-pixel-jackpot";
const WORLD_MUSIC_SRC = "/music/pixel-jackpot.mp3";
const WORLD_MUSIC_VOLUME = 0.28;

// Pixel speed for player movement.
const PLAYER_SPEED = 90;
// Arrival threshold for click-to-walk (pixels).
const ARRIVE_THRESHOLD = 4;

// Spritesheet frame layout constants.
const FRAME_COLS = 56;

// Presence: how fast ghosts chase their target position. Heartbeats
// arrive ~every 2s, so ghosts cover the gap a touch faster than real
// walking to avoid endless trailing.
const GHOST_SPEED = PLAYER_SPEED * 1.25;
// How close (px) the player must be to an NPC to talk to it.
const NPC_TALK_RANGE = 36;
const CHAT_BUBBLE_MS = 5000;
const CHAT_MAX_CHARS = 180;

// Interactive NPCs: name → which React panel talking to them opens
// (via worldBridge). NPCs not listed here just cycle dialog lines.
const NPC_PANELS: Record<string, "shop"> = {
  shopkeep: "shop",
};

// Walk-on interaction spots: object name on a map's "interaction" layer →
// which React panel stepping on it opens. Unlisted/unnamed objects are
// inert (safe to sketch future spots in Tiled before wiring them here).
const INTERACTION_PANELS: Record<string, "shop" | "arcade"> = {
  "game-interaction-spot": "arcade",
};

// NPC dialog, keyed by the object name on the map's "npcs" layer.
// Each interaction advances to the next line. (NPCs in NPC_PANELS skip
// dialog and open their panel instead — their voice lives in the modal.)
const NPC_LINES: Record<string, string[]> = {};
// A peer further than this from its ghost just teleports (joined,
// door transition, or a long network gap — don't slide across the map).
const GHOST_SNAP_DISTANCE = 160;

function frame(row: number, col: number): number {
  return row * FRAME_COLS + col;
}

type WorldMusicSound = Phaser.Sound.BaseSound & {
  mute: boolean;
  volume: number;
  setMute(value: boolean): WorldMusicSound;
  setVolume(value: number): WorldMusicSound;
};

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private clickTarget: Phaser.Math.Vector2 | null = null;
  private facing: FacingDirection = "down";

  // Asset-relative path of the player's spritesheet (personal composited
  // avatar, e.g. "avatars/<userId>.png"); falls back to the premade sheet.
  private characterPath = "character.png";

  // Which map we're on and which spawn point to appear at. Portals
  // restart the scene with new values (textures/anims survive restarts).
  private mapId = "neighborhood";
  private spawnName = "spawn";

  // Portal rectangles from the map's "portals" object layer. Disarmed
  // until the player has fully stepped off them once, so an arrival
  // spawn placed on/near a doorway doesn't instantly bounce you back.
  private portals: {
    rect: Phaser.Geom.Rectangle;
    target: string;
    spawn: string;
  }[] = [];
  private portalsArmed = false;
  private switchingMap = false;
  private houseCtx: HouseCtx | null = null;

  // Walk-on spots from the map's "interaction" object layer. Same
  // arm/disarm dance as portals so a closed panel doesn't instantly
  // re-open while the player is still standing on the spot.
  private interactions: { rect: Phaser.Geom.Rectangle; panel: "shop" | "arcade" }[] = [];
  private interactionsArmed = false;

  // NPCs from the map's "npcs" object layer.
  private npcs: {
    sprite: Phaser.GameObjects.Sprite;
    name: string;
    lineIdx: number;
  }[] = [];
  private talkKey: Phaser.Input.Keyboard.Key | null = null;
  private bubble: Phaser.GameObjects.Text | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;
  private playerChatBubble: Phaser.GameObjects.Container | null = null;
  private playerChatBubbleTimer: Phaser.Time.TimerEvent | null = null;

  // True while a React panel (shop etc.) is open over the canvas —
  // gameplay input is frozen so WASD doesn't walk under the modal.
  private uiOpen = false;
  private chatFocused = false;
  private bridgeUnsubs: (() => void)[] = [];
  // Texture key of the player's sheet; changes when the avatar is
  // re-composited mid-session (anims are prefixed by this key).
  private playerKey = "character";
  private music: WorldMusicSound | null = null;
  private musicMuted = false;

  // ── Furniture & decorate mode ──────────────────────────────────────────
  private colliders!: Phaser.Physics.Arcade.StaticGroup; // map walls
  private furnitureColliders!: Phaser.Physics.Arcade.StaticGroup; // solid décor
  private wallRects: Phaser.Geom.Rectangle[] = []; // map collision, for placement validity
  private placed = new Map<string, PlacedFurniture>(); // ownedId → rendered piece
  private storedThisSession = new Set<string>(); // pieces picked up this session
  private atlasPromises = new Map<string, Promise<void>>(); // de-duped atlas loads
  private mapWidthPx = 0;
  private mapHeightPx = 0;
  private buildGen = 0; // bumps each buildWorld; guards async furniture loads

  private decorating = false;
  private placingGhost:
    | { sprite: Phaser.GameObjects.Sprite; data: FurniturePlacePayload; valid: boolean }
    | null = null;
  private selectedId: string | null = null;
  private selectHighlight: Phaser.GameObjects.Graphics | null = null;
  private gridOverlay: Phaser.GameObjects.Graphics | null = null;
  private dragOrigin: { x: number; y: number } | null = null;

  constructor() {
    super({ key: "WorldScene" });
  }

  init(data: {
    characterPath?: string;
    mapId?: string;
    spawnName?: string;
    musicMuted?: boolean;
    houseCtx?: HouseCtx | null;
  }) {
    if (data?.characterPath) this.characterPath = data.characterPath;
    this.mapId = data?.mapId ?? "neighborhood";
    this.spawnName = data?.spawnName ?? "spawn";
    this.houseCtx = data?.houseCtx ?? null;
    this.musicMuted = data?.musicMuted ?? this.musicMuted;
    // Scene restarts (map transitions) reuse this instance — reset
    // everything that referenced the previous map's objects.
    this.player = undefined as unknown as Phaser.Physics.Arcade.Sprite;
    this.clickTarget = null;
    this.stage2 = false;
    this.transport = null;
    this.ghosts = new Map();
    this.loadingSheets = new Set();
    this.portals = [];
    this.portalsArmed = false;
    this.interactions = [];
    this.interactionsArmed = false;
    this.switchingMap = false;
    this.npcs = [];
    this.bubble = null;
    this.bubbleTimer = null;
    this.playerChatBubble = null;
    this.playerChatBubbleTimer = null;
    this.uiOpen = false;
    this.chatFocused = false;
    this.music = null;
    // Furniture/decorate state is per-map — the scene restarts on every
    // door, so wipe what referenced the previous room's objects.
    this.placed = new Map();
    this.storedThisSession = new Set();
    this.atlasPromises = new Map();
    this.wallRects = [];
    this.decorating = false;
    this.placingGhost = null;
    this.selectedId = null;
    this.selectHighlight = null;
    this.gridOverlay = null;
    this.dragOrigin = null;
    for (const u of this.bridgeUnsubs) u();
    this.bridgeUnsubs = [];
    this.bridgeUnsubs.push(
      worldBridge.on("music-muted", ({ muted }) => this.setWorldMusicMuted(muted))
    );
    // NOTE: playerKey intentionally NOT reset — a swapped avatar sheet
    // persists at the game level across map transitions.
  }

  preload() {
    this.showLoadingScreen();
    this.load.tilemapTiledJSON(`map-${this.mapId}`, `${ASSET_BASE}/maps-json/${this.mapId}.json`);
    // raw copy of the same JSON so create() can discover tileset images
    this.load.json(`mapdata-${this.mapId}`, `${ASSET_BASE}/maps-json/${this.mapId}.json`);
    this.load.spritesheet("character", `${ASSET_BASE}/${this.characterPath}`, {
      frameWidth: 16,
      frameHeight: 32,
    });
    // NPCs always wear the premade sheet (the player's "character" key
    // may be their personal composited avatar).
    this.load.spritesheet("npc-sheet", `${ASSET_BASE}/character.png`, {
      frameWidth: 16,
      frameHeight: 32,
    });
    if (!this.cache.audio.exists(WORLD_MUSIC_KEY)) {
      this.load.audio(WORLD_MUSIC_KEY, WORLD_MUSIC_SRC);
    }
    // Admin-editable game data (NPC dialog) — cached for the session
    this.load.json("world-content", "/api/world/content");
  }

  // ── Loading screen (spans preload + the second-stage tileset load) ────
  private loadingUi: Phaser.GameObjects.GameObject[] = [];
  private loadingBar!: Phaser.GameObjects.Rectangle;

  private showLoadingScreen() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const barW = Math.min(320, width * 0.6);

    const bg = this.add.rectangle(cx, cy, width, height, 0x1a1a1a);
    const title = this.add
      .text(cx, cy - 40, "THE WORLD", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#fde047",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(cx, cy + 36, "lacing up your shoes…", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#9ca3af",
      })
      .setOrigin(0.5);
    const frame = this.add
      .rectangle(cx, cy, barW, 18)
      .setStrokeStyle(3, 0xffffff);
    this.loadingBar = this.add
      .rectangle(cx - barW / 2 + 3, cy, 1, 12, 0xfde047)
      .setOrigin(0, 0.5);

    this.loadingUi = [bg, title, hint, frame, this.loadingBar];
    for (const o of this.loadingUi) {
      (o as Phaser.GameObjects.Rectangle).setScrollFactor(0).setDepth(DEPTH_LOADING);
    }

    // First stage fills 0→50%, second stage (tileset images) 50→100%.
    const barMax = barW - 6;
    this.load.on("progress", (v: number) => {
      this.loadingBar.width = Math.max(1, barMax * (this.stage2 ? 0.5 + v / 2 : v / 2));
    });
  }

  // flips when create() kicks off the tileset-image load (second half of the bar)
  private stage2 = false;

  private hideLoadingScreen() {
    for (const o of this.loadingUi) o.destroy();
    this.loadingUi = [];
    this.cameras.main.fadeIn(450, 26, 26, 26);
  }

  create() {
    this.stage2 = true;
    // Second-stage load: the map names its tileset images (exported by
    // scripts/world-export-map.ts), so fetch whatever it declares.
    const mapdata = this.cache.json.get(`mapdata-${this.mapId}`) as {
      tilesets: { name: string; image: string }[];
    };
    for (const ts of mapdata.tilesets) {
      this.load.image(ts.name, `${ASSET_BASE}/${ts.image}`);
    }
    this.load.once("complete", () => this.buildWorld());
    this.load.start();
  }

  private buildWorld() {
    this.buildGen++;
    this.hideLoadingScreen();
    this.ensureWorldMusic();
    // ── Tilemap ─────────────────────────────────────────────────────────
    const map = this.make.tilemap({ key: `map-${this.mapId}` });
    const tiles = map.tilesets.map(
      (ts) => map.addTilesetImage(ts.name, ts.name)!
    );
    this.mapWidthPx = map.widthInPixels;
    this.mapHeightPx = map.heightInPixels;

    // Layer contract v4: tile layers render in authoring order below the
    // entities (clamped under the y-sort band), except "overhead" which
    // draws above everyone. Works for exteriors (ground/props) and
    // interiors (subfloor/floor/props).
    let depth = 0;
    for (const layerData of map.layers) {
      const isOverhead = layerData.name === "overhead";
      map
        .createLayer(layerData.name, tiles, 0, 0)
        ?.setDepth(isOverhead ? DEPTH_OVERHEAD : Math.min(depth++, DEPTH_TILE_CLAMP));
    }

    // ── Collision rectangles from "collision" object layer ───────────────
    const collisionLayer = map.getObjectLayer("collision");
    const colliders = this.physics.add.staticGroup();
    this.colliders = colliders;
    this.furnitureColliders = this.physics.add.staticGroup();
    this.wallRects = [];

    if (collisionLayer) {
      for (const obj of collisionLayer.objects) {
        const ox = obj.x ?? 0;
        const oy = obj.y ?? 0;
        const w = obj.width ?? TILE;
        const h = obj.height ?? TILE;
        const rect = this.add.rectangle(ox + w / 2, oy + h / 2, w, h);
        this.physics.add.existing(rect, true); // true = static
        colliders.add(rect);
        this.wallRects.push(new Phaser.Geom.Rectangle(ox, oy, w, h));
      }
    }

    // ── Player spawn ─────────────────────────────────────────────────────
    const spawnsLayer = map.getObjectLayer("spawns");
    const spawnObj =
      spawnsLayer?.objects.find((o) => o.name === this.spawnName) ??
      spawnsLayer?.objects.find((o) => o.name === "spawn");
    const spawnX = spawnObj?.x ?? map.widthInPixels / 2;
    const spawnY = spawnObj?.y ?? map.heightInPixels / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, this.playerKey, 0);
    this.player.setCollideWorldBounds(false);
    // Collide with the feet only (sprite is 16×32; head may overlap props)
    (this.player.body as Phaser.Physics.Arcade.Body)
      .setSize(12, 10)
      .setOffset(2, 22);
    // Depth tracks the feet so the y-sort composites the player against
    // furniture; update() keeps it current as they walk.
    this.player.setDepth(DEPTH_ENTITY + (this.player.body as Phaser.Physics.Arcade.Body).bottom);

    // Collide player with the static rectangles (map walls + solid décor).
    // Group colliders pick up members added later, so loading furniture
    // after this still blocks movement.
    this.physics.add.collider(this.player, colliders);
    this.physics.add.collider(this.player, this.furnitureColliders);

    // ── Portals ("portals" object layer) ─────────────────────────────────
    // Rect name = target map id, type/class = arrival spawn name there.
    const portalLayer = map.getObjectLayer("portals");
    for (const obj of portalLayer?.objects ?? []) {
      if (!obj.name) continue;
      this.portals.push({
        rect: new Phaser.Geom.Rectangle(
          obj.x ?? 0,
          obj.y ?? 0,
          obj.width || 16,
          obj.height || 16
        ),
        target: obj.name,
        spawn: (obj.type as string) || "spawn",
      });
    }

    // ── Interaction spots ("interaction" object layer) ───────────────────
    // Rect name picks a React panel via INTERACTION_PANELS; walking onto
    // the rect opens it (same feel as plot doors).
    for (const obj of map.getObjectLayer("interaction")?.objects ?? []) {
      const panel = obj.name ? INTERACTION_PANELS[obj.name] : undefined;
      if (!panel) continue;
      this.interactions.push({
        rect: new Phaser.Geom.Rectangle(
          obj.x ?? 0,
          obj.y ?? 0,
          obj.width || 16,
          obj.height || 16
        ),
        panel,
      });
    }

    // ── NPCs ("npcs" object layer, points) ───────────────────────────────
    this.createCharacterAnims("npc-sheet");
    for (const obj of map.getObjectLayer("npcs")?.objects ?? []) {
      const npc = this.physics.add.sprite(obj.x ?? 0, obj.y ?? 0, "npc-sheet", 0);
      npc.setDepth(DEPTH_ENTITY + npc.y + TILE); // y-sort with the player
      (npc.body as Phaser.Physics.Arcade.Body)
        .setSize(12, 10)
        .setOffset(2, 22)
        .setImmovable(true);
      npc.play("npc-sheet-idle-down");
      this.physics.add.collider(this.player, npc);
      const displayName = (obj.type as string) || obj.name || "???";
      this.add
        .text(npc.x, npc.y - 26, displayName, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#fde047",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH_NAME)
        .setResolution(3);
      this.npcs.push({ sprite: npc, name: obj.name ?? "", lineIdx: 0 });
    }

    // ── Animations ───────────────────────────────────────────────────────
    this.createCharacterAnims(this.playerKey);
    this.player.play(`${this.playerKey}-idle-down`);

    // ── Input ─────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.talkKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Right-click cancels furniture placement without popping a menu.
    this.input.mouse?.disableContextMenu();

    // Tap / click to walk — or talk, if the tap lands on a nearby NPC.
    // In decorate mode the canvas is a placement surface instead: a click
    // commits the ghost, or clicking empty space clears the selection.
    this.input.on(
      "pointerdown",
      (ptr: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (this.decorating) {
          if (ptr.rightButtonDown()) return void this.cancelPlacing();
          if (this.placingGhost) return void this.commitGhost();
          if (!currentlyOver || currentlyOver.length === 0) this.deselect();
          return;
        }
        // Convert screen coords to world coords
        const worldPoint = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const tappedNpc = this.npcs.find(
          (n) => n.sprite.getBounds().contains(worldPoint.x, worldPoint.y)
        );
        if (
          tappedNpc &&
          Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            tappedNpc.sprite.x,
            tappedNpc.sprite.y
          ) <= NPC_TALK_RANGE
        ) {
          this.talkTo(tappedNpc);
          return;
        }
        this.clickTarget = new Phaser.Math.Vector2(worldPoint.x, worldPoint.y);
      }
    );

    // ── Decorate-mode pointer handling ───────────────────────────────────
    // A ghost follows the pointer while placing; placed pieces are
    // selectable + draggable (grid-snapped). All inert outside decorate mode.
    this.input.on("pointermove", (ptr: Phaser.Input.Pointer) => {
      if (!this.decorating || !this.placingGhost) return;
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this.updateGhostAt(wp.x, wp.y);
    });
    this.input.on("gameobjectdown", (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (!this.decorating || this.placingGhost) return;
      const id = obj.getData("ownedId") as string | undefined;
      if (id) this.select(id);
    });
    this.input.on(
      "dragstart",
      (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        if (!this.decorating) return;
        const id = obj.getData("ownedId") as string | undefined;
        if (!id) return;
        const p = this.placed.get(id);
        if (!p) return;
        this.dragOrigin = { x: p.x, y: p.y };
        this.select(id);
      }
    );
    this.input.on(
      "drag",
      (
        _ptr: Phaser.Input.Pointer,
        obj: Phaser.GameObjects.GameObject,
        dragX: number,
        dragY: number
      ) => {
        if (!this.decorating) return;
        const id = obj.getData("ownedId") as string | undefined;
        if (id) this.movePlaced(id, dragX, dragY);
      }
    );
    this.input.on(
      "dragend",
      (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        if (!this.decorating) return;
        const id = obj.getData("ownedId") as string | undefined;
        const p = id ? this.placed.get(id) : undefined;
        if (id && p) {
          // Snapped onto a wall? Bounce back to where the drag began.
          if (!this.isValidPlacement(p.x, p.y, p.data) && this.dragOrigin) {
            this.movePlaced(id, this.dragOrigin.x, this.dragOrigin.y);
          }
          p.sprite.clearTint();
        }
        this.dragOrigin = null;
      }
    );

    // ── Camera ───────────────────────────────────────────────────────────
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(3);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // Pixel-art rendering
    this.cameras.main.setRoundPixels(true);

    // ── Presence (multiplayer ghosts) ────────────────────────────────────
    this.transport = new SocketTransport();
    this.transport.onPeers((peers) => this.syncPeers(peers));
    this.transport.onChat((message) => this.receiveChatMessage(message));
    this.transport.onChatStatus((available) => {
      worldBridge.emit("chat-status", { available });
    });
    // Houses are instanced per plot: same map JSON, separate presence room.
    this.transport.join(
      this.houseCtx ? houseRoomKey(this.houseCtx.plot) : this.mapId,
      () => this.playerState()
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.transport?.leave());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.transport?.leave());

    // ── React bridge (shop modal etc.) ───────────────────────────────────
    this.bridgeUnsubs.push(
      worldBridge.on("panel-closed", () => {
        this.uiOpen = false;
        this.applyKeyboardCapture();
        // The player may still be standing on the door/spot that opened
        // the panel — disarm so it only re-fires after stepping off.
        this.portalsArmed = false;
        this.interactionsArmed = false;
      }),
      worldBridge.on("enter-house", (ctx) => {
        this.uiOpen = false;
        this.applyKeyboardCapture();
        this.switchMap("home-generic", "spawn", ctx);
      }),
      worldBridge.on("avatar-updated", ({ sheetPath }) => this.swapPlayerSheet(sheetPath)),
      worldBridge.on("chat-focus", ({ focused }) => this.setChatFocused(focused)),
      worldBridge.on("chat-send", ({ text }) => this.sendChatMessage(text)),
      worldBridge.on("decorate-enter", () => this.enterDecorate()),
      worldBridge.on("decorate-exit", ({ save }) => void this.exitDecorate(save)),
      worldBridge.on("place-item", (payload) => void this.beginPlacing(payload)),
      worldBridge.on("furniture-flip", () => this.flipSelected()),
      worldBridge.on("furniture-store", () => this.storeSelected()),
      worldBridge.on("furniture-deselect", () => this.deselect()),
      worldBridge.on("remove-furniture", ({ ownedId }) => this.removeFurniture(ownedId))
    );
    const unsubAll = () => {
      for (const u of this.bridgeUnsubs) u();
      this.bridgeUnsubs = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubAll);
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubAll);

    this.input.once("pointerdown", () => {
      this.playWorldMusic();
    });

    // Tell React where we are (drives the Decorate button), then stream in
    // the room's furniture. house-context re-fires with the real home value
    // once the pieces have loaded.
    this.emitHouseContext(0);
    void this.loadHouseFurniture();
  }

  // ── Furniture: load & render ───────────────────────────────────────────

  /** Push the current house context (for the Decorate button + plaque). */
  private emitHouseContext(homeValue: number) {
    worldBridge.emit("house-context", {
      inHouse: !!this.houseCtx,
      plot: this.houseCtx?.plot ?? null,
      mine: this.houseCtx?.mine ?? false,
      ownerName: this.houseCtx?.ownerName ?? null,
      homeValue,
    });
  }

  /** Fetch and render the placed furniture for the house we just entered. */
  private async loadHouseFurniture() {
    if (!this.houseCtx) return;
    const gen = this.buildGen;
    try {
      const res = await fetch(`/api/world/house/items?plot=${this.houseCtx.plot}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ScenePlacedItem[] };
      if (gen !== this.buildGen || !this.player) return; // map changed mid-fetch
      for (const it of data.items) {
        await this.ensureAtlas(it.spriteKey);
        if (gen !== this.buildGen || !this.player) return;
        this.addFurniture(it, it.x, it.y, it.rotation);
      }
      this.rebuildFurnitureColliders();
      this.emitHouseContext(this.homeValue());
      this.emitDecorateStats();
    } catch {
      // No décor or a flaky fetch — the empty room is fine.
    }
  }

  /** Load a furniture atlas once (de-duped); resolves even if it 404s. */
  private ensureAtlas(spriteKey: string): Promise<void> {
    const parsed = parseSpriteKey(spriteKey);
    if (!parsed) return Promise.resolve();
    const atlasKey = parsed.atlasKey;
    if (this.textures.exists(atlasKey)) return Promise.resolve();
    const existing = this.atlasPromises.get(atlasKey);
    if (existing) return existing;
    const promise = new Promise<void>((resolve) => {
      const done = () => {
        this.load.off(`filecomplete-atlas-${atlasKey}`, done);
        this.load.off("loaderror", onErr);
        resolve();
      };
      const onErr = (file: { key?: string }) => {
        if (file?.key === atlasKey) done();
      };
      this.load.once(`filecomplete-atlas-${atlasKey}`, done);
      this.load.on("loaderror", onErr);
      this.load.atlas(
        atlasKey,
        `${ASSET_BASE}/atlas/${atlasKey}.png`,
        `${ASSET_BASE}/atlas/${atlasKey}.json`
      );
      this.load.start();
    });
    this.atlasPromises.set(atlasKey, promise);
    return promise;
  }

  /** Create a furniture sprite (origin bottom-center) and track it. */
  private addFurniture(
    data: FurniturePlacePayload,
    x: number,
    y: number,
    rotation: number
  ): PlacedFurniture | null {
    const parsed = parseSpriteKey(data.spriteKey);
    if (!parsed || !this.textures.exists(parsed.atlasKey)) return null;
    const sprite = this.add.sprite(x, y, parsed.atlasKey, parsed.frame);
    sprite.setOrigin(0.5, 1);
    sprite.setFlipX(rotation === 1);
    sprite.setData("ownedId", data.ownedId);
    const piece: PlacedFurniture = { sprite, data, x, y, rotation };
    this.placed.set(data.ownedId, piece);
    this.applyFurnitureDepth(piece);
    if (this.decorating) {
      sprite.setInteractive({ useHandCursor: true });
      this.input.setDraggable(sprite);
    }
    return piece;
  }

  /** Depth = floor-contact Y within the right band (rugs under furniture). */
  private applyFurnitureDepth(piece: PlacedFurniture) {
    const base = piece.data.flat ? DEPTH_DECAL : DEPTH_ENTITY;
    piece.sprite.setDepth(base + piece.sprite.y);
  }

  /** Rebuild static collision bodies for the solid pieces (walls block, rugs don't). */
  private rebuildFurnitureColliders() {
    this.furnitureColliders.clear(true, true);
    for (const piece of this.placed.values()) {
      if (!piece.data.solid) continue;
      const fw = piece.data.tileW * TILE;
      const fh = piece.data.tileH * TILE;
      const rect = this.add.rectangle(piece.sprite.x, piece.sprite.y - fh / 2, fw, fh);
      this.physics.add.existing(rect, true);
      this.furnitureColliders.add(rect);
    }
  }

  /** Total catalog value of everything currently placed (the plaque number). */
  private homeValue(): number {
    let value = 0;
    for (const piece of this.placed.values()) value += piece.data.price;
    return value;
  }

  private emitDecorateStats() {
    worldBridge.emit("decorate-stats", {
      placedCount: this.placed.size,
      placedValue: this.homeValue(),
    });
  }

  // ── Decorate mode ──────────────────────────────────────────────────────

  private enterDecorate() {
    if (!this.houseCtx?.mine || this.decorating || !this.player) return;
    this.decorating = true;
    this.clickTarget = null;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.drawGrid();
    for (const piece of this.placed.values()) {
      piece.sprite.setInteractive({ useHandCursor: true });
      this.input.setDraggable(piece.sprite);
    }
    worldBridge.emit("decorate-state", { active: true });
    this.emitDecorateStats();
  }

  private async exitDecorate(save: boolean) {
    if (!this.decorating) return;
    this.cancelPlacing();
    this.deselect();
    for (const piece of this.placed.values()) {
      this.input.setDraggable(piece.sprite, false);
      piece.sprite.disableInteractive();
      piece.sprite.clearTint();
    }
    this.gridOverlay?.destroy();
    this.gridOverlay = null;
    this.decorating = false;
    worldBridge.emit("decorate-state", { active: false });

    if (save) {
      await this.saveLayout();
    } else {
      // Discard: throw away the in-memory changes and reload from the DB.
      for (const piece of this.placed.values()) piece.sprite.destroy();
      this.placed.clear();
      this.storedThisSession.clear();
      await this.loadHouseFurniture();
    }
    this.rebuildFurnitureColliders();
    this.emitHouseContext(this.homeValue());
  }

  private drawGrid() {
    this.gridOverlay?.destroy();
    const g = this.add.graphics();
    g.lineStyle(0.5, 0xffffff, 0.12);
    for (let x = 0; x <= this.mapWidthPx; x += TILE) g.lineBetween(x, 0, x, this.mapHeightPx);
    for (let y = 0; y <= this.mapHeightPx; y += TILE) g.lineBetween(0, y, this.mapWidthPx, y);
    g.setDepth(DEPTH_GRID);
    this.gridOverlay = g;
  }

  // ── Placement controller ───────────────────────────────────────────────

  /** Snap a desired bottom-center point to the tile grid for this footprint. */
  private snapBottomCenter(bx: number, by: number, tileW: number, tileH: number) {
    const fw = tileW * TILE;
    const fh = tileH * TILE;
    const col = Math.round((bx - fw / 2) / TILE);
    const row = Math.round((by - fh) / TILE);
    return { x: col * TILE + fw / 2, y: row * TILE + fh };
  }

  /** Footprint can't leave the room; solid pieces also can't overlap walls. */
  private isValidPlacement(x: number, y: number, data: FurniturePlacePayload): boolean {
    const fw = data.tileW * TILE;
    const fh = data.tileH * TILE;
    const rect = new Phaser.Geom.Rectangle(x - fw / 2, y - fh, fw, fh);
    if (rect.x < 0 || rect.y < 0 || rect.right > this.mapWidthPx || rect.bottom > this.mapHeightPx) {
      return false;
    }
    if (data.solid) {
      for (const wall of this.wallRects) {
        if (Phaser.Geom.Rectangle.Overlaps(rect, wall)) return false;
      }
    }
    return true;
  }

  private async beginPlacing(data: FurniturePlacePayload) {
    if (!this.decorating) return;
    this.cancelPlacing();
    const parsed = parseSpriteKey(data.spriteKey);
    if (!parsed) return;
    await this.ensureAtlas(data.spriteKey);
    if (!this.decorating || !this.textures.exists(parsed.atlasKey)) return;
    const sprite = this.add
      .sprite(0, 0, parsed.atlasKey, parsed.frame)
      .setOrigin(0.5, 1)
      .setAlpha(0.75)
      .setDepth(DEPTH_PLACING);
    this.placingGhost = { sprite, data, valid: false };
    const cam = this.cameras.main;
    this.updateGhostAt(cam.worldView.centerX, cam.worldView.centerY);
  }

  private updateGhostAt(bx: number, by: number) {
    const ghost = this.placingGhost;
    if (!ghost) return;
    const { x, y } = this.snapBottomCenter(bx, by, ghost.data.tileW, ghost.data.tileH);
    ghost.sprite.setPosition(x, y);
    ghost.valid = this.isValidPlacement(x, y, ghost.data);
    if (ghost.valid) ghost.sprite.clearTint();
    else ghost.sprite.setTint(0xff6b6b);
  }

  private cancelPlacing() {
    this.placingGhost?.sprite.destroy();
    this.placingGhost = null;
  }

  private commitGhost() {
    const ghost = this.placingGhost;
    if (!ghost || !ghost.valid) return;
    const ownedId = ghost.data.ownedId;
    const x = ghost.sprite.x;
    const y = ghost.sprite.y;
    ghost.sprite.destroy();
    this.placingGhost = null;
    // Re-placing a piece that was already in the room: drop the old sprite.
    this.placed.get(ownedId)?.sprite.destroy();
    this.addFurniture(ghost.data, x, y, 0);
    this.storedThisSession.delete(ownedId);
    this.rebuildFurnitureColliders();
    worldBridge.emit("furniture-placed", { ownedId });
    this.emitDecorateStats();
    this.select(ownedId); // ready to flip/nudge immediately
  }

  private movePlaced(ownedId: string, bx: number, by: number) {
    const piece = this.placed.get(ownedId);
    if (!piece) return;
    const { x, y } = this.snapBottomCenter(bx, by, piece.data.tileW, piece.data.tileH);
    piece.sprite.setPosition(x, y);
    piece.x = x;
    piece.y = y;
    this.applyFurnitureDepth(piece);
    if (this.isValidPlacement(x, y, piece.data)) piece.sprite.clearTint();
    else piece.sprite.setTint(0xff6b6b);
    if (this.selectedId === ownedId) this.drawSelectHighlight(piece);
  }

  // ── Selection ──────────────────────────────────────────────────────────

  private select(ownedId: string) {
    const piece = this.placed.get(ownedId);
    if (!piece) return;
    this.selectedId = ownedId;
    this.drawSelectHighlight(piece);
    worldBridge.emit("furniture-selected", { ownedId, name: piece.data.name });
  }

  private deselect() {
    if (!this.selectedId && !this.selectHighlight) return;
    this.selectedId = null;
    this.selectHighlight?.destroy();
    this.selectHighlight = null;
    worldBridge.emit("furniture-deselected", undefined);
  }

  private drawSelectHighlight(piece: PlacedFurniture) {
    this.selectHighlight?.destroy();
    const b = piece.sprite.getBounds();
    const g = this.add.graphics();
    g.lineStyle(1, 0xfde047, 1);
    g.strokeRect(b.x - 1, b.y - 1, b.width + 2, b.height + 2);
    g.setDepth(DEPTH_PLACING - 1);
    this.selectHighlight = g;
  }

  private flipSelected() {
    if (!this.selectedId) return;
    const piece = this.placed.get(this.selectedId);
    if (!piece) return;
    piece.rotation = piece.rotation === 1 ? 0 : 1;
    piece.sprite.setFlipX(piece.rotation === 1);
  }

  private storeSelected() {
    const id = this.selectedId;
    if (!id) return;
    const piece = this.placed.get(id);
    if (!piece) return;
    piece.sprite.destroy();
    this.placed.delete(id);
    this.storedThisSession.add(id);
    this.deselect();
    this.rebuildFurnitureColliders();
    worldBridge.emit("furniture-stored", { ownedId: id });
    this.emitDecorateStats();
  }

  /** Remove a piece entirely (after it was sold via the React tray). */
  private removeFurniture(ownedId: string) {
    this.placed.get(ownedId)?.sprite.destroy();
    this.placed.delete(ownedId);
    this.storedThisSession.delete(ownedId);
    if (this.selectedId === ownedId) this.deselect();
    this.rebuildFurnitureColliders();
    this.emitDecorateStats();
  }

  /** Batch the session's placements (placed + stored) to the API. */
  private async saveLayout() {
    const placements: { ownedId: string; x: number | null; y: number | null; rotation: number }[] = [];
    for (const piece of this.placed.values()) {
      placements.push({
        ownedId: piece.data.ownedId,
        x: Math.round(piece.x),
        y: Math.round(piece.y),
        rotation: piece.rotation,
      });
    }
    for (const id of this.storedThisSession) {
      placements.push({ ownedId: id, x: null, y: null, rotation: 0 });
    }
    this.storedThisSession.clear();
    if (placements.length === 0) return;
    try {
      await fetch("/api/world/house/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements }),
      });
    } catch {
      // Best-effort autosave; a failed write just means the room reverts
      // to its last saved state on the next visit.
    }
  }

  // ── Room chat ─────────────────────────────────────────────────────────
  /**
   * Phaser registers WASD/E/arrows in its GLOBAL key capture, which
   * preventDefault()s those keydowns at the window level — they'd never
   * reach the DOM chat input. While the input is focused, release the
   * capture and disable the keyboard plugin entirely; restore (and reset
   * any stuck isDown state) when focus returns to the game.
   */
  private setChatFocused(focused: boolean) {
    this.chatFocused = focused;
    if (focused) this.clickTarget = null;
    this.applyKeyboardCapture();
  }

  /** Phaser keys are live only when no React UI wants the keyboard. */
  private applyKeyboardCapture() {
    const kb = this.input.keyboard;
    if (!kb) return;
    if (this.chatFocused || this.uiOpen) {
      kb.disableGlobalCapture();
      kb.enabled = false;
    } else {
      kb.enableGlobalCapture();
      kb.enabled = true;
      kb.resetKeys();
    }
  }

  private cleanChatText(text: string) {
    return text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_CHARS);
  }

  private sendChatMessage(text: string) {
    const clean = this.cleanChatText(text);
    if (!clean) return;

    if (!this.transport?.sendChat(clean)) {
      worldBridge.emit("chat-status", { available: false });
      return;
    }

    const message = {
      id: `me:${Date.now()}`,
      userId: "me",
      name: "You",
      text: clean,
      at: Date.now(),
      mine: true,
    };
    worldBridge.emit("chat-message", message);
    this.showPlayerChatBubble(clean);
  }

  private receiveChatMessage(message: ChatMessage) {
    worldBridge.emit("chat-message", message);
    const ghost = this.ghosts.get(message.userId);
    if (ghost) {
      ghost.bubble?.destroy();
      ghost.bubble = this.showChatBubble(ghost.sprite, message.text, false);
    }
  }

  private showPlayerChatBubble(text: string) {
    this.playerChatBubble?.destroy();
    this.playerChatBubbleTimer?.remove();
    if (!this.player) return;
    this.playerChatBubble = this.showChatBubble(this.player, text, true);
    this.playerChatBubbleTimer = this.time.delayedCall(CHAT_BUBBLE_MS, () => {
      this.playerChatBubble = null;
    });
  }

  /**
   * Speech bubble anchored above a character's head: rounded card with a
   * tail, sized to the wrapped text. The container's origin is the tail
   * tip, so positioning it at (x, y - 34) sits it just above the name tag.
   */
  private showChatBubble(
    target: { x: number; y: number },
    text: string,
    isMine: boolean
  ) {
    const txt = this.add
      .text(0, 0, text, {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#111111",
        wordWrap: { width: 110, useAdvancedWrap: true },
        align: "center",
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0)
      .setResolution(3);

    const padX = 6;
    const padY = 4;
    const w = Math.max(txt.width + padX * 2, 18);
    const h = txt.height + padY * 2;
    const tail = 5; // tail height below the card
    const fill = isMine ? 0xfde047 : 0xffffff;

    const g = this.add.graphics();
    // soft drop shadow
    g.fillStyle(0x111111, 0.25);
    g.fillRoundedRect(-w / 2 + 1.5, -h - tail + 1.5, w, h, 4);
    // card
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h - tail, w, h, 4);
    g.lineStyle(1.5, 0x111111, 1);
    g.strokeRoundedRect(-w / 2, -h - tail, w, h, 4);
    // tail (drawn after the card so it overlaps the bottom border)
    g.fillTriangle(-4, -tail - 1, 4, -tail - 1, 0, 0);
    g.lineStyle(1.5, 0x111111, 1);
    g.lineBetween(-4, -tail, 0, 0.75);
    g.lineBetween(4, -tail, 0, 0.75);

    txt.setPosition(0, -h - tail + padY);

    const bubble = this.add
      .container(target.x, target.y - 34, [g, txt])
      .setDepth(DEPTH_BUBBLE);

    bubble.setScale(0.3).setAlpha(0);
    this.tweens.add({
      targets: bubble,
      scale: 1,
      alpha: 1,
      duration: 160,
      ease: "Back.Out",
    });
    this.tweens.add({
      targets: bubble,
      alpha: 0,
      delay: CHAT_BUBBLE_MS - 600,
      duration: 600,
      onComplete: () => bubble.destroy(),
    });
    return bubble;
  }

  // ── Background music ──────────────────────────────────────────────────
  private ensureWorldMusic() {
    const existing = this.sound.get<WorldMusicSound>(WORLD_MUSIC_KEY);
    this.music =
      existing ??
      (this.sound.add(WORLD_MUSIC_KEY, {
        loop: true,
        volume: WORLD_MUSIC_VOLUME,
      }) as WorldMusicSound);
    this.music.setVolume(WORLD_MUSIC_VOLUME);
    this.music.setMute(this.musicMuted);
    this.playWorldMusic();
  }

  private setWorldMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    if (!this.cache.audio.exists(WORLD_MUSIC_KEY)) return;
    this.ensureWorldMusic();
  }

  private playWorldMusic() {
    if (!this.music || this.musicMuted || this.music.isPlaying) return;
    this.music.play({
      loop: true,
      volume: WORLD_MUSIC_VOLUME,
      mute: this.musicMuted,
    });
  }

  // ── Multiplayer ghosts ─────────────────────────────────────────────────
  // Other players on the same map, rendered from their own composited
  // avatar sheets and eased toward their last-reported position. Purely
  // visual: no physics body, no collision (they're decorative, and a
  // solid ghost at a 2s heartbeat would shove people around).

  private transport: PresenceTransport | null = null;
  private ghosts = new Map<
    string,
    {
      sprite: Phaser.GameObjects.Sprite;
      label: Phaser.GameObjects.Text;
      target: { x: number; y: number };
      facing: FacingDirection;
      moving: boolean;
      key: string; // texture key, also the anim prefix
      stale: boolean; // mark-and-sweep flag for syncPeers
      bubble?: Phaser.GameObjects.Container; // active chat bubble, follows the ghost
    }
  >();
  private loadingSheets = new Set<string>();

  private playerState(): PlayerState {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    return {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      facing: this.facing,
      moving: body.velocity.x !== 0 || body.velocity.y !== 0,
    };
  }

  /** Create the 8 idle/walk animations for a texture, prefixed by its key. */
  private createCharacterAnims(textureKey: string) {
    const dirs: { dir: FacingDirection; col: number }[] = [
      { dir: "right", col: 0 },
      { dir: "up", col: 6 },
      { dir: "left", col: 12 },
      { dir: "down", col: 18 },
    ];
    for (const { dir, col } of dirs) {
      this.anims.create({
        key: `${textureKey}-idle-${dir}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: frame(1, col),
          end: frame(1, col + 5),
        }),
        frameRate: 6,
        repeat: -1,
      });
      this.anims.create({
        key: `${textureKey}-walk-${dir}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: frame(2, col),
          end: frame(2, col + 5),
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  /** Reconcile the ghost map against the latest peer list. */
  private syncPeers(peers: Peer[]) {
    if (!this.player) return; // world still building
    for (const g of this.ghosts.values()) g.stale = true;

    for (const peer of peers) {
      const ghost = this.ghosts.get(peer.userId);
      if (ghost) {
        ghost.stale = false;
        ghost.target = { x: peer.x, y: peer.y };
        ghost.facing = peer.facing;
        ghost.moving = peer.moving;
      } else {
        this.spawnGhost(peer);
      }
    }

    for (const [userId, g] of this.ghosts) {
      if (g.stale) {
        g.sprite.destroy();
        g.label.destroy();
        g.bubble?.destroy();
        this.ghosts.delete(userId);
      }
    }
  }

  /** Load the peer's avatar sheet (once), then add their sprite + label. */
  private spawnGhost(peer: Peer) {
    const key = `peer-${peer.userId}`;
    if (this.textures.exists(key)) {
      this.addGhostSprite(peer, key);
      return;
    }
    if (this.loadingSheets.has(key)) return; // arrives on a later sync
    this.loadingSheets.add(key);
    this.load.spritesheet(key, `${ASSET_BASE}/${peer.sheetPath}`, {
      frameWidth: 16,
      frameHeight: 32,
    });
    this.load.once(`filecomplete-spritesheet-${key}`, () => {
      this.loadingSheets.delete(key);
      this.createCharacterAnims(key);
      // Peer may have left while the sheet loaded
      if (!this.ghosts.has(peer.userId)) this.addGhostSprite(peer, key);
    });
    this.load.start();
  }

  private addGhostSprite(peer: Peer, key: string) {
    const sprite = this.add.sprite(peer.x, peer.y, key, 0).setDepth(DEPTH_ENTITY + peer.y + TILE);
    sprite.play(`${key}-idle-${peer.facing}`);
    const label = this.add
      .text(peer.x, peer.y - 26, peer.name, {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_NAME)
      .setResolution(3); // crisp under the 3x zoom
    this.ghosts.set(peer.userId, {
      sprite,
      label,
      target: { x: peer.x, y: peer.y },
      facing: peer.facing,
      moving: peer.moving,
      key,
      stale: false,
    });
  }

  /** Ease each ghost toward its last-reported position. */
  private updateGhosts(deltaMs: number) {
    const step = (GHOST_SPEED * deltaMs) / 1000;
    for (const g of this.ghosts.values()) {
      const dx = g.target.x - g.sprite.x;
      const dy = g.target.y - g.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > GHOST_SNAP_DISTANCE) {
        g.sprite.setPosition(g.target.x, g.target.y);
      } else if (dist > 1) {
        const t = Math.min(1, step / dist);
        g.sprite.x += dx * t;
        g.sprite.y += dy * t;
        // While covering ground, face the direction of travel
        g.facing = this.velocityToFacing(dx, dy) ?? g.facing;
      }

      const closing = dist > 1;
      const anim = `${g.key}-${closing || g.moving ? "walk" : "idle"}-${g.facing}`;
      if (g.sprite.anims.currentAnim?.key !== anim) g.sprite.play(anim);
      g.sprite.setDepth(DEPTH_ENTITY + g.sprite.y + TILE); // y-sort with furniture
      g.label.setPosition(Math.round(g.sprite.x), Math.round(g.sprite.y - 26));
      if (g.bubble) {
        if (g.bubble.active) {
          g.bubble.setPosition(Math.round(g.sprite.x), Math.round(g.sprite.y - 34));
        } else {
          g.bubble = undefined; // fade-out tween destroyed it
        }
      }
    }
  }

  /** Hot-swap the player's spritesheet (e.g. equipped a new outfit). */
  private swapPlayerSheet(sheetPath: string) {
    if (!this.player) return;
    const key = `character-${Date.now()}`;
    this.load.spritesheet(key, `${ASSET_BASE}/${sheetPath}`, {
      frameWidth: 16,
      frameHeight: 32,
    });
    this.load.once(`filecomplete-spritesheet-${key}`, () => {
      if (!this.player) return; // scene switched while loading
      this.createCharacterAnims(key);
      this.playerKey = key;
      this.player.setTexture(key, 0);
      this.player.play(`${key}-idle-${this.facing}`, true);
    });
    this.load.start();
  }

  /** Stop the player and hand input to React while a panel is open. */
  private freezeForPanel() {
    this.uiOpen = true;
    this.applyKeyboardCapture();
    this.clickTarget = null;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.player.play(`${this.playerKey}-idle-${this.facing}`, true);
  }

  // ── NPC dialog ─────────────────────────────────────────────────────────
  private talkTo(npc: { sprite: Phaser.GameObjects.Sprite; name: string; lineIdx: number }) {
    // Interactive NPCs open their React panel instead of chatting
    const panel = NPC_PANELS[npc.name];
    if (panel) {
      this.freezeForPanel();
      worldBridge.emit("open-panel", { panel, npc: npc.name });
      return;
    }
    const content = this.cache.json.get("world-content") as
      | { dialog?: Record<string, string[]> }
      | undefined;
    const lines = content?.dialog?.[npc.name] ?? NPC_LINES[npc.name] ?? ["…"];
    const line = lines[npc.lineIdx % lines.length];
    npc.lineIdx++;

    this.bubble?.destroy();
    this.bubbleTimer?.remove();
    this.bubble = this.add
      .text(npc.sprite.x, npc.sprite.y - 36, line, {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#111111",
        backgroundColor: "#ffffff",
        padding: { x: 4, y: 3 },
        wordWrap: { width: 120 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_BUBBLE)
      .setResolution(3);
    this.bubbleTimer = this.time.delayedCall(3500, () => {
      this.bubble?.destroy();
      this.bubble = null;
    });
  }

  // ── Map transitions ────────────────────────────────────────────────────
  private switchMap(target: string, spawn: string, houseCtx: HouseCtx | null = null) {
    if (this.switchingMap) return;
    this.switchingMap = true;
    this.cameras.main.fadeOut(250, 26, 26, 26);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // restart() re-runs init/preload/create; textures, anims, and json
      // already loaded persist at the game level, so revisits are fast.
      this.scene.restart({
        characterPath: this.characterPath,
        mapId: target,
        spawnName: spawn,
        musicMuted: this.musicMuted,
        houseCtx,
      });
    });
  }

  /** Portal check on the player's feet (the physics body, not the sprite). */
  private checkPortals() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const inside = this.portals.find((p) =>
      Phaser.Geom.Rectangle.Overlaps(
        p.rect,
        new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
      )
    );
    // Arm portals only once the player has been clear of all of them —
    // arrival spawns may legitimately sit inside the return portal.
    if (!this.portalsArmed) {
      if (!inside) this.portalsArmed = true;
      return;
    }
    if (!inside) return;

    // Plot doors don't teleport directly — ownership decides what happens,
    // and that lives in React (sale panel, or an enter-house event back).
    const plot = parsePlotPortal(inside.target);
    if (plot !== null) {
      this.freezeForPanel();
      worldBridge.emit("plot-door", { plot });
      return;
    }

    // Leaving a house: arrive back at that plot's own front door, not
    // the map's default spawn.
    if (this.houseCtx && inside.target === "neighborhood") {
      this.switchMap("neighborhood", `plot-${this.houseCtx.plot}-exit`);
      return;
    }

    this.switchMap(inside.target, inside.spawn);
  }

  /** Walk-on interaction spots — open their panel when the feet overlap. */
  private checkInteractions() {
    if (this.interactions.length === 0) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const feet = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    const inside = this.interactions.find((s) =>
      Phaser.Geom.Rectangle.Overlaps(s.rect, feet)
    );
    if (!this.interactionsArmed) {
      if (!inside) this.interactionsArmed = true;
      return;
    }
    if (!inside) return;
    this.freezeForPanel();
    worldBridge.emit("open-panel", { panel: inside.panel });
  }

  update(_time: number, delta: number) {
    // World builds asynchronously (second-stage tileset load in create())
    if (!this.player || this.switchingMap) return;
    this.updateGhosts(delta);
    // Keep the player y-sorted against furniture as they move.
    this.player.setDepth(DEPTH_ENTITY + (this.player.body as Phaser.Physics.Arcade.Body).bottom);
    if (this.playerChatBubble?.active) {
      this.playerChatBubble.setPosition(
        Math.round(this.player.x),
        Math.round(this.player.y - 34)
      );
    }
    if (this.decorating) {
      // Decorate mode: the avatar holds still; the canvas is for placing.
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }
    if (this.uiOpen || this.chatFocused) {
      // React UI is active — freeze gameplay input (ghosts still move)
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }
    this.checkPortals();
    this.checkInteractions();
    if (this.uiOpen) return; // an interaction spot just opened a panel

    // E talks to the nearest NPC in range
    if (this.talkKey && Phaser.Input.Keyboard.JustDown(this.talkKey)) {
      const near = this.npcs.find(
        (n) =>
          Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            n.sprite.x,
            n.sprite.y
          ) <= NPC_TALK_RANGE
      );
      if (near) this.talkTo(near);
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const up =
      this.cursors.up.isDown || this.wasd.up.isDown;
    const down =
      this.cursors.down.isDown || this.wasd.down.isDown;
    const left =
      this.cursors.left.isDown || this.wasd.left.isDown;
    const right =
      this.cursors.right.isDown || this.wasd.right.isDown;

    const keyboardMoving = up || down || left || right;

    if (keyboardMoving) {
      // Keyboard input cancels click target
      this.clickTarget = null;

      // Pokémon-style 4-direction movement: never diagonal. Keep moving
      // along the current facing while its key is held; otherwise take
      // whichever single direction is pressed.
      const held: { dir: FacingDirection; vx: number; vy: number }[] = [];
      if (up) held.push({ dir: "up", vx: 0, vy: -PLAYER_SPEED });
      if (down) held.push({ dir: "down", vx: 0, vy: PLAYER_SPEED });
      if (left) held.push({ dir: "left", vx: -PLAYER_SPEED, vy: 0 });
      if (right) held.push({ dir: "right", vx: PLAYER_SPEED, vy: 0 });
      const move = held.find((h) => h.dir === this.facing) ?? held[0];

      body.setVelocity(move.vx, move.vy);
      this.facing = move.dir;
      this.player.play(`${this.playerKey}-walk-${this.facing}`, true);
    } else if (this.clickTarget) {
      const dx = this.clickTarget.x - this.player.x;
      const dy = this.clickTarget.y - this.player.y;

      // Axis-aligned (L-shaped) walk: finish the dominant axis first,
      // then the other — no diagonals here either.
      let vx = 0;
      let vy = 0;
      if (Math.abs(dx) >= ARRIVE_THRESHOLD && Math.abs(dx) >= Math.abs(dy)) {
        vx = Math.sign(dx) * PLAYER_SPEED;
      } else if (Math.abs(dy) >= ARRIVE_THRESHOLD) {
        vy = Math.sign(dy) * PLAYER_SPEED;
      } else if (Math.abs(dx) >= ARRIVE_THRESHOLD) {
        vx = Math.sign(dx) * PLAYER_SPEED;
      }

      if (vx === 0 && vy === 0) {
        // Arrived
        this.clickTarget = null;
        body.setVelocity(0, 0);
        this.player.play(`${this.playerKey}-idle-${this.facing}`, true);
      } else {
        body.setVelocity(vx, vy);
        this.facing = this.velocityToFacing(vx, vy) ?? this.facing;
        this.player.play(`${this.playerKey}-walk-${this.facing}`, true);

        // If blocked (velocity near zero while still far from target), cancel
        const dist = Math.sqrt(dx * dx + dy * dy);
        const actualSpeed = Math.sqrt(
          body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y
        );
        if (actualSpeed < 2 && dist > ARRIVE_THRESHOLD * 4) {
          this.clickTarget = null;
        }
      }
    } else {
      body.setVelocity(0, 0);
      this.player.play(`${this.playerKey}-idle-${this.facing}`, true);
    }
  }

  private velocityToFacing(
    vx: number,
    vy: number
  ): FacingDirection | null {
    if (vx === 0 && vy === 0) return null;
    if (Math.abs(vx) > Math.abs(vy)) {
      return vx > 0 ? "right" : "left";
    }
    return vy > 0 ? "down" : "up";
  }
}
