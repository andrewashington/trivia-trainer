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
import { SocketTransport, type Peer, type PresenceTransport } from "./transport";

// Asset base URL — served (and auth-gated) by our API route.
const ASSET_BASE = "/api/world/assets";

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

// NPC dialog, keyed by the object name on the map's "npcs" layer.
// Each interaction advances to the next line.
const NPC_LINES: Record<string, string[]> = {
  shopkeep: [
    "Welcome to the market. Everything is for sale except, legally, anything.",
    "Browse all you want. The inventory system ships Soon™.",
    "You're my favorite customer. Statistically unavoidable — you're the only one.",
    "No refunds. Mostly because there are no purchases.",
  ],
};
// A peer further than this from its ghost just teleports (joined,
// door transition, or a long network gap — don't slide across the map).
const GHOST_SNAP_DISTANCE = 160;

function frame(row: number, col: number): number {
  return row * FRAME_COLS + col;
}

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

  // NPCs from the map's "npcs" object layer.
  private npcs: {
    sprite: Phaser.GameObjects.Sprite;
    name: string;
    lineIdx: number;
  }[] = [];
  private talkKey: Phaser.Input.Keyboard.Key | null = null;
  private bubble: Phaser.GameObjects.Text | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: "WorldScene" });
  }

  init(data: { characterPath?: string; mapId?: string; spawnName?: string }) {
    if (data?.characterPath) this.characterPath = data.characterPath;
    this.mapId = data?.mapId ?? "neighborhood";
    this.spawnName = data?.spawnName ?? "spawn";
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
    this.switchingMap = false;
    this.npcs = [];
    this.bubble = null;
    this.bubbleTimer = null;
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
      (o as Phaser.GameObjects.Rectangle).setScrollFactor(0).setDepth(1000);
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
    this.hideLoadingScreen();
    // ── Tilemap ─────────────────────────────────────────────────────────
    const map = this.make.tilemap({ key: `map-${this.mapId}` });
    const tiles = map.tilesets.map(
      (ts) => map.addTilesetImage(ts.name, ts.name)!
    );

    // Layer contract v4: tile layers render in authoring order below the
    // player (depth 0..4), except "overhead" which draws above (10).
    // Works for exteriors (ground/props) and interiors (subfloor/floor/props).
    let depth = 0;
    for (const layerData of map.layers) {
      const isOverhead = layerData.name === "overhead";
      map
        .createLayer(layerData.name, tiles, 0, 0)
        ?.setDepth(isOverhead ? 10 : Math.min(depth++, 4));
    }

    // ── Collision rectangles from "collision" object layer ───────────────
    const collisionLayer = map.getObjectLayer("collision");
    const colliders = this.physics.add.staticGroup();

    if (collisionLayer) {
      for (const obj of collisionLayer.objects) {
        const x = (obj.x ?? 0) + (obj.width ?? 0) / 2;
        const y = (obj.y ?? 0) + (obj.height ?? 0) / 2;
        const w = obj.width ?? 16;
        const h = obj.height ?? 16;
        const rect = this.add.rectangle(x, y, w, h);
        this.physics.add.existing(rect, true); // true = static
        colliders.add(rect);
      }
    }

    // ── Player spawn ─────────────────────────────────────────────────────
    const spawnsLayer = map.getObjectLayer("spawns");
    const spawnObj =
      spawnsLayer?.objects.find((o) => o.name === this.spawnName) ??
      spawnsLayer?.objects.find((o) => o.name === "spawn");
    const spawnX = spawnObj?.x ?? map.widthInPixels / 2;
    const spawnY = spawnObj?.y ?? map.heightInPixels / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, "character", 0);
    this.player.setDepth(5);
    this.player.setCollideWorldBounds(false);
    // Collide with the feet only (sprite is 16×32; head may overlap props)
    (this.player.body as Phaser.Physics.Arcade.Body)
      .setSize(12, 10)
      .setOffset(2, 22);

    // Collide player with the static rectangles
    this.physics.add.collider(this.player, colliders);

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

    // ── NPCs ("npcs" object layer, points) ───────────────────────────────
    this.createCharacterAnims("npc-sheet");
    for (const obj of map.getObjectLayer("npcs")?.objects ?? []) {
      const npc = this.physics.add.sprite(obj.x ?? 0, obj.y ?? 0, "npc-sheet", 0);
      npc.setDepth(4);
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
        .setDepth(11)
        .setResolution(3);
      this.npcs.push({ sprite: npc, name: obj.name ?? "", lineIdx: 0 });
    }

    // ── Animations ───────────────────────────────────────────────────────
    this.createCharacterAnims("character");
    this.player.play("character-idle-down");

    // ── Input ─────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.talkKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Tap / click to walk — or talk, if the tap lands on a nearby NPC
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
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
    });

    // ── Camera ───────────────────────────────────────────────────────────
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(3);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // Pixel-art rendering
    this.cameras.main.setRoundPixels(true);

    // ── Presence (multiplayer ghosts) ────────────────────────────────────
    this.transport = new SocketTransport();
    this.transport.onPeers((peers) => this.syncPeers(peers));
    this.transport.join(this.mapId, () => this.playerState());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.transport?.leave());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.transport?.leave());
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
    const sprite = this.add.sprite(peer.x, peer.y, key, 0).setDepth(4);
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
      .setDepth(11)
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
      g.label.setPosition(Math.round(g.sprite.x), Math.round(g.sprite.y - 26));
    }
  }

  // ── NPC dialog ─────────────────────────────────────────────────────────
  private talkTo(npc: { sprite: Phaser.GameObjects.Sprite; name: string; lineIdx: number }) {
    const lines = NPC_LINES[npc.name] ?? ["…"];
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
      .setDepth(20)
      .setResolution(3);
    this.bubbleTimer = this.time.delayedCall(3500, () => {
      this.bubble?.destroy();
      this.bubble = null;
    });
  }

  // ── Map transitions ────────────────────────────────────────────────────
  private switchMap(target: string, spawn: string) {
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
    if (inside) this.switchMap(inside.target, inside.spawn);
  }

  update(_time: number, delta: number) {
    // World builds asynchronously (second-stage tileset load in create())
    if (!this.player || this.switchingMap) return;
    this.updateGhosts(delta);
    this.checkPortals();

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
      this.player.play(`character-walk-${this.facing}`, true);
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
        this.player.play(`character-idle-${this.facing}`, true);
      } else {
        body.setVelocity(vx, vy);
        this.facing = this.velocityToFacing(vx, vy) ?? this.facing;
        this.player.play(`character-walk-${this.facing}`, true);

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
      this.player.play(`character-idle-${this.facing}`, true);
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
