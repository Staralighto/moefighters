import type { Skill } from '../data/types.ts';
import { isInvulnerable, gainEnergy, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, withGuard } from './combat.ts';
import { SCRIPTS } from './scripts.ts';
import {
  HAGUMI_FEAST, HAGUMI_HOP, HAGUMI_LAPS, HAGUMI_LAPS_TAIL, HAGUMI_RIDE, HAGUMI_RIDE_TAIL, HAGUMI_RIDE_TIME, feastTimes,
} from '../render/clips.ts';

/* 北泽育美（萌娘百科）— Hello, Happy World! 的贝斯手。北泽精肉店的女儿（可乐饼很有名）、垒球队王牌兼队长 Captain、
   体力 BUG（跑去邻镇买书、拉着花音绕商店街跑十圈）、总挂在米歇尔身上的「三笨蛋」之一。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     hagumi-laps       U 绕商店街跑十圈     a sprint to the wall and back; each pass hits once (霸体, ground only)
     hagumi-croquette  I 刚出锅的快速球     a windmill pitch of a hot croquette (烧焦); a miss lies on the floor to be eaten
     hagumi-michelle   O 挂上米歇尔！       米歇尔 runs in, she jumps on its back and they charge (霸体, ground only)
     hagumi-feast      L 可乐饼盛情难却     croquettes rain on a patch ahead, then a giant one buries them
   Shared numbers and the cell picks live in clips.ts, every picture in render/hagumiFx.ts. Anything that rides on a
   move (the speed lines, 米歇尔, the shop awning, the rain) is kept alive by the move (keepOn), so a cut move loses
   it at once. The croquette on the floor is plain projectile state, so a lockstep dump resumes it. */

const ORANGE = '#FF9922';
const GOLD = '#ffc75a';

const KEEP = .12;
function keepOn(g: FightGame, f: Fighter, a: Attack, type: string, color: string, extra: Partial<Effect> = {}, life = KEEP): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, f.x, f.y, color, life, { follow: f.id, ox: 0, oy: 0, ...extra, fighter: f.id });
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  e.dir = f.facing;
  e.age = a.t;
  return e;
}
function* foes(g: FightGame, f: Fighter): Generator<Fighter> {
  for (const o of g.fighters) if (g.isEnemy(f, o) && o.hp > 0 && !o.echo) yield o;
}
function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
/** Anything this far off the floor is over the move (jump it). */
const LOW_AIR = 90;
const grounded = (o: Fighter) => o.y >= FLOOR - LOW_AIR;
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
function finish(a: Attack, tail: number): void {
  a.t = Math.max(a.t, a.skill.duration - tail);
}

/* ---- U 绕商店街跑十圈 ---- */

/** She runs this fast, at most this far per leg; a body this close to her is run through. */
const LAP_SPEED = 980;
const LAP_MAX = 760;
const LAP_REACH = 58;
const lapParts = new WeakMap<Skill, { pass: Skill; back: Skill }>();
/** 绕商店街跑十圈 (萌娘百科: 拉着花音绕商店街跑十圈、跑步去邻镇的书店买书、几乎能追上全速飞行的乌鸦): a sprinter's
 *  crouch, then off at full tilt to the wall (or LAP_MAX), a skid and a turn, and straight back to where she set
 *  off. Each leg runs through every grounded body once: the way out holds them on the lane, the way back throws
 *  them. 霸体 for the whole move; a jump clears it. A crow sets off with her and she overtakes it.
 *  a.mode walks HAGUMI_LAPS; a.anchor is where she set off; a.shots the leg; a.tossAt when the leg began. */
