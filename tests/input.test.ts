import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInputState, sampleTickInput } from '../src/engine/input.ts';

describe('movement input', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps keyboard movement usable when the host blocks gamepad access', () => {
    vi.stubGlobal('navigator', { getGamepads() { throw new DOMException('Blocked', 'SecurityError'); } });
    const keyboard = createInputState();
    keyboard.up = 1;
    const tick = createInputState();
    sampleTickInput(keyboard, tick);
    expect(tick.up).toBe(1);
  });

  it('releases old stick directions when reversing, centering and disconnecting', () => {
    const pad = { axes: [-1, 0], buttons: [] };
    const pads: (typeof pad)[] = [pad];
    vi.stubGlobal('navigator', { getGamepads: () => pads });
    const keyboard = createInputState();
    keyboard.up = 1;
    const tick = createInputState();
    for (const axis of [-1, 1, 0, 1]) {
      pad.axes[0] = axis;
      sampleTickInput(keyboard, tick);
      expect([tick.left, tick.right, tick.up]).toEqual([Number(axis < 0), Number(axis > 0), 1]);
    }
    pads.length = 0;
    sampleTickInput(keyboard, tick);
    expect(tick).toEqual(keyboard);
    expect(keyboard.right).toBe(0);
  });
});
