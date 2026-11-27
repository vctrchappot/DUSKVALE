import { encodePainted } from './paintedSprite.ts';
import { buildCreatureSprite, type PixelSprite } from './pixelSprites.ts';

/**
 * Painted hostile creatures. Each model is drawn in canvas units (2x3 px per cell)
 * around its foot point, facing right, lit by the moon from the upper left. A second
 * canvas receives the same glowing parts so eyes, embers and blades emit light.
 */

type RGB = readonly [number, number, number];

interface Frame {
  w: number;
  h: number;
  fx: number;
  fy: number;
}

interface Kit {
  atk: boolean;
  f: number;
  bob: number;
  step: number;
  ball(x: number, y: number, rx: number, ry: number, col: RGB, rot?: number): void;
  slab(path: string, col: RGB, x0: number, y0: number, x1: number, y1: number, outline?: boolean): void;
  limb(x0: number, y0: number, x1: number, y1: number, w: number, col: RGB): void;
  joint(pts: number[], w: number, col: RGB): void;
  stroke(path: string, col: RGB, w: number): void;
  hole(x: number, y: number, rx: number, ry: number): void;
  glow(x: number, y: number, r: number, col: RGB, power?: number): void;
  glowLine(path: string, col: RGB, w: number, power?: number): void;
  aura(path: string, col: RGB, power: number): void;
}

const INK = '#0a0c11';

