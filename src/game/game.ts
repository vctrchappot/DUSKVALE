import type { AudioEngine } from '../engine/audio.ts';
import type { InputState } from '../engine/input.ts';
import type { GameOptions } from '../engine/options.ts';
import { ASP, clamp, dist, hash, lerp, pick, rand, TAU } from '../engine/util.ts';
import { GrassAndWaterField } from '../world/grass.ts';
import { BIOMES, T, WATERY, type BiomeId, type WorldFeature, type WorldObject } from '../world/types.ts';
import { World } from '../world/world.ts';
import { SmoothCamera } from './camera.ts';
import { evaluateMainQuest, ONBOARDING_HINTS, type ActiveQuestSummary } from './quests.ts';
import { ARMORS, RINGS, SKILLS, WEAPONS, weaponUpgradeCost, xpForNextLevel } from './rpg.ts';
import type { SaveSlotData, SerializablePlayer, SkillId, StatusEffect } from './types.ts';

const PCY = 2.0;

export interface EnemyDef {
  boss?: boolean;
  final?: boolean;
  name: string;
  hp: number;
  poise: number;
  dmg: number;
  spd: number;
  aggro: number;
  range: number;
  ranged?: number;
  windup: number;
  recover: number;
  embers: number;
  xp: number;
  lunge: number;
  float?: boolean;
  blood: [number, number, number];
  proj: [number, number, number];
  attacks?: string[];
  minion?: string;
  sigil?: string;
  desc: string;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  ghoul: {
    name: 'Ghul',
    hp: 46,
    poise: 32,
    dmg: 12,
    spd: 8.5,
    aggro: 24,
    range: 3.4,
    windup: 0.45,
    recover: 0.65,
    embers: 28,
    xp: 30,
    lunge: 8,
    blood: [0.55, 0.05, 0.05],
    proj: [0.6, 0.2, 0.15],
    desc: 'Hungriger Plünderer der verlassenen Ruinen.',
  },
  wolf: {
    name: 'Aschwolf',
    hp: 34,
    poise: 22,
    dmg: 11,
    spd: 15.5,
    aggro: 30,
    range: 4.2,
    windup: 0.34,
    recover: 0.55,
    embers: 24,
    xp: 26,
    lunge: 20,
    blood: [0.55, 0.06, 0.06],
    proj: [1.0, 0.5, 0.2],
    desc: 'Flinker Jäger, dessen Fell nach kaltem Rauch riecht.',
  },
  skeleton: {
    name: 'Grabwächter',
    hp: 64,
    poise: 46,
    dmg: 16,
    spd: 7.8,
    aggro: 24,
    range: 4.0,
    windup: 0.56,
    recover: 0.72,
    embers: 44,
    xp: 45,
    lunge: 7,
    blood: [0.92, 0.88, 0.76],
    proj: [0.4, 0.85, 1.0],
    desc: 'Knochenkrieger mit warmweißem Gebein und verrostetem Schild.',
  },
  wraith: {
    name: 'Irrlicht',
    hp: 42,
    poise: 24,
    dmg: 13,
    spd: 7.0,
    aggro: 32,
    range: 3.0,
    ranged: 24,
    windup: 0.75,
    recover: 0.95,
    embers: 48,
    xp: 48,
    float: true,
    lunge: 5,
    blood: [0.42, 0.68, 1.0],
    proj: [0.5, 0.82, 1.0],
    desc: 'Schwebende Stimme aus dem Moor, die kalte Bolzen schleudert.',
  },
  specter: {
    name: 'Ritter-Gespenst',
    hp: 96,
    poise: 70,
    dmg: 20,
    spd: 9.2,
    aggro: 26,
    range: 4.8,
    windup: 0.52,
    recover: 0.68,
    embers: 78,
    xp: 75,
    lunge: 12,
    blood: [0.48, 0.72, 1.0],
    proj: [0.55, 0.88, 1.0],
    desc: 'Gefallener Wachritter der Burg am See und Aschenfeste.',
  },
  bogwitch: {
    name: 'Moorhexe',
    hp: 74,
    poise: 36,
    dmg: 16,
    spd: 6.5,
    aggro: 30,
    range: 3.4,
    ranged: 26,
    windup: 0.7,
    recover: 0.9,
    embers: 72,
    xp: 70,
    lunge: 4,
    blood: [0.32, 0.85, 0.55],
    proj: [0.42, 1.0, 0.65],
    desc: 'Beschwörerin der Ertrunkenen Kapelle mit giftgrünen Flüchen.',
  },
  wight: {
    boss: true,
    name: 'Vael, der Gebeinkönig',
    hp: 560,
    poise: 140,
    dmg: 21,
    spd: 8.2,
    aggro: 26,
    range: 6.8,
    windup: 0.55,
    recover: 0.7,
    embers: 900,
    xp: 380,
    lunge: 12,
    blood: [0.92, 0.88, 0.76],
    proj: [1.0, 0.32, 0.2],
    attacks: ['swing', 'swing', 'slam', 'summon', 'charge'],
    minion: 'skeleton',
    sigil: 'Knochen',
    desc: 'Hüter des Siegels des Knochens im Hügelgrab.',
  },
  matron: {
    boss: true,
    name: 'Die Ertrunkene Mutter',
    hp: 620,
    poise: 130,
    dmg: 19,
    spd: 7.0,
    aggro: 30,
    range: 6.0,
    windup: 0.6,
    recover: 0.8,
    embers: 1100,
    xp: 440,
    float: true,
    lunge: 8,
    blood: [0.4, 0.92, 0.72],
    proj: [0.45, 1.0, 0.78],
    attacks: ['volley', 'volley', 'blink', 'swing', 'summon'],
    minion: 'wraith',
    sigil: 'Flut',
    desc: 'Wächterin der Ertrunkenen Kapelle und des Siegels der Flut.',
  },
  corvus: {
    boss: true,
    name: 'Corvus, der Aschenritter',
    hp: 740,
    poise: 180,
    dmg: 24,
    spd: 10.2,
    aggro: 28,
    range: 7.0,
    windup: 0.5,
    recover: 0.6,
    embers: 1400,
    xp: 540,
    lunge: 16,
    blood: [1.0, 0.48, 0.14],
    proj: [1.0, 0.5, 0.12],
    attacks: ['swing', 'swing', 'charge', 'slam', 'volley'],
    sigil: 'Asche',
    desc: 'Eidbrecher der brennenden Aschenfeste.',
  },
  bishop: {
    boss: true,
    final: true,
    name: 'Der Bleiche Bischof',
    hp: 1180,
    poise: 220,
    dmg: 26,
    spd: 8.0,
    aggro: 30,
    range: 7.2,
    windup: 0.6,
    recover: 0.7,
    embers: 4000,
    xp: 1200,
    lunge: 12,
    blood: [0.7, 0.08, 0.12],
    proj: [1.0, 0.25, 0.28],
    attacks: ['volley', 'blink', 'slam', 'charge', 'summon', 'swing', 'swing'],
    minion: 'wraith',
    desc: 'Herr der Schwarzen Kathedrale, der die Sonne einsperrte.',
  },
};

export const SIGIL_BOSSES = ['wight', 'matron', 'corvus'] as const;

export const LORE_TEXTS: Record<string, string[]> = {
  start: ['Eingemeißelt in den Sockel: »Solange eine Glut brennt, ist die Nacht nicht vollkommen.«'],
  lakecastle: ['»Die Wacht am See sah einst die Sterne im Wasser. Nun spiegelt der See nur zerbrochene Zinnen.«'],
  barrow: ['»Vael legte seine Krone nie ab. Nicht im Leben, nicht im Grab. Nun trägt er sie für den Bischof.«'],
  chapel: ['»Als die Glocken verstummten, stieg das Moor. Die Mutter blieb, um die Ertrunkenen zu wiegen.«'],
  keep: ['»Corvus schwor, die Feste zu halten, bis der letzte Stein fällt. Die Steine fielen. Er hält sie noch immer.«'],
  cathedral: ['Über dem Tor, in rissigem Gold: »Drei Siegel binden das Tor – Knochen, Flut und Asche.«'],
  generic: [
    '»Wir zählten die Tage nach den Glocken. Dann schwiegen die Glocken.«',
    '»Der Bischof versprach uns ewigen Abend. Niemand fragte, was nach dem Abend kommt.«',
    '»Folge den alten Straßen und Wegweisern. Sie erinnern sich an die Pilger.«',
    '»Auf hohen Zinnen trägt jeder Bolzen weiter – High Ground entscheidet Schlachten.«',
    '»Die Sonne ging nicht unter. Sie wurde eingesperrt.«',
    '»Ein Schrein erinnert sich an jeden, der an ihm ruhte.«',
  ],
};

const MAREN_DIALOGS = [
  [
    'Ah… noch ein Wanderer, der die letzte Glut trägt.',
    'Seit der Bleiche Bischof die Sonne in seiner Kathedrale im Norden gefangen hält, endet die Dämmerung nie.',
    'Drei Heilige hüten die Siegel: im Westen das Hügelgrab des Heiligen Vael, im Osten die Ertrunkene Kapelle, im Süden die Aschenfeste.',
    'Ich habe die Orte auf deiner Karte [M] verzeichnet. Folge den Wegweisern und deinem Kompass oben.',
    'Hier im Lager findest du auch den Schmied und den Händler. Nutze [1–4] für deine Glut-Fähigkeiten und [F] zum Parieren.',
  ],
  ['Die Schwarze Kathedrale im Norden öffnet sich erst, wenn du alle drei Siegel trägst.'],
  ['Sprich mit dem Schmied, um deine Klinge mit Glut zu härten, oder schau ins Journal [J].'],
];

export interface PlayerEntity {
  id: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
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
  inventoryWeapons: string[];
  inventoryArmors: string[];
  inventoryRings: string[];
  unlockedSkills: SkillId[];
  skillCD: Record<SkillId, number>;
  atk: number;
  atkCD: number;
  hitPending: number;
  combo: number;
  comboResetT: number;
  roll: number;
  rollX: number;
  rollY: number;
  parry: number;
  parryCD: number;
  shieldT: number;
  iframes: number;
  drink: number;
  healPending: boolean;
  stDelay: number;
  hurtT: number;
  dead: boolean;
  deadT: number;
  walkT: number;
  moving: boolean;
  stepRippleT: number;
}

export interface EnemyEntity {
  id: string;
  type: string;
  d: EnemyDef;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hx: number;
  hy: number;
  ck: string;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  staggerT: number;
  state: 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'hurt' | 'stagger' | 'return';
  st: number;
  face: number;
  flash: number;
  ax: number;
  ay: number;
  cd: number;
  walkT: number;
  kbx: number;
  kby: number;
  hitDone: boolean;
  atk: string | null;
  phase: number;
  dead: boolean;
  tx: number;
  ty: number;
  lv: number;
  float: boolean;
  boss: boolean;
  minion: boolean;
  rad: number;
  statuses: StatusEffect[];
}

export interface NpcEntity {
  id: string;
  kind: 'maren' | 'smith' | 'merchant' | 'pilgrim';
  x: number;
  y: number;
  face: number;
  talks: number;
  name: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  code: number;
  r: number;
  g: number;
  b: number;
  e: number;
  drag: number;
  grav: number;
  decal?: boolean;
  delay: number;
  fade: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  col: [number, number, number];
  fromPlayer?: boolean;
  elev?: number;
}

export interface Telegraph {
  kind: 'circle' | 'cone';
  x: number;
  y: number;
  rad: number;
  angle?: number;
  arc?: number;
  life: number;
  max: number;
  col: [number, number, number];
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  bold?: boolean;
}

