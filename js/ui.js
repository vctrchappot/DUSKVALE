'use strict';
(function (DV) {
  const UI = (DV.UI = { open: null });
  const $ = (id) => document.getElementById(id);
  let el = {};
  let bannerT = 0, last = {};

  UI.init = function () {
    el = {
      hud: $('hud'), hp: $('hp'), st: $('st'), flasks: $('flasks'), embers: $('embers'), sigils: $('sigils'), lvl: $('lvl'),
      boss: $('boss'), bossName: $('bossName'), bossBar: $('bossBar'), banner: $('banner'), bTitle: $('bTitle'), bSub: $('bSub'),
      prompt: $('prompt'), dialog: $('dialog'), dTitle: $('dTitle'), dText: $('dText'), menu: $('menu'), mTitle: $('mTitle'),
      mItems: $('mItems'), mInfo: $('mInfo'), death: $('death'), title: $('title'), tMenu: $('tMenu'), map: $('map'),
      mapWrap: $('mapWrap'), help: $('help'), hurt: $('hurt'), weather: $('weather'),
    };
  };

  function bar(v, max, len) {
    const n = Math.max(0, Math.min(len, Math.round((v / max) * len)));
    return '[' + '|'.repeat(n) + '·'.repeat(len - n) + ']';
  }
  function setText(node, key, txt) {
    if (last[key] !== txt) { last[key] = txt; node.textContent = txt; }
  }

  UI.update = function (G, dt) {
    const p = G.player;
    const playing = G.mode === 'play';
    el.hud.classList.toggle('hidden', !playing);
    if (playing && p) {
      const hl = Math.min(44, Math.round(p.maxHp() / 4.5));
      const sl = Math.min(40, Math.round(p.maxSt() / 5));
      setText(el.hp, 'hp', `LP  ${bar(p.hp, p.maxHp(), hl)} ${Math.max(0, Math.ceil(p.hp))}`);
      setText(el.st, 'st', `AUS ${bar(Math.max(0, p.st), p.maxSt(), sl)}`);
      setText(el.flasks, 'fl', `Glutflakons  ${'♦'.repeat(p.flasks)}${'◇'.repeat(Math.max(0, p.maxFlasks - p.flasks))}`);
      setText(el.embers, 'em', `${p.embers}`);
      setText(el.lvl, 'lv', `Stufe ${p.lvl}`);
      const sg = ['wight', 'matron', 'corvus'].map((b) => (G.flags.bosses.has(b) ? '◆' : '◇')).join(' ');
      setText(el.sigils, 'sg', `Siegel ${sg}`);
      const w = { klar: 'Klare Dämmerung', nebel: 'Nebel', regen: 'Regen', sturm: 'Sturm' }[G.weather.kind];
      const tod = G.flags.victory ? 'Morgen' : G.night > 0.6 ? 'Tiefe Nacht' : G.night > 0.3 ? 'Nacht' : 'Dämmerung';
      setText(el.weather, 'wx', `${tod} · ${w}`);
      if (G.boss) {
        el.boss.classList.remove('hidden');
        setText(el.bossName, 'bn', G.boss.d.name);
        setText(el.bossBar, 'bb', bar(G.boss.hp, G.boss.maxHp, 60));
      } else el.boss.classList.add('hidden');
      const it = G.interact;
      const pt = it && !UI.open && !p.dead ? `[E] ${it.label}` : '';
      setText(el.prompt, 'pr', pt);
      el.prompt.classList.toggle('hidden', !pt);
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
  };

  UI.banner = function (title, sub, style, dur) {
    el.bTitle.textContent = title;
    el.bSub.textContent = sub || '';
    el.banner.className = 'show ' + (style || '');
    bannerT = dur || 3;
  };

  UI.hurtFlash = function () {
    el.hurt.style.transition = 'none';
    el.hurt.style.opacity = '1';
    requestAnimationFrame(() => { el.hurt.style.transition = 'opacity .6s'; el.hurt.style.opacity = '0'; });
  };

  UI.death = function (show) {
    el.death.classList.toggle('hidden', !show);
    if (show) { el.death.classList.remove('fade'); void el.death.offsetWidth; el.death.classList.add('fade'); }
  };

  // ------------------------------------------------------------ Dialog
  let dLines = [], dIdx = 0, dCb = null;
  UI.dialog = function (title, lines, cb) {
    dLines = lines; dIdx = 0; dCb = cb || null;
    el.dTitle.textContent = title;
    el.dText.textContent = lines[0];
    el.dialog.classList.remove('hidden');
    UI.open = 'dialog';
  };
  UI.dialogNext = function () {
    dIdx++;
    if (dIdx >= dLines.length) {
      el.dialog.classList.add('hidden');
      UI.open = null;
      if (dCb) dCb();
    } else el.dText.textContent = dLines[dIdx];
  };

  // ------------------------------------------------------------ Menus
  let mItems = [], mSel = 0, mBack = null;
  UI.menu = function (title, items, back, info) {
    mItems = items; mBack = back || null;
    mSel = Math.max(0, items.findIndex((i) => !i.disabled));
    el.mTitle.textContent = title;
    el.mInfo.textContent = info || '';
    el.mItems.innerHTML = '';
    items.forEach((it, k) => {
      const b = document.createElement('button');
      b.className = 'item' + (it.disabled ? ' disabled' : '');
      b.innerHTML = `<span class="lab"></span><span class="sub"></span>`;
      b.querySelector('.lab').textContent = it.label;
      b.querySelector('.sub').textContent = it.sub || '';
      b.addEventListener('mouseenter', () => { mSel = k; paint(); });
      b.addEventListener('click', (ev) => { ev.stopPropagation(); mSel = k; UI.menuActivate(); });
      el.mItems.appendChild(b);
    });
    paint();
    el.menu.classList.remove('hidden');
    UI.open = 'menu';
  };
  function paint() {
    [...el.mItems.children].forEach((b, k) => b.classList.toggle('sel', k === mSel));
  }
  UI.menuMove = function (d) {
    if (!mItems.length) return;
    let k = mSel;
    for (let n = 0; n < mItems.length; n++) {
      k = (k + d + mItems.length) % mItems.length;
      if (!mItems[k].disabled) break;
    }
    mSel = k; paint();
  };
  UI.menuActivate = function () {
    const it = mItems[mSel];
    if (it && !it.disabled && it.action) it.action();
  };
  UI.menuBack = function () {
    if (mBack) mBack(); else UI.closeMenu();
  };
  UI.closeMenu = function () {
    el.menu.classList.add('hidden');
    UI.open = null;
  };

  UI.shrineMenu = function (f) {
    const G = DV.G, p = G.player;
    const name = (G.shrineInfo[f.id] && G.shrineInfo[f.id].name) || 'Schrein';
    UI.menu(name, [
      { label: 'Glut opfern', sub: 'Stufe aufsteigen', action: () => UI.levelMenu(f) },
      { label: 'Reisen', sub: 'Zu einem entzündeten Schrein', action: () => UI.travelMenu(f), disabled: Object.keys(G.shrineInfo).length < 2 },
      { label: 'Weiterziehen', sub: '', action: () => UI.closeMenu() },
    ], null, `Du rastest. Leben und Flakons sind erneuert – doch die Toten erheben sich wieder.   Glut: ${p.embers}`);
  };
  UI.levelMenu = function (f) {
    const G = DV.G, p = G.player, c = G.levelCost();
    const can = p.embers >= c;
    const mk = (stat, label, desc) => ({
      label: `${label}  ${p[stat]}`, sub: desc, disabled: !can,
      action: () => { if (G.levelUp(stat)) UI.levelMenu(f); },
    });
    UI.menu('Glut opfern', [
      mk('vig', 'Vitalität', '+14 Lebenspunkte'),
      mk('mig', 'Stärke', '+4.5 Schaden'),
      mk('end', 'Ausdauer', '+10 Ausdauer'),
      { label: 'Zurück', action: () => UI.shrineMenu(f) },
    ], () => UI.shrineMenu(f), `Stufe ${p.lvl}  ·  Kosten ${c} Glut  ·  Du besitzt ${p.embers}`);
  };
  UI.travelMenu = function (f) {
    const G = DV.G;
    const items = Object.entries(G.shrineInfo).map(([id, s]) => ({
      label: s.name, sub: id === f.id ? 'hier' : `${Math.round(s.x)}, ${Math.round(s.y)}`, disabled: id === f.id,
      action: () => { UI.closeMenu(); G.travel(id); DV.A.chime(); },
    }));
    items.push({ label: 'Zurück', action: () => UI.shrineMenu(f) });
    UI.menu('Reisen', items, () => UI.shrineMenu(f));
  };
  UI.pauseMenu = function () {
    const A = DV.A;
    UI.menu('Pause', [
      { label: 'Weiter', action: () => UI.closeMenu() },
      { label: 'Karte', sub: 'M', action: () => { UI.closeMenu(); UI.toggleMap(); } },
      { label: 'Steuerung', sub: 'H', action: () => { UI.closeMenu(); UI.toggleHelp(true); } },
      { label: A.muted ? 'Ton an' : 'Ton aus', action: () => { A.setMuted(!A.muted); UI.pauseMenu(); } },
      { label: 'Zum Titel', sub: 'Fortschritt wird an Schreinen gespeichert', action: () => { UI.closeMenu(); DV.main.toTitle(); } },
    ]);
  };

  // ------------------------------------------------------------ Title
  UI.title = function (show) {
    el.title.classList.toggle('hidden', !show);
    if (!show) return;
    const has = DV.G.hasSave();
    el.tMenu.innerHTML = '';
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      el.tMenu.appendChild(b);
    };
    if (has) add('Fortsetzen', () => DV.main.start(true));
    add(has ? 'Neues Spiel' : 'Beginnen', () => DV.main.start(false));
  };

  UI.toggleHelp = function (force) {
    const show = force !== undefined ? force : el.help.classList.contains('hidden');
    el.help.classList.toggle('hidden', !show);
  };

  // ------------------------------------------------------------ Map
  UI.toggleMap = function () {
    if (UI.open === 'map') { el.mapWrap.classList.add('hidden'); UI.open = null; return; }
    if (UI.open) return;
    UI.open = 'map';
    el.mapWrap.classList.remove('hidden');
    drawMap();
  };
  function drawMap() {
    const G = DV.G, W = DV.World, R = DV.R, T = W.T;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const k of W.visited) {
      const [cx, cy] = k.split(',').map(Number);
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
    }
    if (x0 > x1) return;
    const w = (x1 - x0 + 1) * 32, h = (y1 - y0 + 1) * 32;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w, h);
    for (const k of W.visited) {
      const [cx, cy] = k.split(',').map(Number);
      const c = W.chunks.get(k);
      if (!c) continue;
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
        const t = c.type[j * 32 + i];
        let col = R.TS[t].c;
        const s = c.shade[j * 32 + i] * (c.solid[j * 32 + i] ? 0.6 : 1);
        const o = (((cy - y0) * 32 + j) * w + (cx - x0) * 32 + i) * 4;
        const gain = t === T.ROAD || t === T.WALL ? 520 : 420;
        img.data[o] = col[0] * s * gain; img.data[o + 1] = col[1] * s * gain; img.data[o + 2] = col[2] * s * gain; img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    const cv = el.map;
    const maxW = window.innerWidth * 0.86, maxH = window.innerHeight * 0.78;
    const scale = Math.min(maxW / w, maxH / (h * DV.ASP));
    cv.width = Math.round(w * scale); cv.height = Math.round(h * DV.ASP * scale);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off, 0, 0, cv.width, cv.height);
    const toS = (x, y) => [(x - x0 * 32) * scale, (y - y0 * 32) * DV.ASP * scale];
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    for (const L of W.LANDMARKS) {
      const key = (L.x >> 5) + ',' + (L.y >> 5);
      if (!W.visited.has(key)) continue;
      const [sx, sy] = toS(L.x, L.y);
      ctx.fillStyle = '#d8c9a3';
      ctx.fillText(L.name, sx, sy - 10);
      ctx.fillText('✠', sx, sy + 4);
    }
    for (const id in G.shrineInfo) {
      const s = G.shrineInfo[id];
      const [sx, sy] = toS(s.x, s.y);
      ctx.fillStyle = '#ff9a3c';
      ctx.fillText('▲', sx, sy + 4);
    }
    if (G.lost) { const [sx, sy] = toS(G.lost.x, G.lost.y); ctx.fillStyle = '#ffd27a'; ctx.fillText('*', sx, sy + 4); }
    const [px, py] = toS(G.player.x, G.player.y);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
  }
})(window.DV);
