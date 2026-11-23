'use strict';
// =====================================================================
//  GWIEZDNY ODDZIAŁ – DŹWIĘKI
//  Wszystkie dźwięki są generowane na żywo (Web Audio) – bez plików.
// =====================================================================

const Sound = {
  ctx: null,
  out: null,
  noiseBuf: null,
  last: {},

  // przeglądarka pozwala włączyć dźwięk dopiero po kliknięciu / klawiszu
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.35;
      this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  },

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  noise(dur, vol, f0, f1, type = 'lowpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'bandpass' ? 2 : 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  },

  play(name) {
    if (!this.ctx || save.muted) return;
    const now = performance.now();
    const gap = { coin: 35, hit: 40, eshoot: 60, pistol: 40, minigun: 45, tshot: 60 }[name] || 25;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    try {
      switch (name) {
        // broń jednostek
        case 'pistol':  this.tone('square', 1800, 400, 0.08, 0.07); break;
        case 'rifle':   this.tone('square', 1300, 180, 0.12, 0.09); this.tone('sawtooth', 700, 100, 0.1, 0.05); break;
        case 'minigun': this.tone('square', 900, 200, 0.05, 0.06); this.noise(0.04, 0.08, 3000, 1500); break;
        case 'ion':     this.tone('sine', 2400, 300, 0.25, 0.13); this.tone('triangle', 1200, 150, 0.22, 0.07); break;
        case 'eshoot':  this.tone('square', 1000, 160, 0.14, 0.05); break;
        case 'tshot':   this.tone('square', 1600, 500, 0.06, 0.04); break;
        // umiejętności
        case 'throw':   this.noise(0.18, 0.12, 800, 2500, 'bandpass'); break;
        case 'rocket':  this.noise(0.5, 0.25, 600, 2000, 'bandpass'); this.tone('sawtooth', 120, 60, 0.3, 0.08); break;
        case 'dash':    this.noise(0.18, 0.2, 1500, 5000, 'bandpass'); this.tone('sawtooth', 300, 900, 0.12, 0.06); break;
        case 'cloak':   this.tone('sine', 900, 200, 0.5, 0.12); this.tone('sine', 1350, 300, 0.5, 0.06); break;
        case 'stim':    [440, 554, 659].forEach((f, i) => this.tone('triangle', f, f * 1.5, 0.2, 0.1, i * 0.06)); break;
        case 'barrier': this.tone('sawtooth', 120, 240, 0.4, 0.1); this.noise(0.4, 0.12, 400, 1600, 'bandpass'); break;
        case 'turret':  this.tone('square', 300, 600, 0.1, 0.08); this.tone('square', 600, 900, 0.1, 0.08, 0.1); break;
        case 'emp':     this.tone('sine', 1500, 60, 0.8, 0.25); this.noise(0.6, 0.3, 4000, 200, 'bandpass'); break;
        case 'block':   this.tone('triangle', 2000, 900, 0.08, 0.08); break;
        case 'hit':     this.noise(0.07, 0.22, 3500, 900); break;
        case 'boom':    this.noise(0.45, 0.45, 1400, 60); this.tone('sine', 130, 35, 0.35, 0.3); break;
        case 'bigboom': this.noise(1.2, 0.6, 1800, 40); this.tone('sine', 100, 25, 1.0, 0.45); break;
        case 'coin':    this.tone('square', 1320, 1320, 0.05, 0.04); this.tone('square', 1980, 1980, 0.08, 0.04, 0.045); break;
        case 'jump':    this.tone('sine', 320, 680, 0.14, 0.12); break;
        case 'jump2':   this.tone('sine', 520, 1100, 0.16, 0.1); this.noise(0.15, 0.08, 3000, 6000, 'bandpass'); break;
        case 'land':    this.noise(0.08, 0.12, 700, 200); break;
        case 'hurt':    this.tone('square', 240, 70, 0.25, 0.12); this.noise(0.15, 0.2, 1600, 300); break;
        case 'stomp':   this.tone('square', 260, 70, 0.12, 0.13); this.noise(0.08, 0.15, 900, 200); break;
        case 'power':   [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.14, 0.13, i * 0.07)); break;
        case 'buy':     [880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.13, i * 0.08)); break;
        case 'nope':    this.tone('square', 160, 120, 0.15, 0.08); break;
        case 'click':   this.tone('square', 900, 900, 0.03, 0.04); break;
        case 'alarm':   for (let i = 0; i < 3; i++) this.tone('sawtooth', 700, 420, 0.32, 0.09, i * 0.42); break;
        case 'missile': this.noise(0.35, 0.15, 800, 3000, 'bandpass'); break;
        case 'death':   this.tone('sawtooth', 420, 40, 1.0, 0.18); this.noise(1.0, 0.35, 900, 50); break;
        case 'win':     [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.13, i * 0.1)); break;
      }
    } catch (e) { /* dźwięk nie jest niezbędny */ }
  },
};
