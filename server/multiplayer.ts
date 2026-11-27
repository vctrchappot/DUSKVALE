/**
 * Minimal authoritative-ready WebSocket relay & world-room server for Duskvale Stage 3.
 * Compatible with Node.js (using `ws`) or as a blueprint for Cloudflare Durable Objects.
 *
 * Run locally (requires `ws` package):
 *   npx tsx server/multiplayer.ts
 * Then open Duskvale with:
 *   http://localhost:5173/#play&server=ws://localhost:8787
 */
import type { NetMessage, RemotePlayerSnapshot } from '../src/net/protocol.ts';

export interface SocketLike {
  send(data: string): void;
  readyState: number;
}

export class DuskvaleRoom {
  readonly players = new Map<string, RemotePlayerSnapshot>();
  readonly sockets = new Map<SocketLike, string>();

  onConnect(ws: SocketLike): void {
    this.sockets.set(ws, '');
    // Send existing players to newcomer
    for (const p of this.players.values()) {
      ws.send(JSON.stringify({ type: 'join', player: p } satisfies NetMessage));
    }
  }

  onMessage(ws: SocketLike, raw: string): void {
    let msg: NetMessage;
    try {
      msg = JSON.parse(raw) as NetMessage;
    } catch {
      return;
    }
    if (msg.type === 'state' || msg.type === 'join') {
      this.sockets.set(ws, msg.player.id);
      this.players.set(msg.player.id, msg.player);
      this.broadcast(raw, ws);
    } else if (msg.type === 'chat') {
      this.broadcast(raw, ws);
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', id: msg.id, ts: msg.ts } satisfies NetMessage));
    }
  }

  onDisconnect(ws: SocketLike): void {
    const id = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (id) {
      this.players.delete(id);
      this.broadcast(JSON.stringify({ type: 'leave', id } satisfies NetMessage), ws);
    }
  }

  private broadcast(data: string, exclude?: SocketLike): void {
    for (const sock of this.sockets.keys()) {
      if (sock !== exclude && sock.readyState === 1) {
        sock.send(data);
      }
    }
  }
}
