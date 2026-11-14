import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame } from './game.ts';
import { FLOOR, H, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS } from './scripts.ts';
import {
  TOMOE_KABEDON, TOMOE_KABEDON_LUNGE, TOMOE_KABEDON_TAIL, TOMOE_MIKOSHI, TOMOE_MIKOSHI_CHARGE, TOMOE_MIKOSHI_TAIL,
  TOMOE_RAM_GAP, TOMOE_SNEAK, TOMOE_SNEAK_TIME, TOMOE_TOSS,
} from '../render/clips.ts';

/* 宇田川巴（萌娘百科）— Afterglow 的鼓手，别号 soiya / 巴姐 / 豚骨酱油拉面大姐；有胸的帅哥、AG 团爸爸、商店街祭典打和太鼓。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     tomoe-mask     U 火男面具·潜入   the hyottoko mask, a sneak she cannot be touched in, a punch from behind
     tomoe-kabedon  I 这句话要听多少遍 a hand on the wall behind them; their heart skips (定身, 'tomoe-heart')
     tomoe-scold    O 爱之深，责之切   a roar that pushes them off and cuts their damage (削弱), then a deep bow
     tomoe-mikoshi  L 嘿哟！神轿出巡   lanterns up, the shrine on her shoulder, three rams to the wall, the uppercut
   Shared numbers and the cell picks live in clips.ts, every picture in render/tomoeFx.ts. Anything that rides on
   her (the mask, the shrine, the night) is kept alive by the move (keepOn), so a cut move loses it at once. */

const RED = '#BB0033';
const GOLD = '#ffd36a';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
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
/** Anything this far off the floor is over the move (jump it). */
const LOW_AIR = 90;
const grounded = (o: Fighter) => o.y >= FLOOR - LOW_AIR;

/* ---- U 火男面具·潜入 ---- */

/** She looks for a body this far ahead (either side counts once she is sneaking), and comes up this far behind it. */
const SNEAK_REACH = 460;
const BEHIND = 70;
/** Seen from behind: how far the punch reaches once she is there. */
const BACK_PUNCH_R = 120;
/** Where she would walk to with nobody to sneak up on. */
const SNEAK_EMPTY = 180;
function step_mask(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? TOMOE_SNEAK.mask;
  if (mode === TOMOE_SNEAK.mask) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('tomoe-mask-on', f.x + f.facing * 14, f.y - headOf(f) * .88, '#ffffff', .45, { dir: f.facing });
    }
    keepOn(g, f, a, 'tomoe-mask', '#f6e3c8', { oy: -headOf(f) * .88 });
    if (a.t < s.start) return;
    a.mode = TOMOE_SNEAK.sneak;
    a.tossAt = a.t;
    // Which way she goes is fixed now (a.shots), so the goal cannot flip sides once she passes them;
    // a.anchor is where she set off from.
    const o = foeAhead(g, f, SNEAK_REACH);
    a.hold = o ? o.id : -1;
    a.shots = f.facing;
    a.anchor = f.x;
    addMod(f, 'veil', TOMOE_SNEAK_TIME + .05, { tag: 'tomoe-sneak' });
    return;
  }
  if (mode === TOMOE_SNEAK.sneak) {
    keepOn(g, f, a, 'tomoe-mask', '#f6e3c8', { oy: -headOf(f) * .88 });
    keepOn(g, f, a, 'tomoe-sneak', '#ffffff', { oy: 0 });
    f.invuln = Math.max(f.invuln, .06);
    const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
    const side = a.shots || f.facing;
    const goal = clamp(o && o.hp > 0 ? o.x + side * BEHIND : a.anchor + side * SNEAK_EMPTY, X_MIN, X_MAX);
    const k = Math.min(1, (a.t - a.tossAt) / TOMOE_SNEAK_TIME);
    // Tiptoe there on an ease in and out.
    const e = k * k * (3 - 2 * k);
    f.x = clamp(a.anchor + (goal - a.anchor) * e, X_MIN, X_MAX);
    if (Math.floor(a.t * 10) !== Math.floor((a.t - dt) * 10)) g.effect('tomoe-step', f.x, FLOOR, '#ffffff', .5, { n: Math.floor(a.t * 10) });
    if (k < 1) return;
    f.x = goal;
    a.shots = 0;
    if (o && o.hp > 0) f.facing = (o.x >= f.x ? 1 : -1) as 1 | -1;
    a.mode = TOMOE_SNEAK.punch;
    a.liftAt = a.t;
    for (const e of g.effects) if (e.fighter === f.id && (e.type === 'tomoe-mask' || e.type === 'tomoe-sneak')) e.life = 0;
    g.effect('tomoe-mask-fly', f.x, f.y - headOf(f) * .88, '#f6e3c8', .7, { dir: -f.facing });
    // ポン！ She pops up behind them in a puff of smoke.
    g.effect('tomoe-pop', f.x, f.y - headOf(f) * .55, '#ffffff', .55);
    a.hit = new Set();
    let landed = false;
    for (const t of foes(g, f)) {
      const ahead = (t.x - f.x) * f.facing;
      if (ahead < -20 || ahead > BACK_PUNCH_R || !grounded(t)) continue;
      if (hit(g, f, t, s, a)) landed = true;
    }
    g.effect('tomoe-arc', f.x + f.facing * 60, f.y - 100, RED, .35, { dir: f.facing, hit: landed });
    if (landed) g.shake = Math.max(g.shake, 6);
    return;
  }
}
SCRIPTS['tomoe-mask'] = Object.assign(SCRIPTS['tomoe-mask'] ?? {}, { update: step_mask, customDash: true, noMelee: true });

