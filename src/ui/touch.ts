import type { InputState } from '../engine/input.ts';
import { clamp } from '../engine/util.ts';

export interface TouchVector {
  x: number; // -1..1
  y: number; // -1..1
}

export function computeJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.16,
): TouchVector {
  const dist = Math.hypot(dx, dy);
  if (dist <= maxRadius * deadzone || maxRadius <= 0) return { x: 0, y: 0 };
  const mag = clamp((dist - maxRadius * deadzone) / (maxRadius * (1 - deadzone)), 0, 1);
  return {
    x: (dx / dist) * mag,
    y: (dy / dist) * mag,
  };
}

export interface TouchCallbacks {
  onInteract: () => void;
  onSkill: (slot: number) => void;
}

/**
 * Virtual floating thumbstick + ergonomic action buttons for Mobile / Portrait Touch play.
 * Auto-enables on coarse-pointer touch screens and can be manually toggled in Options.
 */
export class TouchController {
  readonly root: HTMLElement;
  private readonly stickZone: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly inp: InputState;
  private readonly cbs: TouchCallbacks;

  enabled = false;
  private activeTouchId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly maxRadius = 46;
  private vec: TouchVector = { x: 0, y: 0 };

  constructor(root: HTMLElement, inp: InputState, cbs: TouchCallbacks) {
    this.root = root;
    this.inp = inp;
    this.cbs = cbs;

    this.root.innerHTML = `
      <div id="touchStickZone">
        <div id="touchStickBase"><div id="touchStickKnob"></div></div>
      </div>
      <div id="touchActions">
        <div class="tSkillRow">
          <button class="tBtn small" data-act="s1">1</button>
          <button class="tBtn small" data-act="s2">2</button>
          <button class="tBtn small" data-act="s3">3</button>
          <button class="tBtn small" data-act="s4">4</button>
        </div>
        <div class="tMainRow">
          <button class="tBtn" data-act="interact">E</button>
          <button class="tBtn" data-act="flask">♦</button>
          <button class="tBtn" data-act="parry">⛨</button>
          <button class="tBtn" data-act="roll">↻</button>
          <button class="tBtn primary" data-act="attack">⚔</button>
        </div>
      </div>
    `;

    this.stickZone = this.root.querySelector('#touchStickZone') as HTMLElement;
    this.stickKnob = this.root.querySelector('#touchStickKnob') as HTMLElement;

    this.bindStick();
    this.bindButtons();

    const isCoarse =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
    this.setEnabled(!!isCoarse);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) {
      this.vec = { x: 0, y: 0 };
      this.applyToInput();
    }
  }

  private bindStick(): void {
    const start = (id: number, x: number, y: number) => {
      if (this.activeTouchId !== null) return;
      this.activeTouchId = id;
      const rect = this.stickZone.getBoundingClientRect();
      this.originX = rect.left + rect.width * 0.5;
      this.originY = rect.top + rect.height * 0.5;
      this.updateStick(x, y);
    };
    const move = (id: number, x: number, y: number) => {
      if (id !== this.activeTouchId) return;
      this.updateStick(x, y);
    };
    const end = (id: number) => {
      if (id !== this.activeTouchId) return;
      this.activeTouchId = null;
      this.vec = { x: 0, y: 0 };
      this.stickKnob.style.transform = 'translate(0px, 0px)';
      this.applyToInput();
    };

    this.stickZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.stickZone.setPointerCapture(e.pointerId);
      start(e.pointerId, e.clientX, e.clientY);
    });
    this.stickZone.addEventListener('pointermove', (e) => {
      if (this.activeTouchId === e.pointerId) {
        e.preventDefault();
        move(e.pointerId, e.clientX, e.clientY);
      }
    });
    this.stickZone.addEventListener('pointerup', (e) => end(e.pointerId));
    this.stickZone.addEventListener('pointercancel', (e) => end(e.pointerId));
  }

  private updateStick(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    this.vec = computeJoystickVector(dx, dy, this.maxRadius);
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.maxRadius);
    const kx = dist > 0.1 ? (dx / dist) * clamped : 0;
    const ky = dist > 0.1 ? (dy / dist) * clamped : 0;
    this.stickKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    this.applyToInput();
  }

  private applyToInput(): void {
    this.inp.left = this.vec.x < -0.15 ? Math.abs(this.vec.x) : 0;
    this.inp.right = this.vec.x > 0.15 ? this.vec.x : 0;
    this.inp.up = this.vec.y < -0.15 ? Math.abs(this.vec.y) : 0;
    this.inp.down = this.vec.y > 0.15 ? this.vec.y : 0;
    if (Math.hypot(this.vec.x, this.vec.y) > 0.2) {
      this.inp.mouseActive = false;
    }
  }

  private bindButtons(): void {
    for (const btn of Array.from(this.root.querySelectorAll('.tBtn')) as HTMLButtonElement[]) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'attack') this.inp.attack = true;
        else if (act === 'roll') this.inp.roll = true;
        else if (act === 'parry') this.inp.parry = true;
        else if (act === 'flask') this.inp.flask = true;
        else if (act === 'interact') this.cbs.onInteract();
        else if (act === 's1') this.cbs.onSkill(1);
        else if (act === 's2') this.cbs.onSkill(2);
        else if (act === 's3') this.cbs.onSkill(3);
        else if (act === 's4') this.cbs.onSkill(4);
      });
    }
  }
}
