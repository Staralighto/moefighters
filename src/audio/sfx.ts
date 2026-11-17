import { assetUrl } from '../assets/loader.ts';
import type { SfxKind } from '../game/game.ts';

/* Synthesised arcade blips. No sample files to ship — except the horn, see whistle(). */
const TONES: Record<Exclude<SfxKind, `blood-${string}` | `finale-${string}`>, [number, number]> = {
  light: [380, .07], heavy: [140, .18], hit: [180, .1], block: [680, .055], parry: [430, .1], super: [780, .55],
  select: [650, .06], jump: [260, .12], ko: [105, .65], cast: [470, .17], key: [880, .05],
  whistle: [310, .55], slam: [95, .16], engine: [60, 1], 'engine-rev': [60, 1.5],
};

/** MASKING's bike, kept under the fight: a quiet rumble, felt more than heard. */
const ENGINE_GAIN = .035;
/** Engine pitch over the sound, [seconds, Hz]: the kick start, a blip, then pulling away. The rev
 *  version blips twice before it goes, timed to the 0.5 s rev of 银河流星踢. */
const ENGINE_CURVE: Record<'engine' | 'engine-rev', readonly (readonly [number, number])[]> = {
  engine: [[0, 34], [.1, 68], [.2, 50], [.32, 92], [.95, 122]],
  'engine-rev': [[0, 32], [.12, 74], [.24, 48], [.36, 88], [.48, 56], [.6, 104], [1.5, 132]],
};

/** 微笑号的汽笛: a real recording, not a synth — qubodup's "Fog Horn" from Freesound,
 *  CC0, trimmed to the first blast with a fade-out. */
const HORN_SRC = '/sfx/ship-horn.mp3';
const HORN_GAIN = .15;

/** 血月的奏鸣: the sixteen notes, four rising or falling arpeggios over Dm, B♭, Gm, A (Hz).
 *  An original phrase written for this move. */
const BLOOD_PHRASE = [
  293.66, 349.23, 440, 587.33,
  587.33, 466.16, 349.23, 293.66,
  392, 466.16, 587.33, 783.99,
  440, 554.37, 659.25, 880,
];
/** The bass under each chord: D2, B♭2, G2, A2. */
/** Overall level of the 血月的奏鸣 music, about −12 dB under the note gains below: felt more than heard. */
const BLOOD_LEVEL = .25;
const BLOOD_BASS = [73.42, 116.54, 98, 110];
/** 终幕 cues' overall level: under the BGM's loudest moments, over the frozen fight. */
const FINALE_LEVEL = .55;
/** 终幕 recorded cues, all Freesound CC0 (free for commercial use, no credit required), cut from their
 *  HQ previews to just the slice that plays (mono 112 kbps, ~200 KB together; cut points in
 *  public/sfx/CREDITS.txt). `at` / `dur` can still pick a slice, `gain` sets it against the rest (peaks
 *  sit near 0 dB, so level × gain stays under 1).
 *  Until a file has loaded (or if it fails) the synthesised cue in finale() plays instead.
 *    shatter  "Glass Break"                        unfa            freesound.org/s/221528
 *  The other seven recorded cues are archived with their credits in 素材/finale-sfx/. */
const FINALE_SAMPLES: Partial<Record<SfxKind, { src: string; at: number; dur: number; gain: number; fadeIn?: number; fadeOut?: number; lowpass?: number }>> = {
  // A decoration, not an event: well under the music, the brittle top rolled off so it never stings.
  'finale-shatter': { src: '/sfx/finale/shatter.mp3', at: 0, dur: 1.6, gain: .45, fadeOut: .5, lowpass: 4200 },
};

/** Select-screen cues. Not SfxKind: the match never plays these. */
export type UiSound = 'hover' | 'swish' | 'confirm' | 'deny' | 'land' | 'whoosh' | 'vs';

