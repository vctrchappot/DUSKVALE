import { TextOverlay, type OverlayArrow, type OverlayBar, type OverlayLabel } from '../engine/textOverlay.ts';
import { ASP, clamp, hash, lerp, noise, TAU } from '../engine/util.ts';
import { WebGLAsciiRenderer } from '../engine/webgl.ts';
import type { EnemyEntity, Game, NpcEntity } from '../game/game.ts';
import { buildCreatureSprite, buildKnightSprite, type AnimPose, type PixelSprite } from '../game/pixelSprites.ts';
import { ARMORS, WEAPONS } from '../game/rpg.ts';
import { T, WATERY, type TerrainId, type WorldObject } from '../world/types.ts';

// Decoupled World -> ASCII scale: 1 world tile = 2x2 ASCII cells
export const WORLD_SCALE_X = 2;
export const WORLD_SCALE_Y = 2;

interface TerrainStyle {
  c: [number, number, number];
  bgK: number; // darkened material background factor (0.16..0.28)
  v: number;
  glyphs: string;
  water?: boolean;
  grass?: boolean;
  stone?: boolean;
  wall?: boolean;
}

const TS: Record<number, TerrainStyle> = {
  [T.DEEP]: { c: [0.09, 0.19, 0.34], bgK: 0.24, v: 0.12, glyphs: '.-~≈', water: true },
  [T.WATER]: { c: [0.13, 0.27, 0.42], bgK: 0.24, v: 0.14, glyphs: '.-~≈=', water: true },
  [T.SHALLOW]: { c: [0.19, 0.34, 0.42], bgK: 0.22, v: 0.16, glyphs: '.-~', water: true },
  [T.MARSH]: { c: [0.23, 0.32, 0.2], bgK: 0.22, v: 0.26, glyphs: '.,"\';', grass: true },
  [T.SAND]: { c: [0.46, 0.43, 0.34], bgK: 0.2, v: 0.18, glyphs: '.,:;' },
  [T.GRASS]: { c: [0.22, 0.46, 0.19], bgK: 0.22, v: 0.3, glyphs: ",'\"/|\\", grass: true },
  [T.MOOR]: { c: [0.4, 0.35, 0.21], bgK: 0.22, v: 0.28, glyphs: ",';|/", grass: true },
  [T.FOREST]: { c: [0.16, 0.31, 0.16], bgK: 0.22, v: 0.28, glyphs: '.,;"\'', grass: true },
  [T.ROCK]: { c: [0.42, 0.43, 0.47], bgK: 0.22, v: 0.24, glyphs: 'oO0Q8@', stone: true },
  [T.MOUNT]: { c: [0.5, 0.51, 0.56], bgK: 0.24, v: 0.22, glyphs: 'oO8Q^A#', stone: true },
  [T.ROAD]: { c: [0.48, 0.43, 0.36], bgK: 0.22, v: 0.22, glyphs: '.:oO=' },
  [T.FLOOR]: { c: [0.44, 0.44, 0.48], bgK: 0.22, v: 0.18, glyphs: '.:+=#', stone: true },
  [T.WALL]: { c: [0.62, 0.61, 0.6], bgK: 0.26, v: 0.18, glyphs: '#%&$', wall: true },
  [T.TOWER_WALL]: { c: [0.58, 0.58, 0.62], bgK: 0.26, v: 0.18, glyphs: '#%&$', wall: true },
  [T.ARCH]: { c: [0.54, 0.54, 0.58], bgK: 0.22, v: 0.15, glyphs: '.:+=' },
  [T.STAIRS]: { c: [0.52, 0.49, 0.44], bgK: 0.24, v: 0.12, glyphs: '===' },
  [T.ASH]: { c: [0.3, 0.26, 0.26], bgK: 0.22, v: 0.28, glyphs: '.,:;%' },
  [T.DIRT]: { c: [0.38, 0.31, 0.23], bgK: 0.21, v: 0.24, glyphs: '.,:;' },
  [T.RUBBLE]: { c: [0.48, 0.47, 0.46], bgK: 0.22, v: 0.26, glyphs: ',:%&o', stone: true },
  [T.GATE]: { c: [0.48, 0.54, 0.66], bgK: 0.25, v: 0.1, glyphs: 'H|' },
  [T.BRIDGE]: { c: [0.5, 0.36, 0.22], bgK: 0.24, v: 0.16, glyphs: '=|' },
  [T.CARPET]: { c: [0.62, 0.12, 0.14], bgK: 0.26, v: 0.12, glyphs: '.:=#' },
  [T.CAVE_FLOOR]: { c: [0.24, 0.24, 0.29], bgK: 0.18, v: 0.2, glyphs: '.,:o' },
};

const DENSE_CLOTH = ' .:-=+*#%@';
const DENSE_STEEL = ' .:=+*#%&$';
const DENSE_BONE = ' .,:oO0Q8@';

export class SceneRenderer {
  readonly gl: WebGLAsciiRenderer;
  readonly overlay: TextOverlay;

  private N = 0;
  private CHR!: Int32Array;
  private MAT!: Uint8Array;
  private ELEV!: Uint8Array;
  private FL!: Uint8Array; // bit 1 = water, bit 2 = object/entity, bit 4 = facade
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

  // Packed textures for WebGL2
  private outGlyphs!: Uint8Array;
  private outFg!: Uint8Array;
  private outBg!: Uint8Array;

  // View state for mouse unprojection & debug stats
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

