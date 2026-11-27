'use strict';
(function (DV) {
  const { clamp, lerp, hash, ASP, dist, rand, pick } = DV;
  const W = DV.World, T = W.T, S = DV.S, A = DV.A;
  const TAU = Math.PI * 2;
  const PCY = 4; // player sprite centre, rows above the feet

  // ------------------------------------------------------------ Palettes & types
  const PAL = {
    knight: [[0.78, 0.8, 0.86], [0.62, 0.13, 0.1], [0.75, 0.6, 0.3], [1, 0.75, 0.3]],
    ghoul: [[0.5, 0.45, 0.4], [0.52, 0.6, 0.42], [0.6, 0.5, 0.4], [1, 0.25, 0.12]],
    wolf: [[0.55, 0.55, 0.6], [0.4, 0.35, 0.3], [0.5, 0.5, 0.5], [1, 0.7, 0.2]],
    bone: [[0.5, 0.38, 0.3], [0.5, 0.48, 0.42], [0.88, 0.85, 0.75], [0.4, 0.8, 1]],
    wraith: [[0.5, 0.6, 0.85], [0.38, 0.55, 0.95], [0.75, 0.85, 1], [0.7, 0.95, 1]],
    wight: [[0.85, 0.7, 0.3], [0.45, 0.42, 0.38], [0.92, 0.88, 0.78], [1, 0.2, 0.15]],
    matron: [[0.4, 0.7, 0.6], [0.22, 0.6, 0.5], [0.6, 0.95, 0.82], [0.5, 1, 0.7]],
    corvus: [[0.34, 0.31, 0.3], [0.62, 0.22, 0.06], [0.95, 0.5, 0.2], [1, 0.55, 0.1]],
    bishop: [[0.9, 0.75, 0.3], [0.6, 0.07, 0.09], [0.9, 0.88, 0.82], [1, 0.2, 0.2]],
    pilgrim: [[0.6, 0.55, 0.4], [0.42, 0.32, 0.22], [0.6, 0.5, 0.4], [1, 0.75, 0.35]],
    maren: [[0.7, 0.68, 0.62], [0.3, 0.3, 0.38], [0.6, 0.5, 0.4], [1, 0.75, 0.35]],
  };
  PAL.wraith.em = 0.35; PAL.matron.em = 0.4; PAL.corvus.em = 0.08;

  const ET = {
    ghoul: { name: 'Ghul', hp: 42, dmg: 12, spd: 9, aggro: 26, range: 3.4, windup: 0.45, recover: 0.65, embers: 28, spr: 'ghoul', pal: PAL.ghoul, lunge: 9, blood: [0.45, 0.03, 0.03] },
    wolf: { name: 'Aschwolf', hp: 30, dmg: 10, spd: 17, aggro: 34, range: 4.5, windup: 0.32, recover: 0.55, embers: 24, spr: 'wolf', pal: PAL.wolf, lunge: 26, blood: [0.5, 0.04, 0.04] },
    skeleton: { name: 'Grabwächter', hp: 58, dmg: 16, spd: 8, aggro: 24, range: 4, windup: 0.6, recover: 0.75, embers: 42, spr: 'skeleton', pal: PAL.bone, lunge: 8, blood: [0.75, 0.72, 0.65] },
    wraith: { name: 'Irrlicht', hp: 38, dmg: 13, spd: 7, aggro: 36, range: 3, ranged: 26, windup: 0.8, recover: 1.0, embers: 46, spr: 'wraith', pal: PAL.wraith, float: 1, lunge: 6, blood: [0.4, 0.6, 1], proj: [0.5, 0.8, 1] },
    wight: { boss: 1, name: 'Vael, der Gebeinkönig', hp: 540, dmg: 21, spd: 8.5, aggro: 26, range: 7, windup: 0.55, recover: 0.7, embers: 900, spr: 'skeletonBig', pal: PAL.wight, lunge: 12, blood: [0.8, 0.78, 0.7], attacks: ['swing', 'swing', 'slam', 'summon', 'charge'], minion: 'skeleton', sigil: 'Knochen', proj: [1, 0.3, 0.2] },
    matron: { boss: 1, name: 'Die Ertrunkene Mutter', hp: 580, dmg: 18, spd: 7, aggro: 30, range: 6, windup: 0.6, recover: 0.8, embers: 1100, spr: 'wraithBig', pal: PAL.matron, float: 1, lunge: 8, blood: [0.4, 0.9, 0.7], attacks: ['volley', 'volley', 'blink', 'swing', 'summon'], minion: 'wraith', sigil: 'Flut', proj: [0.4, 1, 0.75] },
    corvus: { boss: 1, name: 'Corvus, der Aschenritter', hp: 700, dmg: 24, spd: 11, aggro: 28, range: 7, windup: 0.5, recover: 0.6, embers: 1400, spr: 'knightBig', pal: PAL.corvus, lunge: 16, blood: [1, 0.45, 0.1], attacks: ['swing', 'swing', 'charge', 'slam', 'volley'], sigil: 'Asche', proj: [1, 0.5, 0.1] },
    bishop: { boss: 1, final: 1, name: 'Der Bleiche Bischof', hp: 1150, dmg: 26, spd: 8, aggro: 30, range: 7, windup: 0.6, recover: 0.7, embers: 4000, spr: 'bishopBig', pal: PAL.bishop, lunge: 12, blood: [0.6, 0.05, 0.08], attacks: ['volley', 'blink', 'slam', 'charge', 'summon', 'swing', 'swing'], minion: 'wraith', proj: [1, 0.2, 0.25] },
  };
  const SIGIL_BOSSES = ['wight', 'matron', 'corvus'];

  // ------------------------------------------------------------ Text
  const LORE = {
    start: ['Eingemeißelt in den Sockel: »Solange eine Glut brennt, ist die Nacht nicht vollkommen.«'],
    barrow: ['»Vael legte seine Krone nie ab. Nicht im Leben, nicht im Grab. Nun trägt er sie für den Bischof.«'],
    chapel: ['»Als die Glocken verstummten, stieg das Moor. Die Mutter blieb, um die Ertrunkenen zu wiegen – und weckt sie bis heute.«'],
    keep: ['»Corvus schwor, die Feste zu halten, bis der letzte Stein fällt. Die Steine fielen. Er hält sie noch immer.«'],
    cathedral: ['Über dem Tor, in rissigem Gold: »Drei Siegel binden das Tor – Knochen, Flut und Asche. Wer sie trägt, darf eintreten.«'],
    generic: [
      '»Wir zählten die Tage nach den Glocken. Dann schwiegen die Glocken.«',
      'Eine verwitterte Stele: »Hier ruht, wer zu lange in das Licht sah.«',
      '»Der Bischof versprach uns ewigen Abend. Niemand fragte, was nach dem Abend kommt.«',
      '»Die Wölfe aus Asche fürchten nur eines: die Glut, aus der sie entstanden.«',
      '»Folge den alten Straßen. Sie erinnern sich an die Pilger, auch wenn die Pilger sich an nichts mehr erinnern.«',
      '»Irrlichter singen im Moor. Wer antwortet, wird Teil des Chors.«',
      '»Jede Glut erlischt. Doch nicht jede Glut weiß das.«',
      'Kratzspuren im Stein, darunter: »Er kam zurück. Er kommt immer zurück.«',
      '»Die Sonne ging nicht unter. Sie wurde eingesperrt.«',
      '»Trink nicht aus dem Moor. Trink nicht aus dem Moor. Trink nicht –«',
      '»Ein Schrein erinnert sich an jeden, der an ihm ruhte. Darum kehren wir zurück.«',
    ],
  };
  const PILGRIM_LINES = [
    ['Ich laufe nach Norden, seit ich denken kann. Die Kathedrale kommt nie näher.'],
    ['Hast du die Irrlichter gehört? Sie rufen meinen Namen. Ich weiß nicht mehr, ob es meiner ist.'],
    ['Die Schreine… sie wärmen nicht. Aber sie erinnern sich. Das ist mehr, als ich von mir sagen kann.'],
    ['Im Süden brennt die Feste noch immer. Asche fällt dort wie Schnee.'],
    ['Geh mit der Glut, Wanderer. Ich habe meine schon vor langer Zeit verloren.'],
  ];
  const MAREN = [
    ['Ah… noch ein Wanderer, der die letzte Glut trägt.',
      'Seit der Bleiche Bischof die Sonne in seiner Kathedrale gefangen hält, endet die Dämmerung nie.',
      'Drei Heilige hüteten einst die Siegel: Knochen, Flut und Asche. Nun sind sie seine Wächter.',
      'Im Westen liegt das Hügelgrab des Heiligen Vael. Im Osten, im Moor, die Ertrunkene Kapelle. Im Süden die Aschenfeste.',
      'Entzünde die Schreine auf deinem Weg. Sie halten die Dunkelheit fern – und holen dich zurück, wenn sie dich verschlingt.'],
    ['Die Kathedrale liegt im Norden, hinter dem toten Platz. Ihr Tor öffnet sich nur für drei Siegel.'],
    ['Die alten Straßen führen zu den Heiligen. Folge ihnen, wenn der Nebel dich verwirrt.'],
  ];

  // ------------------------------------------------------------ State
  const G = (DV.G = {
    t: 0, mode: 'title', paused: false,
    flags: { shrines: new Set(), bosses: new Set(), lore: new Set(), gateOpen: false, victory: false },
    shrineInfo: {},
    enemies: [], npcs: [], pickups: [], projectiles: [], particles: [], floaters: [], telegraphs: [],
    decals: new Map(), lights: [], drawables: [], rain: [], fireflies: [],
    weather: { rain: 0.45, fog: 0.25, wind: 0.5, cloud: 0.6, kind: 'regen', timer: 80, target: null },
    amb: [0.4, 0.35, 0.4], fogColor: [0.48, 0.5, 0.58], cloud: 0, flash: 0, night: 0, clock: 0.03, dawn: 0,
    cam: { x: 0, y: 0 }, shake: 0, hitstop: 0, spawned: new Set(), killed: new Set(), boss: null,
    lastShrine: { x: 0, y: 2, id: 'shrine@0,0' }, lost: null, area: null, biome: 0, biomeT: 0, interact: null,
    PAL, ET,
  });

  const WK = {
    klar: { rain: 0, fog: 0.1, wind: 0.25, cloud: 0.35 },
    nebel: { rain: 0, fog: 0.8, wind: 0.1, cloud: 0.2 },
    regen: { rain: 0.55, fog: 0.25, wind: 0.5, cloud: 0.6 },
    sturm: { rain: 1, fog: 0.2, wind: 1, cloud: 0.85 },
  };
  G.weather.target = WK.regen;

  // ------------------------------------------------------------ Entities
  function moveEnt(e, dx, dy) {
    const solid = (x, y) => {
      if (!W.isSolid(x, y)) return false;
      if (e.float) { const t = W.typeAt(x, y); return !W.WATERY[t]; }
      return true;
    };
    let moved = false;
    if (dx) { const nx = e.x + dx; if (!solid(nx, e.y)) { e.x = nx; moved = true; } }
    if (dy) { const ny = e.y + dy; if (!solid(e.x, ny)) { e.y = ny; moved = true; } }
    return moved;
  }
  function stepToward(e, tx, ty, spd, dt) {
    const dx = tx - e.x, dy = (ty - e.y) * ASP;
    const d = Math.hypot(dx, dy);
    if (d < 0.4) return false;
    const nx = dx / d, ny = dy / d;
    const ok = moveEnt(e, nx * spd * dt, (ny * spd * dt) / ASP);
    if (!ok) moveEnt(e, -ny * spd * dt, (nx * spd * dt) / ASP);
    e.walkT += dt;
    if (Math.abs(nx) > 0.2) e.face = nx > 0 ? 1 : -1;
    return true;
  }

  function Player() {
    Object.assign(this, {
      x: 0.5, y: 3.5, face: 1, aimX: 1, aimY: 0, hp: 100, st: 100, lvl: 1, vig: 1, mig: 1, end: 1, embers: 0,
      flasks: 3, maxFlasks: 3, atk: 0, atkCD: 0, hitPending: 0, combo: 0, roll: 0, rollX: 0, rollY: 0, iframes: 0,
      drink: 0, healPending: false, stDelay: 0, hurtT: 0, dead: false, deadT: 0, walkT: 0, moving: false,
    });
    this.hp = this.maxHp(); this.st = this.maxSt();
  }
  Player.prototype.maxHp = function () { return 90 + (this.vig - 1) * 14; };
  Player.prototype.maxSt = function () { return 90 + (this.end - 1) * 10; };
  Player.prototype.dmg = function () { return 16 + (this.mig - 1) * 4.5; };
  Player.prototype.view = function () {
    const set = S.CR.knight;
    let fr;
    if (this.roll > 0) fr = set.roll[0];
    else if (this.atk > 0.08) fr = set.attack[0];
    else if (this.drink > 0) fr = set.drink[0];
    else fr = set.idle[this.moving ? Math.floor(this.walkT * 7) % 2 : 0];
    return { spr: fr, pal: PAL.knight, flip: this.face < 0, flash: this.hurtT > 0.22, alpha: 1 };
  };

  function Enemy(type, x, y, id, ck) {
    const d = ET[type];
    Object.assign(this, {
      type, d, x, y, hx: x, hy: y, id, ck, hp: d.hp, maxHp: d.hp, state: 'idle', st: rand(0, 2), face: 1, flash: 0,
      ax: 1, ay: 0, cd: rand(0.5, 1.5), walkT: rand(0, 1), kbx: 0, kby: 0, hitDone: false, atk: null, phase: 1,
      dead: false, tx: x, ty: y, lv: 0, float: !!d.float, boss: !!d.boss, minion: false,
    });
    this.rad = d.boss ? 2.6 : 1.1;
    this.h = S.CR[d.spr].idle[0].h;
  }
  Enemy.prototype.view = function () {
    const set = S.CR[this.d.spr];
    let fr;
    if (this.state === 'attack' || (this.state === 'windup' && this.st < 0.2)) fr = (set.attack || set.idle)[0];
    else fr = set.idle[Math.floor(this.walkT * 6) % set.idle.length];
    const tele = this.state === 'windup' && this.st < 0.3 && ((G.t * 18) | 0) % 2 === 0;
    let alpha = 1, lift = 0;
    if (this.float) { alpha = 0.72 + 0.2 * Math.sin(G.t * 5 + this.hx); lift = -1 + Math.round(Math.sin(G.t * 2 + this.hx) * 0.6); }
    if (this.state === 'blinkout') alpha = 0.2;
    return { spr: fr, pal: this.d.pal, flip: this.face < 0, flash: this.flash > 0 || tele, alpha, lift };
  };

  function NPC(kind, x, y, id) {
    Object.assign(this, { kind, x, y, id, face: -1, walkT: 0, talks: 0, name: kind === 'maren' ? 'Maren, Hüterin der Glut' : 'Pilger' });
  }
  NPC.prototype.view = function () {
    return { spr: S.CR.pilgrim.idle[0], pal: this.kind === 'maren' ? PAL.maren : PAL.pilgrim, flip: G.player.x < this.x, flash: false, alpha: 1 };
  };

  // ------------------------------------------------------------ Effects
  function spawnP(x, y, vx, vy, life, code, r, g, b, e, o) {
    if (G.particles.length > 1600) return;
    G.particles.push({ x, y, vx, vy, life, max: life, code: typeof code === 'string' ? code.charCodeAt(0) : code, r, g, b, e, drag: o && o.drag !== undefined ? o.drag : 3, grav: (o && o.grav) || 0, decal: o && o.decal, delay: (o && o.delay) || 0, fade: !(o && o.nofade) });
  }
  function burst(x, y, n, col, spd, glyphs, o) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, TAU), s = rand(spd * 0.3, spd);
      spawnP(x, y, Math.cos(a) * s, (Math.sin(a) * s) / ASP, rand(0.25, 0.7), pick(glyphs), col[0], col[1], col[2], (o && o.e) || 0.2, o);
    }
  }
  function blood(x, y, col, n) {
    burst(x, y, n, col, 22, '.,\'`*:', { e: 0.15, decal: true, drag: 5 });
  }
  function floater(x, y, text, col, life) {
    G.floaters.push({ x, y, text, r: col[0], g: col[1], b: col[2], life: life || 0.9, max: life || 0.9 });
  }
  function slashGlyph(a) {
    let t = a % Math.PI; if (t < 0) t += Math.PI;
    if (t < Math.PI / 8 || t > (7 * Math.PI) / 8) return '-';
    if (t < (3 * Math.PI) / 8) return '\\';
    if (t < (5 * Math.PI) / 8) return '|';
    return '/';
  }
  function slash(p) {
    const base = Math.atan2(p.aimY, p.aimX);
    const dir = p.combo ? 1 : -1;
    for (let k = 0; k <= 10; k++) {
      const a = base + dir * (k - 5) * 0.17;
      for (const r of [3.2, 4.4, 5.4]) {
        const x = p.x + 0.5 + Math.cos(a) * r, y = p.y - PCY + (Math.sin(a) * r) / ASP;
        const c = r > 5 ? 0.55 : 1;
        spawnP(x, y, 0, 0, 0.13, slashGlyph(a + Math.PI / 2), 0.85 * c, 0.9 * c, 1 * c, 1, { delay: k * 0.012, drag: 0 });
      }
    }
  }
  G.spawnP = spawnP;

  // ------------------------------------------------------------ Combat
  G.hurtPlayer = function (dmg, sx, sy) {
    const p = G.player;
    if (p.dead || p.iframes > 0 || G.mode !== 'play') return false;
    p.hp -= dmg;
    p.hurtT = 0.35; p.iframes = 0.5;
    p.drink = 0; p.healPending = false;
    const dx = p.x - sx, dy = (p.y - sy) * ASP, d = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 6; k++) moveEnt(p, (dx / d) * 0.35, (dy / d) * 0.35 / ASP);
    G.shake = Math.max(G.shake, 0.3);
    A.hurt();
    blood(p.x + 0.5, p.y - PCY, [0.6, 0.04, 0.04], 14);
    floater(p.x, p.y - 8, '-' + Math.round(dmg), [1, 0.3, 0.25]);
    DV.UI.hurtFlash();
    if (p.hp <= 0) G.killPlayer();
    return true;
  };

  G.killPlayer = function () {
    const p = G.player;
    p.hp = 0; p.dead = true; p.deadT = 0;
    blood(p.x + 0.5, p.y - PCY, [0.6, 0.04, 0.04], 40);
    burst(p.x + 0.5, p.y - PCY, 30, [1, 0.6, 0.2], 14, '*\'.', { e: 1 });
    A.death();
    if (p.embers > 0) G.lost = { x: p.x, y: p.y, amount: p.embers };
    else G.lost = null;
    p.embers = 0;
    G.boss = null;
    DV.UI.death(true);
  };

  function damageEnemy(e, dmg, nx, ny) {
    e.hp -= dmg;
    e.flash = 0.12;
    floater(e.x + rand(-1, 1), e.y - e.h - 1, String(Math.round(dmg)), [1, 0.85, 0.6]);
    blood(e.x + 0.5, e.y - e.h / 2, e.d.blood, e.boss ? 10 : 8);
    if (!e.boss) {
      e.kbx = nx * 16; e.kby = (ny * 16) / ASP;
      if (e.state !== 'attack') { e.state = 'hurt'; e.st = 0.25; }
    }
    if (e.state === 'idle' || e.state === 'return') { e.state = 'chase'; if (e.boss) G.engageBoss(e); }
    if (e.boss && e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2;
      floater(e.x, e.y - e.h - 3, 'ZORN', [1, 0.2, 0.15], 1.6);
      burst(e.x + 0.5, e.y - e.h / 2, 40, e.d.proj, 24, '*+\'.', { e: 1 });
      A.boom();
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.dead = true;
    const p = G.player;
    G.enemies.splice(G.enemies.indexOf(e), 1);
    if (e.id && !e.boss) G.killed.add(e.id);
    blood(e.x + 0.5, e.y - e.h / 2, e.d.blood, e.boss ? 60 : 20);
    for (let k = 0; k < (e.boss ? 60 : 10); k++) {
      spawnP(e.x + rand(-2, 2), e.y - rand(0, e.h), rand(-8, 8), rand(-6, 2), rand(0.6, 1.4), pick('*\'.'), 1, 0.65, 0.25, 1, { drag: 1.5 });
    }
    const gain = Math.round(e.minion ? e.d.embers * 0.3 : e.d.embers);
    p.embers += gain;
    floater(e.x, e.y - e.h - 2, '+' + gain + ' Glut', [1, 0.7, 0.3], 1.4);
    if (e.boss) {
      G.flags.bosses.add(e.type);
      G.boss = null;
      p.maxFlasks = 3 + G.flags.bosses.size;
      G.enemies.filter((m) => m.minion).forEach((m) => { m.hp = 0; killEnemy(m); });
      A.boom(); A.chime();
      G.shake = 0.8;
      if (e.d.final) {
        G.flags.victory = true;
        A.victory();
        DV.UI.banner('DIE DÄMMERUNG ZERBRICHT', 'Zum ersten Mal seit einer Ewigkeit geht über Duskvale die Sonne auf.', 'gold', 9);
      } else {
        DV.UI.banner('SIEGEL ' + (e.d.sigil === 'Flut' ? 'DER FLUT' : e.d.sigil === 'Asche' ? 'DER ASCHE' : 'DES KNOCHENS') + ' ERRUNGEN',
          `${e.d.name} ist gefallen. (${G.sigils()}/3 Siegel)`, 'gold', 6);
      }
      G.save();
    }
  }
  G.sigils = () => SIGIL_BOSSES.filter((b) => G.flags.bosses.has(b)).length;

  function strike() {
    const p = G.player;
    const range = 5.8;
    let hits = 0;
    for (const e of G.enemies.slice()) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = (e.y - e.h * 0.3 - (p.y - PCY)) * ASP;
      const d = Math.hypot(dx, dy);
      if (d > range + e.rad) continue;
      const dot = d < 0.8 ? 1 : (dx * p.aimX + dy * p.aimY) / d;
      if (dot < 0.2) continue;
      damageEnemy(e, p.dmg() * rand(0.9, 1.12), dx / (d || 1), dy / (d || 1));
      hits++;
    }
    if (hits) { G.hitstop = 0.06; A.hit(); G.shake = Math.max(G.shake, 0.12); }
  }

  // ------------------------------------------------------------ Enemy AI
  function fire(e, angle, speed, dmg) {
    const c = e.d.proj || [1, 1, 1];
    G.projectiles.push({ x: e.x + 0.5, y: e.y - e.h * 0.55, vx: Math.cos(angle) * speed, vy: (Math.sin(angle) * speed) / ASP, dmg, life: 3.5, col: c });
  }
  function aimAt(e) {
    const p = G.player;
    return Math.atan2((p.y - PCY - (e.y - e.h * 0.55)) * ASP, p.x - e.x);
  }
  const BOSS_WIND = { swing: 0.55, slam: 1.0, charge: 0.65, volley: 0.75, summon: 0.9, blink: 0.35 };

  function startWindup(e, kind) {
    const p = G.player;
    e.atk = kind; e.state = 'windup';
    const pf = e.phase === 2 ? 0.72 : 1;
    e.st = (e.boss ? BOSS_WIND[kind] : e.d.windup) * pf;
    const dx = p.x - e.x, dy = (p.y - e.y) * ASP, d = Math.hypot(dx, dy) || 1;
    e.ax = dx / d; e.ay = dy / d;
    e.face = dx >= 0 ? 1 : -1;
    if (kind === 'slam') G.telegraphs.push({ x: e.x + 0.5, y: e.y, rad: 10, life: e.st, max: e.st, col: e.d.proj });
    if (!e.boss && kind === 'melee') floater(e.x, e.y - e.h - 1, '!', [1, 0.35, 0.2], 0.4);
  }

  function beginAttack(e) {
    const p = G.player, d = e.d;
    e.state = 'attack'; e.hitDone = false;
    switch (e.atk) {
      case 'melee': case 'swing':
        e.st = 0.24; e.lv = d.lunge; if (e.boss) A.swing();
        break;
      case 'bolt':
        fire(e, aimAt(e), 22, d.dmg); e.st = 0.2; A.cast();
        break;
      case 'slam': {
        e.st = 0.35;
        const dd = dist(p.x - e.x, p.y - e.y);
        if (dd < 10) G.hurtPlayer(d.dmg * 1.3, e.x, e.y);
        for (let k = 0; k < 48; k++) {
          const a = (k / 48) * TAU;
          spawnP(e.x + 0.5 + Math.cos(a) * 2, e.y + (Math.sin(a) * 2) / ASP, Math.cos(a) * 30, (Math.sin(a) * 30) / ASP, 0.35, pick('*#%'), d.proj[0], d.proj[1], d.proj[2], 1, { drag: 2 });
        }
        A.boom(); G.shake = Math.max(G.shake, 0.5);
        break;
      }
      case 'charge':
        e.st = 0.5; e.lv = 44; A.swing();
        break;
      case 'volley': {
        const n = e.phase === 2 ? (d.final ? 16 : 9) : (d.final ? 10 : 6);
        if (d.final && e.phase === 2) for (let k = 0; k < n; k++) fire(e, (k / n) * TAU + G.t, 16, d.dmg * 0.6);
        else { const base = aimAt(e); for (let k = 0; k < n; k++) fire(e, base + (k - (n - 1) / 2) * 0.16, 18, d.dmg * 0.6); }
        e.st = 0.3; A.cast();
        break;
      }
      case 'summon': {
        const cnt = G.enemies.filter((m) => m.minion).length;
        for (let k = 0; k < 2 && cnt + k < 4; k++) {
          for (let tries = 0; tries < 8; tries++) {
            const mx = e.x + rand(-9, 9), my = e.y + rand(-5, 5);
            if (W.isSolid(mx, my)) continue;
            const m = new Enemy(d.minion, mx, my, null, e.ck);
            m.minion = true; m.state = 'chase'; m.hx = e.hx; m.hy = e.hy;
            G.enemies.push(m);
            burst(mx, my - 1, 16, d.proj, 10, '*\'.', { e: 1 });
            break;
          }
        }
        e.st = 0.4; A.cast();
        break;
      }
      case 'blink': {
        burst(e.x + 0.5, e.y - e.h / 2, 30, d.proj, 16, '*\'.:', { e: 1 });
        for (let tries = 0; tries < 12; tries++) {
          const a = rand(0, TAU);
          const nx = p.x + Math.cos(a) * 9, ny = p.y + (Math.sin(a) * 9) / ASP;
          if (!W.isSolid(nx, ny) && dist(nx - e.hx, ny - e.hy) < 50) { e.x = nx; e.y = ny; break; }
        }
        burst(e.x + 0.5, e.y - e.h / 2, 30, d.proj, 16, '*\'.:', { e: 1 });
        startWindup(e, 'swing');
        e.st *= 0.8;
        return;
      }
    }
  }

  function updateAttack(e, dt) {
    const p = G.player, d = e.d;
    if (e.atk === 'melee' || e.atk === 'swing' || e.atk === 'charge') {
      if (e.lv > 0) {
        moveEnt(e, e.ax * e.lv * dt, (e.ay * e.lv * dt) / ASP);
        e.lv *= Math.exp(-(e.atk === 'charge' ? 1 : 8) * dt);
        if (e.atk === 'charge' && Math.random() < 0.6) spawnP(e.x + 0.5, e.y - rand(0, e.h), -e.ax * 6, 0, 0.4, pick('.\'`'), d.proj[0], d.proj[1], d.proj[2], 1, {});
      }
      if (!e.hitDone) {
        const dx = p.x - e.x, dy = (p.y - e.y) * ASP, dd = Math.hypot(dx, dy) || 1;
        const reach = e.atk === 'charge' ? 4 : d.range + 0.6;
        const front = (dx * e.ax + dy * e.ay) / dd;
        if (dd < reach && (front > 0.1 || dd < 2.2)) {
          e.hitDone = true;
          G.hurtPlayer(e.atk === 'charge' ? d.dmg * 1.1 : d.dmg, e.x, e.y);
        }
      }
    }
    if (e.st <= 0) {
      e.state = 'recover';
      const pf = e.phase === 2 ? 0.65 : 1;
      e.st = d.recover * pf;
      e.cd = e.boss ? rand(0.3, 1.0) * pf : d.ranged ? rand(1.8, 3) : rand(0.3, 0.9);
    }
  }

  function chooseBossAttack(e, dd) {
    const opts = e.d.attacks.filter((a) => {
      if (a === 'swing') return dd < 11;
      if (a === 'slam') return dd < 12;
      if (a === 'charge') return dd > 7;
      if (a === 'summon') return G.enemies.filter((m) => m.minion).length < 3;
      return true;
    });
    if (!opts.length) return false;
    startWindup(e, pick(opts));
    return true;
  }

  function updateEnemy(e, dt) {
    const p = G.player, d = e.d;
    e.flash = Math.max(0, e.flash - dt);
    e.st -= dt; e.cd -= dt;
    if (e.kbx || e.kby) {
      moveEnt(e, e.kbx * dt, e.kby * dt);
      const k = Math.exp(-10 * dt); e.kbx *= k; e.kby *= k;
      if (Math.abs(e.kbx) < 0.3 && Math.abs(e.kby) < 0.3) e.kbx = e.kby = 0;
    }
    const dx = p.x - e.x, dy = p.y - e.y, dd = dist(dx, dy);
    const alive = !p.dead && G.mode === 'play';
    const home = dist(e.x - e.hx, e.y - e.hy);
    switch (e.state) {
      case 'idle':
        if (e.st <= 0) { e.tx = e.hx + rand(-6, 6); e.ty = e.hy + rand(-3, 3); e.st = rand(2, 5); }
        if (!e.boss) stepToward(e, e.tx, e.ty, d.spd * 0.3, dt);
        if (alive && dd < d.aggro) {
          e.state = 'chase'; e.st = 0;
          if (e.boss) G.engageBoss(e);
          else { floater(e.x, e.y - e.h - 1, '!', [1, 0.8, 0.3], 0.6); A.alert(); }
        }
        break;
      case 'chase':
        if (!alive || (!e.minion && home > (e.boss ? 55 : 80))) {
          e.state = 'return';
          if (G.boss === e) G.boss = null;
          break;
        }
        if (Math.abs(dx) > 0.5) e.face = dx > 0 ? 1 : -1;
        if (e.boss) {
          if (e.cd <= 0 && dd < 34 && chooseBossAttack(e, dd)) break;
          if (dd > d.range * 0.7) stepToward(e, p.x, p.y, d.spd, dt);
        } else if (d.ranged && dd < d.ranged && dd > 5 && e.cd <= 0) startWindup(e, 'bolt');
        else if (dd < d.range && e.cd <= 0) startWindup(e, 'melee');
        else if (d.ranged && dd < d.ranged * 0.5) stepToward(e, e.x - dx, e.y - dy, d.spd * 0.6, dt);
        else if (dd > d.range * 0.7) stepToward(e, p.x, p.y, d.spd, dt);
        break;
      case 'windup':
        if (e.atk !== 'charge' && Math.abs(dx) > 0.5) e.face = dx > 0 ? 1 : -1;
        if (e.st <= 0) beginAttack(e);
        break;
      case 'attack': updateAttack(e, dt); break;
      case 'recover': if (e.st <= 0) e.state = 'chase'; break;
      case 'hurt': if (e.st <= 0) e.state = 'chase'; break;
      case 'return':
        stepToward(e, e.hx, e.hy, d.spd * 0.8, dt);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt);
        if (home < 2) { e.state = 'idle'; e.phase = 1; }
        else if (alive && dd < d.aggro * 0.6 && home < 30) e.state = 'chase';
        break;
    }
  }

  G.engageBoss = function (e) {
    if (G.boss !== e) {
      G.boss = e;
      DV.UI.banner(e.d.name.toUpperCase(), '', 'blood', 3);
      A.boom();
    }
  };

  // ------------------------------------------------------------ Spawning
  function roamType(t, bi) {
    if (bi === W.BIOMES.ash) return pick(['skeleton', 'ghoul', 'wolf']);
    if (bi === W.BIOMES.plaza) return pick(['wraith', 'skeleton']);
    switch (t) {
      case T.FOREST: return 'wolf';
      case T.MARSH: case T.SHALLOW: return 'wraith';
      case T.MOOR: return pick(['ghoul', 'ghoul', 'skeleton']);
      case T.GRASS: return pick(['ghoul', 'wolf']);
      case T.ROCK: return 'wolf';
      default: return null;
    }
  }

  function spawnChunk(cx, cy) {
    const c = W.chunk(cx, cy), key = cx + ',' + cy;
    for (const f of c.feats) {
      if (f.kind === 'spawn') {
        if (!G.killed.has(f.id)) G.enemies.push(new Enemy(f.enemy || 'ghoul', f.x + 0.5, f.y + 0.5, f.id, key));
      } else if (f.kind === 'boss') {
        if (!G.flags.bosses.has(f.boss) && !G.enemies.some((e) => e.type === f.boss)) G.enemies.push(new Enemy(f.boss, f.x + 0.5, f.y + 0.5, f.id, key));
      } else if (f.kind === 'npc') {
        if (!G.npcs.some((n) => n.id === f.id)) G.npcs.push(new NPC(f.npc, f.x + 0.5, f.y + 0.5, f.id));
      }
    }
    const x0 = cx * 32, y0 = cy * 32;
    if (dist(x0 + 16, y0 + 16) < 50) return;
    if (hash(cx, cy, 555) > 0.42) return;
    const tp = W.typeAt(x0 + 16, y0 + 16);
    const type = roamType(tp, W.biomeAt(x0 + 16, y0 + 16));
    if (!type) return;
    const n = type === 'wolf' ? 2 + Math.floor(hash(cx, cy, 556) * 2) : 1 + Math.floor(hash(cx, cy, 557) * 1.6);
    for (let k = 0; k < n; k++) {
      const id = `roam@${key}#${k}`;
      if (G.killed.has(id)) continue;
      for (let tries = 0; tries < 12; tries++) {
        const x = x0 + 4 + hash(cx * 7 + k, cy * 13 + tries, 558) * 24, y = y0 + 4 + hash(cx * 11 + k, cy * 5 + tries, 559) * 24;
        if (W.isSolid(x, y) || (type !== 'wraith' && W.WATERY[W.typeAt(x, y)])) continue;
        G.enemies.push(new Enemy(type, x, y, id, key));
        break;
      }
    }
  }

  function updateSpawns() {
    const R = DV.R, p = G.player;
    const x0 = (R.camX - 32) >> 5, x1 = (R.camX + R.cols + 32) >> 5;
    const y0 = (R.camY - 24) >> 5, y1 = (R.camY + R.rows + 24) >> 5;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const k = cx + ',' + cy;
      if (!G.spawned.has(k)) { G.spawned.add(k); spawnChunk(cx, cy); }
    }
    for (const k of Array.from(G.spawned)) {
      const [cx, cy] = k.split(',').map(Number);
      if (dist(cx * 32 + 16 - p.x, cy * 32 + 16 - p.y) > 300) {
        G.spawned.delete(k);
        G.enemies = G.enemies.filter((e) => e.ck !== k || (e === G.boss));
      }
    }
  }

  G.resetWorldEnemies = function () {
    G.enemies = []; G.projectiles = []; G.telegraphs = [];
    G.killed.clear(); G.spawned.clear(); G.boss = null;
  };

  // ------------------------------------------------------------ Interaction
  G.findInteract = function () {
    const p = G.player;
    if (p.dead) return null;
    for (const n of G.npcs) if (dist(n.x - p.x, n.y - p.y) < 5) return { kind: 'npc', n, label: `Sprechen mit ${n.name}` };
    const feats = W.featuresNear(p.x, p.y, 7);
    let best = null, bd = 1e9;
    for (const f of feats) {
      const d = dist(f.x + 0.5 - p.x, f.y + 0.5 - p.y);
      const lim = f.kind === 'gate' ? 7 : 4.6;
      if (d > lim || d >= bd) continue;
      if (f.kind === 'shrine' || f.kind === 'lore' || (f.kind === 'gate' && !G.flags.gateOpen)) { best = f; bd = d; }
    }
    if (!best) return null;
    if (best.kind === 'shrine') return { kind: 'shrine', f: best, label: G.flags.shrines.has(best.id) ? 'Am Schrein rasten' : 'Schrein entzünden' };
    if (best.kind === 'lore') return { kind: 'lore', f: best, label: 'Stele lesen' };
    return { kind: 'gate', f: best, label: 'Das Tor berühren' };
  };

  G.interactNow = function () {
    const it = G.interact;
    if (!it) return;
    const p = G.player;
    if (it.kind === 'npc') {
      const n = it.n;
      let lines;
      if (n.kind === 'maren') {
        if (G.flags.victory) lines = ['Das Licht… ich hatte vergessen, wie warm es ist. Danke, Wanderer.'];
        else lines = MAREN[Math.min(n.talks, MAREN.length - 1)].slice();
        if (n.talks > 0 && !G.flags.victory) lines.push(`Du trägst ${G.sigils()} von 3 Siegeln.`);
      } else lines = PILGRIM_LINES[Math.floor(hash(Math.floor(n.x), Math.floor(n.y), n.talks) * PILGRIM_LINES.length)];
      n.talks++;
      DV.UI.dialog(n.name, lines);
    } else if (it.kind === 'lore') {
      const f = it.f;
      const pool = LORE[f.struct] || LORE.generic;
      const text = pool[Math.floor(hash(f.x, f.y, 3) * pool.length)];
      G.flags.lore.add(f.id);
      DV.UI.dialog('Verwitterte Stele', [text]);
    } else if (it.kind === 'gate') {
      if (G.sigils() >= 3) {
        G.flags.gateOpen = true;
        A.boom(); A.chime(); G.shake = 1; G.flash = 0.8;
        DV.UI.banner('DAS TOR ÖFFNET SICH', 'Knochen, Flut und Asche brennen im Stein.', 'gold', 5);
        G.save();
      } else {
        DV.UI.dialog('Das Siegeltor', ['Drei leere Mulden im schwarzen Eisen. Das Tor rührt sich nicht.', `Siegel: ${G.sigils()} / 3`]);
      }
    } else if (it.kind === 'shrine') {
      const f = it.f;
      if (!G.flags.shrines.has(f.id)) {
        G.flags.shrines.add(f.id);
        const L = W.landmarkAt(f.x, f.y);
        G.shrineInfo[f.id] = { x: f.x, y: f.y, name: f.name || (L ? L.name : 'Wegschrein') };
        A.chime();
        burst(f.x + 0.5, f.y - 2, 50, [1, 0.7, 0.3], 18, '*\'.^', { e: 1 });
        DV.UI.banner('SCHREIN ENTZÜNDET', G.shrineInfo[f.id].name, 'gold', 3.5);
      }
      G.rest(f);
      DV.UI.shrineMenu(f);
    }
  };

  G.rest = function (f) {
    const p = G.player;
    p.hp = p.maxHp(); p.st = p.maxSt(); p.flasks = p.maxFlasks;
    G.lastShrine = { x: f.x + 0.5, y: f.y + 2.5, id: f.id };
    G.resetWorldEnemies();
    G.save();
  };

  G.levelCost = () => Math.round(60 * Math.pow(1.14, G.player.lvl));
  G.levelUp = function (stat) {
    const p = G.player, c = G.levelCost();
    if (p.embers < c) return false;
    p.embers -= c; p.lvl++;
    p[stat]++;
    p.hp = p.maxHp(); p.st = p.maxSt();
    A.pickup();
    G.save();
    return true;
  };
  G.travel = function (id) {
    const s = G.shrineInfo[id];
    if (!s) return;
    const p = G.player;
    p.x = s.x + 0.5; p.y = s.y + 2.5;
    G.cam.x = p.x; G.cam.y = p.y;
    G.lastShrine = { x: p.x, y: p.y, id };
    G.resetWorldEnemies();
    G.decals.clear();
    G.particles.length = 0;
  };

  G.respawn = function () {
    const p = G.player;
    p.dead = false; p.hp = p.maxHp(); p.st = p.maxSt(); p.flasks = p.maxFlasks;
    p.x = G.lastShrine.x; p.y = G.lastShrine.y;
    p.atk = p.roll = p.drink = 0; p.iframes = 1;
    G.cam.x = p.x; G.cam.y = p.y;
    G.resetWorldEnemies();
    G.particles.length = 0;
    G.pickups = G.lost ? [G.lost] : [];
    DV.UI.death(false);
    G.save();
  };

  // ------------------------------------------------------------ Player update
  G.updatePlayer = function (dt, inp) {
    const p = G.player;
    if (p.dead) { p.deadT += dt; if (p.deadT > 4.2) G.respawn(); return; }
    p.atk = Math.max(0, p.atk - dt); p.atkCD -= dt; p.roll = Math.max(0, p.roll - dt);
    p.iframes = Math.max(0, p.iframes - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.stDelay -= dt;

    if (inp.mouseActive) {
      const ax = inp.wx - (p.x + 0.5), ay = (inp.wy - (p.y - PCY)) * ASP;
      const l = Math.hypot(ax, ay) || 1;
      p.aimX = ax / l; p.aimY = ay / l;
    }
    let ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const il = Math.hypot(ix, iy);
    if (il) { ix /= il; iy /= il; }
    if (il && !inp.mouseActive) { p.aimX = ix; p.aimY = iy; }

    if (p.roll > 0) {
      const sp = 40 * (0.4 + p.roll / 0.34);
      moveEnt(p, p.rollX * sp * dt, (p.rollY * sp * dt) / ASP);
      if (Math.random() < 0.5) spawnP(p.x + 0.5, p.y, rand(-2, 2), 0, 0.4, '.', 0.4, 0.38, 0.34, 0, {});
    } else {
      let spd = 15;
      if (p.drink > 0) spd = 5;
      else if (p.atk > 0) spd = 4.5;
      moveEnt(p, ix * spd * dt, (iy * spd * dt) / ASP);
      p.moving = il > 0;
      if (p.moving) p.walkT += dt;
      if (Math.abs(ix) > 0.2 && !inp.mouseActive) p.face = ix > 0 ? 1 : -1;
    }
    if (inp.mouseActive && Math.abs(p.aimX) > 0.15 && p.roll <= 0) p.face = p.aimX > 0 ? 1 : -1;

    if (inp.attack && p.atkCD <= 0 && p.roll <= 0 && p.drink <= 0 && p.st > 0) {
      p.atk = 0.36; p.atkCD = 0.4; p.st -= 15; p.stDelay = 0.7; p.hitPending = 0.09;
      p.combo ^= 1;
      A.swing(); slash(p);
      moveEnt(p, p.aimX * 0.8, (p.aimY * 0.8) / ASP);
    }
    if (p.hitPending > 0) { p.hitPending -= dt; if (p.hitPending <= 0) strike(); }
    if (inp.roll && p.roll <= 0 && p.st >= 10 && p.drink <= 0 && p.atk < 0.2) {
      if (il) { p.rollX = ix; p.rollY = iy; } else { p.rollX = -p.aimX; p.rollY = -p.aimY; }
      p.roll = 0.34; p.iframes = Math.max(p.iframes, 0.28); p.st -= 22; p.stDelay = 0.7;
      A.roll();
    }
    if (inp.flask && p.drink <= 0 && p.roll <= 0) {
      if (p.flasks > 0) { p.drink = 0.9; p.flasks--; p.healPending = true; A.drink(); }
      else floater(p.x, p.y - 11, 'Flakons leer', [0.7, 0.6, 0.5], 1);
    }
    if (p.drink > 0) {
      p.drink -= dt;
      if (p.healPending && p.drink < 0.45) {
        p.healPending = false;
        const h = Math.round(p.maxHp() * 0.45);
        p.hp = Math.min(p.maxHp(), p.hp + h);
        floater(p.x, p.y - 11, '+' + h, [1, 0.8, 0.35]);
        burst(p.x + 0.5, p.y - PCY, 24, [1, 0.75, 0.3], 10, '*\'.+', { e: 1, drag: 2 });
      }
    }
    if (p.stDelay <= 0 && p.roll <= 0) p.st = Math.min(p.maxSt(), p.st + 42 * dt);
    if (p.st < -10) p.st = -10;

    for (let k = G.pickups.length - 1; k >= 0; k--) {
      const pk = G.pickups[k];
      if (dist(pk.x - p.x, pk.y - p.y) < 2.5) {
        p.embers += pk.amount;
        floater(p.x, p.y - 11, '+' + pk.amount + ' Glut', [1, 0.75, 0.3], 1.5);
        A.pickup();
        G.pickups.splice(k, 1);
        if (pk === G.lost) G.lost = null;
      }
    }
    inp.attack = inp.roll = inp.flask = false;
  };

  // ------------------------------------------------------------ World update
  function updateWeather(dt) {
    const w = G.weather;
    w.timer -= dt;
    if (w.timer <= 0) {
      const kinds = ['klar', 'nebel', 'regen', 'regen', 'sturm'];
      let k = pick(kinds);
      if (k === w.kind) k = pick(kinds);
      w.kind = k; w.target = WK[k]; w.timer = rand(55, 120);
    }
    const s = Math.min(1, dt * 0.08);
    for (const key of ['rain', 'fog', 'wind', 'cloud']) w[key] = lerp(w[key], w.target[key], s);
    if (w.kind === 'sturm' && w.rain > 0.6 && Math.random() < dt * 0.13) {
      G.flash = 1; A.thunder(rand(0.2, 1.6));
    }
    G.flash = Math.max(0, G.flash - dt * 5);
  }

  function updateEnv(dt) {
    G.clock = (G.clock + dt / 420) % 1;
    const n = 0.5 - 0.5 * Math.cos(G.clock * TAU);
    G.night = n;
    const dusk = [0.66, 0.54, 0.58], night = [0.24, 0.27, 0.42];
    let a = [lerp(dusk[0], night[0], n), lerp(dusk[1], night[1], n), lerp(dusk[2], night[2], n)];
    if (G.flags.victory) {
      G.dawn = Math.min(1, G.dawn + dt * 0.08);
      const day = [0.9, 0.8, 0.66];
      a = a.map((v, i) => lerp(v, day[i], G.dawn));
    }
    const w = G.weather;
    const rk = 1 - w.rain * 0.3 - w.fog * 0.1;
    const fl = G.flash * 1.1;
    G.biomeT -= dt;
    if (G.biomeT <= 0 && G.player) { G.biome = W.biomeAt(G.player.x, G.player.y); G.biomeT = 0.5; }
    let tint = [1, 1, 1], fc = [0.48, 0.5, 0.58];
    if (G.biome === W.BIOMES.ash) { tint = [1.15, 0.85, 0.75]; fc = [0.6, 0.36, 0.24]; }
    else if (G.biome === W.BIOMES.swamp) { tint = [0.9, 1.05, 0.95]; fc = [0.38, 0.52, 0.46]; }
    else if (G.biome === W.BIOMES.plaza) { tint = [0.9, 0.85, 1.05]; fc = [0.42, 0.4, 0.52]; }
    G.amb = [a[0] * rk * tint[0] + fl * 0.8, a[1] * rk * tint[1] + fl * 0.85, a[2] * rk * tint[2] + fl];
    G.fogColor = fc;
    G.cloud = w.cloud * (1 - n * 0.5);
  }

  function updateParticles(dt) {
    const ps = G.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const q = ps[k];
      if (q.delay > 0) { q.delay -= dt; continue; }
      q.life -= dt;
      if (q.life <= 0) {
        if (q.decal && Math.random() < 0.6) {
          const x = Math.floor(q.x), y = Math.floor(q.y);
          if (!W.WATERY[W.typeAt(x, y)]) G.decals.set(x + ',' + y, { x, y, code: q.code, r: q.r * 0.8, g: q.g * 0.8, b: q.b * 0.8, life: 45 });
        }
        ps[k] = ps[ps.length - 1]; ps.pop();
        continue;
      }
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vy *= dr; q.vy += q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    for (const [k, d] of G.decals) { d.life -= dt; if (d.life <= 0) G.decals.delete(k); }
    if (G.decals.size > 900) { const it = G.decals.keys(); for (let i = 0; i < 200; i++) G.decals.delete(it.next().value); }

    for (let k = G.projectiles.length - 1; k >= 0; k--) {
      const q = G.projectiles[k];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (Math.random() < 0.7) spawnP(q.x, q.y, 0, 0, 0.3, pick('.\'·'), q.col[0], q.col[1], q.col[2], 1, {});
      const t = W.typeAt(q.x, q.y);
      let dead = q.life <= 0 || ((t === T.WALL || t === T.MOUNT) && q.life < 3.3);
      const p = G.player;
      if (!dead && !p.dead && dist(q.x - (p.x + 0.5), q.y - (p.y - PCY)) < 1.7) {
        if (G.hurtPlayer(q.dmg, q.x, q.y)) dead = true;
      }
      if (dead) {
        burst(q.x, q.y, 8, q.col, 8, '*\'.', { e: 1 });
        G.projectiles.splice(k, 1);
      }
    }
    for (let k = G.floaters.length - 1; k >= 0; k--) { G.floaters[k].life -= dt; if (G.floaters[k].life <= 0) G.floaters.splice(k, 1); }
    for (let k = G.telegraphs.length - 1; k >= 0; k--) { G.telegraphs[k].life -= dt; if (G.telegraphs[k].life <= 0) G.telegraphs.splice(k, 1); }
  }

  function updateRain(dt) {
    const R = DV.R, w = G.weather;
    const ashy = G.biome === W.BIOMES.ash;
    const want = Math.floor((ashy ? Math.max(0.35, w.rain * 0.6) : w.rain) * R.cols * R.rows * 0.016);
    while (G.rain.length < want) G.rain.push({ x: 0, y: 0, life: 0, vx: 0, vy: 0 });
    if (G.rain.length > want) G.rain.length = want;
    for (const d of G.rain) {
      d.life -= dt;
      if (d.life <= 0 || d.x < R.camX - 12 || d.x > R.camX + R.cols + 12 || d.y < R.camY - 12 || d.y > R.camY + R.rows + 4) {
        if (d.life <= 0 && d.vy > 0 && !ashy && Math.random() < 0.5) spawnP(d.x, d.y, 0, 0, 0.14, Math.random() < 0.5 ? '.' : 'o', 0.5, 0.56, 0.68, 0.25, {});
        d.x = R.camX + rand(-8, R.cols + 8); d.y = R.camY + rand(-8, R.rows);
        d.life = rand(0.15, 0.9);
        if (ashy) { d.vx = rand(-3, 3) - w.wind * 3; d.vy = rand(2, 5); d.life *= 4; d.ash = true; }
        else { d.vx = -4 - w.wind * 18; d.vy = rand(34, 50); d.ash = false; }
      }
      d.x += d.vx * dt; d.y += d.vy * dt;
    }
  }

  function updateFireflies(dt) {
    const R = DV.R;
    const want = G.night > 0.4 && G.weather.rain < 0.45 && !G.flags.victory ? 34 : 0;
    while (G.fireflies.length < want) G.fireflies.push({ x: R.camX + rand(0, R.cols), y: R.camY + rand(0, R.rows), a: rand(0, TAU), ph: rand(0, TAU) });
    if (G.fireflies.length > want) G.fireflies.length = want;
    for (const f of G.fireflies) {
      f.a += rand(-3, 3) * dt;
      f.x += Math.cos(f.a) * 3 * dt; f.y += (Math.sin(f.a) * 3 * dt) / ASP;
      if (f.x < R.camX - 5 || f.x > R.camX + R.cols + 5 || f.y < R.camY - 5 || f.y > R.camY + R.rows + 5) {
        f.x = R.camX + rand(0, R.cols); f.y = R.camY + rand(0, R.rows);
      }
      const t = W.typeAt(f.x, f.y);
      f.ok = t === T.GRASS || t === T.MARSH || t === T.FOREST || t === T.SHALLOW || t === T.MOOR;
    }
  }

  function ambientEmitters(objs, dt) {
    for (const o of objs) {
      const k = o.kind;
      if ((k === 'brazier' || k === 'campfire' || (k === 'shrine' && G.flags.shrines.has(o.id))) && Math.random() < dt * 6) {
        spawnP(o.x + 0.5 + rand(-0.5, 0.5), o.y - 2, rand(-1, 1) + G.weather.wind * -2, rand(-7, -3), rand(0.6, 1.4), pick('.\'`'), 1, rand(0.4, 0.7), 0.15, 1, { drag: 0.6 });
      } else if (k === 'vent' && Math.random() < dt * 0.8) {
        spawnP(o.x + 0.5, o.y, rand(-1, 1), rand(-5, -2), rand(0.8, 1.6), pick('.\''), 1, 0.4, 0.1, 1, { drag: 0.4 });
      }
    }
  }

  G.update = function (dt, inp, objs) {
    G.t += dt;
    updateWeather(dt);
    updateEnv(dt);
    updateRain(dt);
    updateFireflies(dt);
    if (G.mode === 'title') {
      G.cam.x += dt * 5; G.cam.y += Math.sin(G.t * 0.1) * dt * 1.5;
      setCamera(dt, true);
      updateParticles(dt);
      ambientEmitters(objs, dt);
      return;
    }
    if (G.hitstop > 0) { G.hitstop -= dt; return; }
    const p = G.player;
    G.updatePlayer(dt, inp);
    for (const e of G.enemies.slice()) if (!e.dead) updateEnemy(e, dt);
    for (let a = 0; a < G.enemies.length; a++) for (let b = a + 1; b < G.enemies.length; b++) {
      const e1 = G.enemies[a], e2 = G.enemies[b];
      const dx = e2.x - e1.x, dy = (e2.y - e1.y) * ASP, d = Math.hypot(dx, dy);
      const min = (e1.rad + e2.rad) * 0.9;
      if (d < min && d > 0.01) {
        const push = (min - d) * 0.5;
        moveEnt(e1, (-dx / d) * push, (-dy / d) * push / ASP);
        moveEnt(e2, (dx / d) * push, (dy / d) * push / ASP);
      }
    }
    updateParticles(dt);
    ambientEmitters(objs, dt);
    G.spawnTimer = (G.spawnTimer || 0) - dt;
    if (G.spawnTimer <= 0) { G.spawnTimer = 0.4; updateSpawns(); }
    const L = W.landmarkAt(p.x, p.y);
    const aid = L ? L.id : null;
    if (aid !== G.area) {
      G.area = aid;
      if (L) DV.UI.banner(L.name, L.sub, 'pale', 3.5);
    }
    G.interact = G.findInteract();
    G.shake = Math.max(0, G.shake - dt * 1.6);
    setCamera(dt, false);
    W.markVisited(DV.R.camX, DV.R.camY, DV.R.camX + DV.R.cols, DV.R.camY + DV.R.rows);
    let fireNear = 0;
    for (const o of objs) if (o.kind === 'brazier' || o.kind === 'campfire' || o.kind === 'shrine') fireNear = Math.max(fireNear, 1 - Math.min(1, dist(o.x - p.x, o.y - p.y) / 18));
    A.ambience(G.weather.rain, G.weather.wind, fireNear, !!G.boss);
  };

  function setCamera(dt, title) {
    const R = DV.R;
    if (!title) {
      const p = G.player;
      const tx = p.x + p.aimX * 5, ty = p.y - PCY + (p.aimY * 5) / ASP;
      const k = 1 - Math.exp(-dt * 5);
      G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
    }
    let sx = 0, sy = 0;
    if (G.shake > 0.05) { sx = Math.round(rand(-1, 1) * G.shake * 2); sy = Math.round(rand(-1, 1) * G.shake); }
    R.camX = Math.floor(G.cam.x - R.cols / 2) + sx;
    R.camY = Math.floor(G.cam.y - R.rows / 2) + sy;
  }

  // ------------------------------------------------------------ Lights & effects
  G.collectLights = function (objs) {
    const L = G.lights;
    L.length = 0;
    const t = G.t, p = G.player;
    if (G.mode !== 'title' && p && !p.dead) {
      const fl = 1 + Math.sin(t * 11) * 0.04 + Math.sin(t * 23.7) * 0.03;
      L.push({ x: p.x + 0.5, y: p.y - 3, rad: 22 * fl, r: 1, g: 0.7, b: 0.42, i: 1.15 });
    }
    let small = 0;
    for (const o of objs) {
      const fl = 0.85 + 0.15 * Math.sin(t * 9 + o.x) * Math.sin(t * 5.3 + o.y);
      switch (o.kind) {
        case 'brazier': case 'campfire': L.push({ x: o.x + 0.5, y: o.y - 1, rad: 13 * fl, r: 1, g: 0.5, b: 0.15, i: 1 }); break;
        case 'shrine':
          if (G.flags.shrines.has(o.id)) L.push({ x: o.x + 0.5, y: o.y - 2, rad: 18 * fl, r: 1, g: 0.66, b: 0.28, i: 1.15 });
          else L.push({ x: o.x + 0.5, y: o.y - 1, rad: 5, r: 0.6, g: 0.25, b: 0.1, i: 0.5 });
          break;
        case 'lore': if (!G.flags.lore.has(o.id)) L.push({ x: o.x + 0.5, y: o.y - 1, rad: 6, r: 0.3, g: 0.5, b: 1, i: 0.6 }); break;
        case 'vent': if (small++ < 30) L.push({ x: o.x + 0.5, y: o.y, rad: 3.5, r: 1, g: 0.35, b: 0.05, i: 0.6 * fl }); break;
        case 'fungus': if (small++ < 30) L.push({ x: o.x + 0.5, y: o.y, rad: 3, r: 0.1, g: 0.7, b: 0.6, i: 0.4 }); break;
      }
    }
    for (const e of G.enemies) {
      if (e.type === 'wraith') L.push({ x: e.x + 0.5, y: e.y - 3, rad: 7, r: 0.35, g: 0.55, b: 1, i: 0.6 });
      else if (e.boss) { const c = e.d.proj; L.push({ x: e.x + 0.5, y: e.y - e.h / 2, rad: 14, r: c[0], g: c[1], b: c[2], i: 0.7 }); }
    }
    for (const n of G.npcs) L.push({ x: n.x + 1.5, y: n.y - 3, rad: 10, r: 1, g: 0.7, b: 0.35, i: 0.8 });
    for (const q of G.projectiles) L.push({ x: q.x, y: q.y, rad: 7, r: q.col[0], g: q.col[1], b: q.col[2], i: 0.9 });
    for (const pk of G.pickups) L.push({ x: pk.x + 0.5, y: pk.y, rad: 7, r: 1, g: 0.7, b: 0.3, i: 0.8 });
    let ff = 0;
    for (const f of G.fireflies) if (f.ok && ff++ < 14) L.push({ x: f.x, y: f.y, rad: 3, r: 0.7, g: 1, b: 0.3, i: 0.35 * (0.5 + 0.5 * Math.sin(t * 3 + f.ph)) });
    if (L.length > 110) L.length = 110;
  };

  G.drawEffects = function (R) {
    const t = G.t;
    for (const tg of G.telegraphs) {
      const k = 1 - tg.life / tg.max;
      const n = 64;
      for (let s = 0; s < n; s++) {
        const a = (s / n) * TAU;
        const rr = tg.rad * (0.3 + 0.7 * k);
        R.putW(tg.x + Math.cos(a) * rr, tg.y + (Math.sin(a) * rr) / ASP, 46, tg.col[0] * k, tg.col[1] * k * 0.5, tg.col[2] * k * 0.4, 1);
      }
      for (let s = 0; s < n; s++) {
        const a = (s / n) * TAU;
        R.putW(tg.x + Math.cos(a) * tg.rad, tg.y + (Math.sin(a) * tg.rad) / ASP, 58, 0.8, 0.15, 0.1, 0.8 * k + 0.2);
      }
    }
    for (const q of G.particles) {
      if (q.delay > 0) continue;
      const a = q.fade ? Math.min(1, (q.life / q.max) * 1.6) : 1;
      R.putW(q.x, q.y, q.code, q.r * a, q.g * a, q.b * a, q.e, a > 0.25 ? 1 : a * 3);
    }
    for (const q of G.projectiles) R.putW(q.x, q.y, 111, q.col[0], q.col[1], q.col[2], 1);
    const w = G.weather;
    const rc = w.wind > 0.5 ? 47 : 124;
    for (const d of G.rain) {
      if (d.ash) { R.putW(d.x, d.y, d.life % 0.4 < 0.2 ? 46 : 39, 0.55, 0.5, 0.48, 0.3, 0.8); continue; }
      R.putW(d.x, d.y, rc, 0.5, 0.56, 0.7, 0.22, 0.9);
      R.putW(d.x + 0.5, d.y - 1, rc, 0.4, 0.45, 0.58, 0.12, 0.4);
    }
    for (const f of G.fireflies) {
      if (!f.ok) continue;
      const s = 0.5 + 0.5 * Math.sin(t * 3 + f.ph);
      if (s > 0.15) R.putW(f.x, f.y, 183, 0.75 * s, 1 * s, 0.35 * s, 1);
    }
    const p = G.player;
    for (const n of G.npcs) {
      if (G.mode === 'play' && dist(n.x - p.x, n.y - p.y) < 14) R.text(n.x, n.y - 8, n.name, 0.85, 0.78, 0.6, 1);
    }
    if (G.mode === 'play' && !p.dead) R.text(p.x + 0.5, p.y - 11, 'Wanderer', 0.55, 0.55, 0.6, 0.7);
    for (const f of G.floaters) {
      const k = f.life / f.max;
      R.text(f.x, f.y - (1 - k) * 3, f.text, f.r, f.g, f.b, 1);
    }
  };

  // ------------------------------------------------------------ Save
  const KEY = 'duskvale.save.v1';
  G.save = function () {
    const p = G.player;
    if (!p) return;
    const data = {
      p: { lvl: p.lvl, vig: p.vig, mig: p.mig, end: p.end, embers: p.embers, maxFlasks: p.maxFlasks },
      last: G.lastShrine, shrines: [...G.flags.shrines], shrineInfo: G.shrineInfo, bosses: [...G.flags.bosses],
      lore: [...G.flags.lore], gate: G.flags.gateOpen, victory: G.flags.victory, lost: G.lost, clock: G.clock,
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  };
  G.hasSave = function () {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  };
  G.newGame = function (load) {
    let data = null;
    if (load) { try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; } }
    else { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
    const p = (G.player = new Player());
    G.flags.shrines = new Set(); G.flags.bosses = new Set(); G.flags.lore = new Set();
    G.flags.gateOpen = false; G.flags.victory = false; G.shrineInfo = {}; G.lost = null; G.dawn = 0;
    G.lastShrine = { x: 0.5, y: 2.5, id: 'shrine@0,0' };
    G.clock = 0.03;
    G.npcs = []; G.pickups = []; G.particles.length = 0; G.decals.clear(); G.floaters.length = 0;
    if (data) {
      Object.assign(p, data.p);
      G.flags.shrines = new Set(data.shrines || []); G.flags.bosses = new Set(data.bosses || []);
      G.flags.lore = new Set(data.lore || []); G.flags.gateOpen = !!data.gate; G.flags.victory = !!data.victory;
      G.shrineInfo = data.shrineInfo || {}; G.lost = data.lost || null; G.clock = data.clock || 0.03;
      if (G.flags.victory) G.dawn = 1;
      if (data.last) G.lastShrine = data.last;
      p.x = G.lastShrine.x; p.y = G.lastShrine.y;
      G.pickups = G.lost ? [G.lost] : [];
    } else {
      p.x = 0.5; p.y = 4.5;
    }
    p.hp = p.maxHp(); p.st = p.maxSt(); p.flasks = p.maxFlasks;
    G.resetWorldEnemies();
    G.cam.x = p.x; G.cam.y = p.y;
    G.mode = 'play';
    G.area = null;
    G.spawnTimer = 0.3;
  };
})(window.DV);