function css(col: RGB, k = 1, a = 1): string {
  const c = col.map(v => Math.round(Math.max(0, Math.min(1, v * k)) * 255));
  return a < 1 ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`;
}

function makeKit(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, atk: boolean, f: number): Kit {
  const kit: Kit = {
    atk,
    f,
    bob: f ? 1 : 0,
    step: f ? 1 : -1,
    // Rounded volume: hot spot toward the moon, core shadow and dark rim opposite.
    ball(x, y, rx, ry, col, rot = 0) {
      const r = Math.max(rx, ry);
      const grad = c.createRadialGradient(x - rx * 0.38, y - ry * 0.45, r * 0.08, x, y, r * 1.18);
      grad.addColorStop(0, css(col, 1.3));
      grad.addColorStop(0.42, css(col, 0.9));
      grad.addColorStop(0.8, css(col, 0.48));
      grad.addColorStop(1, css(col, 0.26));
      c.beginPath();
      c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      c.fillStyle = grad;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.7;
      c.stroke();
    },
    // Flat planes: lit edge upper left falling into shadow lower right.
    slab(path, col, x0, y0, x1, y1, outline = true) {
      const grad = c.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, css(col, 1.18));
      grad.addColorStop(0.35, css(col, 0.86));
      grad.addColorStop(1, css(col, 0.3));
      const p = new Path2D(path);
      c.fillStyle = grad;
      c.fill(p);
      if (outline) {
        c.strokeStyle = INK;
        c.lineWidth = 0.75;
        c.stroke(p);
      }
    },
    // Cylindrical limb: dark body with a lit ridge on the moon side.
    limb(x0, y0, x1, y1, w, col) {
      kit.joint([x0, y0, x1, y1], w, col);
    },
    joint(pts, w, col) {
      const trace = (dx: number, dy: number) => {
        c.beginPath();
        c.moveTo(pts[0] + dx, pts[1] + dy);
        for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] + dx, pts[i + 1] + dy);
      };
      c.lineCap = 'round';
      c.lineJoin = 'round';
      trace(0, 0);
      c.strokeStyle = INK;
      c.lineWidth = w + 1.2;
      c.stroke();
      trace(0, 0);
      c.strokeStyle = css(col, 0.5);
      c.lineWidth = w;
      c.stroke();
      trace(-w * 0.22, -w * 0.22);
      c.strokeStyle = css(col, 1.1);
      c.lineWidth = Math.max(0.6, w * 0.45);
      c.stroke();
    },
    stroke(path, col, w) {
      c.lineCap = 'round';
      c.strokeStyle = css(col);
      c.lineWidth = w;
      c.stroke(new Path2D(path));
    },
    hole(x, y, rx, ry) {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = '#030408';
      c.fill();
    },
    glow(x, y, r, col, power = 1) {
      const grad = c.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, css([1, 1, 1], 1));
      grad.addColorStop(0.35, css(col, 1.15));
      grad.addColorStop(1, css(col, 0.8));
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = grad;
      c.fill();
      g.beginPath();
      g.arc(x, y, r * 1.1, 0, Math.PI * 2);
      g.fillStyle = `rgba(255,255,255,${power})`;
      g.fill();
    },
    glowLine(path, col, w, power = 1) {
      const p = new Path2D(path);
      c.lineCap = 'round';
      c.strokeStyle = css(col, 1.1);
      c.lineWidth = w;
      c.stroke(p);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = Math.max(0.5, w * 0.35);
      c.stroke(p);
      g.lineCap = 'round';
      g.strokeStyle = `rgba(255,255,255,${power})`;
      g.lineWidth = w + 0.6;
      g.stroke(p);
    },
    // Faint self-light for spectral bodies; colour already painted on the main canvas.
    aura(path, _col, power) {
      g.fillStyle = `rgba(255,255,255,${power})`;
      g.fill(new Path2D(path));
    },
  };
  return kit;
}

const FRAMES: Record<string, Frame> = {
  skeleton: { w: 64, h: 60, fx: 26, fy: 57 },
  ghoul: { w: 56, h: 48, fx: 24, fy: 45 },
  wolf: { w: 72, h: 39, fx: 34, fy: 36 },
  wraith: { w: 56, h: 63, fx: 26, fy: 60 },
  specter: { w: 64, h: 63, fx: 26, fy: 60 },
  bogwitch: { w: 56, h: 63, fx: 24, fy: 60 },
  wight: { w: 104, h: 102, fx: 46, fy: 99 },
  matron: { w: 104, h: 102, fx: 52, fy: 99 },
  corvus: { w: 112, h: 102, fx: 48, fy: 99 },
  bishop: { w: 104, h: 108, fx: 50, fy: 105 },
};

const PAINTERS: Record<string, (k: Kit) => void> = {
  skeleton(k) {
    const bone: RGB = [0.86, 0.82, 0.72];
    const old: RGB = [0.56, 0.52, 0.46];
    const rag: RGB = [0.26, 0.2, 0.2];
    const steel: RGB = [0.6, 0.58, 0.56];
    const eye: RGB = [0.45, 0.9, 1.0];
    const b = k.bob;
    const s = k.step * 1.6;
    // Far limbs first, in the darker bone tone.
    k.joint([-2, -21 + b, -3 - s, -11, -3 - s * 1.6, -2], 1.8, old);
    k.limb(-5 - s * 1.6, -1, -1 - s * 1.6, -1, 1.4, old);
    k.joint([-5, -34 + b, -8, -27 + b, -7, -20 + b], 1.5, old);
    k.slab(`M-4 ${-23 + b} L4 ${-23 + b} 5 ${-14 + b} 2 ${-17 + b} 0 ${-12 + b} -2 ${-16 + b} -5 ${-13 + b} Z`, rag, -4, -23, 5, -12);
    k.joint([2, -21 + b, 3 + s, -11, 3 + s * 1.6, -2], 2, bone);
    k.limb(1 + s * 1.6, -1, 6 + s * 1.6, -1, 1.5, bone);
    k.ball(0, -21 + b, 4, 2.2, bone);
    k.limb(0, -22 + b, 0, -34 + b, 1.8, old);
    for (let r = 0; r < 4; r++) {
      const y = -32.5 + r * 2.5 + b;
      k.stroke(`M0 ${y} Q-5 ${y + 0.3} -4.5 ${y + 2.2}`, bone, 1.1);
      k.stroke(`M0 ${y} Q5 ${y + 0.3} 4.5 ${y + 2.2}`, bone, 1.1);
    }
    k.limb(-5, -34.5 + b, 5, -34.5 + b, 1.4, bone);
    // Skull with a hanging jaw and cold eye lights in deep sockets.
    k.ball(1, -40 + b, 4.4, 4.8, bone);
    k.slab(`M-2 ${-37 + b} L4 ${-37 + b} 3.5 ${-34 + b} -1 ${-34 + b} Z`, bone, -2, -37, 4, -34);
    k.hole(-0.6, -40.4 + b, 1.4, 1.3);
    k.hole(3, -40.4 + b, 1.3, 1.3);
    k.glow(-0.6, -40.4 + b, 0.8, eye);
    k.glow(3, -40.4 + b, 0.8, eye);
    k.stroke(`M0 ${-36 + b} l0 1.5 M1.5 ${-36 + b} l0 1.5 M3 ${-36 + b} l0 1.4`, [0.1, 0.1, 0.12], 0.5);
    // Sword arm.
    const [ex, ey, hx, hy, tx, ty] = k.atk ? [9, -38, 13, -41, 30, -33] : [8, -28, 10, -23, 15, -42];
    k.joint([5, -34 + b, ex, ey + b, hx, hy + b], 1.6, bone);
    k.limb(hx, hy + b, tx, ty + b, 1.8, steel);
    k.stroke(`M${hx} ${hy + b} L${tx} ${ty + b}`, [0.88, 0.88, 0.86], 0.6);
    k.stroke(`M${hx + (tx - hx) * 0.55} ${hy + (ty - hy) * 0.55 + b} l${(tx - hx) * 0.15} ${(ty - hy) * 0.15}`, [0.46, 0.28, 0.16], 0.9);
    k.limb(hx - 2, hy + b + 1.2, hx + 2, hy + b - 1.2, 1, [0.42, 0.36, 0.3]);
  },

  ghoul(k) {
    const skin: RGB = [0.52, 0.6, 0.46];
    const dark: RGB = [0.32, 0.38, 0.3];
    const rag: RGB = [0.3, 0.24, 0.22];
    const eye: RGB = [1.0, 0.25, 0.12];
    const b = k.bob;
    const s = k.step * 1.4;
    k.joint([-3, -15, -1 - s, -8, -5 - s, -1], 2.2, dark);
    k.joint([-2, -22 + b, 2, -14 + b, 3, -5], 1.6, dark);
    // Hunched torso leaning into the hunt, spine ridge along the back.
    k.ball(0, -19 + b, 7.5, 6, skin, -0.35);
    for (let i = 0; i < 4; i++) k.ball(-5 + i * 2.4, -24.5 + b + i * 0.4 - (i === 1 ? 0.6 : 0), 1, 0.9, skin);
    k.slab(`M-6 ${-15 + b} L5 ${-14 + b} 4 ${-9 + b} 1 ${-11 + b} -1 ${-7 + b} -3 ${-10 + b} -7 ${-8 + b} Z`, rag, -6, -15, 5, -7);
    k.joint([2, -15, 5 + s, -8, 3 + s, -1], 2.4, skin);
    // Low skull, open jaw, burning eyes.
    const jaw = k.atk ? 2.6 : 1.2;
    k.ball(7.5, -25 + b, 3.8, 3.3, skin);
    k.slab(`M6 ${-23 + b} L12 ${-23 + b} 11 ${-23 + b + jaw} 6.5 ${-22 + b + jaw} Z`, dark, 6, -23, 12, -21);
    k.hole(9.6, -22.6 + b + jaw * 0.4, 1.6, jaw * 0.45);
    k.stroke(`M8.4 ${-23 + b} l0 0.9 M9.8 ${-23 + b} l0 0.9 M11 ${-23 + b} l0 0.8`, [0.9, 0.86, 0.7], 0.5);
    k.hole(9, -26 + b, 1, 0.8);
    k.glow(9.1, -26 + b, 0.75, eye);
    // Near arm: hangs to the ground, or rakes forward when it strikes.
    if (k.atk) {
      k.joint([4, -21 + b, 11, -21 + b, 17, -18 + b], 2.2, skin);
      for (let i = -1; i <= 1; i++) k.stroke(`M17 ${-18 + b + i} l3 ${i * 0.8 + 0.8}`, [0.92, 0.88, 0.76], 0.6);
      k.glowLine(`M13 ${-24 + b} Q20 ${-21 + b} 18 ${-14 + b}`, [1.0, 0.36, 0.2], 0.6, 0.6);
    } else {
      k.joint([4, -21 + b, 8, -14 + b, 9, -6], 2.2, skin);
      for (let i = -1; i <= 1; i++) k.stroke(`M9 -6 l${i * 1.2 + 1} 2.4`, [0.92, 0.88, 0.76], 0.6);
    }
  },

  wolf(k) {
    const fur: RGB = [0.5, 0.48, 0.54];
    const dark: RGB = [0.3, 0.29, 0.34];
    const ember: RGB = [1.0, 0.5, 0.14];
    const b = k.bob;
    const s = k.step * 2.2;
    const lunge = k.atk ? 4 : 0;
    // Far legs.
    k.joint([-9, -12 + b, -10 + s, -6, -11 + s, -1], 2.2, dark);
    k.joint([7 + lunge, -12 + b, 8 - s + lunge * 1.2, -6, 8 - s + lunge * 1.6, -1], 2.2, dark);
    // Bushy tail in a few tapering strokes.
    k.joint([-14, -16 + b, -20, -15 + b, -25, -10 + b], 3.2, fur);
    k.joint([-20, -15 + b, -26, -9 + b], 1.6, dark);
    // Body: haunch, barrel and deep chest.
    k.ball(-9, -15 + b, 6, 5.4, fur);
    k.ball(-1 + lunge * 0.5, -15 + b, 10, 5.4, fur);
    k.ball(8 + lunge, -15.5 + b, 6, 6.4, fur);
    for (let i = 0; i < 6; i++) k.stroke(`M${-10 + i * 3.6} ${-20 + b} l1.4 -1.8`, dark, 1);
    // Smouldering cracks in the ash-grey hide.
    k.glowLine(`M-6 ${-15 + b} l2.6 2 l2 -1.6`, ember, 0.6, 0.7);
    k.glowLine(`M2 ${-12.5 + b} l2.4 -1.6`, ember, 0.55, 0.6);
    // Head lowered when it lunges.
    const hy = k.atk ? -15 : -19;
    const hx = 14 + lunge;
    k.slab(`M${hx - 3} ${hy - 3 + b} L${hx - 1} ${hy - 7 + b} ${hx + 1} ${hy - 3 + b} Z`, dark, hx - 3, hy - 7, hx + 1, hy - 3);
    k.ball(hx, hy + b, 4.6, 3.8, fur);
    k.slab(`M${hx + 2} ${hy - 2 + b} L${hx + 9} ${hy - 0.5 + b} ${hx + 9} ${hy + 1.2 + b} ${hx + 2} ${hy + 2 + b} Z`, fur, hx + 2, hy - 2, hx + 9, hy + 2);
    k.ball(hx + 9, hy - 0.2 + b, 0.9, 0.8, [0.1, 0.1, 0.12]);
    if (k.atk) {
      k.slab(`M${hx + 1} ${hy + 2 + b} L${hx + 8} ${hy + 4.5 + b} ${hx + 2} ${hy + 4 + b} Z`, dark, hx + 1, hy + 2, hx + 8, hy + 4);
      k.stroke(`M${hx + 4} ${hy + 1.6 + b} l0 1 M${hx + 6} ${hy + 1.4 + b} l0 1`, [0.95, 0.92, 0.82], 0.5);
    }
    k.glow(hx + 1.2, hy - 1.2 + b, 0.85, ember);
    // Near legs.
    k.joint([-7, -12 + b, -7 - s, -6, -6 - s, -1], 2.4, fur);
    k.joint([9 + lunge, -12 + b, 10 + s + lunge * 1.3, -6, 11 + s + lunge * 2, -1], 2.4, fur);
  },

  wraith(k) {
    const mist: RGB = [0.3, 0.46, 0.74];
    const pale: RGB = [0.62, 0.8, 1.0];
    const eye: RGB = [0.7, 0.95, 1.0];
    const b = k.bob;
    const w = k.f ? 1.2 : -1.2;
    // Shroud tapering into drifting tatters; it hovers above its shadow.
    const shroud = `M-1 ${-49 + b} Q8 ${-48 + b} 8 ${-37 + b} Q10 ${-26 + b} 7 ${-15 + b} L${5 + w} -6 2 ${-11 + b} ${-1 - w} -4 -3 ${-11 + b} ${-7 + w} -7 -7 ${-17 + b} Q-10 ${-30 + b} -7 ${-40 + b} Q-6 ${-48 + b} -1 ${-49 + b} Z`;
    k.slab(shroud, mist, -8, -49, 9, -5);
    k.aura(shroud, mist, 0.28);
    k.stroke(`M-3 ${-34 + b} Q-4 ${-24 + b} -2 ${-12 + b} M2 ${-33 + b} Q3 ${-22 + b} 2 ${-12 + b}`, [0.16, 0.24, 0.42], 0.8);
    // Hood void with two cold lights.
    k.hole(1.5, -41 + b, 3.6, 4.2);
    k.glow(0.2, -41.6 + b, 1.15, eye);
    k.glow(3.2, -41.6 + b, 1.15, eye);
    // Bony reaching hands.
    const reach = k.atk ? 10 : 4;
    k.joint([5, -33 + b, 6 + reach, -30 + b, 9 + reach, -29 + b], 1.4, pale);
    for (let i = -1; i <= 1; i++) k.stroke(`M${9 + reach} ${-29 + b} l2.4 ${i * 1.1}`, pale, 0.5);
    if (k.atk) k.glowLine(`M${10 + reach} ${-33 + b} Q${16 + reach} ${-29 + b} ${11 + reach} ${-24 + b}`, eye, 0.6, 0.6);
  },

  specter(k) {
    const steel: RGB = [0.46, 0.56, 0.76];
    const cloak: RGB = [0.18, 0.24, 0.46];
    const blade: RGB = [0.55, 0.92, 1.0];
    const b = k.bob;
    const s = k.step * 1.6;
    const cape = `M-4 ${-36 + b} Q-11 ${-26 + b} -10 ${-8 + b} L-7 ${-10 + b} -5 -6 -3 ${-11 + b} 1 ${-10 + b} 0 ${-34 + b} Z`;
    k.slab(cape, cloak, -11, -36, 1, -6);
    k.aura(cape, cloak, 0.18);
    k.joint([-2, -20 + b, -3 - s, -11, -3 - s * 1.4, -1], 2.6, [0.3, 0.36, 0.52]);
    k.joint([2, -20 + b, 3 + s, -11, 4 + s * 1.4, -1], 2.8, steel);
    // Breastplate, faulds and pauldrons.
    k.slab(`M-5 ${-35 + b} L6 ${-35 + b} 5 ${-24 + b} 4 ${-19 + b} -4 ${-19 + b} -5 ${-24 + b} Z`, steel, -5, -35, 6, -19);
    k.stroke(`M0.5 ${-34 + b} L0.5 ${-22 + b}`, [0.7, 0.8, 0.95], 0.6);
    k.slab(`M-4 ${-20 + b} L5 ${-20 + b} 5.5 ${-16 + b} -4.5 ${-16 + b} Z`, steel, -4, -20, 5, -16);
    k.ball(-5, -34 + b, 2.6, 2.2, steel);
    k.ball(6, -34 + b, 2.8, 2.3, steel);
    // Great helm with a burning visor slit.
    k.ball(0.8, -40 + b, 3.8, 4.4, steel);
    k.slab(`M-1 ${-44.5 + b} L2 ${-47.5 + b} 3 ${-44 + b} Z`, [0.4, 0.6, 0.9], -1, -47, 3, -44);
    k.glowLine(`M-1 ${-40.6 + b} L4.4 ${-40.6 + b}`, blade, 0.9);
    // Spectral sword.
    const [hx, hy, tx, ty] = k.atk ? [11, -40, 29, -36] : [9, -25, 13, -47];
    k.joint([6, -33 + b, k.atk ? 9 : 8, k.atk ? -37 + b : -29 + b, hx, hy + b], 2, steel);
    k.limb(hx - 2.2, hy + b + 1, hx + 2.2, hy + b - 1, 1, [0.4, 0.5, 0.7]);
    k.glowLine(`M${hx} ${hy + b} L${tx} ${ty + b}`, blade, 1.6);
  },

  bogwitch(k) {
    const robe: RGB = [0.2, 0.34, 0.24];
    const skin: RGB = [0.56, 0.64, 0.5];
    const wood: RGB = [0.4, 0.3, 0.22];
    const glow: RGB = [0.46, 1.0, 0.62];
    const b = k.bob;
    // Bell robe over a hunched back.
    k.slab(`M-3 ${-34 + b} Q-9 ${-30 + b} -9 ${-18 + b} L-11 -1 -6 -3 -3 -1 1 -3 5 -1 8 -2 6 ${-18 + b} Q6 ${-28 + b} 3 ${-33 + b} Z`, robe, -10, -34, 7, -1);
    k.stroke(`M-5 ${-26 + b} Q-6 ${-14 + b} -7 -3 M1 ${-26 + b} Q2 ${-14 + b} 2 -3`, [0.1, 0.16, 0.12], 0.8);
    k.joint([-4, -30 + b, -7, -22 + b, -4, -17 + b], 1.4, skin);
    // Face under the brim: long nose, sunken green eyes, lank hair.
    k.ball(2, -35 + b, 3.4, 3.6, skin);
    k.slab(`M4 ${-36 + b} L8 ${-32.5 + b} 4.5 ${-33.5 + b} Z`, skin, 4, -36, 8, -32);
    k.hole(1.4, -36 + b, 0.9, 0.8);
    k.hole(3.8, -36 + b, 0.8, 0.8);
    k.glow(1.4, -36 + b, 0.65, glow);
    k.glow(3.8, -36 + b, 0.6, glow);
    k.stroke(`M-1.5 ${-37 + b} q-2 5 -1 10 M-0.5 ${-37 + b} q-1 5 0 9`, [0.66, 0.68, 0.62], 0.6);
    // Crooked, tattered hat.
    k.slab(`M-7 ${-38.5 + b} Q2 ${-41 + b} 9 ${-38 + b} L8 ${-37 + b} Q1 ${-39 + b} -6 ${-37 + b} Z`, robe, -7, -41, 9, -37);
    k.slab(`M-4 ${-39.5 + b} L-3 ${-48 + b} -6 ${-55 + b} -1 ${-49 + b} 5 ${-40 + b} Z`, robe, -6, -55, 5, -39);
    // Gnarled staff with a swamp-light lantern.
    const raise = k.atk ? -6 : 0;
    const top = -44 + raise;
    k.joint([10, -1, 10.5, -20, 9.5, top + 6, 11, top], 1.5, wood);
    k.joint([4, -30 + b, 8, -25 + b, 10, -24 + b], 1.4, skin);
    k.stroke(`M11 ${top} l1.5 2.5`, [0.2, 0.18, 0.16], 0.6);
    k.glow(12.6, top + 4, k.atk ? 2.6 : 1.9, glow);
  },

  wight(k) {
    const bone: RGB = [0.84, 0.8, 0.7];
    const old: RGB = [0.52, 0.48, 0.42];
    const gold: RGB = [0.9, 0.72, 0.32];
    const cloak: RGB = [0.44, 0.1, 0.12];
    const eye: RGB = [1.0, 0.24, 0.14];
    const b = k.bob;
    const s = k.step * 2.6;
    // Tattered royal mantle behind.
    k.slab(`M-7 ${-62 + b} Q-20 ${-48 + b} -19 ${-12 + b} L-15 ${-15 + b} -12 -6 -8 ${-14 + b} -4 -8 0 ${-15 + b} 4 ${-58 + b} Z`, cloak, -20, -62, 4, -6);
    k.joint([-3, -36 + b, -5 - s, -19, -5 - s * 1.5, -2], 3.2, old);
    k.limb(-9 - s * 1.5, -2, -2 - s * 1.5, -2, 2.4, old);
    k.joint([-9, -59 + b, -14, -47 + b, -12, -36 + b], 2.6, old);
    k.joint([3, -36 + b, 5 + s, -19, 5 + s * 1.5, -2], 3.6, bone);
    k.limb(2 + s * 1.5, -2, 11 + s * 1.5, -2, 2.6, bone);
    // Pelvis, spine and a cage of ribs wrapped in rusted gold.
    k.ball(0, -36 + b, 7, 3.6, bone);
    k.limb(0, -38 + b, 0, -58 + b, 3, old);
    for (let r = 0; r < 5; r++) {
      const y = -56 + r * 3.6 + b;
      k.stroke(`M0 ${y} Q-9 ${y + 0.5} -8 ${y + 3.4}`, bone, 1.7);
      k.stroke(`M0 ${y} Q9 ${y + 0.5} 8 ${y + 3.4}`, bone, 1.7);
    }
    k.slab(`M-3 ${-56 + b} L3 ${-56 + b} 2 ${-40 + b} -2 ${-40 + b} Z`, gold, -3, -56, 3, -40);
    k.ball(-9, -59 + b, 4.6, 3.8, gold);
    k.ball(10, -59 + b, 5, 4, gold);
    // Crowned skull.
    k.ball(1, -68 + b, 7, 7.6, bone);
    k.slab(`M-3 ${-63 + b} L6 ${-63 + b} 5 ${-58.5 + b} -2 ${-58.5 + b} Z`, bone, -3, -63, 6, -58);
    k.hole(-1.6, -68.5 + b, 2.1, 2);
    k.hole(4, -68.5 + b, 2, 2);
    k.glow(-1.6, -68.5 + b, 1.2, eye);
    k.glow(4, -68.5 + b, 1.2, eye);
    k.slab(`M-6 ${-73 + b} L-6 ${-80 + b} -3 ${-76 + b} 0 ${-82 + b} 3 ${-76 + b} 6 ${-81 + b} 8 ${-74 + b} Z`, gold, -6, -82, 8, -73);
    k.glow(1, -76.5 + b, 1.1, eye, 0.8);
    // Greatsword with smouldering runes.
    const [ex, ey, hx, hy, tx, ty] = k.atk ? [16, -62, 22, -66, 50, -52] : [14, -48, 16, -40, 24, -86];
    k.joint([10, -58 + b, ex, ey + b, hx, hy + b], 3, bone);
    k.limb(hx - 4, hy + b + 2.4, hx + 4, hy + b - 2.4, 1.8, gold);
    k.limb(hx, hy + b, tx, ty + b, 3.6, [0.5, 0.48, 0.48]);
    k.glowLine(`M${hx + (tx - hx) * 0.15} ${hy + (ty - hy) * 0.15 + b} L${hx + (tx - hx) * 0.8} ${hy + (ty - hy) * 0.8 + b}`, eye, 0.9, 0.9);
  },

  matron(k) {
    const veil: RGB = [0.16, 0.46, 0.42];
    const deep: RGB = [0.06, 0.18, 0.18];
    const skin: RGB = [0.66, 0.78, 0.74];
    const glow: RGB = [0.55, 1.0, 0.86];
    const b = k.bob * 1.5;
    const w = k.f ? 2 : -2;
    // Drowned veil streaming into the water below her.
    const body = `M0 ${-78 + b} Q14 ${-76 + b} 15 ${-58 + b} Q18 ${-38 + b} 14 ${-18 + b} L${12 + w} -6 8 ${-14 + b} ${4 - w} -4 0 ${-13 + b} ${-5 + w} -5 -8 ${-14 + b} ${-13 - w} -6 -14 ${-20 + b} Q-18 ${-40 + b} -15 ${-58 + b} Q-14 ${-76 + b} 0 ${-78 + b} Z`;
    k.slab(body, veil, -16, -78, 16, -6);
    k.aura(body, veil, 0.22);
    k.slab(`M-6 ${-58 + b} Q0 ${-52 + b} 6 ${-58 + b} L5 ${-16 + b} 0 ${-12 + b} -5 ${-16 + b} Z`, deep, -6, -58, 6, -12, false);
    for (let i = -2; i <= 2; i++) k.stroke(`M${i * 3} ${-66 + b} Q${i * 4 + w} ${-46 + b} ${i * 3.4} ${-26 + b}`, [0.1, 0.3, 0.28], 0.7);
    // Pale face in the hood, eyes like lamps underwater.
    k.ball(0, -64 + b, 5.6, 6.6, skin);
    k.hole(-2.2, -64.6 + b, 1.6, 1.4);
    k.hole(2.4, -64.6 + b, 1.6, 1.4);
    k.glow(-2.2, -64.6 + b, 1.1, glow);
    k.glow(2.4, -64.6 + b, 1.1, glow);
    k.stroke(`M-1.4 ${-59.5 + b} Q0 ${-58.4 + b} 1.4 ${-59.5 + b}`, [0.12, 0.2, 0.2], 0.6);
    k.glowLine(`M-9 ${-76 + b} Q0 ${-86 + b} 9 ${-76 + b}`, glow, 0.7, 0.5);
    // Long arms; in the attack she raises two drowned lights.
    const ay = k.atk ? -56 : -42;
    k.joint([-10, -56 + b, -18, ay + 6 + b, -22, ay + b], 2, skin);
    k.joint([10, -56 + b, 18, ay + 6 + b, 22, ay + b], 2, skin);
    if (k.atk) {
      k.glow(-23, ay - 3 + b, 3.6, glow);
      k.glow(23, ay - 3 + b, 3.6, glow);
    }
  },

  corvus(k) {
    const iron: RGB = [0.42, 0.4, 0.42];
    const dark: RGB = [0.22, 0.21, 0.24];
    const cloak: RGB = [0.58, 0.18, 0.06];
    const ember: RGB = [1.0, 0.48, 0.12];
    const b = k.bob;
    const s = k.step * 2.6;
    k.slab(`M-8 ${-62 + b} Q-22 ${-46 + b} -20 ${-10 + b} L-16 ${-13 + b} -13 -5 -9 ${-12 + b} -5 -6 -1 ${-13 + b} 2 ${-58 + b} Z`, cloak, -22, -62, 2, -5);
    k.joint([-4, -36 + b, -6 - s, -19, -6 - s * 1.5, -2], 4.4, dark);
    k.joint([4, -36 + b, 6 + s, -19, 6 + s * 1.5, -2], 4.6, iron);
    k.limb(2 + s * 1.5, -2, 11 + s * 1.5, -2, 2.8, iron);
    // Plated torso.
    k.slab(`M-10 ${-62 + b} L11 ${-62 + b} 9 ${-44 + b} 7 ${-34 + b} -7 ${-34 + b} -9 ${-44 + b} Z`, iron, -10, -62, 11, -34);
    for (let i = 0; i < 3; i++) k.stroke(`M-7 ${-46 + b + i * 3.6} Q1 ${-44 + b + i * 3.6} 8 ${-46 + b + i * 3.6}`, [0.16, 0.15, 0.17], 0.8);
    k.glowLine(`M0 ${-58 + b} L0 ${-50 + b}`, ember, 0.7, 0.5);
    // Feathered pauldrons.
    for (let i = 0; i < 4; i++) {
      k.ball(-10 + i * 0.6, -61 + b + i * 2.4, 4.2 - i * 0.5, 1.8, dark, 0.3);
      k.ball(11 - i * 0.6, -61 + b + i * 2.4, 4.4 - i * 0.5, 1.9, dark, -0.3);
    }
    // Crow helm: rounded skull, long hooked beak, ember eye slit.
    k.ball(1, -70 + b, 6.2, 6.6, iron);
    k.slab(`M4 ${-70 + b} L17 ${-66 + b} 19 ${-63 + b} 15 ${-64 + b} 4 ${-64 + b} Z`, iron, 4, -70, 19, -63);
    k.glowLine(`M-1 ${-71 + b} L6 ${-70.5 + b}`, ember, 1.2);
    k.stroke(`M-4 ${-76 + b} l-3 -4 M-2 ${-77 + b} l-1 -5`, dark, 1.2);
    // Great axe with a glowing edge.
    const [hx, hy, tx, ty] = k.atk ? [22, -62, 44, -54] : [14, -40, 20, -84];
    k.joint([10, -58 + b, k.atk ? 16 : 14, k.atk ? -62 + b : -48 + b, hx, hy + b], 3.4, iron);
    k.limb(hx - (tx - hx) * 0.3, hy - (ty - hy) * 0.3 + b, tx, ty + b, 1.8, [0.36, 0.26, 0.18]);
    // Crescent head set across the haft near its end, edge glowing like a forge.
    const len = Math.hypot(tx - hx, ty - hy) || 1;
    const dx = (tx - hx) / len;
    const dy = (ty - hy) / len;
    const ux = -dy;
    const uy = dx;
    const px = tx - dx * 6;
    const py = ty - dy * 6 + b;
    const pt = (along: number, out: number) => `${px + dx * along + ux * out} ${py + dy * along + uy * out}`;
    k.slab(`M${pt(4, 0)} L${pt(8, 9)} Q${pt(0, 13)} ${pt(-8, 9)} L${pt(-4, 0)} Z`, iron, px - 8, py - 8, px + 8, py + 8);
    k.slab(`M${pt(2, 0)} L${pt(4, -4)} ${pt(-4, -4)} ${pt(-2, 0)} Z`, dark, px - 4, py - 4, px + 4, py + 4);
    k.glowLine(`M${pt(8, 9)} Q${pt(0, 13)} ${pt(-8, 9)}`, ember, 1.1, 0.9);
  },

  bishop(k) {
    const crimson: RGB = [0.56, 0.08, 0.12];
    const gold: RGB = [0.92, 0.74, 0.34];
    const pale: RGB = [0.9, 0.86, 0.8];
    const eye: RGB = [1.0, 0.22, 0.26];
    const halo: RGB = [1.0, 0.86, 0.46];
    const b = k.bob;
    // Vestment: a tall bell of crimson with a gold stole.
    k.slab(`M-8 ${-70 + b} Q-17 ${-58 + b} -17 ${-30 + b} L-21 -2 -10 -4 0 -1 10 -4 21 -2 17 ${-30 + b} Q17 ${-58 + b} 8 ${-70 + b} Z`, crimson, -20, -70, 20, -2);
    for (const x of [-11, -5, 5, 11]) k.stroke(`M${x * 0.5} ${-64 + b} Q${x * 0.9} ${-34 + b} ${x * 1.2} -4`, [0.3, 0.04, 0.06], 0.9);
    k.slab(`M-4 ${-68 + b} L4 ${-68 + b} 5 -3 -5 -3 Z`, gold, -5, -68, 5, -3);
    for (let i = 0; i < 4; i++) {
      const y = -58 + i * 13 + b;
      k.stroke(`M0 ${y} l0 6 M-2 ${y + 2} l4 0`, [0.5, 0.06, 0.1], 1);
    }
    // Shoulders and the cape collar.
    k.ball(-11, -66 + b, 5, 3.8, crimson);
    k.ball(11, -66 + b, 5, 3.8, crimson);
    // Mask-like face and towering mitre.
    k.ball(0, -75 + b, 5.2, 6, pale);
    k.hole(-2, -76 + b, 1.5, 1.2);
    k.hole(2.4, -76 + b, 1.5, 1.2);
    k.glow(-2, -76 + b, 1, eye);
    k.glow(2.4, -76 + b, 1, eye);
    k.stroke(`M-1.6 ${-71 + b} L1.8 ${-71 + b}`, [0.3, 0.24, 0.22], 0.6);
    k.slab(`M-6 ${-80 + b} L-5 ${-92 + b} 0 ${-100 + b} 5 ${-92 + b} 6 ${-80 + b} Z`, gold, -6, -100, 6, -80);
    k.stroke(`M0 ${-98 + b} L0 ${-82 + b} M-3 ${-90 + b} L3 ${-90 + b}`, crimson, 1);
    // Off hand raised in benediction when he casts.
    k.joint([-12, -64 + b, -18, k.atk ? -70 + b : -52 + b, -19, k.atk ? -78 + b : -46 + b], 2.4, crimson);
    if (k.atk) k.glow(-19.5, -80 + b, 2.6, halo);
    // Crozier.
    const top = k.atk ? -96 : -88;
    k.joint([12, -64 + b, 18, -56 + b, 22, -54 + b], 2.6, crimson);
    k.limb(22, -1, 22, top + 8 + b, 2, gold);
    k.stroke(`M22 ${top + 8 + b} Q22 ${top + b} 28 ${top + 1 + b} Q31 ${top + 5 + b} 27 ${top + 8 + b}`, gold, 2);
    k.glow(25.5, top + 5 + b, k.atk ? 3.4 : 2.4, halo);
  },
};

export function hasPaintedCreature(kind: string): boolean {
  return kind in PAINTERS;
}

export function buildEnemySprite(kind: string, pose: 'idle' | 'walk' | 'attack', frame: number): PixelSprite {
  const painter = PAINTERS[kind];
  const fr = FRAMES[kind];
  if (!painter || !fr || typeof document === 'undefined') return buildCreatureSprite(kind, pose, frame);
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = fr.w;
    canvas.height = fr.h;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(fr.fx, fr.fy);
    return { canvas, ctx };
  };
  const main = make();
  const glow = make();
  painter(makeKit(main.ctx, glow.ctx, pose === 'attack', frame & 1));
  return encodePainted(
    main.ctx.getImageData(0, 0, fr.w, fr.h).data,
    fr.w,
    fr.h,
    fr.fx,
    fr.fy,
    glow.ctx.getImageData(0, 0, fr.w, fr.h).data,
  );
}
