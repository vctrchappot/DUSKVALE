'use strict';
window.DV = window.DV || {};
(function (DV) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  const imul = Math.imul, mfloor = Math.floor;
  function hash(x, y, s) {
    let h = imul(x | 0, 374761393) ^ imul(y | 0, 668265263) ^ imul(((s | 0) + 0x1e3779b9) | 0, 1274126177);
    h = imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function noise(x, y, s) {
    const xi = mfloor(x), yi = mfloor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, y, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x * f, y * f, s + i * 17);
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return sum / norm;
  }

  // World cells are taller than wide; ASP converts row distance into column units.
  const ASP = 1.8;
  const dist = (dx, dy) => Math.sqrt(dx * dx + dy * dy * ASP * ASP);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  Object.assign(DV, { clamp, lerp, smooth, hash, noise, fbm, ASP, dist, rand, pick });
})(window.DV);
