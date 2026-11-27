import type { AnimPose } from '../game/pixelSprites.ts';

export interface RemotePlayerSnapshot {
  id: string;
  name: string;
  title?: string;
  x: number;
  y: number;
  face: number;
  lvl: number;
  hp: number;
  maxHp: number;
  weaponId: string;
  armorId: string;
  pose: AnimPose;
  frame: number;
  isPhantom?: boolean;
  ts: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  kind: 'chat' | 'emote' | 'system';
  ts: number;
}

export type NetMessage =
  | { type: 'join'; player: RemotePlayerSnapshot }
  | { type: 'state'; player: RemotePlayerSnapshot }
  | { type: 'leave'; id: string }
  | { type: 'chat'; msg: ChatMessage }
  | { type: 'ping'; id: string; ts: number }
  | { type: 'pong'; id: string; ts: number };

const EMOTES: Record<string, string> = {
  '/wave': 'winkt den Wanderern zu.',
  '/winken': 'winkt den Wanderern zu.',
  '/rest': 'kniet sich kurz zur Ruhe nieder.',
  '/rasten': 'kniet sich kurz zur Ruhe nieder.',
  '/cheer': 'hebt die Klinge zum Gruß!',
  '/jubeln': 'hebt die Klinge zum Gruß!',
  '/point': 'deutet in die Ferne.',
  '/zeigen': 'deutet in die Ferne.',
};

export function parseChatInput(
  raw: string,
  senderId: string,
  senderName: string,
): ChatMessage | null {
  const trimmed = raw.trim().slice(0, 140);
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (EMOTES[lower]) {
    return {
      id: `${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId,
      senderName,
      text: `${senderName} ${EMOTES[lower]}`,
      kind: 'emote',
      ts: Date.now(),
    };
  }
  return {
    id: `${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderId,
    senderName,
    text: trimmed,
    kind: 'chat',
    ts: Date.now(),
  };
}

export function serializeNetMessage(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export function deserializeNetMessage(raw: string): NetMessage | null {
  try {
    const parsed = JSON.parse(raw) as NetMessage;
    if (!parsed || typeof parsed.type !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
