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
 *   Row 1 (frames 56–111): walk cycles, 6 frames each, same order
 *     right cols 0–5   → frames 56–61
 *     up    cols 6–11  → frames 62–67
 *     left  cols 12–17 → frames 68–73
 *     down  cols 18–23 → frames 74–79
 */

import Phaser from "phaser";
import type { FacingDirection } from "./types";

// Asset base URL — served (and auth-gated) by our API route.
const ASSET_BASE = "/api/world/assets";

// Pixel speed for player movement.
const PLAYER_SPEED = 90;
// Arrival threshold for click-to-walk (pixels).
const ARRIVE_THRESHOLD = 4;

// Spritesheet frame layout constants.
const FRAME_COLS = 56;

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

  constructor() {
    super({ key: "WorldScene" });
  }

  preload() {
    this.load.tilemapTiledJSON("map", `${ASSET_BASE}/map.json`);
    // raw copy of the same JSON so create() can discover tileset images
    this.load.json("mapdata", `${ASSET_BASE}/map.json`);
    this.load.spritesheet("character", `${ASSET_BASE}/character.png`, {
      frameWidth: 16,
      frameHeight: 32,
    });
  }

  create() {
    // Second-stage load: the map names its tileset images (exported by
    // scripts/world-export-map.ts), so fetch whatever it declares.
    const mapdata = this.cache.json.get("mapdata") as {
      tilesets: { name: string; image: string }[];
    };
    for (const ts of mapdata.tilesets) {
      this.load.image(ts.name, `${ASSET_BASE}/${ts.image}`);
    }
    this.load.once("complete", () => this.buildWorld());
    this.load.start();
  }

  private buildWorld() {
    // ── Tilemap ─────────────────────────────────────────────────────────
    const map = this.make.tilemap({ key: "map" });
    const tiles = map.tilesets.map(
      (ts) => map.addTilesetImage(ts.name, ts.name)!
    );

    // Layer contract v3: ground < props < player < overhead
    map.createLayer("ground", tiles, 0, 0)?.setDepth(0);
    map.createLayer("props", tiles, 0, 0)?.setDepth(2);
    map.createLayer("overhead", tiles, 0, 0)?.setDepth(10);

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
    const spawnObj = spawnsLayer?.objects.find((o) => o.name === "spawn");
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

    // ── Animations ───────────────────────────────────────────────────────
    this.anims.create({
      key: "idle-down",
      frames: [{ key: "character", frame: frame(0, 3) }],
      frameRate: 1,
      repeat: -1,
    });
    this.anims.create({
      key: "idle-left",
      frames: [{ key: "character", frame: frame(0, 2) }],
      frameRate: 1,
      repeat: -1,
    });
    this.anims.create({
      key: "idle-right",
      frames: [{ key: "character", frame: frame(0, 0) }],
      frameRate: 1,
      repeat: -1,
    });
    this.anims.create({
      key: "idle-up",
      frames: [{ key: "character", frame: frame(0, 1) }],
      frameRate: 1,
      repeat: -1,
    });

    // Walk cycles — 6 frames per direction in row 1
    this.anims.create({
      key: "walk-down",
      frames: this.anims.generateFrameNumbers("character", {
        start: frame(1, 18),
        end: frame(1, 23),
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-left",
      frames: this.anims.generateFrameNumbers("character", {
        start: frame(1, 12),
        end: frame(1, 17),
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-right",
      frames: this.anims.generateFrameNumbers("character", {
        start: frame(1, 0),
        end: frame(1, 5),
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-up",
      frames: this.anims.generateFrameNumbers("character", {
        start: frame(1, 6),
        end: frame(1, 11),
      }),
      frameRate: 10,
      repeat: -1,
    });

    this.player.play("idle-down");

    // ── Input ─────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Tap / click to walk
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      // Convert screen coords to world coords
      const worldPoint = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this.clickTarget = new Phaser.Math.Vector2(worldPoint.x, worldPoint.y);
    });

    // ── Camera ───────────────────────────────────────────────────────────
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(3);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // Pixel-art rendering
    this.cameras.main.setRoundPixels(true);
  }

  update() {
    // World builds asynchronously (second-stage tileset load in create())
    if (!this.player) return;
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

      let vx = 0;
      let vy = 0;
      if (left) vx -= PLAYER_SPEED;
      if (right) vx += PLAYER_SPEED;
      if (up) vy -= PLAYER_SPEED;
      if (down) vy += PLAYER_SPEED;

      // Normalise diagonal
      if (vx !== 0 && vy !== 0) {
        vx *= 0.707;
        vy *= 0.707;
      }

      body.setVelocity(vx, vy);
      this.facing = this.velocityToFacing(vx, vy) ?? this.facing;
      this.player.play(`walk-${this.facing}`, true);
    } else if (this.clickTarget) {
      const dx = this.clickTarget.x - this.player.x;
      const dy = this.clickTarget.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ARRIVE_THRESHOLD) {
        // Arrived
        this.clickTarget = null;
        body.setVelocity(0, 0);
        this.player.play(`idle-${this.facing}`, true);
      } else {
        const vx = (dx / dist) * PLAYER_SPEED;
        const vy = (dy / dist) * PLAYER_SPEED;
        body.setVelocity(vx, vy);
        this.facing = this.velocityToFacing(vx, vy) ?? this.facing;
        this.player.play(`walk-${this.facing}`, true);

        // If blocked (velocity near zero while still far from target), cancel
        const actualSpeed = Math.sqrt(
          body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y
        );
        if (actualSpeed < 2 && dist > ARRIVE_THRESHOLD * 4) {
          this.clickTarget = null;
        }
      }
    } else {
      body.setVelocity(0, 0);
      this.player.play(`idle-${this.facing}`, true);
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
