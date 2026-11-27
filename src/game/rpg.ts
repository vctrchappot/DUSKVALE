import type { ArmorDef, RingDef, SkillDef, SkillId, WeaponDef } from './types.ts';

export const WEAPONS: Record<string, WeaponDef> = {
  iron_sword: {
    id: 'iron_sword',
    name: 'Schwert der Dämmerung',
    kind: 'sword',
    dmgMult: 1.0,
    range: 5.8,
    arcDot: 0.18,
    speed: 0.36,
    staminaCost: 14,
    poiseDmg: 22,
    glowColor: [0.95, 0.72, 0.38],
    price: 0,
    desc: 'Ausgewogene Klinge mit leichter Glut-Spur.',
  },
  ash_greatsword: {
    id: 'ash_greatsword',
    name: 'Aschen-Großschwert',
    kind: 'greatsword',
    dmgMult: 1.48,
    range: 7.0,
    arcDot: -0.05,
    speed: 0.56,
    staminaCost: 22,
    poiseDmg: 45,
    burn: 6,
    glowColor: [1.0, 0.45, 0.14],
    price: 380,
    desc: 'Schwerer Bogenhieb, bricht Haltung und entzündet Feinde.',
  },
  pilgrim_spear: {
    id: 'pilgrim_spear',
    name: 'Pilgerspeer',
    kind: 'spear',
    dmgMult: 1.12,
    range: 8.2,
    arcDot: 0.52,
    speed: 0.34,
    staminaCost: 15,
    poiseDmg: 26,
    glowColor: [0.65, 0.88, 1.0],
    price: 260,
    desc: 'Hohe Reichweite für präzise Stöße und High-Ground-Vorteile.',
  },
  reaper_scythe: {
    id: 'reaper_scythe',
    name: 'Sichel der Flut',
    kind: 'scythe',
    dmgMult: 1.24,
    range: 6.8,
    arcDot: 0.05,
    speed: 0.44,
    staminaCost: 17,
    poiseDmg: 28,
    bleed: 9,
    glowColor: [0.45, 0.95, 0.78],
    price: 460,
    desc: 'Verursacht starke Blutung mit weitem Rundhieb.',
  },
};

export const ARMORS: Record<string, ArmorDef> = {
  wanderer_plate: {
    id: 'wanderer_plate',
    name: 'Wanderer-Rüstung',
    defense: 0,
    poiseBonus: 0,
    cloakColor: [0.72, 0.16, 0.14],
    steelColor: [0.8, 0.82, 0.88],
    trimColor: [0.85, 0.68, 0.34],
    price: 0,
    desc: 'Verwitterter Stahl und roter Umhang.',
  },
  sentinel_mail: {
    id: 'sentinel_mail',
    name: 'Wächter-Platte',
    defense: 0.18,
    poiseBonus: 20,
    cloakColor: [0.24, 0.44, 0.68],
    steelColor: [0.86, 0.88, 0.94],
    trimColor: [0.7, 0.85, 1.0],
    price: 320,
    desc: '-18% erlittener Schaden · blauer Wächtermantel.',
  },
  cinder_mantle: {
    id: 'cinder_mantle',
    name: 'Aschenmantel',
    defense: 0.28,
    poiseBonus: 35,
    cloakColor: [0.88, 0.36, 0.12],
    steelColor: [0.56, 0.52, 0.5],
    trimColor: [1.0, 0.65, 0.2],
    price: 620,
    desc: '-28% erlittener Schaden · glühender Umhang der Feste.',
  },
};

export const RINGS: Record<string, RingDef> = {
  ember_band: {
    id: 'ember_band',
    name: 'Ring der Glut',
    dmgBonus: 0.15,
    price: 240,
    desc: '+15% Angriffsschaden.',
  },
  vital_signet: {
    id: 'vital_signet',
    name: 'Siegel des Lebens',
    hpBonus: 45,
    stBonus: 20,
    price: 280,
    desc: '+45 LP und +20 Ausdauer.',
  },
  scholar_loop: {
    id: 'scholar_loop',
    name: 'Ring der Erinnerung',
    mpBonus: 30,
    xpMult: 1.25,
    price: 300,
    desc: '+30 Mana und +25% XP.',
  },
};

export const SKILLS: Record<SkillId, SkillDef> = {
  flame_slash: {
    id: 'flame_slash',
    slot: 1,
    name: 'Flammenhieb',
    manaCost: 18,
    cooldown: 4.0,
    icon: '🔥',
    color: '#ff8a3d',
    desc: 'Feuerkegel vor dir; verursacht Schaden und Brand.',
  },
  ember_bolt: {
    id: 'ember_bolt',
    slot: 2,
    name: 'Glutbolzen',
    manaCost: 14,
    cooldown: 2.2,
    icon: '✦',
    color: '#ffc65c',
    desc: 'Schnelles Glutgeschoss in Blickrichtung (High-Ground-Bonus).',
  },
  ash_shield: {
    id: 'ash_shield',
    slot: 3,
    name: 'Ascheschild',
    manaCost: 20,
    cooldown: 8.0,
    icon: '◈',
    color: '#88c0ff',
    desc: '3.5 s Schutzschild: halbiert Schaden und reflektiert Funken.',
  },
  leap_strike: {
    id: 'leap_strike',
    slot: 4,
    name: 'Sprungangriff',
    manaCost: 24,
    cooldown: 6.5,
    icon: '⚔',
    color: '#f05a4f',
    desc: 'Springt vorwärts und schlägt eine Schockwelle mit Haltungsbruch.',
  },
};

export function xpForNextLevel(level: number): number {
  return Math.round(90 * Math.pow(1.24, level - 1));
}

export function weaponUpgradeCost(level: number): number {
  return Math.round(120 * Math.pow(1.55, level));
}
