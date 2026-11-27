import { clamp, hash } from '../engine/util.ts';
import type { ArmorDef, WeaponDef } from './types.ts';

/**
 * Unified high-resolution procedural PixelSprite used for BOTH characters and world props.
 * Top-left directional key light, subtle cool shadow bounce, and consistent architectural scale.
 */
export interface PixelSprite {
  w: number;
  h: number;
  ax: number; // anchor X (centre)
  ay: number; // anchor Y (feet / base)
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Uint8Array;
  em: Float32Array;
  mat: Uint8Array; // 0 = cloth/skin, 1 = steel/armor, 2 = bone/stone, 3 = glow/fire, 4 = foliage/wood
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
  // Subtle cool shadow tint when shaded dark
  const cool = shade < 0.78 ? (0.78 - shade) * 0.14 : 0;
  s.r[i] = clamp(col[0] * shade, 0, 1.45);
  s.g[i] = clamp(col[1] * shade + cool * 0.2, 0, 1.45);
  s.b[i] = clamp(col[2] * shade + cool * 0.7, 0, 1.45);
  s.a[i] = 1;
  s.em[i] = em;
  s.mat[i] = mat;
}

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
      const nx = w > 1 ? (i / (w - 1)) * 2 - 1 : 0;
      const cyl = Math.sqrt(Math.max(0.15, 1 - nx * nx * 0.62));
      const key = 1.04 - nx * 0.18 - ny * 0.22;
      const spec = mat === 1 && nx < -0.15 && nx > -0.65 && ny < 0.45 ? 0.18 : 0;
      const sh = grad ? clamp(0.64 + 0.44 * cyl * key + spec, 0.5, 1.28) : 1;
      setPx(s, x0 + i, y0 + j, col, sh, mat, em);
    }
  }
}

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
        const ndl = clamp(-nx * 0.38 - ny * 0.44 + nz * 0.78, 0, 1);
        const spec = mat === 1 ? Math.pow(clamp(-nx * 0.45 - ny * 0.5 + nz * 0.74, 0, 1), 6) * 0.35 : 0;
        const sh = 0.54 + 0.62 * ndl + spec;
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
      // Darken underside row for layered 3D bough depth
      const under = row === height - 1 ? -0.16 : 0;
      const sh = clamp(0.7 + (1 - t) * 0.28 - nx * 0.2 + tex + under, 0.45, 1.2);
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
 * Detailed Player Knight (16x21 cells) with specular plate armor, flowing cloak with trim,
 * articulated greaves, and distinct silhouettes per weapon kind (sword, greatsword, spear, scythe).
 */
