// Procedural Holiday Sound Effects (Web Audio API) + Drop-in External BGM Loader (audio/bgm.json)
import bundledBgmManifest from '../audio/bgm.json' with { type: 'json' };

const PENTATONIC_HZ = [
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
  1046.50, // C6
  1174.66, // D6
  1318.51, // E6
  1567.98, // G6
  1760.00, // A6
];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.seMuted = true;
    this.seVolume = 0.65;
    this.nextCourseSoundAt = 0;
  }

  unlock() {
    if (this.seMuted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.seMuted ? 0 : this.seVolume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.seMuted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.seMuted ? 0 : this.seVolume, this.ctx.currentTime, 0.02);
    }
  }

  setVolume(vol) {
    this.seVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    if (this.masterGain && this.ctx && !this.seMuted) {
      this.masterGain.gain.setTargetAtTime(this.seVolume, this.ctx.currentTime, 0.02);
    }
  }

  _canPlay() {
    return Boolean(this.ctx && this.masterGain && !this.seMuted && this.ctx.state === 'running');
  }

  // All marbles share one interval so different obstacles cannot stack their high notes.
  _allowCourseSound(interval) {
    if (!this._canPlay() || this.ctx.currentTime < this.nextCourseSoundAt) return false;
    this.nextCourseSoundAt = this.ctx.currentTime + interval;
    return true;
  }

  _tone({ freq, freqEnd, type = 'sine', start = 0, duration = 0.2, gain = 0.16, attack = 0.006 }) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _noiseBurst({ duration = 0.12, filterFreq = 2200, gain = 0.1, start = 0, q = 1.4 }) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime + start;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.6);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.value = q;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);
    src.start(now);
  }

  playCountdown(count) {
    this.unlock();
    const base = count === 1 ? 880 : count === 2 ? 659.25 : 523.25;
    this._tone({ freq: base, type: 'triangle', duration: 0.24, gain: 0.2 });
    this._tone({ freq: base * 2, type: 'sine', duration: 0.22, gain: 0.08 });
  }

  playGateOpen() {
    this.unlock();
    // Sparkling arpeggio + sleigh shimmer
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, idx) => {
      this._tone({ freq: f, type: 'triangle', start: idx * 0.045, duration: 0.36, gain: 0.18 });
      this._tone({ freq: f * 2, type: 'sine', start: idx * 0.045, duration: 0.26, gain: 0.07 });
    });
    this._noiseBurst({ duration: 0.28, filterFreq: 5200, gain: 0.12, q: 2.2 });
  }

  playPinHit() {
    if (!this._allowCourseSound(0.07)) return;
    const freq = PENTATONIC_HZ[Math.floor(Math.random() * 6) + 3];
    // Glockenspiel wood/crystal ping
    this._tone({ freq, type: 'sine', duration: 0.16, gain: 0.095 });
    this._tone({ freq: freq * 2.756, type: 'sine', duration: 0.07, gain: 0.032 });
  }

  playBellHit(noteIndex = 0) {
    if (!this._allowCourseSound(0.12)) return;
    const freq = PENTATONIC_HZ[noteIndex % PENTATONIC_HZ.length];
    // Rich metallic Christmas bell chime with bright overtones
    this._tone({ freq, type: 'sine', duration: 0.55, gain: 0.16 });
    this._tone({ freq: freq * 2.0, type: 'triangle', duration: 0.35, gain: 0.07 });
    this._tone({ freq: freq * 3.01, type: 'sine', duration: 0.22, gain: 0.045 });
  }

  playBoost() {
    if (!this._allowCourseSound(0.16)) return;
    const notes = [659.25, 880, 1174.66, 1567.98];
    notes.forEach((f, idx) => {
      this._tone({ freq: f, freqEnd: f * 1.18, type: 'sine', start: idx * 0.032, duration: 0.22, gain: 0.11 });
    });
    this._noiseBurst({ duration: 0.22, filterFreq: 3800, gain: 0.08, q: 1.8 });
  }

  playMarbleClink(intensity = 0.6) {
    if (!this._allowCourseSound(0.06)) return;
    const freq = 1400 + Math.random() * 650;
    this._tone({ freq, freqEnd: freq * 0.85, type: 'sine', duration: 0.07, gain: 0.045 * intensity });
  }

  playSlowMo() {
    if (!this._canPlay()) return;
    this._tone({ freq: 520, freqEnd: 165, type: 'sine', duration: 0.55, gain: 0.18 });
    this._tone({ freq: 1046.5, type: 'triangle', start: 0.06, duration: 0.65, gain: 0.09 });
  }

  playFanfare() {
    this.unlock();
    // Festive Christmas trumpet/chime victory fanfare + fireworks crackle!
    const melody = [
      { f: 523.25, t: 0.00, d: 0.16 },
      { f: 659.25, t: 0.12, d: 0.16 },
      { f: 783.99, t: 0.24, d: 0.18 },
      { f: 1046.5, t: 0.40, d: 0.62 },
      { f: 880.00, t: 0.62, d: 0.20 },
      { f: 1046.5, t: 0.80, d: 0.95 },
    ];
    for (const n of melody) {
      this._tone({ freq: n.f, type: 'triangle', start: n.t, duration: n.d, gain: 0.20 });
      this._tone({ freq: n.f * 1.5, type: 'sine', start: n.t, duration: n.d * 0.85, gain: 0.08 });
      this._tone({ freq: n.f * 2.0, type: 'sine', start: n.t, duration: n.d * 0.65, gain: 0.06 });
    }
    // Warm C-major final chord bell shimmer
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, idx) => {
      this._tone({ freq: f, type: 'sine', start: 0.80 + idx * 0.025, duration: 1.5, gain: 0.095 });
    });
    // Firework pops
    [0.25, 0.58, 0.96, 1.32].forEach((t, idx) => {
      this._noiseBurst({ start: t, duration: 0.24, filterFreq: 1600 + idx * 700, gain: 0.11, q: 1.2 });
    });
  }
}

