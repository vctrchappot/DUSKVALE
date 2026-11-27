import { buildKnightSprite, knightAnimationFrame } from '../game/knight.ts';
import { SHADED_TILE, FINE_STROKE, STROKE_AXES, GRASS_TUFT, STONE_FACE, WATER_LINE } from '../engine/atlas.ts';
import { TextOverlay, type OverlayArrow, type OverlayBar, type OverlayLabel } from '../engine/textOverlay.ts';
import { ASP, clamp, hash, lerp, noise, TAU } from '../engine/util.ts';
import { WebGLAsciiRenderer } from '../engine/webgl.ts';
import type { EnemyEntity, Game, NpcEntity } from '../game/game.ts';
import { buildCreatureSprite, buildPropSprite, type AnimPose, type PixelSprite } from '../game/pixelSprites.ts';
import { ARMORS, WEAPONS } from '../game/rpg.ts';
import { ELITE_AFFIXES } from '../game/sideQuests.ts';
import type { RemotePlayerEntity } from '../net/client.ts';
import { T, WATERY, type TerrainId, type WorldObject } from '../world/types.ts';

// High-detail decoupled World -> ASCII grid (4x2 cells per world tile, tight 7px font -> 320+ cols)
export const WORLD_SCALE_X = 4;
export const WORLD_SCALE_Y = 2;

// Sparse marks let light and larger material shapes carry the terrain.
const RAMP_STONE = '.,:;-~=+#';
const RAMP_METAL = '.:-/=+#';
const RAMP_CLOTH = ".,'`:/|";
const RAMP_BARK = ".'/:|}#";
const RAMP_FOLIAGE = '.,\'"`^/\\|/\\|;vV*#';

function pickRampChar(ramp: string, lum: number, variation = 0): number {
  const idx = clamp(Math.floor((lum + variation) * (ramp.length - 1)), 0, ramp.length - 1);
  return ramp.charCodeAt(idx);
}

function luminousStroke(spr: PixelSprite, x: number, y: number, flip: boolean): number {
  let best = FINE_STROKE + 12;
  let bestScore = 0;
  for (let axis = 0; axis < STROKE_AXES.length; axis++) {
    const [screenDx, dy] = STROKE_AXES[axis];
    const dx = flip ? -screenDx : screenDx;
    let ends = 0;
    let score = 0;
    for (const sign of [-1, 1]) {
      const nx = x + sign * dx;
      const ny = y + sign * dy;
      if (nx < 0 || ny < 0 || nx >= spr.w || ny >= spr.h || spr.mat[ny * spr.w + nx] !== 3) continue;
      ends |= sign < 0 ? 1 : 2;
      score++;
    }
    if (score > bestScore) {
      best = FINE_STROKE + axis * 3 + ends - 1;
      bestScore = score;
    }
  }
  return best;
}

interface TerrainStyle {
  c: [number, number, number];
  bgK: number; // Deep obsidian void aesthetic (0.04..0.09) so glyphs pop crisply!
  water?: boolean;
  grass?: boolean;
  stone?: boolean;
  masonry?: boolean;
  organic?: boolean;
}

const FLOWER_COLORS: [number, number, number][] = [
  [0.96, 0.96, 0.9], // pale white
  [0.72, 0.94, 1.0], // moon cyan
  [0.82, 0.74, 1.0], // dusk violet
  [1.0, 0.88, 0.55], // ember yellow
];

const TS: Record<number, TerrainStyle> = {
  [T.DEEP]: { c: [0.16, 0.24, 0.36], bgK: 0.04, water: true, organic: true },
  [T.WATER]: { c: [0.22, 0.32, 0.44], bgK: 0.05, water: true, organic: true },
  [T.SHALLOW]: { c: [0.28, 0.42, 0.48], bgK: 0.06, water: true, organic: true },
  [T.MARSH]: { c: [0.18, 0.34, 0.18], bgK: 0.06, grass: true, organic: true },
  [T.SAND]: { c: [0.54, 0.5, 0.4], bgK: 0.06, organic: true },
  [T.GRASS]: { c: [0.16, 0.48, 0.18], bgK: 0.07, grass: true, organic: true },
  [T.MOOR]: { c: [0.36, 0.36, 0.2], bgK: 0.06, grass: true, organic: true },
  [T.FOREST]: { c: [0.12, 0.34, 0.14], bgK: 0.06, grass: true, organic: true },
  [T.ROCK]: { c: [0.56, 0.6, 0.68], bgK: 0.06, stone: true, organic: true },
  [T.MOUNT]: { c: [0.64, 0.68, 0.76], bgK: 0.07, stone: true, organic: true },
  [T.ROAD]: { c: [0.58, 0.56, 0.52], bgK: 0.07, masonry: true },
  [T.FLOOR]: { c: [0.56, 0.6, 0.66], bgK: 0.07, masonry: true },
  [T.WALL]: { c: [0.66, 0.72, 0.8], bgK: 0.08, masonry: true },
  [T.TOWER_WALL]: { c: [0.64, 0.7, 0.8], bgK: 0.08, masonry: true },
  [T.ARCH]: { c: [0.6, 0.64, 0.72], bgK: 0.07, masonry: true },
  [T.STAIRS]: { c: [0.64, 0.62, 0.58], bgK: 0.08, masonry: true },
  [T.ASH]: { c: [0.36, 0.32, 0.34], bgK: 0.05, organic: true },
  [T.DIRT]: { c: [0.42, 0.36, 0.28], bgK: 0.06, organic: true },
  [T.RUBBLE]: { c: [0.56, 0.58, 0.64], bgK: 0.06, stone: true },
  [T.GATE]: { c: [0.58, 0.66, 0.82], bgK: 0.08, masonry: true },
  [T.BRIDGE]: { c: [0.56, 0.42, 0.28], bgK: 0.08 },
  [T.CARPET]: { c: [0.7, 0.15, 0.18], bgK: 0.09 },
  [T.CAVE_FLOOR]: { c: [0.38, 0.42, 0.5], bgK: 0.05, stone: true },
};

export class SceneRenderer {
  readonly gl: WebGLAsciiRenderer;
  readonly overlay: TextOverlay;

  private N = 0;
  private CHR!: Int32Array;
  private MAT!: Uint8Array;
  private ELEV!: Uint8Array;
  private SHS!: Uint32Array; // per-sprite stamp so a cast shadow darkens each cell once
  private shadowStamp = 0;
  private castShadows = true;
  private FL!: Uint8Array; // bit 1 = water, bit 2 = prop/entity, bit 4 = facade, bit 8 = entity, bit 16 = grass
  private BR!: Float32Array;
  private BG!: Float32Array;
  private BB!: Float32Array;
  private BGR!: Float32Array;
  private BGG!: Float32Array;
  private BGB!: Float32Array;
  private EM!: Float32Array;
  private LR!: Float32Array;
  private LG!: Float32Array;
  private LB!: Float32Array;
  private HV!: Float32Array;

  private outGlyphs!: Uint8Array;
  private outFg!: Uint8Array;
  private outBg!: Uint8Array;

  camCellX = 0;
  camCellY = 0;
  camLeftWorld = 0;
  camTopWorld = 0;
  lastRenderMs = 0;
  lastLightCount = 0;

  private spriteCache = new Map<string, PixelSprite>();

  constructor(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, fontPx: number) {
    this.gl = new WebGLAsciiRenderer(canvas, fontPx);
    this.overlay = new TextOverlay(overlayCanvas);
    this.allocBuffers();
  }

  resize(fontPx?: number): void {
    this.gl.resize(fontPx);
    this.overlay.resize();
    this.allocBuffers();
  }

  private allocBuffers(): void {
    const n = this.gl.gridCols * this.gl.gridRows;
    if (n === this.N) return;
    this.N = n;
    this.CHR = new Int32Array(n);
    this.MAT = new Uint8Array(n);
    this.ELEV = new Uint8Array(n);
    this.FL = new Uint8Array(n);
    this.SHS = new Uint32Array(n);
    this.BR = new Float32Array(n);
    this.BG = new Float32Array(n);
    this.BB = new Float32Array(n);
    this.BGR = new Float32Array(n);
    this.BGG = new Float32Array(n);
    this.BGB = new Float32Array(n);
    this.EM = new Float32Array(n);
    this.LR = new Float32Array(n);
    this.LG = new Float32Array(n);
    this.LB = new Float32Array(n);
    this.HV = new Float32Array(n);

    this.outGlyphs = new Uint8Array(n);
    this.outFg = new Uint8Array(n * 4);
    this.outBg = new Uint8Array(n * 4);
  }

