/* Deterministic lockstep. Both sides run the same seeded sim; only pads travel. Every tick
   (two 1/120 steps) needs both players' pads. A side schedules its own pad `delay` ticks ahead
   and sends every pad the other side has not acked, up to 16, in each unreliable packet, so a
   lost packet is covered by the next one. Every 120 ticks both sides hash the sim; on a
   mismatch the host sends its exact state and the guest replays from it. Repeated desyncs, or
   a link too slow to keep up, hand the rest of the match to the host-snapshot path. */

import { ROSTER_BY_ID } from '../data/characters.ts';
import { STEP } from '../game/constants.ts';
import { makeFighter, type Fighter } from '../game/fighter.ts';
import type { FightGame } from '../game/game.ts';
import { RemotePad, TAP_SLOTS, readPad, type Pad } from './proto.ts';
import { dec, enc } from './state.ts';

export const TICK_STEPS = 2;
export const TICK_MS = 1000 * STEP * TICK_STEPS;
export const HASH_EVERY = 120;
export const SEND_MAX = 32;
const MIN_DELAY = 3;
const MAX_DELAY = 8;
const KEEP = 600;
/** Past this RTT (e.g. China TURN via LAX at 290–435ms), skip high-delay lockstep for local-predicted snapshots. */
export const SNAP_RTT_MS = 230;
/** A tick stalled this long shows 连接不稳. */
export const STALL_HINT_MS = 300;
/** Desyncs in one match before the snapshot path takes over. */
export const MAX_RESYNCS = 3;
/** Over a 3s window, fewer ticks than this share of real time means lockstep cannot keep up. */
const KEEP_UP = .75;
const WINDOW_MS = 3000;

/** Seeded mulberry32. The state is one integer, so a resync can carry it. */
export class Rng {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next = (): number => {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEUTRAL: Pad = { bits: 0, taps: new Array(TAP_SLOTS).fill(0) };

/** Fields of a FightGame that are wiring, not match state. */
const GAME_SKIP = new Set(['characters', 'options', 'audio', 'netRole', 'netMenu', 'onKey', 'onFx', 'random', 'accumulator', 'lastFrame', 'particles']);

/** The whole match, exactly. Mod closures (onExpire/pulse) cannot travel; see the report. */
export function dumpGame(g: FightGame, rng: Rng, extra: Record<string, unknown> = {}): string {
  const out: Record<string, unknown> = { $rng: rng.s, ...extra };
  for (const [k, v] of Object.entries(g)) {
    if (GAME_SKIP.has(k) || typeof v === 'function') continue;
    if (k === 'fighters') {
      out[k] = (v as Fighter[]).map(f => {
        const o: Record<string, unknown> = {};
        for (const [fk, fv] of Object.entries(f)) if (fk !== 'data' && typeof fv !== 'function') o[fk] = enc(fv, f.data, 0, true);
        o.$char = f.data.id;
        return o;
      });
    } else if (k === 'projectiles') {
      out[k] = g.projectiles.map(p => enc(p, g.fighterById(p.owner)?.data, 0, true));
    } else out[k] = enc(v, undefined, 0, true);
  }
  return JSON.stringify(out);
}

export function loadGame(g: FightGame, rng: Rng, text: string): Record<string, unknown> {
  const data = JSON.parse(text) as Record<string, unknown>;
  const rec = g as unknown as Record<string, unknown>;
  rng.s = Number(data.$rng) >>> 0;
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('$') || GAME_SKIP.has(k) || !(k in g)) continue;
    if (k === 'fighters') {
      const list: Fighter[] = [];
      for (const raw of v as Record<string, unknown>[]) {
        const charData = ROSTER_BY_ID.get(String(raw.$char));
        if (!charData) continue;
        const id = Number(raw.id);
        const f = g.fighters.find(x => x.id === id && x.data === charData) ?? makeFighter(charData, id, { x: 0, facing: 1, controller: null, energy: 0, team: 0 });
        for (const [fk, fv] of Object.entries(raw)) if (fk !== '$char') (f as unknown as Record<string, unknown>)[fk] = dec(fv);
        list.push(f);
      }
      g.fighters = list;
    } else rec[k] = dec(v);
  }
  return data;
}

/** FNV-1a over the numbers and flags that decide the match. */
export function hashGame(g: FightGame, rng: Rng): number {
  let h = 0x811c9dc5;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  const prims = (o: object) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' || typeof v === 'boolean') mix(k + '=' + v + ';');
    }
  };
  mix(g.phase + g.round + ':' + g.time + ':' + g.wins.join(',') + ':' + rng.s);
  for (const f of g.fighters) { prims(f); if (f.attack) mix('a' + f.attack.index + ':' + f.attack.t + ':' + f.attack.serial); }
  for (const p of g.projectiles) prims(p);
  return h >>> 0;
}

export interface LockHooks {
  sendFast(text: string): void;
  sendRel(msg: Record<string, unknown>): void;
  /** This device's pad right now. */
  sample(): Pad;
  /** Sounds off while replaying ticks that were already heard. */
  mute(on: boolean): void;
  /** Host only: the snapshot path takes the rest of the match. */
  fallback(why: string): void;
  log(text: string): void;
}

