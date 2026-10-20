/* Fight-side net. The host steps the match, publishes field deltas against the newest state the
   guest acked, and replays the guest's input samples on the guest's own clock. The guest paints
   the newest complete state, eases positions between states, and runs only visual clocks. */

import { hit } from '../game/combat.ts';
import { FLOOR, GRAVITY, X_MAX, X_MIN, clamp } from '../game/constants.ts';
import type { Attack, Fighter } from '../game/fighter.ts';
import type { Effect, FightGame, SfxKind } from '../game/game.ts';
import { SILENT_MS } from './config.ts';
import { InputClock, RemotePad, TAP_SLOTS, packBits, readEvents, tapSlot, type PadEvent } from './proto.ts';
import type { Link } from './rtc.ts';
import { LockSession, type Rng } from './lock.ts';
import type { Pad } from './proto.ts';
import { IdBook, applyState, captureState, diffState, partText, patchState, readPart, splitParts, type Part, type WireState } from './state.ts';

export interface NetEnd { title: string; stats: string; win: number; guestStats: string }

export interface NetUi {
  hud: (g: FightGame) => void;
  banner: (title: string, sub: string) => void;
  end: (title: string, stats: string) => void;
  /** '42ms', '连接不稳', or '' while nothing is known yet. */
  quality: (text: string) => void;
  /** Rematch: 'asked' the other side wants one, 'wait' we asked, 'go' both did. */
  again: (state: 'asked' | 'wait' | 'go', seed?: number) => void;
  /** Lockstep gave up: the host now runs the match alone and the guest paints it. */
  fallback?: (why: string) => void;
}

/** What a lockstep match needs from the page. */
export interface LockPlan {
  g: FightGame;
  rng: Rng;
  sample: () => Pad;
  mute: (on: boolean) => void;
}

/** Host publish rate. */
const SNAP_MS = 33;
/** Guest heartbeat when nothing changes; it also carries the acks. */
const BEAT_MS = 33;
/** A held pad is re-stamped this often so the host's clock estimate keeps moving. */
const RESTAMP_MS = 100;
/** Host: a guest that stopped reporting lets go of every key after this. */
const STALE_MS = 400;
/** Events (sound, text, sparks) kept for resend until the guest acks them. */
const EVENT_KEEP = 96;
/** Unacked guest input samples repeated in each packet (~533ms at 60Hz). */
const PAD_KEEP = 32;
/** Silence past this shows 连接不稳; normal 350ms–950ms relay latency stays quiet. */
const DISCONNECT_HINT_MS = 1500;

type FxEvent = [number, string, ...unknown[]];

export interface GuestPred {
  x: number; y: number; vx: number; vy: number;
  facing: 1 | -1; walk: number; landing: number;
  animState: Fighter['animState']; animTime: number; animSerial: number;
  dodge: number; dodgeCd: number; invuln: number;
  blocking: boolean; blockTap: number; blockBuffer: number; blockLeft: number;
  jumpRequest: boolean; jumpBuffer: number; dodgeRequest: boolean; dodgeBuffer: number;
  attack: Attack | null; attackSerial: number;
  cooldowns: number[]; queue: { index: number; ttl: number }[];
}

export interface SoftOffset { dx: number; dy: number }

let link: Link | null = null;
let role: 'host' | 'guest' | null = null;
let ui: NetUi | null = null;
let gameRef: FightGame | null = null;
let epoch = 0;
let endTold = false;
let lastHeard = 0;
let rtt = 0;
let qualityAt = 0;
let qualityText = '';
let wantAgain = false;
let lock: LockSession | null = null;
/** Dev and E2E: what lockstep did (resyncs, fallback). */
export const netLog: string[] = [];
let peerAgain = false;

// host
let book = new IdBook();
let sent = new Map<number, WireState>();
let snapN = 0;
let lastSnapAt = 0;
let snapAck = 0;
let clock = new InputClock(16);
let remote = new RemotePad();
let stale = false;
let events: FxEvent[] = [];
let eventN = 0;
let eventAck = 0;
let pingAt = 0;
let pingLag = 0;
let lastClaimSeq = 0;
let pendingGuestX: number | null = null;
let pendingClaim: [number, number, number, number] | null = null;

// guest
let states = new Map<number, WireState>();
let pending = new Map<number, { b: number; parts: Map<number, Part>; k: number; ts?: number; ev?: FxEvent[] }>();
let shown: WireState | null = null;
let shownN = 0;
let objs = new Map<string, object>();
let eventSeen = 0;
let taps: number[] = new Array(TAP_SLOTS).fill(0);
let seq = 0;
let t0 = 0;
let pad: PadEvent[] = [];
let lastSample = '';
let lastStampAt = 0;
let lastSendAt = 0;
let hostTs = 0;
let hostTsAt = 0;
let bannerKey = '';
export class EchoBook {
  private records: { key: string; at: number; x?: number; y?: number }[] = [];

  note(key: string, now: number, x?: number, y?: number): void {
    this.records.push({ key, at: now, x, y });
    // Lockstep guests may never take (no host echo). Keep only enough history for one fallback window.
    if (this.records.length > 256) this.records.splice(0, this.records.length - 256);
  }

  /**
   * Consume one matching local play. Positions are optional: audio matches by kind, sparks
   * match by colour and proximity so a different hit of the same colour is not swallowed.
   */
  take(key: string, now: number, win: number, x?: number, y?: number, reach = Infinity): boolean {
    this.prune(now, win);
    const idx = this.records.findIndex(r => {
      if (r.key !== key || now - r.at > win || now - r.at < -50) return false;
      if (x === undefined || y === undefined || r.x === undefined || r.y === undefined) return true;
      return Math.abs(r.x - x) <= reach && Math.abs(r.y - y) <= reach;
    });
    if (idx >= 0) {
      this.records.splice(idx, 1);
      return true;
    }
    return false;
  }

