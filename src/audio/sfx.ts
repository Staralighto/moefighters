import type { SfxKind } from '../game/game.ts';

/* Synthesised arcade blips. No sample files to ship. */
const TONES: Record<SfxKind, [number, number]> = {
  light: [380, .07], heavy: [140, .18], hit: [180, .1], block: [680, .055], super: [780, .55],
  select: [650, .06], jump: [260, .12], ko: [105, .65], cast: [470, .17],
};

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;

  unlock(): void {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      void this.ctx.resume();
    } catch { /* no audio on this device */ }
  }

  play(kind: SfxKind): void {
    if (this.muted || !this.ctx) return;
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
}