export function buildKnightSprite(
  armor: ArmorDef,
  weapon: WeaponDef,
  pose: AnimPose,
  frame: number,
): PixelSprite {
  const s = makeSprite(16, 21, 8, 20);

  const steel = armor.steelColor;
  const cloak = armor.cloakColor;
  const trim = armor.trimColor;
  const darkSteel: [number, number, number] = [steel[0] * 0.42, steel[1] * 0.42, steel[2] * 0.48];
  const leather: [number, number, number] = [0.34, 0.24, 0.18];
  const visor: [number, number, number] = [1.0, 0.82, 0.38];

  if (pose === 'roll') {
    fillEllipse(s, 8, 15, 4.2, 3.6, cloak, 0, 0);
    fillEllipse(s, 8, 14, 2.8, 2.4, steel, 1, 0);
    fillRect(s, 6, 15, 4, 1, trim, 1, 0.2);
    return s;
  }

  const bob = pose === 'idle' ? (frame % 2 === 1 ? 1 : 0) : pose === 'walk' ? (frame % 2 === 0 ? -1 : 0) : 0;
  const stride = pose === 'walk' ? Math.round(Math.sin(frame * 1.1) * 2.0) : 0;
  const cloakSway = pose === 'walk' ? -1 - (frame % 2) : frame % 2 === 1 ? -1 : 0;

  // Multi-layered billowing cloak with gold hem trim
  fillRect(s, 3 + cloakSway, 7 + bob, 7, 10, cloak, 0, 0);
  fillRect(s, 2 + cloakSway, 11 + bob, 4, 7, cloak, 0, 0);
  fillRect(s, 2 + cloakSway, 17 + bob, 7, 1, trim, 1, 0.12, false);

  // Articulated greaves + knee guards + boots
  const leftLegX = 5 - Math.max(0, stride);
  const rightLegX = 8 + Math.max(0, stride);
  fillRect(s, leftLegX, 14, 2, 6, darkSteel, 1, 0);
  fillRect(s, rightLegX, 14, 2, 6, steel, 1, 0);
  setPx(s, leftLegX, 16, trim, 1, 1, 0.1);
  setPx(s, rightLegX + 1, 16, trim, 1, 1, 0.1);
  fillRect(s, leftLegX, 19, 2, 1, leather, 0, 0);
  fillRect(s, rightLegX, 19, 2, 1, leather, 0, 0);

  // Cuirass breastplate + waist belt + buckle
  fillRect(s, 5, 7 + bob, 6, 7, steel, 1, 0);
  fillRect(s, 5, 12 + bob, 6, 1, leather, 0, 0);
  fillRect(s, 7, 12 + bob, 2, 1, trim, 1, 0.25);

  // Layered shoulder pauldrons with trim edge
  fillEllipse(s, 4, 8 + bob, 2.0, 1.7, steel, 1, 0);
  fillEllipse(s, 11, 8 + bob, 2.0, 1.7, steel, 1, 0);
  setPx(s, 3, 9 + bob, trim, 1, 1, 0.15);
  setPx(s, 12, 9 + bob, trim, 1, 1, 0.15);

  // Greathelm + crest plume + visor slit glow
  fillEllipse(s, 8, 4 + bob, 2.4, 2.6, steel, 1, 0);
  fillRect(s, 6, 1 + bob, 3, 1, cloak, 0, 0);
  fillRect(s, 7, 2 + bob, 2, 1, trim, 1, 0.2);
  fillRect(s, 7, 4 + bob, 3, 1, visor, 3, 0.92);

  // Distinct weapon silhouettes
  const blade = weapon.glowColor;
  if (pose === 'drink') {
    fillRect(s, 10, 6 + bob, 2, 3, [1.0, 0.68, 0.2], 3, 0.95);
  } else if (pose === 'parry') {
    drawLine(s, 11, 4, 12, 15, [0.9, 0.96, 1.0], 2, 3, 1.0);
    fillRect(s, 10, 9, 4, 1, trim, 1, 0.4);
  } else if (pose === 'attack1' || pose === 'attack2' || pose === 'attack3') {
    const ext = weapon.kind === 'spear' ? 5 : weapon.kind === 'greatsword' ? 4 : 3;
    const yEnd = pose === 'attack2' ? 5 : pose === 'attack3' ? 14 : 9;
    drawLine(s, 11, 10 + bob, 11 + ext, yEnd, blade, weapon.kind === 'greatsword' ? 2 : 1, 3, 0.95);
    if (weapon.kind === 'scythe') {
      drawLine(s, 11 + ext, yEnd, 11 + ext - 2, yEnd + 3, blade, 1, 3, 0.95);
    }
  } else {
    // Held weapon at rest
    if (weapon.kind === 'spear') {
      drawLine(s, 12, 16 + bob, 13, 2 + bob, leather, 1, 4, 0);
      drawLine(s, 13, 3 + bob, 13, 0 + bob, blade, 1, 3, 0.85);
    } else if (weapon.kind === 'scythe') {
      drawLine(s, 12, 15 + bob, 13, 3 + bob, leather, 1, 4, 0);
      drawLine(s, 13, 3 + bob, 9, 2 + bob, blade, 1, 3, 0.85);
    } else if (weapon.kind === 'greatsword') {
      drawLine(s, 12, 11 + bob, 13, 2 + bob, blade, 2, 3, 0.8);
      fillRect(s, 11, 11 + bob, 4, 1, trim, 1, 0.3);
    } else {
      drawLine(s, 12, 11 + bob, 13, 3 + bob, blade, 1, 3, 0.78);
      fillRect(s, 11, 11 + bob, 3, 1, trim, 1, 0.3);
    }
  }

  return s;
}