function step_laps(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? HAGUMI_LAPS.set;
  f.vx = 0;
  if (mode === HAGUMI_LAPS.set) {
    if (a.t < s.start) return;
    a.mode = HAGUMI_LAPS.run;
    a.anchor = f.x;
    a.shots = 0;
    a.tossAt = a.t;
    a.hit = new Set();
    g.effect('hagumi-kick', f.x - f.facing * 20, FLOOR, '#e9d8bd', .5, { dir: f.facing });
    g.effect('hagumi-crow', f.x, FLOOR - 250, '#2a2230', 1.6, { dir: f.facing });
    return;
  }
  if (mode !== HAGUMI_LAPS.run) return;
  keepOn(g, f, a, 'hagumi-speed', '#fff4dd', { oy: 0 });
  const was = f.x;
  f.x = clamp(f.x + f.facing * LAP_SPEED * dt, X_MIN, X_MAX);
  if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) g.effect('hagumi-dust', f.x - f.facing * 26, FLOOR, '#e9d8bd', .45, { dir: f.facing, n: Math.floor(a.t * 16) });
  const parts = derive(lapParts, s, k => ({
    pass: { ...k, knock: 0, react: { kind: 'stand' as const, stun: .5 } },
    back: { ...k, react: { kind: 'stand' as const, stun: .35 } },
  }));
  const leg = a.shots;
  for (const o of foes(g, f)) {
    if (a.hit.has(o.id) || !grounded(o)) continue;
    // Swept: anything between last frame's x and this one's, give or take her reach.
    const lo = Math.min(was, f.x) - LAP_REACH, hi = Math.max(was, f.x) + LAP_REACH;
    if (o.x < lo || o.x > hi) continue;
    if (hit(g, f, o, leg === 0 ? parts.pass : parts.back, a, f.x - f.facing * 40)) {
      g.effect('hagumi-bump', o.x, o.y - 90, ORANGE, .35, { dir: f.facing, n: leg });
      g.shake = Math.max(g.shake, leg ? 6 : 3);
    }
  }
  const run = Math.abs(f.x - (leg === 0 ? a.anchor : a.liftAt));
  const wall = f.facing > 0 ? f.x >= X_MAX : f.x <= X_MIN;
  if (leg === 0 && (wall || run >= LAP_MAX)) {
    // The skid and the turn: the way back can hit everyone again.
    a.shots = 1;
    a.liftAt = f.x;
    a.tossAt = a.t;
    a.hit = new Set();
    g.effect('hagumi-skid', f.x, FLOOR, '#e9d8bd', .45, { dir: f.facing });
    f.facing = (-f.facing) as 1 | -1;
    return;
  }
  const home = leg === 1 && (f.x - a.anchor) * f.facing >= 0;
  if (leg === 1 && (home || wall || run >= LAP_MAX)) {
    a.mode = HAGUMI_LAPS.done;
    g.effect('hagumi-skid', f.x, FLOOR, '#e9d8bd', .4, { dir: f.facing });
    finish(a, HAGUMI_LAPS_TAIL);
  }
}
SCRIPTS['hagumi-laps'] = Object.assign(SCRIPTS['hagumi-laps'] ?? {}, { update: step_laps, customDash: true, noMelee: true });

/* ---- I 刚出锅的快速球 ---- */

/** The release: hip height, a touch upward; then a gentle drop so a miss lands about two thirds of the stage away. */
const CROQ_HAND = 72;
const CROQ_SPEED = 820;
const CROQ_RISE = -60;
const CROQ_GRAVITY = 520;
/** A miss lies hot on the floor this long; she eats it from this close for HP and 气. */
const CROQ_LIE = 4;
const CROQ_EAT = 42;
const CROQ_HEAL = 30;
const CROQ_GAIN = 10;
const HEAL_TEXT = '#9dffc0';
/** 刚出锅的快速球 (垒球队王牌 Captain + 北泽精肉店的可乐饼): the windmill wind-up, and a fresh croquette leaves her hand
 *  like a fast pitch, steaming. A clean hit 烧焦s; a guard stops it. If it reaches the floor it lies there, still hot,
 *  and she can walk over it to eat it (回血、回气). One on the floor at a time: a new pitch clears the old one. */
