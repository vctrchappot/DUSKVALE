import type { GameOptions } from './options.ts';

export class AudioEngine {
  ready = false;
  muted = false;
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private rainG: GainNode | null = null;
  private windG: GainNode | null = null;
  private windF: BiquadFilterNode | null = null;
  private droneG: GainNode | null = null;
  private bossG: GainNode | null = null;
  private fireG: GainNode | null = null;

  init(opts: GameOptions): void {
    if (this.ready) {
      if (this.ac && this.ac.state === 'suspended') {
        void this.ac.resume();
      }
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new Ctx();
    } catch {
      return;
    }
    const ac = this.ac;
    this.master = ac.createGain();
    this.master.connect(ac.destination);

    this.musicBus = ac.createGain();
    this.musicBus.connect(this.master);

    this.sfxBus = ac.createGain();
    this.sfxBus.connect(this.master);

    this.ambBus = ac.createGain();
    this.ambBus.connect(this.master);

    this.noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Rain
    this.rainG = ac.createGain();
    this.rainG.gain.value = 0;
    const rf = ac.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 2400;
    rf.Q.value = 0.4;
    this.loopNoise().connect(rf);
    rf.connect(this.rainG);
    this.rainG.connect(this.ambBus);

    // Wind
    this.windG = ac.createGain();
    this.windG.gain.value = 0.05;
    this.windF = ac.createBiquadFilter();
    this.windF.type = 'lowpass';
    this.windF.frequency.value = 380;
    this.windF.Q.value = 3;
    this.loopNoise().connect(this.windF);
    this.windF.connect(this.windG);
    this.windG.connect(this.ambBus);

    // Fire crackle
    this.fireG = ac.createGain();
    this.fireG.gain.value = 0;
    const ff = ac.createBiquadFilter();
    ff.type = 'highpass';
    ff.frequency.value = 1800;
    this.loopNoise().connect(ff);
    ff.connect(this.fireG);
    this.fireG.connect(this.ambBus);

    // Drone
    this.droneG = ac.createGain();
    this.droneG.gain.value = 0.045;
    const dl = ac.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 240;
    [55, 55.6, 82.4].forEach((f) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dl);
      o.start();
    });
    dl.connect(this.droneG);
    this.droneG.connect(this.musicBus);

    // Boss drone
    this.bossG = ac.createGain();
    this.bossG.gain.value = 0;
    const bl = ac.createBiquadFilter();
    bl.type = 'lowpass';
    bl.frequency.value = 320;
    [41.2, 41.7, 61.7, 77.8].forEach((f) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(bl);
      o.start();
    });
    bl.connect(this.bossG);
    this.bossG.connect(this.musicBus);

    this.ready = true;
    this.applyOptions(opts);
  }

  applyOptions(opts: GameOptions): void {
    this.muted = opts.muted;
    if (!this.ready || !this.ac || !this.master || !this.musicBus || !this.sfxBus || !this.ambBus) return;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(opts.muted ? 0 : opts.masterVol, t, 0.05);
    this.musicBus.gain.setTargetAtTime(opts.musicVol, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(opts.sfxVol, t, 0.05);
    this.ambBus.gain.setTargetAtTime(opts.ambienceVol, t, 0.05);
  }

  private loopNoise(): AudioBufferSourceNode {
    const s = this.ac!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start();
    return s;
  }

  private burst(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1): void {
    if (!this.ready || !this.ac || !this.sfxBus || !this.noiseBuf) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!this.ready || !this.ac || !this.sfxBus) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  swing = (): void => this.burst(0.18, 'bandpass', 700, 2600, 0.25, 2);
  hit = (): void => {
    this.tone('sine', 140, 45, 0.16, 0.5);
    this.burst(0.08, 'lowpass', 3000, 400, 0.35);
  };
  parry = (): void => {
    this.tone('triangle', 1400, 920, 0.28, 0.3);
    this.tone('sine', 2100, 1650, 0.35, 0.18, 0.03);
    this.burst(0.06, 'highpass', 2400, 1200, 0.25);
  };
  stagger = (): void => {
    this.tone('sawtooth', 120, 42, 0.45, 0.32);
    this.burst(0.22, 'lowpass', 1400, 180, 0.4);
  };
  skill = (): void => {
    this.tone('sawtooth', 260, 620, 0.26, 0.14);
    this.burst(0.24, 'bandpass', 1200, 420, 0.26, 1.5);
  };
  levelUp = (): void => {
    [440, 554, 659, 880].forEach((f, k) => this.tone('triangle', f, f * 1.01, 0.9, 0.09, k * 0.08));
  };
  hurt = (): void => {
    this.tone('square', 110, 60, 0.2, 0.15);
    this.burst(0.15, 'lowpass', 1200, 200, 0.4);
  };
  roll = (): void => this.burst(0.28, 'lowpass', 600, 150, 0.3);
  drink = (): void => {
    this.tone('sine', 520, 780, 0.4, 0.08);
    this.tone('sine', 660, 990, 0.5, 0.06, 0.12);
  };
  pickup = (): void => {
    this.tone('triangle', 880, 1320, 0.25, 0.08);
    this.tone('triangle', 1320, 1760, 0.3, 0.05, 0.08);
  };
  chime = (): void => {
    [392, 494, 587, 784].forEach((f, k) => this.tone('sine', f, f * 0.995, 2.4, 0.07, k * 0.09));
  };
  death = (): void => {
    this.tone('sawtooth', 160, 30, 2.5, 0.18);
    this.burst(2, 'lowpass', 600, 40, 0.35);
  };
  boom = (): void => {
    this.tone('sine', 90, 25, 0.6, 0.5);
    this.burst(0.5, 'lowpass', 900, 60, 0.5);
  };
  cast = (): void => {
    this.tone('sine', 300, 900, 0.3, 0.07);
    this.tone('triangle', 450, 1200, 0.3, 0.05);
  };
  alert = (): void => this.tone('triangle', 300, 220, 0.2, 0.05);
  thunder = (delay: number): void => {
    if (!this.ready) return;
    setTimeout(() => {
      this.burst(3.2, 'lowpass', 400, 30, 0.9, 0.7);
      this.tone('sine', 50, 28, 2.5, 0.25);
    }, delay * 1000);
  };
  victory = (): void => {
    [262, 330, 392, 523, 659].forEach((f, k) => this.tone('sine', f, f, 4, 0.06, k * 0.25));
  };

  ambience(rain: number, wind: number, fire: number, boss: boolean): void {
    if (!this.ready || !this.ac || !this.rainG || !this.windG || !this.windF || !this.fireG || !this.bossG || !this.droneG) return;
    const t = this.ac.currentTime;
    this.rainG.gain.setTargetAtTime(rain * 0.22, t, 0.5);
    this.windG.gain.setTargetAtTime(0.03 + wind * 0.06, t, 0.8);
    this.windF.frequency.setTargetAtTime(250 + Math.sin(t * 0.3) * 120 + wind * 200, t, 0.5);
    this.fireG.gain.setTargetAtTime(fire * (Math.random() < 0.3 ? 0.06 : 0.008), t, 0.02);
    this.bossG.gain.setTargetAtTime(boss ? 0.08 : 0, t, 1.2);
    this.droneG.gain.setTargetAtTime(boss ? 0.02 : 0.045, t, 1.2);
  }
}
