import { makeSprite, type PixelSprite } from './pixelSprites.ts';

/**
 * Painted models are drawn on a canvas at 2x3 pixels per character cell and then
 * reduced to two local ink colours per cell. At the silhouette, the second colour
 * comes from the scene so the background shows through. An optional glow layer,
 * painted with the same geometry, becomes per-cell emission (eyes, embers, blades).
 */
export function encodePainted(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  footX: number,
  footY: number,
  glow?: Uint8ClampedArray,
): PixelSprite {
  const s = makeSprite(width / 2, height / 3, footX / 2, footY / 3);
  const mask = new Uint8Array(s.a.length);
  const ground = new Float32Array(s.a.length * 3);
  const cutout = new Uint8Array(s.a.length);
  s.detail = { mask, ground, cutout };
  const offsets = new Int32Array(6);
  const levels = new Float32Array(6);
  for (let i = 0; i < s.a.length; i++) {
    let occupied = 0;
    let total = 0;
    let glowSum = 0;
    const origin = ((i % s.w) * 2 + Math.floor(i / s.w) * 3 * width) * 4;
    for (let bit = 0; bit < 6; bit++) {
      const p = origin + ((bit % 2) + Math.floor(bit / 2) * width) * 4;
      offsets[bit] = p;
      if (glow) glowSum += glow[p + 3];
      levels[bit] = pixels[p] * 0.30 + pixels[p + 1] * 0.59 + pixels[p + 2] * 0.11;
      if (pixels[p + 3] < 64) continue;
      occupied++;
      total += levels[bit];
    }
    if (!occupied) continue;
    s.a[i] = 1;
    s.em[i] = glowSum / (6 * 255);
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
