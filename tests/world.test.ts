import { describe, expect, it } from 'vitest';
import { T } from '../src/world/types.ts';
import { World } from '../src/world/world.ts';

describe('World generation (Stage 2)', () => {
  it('generates deterministic chunks and landmarks', () => {
    const w1 = new World();
    const w2 = new World();
    const c1 = w1.chunk(0, 0);
    const c2 = w2.chunk(0, 0);
    expect(Array.from(c1.type)).toEqual(Array.from(c2.type));
    expect(Array.from(c1.elev)).toEqual(Array.from(c2.elev));
    expect(w1.landmarks.map((l) => l.id)).toContain('lakecastle');
    expect(w1.landmarks.map((l) => l.id)).toContain('barrow');
    expect(w1.landmarks.map((l) => l.id)).toContain('cathedral');
  });

  it('places signposts at road forks and hub NPCs in Glutsenke', () => {
    const w = new World();
    expect(w.signposts.length).toBeGreaterThanOrEqual(4);
    const feats = w.featuresNear(0, 0, 14);
    expect(feats.some((f) => f.kind === 'shrine')).toBe(true);
    expect(feats.some((f) => f.kind === 'npc' && f.npc === 'maren')).toBe(true);
    expect(feats.some((f) => f.kind === 'npc' && f.npc === 'smith')).toBe(true);
    expect(feats.some((f) => f.kind === 'npc' && f.npc === 'merchant')).toBe(true);
  });

  it('opens cathedral gate when setGateOpen(true) is called', () => {
    const w = new World();
    const cat = w.landmarks.find((l) => l.id === 'cathedral')!;
    const gateFeat = cat.struct!.feats.find((f) => f.kind === 'gate')!;
    expect(w.typeAt(gateFeat.x, gateFeat.y)).toBe(T.GATE);
    expect(w.isSolid(gateFeat.x, gateFeat.y)).toBe(true);
    w.setGateOpen(true);
    expect(w.isSolid(gateFeat.x, gateFeat.y)).toBe(false);
  });

  it('supports 2.5D elevation levels in range 0..4', () => {
    const w = new World();
    const c = w.chunk(0, 0);
    for (let i = 0; i < c.elev.length; i++) {
      expect(c.elev[i]).toBeGreaterThanOrEqual(0);
      expect(c.elev[i]).toBeLessThanOrEqual(4);
    }
  });
});