export function buildCreatureSprite(kind: string, pose: 'idle' | 'walk' | 'attack', frame: number): PixelSprite {
  const bob = frame % 2 === 1 ? 1 : 0;
  const atk = pose === 'attack';

  switch (kind) {
    case 'skeleton': {
      const s = makeSprite(14, 20, 7, 19);
      const bone: [number, number, number] = [0.95, 0.91, 0.79];
      const rust: [number, number, number] = [0.56, 0.44, 0.36];
      const eye: [number, number, number] = [0.35, 0.88, 1.0];
      fillEllipse(s, 7, 4 + bob, 2.3, 2.4, bone, 2, 0);
      setPx(s, 6, 4 + bob, eye, 1, 3, 1);
      setPx(s, 8, 4 + bob, eye, 1, 3, 1);
      fillRect(s, 5, 7 + bob, 4, 6, bone, 2, 0);
      setPx(s, 6, 9 + bob, [0.14, 0.14, 0.18], 1, 0, 0);
      setPx(s, 8, 9 + bob, [0.14, 0.14, 0.18], 1, 0, 0);
      setPx(s, 6, 11 + bob, [0.14, 0.14, 0.18], 1, 0, 0);
      setPx(s, 8, 11 + bob, [0.14, 0.14, 0.18], 1, 0, 0);
      fillRect(s, 5, 13, 1, 6, bone, 2, 0);
      fillRect(s, 8, 13, 1, 6, bone, 2, 0);
      fillRect(s, 2, 8 + bob, 3, 6, rust, 1, 0);
      drawLine(s, 10, 10 + bob, atk ? 13 : 11, atk ? 10 : 3, [0.82, 0.85, 0.92], 1, 1, atk ? 0.7 : 0.15);
      return s;
    }

    case 'ghoul': {
      const s = makeSprite(14, 15, 7, 14);
      const skin: [number, number, number] = [0.56, 0.64, 0.46];
      const rag: [number, number, number] = [0.38, 0.32, 0.28];
      fillEllipse(s, 8, 4 + bob, 2.4, 2.2, skin, 0, 0);
      setPx(s, 9, 4 + bob, [1.0, 0.25, 0.12], 1, 3, 1);
      fillEllipse(s, 6, 8 + bob, 3.2, 2.9, rag, 0, 0);
      fillRect(s, 4, 11, 2, 3, skin, 0, 0);
      fillRect(s, 8, 11, 2, 3, skin, 0, 0);
      if (atk) drawLine(s, 9, 7, 13, 6, [0.95, 0.35, 0.25], 1, 3, 0.85);
      return s;
    }

    case 'wolf': {
      const s = makeSprite(16, 11, 8, 10);
      const fur: [number, number, number] = [0.58, 0.57, 0.64];
      const ember: [number, number, number] = [1.0, 0.64, 0.18];
      fillEllipse(s, 7, 5 + bob, 4.5, 2.3, fur, 0, 0);
      fillEllipse(s, 12, 3 + bob, 2.1, 1.7, fur, 0, 0);
      setPx(s, 13, 3 + bob, ember, 1, 3, 1);
      fillRect(s, 4, 7, 1, 3, fur, 0, 0);
      fillRect(s, 10, 7, 1, 3, fur, 0, 0);
      drawLine(s, 2, 5 + bob, 0, 3 + bob, fur, 1, 0, 0);
      return s;
    }

    case 'wraith': {
      const s = makeSprite(14, 20, 7, 19);
      const mist: [number, number, number] = [0.42, 0.68, 1.0];
      const core: [number, number, number] = [0.82, 0.96, 1.0];
      fillEllipse(s, 7, 4 + bob, 2.8, 2.9, mist, 0, 0.45);
      fillRect(s, 4, 7 + bob, 6, 9, mist, 0, 0.35);
      setPx(s, 6, 4 + bob, core, 1, 3, 1);
      setPx(s, 8, 4 + bob, core, 1, 3, 1);
      drawLine(s, 5, 16, 4 + bob, 19, mist, 1, 0, 0.3);
      drawLine(s, 9, 16, 10 - bob, 19, mist, 1, 0, 0.3);
      return s;
    }

    case 'specter': {
      const s = makeSprite(15, 20, 7, 19);
      const armor: [number, number, number] = [0.48, 0.58, 0.78];
      const cloak: [number, number, number] = [0.28, 0.38, 0.66];
      const blade: [number, number, number] = [0.55, 0.92, 1.0];
      fillRect(s, 3, 7 + bob, 9, 11, cloak, 0, 0.18);
      fillRect(s, 4, 6 + bob, 7, 8, armor, 1, 0.22);
      fillEllipse(s, 7, 4 + bob, 2.4, 2.5, armor, 1, 0.25);
      fillRect(s, 6, 4 + bob, 3, 1, blade, 3, 1.0);
      drawLine(s, 11, 9 + bob, atk ? 14 : 12, atk ? 9 : 2, blade, 1, 3, 0.92);
      return s;
    }

    case 'bogwitch': {
      const s = makeSprite(14, 20, 7, 19);
      const robe: [number, number, number] = [0.26, 0.5, 0.36];
      const glow: [number, number, number] = [0.45, 1.0, 0.68];
      fillTriangle(s, 7, 0 + bob, 3, 4, robe, 0, 2);
      fillRect(s, 3, 4 + bob, 8, 1, robe, 0, 0);
      fillRect(s, 5, 5 + bob, 4, 3, [0.56, 0.66, 0.58], 0, 0);
      setPx(s, 6, 6 + bob, glow, 1, 3, 1);
      setPx(s, 8, 6 + bob, glow, 1, 3, 1);
      fillRect(s, 4, 8 + bob, 6, 11, robe, 0, 0);
      drawLine(s, 11, 5 + bob, 11, 18, [0.48, 0.36, 0.24], 1, 4, 0);
      fillEllipse(s, 11, 4 + bob, 1.3, 1.3, glow, 3, 1.0);
      return s;
    }

    case 'wight': {
      const s = makeSprite(22, 31, 11, 30);
      const bone: [number, number, number] = [0.95, 0.9, 0.78];
      const gold: [number, number, number] = [0.96, 0.78, 0.34];
      const cloak: [number, number, number] = [0.48, 0.14, 0.16];
      const eye: [number, number, number] = [1.0, 0.25, 0.18];
      fillRect(s, 4, 10 + bob, 14, 18, cloak, 0, 0);
      fillRect(s, 7, 10 + bob, 8, 11, bone, 2, 0);
      fillRect(s, 7, 2 + bob, 8, 3, gold, 1, 0.4);
      fillEllipse(s, 11, 6 + bob, 3.6, 3.3, bone, 2, 0);
      fillRect(s, 9, 6 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 12, 6 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 8, 21, 2, 9, bone, 2, 0);
      fillRect(s, 12, 21, 2, 9, bone, 2, 0);
      drawLine(s, 17, 14 + bob, atk ? 21 : 19, atk ? 13 : 2, [1.0, 0.35, 0.22], 2, 3, 0.95);
      return s;
    }

    case 'matron': {
      const s = makeSprite(22, 31, 11, 30);
      const veil: [number, number, number] = [0.24, 0.68, 0.6];
      const glow: [number, number, number] = [0.55, 1.0, 0.86];
      fillEllipse(s, 11, 7 + bob, 4.4, 4.8, veil, 0, 0.35);
      fillRect(s, 5, 11 + bob, 12, 17, veil, 0, 0.28);
      fillRect(s, 9, 6 + bob, 2, 1, glow, 3, 1.0);
      fillRect(s, 12, 6 + bob, 2, 1, glow, 3, 1.0);
      if (atk) {
        fillEllipse(s, 3, 13, 2, 2, glow, 3, 1.0);
        fillEllipse(s, 19, 13, 2, 2, glow, 3, 1.0);
      }
      return s;
    }

    case 'corvus': {
      const s = makeSprite(22, 31, 11, 30);
      const iron: [number, number, number] = [0.44, 0.4, 0.42];
      const ember: [number, number, number] = [1.0, 0.48, 0.14];
      const cloak: [number, number, number] = [0.7, 0.22, 0.08];
      fillRect(s, 4, 10 + bob, 14, 18, cloak, 0, 0.1);
      fillRect(s, 6, 9 + bob, 10, 12, iron, 1, 0);
      fillEllipse(s, 11, 5 + bob, 3.6, 3.8, iron, 1, 0);
      fillRect(s, 9, 5 + bob, 5, 2, ember, 3, 1.0);
      fillRect(s, 7, 21, 3, 9, iron, 1, 0);
      fillRect(s, 12, 21, 3, 9, iron, 1, 0);
      drawLine(s, 17, 14 + bob, atk ? 21 : 19, atk ? 15 : 1, ember, 2, 3, 1.0);
      return s;
    }

    case 'bishop': {
      const s = makeSprite(26, 36, 13, 35);
      const crimson: [number, number, number] = [0.7, 0.1, 0.14];
      const pale: [number, number, number] = [0.92, 0.9, 0.85];
      const gold: [number, number, number] = [0.98, 0.82, 0.36];
      const eye: [number, number, number] = [1.0, 0.22, 0.26];
      fillTriangle(s, 13, 1 + bob, 4, 7, gold, 1, 3);
      fillEllipse(s, 13, 10 + bob, 3.6, 3.6, pale, 0, 0.15);
      fillRect(s, 10, 10 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 14, 10 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 6, 14 + bob, 14, 20, crimson, 0, 0.1);
      fillRect(s, 10, 14 + bob, 6, 19, gold, 1, 0.25);
      drawLine(s, 21, 6 + bob, 21, 34, gold, 2, 1, 0.35);
      fillEllipse(s, 21, 5 + bob, 2.4, 2.4, [1.0, 0.88, 0.45], 3, 1.0);
      return s;
    }

    case 'smith': {
      // Bran the Blacksmith with apron, hammer & glowing anvil!
      const s = makeSprite(18, 20, 8, 19);
      fillEllipse(s, 7, 4 + bob, 2.4, 2.4, [0.76, 0.62, 0.5], 0, 0);
      fillRect(s, 4, 7 + bob, 6, 11, [0.46, 0.26, 0.18], 0, 0);
      fillRect(s, 5, 8 + bob, 4, 9, [0.32, 0.22, 0.18], 0, 0); // leather apron
      // Anvil + hot ember ingot on right
      fillRect(s, 12, 14, 5, 5, [0.36, 0.37, 0.42], 1, 0);
      fillRect(s, 11, 13, 7, 2, [0.48, 0.5, 0.56], 1, 0);
      fillRect(s, 13, 12, 3, 1, [1.0, 0.55, 0.14], 3, 1.0);
      return s;
    }

    case 'merchant': {
      // Sera the Merchant with backpack & warm lantern
      const s = makeSprite(16, 20, 8, 19);
      fillRect(s, 2, 7 + bob, 4, 8, [0.52, 0.38, 0.24], 4, 0); // traveler pack
      fillEllipse(s, 8, 4 + bob, 2.3, 2.4, [0.32, 0.56, 0.46], 0, 0);
      fillRect(s, 7, 4 + bob, 3, 2, [0.82, 0.76, 0.66], 0, 0);
      fillRect(s, 5, 7 + bob, 6, 12, [0.32, 0.56, 0.46], 0, 0);
      fillRect(s, 5, 12 + bob, 6, 1, [0.92, 0.74, 0.32], 1, 0.2);
      fillEllipse(s, 13, 10 + bob, 1.4, 1.4, [1.0, 0.78, 0.32], 3, 0.95);
      return s;
    }

    case 'maren':
    default: {
      // Maren, Keeper of the Ember: tall indigo mantle, silver trim & glowing lantern staff
      const s = makeSprite(16, 20, 8, 19);
      fillEllipse(s, 8, 4 + bob, 2.4, 2.6, [0.36, 0.38, 0.56], 0, 0);
      fillRect(s, 7, 4 + bob, 3, 2, [0.84, 0.8, 0.72], 0, 0);
      fillRect(s, 5, 7 + bob, 6, 12, [0.34, 0.36, 0.54], 0, 0);
      fillRect(s, 7, 7 + bob, 2, 12, [0.78, 0.8, 0.88], 1, 0.15);
      drawLine(s, 13, 6 + bob, 13, 19, [0.46, 0.36, 0.26], 1, 4, 0);
      fillEllipse(s, 13, 5 + bob, 1.6, 1.6, [1.0, 0.76, 0.32], 3, 1.0);
      return s;
    }
  }
}

