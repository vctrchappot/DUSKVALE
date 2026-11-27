import { ASP, dist, hash } from '../engine/util.ts';
import { BIOMES, CS, SOLID, T, type BiomeId, type Chunk, type Landmark, type TerrainId, type WorldFeature, type WorldObject } from './types.ts';
import type { SignpostDef } from './world.ts';

export interface DungeonRoom {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/**
 * Procedural multi-room 2.5D Crypt / Dungeon instance.
 * Exposes the same spatial query API as World so SceneRenderer and Game run seamlessly indoors.
 */
export class DungeonWorld {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly returnPos: { x: number; y: number };
  readonly spawnPos: { x: number; y: number };
  readonly rooms: DungeonRoom[] = [];
  readonly landmarks: Landmark[] = [];
  readonly signposts: SignpostDef[] = [];
  readonly chunks = new Map<string, Chunk>();
  readonly visited = new Set<string>();

  private readonly width = 56;
  private readonly height = 38;
  private readonly grid: Uint8Array;
  private readonly elevGrid: Uint8Array;
  private readonly solidGrid: Uint8Array;
  private readonly objs: WorldObject[] = [];
  private readonly feats: WorldFeature[] = [];

  constructor(id: string, name: string, seed: number, returnPos: { x: number; y: number }) {
    this.id = id;
    this.name = name;
    this.seed = seed;
    this.returnPos = { ...returnPos };
    this.grid = new Uint8Array(this.width * this.height).fill(T.WALL);
    this.elevGrid = new Uint8Array(this.width * this.height).fill(1);
    this.solidGrid = new Uint8Array(this.width * this.height).fill(0);

    this.generateLayout();
    this.spawnPos = { x: this.rooms[0].cx + 0.5, y: this.rooms[0].cy + 1.5 };
    this.bakeChunks();
  }

  private setTile(x: number, y: number, t: TerrainId, elev = 1): void {
    if (x < 1 || y < 1 || x >= this.width - 1 || y >= this.height - 1) return;
    const i = y * this.width + x;
    this.grid[i] = t;
    this.elevGrid[i] = elev;
  }

