import { assetUrl } from '../assets/loader.ts';
import type { SfxKind } from '../game/game.ts';

/* Synthesised arcade blips. No sample files to ship — except the horn, see whistle(). */
const TONES: Record<Exclude<SfxKind, `blood-${string}`>, [number, number]> = {
  light: [380, .07], heavy: [140, .18], hit: [180, .1], block: [680, .055], parry: [430, .1], super: [780, .55],
  select: [650, .06], jump: [260, .12], ko: [105, .65], cast: [470, .17], key: [880, .05],
  whistle: [310, .55], slam: [95, .16],
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

/** Select-screen cues. Not SfxKind: the match never plays these. */
export type UiSound = 'hover' | 'swish' | 'confirm' | 'deny' | 'land' | 'whoosh' | 'vs';

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
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

  play(kind: SfxKind): void {
    if (this.muted || !this.ctx) return;
    if (kind.startsWith('blood-')) { this.blood(kind); return; }
    if (kind === 'whistle') { this.whistle(); return; }
    if (kind === 'slam') { this.slam(); return; }
    if (kind === 'parry') { this.parry(); return; }
    const [freq, duration] = TONES[kind as keyof typeof TONES];
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(35, freq / 3), t + duration);
    g.gain.setValueAtTime(.06, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g).connect(this.ctx.destination);
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
      head.connect(g).connect(ctx.destination);
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
      n.connect(bp).connect(g).connect(ctx.destination);
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
    blip.connect(lp).connect(gb).connect(ctx.destination);
    blip.start(t); blip.stop(t + .1);
    const body = ctx.createOscillator(), gt = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(150, t);
    body.frequency.exponentialRampToValueAtTime(60, t + .12);
    gt.gain.setValueAtTime(.11, t);
    gt.gain.exponentialRampToValueAtTime(.0001, t + .13);
    body.connect(gt).connect(ctx.destination);
    body.start(t); body.stop(t + .13);
  }

  /** 燃尽: a click over a dropping thud, so the impact does not sound like the cast swoop. */
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
    body.connect(gb).connect(ctx.destination);
    click.connect(gc).connect(ctx.destination);
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
    input.connect(ctx.destination);
    input.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(wet).connect(ctx.destination);
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
      src.connect(g).connect(ctx.destination);
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
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur);
    }
  }
}
