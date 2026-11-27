import { FONT_FAMILY } from './atlas.ts';
import { clamp } from './util.ts';

export interface OverlayLabel {
  wx: number;
  wy: number;
  text: string;
  color: string;
  bg?: string;
  size?: number;
  bold?: boolean;
  alpha?: number;
}

export interface OverlayBar {
  wx: number;
  wy: number;
  ratio: number;
  poiseRatio?: number;
  widthPx: number;
  color: string;
  name?: string;
  locked?: boolean;
}

export interface OverlayArrow {
  targetWx: number;
  targetWy: number;
  label: string;
  color: string;
}

/**
 * Unlit screen-space text and indicator overlay.
 * Renders crisp >= 12px labels, damage numbers, enemy health bars,
 * lock-on reticles, and off-screen quest arrows outside the ASCII lighting pass.
 */
export class TextOverlay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(320, window.innerWidth);
    this.height = Math.max(200, window.innerHeight);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  render(
    camLeftWorld: number,
    camTopWorld: number,
    cellW: number,
    cellH: number,
    worldScaleX: number,
    worldScaleY: number,
    uiScale: number,
    labels: OverlayLabel[],
    bars: OverlayBar[],
    lockTarget: { wx: number; wy: number } | null,
    arrow: OverlayArrow | null,
  ): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const toScreenX = (wx: number) => (wx - camLeftWorld) * worldScaleX * cellW;
    const toScreenY = (wy: number) => (wy - camTopWorld) * worldScaleY * cellH;

    // Enemy HP bars + optional nameplates
    for (const b of bars) {
      const sx = toScreenX(b.wx);
      const sy = toScreenY(b.wy);
      if (sx < -80 || sx > this.width + 80 || sy < -60 || sy > this.height + 60) continue;

      const w = b.widthPx * uiScale;
      const h = 5 * uiScale;
      const x0 = sx - w * 0.5;
      const y0 = sy;

      ctx.fillStyle = 'rgba(6, 6, 10, 0.85)';
      ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + (b.poiseRatio !== undefined ? 4 : 2));
      ctx.fillStyle = '#24181a';
      ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = b.color;
      ctx.fillRect(x0, y0, w * clamp(b.ratio, 0, 1), h);

      if (b.poiseRatio !== undefined) {
        ctx.fillStyle = '#e5be64';
        ctx.fillRect(x0, y0 + h + 1, w * clamp(b.poiseRatio, 0, 1), 2);
      }

      if (b.name) {
        const fs = Math.max(12, Math.round(12 * uiScale));
        ctx.font = `600 ${fs}px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(b.name).width;
        ctx.fillStyle = 'rgba(6, 6, 10, 0.78)';
        ctx.fillRect(sx - tw * 0.5 - 5, y0 - fs - 5, tw + 10, fs + 3);
        ctx.fillStyle = b.locked ? '#ffd98a' : '#e6dcc8';
        ctx.fillText(b.name, sx, y0 - 3);
      }
    }

    // Lock-on reticle
    if (lockTarget) {
      const sx = toScreenX(lockTarget.wx);
      const sy = toScreenY(lockTarget.wy);
      ctx.strokeStyle = '#ffcb6b';
      ctx.lineWidth = 1.6;
      const r = 14 * uiScale;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - r - 4, sy);
      ctx.lineTo(sx - r + 4, sy);
      ctx.moveTo(sx + r - 4, sy);
      ctx.lineTo(sx + r + 4, sy);
      ctx.moveTo(sx, sy - r - 4);
      ctx.lineTo(sx, sy - r + 4);
      ctx.moveTo(sx, sy + r - 4);
      ctx.lineTo(sx, sy + r + 4);
      ctx.stroke();
    }

    // Crisp unlit labels (names, damage numbers, signposts)
    for (const l of labels) {
      const sx = toScreenX(l.wx);
      const sy = toScreenY(l.wy);
      if (sx < -120 || sx > this.width + 120 || sy < -40 || sy > this.height + 40) continue;

      const fs = Math.max(12, Math.round((l.size ?? 13) * uiScale));
      ctx.font = `${l.bold ? '700' : '600'} ${fs}px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = l.alpha ?? 1;

      const tw = ctx.measureText(l.text).width;
      const padX = 6;
      const padY = 3;
      ctx.fillStyle = l.bg ?? 'rgba(6, 7, 11, 0.78)';
      ctx.fillRect(sx - tw * 0.5 - padX, sy - fs * 0.5 - padY, tw + padX * 2, fs + padY * 2);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, sx, sy + 0.5);
      ctx.globalAlpha = 1;
    }

    // Off-screen quest target edge arrow
    if (arrow) {
      const tx = toScreenX(arrow.targetWx);
      const ty = toScreenY(arrow.targetWy);
      const margin = 46;
      const onScreen = tx > margin && tx < this.width - margin && ty > margin && ty < this.height - margin;
      if (!onScreen) {
        const cx = this.width * 0.5;
        const cy = this.height * 0.5;
        const dx = tx - cx;
        const dy = ty - cy;
        const ang = Math.atan2(dy, dx);
        const rx = this.width * 0.5 - margin;
        const ry = this.height * 0.5 - margin;
        const scale = Math.min(rx / (Math.abs(dx) || 0.001), ry / (Math.abs(dy) || 0.001));
        const ax = cx + dx * scale;
        const ay = cy + dy * scale;

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(8, 8, 12, 0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = arrow.color;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-6, -6);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const fs = Math.max(12, Math.round(12 * uiScale));
        ctx.font = `600 ${fs}px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const tw = ctx.measureText(arrow.label).width;
        const lx = clamp(ax, tw * 0.5 + 12, this.width - tw * 0.5 - 12);
        const ly = clamp(ay + 18, 18, this.height - 26);
        ctx.fillStyle = 'rgba(6, 7, 11, 0.82)';
        ctx.fillRect(lx - tw * 0.5 - 5, ly - 2, tw + 10, fs + 4);
        ctx.fillStyle = arrow.color;
        ctx.fillText(arrow.label, lx, ly);
      }
    }
  }
}