  prune(now: number, win: number): void {
    const minAt = now - win;
    while (this.records.length > 0 && this.records[0].at < minAt) {
      this.records.shift();
    }
  }

  clear(): void {
    this.records.length = 0;
  }
}

let ease = new Map<string, { fx: number; fy: number; tx: number; ty: number }>();
let easeAt = 0;
let easeSpan = SNAP_MS;
let lastPaintAt = 0;
let lastLocalActAt = 0;
let p2SoftOffset: SoftOffset = { dx: 0, dy: 0 };
let p2OffsetApplied = false;
let p2LogicalX = 0;
let p2LogicalY = 0;
let f0SoftOffset: SoftOffset = { dx: 0, dy: 0 };
let f0OffsetApplied = false;
let f0Vx = 0;
let f0Prev: { x: number; ts: number } | null = null;
let f0TargetX = 0;
let f0Extrap = 0;
let f0Seen = false;
export const HOST_LEAD_MS = 50;
/** Do not dead-reckon farther than this past the newest snapshot (a gap means packet loss). */
const F0_EXTRAP_MAX = .1;
const F0_SPEED_MAX = 1100;
const sfxBook = new EchoBook();
const sparkBook = new EchoBook();
let echoing = false;
let localFx: { type: string; fighter?: number; x: number; y: number; color: string; radius?: number; dir?: number; at: number }[] = [];
let localFxSeen = new WeakSet<Effect>();
let claimSeq = 0;
let outClaim: [number, number, number, number] | null = null;

function reset(): void {
  endTold = false;
  lastHeard = performance.now();
  rtt = 0;
  qualityAt = 0;
  qualityText = '';
  wantAgain = peerAgain = false;
  book = new IdBook();
  sent = new Map();
  snapN = lastSnapAt = snapAck = 0;
  clock = new InputClock(16);
  remote = new RemotePad();
  stale = false;
  events = [];
  eventN = eventAck = 0;
  pingAt = pingLag = 0;
  lastClaimSeq = 0;
  pendingGuestX = null;
  pendingClaim = null;
  states = new Map();
  pending = new Map();
  shown = null;
  nextState = null;
  shownN = 0;
  objs = new Map();
  eventSeen = 0;
  taps = new Array(TAP_SLOTS).fill(0);
  seq = 0;
  t0 = performance.now();
  pad = [];
  lastSample = '';
  lastStampAt = lastSendAt = 0;
  hostTs = hostTsAt = 0;
  bannerKey = '';
  ease = new Map();
  easeAt = 0;
  lastPaintAt = 0;
  lastLocalActAt = 0;
  p2SoftOffset = { dx: 0, dy: 0 };
  p2OffsetApplied = false;
  p2LogicalX = 0;
  p2LogicalY = 0;
  f0SoftOffset = { dx: 0, dy: 0 };
  f0OffsetApplied = false;
  f0Vx = 0;
  f0Prev = null;
  f0TargetX = 0;
  f0Extrap = 0;
  f0Seen = false;
  sfxBook.clear();
  sparkBook.clear();
  echoing = false;
  localFx = [];
  localFxSeen = new WeakSet();
  claimSeq = 0;
  outClaim = null;
}

/** `match` counts matches on this link; a rematch's first frames must not take the old match's packets. */
export function beginNet(next: 'host' | 'guest', wire: Link, hooks: NetUi, match = 0, plan?: LockPlan): void {
  if (link && link !== wire) endNet();
  link = wire;
  role = next;
  ui = hooks;
  gameRef = null;
  epoch = match;
  reset();
  lock = plan ? new LockSession(plan.g, plan.rng, next === 'host' ? 0 : 1, {
    sendFast: text => link?.sendFastText('{"m":' + epoch + ',' + text.slice(1)),
    sendRel: msg => link?.sendRel({ ...msg, m: epoch }),
    sample: plan.sample,
    mute: plan.mute,
    fallback: why => toSnapshots(why),
    log: text => { netLog.push(text); console.info(text); },
  }) : null;
  if (plan) gameRef = plan.g;
  wire.onFast(onFast);
  wire.onRel(onRel);
  wire.onDown(() => left('对手已离开'));
}

/** Hand the link over to the next match on it (rematch). */
export function keepLink(): Link | null {
  const wire = link;
  lock = null;
  if (gameRef) { gameRef.onKey = null; gameRef.onFx = null; }
  link = null;
  role = null;
  ui = null;
  gameRef = null;
  return wire;
}

export function endNet(): void {
  const wire = keepLink();
  wire?.close();
}

export function netEpoch(): number { return epoch; }

function sfxKey(kind: SfxKind, source: number): string {
  return kind + '@' + source;
}

/** Online host: every sound the sim plays also goes to the guest; guest records local plays to dedup echo. */
export function netAudio(inner: { play(kind: SfxKind, source?: number): void }): { play(kind: SfxKind, source?: number): void } {
  return {
    play: (kind, source = -1) => {
      if (role === 'host') {
        inner.play(kind, source);
        pushEvent(['a', kind, source]);
      } else if (role === 'guest') {
        if (!echoing) sfxBook.note(sfxKey(kind, source), performance.now());
        inner.play(kind, source);
      } else {
        inner.play(kind, source);
      }
    },
  };
}

function pushEvent(e: [string, ...unknown[]]): void {
  events.push([++eventN, ...e]);
  if (events.length > EVENT_KEEP) events.splice(0, events.length - EVENT_KEEP);
}

