/**
 * Client presence transport (v1: REST polling, per world-design.md).
 *
 * The scene reports its player state ~every 2s; each heartbeat's
 * response carries the peer list, which is handed to onPeers. The
 * interface is transport-shaped so a SocketTransport can replace this
 * later without touching the scene.
 */

import type { FacingDirection, PlayerState } from "./types";

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
  leave(): void;
}

const HEARTBEAT_MS = 2000;

export class PollingTransport implements PresenceTransport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private mapId = "";
  private getState: (() => PlayerState) | null = null;
  private peersCb: ((peers: Peer[]) => void) | null = null;
  private inFlight = false;
  private onPageHide = () => this.beaconLeave();

  join(mapId: string, getState: () => PlayerState): void {
    this.leave();
    this.mapId = mapId;
    this.getState = getState;
    this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
    void this.tick(); // immediate first heartbeat — see peers right away
    window.addEventListener("pagehide", this.onPageHide);
  }

  onPeers(cb: (peers: Peer[]) => void): void {
    this.peersCb = cb;
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
