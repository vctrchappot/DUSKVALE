import { clamp, hash, noise } from '../engine/util.ts';
import type { ArmorDef, WeaponDef } from './types.ts';

/**
 * High-resolution procedural PixelSprite rendered into dense typographic ASCII.
 * mat:
 *  0 = cloth / skin / dark fabric (rich alphanumeric ramp)
 *  1 = steel / plate armor (high-contrast specular metal ramp)
 *  2 = bone / stone / masonry (weathered alphanumeric stone ramp)
 *  3 = glow / fire / silver blade / eyes (bright luminous ramp)
 *  4 = foliage / mossy canopy (feathery directional blades /|\'")
 *  5 = tree bark (vertical weathered bark alphanumeric ramp)
 */
export interface PixelSprite {
  w: number;
  h: number;
  ax: number;
  ay: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Uint8Array;
  em: Float32Array;
  mat: Uint8Array;
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
  const cool = shade < 0.72 ? (0.72 - shade) * 0.16 : 0;
  s.r[i] = clamp(col[0] * shade, 0, 1.5);
  s.g[i] = clamp(col[1] * shade + cool * 0.2, 0, 1.5);
  s.b[i] = clamp(col[2] * shade + cool * 0.75, 0, 1.5);
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
      const cyl = Math.sqrt(Math.max(0.14, 1 - nx * nx * 0.68));
      const key = 1.06 - nx * 0.22 - ny * 0.24;
      const spec = mat === 1 && nx < -0.1 && nx > -0.65 && ny < 0.5 ? 0.28 : 0;
      const tex = (noise((x0 + i) * 0.55, (y0 + j) * 0.55, 19) - 0.5) * (mat === 2 || mat === 5 ? 0.24 : 0.08);
      const sh = grad ? clamp(0.55 + 0.5 * cyl * key + spec + tex, 0.34, 1.38) : 1;
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
        const ndl = clamp(-nx * 0.42 - ny * 0.46 + nz * 0.78, 0, 1);
        const spec = mat === 1 ? Math.pow(clamp(-nx * 0.48 - ny * 0.52 + nz * 0.72, 0, 1), 5) * 0.45 : 0;
        const tex = (noise(x * 0.6, y * 0.6, 23) - 0.5) * (mat === 2 ? 0.22 : 0.06);
        const sh = clamp(0.46 + 0.7 * ndl + spec + tex, 0.3, 1.42);
        setPx(s, x, y, col, sh, mat, em);
      }
    }
  }
}

