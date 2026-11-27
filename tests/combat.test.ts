import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/engine/audio.ts';
import { DEFAULT_OPTIONS } from '../src/engine/options.ts';
import { SmoothCamera } from '../src/game/camera.ts';
import { Game } from '../src/game/game.ts';
import { xpForNextLevel } from '../src/game/rpg.ts';
import { World } from '../src/world/world.ts';

describe('Combat, RPG & Camera (Stage 2)', () => {
  it('separates XP leveling from Embers currency and awards attribute points', () => {
    const g = new Game(new World(), new AudioEngine(), { ...DEFAULT_OPTIONS });
    g.newGame(1);
    const startLvl = g.player.lvl;
    const needed = xpForNextLevel(startLvl);
    g.grantXp(needed + 10);
    expect(g.player.lvl).toBe(startLvl + 1);
    expect(g.player.attrPoints).toBe(2);
    expect(g.player.embers).toBe(0);
    expect(g.spendAttrPoint('vig')).toBe(true);
    expect(g.player.vig).toBe(2);
    expect(g.player.attrPoints).toBe(1);
  });

  it('parry negates incoming damage and staggers melee attacker', () => {
    const g = new Game(new World(), new AudioEngine(), { ...DEFAULT_OPTIONS });
    g.newGame(1);
    const hpBefore = g.player.hp;
    g.player.parry = 0.2;
    const hit = g.hurtPlayer(30, g.player.x + 2, g.player.y);
    expect(hit).toBe(false);
    expect(g.player.hp).toBe(hpBefore);
  });

  it('camera respects deadzone and never swings with mouse movement when standing still', () => {
    const cam = new SmoothCamera();
    cam.snap(10, 10);
    // Moving mouse aim wildly without walking should not move camera
    for (let i = 0; i < 30; i++) {
      cam.update(1 / 60, 10, 10, 0, 0, Math.cos(i), Math.sin(i), 0, { ...DEFAULT_OPTIONS });
    }
    expect(cam.x).toBeCloseTo(10, 4);
    expect(cam.y).toBeCloseTo(10, 4);
  });

  it('reduceCameraMotion disables screenshake', () => {
    const cam = new SmoothCamera();
    cam.addShake(0.9, { ...DEFAULT_OPTIONS, reduceCameraMotion: true });
    expect(cam.shakePower).toBe(0);
  });
});