const VOLUME_KEY = 'mf-sfx-volume';
function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch { return 1; }
}

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  /** 所有音效都经过这一个总音量，设置里的「音效音量」只动它。 */
  private out: GainNode | null = null;
  private vol = readVolume();
  private saveTimer = 0;

  /** 0–1。存在本地，下次打开还是这个音量。 */
  get volume(): number { return this.vol; }
  set volume(v: number) {
    this.vol = Math.min(1, Math.max(0, v));
    // 拖滑条时每个 input 事件都会进来：存档合并到停手后再写一次。
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(VOLUME_KEY, String(this.vol)); } catch { /* private mode */ }
    }, 250);
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.vol, this.ctx.currentTime, .02);
  }

  private dest(): AudioNode {
    const ctx = this.ctx!;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.vol;
      this.out.connect(ctx.destination);
    }
    return this.out;
  }
  private horn: AudioBuffer | null = null;
  private hornBroken = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        fetch(assetUrl(HORN_SRC))
          .then(r => { if (!r.ok) throw new Error('horn fetch ' + r.status); return r.arrayBuffer(); })
          .then(ab => this.ctx!.decodeAudioData(ab))
          .then(buf => { this.horn = buf; })
          .catch(() => { this.hornBroken = true; });
      }
      void this.ctx.resume();
    } catch { /* no audio on this device */ }
  }

  /** 终幕: fetch and decode the recorded cues. Called when a match has a character with a cut-in,
   *  so nobody else downloads them. Safe to call again. */
  private finaleBufs = new Map<string, AudioBuffer | null>();
  preloadFinale(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const spec of Object.values(FINALE_SAMPLES)) {
      if (!spec || this.finaleBufs.has(spec.src)) continue;
      this.finaleBufs.set(spec.src, null);
      fetch(assetUrl(spec.src))
        .then(r => { if (!r.ok) throw new Error(spec.src + ' ' + r.status); return r.arrayBuffer(); })
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => { this.finaleBufs.set(spec.src, buf); })
        .catch(() => { this.finaleBufs.delete(spec.src); });
    }
  }

  /** Play the recorded slice for a cut-in cue; false when it is not loaded (the synth plays instead). */
  private finaleSample(kind: SfxKind): boolean {
    const spec = FINALE_SAMPLES[kind];
    const buf = spec && this.finaleBufs.get(spec.src);
    if (!spec || !buf) return false;
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    const level = FINALE_LEVEL * spec.gain;
    const dur = Math.min(spec.dur, buf.duration - spec.at);
    g.gain.setValueAtTime(spec.fadeIn ? .0001 : level, t);
    if (spec.fadeIn) g.gain.exponentialRampToValueAtTime(level, t + spec.fadeIn);
    if (spec.fadeOut) { g.gain.setValueAtTime(level, t + Math.max(0, dur - spec.fadeOut)); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
    let head: AudioNode = src;
    if (spec.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = spec.lowpass;
      head = src.connect(lp);
    }
    head.connect(g).connect(this.dest());
    src.start(t, spec.at, dur);
    return true;
  }

  play(kind: SfxKind): void {
    if (this.muted || !this.ctx) return;
    if (kind.startsWith('blood-')) { this.blood(kind); return; }
    if (kind.startsWith('finale-')) { if (!this.finaleSample(kind)) this.finale(kind); return; }
    if (kind === 'whistle') { this.whistle(); return; }
    if (kind === 'slam') { this.slam(); return; }
    if (kind === 'engine' || kind === 'engine-rev') { this.engine(kind); return; }
    if (kind === 'parry') { this.parry(); return; }
    const [freq, duration] = TONES[kind as keyof typeof TONES];
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(35, freq / 3), t + duration);
    g.gain.setValueAtTime(.06, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g).connect(this.dest());
    o.start(t);
    o.stop(t + duration);
  }

  /** Select-screen sounds. Kept apart from SfxKind: the fight, the net relay and the lockstep
   *  replay never see these, so nothing on the wire changes. */
  ui(kind: UiSound): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number, lowpass = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + Math.min(.012, dur / 4));
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      let head: AudioNode = o;
      if (lowpass) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        head = o.connect(lp);
      }
      head.connect(g).connect(this.dest());
      o.start(t + at);
      o.stop(t + at + dur + .02);
    };
    const noise = (at: number, dur: number, gain: number, f0: number, f1: number, q = .8) => {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noiseBuffer();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t + at);
      bp.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + dur * .35);
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      n.connect(bp).connect(g).connect(this.dest());
      n.start(t + at);
      n.stop(t + at + dur + .02);
    };
    switch (kind) {
      case 'hover': tone('sine', 2300, 1900, 0, .03, .016); break;
      case 'swish': noise(0, .2, .07, 700, 3400); break;
      case 'confirm': tone('triangle', 660, 640, 0, .08, .06); tone('triangle', 990, 980, .055, .12, .06); break;
      case 'deny': tone('square', 150, 95, 0, .09, .06, 700); tone('square', 130, 80, .1, .11, .06, 700); break;
      case 'land': tone('sine', 130, 42, 0, .17, .13); noise(0, .1, .05, 900, 300, .6); break;
      case 'whoosh': noise(0, .38, .09, 400, 2600, .6); break;
      case 'vs':
        tone('sine', 96, 30, 0, .6, .2);
        tone('square', 240, 70, 0, .14, .05, 1200);
        noise(0, .32, .12, 2400, 380, .5);
        break;
    }
  }

  private noise?: AudioBuffer;
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .6), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return this.noise = buf;
  }

  /** 完美格挡: the block blip pitched down and muffled through a lowpass, over a short low thud —
   *  a shield taking the blow, heavier and duller than the plain block. */
  private parry(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const blip = ctx.createOscillator(), lp = ctx.createBiquadFilter(), gb = ctx.createGain();
    blip.type = 'square';
    blip.frequency.setValueAtTime(430, t);
    blip.frequency.exponentialRampToValueAtTime(140, t + .09);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + .09);
    lp.Q.value = .7;
    gb.gain.setValueAtTime(.075, t);
    gb.gain.exponentialRampToValueAtTime(.0001, t + .1);
    blip.connect(lp).connect(gb).connect(this.dest());
    blip.start(t); blip.stop(t + .1);
    const body = ctx.createOscillator(), gt = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(150, t);
    body.frequency.exponentialRampToValueAtTime(60, t + .12);
    gt.gain.setValueAtTime(.11, t);
    gt.gain.exponentialRampToValueAtTime(.0001, t + .13);
    body.connect(gt).connect(this.dest());
    body.start(t); body.stop(t + .13);
  }

  /** 燃尽: a click over a dropping thud, so the impact does not sound like the cast swoop. */
  /** MASKING's bike: a sawtooth and a square an octave down, chopped by a firing-rate pulse, through a
   *  resonant low-pass, with a breath of filtered noise for the exhaust. Self-scheduled; no state. */
  private engine(kind: 'engine' | 'engine-rev'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const curve = ENGINE_CURVE[kind];
    const dur = curve[curve.length - 1][0];
    // Louder as it revs: each pitch point carries its own level, idle about half of full throttle.
    const lo = Math.min(...curve.map(c => c[1])), hi = Math.max(...curve.map(c => c[1]));
    const level = (hz: number) => ENGINE_GAIN * (.5 + .5 * (hz - lo) / Math.max(1, hi - lo));
    const out = ctx.createGain();
    out.gain.setValueAtTime(.0001, t);
    out.gain.exponentialRampToValueAtTime(level(curve[0][1]), t + .05);
    for (const [at, hz] of curve) if (at > .05 && at < dur - .4) out.gain.linearRampToValueAtTime(level(hz), t + at);
    out.gain.linearRampToValueAtTime(ENGINE_GAIN, t + dur - .4);
    out.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    const pulse = ctx.createGain();
    pulse.gain.value = .55;
    const depth = ctx.createGain();
    depth.gain.value = .45;
    const body = ctx.createOscillator(), sub = ctx.createOscillator(), fire = ctx.createOscillator();
    body.type = 'sawtooth';
    sub.type = 'square';
    fire.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = .5;
    for (const [at, hz] of curve) {
      const when = t + at;
      if (at === 0) {
        body.frequency.setValueAtTime(hz, when);
        sub.frequency.setValueAtTime(hz / 2, when);
        fire.frequency.setValueAtTime(hz / 2, when);
        lp.frequency.setValueAtTime(hz * 6, when);
      } else {
        body.frequency.linearRampToValueAtTime(hz, when);
        sub.frequency.linearRampToValueAtTime(hz / 2, when);
        fire.frequency.linearRampToValueAtTime(hz / 2, when);
        lp.frequency.linearRampToValueAtTime(hz * 6, when);
      }
    }
    fire.connect(depth).connect(pulse.gain);
    body.connect(pulse);
    sub.connect(subGain).connect(pulse);
    pulse.connect(lp).connect(out).connect(this.dest());
    // Exhaust breath: band-passed noise riding the same envelope, a little quieter.
    // The shared 0.6 s noise, looped: no new buffer per rev.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = .8;
    const ng = ctx.createGain();
    ng.gain.value = .35;
    noise.connect(bp).connect(ng).connect(out);
    for (const o of [body, sub, fire]) { o.start(t); o.stop(t + dur); }
    noise.start(t); noise.stop(t + dur);
  }

  private slam(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const body = ctx.createOscillator(), click = ctx.createOscillator();
    const gb = ctx.createGain(), gc = ctx.createGain();
    body.type = 'square';
    body.frequency.setValueAtTime(160, t);
    body.frequency.exponentialRampToValueAtTime(42, t + .14);
    gb.gain.setValueAtTime(.09, t);
    gb.gain.exponentialRampToValueAtTime(.0001, t + .16);
    click.type = 'square';
    click.frequency.setValueAtTime(980, t);
    click.frequency.exponentialRampToValueAtTime(180, t + .04);
    gc.gain.setValueAtTime(.05, t);
    gc.gain.exponentialRampToValueAtTime(.0001, t + .045);
    body.connect(gb).connect(this.dest());
    click.connect(gc).connect(this.dest());
    body.start(t); body.stop(t + .16);
    click.start(t); click.stop(t + .05);
  }

  /** 血月的奏鸣 played as music: a synth keyboard (a triangle body, a soft octave and a filtered square
   *  for the hammer bite) through a short echo, so the notes ring like a hall. The phrase is an
   *  original D-minor arpeggio over i–VI–iv–V, one note per shot, resolving on a full D-minor chord;
   *  an organ pedal on D holds under it. Each sound is self-scheduled, so nothing here keeps state. */
  private blood(kind: SfxKind): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = this.hall();
    if (kind === 'blood-intro') {
      for (const [hz, gain] of [[73.42, .05], [146.83, .03], [220, .012]] as const) this.organ(hz, t, 2.9, gain, out);
      return;
    }
    if (kind === 'blood-end') {
      const at = t + .13;
      for (const [hz, gain] of [[73.42, .04], [146.83, .035], [220, .03], [293.66, .03], [349.23, .026], [440, .026], [587.33, .022]] as const) {
        this.key(hz, at, 1.8, gain, out);
      }
      this.organ(73.42, at, 1.6, .05, out);
      return;
    }
    const i = Number(kind.slice(6));
    const hz = BLOOD_PHRASE[Math.max(0, Math.min(BLOOD_PHRASE.length - 1, i | 0))];
    this.key(hz, t, .9, .04, out);
    // Every chord's first note carries its bass an octave and a fifth down, so the harmony moves.
    if (i % 4 === 0) this.key(BLOOD_BASS[(i / 4) | 0] ?? 73.42, t, 1.1, .028, out);
  }

  /** 终幕: the cut-in's sound. Freeze is a sub drop under a reversed swell and a single bell (time
   *  stops); the eye opening brings a D-minor organ and a rising shimmer; three heartbeats; the glass
   *  creaks, then shatters over a deep hit and a D-minor stab; the name lands on a drum and a ring;
   *  the slash is a fast swish into a thud. Synthesised fallbacks for the recorded cues (FINALE_SAMPLES). */
  private finale(kind: SfxKind): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = FINALE_LEVEL;
    out.connect(this.dest());
    const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number, to: AudioNode = out) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + Math.min(.01, dur / 4));
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      o.connect(g).connect(to);
      o.start(t + at);
      o.stop(t + at + dur + .02);
    };
    const noise = (at: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, swell = false) => {
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noiseBuffer();
      n.loop = true;
      f.type = type;
      f.Q.value = .7;
      f.frequency.setValueAtTime(f0, t + at);
      f.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      if (swell) { g.gain.exponentialRampToValueAtTime(gain, t + at + dur * .92); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur); }
      else { g.gain.exponentialRampToValueAtTime(gain, t + at + .008); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur); }
      n.connect(f).connect(g).connect(out);
      n.start(t + at);
      n.stop(t + at + dur + .02);
    };
    switch (kind) {
      case 'finale-whoosh': {
        // 爱音's meteor: a rush of air that comes in close and bright from the left, sweeps across and
        // drops away as the light recedes to the right, then swirls faster and fainter as it spirals
        // round her face and dies into the gathering (~1.6 s). Noise through a moving band, panned with it.
        const hall = this.hall();
        const pan = ctx.createStereoPanner();
        pan.pan.setValueAtTime(-.85, t);
        pan.pan.linearRampToValueAtTime(.35, t + .7);
        pan.connect(out);
        pan.connect(hall);
        const air = (type: BiquadFilterType, q: number, f: (p: AudioParam) => void, g: (p: AudioParam) => void): void => {
          const n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
          n.buffer = this.noiseBuffer();
          n.loop = true;
          fl.type = type;
          fl.Q.value = q;
          f(fl.frequency);
          gn.gain.setValueAtTime(.0001, t);
          g(gn.gain);
          n.connect(fl).connect(gn).connect(pan);
          n.start(t);
          n.stop(t + 1.75);
        };
        // The body: bright and loud as it passes close, lower and softer as it goes deep.
        air('bandpass', 1.1, p => {
          p.setValueAtTime(3400, t);
          p.exponentialRampToValueAtTime(1100, t + .7);
          p.exponentialRampToValueAtTime(1500, t + 1.6);
        }, p => {
          p.exponentialRampToValueAtTime(.12, t + .06);
          p.exponentialRampToValueAtTime(.045, t + .7);
          p.setValueAtTime(.045, t + 1.1);
          p.exponentialRampToValueAtTime(.0001, t + 1.65);
        });
        // The edge: thin high air that makes it read as fast.
        air('highpass', .7, p => {
          p.setValueAtTime(7000, t);
          p.exponentialRampToValueAtTime(4500, t + .7);
        }, p => {
          p.exponentialRampToValueAtTime(.035, t + .04);
          p.exponentialRampToValueAtTime(.006, t + .6);
          p.exponentialRampToValueAtTime(.0001, t + 1.2);
        });
        // The spiral: the sound wobbles side to side, faster as the turns tighten.
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.setValueAtTime(3, t + .7);
        lfo.frequency.exponentialRampToValueAtTime(11, t + 1.6);
        depth.gain.setValueAtTime(0, t);
        depth.gain.setValueAtTime(0, t + .7);
        depth.gain.linearRampToValueAtTime(.35, t + .9);
        lfo.connect(depth).connect(pan.pan);
        lfo.start(t);
        lfo.stop(t + 1.75);
        break;
      }
      case 'finale-shimmer': {
        // 爱音's light wave: a quick rising run of soft bells over an airy swell, landing on a high,
        // ringing pair. Bright but quiet; the room carries the tail.
        const hall = this.hall();
        noise(0, .5, .04, 'highpass', 1800, 9000, true);
        [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093].forEach((hz, i) => {
          tone('sine', hz, hz, .045 * i, 1.1, .03, hall);
          tone('triangle', hz * 2, hz * 2, .045 * i + .005, .5, .008, hall);
        });
        tone('sine', 2093, 2093, .34, 1.8, .028, hall);
        tone('sine', 2637.02, 2637.02, .38, 1.6, .02, hall);
        break;
      }
      case 'finale-freeze':
        tone('sine', 90, 28, 0, .7, .35);
        noise(0, .4, .09, 'bandpass', 300, 3200, true);
        tone('sine', 1318.5, 1318.5, .02, 1.6, .05, this.hall());
        tone('sine', 2637, 2637, .02, 1, .02, this.hall());
        break;
      case 'finale-rise':
        // One long organ chord (D minor, low and open) under the moon's opening, ending on the break.
        for (const [hz, gain] of [[36.71, .05], [73.42, .07], [110, .04], [146.83, .045], [174.61, .025], [220, .02]] as const) this.organ(hz, t, 2.3, gain, this.hall());
        break;
      case 'finale-beat':
        tone('sine', 62, 34, 0, .2, .4);
        tone('sine', 58, 32, .15, .22, .28);
        break;
      case 'finale-crack':
        for (let i = 0; i < 7; i++) noise(i * .045 + Math.random() * .02, .035, .14, 'highpass', 2500, 5000);
        tone('sawtooth', 180, 900, 0, .35, .02);
        break;
      case 'finale-shatter': {
        noise(0, .55, .26, 'highpass', 2600, 7000);
        noise(0, .2, .18, 'bandpass', 900, 300);
        tone('sine', 110, 26, 0, 1, .5);
        for (let i = 0; i < 14; i++) {
          const hz = 2200 + Math.random() * 4200;
          tone('sine', hz, hz * .98, .02 + Math.random() * .4, .12 + Math.random() * .15, .03);
        }
        const hall = this.hall();
        // The chord the silence rings on.
        for (const [hz, gain] of [[146.83, .05], [220, .045], [293.66, .045], [349.23, .04], [440, .04], [587.33, .035]] as const) this.key(hz, t + .02, 3, gain, hall);
        break;
      }
      case 'finale-bloom':
        // Moonlight reaching her: a high, slow D-minor swell with a soft shimmer, then air.
        for (const [hz, gain] of [[587.33, .02], [698.46, .016], [880, .014], [1174.66, .008]] as const) this.organ(hz, t, 2.6, gain, this.hall());
        noise(0, 1.8, .02, 'highpass', 6000, 9000, true);
        break;
      case 'finale-stamp':
        // The name writing itself in: three soft bell tones, no drum.
        tone('sine', 1174.66, 1174.66, 0, 1.4, .03, this.hall());
        tone('sine', 1396.91, 1396.91, .18, 1.3, .025, this.hall());
        tone('sine', 1760, 1760, .36, 1.6, .025, this.hall());
        break;
      case 'finale-slash':
        noise(0, .22, .22, 'bandpass', 700, 6000);
        tone('sine', 95, 35, .16, .4, .35);
        noise(.16, .15, .1, 'lowpass', 1200, 300);
        break;
    }
  }

  /** One keyboard note. */
  private key(hz: number, at: number, dur: number, gain: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + .006);
    g.gain.exponentialRampToValueAtTime(gain * .35, at + .22);
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    g.connect(out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, hz * 9), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, hz * 2), at + dur * .6);
    lp.connect(g);
    for (const [type, mul, level] of [['triangle', 1, 1], ['sine', 2, .35], ['square', 1, .12]] as const) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(hz * mul, at);
      o.detune.setValueAtTime(type === 'square' ? 6 : 0, at);
      og.gain.value = level;
      o.connect(og).connect(lp);
      o.start(at);
      o.stop(at + dur + .02);
    }
  }

  /** A held organ tone that swells in and dies out. */
  private organ(hz: number, at: number, dur: number, gain: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + .35);
    g.gain.setValueAtTime(gain, at + dur - .5);
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    g.connect(out);
    for (const [mul, level] of [[1, 1], [2, .5], [3, .25], [4, .12]] as const) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz * mul;
      og.gain.value = level;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + dur + .02);
    }
  }

  /** The room: dry plus a short feedback echo, built once per context. Its input gain is the whole
   *  music's level: a low-key detail under the BGM and the hit sounds, never on top of them. */
  private hallIn?: AudioNode;
  private hall(): AudioNode {
    if (this.hallIn) return this.hallIn;
    const ctx = this.ctx!;
    const input = ctx.createGain();
    input.gain.value = BLOOD_LEVEL;
    const delay = ctx.createDelay(1);
    const fb = ctx.createGain(), wet = ctx.createGain(), damp = ctx.createBiquadFilter();
    delay.delayTime.value = .19;
    fb.gain.value = .32;
    wet.gain.value = .22;
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    input.connect(this.dest());
    input.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(wet).connect(this.dest());
    return this.hallIn = input;
  }

  /** The recorded horn when it is on hand — the sample loads in the background after the
   *  first unlock, and until it lands (or if it never does) the synth horn below stands in. */
  private whistle(): void {
    const ctx = this.ctx!;
    if (this.horn) {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = this.horn;
      g.gain.value = HORN_GAIN;
      src.connect(g).connect(this.dest());
      src.start();
      return;
    }
    // Synth stand-in while the sample is still loading, or forever if it never lands.
    const t = ctx.currentTime, dur = TONES.whistle[1];
    for (const [freq, gain, type] of [[310, .075, 'square'], [466, .045, 'sawtooth']] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * .78, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + .09);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + .07);
      g.gain.setValueAtTime(gain, t + dur - .14);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(this.dest());
      o.start(t);
      o.stop(t + dur);
    }
  }
}