export function noteEnd(): void { endTold = true; }

function left(why: string): void {
  const g = gameRef;
  const wire = link;
  if (g) {
    if (role === 'host') remote.release(g);
    g.onKey = null;
    g.onFx = null;
    g.phase = 'finished';
  }
  const hooks = ui;
  const told = endTold;
  link = null;
  role = null;
  ui = null;
  gameRef = null;
  wire?.close();
  if (hooks && !told) {
    endTold = true;
    hooks.end(why, '');
  }
  hooks?.quality('');
}

/** The lockstep session, for the dev hooks the E2E run pokes. */
export function netLock(): LockSession | null { return lock; }

/** Host: lockstep is over for this match. Tell the guest, then run as a snapshot host. */
function toSnapshots(why: string): void {
  if (role !== 'host' || !link) return;
  const lag = rtt || lock?.rtt || 0;
  lock = null;
  link.sendRel({ t: 'F', m: epoch, why, r: Math.round(lag) });
  const heard = lastHeard;
  const asked = [wantAgain, peerAgain];
  reset();
  lastHeard = heard;
  rtt = lag;
  [wantAgain, peerAgain] = asked;
  // lockSound decides by netRole whether this host's audio is mirrored to the guest.
  if (gameRef) {
    gameRef.netRole = 'host';
    // Lockstep installs no snapshot hooks; from now on the host must publish sparks/text too.
    gameRef.onFx = e => pushEvent(e);
  }
  ui?.fallback?.(why);
}

function onRel(msg: Record<string, unknown>): void {
  if (msg.t === 'bye') { left('对手已离开'); return; }
  if (msg.m !== undefined && msg.m !== epoch) return;
  if (lock && (msg.t === 'H' || msg.t === 'R' || msg.t === 'desync')) { lastHeard = performance.now(); lock.onMessage(msg, performance.now()); return; }
  if (lock && msg.t === 'giveup') { lock.onGiveUp(String(msg.why ?? '')); return; }
  if (msg.t === 'F' && role === 'guest') {
    lock?.stop();
    lock = null;
    netLog.push('lockstep: host switched to snapshots (' + String(msg.why ?? '') + ')');
    const heard = lastHeard;
    const lag = typeof msg.r === 'number' ? msg.r : rtt;
    reset();
    lastHeard = heard;
    rtt = lag;
    if (gameRef) { gameRef.netRole = 'guest'; gameRef.keys.clear(); }
    gameRef = null;
    ui?.fallback?.(String(msg.why ?? ''));
    return;
  }
  if (msg.t === 'again') {
    peerAgain = true;
    if (wantAgain) startAgain();
    else ui?.again('asked');
    return;
  }
  if (msg.t === 'again-go' && role === 'guest') ui?.again('go', typeof msg.seed === 'number' ? msg.seed : undefined);
}

/** Ask for a rematch. The host starts it once both asked; the guest follows the host's go. */
export function netRematch(): void {
  if (!link || wantAgain) return;
  wantAgain = true;
  link.sendRel({ t: 'again' });
  if (peerAgain) startAgain();
  else ui?.again('wait');
}

function startAgain(): void {
  if (role !== 'host') return;
  // A fresh seed per match; the snapshot path ignores it.
  const seed = (Math.random() * 2 ** 32) >>> 0;
  link?.sendRel({ t: 'again-go', seed });
  ui?.again('go', seed);
}

function onFast(msg: Record<string, unknown>): void {
  if (msg.m !== epoch) return;
  const now = performance.now();
  if (msg.t === 'L') {
    if (!lock) return;
    lastHeard = now;
    lock.onMessage(msg, now);
    return;
  }
  if (msg.t === 'i' && role === 'host') {
    lastHeard = now;
    if (typeof msg.a === 'number' && msg.a > snapAck && sent.has(msg.a)) snapAck = msg.a;
    if (typeof msg.e === 'number' && msg.e > eventAck) eventAck = msg.e;
    if (typeof msg.pt === 'number' && typeof msg.pd === 'number' && msg.pt > pingAt) {
      pingAt = msg.pt;
      const sample = Math.max(0, now - msg.pt - msg.pd);
      rtt = rtt ? rtt * .8 + sample * .2 : sample;
    }
    if (typeof msg.gx === 'number' && Number.isFinite(msg.gx)) pendingGuestX = msg.gx;
    if (Array.isArray(msg.ch) && msg.ch.length >= 4 && typeof msg.ch[0] === 'number' && msg.ch[0] > lastClaimSeq) {
      lastClaimSeq = msg.ch[0];
      pendingClaim = [msg.ch[0], Number(msg.ch[1]), Number(msg.ch[2]), Number(msg.ch[3])];
    }
    clock.push(readEvents(msg.q), now);
    return;
  }
  if (msg.t === 's' && role === 'guest') {
    // F and snapshots travel on different channels. Until the reliable F arrives this socket
    // still owns the lockstep match; painting a snapshot here would fight its local sim.
    if (lock) return;
    const part = readPart(msg);
    if (!part || part.n <= shownN) return;
    lastHeard = now;
    if (typeof msg.ts === 'number' && msg.ts > hostTs) { hostTs = msg.ts; hostTsAt = now; }
    if (typeof msg.r === 'number') rtt = msg.r;
    // Samples the host already took need no resend.
    if (typeof msg.ia === 'number') pad = pad.filter(e => e[0] > (msg.ia as number));
    if (typeof msg.ca === 'number' && outClaim && outClaim[0] <= msg.ca) outClaim = null;
    let slot = pending.get(part.n);
    if (!slot) { slot = { b: part.b, k: part.k, parts: new Map() }; pending.set(part.n, slot); }
    slot.parts.set(part.i, part);
    // Keep this snapshot's own send time. hostTs is the newest timestamp seen and may belong
    // to a later snapshot that arrived while this one was still waiting for its parts.
    if (typeof msg.ts === 'number') slot.ts = msg.ts;
    if (Array.isArray(msg.ev)) slot.ev = msg.ev as FxEvent[];
    if (slot.parts.size < slot.k) return;
    const base = part.b ? states.get(part.b) : null;
    if (part.b && !base) return;
    const changes = [...slot.parts.values()].flatMap(p => p.d);
    const state = patchState(base ?? null, changes, part.x);
    states.set(part.n, state);
    for (const key of [...pending.keys()]) if (key <= part.n) pending.delete(key);
    for (const key of [...states.keys()]) if (key < part.n - 70) states.delete(key);
    // The channel is unordered: a slow older snapshot must not replace a newer one that is
    // already waiting to be painted. Its events are still safe to take once it is complete.
    if (!nextState || part.n > nextState.n) nextState = { n: part.n, s: state, ts: slot.ts ?? hostTs };
    if (slot.ev) takeEvents(slot.ev);
  }
}

