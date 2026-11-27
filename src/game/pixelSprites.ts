import { clamp, hash } from '../engine/util.ts';
import type { ArmorDef, WeaponDef } from './types.ts';

/**
 * Unified high-resolution procedural PixelSprite used for BOTH characters and world props.
 * Every sprite shares the same lighting direction (top-left key light), shading smoothness,
 * and consistent human-scale proportions (12x18 cells = 1 human height).
 */
export interface PixelSprite {
  w: number;
  h: number;
  ax: number; // anchor X (centre)
  ay: number; // anchor Y (feet / base)
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Uint8Array; // 0 = transparent, 1 = opaque
  em: Float32Array; // 0..1 emissive
  mat: Uint8Array; // 0 = cloth/skin, 1 = steel/armor, 2 = bone/stone, 3 = glow/fire, 4 = foliage/wood
  glyph?: Int16Array; // optional explicit glyph override (0 = auto from material & luminance)
}

function makeSprite(w: number, h: number, ax?: number, ay?: number): PixelSprite {
  const n = w * h;
  return {
    w,
    h,
    ax: ax ?? (w >> 1),
    ay: ay ?? h - 1,
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    a: new Uint8Array(n),
    em: new Float32Array(n),
    mat: new Uint8Array(n),
  };
}

function setPx(
  s: PixelSprite,
  x: number,
  y: number,
  col: readonly [number, number, number],
  shade = 1,
  mat = 0,
  em = 0,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= s.w || iy >= s.h) return;
  const i = iy * s.w + ix;
  s.r[i] = clamp(col[0] * shade, 0, 1.4);
  s.g[i] = clamp(col[1] * shade, 0, 1.4);
  s.b[i] = clamp(col[2] * shade, 0, 1.4);
  s.a[i] = 1;
  s.em[i] = em;
  s.mat[i] = mat;
}

/** Smoothly shaded rectangle with top-left directional key light & subtle cylindrical curvature. */
function fillRect(
  s: PixelSprite,
  x0: number,
  y0: number,
  w: number,
  h: number,
  col: readonly [number, number, number],
  mat = 0,
  em = 0,
  grad = true,
): void {
  for (let j = 0; j < h; j++) {
    const ny = h > 1 ? j / (h - 1) : 0.5;
    for (let i = 0; i < w; i++) {
      const nx = w > 1 ? (i / (w - 1)) * 2 - 1 : 0; // -1..1
      const cyl = Math.sqrt(Math.max(0.15, 1 - nx * nx * 0.65));
      const key = 1.0 - nx * 0.16 - ny * 0.2;
      const sh = grad ? clamp(0.68 + 0.42 * cyl * key, 0.52, 1.18) : 1;
      setPx(s, x0 + i, y0 + j, col, sh, mat, em);
    }
  }
}

/** Smoothly shaded 3D-like ellipsoid with top-left directional highlight. */
function fillEllipse(
  s: PixelSprite,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  col: readonly [number, number, number],
  mat = 0,
  em = 0,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / Math.max(0.5, rx);
      const ny = (y - cy) / Math.max(0.5, ry);
      const d2 = nx * nx + ny * ny;
      if (d2 <= 1) {
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        // Lambertian shading from top-left (-0.4, -0.5, 0.76)
        const ndl = clamp(-nx * 0.35 - ny * 0.42 + nz * 0.78, 0, 1);
        const sh = 0.55 + 0.62 * ndl;
        setPx(s, x, y, col, sh, mat, em);
      }
    }
  }
}

function fillTriangle(
  s: PixelSprite,
  cx: number,
  topY: number,
  halfW: number,
  height: number,
  col: readonly [number, number, number],
  mat = 4,
  seed = 1,
): void {
  for (let row = 0; row < height; row++) {
    const t = row / Math.max(1, height - 1);
    const hw = Math.round(t * halfW);
    for (let dx = -hw; dx <= hw; dx++) {
      const nx = hw > 0 ? dx / hw : 0;
      const tex = (hash(dx + 50, row + seed * 17, 31) - 0.5) * 0.1;
      const sh = clamp(0.68 + (1 - t) * 0.24 - nx * 0.18 + tex, 0.48, 1.15);
      setPx(s, cx + dx, topY + row, col, sh, mat, 0);
    }
  }
}