export class LockSession {
  readonly g: FightGame;
  readonly rng: Rng;
  readonly side: 0 | 1;
  private readonly hooks: LockHooks;
  /** Next tick to simulate. */
  tick = 0;
  delay = MIN_DELAY;
  rtt = 0;
  resyncs = 0;
  stallMs = 0;
  fallen = false;
  private local = new Map<number, Pad>();
  private remote = new Map<number, Pad>();
  private lastLocal = -1;
  /** Highest tick such that the remote has all my pads up to it. */
  private remoteHas = -1;
  /** Highest tick such that I have all the remote's pads up to it. */
  private iHave = -1;
  private pads: [RemotePad, RemotePad] = [new RemotePad(0), new RemotePad(1)];
  private myHash = new Map<number, number>();
  private theirHash = new Map<number, number>();
  private acc = 0;
  private lastNow = 0;
  private stallAt = 0;
  private windowAt = 0;
  private windowTicks = 0;
  private pingT = 0;
  private pingAt = 0;
  private lastPingSent = -1000;
  private resyncing = false;

  constructor(g: FightGame, rng: Rng, side: 0 | 1, hooks: LockHooks) {
    this.g = g;
    this.rng = rng;
    this.side = side;
    this.hooks = hooks;
    for (let t = 0; t < this.delay; t++) this.local.set(t, NEUTRAL);
    this.lastLocal = this.delay - 1;
  }

  /** One display frame. Returns true when it is waiting on the other side. */
  frame(now: number): boolean {
    if (this.fallen) return false;
    const gap = this.lastNow ? Math.min(250, now - this.lastNow) : TICK_MS;
    this.lastNow = now;
    if (!this.windowAt) this.windowAt = now;
    this.acc += gap;
    let ran = 0;
    let stalled = false;
    while (this.acc >= TICK_MS && ran < 6) {
      this.schedule();
      if (!this.remote.has(this.tick)) { stalled = true; break; }
      this.runTick();
      this.acc -= TICK_MS;
      ran++;
    }
    this.send(now);
    if (stalled) {
      // Waiting builds no backlog beyond a tick: the match freezes rather than racing after.
      this.acc = Math.min(this.acc, TICK_MS);
      if (!this.stallAt) this.stallAt = now;
      this.stallMs = now - this.stallAt;
    } else { this.stallAt = 0; this.stallMs = 0; }
    this.windowTicks += ran;
    if (now - this.windowAt >= WINDOW_MS) {
      const expected = (now - this.windowAt) / TICK_MS;
      const slow = this.windowTicks < expected * KEEP_UP && !this.g.paused && this.g.phase !== 'finished';
      this.windowAt = now;
      this.windowTicks = 0;
      if (slow) this.giveUp('跟不上');
    }
    return stalled;
  }

  private schedule(): void {
    const want = this.tick + this.delay;
    if (this.lastLocal >= want) return;
    const pad = this.hooks.sample();
    while (this.lastLocal < want) this.local.set(++this.lastLocal, pad);
  }

  private runTick(): void {
    const t = this.tick;
    const mine = this.local.get(t) ?? NEUTRAL;
    const theirs = this.remote.get(t)!;
    const [p0, p1] = this.side === 0 ? [mine, theirs] : [theirs, mine];
    this.pads[0].apply(this.g, p0);
    this.pads[1].apply(this.g, p1);
    for (let i = 0; i < TICK_STEPS; i++) this.g.step(STEP);
    this.tick = t + 1;
    if (this.tick % HASH_EVERY === 0) {
      const h = hashGame(this.g, this.rng);
      this.myHash.set(this.tick, h);
      this.hooks.sendRel({ t: 'H', k: this.tick, h });
      this.check(this.tick);
    }
    const old = t - KEEP;
    this.local.delete(old);
    this.remote.delete(old);
    this.myHash.delete(old - HASH_EVERY * 4);
    this.theirHash.delete(old - HASH_EVERY * 4);
  }

  private send(now: number): void {
    // Contiguous up to lastLocal: always include the newest SEND_MAX pads so high RTT never starves recent ticks.
    const from = Math.max(this.remoteHas + 1, this.lastLocal - SEND_MAX + 1, 0);
    const q: [number, number[]][] = [];
    for (let t = from; t <= this.lastLocal && q.length < SEND_MAX; t++) {
      const p = this.local.get(t);
      if (p) q.push([p.bits, p.taps]);
    }
    const msg: Record<string, unknown> = { t: 'L', f: from, a: this.iHave, q };
    if (now - this.lastPingSent > 250) { this.lastPingSent = now; msg.pt = Math.round(now); }
    if (this.pingT) { msg.et = this.pingT; msg.ed = Math.round(now - this.pingAt); this.pingT = 0; }
    this.hooks.sendFast(JSON.stringify(msg));
  }