  screenToWorld(mx: number, my: number): { wx: number; wy: number } {
    return {
      wx: this.camLeftWorld + mx / (this.gl.cellW * WORLD_SCALE_X),
      wy: this.camTopWorld + my / (this.gl.cellH * WORLD_SCALE_Y),
    };
  }

  private putCell(
    x: number,
    y: number,
    code: number,
    r: number,
    g: number,
    b: number,
    e = 0,
    a = 1,
    bgScale = 0.06,
  ): void {
    const cols = this.gl.gridCols;
    const rows = this.gl.gridRows;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const i = y * cols + x;
    if (a >= 0.99) {
      this.CHR[i] = code;
      this.BR[i] = r;
      this.BG[i] = g;
      this.BB[i] = b;
      this.BGR[i] = r * bgScale;
      this.BGG[i] = g * bgScale;
      this.BGB[i] = b * bgScale;
      this.EM[i] = e;
    } else {
      this.BR[i] += (r - this.BR[i]) * a;
      this.BG[i] += (g - this.BG[i]) * a;
      this.BB[i] += (b - this.BB[i]) * a;
      this.BGR[i] += (r * bgScale - this.BGR[i]) * a;
      this.BGG[i] += (g * bgScale - this.BGG[i]) * a;
      this.BGB[i] += (b * bgScale - this.BGB[i]) * a;
      this.EM[i] += (e - this.EM[i]) * a;
      if (a > 0.42) this.CHR[i] = code;
    }
    this.FL[i] |= 2;
  }

  private getCachedSprite(key: string, builder: () => PixelSprite): PixelSprite {
    let s = this.spriteCache.get(key);
    if (!s) {
      if (this.spriteCache.size > 300) this.spriteCache.clear();
      s = builder();
      this.spriteCache.set(key, s);
    }
    return s;
  }