/* ---- I 这句话要听多少遍 ---- */

/** She stands this close with her hand on the wall behind them. */
const KABEDON_REACH = 62;
function step_kabedon(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? TOMOE_KABEDON.lunge;
  if (mode === TOMOE_KABEDON.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && Math.abs(o.y - f.y) < 60 && !isInvulnerable(o)) {
      a.mode = TOMOE_KABEDON.held;
      a.hold = o.id;
      a.tossAt = a.t;
      f.x = clamp(o.x - f.facing * KABEDON_REACH, X_MIN, X_MAX);
      o.vx = 0; o.vy = 0; o.knocked = 0; o.attack = null;
      o.facing = (-f.facing) as 1 | -1;
      retainEscape(o);
      a.hit = new Set();
      const wasRooted = o.root > 0;
      if (hit(g, f, o, s, a) && !wasRooted && o.root > 0) {
        o.rootMark = 'tomoe-heart';
        g.effect('tomoe-heart@apply', o.x, o.y, RED, .6, { follow: o.id, ox: 0, oy: 0 });
      }
      const h = headOf(o);
      g.effect('tomoe-wall', o.x + f.facing * 34, FLOOR, RED, 1.2, { dir: f.facing, radius: h });
      g.effect('tomoe-manga', (f.x + o.x) / 2, FLOOR - h * .58, '#ff8fa8', 1.5, { dir: f.facing });
      g.effect('tomoe-shine', f.x, f.y - headOf(f) * .86, '#ffffff', .5, { follow: f.id, ox: f.facing * 10, oy: -headOf(f) * .86, dir: f.facing });
      g.hitstop = Math.max(g.hitstop, .06);
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 520) * dt, X_MIN, X_MAX);
    if (a.t >= s.start + TOMOE_KABEDON_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = TOMOE_KABEDON.done;
      a.t = Math.max(a.t, s.duration - TOMOE_KABEDON_TAIL);
    }
    return;
  }
  if (mode === TOMOE_KABEDON.held && a.t >= a.tossAt + .45) {
    a.mode = TOMOE_KABEDON.done;
    a.hold = -1;
    a.t = Math.max(a.t, s.duration - TOMOE_KABEDON_TAIL);
  }
}
SCRIPTS['tomoe-kabedon'] = Object.assign(SCRIPTS['tomoe-kabedon'] ?? {}, { update: step_kabedon, noMelee: true });