function drawLine(
  s: PixelSprite,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  col: readonly [number, number, number],
  thickness = 1,
  mat = 3,
  em = 0.85,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let oy = 0; oy < thickness; oy++) {
      for (let ox = 0; ox < thickness; ox++) {
        setPx(s, x + ox, y + oy, col, 1, mat, em);
      }
    }
  }
}

export type AnimPose = 'idle' | 'walk' | 'attack1' | 'attack2' | 'attack3' | 'roll' | 'drink' | 'parry';

/**
 * Player Knight (14x19 cells) — clean, uniform human scale matching NPCs, enemies, walls, and trees.
 */
export function buildKnightSprite(
  armor: ArmorDef,
  weapon: WeaponDef,
  pose: AnimPose,
  frame: number,
): PixelSprite {
  const s = makeSprite(14, 19, 7, 18);

  const steel = armor.steelColor;
  const cloak = armor.cloakColor;
  const trim = armor.trimColor;
  const dark: [number, number, number] = [0.24, 0.24, 0.28];
  const visor: [number, number, number] = [1.0, 0.8, 0.36];

  if (pose === 'roll') {
    fillEllipse(s, 7, 13, 3.8, 3.4, cloak, 0, 0);
    fillEllipse(s, 7, 12, 2.5, 2.2, steel, 1, 0);
    return s;
  }

  const bob = pose === 'idle' ? (frame % 2 === 1 ? 1 : 0) : pose === 'walk' ? (frame % 2 === 0 ? -1 : 0) : 0;
  const stride = pose === 'walk' ? Math.round(Math.sin(frame * 1.1) * 1.6) : 0;
  const cloakSway = pose === 'walk' ? -1 - (frame % 2) : 0;

  // Cloak silhouette
  fillRect(s, 3 + cloakSway, 7 + bob, 6, 8, cloak, 0, 0);
  fillRect(s, 2 + cloakSway, 10 + bob, 3, 6, cloak, 0, 0);

  // Legs / greaves
  fillRect(s, 5 - Math.max(0, stride), 13, 2, 5, dark, 1, 0);
  fillRect(s, 7 + Math.max(0, stride), 13, 2, 5, steel, 1, 0);

  // Breastplate + belt trim + pauldrons
  fillRect(s, 4, 6 + bob, 6, 7, steel, 1, 0);
  fillRect(s, 4, 11 + bob, 6, 1, trim, 1, 0.15);
  fillEllipse(s, 4, 7 + bob, 1.8, 1.5, steel, 1, 0);
  fillEllipse(s, 10, 7 + bob, 1.8, 1.5, steel, 1, 0);

  // Helmet + plume + glowing visor
  fillEllipse(s, 7, 4 + bob, 2.2, 2.4, steel, 1, 0);
  fillRect(s, 6, 1 + bob, 2, 1, cloak, 0, 0);
  fillRect(s, 6, 4 + bob, 3, 1, visor, 3, 0.9);

  // Weapon
  const blade = weapon.glowColor;
  if (pose === 'drink') {
    fillRect(s, 9, 6 + bob, 2, 2, [1.0, 0.68, 0.2], 3, 0.95);
  } else if (pose === 'parry') {
    drawLine(s, 10, 4, 11, 13, [0.88, 0.96, 1.0], 2, 3, 1.0);
  } else if (pose === 'attack1' || pose === 'attack2' || pose === 'attack3') {
    const ext = weapon.kind === 'spear' ? 5 : weapon.kind === 'greatsword' ? 4 : 3;
    const yEnd = pose === 'attack2' ? 5 : pose === 'attack3' ? 12 : 8;
    drawLine(s, 9, 9 + bob, 9 + ext, yEnd, blade, weapon.kind === 'greatsword' ? 2 : 1, 3, 0.95);
  } else {
    const len = weapon.kind === 'spear' ? 9 : weapon.kind === 'greatsword' ? 8 : 7;
    drawLine(s, 11, 10 + bob, 12, Math.max(1, 10 + bob - len), blade, 1, 3, 0.72);
  }

  return s;
}

