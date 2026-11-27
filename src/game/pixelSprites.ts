import type { ArmorDef, WeaponDef } from './types.ts';

/**
 * High-resolution procedural pixel-art sprite representation.
 * Each pixel has RGB color, emissive flag, and material hint so the Image->ASCII
 * pipeline converts figures into rich ~14x26 (player) and ~30x46 (boss) ASCII art.
 */
export interface PixelSprite {
  w: number;
  h: number;
  ax: number; // anchor X (centre)
  ay: number; // anchor Y (feet)
  // Flat arrays length w*h
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Uint8Array; // 0 = transparent, 1 = opaque
  em: Float32Array; // 0..1 emissive
  mat: Uint8Array; // 0 = cloth/skin, 1 = steel/armor, 2 = bone, 3 = glow/blade, 4 = wood/foliage
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
  s.r[i] = col[0] * shade;
  s.g[i] = col[1] * shade;
  s.b[i] = col[2] * shade;
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
    for (let i = 0; i < w; i++) {
      const sh = grad ? 0.78 + 0.34 * (1 - j / Math.max(1, h)) + 0.14 * (1 - Math.abs(i / Math.max(1, w - 1) - 0.5) * 2) : 1;
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
        const sh = 0.72 + 0.48 * Math.max(0, 1 - Math.sqrt(d2) * 0.75) - ny * 0.15;
        setPx(s, x, y, col, sh, mat, em);
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
 * Generates the player knight sprite (~16x24 cells) with visible armor, cloak, and glowing weapon.
 */
export function buildKnightSprite(
  armor: ArmorDef,
  weapon: WeaponDef,
  pose: AnimPose,
  frame: number,
  scale = 1,
): PixelSprite {
  const W = Math.round(16 * scale);
  const H = Math.round(24 * scale);
  const s = makeSprite(W, H, Math.round(8 * scale), H - 1);
  const sc = (v: number) => Math.round(v * scale);

  const steel = armor.steelColor;
  const cloak = armor.cloakColor;
  const trim = armor.trimColor;
  const dark: [number, number, number] = [0.22, 0.21, 0.25];
  const visor: [number, number, number] = [1.0, 0.78, 0.35];

  if (pose === 'roll') {
    fillEllipse(s, sc(8), sc(17), sc(4.5), sc(4.2), cloak, 0, 0);
    fillEllipse(s, sc(8), sc(16), sc(3), sc(2.8), steel, 1, 0);
    return s;
  }

  const bob = pose === 'idle' ? (frame % 2 === 1 ? 1 : 0) : pose === 'walk' ? (frame % 2 === 0 ? -1 : 0) : 0;
  const stride = pose === 'walk' ? Math.round(Math.sin(frame * 1.1) * 2.2) : 0;

  // Flowing cloak behind body
  const cloakSway = pose === 'walk' ? -1 - (frame % 2) : frame % 2 === 1 ? -1 : 0;
  fillRect(s, sc(4 + cloakSway), sc(8 + bob), sc(7), sc(11), cloak, 0, 0);
  fillRect(s, sc(3 + cloakSway), sc(12 + bob), sc(4), sc(8), cloak, 0, 0);

  // Legs / greaves
  fillRect(s, sc(6 - Math.max(0, stride)), sc(17), sc(2), sc(6), dark, 1, 0);
  fillRect(s, sc(8 + Math.max(0, stride)), sc(17), sc(2), sc(6), steel, 1, 0);

  // Torso plate + gold trim belt
  fillRect(s, sc(5), sc(8 + bob), sc(6), sc(9), steel, 1, 0);
  fillRect(s, sc(5), sc(14 + bob), sc(6), sc(1), trim, 1, 0.15);
  // Pauldrons
  fillEllipse(s, sc(5), sc(9 + bob), sc(2.2), sc(1.8), steel, 1, 0);
  fillEllipse(s, sc(11), sc(9 + bob), sc(2.2), sc(1.8), steel, 1, 0);

  // Helmet + crest + glowing visor
  fillEllipse(s, sc(8), sc(5 + bob), sc(2.7), sc(3.1), steel, 1, 0);
  fillRect(s, sc(7), sc(1 + bob), sc(2), sc(2), cloak, 0, 0);
  fillRect(s, sc(7), sc(5 + bob), sc(3), sc(1), visor, 3, 0.9);

  // Weapon / Action pose
  const blade = weapon.glowColor;
  if (pose === 'drink') {
    fillRect(s, sc(10), sc(7 + bob), sc(2), sc(3), [1.0, 0.65, 0.18], 3, 0.95);
  } else if (pose === 'parry') {
    drawLine(s, sc(11), sc(5), sc(12), sc(16), [0.85, 0.95, 1.0], sc(2), 3, 1.0);
  } else if (pose === 'attack1' || pose === 'attack2' || pose === 'attack3') {
    const ext = weapon.kind === 'spear' ? 7 : weapon.kind === 'greatsword' ? 6 : 5;
    const yEnd = pose === 'attack2' ? 6 : pose === 'attack3' ? 14 : 10;
    drawLine(s, sc(11), sc(11 + bob), sc(11 + ext), sc(yEnd), blade, sc(weapon.kind === 'greatsword' ? 2 : 1), 3, 0.95);
  } else {
    // Held glowing blade at side
    const len = weapon.kind === 'spear' ? 11 : weapon.kind === 'greatsword' ? 10 : 8;
    drawLine(s, sc(12), sc(12 + bob), sc(13), sc(Math.max(2, 12 + bob - len)), blade, sc(1), 3, 0.72);
  }

  return s;
}

/**
 * Generates high-detail enemy and boss sprites (normal enemies ~14x20, bosses ~30x42).
 */
export function buildCreatureSprite(kind: string, pose: 'idle' | 'walk' | 'attack', frame: number): PixelSprite {
  const bob = frame % 2 === 1 ? 1 : 0;
  const atk = pose === 'attack';

  switch (kind) {
    case 'skeleton': {
      // Warm bone white! (explicitly fixed from Stage 1 grey)
      const s = makeSprite(14, 20, 7, 19);
      const bone: [number, number, number] = [0.94, 0.9, 0.78];
      const rust: [number, number, number] = [0.55, 0.42, 0.34];
      const eye: [number, number, number] = [0.35, 0.85, 1.0];
      fillEllipse(s, 7, 4 + bob, 2.5, 2.6, bone, 2, 0);
      setPx(s, 6, 4 + bob, eye, 1, 3, 1);
      setPx(s, 8, 4 + bob, eye, 1, 3, 1);
      // Ribcage
      fillRect(s, 5, 7 + bob, 4, 6, bone, 2, 0);
      setPx(s, 6, 9 + bob, [0.15, 0.14, 0.16], 1, 0, 0);
      setPx(s, 8, 9 + bob, [0.15, 0.14, 0.16], 1, 0, 0);
      setPx(s, 6, 11 + bob, [0.15, 0.14, 0.16], 1, 0, 0);
      setPx(s, 8, 11 + bob, [0.15, 0.14, 0.16], 1, 0, 0);
      // Legs
      fillRect(s, 5, 13, 1, 6, bone, 2, 0);
      fillRect(s, 8, 13, 1, 6, bone, 2, 0);
      // Shield & blade
      fillRect(s, 3, 8 + bob, 2, 5, rust, 1, 0);
      drawLine(s, 10, 10 + bob, atk ? 13 : 11, atk ? 10 : 4, [0.78, 0.8, 0.86], 1, 1, atk ? 0.6 : 0.1);
      return s;
    }

    case 'ghoul': {
      const s = makeSprite(14, 16, 7, 15);
      const skin: [number, number, number] = [0.56, 0.62, 0.46];
      const rag: [number, number, number] = [0.38, 0.32, 0.28];
      fillEllipse(s, 8, 5 + bob, 2.6, 2.4, skin, 0, 0);
      setPx(s, 9, 5 + bob, [1.0, 0.25, 0.12], 1, 3, 1);
      fillEllipse(s, 6, 9 + bob, 3.4, 3.2, rag, 0, 0);
      fillRect(s, 4, 12, 2, 4, skin, 0, 0);
      fillRect(s, 8, 12, 2, 4, skin, 0, 0);
      if (atk) drawLine(s, 9, 8, 13, 7, [0.95, 0.35, 0.25], 1, 3, 0.8);
      return s;
    }

    case 'wolf': {
      const s = makeSprite(16, 12, 8, 11);
      const fur: [number, number, number] = [0.58, 0.56, 0.62];
      const ember: [number, number, number] = [1.0, 0.62, 0.18];
      fillEllipse(s, 7, 6 + bob, 4.5, 2.4, fur, 0, 0);
      fillEllipse(s, 12, 4 + bob, 2.2, 1.8, fur, 0, 0);
      setPx(s, 13, 4 + bob, ember, 1, 3, 1);
      fillRect(s, 4, 8, 1, 4, fur, 0, 0);
      fillRect(s, 10, 8, 1, 4, fur, 0, 0);
      drawLine(s, 2, 5 + bob, 0, 3 + bob, fur, 1, 0, 0);
      return s;
    }

    case 'wraith': {
      const s = makeSprite(14, 20, 7, 19);
      const mist: [number, number, number] = [0.42, 0.68, 1.0];
      const core: [number, number, number] = [0.78, 0.94, 1.0];
      fillEllipse(s, 7, 5 + bob, 3, 3.2, mist, 0, 0.45);
      fillRect(s, 4, 8 + bob, 6, 8, mist, 0, 0.35);
      setPx(s, 6, 5 + bob, core, 1, 3, 1);
      setPx(s, 8, 5 + bob, core, 1, 3, 1);
      // Wispy tail
      drawLine(s, 5, 16, 4 + bob, 19, mist, 1, 0, 0.3);
      drawLine(s, 9, 16, 10 - bob, 19, mist, 1, 0, 0.3);
      return s;
    }

    case 'specter': {
      // New Stage 2 enemy: Ritter-Gespenst
      const s = makeSprite(16, 24, 8, 23);
      const armor: [number, number, number] = [0.46, 0.54, 0.72];
      const cloak: [number, number, number] = [0.28, 0.38, 0.62];
      const blade: [number, number, number] = [0.55, 0.9, 1.0];
      fillRect(s, 4, 8 + bob, 8, 12, cloak, 0, 0.2);
      fillRect(s, 5, 7 + bob, 6, 9, armor, 1, 0.2);
      fillEllipse(s, 8, 4 + bob, 2.8, 3, armor, 1, 0.25);
      fillRect(s, 7, 4 + bob, 3, 1, blade, 3, 1.0);
      drawLine(s, 12, 10 + bob, atk ? 15 : 13, atk ? 10 : 2, blade, 1, 3, 0.9);
      return s;
    }

    case 'bogwitch': {
      // New Stage 2 enemy: Moorhexe
      const s = makeSprite(14, 22, 7, 21);
      const robe: [number, number, number] = [0.24, 0.46, 0.34];
      const glow: [number, number, number] = [0.45, 1.0, 0.68];
      // Pointed hat
      drawLine(s, 7, 0 + bob, 4, 5 + bob, robe, 2, 0, 0);
      drawLine(s, 7, 0 + bob, 9, 5 + bob, robe, 2, 0, 0);
      fillRect(s, 3, 5 + bob, 8, 1, robe, 0, 0);
      fillRect(s, 5, 6 + bob, 4, 3, [0.55, 0.65, 0.56], 0, 0);
      setPx(s, 6, 7 + bob, glow, 1, 3, 1);
      setPx(s, 8, 7 + bob, glow, 1, 3, 1);
      fillRect(s, 4, 9 + bob, 6, 11, robe, 0, 0);
      // Staff
      drawLine(s, 11, 5 + bob, 11, 20, [0.45, 0.34, 0.22], 1, 4, 0);
      fillEllipse(s, 11, 4 + bob, 1.4, 1.4, glow, 3, 1.0);
      return s;
    }

    case 'wight': {
      // Boss 1: Vael, der Gebeinkönig (~28x38)
      const s = makeSprite(28, 38, 14, 37);
      const bone: [number, number, number] = [0.95, 0.9, 0.78];
      const gold: [number, number, number] = [0.95, 0.76, 0.32];
      const cloak: [number, number, number] = [0.44, 0.14, 0.16];
      const eye: [number, number, number] = [1.0, 0.25, 0.18];
      fillRect(s, 6, 12 + bob, 16, 22, cloak, 0, 0);
      fillRect(s, 9, 12 + bob, 10, 14, bone, 2, 0);
      fillRect(s, 9, 3 + bob, 10, 3, gold, 1, 0.35); // Crown
      fillEllipse(s, 14, 8 + bob, 4.5, 4.2, bone, 2, 0);
      fillRect(s, 11, 8 + bob, 2, 2, eye, 3, 1.0);
      fillRect(s, 15, 8 + bob, 2, 2, eye, 3, 1.0);
      fillRect(s, 10, 26, 3, 11, bone, 2, 0);
      fillRect(s, 15, 26, 3, 11, bone, 2, 0);
      drawLine(s, 21, 18 + bob, atk ? 27 : 24, atk ? 16 : 3, [1.0, 0.35, 0.22], 2, 3, 0.95);
      return s;
    }

    case 'matron': {
      // Boss 2: Die Ertrunkene Mutter (~28x40)
      const s = makeSprite(28, 40, 14, 39);
      const veil: [number, number, number] = [0.24, 0.66, 0.58];
      const glow: [number, number, number] = [0.55, 1.0, 0.85];
      fillEllipse(s, 14, 9 + bob, 5.5, 6, veil, 0, 0.35);
      fillRect(s, 7, 14 + bob, 14, 20, veil, 0, 0.28);
      fillRect(s, 11, 8 + bob, 2, 2, glow, 3, 1.0);
      fillRect(s, 15, 8 + bob, 2, 2, glow, 3, 1.0);
      if (atk) {
        fillEllipse(s, 4, 16, 2.5, 2.5, glow, 3, 1.0);
        fillEllipse(s, 24, 16, 2.5, 2.5, glow, 3, 1.0);
      }
      return s;
    }

    case 'corvus': {
      // Boss 3: Corvus, der Aschenritter (~28x40)
      const s = makeSprite(28, 40, 14, 39);
      const iron: [number, number, number] = [0.42, 0.38, 0.38];
      const ember: [number, number, number] = [1.0, 0.48, 0.14];
      const cloak: [number, number, number] = [0.68, 0.22, 0.08];
      fillRect(s, 6, 13 + bob, 16, 22, cloak, 0, 0.1);
      fillRect(s, 8, 12 + bob, 12, 15, iron, 1, 0);
      fillEllipse(s, 14, 7 + bob, 4.5, 4.8, iron, 1, 0);
      fillRect(s, 11, 7 + bob, 6, 2, ember, 3, 1.0);
      fillRect(s, 9, 27, 4, 12, iron, 1, 0);
      fillRect(s, 15, 27, 4, 12, iron, 1, 0);
      drawLine(s, 21, 18 + bob, atk ? 27 : 25, atk ? 20 : 2, ember, 3, 3, 1.0);
      return s;
    }

    case 'bishop': {
      // Final Boss: Der Bleiche Bischof (~32x46)
      const s = makeSprite(32, 46, 16, 45);
      const crimson: [number, number, number] = [0.68, 0.1, 0.14];
      const pale: [number, number, number] = [0.92, 0.9, 0.85];
      const gold: [number, number, number] = [0.98, 0.82, 0.36];
      const eye: [number, number, number] = [1.0, 0.22, 0.26];
      // Tall mitre crown
      drawLine(s, 16, 1 + bob, 12, 10 + bob, gold, 2, 1, 0.4);
      drawLine(s, 16, 1 + bob, 20, 10 + bob, gold, 2, 1, 0.4);
      fillRect(s, 13, 5 + bob, 6, 5, gold, 1, 0.3);
      fillEllipse(s, 16, 13 + bob, 4.5, 4.5, pale, 0, 0.15);
      fillRect(s, 13, 13 + bob, 2, 2, eye, 3, 1.0);
      fillRect(s, 17, 13 + bob, 2, 2, eye, 3, 1.0);
      // Cathedral vestments
      fillRect(s, 8, 17 + bob, 16, 26, crimson, 0, 0.1);
      fillRect(s, 13, 17 + bob, 6, 24, gold, 1, 0.25);
      // Sun-staff
      drawLine(s, 26, 8 + bob, 26, 43, gold, 2, 1, 0.35);
      fillEllipse(s, 26, 6 + bob, 3, 3, [1.0, 0.88, 0.45], 3, 1.0);
      return s;
    }

    case 'maren':
    case 'smith':
    case 'merchant':
    default: {
      const s = makeSprite(14, 20, 7, 19);
      const cloak: [number, number, number] =
        kind === 'maren'
          ? [0.36, 0.38, 0.5]
          : kind === 'smith'
            ? [0.64, 0.32, 0.18]
            : [0.34, 0.54, 0.44];
      const hood: [number, number, number] = [0.78, 0.74, 0.66];
      fillEllipse(s, 7, 5 + bob, 2.5, 2.8, cloak, 0, 0);
      fillRect(s, 6, 5 + bob, 3, 2, hood, 0, 0);
      fillRect(s, 4, 8 + bob, 6, 10, cloak, 0, 0);
      // Lantern / anvil glow
      fillEllipse(s, 11, 10 + bob, 1.4, 1.4, [1.0, 0.72, 0.28], 3, 0.95);
      return s;
    }
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
