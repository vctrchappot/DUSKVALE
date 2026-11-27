export type ZoomLevel = 'nah' | 'mittel' | 'fern';

export interface GameOptions {
  zoom: ZoomLevel;
  bloom: boolean;
  particlesDensity: number; // 0.5 | 1.0
  grassDensity: number; // 0.5 | 1.0
  shadows: boolean;
  gamma: number; // 0.8 .. 1.4, default 1.05
  highContrast: boolean;
  uiScale: number; // 0.9 | 1.0 | 1.15
  reduceCameraMotion: boolean;
  reduceFlashes: boolean;
  targetArrow: boolean;
  mouseLookahead: boolean;
  touchControls: boolean;
  showPhantoms: boolean;
  playerName: string;
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  ambienceVol: number;
  muted: boolean;
}

export const ZOOM_PX: Record<ZoomLevel, number> = {
  nah: 9,
  mittel: 7,
  fern: 6,
};

const OPT_KEY = 'duskvale.options.v2';

export const DEFAULT_OPTIONS: GameOptions = {
  zoom: 'nah',
  bloom: true,
  particlesDensity: 1.0,
  grassDensity: 1.0,
  shadows: true,
  gamma: 1.05,
  highContrast: false,
  uiScale: 1.0,
  reduceCameraMotion: false,
  reduceFlashes: false,
  targetArrow: true,
  mouseLookahead: false,
  touchControls: false,
  showPhantoms: true,
  playerName: 'Wanderer',
  masterVol: 0.75,
  musicVol: 0.7,
  sfxVol: 0.85,
  ambienceVol: 0.8,
  muted: false,
};

export function loadOptions(): GameOptions {
  try {
    const raw = localStorage.getItem(OPT_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<GameOptions>;
    return { ...DEFAULT_OPTIONS, ...parsed };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(opts: GameOptions): void {
  try {
    localStorage.setItem(OPT_KEY, JSON.stringify(opts));
  } catch {
    // storage unavailable
  }
}

export function cycleZoom(current: ZoomLevel, dir: 1 | -1): ZoomLevel {
  const order: ZoomLevel[] = ['fern', 'mittel', 'nah'];
  const idx = order.indexOf(current);
  const next = Math.max(0, Math.min(order.length - 1, idx + dir));
  return order[next];
}
