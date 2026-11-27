import { dist, formatCardinal } from '../engine/util.ts';
import type { Landmark } from '../world/types.ts';

export interface QuestStep {
  id: string;
  title: string;
  detail: string;
  targetX: number;
  targetY: number;
  targetName: string;
  done: boolean;
}

export interface OnboardingHint {
  id: string;
  text: string;
  action: 'move' | 'attack' | 'roll' | 'parry' | 'interact' | 'skill';
}

export const ONBOARDING_HINTS: OnboardingHint[] = [
  { id: 'move', text: 'WASD zum Bewegen · Maus zum Zielen', action: 'move' },
  { id: 'interact', text: 'Drücke [E] am Schrein oder bei Maren', action: 'interact' },
  { id: 'attack', text: 'Linksklick für 3-Stufen-Schwertkombo', action: 'attack' },
  { id: 'roll', text: 'Leertaste oder Rechtsklick zum Ausweichen', action: 'roll' },
  { id: 'parry', text: 'Drücke [F] zum Parieren im rechten Moment', action: 'parry' },
  { id: 'skill', text: 'Tasten [1–4] für Glut-Fähigkeiten · [Tab] Lock-on', action: 'skill' },
];

export interface QuestEvalContext {
  shrines: Set<string>;
  bosses: Set<string>;
  gateOpen: boolean;
  victory: boolean;
  talkedMaren: boolean;
  landmarks: Landmark[];
  playerX: number;
  playerY: number;
}

export interface ActiveQuestSummary {
  step: QuestStep;
  allSteps: QuestStep[];
  distanceMeters: number;
  direction: string;
  trackerLine: string;
}

export function evaluateMainQuest(ctx: QuestEvalContext): ActiveQuestSummary {
  const findLm = (id: string) => ctx.landmarks.find((l) => l.id === id) || { x: 0, y: 0, name: id };
  const start = findLm('start');
  const barrow = findLm('barrow');
  const chapel = findLm('chapel');
  const keep = findLm('keep');
  const cathedral = findLm('cathedral');

  const hasStartShrine = Array.from(ctx.shrines).some((id) => {
    const m = /shrine@(-?\d+),(-?\d+)/.exec(id);
    if (!m) return false;
    return dist(Number(m[1]) - start.x, Number(m[2]) - start.y) < 12;
  });

  const steps: QuestStep[] = [
    {
      id: 'ignite_start',
      title: 'Entzünde den Schrein der Glutsenke',
      detail: 'Nähere dich dem Schrein in der Mitte der Glutsenke und drücke [E].',
      targetX: start.x,
      targetY: start.y,
      targetName: 'Schrein der Glutsenke',
      done: hasStartShrine,
    },
    {
      id: 'speak_maren',
      title: 'Sprich mit Maren',
      detail: 'Maren, die Hüterin der Glut, wartet östlich des Schreins.',
      targetX: start.x + 6,
      targetY: start.y,
      targetName: 'Maren',
      done: ctx.talkedMaren,
    },
    {
      id: 'sigil_bone',
      title: 'Erringe das Siegel des Knochens',
      detail: 'Folge der Weststraße zum Hügelgrab des Heiligen Vael und bezwinge den Gebeinkönig.',
      targetX: barrow.x,
      targetY: barrow.y,
      targetName: 'Hügelgrab des Hl. Vael',
      done: ctx.bosses.has('wight'),
    },
    {
      id: 'sigil_flood',
      title: 'Erringe das Siegel der Flut',
      detail: 'Reise nach Osten ins Moor zur Ertrunkenen Kapelle und stelle dich der Ertrunkenen Mutter.',
      targetX: chapel.x,
      targetY: chapel.y,
      targetName: 'Ertrunkene Kapelle',
      done: ctx.bosses.has('matron'),
    },
    {
      id: 'sigil_ash',
      title: 'Erringe das Siegel der Asche',
      detail: 'Ziehe nach Süden in die Aschenfeste und besiege Corvus, den Aschenritter.',
      targetX: keep.x,
      targetY: keep.y,
      targetName: 'Aschenfeste',
      done: ctx.bosses.has('corvus'),
    },
    {
      id: 'open_cathedral',
      title: 'Betritt die Schwarze Kathedrale',
      detail: 'Bringe die drei Siegel zum Tor im Norden und bezwinge den Bleichen Bischof.',
      targetX: cathedral.x,
      targetY: cathedral.y,
      targetName: 'Schwarze Kathedrale',
      done: ctx.victory,
    },
  ];

  const active = steps.find((s) => !s.done) || steps[steps.length - 1];
  const dx = active.targetX - ctx.playerX;
  const dy = active.targetY - ctx.playerY;
  const d = Math.round(dist(dx, dy));
  const dir = formatCardinal(dx, dy);
  const trackerLine = ctx.victory
    ? 'Die Dämmerung ist gebrochen · Erkunde Duskvale frei'
    : `${active.targetName} · ${d} m ${dir}`;

  return {
    step: active,
    allSteps: steps,
    distanceMeters: d,
    direction: dir,
    trackerLine,
  };
}
