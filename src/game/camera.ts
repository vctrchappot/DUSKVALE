import type { GameOptions } from '../engine/options.ts';
import { ASP, clamp, rand, smoothDamp } from '../engine/util.ts';

/**
 * Smooth float camera with:
 * - Critically damped spring (smoothDamp, ~0.25s)
 * - 1.5 world-unit deadzone around player
 * - Gentle walk-direction lookahead (max 2 units), never swings with mouse movement
 * - Pixel-offset screenshake (never integer cell jumps), disableable via reduceCameraMotion
 */
export class SmoothCamera {
  x = 0;
  y = 0;
  private anchorX = 0;
  private anchorY = 0;
  private velX = { v: 0 };
  private velY = { v: 0 };
  private lookX = 0;
  private lookY = 0;

  shakePower = 0;
  shakePxX = 0;
  shakePxY = 0;

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.anchorX = x;
    this.anchorY = y;
    this.velX.v = 0;
    this.velY.v = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.shakePower = 0;
    this.shakePxX = 0;
    this.shakePxY = 0;
  }

  addShake(amount: number, opts: GameOptions): void {
    if (opts.reduceCameraMotion) return;
    this.shakePower = Math.min(1.0, Math.max(this.shakePower, amount));
  }

  update(
    dt: number,
    targetX: number,
    targetY: number,
    moveDirX: number,
    moveDirY: number,
    aimX: number,
    aimY: number,
    mouseHoldTime: number,
    opts: GameOptions,
  ): void {
    // 1.5 world-unit deadzone
    const deadzone = 1.5;
    const dx = targetX - this.anchorX;
    const dy = (targetY - this.anchorY) * ASP;
    const d = Math.hypot(dx, dy);
    if (d > deadzone) {
      const pull = (d - deadzone) / d;
      this.anchorX += dx * pull;
      this.anchorY += (dy * pull) / ASP;
    }

    // Lookahead: max 2 units in walk direction (no mouse swing!)
    let wantLookX = 0;
    let wantLookY = 0;
    if (!opts.reduceCameraMotion) {
      if (Math.hypot(moveDirX, moveDirY) > 0.1) {
        wantLookX = moveDirX * 1.8;
        wantLookY = (moveDirY * 1.8) / ASP;
      } else if (opts.mouseLookahead && mouseHoldTime > 0.5) {
        wantLookX = aimX * 1.4;
        wantLookY = (aimY * 1.4) / ASP;
      }
    }
    const lk = 1 - Math.exp(-dt * 4.5);
    this.lookX += (wantLookX - this.lookX) * lk;
    this.lookY += (wantLookY - this.lookY) * lk;

    const goalX = this.anchorX + this.lookX;
    const goalY = this.anchorY + this.lookY;

    this.x = smoothDamp(this.x, goalX, this.velX, 0.24, dt);
    this.y = smoothDamp(this.y, goalY, this.velY, 0.24, dt);

    // Pixel-offset screenshake with smooth decay
    if (this.shakePower > 0.005 && !opts.reduceCameraMotion) {
      const pxMag = this.shakePower * 8.5;
      this.shakePxX = rand(-pxMag, pxMag);
      this.shakePxY = rand(-pxMag * 0.75, pxMag * 0.75);
      this.shakePower = Math.max(0, this.shakePower - dt * 2.8);
    } else {
      this.shakePower = 0;
      this.shakePxX = 0;
      this.shakePxY = 0;
    }
  }

  /** Computes integer top-left grid cell and sub-cell pixel offset for the WebGL2 shader. */
  computeViewGrid(
    visCols: number,
    visRows: number,
    cellW: number,
    cellH: number,
    worldScaleX: number,
    worldScaleY: number,
  ): {
    camCellX: number;
    camCellY: number;
    camLeftWorld: number;
    camTopWorld: number;
    offsetPxX: number;
    offsetPxY: number;
  } {
    // Camera centre in ASCII cell coordinates
    const centerCellX = this.x * worldScaleX;
    const centerCellY = this.y * worldScaleY;
    const leftCellF = centerCellX - visCols * 0.5;
    const topCellF = centerCellY - visRows * 0.5;

    // Grid starts 1 cell before leftCellF/topCellF so sub-cell shift + shake never exposes empty borders
    const camCellX = Math.floor(leftCellF) - 1;
    const camCellY = Math.floor(topCellF) - 1;

    const fracX = leftCellF - Math.floor(leftCellF);
    const fracY = topCellF - Math.floor(topCellF);

    // Offset in pixels inside the padded grid (base +1 cell padding + fractional scroll + pixel shake)
    const offsetPxX = clamp((1 + fracX) * cellW + this.shakePxX, 0, cellW * 2 - 1);
    const offsetPxY = clamp((1 + fracY) * cellH + this.shakePxY, 0, cellH * 2 - 1);

    return {
      camCellX,
      camCellY,
      camLeftWorld: leftCellF / worldScaleX,
      camTopWorld: topCellF / worldScaleY,
      offsetPxX,
      offsetPxY,
    };
  }
}
