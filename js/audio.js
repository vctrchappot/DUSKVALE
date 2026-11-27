'use strict';
(function (DV) {
  const A = (DV.A = { ready: false, muted: false });
  let ac, master, noiseBuf, rainG, windG, windF, droneG, bossG, fireG;

  A.init = function () {
    if (A.ready) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // rain
    rainG = ac.createGain(); rainG.gain.value = 0;
    const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 0.4;
    loopNoise().connect(rf); rf.connect(rainG); rainG.connect(master);
    // wind
    windG = ac.createGain(); windG.gain.value = 0.05;
    windF = ac.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 380; windF.Q.value = 3;
    loopNoise().connect(windF); windF.connect(windG); windG.connect(master);
    // fire crackle bed
    fireG = ac.createGain(); fireG.gain.value = 0;
    const ff = ac.createBiquadFilter(); ff.type = 'highpass'; ff.frequency.value = 1800;
    loopNoise().connect(ff); ff.connect(fireG); fireG.connect(master);
    // drone
    droneG = ac.createGain(); droneG.gain.value = 0.05;
    const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 240;
    [55, 55.6, 82.4].forEach((f) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dl); o.start(); });
    dl.connect(droneG); droneG.connect(master);
    bossG = ac.createGain(); bossG.gain.value = 0;
    const bl = ac.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 320;
    [41.2, 41.7, 61.7, 77.8].forEach((f) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bl); o.start(); });
    bl.connect(bossG); bossG.connect(master);
    A.ready = true;
  };

  function loopNoise() {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s;
  }
  function burst(dur, type, f0, f1, vol, q) {
    if (!A.ready) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, vol, delay) {
    if (!A.ready) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  A.swing = () => burst(0.18, 'bandpass', 700, 2600, 0.25, 2);
  A.hit = () => { tone('sine', 140, 45, 0.16, 0.5); burst(0.08, 'lowpass', 3000, 400, 0.35); };
  A.hurt = () => { tone('square', 110, 60, 0.2, 0.15); burst(0.15, 'lowpass', 1200, 200, 0.4); };
  A.roll = () => burst(0.28, 'lowpass', 600, 150, 0.3);
  A.drink = () => { tone('sine', 520, 780, 0.4, 0.08); tone('sine', 660, 990, 0.5, 0.06, 0.12); };
  A.pickup = () => { tone('triangle', 880, 1320, 0.25, 0.08); tone('triangle', 1320, 1760, 0.3, 0.05, 0.08); };
  A.chime = () => { [392, 494, 587, 784].forEach((f, k) => tone('sine', f, f * 0.995, 2.4, 0.07, k * 0.09)); };
  A.death = () => { tone('sawtooth', 160, 30, 2.5, 0.18); burst(2, 'lowpass', 600, 40, 0.35); };
  A.boom = () => { tone('sine', 90, 25, 0.6, 0.5); burst(0.5, 'lowpass', 900, 60, 0.5); };
  A.cast = () => { tone('sine', 300, 900, 0.3, 0.07); tone('triangle', 450, 1200, 0.3, 0.05); };
  A.alert = () => tone('triangle', 300, 220, 0.2, 0.05);
  A.thunder = (delay) => {
    if (!A.ready) return;
    setTimeout(() => { burst(3.2, 'lowpass', 400, 30, 0.9, 0.7); tone('sine', 50, 28, 2.5, 0.25); }, delay * 1000);
  };
  A.victory = () => { [262, 330, 392, 523, 659].forEach((f, k) => tone('sine', f, f, 4, 0.06, k * 0.25)); };

  A.ambience = function (rain, wind, fire, boss) {
    if (!A.ready) return;
    const t = ac.currentTime;
    rainG.gain.setTargetAtTime(rain * 0.22, t, 0.5);
    windG.gain.setTargetAtTime(0.03 + wind * 0.06, t, 0.8);
    windF.frequency.setTargetAtTime(250 + Math.sin(t * 0.3) * 120 + wind * 200, t, 0.5);
    fireG.gain.setTargetAtTime(fire * (Math.random() < 0.3 ? 0.06 : 0.008), t, 0.02);
    bossG.gain.setTargetAtTime(boss ? 0.08 : 0, t, 1.2);
    droneG.gain.setTargetAtTime(boss ? 0.02 : 0.045, t, 1.2);
  };
  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.05);
  };
})(window.DV);