let nextState: { n: number; s: WireState; ts?: number } | null = null;

function takeEvents(list: FxEvent[]): void {
  const g = gameRef;
  // One round trip plus jitter. A longer window starts swallowing unrelated host sounds.
  const win = Math.max(350, Math.min(2000, (rtt || 0) * 1.2 + 200));
  const now = performance.now();
  for (const e of list) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || e[0] <= eventSeen) continue;
    // Do not acknowledge events while the game is between hook()/fallback; the host keeps
    // resending unacked events, so they can arrive on a later snapshot.
    if (!g) continue;
    eventSeen = e[0];
    const [, kind, ...a] = e;
    if (kind === 'a' && typeof a[0] === 'string') {
      const sfxKind = a[0] as SfxKind;
      const source = typeof a[1] === 'number' ? a[1] : -1;
      if (!sfxBook.take(sfxKey(sfxKind, source), now, win)) {
        echoing = true;
        try { g.audio.play(sfxKind); } finally { echoing = false; }
      }
    } else if (kind === 't') {
      const text = String(a[0]);
      const x = Number(a[1]);
      const y = Number(a[2]);
      // Guest prediction may already have shown this line; the host echo should not stack a twin.
      const twin = g.texts.some(t => t.text === text && Math.abs(t.x - x) <= 60 && Math.abs(t.y - y) <= 60);
      if (!twin) g.text(text, x, y, String(a[3]), Number(a[4]), Number(a[5]));
    } else if (kind === 'p') {
      const x = Number(a[0]);
      const y = Number(a[1]);
      const color = String(a[2]);
      if (!sparkBook.take(color, now, win, x, y, 90)) {
        echoing = true;
        try { g.sparks(x, y, color, Number(a[3]), Number(a[4])); } finally { echoing = false; }
      }
    }
  }
}

function quality(now: number): void {
  if (!ui || now - qualityAt < 250) return;
  qualityAt = now;
  const shaky = now - lastHeard > DISCONNECT_HINT_MS;
  const ms = lock ? lock.rtt : rtt;
  const text = shaky ? '连接不稳' : ms ? Math.round(ms) + 'ms' + (lock ? ' · 延迟 ' + lock.delay + ' 帧' : '') : '';
  if (text !== qualityText) { qualityText = text; ui.quality(text); }
}

/** Lockstep: both sides step here, never through advance(). */
export function netLockFrame(now: number): void {
  if (!lock || !link) return;
  if (performance.now() - lastHeard > SILENT_MS) { left('连接已断开'); return; }
  lock.frame(now);
  quality(now);
}

/** Lockstep is running this match. */
export function netLockLive(): boolean { return !!lock && !lock.fallen; }

/** Host: softly align 2P's free-movement x toward the guest's local position within a safe drift bound. */
export function syncHostGuestPos(g: FightGame, gx: number): void {
  if (g.phase !== 'fight' || g.paused || g.timeStop !== null) return;
  const p2 = g.fighters[1];
  if (!p2 || p2.hp <= 0 || p2.stun > 0 || p2.knocked > 0 || p2.root > 0 || p2.ban > 0) return;
  const diff = gx - p2.x;
  if (Math.abs(diff) <= 150) p2.x = clamp(p2.x + diff * .35, X_MIN, X_MAX);
}

/** Host: honor a guest's local melee hit claim when the guest was not countered and the host is within drift reach. */
export function applyClaimHit(g: FightGame, slot: number, claimGx: number, claimHx: number): boolean {
  if (g.phase !== 'fight' || g.paused || g.timeStop !== null) return false;
  const p1 = g.fighters[0];
  const p2 = g.fighters[1];
  if (!p1 || !p2 || p1.hp <= 0 || p2.hp <= 0) return false;
  if (p2.stun > 0 || p2.knocked > 0 || p2.ban > 0) return false;
  if (p1.invuln > 0 || p1.dodge > 0) return false;
  const idx = Math.max(0, Math.min(5, Math.trunc(slot)));
  const skill = p2.attack?.index === idx ? p2.attack.skill : g.skillFor(p2, idx);
  if (!skill || skill.type === 'projectile') return false;
  const reach = (skill.range || 100) * 1.4 + 65;
  const distNow = Math.abs(p1.x - p2.x);
  const distClaim = Math.abs(claimHx - claimGx);
  if (Math.abs(claimGx - p2.x) > 180 || Math.abs(claimHx - p1.x) > 180) return false;
  if (Math.min(distNow, distClaim) > reach || Math.abs(p1.y - p2.y) > 175) return false;
  if (p2.attack && p2.attack.index === idx) {
    return hit(g, p2, p1, skill, p2.attack);
  }
  if (p2.cooldowns[idx] > 0 || p1.stun > 0 || p1.knocked > 0 || p1.hitFlash > 0) return false;
  if (!p2.attack) {
    g.attack(p2, idx);
  }
  const src = p2.attack ?? { hit: new Set<number>() };
  return hit(g, p2, p1, skill, src);
}