function fillFoliageCluster(
  s: PixelSprite,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colDark: readonly [number, number, number],
  colHi: readonly [number, number, number],
  seed: number,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / Math.max(0.5, rx);
      const ny = (y - cy) / Math.max(0.5, ry);
      const jitter = (noise(x * 0.38, y * 0.38, seed) - 0.5) * 0.55;
      const d2 = nx * nx + ny * ny + jitter;
      if (d2 <= 0.96) {
        const lit = clamp(0.65 - ny * 0.45 - nx * 0.25 + (noise(x * 0.5, y * 0.5, seed + 7) - 0.5) * 0.35, 0, 1);
        const r = colDark[0] + (colHi[0] - colDark[0]) * lit;
        const g = colDark[1] + (colHi[1] - colDark[1]) * lit;
        const b = colDark[2] + (colHi[2] - colDark[2]) * lit;
        // Occasional glowing pale-cyan dew/pollen speck inside canopy (like Image 1)
        const dew = hash(x, y, seed + 53) > 0.978;
        if (dew) {
          setPx(s, x, y, [0.78, 0.94, 1.0], 1.1, 3, 0.85);
        } else {
          setPx(s, x, y, [r, g, b], 0.85 + lit * 0.35, 4, 0);
        }
      }
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
 * High-Detail Dark-Fantasy Knight (18x25 cells) inspired by Senje:
 * Gleaming silver-steel helmet & cuirass, deep crimson cloak draping on the left,
 * crisp silhouette boots, and bright luminous sword blade angled cleanly out.
 */
export function buildKnightSprite(
  armor: ArmorDef,
  weapon: WeaponDef,
  pose: AnimPose,
  frame: number,
): PixelSprite {
  const s = makeSprite(18, 25, 9, 24);

  const steel = armor.steelColor;
  const cloak = armor.cloakColor;
  const trim = armor.trimColor;
  const darkSteel: [number, number, number] = [steel[0] * 0.38, steel[1] * 0.4, steel[2] * 0.46];
  const brightSteel: [number, number, number] = [Math.min(1, steel[0] * 1.25), Math.min(1, steel[1] * 1.25), Math.min(1, steel[2] * 1.28)];
  const leather: [number, number, number] = [0.3, 0.22, 0.17];
  const visor: [number, number, number] = [0.95, 0.88, 0.72];

  if (pose === 'roll') {
    fillEllipse(s, 9, 18, 4.6, 3.8, cloak, 0, 0);
    fillEllipse(s, 9, 17, 3.0, 2.5, steel, 1, 0);
    fillRect(s, 7, 17, 4, 1, trim, 1, 0.25);
    return s;
  }

  const bob = pose === 'idle' ? (frame % 2 === 1 ? 1 : 0) : pose === 'walk' ? (frame % 2 === 0 ? -1 : 0) : 0;
  const stride = pose === 'walk' ? Math.round(Math.sin(frame * 1.1) * 2.2) : 0;
  const cloakSway = pose === 'walk' ? -1 - (frame % 2) : frame % 2 === 1 ? -1 : 0;

  // Flowing crimson cloak draped behind & to left side (exact Senje silhouette!)
  fillRect(s, 3 + cloakSway, 8 + bob, 6, 13, cloak, 0, 0);
  fillRect(s, 2 + cloakSway, 12 + bob, 4, 9, cloak, 0, 0);
  fillRect(s, 4 + cloakSway, 10 + bob, 1, 10, [cloak[0] * 1.32, cloak[1] * 1.15, cloak[2] * 1.15], 0, 0, false);
  fillRect(s, 2 + cloakSway, 20 + bob, 7, 1, trim, 1, 0.15, false);

  // Legs / articulated armored greaves + moonlit thigh highlights
  const leftLegX = 6 - Math.max(0, stride);
  const rightLegX = 9 + Math.max(0, stride);
  fillRect(s, leftLegX, 16, 2, 8, darkSteel, 1, 0);
  fillRect(s, rightLegX, 16, 3, 8, steel, 1, 0);
  setPx(s, rightLegX, 17, brightSteel, 1.2, 1, 0.15);
  setPx(s, rightLegX, 19, trim, 1.1, 1, 0.2);
  fillRect(s, leftLegX, 23, 2, 1, leather, 0, 0);
  fillRect(s, rightLegX, 23, 3, 1, leather, 0, 0);

  // Breastplate cuirass + metallic specular sternum ridge + belt
  fillRect(s, 6, 8 + bob, 6, 8, steel, 1, 0);
  fillRect(s, 8, 8 + bob, 2, 5, brightSteel, 1, 0.12);
  fillRect(s, 6, 14 + bob, 6, 1, leather, 0, 0);
  fillRect(s, 8, 14 + bob, 2, 1, trim, 1, 0.3);

  // Sculpted shoulder pauldrons with bright silver top ridge
  fillEllipse(s, 5, 9 + bob, 2.2, 1.9, steel, 1, 0);
  fillEllipse(s, 12, 9 + bob, 2.2, 1.9, steel, 1, 0);
  setPx(s, 4, 8 + bob, brightSteel, 1.25, 1, 0.15);
  setPx(s, 11, 8 + bob, brightSteel, 1.25, 1, 0.15);

  // Gothic greathelm + gleaming crown + glowing visor slit
  fillEllipse(s, 9, 4 + bob, 2.6, 2.9, steel, 1, 0);
  fillRect(s, 7, 2 + bob, 3, 1, brightSteel, 1, 0.18);
  fillRect(s, 8, 4 + bob, 3, 1, visor, 3, 0.85);

  // Weapon — bright gleaming blade (silver-white/weapon glow angled cleanly like Image 1!)
  const blade: [number, number, number] = [
    Math.min(1, weapon.glowColor[0] * 0.75 + 0.35),
    Math.min(1, weapon.glowColor[1] * 0.75 + 0.35),
    Math.min(1, weapon.glowColor[2] * 0.75 + 0.35),
  ];
  if (pose === 'drink') {
    fillRect(s, 11, 7 + bob, 2, 3, [1.0, 0.72, 0.24], 3, 1.0);
  } else if (pose === 'parry') {
    drawLine(s, 12, 4, 13, 18, [0.92, 0.97, 1.0], 2, 3, 1.0);
    fillRect(s, 11, 10, 4, 1, trim, 1, 0.45);
  } else if (pose === 'attack1' || pose === 'attack2' || pose === 'attack3') {
    const ext = weapon.kind === 'spear' ? 6 : weapon.kind === 'greatsword' ? 5 : 4;
    const yEnd = pose === 'attack2' ? 6 : pose === 'attack3' ? 18 : 12;
    drawLine(s, 11, 12 + bob, 11 + ext, yEnd, blade, weapon.kind === 'greatsword' ? 2 : 1, 3, 1.0);
    if (weapon.kind === 'scythe') {
      drawLine(s, 11 + ext, yEnd, 11 + ext - 2, yEnd + 4, blade, 1, 3, 1.0);
    }
  } else {
    // Low angled gleaming sword carried at ready (just like Senje in Image 1!)
    if (weapon.kind === 'spear') {
      drawLine(s, 12, 18 + bob, 15, 2 + bob, leather, 1, 5, 0);
      drawLine(s, 15, 4 + bob, 16, 0 + bob, blade, 1, 3, 0.95);
    } else if (weapon.kind === 'scythe') {
      drawLine(s, 12, 17 + bob, 15, 3 + bob, leather, 1, 5, 0);
      drawLine(s, 15, 3 + bob, 10, 2 + bob, blade, 1, 3, 0.95);
    } else if (weapon.kind === 'greatsword') {
      fillRect(s, 11, 14 + bob, 3, 1, trim, 1, 0.35);
      drawLine(s, 12, 14 + bob, 17, 19 + bob, blade, 2, 3, 0.92);
    } else {
      fillRect(s, 11, 14 + bob, 3, 1, trim, 1, 0.35);
      drawLine(s, 12, 14 + bob, 17, 18 + bob, blade, 1, 3, 0.92);
    }
  }

  return s;
}

export function buildCreatureSprite(kind: string, pose: 'idle' | 'walk' | 'attack', frame: number): PixelSprite {
  const bob = frame % 2 === 1 ? 1 : 0;
  const atk = pose === 'attack';

  switch (kind) {
    case 'skeleton': {
      // Stark luminous warm-ivory skeleton (like Image 4: "Fixed the skeleton color")
      const s = makeSprite(16, 23, 8, 22);
      const bone: [number, number, number] = [0.98, 0.95, 0.86];
      const shadeBone: [number, number, number] = [0.76, 0.74, 0.68];
      const eye: [number, number, number] = [0.42, 0.9, 1.0];
      // Skull
      fillEllipse(s, 8, 4 + bob, 2.5, 2.7, bone, 2, 0.14);
      setPx(s, 7, 4 + bob, eye, 1.1, 3, 1.0);
      setPx(s, 9, 4 + bob, eye, 1.1, 3, 1.0);
      // Shoulders + Ribcage + Spine
      fillRect(s, 5, 8 + bob, 6, 1, bone, 2, 0.12);
      fillRect(s, 6, 9 + bob, 4, 6, bone, 2, 0.1);
      setPx(s, 7, 10 + bob, [0.06, 0.07, 0.09], 1, 0, 0);
      setPx(s, 9, 10 + bob, [0.06, 0.07, 0.09], 1, 0, 0);
      setPx(s, 7, 12 + bob, [0.06, 0.07, 0.09], 1, 0, 0);
      setPx(s, 9, 12 + bob, [0.06, 0.07, 0.09], 1, 0, 0);
      // Arms & Pelvis & Legs
      drawLine(s, 5, 9 + bob, 3, 14 + bob, shadeBone, 1, 2, 0.08);
      drawLine(s, 11, 9 + bob, 13, 14 + bob, bone, 1, 2, 0.1);
      fillRect(s, 6, 15, 1, 7, shadeBone, 2, 0.08);
      fillRect(s, 9, 15, 1, 7, bone, 2, 0.12);
      // Blade
      drawLine(s, 12, 13 + bob, atk ? 15 : 14, atk ? 12 : 4, [0.85, 0.88, 0.94], 1, 1, atk ? 0.8 : 0.25);
      return s;
    }

    case 'ghoul': {
      const s = makeSprite(15, 17, 7, 16);
      const skin: [number, number, number] = [0.58, 0.66, 0.48];
      const rag: [number, number, number] = [0.36, 0.3, 0.28];
      fillEllipse(s, 9, 5 + bob, 2.5, 2.3, skin, 0, 0);
      setPx(s, 10, 5 + bob, [1.0, 0.26, 0.14], 1, 3, 1);
      fillEllipse(s, 7, 9 + bob, 3.4, 3.2, rag, 0, 0);
      fillRect(s, 5, 12, 2, 4, skin, 0, 0);
      fillRect(s, 9, 12, 2, 4, skin, 0, 0);
      if (atk) drawLine(s, 10, 8, 14, 7, [0.95, 0.36, 0.24], 1, 3, 0.9);
      return s;
    }

    case 'wolf': {
      const s = makeSprite(18, 13, 9, 12);
      const fur: [number, number, number] = [0.62, 0.6, 0.68];
      const ember: [number, number, number] = [1.0, 0.66, 0.2];
      fillEllipse(s, 8, 6 + bob, 5.0, 2.6, fur, 0, 0);
      fillEllipse(s, 13, 4 + bob, 2.4, 1.9, fur, 0, 0);
      setPx(s, 14, 4 + bob, ember, 1, 3, 1);
      fillRect(s, 5, 8, 1, 4, fur, 0, 0);
      fillRect(s, 11, 8, 1, 4, fur, 0, 0);
      drawLine(s, 3, 6 + bob, 0, 3 + bob, fur, 1, 0, 0);
      return s;
    }

    case 'wraith': {
      const s = makeSprite(16, 23, 8, 22);
      const mist: [number, number, number] = [0.46, 0.72, 1.0];
      const core: [number, number, number] = [0.86, 0.98, 1.0];
      fillEllipse(s, 8, 5 + bob, 3.0, 3.2, mist, 0, 0.45);
      fillRect(s, 5, 8 + bob, 6, 10, mist, 0, 0.35);
      setPx(s, 7, 5 + bob, core, 1, 3, 1);
      setPx(s, 9, 5 + bob, core, 1, 3, 1);
      drawLine(s, 6, 18, 5 + bob, 22, mist, 1, 0, 0.3);
      drawLine(s, 10, 18, 11 - bob, 22, mist, 1, 0, 0.3);
      return s;
    }

    case 'specter': {
      const s = makeSprite(17, 23, 8, 22);
      const armor: [number, number, number] = [0.54, 0.64, 0.84];
      const cloak: [number, number, number] = [0.28, 0.38, 0.66];
      const blade: [number, number, number] = [0.58, 0.94, 1.0];
      fillRect(s, 3, 8 + bob, 10, 12, cloak, 0, 0.2);
      fillRect(s, 5, 7 + bob, 7, 9, armor, 1, 0.25);
      fillEllipse(s, 8, 4 + bob, 2.6, 2.8, armor, 1, 0.28);
      fillRect(s, 7, 4 + bob, 3, 1, blade, 3, 1.0);
      drawLine(s, 12, 11 + bob, atk ? 16 : 14, atk ? 11 : 2, blade, 1, 3, 0.95);
      return s;
    }

    case 'bogwitch': {
      const s = makeSprite(16, 23, 8, 22);
      const robe: [number, number, number] = [0.26, 0.52, 0.36];
      const glow: [number, number, number] = [0.46, 1.0, 0.7];
      drawLine(s, 8, 0 + bob, 5, 5 + bob, robe, 2, 0, 0);
      drawLine(s, 8, 0 + bob, 10, 5 + bob, robe, 2, 0, 0);
      fillRect(s, 3, 5 + bob, 10, 1, robe, 0, 0);
      fillRect(s, 6, 6 + bob, 4, 3, [0.58, 0.68, 0.6], 0, 0);
      setPx(s, 7, 7 + bob, glow, 1, 3, 1);
      setPx(s, 9, 7 + bob, glow, 1, 3, 1);
      fillRect(s, 5, 9 + bob, 6, 12, robe, 0, 0);
      drawLine(s, 13, 5 + bob, 13, 21, [0.48, 0.36, 0.24], 1, 5, 0);
      fillEllipse(s, 13, 4 + bob, 1.5, 1.5, glow, 3, 1.0);
      return s;
    }

    case 'wight': {
      const s = makeSprite(26, 36, 13, 35);
      const bone: [number, number, number] = [0.98, 0.94, 0.84];
      const gold: [number, number, number] = [0.98, 0.8, 0.36];
      const cloak: [number, number, number] = [0.52, 0.14, 0.16];
      const eye: [number, number, number] = [1.0, 0.25, 0.18];
      fillRect(s, 5, 12 + bob, 16, 20, cloak, 0, 0);
      fillRect(s, 8, 12 + bob, 10, 13, bone, 2, 0.12);
      fillRect(s, 8, 2 + bob, 10, 3, gold, 1, 0.45);
      fillEllipse(s, 13, 7 + bob, 4.2, 3.8, bone, 2, 0.15);
      fillRect(s, 10, 7 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 14, 7 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 9, 25, 3, 10, bone, 2, 0.1);
      fillRect(s, 14, 25, 3, 10, bone, 2, 0.1);
      drawLine(s, 20, 16 + bob, atk ? 25 : 23, atk ? 15 : 2, [1.0, 0.38, 0.22], 2, 3, 1.0);
      return s;
    }

    case 'matron': {
      const s = makeSprite(26, 36, 13, 35);
      const veil: [number, number, number] = [0.24, 0.72, 0.62];
      const glow: [number, number, number] = [0.58, 1.0, 0.88];
      fillEllipse(s, 13, 8 + bob, 5.2, 5.6, veil, 0, 0.35);
      fillRect(s, 6, 13 + bob, 14, 19, veil, 0, 0.28);
      fillRect(s, 10, 7 + bob, 2, 1, glow, 3, 1.0);
      fillRect(s, 14, 7 + bob, 2, 1, glow, 3, 1.0);
      if (atk) {
        fillEllipse(s, 3, 15, 2.4, 2.4, glow, 3, 1.0);
        fillEllipse(s, 23, 15, 2.4, 2.4, glow, 3, 1.0);
      }
      return s;
    }

    case 'corvus': {
      const s = makeSprite(26, 36, 13, 35);
      const iron: [number, number, number] = [0.48, 0.44, 0.46];
      const ember: [number, number, number] = [1.0, 0.5, 0.14];
      const cloak: [number, number, number] = [0.74, 0.24, 0.08];
      fillRect(s, 5, 12 + bob, 16, 20, cloak, 0, 0.12);
      fillRect(s, 7, 11 + bob, 12, 14, iron, 1, 0);
      fillEllipse(s, 13, 6 + bob, 4.2, 4.4, iron, 1, 0);
      fillRect(s, 10, 6 + bob, 6, 2, ember, 3, 1.0);
      fillRect(s, 8, 25, 4, 10, iron, 1, 0);
      fillRect(s, 14, 25, 4, 10, iron, 1, 0);
      drawLine(s, 20, 16 + bob, atk ? 25 : 23, atk ? 17 : 1, ember, 3, 3, 1.0);
      return s;
    }

    case 'bishop': {
      const s = makeSprite(30, 42, 15, 41);
      const crimson: [number, number, number] = [0.72, 0.1, 0.14];
      const pale: [number, number, number] = [0.95, 0.93, 0.88];
      const gold: [number, number, number] = [0.98, 0.84, 0.38];
      const eye: [number, number, number] = [1.0, 0.24, 0.28];
      drawLine(s, 15, 1 + bob, 11, 10 + bob, gold, 2, 1, 0.4);
      drawLine(s, 15, 1 + bob, 19, 10 + bob, gold, 2, 1, 0.4);
      fillRect(s, 12, 5 + bob, 6, 5, gold, 1, 0.35);
      fillEllipse(s, 15, 12 + bob, 4.2, 4.2, pale, 0, 0.18);
      fillRect(s, 12, 12 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 16, 12 + bob, 2, 1, eye, 3, 1.0);
      fillRect(s, 7, 16 + bob, 16, 23, crimson, 0, 0.12);
      fillRect(s, 12, 16 + bob, 6, 22, gold, 1, 0.28);
      drawLine(s, 25, 7 + bob, 25, 40, gold, 2, 1, 0.4);
      fillEllipse(s, 25, 6 + bob, 2.8, 2.8, [1.0, 0.9, 0.48], 3, 1.0);
      return s;
    }

    case 'smith': {
      const s = makeSprite(20, 23, 9, 22);
      fillEllipse(s, 8, 5 + bob, 2.6, 2.6, [0.78, 0.64, 0.52], 0, 0);
      fillRect(s, 5, 8 + bob, 6, 13, [0.48, 0.28, 0.2], 0, 0);
      fillRect(s, 6, 9 + bob, 4, 10, [0.32, 0.22, 0.18], 0, 0);
      fillRect(s, 13, 16, 6, 6, [0.42, 0.44, 0.5], 1, 0);
      fillRect(s, 12, 15, 8, 2, [0.56, 0.58, 0.64], 1, 0);
      fillRect(s, 14, 14, 4, 1, [1.0, 0.58, 0.16], 3, 1.0);
      return s;
    }

    case 'merchant': {
      const s = makeSprite(18, 23, 9, 22);
      fillRect(s, 2, 8 + bob, 4, 9, [0.54, 0.4, 0.26], 5, 0);
      fillEllipse(s, 9, 5 + bob, 2.5, 2.6, [0.32, 0.58, 0.48], 0, 0);
      fillRect(s, 8, 5 + bob, 3, 2, [0.84, 0.78, 0.68], 0, 0);
      fillRect(s, 6, 8 + bob, 6, 14, [0.32, 0.58, 0.48], 0, 0);
      fillRect(s, 6, 14 + bob, 6, 1, [0.94, 0.76, 0.34], 1, 0.22);
      fillEllipse(s, 15, 11 + bob, 1.6, 1.6, [1.0, 0.8, 0.34], 3, 1.0);
      return s;
    }

    case 'maren':
    default: {
      const s = makeSprite(18, 23, 9, 22);
      fillEllipse(s, 9, 5 + bob, 2.6, 2.8, [0.38, 0.42, 0.62], 0, 0);
      fillRect(s, 8, 5 + bob, 3, 2, [0.86, 0.82, 0.74], 0, 0);
      fillRect(s, 6, 8 + bob, 6, 14, [0.36, 0.4, 0.58], 0, 0);
      fillRect(s, 8, 8 + bob, 2, 14, [0.82, 0.86, 0.94], 1, 0.18);
      drawLine(s, 15, 6 + bob, 15, 22, [0.5, 0.4, 0.3], 1, 5, 0);
      fillEllipse(s, 15, 5 + bob, 1.8, 1.8, [1.0, 0.78, 0.34], 3, 1.0);
      return s;
    }
  }
}

/**
 * Towering, atmospheric, high-detail World Props inspired directly by Images 1-4:
 * - Ancient tall pines with textured vertical weathered trunks, mossy tufts on bark,
 *   lush multi-layered overhanging canopies & subtle cyan dew specks (Image 1!).
 */
export function buildPropSprite(kind: string, variant = 0, animFrame = 0): PixelSprite | null {
  switch (kind) {
    case 'pine': {
      const h = variant === 0 ? 34 : variant === 1 ? 40 : 46;
      const w = variant === 0 ? 25 : variant === 1 ? 29 : 33;
      const cx = w >> 1;
      const s = makeSprite(w, h, cx, h - 1);
      const bark: [number, number, number] = [0.58, 0.56, 0.52];
      const darkMoss: [number, number, number] = [0.09, 0.27, 0.12];
      const hiMoss: [number, number, number] = [0.26, 0.62, 0.26];

      // Tall slender weathered bark trunk (just like Image 1!)
      const trunkW = variant === 2 ? 5 : 4;
      const trunkTop = Math.round(h * 0.28);
      fillRect(s, cx - (trunkW >> 1), trunkTop, trunkW, h - trunkTop, bark, 5, 0);
      // Flared mossy roots
      drawLine(s, cx - 2, h - 3, cx - 5, h - 1, bark, 1, 5, 0);
      drawLine(s, cx + 2, h - 3, cx + 5, h - 1, bark, 1, 5, 0);

      // Small mossy foliage tufts clinging halfway down trunk (exact Image 1 detail!)
      fillFoliageCluster(s, cx - 3, Math.round(h * 0.62), 4, 2.5, darkMoss, hiMoss, variant * 31 + 3);
      fillFoliageCluster(s, cx + 3, Math.round(h * 0.52), 4.5, 2.8, darkMoss, hiMoss, variant * 31 + 9);

      // Lush feathery overhanging canopy crown
      fillFoliageCluster(s, cx, Math.round(h * 0.34), w * 0.45, h * 0.15, darkMoss, hiMoss, variant * 31 + 11);
      fillFoliageCluster(s, cx - 2, Math.round(h * 0.22), w * 0.38, h * 0.13, darkMoss, hiMoss, variant * 31 + 17);
      fillFoliageCluster(s, cx + 2, Math.round(h * 0.14), w * 0.28, h * 0.11, darkMoss, hiMoss, variant * 31 + 23);
      return s;
    }

    case 'deadtree':
    case 'burnt': {
      const burnt = kind === 'burnt';
      const s = makeSprite(25, 34, 12, 33);
      const wood: [number, number, number] = burnt ? [0.28, 0.24, 0.24] : [0.56, 0.53, 0.48];
      fillRect(s, 10, 11, 4, 23, wood, 5, 0);
      drawLine(s, 10, 31, 6, 33, wood, 2, 5, 0);
      drawLine(s, 13, 31, 17, 33, wood, 2, 5, 0);
      drawLine(s, 11, 15, 3, 6, wood, 2, 5, 0);
      drawLine(s, 13, 14, 21, 7, wood, 2, 5, 0);
      drawLine(s, 7, 10, 2, 1, wood, 1, 5, 0);
      drawLine(s, 17, 10, 22, 2, wood, 1, 5, 0);
      drawLine(s, 12, 12, 12, 2, wood, 2, 5, 0);
      if (burnt) {
        setPx(s, 12, 15, [1.0, 0.5, 0.14], 1.2, 3, 1.0);
        setPx(s, 10, 22, [1.0, 0.42, 0.1], 1.1, 3, 0.9);
        setPx(s, 14, 11, [1.0, 0.56, 0.16], 1.2, 3, 1.0);
      }
      return s;
    }

    case 'shrineLit':
    case 'shrineDark': {
      const lit = kind === 'shrineLit';
      const s = makeSprite(19, 26, 9, 25);
      const stone: [number, number, number] = [0.66, 0.68, 0.72];
      const darkStone: [number, number, number] = [0.46, 0.48, 0.54];
      fillRect(s, 1, 22, 17, 4, darkStone, 2, 0);
      fillRect(s, 3, 19, 13, 3, stone, 2, 0);
      fillRect(s, 6, 10, 7, 9, stone, 2, 0);
      fillRect(s, 5, 9, 9, 2, darkStone, 2, 0);
      fillRect(s, 9, 12, 1, 5, lit ? [1.0, 0.74, 0.28] : [0.36, 0.4, 0.48], lit ? 3 : 2, lit ? 0.92 : 0);
      if (lit) {
        const f = animFrame % 3;
        fillEllipse(s, 9, 6, 3.2, 3.0, [1.0, 0.5, 0.14], 3, 0.98);
        fillEllipse(s, 9 + (f - 1) * 0.5, 3, 2.0, 2.4, [1.0, 0.86, 0.38], 3, 1.0);
        setPx(s, 9, 4, [1.0, 0.98, 0.9], 1.2, 3, 1.0);
      } else {
        fillEllipse(s, 9, 8, 1.6, 1.0, [0.58, 0.3, 0.16], 3, 0.38);
      }
      return s;
    }

    case 'pillar': {
      const s = makeSprite(11, 28, 5, 27);
      const stone: [number, number, number] = [0.66, 0.68, 0.72];
      const groove: [number, number, number] = [0.44, 0.46, 0.52];
      const cap: [number, number, number] = [0.76, 0.78, 0.82];
      fillRect(s, 1, 24, 9, 4, cap, 2, 0);
      fillRect(s, 2, 3, 7, 21, stone, 2, 0);
      fillRect(s, 4, 4, 1, 19, groove, 2, 0);
      fillRect(s, 6, 4, 1, 19, groove, 2, 0);
      fillRect(s, 1, 0, 9, 3, cap, 2, 0);
      // Moss drape near top of column
      fillFoliageCluster(s, 3, 4, 2.8, 1.6, [0.1, 0.3, 0.12], [0.28, 0.62, 0.26], 41);
      return s;
    }

    case 'brazier':
    case 'campfire': {
      const s = makeSprite(11, 13, 5, 12);
      const iron: [number, number, number] = kind === 'brazier' ? [0.46, 0.48, 0.54] : [0.48, 0.34, 0.2];
      if (kind === 'brazier') {
        drawLine(s, 2, 12, 4, 8, iron, 1, 1, 0);
        drawLine(s, 8, 12, 6, 8, iron, 1, 1, 0);
      } else {
        fillRect(s, 1, 10, 9, 2, iron, 5, 0);
      }
      fillRect(s, 1, 7, 9, 3, iron, 1, 0);
      const f = animFrame % 3;
      fillEllipse(s, 5, 5, 2.8, 2.2, [1.0, 0.52, 0.14], 3, 0.98);
      fillEllipse(s, 5 + (f - 1) * 0.4, 3, 1.6, 1.8, [1.0, 0.88, 0.4], 3, 1.0);
      return s;
    }

    case 'signpost': {
      const s = makeSprite(13, 16, 6, 15);
      const wood: [number, number, number] = [0.54, 0.42, 0.28];
      const plank: [number, number, number] = [0.72, 0.58, 0.4];
      fillRect(s, 6, 3, 2, 13, wood, 5, 0);
      fillRect(s, 1, 2, 11, 2, plank, 5, 0);
      fillRect(s, 2, 6, 10, 2, plank, 5, 0);
      return s;
    }

    case 'chestClosed':
    case 'chestOpen': {
      const open = kind === 'chestOpen';
      const s = makeSprite(12, 9, 6, 8);
      const wood: [number, number, number] = [0.54, 0.36, 0.22];
      const gold: [number, number, number] = open ? [0.46, 0.42, 0.34] : [0.98, 0.82, 0.36];
      fillRect(s, 1, 3, 10, 6, wood, 5, 0);
      fillRect(s, 1, 2, 10, 1, gold, 1, open ? 0 : 0.45);
      fillRect(s, 1, 3, 1, 6, gold, 1, 0.2);
      fillRect(s, 10, 3, 1, 6, gold, 1, 0.2);
      fillRect(s, 5, 4, 2, 2, gold, 3, open ? 0 : 0.78);
      return s;
    }

    case 'lore':
    case 'loreRead': {
      const unread = kind === 'lore';
      const s = makeSprite(11, 16, 5, 15);
      const stone: [number, number, number] = [0.62, 0.65, 0.72];
      fillRect(s, 1, 13, 9, 3, [0.46, 0.48, 0.54], 2, 0);
      fillRect(s, 2, 1, 7, 12, stone, 2, 0);
      if (unread) {
        fillRect(s, 5, 3, 1, 7, [0.5, 0.84, 1.0], 3, 1.0);
      }
      return s;
    }

    case 'tomb': {
      const s = makeSprite(11, 14, 5, 13);
      fillEllipse(s, 5, 5, 3.6, 3.4, [0.6, 0.62, 0.68], 2, 0);
      fillRect(s, 2, 5, 7, 9, [0.56, 0.58, 0.64], 2, 0);
      return s;
    }

    case 'cross': {
      const s = makeSprite(11, 16, 5, 15);
      const st: [number, number, number] = [0.64, 0.66, 0.72];
      fillRect(s, 5, 1, 2, 15, st, 2, 0);
      fillRect(s, 1, 5, 10, 2, st, 2, 0);
      return s;
    }

    case 'rock': {
      const s = makeSprite(14, 9, 7, 8);
      fillEllipse(s, 7, 6, 5.8, 3.6, [0.56, 0.6, 0.66], 2, 0);
      fillFoliageCluster(s, 5, 3, 3.5, 1.6, [0.1, 0.32, 0.14], [0.28, 0.6, 0.24], 67);
      return s;
    }

    case 'menhir': {
      const s = makeSprite(11, 22, 5, 21);
      fillRect(s, 2, 2, 7, 20, [0.58, 0.62, 0.7], 2, 0);
      fillRect(s, 5, 5, 1, 9, [0.5, 0.8, 1.0], 3, 0.88);
      return s;
    }

    case 'altar': {
      const s = makeSprite(18, 12, 9, 11);
      fillRect(s, 1, 6, 16, 6, [0.54, 0.54, 0.58], 2, 0);
      fillRect(s, 0, 3, 18, 3, [0.7, 0.7, 0.74], 2, 0);
      fillRect(s, 6, 5, 6, 6, [0.74, 0.14, 0.16], 0, 0.25);
      return s;
    }

    case 'cave': {
      const s = makeSprite(26, 20, 13, 19);
      fillEllipse(s, 13, 12, 12.2, 9.8, [0.52, 0.56, 0.64], 2, 0);
      fillFoliageCluster(s, 13, 4, 8.5, 3.2, [0.09, 0.28, 0.12], [0.24, 0.58, 0.24], 91);
      fillEllipse(s, 13, 14, 6.8, 6.8, [0.02, 0.03, 0.05], 0, 0);
      fillEllipse(s, 5, 13, 1.4, 1.6, [1.0, 0.58, 0.18], 3, 0.95);
      fillEllipse(s, 21, 13, 1.4, 1.6, [1.0, 0.58, 0.18], 3, 0.95);
      return s;
    }

    default:
      return null;
  }
}

export function buildPlayerPortraitAscii(armor: ArmorDef): string {
  const accent = armor.id === 'cinder_mantle' ? '*' : armor.id === 'sentinel_mail' ? '+' : 'o';
  return [
    `  _${accent}_  `,
    ' /###\\ ',
    ' |=#=| ',
    '/|###|\\',
    ' |###| ',
    ' /| |\\ ',
  ].join('\n');
}
