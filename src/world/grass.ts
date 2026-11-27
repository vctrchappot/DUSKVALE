import { ASP, clamp } from '../engine/util.ts';

export interface GrassTrailNode {
  x: number;
  y: number;
  dx: number;
  life: number;
  maxLife: number;
}

export interface WaterRipple {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

/**
 * Tracks grass displacement trails (1.5s recovery) and shallow-water ring ripples.
 */
export class GrassAndWaterField {
  trails: GrassTrailNode[] = [];
  ripples: WaterRipple[] = [];
  private maxTrails = 96;
  private maxRipples = 32;

  pushEntityTrail(x: number, y: number, vx: number): void {
    const last = this.trails[this.trails.length - 1];
    if (last && Math.abs(last.x - x) < 0.7 && Math.abs(last.y - y) < 0.45 && last.life > 1.25) {
      return;
    }
    if (this.trails.length >= this.maxTrails) {
      this.trails.shift();
    }
    this.trails.push({
      x,
      y,
      dx: vx >= 0 ? 1 : -1,
      life: 1.5,
      maxLife: 1.5,
    });
  }

  pushRipple(x: number, y: number): void {
    if (this.ripples.length >= this.maxRipples) {
      this.ripples.shift();
    }
    this.ripples.push({ x, y, age: 0, maxAge: 1.1 });
  }

  update(dt: number): void {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      this.trails[i].life -= dt;
      if (this.trails[i].life <= 0) {
        this.trails.splice(i, 1);
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt;
      if (this.ripples[i].age >= this.ripples[i].maxAge) {
        this.ripples.splice(i, 1);
      }
    }
  }

  /**
   * Computes grass bend [-1.4 .. +1.4] at world cell (wx, wy)
   * combining active entity circles and decaying 1.5s trample trails.
   */
  sampleDisplacement(wx: number, wy: number, entities: readonly { x: number; y: number }[]): number {
    let bend = 0;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const dx = wx - e.x;
      const dy = (wy - e.y) * ASP;
      const d2 = dx * dx + dy * dy;
      if (d2 < 9.0) {
        const d = Math.sqrt(d2) || 0.1;
        const w = (1 - d / 3.0);
        bend += (dx >= 0 ? 1 : -1) * w * 1.45;
      }
    }
    for (let i = 0; i < this.trails.length; i++) {
      const tr = this.trails[i];
      const dx = wx - tr.x;
      const dy = (wy - tr.y) * ASP;
      const d2 = dx * dx + dy * dy;
      if (d2 < 5.5) {
        const d = Math.sqrt(d2) || 0.1;
        const fade = tr.life / tr.maxLife;
        const w = (1 - d / 2.35) * fade;
        const dir = Math.abs(dx) > 0.2 ? (dx > 0 ? 1 : -1) : tr.dx;
        bend += dir * w * 0.95;
      }
    }
    return clamp(bend, -1.6, 1.6);
  }
}
