/* Fight-side net. The host steps the match, publishes field deltas against the newest state the
   guest acked, and replays the guest's input samples on the guest's own clock. The guest paints
   the newest complete state, eases positions between states, and runs only visual clocks. */

import { hit } from '../game/combat.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from '../game/constants.ts';
import type { Attack, Fighter } from '../game/fighter.ts';
import type { FightGame, SfxKind } from '../game/game.ts';
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
const EVENT_KEEP = 32;
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
let pending = new Map<number, { b: number; parts: Map<number, Part>; k: number }>();
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
let ease = new Map<string, { fx: number; fy: number; tx: number; ty: number }>();
let easeAt = 0;
let easeSpan = SNAP_MS;
let lastPaintAt = 0;
let lastLocalActAt = 0;
let p2SoftOffset: SoftOffset = { dx: 0, dy: 0 };
let p2OffsetApplied = false;
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

/** Online host: every sound the sim plays also goes to the guest. */
export function netAudio(inner: { play(kind: SfxKind): void }): { play(kind: SfxKind): void } {
  return { play: kind => { inner.play(kind); if (role === 'host') pushEvent(['a', kind]); } };
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
  lock = null;
  link.sendRel({ t: 'F', m: epoch, why });
  const heard = lastHeard;
  const asked = [wantAgain, peerAgain];
  reset();
  lastHeard = heard;
  [wantAgain, peerAgain] = asked;
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
    reset();
    lastHeard = heard;
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
    const part = readPart(msg);
    if (!part || part.n <= shownN) return;
    lastHeard = now;
    if (typeof msg.ts === 'number' && msg.ts > hostTs) { hostTs = msg.ts; hostTsAt = now; }
    if (typeof msg.r === 'number') rtt = msg.r;
    // Samples the host already took need no resend.
    if (typeof msg.ia === 'number') pad = pad.filter(e => e[0] > (msg.ia as number));
    if (typeof msg.ca === 'number' && outClaim && outClaim[0] <= msg.ca) outClaim = null;
    if (Array.isArray(msg.ev)) takeEvents(msg.ev as FxEvent[]);
    let slot = pending.get(part.n);
    if (!slot) { slot = { b: part.b, k: part.k, parts: new Map() }; pending.set(part.n, slot); }
    slot.parts.set(part.i, part);
    if (slot.parts.size < slot.k) return;
    const base = part.b ? states.get(part.b) : null;
    if (part.b && !base) return;
    const changes = [...slot.parts.values()].flatMap(p => p.d);
    const state = patchState(base ?? null, changes, part.x);
    states.set(part.n, state);
    for (const key of [...pending.keys()]) if (key <= part.n) pending.delete(key);
    for (const key of [...states.keys()]) if (key < part.n - 40) states.delete(key);
    nextState = { n: part.n, s: state };
  }
}

let nextState: { n: number; s: WireState } | null = null;

function takeEvents(list: FxEvent[]): void {
  const g = gameRef;
  for (const e of list) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || e[0] <= eventSeen) continue;
    eventSeen = e[0];
    if (!g) continue;
    const [, kind, ...a] = e;
    if (kind === 'a' && typeof a[0] === 'string') g.audio.play(a[0] as SfxKind);
    else if (kind === 't') g.text(String(a[0]), Number(a[1]), Number(a[2]), String(a[3]), Number(a[4]), Number(a[5]));
    else if (kind === 'p') g.sparks(Number(a[0]), Number(a[1]), String(a[2]), Number(a[3]), Number(a[4]));
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
  if (p2) { pkt.gx = Math.round(p2.x); pkt.gy = Math.round(p2.y); }
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

function paintState(g: FightGame, now: number): void {
  const next = nextState;
  if (!next || next.n <= shownN) return;
  nextState = null;
  const wasShown = shown !== null;
  const pred = wasShown && g.fighters[1] ? snapshotGuestPred(g.fighters[1]) : null;
  const from = new Map<string, { x: number; y: number }>();
  for (const [key, o] of objs) {
    const p = o as { x?: number; y?: number };
    if (typeof p.x === 'number' && typeof p.y === 'number') from.set(key, { x: p.x, y: p.y });
  }
  applyState(g, next.s, shown, objs);
  shown = next.s;
  shownN = next.n;
  const activeWindow = Math.max(260, rtt + 120);
  const active = now - lastLocalActAt < activeWindow || !!pred?.attack || (pred?.dodge ?? 0) > 0 || (pred?.y ?? FLOOR) < FLOOR - .5 || !!pred?.blocking || g.keys.size > 0;
  reconcileGuestPred(g, pred, active, p2SoftOffset);
  easeSpan = Math.min(100, Math.max(16, easeAt ? now - easeAt : SNAP_MS));
  easeAt = now;
  ease = new Map();
  for (const [key, o] of objs) {
    // f1 (guest's own fighter) uses local prediction + p2SoftOffset; f0 (host) and projectiles use snapshot ease.
    if ((key[0] !== 'f' && key[0] !== 'p') || key === 'f1') continue;
    const p = o as { x: number; y: number };
    const a = from.get(key);
    // A jump of more than a screen third is a teleport or a respawn: no slide.
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
  const p2Before = g.fighters[1];
  if (p2Before && p2OffsetApplied) {
    p2Before.x = clamp(p2Before.x - p2SoftOffset.dx, X_MIN, X_MAX);
    p2Before.y = Math.min(FLOOR, p2Before.y - p2SoftOffset.dy);
    p2OffsetApplied = false;
  }
  const dt = lastPaintAt ? Math.min(.1, (now - lastPaintAt) / 1000) : 0;
  lastPaintAt = now;
  g.stepGuestLocal(dt);
  report(g, now);
  g.netVisuals(dt);
  paintState(g, now);
  slide(now);
  stepSoftOffset(p2SoftOffset, dt);
  const p2After = g.fighters[1];
  if (p2After && (p2SoftOffset.dx !== 0 || p2SoftOffset.dy !== 0)) {
    p2After.x = clamp(p2After.x + p2SoftOffset.dx, X_MIN, X_MAX);
    p2After.y = Math.min(FLOOR, p2After.y + p2SoftOffset.dy);
    p2OffsetApplied = true;
  }
  ui?.hud(g);
}

/** Guest: the tab is going away; let go of everything now rather than after the host's timeout. */
export function netHidden(): void {
  const g = gameRef;
  if (role !== 'guest' || !g) return;
  g.keys.clear();
  report(g, performance.now());
}
