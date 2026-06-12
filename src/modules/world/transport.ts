/**
 * Client presence transports (per world-design.md).
 *
 * v2 (preferred): SocketTransport — websocket to the world-ws sidecar
 * (services/world-ws), ~10Hz position updates, push-based peers.
 * v1 (fallback): PollingTransport — REST heartbeat every 2s; each
 * response carries the peer list.
 *
 * SocketTransport degrades to PollingTransport on its own when the
 * sidecar is unconfigured or unreachable, so the scene just constructs
 * a SocketTransport and never thinks about it again.
 */

import type { FacingDirection, PlayerState } from "./types";

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
};

export type Peer = {
  userId: string;
  name: string;
  sheetPath: string;
  x: number;
  y: number;
  facing: FacingDirection;
  moving: boolean;
};

export interface PresenceTransport {
  /** Start heartbeating. getState is polled for the latest player state. */
  join(mapId: string, getState: () => PlayerState): void;
  onPeers(cb: (peers: Peer[]) => void): void;
  onChat(cb: (message: ChatMessage) => void): void;
  onChatStatus(cb: (available: boolean) => void): void;
  sendChat(text: string): boolean;
  leave(): void;
}

const HEARTBEAT_MS = 2000;

export class PollingTransport implements PresenceTransport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private mapId = "";
  private getState: (() => PlayerState) | null = null;
  private peersCb: ((peers: Peer[]) => void) | null = null;
  private chatStatusCb: ((available: boolean) => void) | null = null;
  private inFlight = false;
  private onPageHide = () => this.beaconLeave();

  join(mapId: string, getState: () => PlayerState): void {
    this.leave();
    this.mapId = mapId;
    this.getState = getState;
    this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
    void this.tick(); // immediate first heartbeat — see peers right away
    window.addEventListener("pagehide", this.onPageHide);
    this.chatStatusCb?.(false);
  }

  onPeers(cb: (peers: Peer[]) => void): void {
    this.peersCb = cb;
  }

  onChat(_cb: (message: ChatMessage) => void): void {
    // Polling presence does not carry chat; websocket sessions do.
  }

  onChatStatus(cb: (available: boolean) => void): void {
    this.chatStatusCb = cb;
    cb(false);
  }

  sendChat(_text: string): boolean {
    return false;
  }

  leave(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener("pagehide", this.onPageHide);
    if (this.mapId) this.beaconLeave();
    this.mapId = "";
    this.getState = null;
  }

  private async tick(): Promise<void> {
    if (this.inFlight || !this.getState) return; // skip, don't queue
    this.inFlight = true;
    try {
      const res = await fetch("/api/world/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapId: this.mapId, ...this.getState() }),
      });
      if (!res.ok) return; // transient failure — next tick retries
      const data = (await res.json()) as { peers?: Peer[] };
      if (data.peers) this.peersCb?.(data.peers);
    } catch {
      // network blip — next tick retries
    } finally {
      this.inFlight = false;
    }
  }

  private beaconLeave(): void {
    const body = JSON.stringify({
      mapId: this.mapId,
      x: 0,
      y: 0,
      facing: "down",
      moving: false,
      leaving: true,
    });
    navigator.sendBeacon(
      "/api/world/presence",
      new Blob([body], { type: "application/json" })
    );
  }
}

// ── v2: websocket transport ────────────────────────────────────────────────

// How often we sample the player state and (if changed) push a move frame.
const SEND_INTERVAL_MS = 100;
// Reconnect with backoff; after this many consecutive failures, give up
// on the socket for this session and fall back to polling.
const MAX_RECONNECT_ATTEMPTS = 3;

type ServerMsg =
  | { t: "joined"; peers: Peer[] }
  | { t: "peer"; peer: Peer }
  | { t: "chat"; message: ChatMessage }
  | { t: "leave"; userId: string }
  | { t: "error"; message: string };

export class SocketTransport implements PresenceTransport {
  private ws: WebSocket | null = null;
  private mapId = "";
  private getState: (() => PlayerState) | null = null;
  private peersCb: ((peers: Peer[]) => void) | null = null;
  private chatCb: ((message: ChatMessage) => void) | null = null;
  private chatStatusCb: ((available: boolean) => void) | null = null;
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private lastSent = "";
  private peers = new Map<string, Peer>();
  private fallback: PollingTransport | null = null;
  private left = false;