export interface Decal {
  x: number;
  y: number;
  code: number;
  r: number;
  g: number;
  b: number;
  life: number;
}

export interface LightSource {
  x: number;
  y: number;
  rad: number;
  r: number;
  g: number;
  b: number;
  i: number;
  castsShadow?: boolean;
}

export interface InteractTarget {
  kind: 'npc' | 'shrine' | 'lore' | 'gate' | 'chest' | 'signpost' | 'cave';
  label: string;
  n?: NpcEntity;
  f?: WorldFeature;
}

export interface GameUICallbacks {
  banner(title: string, sub: string, style?: string, dur?: number): void;
  dialog(title: string, lines: string[], cb?: () => void): void;
  shrineMenu(f: WorldFeature): void;
  smithMenu(): void;
  merchantMenu(): void;
  hurtFlash(): void;
  death(show: boolean): void;
}

const SAVE_PREFIX = 'duskvale.save.v2.slot';

export class Game {
  readonly world: World;
  readonly audio: AudioEngine;
  readonly camera = new SmoothCamera();
  readonly grassField = new GrassAndWaterField();
  options: GameOptions;
  ui!: GameUICallbacks;

  t = 0;
  mode: 'title' | 'play' = 'title';
  player!: PlayerEntity;
  activeSlot = 1;

  flags = {
    shrines: new Set<string>(),
    bosses: new Set<string>(),
    lore: new Set<string>(),
    chests: new Set<string>(),
    knownLandmarks: new Set<string>(['start']),
    gateOpen: false,
    victory: false,
    talkedMaren: false,
    onboardingDone: new Set<string>(),
  };
  shrineInfo: Record<string, { x: number; y: number; name: string }> = {};
  bestiary: Record<string, number> = {};
  loreLog: { title: string; text: string }[] = [];
  mapPins: { x: number; y: number; label: string }[] = [];

  enemies: EnemyEntity[] = [];
  npcs: NpcEntity[] = [];
  pickups: { x: number; y: number; amount: number }[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  telegraphs: Telegraph[] = [];
  decals = new Map<string, Decal>();
  lights: LightSource[] = [];
  rain: { x: number; y: number; life: number; vx: number; vy: number; ash?: boolean }[] = [];
  fireflies: { x: number; y: number; a: number; ph: number; ok?: boolean }[] = [];

  weather = {
    rain: 0.35,
    fog: 0.2,
    wind: 0.45,
    cloud: 0.5,
    kind: 'regen' as 'klar' | 'nebel' | 'regen' | 'sturm',
    timer: 85,
    target: { rain: 0.45, fog: 0.22, wind: 0.45, cloud: 0.55 },
  };
  amb: [number, number, number] = [0.55, 0.5, 0.54];
  fogColor: [number, number, number] = [0.46, 0.5, 0.58];
  cloud = 0;
  flash = 0;
  night = 0;
  clock = 0.04;
  dawn = 0;

  hitstop = 0;
  spawned = new Set<string>();
  killed = new Set<string>();
  boss: EnemyEntity | null = null;
  lockedTarget: EnemyEntity | null = null;
  lastShrine = { x: 0.5, y: 2.5, id: 'shrine@0,0' };
  lost: { x: number; y: number; amount: number } | null = null;
  area: string | null = null;
  biome: BiomeId = BIOMES.clear;
  biomeT = 0;
  interact: InteractTarget | null = null;
  spawnTimer = 0.2;
  quest: ActiveQuestSummary;

  constructor(world: World, audio: AudioEngine, options: GameOptions) {
    this.world = world;
    this.audio = audio;
    this.options = options;
    this.player = this.createPlayer();
    this.camera.snap(-26, 6);
    this.quest = this.computeQuest();
  }

  private createPlayer(): PlayerEntity {
    const p: PlayerEntity = {
      id: 'player-1',
      x: 0.5,
      y: 4.5,
      prevX: 0.5,
      prevY: 4.5,
      vx: 0,
      vy: 0,
      face: 1,
      aimX: 1,
      aimY: 0,
      hp: 100,
      mp: 60,
      st: 100,
      lvl: 1,
      xp: 0,
      attrPoints: 0,
      vig: 1,
      mig: 1,
      end: 1,
      arc: 1,
      embers: 0,
      flasks: 3,
      maxFlasks: 3,
      weaponId: 'iron_sword',
      weaponUpgrade: 0,
      armorId: 'wanderer_plate',
      ringId: null,
      inventoryWeapons: ['iron_sword'],
      inventoryArmors: ['wanderer_plate'],
      inventoryRings: [],
      unlockedSkills: ['flame_slash', 'ember_bolt', 'ash_shield', 'leap_strike'],
      skillCD: { flame_slash: 0, ember_bolt: 0, ash_shield: 0, leap_strike: 0 },
      atk: 0,
      atkCD: 0,
      hitPending: 0,
      combo: 0,
      comboResetT: 0,
      roll: 0,
      rollX: 0,
      rollY: 0,
      parry: 0,
      parryCD: 0,
      shieldT: 0,
      iframes: 0,
      drink: 0,
      healPending: false,
      stDelay: 0,
      hurtT: 0,
      dead: false,
      deadT: 0,
      walkT: 0,
      moving: false,
      stepRippleT: 0,
    };
    p.hp = this.maxHp(p);
    p.mp = this.maxMp(p);
    p.st = this.maxSt(p);
    return p;
  }

  maxHp(p = this.player): number {
    const ring = p.ringId ? RINGS[p.ringId] : null;
    return 100 + (p.vig - 1) * 16 + (ring?.hpBonus ?? 0);
  }

  maxMp(p = this.player): number {
    const ring = p.ringId ? RINGS[p.ringId] : null;
    return 60 + (p.arc - 1) * 12 + (ring?.mpBonus ?? 0);
  }

  maxSt(p = this.player): number {
    const ring = p.ringId ? RINGS[p.ringId] : null;
    return 100 + (p.end - 1) * 12 + (ring?.stBonus ?? 0);
  }

  playerDmg(p = this.player): number {
    const w = WEAPONS[p.weaponId] || WEAPONS.iron_sword;
    const ring = p.ringId ? RINGS[p.ringId] : null;
    const base = 18 + (p.mig - 1) * 4.5 + p.weaponUpgrade * 4;
    const comboMult = p.combo === 2 ? 1.25 : p.combo === 1 ? 1.1 : 1.0;
    return base * w.dmgMult * comboMult * (1 + (ring?.dmgBonus ?? 0));
  }

  sigils(): number {
    return SIGIL_BOSSES.filter((b) => this.flags.bosses.has(b)).length;
  }

  computeQuest(): ActiveQuestSummary {
    return evaluateMainQuest({
      shrines: this.flags.shrines,
      bosses: this.flags.bosses,
      gateOpen: this.flags.gateOpen,
      victory: this.flags.victory,
      talkedMaren: this.flags.talkedMaren,
      landmarks: this.world.landmarks,
      playerX: this.player.x,
      playerY: this.player.y,
    });
  }

  activeOnboardingHint(): string | null {
    for (const h of ONBOARDING_HINTS) {
      if (!this.flags.onboardingDone.has(h.id)) return h.text;
    }
    return null;
  }

  markOnboarding(action: string): void {
    this.flags.onboardingDone.add(action);
  }

  // ------------------------------------------------------------ Particles & FX
  spawnP(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    ch: string | number,
    r: number,
    g: number,
    b: number,
    e: number,
    o?: { drag?: number; grav?: number; decal?: boolean; delay?: number; nofade?: boolean },
  ): void {
    const cap = Math.round(1400 * this.options.particlesDensity);
    if (this.particles.length >= cap) return;
    this.particles.push({
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      code: typeof ch === 'string' ? ch.charCodeAt(0) : ch,
      r,
      g,
      b,
      e,
      drag: o?.drag ?? 3,
      grav: o?.grav ?? 0,
      decal: o?.decal,
      delay: o?.delay ?? 0,
      fade: !o?.nofade,
    });
  }

  burst(
    x: number,
    y: number,
    n: number,
    col: readonly [number, number, number],
    spd: number,
    glyphs: string,
    o?: { e?: number; drag?: number; decal?: boolean },
  ): void {
    const count = Math.max(1, Math.round(n * this.options.particlesDensity));
    for (let k = 0; k < count; k++) {
      const a = rand(0, TAU);
      const s = rand(spd * 0.3, spd);
      this.spawnP(
        x,
        y,
        Math.cos(a) * s,
        (Math.sin(a) * s) / ASP,
        rand(0.25, 0.7),
        glyphs[(Math.random() * glyphs.length) | 0],
        col[0],
        col[1],
        col[2],
        o?.e ?? 0.25,
        o,
      );
    }
  }

  blood(x: number, y: number, col: readonly [number, number, number], n: number): void {
    this.burst(x, y, n, col, 18, ".,'`*:", { e: 0.2, decal: true, drag: 5 });
  }

  floater(x: number, y: number, text: string, color: string, life = 0.95, bold = false): void {
    this.floaters.push({ x, y, text, color, life, max: life, bold });
  }

  private slashGlyph(a: number): string {
    let t = a % Math.PI;
    if (t < 0) t += Math.PI;
    if (t < Math.PI / 8 || t > (7 * Math.PI) / 8) return '-';
    if (t < (3 * Math.PI) / 8) return '\\';
    if (t < (5 * Math.PI) / 8) return '|';
    return '/';
  }

  private spawnWeaponSwingVfx(): void {
    const p = this.player;
    const w = WEAPONS[p.weaponId] || WEAPONS.iron_sword;
    const base = Math.atan2(p.aimY, p.aimX);
    const dir = p.combo % 2 === 0 ? -1 : 1;
    const gc = w.glowColor;
    for (let k = 0; k <= 12; k++) {
      const a = base + dir * (k - 6) * 0.16;
      for (const r of [2.6, 3.8, w.range * 0.88]) {
        const x = p.x + Math.cos(a) * r;
        const y = p.y - PCY + (Math.sin(a) * r) / ASP;
        const c = r > 4.6 ? 0.7 : 1.0;
        this.spawnP(x, y, Math.cos(a) * 2, (Math.sin(a) * 2) / ASP, 0.16, this.slashGlyph(a + Math.PI / 2), gc[0] * c, gc[1] * c, gc[2] * c, 1, {
          delay: k * 0.01,
          drag: 2,
        });
      }
      // Glowing blade sparks
      if (k % 2 === 0) {
        const r = w.range * 0.85;
        this.spawnP(
          p.x + Math.cos(a) * r,
          p.y - PCY + (Math.sin(a) * r) / ASP,
          rand(-4, 4),
          rand(-4, 1),
          rand(0.25, 0.55),
          pick(['*', '.', "'"]),
          gc[0],
          gc[1],
          gc[2],
          1,
          { drag: 2.5 },
        );
      }
    }
  }

  // ------------------------------------------------------------ Movement
  private moveEnt(e: { x: number; y: number; float?: boolean }, dx: number, dy: number): boolean {
    const canStep = (nx: number, ny: number): boolean => {
      if (!this.world.isSolid(nx, ny, e.x, e.y)) return true;
      if (e.float) {
        const t = this.world.typeAt(nx, ny);
        return WATERY[t] === 1;
      }
      return false;
    };
    let moved = false;
    if (dx) {
      const nx = e.x + dx;
      if (canStep(nx, e.y)) {
        e.x = nx;
        moved = true;
      }
    }
    if (dy) {
      const ny = e.y + dy;
      if (canStep(e.x, ny)) {
        e.y = ny;
        moved = true;
      }
    }
    return moved;
  }

  private stepToward(e: EnemyEntity, tx: number, ty: number, spd: number, dt: number): boolean {
    const dx = tx - e.x;
    const dy = (ty - e.y) * ASP;
    const d = Math.hypot(dx, dy);
    if (d < 0.4) return false;
    const nx = dx / d;
    const ny = dy / d;
    const ok = this.moveEnt(e, nx * spd * dt, (ny * spd * dt) / ASP);
    if (!ok) this.moveEnt(e, -ny * spd * dt, (nx * spd * dt) / ASP);
    e.walkT += dt;
    if (Math.abs(nx) > 0.2) e.face = nx > 0 ? 1 : -1;
    return true;
  }

  // ------------------------------------------------------------ Combat
  hurtPlayer(rawDmg: number, sx: number, sy: number, attacker?: EnemyEntity): boolean {
    const p = this.player;
    if (p.dead || p.iframes > 0 || this.mode !== 'play') return false;

    // Parry window check!
    if (p.parry > 0) {
      p.parry = 0;
      p.iframes = 0.45;
      p.st = Math.min(this.maxSt(), p.st + 25);
      p.mp = Math.min(this.maxMp(), p.mp + 15);
      this.audio.parry();
      this.hitstop = 0.08;
      this.camera.addShake(0.35, this.options);
      this.burst(p.x, p.y - PCY, 26, [0.95, 0.95, 1.0], 18, "*+'", { e: 1 });
      this.floater(p.x, p.y - 5, 'PARIERT!', '#9de8ff', 1.1, true);
      if (attacker && !attacker.dead) {
        attacker.poise = 0;
        attacker.state = 'stagger';
        attacker.staggerT = 2.0;
        attacker.st = 2.0;
        this.audio.stagger();
        this.floater(attacker.x, attacker.y - 5, 'GEBROCHEN', '#ffd26a', 1.2, true);
      }
      return false;
    }

    const armor = ARMORS[p.armorId] || ARMORS.wanderer_plate;
    let dmg = rawDmg * (1 - armor.defense);
    if (p.shieldT > 0) {
      dmg *= 0.45;
      this.burst(p.x, p.y - PCY, 12, [0.6, 0.85, 1.0], 12, "*'", { e: 1 });
    }
    p.hp -= dmg;
    p.hurtT = 0.35;
    p.iframes = 0.5;
    p.drink = 0;
    p.healPending = false;
    const dx = p.x - sx;
    const dy = (p.y - sy) * ASP;
    const d = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 5; k++) this.moveEnt(p, (dx / d) * 0.32, ((dy / d) * 0.32) / ASP);
    this.camera.addShake(0.38, this.options);
    this.audio.hurt();
    this.blood(p.x, p.y - PCY, [0.65, 0.05, 0.05], 14);
    this.floater(p.x, p.y - 5, '-' + Math.round(dmg), '#ff5f57', 0.95, true);
    this.ui?.hurtFlash();
    if (p.hp <= 0) this.killPlayer();
    return true;
  }

