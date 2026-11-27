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

// Composite glyphs share the regular atlas and its one-byte cell indices.
export const GRASS_TUFT = 0xe000; // three lean directions, four silhouettes each
export const STONE_FACE = GRASS_TUFT + 12; // four lightness bands, four faces each
export const WATER_LINE = STONE_FACE + 16; // four broken bands
export const FINE_STROKE = WATER_LINE + 4;
export const SHADED_TILE = FINE_STROKE + 13;
const MATERIAL_END = SHADED_TILE + 64;

// Six samples per cell describe the boundary between two shaded surfaces.
export function drawShadedTile(ctx: CanvasRenderingContext2D, mask: number, x: number, y: number, w: number, h: number): void {
  for (let bit = 0; bit < 6; bit++) {
    if (mask & (1 << bit)) ctx.fillRect(x + (bit % 2) * w / 2, y + Math.floor(bit / 2) * h / 3, w / 2, h / 3);
  }
}

// Each axis connects to either or both neighbouring cells. An isolated point is an eye or glint.
export const STROKE_AXES = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;

export function drawFineStroke(ctx: CanvasRenderingContext2D, code: number, x: number, y: number, w: number, h: number): void {
  const stroke = code - FINE_STROKE;
  if (stroke === 12) {
    ctx.fillRect(x + w * 0.22, y + h * 0.38, w * 0.56, h * 0.24);
    return;
  }
  const [dx, dy] = STROKE_AXES[Math.floor(stroke / 3)];
  const ends = stroke % 3 + 1;
  const start = ends & 1 ? -0.52 : -0.10;
  const end = ends & 2 ? 0.52 : 0.10;
  ctx.beginPath();
  ctx.moveTo(x + w * (0.5 + dx * start), y + h * (0.5 + dy * start));
  ctx.lineTo(x + w * (0.5 + dx * end), y + h * (0.5 + dy * end));
  ctx.lineWidth = Math.max(w * 0.30, h * 0.18);
  ctx.stroke();
}

export function materialFallback(code: number): string {
  if (code < STONE_FACE) return ['\\', '|', '/'][Math.floor((code - GRASS_TUFT) / 4)];
  if (code < WATER_LINE) return '.:-='[Math.floor((code - STONE_FACE) / 4)];
  return '-_=~'[code - WATER_LINE];
}

function drawMaterial(ctx: CanvasRenderingContext2D, code: number, w: number, h: number): void {
  const variant = code & 3;
  if (code < STONE_FACE) {
    const lean = Math.floor((code - GRASS_TUFT) / 4) - 1;
    for (let n = 0; n < 3; n++) {
      const root = w * (0.18 + n * 0.29);
      const tip = root + w * (lean * 0.24 + (n - 1) * 0.13);
      const height = h * (0.46 + ((variant + n * 3) % 5) * 0.12);
      ctx.globalAlpha = n === 1 ? 0.96 : 0.36 + n * 0.12;
      ctx.beginPath();
      ctx.moveTo(root - w * 0.08, h);
      ctx.quadraticCurveTo(root, h * 0.58, tip, h - height);
      ctx.quadraticCurveTo(root + w * 0.1, h * 0.7, root + w * 0.09, h);
      ctx.fill();
    }
  } else if (code < WATER_LINE) {
    const band = Math.floor((code - STONE_FACE) / 4);
    // A chipped upper lip and a recessed bedding plane follow the masonry course.
    const chip = w * (0.14 + variant * 0.19);
    ctx.globalAlpha = 0.40 + band * 0.12;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.30);
    ctx.lineTo(chip, h * 0.18);
    ctx.lineTo(chip + w * 0.12, h * 0.32);
    ctx.lineTo(w, h * 0.24);
    ctx.lineTo(w, h * (0.39 + band * 0.06));
    ctx.lineTo(0, h * 0.48);
    ctx.fill();
    ctx.globalAlpha = 0.22 + band * 0.055;
    ctx.fillRect(chip, h * 0.70, w - chip, h * 0.11);
  } else if (code >= SHADED_TILE) {
    drawShadedTile(ctx, code - SHADED_TILE, 0, 0, w, h);
  } else if (code >= FINE_STROKE) {
    ctx.strokeStyle = '#fff';
    drawFineStroke(ctx, code, 0, 0, w, h);
  } else {
    ctx.fillRect(w * (variant % 2) * 0.16, h * 0.42, w * (0.56 + variant * 0.12), h * 0.12);
    ctx.globalAlpha = 0.36;
    ctx.fillRect(w * 0.39, h * 0.72, w * 0.58, h * 0.08);
  }
}

export function buildGlyphString(): string {
  let s = ' '; // index 0 = empty space
  for (let c = 33; c < 127; c++) s += String.fromCharCode(c);
  s += '·≈░▒▓█•◆◇▲✠✦»«°';
  for (let code = GRASS_TUFT; code < MATERIAL_END; code++) s += String.fromCharCode(code);
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
    if (ch.charCodeAt(0) >= GRASS_TUFT) {
      ctx.save();
      ctx.translate(gx * texCellW, gy * texCellH);
      ctx.beginPath();
      ctx.rect(0, 0, texCellW, texCellH);
      ctx.clip();
      drawMaterial(ctx, ch.charCodeAt(0), texCellW, texCellH);
      ctx.restore();
    } else if (k > 0) {
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
