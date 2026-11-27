import { cycleZoom, saveOptions, ZOOM_PX, type GameOptions } from '../engine/options.ts';
import { ASP, clamp, TAU } from '../engine/util.ts';
import { ENEMY_DEFS, type Game, type GameUICallbacks } from '../game/game.ts';
import { buildPlayerPortraitAscii } from '../game/pixelSprites.ts';
import { ARMORS, RINGS, SKILLS, WEAPONS, weaponUpgradeCost, xpForNextLevel } from '../game/rpg.ts';
import type { SkillId } from '../game/types.ts';
import type { MultiplayerClient } from '../net/client.ts';
import type { SceneRenderer } from '../render/renderer.ts';
import { T, type WorldFeature } from '../world/types.ts';
import type { TouchController } from './touch.ts';

interface MenuItem {
  label: string;
  sub?: string;
  disabled?: boolean;
  action?: () => void;
}

export class GameUI implements GameUICallbacks {
  open: null | 'dialog' | 'menu' | 'map' | 'journal' | 'inventory' | 'chat' = null;
  debugVisible = false;

  private readonly G: Game;
  private readonly R: SceneRenderer;
  private readonly net: MultiplayerClient;
  private readonly touch: TouchController;
  private readonly onStart: (slot: number, load: boolean) => void;
  private readonly onToTitle: () => void;

  private bannerT = 0;
  private dLines: string[] = [];
  private dIdx = 0;
  private dCb: (() => void) | null = null;
  private mItems: MenuItem[] = [];
  private mSel = 0;
  private mBack: (() => void) | null = null;

  // Map 2.0 zoom & pan
  private mapZoom = 1.0;
  private mapPanX = 0;
  private mapPanY = 0;
  private mapDrag = false;
  private mapDragX = 0;
  private mapDragY = 0;

  // FPS tracking
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;

  private el: Record<string, HTMLElement>;

  constructor(
    G: Game,
    R: SceneRenderer,
    net: MultiplayerClient,
    touch: TouchController,
    onStart: (slot: number, load: boolean) => void,
    onToTitle: () => void,
  ) {
    this.G = G;
    this.R = R;
    this.net = net;
    this.touch = touch;
    this.onStart = onStart;
    this.onToTitle = onToTitle;
    const $ = (id: string) => document.getElementById(id)!;
    this.el = {
      hud: $('hud'),
      portrait: $('portrait'),
      pLvl: $('pLvl'),
      hpBar: $('hpBar'),
      hpText: $('hpText'),
      mpBar: $('mpBar'),
      mpText: $('mpText'),
      stBar: $('stBar'),
      embers: $('embers'),
      sigils: $('sigils'),
      weather: $('weather'),
      compassTrack: $('compassTrack'),
      questTitle: $('questTitle'),
      questDist: $('questDist'),
      onboarding: $('onboarding'),
      xpFill: $('xpFill'),
      xpText: $('xpText'),
      hotbar: $('hotbar'),
      boss: $('boss'),
      bossName: $('bossName'),
      bossFill: $('bossFill'),
      prompt: $('prompt'),
      banner: $('banner'),
      bTitle: $('bTitle'),
      bSub: $('bSub'),
      dialog: $('dialog'),
      dTitle: $('dTitle'),
      dText: $('dText'),
      menu: $('menu'),
      mTitle: $('mTitle'),
      mInfo: $('mInfo'),
      mItems: $('mItems'),
      death: $('death'),
      title: $('title'),
      tMenu: $('tMenu'),
      mapWrap: $('mapWrap'),
      map: $('map'),
      journal: $('journal'),
      journalBody: $('journalBody'),
      inventory: $('inventory'),
      inventoryBody: $('inventoryBody'),
      help: $('help'),
      hurt: $('hurt'),
      debug: $('debug'),
      chatLog: $('chatLog'),
      chatForm: $('chatForm'),
      chatInput: $('chatInput'),
    };

    this.initMapControls();
    this.initChatControls();
    this.buildHotbar();
    this.applyUiScale();
    this.net.onChatUpdate = () => this.renderChatLog();
  }