  private putCell(x: number, y: number, code: number, r: number, g: number, b: number, e = 0, a = 1, bgScale = 0.22): void {
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
      this.EM[i] += (e - this.EM[i]) * a;
      if (a > 0.42) this.CHR[i] = code;
    }
    this.FL[i] |= 2;
  }

  private getCachedSprite(key: string, builder: () => PixelSprite): PixelSprite {
    let s = this.spriteCache.get(key);
    if (!s) {
      if (this.spriteCache.size > 180) this.spriteCache.clear();
      s = builder();
      this.spriteCache.set(key, s);
    }
    return s;
  }

  private drawPixelSprite(
    spr: PixelSprite,
    wx: number,
    wy: number,
    opts: { flip?: boolean; flash?: boolean; alpha?: number; rim?: [number, number, number]; liftCells?: number },
  ): void {
    const cols = this.gl.gridCols;
    const rows = this.gl.gridRows;
    const cx = Math.round(wx * WORLD_SCALE_X) - this.camCellX;
    const cy = Math.round(wy * WORLD_SCALE_Y) - this.camCellY + (opts.liftCells ?? 0);
    const sx0 = cx - spr.ax;
    const sy0 = cy - spr.ay;
    if (sx0 > cols + 2 || sy0 > rows + 2 || sx0 + spr.w < -2 || sy0 + spr.h < -2) return;

    const alpha = opts.alpha ?? 1;
    const flip = !!opts.flip;
    const flash = !!opts.flash;
    const rim = opts.rim;

    // 1. Elliptical ground shadow
    const shRx = Math.max(3, Math.round(spr.w * 0.36));
    const shRy = Math.max(1, Math.round(spr.w * 0.14));
    for (let dy = -shRy; dy <= shRy; dy++) {
      for (let dx = -shRx; dx <= shRx; dx++) {
        if ((dx * dx) / (shRx * shRx) + (dy * dy) / (shRy * shRy) <= 1) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) {
            const idx = gy * cols + gx;
            this.BR[idx] *= 0.55;
            this.BG[idx] *= 0.55;
            this.BB[idx] *= 0.58;
            this.BGR[idx] *= 0.45;
            this.BGG[idx] *= 0.45;
            this.BGB[idx] *= 0.48;
          }
        }
      }
    }

    // 2. 1-cell dark outline + silhouette edge detection + faction rim-light
    for (let j = 0; j < spr.h; j++) {
      for (let i = 0; i < spr.w; i++) {
        const si = j * spr.w + i;
        if (!spr.a[si]) continue;
        const dx = flip ? spr.w - 1 - i : i;
        const gx = sx0 + dx;
        const gy = sy0 + j;
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;

        // Check if on silhouette edge for dark outline & rim-light
        const leftEmpty = i === 0 || !spr.a[si - 1];
        const rightEmpty = i === spr.w - 1 || !spr.a[si + 1];
        const topEmpty = j === 0 || !spr.a[si - spr.w];
        const botEmpty = j === spr.h - 1 || !spr.a[si + spr.w];
        const isEdge = leftEmpty || rightEmpty || topEmpty || botEmpty;

        // Draw 1-cell dark outline into empty neighbor cells
        if (isEdge && alpha > 0.7) {
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
                this.BGR[ni] *= 0.25;
                this.BGG[ni] *= 0.25;
                this.BGB[ni] *= 0.3;
              }
            }
          }
        }

        let r = flash ? 1.0 : spr.r[si];
        let g = flash ? 0.95 : spr.g[si];
        let b = flash ? 0.88 : spr.b[si];
        let em = flash ? 1.0 : spr.em[si];

        // Subtle faction rim light on silhouette edge
        if (isEdge && rim && !flash) {
          r = lerp(r, rim[0], 0.28);
          g = lerp(g, rim[1], 0.28);
          b = lerp(b, rim[2], 0.28);
          em = Math.max(em, 0.22);
        }

        const lum = clamp(r * 0.3 + g * 0.59 + b * 0.11, 0.08, 1);
        const mat = spr.mat[si];
        let code: number;
        if (mat === 3) {
          code = lum > 0.7 ? 42 : 43; // * +
        } else {
          const ramp = mat === 1 ? DENSE_STEEL : mat === 2 ? DENSE_BONE : DENSE_CLOTH;
          code = ramp.charCodeAt(1 + Math.floor(lum * (ramp.length - 2)));
        }

        const idx = gy * cols + gx;
        this.putCell(gx, gy, code, r, g, b, em, alpha, 0.24);
        this.FL[idx] |= 8; // mark as entity pixel
      }
    }
  }

  private drawWorldObject(o: WorldObject, G: Game): void {
    const cx = Math.round((o.x + 0.5) * WORLD_SCALE_X) - this.camCellX;
    const cy = Math.round((o.y + 0.5) * WORLD_SCALE_Y) - this.camCellY;
    const t = G.t;
    const sway = Math.round(Math.sin(t * 1.4 + o.x * 0.7) * 0.7);

    switch (o.kind) {
      case 'pine': {
        // Tall layered conifer with wind sway
        const h = o.v < 0.35 ? 7 : o.v < 0.75 ? 9 : 11;
        for (let row = 0; row < h; row++) {
          const half = Math.max(0, Math.floor((row * 0.65) + 0.6));
          const sw = row < h - 2 ? sway : 0;
          if (row >= h - 2) {
            this.putCell(cx, cy - (h - 1 - row), 124, 0.42, 0.28, 0.16, 0, 1, 0.2);
          } else {
            for (let dx = -half; dx <= half; dx++) {
              const gx = cx + dx + sw;
              const gy = cy - (h - 1 - row);
              const ch = dx === 0 ? 94 : dx < 0 ? 47 : 92; // ^ / \
              const shade = 0.72 + 0.35 * (1 - row / h);
              this.putCell(gx, gy, ch, 0.14 * shade, 0.36 * shade, 0.2 * shade, 0, 1, 0.2);
            }
          }
        }
        break;
      }
      case 'deadtree':
      case 'burnt': {
        const burnt = o.kind === 'burnt';
        const col: [number, number, number] = burnt ? [0.24, 0.2, 0.2] : [0.46, 0.4, 0.34];
        const rows = ['\\  |  /', ' \\ | / ', '  \\|/  ', '   |   ', '   |   ', '  /|\\  '];
        for (let j = 0; j < rows.length; j++) {
          for (let i = 0; i < rows[j].length; i++) {
            const c = rows[j][i];
            if (c === ' ') continue;
            const em = burnt && hash(o.x + i, o.y + j, Math.floor(t * 3)) < 0.15 ? 0.9 : 0;
            this.putCell(cx - 3 + i, cy - (rows.length - 1 - j), c.charCodeAt(0), em ? 1 : col[0], em ? 0.38 : col[1], em ? 0.1 : col[2], em);
          }
        }
        break;
      }
      case 'shrine': {
        const lit = !!(o.id && G.flags.shrines.has(o.id));
        const rows = lit ? ['   )   ', '  (^)  ', '  /#\\  ', ' [===] ', '[=====]'] : ['       ', '   .   ', '  /#\\  ', ' [===] ', '[=====]'];
        const fl = 0.85 + 0.15 * Math.sin(t * 11 + o.x);
        for (let j = 0; j < rows.length; j++) {
          for (let i = 0; i < rows[j].length; i++) {
            const c = rows[j][i];
            if (c === ' ') continue;
            const isFire = lit && (c === '^' || c === '(' || c === ')');
            this.putCell(
              cx - 3 + i,
              cy - (rows.length - 1 - j),
              c.charCodeAt(0),
              isFire ? 1.0 * fl : 0.62,
              isFire ? 0.72 * fl : 0.6,
              isFire ? 0.3 * fl : 0.58,
              isFire ? 1.0 : 0,
            );
          }
        }
        break;
      }
      case 'brazier':
      case 'campfire': {
        const fl = 0.85 + 0.15 * Math.sin(t * 13 + o.x);
        const flame = ['^', '*', "'"][(Math.floor(t * 9 + o.x) % 3 + 3) % 3].charCodeAt(0);
        this.putCell(cx, cy - 2, flame, 1.0 * fl, 0.65 * fl, 0.2 * fl, 1.0);
        this.putCell(cx - 1, cy - 1, 92, 0.45, 0.36, 0.3, 0);
        this.putCell(cx, cy - 1, 95, 0.45, 0.36, 0.3, 0);
        this.putCell(cx + 1, cy - 1, 47, 0.45, 0.36, 0.3, 0);
        break;
      }
      case 'pillar': {
        for (let j = 0; j < 6; j++) {
          const ch = j === 0 || j === 5 ? 61 : 124; // = |
          this.putCell(cx - 1, cy - j, 91, 0.62, 0.61, 0.6, 0);
          this.putCell(cx, cy - j, ch, 0.68, 0.67, 0.65, 0);
          this.putCell(cx + 1, cy - j, 93, 0.56, 0.55, 0.55, 0);
        }
        break;
      }
      case 'signpost': {
        this.putCell(cx, cy, 124, 0.52, 0.38, 0.24, 0);
        this.putCell(cx, cy - 1, 124, 0.52, 0.38, 0.24, 0);
        this.putCell(cx - 1, cy - 2, 60, 0.72, 0.56, 0.36, 0.15);
        this.putCell(cx, cy - 2, 61, 0.72, 0.56, 0.36, 0.15);
        this.putCell(cx + 1, cy - 2, 62, 0.72, 0.56, 0.36, 0.15);
        break;
      }
      case 'chest': {
        const opened = !!(o.id && G.flags.chests.has(o.id));
        const col: [number, number, number] = opened ? [0.42, 0.36, 0.3] : [0.95, 0.76, 0.32];
        this.putCell(cx - 1, cy, 91, col[0], col[1], col[2], opened ? 0 : 0.4);
        this.putCell(cx, cy, opened ? 95 : 61, col[0], col[1], col[2], opened ? 0 : 0.5);
        this.putCell(cx + 1, cy, 93, col[0], col[1], col[2], opened ? 0 : 0.4);
        break;
      }
      case 'cave': {
        for (let dx = -2; dx <= 2; dx++) {
          this.putCell(cx + dx, cy - 2, 95, 0.5, 0.5, 0.54, 0);
          this.putCell(cx + dx, cy - 1, Math.abs(dx) === 2 ? 124 : 32, 0.08, 0.08, 0.12, 0, 1, 0.1);
          this.putCell(cx + dx, cy, Math.abs(dx) === 2 ? 124 : 32, 0.06, 0.06, 0.1, 0, 1, 0.1);
        }
        break;
      }
      case 'lore': {
        const unread = !o.id || !G.flags.lore.has(o.id);
        const pulse = unread ? 0.65 + 0.35 * Math.sin(t * 3 + o.x) : 0;
        this.putCell(cx - 1, cy - 2, 95, 0.54, 0.55, 0.6, 0);
        this.putCell(cx, cy - 2, 95, 0.54, 0.55, 0.6, 0);
        this.putCell(cx - 1, cy - 1, 124, 0.52, 0.54, 0.6, 0);
        this.putCell(cx, cy - 1, 58, unread ? 0.5 * pulse : 0.45, unread ? 0.78 * pulse : 0.48, unread ? 1.0 * pulse : 0.52, unread ? 0.9 : 0);
        this.putCell(cx + 1, cy - 1, 124, 0.52, 0.54, 0.6, 0);
        this.putCell(cx, cy, 95, 0.5, 0.5, 0.54, 0);
        break;
      }
      case 'flower': {
        // White & red wildflowers (* o .)
        const white = o.v > 0.45;
        const ch = o.v < 0.33 ? 42 : o.v < 0.66 ? 111 : 46; // * o .
        this.putCell(cx, cy, ch, white ? 0.94 : 0.88, white ? 0.94 : 0.24, white ? 0.9 : 0.24, white ? 0.22 : 0.15);
        break;
      }
      case 'reeds': {
        this.putCell(cx, cy, 124, 0.38, 0.48, 0.26, 0);
        this.putCell(cx + sway, cy - 1, sway >= 0 ? 47 : 92, 0.42, 0.52, 0.28, 0);
        break;
      }
      case 'fungus': {
        this.putCell(cx, cy, 111, 0.26, 0.9, 0.78, 0.85);
        break;
      }
      case 'vent': {
        this.putCell(cx, cy, 42, 1.0, 0.45, 0.12, 0.95);
        break;
      }
      case 'cross': {
        this.putCell(cx, cy - 2, 124, 0.56, 0.56, 0.58, 0);
        this.putCell(cx - 1, cy - 1, 45, 0.56, 0.56, 0.58, 0);
        this.putCell(cx, cy - 1, 43, 0.62, 0.62, 0.64, 0);
        this.putCell(cx + 1, cy - 1, 45, 0.56, 0.56, 0.58, 0);
        this.putCell(cx, cy, 124, 0.52, 0.52, 0.54, 0);
        break;
      }
      case 'tomb': {
        this.putCell(cx - 1, cy - 1, 46, 0.54, 0.54, 0.58, 0);
        this.putCell(cx, cy - 1, 45, 0.54, 0.54, 0.58, 0);
        this.putCell(cx + 1, cy - 1, 46, 0.54, 0.54, 0.58, 0);
        this.putCell(cx - 1, cy, 124, 0.5, 0.5, 0.54, 0);
        this.putCell(cx, cy, 43, 0.56, 0.56, 0.6, 0);
        this.putCell(cx + 1, cy, 124, 0.5, 0.5, 0.54, 0);
        break;
      }
      case 'rock': {
        this.putCell(cx - 1, cy, 40, 0.48, 0.49, 0.54, 0);
        this.putCell(cx, cy, 79, 0.54, 0.55, 0.6, 0);
        this.putCell(cx + 1, cy, 41, 0.48, 0.49, 0.54, 0);
        // Moss cap
        this.putCell(cx, cy - 1, 95, 0.28, 0.48, 0.24, 0);
        break;
      }
      case 'menhir': {
        for (let j = 0; j < 4; j++) {
          this.putCell(cx, cy - j, j === 1 ? 58 : 35, 0.52, 0.56, 0.64, j === 1 ? 0.5 : 0);
        }
        break;
      }
      case 'altar': {
        for (let dx = -2; dx <= 2; dx++) {
          this.putCell(cx + dx, cy - 1, 61, 0.54, 0.52, 0.54, 0);
          this.putCell(cx + dx, cy, 35, 0.62, 0.16, 0.18, 0.2);
        }
        break;
      }
    }
  }

  /**
   * Main frame render:
   * 1. Terrain + 2.5D Elevation Cliffs + 3/4 Building Facades + Occlusion Mask
   * 2. Blade Grass Pass (wind wave + entity collision & 1.5s trails)
   * 3. Water Reflection Pass (vertical mirror with wave distortion, moon, foam, ripples)
   * 4. Objects, Pixel-Art Entities (outline + shadow + rim-light), Telegraphs & Particles
   * 5. Lighting with ambient floor >= 0.35 & coarse shadow raymarch
   * 6. Sobel Edge + Material Glyph Composite -> WebGL2 + Bloom
   * 7. Unlit crisp TextOverlay (names, damage numbers, HP bars, lock-on, edge arrow)
   */
  render(G: Game, objs: WorldObject[], alphaInterp: number): void {
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

    // --------------------------------------------------------- 1. Terrain & 2.5D Cliffs
    for (let y = 0; y < rows; y++) {
      const cellY = this.camCellY + y;
      const wy = Math.floor(cellY / WORLD_SCALE_Y);
      const subY = ((cellY % WORLD_SCALE_Y) + WORLD_SCALE_Y) % WORLD_SCALE_Y;
      for (let x = 0; x < cols; x++) {
        const cellX = this.camCellX + x;
        const wx = Math.floor(cellX / WORLD_SCALE_X);
        const subX = ((cellX % WORLD_SCALE_X) + WORLD_SCALE_X) % WORLD_SCALE_X;

        const c = W.chunkAtCell(wx, wy);
        const ci = ((wy & 31) << 5) | (wx & 31);
        let tp = c.type[ci] as TerrainId;
        if (tp === T.GATE && G.flags.gateOpen) tp = T.FLOOR;
        const el = c.elev[ci];
        const st = TS[tp] || TS[T.GRASS];
        const hv = hash(cellX, cellY, 11);
        const i = y * cols + x;

        const m = c.shade[ci] * (1 + (hv - 0.5) * st.v);
        let r = st.c[0] * m;
        let g = st.c[1] * m;
        let b = st.c[2] * m;
        let fl = st.water ? 1 : 0;
        let code = -1;

        if (st.water) {
          const wv = Math.sin(cellX * 0.22 + cellY * 0.5 + t * 1.9) + Math.sin(cellX * 0.1 - t * 1.2 + cellY * 0.3);
          const k = 0.85 + 0.16 * wv;
          r *= k;
          g *= k;
          b *= k;
          // Shoreline foam where water touches land
          const northT = W.typeAt(wx, wy - 1);
          if (!WATERY[northT] && subY === 0) {
            r = 0.72;
            g = 0.82;
            b = 0.86;
            code = hv > 0.5 ? 126 : 45; // ~ -
          }
        } else if (tp === T.STAIRS) {
          code = subY === 0 ? 61 : 45; // = -
          r *= 1.05;
          g *= 1.05;
          b *= 1.05;
        } else if (tp === T.BRIDGE) {
          code = (cellX % 4 === 0) ? 124 : 61;
        } else if (tp === T.GATE) {
          code = (cellX & 1) ? 72 : 124;
        } else {
          // 2.5D Elevation cliff facade when south tile is lower
          const southEl = W.elevAt(wx, wy + 1);
          if (el > southEl && subY === WORLD_SCALE_Y - 1) {
            r *= 0.55;
            g *= 0.55;
            b *= 0.6;
            code = (cellX & 1) === 0 ? 124 : 93; // | ]
          } else if (el > southEl && subY === 0 && st.grass) {
            // Grass/moss overhang at cliff top
            r *= 0.9;
            g *= 1.15;
            b *= 0.85;
            code = 118; // v
          }
        }

        this.CHR[i] = code;
        this.MAT[i] = tp;
        this.ELEV[i] = el;
        this.FL[i] = fl;
        this.BR[i] = r;
        this.BG[i] = g;
        this.BB[i] = b;
        this.BGR[i] = r * st.bgK;
        this.BGG[i] = g * st.bgK;
        this.BGB[i] = b * st.bgK;
        this.EM[i] = 0;
        this.HV[i] = hv;
      }
    }

    // --------------------------------------------------------- 2. 2.5D Building Facades & Archways
    for (let y = 0; y < rows; y++) {
      const cellY = this.camCellY + y;
      const wy = Math.floor(cellY / WORLD_SCALE_Y);
      const subY = ((cellY % WORLD_SCALE_Y) + WORLD_SCALE_Y) % WORLD_SCALE_Y;
      if (subY !== WORLD_SCALE_Y - 1) continue;
      for (let x = 0; x < cols; x++) {
        const cellX = this.camCellX + x;
        const wx = Math.floor(cellX / WORLD_SCALE_X);
        const tp = W.typeAt(wx, wy);
        if (tp !== T.WALL && tp !== T.TOWER_WALL && tp !== T.ARCH) continue;

        const facadeH = tp === T.TOWER_WALL ? 7 : 5;
        const isArch = tp === T.ARCH;
        for (let fh = 1; fh <= facadeH; fh++) {
          // Leave bottom 3 cells of archway open so characters walk through!
          if (isArch && fh <= 3) continue;
          const fy = y - fh;
          if (fy < 0 || fy >= rows) continue;

          // Circular occlusion mask if player is behind this facade
          let occAlpha = 1.0;
          if (G.mode === 'play' && !G.player.dead && y > playerCellY) {
            const od = Math.hypot((x - playerCellX) * 0.6, fy - (playerCellY - 6));
            if (od < 10) occAlpha = 0.28;
          }

          const hv = hash(cellX, cellY - fh, 71);
          const topCap = fh === facadeH;
          const isVine = !topCap && hv < 0.08 && fh > 2;
          let r = topCap ? 0.66 : 0.48;
          let g = topCap ? 0.65 : 0.47;
          let b = topCap ? 0.66 : 0.5;
          let ch = topCap ? 61 : (fh % 2 === 0 ? 35 : 37); // = # %
          if (isVine) {
            r = 0.24;
            g = 0.52;
            b = 0.24;
            ch = 124; // hanging vine |
          } else if (topCap && hv < 0.18) {
            // Moss on wall crown
            r = 0.28;
            g = 0.5;
            b = 0.24;
            ch = 34; // "
          }
          this.putCell(x, fy, ch, r, g, b, 0, occAlpha, 0.26);
          this.FL[fy * cols + x] |= 4;
        }
      }
    }

    // --------------------------------------------------------- 3. Blade Grass System (wind + collision)
    const grassEntities: { x: number; y: number }[] = [];
    if (G.mode === 'play' && !G.player.dead) grassEntities.push({ x: pxInterp, y: pyInterp });
    for (const e of G.enemies) grassEntities.push({ x: e.x, y: e.y });
    for (const n of G.npcs) grassEntities.push({ x: n.x, y: n.y });

    const grassStep = G.options.grassDensity >= 0.9 ? 1 : 2;
    const grassShades: [number, number, number][] = [
      [0.18, 0.42, 0.16],
      [0.24, 0.5, 0.19],
      [0.29, 0.56, 0.22],
      [0.16, 0.36, 0.15],
      [0.34, 0.52, 0.2],
      [0.22, 0.46, 0.22],
    ];

    for (let y = 2; y < rows; y += grassStep) {
      const cellY = this.camCellY + y;
      const wy = cellY / WORLD_SCALE_Y;
      for (let x = 0; x < cols; x += grassStep) {
        const i = y * cols + x;
        const mat = this.MAT[i];
        if (mat !== T.GRASS && mat !== T.MOOR && mat !== T.MARSH) continue;
        if (this.FL[i] & 4) continue;
        const hv = this.HV[i];
        if (hv > 0.52) continue;

        const cellX = this.camCellX + x;
        const wx = cellX / WORLD_SCALE_X;
        const wind = (noise(wx * 0.08 - t * (0.7 + G.weather.wind * 1.4), wy * 0.12 + t * 0.15, 5) - 0.45) * 1.8;
        const disp = G.grassField.sampleDisplacement(wx, wy, grassEntities);
        const tilt = wind + disp;

        const len = hv < 0.18 ? 3 : 2;
        const palIdx = Math.floor(hv * 19) % grassShades.length;
        const baseCol = grassShades[palIdx];
        const moorTint = mat === T.MOOR ? 1.35 : 1.0;

        for (let b = 0; b < len; b++) {
          const bx = x + Math.round(tilt * (b * 0.55));
          const by = y - b;
          if (bx < 0 || by < 0 || bx >= cols || by >= rows) continue;
          const bi = by * cols + bx;
          if (this.FL[bi] & 4) continue;
          const ch = tilt < -0.35 ? 92 : tilt > 0.35 ? 47 : 124; // \ / |
          const tipBoost = 0.88 + b * 0.14;
          this.CHR[bi] = ch;
          this.BR[bi] = baseCol[0] * moorTint * tipBoost;
          this.BG[bi] = baseCol[1] * tipBoost;
          this.BB[bi] = baseCol[2] * tipBoost;
        }
      }
    }

    // --------------------------------------------------------- 4. Decals
    for (const d of G.decals.values()) {
      const gx = Math.round(d.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(d.y * WORLD_SCALE_Y) - this.camCellY;
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      const a = Math.min(1, d.life / 20) * 0.82;
      this.putCell(gx, gy, d.code, d.r, d.g, d.b, 0, a);
    }

    // --------------------------------------------------------- 5. Water Reflection Pass & Ripples
    // Reflect facades, trees & moon into water cells with wave distortion
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!(this.FL[i] & 1)) continue;
        // Look upward across shoreline for reflections of walls/trees
        const waveShift = Math.round(Math.sin(t * 2.4 + y * 0.45 + x * 0.08) * 1.1);
        for (let distY = 1; distY <= 12; distY++) {
          const sy = y - distY;
          if (sy < 0) break;
          const si = sy * cols + clamp(x + waveShift, 0, cols - 1);
          if (!(this.FL[si] & 1)) {
            // Found shoreline; mirror pixel above shoreline
            const mirrorY = sy - distY;
            if (mirrorY >= 0) {
              const mi = mirrorY * cols + clamp(x + waveShift, 0, cols - 1);
              if (this.FL[mi] & (2 | 4)) {
                this.BR[i] = this.BR[i] * 0.5 + this.BR[mi] * 0.42;
                this.BG[i] = this.BG[i] * 0.5 + this.BG[mi] * 0.46;
                this.BB[i] = this.BB[i] * 0.45 + this.BB[mi] * 0.56;
                this.CHR[i] = this.CHR[mi] > 0 ? this.CHR[mi] : 126;
              }
            }
            break;
          }
        }
        // Subtle moon glint on deep/open water at night
        if (G.night > 0.35 && this.HV[i] > 0.985 && Math.sin(t * 3 + x + y) > 0.4) {
          this.CHR[i] = 183; // ·
          this.BR[i] = 0.78;
          this.BG[i] = 0.86;
          this.BB[i] = 1.0;
          this.EM[i] = 0.65;
        }
      }
    }

    // Shallow-water expanding ring ripples
    for (const rp of G.grassField.ripples) {
      const k = rp.age / rp.maxAge;
      const rad = 1 + k * 4.5;
      const fade = 1 - k;
      const steps = 16;
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TAU;
        const gx = Math.round((rp.x + Math.cos(a) * rad * 0.5) * WORLD_SCALE_X) - this.camCellX;
        const gy = Math.round((rp.y + (Math.sin(a) * rad * 0.5) / ASP) * WORLD_SCALE_Y) - this.camCellY;
        if (gx >= 0 && gy >= 0 && gx < cols && gy < rows && (this.FL[gy * cols + gx] & 1)) {
          this.putCell(gx, gy, 126, 0.7 * fade, 0.85 * fade, 0.95 * fade, 0.25 * fade, fade * 0.8);
        }
      }
    }

    // --------------------------------------------------------- 6. Telegraphs (filled cones & circles)
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
            let diff = ((ang - tg.angle + Math.PI * 3) % TAU) - Math.PI;
            if (Math.abs(diff) > tg.arc * 0.5) continue;
          }
          const isFill = nd <= tg.rad * (0.2 + 0.8 * k);
          const isBorder = nd >= tg.rad - 0.65;
          if (isFill || isBorder) {
            this.putCell(
              cx + dx,
              cy + dy,
              isBorder ? 58 : 46,
              tg.col[0],
              tg.col[1] * 0.45,
              tg.col[2] * 0.4,
              isBorder ? 0.9 : 0.45,
              isBorder ? 0.85 : 0.35 + k * 0.3,
            );
          }
        }
      }
    }

    // --------------------------------------------------------- 7. Y-Sorted Drawables (Objects & Pixel-Art Figures)
    type DrawItem = {
      y: number;
      x: number;
      o?: WorldObject;
      e?: EnemyEntity;
      n?: NpcEntity;
      isPlayer?: boolean;
      pk?: { x: number; y: number; amount: number };
    };
    const drawables: DrawItem[] = [];
    for (const o of objs) drawables.push({ y: o.y, x: o.x, o });
    for (const e of G.enemies) drawables.push({ y: e.y, x: e.x, e });
    for (const n of G.npcs) drawables.push({ y: n.y, x: n.x, n });
    for (const pk of G.pickups) drawables.push({ y: pk.y, x: pk.x, pk });
    if (G.mode !== 'title' && !G.player.dead) {
      drawables.push({ y: pyInterp, x: pxInterp, isPlayer: true });
    }
    drawables.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const d of drawables) {
      if (d.o) {
        this.drawWorldObject(d.o, G);
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
        const frame = pose === 'walk' ? Math.floor(p.walkT * 9) % 6 : Math.floor(t * 2.5) % 2;
        const spr = this.getCachedSprite(`pl:${armor.id}:${weapon.id}:${pose}:${frame}`, () =>
          buildKnightSprite(armor, weapon, pose, frame, 1),
        );
        this.drawPixelSprite(spr, pxInterp, pyInterp, {
          flip: p.face < 0,
          flash: p.hurtT > 0.2,
          rim: p.shieldT > 0 ? [0.55, 0.88, 1.0] : [1.0, 0.82, 0.45],
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
        this.drawPixelSprite(spr, ex, ey, {
          flip: e.face < 0,
          flash: e.flash > 0 || teleFlash,
          alpha: e.float ? 0.86 : 1,
          rim: e.state === 'stagger' ? [1.0, 0.88, 0.35] : [1.0, 0.32, 0.28],
          liftCells: lift,
        });
      } else if (d.n) {
        const npc = d.n;
        const frame = Math.floor(t * 2) % 2;
        const spr = this.getCachedSprite(`npc:${npc.kind}:${frame}`, () => buildCreatureSprite(npc.kind, 'idle', frame));
        this.drawPixelSprite(spr, npc.x, npc.y, {
          flip: pxInterp < npc.x,
          rim: [1.0, 0.84, 0.48],
        });
      } else if (d.pk) {
        const s = 0.72 + 0.28 * Math.sin(t * 5);
        const gx = Math.round(d.pk.x * WORLD_SCALE_X) - this.camCellX;
        const gy = Math.round(d.pk.y * WORLD_SCALE_Y) - this.camCellY;
        this.putCell(gx, gy, 42, 1 * s, 0.78 * s, 0.3 * s, 1);
        this.putCell(gx, gy - 1, 39, 1 * s, 0.65 * s, 0.2 * s, 1, 0.7);
      }
    }

    // --------------------------------------------------------- 8. Particles, Projectiles, Rain, Fireflies
    for (const q of G.particles) {
      if (q.delay > 0) continue;
      const a = q.fade ? Math.min(1, (q.life / q.max) * 1.5) : 1;
      const gx = Math.round(q.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(q.y * WORLD_SCALE_Y) - this.camCellY;
      this.putCell(gx, gy, q.code, q.r * a, q.g * a, q.b * a, q.e, a);
    }
    for (const q of G.projectiles) {
      const gx = Math.round(q.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(q.y * WORLD_SCALE_Y) - this.camCellY;
      this.putCell(gx, gy, 111, q.col[0], q.col[1], q.col[2], 1);
    }
    const rc = G.weather.wind > 0.5 ? 47 : 124;
    for (const d of G.rain) {
      const gx = Math.round(d.x * WORLD_SCALE_X) - this.camCellX;
      const gy = Math.round(d.y * WORLD_SCALE_Y) - this.camCellY;
      if (d.ash) {
        this.putCell(gx, gy, d.life % 0.4 < 0.2 ? 46 : 39, 0.6, 0.54, 0.5, 0.3, 0.75);
      } else {
        this.putCell(gx, gy, rc, 0.55, 0.62, 0.76, 0.2, 0.65);
      }
    }
    for (const f of G.fireflies) {
      if (!f.ok) continue;
      const s = 0.5 + 0.5 * Math.sin(t * 3 + f.ph);
      if (s > 0.2) {
        const gx = Math.round(f.x * WORLD_SCALE_X) - this.camCellX;
        const gy = Math.round(f.y * WORLD_SCALE_Y) - this.camCellY;
        this.putCell(gx, gy, 183, 0.75 * s, 1.0 * s, 0.4 * s, 1);
      }
    }

    // --------------------------------------------------------- 9. Lighting + Coarse Shadows
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

          // Coarse 3-step shadow raymarch for fire/shrine lights
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

    // --------------------------------------------------------- 10. Image->ASCII Sobel & Material Composite
    const gIndex = this.gl.atlas.index;
    const fogA = G.weather.fog * 0.55; // Fog reduces contrast, never blinds
    const fc = G.fogColor;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const e = this.EM[i];
        const lr = this.LR[i] * (1 - e) + e;
        const lg = this.LG[i] * (1 - e) + e;
        const lb = this.LB[i] * (1 - e) + e;

        let r = this.BR[i] * lr;
        let g = this.BG[i] * lg;
        let b = this.BB[i] * lb;

        let bgr = this.BGR[i] * lr;
        let bgg = this.BGG[i] * lg;
        let bgb = this.BGB[i] * lb;

        if (fogA > 0.02) {
          const fo = fogA * (1 - e * 0.75) * clamp(noise((this.camCellX + x) * 0.03 + t * 0.18, (this.camCellY + y) * 0.05, 9), 0, 1);
          const fl = (amb[0] + amb[1] + amb[2]) * 0.33 + 0.12;
          r = lerp(r, fc[0] * fl, fo);
          g = lerp(g, fc[1] * fl, fo);
          b = lerp(b, fc[2] * fl, fo);
          bgr = lerp(bgr, fc[0] * fl * 0.3, fo);
          bgg = lerp(bgg, fc[1] * fl * 0.3, fo);
          bgb = lerp(bgb, fc[2] * fl * 0.3, fo);
        }

        let code = this.CHR[i];
        if (code === -1) {
          // Sobel-like edge detection on elevation / material transitions for "painted" look
          const elC = this.ELEV[i];
          const elL = x > 0 ? this.ELEV[i - 1] : elC;
          const elR = x < cols - 1 ? this.ELEV[i + 1] : elC;
          const elU = y > 0 ? this.ELEV[i - cols] : elC;
          const elD = y < rows - 1 ? this.ELEV[i + cols] : elC;
          const gx = elR - elL;
          const gy = elD - elU;
          if (gx !== 0 || gy !== 0) {
            if (Math.abs(gx) > Math.abs(gy)) code = 124; // |
            else if (Math.abs(gy) > Math.abs(gx)) code = 45; // -
            else code = gx * gy > 0 ? 92 : 47; // \ or /
          } else {
            const st = TS[this.MAT[i]] || TS[T.GRASS];
            const lum = clamp(r * 0.3 + g * 0.59 + b * 0.11, 0, 0.999);
            const gIdx = Math.floor(lum * st.glyphs.length);
            code = st.glyphs.charCodeAt(clamp(gIdx + (this.HV[i] > 0.65 ? 1 : 0), 0, st.glyphs.length - 1));
          }
        }

        const gid = code > 0 && code < 65536 ? gIndex[code] : 0;
        this.outGlyphs[i] = gid;

        const o = i * 4;
        this.outFg[o] = clamp(Math.round(r * 255), 0, 255);
        this.outFg[o + 1] = clamp(Math.round(g * 255), 0, 255);
        this.outFg[o + 2] = clamp(Math.round(b * 255), 0, 255);
        this.outFg[o + 3] = clamp(Math.round(e * 255), 0, 255);

        // Background color floor so no harsh pure black gaps appear outdoors
        this.outBg[o] = clamp(Math.round(Math.max(0.03, bgr) * 255), 0, 255);
        this.outBg[o + 1] = clamp(Math.round(Math.max(0.035, bgg) * 255), 0, 255);
        this.outBg[o + 2] = clamp(Math.round(Math.max(0.05, bgb) * 255), 0, 255);
        this.outBg[o + 3] = 255;
      }
    }

    // Submit to WebGL2 fullscreen-quad + GPU bloom
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
      // Player nameplate
      if (!G.player.dead) {
        labels.push({
          wx: pxInterp,
          wy: pyInterp - 12.2,
          text: `Wanderer · St. ${G.player.lvl}`,
          color: '#f2e6cf',
          size: 12,
        });
      }

      // NPC nameplates
      for (const n of G.npcs) {
        if (Math.abs(n.x - pxInterp) < 28 && Math.abs(n.y - pyInterp) < 18) {
          labels.push({ wx: n.x, wy: n.y - 10.5, text: n.name, color: '#ffd98a', size: 12 });
        }
      }

      // Nearby signpost labels
      for (const sp of W.signposts) {
        if (Math.abs(sp.x - pxInterp) < 16 && Math.abs(sp.y - pyInterp) < 10) {
          labels.push({ wx: sp.x + 0.5, wy: sp.y - 2.6, text: sp.text, color: '#d8cbb4', size: 12 });
        }
      }

      // Enemy HP/Poise bars & lock-on
      for (const e of G.enemies) {
        const isLocked = G.lockedTarget === e;
        if (isLocked) lockTarget = { wx: e.x, wy: e.y - 3.5 };
        if (!e.boss && (e.hp < e.maxHp || isLocked || e.state === 'stagger')) {
          bars.push({
            wx: e.x,
            wy: e.y - 11,
            ratio: e.hp / e.maxHp,
            poiseRatio: e.poise / e.maxPoise,
            widthPx: 54,
            color: e.state === 'stagger' ? '#ffbe4f' : '#d6453d',
            name: isLocked ? e.d.name : undefined,
            locked: isLocked,
          });
        }
      }

      // Floating damage & status numbers
      for (const f of G.floaters) {
        const k = f.life / f.max;
        labels.push({
          wx: f.x,
          wy: f.y - (1 - k) * 3.5,
          text: f.text,
          color: f.color,
          size: f.bold ? 15 : 13,
          bold: f.bold,
          alpha: clamp(k * 1.6, 0, 1),
        });
      }

      // Off-screen quest edge arrow
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
