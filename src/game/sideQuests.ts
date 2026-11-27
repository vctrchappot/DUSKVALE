export type EliteAffixId = 'burning' | 'armored' | 'swift' | 'bloodthirsty';

export interface EliteAffixDef {
  id: EliteAffixId;
  prefix: string;
  hpMult: number;
  poiseMult: number;
  spdMult: number;
  dmgMult: number;
  rimColor: [number, number, number];
  desc: string;
}

export const ELITE_AFFIXES: Record<EliteAffixId, EliteAffixDef> = {
  burning: {
    id: 'burning',
    prefix: 'Brennender',
    hpMult: 1.5,
    poiseMult: 1.2,
    spdMult: 1.0,
    dmgMult: 1.2,
    rimColor: [1.0, 0.52, 0.14],
    desc: 'Entzündet Gegner und hinterlässt Glut.',
  },
  armored: {
    id: 'armored',
    prefix: 'Gepanzerter',
    hpMult: 1.85,
    poiseMult: 1.75,
    spdMult: 0.9,
    dmgMult: 1.15,
    rimColor: [0.95, 0.82, 0.36],
    desc: 'Hohe Haltung und starker Schutz.',
  },
  swift: {
    id: 'swift',
    prefix: 'Flinker',
    hpMult: 1.35,
    poiseMult: 1.0,
    spdMult: 1.3,
    dmgMult: 1.15,
    rimColor: [0.5, 0.95, 1.0],
    desc: 'Schnelle Bewegung und kürzere Ausholzeit.',
  },
  bloodthirsty: {
    id: 'bloodthirsty',
    prefix: 'Blutdürstiger',
    hpMult: 1.55,
    poiseMult: 1.25,
    spdMult: 1.1,
    dmgMult: 1.25,
    rimColor: [0.95, 0.2, 0.45],
    desc: 'Heilt sich bei Treffern.',
  },
};

export type RuneId = 'rune_ember' | 'rune_steel' | 'rune_strider' | 'rune_victor';

export interface RuneDef {
  id: RuneId;
  name: string;
  desc: string;
  dmgMult?: number;
  manaRegenMult?: number;
  parryWindowBonus?: number;
  poiseDmgBonus?: number;
  moveSpeedMult?: number;
  staminaCostMult?: number;
  xpMult?: number;
  emberMult?: number;
}

export const RUNES: Record<RuneId, RuneDef> = {
  rune_ember: {
    id: 'rune_ember',
    name: 'Rune der Glut',
    desc: '+15% Angriffsschaden & +30% Mana-Regeneration.',
    dmgMult: 1.15,
    manaRegenMult: 1.3,
  },
  rune_steel: {
    id: 'rune_steel',
    name: 'Rune des Stahls',
    desc: '+0.10s Parier-Fenster & +18 Haltungsschaden.',
    parryWindowBonus: 0.1,
    poiseDmgBonus: 18,
  },
  rune_strider: {
    id: 'rune_strider',
    name: 'Rune des Wanderers',
    desc: '+12% Lauftempo & -15% Ausdauerkosten.',
    moveSpeedMult: 1.12,
    staminaCostMult: 0.85,
  },
  rune_victor: {
    id: 'rune_victor',
    name: 'Rune des Siegers',
    desc: '+25% XP & +25% Glut aus allen Kämpfen.',
    xpMult: 1.25,
    emberMult: 1.25,
  },
};

export interface SideQuestDef {
  id: string;
  title: string;
  desc: string;
  goal: number;
  rewardEmbers: number;
  rewardXp: number;
  rewardRune?: RuneId;
}

export const SIDE_QUESTS: SideQuestDef[] = [
  {
    id: 'sq_crypt',
    title: 'Säuberung der Krypta',
    desc: 'Betritt eine Schattenhöhle und bezwinge ihren Elite-Wächter.',
    goal: 1,
    rewardEmbers: 350,
    rewardXp: 180,
    rewardRune: 'rune_ember',
  },
  {
    id: 'sq_hunter',
    title: 'Jäger der Asche',
    desc: 'Besiege 5 Gegner in der offenen Welt oder in Krypten.',
    goal: 5,
    rewardEmbers: 200,
    rewardXp: 120,
    rewardRune: 'rune_steel',
  },
  {
    id: 'sq_lore',
    title: 'Stimmen im Stein',
    desc: 'Lies 3 verwitterte Lore-Stelen in Duskvale.',
    goal: 3,
    rewardEmbers: 180,
    rewardXp: 150,
    rewardRune: 'rune_strider',
  },
  {
    id: 'sq_chests',
    title: 'Schatzsucher von Duskvale',
    desc: 'Öffne 2 Schatztruhen in Ruinen, Türmen oder Krypten.',
    goal: 2,
    rewardEmbers: 240,
    rewardXp: 130,
    rewardRune: 'rune_victor',
  },
];

export interface SideQuestStatus {
  def: SideQuestDef;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export function evaluateSideQuests(ctx: {
  dungeonsCleared: number;
  totalKills: number;
  loreCount: number;
  chestsCount: number;
  claimedIds: Set<string>;
}): SideQuestStatus[] {
  return SIDE_QUESTS.map((def) => {
    let progress = 0;
    if (def.id === 'sq_crypt') progress = ctx.dungeonsCleared;
    else if (def.id === 'sq_hunter') progress = ctx.totalKills;
    else if (def.id === 'sq_lore') progress = ctx.loreCount;
    else if (def.id === 'sq_chests') progress = ctx.chestsCount;
    const completed = progress >= def.goal;
    return {
      def,
      progress: Math.min(progress, def.goal),
      completed,
      claimed: ctx.claimedIds.has(def.id),
    };
  });
}