  private drawPixelSprite(
    spr: PixelSprite,
    wx: number,
    wy: number,
    opts: {
      flip?: boolean;
      flash?: boolean;
      alpha?: number;
      rim?: [number, number, number];
      liftCells?: number;
      swayX?: number;
      isEntity?: boolean;
    },
  ): void {
    const cols = this.gl.gridCols;
    const rows = this.gl.gridRows;
    const cx = Math.round(wx * WORLD_SCALE_X) - this.camCellX;
    const cy = Math.round(wy * WORLD_SCALE_Y) - this.camCellY + (opts.liftCells ?? 0);
    const sx0 = cx - (opts.flip && spr.detail ? spr.w - 1 - spr.ax : spr.ax);
    const sy0 = cy - spr.ay;
    if (sx0 > cols + 6 || sy0 > rows + 6 || sx0 + spr.w < -6 || sy0 + spr.h < -6) return;

    const alpha = opts.alpha ?? 1;
    const flip = !!opts.flip;
    const flash = !!opts.flash;
    const rim = opts.rim;
    const swayX = opts.swayX ?? 0;

    // 1. Soft dark ground shadow under sprite
    const shRx = Math.max(3, spr.detail ? 5 : Math.round(spr.w * 0.36));
    const shRy = Math.max(1, spr.detail ? 2 : Math.round(spr.w * 0.13));
    for (let dy = -shRy; dy <= shRy; dy++) {
      for (let dx = -shRx; dx <= shRx; dx++) {
        const d2 = (dx * dx) / (shRx * shRx) + (dy * dy) / (shRy * shRy);
        if (d2 <= 1) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) {
            const idx = gy * cols + gx;
            const k = 0.42 + d2 * 0.48;
            this.BR[idx] *= k;
            this.BG[idx] *= k;
            this.BB[idx] *= k;
          }
        }
      }
    }

    // 1b. Moon-cast shadow: project every sprite cell onto the ground plane, away from
    // the moon in the upper left, so figures and trees stand on the terrain instead of on it.
    if (this.castShadows && alpha > 0.5) {
      const stamp = ++this.shadowStamp;
      const fade = alpha * (spr.detail ? 0.62 : 0.55);
      for (let j = 0; j < spr.h; j++) {
        const hA = spr.ay - j;
        if (hA < 1) continue;
        const offX = Math.round(hA * 0.55);
        const offY = Math.round(hA * 0.16);
        const k = 1 - fade * (1 - (hA / Math.max(1, spr.ay)) * 0.45);
        for (let i = 0; i < spr.w; i++) {
          if (!spr.a[j * spr.w + i]) continue;
          const dx = flip ? spr.w - 1 - i : i;
          const gx = sx0 + dx + offX;
          const gy = cy + offY;
          if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
          const idx = gy * cols + gx;
          if (this.SHS[idx] === stamp || this.FL[idx] & (4 | 8)) continue;
          this.SHS[idx] = stamp;
          this.BR[idx] *= k;
          this.BG[idx] *= k;
          this.BB[idx] *= k;
          this.BGR[idx] *= k;
          this.BGG[idx] *= k;
          this.BGB[idx] *= k;
        }
      }
    }

    // 2. Render sprite into dense typographic ASCII
    for (let j = 0; j < spr.h; j++) {
      const topWeight = 1 - j / Math.max(1, spr.h - 1);
      const rowSway = swayX !== 0 ? Math.round(swayX * topWeight) : 0;
      for (let i = 0; i < spr.w; i++) {
        const si = j * spr.w + i;
        if (!spr.a[si]) continue;
        const dx = flip ? spr.w - 1 - i : i;
        const gx = sx0 + dx + rowSway;
        const gy = sy0 + j;
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;

        if (spr.detail) {
          const idx = gy * cols + gx;
          const detail = spr.detail;
          const bits = detail.mask[si];
          const mask = flip ? ((bits & 21) << 1) | ((bits & 42) >> 1) : bits;
          const edge = detail.cutout[si];
          const accent = edge && rim ? 0.12 : 0;
          const r = flash ? 1 : lerp(spr.r[si], rim?.[0] ?? 0, accent);
          const g = flash ? 0.96 : lerp(spr.g[si], rim?.[1] ?? 0, accent);
          const b = flash ? 0.9 : lerp(spr.b[si], rim?.[2] ?? 0, accent);
          const underR = this.BGR[idx], underG = this.BGG[idx], underB = this.BGB[idx];
          this.putCell(gx, gy, SHADED_TILE + mask, r, g, b, flash ? 0.8 : 0, alpha);
          const ink = si * 3;
          this.BGR[idx] = edge ? underR : lerp(underR, flash ? 0.7 : detail.ground[ink], alpha);
          this.BGG[idx] = edge ? underG : lerp(underG, flash ? 0.6 : detail.ground[ink + 1], alpha);
          this.BGB[idx] = edge ? underB : lerp(underB, flash ? 0.6 : detail.ground[ink + 2], alpha);
          this.FL[idx] |= 8;
          continue;
        }

        const leftEmpty = i === 0 || !spr.a[si - 1];
        const rightEmpty = i === spr.w - 1 || !spr.a[si + 1];
        const topEmpty = j === 0 || !spr.a[si - spr.w];
        const botEmpty = j === spr.h - 1 || !spr.a[si + spr.w];
        const isEdge = leftEmpty || rightEmpty || topEmpty || botEmpty;

        // Crisp obsidian dark halo around entities so figures stand out dramatically against grass & stone
        if (opts.isEntity && isEdge && alpha > 0.7) {
          const nbs = [
            [gx - 1, gy],
            [gx + 1, gy],
            [gx, gy - 1],
            [gx, gy + 1],
          ];
          for (const [nx, ny] of nbs) {
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
              const ni = ny * cols + nx;
              if (!(this.FL[ni] & 8)) {
                this.BR[ni] *= 0.25;
                this.BG[ni] *= 0.25;
                this.BB[ni] *= 0.28;
                this.BGR[ni] *= 0.2;
                this.BGG[ni] *= 0.2;
                this.BGB[ni] *= 0.2;
              }
            }
          }
        }

        let r = flash ? 1.0 : spr.r[si];
        let g = flash ? 0.96 : spr.g[si];
        let b = flash ? 0.9 : spr.b[si];
        let em = flash ? 1.0 : spr.em[si];

        if (isEdge && rim && !flash) {
          r = lerp(r, rim[0], 0.24);
          g = lerp(g, rim[1], 0.24);
          b = lerp(b, rim[2], 0.24);
          em = Math.max(em, 0.22);
        }

        // Volume: occlusion where the form meets the ground, key light from the left.
        if (!flash) {
          const hA = spr.ay - j;
          const side = (dx - (spr.w - 1) * 0.5) / Math.max(1, spr.w * 0.5);
          const vol = (0.64 + 0.36 * Math.min(1, Math.max(0, hA) / 5)) * (1 - side * 0.16);
          r *= vol;
          g *= vol;
          b *= vol;
        }

        const lum = clamp(r * 0.3 + g * 0.59 + b * 0.11, 0.08, 1);
        const mat = spr.mat[si];
        const micro = (hash(i, j, 47) - 0.5) * 0.09;
        let code: number;
        if (mat === 3 && opts.isEntity) {
          code = luminousStroke(spr, i, j, flip);
        } else if (mat === 3) {
          code = lum > 0.8 ? 64 : lum > 0.55 ? 42 : 43; // @ * +
        } else if (mat === 4) {
          const lean = dx < spr.ax - 1 ? 0 : dx > spr.ax + 1 ? 2 : 1;
          code = GRASS_TUFT + lean * 4 + (Math.floor((micro / 0.09 + 0.5) * 4) & 3);
        } else if (mat === 5) {
          code = pickRampChar(RAMP_BARK, lum, micro * 1.2);
        } else if (mat === 2) {
          code = pickRampChar(RAMP_STONE, lum, micro * 1.2);
        } else if (mat === 1) {
          code = pickRampChar(RAMP_METAL, lum, micro);
        } else {
          code = pickRampChar(RAMP_CLOTH, lum, micro);
        }

        const idx = gy * cols + gx;
        // Slightly fuller dark background inside solid figure torso for clean silhouette readability
        const bgK = mat === 3 ? 0.10 : opts.isEntity ? 0.43 : mat === 4 ? 0.19 : 0.28;
        this.putCell(gx, gy, code, r, g, b, em, alpha, bgK);
        if (opts.isEntity) this.FL[idx] |= 8;
      }
    }
  }

  private drawWorldObject(o: WorldObject, G: Game, playerCellX: number, playerCellY: number): void {
    const t = G.t;
    const cx = Math.round((o.x + 0.5) * WORLD_SCALE_X) - this.camCellX;
    const cy = Math.round((o.y + 0.5) * WORLD_SCALE_Y) - this.camCellY;

    if (o.kind === 'flower') {
      const cyan = o.v > 0.52;
      const ch = o.v < 0.35 ? 183 : o.v < 0.7 ? 176 : 42; // · ° *
      this.putCell(cx, cy, ch, cyan ? 0.72 : 0.95, cyan ? 0.92 : 0.92, cyan ? 1.0 : 0.84, 0.55, 1, 0.04);
      return;
    }
    if (o.kind === 'reeds') {
      const sw = Math.round(Math.sin(t * 1.8 + o.x) * 0.8);
      for (let h = 0; h < 5; h++) {
        this.putCell(cx + Math.round(sw * (h / 4)), cy - h, sw >= 0 ? 47 : 92, 0.26, 0.52, 0.24, 0, 1, 0.04);
      }
      return;
    }
    if (o.kind === 'fungus') {
      this.putCell(cx, cy, 111, 0.3, 0.95, 0.82, 0.9, 1, 0.05);
      this.putCell(cx + 1, cy, 183, 0.25, 0.82, 0.72, 0.7, 1, 0.04);
      return;
    }
    if (o.kind === 'vent') {
      this.putCell(cx, cy, 42, 1.0, 0.48, 0.14, 0.98, 1, 0.06);
      return;
    }

    let propKey = o.kind;
    let variant = 0;
    let anim = 0;
    let swayX = 0;
    if (o.kind === 'pine') {
      variant = o.v < 0.33 ? 0 : o.v < 0.72 ? 1 : 2;
      swayX = Math.sin(t * 1.2 + o.x * 0.5) * (0.55 + G.weather.wind * 0.65);
    } else if (o.kind === 'shrine') {
      const lit = !!(o.id && G.flags.shrines.has(o.id));
      propKey = lit ? 'shrineLit' : 'shrineDark';
      anim = lit ? Math.floor(t * 7 + o.x) % 3 : 0;
    } else if (o.kind === 'brazier' || o.kind === 'campfire') {
      anim = Math.floor(t * 8 + o.x) % 3;
    } else if (o.kind === 'chest') {
      propKey = o.id && G.flags.chests.has(o.id) ? 'chestOpen' : 'chestClosed';
    } else if (o.kind === 'lore') {
      propKey = o.id && G.flags.lore.has(o.id) ? 'loreRead' : 'lore';
    }

    const spr = this.getCachedSprite(`prop:${propKey}:${variant}:${anim}`, () => buildPropSprite(propKey, variant, anim)!);
    if (!spr) return;

    let alpha = 1.0;
    if (G.mode === 'play' && !G.player.dead && cy > playerCellY && spr.h >= 22) {
      const dx = Math.abs(cx - playerCellX);
      const dy = cy - playerCellY;
      if (dx < spr.w * 0.52 && dy < spr.h * 0.85) alpha = 0.34;
    }

    this.drawPixelSprite(spr, o.x + 0.5, o.y + 0.5, { alpha, swayX });
  }

  render(G: Game, objs: WorldObject[], alphaInterp: number, remotePlayers: RemotePlayerEntity[] = []): void {
    const t0 = performance.now();
    const cols = this.gl.gridCols;
    const rows = this.gl.gridRows;
    const W = G.world;
    const t = G.t;

    const view = G.camera.computeViewGrid(
      this.gl.visCols,
      this.gl.visRows,
      this.gl.cellW,
      this.gl.cellH,
      WORLD_SCALE_X,
      WORLD_SCALE_Y,
    );
    this.camCellX = view.camCellX;
    this.camCellY = view.camCellY;
    this.camLeftWorld = view.camLeftWorld;
    this.camTopWorld = view.camTopWorld;

    const pxInterp = lerp(G.player.prevX, G.player.x, alphaInterp);
    const pyInterp = lerp(G.player.prevY, G.player.y, alphaInterp);
    const playerCellX = Math.round(pxInterp * WORLD_SCALE_X) - this.camCellX;
    const playerCellY = Math.round(pyInterp * WORLD_SCALE_Y) - this.camCellY;

    // --------------------------------------------------------- 1. Domain-Warped Organic Terrain & Intricate Typographic Stone
    for (let y = 0; y < rows; y++) {
      const cellY = this.camCellY + y;
      const baseWy = Math.floor(cellY / WORLD_SCALE_Y);
      const subY = ((cellY % WORLD_SCALE_Y) + WORLD_SCALE_Y) % WORLD_SCALE_Y;
      for (let x = 0; x < cols; x++) {
        const cellX = this.camCellX + x;
        const baseWx = Math.floor(cellX / WORLD_SCALE_X);
        const rawC = W.chunkAtCell(baseWx, baseWy);
        const rawCi = ((baseWy & 31) << 5) | (baseWx & 31);
        let tp = rawC.type[rawCi] as TerrainId;
        let el = rawC.elev[rawCi];
        let shadeVal = rawC.shade[rawCi];

        // Organic domain-warping on natural biome boundaries (eliminates blocky tile stair-steps!)
        const rawSt = TS[tp] || TS[T.GRASS];
        if (rawSt.organic) {
          const warpX = (noise(cellX * 0.055, cellY * 0.085, 131) - 0.5) * 1.1;
          const warpY = (noise(cellX * 0.055, cellY * 0.085, 197) - 0.5) * 0.75;
          const swx = Math.floor(cellX / WORLD_SCALE_X + warpX);
          const swy = Math.floor(cellY / WORLD_SCALE_Y + warpY);
          const wc = W.chunkAtCell(swx, swy);
          const wci = ((swy & 31) << 5) | (swx & 31);
          const wtp = wc.type[wci] as TerrainId;
          if ((TS[wtp] || rawSt).organic) {
            tp = wtp;
            el = wc.elev[wci];
            shadeVal = wc.shade[wci];
          }
        }

        if (tp === T.GATE && G.flags.gateOpen) tp = T.FLOOR;
        const st = TS[tp] || TS[T.GRASS];
        const hv = hash(cellX, cellY, 11);
        const i = y * cols + x;

        const broad = noise(cellX * 0.04, cellY * 0.065, 17);
        const detail = noise(cellX * 0.16, cellY * 0.24, 43);
        const smoothVar = 0.72 + broad * 0.34 + detail * 0.16;
        const m = lerp(1.0, shadeVal, 0.55) * smoothVar;

        let r = st.c[0] * m;
        let g = st.c[1] * m;
        let b = st.c[2] * m;
        let fl = st.water ? 1 : st.grass ? 16 : 0;
        let code = -1;

        if (st.water) {
          // Deep obsidian-slate mirror water with delicate horizontal ripple strokes
          const ripple = Math.sin(cellX * 0.12 + cellY * 0.55 + t * 1.5) * 0.5 + Math.sin(cellX * 0.05 - t * 0.9 + cellY * 0.3) * 0.5;
          const darkK = tp === T.DEEP ? 0.35 : tp === T.WATER ? 0.48 : 0.65;
          r *= darkK * (0.85 + ripple * 0.25);
          g *= darkK * (0.88 + ripple * 0.25);
          b *= darkK * (0.98 + ripple * 0.28);
          if (ripple > 0.35 && hv > 0.45) {
            code = WATER_LINE + Math.floor(hv * 4);
          } else {
            code = hv > 0.78 ? 46 : 32; // sparse delicate dots over obsidian void
          }
          // Soft organic shoreline foam
          const northT = W.typeAt(baseWx, baseWy - 1);
          if (!WATERY[northT] && subY === 0) {
            r = 0.56;
            g = 0.66;
            b = 0.74;
            code = WATER_LINE + Math.floor(detail * 3.99);
            const foam = 0.45 + detail * 0.45 + ripple * 0.16;
            r *= foam; g *= foam; b *= foam;
          }
        } else if (tp === T.ROAD || tp === T.FLOOR || tp === T.ARCH) {
          // Intricate weathered cobblestone / flagstone mapped through full 58-char stone ramp!
          const brickRow = Math.floor(cellY / 2);
          const stagger = (brickRow & 1) * 4;
          const isMortarV = ((cellX + stagger) % 7 + 7) % 7 === 0;
          const isMortarH = (cellY % 2) === 0 && detail < 0.35;
          const stoneShade = (isMortarV || isMortarH ? 0.52 : 0.85) * (0.75 + detail * 0.38);
          r *= stoneShade;
          g *= stoneShade;
          b *= stoneShade * 1.04;
          code = isMortarV ? 58 : isMortarH ? 45 : hv < 0.22 ? 44 : 32;
        } else if (tp === T.STAIRS) {
          code = subY === 0 ? 61 : 45;
          const stepShade = subY === 0 ? 1.12 : 0.78;
          r *= stepShade;
          g *= stepShade;
          b *= stepShade;
        } else if (tp === T.BRIDGE) {
          const isBeam = ((cellX % 4) + 4) % 4 === 0;
          code = isBeam ? 124 : 61;
          if (isBeam) {
            r *= 0.78;
            g *= 0.78;
            b *= 0.8;
          }
        } else if (tp === T.GATE) {
          code = (cellX & 1) ? 72 : 124;
        } else if (st.stone) {
          // Weathered rock & cliffs using full alphanumeric stone density ramp!
          // Long slate planes crossed by a few pale mineral seams.
          const band = Math.abs(((cellY * 0.19 + cellX * 0.038 + broad * 2.1) % 1 + 1) % 1 - 0.5);
          const seam = band < 0.055 && detail > 0.36;
          const rockL = 0.26 + broad * 0.34 + detail * 0.19 + (seam ? 0.20 : 0);
          r *= rockL * 1.1;
          g *= rockL * 1.12;
          b *= rockL * 1.18;
          code = seam ? 45 : hv < 0.22 + detail * 0.17 ? 183 : 32;
        } else if (st.grass) {
          // Deep shadowed forest bed beneath lush multi-layer grass blades
          r *= 0.48;
          g *= 0.52;
          b *= 0.48;
          code = hv < 0.4 ? 44 : hv < 0.75 ? 39 : 46; // , ' .
        } else {
          // 2.5D Elevation cliff facade
          const southEl = W.elevAt(baseWx, baseWy + 1);
          if (el > southEl && subY === WORLD_SCALE_Y - 1) {
            r *= 0.62;
            g *= 0.66;
            b *= 0.74;
            code = pickRampChar(RAMP_STONE, 0.42 + detail * 0.35, (hv - 0.5) * 0.15);
          } else {
            code = pickRampChar(RAMP_CLOTH, clamp(0.22 + detail * 0.32, 0.08, 0.65), (hv - 0.5) * 0.12);
          }
        }

        // Terrace relief: raised ground catches more moonlight, its north lip and west
        // flank glint, its east flank turns away, and the ground at a cliff foot sits in shadow.
        if (!st.water) {
          const subX = ((cellX % WORLD_SCALE_X) + WORLD_SCALE_X) % WORLD_SCALE_X;
          let relief = 0.88 + Math.min(el, 4) * 0.06;
          if (subY === 0) {
            const northEl = W.elevAt(baseWx, baseWy - 1);
            if (northEl < el) relief *= 1.22;
            else if (northEl > el) relief *= 0.58;
          }
          if (subX === 0 && W.elevAt(baseWx - 1, baseWy) < el) relief *= 1.12;
          if (subX === WORLD_SCALE_X - 1 && W.elevAt(baseWx + 1, baseWy) < el) relief *= 0.74;
          r *= relief;
          g *= relief;
          b *= relief;
        }

        this.CHR[i] = code;
        this.MAT[i] = tp;
        this.ELEV[i] = el;
        this.FL[i] = fl;
        this.BR[i] = r;
        this.BG[i] = g;
        this.BB[i] = b;
        const groundFill = st.grass ? 0.55 : st.masonry ? 0.24 : st.water ? 0.30 : st.stone ? 0.43 : st.bgK;
        this.BGR[i] = r * groundFill;
        this.BGG[i] = g * groundFill;
        this.BGB[i] = b * groundFill;
        this.EM[i] = 0;
        this.HV[i] = hv;
      }
    }

    // --------------------------------------------------------- 2. Towering Weathered 2.5D Stone Walls, Towers & Creeping Moss
    // Modeled directly on Images 2, 3, 4: rich full-ramp typographic masonry (`Q0@M#&8%B$pqdb...`) + organic creeping moss!
    for (let y = 0; y < rows + 24; y++) {
      const cellY = this.camCellY + y;
      const wy = Math.floor(cellY / WORLD_SCALE_Y);
      const subY = ((cellY % WORLD_SCALE_Y) + WORLD_SCALE_Y) % WORLD_SCALE_Y;
      if (subY !== WORLD_SCALE_Y - 1) continue;
      for (let x = 0; x < cols; x++) {
        const cellX = this.camCellX + x;
        const wx = Math.floor(cellX / WORLD_SCALE_X);
        const tp = W.typeAt(wx, wy);
        if (tp !== T.WALL && tp !== T.TOWER_WALL && tp !== T.ARCH) continue;

        const facadeH = tp === T.TOWER_WALL ? 24 : 16;
        const isArch = tp === T.ARCH;

        // Ground-cast shadow directly south of solid wall base
        if (!isArch) {
          for (let sh = 1; sh <= 4; sh++) {
            const sy = y + sh;
            if (sy >= 0 && sy < rows) {
              const si = sy * cols + x;
              const k = 0.52 + sh * 0.11;
              this.BR[si] *= k;
              this.BG[si] *= k;
              this.BB[si] *= k * 1.05;
            }
          }
        }

        const isMerlon = (Math.floor(cellX / 4) & 1) === 0;
        const topH = isMerlon ? facadeH + 2 : facadeH;


        // Adjacent arch tiles form one vaulted opening. Sample the run once per column.
        let archClear = 0;
        let archDepth = 0;
        if (isArch) {
          let left = wx, right = wx;
          while (W.typeAt(left - 1, wy) === T.ARCH) left--;
          while (W.typeAt(right + 1, wy) === T.ARCH) right++;
          const halfWidth = (right - left + 1) * WORLD_SCALE_X / 2;
          const u = (cellX + 0.5 - left * WORLD_SCALE_X) / halfWidth - 1;
          archDepth = Math.sqrt(Math.max(0, 1 - u * u));
          archClear = Math.round(6 + 7 * archDepth);
        }
        const pierX = ((cellX % 27) + 27) % 27;
        for (let fh = 1; fh <= topH; fh++) {
          if (isArch && fh <= archClear) continue;
          const fy = y - fh;
          if (fy < 0 || fy >= rows) continue;

          let occAlpha = 1.0;
          if (G.mode === 'play' && !G.player.dead && y > playerCellY) {
            const od = Math.hypot((x - playerCellX) * 0.55, fy - (playerCellY - 10));
            if (od < 15) occAlpha = 0.24;
          }

          const brickRow = Math.floor(fh / 3);
          const stagger = (brickRow & 1) * 4;
          const isMortarV = ((cellX + stagger) % 7 + 7) % 7 === 0;
          const isMortarH = (fh % 3) === 0;
          const topCap = fh >= topH - 1;
          const isArchRim = isArch && fh <= archClear + 2;

          // Rich weathered stone heightfield (multi-octave fBM + mortar grooves + vertical AO)
          const pierLight = isArch ? 0.92 + archDepth * 0.12 : pierX < 3 ? 1.20 : pierX < 5 ? 0.59 : 0.96;
          const ao = (0.46 + 0.58 * (fh / topH)) * pierLight;
          const weatherN = noise(cellX * 0.12, (cellY - fh) * 0.14, 71);
          const crackN = noise(cellX * 0.32, (cellY - fh) * 0.32, 97);
          const blockTint = 0.75 + hash(Math.floor((cellX + stagger) / 7), cellY - brickRow * 3, 53) * 0.46;
          const mortarK = (isMortarV || isMortarH) && !topCap && !isArchRim ? 0.58 : 1.0;

          // Creeping organic moss & ivy patches draping over castle walls & towers (exact Image 2 & 4 look!)
          const mossField = noise(cellX * 0.09, (cellY - fh) * 0.11, 83) + (fh / topH) * 0.22 - 0.14;
          const isMoss = mossField > 0.68 && !isArchRim;

          let r: number;
          let g: number;
          let b: number;
          let ch: number;
          if (isMoss) {
            const ml = clamp(0.45 + (mossField - 0.68) * 2.2, 0.35, 1.0);
            r = lerp(0.12, 0.28, ml) * ao;
            g = lerp(0.24, 0.48, ml) * ao;
            b = lerp(0.14, 0.24, ml) * ao;
            ch = pickRampChar(RAMP_FOLIAGE, ml, (crackN - 0.5) * 0.25);
          } else {
            const lum = clamp((topCap || isArchRim ? 0.82 : 0.62) * ao * blockTint * mortarK * (0.76 + weatherN * 0.44), 0.15, 0.98);
            // Cool silver-slate gothic stone palette (Images 2, 3, 4)
            r = lum * 0.78;
            g = lum * 0.84;
            b = lum * 0.94;
            // Subtle warm torchlight window/crack accents occasionally on fortress walls (like Image 2/3)
            const warmGlint = !topCap && fh < 5 && weatherN > 0.78 && crackN > 0.72;
            if (warmGlint) {
              r = 0.96;
              g = 0.56;
              b = 0.24;
            }
            const grain = hash(cellX, cellY - fh, 103);
            if ((isMortarV || isMortarH) && !topCap && !isArchRim) {
              ch = isMortarV ? 58 : grain > 0.65 ? 45 : 46;
            } else {
              const band = clamp(Math.floor(lum * 4 + grain * 0.45), 0, 3);
              ch = STONE_FACE + band * 4 + Math.floor(grain * 4);
            }
          }

          this.putCell(x, fy, ch, r, g, b, 0, occAlpha, isMoss ? 0.28 : 0.42);
          this.FL[fy * cols + x] |= 4;
        }
      }
    }

    // --------------------------------------------------------- 3. Ultra-Dense Feathery Meadow Grass + Wildflower Specks
    // Exact Images 1, 2, 3 look: dense multi-tone sweeping green blades with parting around characters!
    const grassEntities: { x: number; y: number }[] = [];
    if (G.mode === 'play' && !G.player.dead) grassEntities.push({ x: pxInterp, y: pyInterp });
    for (const e of G.enemies) grassEntities.push({ x: e.x, y: e.y });
    for (const n of G.npcs) grassEntities.push({ x: n.x, y: n.y });
    for (const rp of remotePlayers) grassEntities.push({ x: rp.x, y: rp.y });

    for (let y = 0; y < rows; y++) {
      const cellY = this.camCellY + y;
      const wy = cellY / WORLD_SCALE_Y;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!(this.FL[i] & 16)) continue;
        if (this.FL[i] & 4) continue;
        const hv = this.HV[i];
        if (hv > 0.88) continue;
        if (G.options.grassDensity < 0.9 && hash(this.camCellX + x, cellY, 151) > 0.34) continue;

        const mat = this.MAT[i];
        const cellX = this.camCellX + x;
        const wx = cellX / WORLD_SCALE_X;
        const wind =
          (noise(wx * 0.075 - t * (0.65 + G.weather.wind * 1.4), wy * 0.11 + t * 0.12, 5) - 0.48) * 1.75 +
          Math.sin(t * 1.8 + wx * 0.35 + wy * 0.2) * 0.25;
        const disp = G.grassField.sampleDisplacement(wx, wy, grassEntities);
        const tilt = wind + disp + (hv - 0.44) * 0.85;

        // Sweeping hill tonal variation + moonlight sheen
        const hill = noise(wx * 0.06, wy * 0.08, 29);
        const patch = noise(wx * 0.2, wy * 0.25, 61);
        const tone = clamp(hill * 0.65 + patch * 0.35, 0, 1);
        // Clumps: dense tussocks separated by darker hollows where the bed shows through.
        const clump = noise(wx * 0.55 + hv * 0.3, wy * 0.7, 77);
        if (clump < 0.3 && hv > 0.42) continue;
        const clumpK = 0.72 + clump * 0.5;
        const dry = mat !== T.FOREST && hash(cellX, cellY, 171) > 0.9;

        const rBase = mat === T.MOOR ? lerp(0.28, 0.44, tone) : lerp(0.08, 0.30, tone);
        const gBase = mat === T.MOOR ? lerp(0.32, 0.48, tone) : lerp(0.19, 0.51, tone);
        const bBase = mat === T.MOOR ? lerp(0.14, 0.22, tone) : lerp(0.14, 0.36, tone);

        // Tall 3-4 cell layered feathery blades
        const len = 1 + Math.round(patch * 2 + hv) + (clump > 0.68 ? 1 : 0);
        for (let b = 0; b < len; b++) {
          const bx = x + Math.round(tilt * (b * 0.48));
          const by = y - b;
          if (bx < 0 || by < 0 || bx >= cols || by >= rows) continue;
          const bi = by * cols + bx;
          if (this.FL[bi] & 4) continue;

          const lean = tilt < -0.28 ? 0 : tilt > 0.28 ? 2 : 1;
          const ch = GRASS_TUFT + lean * 4 + (Math.floor(hv * 23) & 3);
          const tipK = (0.48 + b / Math.max(1, len - 1) * 0.76) * (0.74 + patch * 0.48 + hv * 0.24) * clumpK;
          const isTip = b === len - 1;
          this.CHR[bi] = dry && isTip ? 39 : ch;
          if (dry && isTip) {
            // Sun-bleached seed heads break up the green with a few straw tips.
            this.BR[bi] = 0.58 * tipK;
            this.BG[bi] = 0.54 * tipK;
            this.BB[bi] = 0.34 * tipK;
          } else {
            this.BR[bi] = rBase * tipK;
            this.BG[bi] = gBase * tipK;
            this.BB[bi] = bBase * tipK;
          }
        }

        // Delicate scattered glowing white & pale-cyan meadow pollen / wildflower specks (exact Images 1, 2, 3!)
        if (hv > 0.863 && patch > 0.54 && mat !== T.FOREST) {
          // Each meadow patch blooms in one hue so flowers read as drifts, not confetti.
          const hue = Math.floor(noise(wx * 0.09, wy * 0.11, 131) * 4) & 3;
          const fc = FLOWER_COLORS[hue];
          const bright = 0.7 + hash(cellX, cellY, 99) * 0.3;
          this.CHR[i] = hv > 0.872 ? 42 : 183; // * or ·
          this.BR[i] = fc[0] * bright;
          this.BG[i] = fc[1] * bright;
          this.BB[i] = fc[2] * bright;
          this.EM[i] = 0.35 + bright * 0.3;
        }
      }
    }

    // --------------------------------------------------------- 4. Decals
    for (const d of G.decals.values()) {
      const gx = Math.round(d.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(d.y * WORLD_SCALE_Y) - this.camCellY;
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      const a = Math.min(1, d.life / 20) * 0.8;
      this.putCell(gx, gy, d.code, d.r, d.g, d.b, 0, a);
    }

    this.castShadows = G.options.shadows;
    // --------------------------------------------------------- 5. Y-Sorted Unified Drawables (Props, Entities, Remote Players)
    type DrawItem = {
      y: number;
      x: number;
      o?: WorldObject;
      e?: EnemyEntity;
      n?: NpcEntity;
      rp?: RemotePlayerEntity;
      isPlayer?: boolean;
      pk?: { x: number; y: number; amount: number };
    };
    const drawables: DrawItem[] = [];
    for (const o of objs) drawables.push({ y: o.y, x: o.x, o });
    for (const e of G.enemies) drawables.push({ y: e.y, x: e.x, e });
    for (const n of G.npcs) drawables.push({ y: n.y, x: n.x, n });
    for (const rp of remotePlayers) drawables.push({ y: rp.y, x: rp.x, rp });
    for (const pk of G.pickups) drawables.push({ y: pk.y, x: pk.x, pk });
    if (G.mode !== 'title' && !G.player.dead) {
      drawables.push({ y: pyInterp, x: pxInterp, isPlayer: true });
    }
    drawables.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const d of drawables) {
      if (d.o) {
        this.drawWorldObject(d.o, G, playerCellX, playerCellY);
      } else if (d.rp) {
        const rp = d.rp;
        const armor = ARMORS[rp.armorId] || ARMORS.sentinel_mail;
        const weapon = WEAPONS[rp.weaponId] || WEAPONS.iron_sword;
        const spr = this.getCachedSprite(`pl:${armor.id}:${weapon.id}:${rp.pose}:${rp.frame}`, () =>
          buildKnightSprite(armor, weapon, rp.pose, rp.frame),
        );
        this.drawPixelSprite(spr, rp.x, rp.y, {
          flip: rp.face < 0,
          alpha: rp.isPhantom ? 0.94 : 1,
          rim: [0.5, 0.88, 1.0],
          isEntity: true,
        });
      } else if (d.isPlayer) {
        const p = G.player;
        const armor = ARMORS[p.armorId] || ARMORS.wanderer_plate;
        const weapon = WEAPONS[p.weaponId] || WEAPONS.iron_sword;
        let pose: AnimPose = 'idle';
        if (p.roll > 0) pose = 'roll';
        else if (p.parry > 0) pose = 'parry';
        else if (p.drink > 0) pose = 'drink';
        else if (p.atk > 0.04) pose = p.combo === 0 ? 'attack1' : p.combo === 1 ? 'attack2' : 'attack3';
        else if (p.moving) pose = 'walk';
        const frame = knightAnimationFrame(pose, t, p.walkT, p.atk, weapon.speed * 0.9, p.roll);
        const spr = this.getCachedSprite(`pl:${armor.id}:${weapon.id}:${pose}:${frame}`, () =>
          buildKnightSprite(armor, weapon, pose, frame),
        );
        this.drawPixelSprite(spr, pxInterp, pyInterp, {
          flip: p.face < 0,
          flash: p.hurtT > 0.2,
          rim: p.shieldT > 0 ? [0.55, 0.88, 1.0] : [0.96, 0.92, 0.84],
          isEntity: true,
        });
      } else if (d.e) {
        const e = d.e;
        const ex = lerp(e.prevX, e.x, alphaInterp);
        const ey = lerp(e.prevY, e.y, alphaInterp);
        const pose = e.state === 'attack' || (e.state === 'windup' && e.st < 0.2) ? 'attack' : 'idle';
        const frame = Math.floor(e.walkT * 5) % 2;
        const spr = this.getCachedSprite(`en:${e.type}:${pose}:${frame}`, () => buildCreatureSprite(e.type, pose, frame));
        const teleFlash = e.state === 'windup' && e.st < 0.28 && ((t * 18) | 0) % 2 === 0;
        const lift = e.float ? Math.round(Math.sin(t * 2.5 + e.hx) * 1.2) - 1 : 0;
        const eliteRim = e.eliteAffix ? ELITE_AFFIXES[e.eliteAffix].rimColor : null;
        this.drawPixelSprite(spr, ex, ey, {
          flip: e.face < 0,
          flash: e.flash > 0 || teleFlash,
          alpha: e.float ? 0.86 : 1,
          rim: e.state === 'stagger' ? [1.0, 0.88, 0.35] : eliteRim || [1.0, 0.34, 0.3],
          liftCells: lift,
          isEntity: true,
        });
      } else if (d.n) {
        const npc = d.n;
        const frame = Math.floor(t * 2) % 2;
        const spr = this.getCachedSprite(`npc:${npc.kind}:${frame}`, () => buildCreatureSprite(npc.kind, 'idle', frame));
        this.drawPixelSprite(spr, npc.x, npc.y, {
          flip: pxInterp < npc.x,
          rim: [1.0, 0.86, 0.52],
          isEntity: true,
        });
      } else if (d.pk) {
        const s = 0.72 + 0.28 * Math.sin(t * 5);
        const gx = Math.round(d.pk.x * WORLD_SCALE_X) - this.camCellX;
        const gy = Math.round(d.pk.y * WORLD_SCALE_Y) - this.camCellY;
        this.putCell(gx, gy, 42, 1 * s, 0.8 * s, 0.32 * s, 1);
        this.putCell(gx, gy - 1, 39, 1 * s, 0.68 * s, 0.22 * s, 1, 0.75);
      }
    }

    // --------------------------------------------------------- 6. Foreground Grass Boot Overlap (Embeds figures IN meadow!)
    if (G.mode === 'play' && !G.player.dead) {
      for (const ent of grassEntities) {
        const ecx = Math.round(ent.x * WORLD_SCALE_X) - this.camCellX;
        const ecy = Math.round(ent.y * WORLD_SCALE_Y) - this.camCellY;
        if (ecx < 4 || ecy < 4 || ecx >= cols - 4 || ecy >= rows - 2) continue;
        const feetMat = this.MAT[ecy * cols + ecx];
        if (feetMat !== T.GRASS && feetMat !== T.MOOR && feetMat !== T.MARSH) continue;
        for (let dx = -5; dx <= 5; dx++) {
          for (let dy = -2; dy <= 1; dy++) {
            const gx = ecx + dx;
            const gy = ecy + dy;
            if (hash(gx + this.camCellX, gy + this.camCellY, 73) < 0.42) {
              const ch = dx < 0 ? 92 : dx > 0 ? 47 : 124;
              this.putCell(gx, gy, ch, 0.16, 0.52, 0.2, 0, 0.82, 0.05);
            }
          }
        }
      }
    }

    // --------------------------------------------------------- 7. Deep Mirror Water Reflection Pass + Shimmering Silver Moon!
    // Runs AFTER props & entities so walls, towers, trees, torches, AND characters reflect crisply in water (Images 1, 3, 4)!
    const moonScreenX = Math.round(cols * 0.82);
    const moonScreenY = Math.round(rows * 0.56);
    const moonRx = Math.max(12, Math.round(cols * 0.085));
    const moonRy = Math.max(7, Math.round(moonRx * 0.58));

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!(this.FL[i] & 1) || (this.FL[i] & (2 | 4 | 8))) continue;

        // Horizontal sinusoidal water ripple shear
        const wave = Math.sin(t * 2.1 + (y + this.camCellY) * 0.42 + (x + this.camCellX) * 0.05);
        const waveShift = Math.round(wave * 1.35);

        // Mirror walls, towers, trees, torches & characters standing above the water up to 28 cells!
        let reflected = false;
        for (let distY = 1; distY <= 28; distY++) {
          const sy = y - distY;
          if (sy < 0) break;
          const sx = clamp(x + waveShift, 0, cols - 1);
          const si = sy * cols + sx;
          if (!(this.FL[si] & 1)) {
            const mirrorY = sy - distY + 1;
            if (mirrorY >= 0) {
              const mi = mirrorY * cols + sx;
              if (this.FL[mi] & (2 | 4 | 8 | 16)) {
                const fade = (1 - distY / 30) * 0.62;
                // Break reflection slightly along horizontal scanline troughs
                const scan = 0.72 + 0.28 * Math.sin((y + this.camCellY) * 1.4 + t * 2.4);
                const k = fade * scan;
                this.BR[i] = this.BR[i] * 0.35 + this.BR[mi] * k * 0.82;
                this.BG[i] = this.BG[i] * 0.35 + this.BG[mi] * k * 0.92;
                this.BB[i] = this.BB[i] * 0.35 + this.BB[mi] * k * 1.12;
                // The reflected bank leaves a continuous cool wash between broken wave crests.
                const wash = k * 0.36;
                this.BGR[i] += this.BR[mi] * wash * 0.72;
                this.BGG[i] += this.BG[mi] * wash * 0.88;
                this.BGB[i] += this.BB[mi] * wash;
                this.EM[i] = this.EM[mi] * k * 0.75;
                this.CHR[i] = scan > 0.58 ? WATER_LINE + (sx & 3) : 46;
                reflected = true;
              }
            }
            break;
          }
        }

        // Shimmering Reflected Silver Moon on open water (exact Image 1 & 3 iconic signature!)
        if (!reflected && !G.inDungeon && !G.flags.victory) {
          const mdx = (x + wave * 2.2 - moonScreenX) / moonRx;
          const mdy = (y - moonScreenY) / moonRy;
          const md2 = mdx * mdx + mdy * mdy;
          if (md2 < 1.0) {
            const scanBand = 0.55 + 0.45 * Math.sin(y * 1.9 - t * 2.6 + x * 0.08);
            const mLum = clamp((1 - md2) * 1.15 * scanBand, 0, 1);
            if (mLum > 0.12) {
              this.BR[i] = lerp(this.BR[i], 0.86 * mLum, 0.9);
              this.BG[i] = lerp(this.BG[i], 0.9 * mLum, 0.9);
              this.BB[i] = lerp(this.BB[i], 0.98 * mLum, 0.92);
              this.EM[i] = Math.max(this.EM[i], mLum * 0.85);
              this.CHR[i] = WATER_LINE + Math.floor(this.HV[i] * 4);
            }
          }
        }
      }
    }

    // Shallow water expanding ripples
    for (const rp of G.grassField.ripples) {
      const k = rp.age / rp.maxAge;
      const rad = 1 + k * 4.5;
      const fade = 1 - k;
      for (let s = 0; s < 16; s++) {
        const a = (s / 16) * TAU;
        const gx = Math.round((rp.x + Math.cos(a) * rad * 0.5) * WORLD_SCALE_X) - this.camCellX;
        const gy = Math.round((rp.y + (Math.sin(a) * rad * 0.5) / ASP) * WORLD_SCALE_Y) - this.camCellY;
        if (gx >= 0 && gy >= 0 && gx < cols && gy < rows && (this.FL[gy * cols + gx] & 1)) {
          this.putCell(gx, gy, 126, 0.72 * fade, 0.86 * fade, 0.98 * fade, 0.35 * fade, fade * 0.85, 0.04);
        }
      }
    }

    // --------------------------------------------------------- 8. Ground Telegraphs, Particles, Rain & Fireflies
    for (const tg of G.telegraphs) {
      const k = 1 - tg.life / tg.max;
      const cx = Math.round(tg.x * WORLD_SCALE_X) - this.camCellX;
      const cy = Math.round(tg.y * WORLD_SCALE_Y) - this.camCellY;
      const rx = Math.ceil(tg.rad * WORLD_SCALE_X);
      const ry = Math.ceil((tg.rad / ASP) * WORLD_SCALE_Y);
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          const nd = Math.hypot(dx / WORLD_SCALE_X, (dy / WORLD_SCALE_Y) * ASP);
          if (nd > tg.rad) continue;
          if (tg.kind === 'cone' && tg.angle !== undefined && tg.arc !== undefined) {
            const ang = Math.atan2((dy / WORLD_SCALE_Y) * ASP, dx / WORLD_SCALE_X);
            const diff = ((ang - tg.angle + Math.PI * 3) % TAU) - Math.PI;
            if (Math.abs(diff) > tg.arc * 0.5) continue;
          }
          const isFill = nd <= tg.rad * (0.2 + 0.8 * k);
          const isBorder = nd >= tg.rad - 0.5;
          if (isFill || isBorder) {
            this.putCell(
              cx + dx,
              cy + dy,
              isBorder ? 58 : 46,
              tg.col[0],
              tg.col[1] * 0.45,
              tg.col[2] * 0.4,
              isBorder ? 0.9 : 0.45,
              isBorder ? 0.85 : 0.32 + k * 0.28,
              0.08,
            );
          }
        }
      }
    }

    for (const q of G.particles) {
      if (q.delay > 0) continue;
      const a = q.fade ? Math.min(1, (q.life / q.max) * 1.5) : 1;
      const gx = Math.round(q.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(q.y * WORLD_SCALE_Y) - this.camCellY;
      this.putCell(gx, gy, q.code, q.r * a, q.g * a, q.b * a, q.e, a, 0.05);
    }
    for (const q of G.projectiles) {
      const gx = Math.round(q.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(q.y * WORLD_SCALE_Y) - this.camCellY;
      this.putCell(gx, gy, 111, q.col[0], q.col[1], q.col[2], 1, 1, 0.08);
    }
    const rc = G.weather.wind > 0.5 ? 47 : 124;
    for (let ri = 0; ri < G.rain.length; ri++) {
      const d = G.rain[ri];
      const gx = Math.round(d.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(d.y * WORLD_SCALE_Y) - this.camCellY;
      if (d.ash) {
        this.putCell(gx, gy, d.life % 0.4 < 0.2 ? 46 : 39, 0.65, 0.58, 0.52, 0.35, 0.72, 0.04);
      } else {
        // Thin two-cell streaks with per-drop brightness so rain reads as depth, not a dot grid.
        const dv = hash(ri, 0, 211);
        const a = 0.22 + dv * 0.3;
        this.putCell(gx, gy, rc, 0.5, 0.6, 0.76, 0.1, a, 0.03);
        if (dv > 0.45) this.putCell(gx, gy - 1, rc, 0.42, 0.5, 0.64, 0.05, a * 0.45, 0.02);
      }
    }
    for (const f of G.fireflies) {
      if (!f.ok) continue;
      const s = 0.5 + 0.5 * Math.sin(t * 3 + f.ph);
      if (s > 0.2) {
        const gx = Math.round(f.x * WORLD_SCALE_X) - this.camCellX;
        const gy = Math.round(f.y * WORLD_SCALE_Y) - this.camCellY;
        this.putCell(gx, gy, 183, 0.75 * s, 1.0 * s, 0.55 * s, 1, 1, 0.05);
      }
    }

    // --------------------------------------------------------- 9. Lighting + Shadows
    const amb = G.amb;
    for (let i = 0; i < this.N; i++) {
      this.LR[i] = amb[0];
      this.LG[i] = amb[1];
      this.LB[i] = amb[2];
    }
    this.lastLightCount = G.lights.length;
    const doShadows = G.options.shadows;

    for (const L of G.lights) {
      const lcx = L.x * WORLD_SCALE_X - this.camCellX;
      const lcy = L.y * WORLD_SCALE_Y - this.camCellY;
      const radX = L.rad * WORLD_SCALE_X;
      const radY = (L.rad / ASP) * WORLD_SCALE_Y;
      const xa = Math.max(0, Math.floor(lcx - radX));
      const xb = Math.min(cols - 1, Math.ceil(lcx + radX));
      const ya = Math.max(0, Math.floor(lcy - radY));
      const yb = Math.min(rows - 1, Math.ceil(lcy + radY));
      const r2 = L.rad * L.rad;
      const invR = 1 / L.rad;

      for (let y = ya; y <= yb; y++) {
        const dy = ((y + 0.5 - lcy) / WORLD_SCALE_Y) * ASP;
        for (let x = xa; x <= xb; x++) {
          const dx = (x + 0.5 - lcx) / WORLD_SCALE_X;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          let f = 1 - Math.sqrt(d2) * invR;
          f = f * f * L.i;

          if (doShadows && L.castsShadow && f > 0.08 && d2 > 6) {
            const mx = L.x + dx * 0.5;
            const my = L.y + (dy / ASP) * 0.5;
            const mt = W.typeAt(mx, my);
            if (mt === T.WALL || mt === T.TOWER_WALL) f *= 0.35;
          }

          const i = y * cols + x;
          this.LR[i] += L.r * f;
          this.LG[i] += L.g * f;
          this.LB[i] += L.b * f;
        }
      }
    }

    // --------------------------------------------------------- 10. Final Obsidian-Void Composite -> WebGL2
    const gIndex = this.gl.atlas.index;
    const fogA = G.inDungeon ? 0.14 : G.weather.fog * 0.45;
    const fc = G.fogColor;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const e = this.EM[i];
        // Preserve the painted shadow planes when several camp lights overlap.
        const painted = this.CHR[i] >= SHADED_TILE;
        const exposure = painted ? 0.82 / (0.8 + Math.max(this.LR[i], this.LG[i], this.LB[i]) * 0.78) : 1;
        const lr = this.LR[i] * exposure * (1 - e) + e;
        const lg = this.LG[i] * exposure * (1 - e) + e;
        const lb = this.LB[i] * exposure * (1 - e) + e;

        let r = this.BR[i] * lr;
        let g = this.BG[i] * lg;
        let b = this.BB[i] * lb;

        let bgr = this.BGR[i] * lr;
        let bgg = this.BGG[i] * lg;
        let bgb = this.BGB[i] * lb;

        // Aerial perspective: the upper screen is farther away, so it loses contrast
        // into a cool night haze while the foreground keeps full depth.
        const far = 1 - y / rows;
        const haze = far * far * 0.2 * (1 - e);
        if (haze > 0.004) {
          r = lerp(r, 0.07, haze);
          g = lerp(g, 0.09, haze);
          b = lerp(b, 0.14, haze);
          bgr = lerp(bgr, 0.03, haze);
          bgg = lerp(bgg, 0.04, haze);
          bgb = lerp(bgb, 0.07, haze);
        }

        if (fogA > 0.02) {
          const fo = fogA * (1 - e * 0.8) * clamp(noise((this.camCellX + x) * 0.022 + t * 0.15, (this.camCellY + y) * 0.04, 9), 0, 1);
          const fl = (amb[0] + amb[1] + amb[2]) * 0.33 + 0.08;
          r = lerp(r, fc[0] * fl, fo * 0.65);
          g = lerp(g, fc[1] * fl, fo * 0.65);
          b = lerp(b, fc[2] * fl, fo * 0.65);
        }

        const code = this.CHR[i];
        const gid = code > 32 && code < 65536 ? gIndex[code] : 0;
        this.outGlyphs[i] = gid;

        const o = i * 4;
        this.outFg[o] = clamp(Math.round(r * 255), 0, 255);
        this.outFg[o + 1] = clamp(Math.round(g * 255), 0, 255);
        this.outFg[o + 2] = clamp(Math.round(b * 255), 0, 255);
        this.outFg[o + 3] = clamp(Math.round(e * 255), 0, 255);

        // Deep obsidian void floor (#030508) — keeps contrast razor-sharp like Images 1-4
        this.outBg[o] = clamp(Math.round(Math.max(0.014, bgr) * 255), 0, 255);
        this.outBg[o + 1] = clamp(Math.round(Math.max(0.018, bgg) * 255), 0, 255);
        this.outBg[o + 2] = clamp(Math.round(Math.max(0.026, bgb) * 255), 0, 255);
        this.outBg[o + 3] = 255;
      }
    }

    this.gl.submit({
      glyphs: this.outGlyphs,
      fg: this.outFg,
      bg: this.outBg,
      offsetPxX: view.offsetPxX,
      offsetPxY: view.offsetPxY,
      gamma: G.options.gamma,
      highContrast: G.options.highContrast,
      bloom: G.options.bloom,
      flash: G.options.reduceFlashes ? 0 : G.flash,
    });

    // --------------------------------------------------------- 11. Unlit Screen-Space TextOverlay
    const labels: OverlayLabel[] = [];
    const bars: OverlayBar[] = [];
    let lockTarget: { wx: number; wy: number } | null = null;
    let arrow: OverlayArrow | null = null;

    if (G.mode === 'play') {
      if (!G.player.dead) {
        labels.push({
          wx: pxInterp,
          wy: pyInterp - 9.6,
          text: `${G.options.playerName}`,
          color: '#f4f2ec',
          bg: 'rgba(3, 5, 8, 0.55)',
          size: 12,
        });
      }

      for (const rp of remotePlayers) {
        if (Math.abs(rp.x - pxInterp) < 34 && Math.abs(rp.y - pyInterp) < 22) {
          labels.push({
            wx: rp.x,
            wy: rp.y - 9.6,
            text: `${rp.name}`,
            color: '#9ee2ff',
            bg: 'rgba(3, 5, 8, 0.55)',
            size: 12,
          });
          if (rp.bubbleText) {
            labels.push({
              wx: rp.x,
              wy: rp.y - 11.2,
              text: `»${rp.bubbleText}«`,
              color: '#ffffff',
              bg: 'rgba(8, 12, 20, 0.85)',
              size: 12,
            });
          }
        }
      }

      const npc = G.interact?.n;
      if (npc) {
        labels.push({ wx: npc.x, wy: npc.y - 12.6, text: npc.name, color: '#ffd98a', bg: 'rgba(3, 5, 8, 0.62)', size: 12 });
      }
      const sign = G.interact?.kind === 'signpost' ? G.interact.f : undefined;
      if (sign?.text) {
        labels.push({ wx: sign.x + 0.5, wy: sign.y - 8.2, text: sign.text, color: '#e2d8c5', bg: 'rgba(3, 5, 8, 0.72)', size: 12 });
      }

      for (const e of G.enemies) {
        const isLocked = G.lockedTarget === e;
        if (isLocked) lockTarget = { wx: e.x, wy: e.y - 5.0 };
        const isElite = !!e.eliteAffix;
        if (!e.boss && (e.hp < e.maxHp || isLocked || e.state === 'stagger' || isElite)) {
          const displayName = isElite ? `${ELITE_AFFIXES[e.eliteAffix!].prefix} ${e.d.name}` : e.d.name;
          bars.push({
            wx: e.x,
            wy: e.y - 12.6,
            ratio: e.hp / e.maxHp,
            poiseRatio: e.poise / e.maxPoise,
            widthPx: isElite ? 66 : 54,
            color: e.state === 'stagger' ? '#ffbe4f' : isElite ? '#c864ff' : '#d6453d',
            name: isLocked || isElite ? displayName : undefined,
            locked: isLocked || isElite,
          });
        }
      }

      for (const f of G.floaters) {
        const k = f.life / f.max;
        labels.push({
          wx: f.x,
          wy: f.y - (1 - k) * 3.8,
          text: f.text,
          color: f.color,
          bg: 'rgba(3, 5, 8, 0.5)',
          size: f.bold ? 15 : 13,
          bold: f.bold,
          alpha: clamp(k * 1.6, 0, 1),
        });
      }

      if (G.options.targetArrow && !G.flags.victory) {
        const q = G.quest;
        arrow = {
          targetWx: q.step.targetX,
          targetWy: q.step.targetY,
          label: `${q.distanceMeters} m`,
          color: '#f5b856',
        };
      }
    }

    this.overlay.render(
      this.camLeftWorld,
      this.camTopWorld,
      this.gl.cellW,
      this.gl.cellH,
      WORLD_SCALE_X,
      WORLD_SCALE_Y,
      G.options.uiScale,
      labels,
      bars,
      lockTarget,
      arrow,
    );

    this.lastRenderMs = performance.now() - t0;
  }
}
