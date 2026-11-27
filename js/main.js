'use strict';
(function (DV) {
  const G = DV.G, R = DV.R, UI = DV.UI, A = DV.A, W = DV.World;
  const inp = { up: 0, down: 0, left: 0, right: 0, attack: false, roll: false, flask: false, mouseActive: false, mx: 0, my: 0, wx: 0, wy: 0 };
  const objs = [];
  let last = performance.now();

  const main = (DV.main = {});
  main.start = function (load) {
    A.init();
    G.newGame(load);
    UI.title(false);
    if (!load) {
      UI.banner('DUSKVALE', 'Trage die letzte Glut durch die ewige Dämmerung.', 'title', 5);
      UI.toggleHelp(true);
      setTimeout(() => UI.toggleHelp(false), 9000);
    }
  };
  main.toTitle = function () {
    G.mode = 'title';
    G.resetWorldEnemies();
    UI.death(false);
    UI.title(true);
  };

  const KEYS = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat && !KEYS[e.code]) return;
    A.init();
    if (G.mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); main.start(G.hasSave()); }
      return;
    }
    if (UI.open === 'dialog') {
      if (['KeyE', 'Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); UI.dialogNext(); }
      return;
    }
    if (UI.open === 'menu') {
      e.preventDefault();
      if (e.code === 'KeyW' || e.code === 'ArrowUp') UI.menuMove(-1);
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') UI.menuMove(1);
      else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') UI.menuActivate();
      else if (e.code === 'Escape' || e.code === 'Backspace') UI.menuBack();
      return;
    }
    if (UI.open === 'map') {
      if (e.code === 'KeyM' || e.code === 'Escape') UI.toggleMap();
      return;
    }
    if (KEYS[e.code]) { inp[KEYS[e.code]] = 1; e.preventDefault(); if (!e.repeat && !inp.mouseHeld) inp.mouseActive = false; return; }
    switch (e.code) {
      case 'Space': case 'ShiftLeft': case 'ShiftRight': case 'KeyK': inp.roll = true; e.preventDefault(); break;
      case 'KeyJ': inp.attack = true; break;
      case 'KeyQ': case 'KeyR': inp.flask = true; break;
      case 'KeyE': case 'Enter': if (G.interact && !G.player.dead) G.interactNow(); break;
      case 'KeyM': UI.toggleMap(); break;
      case 'KeyH': UI.toggleHelp(); break;
      case 'Escape': UI.pauseMenu(); break;
      case 'Equal': case 'NumpadAdd': R.fontPx = Math.min(18, R.fontPx + 1); R.resize(); break;
      case 'Minus': case 'NumpadSubtract': R.fontPx = Math.max(8, R.fontPx - 1); R.resize(); break;
    }
  });
  window.addEventListener('keyup', (e) => { if (KEYS[e.code]) inp[KEYS[e.code]] = 0; });
  window.addEventListener('blur', () => { inp.up = inp.down = inp.left = inp.right = 0; });

  window.addEventListener('mousemove', (e) => {
    inp.mx = e.clientX; inp.my = e.clientY; inp.mouseActive = true;
  });
  window.addEventListener('mousedown', (e) => {
    A.init();
    if (G.mode !== 'play') return;
    if (UI.open === 'dialog') { UI.dialogNext(); return; }
    if (UI.open) return;
    inp.mouseActive = true;
    if (e.button === 0) inp.attack = true;
    else if (e.button === 2) inp.roll = true;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => R.resize());

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    inp.wx = R.camX + inp.mx / R.CW;
    inp.wy = R.camY + inp.my / R.CH;

    objs.length = 0;
    W.objectsIn(R.camX - 6, R.camY - 2, R.camX + R.cols + 6, R.camY + R.rows + 9, objs);

    if (!UI.open || G.mode === 'title') G.update(dt, inp, objs);
    else { inp.attack = inp.roll = inp.flask = false; }

    G.collectLights(objs);
    R.render(G, objs);
    UI.update(G, dt);
    requestAnimationFrame(frame);
  }

  function boot() {
    R.init(document.getElementById('screen'), document.getElementById('bloom'));
    UI.init();
    G.player = null;
    G.cam.x = -30; G.cam.y = 6;
    UI.title(true);
    // Dev shortcut: #play or #play:x,y starts immediately (optionally at a world position).
    const m = /^#play(?::(-?\d+),(-?\d+))?$/.exec(location.hash);
    if (m) {
      main.start(false);
      if (m[1] !== undefined) { G.player.x = +m[1] + 0.5; G.player.y = +m[2] + 0.5; G.cam.x = G.player.x; G.cam.y = G.player.y; }
    }
    requestAnimationFrame((t) => { last = t; frame(t); });
  }

  const ready = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('12px "IBM Plex Mono"'), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  ready.then(boot, boot);
})(window.DV);
