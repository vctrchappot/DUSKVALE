import { ASP, clamp, lerp } from '../engine/util.ts';
import type { AnimPose } from '../game/pixelSprites.ts';
import {
  deserializeNetMessage,
  parseChatInput,
  serializeNetMessage,
  type ChatMessage,
  type NetMessage,
  type RemotePlayerSnapshot,
} from './protocol.ts';

export interface RemotePlayerEntity {
  id: string;
  name: string;
  title?: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  face: number;
  lvl: number;
  hp: number;
  maxHp: number;
  weaponId: string;
  armorId: string;
  pose: AnimPose;
  frame: number;
  isPhantom: boolean;
  lastSeen: number;
  bubbleText: string | null;
  bubbleTimer: number;
}

export type NetMode = 'local' | 'websocket' | 'offline';

interface PhantomBot {
  id: string;
  name: string;
  title: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  walkT: number;
  face: number;
  lvl: number;
  weaponId: string;
  armorId: string;
  chatTimer: number;
  lines: string[];
}

const PHANTOM_SEEDS: Omit<PhantomBot, 'x' | 'y' | 'tx' | 'ty' | 'wait' | 'walkT' | 'face'>[] = [
  {
    id: 'phantom-alric',
    name: 'Alric',
    title: 'Glutwächter',
    homeX: -7,
    homeY: 2,
    lvl: 6,
    weaponId: 'ash_greatsword',
    armorId: 'cinder_mantle',
    chatTimer: 11,
    lines: ['Die Straße nach Westen führt direkt zu Vael.', 'Am Schmied lohnt sich das erste Upgrade.', 'Möge deine Glut nicht verlöschen.'],
  },
  {
    id: 'phantom-lyra',
    name: 'Lyra',
    title: 'Moorpilgerin',
    homeX: 8,
    homeY: 6,
    lvl: 4,
    weaponId: 'pilgrim_spear',
    armorId: 'sentinel_mail',
    chatTimer: 19,
    lines: ['Hast du die Burg am See im Nordosten schon gesehen?', 'Parieren mit [F] bricht die Skelette sofort!', 'Die Spiegelung im See ist unheimlich klar heute.'],
  },
];

/**
 * Multiplayer client supporting:
 * 1. Authoritative WebSocket server (e.g. Cloudflare Durable Objects or server/multiplayer.ts)
 * 2. Zero-config local multi-tab co-op via BroadcastChannel
 * 3. Optional ambient Phantom Wanderers for lively MMO feel even in singleplayer
 */
export class MultiplayerClient {
  readonly localId: string;
  localName: string;
  mode: NetMode = 'local';
  connected = false;
  serverUrl: string | null = null;
  pingMs = 0;

  readonly peers = new Map<string, RemotePlayerEntity>();
  readonly chatLog: ChatMessage[] = [];
  onChatUpdate: (() => void) | null = null;

  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private sendTimer = 0;
  private phantomsEnabled = true;
  private phantoms: PhantomBot[] = [];

  constructor(localName = 'Wanderer') {
    this.localId = `p-${Math.random().toString(36).slice(2, 8)}`;
    this.localName = localName;
    this.initPhantoms();
  }

  private initPhantoms(): void {
    this.phantoms = PHANTOM_SEEDS.map((s) => ({
      ...s,
      x: s.homeX,
      y: s.homeY,
      tx: s.homeX,
      ty: s.homeY,
      wait: 2 + Math.random() * 3,
      walkT: 0,
      face: 1,
    }));
  }

  setPhantomsEnabled(enabled: boolean): void {
    this.phantomsEnabled = enabled;
    if (!enabled) {
      for (const [id, peer] of this.peers) {
        if (peer.isPhantom) this.peers.delete(id);
      }
    }
  }

