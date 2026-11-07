// Small procedural sound kit (WebAudio), so the prototype ships with no audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.master = null;
    this.musicGain = null;
    this.nextNote = 0;
    this.step = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
    this.nextNote = this.ctx.currentTime + 0.2;
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, when = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, vol = 0.2, freq = 1200, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  }

  play(name, k = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump_single': this.tone(420, 0.14, 'square', 0.08, 1.6); break;
      case 'jump_double': this.tone(520, 0.16, 'square', 0.08, 1.7); break;
      case 'jump_triple': this.tone(620, 0.3, 'square', 0.09, 2.0); this.tone(930, 0.25, 'triangle', 0.08, 1.5, 0.08); break;
      case 'jump_backflip': case 'jump_sideflip': this.tone(500, 0.28, 'triangle', 0.12, 2.2); break;
      case 'jump_long': this.tone(300, 0.35, 'sawtooth', 0.05, 1.8); this.noise(0.25, 0.08, 2500); break;
      case 'jump_wall': this.tone(700, 0.12, 'square', 0.08, 1.4); this.noise(0.08, 0.15, 3000); break;
      case 'jump_boost': this.tone(380, 0.35, 'triangle', 0.14, 2.6); break;
      case 'jump_toss': this.tone(330, 0.4, 'triangle', 0.12, 2.4); break;
      case 'jump_rollout': case 'jump_leap': this.tone(460, 0.15, 'square', 0.07, 1.5); break;
      case 'jump_spring': this.tone(200, 0.5, 'sine', 0.2, 4); break;
      case 'land': this.noise(0.08, 0.05 + 0.2 * k, 600); break;
      case 'skid': this.noise(0.25, 0.12, 1800); break;
      case 'spin': this.tone(900, 0.2, 'triangle', 0.07, 0.6); break;
      case 'pound': this.tone(90, 0.35, 'sine', 0.4, 0.5); this.noise(0.2, 0.25, 500); break;
      case 'twin': this.tone(70, 0.8, 'sine', 0.5, 0.5); this.tone(140, 0.6, 'square', 0.1, 0.5); this.noise(0.5, 0.3, 400); break;
      case 'dive': this.noise(0.2, 0.1, 2200); break;
      case 'punch': this.noise(0.07, 0.15, 1500); break;
      case 'bonk': this.tone(150, 0.2, 'square', 0.12, 0.6); break;
      case 'roll': this.noise(0.6, 0.08, 800); break;
      case 'grab': case 'grabLedge': this.tone(600, 0.06, 'triangle', 0.1); break;
      case 'climb': this.tone(500, 0.1, 'triangle', 0.08, 1.4); break;
      case 'toss': this.noise(0.2, 0.15, 1800); break;
      case 'splash': this.noise(0.45, 0.25, 1600); break;
      case 'stroke': this.noise(0.15, 0.08, 900); break;
      case 'hurt': this.tone(300, 0.3, 'sawtooth', 0.12, 0.4); break;
      case 'heal': [0, 0.08, 0.16].forEach((w, i) => this.tone(660 * (1 + i * 0.25), 0.15, 'sine', 0.1, 1, w)); break;
      case 'bubble': this.tone(300, 0.6, 'sine', 0.15, 2.5); break;
      case 'revive': [0, 0.07, 0.14, 0.21].forEach((w, i) => this.tone(520 * Math.pow(1.26, i), 0.2, 'triangle', 0.12, 1, w)); break;
      case 'berry': this.tone(1100, 0.12, 'sine', 0.12, 1.3); break;
      case 'drop': [0, 0.06].forEach((w, i) => this.tone(880 * (i ? 1.5 : 1), 0.2, 'triangle', 0.12, 1, w)); break;
      case 'ring': this.tone(1320, 0.25, 'sine', 0.12, 1.2); break;
      case 'prism': [0, 0.12, 0.24, 0.36, 0.6].forEach((w, i) => this.tone([523, 659, 784, 1047, 1319][i], 0.5, 'triangle', 0.14, 1, w)); break;
      case 'stomp': this.tone(250, 0.15, 'square', 0.12, 2); this.noise(0.1, 0.1, 1200); break;
      case 'pop': this.tone(700, 0.12, 'sine', 0.15, 2.5); this.noise(0.1, 0.12, 3000); break;
      case 'bell': [0, 0.02].forEach((w, i) => this.tone(i ? 1568 : 784, 1.6, 'sine', 0.18, 1, w)); break;
      case 'switch': this.tone(440, 0.1, 'square', 0.08); this.tone(660, 0.12, 'square', 0.08, 1, 0.1); break;
      case 'door': this.noise(1.2, 0.2, 300); break;
      case 'break': this.noise(0.4, 0.35, 900); this.tone(120, 0.3, 'square', 0.1, 0.5); break;
      case 'spring': this.tone(200, 0.5, 'sine', 0.2, 4); break;
      case 'crumble': this.noise(0.5, 0.15, 700); break;
      case 'wind': this.noise(0.8, 0.15, 900); break;
      case 'checkpoint': [0, 0.1].forEach((w, i) => this.tone(i ? 880 : 660, 0.25, 'triangle', 0.12, 1, w)); break;
      case 'bossHit': this.tone(180, 0.5, 'sawtooth', 0.18, 0.5); this.noise(0.3, 0.25, 900); break;
      case 'bossRoar': this.tone(110, 1.0, 'sawtooth', 0.12, 0.7); break;
      case 'win': [0, 0.15, 0.3, 0.45, 0.6, 0.9].forEach((w, i) => this.tone([392, 523, 659, 784, 1047, 1319][i], 0.7, 'triangle', 0.14, 1, w)); break;
      default: break;
    }
  }

  // Gentle woodwind-style meadow loop, scheduled a little ahead of time.
  updateMusic() {
    if (!this.ctx || !this.musicOn) return;
    const bpm = 104, beat = 60 / bpm / 2;
    const melody = [0, 4, 7, 9, 7, 4, 2, 4, 5, 9, 12, 9, 7, 5, 4, 2, 0, 4, 7, 12, 11, 9, 7, 9, 5, 4, 2, 4, 0, -1, 0, -3];
    const bass = [0, 0, -5, -5, -3, -3, -7, -5];
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      const when = this.nextNote - this.ctx.currentTime;
      const s = this.step % melody.length;
      if (this.step % 2 === 0 || s % 3 === 0) {
        this.tone(523.25 * Math.pow(2, melody[s] / 12), beat * 1.6, 'triangle', 0.22, 1, when, this.musicGain);
      }
      if (this.step % 4 === 0) {
        const b = bass[Math.floor(this.step / 4) % bass.length];
        this.tone(130.8 * Math.pow(2, b / 12), beat * 3.6, 'sine', 0.35, 1, when, this.musicGain);
      }
      this.nextNote += beat;
      this.step++;
    }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.18 : 0;
  }
}