function step_croquette(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.t < s.start || a.shots) return;
  a.shots = 1;
  for (const p of g.projectiles) if (p.fx === s.fx && p.owner === f.id && p.settled) p.life = 0;
  g.projectiles.push({
    owner: f.id, x: f.x + f.facing * 46, y: f.y - CROQ_HAND, vx: f.facing * (s.speed ?? CROQ_SPEED), vy: CROQ_RISE,
    life: s.life ?? 2, skill: s, color: GOLD, radius: 14, size: s.size ?? 44, fx: s.fx, attack: a, hit: new Set(),
    trail: [], age: 0, solid: s.solid, settled: false, face: f.facing,
  });
  g.effect('hagumi-pitch', f.x + f.facing * 40, f.y - CROQ_HAND, '#fff1c8', .3, { dir: f.facing });
}
function stepCroquette(g: FightGame, p: Projectile, dt: number): boolean {
  const owner = g.fighterById(p.owner);
  if (p.settled) {
    if (owner && owner.hp > 0 && Math.abs(owner.x - p.x) < CROQ_EAT && owner.y >= FLOOR - 4) {
      p.life = 0;
      owner.hp = Math.min(owner.data.hp, owner.hp + CROQ_HEAL);
      gainEnergy(owner, CROQ_GAIN);
      g.text(`+${CROQ_HEAL}`, owner.x, owner.y - 170, HEAL_TEXT, .6, 18);
      g.effect('hagumi-munch', owner.x + owner.facing * 18, owner.y - headOf(owner) * .8, GOLD, .6, { follow: owner.id, ox: owner.facing * 18, oy: -headOf(owner) * .8, dir: owner.facing });
    }
    return true;
  }
  p.vy += CROQ_GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > 8) p.trail.shift();
  if (owner) {
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id)) continue;
      if (Math.abs(p.x - o.x) >= 38 + p.radius || Math.abs(p.y - (o.y - 83)) >= 72) continue;
      if (!hit(g, owner, o, p.skill, p, p.x - Math.sign(p.vx) * 40)) continue;
      p.life = 0;
      g.effect('hagumi-crumbs', p.x, p.y, GOLD, .55, { dir: Math.sign(p.vx) || 1, radius: 34 });
      return true;
    }
  }
  // The stage edge stops it dead and it drops there, so a miss is always somewhere she can walk to.
  if (p.x < X_MIN + 10 || p.x > X_MAX - 10) {
    p.x = clamp(p.x, X_MIN + 10, X_MAX - 10);
    if (p.vx) g.effect('hagumi-plop', p.x, p.y, GOLD, .3, { radius: 14 });
    p.vx = 0;
  }
  if (p.y >= FLOOR - 8) {
    p.y = FLOOR - 8;
    p.x = clamp(p.x, X_MIN + 10, X_MAX - 10);
    p.vx = 0;
    p.vy = 0;
    p.settled = true;
    p.life = CROQ_LIE;
    p.age = 0;
    p.trail.length = 0;
    g.effect('hagumi-plop', p.x, FLOOR, GOLD, .4, { radius: 22 });
  }
  return true;
}
SCRIPTS['hagumi-croquette'] = Object.assign(SCRIPTS['hagumi-croquette'] ?? {}, {
  update: step_croquette, shot: stepCroquette, noMelee: true, skipVolley: true, skipCount: true, trail: 0,
});

/* ---- O 挂上米歇尔！ ---- */

/** 米歇尔 comes running from this far behind her and arrives at Skill.start. */
const BEAR_FROM = 240;
/** On its back: lifted off the floor this much, sitting this far behind its middle. */
const RIDE_LIFT = 70;
const RIDE_BACK = 26;
const RIDE_SPEED = 560;
/** The bear's front reaches this far ahead of its middle; a body this close is run over. */
const BEAR_NOSE = 44;
const BEAR_REACH = 62;
/** Hopping down: how far forward. */
const HOP_FWD = 70;
/** 挂上米歇尔！ (萌娘百科: 非常喜欢米歇尔并且时常挂在米歇尔身上; 「奥泽小姐你辛苦了，公主抱心加上肩扛育美」; 三笨蛋不知道美咲
 *  就是米歇尔): she waves, 米歇尔 comes running from behind, she jumps onto its back and they charge together, running
 *  over every grounded body once (knocked down). Then she hops off with her arms up, and 米歇尔 stops, sweating.
 *  霸体 for the whole move; a jump clears it. a.mode walks HAGUMI_RIDE; a.anchor is 米歇尔's x; a.tossAt the ride's
 *  start, a.liftAt the hop's. */