/* ---- O 爱之深，责之切 ---- */

const SCOLD_BACK = 40;
function emit_scold(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const h = headOf(f);
  g.effect('tomoe-crest', f.x - f.facing * 34, f.y - h * .74, RED, .95, { follow: f.id, ox: -f.facing * 34, oy: -h * .74, dir: f.facing, radius: h * .42 });
  g.effect('tomoe-roar', f.x + f.facing * 70, f.y - 90, RED, .5, { dir: f.facing, radius: s.range });
  g.shake = Math.max(g.shake, 6);
  a.hit = new Set();
  for (const o of foes(g, f)) {
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -SCOLD_BACK || ahead > s.range || !grounded(o)) continue;
    hit(g, f, o, s, a);
  }
  // Straight away she knows she went too far: the sweat, the bow, a few petals by way of sorry.
  g.effect('tomoe-bow', f.x, f.y, '#ffd0dc', s.duration - s.start, { follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: h, t0: .3 });
}
SCRIPTS['tomoe-scold'] = Object.assign(SCRIPTS['tomoe-scold'] ?? {}, { emit: emit_scold, noMelee: true });

/* ---- L 嘿哟！神轿出巡 ---- */

const MIKOSHI_SPEED = 620;
/** The shrine's front pole reaches this far ahead of her. */
const MIKOSHI_NOSE = 96;
const UPPER_R = 140;
const mikoshiParts = new WeakMap<Skill, { ram: Skill; last: Skill; upper: Skill; miss: Skill }>();
function partsOf(s: Skill) {
  let v = mikoshiParts.get(s);
  if (!v) {
    const upper: Skill = { ...s, ...s.finale, finale: undefined, noBlock: true };
    v = {
      ram: { ...s, finale: undefined, knock: 0, react: { kind: 'pin', stun: .5, holdStill: true } },
      last: { ...s, finale: undefined, knock: 0, noBlock: true, react: { kind: 'pin', stun: .5, holdStill: true } },
      upper,
      miss: { ...upper, damage: Math.round((upper.damage ?? 0) * .55) },
    };
    mikoshiParts.set(s, v);
  }
  return v;
}
function keepFestival(g: FightGame, f: Fighter, a: Attack): void {
  keepOn(g, f, a, 'tomoe-night', '#140a24', { follow: undefined, x: W / 2, y: H / 2 }, .35);
  keepOn(g, f, a, 'tomoe-lanterns', '#ff3b3b', { follow: undefined, x: W / 2, y: 0 }, .35);
  keepOn(g, f, a, 'tomoe-mikoshi', GOLD, { oy: -headOf(f) * .9 }).n = a.mode === TOMOE_MIKOSHI.carry ? 1 : 0;
}
function mikoshiToss(g: FightGame, f: Fighter, a: Attack): void {
  a.mode = TOMOE_MIKOSHI.toss;
  a.liftAt = a.t;
  const s = a.skill;
  const p = partsOf(s);
  const held = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  a.hit = new Set();
  let landed = false;
  if (held && held.hp > 0) landed = hit(g, f, held, p.upper, a);
  for (const o of foes(g, f)) {
    if (o === held) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > UPPER_R + MIKOSHI_NOSE || !grounded(o)) continue;
    if (hit(g, f, o, held ? p.upper : p.miss, a)) landed = true;
  }
  a.hold = -1;
  const x = clamp(f.x + f.facing * MIKOSHI_NOSE, X_MIN, X_MAX);
  g.effect('tomoe-upper', x, FLOOR - 150, RED, .5, { dir: f.facing, hit: landed });
  g.effect('tomoe-firework', clamp(x, 160, W - 160), 150, RED, 1.6, { hit: landed, t0: .2 });
  g.flash = Math.max(g.flash, landed ? .18 : .08);
  g.shake = Math.max(g.shake, landed ? 12 : 6);
}
/** a.mode walks TOMOE_MIKOSHI; a.hold the body on the poles; a.shots the rams. */
function step_mikoshi(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? TOMOE_MIKOSHI.lift;
  if (mode === TOMOE_MIKOSHI.lift) {
    keepFestival(g, f, a);
    if (a.t < s.start) return;
    a.mode = TOMOE_MIKOSHI.charge;
    a.tossAt = a.t;
    a.shots = 0;
    return;
  }
  if (mode === TOMOE_MIKOSHI.charge) {
    keepFestival(g, f, a);
    f.x = clamp(f.x + f.facing * MIKOSHI_SPEED * dt, X_MIN, X_MAX);
    if (Math.floor(a.t * 12) !== Math.floor((a.t - dt) * 12)) g.effect('tomoe-dust', f.x - f.facing * 30, FLOOR, '#e8d9c0', .4, { dir: f.facing });
    const o = foeAhead(g, f, MIKOSHI_NOSE + 20);
    if (o && grounded(o) && !isInvulnerable(o)) {
      a.mode = TOMOE_MIKOSHI.carry;
      a.hold = o.id;
      a.tossAt = a.t - TOMOE_RAM_GAP;
      a.shots = 0;
      o.attack = null;
      retainEscape(o, true);
      return;
    }
    const wall = f.facing > 0 ? f.x >= X_MAX : f.x <= X_MIN;
    if (a.t >= a.tossAt + TOMOE_MIKOSHI_CHARGE || wall) mikoshiToss(g, f, a);
    return;
  }
  if (mode === TOMOE_MIKOSHI.carry) {
    keepFestival(g, f, a);
    const o = g.fighterById(a.hold);
    if (!o || o.hp <= 0) { a.hold = -1; mikoshiToss(g, f, a); return; }
    f.x = clamp(f.x + f.facing * MIKOSHI_SPEED * .55 * dt, X_MIN, X_MAX);
    o.x = clamp(f.x + f.facing * MIKOSHI_NOSE, X_MIN, X_MAX);
    f.x = clamp(o.x - f.facing * MIKOSHI_NOSE, X_MIN, X_MAX);
    o.y = FLOOR; o.vx = 0; o.vy = 0; o.knocked = 0;
    o.stun = Math.max(o.stun, .4);
    o.facing = (-f.facing) as 1 | -1;
    const p = partsOf(s);
    while (a.shots < 3 && a.t >= a.tossAt + (a.shots + 1) * TOMOE_RAM_GAP) {
      const n = a.shots++;
      a.hit = new Set();
      hit(g, f, o, n === 2 ? p.last : p.ram, a);
      g.effect('tomoe-ram', o.x - f.facing * 20, o.y - 90, GOLD, .45, { dir: f.facing, n });
      g.effect('tomoe-confetti', f.x, f.y - headOf(f) * .9, GOLD, .9, { dir: f.facing, n });
      g.shake = Math.max(g.shake, 5 + n * 2);
      g.hitstop = Math.max(g.hitstop, .05);
    }
    if (a.shots >= 3 && a.t >= a.tossAt + 3 * TOMOE_RAM_GAP + TOMOE_TOSS) mikoshiToss(g, f, a);
    return;
  }
  if (mode === TOMOE_MIKOSHI.toss) {
    keepFestival(g, f, a);
    if (a.t >= a.liftAt + TOMOE_TOSS * 2) {
      a.mode = TOMOE_MIKOSHI.done;
      a.t = Math.max(a.t, s.duration - TOMOE_MIKOSHI_TAIL);
    }
    return;
  }
  keepFestival(g, f, a);
}
SCRIPTS['tomoe-mikoshi'] = Object.assign(SCRIPTS['tomoe-mikoshi'] ?? {}, { update: step_mikoshi, customDash: true, noMelee: true, skipCount: true, noSuperFx: true });
