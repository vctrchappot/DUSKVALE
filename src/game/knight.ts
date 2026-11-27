import { makeSprite, type AnimPose, type PixelSprite } from './pixelSprites.ts';
import type { ArmorDef, WeaponDef } from './types.ts';

const WIDTH = 128;
const HEIGHT = 111;
const FOOT_X = 48;
const FOOT_Y = 93;

export function knightAnimationFrame(pose: AnimPose, time: number, walkTime: number, attackLeft: number, attackDuration: number, rollLeft: number): number {
  if (pose === 'walk') return Math.floor(walkTime * 9) % 6;
  if (pose.startsWith('attack') || pose === 'roll') {
    const progress = pose === 'roll' ? 1 - rollLeft / 0.32 : 1 - attackLeft / attackDuration;
    return Math.min(5, Math.max(0, Math.floor(progress * 6)));
  }
  return Math.floor(time * 2.5) % 2;
}

function tint(rgb: readonly number[], level: number): string {
  return `rgb(${rgb.map(v => Math.round(Math.min(1, v * level) * 255)).join(',')})`;
}

// Reduce the painted frame to two local ink colours per cell. At the silhouette,
// the second colour comes from the scene so the background shows through.
function encodeFrame(pixels: Uint8ClampedArray): PixelSprite {
  const s = makeSprite(WIDTH / 2, HEIGHT / 3, FOOT_X / 2, FOOT_Y / 3);
  const mask = new Uint8Array(s.a.length);
  const ground = new Float32Array(s.a.length * 3);
  const cutout = new Uint8Array(s.a.length);
  s.detail = { mask, ground, cutout };
  const offsets = new Int32Array(6);
  const levels = new Float32Array(6);
  for (let i = 0; i < s.a.length; i++) {
    let occupied = 0;
    let total = 0;
    const origin = ((i % s.w) * 2 + Math.floor(i / s.w) * 3 * WIDTH) * 4;
    for (let bit = 0; bit < 6; bit++) {
      const p = origin + ((bit % 2) + Math.floor(bit / 2) * WIDTH) * 4;
      offsets[bit] = p;
      levels[bit] = pixels[p] * 0.30 + pixels[p + 1] * 0.59 + pixels[p + 2] * 0.11;
      if (pixels[p + 3] < 64) continue;
      occupied++;
      total += levels[bit];
    }
    if (!occupied) continue;
    s.a[i] = 1;
    cutout[i] = Number(occupied < 6);
    let bright = 0;
    for (let bit = 0; bit < 6; bit++) {
      const p = offsets[bit];
      if (pixels[p + 3] < 64) continue;
      if (cutout[i] || levels[bit] >= total / occupied) {
        mask[i] |= 1 << bit;
        bright++;
        s.r[i] += pixels[p];
        s.g[i] += pixels[p + 1];
        s.b[i] += pixels[p + 2];
      } else {
        for (let k = 0; k < 3; k++) ground[i * 3 + k] += pixels[p + k];
      }
    }
    const scale = 1 / (255 * Math.max(1, bright));
    s.r[i] *= scale;
    s.g[i] *= scale;
    s.b[i] *= scale;
    const dark = Math.max(1, occupied - bright);
    for (let k = 0; k < 3; k++) ground[i * 3 + k] /= 255 * dark;
  }
  return s;
}