/** Host only: play the guest's samples that are due, before this frame's step. */
export function netBefore(g: FightGame): void {
  hook(g);
  if (role !== 'host') return;
  const now = performance.now();
  // If a hit claim arrived with this batch, flush due samples slightly ahead so the attack is live.
  const due = clock.due(pendingClaim ? now + 80 : now);
  for (const [, , bits, t] of due) remote.apply(g, { bits, taps: t });
  if (pendingGuestX !== null) {
    syncHostGuestPos(g, pendingGuestX);
    pendingGuestX = null;
  }
  if (pendingClaim) {
    const [, slot, gx, hx] = pendingClaim;
    pendingClaim = null;
    applyClaimHit(g, slot, gx, hx);
  }
  if (due.length) stale = false;
  else if (!stale && now - lastHeard > STALE_MS) {
    // A guest that went quiet (tab hidden, Wi-Fi blip) must not keep walking or blocking.
    remote.release(g);
    stale = true;
  }
}

function hook(g: FightGame): void {
  if (gameRef === g) return;
  gameRef = g;
  if (role === 'host') g.onFx = e => pushEvent(e);
  if (role === 'guest') {
    if (g.fighters[0]) g.fighters[0].controller = null;
    if (g.fighters[1]) g.fighters[1].controller = 0;
    g.onFx = e => {
      if (echoing) return;
      if (Array.isArray(e) && e[0] === 'p') {
        sparkBook.note(String(e[3]), performance.now(), Number(e[1]), Number(e[2]));
      }
    };
    g.onKey = code => {
      const slot = tapSlot(code);
      if (slot >= 0) taps[slot] = (taps[slot] + 1) % 256;
      lastLocalActAt = performance.now();
    };
    g.onClaimHit = (slot, gx, hx) => {
      outClaim = [++claimSeq, slot, Math.round(gx), Math.round(hx)];
      lastLocalActAt = performance.now();
    };
  }
}

function publish(g: FightGame, now: number): void {
  if (!link) return;
  if (lastSnapAt && now - lastSnapAt < SNAP_MS) return;
  // Stamp the real send time. A synthetic 33ms slot alternates 33/67ms on 20fps displays,
  // which makes the guest's velocity estimate (and 50ms lead) oscillate.
  lastSnapAt = now;
  const n = ++snapN;
  const cur = captureState(g, book);
  // The guest's newest complete state is the base; until there is one, a keyframe.
  const b = snapAck && n - snapAck < 60 ? snapAck : 0;
  const { changes, gone } = diffState(b ? sent.get(b)! : null, cur);
  sent.set(n, cur);
  for (const key of [...sent.keys()]) if (key < Math.min(snapAck, n - 60)) sent.delete(key);
  events = events.filter(e => e[0] > eventAck);
  const ev = JSON.stringify(events);
  const groups = splitParts(n, b, changes, gone, ev.length);
  groups.forEach((items, i) => {
    const head: Record<string, unknown> = { t: 's', m: epoch, n, b, i, k: groups.length };
    if (i === 0) { head.ts = Math.round(now); head.r = Math.round(rtt); head.ia = clock.acked; head.ca = lastClaimSeq; head.ev = events; }
    link!.sendFastText(partText(head, items, gone));
  });
}

/** Guest: sample the pad and send it with the acks. */
function report(g: FightGame, now: number): void {
  if (!link) return;
  const bits = packBits(g.keys, document.body.classList.contains('touch'));
  if (bits !== 0) lastLocalActAt = now;
  const sample = bits + ':' + taps.join(',');
  let fresh = false;
  if (sample !== lastSample || now - lastStampAt >= RESTAMP_MS) {
    lastSample = sample;
    lastStampAt = now;
    pad.push([++seq, Math.round((now - t0) * 10) / 10, bits, taps.slice()]);
    fresh = true;
  }
  if (!fresh && !outClaim && now - lastSendAt < BEAT_MS) return;
  lastSendAt = now;
  // Every packet repeats up to 32 unacked samples (~533ms), covering 350ms RTT + 50ms jitter.
  if (pad.length > PAD_KEEP) pad.splice(0, pad.length - PAD_KEEP);
  const p2 = g.fighters[1];
  const pkt: Record<string, unknown> = {
    t: 'i', m: epoch, a: shownN, e: eventSeen, q: pad,
    pt: hostTs, pd: hostTs ? Math.round(now - hostTsAt) : 0,
  };
  // Report the predicted (pre-rubber-band) position. The visual offset exists only to
  // hide host corrections and must never be fed back as the guest's authoritative x.
  if (p2) { pkt.gx = Math.round(p2LogicalX); pkt.gy = Math.round(Math.min(FLOOR, p2LogicalY)); }
  if (outClaim) pkt.ch = outClaim;
  link.sendFast(pkt);
}

