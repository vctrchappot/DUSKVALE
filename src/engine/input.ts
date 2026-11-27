export interface InputState {
  up: number;
  down: number;
  left: number;
  right: number;
  attack: boolean;
  roll: boolean;
  parry: boolean;
  flask: boolean;
  lockOn: boolean;
  skillSlot: number; // 1..9, 0 = none
  mouseActive: boolean;
  mouseHeld: boolean;
  mouseHoldTime: number;
  mx: number;
  my: number;
  wx: number;
  wy: number;
}

export function createInputState(): InputState {
  return {
    up: 0,
    down: 0,
    left: 0,
    right: 0,
    attack: false,
    roll: false,
    parry: false,
    flask: false,
    lockOn: false,
    skillSlot: 0,
    mouseActive: false,
    mouseHeld: false,
    mouseHoldTime: 0,
    mx: 0,
    my: 0,
    wx: 0,
    wy: 0,
  };
}

export function clearOneShotInputs(inp: InputState): void {
  inp.attack = false;
  inp.roll = false;
  inp.parry = false;
  inp.flask = false;
  inp.lockOn = false;
  inp.skillSlot = 0;
}

export function pollGamepad(inp: InputState): void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  const gp = pads && pads[0];
  if (!gp) return;
  const dead = 0.25;
  const lx = Math.abs(gp.axes[0] || 0) > dead ? gp.axes[0] : 0;
  const ly = Math.abs(gp.axes[1] || 0) > dead ? gp.axes[1] : 0;
  if (lx < -dead) inp.left = 1;
  if (lx > dead) inp.right = 1;
  if (ly < -dead) inp.up = 1;
  if (ly > dead) inp.down = 1;
  if (gp.buttons[0]?.pressed) inp.roll = true;
  if (gp.buttons[2]?.pressed || gp.buttons[5]?.pressed) inp.attack = true;
  if (gp.buttons[4]?.pressed) inp.parry = true;
  if (gp.buttons[3]?.pressed) inp.flask = true;
}
