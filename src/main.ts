import './style.css';
import { AudioEngine } from './engine/audio.ts';
import { clearOneShotInputs, createInputState, pollGamepad } from './engine/input.ts';
import { loadOptions, ZOOM_PX } from './engine/options.ts';
import { Game } from './game/game.ts';
import { SceneRenderer } from './render/renderer.ts';
import { GameUI } from './ui/ui.ts';
import type { WorldObject } from './world/types.ts';
import { World } from './world/world.ts';

const FIXED_DT = 1 / 60;

function boot(): void {
  const options = loadOptions();
  const world = new World();
  const audio = new AudioEngine();
  const game = new Game(world, audio, options);

  const screenCv = document.getElementById('screen') as HTMLCanvasElement;
  const overlayCv = document.getElementById('overlay') as HTMLCanvasElement;
  const renderer = new SceneRenderer(screenCv, overlayCv, ZOOM_PX[options.zoom]);

  const startGame = (slot: number, load: boolean) => {
    audio.init(game.options);
    const saves = game.listSaves();
    const saveData = load ? saves[slot - 1] : null;
    if (saveData) {
      game.loadSaveData(saveData, slot);
    } else {
      game.newGame(slot);
    }
    ui.title(false);
    if (!saveData) {
      ui.banner('DUSKVALE', 'Trage die letzte Glut durch die ewige Dämmerung.', 'title', 4.5);
    }
  };

  const toTitle = () => {
    game.mode = 'title';
    game.resetWorldEnemies();
    ui.death(false);
    ui.title(true);
  };

  const ui = new GameUI(game, renderer, startGame, toTitle);
  game.ui = ui;
  ui.title(true);

  const inp = createInputState();
  const MOVE_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      ui.debugVisible = !ui.debugVisible;
      return;
    }
    if (e.repeat && !MOVE_KEYS[e.code]) return;
    audio.init(game.options);

    if (game.mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startGame(1, game.hasAnySave());
      }
      return;
    }

    if (ui.open === 'dialog') {
      if (['KeyE', 'Enter', 'Space', 'Escape'].includes(e.code)) {
        e.preventDefault();
        ui.dialogNext();
      }
      return;
    }
    if (ui.open === 'menu') {
      e.preventDefault();
      if (e.code === 'KeyW' || e.code === 'ArrowUp') ui.menuMove(-1);
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') ui.menuMove(1);
      else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') ui.menuActivate();
      else if (e.code === 'Escape' || e.code === 'Backspace') ui.menuBack();
      return;
    }
    if (ui.open === 'map') {
      if (e.code === 'KeyM' || e.code === 'Escape') ui.toggleMap();
      return;
    }
    if (ui.open === 'journal') {
      if (e.code === 'KeyJ' || e.code === 'Escape') ui.toggleJournal();
      return;
    }
    if (ui.open === 'inventory') {
      if (e.code === 'KeyI' || e.code === 'Escape') ui.toggleInventory();
      return;
    }

    const mv = MOVE_KEYS[e.code];
    if (mv) {
      inp[mv] = 1;
      e.preventDefault();
      if (!e.repeat && !inp.mouseHeld) inp.mouseActive = false;
      return;
    }

    switch (e.code) {
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
        inp.roll = true;
        e.preventDefault();
        break;
      case 'KeyF':
        inp.parry = true;
        break;
      case 'Tab':
        inp.lockOn = true;
        e.preventDefault();
        break;
      case 'KeyQ':
      case 'KeyR':
        inp.flask = true;
        break;
      case 'Digit1':
        inp.skillSlot = 1;
        break;
      case 'Digit2':
        inp.skillSlot = 2;
        break;
      case 'Digit3':
        inp.skillSlot = 3;
        break;
      case 'Digit4':
        inp.skillSlot = 4;
        break;
      case 'Digit5':
        inp.skillSlot = 5;
        break;
      case 'KeyE':
      case 'Enter':
        if (game.interact && !game.player.dead) game.interactNow();
        break;
      case 'KeyM':
        ui.toggleMap();
        break;
      case 'KeyJ':
        ui.toggleJournal();
        break;
      case 'KeyI':
        ui.toggleInventory();
        break;
      case 'KeyH':
        ui.toggleHelp();
        break;
      case 'Escape':
        ui.pauseMenu();
        break;
      case 'Equal':
      case 'NumpadAdd':
        ui.adjustZoom(1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        ui.adjustZoom(-1);
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    const mv = MOVE_KEYS[e.code];
    if (mv) inp[mv] = 0;
  });

  window.addEventListener('blur', () => {
    inp.up = inp.down = inp.left = inp.right = 0;
    inp.mouseHeld = false;
  });

  window.addEventListener('mousemove', (e) => {
    inp.mx = e.clientX;
    inp.my = e.clientY;
    inp.mouseActive = true;
  });

  window.addEventListener('mousedown', (e) => {
    audio.init(game.options);
    if (game.mode !== 'play') return;
    if (ui.open === 'dialog') {
      ui.dialogNext();
      return;
    }
    if (ui.open) return;
    inp.mouseActive = true;
    inp.mouseHeld = true;
    if (e.button === 0) inp.attack = true;
    else if (e.button === 1) {
      e.preventDefault();
      inp.lockOn = true;
    } else if (e.button === 2) inp.roll = true;
  });

  window.addEventListener('mouseup', () => {
    inp.mouseHeld = false;
    inp.mouseHoldTime = 0;
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => renderer.resize());

  // Dev / Playwright shortcut: #play or #play:x,y
  const hashMatch = /^#play(?::(-?\d+),(-?\d+))?$/.exec(location.hash);
  if (hashMatch) {
    startGame(1, false);
    if (hashMatch[1] !== undefined && hashMatch[2] !== undefined) {
      const tx = Number(hashMatch[1]) + 0.5;
      const ty = Number(hashMatch[2]) + 0.5;
      game.player.x = tx;
      game.player.y = ty;
      game.player.prevX = tx;
      game.player.prevY = ty;
      game.camera.snap(tx, ty);
    }
  }

  // Fixed 60 Hz simulation + interpolated rendering loop
  let last = performance.now();
  let accum = 0;
  const objs: WorldObject[] = [];

  function frame(now: number): void {
    const frameDt = Math.min(0.08, (now - last) / 1000);
    last = now;
    accum += frameDt;

    if (inp.mouseHeld) inp.mouseHoldTime += frameDt;
    const wpos = renderer.screenToWorld(inp.mx, inp.my);
    inp.wx = wpos.wx;
    inp.wy = wpos.wy;

    objs.length = 0;
    world.objectsIn(game.camera.x - 56, game.camera.y - 34, game.camera.x + 56, game.camera.y + 38, objs);

    let steps = 0;
    while (accum >= FIXED_DT && steps < 4) {
      if (!ui.open || game.mode === 'title') {
        pollGamepad(inp);
        game.update(FIXED_DT, inp, objs);
      }
      clearOneShotInputs(inp);
      accum -= FIXED_DT;
      steps++;
    }

    const alpha = accum / FIXED_DT;
    game.collectLights(objs);
    renderer.render(game, objs, alpha);
    ui.update(frameDt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

const ready =
  document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('600 12px "JetBrains Mono"'), new Promise((r) => setTimeout(r, 1200))])
    : Promise.resolve();

ready.then(boot, boot);
