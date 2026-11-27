export const TAU = Math.PI * 2;
export const ASP = 1.8;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smooth(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/** Critically damped spring interpolation (Game Programming Gems 4). */
export function smoothDamp(
  current: number,
  target: number,
  velocity: { v: number },
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * st;
  change = clamp(change, -maxChange, maxChange);
  const adjustedTarget = current - change;
  const temp = (velocity.v + omega * change) * dt;
  velocity.v = (velocity.v - omega * temp) * exp;
  let output = adjustedTarget + (change + temp) * exp;
  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    velocity.v = (output - originalTo) / Math.max(0.0001, dt);
  }
  return output;
}

const imul = Math.imul;
const mfloor = Math.floor;

export function hash(x: number, y: number, s: number): number {
  let h =
    imul(x | 0, 374761393) ^
    imul(y | 0, 668265263) ^
    imul(((s | 0) + 0x1e3779b9) | 0, 1274126177);
  h = imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise(x: number, y: number, s: number): number {
  const xi = mfloor(x);
  const yi = mfloor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, s: number, oct: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * f, y * f, s + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function dist(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy * ASP * ASP);
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

export function formatCardinal(dx: number, dy: number): string {
  const angle = Math.atan2(dy * ASP, dx);
  const dirs = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
  const idx = Math.round(((angle + TAU) % TAU) / (TAU / 8)) % 8;
  return dirs[idx];
}