/** Snapshot the guest's locally predicted 2P fields before applying a host wire state. */
export function snapshotGuestPred(f: Fighter): GuestPred {
  return {
    x: f.x, y: f.y, vx: f.vx, vy: f.vy,
    facing: f.facing, walk: f.walk, landing: f.landing,
    animState: f.animState, animTime: f.animTime, animSerial: f.animSerial,
    dodge: f.dodge, dodgeCd: f.dodgeCd, invuln: f.invuln,
    blocking: f.blocking, blockTap: f.blockTap, blockBuffer: f.blockBuffer, blockLeft: f.blockLeft,
    jumpRequest: f.jumpRequest, jumpBuffer: f.jumpBuffer, dodgeRequest: f.dodgeRequest, dodgeBuffer: f.dodgeBuffer,
    attack: f.attack, attackSerial: f.attackSerial,
    cooldowns: f.cooldowns.slice(),
    queue: f.queue.map(q => ({ ...q })),
  };
}

/** Merge the host's authoritative 2P snapshot with the guest's local prediction and update the 8-tick soft offset. */
export function reconcileGuestPred(g: FightGame, pred: GuestPred | null, active: boolean, softOffset: SoftOffset): void {
  if (g.fighters[0]) g.fighters[0].controller = null;
  const auth = g.fighters[1];
  if (!auth) return;
  auth.controller = 0;
  if (!pred) { softOffset.dx = 0; softOffset.dy = 0; return; }
  const breakoutLive = !!pred.attack?.skill.breakout && pred.attack.t < .35;
  const hostOverride = !breakoutLive && (
    g.phase !== 'fight' || g.timeStop !== null || auth.hp <= 0 ||
    auth.stun > 0 || auth.knocked > 0 || auth.root > 0 || auth.ban > 0 || auth.guardBroken > 0
  );
  const teleport = Math.abs(pred.x - auth.x) > 260 || Math.abs(pred.y - auth.y) > 260;
  if (!hostOverride && !teleport && active) {
    const visualX = pred.x + softOffset.dx;
    const visualY = pred.y + softOffset.dy;
    auth.x = pred.x; auth.y = pred.y; auth.vx = pred.vx; auth.vy = pred.vy;
    auth.facing = pred.facing; auth.walk = pred.walk; auth.landing = pred.landing;
    auth.animState = pred.animState; auth.animTime = pred.animTime; auth.animSerial = pred.animSerial;
    auth.dodge = pred.dodge; auth.dodgeCd = pred.dodgeCd; auth.invuln = Math.max(auth.invuln, pred.invuln);
    auth.blocking = pred.blocking; auth.blockTap = pred.blockTap; auth.blockBuffer = pred.blockBuffer; auth.blockLeft = pred.blockLeft;
    auth.jumpRequest = pred.jumpRequest; auth.jumpBuffer = pred.jumpBuffer;
    auth.dodgeRequest = pred.dodgeRequest; auth.dodgeBuffer = pred.dodgeBuffer;
    auth.attack = pred.attack; auth.attackSerial = Math.max(auth.attackSerial, pred.attackSerial);
    auth.cooldowns = pred.cooldowns; auth.queue = pred.queue;
    softOffset.dx = clamp(visualX - auth.x, -220, 220);
    softOffset.dy = clamp(visualY - auth.y, -220, 220);
    return;
  }
  if (!teleport && g.phase === 'fight') {
    softOffset.dx = clamp((pred.x + softOffset.dx) - auth.x, -220, 220);
    softOffset.dy = clamp((pred.y + softOffset.dy) - auth.y, -220, 220);
  } else {
    softOffset.dx = 0;
    softOffset.dy = 0;
  }
}

/** Decay the guest's visual offset by 0.7 per 60Hz tick (~8 ticks / 133ms rubber-band smoothing). */
export function stepSoftOffset(softOffset: SoftOffset, dt: number): void {
  const decay = Math.pow(.7, dt * 60);
  softOffset.dx *= decay;
  softOffset.dy *= decay;
  if (Math.abs(softOffset.dx) < .5) softOffset.dx = 0;
  if (Math.abs(softOffset.dy) < .5) softOffset.dy = 0;
}

/**
 * Read a number straight from the full patched wire state. applyState skips fields whose
 * text did not change, so the live object may still hold our dead-reckoned visual x.
 */