  join(mapId: string, getState: () => PlayerState): void {
    this.leave();
    this.left = false;
    this.mapId = mapId;
    this.getState = getState;
    void this.connect();
  }

  onPeers(cb: (peers: Peer[]) => void): void {
    this.peersCb = cb;
    this.fallback?.onPeers(cb);
  }

  onChat(cb: (message: ChatMessage) => void): void {
    this.chatCb = cb;
    this.fallback?.onChat(cb);
  }

  onChatStatus(cb: (available: boolean) => void): void {
    this.chatStatusCb = cb;
    cb(this.ws?.readyState === WebSocket.OPEN && !this.fallback);
    this.fallback?.onChatStatus(cb);
  }

  sendChat(text: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.fallback) return false;
    const trimmed = text.trim().slice(0, 180);
    if (!trimmed) return false;
    this.ws.send(JSON.stringify({ t: "chat", text: trimmed }));
    return true;
  }

  leave(): void {
    this.left = true;
    if (this.sendTimer) clearInterval(this.sendTimer);
    this.sendTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close(1000, "leaving");
    this.ws = null;
    this.chatStatusCb?.(false);
    this.fallback?.leave();
    this.fallback = null;
    this.peers.clear();
    this.mapId = "";
    this.getState = null;
  }

  private async connect(): Promise<void> {
    if (this.left || !this.getState) return;
    let url: string | null = null;
    let token: string | null = null;
    try {
      const res = await fetch("/api/world/ws-token");
      if (res.ok) {
        const data = (await res.json()) as { url: string | null; token: string | null };
        url = data.url;
        token = data.token;
      }
    } catch {
      // treated as a connection failure below
    }
    if (this.left) return;

    // Sidecar not configured → polling, permanently for this session
    if (!url || !token) {
      this.usePollingFallback();
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.onConnectionLost();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.left || !this.getState) return;
      this.failures = 0;
      const state = this.getState();
      ws.send(JSON.stringify({ t: "join", token, mapId: this.mapId, ...state }));
      this.chatStatusCb?.(true);
      this.lastSent = "";
      this.sendTimer = setInterval(() => this.sendIfChanged(), SEND_INTERVAL_MS);
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === "joined") {
        this.peers = new Map(msg.peers.map((p) => [p.userId, p]));
      } else if (msg.t === "peer") {
        this.peers.set(msg.peer.userId, msg.peer);
      } else if (msg.t === "leave") {
        this.peers.delete(msg.userId);
      } else if (msg.t === "chat") {
        this.chatCb?.(msg.message);
        return;
      } else {
        return;
      }
      this.peersCb?.([...this.peers.values()]);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return; // superseded by a newer connection
      this.ws = null;
      this.chatStatusCb?.(false);
      if (this.sendTimer) clearInterval(this.sendTimer);
      this.sendTimer = null;
      if (!this.left) this.onConnectionLost();
    };
    // onclose fires after onerror in browsers; no separate handling needed
  }

  private sendIfChanged(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.getState) return;
    const state = this.getState();
    const frame = JSON.stringify({ t: "move", ...state });
    if (frame === this.lastSent) return;
    this.lastSent = frame;
    this.ws.send(frame);
  }

  private onConnectionLost(): void {
    this.failures += 1;
    if (this.failures >= MAX_RECONNECT_ATTEMPTS) {
      this.usePollingFallback();
      return;
    }
    const delay = 1000 * 2 ** (this.failures - 1); // 1s, 2s
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }

  private usePollingFallback(): void {
    if (this.left || this.fallback || !this.getState) return;
    this.fallback = new PollingTransport();
    if (this.peersCb) this.fallback.onPeers(this.peersCb);
    if (this.chatCb) this.fallback.onChat(this.chatCb);
    if (this.chatStatusCb) this.fallback.onChatStatus(this.chatStatusCb);
    this.fallback.join(this.mapId, this.getState);
  }
}
