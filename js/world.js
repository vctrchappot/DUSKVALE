'use strict';
(function (DV) {
  const { clamp, lerp, smooth, hash, noise, fbm, ASP } = DV;

  const T = {
    DEEP: 0, WATER: 1, SHALLOW: 2, MARSH: 3, SAND: 4, GRASS: 5, MOOR: 6, FOREST: 7, ROCK: 8, MOUNT: 9,
    ROAD: 10, FLOOR: 11, WALL: 12, ASH: 13, DIRT: 14, RUBBLE: 15, GATE: 16, BRIDGE: 17, CARPET: 18,
  };
  const SOLID = new Uint8Array(24);
  [T.DEEP, T.WATER, T.MOUNT, T.WALL, T.GATE].forEach((t) => (SOLID[t] = 1));
  const WATERY = new Uint8Array(24);
  [T.DEEP, T.WATER, T.SHALLOW].forEach((t) => (WATERY[t] = 1));

  const CS = 32;
  const SEED = 7331;
  const BIOMES = { none: 0, clear: 1, moor: 2, swamp: 3, ash: 4, plaza: 5 };

  // ---------------------------------------------------------------- Blueprints
  // # wall . floor , rubble ~ shallow w water = road _ carpet G gate
  // + cross t tomb P pillar F brazier f campfire S shrine L lore A altar T dead tree
  // E enemy spawn B boss N npc      (space = keep terrain)
  const BP = {
    start: {
      floor: T.FLOOR, rows: [
        '   P . P   ',
        '  .......  ',
        '  ...S...N ',
        '  .......  ',
        '   P . P L ',
      ],
    },
    barrow: {
      floor: T.DIRT, enemy: 'skeleton', boss: 'wight', rows: [
        '  ####,#####,,,,,,######,####  ',
        '  #  t   +   ....   +   t   #  ',
        '  # +  t   t ....  t   t  + #  ',
        '  #   E      ....      E    #  ',
        '  , t   +  P ....  P  +   t ,  ',
        '  #   t      ....      t    #  ',
        '  # +    t   ....   t     + #  ',
        '  #   ###########,#######   #  ',
        '  , t #...F.........F...# t ,  ',
        '  #   #.......B.........#   #  ',
        '  # + #...F...A.....F...# + #  ',
        '  #   #####.........#####   #  ',
        '  #  t  E    ....    E   t  #  ',
        '  , +  t  +  ....  +  t  +  ,  ',
        '  #   t      ....      t    #  ',
        '  ##,#####,  ....  ,#####,###  ',
        '      L      ....      T       ',
        '          S  ....              ',
        '             ....              ',
      ],
    },
    chapel: {
      floor: T.FLOOR, enemy: 'wraith', boss: 'matron', rows: [
        '       ~~~~   ~~~~~~      ~~~      ',
        '   ~~~  ##,####,,####,##    ~~~    ',
        '  ~~    #..P...._....P..#     ~~   ',
        '        #......._.......#          ',
        '  ~~    ,..F..._B_...F..,   ~~     ',
        '        #......._.......#          ',
        '   ~~   #..P...._....P..#    ~~    ',
        '        #...E..._....E..#          ',
        '   ~~   ##,###.._..###,##   ~~~    ',
        '  ~~~      ~  .._..   ~     ~~     ',
        '     ~~  E    =====     ~~    ~    ',
        '       L   ~  =====  ~   T         ',
        '    ~~        ==S==       ~~~      ',
        '              =====                ',
      ],
    },
    keep: {
      floor: T.FLOOR, enemy: 'skeleton', boss: 'corvus', rows: [
        ' ####,#####,######,#####,#### ',
        ' #P....#..........#.....P...# ',
        ' #..E..#...F...F..#..E......# ',
        ' #.....,....B.....,.........# ',
        ' #..F..#...F...F..#.....F...# ',
        ' ##,####....A.....####,###### ',
        ' #......................E...# ',
        ' #..E.....P.....P...........# ',
        ' ,..........................# ',
        ' #......P.....P.....P....E..# ',
        ' ######,####.....####,####### ',
        '           .......            ',
        '      T   E.......  T         ',
        '   L      ...S...       T     ',
        '            ...               ',
      ],
    },
    cathedral: {
      floor: T.FLOOR, enemy: 'wraith', boss: 'bishop', rows: [
        '            ###########            ',
        '         ####P.......P####         ',
        '       ###.......B.......###       ',
        '      ##F.....P..A..P.....F##      ',
        '     ##.........._..........##     ',
        '     #..P........_........P..#     ',
        '     #..........._...........#     ',
        '     #..F..P....._.....P..F..#     ',
        '     #..........._...........#     ',
        '     #..P........_........P..#     ',
        '     #..........._...........#     ',
        '     ##########GGGGG##########     ',
        '   T       P   .....   P      T    ',
        '     E         .....         E     ',
        '      F    P   .....   P    F      ',
        '               ..S..               ',
        '           L   .....               ',
      ],
    },
    ruin: {
      floor: T.FLOOR, erode: 0.32, enemy: 'ghoul', rows: [
        '#####.####',
        '#........#',
        '#..P..E..#',
        '.........#',
        '#..E..L..#',
        '#........#',
        '###.######',
      ],
    },
    tower: {
      floor: T.FLOOR, erode: 0.2, enemy: 'skeleton', rows: [
        '  #####  ',
        ' ##...## ',
        '##..E..##',
        '#...F...#',
        '##.....##',
        ' ##.L.## ',
        '  ##.##  ',
      ],
    },
    graves: {
      floor: null, erode: 0.18, enemy: 'skeleton', rows: [
        '#,#####,##',
        '# t + t  #',
        '#  E   + #',
        '# + t L  ,',
        '#   E  t #',
        '##,##  ###',
      ],
    },
    stones: {
      floor: null, enemy: 'wraith', rows: [
        '   P P   ',
        ' P     P ',
        'P   E   P',
        ' P  L  P ',
        '   P P   ',
      ],
    },
    camp: {
      floor: null, enemy: 'ghoul', rows: [
        ' t   ',
        'E f E',
        '  E  ',
      ],
    },
    wayshrine: {
      floor: T.FLOOR, rows: [
        ' P.P ',
        ' .S. ',
        ' P.P ',
      ],
    },
  };

  const LANDMARKS = [
    { id: 'start', name: 'Glutsenke', sub: 'Wo die letzte Glut wacht', x: 0, y: 0, r: 34, biome: 'clear', bp: 'start' },
    { id: 'barrow', name: 'Hügelgrab des Heiligen Vael', sub: 'Siegel des Knochens', x: -175, y: -28, r: 62, biome: 'moor', bp: 'barrow' },
    { id: 'chapel', name: 'Die Ertrunkene Kapelle', sub: 'Siegel der Flut', x: 190, y: 36, r: 72, biome: 'swamp', bp: 'chapel' },
    { id: 'keep', name: 'Aschenfeste', sub: 'Siegel der Asche', x: 26, y: 118, r: 66, biome: 'ash', bp: 'keep' },
    { id: 'cathedral', name: 'Die Schwarze Kathedrale', sub: 'Sitz des Bleichen Bischofs', x: -8, y: -112, r: 62, biome: 'plaza', bp: 'cathedral' },
  ];

  const OBJ = { '+': 'cross', t: 'tomb', P: 'pillar', F: 'brazier', f: 'campfire', S: 'shrine', L: 'lore', A: 'altar', T: 'deadtree' };
  const SOLID_OBJ = { pine: 1, deadtree: 1, burnt: 1, rock: 1, menhir: 1, cross: 1, tomb: 1, pillar: 1, brazier: 1, campfire: 1, shrine: 1, lore: 1, altar: 1 };

  function makeStruct(bpName, x, y, id, name) {
    const bp = BP[bpName];
    const rows = bp.rows;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const s = { bp, bpName, x, y, w, h, id, name, feats: [] };
    let gate = false;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const c = rows[j][i];
        const wx = x + i, wy = y + j;
        if (c === 'S') s.feats.push({ kind: 'shrine', x: wx, y: wy, id: `shrine@${wx},${wy}`, name: name || null });
        else if (c === 'L') s.feats.push({ kind: 'lore', x: wx, y: wy, id: `lore@${wx},${wy}`, struct: id });
        else if (c === 'E') s.feats.push({ kind: 'spawn', x: wx, y: wy, id: `spawn@${wx},${wy}`, enemy: bp.enemy });
        else if (c === 'B') s.feats.push({ kind: 'boss', x: wx, y: wy, id: `boss@${bp.boss}`, boss: bp.boss });
        else if (c === 'N') s.feats.push({ kind: 'npc', x: wx, y: wy, id: `npc@${wx},${wy}`, npc: id === 'start' ? 'maren' : 'pilgrim' });
        else if (c === 'G' && !gate) { gate = true; s.feats.push({ kind: 'gate', x: wx + 2, y: wy, id: 'gate' }); }
      }
    }
    return s;
  }

  const LSTRUCTS = LANDMARKS.map((L) => {
    const bp = BP[L.bp];
    const w = Math.max(...bp.rows.map((r) => r.length)), h = bp.rows.length;
    const s = makeStruct(L.bp, L.x - (w >> 1), L.y - (h >> 1), L.id, L.name);
    L.struct = s;
    L.entry = { x: L.x, y: s.y + s.h + 1 };
    return s;
  });

  // ---------------------------------------------------------------- Fields
  const F = { h: 0, m: 0, f: 0, bi: 0, bt: 0 };
  function fields(wx, wy) {
    const ny = wy * ASP;
    let h = (fbm(wx * 0.007, ny * 0.007, SEED, 5) - 0.5) * 1.9 + 0.52;
    let m = (fbm(wx * 0.01 + 91, ny * 0.01 - 37, SEED + 11, 4) - 0.5) * 2.4 + 0.5;
    let f = (fbm(wx * 0.025, ny * 0.025, SEED + 23, 3) - 0.5) * 2.0 + 0.5;
    let bi = 0, bt = 0;
    for (let k = 0; k < LANDMARKS.length; k++) {
      const L = LANDMARKS[k];
      const dx = wx - L.x, dy = (wy - L.y) * ASP;
      const d2 = dx * dx + dy * dy;
      if (d2 >= L.r * L.r) continue;
      const t = smooth((1 - Math.sqrt(d2) / L.r) * 1.7);
      switch (L.biome) {
        case 'clear': h = lerp(h, 0.55, t); m = lerp(m, 0.55, t); f = lerp(f, 0.25, t); break;
        case 'moor': h = lerp(h, 0.56, t); m = lerp(m, 0.22, t); f = lerp(f, 0.1, t); break;
        case 'swamp': h = lerp(h, 0.41, t); m = lerp(m, 0.92, t); f = lerp(f, 0.45, t); break;
        case 'ash': h = lerp(h, 0.57, t); m = lerp(m, 0.4, t); f = lerp(f, 0.3, t); break;
        case 'plaza': h = lerp(h, 0.6, t); m = lerp(m, 0.3, t); f = lerp(f, 0.1, t); break;
      }
      if (t > bt) { bt = t; bi = BIOMES[L.biome]; }
    }
    F.h = h; F.m = m; F.f = f; F.bi = bi; F.bt = bt;
    return F;
  }

  function classify(h, m, f, bi, bt, wx, wy) {
    if (bi === BIOMES.ash && bt > 0.3) {
      if (h > 0.76) return T.ROCK;
      return noise(wx * 0.15, wy * 0.27, SEED + 61) > 0.58 ? T.DIRT : T.ASH;
    }
    if (bi === BIOMES.plaza && bt > 0.8) return hash(wx, wy, SEED + 62) < 0.12 ? T.RUBBLE : T.FLOOR;
    if (h < 0.26) return T.DEEP;
    if (h < 0.32) return T.WATER;
    if (h < 0.36) return m > 0.6 ? T.MARSH : T.SHALLOW;
    if (h < 0.375 && m < 0.5) return T.SAND;
    if (m > 0.68 && h < 0.48) return noise(wx * 0.12, wy * ASP * 0.12, SEED + 5) > 0.62 ? T.SHALLOW : T.MARSH;
    if (h > 0.86) return T.MOUNT;
    if (h > 0.76) return T.ROCK;
    if (m < 0.36) return T.MOOR;
    if (f > 0.56 && m > 0.42) return T.FOREST;
    return T.GRASS;
  }

  // ---------------------------------------------------------------- Roads
  const SEGS = [];
  LANDMARKS.forEach((L, li) => {
    if (L.id === 'start') return;
    const pts = [[0, 3]];
    const n = 4;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      pts.push([L.entry.x * t + (hash(k, li, SEED + 7) - 0.5) * 46, L.entry.y * t + (hash(k, li, SEED + 8) - 0.5) * 22]);
    }
    pts.push([L.entry.x, L.entry.y]);
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      SEGS.push({ ax, ay, bx, by, minx: Math.min(ax, bx) - 4, maxx: Math.max(ax, bx) + 4, miny: Math.min(ay, by) - 4, maxy: Math.max(ay, by) + 4 });
    }
  });

  function roadDist(wx, wy, segs) {
    let best = 1e9;
    const ox = wx + (noise(wx * 0.05, wy * 0.09, SEED + 31) - 0.5) * 6;
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      if (ox < s.minx || ox > s.maxx || wy < s.miny || wy > s.maxy) continue;
      const px = ox - s.ax, py = (wy - s.ay) * ASP;
      const dx = s.bx - s.ax, dy = (s.by - s.ay) * ASP;
      const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const ex = px - dx * t, ey = py - dy * t;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) best = d;
    }
    return best;
  }

  // ---------------------------------------------------------------- Region scatter
  const RW = 110, RH = 62;
  const REGION_KINDS = ['ruin', 'ruin', 'tower', 'graves', 'graves', 'stones', 'camp', 'camp', 'wayshrine', 'wayshrine'];
  const regionCache = new Map();
  function regionStructs(rx, ry) {
    const key = rx + ',' + ry;
    let out = regionCache.get(key);
    if (out) return out;
    out = [];
    regionCache.set(key, out);
    if (hash(rx, ry, SEED + 501) > 0.62) return out;
    const cx = rx * RW + 15 + Math.floor(hash(rx, ry, SEED + 502) * (RW - 40));
    const cy = ry * RH + 8 + Math.floor(hash(rx, ry, SEED + 503) * (RH - 24));
    for (const L of LANDMARKS) {
      if (DV.dist(cx - L.x, cy - L.y) < L.r + 28) return out;
    }
    if (roadDist(cx, cy, SEGS) < 14) return out;
    const fd = fields(cx, cy);
    if (fd.h < 0.38 || fd.h > 0.74) return out;
    const kind = REGION_KINDS[Math.floor(hash(rx, ry, SEED + 504) * REGION_KINDS.length)];
    const bp = BP[kind];
    const w = Math.max(...bp.rows.map((r) => r.length)), h = bp.rows.length;
    out.push(makeStruct(kind, cx - (w >> 1), cy - (h >> 1), `r${rx},${ry}`, kind === 'wayshrine' ? 'Wegschrein' : null));
    return out;
  }

  function structsOverlapping(x0, y0, x1, y1) {
    const res = [];
    for (const s of LSTRUCTS) if (s.x < x1 && s.x + s.w > x0 && s.y < y1 && s.y + s.h > y0) res.push(s);
    const rx0 = Math.floor((x0 - 60) / RW), rx1 = Math.floor((x1 + 60) / RW);
    const ry0 = Math.floor((y0 - 40) / RH), ry1 = Math.floor((y1 + 40) / RH);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      for (const s of regionStructs(rx, ry)) if (s.x < x1 && s.x + s.w > x0 && s.y < y1 && s.y + s.h > y0) res.push(s);
    }
    return res;
  }

  // ---------------------------------------------------------------- Chunks
  const chunks = new Map();
  const visited = new Set();

  function genChunk(cx, cy) {
    const x0 = cx * CS, y0 = cy * CS, S2 = CS + 2;
    const H = new Float32Array(S2 * S2), M = new Float32Array(S2 * S2), Fo = new Float32Array(S2 * S2);
    const BI = new Uint8Array(S2 * S2), BT = new Float32Array(S2 * S2);
    for (let j = 0; j < S2; j++) for (let i = 0; i < S2; i++) {
      const fd = fields(x0 + i - 1, y0 + j - 1);
      const k = j * S2 + i;
      H[k] = fd.h; M[k] = fd.m; Fo[k] = fd.f; BI[k] = fd.bi; BT[k] = fd.bt;
    }
    const type = new Uint8Array(CS * CS), shade = new Float32Array(CS * CS), solid = new Uint8Array(CS * CS);
    const objs = [], feats = [];
    const oc = new Int16Array(CS * CS).fill(-1);
    const os = new Array(CS * CS);
    const structs = structsOverlapping(x0, y0, x0 + CS, y0 + CS);
    for (const s of structs) {
      const rows = s.bp.rows;
      for (let j = 0; j < s.h; j++) {
        const wy = s.y + j;
        if (wy < y0 || wy >= y0 + CS) continue;
        const row = rows[j];
        for (let i = 0; i < row.length; i++) {
          const wx = s.x + i;
          if (wx < x0 || wx >= x0 + CS) continue;
          const c = row[i];
          if (c === ' ') continue;
          const idx = (wy - y0) * CS + (wx - x0);
          oc[idx] = c.charCodeAt(0);
          os[idx] = s;
        }
      }
      for (const f of s.feats) if (f.x >= x0 && f.x < x0 + CS && f.y >= y0 && f.y < y0 + CS) feats.push(f);
    }
    const segs = SEGS.filter((s) => s.maxx > x0 - 8 && s.minx < x0 + CS + 8 && s.maxy > y0 - 8 && s.miny < y0 + CS + 8);

    for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
      const wx = x0 + i, wy = y0 + j, idx = j * CS + i, k = (j + 1) * S2 + (i + 1);
      let t = classify(H[k], M[k], Fo[k], BI[k], BT[k], wx, wy);
      let onRoad = false;
      if (segs.length) {
        const rd = roadDist(wx, wy, segs);
        if (rd < 1.4 + noise(wx * 0.2, wy * 0.3, SEED + 3) * 0.9) { t = WATERY[t] ? T.BRIDGE : T.ROAD; onRoad = true; }
        else if (rd < 2.7 && !WATERY[t] && hash(wx, wy, SEED + 4) < 0.55) { t = T.DIRT; onRoad = true; }
        else if (rd < 4) onRoad = true;
      }
      const dhx = H[k + 1] - H[k - 1], dhy = H[k + S2] - H[k - S2];
      shade[idx] = clamp(1 + (dhx + dhy * 0.8) * 9, 0.55, 1.55) * (0.92 + hash(wx, wy, SEED + 1) * 0.16);

      if (oc[idx] !== -1) {
        const c = String.fromCharCode(oc[idx]);
        const s = os[idx];
        const fl = s.bp.floor;
        let ob = null;
        switch (c) {
          case '#': t = s.bp.erode && hash(wx, wy, SEED + 77) < s.bp.erode ? T.RUBBLE : T.WALL; break;
          case '.': t = fl != null ? fl : (WATERY[t] ? T.DIRT : t); break;
          case ',': t = T.RUBBLE; break;
          case '~': t = T.SHALLOW; break;
          case 'w': t = T.WATER; break;
          case '=': t = T.ROAD; break;
          case '_': t = T.CARPET; break;
          case 'G': t = T.GATE; break;
          default:
            t = fl != null ? fl : (WATERY[t] || t === T.MOUNT ? T.DIRT : t);
            ob = OBJ[c] || null;
        }
        if (ob) {
          const o = { kind: ob, x: wx, y: wy, v: hash(wx, wy, SEED + 98) };
          if (ob === 'shrine') o.id = `shrine@${wx},${wy}`;
          if (ob === 'lore') o.id = `lore@${wx},${wy}`;
          objs.push(o);
          solid[idx] = 1;
        }
      } else if (!onRoad) {
        const r = hash(wx, wy, SEED + 99), v = hash(wx, wy, SEED + 98);
        let ob = null;
        switch (t) {
          case T.FOREST: if (r < 0.075) ob = 'pine'; else if (r < 0.083) ob = 'fungus'; break;
          case T.GRASS:
            if (r < 0.005) ob = 'pine'; else if (r < 0.008) ob = 'deadtree'; else if (r < 0.011) ob = 'rock';
            else if (r < 0.05 && noise(wx * 0.06, wy * 0.1, SEED + 40) > 0.6) ob = 'flower';
            break;
          case T.MOOR:
            if (r < 0.007) ob = 'deadtree'; else if (r < 0.012) ob = 'rock'; else if (r < 0.0132) ob = 'menhir';
            else if (r < 0.045 && noise(wx * 0.05, wy * 0.09, SEED + 41) > 0.62) ob = 'flower';
            break;
          case T.MARSH: if (r < 0.012) ob = 'deadtree'; else if (r < 0.05) ob = 'reeds'; else if (r < 0.056) ob = 'fungus'; break;
          case T.ROCK: if (r < 0.02) ob = 'rock'; else if (r < 0.024) ob = 'deadtree'; break;
          case T.ASH: if (r < 0.014) ob = 'burnt'; else if (r < 0.028) ob = 'vent'; break;
          case T.SHALLOW: if (r < 0.03) ob = 'reeds'; break;
          case T.SAND: if (r < 0.008) ob = 'rock'; break;
        }
        if (ob) {
          objs.push({ kind: ob, x: wx, y: wy, v });
          if (SOLID_OBJ[ob]) solid[idx] = 1;
        }
      }
      type[idx] = t;
    }
    return { cx, cy, type, shade, solid, objs, feats };
  }

  function chunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = chunks.get(k);
    if (!c) { c = genChunk(cx, cy); chunks.set(k, c); }
    return c;
  }

  let lcx = 1e9, lcy = 1e9, lch = null;
  function chunkAtCell(x, y) {
    const cx = x >> 5, cy = y >> 5;
    if (cx !== lcx || cy !== lcy) { lch = chunk(cx, cy); lcx = cx; lcy = cy; }
    return lch;
  }
  function typeAt(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return chunkAtCell(x, y).type[((y & 31) << 5) | (x & 31)];
  }
  function isSolid(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    const c = chunkAtCell(x, y);
    const i = ((y & 31) << 5) | (x & 31);
    const t = c.type[i];
    if (t === T.GATE) return !(DV.G && DV.G.flags.gateOpen);
    return SOLID[t] === 1 || c.solid[i] === 1;
  }
  function objectsIn(x0, y0, x1, y1, out) {
    out = out || [];
    for (let cy = y0 >> 5; cy <= y1 >> 5; cy++) for (let cx = x0 >> 5; cx <= x1 >> 5; cx++) {
      const objs = chunk(cx, cy).objs;
      for (let k = 0; k < objs.length; k++) {
        const o = objs[k];
        if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) out.push(o);
      }
    }
    return out;
  }
  function featuresNear(x, y, r) {
    const out = [];
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r / ASP), y1 = Math.floor(y + r / ASP);
    for (let cy = y0 >> 5; cy <= y1 >> 5; cy++) for (let cx = x0 >> 5; cx <= x1 >> 5; cx++) {
      for (const f of chunk(cx, cy).feats) if (DV.dist(f.x + 0.5 - x, f.y + 0.5 - y) <= r) out.push(f);
    }
    return out;
  }
  function landmarkAt(x, y) {
    for (const L of LANDMARKS) if (DV.dist(x - L.x, y - L.y) < L.r * 0.55) return L;
    return null;
  }
  function markVisited(x0, y0, x1, y1) {
    for (let cy = y0 >> 5; cy <= y1 >> 5; cy++) for (let cx = x0 >> 5; cx <= x1 >> 5; cx++) visited.add(cx + ',' + cy);
  }
  function biomeAt(x, y) { return fields(x, y).bi; }

  DV.World = {
    T, SOLID, WATERY, CS, LANDMARKS, BIOMES, chunk, chunkAtCell, typeAt, isSolid, objectsIn,
    featuresNear, landmarkAt, markVisited, visited, biomeAt, chunks,
  };
})(window.DV);
