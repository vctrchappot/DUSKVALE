export const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", Consolas, "Courier New", monospace';

export interface GlyphAtlas {
  canvas: HTMLCanvasElement;
  glyphs: string;
  count: number;
  cols: number;
  rows: number;
  cellW: number; // CSS px
  cellH: number; // CSS px
  texCellW: number; // oversampled px
  texCellH: number; // oversampled px
  index: Int16Array;
}

export function buildGlyphString(): string {
  let s = ' '; // index 0 = empty space
  for (let c = 33; c < 127; c++) s += String.fromCharCode(c);
  s += '·≈░▒▓█•◆◇▲✠✦»«°';
  return s;
}

export const GLYPH_CHARS = buildGlyphString();

export function createGlyphAtlas(fontPx: number, dpr: number): GlyphAtlas {
  const measureCv = document.createElement('canvas');
  const mctx = measureCv.getContext('2d')!;
  mctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
  const measured = mctx.measureText('M').width;

  // Tight typographic packing (aspect ~1.48) for fine woven ASCII tapestry look
  const cellW = Math.max(4, Math.round(measured * 0.96));
  const cellH = Math.max(6, Math.round(cellW * 1.48));

  // High oversampling so tiny 5-9px glyphs remain razor-sharp
  const oversample = Math.min(4, Math.max(2.5, dpr * 2.5));
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
  // Render slightly fuller font size inside cell for dense interwoven texture
  ctx.font = `600 ${Math.round(fontPx * 1.12 * oversample)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  const index = new Int16Array(65536).fill(0);
  for (let k = 0; k < count; k++) {
    const ch = GLYPH_CHARS[k];
    const gx = k % cols;
    const gy = (k / cols) | 0;
    if (k > 0) {
      ctx.fillText(ch, gx * texCellW + texCellW * 0.5, gy * texCellH + texCellH * 0.53);
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