  /** Every lockstep message, from either channel. */
  onMessage(msg: Record<string, unknown>, now: number): void {
    if (this.fallen) return;
    if (msg.t === 'L') {
      const from = Number(msg.f);
      if (Number.isInteger(from) && Array.isArray(msg.q)) {
        msg.q.forEach((raw, i) => {
          const t = from + i;
          if (t <= this.iHave || this.remote.has(t) || !Array.isArray(raw)) return;
          const pad = readPad({ bits: raw[0], taps: raw[1] });
          if (pad) this.remote.set(t, pad);
        });
        while (this.remote.has(this.iHave + 1)) this.iHave++;
      }
      if (typeof msg.a === 'number' && msg.a > this.remoteHas) this.remoteHas = msg.a;
      if (typeof msg.pt === 'number') { this.pingT = msg.pt; this.pingAt = now; }
      if (typeof msg.et === 'number' && typeof msg.ed === 'number') {
        const sample = Math.max(0, now - msg.et - msg.ed);
        this.rtt = this.rtt ? this.rtt * .8 + sample * .2 : sample;
        if (this.rtt > SNAP_RTT_MS) {
          this.giveUp('高延迟直切快照');
          return;
        }
        // Own pads go out `delay` ticks early: enough to cover half a round trip plus a tick of jitter.
        const need = Math.ceil((this.rtt / 2 + TICK_MS) / TICK_MS) + 1;
        this.delay = Math.min(MAX_DELAY, Math.max(MIN_DELAY, need));
      }
      return;
    }
    if (msg.t === 'H' && typeof msg.k === 'number' && typeof msg.h === 'number') {
      this.theirHash.set(msg.k, msg.h);
      this.check(msg.k);
      return;
    }
    if (msg.t === 'R' && this.side === 1 && typeof msg.s === 'string' && typeof msg.k === 'number') {
      this.restore(msg.k, msg.s);
      return;
    }
    if (msg.t === 'desync' && this.side === 0) this.resync('对方报告不同步');
  }

  private check(k: number): void {
    const a = this.myHash.get(k);
    const b = this.theirHash.get(k);
    if (a === undefined || b === undefined || a === b) return;
    this.myHash.delete(k);
    this.theirHash.delete(k);
    this.hooks.log(`lockstep: tick ${k} hash ${a.toString(16)} ≠ ${b.toString(16)}`);
    if (this.side === 0) this.resync('第 ' + k + ' 帧不同步');
  }

  /** Host: send the exact match. Its next tick is the guest's starting point. */
  resync(why: string, counted = true): void {
    if (this.side !== 0 || this.fallen) return;
    if (counted) this.resyncs++;
    // Hashes from before this point compare states the guest is about to drop.
    for (const key of [...this.myHash.keys()]) if (key <= this.tick) this.myHash.delete(key);
    for (const key of [...this.theirHash.keys()]) if (key <= this.tick) this.theirHash.delete(key);
    this.hooks.log(`lockstep: resync #${this.resyncs} at tick ${this.tick} (${why})`);
    if (this.resyncs > MAX_RESYNCS) { this.giveUp('反复不同步'); return; }
    const extra = { $pads: this.pads.map(p => p.taps) };
    this.hooks.sendRel({ t: 'R', k: this.tick, s: dumpGame(this.g, this.rng, extra) });
  }

  /** Guest: take the host's state at tick k, then replay up to where this side already was. */
  private restore(k: number, text: string): void {
    const was = this.tick;
    this.resyncs++;
    this.hooks.mute(true);
    try {
      const data = loadGame(this.g, this.rng, text);
      const pads = data.$pads as number[][] | undefined;
      if (Array.isArray(pads)) pads.forEach((t, i) => { if (Array.isArray(t)) this.pads[i].taps = t.slice(); });
      this.tick = k;
      for (const key of [...this.myHash.keys()]) if (key >= k) this.myHash.delete(key);
      for (const key of [...this.theirHash.keys()]) if (key > k) this.theirHash.delete(key);
      this.resyncing = true;
      while (this.tick < was && this.remote.has(this.tick) && this.local.has(this.tick)) this.runTick();
    } finally {
      this.resyncing = false;
      this.hooks.mute(false);
    }
    this.hooks.log(`lockstep: resynced to tick ${k}, replayed to ${this.tick}`);
  }

  private giveUp(why: string): void {
    if (this.fallen) return;
    if (this.side === 1) { this.hooks.sendRel({ t: 'giveup', why }); return; }
    this.fallen = true;
    this.hooks.log('lockstep: falling back to host snapshots (' + why + ')');
    this.hooks.fallback(why);
  }

  /** Guest asked for the snapshot path. */
  onGiveUp(why: string): void { if (this.side === 0) this.giveUp(why); }

  /** Guest: the host switched; stop stepping. */
  stop(): void { this.fallen = true; }

  /** Test hook: corrupt this side's sim so the next hash disagrees. */
  poison(): void { const f = this.g.fighters[0]; if (f) f.hp -= 7; }

  get shaky(): boolean { return this.stallMs > STALL_HINT_MS; }
  get busy(): boolean { return this.resyncing; }
}
