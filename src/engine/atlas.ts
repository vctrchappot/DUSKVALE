export const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", Consolas, "Courier New", monospace';

export interface GlyphAtlas {
  canvas: HTMLCanvasElement;
  glyphs: string;
  count: number;
  cols: number;
  rows: number;
  cellW: number; // CSS px
  cellH: number; // CSS px
  texCellW: number; // 2x oversampled px
  texCellH: number; // 2x oversampled px
  index: Int16Array;
}

export function buildGlyphString(): string {
  let s = ' '; // index 0 = empty space
  for (let c = 33; c < 127; c++) s += String.fromCharCode(c);
  s += '·≈░▒▓█•◆◇▲✠✦»«';
  return s;
}

export const GLYPH_CHARS = buildGlyphString();

export function createGlyphAtlas(fontPx: number, dpr: number): GlyphAtlas {
  const measureCv = document.createElement('canvas');
  const mctx = measureCv.getContext('2d')!;
  mctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
  const measured = mctx.measureText('M').width;

  const cellW = Math.max(4, Math.round(measured));
  const cellH = Math.max(7, Math.round(cellW * 1.78));

  // 2x oversampling on top of DPR for crisp small ASCII glyphs
  const oversample = Math.min(3, Math.max(2, dpr * 2));
  const texCellW = Math.round(cellW * oversample);
  const texCellH = Math.round(cellH * oversample);

  const count = GLYPH_CHARS.length;
  const cols = 16;
  const rows = Math.ceil(count / cols);

  const canvas = document.createElement('canvas');
  canvas.width = cols * texCellW;
  canvas.height = rows * texCellH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${Math.round(fontPx * oversample)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  const index = new Int16Array(65536).fill(0);
  for (let k = 0; k < count; k++) {
    const ch = GLYPH_CHARS[k];
    const gx = k % cols;
    const gy = (k / cols) | 0;
    if (k > 0) {
      ctx.fillText(ch, gx * texCellW + texCellW * 0.5, gy * texCellH + texCellH * 0.54);
    }
    index[ch.charCodeAt(0)] = k;
  }

  return {
    canvas,
    glyphs: GLYPH_CHARS,
    count,
    cols,
    rows,
    cellW,
    cellH,
    texCellW,
    texCellH,
    index,
  };
}