/**
 * Enemies, NPCs & Bosses in consistent proportion to the 14x19 Player Knight:
 * - Humanoids (NPCs, Skeleton, Wraith, Specter, Bogwitch): 14x19
 * - Smaller beasts (Ghoul 13x15, Wolf 15x11)
 * - Bosses (Vael, Matron, Corvus: 22x30; Pale Bishop: 26x35)
 */
export function buildCreatureSprite(kind: string, pose: 'idle' | 'walk' | 'attack', frame: number): PixelSprite {
  const bob = frame % 2 === 1 ? 1 : 0;
  const atk = pose === 'attack';

  switch (kind) {
    case 'skeleton': {
      const s = makeSprite(14, 19, 7, 18);
      const bone: [number, number, number] = [0.94, 0.9, 0.78];
      const rust: [number, number, number] = [0.56, 0.44, 0.36];
      const eye: [number, number, number] = [0.35, 0.85, 1.0];
      fillEllipse(s, 7, 4 + bob, 2.2, 2.3, bone, 2, 0);
      setPx(s, 6, 4 + bob, eye, 1, 3, 1);
      setPx(s, 8, 4 + bob, eye, 1, 3, 1);
      fillRect(s, 5, 7 + bob, 4, 6, bone, 2, 0);
      setPx(s, 6, 9 + bob, [0.16, 0.15, 0.18], 1, 0, 0);
      setPx(s, 8, 9 + bob, [0.16, 0.15, 0.18], 1, 0, 0);
      fillRect(s, 5, 13, 1, 5, bone, 2, 0);
      fillRect(s, 8, 13, 1, 5, bone, 2, 0);
      fillRect(s, 3, 8 + bob, 2, 5, rust, 1, 0);
      drawLine(s, 10, 9 + bob, atk ? 13 : 11, atk ? 9 : 3, [0.8, 0.82, 0.88], 1, 1, atk ? 0.6 : 0.1);
      return s;
    }

    case 'ghoul': {
      const s = makeSprite(13, 15, 6, 14);
      const skin: [number, number, number] = [0.56, 0.62, 0.46];
      const rag: [number, number, number] = [0.38, 0.32, 0.28];
      fillEllipse(s, 7, 4 + bob, 2.3, 2.1, skin, 0, 0);
      setPx(s, 8, 4 + bob, [1.0, 0.25, 0.12], 1, 3, 1);
      fillEllipse(s, 6, 8 + bob, 3.0, 2.8, rag, 0, 0);
      fillRect(s, 4, 11, 2, 3, skin, 0, 0);
      fillRect(s, 7, 11, 2, 3, skin, 0, 0);
      if (atk) drawLine(s, 8, 7, 12, 6, [0.95, 0.35, 0.25], 1, 3, 0.8);
      return s;
    }

    case 'wolf': {
      const s = makeSprite(15, 11, 7, 10);
      const fur: [number, number, number] = [0.58, 0.56, 0.62];
      const ember: [number, number, number] = [1.0, 0.62, 0.18];
      fillEllipse(s, 7, 5 + bob, 4.2, 2.2, fur, 0, 0);
      fillEllipse(s, 11, 3 + bob, 2.0, 1.6, fur, 0, 0);
      setPx(s, 12, 3 + bob, ember, 1, 3, 1);
      fillRect(s, 4, 7, 1, 3, fur, 0, 0);
      fillRect(s, 9, 7, 1, 3, fur, 0, 0);
      drawLine(s, 2, 5 + bob, 0, 3 + bob, fur, 1, 0, 0);
      return s;
    }

    case 'wraith': {
      const s = makeSprite(14, 19, 7, 18);
      const mist: [number, number, number] = [0.42, 0.68, 1.0];
      const core: [number, number, number] = [0.8, 0.95, 1.0];
      fillEllipse(s, 7, 4 + bob, 2.6, 2.8, mist, 0, 0.45);
      fillRect(s, 4, 7 + bob, 6, 8, mist, 0, 0.35);
      setPx(s, 6, 4 + bob, core, 1, 3, 1);
      setPx(s, 8, 4 + bob, core, 1, 3, 1);
      drawLine(s, 5, 15, 4 + bob, 18, mist, 1, 0, 0.3);
      drawLine(s, 9, 15, 10 - bob, 18, mist, 1, 0, 0.3);
      return s;
    }

    case 'specter': {
      const s = makeSprite(14, 19, 7, 18);
      const armor: [number, number, number] = [0.48, 0.56, 0.74];
      const cloak: [number, number, number] = [0.28, 0.38, 0.64];
      const blade: [number, number, number] = [0.55, 0.9, 1.0];
      fillRect(s, 3, 7 + bob, 8, 10, cloak, 0, 0.18);
      fillRect(s, 4, 6 + bob, 6, 8, armor, 1, 0.2);
      fillEllipse(s, 7, 4 + bob, 2.3, 2.4, armor, 1, 0.25);
      fillRect(s, 6, 4 + bob, 3, 1, blade, 3, 1.0);
      drawLine(s, 11, 9 + bob, atk ? 13 : 12, atk ? 9 : 2, blade, 1, 3, 0.9);
      return s;
    }

    case 'bogwitch': {
      const s = makeSprite(14, 19, 7, 18);
      const robe: [number, number, number] = [0.26, 0.48, 0.36];
      const glow: [number, number, number] = [0.45, 1.0, 0.68];
      fillTriangle(s, 7, 0 + bob, 3, 4, robe, 0, 2);
      fillRect(s, 3, 4 + bob, 8, 1, robe, 0, 0);
      fillRect(s, 5, 5 + bob, 4, 3, [0.55, 0.65, 0.56], 0, 0);
      setPx(s, 6, 6 + bob, glow, 1, 3, 1);
      setPx(s, 8, 6 + bob, glow, 1, 3, 1);
      fillRect(s, 4, 8 + bob, 6, 10, robe, 0, 0);
      drawLine(s, 11, 5 + bob, 11, 17, [0.48, 0.36, 0.24], 1, 4, 0);
      fillEllipse(s, 11, 4 + bob, 1.2, 1.2, glow, 3, 1.0);
      return s;
    }

    case 'wight': {
      const s = makeSprite(22, 30, 11, 29);
      const bone: [number, number, number] = [0.95, 0.9, 0.78];
      const gold: [number, number, number] = [0.95, 0.76, 0.32];
      const cloak: [number, number, number] = [0.46, 0.14, 0.16];
      const eye: [number, number, number] = [1.0, 0.25, 0.18];
      fillRect(s, 4, 10 + bob, 14, 17, cloak, 0, 0);
      fillRect(s, 7, 10 + bob, 8, 11, bone, 2, 0);
      fillRect(s, 7, 2 + bob, 8, 3, gold, 1, 0.35);
      fillEllipse(s, 11, 6 + bob, 3.6, 3.3, bone, 2, 0);
      fillRect(s, 9, 6 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 12, 6 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 8, 21, 2, 8, bone, 2, 0);
      fillRect(s, 12, 21, 2, 8, bone, 2, 0);
      drawLine(s, 17, 14 + bob, atk ? 21 : 19, atk ? 13 : 2, [1.0, 0.35, 0.22], 2, 3, 0.95);
      return s;
    }

    case 'matron': {
      const s = makeSprite(22, 30, 11, 29);
      const veil: [number, number, number] = [0.24, 0.66, 0.58];
      const glow: [number, number, number] = [0.55, 1.0, 0.85];
      fillEllipse(s, 11, 7 + bob, 4.4, 4.8, veil, 0, 0.35);
      fillRect(s, 5, 11 + bob, 12, 16, veil, 0, 0.28);
      fillRect(s, 9, 6 + bob, 2, 1, glow, 3, 1.0);
      fillRect(s, 12, 6 + bob, 2, 1, glow, 3, 1.0);
      if (atk) {
        fillEllipse(s, 3, 13, 2, 2, glow, 3, 1.0);
        fillEllipse(s, 19, 13, 2, 2, glow, 3, 1.0);
      }
      return s;
    }

    case 'corvus': {
      const s = makeSprite(22, 30, 11, 29);
      const iron: [number, number, number] = [0.44, 0.4, 0.4];
      const ember: [number, number, number] = [1.0, 0.48, 0.14];
      const cloak: [number, number, number] = [0.68, 0.22, 0.08];
      fillRect(s, 4, 10 + bob, 14, 17, cloak, 0, 0.1);
      fillRect(s, 6, 9 + bob, 10, 12, iron, 1, 0);
      fillEllipse(s, 11, 5 + bob, 3.6, 3.8, iron, 1, 0);
      fillRect(s, 9, 5 + bob, 5, 2, ember, 3, 1.0);
      fillRect(s, 7, 21, 3, 8, iron, 1, 0);
      fillRect(s, 12, 21, 3, 8, iron, 1, 0);
      drawLine(s, 17, 14 + bob, atk ? 21 : 19, atk ? 15 : 1, ember, 2, 3, 1.0);
      return s;
    }

    case 'bishop': {
      const s = makeSprite(26, 35, 13, 34);
      const crimson: [number, number, number] = [0.68, 0.1, 0.14];
      const pale: [number, number, number] = [0.92, 0.9, 0.85];
      const gold: [number, number, number] = [0.98, 0.82, 0.36];
      const eye: [number, number, number] = [1.0, 0.22, 0.26];
      fillTriangle(s, 13, 1 + bob, 4, 7, gold, 1, 3);
      fillEllipse(s, 13, 10 + bob, 3.6, 3.6, pale, 0, 0.15);
      fillRect(s, 10, 10 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 14, 10 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 6, 14 + bob, 14, 19, crimson, 0, 0.1);
      fillRect(s, 10, 14 + bob, 6, 18, gold, 1, 0.25);
      drawLine(s, 21, 6 + bob, 21, 33, gold, 2, 1, 0.35);
      fillEllipse(s, 21, 5 + bob, 2.4, 2.4, [1.0, 0.88, 0.45], 3, 1.0);
      return s;
    }

    case 'maren':
    case 'smith':
    case 'merchant':
    default: {
      const s = makeSprite(14, 19, 7, 18);
      const cloak: [number, number, number] =
        kind === 'maren'
          ? [0.36, 0.38, 0.54]
          : kind === 'smith'
            ? [0.64, 0.32, 0.18]
            : [0.32, 0.54, 0.44];
      const hood: [number, number, number] = [0.8, 0.76, 0.68];
      fillEllipse(s, 7, 4 + bob, 2.3, 2.5, cloak, 0, 0);
      fillRect(s, 6, 4 + bob, 3, 2, hood, 0, 0);
      fillRect(s, 4, 7 + bob, 6, 11, cloak, 0, 0);
      fillEllipse(s, 11, 9 + bob, 1.3, 1.3, [1.0, 0.74, 0.3], 3, 0.95);
      return s;
    }
  }
}