/**
 * High-detail architectural & natural World Object PixelSprites.
 */
export function buildPropSprite(kind: string, variant = 0, animFrame = 0): PixelSprite | null {
  switch (kind) {
    case 'pine': {
      // 5-tier lush shaded conifers with bark texture & exposed roots
      const h = variant === 0 ? 28 : variant === 1 ? 32 : 36;
      const w = variant === 0 ? 21 : variant === 1 ? 25 : 29;
      const cx = w >> 1;
      const s = makeSprite(w, h, cx, h - 1);
      const bark: [number, number, number] = [0.38, 0.26, 0.17];
      const leafDark: [number, number, number] = [0.12, 0.29, 0.17];
      const leafMid: [number, number, number] = [0.18, 0.41, 0.22];
      const leafHi: [number, number, number] = [0.25, 0.51, 0.26];
      // Trunk + flared roots
      fillRect(s, cx - 1, h - 8, 3, 8, bark, 4, 0);
      drawLine(s, cx - 1, h - 2, cx - 4, h - 1, bark, 1, 4, 0);
      drawLine(s, cx + 1, h - 2, cx + 4, h - 1, bark, 1, 4, 0);
      const tiers = 5;
      for (let t = 0; t < tiers; t++) {
        const tierTop = Math.round((t / tiers) * (h - 15));
        const tierH = Math.round((h - 6) * 0.32);
        const tierW = Math.round((w * 0.48) * (0.36 + (t / (tiers - 1)) * 0.64));
        const col = t === 0 ? leafHi : t >= tiers - 1 ? leafDark : leafMid;
        fillTriangle(s, cx, tierTop, tierW, tierH, col, 4, variant * 10 + t);
      }
      return s;
    }

    case 'deadtree':
    case 'burnt': {
      const burnt = kind === 'burnt';
      const s = makeSprite(23, 28, 11, 27);
      const wood: [number, number, number] = burnt ? [0.24, 0.2, 0.21] : [0.48, 0.42, 0.34];
      fillRect(s, 10, 10, 3, 18, wood, 4, 0);
      drawLine(s, 10, 26, 7, 27, wood, 1, 4, 0);
      drawLine(s, 12, 26, 15, 27, wood, 1, 4, 0);
      drawLine(s, 11, 13, 3, 5, wood, 2, 4, 0);
      drawLine(s, 11, 13, 19, 6, wood, 2, 4, 0);
      drawLine(s, 7, 9, 2, 1, wood, 1, 4, 0);
      drawLine(s, 15, 9, 20, 2, wood, 1, 4, 0);
      drawLine(s, 11, 11, 11, 2, wood, 1, 4, 0);
      if (burnt) {
        setPx(s, 11, 13, [1.0, 0.48, 0.14], 1, 3, 0.95);
        setPx(s, 9, 18, [1.0, 0.38, 0.1], 1, 3, 0.85);
        setPx(s, 13, 9, [1.0, 0.54, 0.16], 1, 3, 0.95);
      }
      return s;
    }

    case 'shrineLit':
    case 'shrineDark': {
      const lit = kind === 'shrineLit';
      const s = makeSprite(17, 22, 8, 21);
      const stone: [number, number, number] = [0.6, 0.59, 0.58];
      const darkStone: [number, number, number] = [0.42, 0.42, 0.46];
      fillRect(s, 1, 19, 15, 3, darkStone, 2, 0);
      fillRect(s, 3, 17, 11, 2, stone, 2, 0);
      fillRect(s, 5, 9, 7, 8, stone, 2, 0);
      fillRect(s, 4, 8, 9, 2, darkStone, 2, 0);
      // Carved rune on pedestal
      fillRect(s, 8, 11, 1, 4, lit ? [1.0, 0.72, 0.28] : [0.35, 0.36, 0.42], lit ? 3 : 2, lit ? 0.85 : 0);
      if (lit) {
        const f = animFrame % 3;
        fillEllipse(s, 8, 5, 3.0, 2.8, [1.0, 0.52, 0.14], 3, 0.95);
        fillEllipse(s, 8 + (f - 1) * 0.5, 3, 1.8, 2.2, [1.0, 0.84, 0.36], 3, 1.0);
        setPx(s, 8, 4, [1.0, 0.98, 0.88], 1, 3, 1.0);
      } else {
        fillEllipse(s, 8, 7, 1.5, 1.0, [0.55, 0.28, 0.16], 3, 0.35);
      }
      return s;
    }

    case 'pillar': {
      // Fluted stone column with carved capital & plinth
      const s = makeSprite(9, 23, 4, 22);
      const stone: [number, number, number] = [0.64, 0.63, 0.62];
      const groove: [number, number, number] = [0.46, 0.46, 0.49];
      const cap: [number, number, number] = [0.72, 0.71, 0.7];
      fillRect(s, 1, 20, 7, 3, cap, 2, 0);
      fillRect(s, 2, 3, 5, 17, stone, 2, 0);
      fillRect(s, 3, 4, 1, 15, groove, 2, 0);
      fillRect(s, 5, 4, 1, 15, groove, 2, 0);
      fillRect(s, 1, 0, 7, 3, cap, 2, 0);
      return s;
    }

    case 'brazier':
    case 'campfire': {
      const s = makeSprite(9, 11, 4, 10);
      const iron: [number, number, number] = kind === 'brazier' ? [0.42, 0.42, 0.46] : [0.46, 0.32, 0.18];
      if (kind === 'brazier') {
        drawLine(s, 2, 10, 3, 7, iron, 1, 1, 0);
        drawLine(s, 6, 10, 5, 7, iron, 1, 1, 0);
      } else {
        fillRect(s, 1, 8, 7, 2, iron, 4, 0);
      }
      fillRect(s, 1, 6, 7, 2, iron, 1, 0);
      const f = animFrame % 3;
      fillEllipse(s, 4, 4, 2.4, 2.0, [1.0, 0.52, 0.14], 3, 0.95);
      fillEllipse(s, 4 + (f - 1) * 0.4, 2, 1.3, 1.6, [1.0, 0.86, 0.38], 3, 1.0);
      return s;
    }

    case 'signpost': {
      const s = makeSprite(11, 14, 5, 13);
      const wood: [number, number, number] = [0.54, 0.4, 0.26];
      const plank: [number, number, number] = [0.7, 0.56, 0.38];
      fillRect(s, 5, 3, 2, 11, wood, 4, 0);
      fillRect(s, 1, 2, 9, 2, plank, 4, 0);
      fillRect(s, 2, 5, 8, 2, plank, 4, 0);
      return s;
    }

    case 'chestClosed':
    case 'chestOpen': {
      const open = kind === 'chestOpen';
      const s = makeSprite(11, 8, 5, 7);
      const wood: [number, number, number] = [0.52, 0.34, 0.2];
      const gold: [number, number, number] = open ? [0.46, 0.42, 0.34] : [0.98, 0.8, 0.34];
      fillRect(s, 1, 3, 9, 5, wood, 4, 0);
      fillRect(s, 1, 2, 9, 1, gold, 1, open ? 0 : 0.45);
      fillRect(s, 1, 3, 1, 5, gold, 1, 0.2);
      fillRect(s, 9, 3, 1, 5, gold, 1, 0.2);
      fillRect(s, 4, 4, 3, 2, gold, 3, open ? 0 : 0.7);
      return s;
    }

    case 'lore':
    case 'loreRead': {
      const unread = kind === 'lore';
      const s = makeSprite(9, 14, 4, 13);
      const stone: [number, number, number] = [0.56, 0.57, 0.62];
      fillRect(s, 1, 11, 7, 3, [0.42, 0.43, 0.48], 2, 0);
      fillRect(s, 2, 1, 5, 10, stone, 2, 0);
      if (unread) {
        fillRect(s, 4, 3, 1, 6, [0.48, 0.8, 1.0], 3, 0.95);
      }
      return s;
    }

    case 'tomb': {
      const s = makeSprite(9, 12, 4, 11);
      fillEllipse(s, 4, 4, 3.2, 3.0, [0.56, 0.56, 0.6], 2, 0);
      fillRect(s, 1, 4, 7, 8, [0.52, 0.52, 0.56], 2, 0);
      return s;
    }

    case 'cross': {
      const s = makeSprite(9, 14, 4, 13);
      const st: [number, number, number] = [0.6, 0.6, 0.62];
      fillRect(s, 4, 1, 2, 13, st, 2, 0);
      fillRect(s, 1, 4, 8, 2, st, 2, 0);
      return s;
    }

    case 'rock': {
      const s = makeSprite(12, 8, 6, 7);
      fillEllipse(s, 6, 5, 5.0, 3.2, [0.52, 0.54, 0.58], 2, 0);
      fillEllipse(s, 4, 3, 3.0, 1.3, [0.26, 0.5, 0.24], 4, 0);
      return s;
    }

    case 'menhir': {
      const s = makeSprite(9, 19, 4, 18);
      fillRect(s, 2, 2, 5, 17, [0.54, 0.57, 0.64], 2, 0);
      fillRect(s, 4, 5, 1, 7, [0.48, 0.76, 1.0], 3, 0.78);
      return s;
    }

    case 'altar': {
      const s = makeSprite(16, 10, 8, 9);
      fillRect(s, 1, 5, 14, 5, [0.5, 0.48, 0.5], 2, 0);
      fillRect(s, 0, 3, 16, 2, [0.66, 0.64, 0.64], 2, 0);
      fillRect(s, 5, 4, 6, 5, [0.7, 0.14, 0.16], 0, 0.22);
      return s;
    }

    case 'cave': {
      const s = makeSprite(22, 17, 11, 16);
      fillEllipse(s, 11, 10, 10.5, 8.5, [0.46, 0.48, 0.54], 2, 0);
      fillEllipse(s, 11, 12, 6.0, 5.8, [0.05, 0.05, 0.09], 0, 0);
      // Warm torch accents flanking crypt entrance
      fillEllipse(s, 4, 11, 1.2, 1.4, [1.0, 0.58, 0.18], 3, 0.9);
      fillEllipse(s, 18, 11, 1.2, 1.4, [1.0, 0.58, 0.18], 3, 0.9);
      return s;
    }

    default:
      return null;
  }
}

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
