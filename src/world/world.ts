import { ASP, clamp, dist, fbm, hash, lerp, noise, smooth } from '../engine/util.ts';
import { BP, LANDMARKS } from './blueprints.ts';
import {
  BIOMES,
  CS,
  SEED,
  SOLID,
  T,
  WATERY,
  type BiomeId,
  type Chunk,
  type Landmark,
  type Structure,
  type TerrainId,
  type WorldFeature,
  type WorldObject,
} from './types.ts';

const OBJ_MAP: Record<string, string> = {
  '+': 'cross',
  t: 'tomb',
  P: 'pillar',
  F: 'brazier',
  f: 'campfire',
  S: 'shrine',
  L: 'lore',
  A: 'altar',
  T: 'deadtree',
  c: 'chest',
  D: 'cave',
};

const SOLID_OBJ: Record<string, number> = {
  pine: 1,
  deadtree: 1,
  burnt: 1,
  rock: 1,
  menhir: 1,
  cross: 1,
  tomb: 1,
  pillar: 1,
  brazier: 1,
  campfire: 1,
  shrine: 1,
  lore: 1,
  altar: 1,
  signpost: 1,
};

interface RoadSeg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
}

export interface SignpostDef {
  x: number;
  y: number;
  text: string;
}

export class World {
  readonly landmarks: Landmark[] = LANDMARKS;
  readonly chunks = new Map<string, Chunk>();
  readonly visited = new Set<string>();
  readonly signposts: SignpostDef[] = [];

  private readonly lstructs: Structure[] = [];
  private readonly segs: RoadSeg[] = [];
  private readonly regionCache = new Map<string, Structure[]>();
  private lcx = 1e9;
  private lcy = 1e9;
  private lch: Chunk | null = null;
  private gateOpen = false;