/**
 * High-resolution, consistently proportioned World Object PixelSprites.
 * Trees are 1.5x–1.9x human height; shrines & pillars match human architectural scale;
 * props (braziers, chests, signposts, graves, rocks) are cleanly proportioned.
 */
export function buildPropSprite(kind: string, variant = 0, animFrame = 0): PixelSprite | null {
  switch (kind) {
    case 'pine': {
      // 3 tree heights: 26, 30, 34 cells tall (1.4x–1.8x player height!)
      const h = variant === 0 ? 26 : variant === 1 ? 30 : 34;
      const w = variant === 0 ? 19 : variant === 1 ? 23 : 27;
      const cx = w >> 1;
      const s = makeSprite(w, h, cx, h - 1);
      const bark: [number, number, number] = [0.38, 0.26, 0.17];
      const leafDark: [number, number, number] = [0.13, 0.31, 0.18];
      const leafMid: [number, number, number] = [0.18, 0.4, 0.22];
      const leafHi: [number, number, number] = [0.24, 0.48, 0.25];
      // Trunk
      fillRect(s, cx - 1, h - 7, 3, 7, bark, 4, 0);
      // 4 layered bough tiers
      const tiers = 4;
      for (let t = 0; t < tiers; t++) {
        const tierTop = Math.round((t / tiers) * (h - 14));
        const tierH = Math.round((h - 6) * 0.36);
        const tierW = Math.round((w * 0.48) * (0.45 + (t / (tiers - 1)) * 0.55));
        const col = t === 0 ? leafHi : t === tiers - 1 ? leafDark : leafMid;
        fillTriangle(s, cx, tierTop, tierW, tierH, col, 4, variant * 10 + t);
      }
      return s;
    }

    case 'deadtree':
    case 'burnt': {
      const burnt = kind === 'burnt';
      const s = makeSprite(21, 26, 10, 25);
      const wood: [number, number, number] = burnt ? [0.24, 0.2, 0.2] : [0.46, 0.4, 0.33];
      fillRect(s, 9, 10, 3, 16, wood, 4, 0);
      drawLine(s, 10, 12, 3, 4, wood, 2, 4, 0);
      drawLine(s, 10, 12, 17, 5, wood, 2, 4, 0);
      drawLine(s, 6, 8, 2, 1, wood, 1, 4, 0);
      drawLine(s, 14, 8, 18, 2, wood, 1, 4, 0);
      drawLine(s, 10, 10, 10, 2, wood, 1, 4, 0);
      if (burnt) {
        setPx(s, 10, 12, [1.0, 0.45, 0.12], 1, 3, 0.9);
        setPx(s, 8, 17, [1.0, 0.38, 0.1], 1, 3, 0.85);
        setPx(s, 12, 9, [1.0, 0.5, 0.15], 1, 3, 0.9);
      }
      return s;
    }

    case 'shrineLit':
    case 'shrineDark': {
      const lit = kind === 'shrineLit';
      const s = makeSprite(15, 20, 7, 19);
      const stone: [number, number, number] = [0.58, 0.57, 0.56];
      const darkStone: [number, number, number] = [0.42, 0.42, 0.44];
      // Stepped dais
      fillRect(s, 1, 17, 13, 3, darkStone, 2, 0);
      fillRect(s, 3, 15, 9, 2, stone, 2, 0);
      // Obelisk pedestal & bowl
      fillRect(s, 5, 8, 5, 7, stone, 2, 0);
      fillRect(s, 4, 7, 7, 2, darkStone, 2, 0);
      if (lit) {
        const f = animFrame % 3;
        fillEllipse(s, 7, 5, 2.6, 2.4, [1.0, 0.56, 0.16], 3, 0.95);
        fillEllipse(s, 7 + (f - 1) * 0.5, 3, 1.5, 2.0, [1.0, 0.84, 0.36], 3, 1.0);
      } else {
        fillEllipse(s, 7, 6, 1.4, 1.0, [0.55, 0.28, 0.16], 3, 0.35);
      }
      return s;
    }

    case 'pillar': {
      const s = makeSprite(9, 22, 4, 21);
      const stone: [number, number, number] = [0.62, 0.61, 0.6];
      const cap: [number, number, number] = [0.7, 0.69, 0.68];
      fillRect(s, 1, 19, 7, 3, cap, 2, 0);
      fillRect(s, 2, 3, 5, 16, stone, 2, 0);
      fillRect(s, 1, 0, 7, 3, cap, 2, 0);
      return s;
    }

    case 'brazier':
    case 'campfire': {
      const s = makeSprite(9, 10, 4, 9);
      const iron: [number, number, number] = kind === 'brazier' ? [0.42, 0.4, 0.42] : [0.44, 0.3, 0.18];
      fillRect(s, 2, 6, 5, 3, iron, 1, 0);
      fillRect(s, 1, 5, 7, 2, iron, 1, 0);
      const f = animFrame % 3;
      fillEllipse(s, 4, 4, 2.2, 1.8, [1.0, 0.52, 0.14], 3, 0.95);
      fillEllipse(s, 4 + (f - 1) * 0.4, 2, 1.2, 1.5, [1.0, 0.84, 0.36], 3, 1.0);
      return s;
    }

    case 'signpost': {
      const s = makeSprite(11, 13, 5, 12);
      const wood: [number, number, number] = [0.54, 0.4, 0.26];
      const plank: [number, number, number] = [0.68, 0.54, 0.36];
      fillRect(s, 5, 3, 2, 10, wood, 4, 0);
      fillRect(s, 1, 2, 9, 2, plank, 4, 0);
      fillRect(s, 2, 5, 8, 2, plank, 4, 0);
      return s;
    }

    case 'chestClosed':
    case 'chestOpen': {
      const open = kind === 'chestOpen';
      const s = makeSprite(10, 8, 5, 7);
      const wood: [number, number, number] = [0.5, 0.34, 0.2];
      const gold: [number, number, number] = open ? [0.45, 0.4, 0.32] : [0.96, 0.78, 0.32];
      fillRect(s, 1, 3, 8, 5, wood, 4, 0);
      fillRect(s, 1, 2, 8, 1, gold, 1, open ? 0 : 0.4);
      fillRect(s, 4, 4, 2, 2, gold, 3, open ? 0 : 0.6);
      return s;
    }

    case 'lore':
    case 'loreRead': {
      const unread = kind === 'lore';
      const s = makeSprite(9, 13, 4, 12);
      const stone: [number, number, number] = [0.54, 0.55, 0.6];
      fillRect(s, 1, 10, 7, 3, [0.42, 0.43, 0.48], 2, 0);
      fillRect(s, 2, 1, 5, 9, stone, 2, 0);
      if (unread) {
        fillRect(s, 4, 3, 1, 5, [0.48, 0.78, 1.0], 3, 0.95);
      }
      return s;
    }

    case 'tomb': {
      const s = makeSprite(9, 11, 4, 10);
      fillEllipse(s, 4, 4, 3.2, 3.0, [0.54, 0.54, 0.58], 2, 0);
      fillRect(s, 1, 4, 7, 7, [0.52, 0.52, 0.56], 2, 0);
      return s;
    }

    case 'cross': {
      const s = makeSprite(9, 13, 4, 12);
      const st: [number, number, number] = [0.58, 0.58, 0.6];
      fillRect(s, 4, 1, 2, 12, st, 2, 0);
      fillRect(s, 1, 4, 8, 2, st, 2, 0);
      return s;
    }

    case 'rock': {
      const s = makeSprite(11, 8, 5, 7);
      fillEllipse(s, 5, 5, 4.6, 3.0, [0.5, 0.52, 0.56], 2, 0);
      // Moss cap
      fillEllipse(s, 4, 3, 2.8, 1.2, [0.26, 0.48, 0.24], 4, 0);
      return s;
    }

    case 'menhir': {
      const s = makeSprite(9, 18, 4, 17);
      fillRect(s, 2, 2, 5, 16, [0.52, 0.55, 0.62], 2, 0);
      fillRect(s, 4, 5, 1, 6, [0.45, 0.72, 1.0], 3, 0.7);
      return s;
    }

    case 'altar': {
      const s = makeSprite(16, 10, 8, 9);
      fillRect(s, 1, 5, 14, 5, [0.5, 0.48, 0.5], 2, 0);
      fillRect(s, 0, 3, 16, 2, [0.64, 0.62, 0.62], 2, 0);
      fillRect(s, 5, 4, 6, 5, [0.68, 0.14, 0.16], 0, 0.2);
      return s;
    }

    case 'cave': {
      const s = makeSprite(20, 16, 10, 15);
      fillEllipse(s, 10, 10, 9.5, 8.0, [0.46, 0.47, 0.52], 2, 0);
      fillEllipse(s, 10, 12, 5.5, 5.5, [0.05, 0.05, 0.08], 0, 0);
      return s;
    }

    default:
      return null;
  }
}

/**
 * Generates an ASCII portrait string for the top-left HUD player panel.
 */
export function buildPlayerPortraitAscii(armor: ArmorDef): string {
  const accent = armor.id === 'cinder_mantle' ? '*' : armor.id === 'sentinel_mail' ? '+' : '·';
  return [
    `   _${accent}_   `,
    '  /###\\  ',
    '  |#=#|  ',
    ' /\\###/\\ ',
    '|/|###|\\|',
    '  |===|  ',
  ].join('\n');
}