function paintKnight(armor: ArmorDef, weapon: WeaponDef, pose: AnimPose, frame: number, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  const c = canvas.getContext('2d')!;
  c.scale(scale, scale);
  const steel = armor.steelColor;
  const cloth = armor.cloakColor;
  const brass = tint(armor.trimColor, 0.65);
  const seam = '#141921';
  const leather = '#483933';
  const path = (shape: string, fill: string | CanvasGradient, outline = seam) => {
    const p = new Path2D(shape);
    c.fillStyle = fill;
    c.fill(p);
    if (outline) {
      c.strokeStyle = outline;
      c.lineWidth = 0.8;
      c.stroke(p);
    }
  };
  const line = (shape: string, color: string | CanvasGradient, width = 0.85) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke(new Path2D(shape));
  };
  const plate = (x: number, y: number, w: number, h: number, shade = 1) => {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    for (const [at, light] of [[0, 0.26], [0.19, 0.60], [0.30, 0.91], [0.41, 0.56], [0.73, 0.26], [1, 0.16]]) {
      g.addColorStop(at, tint(steel, light * shade));
    }
    return g;
  };
  const step = pose === 'walk' ? Math.sin(frame * Math.PI / 3) : 0;
  const attack = pose.startsWith('attack');
  const progress = attack || pose === 'roll' ? Math.min(1, frame / 5) : 0;
  c.translate(FOOT_X, FOOT_Y);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (pose === 'roll') {
    c.translate(0, -23);
    c.rotate((progress * 2 - 0.18) * Math.PI);
    c.scale(0.84, 0.54);
    c.translate(0, 30);
  }

  const leg = (x: number, swing: number, far: boolean) => {
    c.save();
    c.translate(x, -30);
    c.rotate(swing);
    const shade = far ? 0.62 : 0.95;
    path('M-3 -2 Q0 -4 4 -1 L3 10 1 15 -3 13 -4 5 Z', plate(-4, 0, 8, 2, shade));
    path('M-3 14 L3 13 3 19 1 26 -3 27 -4 19 Z', plate(-4, 14, 7, 1, shade));
    path('M-4 12 Q-2 9 2 10 L4 13 2 17 -2 17 -4 15 Z', plate(-3, 10, 7, 4, shade));
    line('M-2 18 L-1 24', tint(steel, 0.50 * shade));
    path('M-3 25 L2 24 3 27 8 29 8 30 -4 30 Z', plate(-2, 24, 4, 7, shade));
    c.restore();
  };
  leg(-4, 0.19 - step * 0.34, true);
  leg(3, -0.10 + step * 0.34, false);
  const bob = pose === 'walk' ? Math.abs(step) * 1.7 : pose === 'idle' ? frame * 0.45 : 0;
  c.translate(attack ? 2 * Math.sin(progress * Math.PI) : 0, bob);
  const hem = -14 - step * 3;
  const fabric = c.createLinearGradient(-17, -45, 0, -42);
  fabric.addColorStop(0, '#151922');
  fabric.addColorStop(0.34, tint(cloth, 0.42));
  fabric.addColorStop(0.50, tint(cloth, 0.18));
  fabric.addColorStop(0.74, tint(cloth, 0.32));
  fabric.addColorStop(1, '#191721');
  path(`M-2 -61 Q-11 -62 -12 -51 Q-13 -32 ${hem - 4} -12 L${hem} -14 ${hem + 1} -10 -9 -15 -7 -13 -2 -20 3 -48 Z`, fabric);
  line(`M-8 -52 Q-8 -34 ${hem + 1} -16`, tint(cloth, 0.48));
  line('M-5 -52 Q-6 -32 -9 -20', tint(cloth, 0.25), 1.6);

  // Mail hauberk beneath the cuirass, scalloped at the lower edge.
  path('M-6 -53 Q1 -56 7 -49 L6 -35 8 -27 4 -27 2 -25 -1 -27 -4 -26 -8 -28 -6 -39 Z', '#30323a');
  for (let y = -34; y <= -28; y += 2) {
    for (let x = -5 + (y % 4 === 0 ? 1 : 0); x < 6; x += 3) {
      line(`M${x} ${y} q0.6 1.4 1.6 0`, '#64656a', 0.65);
    }
  }
  path('M-7 -57 Q-2 -61 6 -58 L9 -51 Q9 -46 5 -40 L0 -38 -6 -41 -9 -50 Z', plate(-8, -57, 17, 6));
  line('M0 -56 Q4 -52 3 -48 L1 -42', tint(steel, 0.68));
  line('M-6 -54 Q-2 -51 1 -51', tint(steel, 0.59));
  for (let n = 0; n < 3; n++) {
    c.save(); c.translate(0, n * 2.5);
    path('M-6 -42 Q0 -39 6 -43 L6 -40 Q2 -36 -6 -39 Z', plate(-4, -43, 9, 4, 0.80));
    c.restore();
  }
  path('M-7 -38 L6 -40 7 -37 -6 -35 Z', leather);
  path('M0 -38 L3 -39 3 -37 0 -36 Z', brass, '');
  path('M-6 -35 Q-2 -33 1 -34 L0 -26 -3 -21 -6 -24 Z', fabric);
  // Far arm under the mantle and overlapping lames on the near shoulder.
  path('M-8 -53 Q-13 -48 -12 -43 L-11 -37 -8 -38 -7 -46 Z', plate(-12, -50, 6, 1, 0.72));
  path('M-7 -60 Q-12 -60 -13 -54 L-10 -51 -4 -53 -3 -58 Z', plate(-12, -60, 9, 5));
  path('M-6 -60 Q-1 -57 4 -59 L6 -56 Q1 -54 -6 -57 Z', '#262936');
  path('M-4 -73 Q-2 -77 2 -77 Q7 -77 8 -72 L8 -66 5 -61 0 -61 -5 -65 Z', plate(-5, -76, 15, 3));
  path('M-4 -70 Q0 -74 7 -72 L10 -68 6 -67 1 -68 -3 -66 Z', plate(-3, -74, 10, 6));
  path('M-1 -68 L8 -70 9 -68 1 -66 Z', '#10131b', '');
  path('M0 -65 L9 -67 7 -62 3 -59 -1 -62 Z', plate(0, -67, 9, 6, 0.86));
  line('M1 -75 L4 -76 7 -73', tint(steel, 0.86));
  line('M4 -64 l0 2 M6 -65 l0 1.5', seam, 0.75);
  path('M4 -58 Q8 -62 12 -57 L14 -53 9 -51 4 -53 Z', plate(4, -59, 9, 6));
  line('M5 -57 Q9 -60 12 -56', tint(steel, 0.79));
  path('M7 -52 L14 -54 13 -50 8 -48 Z', plate(8, -54, 6, 4, 0.90));

  // Pose the grip first. The vambrace and gauntlet follow it through each strike.
  const arc = Math.sin(progress * Math.PI);
  let handX = 12 + step * 2;
  let handY = -36 + step;
  let angle = 0.70;
  if (attack) {
    handX = 12 + arc * 11;
    handY = -43 - arc * 4;
    angle = pose === 'attack2' ? 0.84 - progress * 2.05 : -1.48 + progress * (pose === 'attack3' ? 2.65 : 1.80);
  } else if (pose === 'parry') {
    handX = 13; handY = -42; angle = -1.84;
  } else if (pose === 'drink') {
    handX = 10; handY = -63;
  } else if (weapon.kind === 'spear' || weapon.kind === 'scythe') {
    angle = -1.25;
  }
  const elbowX = attack ? 15 : 10;
  const elbowY = pose === 'drink' ? -49 : -44;
  line(`M10 -50 L${elbowX} ${elbowY} L${handX} ${handY}`, seam, 5);
  line(`M${elbowX} ${elbowY} L${handX} ${handY}`, plate(elbowX - 1, elbowY, 5, 3), 4);
  c.save();
  c.translate(handX, handY);
  c.rotate(angle);
  if (pose === 'drink') {
    path('M-2 -4 L1 -4 1 -2 Q5 1 2 4 Q-2 6 -3 2 Z', '#cb8136');
  } else if (weapon.kind === 'spear' || weapon.kind === 'scythe') {
    line('M-18 0 L35 0', '#665443', 1.8);
    if (weapon.kind === 'spear') {
      path('M30 0 L35 -2 45 0 35 2 Z', plate(32, -2, 1, 4));
    } else {
      path('M31 0 Q32 -9 19 -15 Q33 -13 37 -4 L36 1 Z', plate(25, -12, 9, 12));
    }
  } else {
    const length = weapon.kind === 'greatsword' ? 38 : 29;
    const width = weapon.kind === 'greatsword' ? 2.5 : 1.7;
    path(`M4 -${width} L${length - 5} -1 L${length} 0 L${length - 5} 1 L4 ${width} Z`, '#475361');
    path(`M4 -${width} L${length - 5} -1 L${length} 0 4 0.15 Z`, '#bccbd0', '');
    line('M-5 0 L4 0', leather, 2.2);
    line('M3 -4 Q5 0 3 4', brass, 1.5);
    path('M-7 0 l2 -2 2 2 -2 2 Z', tint(weapon.glowColor, 0.66));
  }
  c.restore();
  c.save(); c.translate(handX, handY);
  path('M-3 -2 Q-1 -4 2 -2 L3 1 1 3 -2 2 Z', plate(-2, -3, 4, 4));
  c.restore();
  // Broken engraving follows the steel rather than the screen grid.
  c.globalCompositeOperation = 'source-atop';
  line('M-5 -50 l2 1 M-5 -48 l1.5 0.9 M5 -47 l-1.3 2 M8 -55 l2 0.7 M-2 -71 l2 -0.6', '#727981', 0.65);
  return canvas;
}

export function buildKnightSprite(armor: ArmorDef, weapon: WeaponDef, pose: AnimPose, frame: number): PixelSprite {
  const c = paintKnight(armor, weapon, pose, frame).getContext('2d')!;
  return encodeFrame(c.getImageData(0, 0, WIDTH, HEIGHT).data);
}

export function drawKnightPortrait(target: HTMLCanvasElement, armor: ArmorDef, weapon: WeaponDef): void {
  const scale = 3;
  const model = paintKnight(armor, weapon, 'idle', 0, scale);
  const ctx = target.getContext('2d')!;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(model, (FOOT_X - 16) * scale, (FOOT_Y - 81) * scale, 34 * scale, 43 * scale, 0, 0, target.width, target.height);
}
