/* Guest input on the wire, and the version gate. Match state lives in state.ts. */

import { CONTROLS } from '../game/constants.ts';
import type { FightGame } from '../game/game.ts';

/** Bump when a snapshot field changes meaning. Mismatched peers refuse to start. */
export const NET_BUILD = 3;

declare const __NET_HASH__: string | undefined;
/** Hash of the game source, stamped by vite.config.ts. Two builds that differ anywhere refuse to pair. */
export const NET_HASH: string = typeof __NET_HASH__ === 'string' ? __NET_HASH__ : 'dev';

/** Room codes skip 0/O/1/I. Keep in sync with cloudbase/functions/mailbox/index.js. */
export const CODE_ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const BIT_LEFT = 1 << 0;
export const BIT_RIGHT = 1 << 1;
export const BIT_JUMP = 1 << 2;
export const BIT_BLOCK = 1 << 3;
export const BIT_ATK = 1 << 4;
/** Set for the whole packet when block-release must stay a block (touch). */
export const BIT_SOFT = 1 << 10;

export function cleanCode(raw: string): string {
  return raw.toUpperCase().split('').filter(c => CODE_ALPH.includes(c)).slice(0, 4).join('');
}

/** Absolute held keys for the local (1P) pad. A dropped packet is corrected by the next one. */
export function packBits(held: ReadonlySet<string>, soft: boolean): number {
  const c = CONTROLS[0];
  let bits = 0;
  if (held.has(c.left)) bits |= BIT_LEFT;
  if (held.has(c.right)) bits |= BIT_RIGHT;
  if (c.jump.some(code => held.has(code))) bits |= BIT_JUMP;
  if (held.has(c.block)) bits |= BIT_BLOCK;
  c.attacks.forEach((code, i) => { if (held.has(code)) bits |= BIT_ATK << i; });
  if (soft) bits |= BIT_SOFT;
  return bits;
}

/** Press counters ride next to the held bits: jump, block, then the six attacks.
 *  Held bits alone lose a tap that starts and ends between two samples (the touch light
 *  attack does it in one call), and a press+release that land on the host in one frame. */
export const TAP_SLOTS = 8;

/** Which counter a 1P code bumps, or -1. */
export function tapSlot(code: string): number {
  const c = CONTROLS[0];
  if (c.jump.includes(code)) return 0;
  if (code === c.block) return 1;
  const i = c.attacks.indexOf(code);
  return i >= 0 ? 2 + i : -1;
}

/** The guest's pad as sent: absolute held bits and running press counts (mod 256). */
export interface Pad { bits: number; taps: number[] }

export function readPad(raw: unknown): Pad | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as { bits?: unknown; taps?: unknown };
  if (typeof m.bits !== 'number' || !Array.isArray(m.taps) || m.taps.length !== TAP_SLOTS) return null;
  if (!m.taps.every(v => Number.isInteger(v) && v >= 0 && v < 256)) return null;
  return { bits: m.bits, taps: m.taps as number[] };
}

/** One pad's keys on a sim: the guest's 2P keys on the snapshot host, either side's keys in
 *  lockstep. `taps` is the last counter set already replayed. */
export class RemotePad {
  taps: number[] = new Array(TAP_SLOTS).fill(0);
  readonly slot: number;

  constructor(slot = 1) { this.slot = slot; }

  /** Release everything the guest was holding (leave, timeout). Counters stay. */
  release(g: FightGame): void { applyRemoteBits(g, 0, this.slot); }

  apply(g: FightGame, pad: Pad): void {
    const c = CONTROLS[this.slot];
    const soft = (pad.bits & BIT_SOFT) !== 0;
    const codes = [c.jump[0], c.block, ...c.attacks];
    codes.forEach((code, i) => {
      // A burst of presses is at most a few; a counter that jumped far means a reset, not 200 jabs.
      let fresh = (pad.taps[i] - this.taps[i] + 256) % 256;
      this.taps[i] = pad.taps[i];
      if (fresh > 3) fresh = 1;
      for (let k = 0; k < fresh; k++) {
        if (g.keys.has(code)) g.keyUp(code, code === c.block ? !soft : true);
        g.keyDown(code);
        // A replayed press the guest already let go of is released here, in the same order it happened.
        const heldNow = (pad.bits & bitOf(i)) !== 0;
        if (k < fresh - 1 || !heldNow) g.keyUp(code, code === c.block ? !soft : true);
      }
    });
    applyRemoteBits(g, pad.bits, this.slot);
  }
}

