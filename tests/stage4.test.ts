import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/engine/audio.ts';
import { DEFAULT_OPTIONS } from '../src/engine/options.ts';
import { Game } from '../src/game/game.ts';
import { evaluateSideQuests, RUNES } from '../src/game/sideQuests.ts';
import { DungeonWorld } from '../src/world/dungeon.ts';
import { World } from '../src/world/world.ts';

describe('Stage 4: Dungeons, Elites, Side Quests & Runes', () => {
  it('generates a walkable 4-room 2.5D crypt with exit portal and guardian', () => {
    const d = new DungeonWorld('crypt-1', 'Krypta der Glut', 9001, { x: 18, y: -14 });
    expect(d.rooms.length).toBe(4);
    expect(d.isSolid(d.spawnPos.x, d.spawnPos.y)).toBe(false);
    const entryFeats = d.featuresNear(d.spawnPos.x, d.spawnPos.y, 8);
    expect(entryFeats.some((f) => f.id === 'crypt-1:exit')).toBe(true);
    const bossRoom = d.rooms[3];
    const bossFeats = d.featuresNear(bossRoom.cx, bossRoom.cy, 8);
    expect(bossFeats.some((f) => f.id === 'crypt-1:guardian')).toBe(true);
  });

  it('tracks side quest completion and rewards runes on claim', () => {
    const claimed = new Set<string>();
    const list = evaluateSideQuests({
      dungeonsCleared: 1,
      totalKills: 6,
      loreCount: 3,
      chestsCount: 2,
      claimedIds: claimed,
    });
    expect(list.every((q) => q.completed && !q.claimed)).toBe(true);
    expect(RUNES[list[0].def.rewardRune!].name).toBe('Rune der Glut');
  });

  it('enters and exits dungeon instances cleanly in Game', () => {
    const g = new Game(new World(), new AudioEngine(), { ...DEFAULT_OPTIONS });
    g.newGame(1);
    const overworld = g.world;
    g.enterDungeon('crypt-test', 'Krypta der Glut', 42);
    expect(g.inDungeon).toBe(true);
    expect(g.world).not.toBe(overworld);
    g.exitDungeon();
    expect(g.inDungeon).toBe(false);
    expect(g.world).toBe(overworld);
  });
});