export class BgmManager {
  constructor() {
    this.tracks = [];
    this.selectedId = '';
    this.audio = new Audio();
    this.audio.loop = true;
    this.muted = false;
    this.volume = 0.35;
    this.volumeFactor = 1;
    this.playbackIssue = '';
    this.revision = 0;
  }

  async loadManifest(url = './audio/bgm.json') {
    try {
      let data = bundledBgmManifest;
      if (location.protocol !== 'file:') {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return this.tracks;
        data = await res.json();
      }
      const rawTracks = Array.isArray(data?.tracks) ? data.tracks : [];
      this.tracks = rawTracks
        .filter((t) => t && t.file)
        .map((t, idx) => ({
          id: String(t.id || `track-${idx}`),
          label: String(t.label || t.file),
          src: t.file.startsWith('http') || t.file.startsWith('./') || t.file.startsWith('/')
            ? t.file
            : `./audio/${t.file}`,
          volume: typeof t.volume === 'number' ? t.volume : 0.35,
        }));
      if (this.tracks.length > 0) {
        const preferred = this.tracks.find((t) => t.id === data.defaultTrack);
        this.selectTrack((preferred || this.tracks[0]).id);
      }
    } catch {
      // Sound effects remain available when no soundtrack manifest is available.
      this.tracks = [];
    }
    return this.tracks;
  }

  selectTrack(id) {
    const track = this.tracks.find(t => t.id === id);
    if (!track || id === this.selectedId) return;
    this.stop();
    this.selectedId = id;
    this.setVolume(track.volume);
    this.audio.preload = this.muted ? 'none' : 'auto';
    this.audio.src = track.src;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.audio.muted = this.muted;
    if (this.muted) this.stop();
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(0.85, Number(vol) || 0));
    this.audio.volume = this.volume * this.volumeFactor;
  }

  duck(factor = 0.45) {
    this.volumeFactor = factor;
    this.audio.volume = this.volume * factor;
  }

  restoreVolume() {
    this.duck(1);
  }

  async start() {
    if (!this.selectedId || this.muted || !this.audio.paused) return;
    const rev = ++this.revision;
    this.playbackIssue = '';
    try {
      if (this.audio.error) this.audio.load();
      await this.audio.play();
    } catch (error) {
      if (rev === this.revision) {
        this.playbackIssue = error.name === 'NotAllowedError' ? 'blocked' : 'error';
      }
    }
  }

  stop() {
    ++this.revision;
    this.playbackIssue = '';
    this.audio.pause();
  }
}
