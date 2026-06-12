/**
 * UDM+ world presence sidecar (v2 transport, per docs/world-design.md).
 *
 * A deliberately tiny websocket room server: clients join a map room
 * with a short-lived HMAC token minted by the Next app
 * (/api/world/ws-token), then stream position updates that are relayed
 * to everyone else in the room. All state is in-memory; identity comes
 * entirely from the token (userId/name/sheetPath), so this service
 * needs no database and no shared code with the app.
 *
 * Deployed as its own Railway service. The only contract with the app:
 *   - WORLD_WS_SECRET env var matches the app's
 *   - the message protocol below matches SocketTransport
 *     (src/modules/world/transport.ts)
 *
 * Protocol (JSON text frames):
 *   client → server: {t:"join", token, mapId, x, y, facing}
 *                    {t:"move", x, y, facing, moving}
 *   server → client: {t:"joined", peers:[Peer]}      (snapshot on join)
 *                    {t:"peer", peer:Peer}           (someone moved/joined)
 *                    {t:"leave", userId}
 *                    {t:"error", message}            (then socket closes)
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8081);
const SECRET = process.env.WORLD_WS_SECRET;
if (!SECRET) {
  console.error("WORLD_WS_SECRET is required");
  process.exit(1);
}

const FACINGS = new Set(["down", "up", "left", "right"]);
// Dead-connection sweep: server pings; a socket that misses two rounds dies.
const PING_INTERVAL_MS = 15_000;

// ── Token verification (mirror of mintWsToken in src/lib — base64url
// payload + HMAC-SHA256 signature, dot-separated) ─────────────────────────
function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload.userId !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.sheetPath !== "string" ||
    typeof payload.exp !== "number" ||
    Date.now() > payload.exp
  ) {
    return null;
  }
  return payload;
}

// ── Rooms ─────────────────────────────────────────────────────────────────
// mapId → Map<userId, {ws, peer}>. One connection per user per room;
// a fresh join replaces (and closes) the stale one — handles reloads.
const rooms = new Map();

function roomPeers(room, exceptUserId) {
  return [...room.values()]
    .filter((m) => m.peer.userId !== exceptUserId)
    .map((m) => m.peer);
}

function broadcast(room, exceptUserId, msg) {
  const text = JSON.stringify(msg);
  for (const m of room.values()) {
    if (m.peer.userId !== exceptUserId && m.ws.readyState === m.ws.OPEN) {
      m.ws.send(text);
    }
  }
}

// ── Server ────────────────────────────────────────────────────────────────
// Plain HTTP underneath so Railway's healthcheck has something to hit.
const httpServer = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("world-ws ok\n");
});
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  // Connection state, set on a valid join
  let mapId = null;
  let userId = null;

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.t === "join" && !userId) {
      const auth = verifyToken(msg.token);
      if (!auth || typeof msg.mapId !== "string" || !msg.mapId) {
        ws.send(JSON.stringify({ t: "error", message: "bad token" }));
        ws.close(4001, "bad token");
        return;
      }
      mapId = msg.mapId.slice(0, 64);
      userId = auth.userId;

      let room = rooms.get(mapId);
      if (!room) {
        room = new Map();
        rooms.set(mapId, room);
      }
      // Replace a stale connection for the same user (page reload)
      const existing = room.get(userId);
      if (existing && existing.ws !== ws) existing.ws.close(4000, "replaced");

      // Join carries the initial position so peers never see a (0,0) ghost
      const peer = {
        userId,
        name: auth.name,
        sheetPath: auth.sheetPath,
        x: Number.isFinite(msg.x) ? msg.x : 0,
        y: Number.isFinite(msg.y) ? msg.y : 0,
        facing: FACINGS.has(msg.facing) ? msg.facing : "down",
        moving: false,
      };
      room.set(userId, { ws, peer });
      ws.send(JSON.stringify({ t: "joined", peers: roomPeers(room, userId) }));
      broadcast(room, userId, { t: "peer", peer });
      return;
    }

    if (msg.t === "move" && userId && mapId) {
      const room = rooms.get(mapId);
      const member = room?.get(userId);
      if (!member || member.ws !== ws) return;
      if (
        typeof msg.x !== "number" ||
        typeof msg.y !== "number" ||
        !Number.isFinite(msg.x) ||
        !Number.isFinite(msg.y) ||
        !FACINGS.has(msg.facing)
      ) {
        return;
      }
      member.peer.x = msg.x;
      member.peer.y = msg.y;
      member.peer.facing = msg.facing;
      member.peer.moving = msg.moving === true;
      broadcast(room, userId, { t: "peer", peer: member.peer });
    }
  });

  ws.on("close", () => {
    if (!userId || !mapId) return;
    const room = rooms.get(mapId);
    const member = room?.get(userId);
    // Only remove if WE are still the registered connection (a reload's
    // new socket may have replaced us already)
    if (member && member.ws === ws) {
      room.delete(userId);
      if (room.size === 0) rooms.delete(mapId);
      else broadcast(room, userId, { t: "leave", userId });
    }
  });
});

// Ping sweep — terminate sockets that stopped ponging
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, PING_INTERVAL_MS);

httpServer.listen(PORT, () => {
  console.log(`world-ws listening on :${PORT}`);
});
