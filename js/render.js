'use strict';
(function (DV) {
  const { clamp, hash, noise, ASP } = DV;
  const W = DV.World, T = W.T, S = DV.S;

  const R = (DV.R = { CW: 7, CH: 13, cols: 0, rows: 0, fontPx: 13, camX: 0, camY: 0, xray: null });
  const FAM = '"IBM Plex Mono", Consolas, "Courier New", monospace';

  let canvas, ctx, bloom, bctx, colorCv, colorCtx, colorImg, atlas;
  let GW = 7, GH = 13;
  const gIndex = new Int16Array(65536).fill(-1);
  let GLYPHS = '';
  for (let c = 33; c < 127; c++) GLYPHS += String.fromCharCode(c);
  GLYPHS += '·≈░▒▓█•';

  let N = 0, CHR, MAT, BR, BG, BB, EM, FL, LR, LG, LB, GI, HV, PH, FOG;

  // --------------------------------------------------------------- Terrain styles
  // c base colour, v variance, lv glyph levels (dark -> bright, alternatives per level), k lum multiplier
  const TS = [];
  TS[T.DEEP] = { c: [0.05, 0.11, 0.2], v: 0.1, lv: ['.', '-', '-~', '~≈', '≈~='], k: 4.5, water: 1 };
  TS[T.WATER] = { c: [0.08, 0.17, 0.26], v: 0.12, lv: ['.', '.-', '-~', '~≈', '≈='], k: 4, water: 1 };
  TS[T.SHALLOW] = { c: [0.13, 0.23, 0.28], v: 0.15, lv: ['.', '.-', '-~', '~'], k: 3.2, water: 1 };
  TS[T.MARSH] = { c: [0.17, 0.23, 0.14], v: 0.3, lv: ['.', '.,', ',"', '"\';', ';"v'], k: 3, wind: 1 };
  TS[T.SAND] = { c: [0.34, 0.32, 0.27], v: 0.2, lv: ['.', '.', '.:', ':;'], k: 2.6 };
  TS[T.GRASS] = { c: [0.19, 0.38, 0.15], v: 0.35, lv: ['.', '.,', ',\'`', '"\';', ';vi', 'vwV'], k: 3, wind: 1 };
  TS[T.MOOR] = { c: [0.34, 0.29, 0.16], v: 0.35, lv: ['.', '.,', ',\'', ';i!', 'i!l'], k: 3, wind: 1 };
  TS[T.FOREST] = { c: [0.11, 0.21, 0.11], v: 0.35, lv: ['.', '.,', ',;', ';"'], k: 3.4 };
  TS[T.ROCK] = { c: [0.33, 0.34, 0.36], v: 0.3, lv: ['.', '.:', ':;', '=+', '%#'], k: 2.6 };
  TS[T.MOUNT] = { c: [0.42, 0.42, 0.46], v: 0.25, lv: ['.', ':', '^', 'A^', '#A'], k: 2.4 };
  TS[T.ROAD] = { c: [0.37, 0.33, 0.28], v: 0.3, lv: ['.', '.:', ':o', 'o=', '#='], k: 2.6 };
  TS[T.FLOOR] = { c: [0.35, 0.35, 0.37], v: 0.25, lv: ['.', '.:', '+:', '=+', '#='], k: 2.6 };
  TS[T.WALL] = { c: [0.56, 0.55, 0.53], v: 0.2, lv: ['#'], k: 2 };
  TS[T.ASH] = { c: [0.22, 0.19, 0.19], v: 0.35, lv: ['.', '.,', ',:', ':;', '%'], k: 3 };
  TS[T.DIRT] = { c: [0.29, 0.23, 0.17], v: 0.3, lv: ['.', '.,', ',:', ':;'], k: 3 };
  TS[T.RUBBLE] = { c: [0.4, 0.39, 0.38], v: 0.3, lv: ['.', ',', ',:', '%;', '%&'], k: 2.6 };
  TS[T.GATE] = { c: [0.42, 0.47, 0.58], v: 0.1, lv: ['H'], k: 2 };
  TS[T.BRIDGE] = { c: [0.4, 0.28, 0.17], v: 0.2, lv: ['='], k: 2 };
  TS[T.CARPET] = { c: [0.5, 0.07, 0.08], v: 0.15, lv: ['.', ':', '=', '#'], k: 3 };
  R.TS = TS;

  // --------------------------------------------------------------- Setup
  R.init = function (cv, bcv) {
    canvas = cv; ctx = cv.getContext('2d');
    bloom = bcv; bctx = bcv.getContext('2d');
    colorCv = document.createElement('canvas');
    colorCtx = colorCv.getContext('2d');
    R.resize();
  };

  R.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const m = document.createElement('canvas').getContext('2d');
    m.font = `${R.fontPx}px ${FAM}`;
    const w = m.measureText('M').width;
    R.CW = Math.max(4, Math.round(w));
    R.CH = Math.round(R.CW * 1.8);
    R.cols = Math.ceil(window.innerWidth / R.CW);
    R.rows = Math.ceil(window.innerHeight / R.CH);
    GW = Math.round(R.CW * dpr); GH = Math.round(R.CH * dpr);
    canvas.width = R.cols * GW; canvas.height = R.rows * GH;
    canvas.style.width = R.cols * R.CW + 'px'; canvas.style.height = R.rows * R.CH + 'px';
    bloom.width = Math.ceil(canvas.width / 4); bloom.height = Math.ceil(canvas.height / 4);
    bloom.style.width = canvas.style.width; bloom.style.height = canvas.style.height;
    colorCv.width = R.cols; colorCv.height = R.rows;
    colorImg = colorCtx.createImageData(R.cols, R.rows);

    atlas = document.createElement('canvas');
    atlas.width = GW * GLYPHS.length; atlas.height = GH;
    const a = atlas.getContext('2d');
    a.font = `${Math.round(R.fontPx * dpr)}px ${FAM}`;
    a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillStyle = '#fff';
    gIndex.fill(-1);
    for (let k = 0; k < GLYPHS.length; k++) {
      a.fillText(GLYPHS[k], k * GW + GW / 2, GH / 2 + dpr);
      gIndex[GLYPHS.charCodeAt(k)] = k;
    }

    N = R.cols * R.rows;
    CHR = new Int32Array(N); MAT = new Uint8Array(N); FL = new Uint8Array(N); PH = new Uint8Array(N);
    BR = new Float32Array(N); BG = new Float32Array(N); BB = new Float32Array(N); EM = new Float32Array(N);
    LR = new Float32Array(N); LG = new Float32Array(N); LB = new Float32Array(N); HV = new Float32Array(N);
    GI = new Int16Array(N); FOG = new Float32Array(N);
  };

  // --------------------------------------------------------------- Buffer writes
  function put(x, y, code, r, g, b, e, a) {
    if (x < 0 || y < 0 || x >= R.cols || y >= R.rows) return;
    const i = y * R.cols + x;
    if (a === undefined || a >= 1) {
      CHR[i] = code; BR[i] = r; BG[i] = g; BB[i] = b; EM[i] = e;
    } else {
      BR[i] += (r - BR[i]) * a; BG[i] += (g - BG[i]) * a; BB[i] += (b - BB[i]) * a; EM[i] += (e - EM[i]) * a;
      if (a > 0.45) CHR[i] = code;
    }
    FL[i] |= 2;
  }
  R.put = put;
  R.putW = (wx, wy, code, r, g, b, e, a) => put(Math.floor(wx) - R.camX, Math.floor(wy) - R.camY, code, r, g, b, e, a);
  R.text = function (wx, wy, str, r, g, b, e) {
    const sx = Math.floor(wx) - R.camX - (str.length >> 1), sy = Math.floor(wy) - R.camY;
    for (let k = 0; k < str.length; k++) {
      const c = str.charCodeAt(k);
      if (c !== 32) put(sx + k, sy, c, r, g, b, e === undefined ? 1 : e);
    }
  };

  // --------------------------------------------------------------- Terrain
  function terrainPass(t) {
    const cols = R.cols, rows = R.rows, x0 = R.camX, y0 = R.camY;
    const gateOpen = DV.G.flags.gateOpen;
    for (let y = 0; y < rows; y++) {
      const wy = y0 + y;
      for (let x = 0; x < cols; x++) {
        const wx = x0 + x;
        const c = W.chunkAtCell(wx, wy);
        const ci = ((wy & 31) << 5) | (wx & 31);
        let tp = c.type[ci];
        if (tp === T.GATE && gateOpen) tp = T.FLOOR;
        const st = TS[tp];
        const hv = hash(wx, wy, 11);
        const i = y * cols + x;
        const m = c.shade[ci] * (1 + (hv - 0.5) * st.v);
        let r = st.c[0] * m, g = st.c[1] * m, b = st.c[2] * m;
        let f = 0, ph = 0, code = -1;
        if (st.water) {
          const wv = Math.sin(wx * 0.35 + wy * 0.9 + t * 1.7) + Math.sin(wx * 0.13 - t * 1.1 + wy * 0.45);
          const k = 0.8 + 0.2 * wv;
          r *= k; g *= k; b *= k; f |= 1;
          ph = (Math.floor(t * 1.5 + wv * 1.3 + hv * 3) & 7);
        } else if (st.wind) {
          const wn = noise(wx * 0.07 - t * 0.9, wy * 0.16 + t * 0.2, 5);
          const k = 0.8 + wn * 0.4;
          r *= k; g *= k; b *= k;
          ph = Math.floor(wn * 6);
        } else if (tp === T.WALL) {
          const below = W.typeAt(wx, wy + 1);
          if (below !== T.WALL && below !== T.GATE) {
            r *= 0.5; g *= 0.5; b *= 0.55;
            code = ((wx & 1) === 0) ? 124 : 93; // | ]
          } else {
            code = (wy & 1) ? 61 : (hv < 0.12 ? 37 : 35); // = % #
          }
        } else if (tp === T.GATE) {
          code = (wx & 1) ? 72 : 124;
        } else if (tp === T.BRIDGE) {
          code = (wx % 3 === 0) ? 124 : 61;
        }
        CHR[i] = code; MAT[i] = tp; BR[i] = r; BG[i] = g; BB[i] = b; EM[i] = 0; FL[i] = f; HV[i] = hv; PH[i] = ph;
      }
    }
  }

  // --------------------------------------------------------------- Sprites
  function drawArt(spr, wx, wy, t, opts) {
    const sx0 = wx - R.camX - spr.ax, sy0 = wy - R.camY - spr.ay;
    if (sx0 > R.cols || sy0 > R.rows || sx0 + spr.w < 0 || sy0 + spr.h < 0) return;
    const flick = opts && opts.flick !== undefined ? opts.flick : 1;
    const xr = R.xray;
    for (let j = 0; j < spr.h; j++) {
      const row = spr.rows[j];
      const rl = 0.72 + 0.5 * (1 - j / spr.h);
      for (let i = 0; i < row.length; i++) {
        let ch = row[i];
        if (ch === ' ') continue;
        const x = sx0 + i, y = sy0 + j;
        let e = 0, col;
        if (spr.em && spr.em[ch]) {
          col = spr.em[ch]; e = 1;
          const anim = spr.anim && spr.anim[ch];
          if (anim) ch = anim[(Math.floor(t * 9 + i * 3 + j * 5 + wx) % anim.length + anim.length) % anim.length];
          put(x, y, ch.charCodeAt(0), col[0] * flick, col[1] * flick, col[2] * flick, 1);
          continue;
        }
        col = spr.pal[ch] || spr.pal.d;
        let r = col[0] * rl, g = col[1] * rl, b = col[2] * rl;
        if (spr.embers && hash(wx + i, wy + j, Math.floor(t * 3)) < 0.12) { r = 1; g = 0.35; b = 0.08; e = 0.9; }
        let a = 1;
        if (xr && wy > xr.by && x >= xr.x0 && x <= xr.x1 && y >= xr.y0 && y <= xr.y1) a = 0.28;
        put(x, y, ch.charCodeAt(0), r, g, b, e, a);
      }
    }
  }

  function writeRefl(x, y, code, r, g, b, e) {
    if (x < 0 || y < 0 || x >= R.cols || y >= R.rows) return;
    const i = y * R.cols + x;
    if (!(FL[i] & 1) || (FL[i] & 2)) return;
    CHR[i] = code;
    BR[i] = BR[i] * 0.4 + r * 0.45; BG[i] = BG[i] * 0.4 + g * 0.45; BB[i] = BB[i] * 0.4 + b * 0.55;
    EM[i] = e * 0.6;
  }

  function reflectArt(spr, wx, wy, t) {
    const baseY = wy - R.camY, sx0 = wx - R.camX - spr.ax;
    if (baseY + spr.h + 1 < 0 || baseY > R.rows || sx0 > R.cols || sx0 + spr.w < 0) return;
    for (let j = 0; j < spr.h; j++) {
      const ty = baseY + 1 + (spr.h - 1 - j);
      const rip = Math.round(Math.sin(t * 2.2 + ty * 0.9) * 0.7);
      const row = spr.rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === ' ') continue;
        let col, e = 0;
        if (spr.em && spr.em[ch]) { col = spr.em[ch]; e = 1; } else col = spr.pal[ch] || spr.pal.d;
        const fc = S.FLIPV[ch] || ch;
        writeRefl(sx0 + i + rip, ty, fc.charCodeAt(0), col[0], col[1], col[2], e);
      }
    }
  }

  const DENSE = S.DENSE;
  function shadeCell(pal, k, v, flash) {
    if (flash) return [1, 0.95, 0.9, 1];
    const p = pal[k];
    if (k === 3) return [p[0], p[1], p[2], 1];
    const m = 0.3 + 0.95 * v;
    return [p[0] * m, p[1] * m, p[2] * m, pal.em || 0];
  }
  function drawShade(spr, wx, wy, pal, opts) {
    const flip = opts.flip, flash = opts.flash, alpha = opts.alpha === undefined ? 1 : opts.alpha;
    const sx0 = Math.floor(wx) - R.camX - spr.ax, sy0 = Math.floor(wy) - R.camY - spr.ay;
    const c = spr.cells;
    for (let n = 0; n < c.length; n += 4) {
      const dx = flip ? 2 * spr.ax - c[n] : c[n];
      const k = c[n + 2], v = c[n + 3];
      const col = shadeCell(pal, k, v, flash);
      const code = k === 3 ? 111 : DENSE.charCodeAt(1 + Math.floor(v * 8.99));
      put(sx0 + dx, sy0 + c[n + 1], code, col[0], col[1], col[2], col[3], alpha);
    }
  }
  function reflectShade(spr, wx, wy, pal, opts, t) {
    const flip = opts.flip;
    const sx0 = Math.floor(wx) - R.camX - spr.ax, baseY = Math.floor(wy) - R.camY;
    const c = spr.cells;
    for (let n = 0; n < c.length; n += 4) {
      const dx = flip ? 2 * spr.ax - c[n] : c[n];
      const ty = baseY + 1 + (spr.h - 1 - c[n + 1]);
      const rip = Math.round(Math.sin(t * 2.2 + ty * 0.9) * 0.7);
      const k = c[n + 2], v = c[n + 3];
      const col = shadeCell(pal, k, v, false);
      const code = k === 3 ? 111 : DENSE.charCodeAt(1 + Math.floor(v * 8.99));
      writeRefl(sx0 + dx + rip, ty, code, col[0], col[1], col[2], col[3]);
    }
  }
  R.drawShade = drawShade;

  function objSprite(o) {
    switch (o.kind) {
      case 'pine': return S.pine[o.v < 0.3 ? 0 : o.v < 0.75 ? 1 : 2];
      case 'flower': return S.flower[Math.floor(o.v * 3)];
      case 'reeds': return S.reeds[Math.floor(o.v * 3)];
      case 'shrine': return DV.G.flags.shrines.has(o.id) ? S.shrineLit : S.shrineDark;
      default: return S[o.kind];
    }
  }

  // Smooth world-aligned field, sampled on a coarse grid and bilinearly expanded.
  let grid = new Float32Array(0);
  function coarseField(out, fn) {
    const SX = 4, SY = 2, cols = R.cols, rows = R.rows, x0 = R.camX, y0 = R.camY;
    const gx0 = Math.floor(x0 / SX), gy0 = Math.floor(y0 / SY);
    const gw = Math.ceil(cols / SX) + 2, gh = Math.ceil(rows / SY) + 2;
    if (grid.length < gw * gh) grid = new Float32Array(gw * gh);
    for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) grid[gj * gw + gi] = fn((gx0 + gi) * SX, (gy0 + gj) * SY);
    for (let y = 0; y < rows; y++) {
      const fy = (y0 + y) / SY - gy0, j0 = Math.floor(fy), ty = fy - j0;
      for (let x = 0; x < cols; x++) {
        const fx = (x0 + x) / SX - gx0, i0 = Math.floor(fx), tx = fx - i0;
        const k = j0 * gw + i0;
        const a = grid[k] + (grid[k + 1] - grid[k]) * tx;
        const b = grid[k + gw] + (grid[k + gw + 1] - grid[k + gw]) * tx;
        out[y * cols + x] = a + (b - a) * ty;
      }
    }
  }

  // --------------------------------------------------------------- Lighting
  function lighting(G) {
    const cols = R.cols, rows = R.rows, x0 = R.camX, y0 = R.camY, t = G.t;
    const amb = G.amb, cloud = G.cloud;
    if (cloud > 0.02) coarseField(FOG, (wx, wy) => 1 - cloud * clamp(noise(wx * 0.02 + t * 0.5, wy * 0.036, 77) * 1.6 - 0.6, 0, 0.45));
    for (let i = 0; i < N; i++) {
      const k = cloud > 0.02 ? FOG[i] : 1;
      LR[i] = amb[0] * k; LG[i] = amb[1] * k; LB[i] = amb[2] * k;
    }
    for (const L of G.lights) {
      const sx = L.x - x0, sy = L.y - y0, rad = L.rad, ir = 1 / rad, ry = rad / ASP;
      const xa = Math.max(0, Math.floor(sx - rad)), xb = Math.min(cols - 1, Math.ceil(sx + rad));
      const ya = Math.max(0, Math.floor(sy - ry)), yb = Math.min(rows - 1, Math.ceil(sy + ry));
      const r2 = rad * rad;
      for (let y = ya; y <= yb; y++) {
        const dy = (y + 0.5 - sy) * ASP;
        for (let x = xa; x <= xb; x++) {
          const dx = x + 0.5 - sx;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          let f = 1 - Math.sqrt(d2) * ir;
          f = f * f * L.i;
          const i = y * cols + x;
          LR[i] += L.r * f; LG[i] += L.g * f; LB[i] += L.b * f;
        }
      }
    }
  }

  // --------------------------------------------------------------- Composite
  function composite(G) {
    const cols = R.cols, x0 = R.camX, y0 = R.camY, t = G.t;
    const fogA = G.weather.fog, fc = G.fogColor;
    const data = colorImg.data;
    const thr = 0.02, gain = 255 * 1.55;
    if (fogA > 0.01) coarseField(FOG, (wx, wy) => fogA * clamp(noise(wx * 0.045 + t * 0.22, wy * 0.08 - t * 0.04, 9) * 1.7 - 0.4, 0, 1));
    for (let i = 0; i < N; i++) {
      let code = CHR[i];
      const e = EM[i];
      const lr = LR[i] * (1 - e) + e, lg = LG[i] * (1 - e) + e, lb = LB[i] * (1 - e) + e;
      let r = BR[i] * lr, g = BG[i] * lg, b = BB[i] * lb;
      if (fogA > 0.01) {
        const fo = FOG[i] * (1 - e * 0.7);
        if (fo > 0.01) {
          const fl = (LR[i] + LG[i] + LB[i]) * 0.33 + 0.05;
          r = r * (1 - fo) + fc[0] * fo * fl; g = g * (1 - fo) + fc[1] * fo * fl; b = b * (1 - fo) + fc[2] * fo * fl;
          if (code === -1 && fo > 0.4 && HV[i] < (fo - 0.3) * 0.6) code = HV[i] < 0.08 ? 126 : 45;
        }
      }
      const lum = r * 0.3 + g * 0.59 + b * 0.11;
      let gi = -1;
      if (lum > thr) {
        if (code === -1) {
          const st = TS[MAT[i]];
          const lv = st.lv;
          const L = Math.floor(clamp(lum * st.k, 0, 0.999) * lv.length);
          const alts = lv[L];
          code = alts.charCodeAt((Math.floor(HV[i] * 13) + PH[i]) % alts.length);
        }
        if (code > 0) gi = gIndex[code];
      }
      GI[i] = gi;
      const o = i * 4;
      data[o] = r * gain; data[o + 1] = g * gain; data[o + 2] = b * gain; data[o + 3] = 255;
    }
  }

  function blit(G) {
    const cols = R.cols, rows = R.rows;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
      const py = y * GH;
      for (let x = 0; x < cols; x++) {
        const g = GI[y * cols + x];
        if (g >= 0) ctx.drawImage(atlas, g * GW, 0, GW, GH, x * GW, py, GW, GH);
      }
    }
    colorCtx.putImageData(colorImg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(colorCv, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = 0.07;
    ctx.drawImage(colorCv, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#040406';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    if (G.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.35, G.flash * 0.3);
      ctx.fillStyle = '#c8d4ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
    bctx.clearRect(0, 0, bloom.width, bloom.height);
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height);
  }

  // --------------------------------------------------------------- Frame
  R.render = function (G, objs) {
    const t = G.t;
    terrainPass(t);

    // decals (blood etc)
    for (const [k, d] of G.decals) {
      const x = d.x - R.camX, y = d.y - R.camY;
      if (x < 0 || y < 0 || x >= R.cols || y >= R.rows) continue;
      const i = y * R.cols + x;
      const a = Math.min(1, d.life / 20) * 0.85;
      BR[i] += (d.r - BR[i]) * a; BG[i] += (d.g - BG[i]) * a; BB[i] += (d.b - BB[i]) * a;
      if (a > 0.3) CHR[i] = d.code;
    }

    // drawables
    const dr = G.drawables;
    dr.length = 0;
    for (const o of objs) dr.push({ y: o.y, x: o.x, o });
    for (const e of G.enemies) dr.push({ y: Math.floor(e.y), x: e.x, e });
    for (const n of G.npcs) dr.push({ y: Math.floor(n.y), x: n.x, e: n });
    for (const p of G.pickups) dr.push({ y: Math.floor(p.y), x: p.x, pk: p });
    const P = G.player;
    if (P && G.mode !== 'title' && !P.dead) dr.push({ y: Math.floor(P.y), x: P.x, e: P, isP: true });
    dr.sort((a, b) => a.y - b.y || a.x - b.x);

    R.xray = null;
    if (P && G.mode !== 'title' && !P.dead) {
      const px = Math.floor(P.x) - R.camX, py = Math.floor(P.y) - R.camY;
      R.xray = { x0: px - 6, x1: px + 6, y0: py - 9, y1: py, by: Math.floor(P.y) };
    }

    for (const d of dr) {
      if (d.o) {
        const spr = objSprite(d.o);
        if (spr) reflectArt(spr, d.o.x, d.o.y, t);
      } else if (d.e) {
        const v = d.e.view();
        if (v && !v.noRefl) reflectShade(v.spr, d.e.x, d.e.y + (v.lift || 0), v.pal, v, t);
      }
    }
    for (const d of dr) {
      if (d.o) {
        const spr = objSprite(d.o);
        if (!spr) continue;
        let flick = 1;
        if (spr.em) flick = 0.8 + 0.2 * Math.sin(t * 13 + d.o.x * 1.7) * Math.sin(t * 7.3 + d.o.y);
        drawArt(spr, d.o.x, d.o.y, t, { flick });
        if (d.o.kind === 'lore' && !G.flags.lore.has(d.o.id)) {
          const s = 0.6 + 0.4 * Math.sin(t * 3 + d.o.x);
          put(d.o.x - R.camX, d.o.y - R.camY - 1, 58, 0.4 * s, 0.7 * s, 1 * s, 1);
          put(d.o.x - R.camX - 1, d.o.y - R.camY - 1, 58, 0.4 * s, 0.7 * s, 1 * s, 1);
        }
      } else if (d.e) {
        const v = d.e.view();
        if (v) drawShade(v.spr, d.e.x, d.e.y + (v.lift || 0), v.pal, v);
      } else if (d.pk) {
        const p = d.pk, s = 0.7 + 0.3 * Math.sin(t * 5);
        R.putW(p.x, p.y, 42, 1 * s, 0.75 * s, 0.3 * s, 1);
        R.putW(p.x, p.y - 1, 39, 1 * s, 0.6 * s, 0.2 * s, 1, 0.6);
      }
    }

    G.drawEffects(R);
    lighting(G);
    composite(G);
    blit(G);
  };
})(window.DV);
