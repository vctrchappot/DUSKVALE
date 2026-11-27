export const T = {
  DEEP: 0,
  WATER: 1,
  SHALLOW: 2,
  MARSH: 3,
  SAND: 4,
  GRASS: 5,
  MOOR: 6,
  FOREST: 7,
  ROCK: 8,
  MOUNT: 9,
  ROAD: 10,
  FLOOR: 11,
  WALL: 12,
  ASH: 13,
  DIRT: 14,
  RUBBLE: 15,
  GATE: 16,
  BRIDGE: 17,
  CARPET: 18,
  STAIRS: 19,
  ARCH: 20,
  TOWER_WALL: 21,
  CAVE_FLOOR: 22,
} as const;

export type TerrainId = (typeof T)[keyof typeof T];

export const BIOMES = {
  none: 0,
  clear: 1,
  moor: 2,
  swamp: 3,
  ash: 4,
  plaza: 5,
  lake: 6,
} as const;

export type BiomeId = (typeof BIOMES)[keyof typeof BIOMES];
export type BiomeName = keyof typeof BIOMES;

export const SOLID = new Uint8Array(32);
[T.DEEP, T.WATER, T.MOUNT, T.WALL, T.GATE, T.TOWER_WALL].forEach((t) => {
  SOLID[t] = 1;
});

export const WATERY = new Uint8Array(32);
[T.DEEP, T.WATER, T.SHALLOW].forEach((t) => {
  WATERY[t] = 1;
});

export const CS = 32;
export const SEED = 7331;

export interface WorldObject {
  kind: string;
  x: number;
  y: number;
  v: number;
  id?: string;
  text?: string;
}

export interface WorldFeature {
  kind: 'shrine' | 'lore' | 'spawn' | 'boss' | 'npc' | 'gate' | 'chest' | 'signpost' | 'cave';
  x: number;
  y: number;
  id: string;
  name?: string | null;
  struct?: string;
  enemy?: string;
  boss?: string;
  npc?: string;
  text?: string;
}

export interface Blueprint {
  floor: TerrainId | null;
  erode?: number;
  enemy?: string;
  boss?: string;
  elev?: number; // base elevation level (0..4)
  wallHeight?: number; // facade height in world rows
  rows: string[];
}

export interface Structure {
  bp: Blueprint;
  bpName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  name: string | null;
  feats: WorldFeature[];
}

export interface Landmark {
  id: string;
  name: string;
  sub: string;
  x: number;
  y: number;
  r: number;
  biome: BiomeName;
  bp: string;
  struct?: Structure;
  entry?: { x: number; y: number };
}

export interface Chunk {
  cx: number;
  cy: number;
  type: Uint8Array;
  shade: Float32Array;
  elev: Uint8Array; // 0..4 elevation levels for 2.5D cliffs & plateaus
  solid: Uint8Array;
  objs: WorldObject[];
  feats: WorldFeature[];
}