  private initChatControls(): void {
    const form = this.el.chatForm as HTMLFormElement;
    const input = this.el.chatInput as HTMLInputElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) {
        this.net.sendChat(input.value);
      }
      input.value = '';
      this.closeChat();
    });
  }

  openChat(): void {
    if (this.open) return;
    this.open = 'chat';
    this.el.chatForm.classList.remove('hidden');
    const input = this.el.chatInput as HTMLInputElement;
    input.focus();
  }

  closeChat(): void {
    if (this.open === 'chat') this.open = null;
    this.el.chatForm.classList.add('hidden');
    (this.el.chatInput as HTMLInputElement).blur();
  }

  private renderChatLog(): void {
    const recent = this.net.chatLog.slice(-6);
    this.el.chatLog.innerHTML = recent
      .map((m) => {
        const cls = m.kind === 'system' ? 'csys' : m.kind === 'emote' ? 'cemote' : 'cmsg';
        const prefix = m.kind === 'chat' ? `<b>${m.senderName}:</b> ` : '';
        return `<div class="${cls}">${prefix}${m.text}</div>`;
      })
      .join('');
  }

  private applyUiScale(): void {
    document.documentElement.style.setProperty('--ui-scale', String(this.G.options.uiScale));
  }

  private buildHotbar(): void {
    const hb = this.el.hotbar;
    hb.innerHTML = '';
    const slots = [
      { key: '1', id: 'flame_slash', icon: SKILLS.flame_slash.icon, name: SKILLS.flame_slash.name },
      { key: '2', id: 'ember_bolt', icon: SKILLS.ember_bolt.icon, name: SKILLS.ember_bolt.name },
      { key: '3', id: 'ash_shield', icon: SKILLS.ash_shield.icon, name: SKILLS.ash_shield.name },
      { key: '4', id: 'leap_strike', icon: SKILLS.leap_strike.icon, name: SKILLS.leap_strike.name },
      { key: 'Q', id: 'flask', icon: '♦', name: 'Glutflakon' },
      { key: 'F', id: 'parry', icon: '⛨', name: 'Parieren' },
      { key: 'Tab', id: 'lock', icon: '◎', name: 'Lock-on' },
      { key: 'I', id: 'inv', icon: '▣', name: 'Inventar' },
      { key: 'J', id: 'jour', icon: '▤', name: 'Journal' },
      { key: 'M', id: 'map', icon: '◈', name: 'Karte' },
    ];
    for (const s of slots) {
      const div = document.createElement('button');
      div.className = 'hslot';
      div.dataset.slotId = s.id;
      div.title = `${s.name} [${s.key}]`;
      div.innerHTML = `<span class="hk">${s.key}</span><span class="hi">${s.icon}</span><span class="hcd"></span>`;
      div.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (s.id === 'flask') this.G.useSkill(5);
        else if (s.id === 'inv') this.toggleInventory();
        else if (s.id === 'jour') this.toggleJournal();
        else if (s.id === 'map') this.toggleMap();
        else if (s.id === 'lock') this.G.toggleLockOn();
        else if (s.key >= '1' && s.key <= '4') this.G.useSkill(Number(s.key));
      });
      hb.appendChild(div);
    }
  }

  update(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.4) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const G = this.G;
    const p = G.player;
    const playing = G.mode === 'play';
    this.el.hud.classList.toggle('hidden', !playing);

    if (playing) {
      const armor = ARMORS[p.armorId] || ARMORS.wanderer_plate;
      this.el.portrait.textContent = buildPlayerPortraitAscii(armor);
      this.el.pLvl.textContent = `Stufe ${p.lvl}${p.attrPoints > 0 ? ` (+${p.attrPoints})` : ''}`;

      const maxHp = G.maxHp();
      const maxMp = G.maxMp();
      const maxSt = G.maxSt();
      this.el.hpBar.style.width = `${clamp((p.hp / maxHp) * 100, 0, 100)}%`;
      this.el.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${maxHp}`;
      this.el.mpBar.style.width = `${clamp((p.mp / maxMp) * 100, 0, 100)}%`;
      this.el.mpText.textContent = `${Math.floor(p.mp)} / ${maxMp}`;
      this.el.stBar.style.width = `${clamp((Math.max(0, p.st) / maxSt) * 100, 0, 100)}%`;

      this.el.embers.textContent = String(p.embers);
      const sg = ['wight', 'matron', 'corvus'].map((b) => (G.flags.bosses.has(b) ? '◆' : '◇')).join(' ');
      this.el.sigils.textContent = `Siegel ${sg}`;

      const wName = { klar: 'Klar', nebel: 'Nebel', regen: 'Regen', sturm: 'Sturm' }[G.weather.kind];
      const tod = G.flags.victory ? 'Morgen' : G.night > 0.6 ? 'Tiefe Nacht' : G.night > 0.3 ? 'Nacht' : 'Dämmerung';
      this.el.weather.textContent = `${tod} · ${wName}`;

      // Quest tracker top-right
      this.el.questTitle.textContent = G.quest.step.title;
      this.el.questDist.textContent = G.quest.trackerLine;

      // Onboarding hint
      const hint = G.activeOnboardingHint();
      this.el.onboarding.textContent = hint || '';
      this.el.onboarding.classList.toggle('hidden', !hint);

      // Compass bar top-center
      this.updateCompass();

      // XP bar bottom
      const nextXp = xpForNextLevel(p.lvl);
      this.el.xpFill.style.width = `${clamp((p.xp / nextXp) * 100, 0, 100)}%`;
      this.el.xpText.textContent = `Stufe ${p.lvl} · XP ${p.xp} / ${nextXp} · ${WEAPONS[p.weaponId]?.name || ''}${p.weaponUpgrade > 0 ? ` +${p.weaponUpgrade}` : ''}`;

      // Hotbar cooldowns & flask count
      for (const node of Array.from(this.el.hotbar.children) as HTMLElement[]) {
        const sid = node.dataset.slotId!;
        const cdEl = node.querySelector('.hcd') as HTMLElement;
        if (sid === 'flask') {
          cdEl.textContent = `${p.flasks}/${p.maxFlasks}`;
          cdEl.classList.toggle('active', p.flasks === 0);
        } else if (sid in p.skillCD) {
          const cd = p.skillCD[sid as SkillId];
          cdEl.textContent = cd > 0.05 ? `${cd.toFixed(1)}s` : '';
          cdEl.classList.toggle('active', cd > 0.05);
        }
      }

      // Boss bar
      if (G.boss) {
        this.el.boss.classList.remove('hidden');
        this.el.bossName.textContent = `${G.boss.d.name}${G.boss.phase === 2 ? ' · PHASE II' : ''}`;
        this.el.bossFill.style.width = `${clamp((G.boss.hp / G.boss.maxHp) * 100, 0, 100)}%`;
      } else {
        this.el.boss.classList.add('hidden');
      }

      // Interact prompt
      const it = G.interact;
      const pt = it && !this.open && !p.dead ? `[E] ${it.label}` : '';
      this.el.prompt.textContent = pt;
      this.el.prompt.classList.toggle('hidden', !pt);
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }

    // F3 Debug overlay
    this.el.debug.classList.toggle('hidden', !this.debugVisible);
    if (this.debugVisible) {
      const gl = this.R.gl;
      this.el.debug.textContent =
        `FPS: ${this.currentFps} | Frame: ${this.R.lastRenderMs.toFixed(1)} ms | ${gl.usingWebGL ? 'WebGL2' : '2D'}\n` +
        `Zellen: ${gl.visCols}×${gl.visRows} (${gl.cellW}×${gl.cellH}px, Zoom: ${G.options.zoom})\n` +
        `Pos: ${p.x.toFixed(1)}, ${p.y.toFixed(1)} (H:${G.world.elevAt(p.x, p.y)}) | Chunks: ${G.world.chunks.size} | Lichter: ${this.R.lastLightCount}\n` +
        `Netz: ${this.net.mode} | Wanderer: ${this.net.peers.size + 1}${this.net.pingMs ? ` | Ping: ${this.net.pingMs}ms` : ''}`;
    }
  }

  private updateCompass(): void {
    const G = this.G;
    const p = G.player;
    const track = this.el.compassTrack;
    const markers: { angle: number; glyph: string; cls: string }[] = [
      { angle: -Math.PI / 2, glyph: 'N', cls: 'card' },
      { angle: 0, glyph: 'O', cls: 'card' },
      { angle: Math.PI / 2, glyph: 'S', cls: 'card' },
      { angle: Math.PI, glyph: 'W', cls: 'card' },
    ];

    if (!G.flags.victory) {
      const a = Math.atan2((G.quest.step.targetY - p.y) * ASP, G.quest.step.targetX - p.x);
      markers.push({ angle: a, glyph: '◆', cls: 'quest' });
    }
    for (const s of Object.values(G.shrineInfo)) {
      const a = Math.atan2((s.y - p.y) * ASP, s.x - p.x);
      markers.push({ angle: a, glyph: '▲', cls: 'shrine' });
    }
    if (G.lost) {
      const a = Math.atan2((G.lost.y - p.y) * ASP, G.lost.x - p.x);
      markers.push({ angle: a, glyph: '*', cls: 'lost' });
    }
    if (G.boss) {
      const a = Math.atan2((G.boss.y - p.y) * ASP, G.boss.x - p.x);
      markers.push({ angle: a, glyph: '☠', cls: 'boss' });
    }
    for (const rp of this.net.getRemoteList()) {
      const a = Math.atan2((rp.y - p.y) * ASP, rp.x - p.x);
      markers.push({ angle: a, glyph: '◎', cls: 'peer' });
    }

    // Center compass on North (-PI/2) or player facing? Fixed North-up compass with relative markers is super readable!
    let html = '';
    for (const m of markers) {
      // Map angle [-PI..PI] with North (-PI/2) at 50%
      let rel = ((m.angle + Math.PI / 2 + Math.PI * 3) % TAU) - Math.PI;
      const pct = 50 + (rel / Math.PI) * 48;
      html += `<span class="cm ${m.cls}" style="left:${pct.toFixed(1)}%">${m.glyph}</span>`;
    }
    track.innerHTML = html;
  }

  banner(title: string, sub = '', style = '', dur = 3.2): void {
    this.el.bTitle.textContent = title;
    this.el.bSub.textContent = sub;
    this.el.banner.className = `show ${style}`;
    this.bannerT = dur;
  }

  hurtFlash(): void {
    this.el.hurt.style.transition = 'none';
    this.el.hurt.style.opacity = '1';
    requestAnimationFrame(() => {
      this.el.hurt.style.transition = 'opacity .55s';
      this.el.hurt.style.opacity = '0';
    });
  }

  death(show: boolean): void {
    this.el.death.classList.toggle('hidden', !show);
    if (show) {
      this.el.death.classList.remove('fade');
      void this.el.death.offsetWidth;
      this.el.death.classList.add('fade');
    }
  }

  // ------------------------------------------------------------ Dialog
  dialog(title: string, lines: string[], cb?: () => void): void {
    this.dLines = lines;
    this.dIdx = 0;
    this.dCb = cb || null;
    this.el.dTitle.textContent = title;
    this.el.dText.textContent = lines[0];
    this.el.dialog.classList.remove('hidden');
    this.open = 'dialog';
  }

  dialogNext(): void {
    this.dIdx++;
    if (this.dIdx >= this.dLines.length) {
      this.el.dialog.classList.add('hidden');
      this.open = null;
      const cb = this.dCb;
      this.dCb = null;
      if (cb) cb();
    } else {
      this.el.dText.textContent = this.dLines[this.dIdx];
    }
  }

  // ------------------------------------------------------------ Menus
  menu(title: string, items: MenuItem[], back?: (() => void) | null, info = ''): void {
    this.mItems = items;
    this.mBack = back || null;
    this.mSel = Math.max(0, items.findIndex((i) => !i.disabled));
    this.el.mTitle.textContent = title;
    this.el.mInfo.textContent = info;
    this.el.mItems.innerHTML = '';
    items.forEach((it, k) => {
      const b = document.createElement('button');
      b.className = 'item' + (it.disabled ? ' disabled' : '');
      b.innerHTML = `<span class="lab"></span><span class="sub"></span>`;
      b.querySelector('.lab')!.textContent = it.label;
      b.querySelector('.sub')!.textContent = it.sub || '';
      b.addEventListener('mouseenter', () => {
        this.mSel = k;
        this.paintMenu();
      });
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.mSel = k;
        this.menuActivate();
      });
      this.el.mItems.appendChild(b);
    });
    this.paintMenu();
    this.el.menu.classList.remove('hidden');
    this.open = 'menu';
  }

  private paintMenu(): void {
    Array.from(this.el.mItems.children).forEach((b, k) => b.classList.toggle('sel', k === this.mSel));
  }

  menuMove(d: number): void {
    if (!this.mItems.length) return;
    let k = this.mSel;
    for (let n = 0; n < this.mItems.length; n++) {
      k = (k + d + this.mItems.length) % this.mItems.length;
      if (!this.mItems[k].disabled) break;
    }
    this.mSel = k;
    this.paintMenu();
  }

  menuActivate(): void {
    const it = this.mItems[this.mSel];
    if (it && !it.disabled && it.action) it.action();
  }

  menuBack(): void {
    if (this.mBack) this.mBack();
    else this.closeAll();
  }

  closeAll(): void {
    this.el.menu.classList.add('hidden');
    this.el.mapWrap.classList.add('hidden');
    this.el.journal.classList.add('hidden');
    this.el.inventory.classList.add('hidden');
    this.open = null;
  }

  shrineMenu(f: WorldFeature): void {
    const G = this.G;
    const p = G.player;
    const name = G.shrineInfo[f.id]?.name || 'Schrein';
    this.menu(
      name,
      [
        {
          label: `Attribute steigern (${p.attrPoints} Pkt.)`,
          sub: 'Aus XP-Stufenaufstiegen',
          disabled: p.attrPoints <= 0,
          action: () => this.attrMenu(f),
        },
        {
          label: 'Reisen',
          sub: 'Zu einem entzündeten Schrein',
          disabled: Object.keys(G.shrineInfo).length < 2,
          action: () => this.travelMenu(f),
        },
        {
          label: 'Spielstand speichern',
          sub: `Slot ${G.activeSlot}`,
          action: () => {
            G.save();
            this.banner('GESPEICHERT', `Slot ${G.activeSlot} aktualisiert`, 'gold', 2);
            this.shrineMenu(f);
          },
        },
        { label: 'Weiterziehen', action: () => this.closeAll() },
      ],
      null,
      `Du rastest. Leben, Mana und Flakons sind erneuert. Glut: ${p.embers} · Stufe ${p.lvl}`,
    );
  }

  private attrMenu(f: WorldFeature): void {
    const G = this.G;
    const p = G.player;
    const can = p.attrPoints > 0;
    const mk = (stat: 'vig' | 'mig' | 'end' | 'arc', label: string, desc: string): MenuItem => ({
      label: `${label}  ${p[stat]}`,
      sub: desc,
      disabled: !can,
      action: () => {
        if (G.spendAttrPoint(stat)) this.attrMenu(f);
      },
    });
    this.menu(
      'Attribute steigern',
      [
        mk('vig', 'Vitalität', '+16 LP'),
        mk('mig', 'Stärke', '+4.5 Schaden'),
        mk('end', 'Ausdauer', '+12 Ausdauer'),
        mk('arc', 'Arkanum', '+12 Mana'),
        { label: 'Zurück', action: () => this.shrineMenu(f) },
      ],
      () => this.shrineMenu(f),
      `Verfügbare Attributpunkte: ${p.attrPoints}`,
    );
  }

  private travelMenu(f: WorldFeature): void {
    const G = this.G;
    const items: MenuItem[] = Object.entries(G.shrineInfo).map(([id, s]) => ({
      label: s.name,
      sub: id === f.id ? 'hier' : `${Math.round(s.x)}, ${Math.round(s.y)}`,
      disabled: id === f.id,
      action: () => {
        this.closeAll();
        G.travel(id);
        G.audio.chime();
      },
    }));
    items.push({ label: 'Zurück', action: () => this.shrineMenu(f) });
    this.menu('Schnellreise', items, () => this.shrineMenu(f));
  }

  smithMenu(): void {
    const G = this.G;
    const p = G.player;
    const upCost = weaponUpgradeCost(p.weaponUpgrade);
    const items: MenuItem[] = [
      {
        label: `Waffe schmieden (+${p.weaponUpgrade} → +${p.weaponUpgrade + 1})`,
        sub: p.weaponUpgrade >= 5 ? 'Maximalstufe' : `${upCost} Glut · +4 Schaden`,
        disabled: p.weaponUpgrade >= 5 || p.embers < upCost,
        action: () => {
          if (G.upgradeWeapon()) this.smithMenu();
        },
      },
    ];
    for (const w of Object.values(WEAPONS)) {
      if (w.price <= 0) continue;
      const owned = p.inventoryWeapons.includes(w.id);
      items.push({
        label: w.name,
        sub: owned ? 'im Besitz' : `${w.price} Glut · ${w.desc}`,
        disabled: owned || p.embers < w.price,
        action: () => {
          if (G.buyItem('weapon', w.id)) this.smithMenu();
        },
      });
    }
    items.push({ label: 'Verlassen', action: () => this.closeAll() });
    this.menu('Bran, Glutschmied', items, null, `Deine Glut: ${p.embers} · Aktuelle Waffe: ${WEAPONS[p.weaponId]?.name} +${p.weaponUpgrade}`);
  }

  merchantMenu(): void {
    const G = this.G;
    const p = G.player;
    const items: MenuItem[] = [];
    for (const a of Object.values(ARMORS)) {
      if (a.price <= 0) continue;
      const owned = p.inventoryArmors.includes(a.id);
      items.push({
        label: `[Rüstung] ${a.name}`,
        sub: owned ? 'im Besitz' : `${a.price} Glut · ${a.desc}`,
        disabled: owned || p.embers < a.price,
        action: () => {
          if (G.buyItem('armor', a.id)) this.merchantMenu();
        },
      });
    }
    for (const r of Object.values(RINGS)) {
      const owned = p.inventoryRings.includes(r.id);
      items.push({
        label: `[Ring] ${r.name}`,
        sub: owned ? 'im Besitz' : `${r.price} Glut · ${r.desc}`,
        disabled: owned || p.embers < r.price,
        action: () => {
          if (G.buyItem('ring', r.id)) this.merchantMenu();
        },
      });
    }
    items.push({ label: 'Verlassen', action: () => this.closeAll() });
    this.menu('Sera, Händlerin', items, null, `Deine Glut: ${p.embers}`);
  }

  pauseMenu(): void {
    this.menu('Pause', [
      { label: 'Weiter', action: () => this.closeAll() },
      { label: 'Optionen & Barrierefreiheit', action: () => this.optionsMenu() },
      { label: 'Spielstände (Export / Import)', action: () => this.savesMenu() },
      { label: 'Inventar', sub: 'I', action: () => { this.closeAll(); this.toggleInventory(); } },
      { label: 'Journal', sub: 'J', action: () => { this.closeAll(); this.toggleJournal(); } },
      { label: 'Karte', sub: 'M', action: () => { this.closeAll(); this.toggleMap(); } },
      { label: 'Steuerung', sub: 'H', action: () => { this.closeAll(); this.toggleHelp(true); } },
      { label: 'Zum Titel', action: () => { this.closeAll(); this.onToTitle(); } },
    ]);
  }

  optionsMenu(): void {
    const o: GameOptions = this.G.options;
    const saveAndReopen = () => {
      saveOptions(o);
      this.G.audio.applyOptions(o);
      this.applyUiScale();
      this.optionsMenu();
    };
    this.menu(
      'Optionen & Barrierefreiheit',
      [
        {
          label: `Zoomstufe: ${o.zoom.toUpperCase()} (${ZOOM_PX[o.zoom]}px)`,
          sub: 'Nah / Mittel / Fern',
          action: () => {
            o.zoom = o.zoom === 'nah' ? 'mittel' : o.zoom === 'mittel' ? 'fern' : 'nah';
            this.R.resize(ZOOM_PX[o.zoom]);
            saveAndReopen();
          },
        },
        {
          label: `Helligkeit (Gamma): ${o.gamma.toFixed(2)}`,
          sub: '0.85 – 1.35',
          action: () => {
            o.gamma = o.gamma >= 1.3 ? 0.85 : Number((o.gamma + 0.1).toFixed(2));
            saveAndReopen();
          },
        },
        {
          label: `Hoher Kontrast: ${o.highContrast ? 'AN' : 'AUS'}`,
          action: () => {
            o.highContrast = !o.highContrast;
            saveAndReopen();
          },
        },
        {
          label: `Kamerabewegung reduzieren: ${o.reduceCameraMotion ? 'AN' : 'AUS'}`,
          sub: 'Keine Shakes, kein Vorhalt',
          action: () => {
            o.reduceCameraMotion = !o.reduceCameraMotion;
            saveAndReopen();
          },
        },
        {
          label: `Blitze reduzieren: ${o.reduceFlashes ? 'AN' : 'AUS'}`,
          sub: 'Gewitter ohne Vollbild-Flash',
          action: () => {
            o.reduceFlashes = !o.reduceFlashes;
            saveAndReopen();
          },
        },
        {
          label: `Bloom: ${o.bloom ? 'AN' : 'AUS'} · Schatten: ${o.shadows ? 'AN' : 'AUS'}`,
          action: () => {
            o.bloom = !o.bloom;
            saveAndReopen();
          },
        },
        {
          label: `Zielhilfe-Pfeil: ${o.targetArrow ? 'AN' : 'AUS'}`,
          action: () => {
            o.targetArrow = !o.targetArrow;
            saveAndReopen();
          },
        },
        {
          label: `UI-Textgröße: ${Math.round(o.uiScale * 100)}%`,
          action: () => {
            o.uiScale = o.uiScale >= 1.15 ? 0.9 : o.uiScale < 1 ? 1.0 : 1.15;
            saveAndReopen();
          },
        },
        {
          label: `Touch-Steuerung (Mobile): ${this.touch.enabled ? 'AN' : 'AUS'}`,
          sub: 'Virtueller Stick & Tasten',
          action: () => {
            o.touchControls = !this.touch.enabled;
            this.touch.setEnabled(o.touchControls);
            saveAndReopen();
          },
        },
        {
          label: `Gefährten / Phantom-Wanderer: ${o.showPhantoms ? 'AN' : 'AUS'}`,
          sub: 'MMO-Gefährten in der Welt',
          action: () => {
            o.showPhantoms = !o.showPhantoms;
            this.net.setPhantomsEnabled(o.showPhantoms);
            saveAndReopen();
          },
        },
        {
          label: `Ton: ${o.muted ? 'STUMM' : `${Math.round(o.masterVol * 100)}%`}`,
          action: () => {
            o.muted = !o.muted;
            saveAndReopen();
          },
        },
        { label: 'Zurück', action: () => this.pauseMenu() },
      ],
      () => this.pauseMenu(),
    );
  }

  private savesMenu(): void {
    const saves = this.G.listSaves();
    const items: MenuItem[] = [1, 2, 3].map((slot, idx) => {
      const s = saves[idx];
      return {
        label: `Slot ${slot} ${slot === this.G.activeSlot ? '(aktiv)' : ''}`,
        sub: s ? `Stufe ${s.player.lvl} · ${s.bosses.length} Bosse · Speichern` : 'Leer · Speichern',
        action: () => {
          this.G.activeSlot = slot;
          this.G.save(slot);
          this.savesMenu();
        },
      };
    });
    items.push({
      label: 'Spielstand als JSON exportieren',
      sub: 'Download',
      action: () => {
        const blob = new Blob([JSON.stringify(this.G.serializeSave(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `duskvale-slot${this.G.activeSlot}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
    items.push({
      label: 'Spielstand aus JSON importieren',
      sub: 'Datei wählen',
      action: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          if (this.G.importSaveJson(text)) {
            this.closeAll();
            this.banner('SPIELSTAND GELADEN', file.name, 'gold', 2.5);
          }
        };
        input.click();
      },
    });
    items.push({ label: 'Zurück', action: () => this.pauseMenu() });
    this.menu('Spielstände', items, () => this.pauseMenu());
  }

  // ------------------------------------------------------------ Title Screen
  title(show: boolean): void {
    this.el.title.classList.toggle('hidden', !show);
    if (!show) return;
    const saves = this.G.listSaves();
    this.el.tMenu.innerHTML = '';
    const add = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        fn();
      });
      this.el.tMenu.appendChild(b);
    };
    const firstIdx = saves.findIndex((s) => s !== null);
    if (firstIdx >= 0) {
      add(`Fortsetzen (Slot ${firstIdx + 1} · St. ${saves[firstIdx]!.player.lvl})`, () => this.onStart(firstIdx + 1, true));
    }
    add(firstIdx >= 0 ? 'Neues Spiel' : 'Beginnen', () => this.onStart(1, false));
  }

  toggleHelp(force?: boolean): void {
    const show = force !== undefined ? force : this.el.help.classList.contains('hidden');
    this.el.help.classList.toggle('hidden', !show);
  }

  adjustZoom(dir: 1 | -1): void {
    this.G.options.zoom = cycleZoom(this.G.options.zoom, dir);
    saveOptions(this.G.options);
    this.R.resize(ZOOM_PX[this.G.options.zoom]);
  }

  // ------------------------------------------------------------ Journal (J)
  toggleJournal(): void {
    if (this.open === 'journal') {
      this.closeAll();
      return;
    }
    if (this.open) return;
    this.open = 'journal';
    const G = this.G;
    const stepsHtml = G.quest.allSteps
      .map((s) => `<div class="jrow ${s.done ? 'done' : ''}"><span>${s.done ? '✓' : '◆'} ${s.title}</span><small>${s.detail}</small></div>`)
      .join('');
    const bestHtml =
      Object.entries(G.bestiary)
        .map(([k, cnt]) => `<div class="jrow"><span>${ENEMY_DEFS[k]?.name || k} (${cnt}× besiegt)</span><small>${ENEMY_DEFS[k]?.desc || ''}</small></div>`)
        .join('') || '<div class="dim">Noch keine Gegner bezwungen.</div>';
    const loreHtml =
      G.loreLog.map((l) => `<div class="jrow"><span>${l.title}</span><small>${l.text}</small></div>`).join('') ||
      '<div class="dim">Noch keine Stelen gelesen.</div>';

    this.el.journalBody.innerHTML = `
      <div class="jsec"><h3>Hauptquest</h3>${stepsHtml}</div>
      <div class="jsec"><h3>Bestiarium</h3>${bestHtml}</div>
      <div class="jsec"><h3>Gefundene Stelen</h3>${loreHtml}</div>
    `;
    this.el.journal.classList.remove('hidden');
  }

  // ------------------------------------------------------------ Inventory (I)
  toggleInventory(): void {
    if (this.open === 'inventory') {
      this.closeAll();
      return;
    }
    if (this.open) return;
    this.open = 'inventory';
    this.renderInventory();
    this.el.inventory.classList.remove('hidden');
  }

  private renderInventory(): void {
    const G = this.G;
    const p = G.player;
    const body = this.el.inventoryBody;
    body.innerHTML = '';

    const stats = document.createElement('div');
    stats.className = 'isec';
    stats.innerHTML = `<h3>Charakter · Stufe ${p.lvl} (${p.attrPoints} Attributpunkte frei)</h3>`;
    const statRow = document.createElement('div');
    statRow.className = 'statGrid';
    const attrs: ['vig' | 'mig' | 'end' | 'arc', string][] = [
      ['vig', 'Vitalität'],
      ['mig', 'Stärke'],
      ['end', 'Ausdauer'],
      ['arc', 'Arkanum'],
    ];
    for (const [key, label] of attrs) {
      const b = document.createElement('button');
      b.className = 'ibtn';
      b.disabled = p.attrPoints <= 0;
      b.textContent = `${label}: ${p[key]} ${p.attrPoints > 0 ? '[+]' : ''}`;
      b.onclick = () => {
        if (G.spendAttrPoint(key)) this.renderInventory();
      };
      statRow.appendChild(b);
    }
    stats.appendChild(statRow);
    body.appendChild(stats);

    const addEquipSection = (title: string, ids: string[], current: string | null, lookup: Record<string, { name: string; desc: string }>, onPick: (id: string) => void) => {
      const sec = document.createElement('div');
      sec.className = 'isec';
      sec.innerHTML = `<h3>${title}</h3>`;
      if (!ids.length) {
        sec.innerHTML += '<div class="dim">Keine Gegenstände. Besuche Schmied oder Händlerin in der Glutsenke.</div>';
      }
      for (const id of ids) {
        const item = lookup[id];
        if (!item) continue;
        const b = document.createElement('button');
        b.className = 'item' + (current === id ? ' sel' : '');
        b.innerHTML = `<span class="lab">${item.name}${current === id ? ' (ausgerüstet)' : ''}</span><span class="sub">${item.desc}</span>`;
        b.onclick = () => {
          onPick(id);
          G.save();
          this.renderInventory();
        };
        sec.appendChild(b);
      }
      body.appendChild(sec);
    };

    addEquipSection('Waffen', p.inventoryWeapons, p.weaponId, WEAPONS, (id) => { p.weaponId = id; });
    addEquipSection('Rüstungen (sichtbar am Sprite)', p.inventoryArmors, p.armorId, ARMORS, (id) => { p.armorId = id; });
    addEquipSection('Ringe', p.inventoryRings, p.ringId, RINGS, (id) => {
      p.ringId = id;
      p.hp = Math.min(G.maxHp(), p.hp);
      p.mp = Math.min(G.maxMp(), p.mp);
      p.st = Math.min(G.maxSt(), p.st);
    });
  }

  // ------------------------------------------------------------ Map 2.0 (Zoom, Pan, ? Silhouettes, Pins)
  private initMapControls(): void {
    const cv = this.el.map as HTMLCanvasElement;
    cv.addEventListener('wheel', (ev) => {
      if (this.open !== 'map') return;
      ev.preventDefault();
      this.mapZoom = clamp(this.mapZoom * (ev.deltaY < 0 ? 1.15 : 0.87), 0.6, 3.5);
      this.drawMap();
    });
    cv.addEventListener('mousedown', (ev) => {
      if (this.open !== 'map') return;
      if (ev.button === 2) {
        // Right-click drops a custom pin
        const rect = cv.getBoundingClientRect();
        const wx = this.G.player.x + (ev.clientX - rect.left - cv.width * 0.5 - this.mapPanX) / (1.8 * this.mapZoom);
        const wy = this.G.player.y + (ev.clientY - rect.top - cv.height * 0.5 - this.mapPanY) / (1.8 * ASP * this.mapZoom);
        this.G.mapPins.push({ x: Math.round(wx), y: Math.round(wy), label: `Pin ${this.G.mapPins.length + 1}` });
        this.drawMap();
        return;
      }
      this.mapDrag = true;
      this.mapDragX = ev.clientX;
      this.mapDragY = ev.clientY;
    });
    window.addEventListener('mousemove', (ev) => {
      if (!this.mapDrag || this.open !== 'map') return;
      this.mapPanX += ev.clientX - this.mapDragX;
      this.mapPanY += ev.clientY - this.mapDragY;
      this.mapDragX = ev.clientX;
      this.mapDragY = ev.clientY;
      this.drawMap();
    });
    window.addEventListener('mouseup', () => {
      this.mapDrag = false;
    });
  }

  toggleMap(): void {
    if (this.open === 'map') {
      this.closeAll();
      return;
    }
    if (this.open) return;
    this.open = 'map';
    this.mapZoom = 1.0;
    this.mapPanX = 0;
    this.mapPanY = 0;
    this.el.mapWrap.classList.remove('hidden');
    this.drawMap();
  }

  private drawMap(): void {
    const G = this.G;
    const W = G.world;
    const cv = this.el.map as HTMLCanvasElement;
    cv.width = Math.min(960, Math.round(window.innerWidth * 0.86));
    cv.height = Math.min(620, Math.round(window.innerHeight * 0.74));
    const ctx = cv.getContext('2d')!;

    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const scale = 1.8 * this.mapZoom;
    const cx = cv.width * 0.5 + this.mapPanX;
    const cy = cv.height * 0.5 + this.mapPanY;
    const toS = (x: number, y: number): [number, number] => [cx + (x - G.player.x) * scale, cy + (y - G.player.y) * ASP * scale];

    // Render visited chunks
    const colorMap: Record<number, string> = {
      [T.DEEP]: '#132844',
      [T.WATER]: '#1c3b5c',
      [T.SHALLOW]: '#2a5063',
      [T.GRASS]: '#2a5624',
      [T.MOOR]: '#554a2b',
      [T.FOREST]: '#1c3b1d',
      [T.ROAD]: '#7b6f5c',
      [T.WALL]: '#9c9b99',
      [T.TOWER_WALL]: '#8c8c96',
      [T.FLOOR]: '#6d6d76',
      [T.ASH]: '#463c3c',
      [T.ROCK]: '#5e6068',
      [T.MOUNT]: '#777985',
      [T.BRIDGE]: '#7e5a37',
    };

    const step = this.mapZoom < 1 ? 2 : 1;
    for (const k of W.visited) {
      const c = W.chunks.get(k);
      if (!c) continue;
      for (let j = 0; j < 32; j += step) {
        for (let i = 0; i < 32; i += step) {
          const [sx, sy] = toS(c.cx * 32 + i, c.cy * 32 + j);
          if (sx < -4 || sy < -4 || sx > cv.width + 4 || sy > cv.height + 4) continue;
          const t = c.type[j * 32 + i];
          ctx.fillStyle = colorMap[t] || '#3a4236';
          ctx.fillRect(sx, sy, Math.ceil(scale * step) + 0.5, Math.ceil(scale * ASP * step) + 0.5);
        }
      }
    }

    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';

    // Landmarks: visited show full icon; known-but-unvisited show "?" silhouette!
    for (const L of W.landmarks) {
      const key = `${L.x >> 5},${L.y >> 5}`;
      const visited = W.visited.has(key);
      const known = G.flags.knownLandmarks.has(L.id);
      if (!visited && !known) continue;
      const [sx, sy] = toS(L.x, L.y);
      ctx.fillStyle = visited ? '#e8d8b4' : '#9ca8bf';
      ctx.fillText(visited ? L.name : `? ${L.name}`, sx, sy - 10);
      ctx.fillText(visited ? '✠' : '?', sx, sy + 5);
    }

    // Quest target marker
    if (!G.flags.victory) {
      const [qx, qy] = toS(G.quest.step.targetX, G.quest.step.targetY);
      ctx.strokeStyle = '#ffb84d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(qx, qy, 10, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffb84d';
      ctx.fillText('◆', qx, qy + 4);
    }

    // Lit shrines
    for (const s of Object.values(G.shrineInfo)) {
      const [sx, sy] = toS(s.x, s.y);
      ctx.fillStyle = '#ff9c3d';
      ctx.fillText('▲', sx, sy + 4);
    }

    // Lost embers
    if (G.lost) {
      const [lx, ly] = toS(G.lost.x, G.lost.y);
      ctx.fillStyle = '#ffd27a';
      ctx.fillText('*', lx, ly + 4);
    }

    // Custom player pins
    for (const pin of G.mapPins) {
      const [px, py] = toS(pin.x, pin.y);
      ctx.fillStyle = '#7ad4ff';
      ctx.fillText(`✦ ${pin.label}`, px, py - 4);
    }

    // Remote players on Map 2.0
    for (const rp of this.net.getRemoteList()) {
      const [rx, ry] = toS(rp.x, rp.y);
      ctx.fillStyle = '#7ed8ff';
      ctx.beginPath();
      ctx.arc(rx, ry, 4, 0, TAU);
      ctx.fill();
      ctx.fillText(rp.name, rx, ry - 7);
    }

    // Player dot
    const [px, py] = toS(G.player.x, G.player.y);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, TAU);
    ctx.fill();
  }
}
