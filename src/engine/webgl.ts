import { createGlyphAtlas, SHADED_TILE, drawShadedTile, drawFineStroke, FINE_STROKE, GRASS_TUFT, materialFallback, type GlyphAtlas } from './atlas.ts';

const VS_QUAD = `#version 300 es
precision highp float;
const vec2 POS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FS_ASCII = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uAtlas;
uniform sampler2D uGlyphTex;
uniform sampler2D uFgTex;
uniform sampler2D uBgTex;

uniform vec2 uViewportPx;
uniform vec2 uCellPx;
uniform vec2 uGridSize;
uniform vec2 uAtlasGrid;
uniform vec2 uOffsetPx; // sub-cell + shake pixel offset
uniform float uGamma;
uniform float uContrast;
uniform float uFlash;

vec3 acesToneMap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  // Convert bottom-left vUv to top-left pixel coords
  vec2 px = vec2(vUv.x * uViewportPx.x, (1.0 - vUv.y) * uViewportPx.y);
  // Shift by sub-cell offset (grid has +1 padding on left/top)
  vec2 worldPx = px + uOffsetPx;
  vec2 cellF = worldPx / uCellPx;
  vec2 cellIdx = floor(cellF);
  vec2 cellLocal = fract(cellF);

  vec2 gridUv = (cellIdx + 0.5) / uGridSize;
  gridUv = clamp(gridUv, vec2(0.0), vec2(1.0));

  float glyphNorm = texture(uGlyphTex, gridUv).r;
  float glyphId = floor(glyphNorm * 255.0 + 0.5);
  vec4 fg = texture(uFgTex, gridUv);
  vec4 bg = texture(uBgTex, gridUv);

  float alpha = 0.0;
  if (glyphId > 0.5) {
    float gx = mod(glyphId, uAtlasGrid.x);
    float gy = floor(glyphId / uAtlasGrid.x);
    vec2 atlasUv = (vec2(gx, gy) + cellLocal) / uAtlasGrid;
    // Crisp glyph stroke curve for razor-sharp small typography
    alpha = smoothstep(0.14, 0.72, texture(uAtlas, atlasUv).a);
  }

  // Deep obsidian void backdrop with razor-sharp glowing typographic ink
  vec3 col = mix(bg.rgb, fg.rgb, alpha);
  // Emissive boost stored in fg.a
  float em = fg.a * alpha;
  col += fg.rgb * em * 0.55;

  // ACES filmic tonemap with rich dark-fantasy contrast
  col = acesToneMap(col * 1.28);

  // Subtle dark-fantasy split-toning: cool midnight shadows, warm ember highlights
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 shadowTint = vec3(0.92, 0.96, 1.08);
  vec3 hiTint = vec3(1.04, 1.01, 0.96);
  col *= mix(shadowTint, hiTint, smoothstep(0.12, 0.76, luma));

  // High contrast mode
  if (uContrast > 0.5) {
    col = clamp((col - 0.5) * 1.28 + 0.5, 0.0, 1.0);
  }

  // Gamma adjustment
  col = pow(max(col, vec3(0.0)), vec3(1.0 / max(0.5, uGamma)));

  // Lightning flash
  if (uFlash > 0.005) {
    col = mix(col, vec3(0.78, 0.84, 1.0), clamp(uFlash * 0.28, 0.0, 0.35));
  }

  // Selective bloom on emissive fires, moon reflection, glowing eyes/blades & bright highlights
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomMask = clamp(em * 1.25 + max(0.0, lum - 0.66) * 1.5, 0.0, 1.0);
  outColor = vec4(col, bloomMask);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
void main() {
  vec4 s = texture(uScene, vUv);
  outColor = vec4(s.rgb * s.a, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 sum = texture(uTex, vUv).rgb * 0.227027;
  sum += texture(uTex, vUv + uDir * 1.384615).rgb * 0.316216;
  sum += texture(uTex, vUv - uDir * 1.384615).rgb * 0.316216;
  sum += texture(uTex, vUv + uDir * 3.230769).rgb * 0.070270;
  sum += texture(uTex, vUv - uDir * 3.230769).rgb * 0.070270;
  outColor = vec4(sum, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 col = scene + bloom * uBloomStrength;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error: ${log}`);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${log}`);
  }
  return prog;
}

export interface RenderSubmitParams {
  glyphs: Uint8Array;
  fg: Uint8Array; // RGBA8
  bg: Uint8Array; // RGBA8
  offsetPxX: number;
  offsetPxY: number;
  gamma: number;
  highContrast: boolean;
  bloom: boolean;
  flash: number;
}

export class WebGLAsciiRenderer {
  canvas: HTMLCanvasElement;
  atlas!: GlyphAtlas;
  dpr = 1;
  viewportW = 0;
  viewportH = 0;
  visCols = 0;
  visRows = 0;
  gridCols = 0; // visCols + 2 for smooth sub-cell scrolling
  gridRows = 0; // visRows + 2
  cellW = 7;
  cellH = 12;
  fontPx = 9;
  usingWebGL = false;

  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  private progAscii: WebGLProgram | null = null;
  private progBright: WebGLProgram | null = null;
  private progBlur: WebGLProgram | null = null;
  private progComp: WebGLProgram | null = null;

  private texAtlas: WebGLTexture | null = null;
  private texGlyph: WebGLTexture | null = null;
  private texFg: WebGLTexture | null = null;
  private texBg: WebGLTexture | null = null;

  private fboScene: WebGLFramebuffer | null = null;
  private texScene: WebGLTexture | null = null;
  private fboBloomA: WebGLFramebuffer | null = null;
  private texBloomA: WebGLTexture | null = null;
  private fboBloomB: WebGLFramebuffer | null = null;
  private texBloomB: WebGLTexture | null = null;
  private bloomW = 1;
  private bloomH = 1;

  constructor(canvas: HTMLCanvasElement, fontPx: number) {
    this.canvas = canvas;
    this.fontPx = fontPx;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (gl) {
      this.gl = gl;
      this.usingWebGL = true;
      this.initWebGL();
    } else {
      this.ctx2d = canvas.getContext('2d');
      this.usingWebGL = false;
    }
    this.resize(fontPx);
  }

  private initWebGL(): void {
    const gl = this.gl!;
    this.vao = gl.createVertexArray();
    this.progAscii = linkProgram(gl, VS_QUAD, FS_ASCII);
    this.progBright = linkProgram(gl, VS_QUAD, FS_BRIGHT);
    this.progBlur = linkProgram(gl, VS_QUAD, FS_BLUR);
    this.progComp = linkProgram(gl, VS_QUAD, FS_COMPOSITE);

    this.texAtlas = this.createTex(gl.LINEAR);
    this.texGlyph = this.createTex(gl.NEAREST);
    this.texFg = this.createTex(gl.NEAREST);
    this.texBg = this.createTex(gl.NEAREST);

    this.texScene = this.createTex(gl.LINEAR);
    this.fboScene = gl.createFramebuffer();
    this.texBloomA = this.createTex(gl.LINEAR);
    this.fboBloomA = gl.createFramebuffer();
    this.texBloomB = this.createTex(gl.LINEAR);
    this.fboBloomB = gl.createFramebuffer();
  }

  private createTex(filter: number): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  resize(fontPx?: number): void {
    if (fontPx !== undefined) this.fontPx = fontPx;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.atlas = createGlyphAtlas(this.fontPx, this.dpr);
    this.cellW = this.atlas.cellW;
    this.cellH = this.atlas.cellH;

    this.viewportW = Math.max(320, window.innerWidth);
    this.viewportH = Math.max(200, window.innerHeight);

    this.visCols = Math.ceil(this.viewportW / this.cellW);
    this.visRows = Math.ceil(this.viewportH / this.cellH);
    this.gridCols = this.visCols + 2;
    this.gridRows = this.visRows + 2;

    const pw = Math.round(this.viewportW * this.dpr);
    const ph = Math.round(this.viewportH * this.dpr);
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.canvas.style.width = `${this.viewportW}px`;
    this.canvas.style.height = `${this.viewportH}px`;

    if (this.usingWebGL && this.gl) {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      // Upload glyph atlas
      gl.bindTexture(gl.TEXTURE_2D, this.texAtlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);

      // Allocate data textures
      gl.bindTexture(gl.TEXTURE_2D, this.texGlyph);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.gridCols, this.gridRows, 0, gl.RED, gl.UNSIGNED_BYTE, null);

      gl.bindTexture(gl.TEXTURE_2D, this.texFg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.gridCols, this.gridRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindTexture(gl.TEXTURE_2D, this.texBg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.gridCols, this.gridRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      // Scene FBO
      gl.bindTexture(gl.TEXTURE_2D, this.texScene);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texScene, 0);

      // Quarter-res bloom FBOs
      this.bloomW = Math.max(1, Math.floor(pw / 4));
      this.bloomH = Math.max(1, Math.floor(ph / 4));

      gl.bindTexture(gl.TEXTURE_2D, this.texBloomA);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bloomW, this.bloomH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBloomA);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texBloomA, 0);

      gl.bindTexture(gl.TEXTURE_2D, this.texBloomB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bloomW, this.bloomH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBloomB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texBloomB, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  submit(p: RenderSubmitParams): void {
    if (this.usingWebGL && this.gl) {
      this.submitWebGL(p);
    } else if (this.ctx2d) {
      this.submitFallback2D(p);
    }
  }

  private submitWebGL(p: RenderSubmitParams): void {
    const gl = this.gl!;
    const pw = this.canvas.width;
    const ph = this.canvas.height;

    gl.bindVertexArray(this.vao);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // Upload per-frame grid textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texAtlas);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texGlyph);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridCols, this.gridRows, gl.RED, gl.UNSIGNED_BYTE, p.glyphs);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texFg);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridCols, this.gridRows, gl.RGBA, gl.UNSIGNED_BYTE, p.fg);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texBg);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridCols, this.gridRows, gl.RGBA, gl.UNSIGNED_BYTE, p.bg);

    // Pass 1: ASCII raster -> fboScene (or directly to screen if bloom off)
    gl.bindFramebuffer(gl.FRAMEBUFFER, p.bloom ? this.fboScene : null);
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(this.progAscii);

    gl.uniform1i(gl.getUniformLocation(this.progAscii!, 'uAtlas'), 0);
    gl.uniform1i(gl.getUniformLocation(this.progAscii!, 'uGlyphTex'), 1);
    gl.uniform1i(gl.getUniformLocation(this.progAscii!, 'uFgTex'), 2);
    gl.uniform1i(gl.getUniformLocation(this.progAscii!, 'uBgTex'), 3);
    gl.uniform2f(gl.getUniformLocation(this.progAscii!, 'uViewportPx'), this.viewportW, this.viewportH);
    gl.uniform2f(gl.getUniformLocation(this.progAscii!, 'uCellPx'), this.cellW, this.cellH);
    gl.uniform2f(gl.getUniformLocation(this.progAscii!, 'uGridSize'), this.gridCols, this.gridRows);
    gl.uniform2f(gl.getUniformLocation(this.progAscii!, 'uAtlasGrid'), this.atlas.cols, this.atlas.rows);
    gl.uniform2f(gl.getUniformLocation(this.progAscii!, 'uOffsetPx'), p.offsetPxX, p.offsetPxY);
    gl.uniform1f(gl.getUniformLocation(this.progAscii!, 'uGamma'), p.gamma);
    gl.uniform1f(gl.getUniformLocation(this.progAscii!, 'uContrast'), p.highContrast ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(this.progAscii!, 'uFlash'), p.flash);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!p.bloom) return;

    // Pass 2: Bright extract -> fboBloomA
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBloomA);
    gl.viewport(0, 0, this.bloomW, this.bloomH);
    gl.useProgram(this.progBright);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.uniform1i(gl.getUniformLocation(this.progBright!, 'uScene'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 3: Horizontal blur -> fboBloomB
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBloomB);
    gl.useProgram(this.progBlur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texBloomA);
    gl.uniform1i(gl.getUniformLocation(this.progBlur!, 'uTex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.progBlur!, 'uDir'), 1.6 / this.bloomW, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 4: Vertical blur -> fboBloomA
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBloomA);
    gl.bindTexture(gl.TEXTURE_2D, this.texBloomB);
    gl.uniform2f(gl.getUniformLocation(this.progBlur!, 'uDir'), 0, 1.6 / this.bloomH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 5: Composite -> Screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(this.progComp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.uniform1i(gl.getUniformLocation(this.progComp!, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texBloomA);
    gl.uniform1i(gl.getUniformLocation(this.progComp!, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.progComp!, 'uBloomStrength'), 0.52);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private submitFallback2D(p: RenderSubmitParams): void {
    const ctx = this.ctx2d!;
    const cw = this.cellW * this.dpr;
    const ch = this.cellH * this.dpr;
    const ox = -p.offsetPxX * this.dpr;
    const oy = -p.offsetPxY * this.dpr;
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `600 ${Math.round(this.fontPx * this.dpr)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < this.gridRows; y++) {
      const py = oy + y * ch;
      if (py + ch < 0 || py > this.canvas.height) continue;
      for (let x = 0; x < this.gridCols; x++) {
        const px = ox + x * cw;
        if (px + cw < 0 || px > this.canvas.width) continue;
        const i = y * this.gridCols + x;
        const o = i * 4;
        ctx.fillStyle = `rgb(${p.bg[o]},${p.bg[o + 1]},${p.bg[o + 2]})`;
        ctx.fillRect(px, py, cw + 0.5, ch + 0.5);
        const gid = p.glyphs[i];
        if (gid > 0) {
          ctx.fillStyle = `rgb(${p.fg[o]},${p.fg[o + 1]},${p.fg[o + 2]})`;
          const glyph = this.atlas.glyphs[gid];
          const code = glyph.charCodeAt(0);
          if (code >= SHADED_TILE) {
            drawShadedTile(ctx, code - SHADED_TILE, px, py, cw, ch);
          } else if (code >= FINE_STROKE) {
            ctx.strokeStyle = ctx.fillStyle;
            drawFineStroke(ctx, code, px, py, cw, ch);
          } else {
            ctx.fillText(code >= GRASS_TUFT ? materialFallback(code) : glyph, px + cw * 0.5, py + ch * 0.54);
          }
        }
      }
    }
  }
}
