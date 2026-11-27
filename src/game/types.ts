export type WeaponKind = 'sword' | 'greatsword' | 'spear' | 'scythe';

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  dmgMult: number;
  range: number;
  arcDot: number;
  speed: number; // cooldown seconds
  staminaCost: number;
  poiseDmg: number;
  bleed?: number;
  burn?: number;
  glowColor: [number, number, number];
  price: number;
  desc: string;
}

export interface ArmorDef {
  id: string;
  name: string;
  defense: number;
  poiseBonus: number;
  cloakColor: [number, number, number];
  steelColor: [number, number, number];
  trimColor: [number, number, number];
  price: number;
  desc: string;
}

export interface RingDef {
  id: string;
  name: string;
  hpBonus?: number;
  mpBonus?: number;
  stBonus?: number;
  dmgBonus?: number;
  xpMult?: number;
  price: number;
  desc: string;
}

export type SkillId = 'flame_slash' | 'ember_bolt' | 'ash_shield' | 'leap_strike';

export interface SkillDef {
  id: SkillId;
  slot: number; // 1..4
  name: string;
  manaCost: number;
  cooldown: number;
  icon: string;
  color: string;
  desc: string;
}

export interface StatusEffect {
  kind: 'burn' | 'bleed';
  timer: number;
  tickTimer: number;
  dps: number;
}

export interface SerializablePlayer {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  aimX: number;
  aimY: number;
  hp: number;
  mp: number;
  st: number;
  lvl: number;
  xp: number;
  attrPoints: number;
  vig: number;
  mig: number;
  end: number;
  arc: number;
  embers: number;
  flasks: number;
  maxFlasks: number;
  weaponId: string;
  weaponUpgrade: number;
  armorId: string;
  ringId: string | null;
  runeId?: string | null;
  inventoryWeapons: string[];
  inventoryArmors: string[];
  inventoryRings: string[];
  inventoryRunes?: string[];
  unlockedSkills: SkillId[];
}

export interface SaveSlotData {
  version: 2;
  savedAt: number;
  slotName: string;
  player: SerializablePlayer;
  lastShrine: { x: number; y: number; id: string };
  shrines: string[];
  shrineInfo: Record<string, { x: number; y: number; name: string }>;
  bosses: string[];
  lore: string[];
  chests: string[];
  bestiary: Record<string, number>;
  knownLandmarks: string[];
  mapPins: { x: number; y: number; label: string }[];
  claimedSideQuests?: string[];
  dungeonsCleared?: number;
  gateOpen: boolean;
  victory: boolean;
  lost: { x: number; y: number; amount: number } | null;
  clock: number;
  talkedMaren: boolean;
  onboardingDone: string[];
}