  private carveRoom(r: DungeonRoom, elev = 1): void {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        this.setTile(x, y, T.CAVE_FLOOR, elev);
      }
    }
  }

  private carveCorridor(x0: number, y0: number, x1: number, y1: number): void {
    let x = x0;
    let y = y0;
    while (x !== x1) {
      this.setTile(x, y, T.FLOOR, 1);
      this.setTile(x, y + 1, T.FLOOR, 1);
      x += x < x1 ? 1 : -1;
    }
    while (y !== y1) {
      this.setTile(x, y, T.FLOOR, 1);
      this.setTile(x + 1, y, T.FLOOR, 1);
      y += y < y1 ? 1 : -1;
    }
  }

  private generateLayout(): void {
    // 4 connected rooms: Entry -> Antechamber -> Treasury -> Boss Sanctum
    const defs: DungeonRoom[] = [
      { x: 4, y: 14, w: 10, h: 9, cx: 9, cy: 18 },
      { x: 18, y: 6 + Math.floor(hash(this.seed, 1, 7) * 5), w: 11, h: 9, cx: 23, cy: 11 },
      { x: 18, y: 22 + Math.floor(hash(this.seed, 2, 7) * 4), w: 10, h: 8, cx: 23, cy: 26 },
      { x: 35, y: 11, w: 15, h: 14, cx: 42, cy: 18 },
    ];
    for (const r of defs) {
      r.cx = r.x + (r.w >> 1);
      r.cy = r.y + (r.h >> 1);
      this.rooms.push(r);
      this.carveRoom(r, r === defs[3] ? 2 : 1);
    }

    // Corridors + stairs into elevated boss sanctum
    this.carveCorridor(defs[0].cx, defs[0].cy, defs[1].cx, defs[1].cy);
    this.carveCorridor(defs[0].cx, defs[0].cy, defs[2].cx, defs[2].cy);
    this.carveCorridor(defs[1].cx, defs[1].cy, defs[3].cx, defs[3].cy);
    this.carveCorridor(defs[2].cx, defs[2].cy, defs[3].cx, defs[3].cy);
    for (let y = defs[3].y + 4; y <= defs[3].y + 9; y++) {
      this.setTile(defs[3].x, y, T.STAIRS, 1);
    }

    // Entry portal back to overworld
    const entry = defs[0];
    this.objs.push({ kind: 'cave', x: entry.cx, y: entry.y + 1, v: 0, id: `${this.id}:exit` });
    this.feats.push({ kind: 'cave', x: entry.cx, y: entry.y + 1, id: `${this.id}:exit`, name: 'Ausgang zur Oberwelt' });

    // Braziers & Pillars in every room
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      const corners = [
        [r.x + 1, r.y + 1],
        [r.x + r.w - 2, r.y + 1],
        [r.x + 1, r.y + r.h - 2],
        [r.x + r.w - 2, r.y + r.h - 2],
      ];
      for (const [bx, by] of corners) {
        this.objs.push({ kind: 'brazier', x: bx, y: by, v: hash(bx, by, this.seed) });
        this.solidGrid[by * this.width + bx] = 1;
      }
      if (ri === 1 || ri === 2) {
        const enemyKind = ri === 1 ? 'skeleton' : 'specter';
        this.feats.push({ kind: 'spawn', x: r.cx - 2, y: r.cy, id: `${this.id}:sp${ri}a`, enemy: enemyKind });
        this.feats.push({ kind: 'spawn', x: r.cx + 2, y: r.cy, id: `${this.id}:sp${ri}b`, enemy: enemyKind });
      }
      if (ri === 2) {
        // Treasure chest in treasury room
        this.objs.push({ kind: 'chest', x: r.cx, y: r.cy - 2, v: 0.5, id: `${this.id}:chest` });
        this.feats.push({ kind: 'chest', x: r.cx, y: r.cy - 2, id: `${this.id}:chest`, struct: this.id });
      }
    }

    // Sanctum Elite Crypt Guardian + Reward Chest
    const bossRoom = defs[3];
    this.feats.push({
      kind: 'spawn',
      x: bossRoom.cx,
      y: bossRoom.cy,
      id: `${this.id}:guardian`,
      enemy: 'specter',
      name: 'dungeon_guardian',
    });
    this.objs.push({ kind: 'chest', x: bossRoom.x + bossRoom.w - 3, y: bossRoom.cy, v: 0.9, id: `${this.id}:boss_chest` });
    this.feats.push({ kind: 'chest', x: bossRoom.x + bossRoom.w - 3, y: bossRoom.cy, id: `${this.id}:boss_chest`, struct: this.id });
  }

  private bakeChunks(): void {
    const cxMax = Math.ceil(this.width / CS);
    const cyMax = Math.ceil(this.height / CS);
    for (let cy = 0; cy < cyMax; cy++) {
      for (let cx = 0; cx < cxMax; cx++) {
        const type = new Uint8Array(CS * CS).fill(T.WALL);
        const shade = new Float32Array(CS * CS).fill(1.0);
        const elev = new Uint8Array(CS * CS).fill(1);
        const solid = new Uint8Array(CS * CS).fill(0);
        const cObjs: WorldObject[] = [];
        const cFeats: WorldFeature[] = [];
        const x0 = cx * CS;
        const y0 = cy * CS;

        for (let j = 0; j < CS; j++) {
          for (let i = 0; i < CS; i++) {
            const wx = x0 + i;
            const wy = y0 + j;
            const idx = j * CS + i;
            if (wx >= 0 && wy >= 0 && wx < this.width && wy < this.height) {
              const gi = wy * this.width + wx;
              type[idx] = this.grid[gi];
              elev[idx] = this.elevGrid[gi];
              solid[idx] = this.solidGrid[gi];
              shade[idx] = 0.92 + hash(wx, wy, this.seed + 9) * 0.16;
            }
          }
        }
        for (const o of this.objs) {
          if (o.x >= x0 && o.x < x0 + CS && o.y >= y0 && o.y < y0 + CS) cObjs.push(o);
        }
        for (const f of this.feats) {
          if (f.x >= x0 && f.x < x0 + CS && f.y >= y0 && f.y < y0 + CS) cFeats.push(f);
        }
        const key = `${cx},${cy}`;
        this.chunks.set(key, { cx, cy, type, shade, elev, solid, objs: cObjs, feats: cFeats });
        this.visited.add(key);
      }
    }
  }

  setGateOpen(_open: boolean): void {
    // no cathedral gate inside crypts
  }

  chunk(cx: number, cy: number): Chunk {
    const k = `${cx},${cy}`;
    let c = this.chunks.get(k);
    if (!c) {
      c = {
        cx,
        cy,
        type: new Uint8Array(CS * CS).fill(T.WALL),
        shade: new Float32Array(CS * CS).fill(0.8),
        elev: new Uint8Array(CS * CS).fill(1),
        solid: new Uint8Array(CS * CS).fill(1),
        objs: [],
        feats: [],
      };
      this.chunks.set(k, c);
    }
    return c;
  }

  injectChunk(_c: Chunk): void {
    // pre-baked
  }

  chunkAtCell(x: number, y: number): Chunk {
    return this.chunk(x >> 5, y >> 5);
  }

  typeAt(x: number, y: number): TerrainId {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return T.WALL;
    return this.grid[yi * this.width + xi] as TerrainId;
  }

  elevAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return 1;
    return this.elevGrid[yi * this.width + xi];
  }

  isSolid(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 1 || yi < 1 || xi >= this.width - 1 || yi >= this.height - 1) return true;
    const gi = yi * this.width + xi;
    const t = this.grid[gi];
    return SOLID[t] === 1 || this.solidGrid[gi] === 1;
  }

  objectsIn(x0: number, y0: number, x1: number, y1: number, out: WorldObject[] = []): WorldObject[] {
    for (const o of this.objs) {
      if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) out.push(o);
    }
    return out;
  }

  featuresNear(x: number, y: number, r: number): WorldFeature[] {
    return this.feats.filter((f) => dist(f.x + 0.5 - x, f.y + 0.5 - y) <= r);
  }

  landmarkAt(_x: number, _y: number): Landmark | null {
    return null;
  }

  markVisited(_x0: number, _y0: number, _x1: number, _y1: number): void {
    // crypt chunks already revealed
  }

  biomeAt(_x: number, _y: number): BiomeId {
    return BIOMES.plaza;
  }
}