function wireNumber(s: WireState, key: string, field: string): number | null {
  const raw = s.get(key)?.get(field);
  if (raw === undefined) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** True when the host's fighter must not be extrapolated (freeze, stun, knockback, respawn). */
function f0Stopped(g: FightGame, f: Fighter): boolean {
  return g.phase !== 'fight' || g.paused || g.timeStop !== null || g.hitstop > 0 ||
    f.hp <= 0 || f.stun > 0 || f.knocked > 0 || f.root > 0 || f.ban > 0;
}

function paintState(g: FightGame, now: number): boolean {
  const next = nextState;
  if (!next || next.n <= shownN) return false;
  nextState = null;
  const wasShown = shown !== null;
  const pred = wasShown && g.fighters[1] ? snapshotGuestPred(g.fighters[1]) : null;

  const f0 = g.fighters[0];
  const prevAttack = f0?.attack ? { serial: f0.attack.serial, t: f0.attack.t } : null;
  const prevAnim = f0 ? { state: f0.animState, serial: f0.animSerial, time: f0.animTime } : null;
  const visX = f0 ? f0.x + f0SoftOffset.dx : 0;
  const visY = f0 ? f0.y + f0SoftOffset.dy : 0;

  const from = new Map<string, { x: number; y: number }>();
  for (const [key, o] of objs) {
    const p = o as { x?: number; y?: number };
    if (typeof p.x === 'number' && typeof p.y === 'number') from.set(key, { x: p.x, y: p.y });
  }

  const known = new Set(objs.keys());
  const localStop = g.hitstop;
  applyState(g, next.s, shown, objs);
  // Host hitstop is authoritative, but a local predicted hit may have started a longer freeze.
  g.hitstop = Math.max(localStop, g.hitstop);

  shown = next.s;
  shownN = next.n;

  const win = Math.max(450, Math.min(2000, (rtt || 0) * 1.2 + 250));
  for (const [key, obj] of objs) {
    if (key[0] !== 'e' || known.has(key)) continue;
    const e = obj as Effect;
    const idx = localFx.findIndex(l => {
      if (l.type !== e.type || l.color !== e.color || now - l.at > win) return false;
      if (l.radius !== undefined && e.radius !== undefined && Math.abs(l.radius - e.radius) > 4) return false;
      if (l.dir !== undefined && e.dir !== undefined && l.dir !== e.dir) return false;
      if (typeof l.fighter === 'number' && typeof e.fighter === 'number') {
        return l.fighter === e.fighter && Math.abs(l.x - e.x) <= 60 && Math.abs(l.y - e.y) <= 60;
      }
      return Math.abs(l.x - e.x) <= 40 && Math.abs(l.y - e.y) <= 40;
    });
    if (idx >= 0) {
      localFx.splice(idx, 1);
      e.dup = true;
      const gIdx = g.effects.indexOf(e);
      if (gIdx >= 0) g.effects.splice(gIdx, 1);
    }
  }

  const auth0 = g.fighters[0];
  if (auth0) {
    const ts = next.ts || now;
    const wireX = wireNumber(next.s, 'f0', 'x');
    const wireY = wireNumber(next.s, 'f0', 'y');
    const rawAuthX = wireX ?? auth0.x;
    if (wireY !== null) auth0.y = wireY;
    if (f0Prev && ts > f0Prev.ts) {
      const dtMs = ts - f0Prev.ts;
      if (dtMs >= 8 && dtMs <= 200) {
        const vx = (rawAuthX - f0Prev.x) / (dtMs / 1000);
        f0Vx = clamp(vx, -F0_SPEED_MAX, F0_SPEED_MAX);
      } else if (dtMs > 200) {
        f0Vx = 0;
      }
      f0Prev = { x: rawAuthX, ts };
    } else if (!f0Prev) {
      f0Prev = { x: rawAuthX, ts };
      f0Vx = 0;
    }
    if (f0Stopped(g, auth0)) f0Vx = 0;

    const leadDt = HOST_LEAD_MS > 0 && rtt > 0 ? Math.min(rtt / 2, HOST_LEAD_MS) / 1000 : 0;
    f0TargetX = clamp(rawAuthX + f0Vx * leadDt, X_MIN, X_MAX);
    auth0.x = f0TargetX;
    f0Extrap = 0;
    f0Seen = true;

    if (prevAttack && auth0.attack && auth0.attack.serial === prevAttack.serial && prevAttack.t > auth0.attack.t) {
      auth0.attack.t = prevAttack.t;
    }
    if (prevAnim && auth0.animState === prevAnim.state && auth0.animSerial === prevAnim.serial && prevAnim.time > auth0.animTime) {
      auth0.animTime = prevAnim.time;
    }

    const dx = visX - f0TargetX;
    const dy = visY - auth0.y;
    // A first snapshot may start far from the local spawn; only ease a small correction.
    // During normal play a real teleport snaps too.
    const limit = wasShown ? 320 : 120;
    if (Math.abs(dx) > limit || Math.abs(dy) > limit) {
      f0SoftOffset.dx = 0;
      f0SoftOffset.dy = 0;
    } else {
      f0SoftOffset.dx = clamp(dx, -220, 220);
      f0SoftOffset.dy = clamp(dy, -220, 220);
    }
  }

  const activeWindow = Math.max(260, rtt + 120);
  const active = now - lastLocalActAt < activeWindow || !!pred?.attack || (pred?.dodge ?? 0) > 0 || (pred?.y ?? FLOOR) < FLOOR - .5 || !!pred?.blocking || g.keys.size > 0;
  reconcileGuestPred(g, pred, active, p2SoftOffset);

  easeSpan = Math.min(100, Math.max(16, easeAt ? now - easeAt : SNAP_MS));
  easeAt = now;
  ease = new Map();
  for (const [key, o] of objs) {
    if (key[0] !== 'p') continue;
    const p = o as { x: number; y: number };
    const a = from.get(key);
    if (!a || Math.abs(a.x - p.x) > 320 || Math.abs(a.y - p.y) > 320) continue;
    ease.set(key, { fx: a.x, fy: a.y, tx: p.x, ty: p.y });
    p.x = a.x; p.y = a.y;
  }
  const key = g.bannerTitle + '\n' + g.bannerSub;
  if (key !== bannerKey) {
    bannerKey = key;
    ui?.banner(g.bannerTitle, g.bannerSub);
  }
  const end = g.netEnd as NetEnd | null;
  if (end?.title && !endTold) {
    endTold = true;
    ui?.end(end.win === 1 ? '你赢了' : end.win === 0 ? '你输了' : end.title, end.guestStats || end.stats);
  }
  return true;
}

function slide(now: number): void {
  const k = Math.min(1, easeAt ? (now - easeAt) / easeSpan : 1);
  for (const [key, e] of ease) {
    const o = objs.get(key) as { x: number; y: number } | undefined;
    if (!o) continue;
    o.x = e.fx + (e.tx - e.fx) * k;
    o.y = e.fy + (e.ty - e.fy) * k;
  }
}

/** Guest-only visual clock for the host's fighter. x is dead-reckoned by guestFrame. */
export function coastHost(f: Fighter, dt: number, frozen = false): void {
  if (frozen || f.hp <= 0 || (f.root > 0 && f.rootLevel === 'freeze')) return;
  if (f.landing > 0) f.landing = Math.max(0, f.landing - dt);
  if (f.attack) f.attack.t = Math.min(f.attack.t + dt, f.attack.skill.duration);
  if (f.y < FLOOR - .1 || f.vy < 0) {
    const juggled = f.y < FLOOR - .1 && f.stun > 0 && f.knocked <= 0;
    f.vy += GRAVITY * (juggled ? .6 : 1) * dt;
    f.y += f.vy * dt;
    if (f.y >= FLOOR) {
      f.y = FLOOR;
      f.vy = 0;
      if (f.attack?.skill.air) f.attack = null;
    }
  }
}

export function guestFrame(g: FightGame, now: number): void {
  const f0Before = g.fighters[0];
  if (f0Before && f0OffsetApplied) {
    f0Before.x = clamp(f0Before.x - f0SoftOffset.dx, X_MIN, X_MAX);
    f0Before.y = Math.min(FLOOR, f0Before.y - f0SoftOffset.dy);
    f0OffsetApplied = false;
  }
  const p2Before = g.fighters[1];
  if (p2Before && p2OffsetApplied) {
    p2Before.x = clamp(p2Before.x - p2SoftOffset.dx, X_MIN, X_MAX);
    p2Before.y = Math.min(FLOOR, p2Before.y - p2SoftOffset.dy);
    p2OffsetApplied = false;
  }
  const dt = lastPaintAt ? Math.min(.1, (now - lastPaintAt) / 1000) : 0;
  lastPaintAt = now;

  // Advance last frame's correction before the new snapshot is measured against it. Decaying
  // after assigning the new offset would throw away ~30% of every fresh correction.
  stepSoftOffset(f0SoftOffset, dt);
  stepSoftOffset(p2SoftOffset, dt);

  g.stepGuestLocal(dt);

  for (let i = 0; i < g.effects.length; i++) {
    const e = g.effects[i];
    if (e.local && !localFxSeen.has(e)) {
      localFxSeen.add(e);
      localFx.push({ type: e.type, fighter: e.fighter, x: e.x, y: e.y, color: e.color, radius: e.radius, dir: e.dir, at: now });
    }
  }
  const fxCutoff = now - 1500;
  while (localFx.length > 0 && localFx[0].at < fxCutoff) {
    localFx.shift();
  }

  const f0Now = g.fighters[0];
  const frozen = !f0Now || f0Stopped(g, f0Now);
  if (f0Now && f0Seen) {
    if (frozen) {
      // Freeze where the eye currently is; restarting from the old snapshot point would snap.
      f0TargetX = f0Now.x;
      f0Extrap = 0;
    } else {
      f0Extrap = Math.min(F0_EXTRAP_MAX, f0Extrap + dt);
      f0Now.x = clamp(f0TargetX + f0Vx * f0Extrap, X_MIN, X_MAX);
    }
  }
  if (f0Now) coastHost(f0Now, dt, frozen);

  g.netVisuals(dt);
  paintState(g, now);
  slide(now);

  const f0After = g.fighters[0];
  if (f0After && (f0SoftOffset.dx !== 0 || f0SoftOffset.dy !== 0)) {
    const baseX = f0After.x;
    const baseY = f0After.y;
    f0After.x = clamp(baseX + f0SoftOffset.dx, X_MIN, X_MAX);
    f0After.y = Math.min(FLOOR, baseY + f0SoftOffset.dy);
    // Keep the offset exactly reversible after a wall/floor clamp.
    f0SoftOffset.dx = f0After.x - baseX;
    f0SoftOffset.dy = f0After.y - baseY;
    f0OffsetApplied = true;
  }
  const p2After = g.fighters[1];
  if (p2After) {
    p2LogicalX = p2After.x;
    p2LogicalY = p2After.y;
    if (p2SoftOffset.dx !== 0 || p2SoftOffset.dy !== 0) {
      const baseX = p2After.x;
      const baseY = p2After.y;
      p2After.x = clamp(baseX + p2SoftOffset.dx, X_MIN, X_MAX);
      p2After.y = Math.min(FLOOR, baseY + p2SoftOffset.dy);
      p2SoftOffset.dx = p2After.x - baseX;
      p2SoftOffset.dy = p2After.y - baseY;
      p2OffsetApplied = true;
    }
  }
}

/** Host publishes; guest steps local prediction, reports, paints the newest state and blends offsets. */
export function netAfter(g: FightGame, now: number): void {
  hook(g);
  if (!link || !role) return;
  if (now - lastHeard > SILENT_MS && performance.now() - lastHeard > SILENT_MS) { left('连接已断开'); return; }
  quality(now);
  if (role === 'host') {
    if (g.netEnd) endTold = true;
    publish(g, now);
    return;
  }
  guestFrame(g, now);
  report(g, now);
  ui?.hud(g);
}

export function queueGuestState(n: number, s: WireState, ts?: number, ev?: FxEvent[]): void {
  nextState = { n, s, ts: ts ?? performance.now() };
  if (ev) takeEvents(ev);
}

export function resetNetForTest(g?: FightGame): void {
  reset();
  role = 'guest';
  if (g) hook(g);
}

/** Guest: the tab is going away; let go of everything now rather than after the host's timeout. */
export function netHidden(): void {
  const g = gameRef;
  if (role !== 'guest' || !g) return;
  g.keys.clear();
  report(g, performance.now());
}
