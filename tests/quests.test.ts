import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/engine/audio.ts';
import { DEFAULT_OPTIONS } from '../src/engine/options.ts';
import { Game } from '../src/game/game.ts';
import { evaluateMainQuest } from '../src/game/quests.ts';
import { World } from '../src/world/world.ts';

describe('Quests & Save serialization (Stage 2)', () => {
  it('advances main quest chain from shrine -> Maren -> 3 sigils -> cathedral', () => {
    const w = new World();
    const base = {
      shrines: new Set<string>(),
      bosses: new Set<string>(),
      gateOpen: false,
      victory: false,
      talkedMaren: false,
      landmarks: w.landmarks,
      playerX: 0,
      playerY: 4,
    };

    expect(evaluateMainQuest(base).step.id).toBe('ignite_start');

    base.shrines.add('shrine@0,0');
    expect(evaluateMainQuest(base).step.id).toBe('speak_maren');

    base.talkedMaren = true;
    expect(evaluateMainQuest(base).step.id).toBe('sigil_bone');

    base.bosses.add('wight');
    expect(evaluateMainQuest(base).step.id).toBe('sigil_flood');

    base.bosses.add('matron');
    expect(evaluateMainQuest(base).step.id).toBe('sigil_ash');

    base.bosses.add('corvus');
    expect(evaluateMainQuest(base).step.id).toBe('open_cathedral');
  });

  it('serializes and restores save slot data cleanly', () => {
    const g = new Game(new World(), new AudioEngine(), { ...DEFAULT_OPTIONS });
    g.newGame(1);
    g.player.embers = 420;
    g.grantXp(120);
    g.flags.talkedMaren = true;
    const saved = g.serializeSave('Test Slot');

    const g2 = new Game(new World(), new AudioEngine(), { ...DEFAULT_OPTIONS });
    g2.loadSaveData(saved, 2);
    expect(g2.player.embers).toBe(420);
    expect(g2.player.lvl).toBe(g.player.lvl);
    expect(g2.flags.talkedMaren).toBe(true);
  });
});