function bitOf(slot: number): number {
  return slot === 0 ? BIT_JUMP : slot === 1 ? BIT_BLOCK : BIT_ATK << (slot - 2);
}

/** Press or release the 2P keys so the host sim sees the guest. */
export function applyRemoteBits(g: FightGame, bits: number, slot = 1): void {
  const c = CONTROLS[slot];
  const soft = (bits & BIT_SOFT) !== 0;
  const want: [string, boolean][] = [
    [c.left, (bits & BIT_LEFT) !== 0],
    [c.right, (bits & BIT_RIGHT) !== 0],
    [c.jump[0], (bits & BIT_JUMP) !== 0],
    [c.block, (bits & BIT_BLOCK) !== 0],
  ];
  c.attacks.forEach((code, i) => want.push([code, (bits & (BIT_ATK << i)) !== 0]));
  for (const [code, down] of want) {
    const has = g.keys.has(code);
    if (down && !has) g.keyDown(code);
    else if (!down && has) g.keyUp(code, code === c.block ? !soft : true);
  }
}

/** One guest sample: sequence, guest clock (ms), held bits, press counters. Sent only on change
 *  plus a slow heartbeat, and repeated in every packet until the host acks it. */
export type PadEvent = [number, number, number, number[]];

export function readEvents(raw: unknown): PadEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PadEvent[] = [];
  for (const e of raw.slice(0, 64)) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || typeof e[1] !== 'number' || typeof e[2] !== 'number') continue;
    const pad = readPad({ bits: e[2], taps: e[3] });
    if (pad) out.push([e[0], e[1], pad.bits, pad.taps]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Host: replays the guest's samples on the guest's own clock. Each sample plays at
 * guestTime + offset, where offset is the fastest delivery seen plus a jitter margin, so a
 * late packet shifts nothing relative to its neighbours: a hold lasts as long as it was held
 * and a press lands at the same spacing it was made. Margins adapt to the last 64 arrivals.
 */
export class InputClock {
  private lastSeq = 0;
  private minDelay = Infinity;
  private minAt = 0;
  private excess: number[] = [];
  private queue: { at: number; ev: PadEvent }[] = [];
  jitter = 0;

  private readonly maxJitter: number;

  constructor(maxJitter = 120) { this.maxJitter = maxJitter; }

  get acked(): number { return this.lastSeq; }

  push(events: PadEvent[], now: number): void {
    for (const ev of events) {
      if (ev[0] <= this.lastSeq) continue;
      this.lastSeq = ev[0];
      const delay = now - ev[1];
      // The floor creeps up 1ms per second so a clock drift or a new route cannot pin it forever.
      if (this.minDelay !== Infinity) this.minDelay += (now - this.minAt) / 1000;
      this.minAt = now;
      if (delay < this.minDelay) this.minDelay = delay;
      this.excess.push(delay - this.minDelay);
      if (this.excess.length > 64) this.excess.shift();
      const sorted = [...this.excess].sort((a, b) => a - b);
      this.jitter = Math.min(this.maxJitter, Math.max(4, sorted[Math.floor(sorted.length * .9)] ?? 0));
      this.queue.push({ at: ev[1] + this.minDelay + this.jitter, ev });
    }
  }

  /** Samples due by now, in order. */
  due(now: number): PadEvent[] {
    let i = 0;
    while (i < this.queue.length && this.queue[i].at <= now) i++;
    // A runaway queue (host stalled) plays out at once rather than lagging forever.
    if (this.queue.length > 120) i = this.queue.length;
    return this.queue.splice(0, i).map(q => q.ev);
  }
}
