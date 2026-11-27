import './style.css';
import { AudioEngine } from './engine/audio.ts';
import { clearOneShotInputs, createInputState, sampleTickInput } from './engine/input.ts';
import { loadOptions, ZOOM_PX } from './engine/options.ts';
import { Game } from './game/game.ts';
import { knightAnimationFrame } from './game/knight.ts';
import { WEAPONS } from './game/rpg.ts';
import type { AnimPose } from './game/pixelSprites.ts';
import { MultiplayerClient } from './net/client.ts';
import { SceneRenderer } from './render/renderer.ts';
import { TouchController } from './ui/touch.ts';
import { GameUI } from './ui/ui.ts';
import type { Chunk, WorldObject } from './world/types.ts';
import { World } from './world/world.ts';

const FIXED_DT = 1 / 60;

function boot(): void {
  const options = loadOptions();
  const world = new World();
  const audio = new AudioEngine();
  const game = new Game(world, audio, options);
  const net = new MultiplayerClient(options.playerName);
  net.setPhantomsEnabled(options.showPhantoms);

  // Optional Web Worker chunk prefetcher so exploration stays 60fps
  let chunkWorker: Worker | null = null;
  const workerRequested = new Set<string>();
  try {
    chunkWorker = new Worker(new URL('./world/chunkWorker.ts', import.meta.url), { type: 'module' });
    chunkWorker.onmessage = (ev: MessageEvent<Chunk>) => {
      world.injectChunk(ev.data);
    };
  } catch {
    chunkWorker = null;
  }

  const screenCv = document.getElementById('screen') as HTMLCanvasElement;
  const overlayCv = document.getElementById('overlay') as HTMLCanvasElement;
  const renderer = new SceneRenderer(screenCv, overlayCv, ZOOM_PX[options.zoom]);

  const inp = createInputState();
  const tickInput = createInputState();
  const touchRoot = document.getElementById('touchControls') as HTMLElement;
  const touch = new TouchController(touchRoot, inp, {
    onInteract: () => {
      if (game.interact && !game.player.dead) game.interactNow();
    },
    onSkill: (slot) => game.useSkill(slot),
  });
  if (options.touchControls) touch.setEnabled(true);

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
    const params = new URLSearchParams(location.search);
    net.connect(params.get('server'));
    if (!saveData) {
      ui.banner('DUSKVALE', 'Trage die letzte Glut durch die ewige Dämmerung.', 'title', 4.5);
    }
  };

  const toTitle = () => {
    game.mode = 'title';
    game.resetWorldEnemies();
    net.disconnect();
    ui.death(false);
    ui.title(true);
  };

  const ui = new GameUI(game, renderer, net, touch, startGame, toTitle);
  game.ui = ui;
  ui.title(true);

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
    if (ui.open === 'chat') {
      if (e.code === 'Escape') {
        e.preventDefault();
        ui.closeChat();
      }
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
      case 'KeyT':
        e.preventDefault();
        ui.openChat();
        break;
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
  window.addEventListener('beforeunload', () => net.disconnect());

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

  let last = performance.now();
  let accum = 0;
  let prefetchT = 0;
  const objs: WorldObject[] = [];

  function frame(now: number): void {
    const frameDt = Math.min(0.08, (now - last) / 1000);
    last = now;
    accum += frameDt;

    if (inp.mouseHeld) inp.mouseHoldTime += frameDt;
    const wpos = renderer.screenToWorld(inp.mx, inp.my);
    inp.wx = wpos.wx;
    inp.wy = wpos.wy;

    // Background Web Worker chunk prefetching around camera (overworld only)
    prefetchT -= frameDt;
    if (chunkWorker && !game.inDungeon && prefetchT <= 0) {
      prefetchT = 0.4;
      const ccx = Math.floor(game.camera.x) >> 5;
      const ccy = Math.floor(game.camera.y) >> 5;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const key = `${ccx + dx},${ccy + dy}`;
          if (!world.chunks.has(key) && !workerRequested.has(key)) {
            workerRequested.add(key);
            chunkWorker.postMessage({ cx: ccx + dx, cy: ccy + dy });
          }
        }
      }
    }

    objs.length = 0;
    game.world.objectsIn(game.camera.x - 64, game.camera.y - 44, game.camera.x + 64, game.camera.y + 44, objs);

    let steps = 0;
    while (accum >= FIXED_DT && steps < 4) {
      if (!ui.open || game.mode === 'title') {
        sampleTickInput(inp, tickInput);
        game.update(FIXED_DT, tickInput, objs);
      }
      clearOneShotInputs(inp);
      accum -= FIXED_DT;
      steps++;
    }

    // Update Multiplayer / Co-op state
    if (game.mode === 'play') {
      const p = game.player;
      let pose: AnimPose = 'idle';
      if (p.roll > 0) pose = 'roll';
      else if (p.parry > 0) pose = 'parry';
      else if (p.drink > 0) pose = 'drink';
      else if (p.atk > 0.04) pose = p.combo === 0 ? 'attack1' : p.combo === 1 ? 'attack2' : 'attack3';
      else if (p.moving) pose = 'walk';
      const weapon = WEAPONS[p.weaponId] || WEAPONS.iron_sword;
      const fr = knightAnimationFrame(pose, game.t, p.walkT, p.atk, weapon.speed * 0.9, p.roll);

      net.update(frameDt, {
        x: p.x,
        y: p.y,
        face: p.face,
        lvl: p.lvl,
        hp: p.hp,
        maxHp: game.maxHp(),
        weaponId: p.weaponId,
        armorId: p.armorId,
        pose,
        frame: fr,
      });
    }

    const alpha = accum / FIXED_DT;
    game.collectLights(objs);
    renderer.render(game, objs, alpha, game.mode === 'play' ? net.getRemoteList() : []);
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
