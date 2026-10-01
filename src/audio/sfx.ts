import type { SfxKind } from '../game/game.ts';

/* Synthesised arcade blips. No sample files to ship — except the horn, see whistle(). */
const TONES: Record<SfxKind, [number, number]> = {
  light: [380, .07], heavy: [140, .18], hit: [180, .1], block: [680, .055], super: [780, .55],
  select: [650, .06], jump: [260, .12], ko: [105, .65], cast: [470, .17], key: [880, .05],
  whistle: [310, .55],
};

/** 微笑号的汽笛: a real recording, not a synth — qubodup's "Fog Horn" from Freesound,
 *  CC0, trimmed to the first blast with a fade-out. */
const HORN_SRC = '/sfx/ship-horn.mp3';
const HORN_GAIN = .15;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private horn: AudioBuffer | null = null;
  private hornBroken = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        fetch(HORN_SRC)
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
    if (kind === 'whistle') { this.whistle(); return; }
    const [freq, duration] = TONES[kind];
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