function step_michelle(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? HAGUMI_RIDE.call;
  f.vx = 0;
  if (mode === HAGUMI_RIDE.call) {
    if (!a.emitted) {
      a.emitted = true;
      a.anchor = f.x - f.facing * BEAR_FROM;
      g.effect('hagumi-call', f.x, f.y - headOf(f) - 10, '#ffd0ec', .5, { follow: f.id, ox: 0, oy: -headOf(f) - 10, dir: f.facing });
    }
    // Running in from behind, to stand just under her by Skill.start.
    const k = Math.min(1, a.t / Math.max(.01, s.start));
    a.anchor = f.x - f.facing * BEAR_FROM + f.facing * (BEAR_FROM + RIDE_BACK) * k;
    bear(g, f, a, 0);
    if (a.t < s.start) return;
    a.mode = HAGUMI_RIDE.ride;
    a.tossAt = a.t;
    a.hit = new Set();
    a.anchor = f.x + f.facing * RIDE_BACK;
    g.effect('hagumi-hop', f.x, f.y - 60, '#ffffff', .4, { dir: f.facing });
    return;
  }
  if (mode === HAGUMI_RIDE.ride) {
    a.anchor = clamp(a.anchor + f.facing * RIDE_SPEED * dt, X_MIN, X_MAX);
    f.x = clamp(a.anchor - f.facing * RIDE_BACK, X_MIN, X_MAX);
    f.y = FLOOR - RIDE_LIFT;
    f.vy = 0;
    bear(g, f, a, 1);
    if (Math.floor(a.t * 12) !== Math.floor((a.t - dt) * 12)) g.effect('hagumi-dust', a.anchor - f.facing * 30, FLOOR, '#e9d8bd', .45, { dir: f.facing, n: Math.floor(a.t * 12) });
    const nose = a.anchor + f.facing * BEAR_NOSE;
    for (const o of foes(g, f)) {
      if (a.hit.has(o.id) || !grounded(o) || Math.abs(o.x - nose) > BEAR_REACH) continue;
      if (hit(g, f, o, s, a, a.anchor - f.facing * 40)) {
        g.effect('hagumi-bump', o.x, o.y - 110, '#ff8fd4', .45, { dir: f.facing, n: 2 });
        g.shake = Math.max(g.shake, 7);
        g.hitstop = Math.max(g.hitstop, .05);
      }
    }
    const wall = f.facing > 0 ? a.anchor >= X_MAX : a.anchor <= X_MIN;
    if (a.t >= a.tossAt + HAGUMI_RIDE_TIME || wall) {
      a.mode = HAGUMI_RIDE.hop;
      a.liftAt = a.t;
      a.burst = f.x;
    }
    return;
  }
  if (mode === HAGUMI_RIDE.hop) {
    bear(g, f, a, 2);
    const k = Math.min(1, (a.t - a.liftAt) / HAGUMI_HOP);
    f.x = clamp(a.burst + f.facing * HOP_FWD * k, X_MIN, X_MAX);
    f.y = FLOOR - RIDE_LIFT * (1 - k) - 40 * Math.sin(Math.PI * k);
    f.vy = 0;
    if (k < 1) return;
    f.y = FLOOR;
    a.mode = HAGUMI_RIDE.done;
    g.effect('hagumi-sweat', a.anchor, FLOOR - 200, '#bfe6ff', .9, { dir: f.facing });
    g.effect('hagumi-michelle-off', a.anchor, FLOOR, '#ffffff', .55, { dir: f.facing });
    finish(a, HAGUMI_RIDE_TAIL);
    return;
  }
  if (f.y !== FLOOR) f.y = FLOOR;
}
/** 米歇尔 this tick: where it stands and what it is doing (n: 0 running in, 1 carrying, 2 stopping). */
function bear(g: FightGame, f: Fighter, a: Attack, n: number): void {
  const e = keepOn(g, f, a, 'hagumi-michelle', '#ff8fd4', { follow: undefined }, .3);
  e.x = a.anchor;
  e.y = FLOOR;
  e.n = n;
}
SCRIPTS['hagumi-michelle'] = Object.assign(SCRIPTS['hagumi-michelle'] ?? {}, { update: step_michelle, customDash: true, noMelee: true });

/* ---- L 可乐饼盛情难却 ---- */

/** The patch the croquettes rain on: centred on the nearest body ahead (or this far ahead), this wide either side. */
const FEAST_AHEAD = 360;
const FEAST_LOOK = 760;
const FEAST_HALF = 165;
/** Each drop holds whoever it hit this long: a little past the gap, so the rain keeps them in the patch. */
const FEAST_HOLD = .4;
const feastParts = new WeakMap<Skill, { drop: Skill; giant: Skill }>();
/** 可乐饼盛情难却 (B 站「面对可乐饼轰炸而感到盛情难却的丰川祥子」、「育美又搞可乐饼大派送了」、万物皆可做成可乐饼):
 *  北泽精肉店's striped awning drops in over the stage and the light goes warm; she throws both arms up — and
 *  croquettes rain on a patch ahead of her, HAGUMI_FEAST.drops hits that hold whoever stands in it (air or not),
 *  then a giant croquette falls on them and buries them under a pile (knocked down). Walking out of the patch dodges
 *  the rain; a guard holds it (削防 ramps through the plan). 霸体 throughout.
 *  a.anchor is the patch's centre; a.shots the hits landed so far (drops, then the giant). */