  connect(serverUrl?: string | null): void {
    this.disconnect();
    if (serverUrl) {
      this.serverUrl = serverUrl;
      this.mode = 'websocket';
      try {
        const ws = new WebSocket(serverUrl);
        this.ws = ws;
        ws.onopen = () => {
          this.connected = true;
          this.pushSystemChat(`Verbunden mit Server (${serverUrl}).`);
        };
        ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            const msg = deserializeNetMessage(ev.data);
            if (msg) this.handleMessage(msg);
          }
        };
        ws.onclose = () => {
          this.connected = false;
          this.pushSystemChat('Server-Verbindung getrennt. Lokaler Co-op aktiv.');
          this.connectLocalChannel();
        };
        ws.onerror = () => {
          this.connected = false;
        };
      } catch {
        this.connectLocalChannel();
      }
    } else {
      this.connectLocalChannel();
    }
  }

  private connectLocalChannel(): void {
    this.mode = 'local';
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel('duskvale-coop-v3');
        this.bc.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            const msg = deserializeNetMessage(ev.data);
            if (msg) this.handleMessage(msg);
          }
        };
        this.connected = true;
      } catch {
        this.connected = false;
      }
    }
  }

  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (this.bc) {
      try {
        this.sendRaw({ type: 'leave', id: this.localId });
        this.bc.close();
      } catch {
        // ignore
      }
      this.bc = null;
    }
    this.connected = false;
  }

  private sendRaw(msg: NetMessage): void {
    const data = serializeNetMessage(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else if (this.bc) {
      try {
        this.bc.postMessage(data);
      } catch {
        // ignore
      }
    }
  }

  sendChat(raw: string): ChatMessage | null {
    const msg = parseChatInput(raw, this.localId, this.localName);
    if (!msg) return null;
    this.appendChat(msg);
    this.sendRaw({ type: 'chat', msg });
    return msg;
  }

  pushSystemChat(text: string): void {
    this.appendChat({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      senderId: 'system',
      senderName: 'System',
      text,
      kind: 'system',
      ts: Date.now(),
    });
  }

  private appendChat(msg: ChatMessage): void {
    this.chatLog.push(msg);
    if (this.chatLog.length > 40) this.chatLog.shift();
    const peer = this.peers.get(msg.senderId);
    if (peer && msg.kind !== 'system') {
      peer.bubbleText = msg.text;
      peer.bubbleTimer = 5.0;
    }
    this.onChatUpdate?.();
  }

  handleMessage(msg: NetMessage): void {
    switch (msg.type) {
      case 'join':
      case 'state': {
        const s = msg.player;
        if (s.id === this.localId) return;
        const existing = this.peers.get(s.id);
        if (existing) {
          existing.targetX = s.x;
          existing.targetY = s.y;
          existing.face = s.face;
          existing.lvl = s.lvl;
          existing.hp = s.hp;
          existing.maxHp = s.maxHp;
          existing.weaponId = s.weaponId;
          existing.armorId = s.armorId;
          existing.pose = s.pose;
          existing.frame = s.frame;
          existing.lastSeen = Date.now();
        } else {
          this.peers.set(s.id, {
            id: s.id,
            name: s.name,
            title: s.title,
            x: s.x,
            y: s.y,
            targetX: s.x,
            targetY: s.y,
            face: s.face,
            lvl: s.lvl,
            hp: s.hp,
            maxHp: s.maxHp,
            weaponId: s.weaponId,
            armorId: s.armorId,
            pose: s.pose,
            frame: s.frame,
            isPhantom: !!s.isPhantom,
            lastSeen: Date.now(),
            bubbleText: null,
            bubbleTimer: 0,
          });
          if (!s.isPhantom) this.pushSystemChat(`${s.name} hat Duskvale betreten.`);
        }
        break;
      }
      case 'leave': {
        const left = this.peers.get(msg.id);
        if (left && !left.isPhantom) this.pushSystemChat(`${left.name} hat die Welt verlassen.`);
        this.peers.delete(msg.id);
        break;
      }
      case 'chat': {
        if (msg.msg.senderId === this.localId) return;
        this.appendChat(msg.msg);
        break;
      }
      case 'pong': {
        if (msg.id === this.localId) {
          this.pingMs = Math.max(1, Math.round(Date.now() - msg.ts));
        }
        break;
      }
    }
  }

  update(dt: number, localSnapshot: Omit<RemotePlayerSnapshot, 'id' | 'name' | 'ts'>): void {
    // 1. Broadcast local player state at 15 Hz
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 1 / 15;
      this.sendRaw({
        type: 'state',
        player: {
          ...localSnapshot,
          id: this.localId,
          name: this.localName,
          ts: Date.now(),
        },
      });
    }

    // 2. Update ambient Phantom Wanderers near Glutsenke (if enabled)
    if (this.phantomsEnabled) {
      this.updatePhantoms(dt);
    }

    // 3. Smoothly interpolate all remote players & expire stale peers
    const now = Date.now();
    const k = clamp(1 - Math.exp(-dt * 12), 0, 1);
    for (const [id, peer] of this.peers) {
      if (!peer.isPhantom && now - peer.lastSeen > 8000) {
        this.peers.delete(id);
        continue;
      }
      peer.x = lerp(peer.x, peer.targetX, k);
      peer.y = lerp(peer.y, peer.targetY, k);
      if (peer.bubbleTimer > 0) {
        peer.bubbleTimer -= dt;
        if (peer.bubbleTimer <= 0) peer.bubbleText = null;
      }
    }
  }

  private updatePhantoms(dt: number): void {
    for (const b of this.phantoms) {
      b.wait -= dt;
      const dx = b.tx - b.x;
      const dy = (b.ty - b.y) * ASP;
      const d = Math.hypot(dx, dy);
      let moving = false;

      if (d > 0.35) {
        const spd = 4.2;
        b.x += (dx / d) * spd * dt;
        b.y += ((dy / d) * spd * dt) / ASP;
        b.face = dx >= 0 ? 1 : -1;
        b.walkT += dt;
        moving = true;
      } else if (b.wait <= 0) {
        b.tx = b.homeX + (Math.random() - 0.5) * 10;
        b.ty = b.homeY + (Math.random() - 0.5) * 5;
        b.wait = 3.5 + Math.random() * 5;
      }

      const existing = this.peers.get(b.id);
      if (!existing) {
        this.peers.set(b.id, {
          id: b.id,
          name: b.name,
          title: b.title,
          x: b.x,
          y: b.y,
          targetX: b.x,
          targetY: b.y,
          face: b.face,
          lvl: b.lvl,
          hp: 140,
          maxHp: 140,
          weaponId: b.weaponId,
          armorId: b.armorId,
          pose: moving ? 'walk' : 'idle',
          frame: 0,
          isPhantom: true,
          lastSeen: Date.now(),
          bubbleText: null,
          bubbleTimer: 0,
        });
      } else {
        existing.targetX = b.x;
        existing.targetY = b.y;
        existing.face = b.face;
        existing.pose = moving ? 'walk' : 'idle';
        existing.frame = moving ? Math.floor(b.walkT * 7) % 6 : Math.floor(Date.now() / 500) % 2;
        existing.lastSeen = Date.now();
      }

      b.chatTimer -= dt;
      if (b.chatTimer <= 0) {
        b.chatTimer = 24 + Math.random() * 24;
        const peer = this.peers.get(b.id);
        if (peer) {
          peer.bubbleText = b.lines[(Math.random() * b.lines.length) | 0];
          peer.bubbleTimer = 5.5;
        }
      }
    }
  }

  getRemoteList(): RemotePlayerEntity[] {
    return Array.from(this.peers.values());
  }
}