  constructor() {
    for (const L of this.landmarks) {
      const bp = BP[L.bp];
      const w = Math.max(...bp.rows.map((r) => r.length));
      const h = bp.rows.length;
      const s = this.makeStruct(L.bp, L.x - (w >> 1), L.y - (h >> 1), L.id, L.name);
      L.struct = s;
      L.entry = { x: L.x, y: s.y + s.h + 1 };
      this.lstructs.push(s);
    }

    // Build roads from Glutsenke to every other landmark + signposts at forks
    this.landmarks.forEach((L, li) => {
      if (L.id === 'start') return;
      const pts: [number, number][] = [[0, 4]];
      const n = 4;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        pts.push([
          L.entry!.x * t + (hash(k, li, SEED + 7) - 0.5) * 40,
          L.entry!.y * t + (hash(k, li, SEED + 8) - 0.5) * 20,
        ]);
      }
      pts.push([L.entry!.x, L.entry!.y]);
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, ay] = pts[k];
        const [bx, by] = pts[k + 1];
        this.segs.push({
          ax,
          ay,
          bx,
          by,
          minx: Math.min(ax, bx) - 4,
          maxx: Math.max(ax, bx) + 4,
          miny: Math.min(ay, by) - 4,
          maxy: Math.max(ay, by) + 4,
        });
      }
    });

    // World signposts at road forks near Glutsenke & halfway points
    this.signposts.push(
      { x: -9, y: 5, text: '← Hügelgrab des Hl. Vael (Westen)' },
      { x: 9, y: 5, text: '→ Ertrunkene Kapelle (Osten) · Burg am See (NO)' },
      { x: 2, y: 11, text: '↓ Aschenfeste (Süden)' },
      { x: -3, y: -7, text: '↑ Die Schwarze Kathedrale (Norden)' },
      { x: -85, y: -14, text: '← Hügelgrab des Hl. Vael' },
      { x: 95, y: 18, text: '→ Die Ertrunkene Kapelle' },
      { x: 14, y: 60, text: '↓ Aschenfeste' },
    );
  }

  setGateOpen(open: boolean): void {
    this.gateOpen = open;
  }

  private makeStruct(bpName: string, x: number, y: number, id: string, name: string | null): Structure {
    const bp = BP[bpName];
    const rows = bp.rows;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const s: Structure = { bp, bpName, x, y, w, h, id, name, feats: [] };
    let gate = false;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const c = rows[j][i];
        const wx = x + i;
        const wy = y + j;
        if (c === 'S') s.feats.push({ kind: 'shrine', x: wx, y: wy, id: `shrine@${wx},${wy}`, name });
        else if (c === 'L') s.feats.push({ kind: 'lore', x: wx, y: wy, id: `lore@${wx},${wy}`, struct: id });
        else if (c === 'E') s.feats.push({ kind: 'spawn', x: wx, y: wy, id: `spawn@${wx},${wy}`, enemy: bp.enemy });
        else if (c === 'B') s.feats.push({ kind: 'boss', x: wx, y: wy, id: `boss@${bp.boss}`, boss: bp.boss });
        else if (c === 'N') s.feats.push({ kind: 'npc', x: wx, y: wy, id: `npc@${wx},${wy}`, npc: id === 'start' ? 'maren' : 'pilgrim' });
        else if (c === 'K') s.feats.push({ kind: 'npc', x: wx, y: wy, id: `npc@smith`, npc: 'smith' });
        else if (c === 'M') s.feats.push({ kind: 'npc', x: wx, y: wy, id: `npc@merchant`, npc: 'merchant' });
        else if (c === 'c') s.feats.push({ kind: 'chest', x: wx, y: wy, id: `chest@${wx},${wy}`, struct: id });
        else if (c === 'D') s.feats.push({ kind: 'cave', x: wx, y: wy, id: `cave@${wx},${wy}`, struct: id });
        else if (c === 'G' && !gate) {
          gate = true;
          s.feats.push({ kind: 'gate', x: wx + 2, y: wy, id: 'gate' });
        }
      }
    }
    return s;
  }

  fields(wx: number, wy: number): { h: number; m: number; f: number; bi: BiomeId; bt: number } {
    const ny = wy * ASP;
    let h = (fbm(wx * 0.007, ny * 0.007, SEED, 5) - 0.5) * 1.9 + 0.52;
    let m = (fbm(wx * 0.01 + 91, ny * 0.01 - 37, SEED + 11, 4) - 0.5) * 2.4 + 0.5;
    let f = (fbm(wx * 0.025, ny * 0.025, SEED + 23, 3) - 0.5) * 2.0 + 0.5;
    let bi: BiomeId = BIOMES.none;
    let bt = 0;

    for (let k = 0; k < this.landmarks.length; k++) {
      const L = this.landmarks[k];
      const dx = wx - L.x;
      const dy = (wy - L.y) * ASP;
      const d2 = dx * dx + dy * dy;
      if (d2 >= L.r * L.r) continue;
      const t = smooth((1 - Math.sqrt(d2) / L.r) * 1.7);
      switch (L.biome) {
        case 'clear':
          h = lerp(h, 0.55, t);
          m = lerp(m, 0.55, t);
          f = lerp(f, 0.22, t);
          break;
        case 'lake':
          h = lerp(h, wy > L.y + 1 ? 0.28 : 0.55, t);
          m = lerp(m, 0.72, t);
          f = lerp(f, 0.2, t);
          break;
        case 'moor':
          h = lerp(h, 0.56, t);
          m = lerp(m, 0.22, t);
          f = lerp(f, 0.1, t);
          break;
        case 'swamp':
          h = lerp(h, 0.41, t);
          m = lerp(m, 0.92, t);
          f = lerp(f, 0.45, t);
          break;
        case 'ash':
          h = lerp(h, 0.57, t);
          m = lerp(m, 0.4, t);
          f = lerp(f, 0.3, t);
          break;
        case 'plaza':
          h = lerp(h, 0.62, t);
          m = lerp(m, 0.3, t);
          f = lerp(f, 0.1, t);
          break;
      }
      if (t > bt) {
        bt = t;
        bi = BIOMES[L.biome];
      }
    }
    return { h, m, f, bi, bt };
  }

  private classify(h: number, m: number, f: number, bi: BiomeId, bt: number, wx: number, wy: number): TerrainId {
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

  /** Terraced 2.5D elevation level (0..4) from continuous height. */
  private elevationFromHeight(h: number): number {
    if (h < 0.36) return 0;
    if (h < 0.58) return 1;
    if (h < 0.72) return 2;
    if (h < 0.84) return 3;
    return 4;
  }

  private roadDist(wx: number, wy: number, segs: RoadSeg[]): number {
    let best = 1e9;
    const ox = wx + (noise(wx * 0.05, wy * 0.09, SEED + 31) - 0.5) * 6;
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      if (ox < s.minx || ox > s.maxx || wy < s.miny || wy > s.maxy) continue;
      const px = ox - s.ax;
      const py = (wy - s.ay) * ASP;
      const dx = s.bx - s.ax;
      const dy = (s.by - s.ay) * ASP;
      const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const ex = px - dx * t;
      const ey = py - dy * t;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) best = d;
    }
    return best;
  }

  private regionStructs(rx: number, ry: number): Structure[] {
    const key = `${rx},${ry}`;
    let out = this.regionCache.get(key);
    if (out) return out;
    out = [];
    this.regionCache.set(key, out);
    if (hash(rx, ry, SEED + 501) > 0.64) return out;
    const RW = 110;
    const RH = 62;
    const cx = rx * RW + 15 + Math.floor(hash(rx, ry, SEED + 502) * (RW - 40));
    const cy = ry * RH + 8 + Math.floor(hash(rx, ry, SEED + 503) * (RH - 24));
    for (const L of this.landmarks) {
      if (dist(cx - L.x, cy - L.y) < L.r + 28) return out;
    }
    if (this.roadDist(cx, cy, this.segs) < 14) return out;
    const fd = this.fields(cx, cy);
    if (fd.h < 0.38 || fd.h > 0.74) return out;
    const kinds = ['ruin', 'tower', 'tower', 'cave', 'graves', 'stones', 'camp', 'wayshrine', 'wayshrine'];
    const kind = kinds[Math.floor(hash(rx, ry, SEED + 504) * kinds.length)];
    const bp = BP[kind];
    const w = Math.max(...bp.rows.map((r) => r.length));
    const h = bp.rows.length;
    const label = kind === 'wayshrine' ? 'Wegschrein' : kind === 'tower' ? 'Wachturm' : kind === 'cave' ? 'Schattenhöhle' : null;
    out.push(this.makeStruct(kind, cx - (w >> 1), cy - (h >> 1), `r${rx},${ry}`, label));
    return out;
  }

  private structsOverlapping(x0: number, y0: number, x1: number, y1: number): Structure[] {
    const res: Structure[] = [];
    for (const s of this.lstructs) {
      if (s.x < x1 && s.x + s.w > x0 && s.y < y1 && s.y + s.h > y0) res.push(s);
    }
    const RW = 110;
    const RH = 62;
    const rx0 = Math.floor((x0 - 60) / RW);
    const rx1 = Math.floor((x1 + 60) / RW);
    const ry0 = Math.floor((y0 - 40) / RH);
    const ry1 = Math.floor((y1 + 40) / RH);
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        for (const s of this.regionStructs(rx, ry)) {
          if (s.x < x1 && s.x + s.w > x0 && s.y < y1 && s.y + s.h > y0) res.push(s);
        }
      }
    }
    return res;
  }

  private genChunk(cx: number, cy: number): Chunk {
    const x0 = cx * CS;
    const y0 = cy * CS;
    const S2 = CS + 2;
    const H = new Float32Array(S2 * S2);
    const M = new Float32Array(S2 * S2);
    const Fo = new Float32Array(S2 * S2);
    const BI = new Uint8Array(S2 * S2);
    const BT = new Float32Array(S2 * S2);

    for (let j = 0; j < S2; j++) {
      for (let i = 0; i < S2; i++) {
        const fd = this.fields(x0 + i - 1, y0 + j - 1);
        const k = j * S2 + i;
        H[k] = fd.h;
        M[k] = fd.m;
        Fo[k] = fd.f;
        BI[k] = fd.bi;
        BT[k] = fd.bt;
      }
    }

    const type = new Uint8Array(CS * CS);
    const shade = new Float32Array(CS * CS);
    const elev = new Uint8Array(CS * CS);
    const solid = new Uint8Array(CS * CS);
    const objs: WorldObject[] = [];
    const feats: WorldFeature[] = [];
    const oc = new Int16Array(CS * CS).fill(-1);
    const os: (Structure | undefined)[] = new Array(CS * CS);

    const structs = this.structsOverlapping(x0, y0, x0 + CS, y0 + CS);
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
      for (const f of s.feats) {
        if (f.x >= x0 && f.x < x0 + CS && f.y >= y0 && f.y < y0 + CS) feats.push(f);
      }
    }

    // Place signposts inside this chunk
    for (const sp of this.signposts) {
      if (sp.x >= x0 && sp.x < x0 + CS && sp.y >= y0 && sp.y < y0 + CS) {
        const idx = (sp.y - y0) * CS + (sp.x - x0);
        objs.push({ kind: 'signpost', x: sp.x, y: sp.y, v: 0, text: sp.text });
        feats.push({ kind: 'signpost', x: sp.x, y: sp.y, id: `sign@${sp.x},${sp.y}`, text: sp.text });
        solid[idx] = 1;
      }
    }

    const segs = this.segs.filter((s) => s.maxx > x0 - 8 && s.minx < x0 + CS + 8 && s.maxy > y0 - 8 && s.miny < y0 + CS + 8);

    for (let j = 0; j < CS; j++) {
      for (let i = 0; i < CS; i++) {
        const wx = x0 + i;
        const wy = y0 + j;
        const idx = j * CS + i;
        const k = (j + 1) * S2 + (i + 1);
        let t: TerrainId = this.classify(H[k], M[k], Fo[k], BI[k] as BiomeId, BT[k], wx, wy);
        let el = this.elevationFromHeight(H[k]);
        let onRoad = false;

        if (segs.length) {
          const rd = this.roadDist(wx, wy, segs);
          if (rd < 1.4 + noise(wx * 0.2, wy * 0.3, SEED + 3) * 0.9) {
            t = WATERY[t] ? T.BRIDGE : T.ROAD;
            el = Math.max(1, Math.min(2, el));
            onRoad = true;
          } else if (rd < 2.7 && !WATERY[t] && hash(wx, wy, SEED + 4) < 0.55) {
            t = T.DIRT;
            onRoad = true;
          } else if (rd < 4) {
            onRoad = true;
          }
        }

        const dhx = H[k + 1] - H[k - 1];
        const dhy = H[k + S2] - H[k - S2];
        shade[idx] = clamp(1 + (dhx + dhy * 0.8) * 9, 0.58, 1.52) * (0.92 + hash(wx, wy, SEED + 1) * 0.16);

        if (oc[idx] !== -1) {
          const c = String.fromCharCode(oc[idx]);
          const s = os[idx]!;
          const fl = s.bp.floor;
          if (s.bp.elev !== undefined) el = s.bp.elev;
          let ob: string | null = null;
          switch (c) {
            case '#':
              t = s.bp.erode && hash(wx, wy, SEED + 77) < s.bp.erode ? T.RUBBLE : T.WALL;
              break;
            case 'O':
              t = T.TOWER_WALL;
              break;
            case '^':
              t = T.ARCH;
              break;
            case 's':
              t = T.STAIRS;
              break;
            case '.':
              t = fl != null ? fl : WATERY[t] ? T.DIRT : t;
              break;
            case ',':
              t = T.RUBBLE;
              break;
            case '~':
              t = T.SHALLOW;
              el = 0;
              break;
            case 'w':
              t = T.WATER;
              el = 0;
              break;
            case '=':
              t = T.ROAD;
              break;
            case '_':
              t = T.CARPET;
              break;
            case 'G':
              t = T.GATE;
              break;
            default:
              t = fl != null ? fl : WATERY[t] || t === T.MOUNT ? T.DIRT : t;
              ob = OBJ_MAP[c] || null;
          }
          if (ob) {
            const o: WorldObject = { kind: ob, x: wx, y: wy, v: hash(wx, wy, SEED + 98) };
            if (ob === 'shrine') o.id = `shrine@${wx},${wy}`;
            if (ob === 'lore') o.id = `lore@${wx},${wy}`;
            if (ob === 'chest') o.id = `chest@${wx},${wy}`;
            if (ob === 'cave') o.id = `cave@${wx},${wy}`;
            objs.push(o);
            if (SOLID_OBJ[ob]) solid[idx] = 1;
          }
        } else if (!onRoad && !solid[idx]) {
          const r = hash(wx, wy, SEED + 99);
          const v = hash(wx, wy, SEED + 98);
          let ob: string | null = null;
          switch (t) {
            case T.FOREST:
              if (r < 0.068) ob = 'pine';
              else if (r < 0.078) ob = 'fungus';
              break;
            case T.GRASS:
              if (r < 0.005) ob = 'pine';
              else if (r < 0.008) ob = 'deadtree';
              else if (r < 0.011) ob = 'rock';
              else if (r < 0.055 && noise(wx * 0.06, wy * 0.1, SEED + 40) > 0.56) ob = 'flower';
              break;
            case T.MOOR:
              if (r < 0.007) ob = 'deadtree';
              else if (r < 0.012) ob = 'rock';
              else if (r < 0.0132) ob = 'menhir';
              else if (r < 0.048 && noise(wx * 0.05, wy * 0.09, SEED + 41) > 0.6) ob = 'flower';
              break;
            case T.MARSH:
              if (r < 0.012) ob = 'deadtree';
              else if (r < 0.05) ob = 'reeds';
              else if (r < 0.056) ob = 'fungus';
              break;
            case T.ROCK:
              if (r < 0.02) ob = 'rock';
              else if (r < 0.024) ob = 'deadtree';
              break;
            case T.ASH:
              if (r < 0.014) ob = 'burnt';
              else if (r < 0.028) ob = 'vent';
              break;
            case T.SHALLOW:
              if (r < 0.03) ob = 'reeds';
              break;
            case T.SAND:
              if (r < 0.008) ob = 'rock';
              break;
          }
          if (ob) {
            objs.push({ kind: ob, x: wx, y: wy, v });
            if (SOLID_OBJ[ob]) solid[idx] = 1;
          }
        }
        type[idx] = t;
        elev[idx] = el;
      }
    }

    return { cx, cy, type, shade, elev, solid, objs, feats };
  }

  chunk(cx: number, cy: number): Chunk {
    const k = `${cx},${cy}`;
    let c = this.chunks.get(k);
    if (!c) {
      c = this.genChunk(cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }

  injectChunk(c: Chunk): void {
    const k = `${c.cx},${c.cy}`;
    if (!this.chunks.has(k)) {
      this.chunks.set(k, c);
    }
  }

  chunkAtCell(x: number, y: number): Chunk {
    const cx = x >> 5;
    const cy = y >> 5;
    if (cx !== this.lcx || cy !== this.lcy || !this.lch) {
      this.lch = this.chunk(cx, cy);
      this.lcx = cx;
      this.lcy = cy;
    }
    return this.lch;
  }

  typeAt(x: number, y: number): TerrainId {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    return this.chunkAtCell(xi, yi).type[((yi & 31) << 5) | (xi & 31)] as TerrainId;
  }

  elevAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    return this.chunkAtCell(xi, yi).elev[((yi & 31) << 5) | (xi & 31)];
  }

  isSolid(x: number, y: number, fromX?: number, fromY?: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const c = this.chunkAtCell(xi, yi);
    const i = ((yi & 31) << 5) | (xi & 31);
    const t = c.type[i];
    if (t === T.GATE) return !this.gateOpen;
    if (t === T.ARCH || t === T.STAIRS) return false;
    if (SOLID[t] === 1 || c.solid[i] === 1) return true;

    // 2.5D Elevation cliff collision: cannot step up/down > 1 level without stairs
    if (fromX !== undefined && fromY !== undefined) {
      const fxi = Math.floor(fromX);
      const fyi = Math.floor(fromY);
      if (fxi !== xi || fyi !== yi) {
        const fromT = this.typeAt(fxi, fyi);
        if (fromT !== T.STAIRS) {
          const dElev = Math.abs(c.elev[i] - this.elevAt(fxi, fyi));
          if (dElev > 1) return true;
        }
      }
    }
    return false;
  }

  objectsIn(x0: number, y0: number, x1: number, y1: number, out: WorldObject[] = []): WorldObject[] {
    const ix0 = Math.floor(x0);
    const iy0 = Math.floor(y0);
    const ix1 = Math.ceil(x1);
    const iy1 = Math.ceil(y1);
    for (let cy = iy0 >> 5; cy <= iy1 >> 5; cy++) {
      for (let cx = ix0 >> 5; cx <= ix1 >> 5; cx++) {
        const objs = this.chunk(cx, cy).objs;
        for (let k = 0; k < objs.length; k++) {
          const o = objs[k];
          if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) out.push(o);
        }
      }
    }
    return out;
  }

  featuresNear(x: number, y: number, r: number): WorldFeature[] {
    const out: WorldFeature[] = [];
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r / ASP);
    const y1 = Math.floor(y + r / ASP);
    for (let cy = y0 >> 5; cy <= y1 >> 5; cy++) {
      for (let cx = x0 >> 5; cx <= x1 >> 5; cx++) {
        for (const f of this.chunk(cx, cy).feats) {
          if (dist(f.x + 0.5 - x, f.y + 0.5 - y) <= r) out.push(f);
        }
      }
    }
    return out;
  }

  landmarkAt(x: number, y: number): Landmark | null {
    for (const L of this.landmarks) {
      if (dist(x - L.x, y - L.y) < L.r * 0.55) return L;
    }
    return null;
  }

  markVisited(x0: number, y0: number, x1: number, y1: number): void {
    const ix0 = Math.floor(x0);
    const iy0 = Math.floor(y0);
    const ix1 = Math.ceil(x1);
    const iy1 = Math.ceil(y1);
    for (let cy = iy0 >> 5; cy <= iy1 >> 5; cy++) {
      for (let cx = ix0 >> 5; cx <= ix1 >> 5; cx++) {
        this.visited.add(`${cx},${cy}`);
      }
    }
  }

  biomeAt(x: number, y: number): BiomeId {
    return this.fields(x, y).bi;
  }
}