function step_feast(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  keepOn(g, f, a, 'hagumi-shop', ORANGE, { follow: undefined, x: 480, y: 0 }, .45);
  if (a.t < s.start) return;
  const parts = derive(feastParts, s, k => ({
    // Quiet: the rain holds them itself (below), so the drops do not count into the combo and the giant one lands
    // at full weight.
    drop: { ...k, finale: undefined, knock: 0, react: { kind: 'none' as const } },
    giant: { ...k, ...k.finale, finale: undefined },
  }));
  if (a.mode === undefined) {
    a.mode = 1;
    const o = foeAhead(g, f, FEAST_LOOK);
    a.anchor = clamp(o ? o.x : f.x + f.facing * FEAST_AHEAD, X_MIN + FEAST_HALF * .6, X_MAX - FEAST_HALF * .6);
    a.shots = 0;
    g.audio.play('super', f.id);
  }
  const at = feastTimes(s);
  if (a.t < at.rainEnd + .1) {
    const rain = keepOn(g, f, a, 'hagumi-rain', GOLD, { follow: undefined, x: a.anchor, y: FLOOR, radius: FEAST_HALF }, .4);
    rain.x = a.anchor;
    rain.age = a.t - s.start;
  }
  while (a.shots < HAGUMI_FEAST.drops && a.t >= s.start + (a.shots + 1) * HAGUMI_FEAST.gap) {
    const i = a.shots++;
    a.hit = new Set();
    for (const o of foes(g, f)) {
      if (Math.abs(o.x - a.anchor) > FEAST_HALF + 20) continue;
      const blocking = o.blocking && o.guard > 0;
      if (hit(g, f, o, withGuard(parts.drop, i), a, a.anchor)) {
        if (!blocking && !isInvulnerable(o)) {
          o.stun = Math.max(o.stun, FEAST_HOLD);
          o.vx = 0;
          o.attack = null;
          retainEscape(o, true);
        }
        g.effect('hagumi-bonk', o.x + (i % 2 ? 14 : -14), o.y - headOf(o) - 6, GOLD, .4, { n: i, dir: f.facing });
      }
    }
  }
  if (a.shots === HAGUMI_FEAST.drops && a.t >= at.giant - HAGUMI_FEAST.fall && !a.liftAt) {
    // The giant one starts falling; it lands on the body nearest the patch's middle.
    a.liftAt = a.t;
    let best: Fighter | undefined;
    for (const o of foes(g, f)) if (Math.abs(o.x - a.anchor) <= FEAST_HALF + 20 && (!best || Math.abs(o.x - a.anchor) < Math.abs(best.x - a.anchor))) best = o;
    a.hold = best ? best.id : -1;
    a.burst = best ? best.x : a.anchor;
    g.effect('hagumi-giant', a.burst, FLOOR, GOLD, HAGUMI_FEAST.fall + .5, { radius: FEAST_HALF, t0: HAGUMI_FEAST.fall });
  }
  if (a.shots === HAGUMI_FEAST.drops && a.t >= at.giant) {
    a.shots++;
    a.hit = new Set();
    const x = a.burst || a.anchor;
    for (const o of foes(g, f)) {
      if (Math.abs(o.x - x) > FEAST_HALF + 20) continue;
      const blocking = o.blocking && o.guard > 0;
      if (hit(g, f, o, withGuard(parts.giant, HAGUMI_FEAST.drops), a, x) && !blocking && !isInvulnerable(o)) {
        g.effect('hagumi-pile', o.x, FLOOR, GOLD, 1.2, { follow: o.id, ox: 0, oy: 0, radius: headOf(o) });
      }
    }
    g.effect('hagumi-thud', x, FLOOR, GOLD, .6, { radius: FEAST_HALF });
    g.shake = Math.max(g.shake, 12);
    g.flash = Math.max(g.flash, .1);
  }
}
SCRIPTS['hagumi-feast'] = Object.assign(SCRIPTS['hagumi-feast'] ?? {}, { update: step_feast, noMelee: true, skipVolley: true, skipCount: true });
