import { describe, expect, it } from 'vitest';
import { DuskvaleRoom } from '../server/multiplayer.ts';
import { MultiplayerClient } from '../src/net/client.ts';
import { deserializeNetMessage, parseChatInput, serializeNetMessage } from '../src/net/protocol.ts';
import { computeJoystickVector } from '../src/ui/touch.ts';

describe('Stage 3: Multiplayer, Chat & Touch Controls', () => {
  it('parses chat messages and emotes cleanly', () => {
    const chat = parseChatInput('Hallo Duskvale!', 'p1', 'Alden');
    expect(chat?.kind).toBe('chat');
    expect(chat?.text).toBe('Hallo Duskvale!');

    const emote = parseChatInput('/wave', 'p1', 'Alden');
    expect(emote?.kind).toBe('emote');
    expect(emote?.text).toContain('Alden');
  });

  it('round-trips network messages via protocol serializer', () => {
    const raw = serializeNetMessage({ type: 'leave', id: 'p-123' });
    const parsed = deserializeNetMessage(raw);
    expect(parsed).toEqual({ type: 'leave', id: 'p-123' });
  });

  it('interpolates remote player positions and expires stale peers', () => {
    const client = new MultiplayerClient('Hero');
    client.setPhantomsEnabled(false);
    client.handleMessage({
      type: 'join',
      player: {
        id: 'remote-1',
        name: 'Kael',
        x: 10,
        y: 5,
        face: 1,
        lvl: 3,
        hp: 100,
        maxHp: 100,
        weaponId: 'iron_sword',
        armorId: 'wanderer_plate',
        pose: 'idle',
        frame: 0,
        ts: Date.now(),
      },
    });
    client.handleMessage({
      type: 'state',
      player: {
        id: 'remote-1',
        name: 'Kael',
        x: 20,
        y: 5,
        face: 1,
        lvl: 3,
        hp: 100,
        maxHp: 100,
        weaponId: 'iron_sword',
        armorId: 'wanderer_plate',
        pose: 'walk',
        frame: 1,
        ts: Date.now(),
      },
    });
    client.update(0.1, {
      x: 0,
      y: 0,
      face: 1,
      lvl: 1,
      hp: 100,
      maxHp: 100,
      weaponId: 'iron_sword',
      armorId: 'wanderer_plate',
      pose: 'idle',
      frame: 0,
    });
    const peer = client.peers.get('remote-1')!;
    expect(peer.x).toBeGreaterThan(10);
    expect(peer.x).toBeLessThan(20);
  });

  it('broadcasts room messages to other connected sockets', () => {
    const room = new DuskvaleRoom();
    const sentA: string[] = [];
    const sentB: string[] = [];
    const sockA = { readyState: 1, send: (d: string) => sentA.push(d) };
    const sockB = { readyState: 1, send: (d: string) => sentB.push(d) };
    room.onConnect(sockA);
    room.onConnect(sockB);
    room.onMessage(
      sockA,
      serializeNetMessage({
        type: 'join',
        player: {
          id: 'a',
          name: 'A',
          x: 0,
          y: 0,
          face: 1,
          lvl: 1,
          hp: 100,
          maxHp: 100,
          weaponId: 'iron_sword',
          armorId: 'wanderer_plate',
          pose: 'idle',
          frame: 0,
          ts: 1,
        },
      }),
    );
    expect(sentB.length).toBe(1);
    expect(sentA.length).toBe(0);
  });

  it('computes touch virtual joystick vector with deadzone and clamping', () => {
    expect(computeJoystickVector(3, 2, 50)).toEqual({ x: 0, y: 0 });
    const fullRight = computeJoystickVector(100, 0, 50);
    expect(fullRight.x).toBeCloseTo(1, 3);
    expect(fullRight.y).toBeCloseTo(0, 3);
  });
});