  killPlayer(): void {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.deadT = 0;
    this.lockedTarget = null;
    this.blood(p.x, p.y - PCY, [0.65, 0.05, 0.05], 36);
    this.burst(p.x, p.y - PCY, 28, [1, 0.6, 0.2], 14, "*'.", { e: 1 });
    this.audio.death();
    if (p.embers > 0) this.lost = { x: p.x, y: p.y, amount: p.embers };
    else this.lost = null;
    p.embers = 0;
    this.boss = null;
    this.ui?.death(true);
  }

  damageEnemy(
    e: EnemyEntity,
    dmg: number,
    nx: number,
    ny: number,
    poiseDmg = 20,
    status?: { kind: 'burn' | 'bleed'; dps: number; dur: number },
  ): void {
    const critMult = e.state === 'stagger' ? 1.5 : 1.0;
    const finalDmg = dmg * critMult;
    e.hp -= finalDmg;
    e.flash = 0.14;

    if (status) {
      const existing = e.statuses.find((s) => s.kind === status.kind);
      if (existing) {
        existing.timer = Math.max(existing.timer, status.dur);
        existing.dps = Math.max(existing.dps, status.dps);
      } else {
        e.statuses.push({ kind: status.kind, timer: status.dur, tickTimer: 0.5, dps: status.dps });
      }
    }

    // Poise & stagger
    if (e.state !== 'stagger') {
      e.poise -= poiseDmg;
      if (e.poise <= 0) {
        e.poise = e.maxPoise;
        e.state = 'stagger';
        e.staggerT = e.boss ? 1.6 : 2.0;
        e.st = e.staggerT;
        this.audio.stagger();
        this.floater(e.x, e.y - 6, 'TAUMELN!', '#ffd97a', 1.0, true);
      }
    }

    this.floater(
      e.x + rand(-0.8, 0.8),
      e.y - 4.5,
      critMult > 1 ? `${Math.round(finalDmg)}!` : `${Math.round(finalDmg)}`,
      critMult > 1 ? '#ffe078' : '#f4e6c8',
      0.95,
      critMult > 1,
    );
    this.blood(e.x, e.y - 2, e.d.blood, e.boss ? 10 : 8);

    if (!e.boss) {
      e.kbx = nx * 14;
      e.kby = (ny * 14) / ASP;
      if (e.state !== 'attack' && e.state !== 'stagger') {
        e.state = 'hurt';
        e.st = 0.22;
      }
    }
    if (e.state === 'idle' || e.state === 'return') {
      e.state = 'chase';
      if (e.boss) this.engageBoss(e);
    }
    if (e.boss && e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2;
      this.floater(e.x, e.y - 7, 'PHASE II · ZORN', '#ff5247', 1.8, true);
      this.burst(e.x, e.y - 3, 36, e.d.proj, 22, "*+'.", { e: 1 });
      this.audio.boom();
      this.camera.addShake(0.55, this.options);
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  grantXp(amount: number): void {
    const p = this.player;
    const ring = p.ringId ? RINGS[p.ringId] : null;
    const gained = Math.round(amount * (ring?.xpMult ?? 1));
    p.xp += gained;
    let leveled = false;
    while (p.xp >= xpForNextLevel(p.lvl)) {
      p.xp -= xpForNextLevel(p.lvl);
      p.lvl++;
      p.attrPoints += 2;
      p.hp = this.maxHp();
      p.mp = this.maxMp();
      p.st = this.maxSt();
      leveled = true;
    }
    if (leveled) {
      this.audio.levelUp();
      this.burst(p.x, p.y - PCY, 32, [1.0, 0.85, 0.35], 16, "*+'", { e: 1 });
      this.floater(p.x, p.y - 7, `STUFE ${p.lvl}!`, '#ffd978', 1.8, true);
      this.ui?.banner(`STUFE ${p.lvl} ERREICHT`, '+2 Attributpunkte am Schrein oder im Inventar [I] verteilen', 'gold', 3.5);
    }
  }

  private killEnemy(e: EnemyEntity): void {
    e.dead = true;
    const p = this.player;
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    if (this.lockedTarget === e) this.lockedTarget = null;
    if (e.id && !e.boss) this.killed.add(e.id);
    this.bestiary[e.type] = (this.bestiary[e.type] || 0) + 1;

    this.blood(e.x, e.y - 2, e.d.blood, e.boss ? 50 : 18);
    this.burst(e.x, e.y - 2, e.boss ? 48 : 10, [1.0, 0.7, 0.28], 12, "*'.", { e: 1 });

    const emberGain = Math.round(e.minion ? e.d.embers * 0.3 : e.d.embers);
    const xpGain = Math.round(e.minion ? e.d.xp * 0.3 : e.d.xp);
    p.embers += emberGain;
    this.grantXp(xpGain);
    this.floater(e.x, e.y - 5.5, `+${emberGain} Glut · +${xpGain} XP`, '#ffc970', 1.4);

    if (e.boss) {
      this.flags.bosses.add(e.type);
      this.boss = null;
      p.maxFlasks = 3 + this.flags.bosses.size;
      p.flasks = p.maxFlasks;
      this.enemies
        .filter((m) => m.minion)
        .forEach((m) => {
          m.hp = 0;
          this.killEnemy(m);
        });
      this.audio.boom();
      this.audio.chime();
      this.camera.addShake(0.75, this.options);
      if (e.d.final) {
        this.flags.victory = true;
        this.audio.victory();
        this.ui?.banner('DIE DÄMMERUNG ZERBRICHT', 'Zum ersten Mal seit einer Ewigkeit geht über Duskvale die Sonne auf.', 'gold', 8);
      } else {
        const label = e.d.sigil === 'Flut' ? 'DER FLUT' : e.d.sigil === 'Asche' ? 'DER ASCHE' : 'DES KNOCHENS';
        this.ui?.banner(`SIEGEL ${label} ERRUNGEN`, `${e.d.name} ist gefallen. (${this.sigils()}/3 Siegel)`, 'gold', 5.5);
      }
      this.save();
    }
  }

  private strike(): void {
    const p = this.player;
    const w = WEAPONS[p.weaponId] || WEAPONS.iron_sword;
    const pElev = this.world.elevAt(p.x, p.y);
    let hits = 0;

    for (const e of this.enemies.slice()) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = (e.y - p.y) * ASP;
      const d = Math.hypot(dx, dy);
      if (d > w.range + e.rad) continue;
      const dot = d < 0.9 ? 1 : (dx * p.aimX + dy * p.aimY) / d;
      if (dot < w.arcDot) continue;

      const eElev = this.world.elevAt(e.x, e.y);
      const highGround = pElev > eElev ? 1.25 : 1.0;
      const status = w.burn
        ? { kind: 'burn' as const, dps: w.burn, dur: 4 }
        : w.bleed
          ? { kind: 'bleed' as const, dps: w.bleed, dur: 4 }
          : undefined;
      this.damageEnemy(e, this.playerDmg() * highGround * rand(0.92, 1.1), dx / (d || 1), dy / (d || 1), w.poiseDmg, status);
      hits++;
    }
    if (hits > 0) {
      this.hitstop = 0.055;
      this.audio.hit();
      if (p.combo === 2 || w.kind === 'greatsword') this.camera.addShake(0.22, this.options);
    }
  }

  useSkill(slot: number): void {
    const p = this.player;
    if (p.dead || p.roll > 0 || p.drink > 0) return;
    if (slot === 5) {
      // Flask slot on hotbar
      this.tryDrinkFlask();
      return;
    }
    const skill = Object.values(SKILLS).find((s) => s.slot === slot);
    if (!skill || !p.unlockedSkills.includes(skill.id)) return;
    if (p.skillCD[skill.id] > 0) return;
    if (p.mp < skill.manaCost) {
      this.floater(p.x, p.y - 5, 'Zu wenig Mana', '#88a8ff', 0.9);
      return;
    }

    p.mp -= skill.manaCost;
    p.skillCD[skill.id] = skill.cooldown;
    this.markOnboarding('skill');
    this.audio.skill();

    const pElev = this.world.elevAt(p.x, p.y);

    switch (skill.id) {
      case 'flame_slash': {
        const base = Math.atan2(p.aimY, p.aimX);
        this.telegraphs.push({
          kind: 'cone',
          x: p.x,
          y: p.y,
          rad: 9.5,
          angle: base,
          arc: 0.9,
          life: 0.25,
          max: 0.25,
          col: [1.0, 0.5, 0.15],
        });
        for (let k = 0; k < 28; k++) {
          const a = base + rand(-0.45, 0.45);
          const spd = rand(14, 28);
          this.spawnP(p.x, p.y - 1.5, Math.cos(a) * spd, (Math.sin(a) * spd) / ASP, rand(0.25, 0.5), pick(['*', '^', '#']), 1.0, 0.52, 0.14, 1, { drag: 2.5 });
        }
        for (const e of this.enemies.slice()) {
          if (e.dead) continue;
          const dx = e.x - p.x;
          const dy = (e.y - p.y) * ASP;
          const d = Math.hypot(dx, dy);
          if (d > 10 + e.rad) continue;
          const dot = d < 0.8 ? 1 : (dx * p.aimX + dy * p.aimY) / d;
          if (dot < 0.45) continue;
          this.damageEnemy(e, this.playerDmg() * 1.45, dx / (d || 1), dy / (d || 1), 35, { kind: 'burn', dps: 10, dur: 5 });
        }
        this.camera.addShake(0.28, this.options);
        break;
      }
      case 'ember_bolt': {
        const a = Math.atan2(p.aimY, p.aimX);
        const speed = 34;
        this.projectiles.push({
          x: p.x + Math.cos(a) * 1.2,
          y: p.y - 1.5 + (Math.sin(a) * 1.2) / ASP,
          vx: Math.cos(a) * speed,
          vy: (Math.sin(a) * speed) / ASP,
          dmg: this.playerDmg() * 1.15,
          life: 2.2,
          col: [1.0, 0.72, 0.28],
          fromPlayer: true,
          elev: pElev,
        });
        break;
      }
      case 'ash_shield': {
        p.shieldT = 3.5;
        this.burst(p.x, p.y - PCY, 24, [0.55, 0.82, 1.0], 12, "*.'", { e: 1 });
        this.floater(p.x, p.y - 5.5, 'ASCHESCHILD', '#8cc8ff', 1.1);
        break;
      }
      case 'leap_strike': {
        for (let k = 0; k < 10; k++) {
          this.moveEnt(p, p.aimX * 0.75, (p.aimY * 0.75) / ASP);
        }
        this.burst(p.x, p.y, 34, [1.0, 0.42, 0.2], 22, "*#%", { e: 1 });
        this.audio.boom();
        this.camera.addShake(0.45, this.options);
        for (const e of this.enemies.slice()) {
          if (e.dead) continue;
          const d = dist(e.x - p.x, e.y - p.y);
          if (d < 8.5 + e.rad) {
            const dx = e.x - p.x;
            const dy = (e.y - p.y) * ASP;
            const len = Math.hypot(dx, dy) || 1;
            this.damageEnemy(e, this.playerDmg() * 1.65, dx / len, dy / len, 65);
          }
        }
        break;
      }
    }
  }

  private tryDrinkFlask(): void {
    const p = this.player;
    if (p.drink > 0 || p.roll > 0) return;
    if (p.flasks > 0) {
      p.drink = 0.85;
      p.flasks--;
      p.healPending = true;
      this.audio.drink();
    } else {
      this.floater(p.x, p.y - 5, 'Flakons leer', '#b5a894', 1.0);
    }
  }

  toggleLockOn(): void {
    const p = this.player;
    if (this.lockedTarget && !this.lockedTarget.dead && dist(this.lockedTarget.x - p.x, this.lockedTarget.y - p.y) < 36) {
      this.lockedTarget = null;
      return;
    }
    let best: EnemyEntity | null = null;
    let bestD = 34;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(e.x - p.x, e.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.lockedTarget = best;
  }

  // ------------------------------------------------------------ Enemy AI
  private createEnemy(type: string, x: number, y: number, id: string, ck: string): EnemyEntity {
    const d = ENEMY_DEFS[type] || ENEMY_DEFS.ghoul;
    return {
      id,
      type,
      d,
      x,
      y,
      prevX: x,
      prevY: y,
      hx: x,
      hy: y,
      ck,
      hp: d.hp,
      maxHp: d.hp,
      poise: d.poise,
      maxPoise: d.poise,
      staggerT: 0,
      state: 'idle',
      st: rand(0, 2),
      face: 1,
      flash: 0,
      ax: 1,
      ay: 0,
      cd: rand(0.5, 1.5),
      walkT: rand(0, 1),
      kbx: 0,
      kby: 0,
      hitDone: false,
      atk: null,
      phase: 1,
      dead: false,
      tx: x,
      ty: y,
      lv: 0,
      float: !!d.float,
      boss: !!d.boss,
      minion: false,
      rad: d.boss ? 2.5 : 1.1,
      statuses: [],
    };
  }

  private fireEnemyProj(e: EnemyEntity, angle: number, speed: number, dmg: number): void {
    this.projectiles.push({
      x: e.x,
      y: e.y - 2,
      vx: Math.cos(angle) * speed,
      vy: (Math.sin(angle) * speed) / ASP,
      dmg,
      life: 3.4,
      col: e.d.proj,
      fromPlayer: false,
    });
  }

  private aimAtPlayer(e: EnemyEntity): number {
    return Math.atan2((this.player.y - e.y) * ASP, this.player.x - e.x);
  }

  private startWindup(e: EnemyEntity, kind: string): void {
    const p = this.player;
    const BOSS_WIND: Record<string, number> = { swing: 0.55, slam: 1.0, charge: 0.65, volley: 0.75, summon: 0.9, blink: 0.35 };
    e.atk = kind;
    e.state = 'windup';
    const pf = e.phase === 2 ? 0.75 : 1;
    e.st = (e.boss ? BOSS_WIND[kind] ?? 0.6 : e.d.windup) * pf;
    const dx = p.x - e.x;
    const dy = (p.y - e.y) * ASP;
    const d = Math.hypot(dx, dy) || 1;
    e.ax = dx / d;
    e.ay = dy / d;
    e.face = dx >= 0 ? 1 : -1;

    if (kind === 'slam') {
      this.telegraphs.push({ kind: 'circle', x: e.x, y: e.y, rad: 9.5, life: e.st, max: e.st, col: e.d.proj });
    } else if (kind === 'swing' || kind === 'melee') {
      this.telegraphs.push({
        kind: 'cone',
        x: e.x,
        y: e.y,
        rad: e.d.range + 1.2,
        angle: Math.atan2(e.ay, e.ax),
        arc: 1.05,
        life: e.st,
        max: e.st,
        col: [1.0, 0.28, 0.22],
      });
    }
  }

  private beginAttack(e: EnemyEntity): void {
    const p = this.player;
    const d = e.d;
    e.state = 'attack';
    e.hitDone = false;
    switch (e.atk) {
      case 'melee':
      case 'swing':
        e.st = 0.24;
        e.lv = d.lunge;
        if (e.boss) this.audio.swing();
        break;
      case 'bolt':
        this.fireEnemyProj(e, this.aimAtPlayer(e), 22, d.dmg);
        e.st = 0.2;
        this.audio.cast();
        break;
      case 'slam': {
        e.st = 0.35;
        if (dist(p.x - e.x, p.y - e.y) < 9.5) this.hurtPlayer(d.dmg * 1.3, e.x, e.y, e);
        for (let k = 0; k < 40; k++) {
          const a = (k / 40) * TAU;
          this.spawnP(
            e.x + Math.cos(a) * 1.5,
            e.y + (Math.sin(a) * 1.5) / ASP,
            Math.cos(a) * 28,
            (Math.sin(a) * 28) / ASP,
            0.35,
            pick(['*', '#', '%']),
            d.proj[0],
            d.proj[1],
            d.proj[2],
            1,
            { drag: 2 },
          );
        }
        this.audio.boom();
        this.camera.addShake(0.55, this.options);
        break;
      }
      case 'charge':
        e.st = 0.5;
        e.lv = 40;
        this.audio.swing();
        break;
      case 'volley': {
        const n = e.phase === 2 ? (d.final ? 14 : 8) : d.final ? 9 : 5;
        if (d.final && e.phase === 2) {
          for (let k = 0; k < n; k++) this.fireEnemyProj(e, (k / n) * TAU + this.t, 16, d.dmg * 0.6);
        } else {
          const base = this.aimAtPlayer(e);
          for (let k = 0; k < n; k++) this.fireEnemyProj(e, base + (k - (n - 1) / 2) * 0.16, 18, d.dmg * 0.6);
        }
        e.st = 0.3;
        this.audio.cast();
        break;
      }
      case 'summon': {
        const cnt = this.enemies.filter((m) => m.minion).length;
        for (let k = 0; k < 2 && cnt + k < 4; k++) {
          for (let tries = 0; tries < 8; tries++) {
            const mx = e.x + rand(-8, 8);
            const my = e.y + rand(-4, 4);
            if (this.world.isSolid(mx, my)) continue;
            const m = this.createEnemy(d.minion || 'skeleton', mx, my, `minion@${this.t}#${k}`, e.ck);
            m.minion = true;
            m.state = 'chase';
            m.hx = e.hx;
            m.hy = e.hy;
            this.enemies.push(m);
            this.burst(mx, my - 1, 14, d.proj, 10, "*'.", { e: 1 });
            break;
          }
        }
        e.st = 0.4;
        this.audio.cast();
        break;
      }
      case 'blink': {
        this.burst(e.x, e.y - 2, 24, d.proj, 15, "*'.:", { e: 1 });
        for (let tries = 0; tries < 12; tries++) {
          const a = rand(0, TAU);
          const nx = p.x + Math.cos(a) * 8.5;
          const ny = p.y + (Math.sin(a) * 8.5) / ASP;
          if (!this.world.isSolid(nx, ny) && dist(nx - e.hx, ny - e.hy) < 50) {
            e.x = nx;
            e.y = ny;
            break;
          }
        }
        this.burst(e.x, e.y - 2, 24, d.proj, 15, "*'.:", { e: 1 });
        this.startWindup(e, 'swing');
        e.st *= 0.8;
        return;
      }
    }
  }

  private updateEnemy(e: EnemyEntity, dt: number): void {
    e.prevX = e.x;
    e.prevY = e.y;
    const p = this.player;
    const d = e.d;
    e.flash = Math.max(0, e.flash - dt);
    e.st -= dt;
    e.cd -= dt;

    // Status effects (Burn & Bleed)
    for (let i = e.statuses.length - 1; i >= 0; i--) {
      const s = e.statuses[i];
      s.timer -= dt;
      s.tickTimer -= dt;
      if (s.tickTimer <= 0) {
        s.tickTimer = 0.5;
        const tickDmg = s.dps * 0.5;
        e.hp -= tickDmg;
        this.floater(
          e.x + rand(-0.6, 0.6),
          e.y - 4.2,
          `${Math.round(tickDmg)}`,
          s.kind === 'burn' ? '#ff9640' : '#ff4d6d',
          0.7,
        );
        this.spawnP(
          e.x,
          e.y - 2,
          rand(-2, 2),
          -3,
          0.4,
          s.kind === 'burn' ? '^' : '.',
          s.kind === 'burn' ? 1 : 0.9,
          s.kind === 'burn' ? 0.45 : 0.1,
          0.12,
          0.9,
        );
        if (e.hp <= 0) {
          this.killEnemy(e);
          return;
        }
      }
      if (s.timer <= 0) e.statuses.splice(i, 1);
    }

    if (e.kbx || e.kby) {
      this.moveEnt(e, e.kbx * dt, e.kby * dt);
      const k = Math.exp(-10 * dt);
      e.kbx *= k;
      e.kby *= k;
      if (Math.abs(e.kbx) < 0.3 && Math.abs(e.kby) < 0.3) e.kbx = e.kby = 0;
    }

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dd = dist(dx, dy);
    const alive = !p.dead && this.mode === 'play';
    const home = dist(e.x - e.hx, e.y - e.hy);

    switch (e.state) {
      case 'idle':
        if (e.st <= 0) {
          e.tx = e.hx + rand(-6, 6);
          e.ty = e.hy + rand(-3, 3);
          e.st = rand(2, 5);
        }
        if (!e.boss) this.stepToward(e, e.tx, e.ty, d.spd * 0.3, dt);
        if (alive && dd < d.aggro) {
          e.state = 'chase';
          e.st = 0;
          if (e.boss) this.engageBoss(e);
          else {
            this.floater(e.x, e.y - 4.5, '!', '#ffd566', 0.55, true);
            this.audio.alert();
          }
        }
        break;
      case 'chase':
        if (!alive || (!e.minion && home > (e.boss ? 55 : 75))) {
          e.state = 'return';
          if (this.boss === e) this.boss = null;
          break;
        }
        if (Math.abs(dx) > 0.5) e.face = dx > 0 ? 1 : -1;
        if (e.boss && d.attacks) {
          if (e.cd <= 0 && dd < 32) {
            const opts = d.attacks.filter((a) => {
              if (a === 'swing') return dd < 11;
              if (a === 'slam') return dd < 12;
              if (a === 'charge') return dd > 7;
              if (a === 'summon') return this.enemies.filter((m) => m.minion).length < 3;
              return true;
            });
            if (opts.length) {
              this.startWindup(e, pick(opts));
              break;
            }
          }
          if (dd > d.range * 0.7) this.stepToward(e, p.x, p.y, d.spd, dt);
        } else if (d.ranged && dd < d.ranged && dd > 5 && e.cd <= 0) {
          this.startWindup(e, 'bolt');
        } else if (dd < d.range && e.cd <= 0) {
          this.startWindup(e, 'melee');
        } else if (d.ranged && dd < d.ranged * 0.5) {
          this.stepToward(e, e.x - dx, e.y - dy, d.spd * 0.6, dt);
        } else if (dd > d.range * 0.7) {
          this.stepToward(e, p.x, p.y, d.spd, dt);
        }
        break;
      case 'windup':
        if (e.atk !== 'charge' && Math.abs(dx) > 0.5) e.face = dx > 0 ? 1 : -1;
        if (e.st <= 0) this.beginAttack(e);
        break;
      case 'attack': {
        if (e.atk === 'melee' || e.atk === 'swing' || e.atk === 'charge') {
          if (e.lv > 0) {
            this.moveEnt(e, e.ax * e.lv * dt, (e.ay * e.lv * dt) / ASP);
            e.lv *= Math.exp(-(e.atk === 'charge' ? 1 : 8) * dt);
          }
          if (!e.hitDone) {
            const adx = p.x - e.x;
            const ady = (p.y - e.y) * ASP;
            const add = Math.hypot(adx, ady) || 1;
            const reach = e.atk === 'charge' ? 4 : d.range + 0.6;
            const front = (adx * e.ax + ady * e.ay) / add;
            if (add < reach && (front > 0.1 || add < 2.2)) {
              e.hitDone = true;
              this.hurtPlayer(e.atk === 'charge' ? d.dmg * 1.1 : d.dmg, e.x, e.y, e);
            }
          }
        }
        if (e.st <= 0) {
          e.state = 'recover';
          const pf = e.phase === 2 ? 0.68 : 1;
          e.st = d.recover * pf;
          e.cd = e.boss ? rand(0.35, 1.0) * pf : d.ranged ? rand(1.8, 3) : rand(0.35, 0.9);
        }
        break;
      }
      case 'recover':
      case 'hurt':
        if (e.st <= 0) e.state = 'chase';
        break;
      case 'stagger':
        e.staggerT = Math.max(0, e.staggerT - dt);
        if (e.st <= 0) e.state = 'chase';
        break;
      case 'return':
        this.stepToward(e, e.hx, e.hy, d.spd * 0.8, dt);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt);
        if (home < 2) {
          e.state = 'idle';
          e.phase = 1;
        } else if (alive && dd < d.aggro * 0.6 && home < 30) {
          e.state = 'chase';
        }
        break;
    }
  }

  engageBoss(e: EnemyEntity): void {
    if (this.boss !== e) {
      this.boss = e;
      this.ui?.banner(e.d.name.toUpperCase(), 'Bosskampf', 'blood', 3.2);
      this.audio.boom();
    }
  }

  // ------------------------------------------------------------ Spawning
  private roamType(t: number, bi: BiomeId): string | null {
    if (bi === BIOMES.ash) return pick(['skeleton', 'specter', 'wolf']);
    if (bi === BIOMES.plaza) return pick(['wraith', 'specter']);
    if (bi === BIOMES.swamp) return pick(['bogwitch', 'wraith']);
    switch (t) {
      case T.FOREST:
        return 'wolf';
      case T.MARSH:
      case T.SHALLOW:
        return 'wraith';
      case T.MOOR:
        return pick(['ghoul', 'skeleton']);
      case T.GRASS:
        return pick(['ghoul', 'wolf']);
      case T.ROCK:
        return 'wolf';
      default:
        return null;
    }
  }

  private spawnChunk(cx: number, cy: number): void {
    const c = this.world.chunk(cx, cy);
    const key = `${cx},${cy}`;
    for (const f of c.feats) {
      if (f.kind === 'spawn') {
        if (!this.killed.has(f.id)) this.enemies.push(this.createEnemy(f.enemy || 'ghoul', f.x + 0.5, f.y + 0.5, f.id, key));
      } else if (f.kind === 'boss') {
        if (f.boss && !this.flags.bosses.has(f.boss) && !this.enemies.some((e) => e.type === f.boss)) {
          this.enemies.push(this.createEnemy(f.boss, f.x + 0.5, f.y + 0.5, f.id, key));
        }
      } else if (f.kind === 'npc') {
        if (!this.npcs.some((n) => n.id === f.id)) {
          const kind = (f.npc || 'pilgrim') as NpcEntity['kind'];
          const name =
            kind === 'maren'
              ? 'Maren, Hüterin der Glut'
              : kind === 'smith'
                ? 'Bran, Glutschmied'
                : kind === 'merchant'
                  ? 'Sera, Händlerin'
                  : 'Pilger';
          this.npcs.push({ id: f.id, kind, x: f.x + 0.5, y: f.y + 0.5, face: -1, talks: 0, name });
        }
      }
    }
    const x0 = cx * 32;
    const y0 = cy * 32;
    if (dist(x0 + 16, y0 + 16) < 46) return;
    if (hash(cx, cy, 555) > 0.42) return;
    const tp = this.world.typeAt(x0 + 16, y0 + 16);
    const type = this.roamType(tp, this.world.biomeAt(x0 + 16, y0 + 16));
    if (!type) return;
    const n = type === 'wolf' ? 2 + Math.floor(hash(cx, cy, 556) * 2) : 1 + Math.floor(hash(cx, cy, 557) * 1.6);
    for (let k = 0; k < n; k++) {
      const id = `roam@${key}#${k}`;
      if (this.killed.has(id)) continue;
      for (let tries = 0; tries < 12; tries++) {
        const x = x0 + 4 + hash(cx * 7 + k, cy * 13 + tries, 558) * 24;
        const y = y0 + 4 + hash(cx * 11 + k, cy * 5 + tries, 559) * 24;
        if (this.world.isSolid(x, y) || (type !== 'wraith' && WATERY[this.world.typeAt(x, y)])) continue;
        this.enemies.push(this.createEnemy(type, x, y, id, key));
        break;
      }
    }
  }

  private updateSpawns(): void {
    const p = this.player;
    const x0 = Math.floor(p.x - 80) >> 5;
    const x1 = Math.floor(p.x + 80) >> 5;
    const y0 = Math.floor(p.y - 48) >> 5;
    const y1 = Math.floor(p.y + 48) >> 5;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = `${cx},${cy}`;
        if (!this.spawned.has(k)) {
          this.spawned.add(k);
          this.spawnChunk(cx, cy);
        }
      }
    }
    for (const k of Array.from(this.spawned)) {
      const [cx, cy] = k.split(',').map(Number);
      if (dist(cx * 32 + 16 - p.x, cy * 32 + 16 - p.y) > 260) {
        this.spawned.delete(k);
        this.enemies = this.enemies.filter((e) => e.ck !== k || e === this.boss);
      }
    }
  }

  resetWorldEnemies(): void {
    this.enemies = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.killed.clear();
    this.spawned.clear();
    this.boss = null;
    this.lockedTarget = null;
  }

  // ------------------------------------------------------------ Interaction
  findInteract(): InteractTarget | null {
    const p = this.player;
    if (p.dead) return null;
    for (const n of this.npcs) {
      if (dist(n.x - p.x, n.y - p.y) < 5.2) return { kind: 'npc', n, label: `Sprechen mit ${n.name}` };
    }
    const feats = this.world.featuresNear(p.x, p.y, 7);
    let best: WorldFeature | null = null;
    let bd = 1e9;
    for (const f of feats) {
      const d = dist(f.x + 0.5 - p.x, f.y + 0.5 - p.y);
      const lim = f.kind === 'gate' ? 7 : 5.0;
      if (d > lim || d >= bd) continue;
      if (
        f.kind === 'shrine' ||
        f.kind === 'lore' ||
        f.kind === 'signpost' ||
        f.kind === 'cave' ||
        (f.kind === 'chest' && !this.flags.chests.has(f.id)) ||
        (f.kind === 'gate' && !this.flags.gateOpen)
      ) {
        best = f;
        bd = d;
      }
    }
    if (!best) return null;
    switch (best.kind) {
      case 'shrine':
        return { kind: 'shrine', f: best, label: this.flags.shrines.has(best.id) ? 'Am Schrein rasten' : 'Schrein entzünden' };
      case 'lore':
        return { kind: 'lore', f: best, label: 'Stele lesen' };
      case 'signpost':
        return { kind: 'signpost', f: best, label: 'Wegweiser lesen' };
      case 'chest':
        return { kind: 'chest', f: best, label: 'Truhe öffnen' };
      case 'cave':
        return { kind: 'cave', f: best, label: 'Höhle durchsuchen' };
      default:
        return { kind: 'gate', f: best, label: 'Das Siegeltor berühren' };
    }
  }

  interactNow(): void {
    const it = this.interact;
    if (!it) return;
    this.markOnboarding('interact');

    if (it.kind === 'npc' && it.n) {
      const n = it.n;
      if (n.kind === 'smith') {
        this.ui.smithMenu();
        return;
      }
      if (n.kind === 'merchant') {
        this.ui.merchantMenu();
        return;
      }
      if (n.kind === 'maren') {
        this.flags.talkedMaren = true;
        // Reveal main landmarks as "?" silhouettes on Map 2.0
        ['barrow', 'chapel', 'keep', 'cathedral', 'lakecastle'].forEach((id) => this.flags.knownLandmarks.add(id));
        const lines = this.flags.victory
          ? ['Das Licht… ich hatte vergessen, wie warm es ist. Danke, Wanderer.']
          : MAREN_DIALOGS[Math.min(n.talks, MAREN_DIALOGS.length - 1)].slice();
        if (n.talks > 0 && !this.flags.victory) lines.push(`Du trägst ${this.sigils()} von 3 Siegeln.`);
        n.talks++;
        this.ui.dialog(n.name, lines);
        this.save();
        return;
      }
      n.talks++;
      this.ui.dialog(n.name, ['Die alten Straßen und Wegweiser führen dich sicher durch den Nebel.']);
    } else if (it.kind === 'lore' && it.f) {
      const f = it.f;
      const pool = LORE_TEXTS[f.struct || ''] || LORE_TEXTS.generic;
      const text = pool[Math.floor(hash(f.x, f.y, 3) * pool.length)];
      if (!this.flags.lore.has(f.id)) {
        this.flags.lore.add(f.id);
        this.loreLog.push({ title: `Stele (${f.struct || 'Wildnis'})`, text });
        this.grantXp(25);
      }
      this.ui.dialog('Verwitterte Stele', [text]);
    } else if (it.kind === 'signpost' && it.f) {
      this.ui.dialog('Wegweiser', [it.f.text || 'Alte Reichsstraße']);
    } else if (it.kind === 'chest' && it.f) {
      this.flags.chests.add(it.f.id);
      const reward = 140 + Math.floor(hash(it.f.x, it.f.y, 19) * 140);
      this.player.embers += reward;
      this.grantXp(45);
      this.audio.pickup();
      this.burst(it.f.x + 0.5, it.f.y, 24, [1.0, 0.8, 0.3], 12, "*+'", { e: 1 });
      this.floater(it.f.x + 0.5, it.f.y - 3, `+${reward} Glut`, '#ffd56a', 1.5, true);
      this.save();
    } else if (it.kind === 'cave' && it.f) {
      if (!this.flags.chests.has(it.f.id)) {
        this.flags.chests.add(it.f.id);
        this.player.embers += 220;
        this.grantXp(90);
        this.audio.chime();
        this.ui.dialog('Schattenhöhle', ['Du steigst in die feuchte Kluft hinab und birgst alte Glutreste (+220 Glut, +90 XP).']);
        this.save();
      } else {
        this.ui.dialog('Schattenhöhle', ['Die Höhle wurde bereits geplündert. Nur kaltes Tropfen hallt darin.']);
      }
    } else if (it.kind === 'gate') {
      if (this.sigils() >= 3) {
        this.flags.gateOpen = true;
        this.world.setGateOpen(true);
        this.audio.boom();
        this.audio.chime();
        this.camera.addShake(0.7, this.options);
        if (!this.options.reduceFlashes) this.flash = 0.8;
        this.ui.banner('DAS TOR ÖFFNET SICH', 'Knochen, Flut und Asche brennen im Stein.', 'gold', 5);
        this.save();
      } else {
        this.ui.dialog('Das Siegeltor', ['Drei leere Mulden im schwarzen Eisen. Das Tor rührt sich nicht.', `Siegel: ${this.sigils()} / 3`]);
      }
    } else if (it.kind === 'shrine' && it.f) {
      const f = it.f;
      if (!this.flags.shrines.has(f.id)) {
        this.flags.shrines.add(f.id);
        const L = this.world.landmarkAt(f.x, f.y);
        this.shrineInfo[f.id] = { x: f.x, y: f.y, name: f.name || (L ? L.name : 'Wegschrein') };
        this.audio.chime();
        this.burst(f.x + 0.5, f.y - 2, 42, [1, 0.72, 0.3], 16, "*'.^", { e: 1 });
        this.ui.banner('SCHREIN ENTZÜNDET', this.shrineInfo[f.id].name, 'gold', 3.5);
      }
      this.rest(f);
      this.ui.shrineMenu(f);
    }
  }

  rest(f: WorldFeature): void {
    const p = this.player;
    p.hp = this.maxHp();
    p.mp = this.maxMp();
    p.st = this.maxSt();
    p.flasks = p.maxFlasks;
    this.lastShrine = { x: f.x + 0.5, y: f.y + 2.5, id: f.id };
    this.resetWorldEnemies();
    this.save();
  }

  spendAttrPoint(stat: 'vig' | 'mig' | 'end' | 'arc'): boolean {
    const p = this.player;
    if (p.attrPoints <= 0) return false;
    p.attrPoints--;
    p[stat]++;
    p.hp = this.maxHp();
    p.mp = this.maxMp();
    p.st = this.maxSt();
    this.audio.pickup();
    this.save();
    return true;
  }

  upgradeWeapon(): boolean {
    const p = this.player;
    const cost = weaponUpgradeCost(p.weaponUpgrade);
    if (p.embers < cost || p.weaponUpgrade >= 5) return false;
    p.embers -= cost;
    p.weaponUpgrade++;
    this.audio.chime();
    this.save();
    return true;
  }

  buyItem(kind: 'weapon' | 'armor' | 'ring', id: string): boolean {
    const p = this.player;
    if (kind === 'weapon') {
      const item = WEAPONS[id];
      if (!item || p.inventoryWeapons.includes(id) || p.embers < item.price) return false;
      p.embers -= item.price;
      p.inventoryWeapons.push(id);
      p.weaponId = id;
    } else if (kind === 'armor') {
      const item = ARMORS[id];
      if (!item || p.inventoryArmors.includes(id) || p.embers < item.price) return false;
      p.embers -= item.price;
      p.inventoryArmors.push(id);
      p.armorId = id;
    } else {
      const item = RINGS[id];
      if (!item || p.inventoryRings.includes(id) || p.embers < item.price) return false;
      p.embers -= item.price;
      p.inventoryRings.push(id);
      p.ringId = id;
      p.hp = this.maxHp();
      p.mp = this.maxMp();
      p.st = this.maxSt();
    }
    this.audio.pickup();
    this.save();
    return true;
  }

  travel(id: string): void {
    const s = this.shrineInfo[id];
    if (!s) return;
    const p = this.player;
    p.x = s.x + 0.5;
    p.y = s.y + 2.5;
    p.prevX = p.x;
    p.prevY = p.y;
    this.camera.snap(p.x, p.y);
    this.lastShrine = { x: p.x, y: p.y, id };
    this.resetWorldEnemies();
    this.decals.clear();
    this.particles.length = 0;
  }

  respawn(): void {
    const p = this.player;
    p.dead = false;
    p.hp = this.maxHp();
    p.mp = this.maxMp();
    p.st = this.maxSt();
    p.flasks = p.maxFlasks;
    p.x = this.lastShrine.x;
    p.y = this.lastShrine.y;
    p.prevX = p.x;
    p.prevY = p.y;
    p.atk = p.roll = p.drink = p.parry = 0;
    p.iframes = 1;
    this.camera.snap(p.x, p.y);
    this.resetWorldEnemies();
    this.particles.length = 0;
    this.pickups = this.lost ? [this.lost] : [];
    this.ui?.death(false);
    this.save();
  }

  // ------------------------------------------------------------ Update (fixed 60 Hz)
  update(dt: number, inp: InputState, objs: WorldObject[]): void {
    this.t += dt;
    this.updateWeather(dt);
    this.updateEnv(dt);
    this.updateRain(dt);
    this.updateFireflies(dt);
    this.grassField.update(dt);

    if (this.mode === 'title') {
      this.camera.snap(this.camera.x + dt * 4.2, this.camera.y + Math.sin(this.t * 0.1) * dt * 1.2);
      this.updateParticles(dt);
      this.ambientEmitters(objs, dt);
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    this.updatePlayer(dt, inp);
    for (const e of this.enemies.slice()) {
      if (!e.dead) this.updateEnemy(e, dt);
    }

    // Enemy separation
    for (let a = 0; a < this.enemies.length; a++) {
      for (let b = a + 1; b < this.enemies.length; b++) {
        const e1 = this.enemies[a];
        const e2 = this.enemies[b];
        const dx = e2.x - e1.x;
        const dy = (e2.y - e1.y) * ASP;
        const d = Math.hypot(dx, dy);
        const min = (e1.rad + e2.rad) * 0.9;
        if (d < min && d > 0.01) {
          const push = (min - d) * 0.5;
          this.moveEnt(e1, (-dx / d) * push, ((-dy / d) * push) / ASP);
          this.moveEnt(e2, (dx / d) * push, ((dy / d) * push) / ASP);
        }
      }
    }

    this.updateParticles(dt);
    this.ambientEmitters(objs, dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      this.updateSpawns();
    }

    const p = this.player;
    const L = this.world.landmarkAt(p.x, p.y);
    const aid = L ? L.id : null;
    if (aid !== this.area) {
      this.area = aid;
      if (L) {
        this.flags.knownLandmarks.add(L.id);
        this.ui?.banner(L.name, L.sub, 'pale', 3.4);
      }
    }

    this.interact = this.findInteract();
    this.quest = this.computeQuest();

    // Update smooth camera with deadzone & walk lookahead (never mouse-swinging)
    const moveSpd = Math.hypot(p.vx, p.vy);
    const mdx = moveSpd > 0.5 ? p.vx / moveSpd : 0;
    const mdy = moveSpd > 0.5 ? p.vy / moveSpd : 0;
    this.camera.update(dt, p.x, p.y - 1.5, mdx, mdy, p.aimX, p.aimY, inp.mouseHoldTime, this.options);

    this.world.markVisited(this.camera.x - 45, this.camera.y - 26, this.camera.x + 45, this.camera.y + 26);

    let fireNear = 0;
    for (const o of objs) {
      if (o.kind === 'brazier' || o.kind === 'campfire' || o.kind === 'shrine') {
        fireNear = Math.max(fireNear, 1 - Math.min(1, dist(o.x - p.x, o.y - p.y) / 18));
      }
    }
    this.audio.ambience(this.weather.rain, this.weather.wind, fireNear, !!this.boss);
  }

  private updatePlayer(dt: number, inp: InputState): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;

    if (p.dead) {
      p.deadT += dt;
      if (p.deadT > 3.8) this.respawn();
      return;
    }

    p.atk = Math.max(0, p.atk - dt);
    p.atkCD = Math.max(0, p.atkCD - dt);
    p.roll = Math.max(0, p.roll - dt);
    p.parry = Math.max(0, p.parry - dt);
    p.parryCD = Math.max(0, p.parryCD - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.iframes = Math.max(0, p.iframes - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.stDelay = Math.max(0, p.stDelay - dt);
    p.comboResetT = Math.max(0, p.comboResetT - dt);
    if (p.comboResetT <= 0) p.combo = 0;

    for (const sid of Object.keys(p.skillCD) as SkillId[]) {
      p.skillCD[sid] = Math.max(0, p.skillCD[sid] - dt);
    }

    // Passive mana regen
    p.mp = Math.min(this.maxMp(), p.mp + 4.5 * dt);

    if (inp.lockOn) {
      this.toggleLockOn();
    }
    if (this.lockedTarget && (this.lockedTarget.dead || dist(this.lockedTarget.x - p.x, this.lockedTarget.y - p.y) > 40)) {
      this.lockedTarget = null;
    }

    // Aim direction: Lock-on > Mouse > Walk direction
    if (this.lockedTarget) {
      const ax = this.lockedTarget.x - p.x;
      const ay = (this.lockedTarget.y - p.y) * ASP;
      const l = Math.hypot(ax, ay) || 1;
      p.aimX = ax / l;
      p.aimY = ay / l;
    } else if (inp.mouseActive) {
      const ax = inp.wx - p.x;
      const ay = (inp.wy - (p.y - PCY)) * ASP;
      const l = Math.hypot(ax, ay) || 1;
      p.aimX = ax / l;
      p.aimY = ay / l;
    }

    let ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const il = Math.hypot(ix, iy);
    if (il > 0) {
      ix /= il;
      iy /= il;
      this.markOnboarding('move');
      if (!inp.mouseActive && !this.lockedTarget) {
        p.aimX = ix;
        p.aimY = iy;
      }
    }

    // Smooth acceleration & deceleration (~0.08s response)
    if (p.roll > 0) {
      const sp = 36 * (0.42 + p.roll / 0.32);
      p.vx = p.rollX * sp;
      p.vy = p.rollY * sp;
      this.moveEnt(p, p.vx * dt, (p.vy * dt) / ASP);
      if (Math.random() < 0.5) this.spawnP(p.x, p.y, rand(-2, 2), 0, 0.35, '.', 0.45, 0.42, 0.38, 0);
    } else {
      let maxSpd = 14.5;
      if (p.drink > 0) maxSpd = 5;
      else if (p.atk > 0) maxSpd = 5.5;
      const targetVx = ix * maxSpd;
      const targetVy = iy * maxSpd;
      const accel = 1 - Math.exp(-dt / 0.075);
      p.vx += (targetVx - p.vx) * accel;
      p.vy += (targetVy - p.vy) * accel;
      if (Math.hypot(p.vx, p.vy) > 0.15) {
        this.moveEnt(p, p.vx * dt, (p.vy * dt) / ASP);
        p.moving = il > 0;
        if (p.moving) p.walkT += dt;
        // Grass trample trail & shallow water ripples
        const curT = this.world.typeAt(p.x, p.y);
        if (curT === T.GRASS || curT === T.MOOR || curT === T.MARSH) {
          this.grassField.pushEntityTrail(p.x, p.y, p.vx);
        } else if (curT === T.SHALLOW) {
          p.stepRippleT -= dt;
          if (p.stepRippleT <= 0) {
            p.stepRippleT = 0.28;
            this.grassField.pushRipple(p.x, p.y);
          }
        }
      } else {
        p.vx = 0;
        p.vy = 0;
        p.moving = false;
      }
      if (Math.abs(ix) > 0.2 && !inp.mouseActive && !this.lockedTarget) p.face = ix > 0 ? 1 : -1;
    }

    if ((inp.mouseActive || this.lockedTarget) && Math.abs(p.aimX) > 0.15 && p.roll <= 0) {
      p.face = p.aimX > 0 ? 1 : -1;
    }

    // 3-hit combo attack
    const w = WEAPONS[p.weaponId] || WEAPONS.iron_sword;
    if (inp.attack && p.atkCD <= 0 && p.roll <= 0 && p.drink <= 0 && p.st > 0) {
      p.atk = w.speed * 0.9;
      p.atkCD = w.speed;
      p.st -= w.staminaCost;
      p.stDelay = 0.65;
      p.hitPending = 0.085;
      p.combo = (p.combo + 1) % 3;
      p.comboResetT = 1.1;
      this.markOnboarding('attack');
      this.audio.swing();
      this.spawnWeaponSwingVfx();
      this.moveEnt(p, p.aimX * 0.7, (p.aimY * 0.7) / ASP);
    }
    if (p.hitPending > 0) {
      p.hitPending -= dt;
      if (p.hitPending <= 0) this.strike();
    }

    // Parry
    if (inp.parry && p.parryCD <= 0 && p.roll <= 0 && p.drink <= 0 && p.st >= 12) {
      p.parry = 0.26;
      p.parryCD = 0.7;
      p.st -= 12;
      p.stDelay = 0.5;
      this.markOnboarding('parry');
      this.audio.swing();
    }

    // Dodge roll
    if (inp.roll && p.roll <= 0 && p.st >= 10 && p.drink <= 0 && p.atk < 0.18) {
      if (il > 0) {
        p.rollX = ix;
        p.rollY = iy;
      } else {
        p.rollX = -p.aimX;
        p.rollY = -p.aimY;
      }
      p.roll = 0.32;
      p.iframes = Math.max(p.iframes, 0.28);
      p.st -= 20;
      p.stDelay = 0.65;
      this.markOnboarding('roll');
      this.audio.roll();
    }

    if (inp.skillSlot > 0) {
      this.useSkill(inp.skillSlot);
    }

    if (inp.flask) {
      this.tryDrinkFlask();
    }

    if (p.drink > 0) {
      p.drink -= dt;
      if (p.healPending && p.drink < 0.42) {
        p.healPending = false;
        const h = Math.round(this.maxHp() * 0.48);
        p.hp = Math.min(this.maxHp(), p.hp + h);
        this.floater(p.x, p.y - 5, `+${h}`, '#ffd978', 1.1, true);
        this.burst(p.x, p.y - PCY, 22, [1, 0.78, 0.32], 10, "*'.+", { e: 1, drag: 2 });
      }
    }

    if (p.stDelay <= 0 && p.roll <= 0) p.st = Math.min(this.maxSt(), p.st + 44 * dt);
    if (p.st < -10) p.st = -10;

    // Pickups (lost embers)
    for (let k = this.pickups.length - 1; k >= 0; k--) {
      const pk = this.pickups[k];
      if (dist(pk.x - p.x, pk.y - p.y) < 2.6) {
        p.embers += pk.amount;
        this.floater(p.x, p.y - 5, `+${pk.amount} Glut`, '#ffd270', 1.4, true);
        this.audio.pickup();
        this.pickups.splice(k, 1);
        if (pk === this.lost) this.lost = null;
      }
    }
  }

  private updateWeather(dt: number): void {
    const WK = {
      klar: { rain: 0, fog: 0.1, wind: 0.25, cloud: 0.3 },
      nebel: { rain: 0, fog: 0.68, wind: 0.15, cloud: 0.25 },
      regen: { rain: 0.5, fog: 0.22, wind: 0.5, cloud: 0.55 },
      sturm: { rain: 0.95, fog: 0.2, wind: 0.95, cloud: 0.75 },
    };
    const w = this.weather;
    w.timer -= dt;
    if (w.timer <= 0) {
      const kinds: (keyof typeof WK)[] = ['klar', 'nebel', 'regen', 'regen', 'sturm'];
      let k = pick(kinds);
      if (k === w.kind) k = pick(kinds);
      w.kind = k;
      w.target = WK[k];
      w.timer = rand(55, 120);
    }
    const s = Math.min(1, dt * 0.08);
    w.rain = lerp(w.rain, w.target.rain, s);
    w.fog = lerp(w.fog, w.target.fog, s);
    w.wind = lerp(w.wind, w.target.wind, s);
    w.cloud = lerp(w.cloud, w.target.cloud, s);

    if (w.kind === 'sturm' && w.rain > 0.6 && Math.random() < dt * 0.12) {
      if (!this.options.reduceFlashes) this.flash = 0.85;
      this.audio.thunder(rand(0.2, 1.5));
    }
    this.flash = Math.max(0, this.flash - dt * 5);
  }

  private updateEnv(dt: number): void {
    this.clock = (this.clock + dt / 420) % 1;
    const n = 0.5 - 0.5 * Math.cos(this.clock * TAU);
    this.night = n;

    // Stage 2 Lighting: Ambient luminance floor >= 0.35 even at deepest night!
    const dusk: [number, number, number] = [0.74, 0.64, 0.68];
    const night: [number, number, number] = [0.36, 0.4, 0.54];
    let a: [number, number, number] = [lerp(dusk[0], night[0], n), lerp(dusk[1], night[1], n), lerp(dusk[2], night[2], n)];

    if (this.flags.victory) {
      this.dawn = Math.min(1, this.dawn + dt * 0.08);
      const day: [number, number, number] = [0.96, 0.88, 0.74];
      a = [lerp(a[0], day[0], this.dawn), lerp(a[1], day[1], this.dawn), lerp(a[2], day[2], this.dawn)];
    }

    // Rain/fog only softly reduce contrast, never crush visibility to black
    const rk = 1 - this.weather.rain * 0.08;
    const fl = this.options.reduceFlashes ? 0 : this.flash * 0.6;

    this.biomeT -= dt;
    if (this.biomeT <= 0) {
      this.biome = this.world.biomeAt(this.player.x, this.player.y);
      this.biomeT = 0.5;
    }

    let tint: [number, number, number] = [1, 1, 1];
    let fc: [number, number, number] = [0.48, 0.52, 0.6];
    if (this.biome === BIOMES.ash) {
      tint = [1.12, 0.9, 0.82];
      fc = [0.6, 0.4, 0.3];
    } else if (this.biome === BIOMES.swamp) {
      tint = [0.92, 1.06, 0.96];
      fc = [0.4, 0.54, 0.48];
    } else if (this.biome === BIOMES.plaza) {
      tint = [0.92, 0.9, 1.06];
      fc = [0.44, 0.44, 0.56];
    }

    this.amb = [
      Math.max(0.35, a[0] * rk * tint[0] + fl * 0.7),
      Math.max(0.35, a[1] * rk * tint[1] + fl * 0.75),
      Math.max(0.4, a[2] * rk * tint[2] + fl * 0.85),
    ];
    this.fogColor = fc;
    this.cloud = this.weather.cloud * (1 - n * 0.5);
  }

  private updateParticles(dt: number): void {
    const ps = this.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const q = ps[k];
      if (q.delay > 0) {
        q.delay -= dt;
        continue;
      }
      q.life -= dt;
      if (q.life <= 0) {
        if (q.decal && Math.random() < 0.55) {
          const x = Math.floor(q.x);
          const y = Math.floor(q.y);
          if (!WATERY[this.world.typeAt(x, y)]) {
            this.decals.set(`${x},${y}`, { x, y, code: q.code, r: q.r * 0.8, g: q.g * 0.8, b: q.b * 0.8, life: 45 });
          }
        }
        ps[k] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr;
      q.vy *= dr;
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (const [k, d] of this.decals) {
      d.life -= dt;
      if (d.life <= 0) this.decals.delete(k);
    }
    if (this.decals.size > 900) {
      const it = this.decals.keys();
      for (let i = 0; i < 200; i++) this.decals.delete(it.next().value!);
    }

    // Projectiles
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const q = this.projectiles[k];
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (Math.random() < 0.65) this.spawnP(q.x, q.y, 0, 0, 0.25, pick(['.', "'", '·']), q.col[0], q.col[1], q.col[2], 1);
      const t = this.world.typeAt(q.x, q.y);
      let dead = q.life <= 0 || ((t === T.WALL || t === T.TOWER_WALL || t === T.MOUNT) && q.life < 3.1);

      if (!dead && q.fromPlayer) {
        for (const e of this.enemies.slice()) {
          if (e.dead) continue;
          if (dist(q.x - e.x, q.y - e.y) < e.rad + 1.4) {
            const highGround = (q.elev ?? 0) > this.world.elevAt(e.x, e.y) ? 1.3 : 1.0;
            this.damageEnemy(e, q.dmg * highGround, q.vx > 0 ? 1 : -1, 0, 18, { kind: 'burn', dps: 7, dur: 3.5 });
            dead = true;
            break;
          }
        }
      } else if (!dead && !this.player.dead && dist(q.x - this.player.x, q.y - (this.player.y - 1.5)) < 1.8) {
        if (this.hurtPlayer(q.dmg, q.x, q.y)) dead = true;
      }

      if (dead) {
        this.burst(q.x, q.y, 8, q.col, 8, "*'.", { e: 1 });
        this.projectiles.splice(k, 1);
      }
    }

    for (let k = this.floaters.length - 1; k >= 0; k--) {
      this.floaters[k].life -= dt;
      if (this.floaters[k].life <= 0) this.floaters.splice(k, 1);
    }
    for (let k = this.telegraphs.length - 1; k >= 0; k--) {
      this.telegraphs[k].life -= dt;
      if (this.telegraphs[k].life <= 0) this.telegraphs.splice(k, 1);
    }
  }

  private updateRain(dt: number): void {
    const w = this.weather;
    const ashy = this.biome === BIOMES.ash;
    const want = Math.floor((ashy ? Math.max(0.35, w.rain * 0.6) : w.rain) * 140 * this.options.particlesDensity);
    while (this.rain.length < want) this.rain.push({ x: 0, y: 0, life: 0, vx: 0, vy: 0 });
    if (this.rain.length > want) this.rain.length = want;

    const cx = this.camera.x;
    const cy = this.camera.y;
    for (const d of this.rain) {
      d.life -= dt;
      if (d.life <= 0 || Math.abs(d.x - cx) > 65 || Math.abs(d.y - cy) > 38) {
        d.x = cx + rand(-55, 55);
        d.y = cy + rand(-34, 30);
        d.life = rand(0.18, 0.85);
        if (ashy) {
          d.vx = rand(-3, 3) - w.wind * 3;
          d.vy = rand(2, 5);
          d.life *= 3.5;
          d.ash = true;
        } else {
          d.vx = -4 - w.wind * 16;
          d.vy = rand(30, 46);
          d.ash = false;
        }
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
  }

  private updateFireflies(dt: number): void {
    const want = this.night > 0.3 && this.weather.rain < 0.55 && !this.flags.victory ? Math.round(36 * this.options.particlesDensity) : 0;
    while (this.fireflies.length < want) {
      this.fireflies.push({ x: this.camera.x + rand(-45, 45), y: this.camera.y + rand(-26, 26), a: rand(0, TAU), ph: rand(0, TAU) });
    }
    if (this.fireflies.length > want) this.fireflies.length = want;
    for (const f of this.fireflies) {
      f.a += rand(-3, 3) * dt;
      f.x += Math.cos(f.a) * 2.8 * dt;
      f.y += (Math.sin(f.a) * 2.8 * dt) / ASP;
      if (Math.abs(f.x - this.camera.x) > 52 || Math.abs(f.y - this.camera.y) > 30) {
        f.x = this.camera.x + rand(-45, 45);
        f.y = this.camera.y + rand(-26, 26);
      }
      const t = this.world.typeAt(f.x, f.y);
      f.ok = t === T.GRASS || t === T.MARSH || t === T.FOREST || t === T.SHALLOW || t === T.MOOR;
    }
  }

  private ambientEmitters(objs: WorldObject[], dt: number): void {
    for (const o of objs) {
      const k = o.kind;
      if ((k === 'brazier' || k === 'campfire' || (k === 'shrine' && o.id && this.flags.shrines.has(o.id))) && Math.random() < dt * 5) {
        this.spawnP(
          o.x + 0.5 + rand(-0.4, 0.4),
          o.y - 1.5,
          rand(-1, 1) - this.weather.wind * 2,
          rand(-6, -3),
          rand(0.5, 1.2),
          pick(['.', "'", '`']),
          1,
          rand(0.45, 0.72),
          0.16,
          1,
          { drag: 0.6 },
        );
      } else if (k === 'vent' && Math.random() < dt * 0.8) {
        this.spawnP(o.x + 0.5, o.y, rand(-1, 1), rand(-5, -2), rand(0.8, 1.4), pick(['.', "'"]), 1, 0.42, 0.12, 1, { drag: 0.4 });
      }
    }
  }

  collectLights(objs: WorldObject[]): void {
    const L = this.lights;
    L.length = 0;
    const t = this.t;
    const p = this.player;

    // Stage 2: Large soft warm torch (radius ~28 units) so player surroundings are always clear
    if (this.mode !== 'title' && !p.dead) {
      const fl = 1 + Math.sin(t * 10) * 0.03 + Math.sin(t * 21.3) * 0.02;
      L.push({ x: p.x, y: p.y - 1.5, rad: 28 * fl, r: 1.0, g: 0.76, b: 0.48, i: 1.05, castsShadow: false });
    }

    let small = 0;
    for (const o of objs) {
      const fl = 0.88 + 0.12 * Math.sin(t * 9 + o.x) * Math.sin(t * 5.3 + o.y);
      switch (o.kind) {
        case 'brazier':
        case 'campfire':
          L.push({ x: o.x + 0.5, y: o.y - 0.5, rad: 16 * fl, r: 1.0, g: 0.56, b: 0.2, i: 1.0, castsShadow: true });
          break;
        case 'shrine':
          if (o.id && this.flags.shrines.has(o.id)) {
            L.push({ x: o.x + 0.5, y: o.y - 1, rad: 22 * fl, r: 1.0, g: 0.7, b: 0.32, i: 1.15, castsShadow: true });
          } else {
            L.push({ x: o.x + 0.5, y: o.y - 0.5, rad: 7, r: 0.65, g: 0.3, b: 0.15, i: 0.55 });
          }
          break;
        case 'lore':
          if (!o.id || !this.flags.lore.has(o.id)) L.push({ x: o.x + 0.5, y: o.y - 0.5, rad: 7, r: 0.38, g: 0.62, b: 1.0, i: 0.65 });
          break;
        case 'chest':
          if (!o.id || !this.flags.chests.has(o.id)) L.push({ x: o.x + 0.5, y: o.y, rad: 6, r: 1.0, g: 0.82, b: 0.35, i: 0.65 });
          break;
        case 'vent':
          if (small++ < 24) L.push({ x: o.x + 0.5, y: o.y, rad: 4.5, r: 1, g: 0.38, b: 0.08, i: 0.6 * fl });
          break;
        case 'fungus':
          if (small++ < 24) L.push({ x: o.x + 0.5, y: o.y, rad: 4, r: 0.18, g: 0.8, b: 0.72, i: 0.45 });
          break;
      }
    }

    for (const e of this.enemies) {
      if (e.type === 'wraith' || e.type === 'bogwitch') L.push({ x: e.x, y: e.y - 1.5, rad: 8, r: e.d.proj[0], g: e.d.proj[1], b: e.d.proj[2], i: 0.65 });
      else if (e.boss) L.push({ x: e.x, y: e.y - 2, rad: 16, r: e.d.proj[0], g: e.d.proj[1], b: e.d.proj[2], i: 0.8 });
    }
    for (const n of this.npcs) L.push({ x: n.x + 0.5, y: n.y - 1, rad: 12, r: 1.0, g: 0.75, b: 0.4, i: 0.8 });
    for (const q of this.projectiles) L.push({ x: q.x, y: q.y, rad: 8, r: q.col[0], g: q.col[1], b: q.col[2], i: 0.9 });
    for (const pk of this.pickups) L.push({ x: pk.x, y: pk.y, rad: 8, r: 1, g: 0.75, b: 0.32, i: 0.85 });

    let ff = 0;
    for (const f of this.fireflies) {
      if (f.ok && ff++ < 14) {
        L.push({ x: f.x, y: f.y, rad: 4, r: 0.68, g: 1.0, b: 0.42, i: 0.4 * (0.5 + 0.5 * Math.sin(t * 3 + f.ph)) });
      }
    }
    if (L.length > 96) L.length = 96;
  }

  // ------------------------------------------------------------ Multi-slot Save / Export / Import
  serializeSave(slotName = `Slot ${this.activeSlot}`): SaveSlotData {
    const p = this.player;
    const sp: SerializablePlayer = {
      id: p.id,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      face: p.face,
      aimX: p.aimX,
      aimY: p.aimY,
      hp: p.hp,
      mp: p.mp,
      st: p.st,
      lvl: p.lvl,
      xp: p.xp,
      attrPoints: p.attrPoints,
      vig: p.vig,
      mig: p.mig,
      end: p.end,
      arc: p.arc,
      embers: p.embers,
      flasks: p.flasks,
      maxFlasks: p.maxFlasks,
      weaponId: p.weaponId,
      weaponUpgrade: p.weaponUpgrade,
      armorId: p.armorId,
      ringId: p.ringId,
      inventoryWeapons: [...p.inventoryWeapons],
      inventoryArmors: [...p.inventoryArmors],
      inventoryRings: [...p.inventoryRings],
      unlockedSkills: [...p.unlockedSkills],
    };
    return {
      version: 2,
      savedAt: Date.now(),
      slotName,
      player: sp,
      lastShrine: { ...this.lastShrine },
      shrines: [...this.flags.shrines],
      shrineInfo: { ...this.shrineInfo },
      bosses: [...this.flags.bosses],
      lore: [...this.flags.lore],
      chests: [...this.flags.chests],
      bestiary: { ...this.bestiary },
      knownLandmarks: [...this.flags.knownLandmarks],
      mapPins: [...this.mapPins],
      gateOpen: this.flags.gateOpen,
      victory: this.flags.victory,
      lost: this.lost,
      clock: this.clock,
      talkedMaren: this.flags.talkedMaren,
      onboardingDone: [...this.flags.onboardingDone],
    };
  }

  save(slot = this.activeSlot): void {
    try {
      localStorage.setItem(`${SAVE_PREFIX}${slot}`, JSON.stringify(this.serializeSave(`Slot ${slot}`)));
    } catch {
      // storage unavailable
    }
  }

  listSaves(): (SaveSlotData | null)[] {
    return [1, 2, 3].map((slot) => {
      try {
        const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
        return raw ? (JSON.parse(raw) as SaveSlotData) : null;
      } catch {
        return null;
      }
    });
  }

  hasAnySave(): boolean {
    return this.listSaves().some((s) => s !== null);
  }

  importSaveJson(json: string, slot = this.activeSlot): boolean {
    try {
      const data = JSON.parse(json) as SaveSlotData;
      if (data.version !== 2 || !data.player) return false;
      localStorage.setItem(`${SAVE_PREFIX}${slot}`, JSON.stringify(data));
      this.loadSaveData(data, slot);
      return true;
    } catch {
      return false;
    }
  }

  loadSaveData(data: SaveSlotData, slot = 1): void {
    this.activeSlot = slot;
    this.player = this.createPlayer();
    Object.assign(this.player, data.player);
    this.player.prevX = this.player.x;
    this.player.prevY = this.player.y;
    this.flags.shrines = new Set(data.shrines || []);
    this.flags.bosses = new Set(data.bosses || []);
    this.flags.lore = new Set(data.lore || []);
    this.flags.chests = new Set(data.chests || []);
    this.flags.knownLandmarks = new Set(data.knownLandmarks || ['start']);
    this.flags.gateOpen = !!data.gateOpen;
    this.flags.victory = !!data.victory;
    this.flags.talkedMaren = !!data.talkedMaren;
    this.flags.onboardingDone = new Set(data.onboardingDone || []);
    this.world.setGateOpen(this.flags.gateOpen);
    this.shrineInfo = data.shrineInfo || {};
    this.bestiary = data.bestiary || {};
    this.mapPins = data.mapPins || [];
    this.lost = data.lost || null;
    this.clock = data.clock || 0.04;
    this.dawn = this.flags.victory ? 1 : 0;
    this.lastShrine = data.lastShrine || { x: 0.5, y: 2.5, id: 'shrine@0,0' };
    this.npcs = [];
    this.particles.length = 0;
    this.decals.clear();
    this.floaters.length = 0;
    this.pickups = this.lost ? [this.lost] : [];
    this.resetWorldEnemies();
    this.camera.snap(this.player.x, this.player.y);
    this.mode = 'play';
    this.area = null;
    this.spawnTimer = 0.1;
    this.quest = this.computeQuest();
  }

  newGame(slot = 1): void {
    this.activeSlot = slot;
    this.player = this.createPlayer();
    this.flags = {
      shrines: new Set(),
      bosses: new Set(),
      lore: new Set(),
      chests: new Set(),
      knownLandmarks: new Set(['start']),
      gateOpen: false,
      victory: false,
      talkedMaren: false,
      onboardingDone: new Set(),
    };
    this.world.setGateOpen(false);
    this.shrineInfo = {};
    this.bestiary = {};
    this.loreLog = [];
    this.mapPins = [];
    this.lost = null;
    this.clock = 0.04;
    this.dawn = 0;
    this.lastShrine = { x: 0.5, y: 2.5, id: 'shrine@0,0' };
    this.npcs = [];
    this.pickups = [];
    this.particles.length = 0;
    this.decals.clear();
    this.floaters.length = 0;
    this.resetWorldEnemies();
    this.camera.snap(this.player.x, this.player.y);
    this.mode = 'play';
    this.area = null;
    this.spawnTimer = 0.1;
    this.quest = this.computeQuest();
  }
}
