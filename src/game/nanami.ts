import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, withGuard } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { SCRIPTS } from './scripts.ts';
import {
  NANAMI_BUSH, NANAMI_BUSH_CREEP, NANAMI_BUSH_TAIL, NANAMI_CLAW, NANAMI_CLAW_DROP, NANAMI_CLAW_FALL, NANAMI_CLAW_HANG,
  NANAMI_CLAW_LIFT, NANAMI_COLOR, NANAMI_FOUR, NANAMI_GENIUS_TIME, NANAMI_PAINT_CANVAS, NANAMI_PAINT_FINAL,
  NANAMI_PAINT_PIN, NANAMI_PAINT_STROKES,
} from '../render/clips.ts';

/* 广町七深 — Morfonica 的贝斯，装成普通人的天才。全部空手，不拿贝斯。
   J / K 普普通通 / 这很普通吧: plain on purpose; after the super they stop pretending (全是 GOOD).
   U 只是普通地路过: a bush creeping along the floor (she hid in the grass the first time we met her), then the jump-out scare.
   I 一发命中，很普通吧？: a crane-game claw drops on whoever stands on the shadow, lifts them, lets go. Not ordinary at all.
   O 我说了什么奇怪的话吗？: eyes closed, head tilted, a slow string of pink bubbles — whoever it reaches is 混乱.
   L 不再假装普通: the cat hairpin off (猫かぶり), four strokes in the others' colours, her own to finish — a butterfly.
   藏不住了: every U / I / O that lands lets a little of the act slip (one layer, three at most). The super spends them all:
   the butterfly grows with each, and only a full act dropped makes it unblockable, screen-wide and leaves 全是 GOOD. */

const ORANGE = NANAMI_COLOR;

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- J / K: 全是 GOOD ---- */

export const GENIUS_TAG = 'nanami-genius';
const GENIUS_DMG = .15;
export function isGenius(f: Fighter): boolean {
  return f.mods.some(m => m.kind === 'look' && m.tag === GENIUS_TAG && m.left > 0);
}
const boosted = new WeakMap<Skill, Skill>();
const boostedCopies = new WeakSet<Skill>();
function boostOf(s: Skill): Skill {
  let v = boosted.get(s);
  if (!v) {
    v = { ...s, damage: s.damage * (1 + GENIUS_DMG) };
    boosted.set(s, v);
    boostedCopies.add(v);
  }
  return v;
}
/** Before the active frame, a genius J / K swings the boosted copy. */
function step_jk(_g: FightGame, f: Fighter, a: Attack): void {
  if (a.emitted || a.skill.air || boostedCopies.has(a.skill) || !isGenius(f)) return;
  a.skill = boostOf(a.skill);
}
function flash_jk(g: FightGame, f: Fighter, a: Attack): void {
  const genius = isGenius(f);
  g.effect('nanami-jk', f.x + f.facing * a.skill.range * .62, f.y - 86, ORANGE, genius ? .42 : .2, {
    dir: f.facing, n: genius ? 1 : 0, heavy: a.index === 1, hit: a.hit.size > 0, radius: a.skill.range * .45,
  });
}
SCRIPTS['nanami-jk'] = { update: step_jk, flash: flash_jk };

/* ---- 藏不住了 ---- */

export const TELL_TAG = 'nanami-tell';
export const TELL_MAX = 3;
/** The layers she has let slip so far. */
export function tellOf(f: Fighter): number {
  const m = f.mods.find(x => x.kind === 'look' && x.tag === TELL_TAG && x.left > 0);
  return m ? m.v ?? 0 : 0;
}
/** The count rides in the mark too (nanami-tell1..3): a guest copies the mark, not v. */
function setTell(f: Fighter, n: number): void {
  if (n <= 0) { clearMod(f, 'look', TELL_TAG); return; }
  addMod(f, 'look', 999, { tag: TELL_TAG, v: n, mark: TELL_TAG + n });
}
/** A U / I / O landed: one more layer, and a drop of real paint slips out where she stands. */
function slip(g: FightGame, f: Fighter): void {
  const n = tellOf(f);
  if (n >= TELL_MAX) return;
  setTell(f, n + 1);
  g.effect('nanami-jk', f.x - f.facing * 6, f.y - headOf(f) * .62, ORANGE, .42, { dir: f.facing, n: 1, hit: true, radius: 22 });
}

/* ---- U 只是普通地路过 ---- */

/** She jumps out when a body is this close ahead; the scare reaches this far and only the floor. */
const BUSH_NEAR = 64;
const BUSH_AIR = 40;
function popBush(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.mode = NANAMI_BUSH.pop;
  // The bush was the armour: out of it she is as soft as anyone.
  a.endure = 0;
  a.t = Math.max(a.t, s.duration - NANAMI_BUSH_TAIL);
  const h = headOf(f);
  g.effect('nanami-leaves', f.x, FLOOR, '#7fbf5a', .7, { dir: f.facing, radius: h });
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > s.range || o.y < FLOOR - BUSH_AIR) continue;
    a.hit.clear();
    const was = o.root > 0;
    if (!hit(g, f, o, s, a)) continue;
    slip(g, f);
    if (!was && o.root > 0) {
      o.rootMark = 'nanami-fright';
      g.effect('nanami-fright@apply', o.x, o.y, ORANGE, .6, { follow: o.id, ox: 0, oy: 0 });
    }
  }
}
/** hitFlash on the last tick: a fresh rise is a strike the bush just took (holdEndure keeps her standing). */
const bushFlash = new WeakMap<Attack, number>();
/** Strikes the bush has eaten; on this many she jumps out right there. */
const bushPokes = new WeakMap<Attack, number>();
const BUSH_POKES = 3;
function step_bush(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? NANAMI_BUSH.creep;
  const flash = f.hitFlash, before = bushFlash.get(a) ?? flash;
  bushFlash.set(a, flash);
  if (mode !== NANAMI_BUSH.creep) return;
  // Poked in the bush: it eats up to three; on the third she jumps out right there — the one hiding scares the one poking.
  if (flash > before && a.t >= s.start) {
    const n = (bushPokes.get(a) ?? 0) + 1;
    bushPokes.set(a, n);
    g.effect('nanami-leaves', f.x, FLOOR, '#7fbf5a', .4, { dir: f.facing, radius: headOf(f) * .5 });
    if (n >= BUSH_POKES) { popBush(g, f, a); return; }
  }
  if (a.t < s.start) return;
  if (!a.emitted) {
    a.emitted = true;
    // The bush is bound to the creep (cast.mode): set the mode, an unset one never matches and drops the bush at once.
    a.mode = NANAMI_BUSH.creep;
    g.effect('nanami-bush', f.x, f.y, '#7fbf5a', NANAMI_BUSH_CREEP + .1, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f), fighter: f.id, cast: { serial: a.serial, mode: NANAMI_BUSH.creep, tail: 0 },
    });
  }
  f.x = clamp(f.x + f.facing * (s.speed ?? 170) * dt, X_MIN, X_MAX);
  const o = foeAhead(g, f, BUSH_NEAR);
  if ((o && o.y >= FLOOR - BUSH_AIR) || a.t >= s.start + NANAMI_BUSH_CREEP || f.x <= X_MIN || f.x >= X_MAX) popBush(g, f, a);
}
SCRIPTS['nanami-bush'] = { update: step_bush, customDash: true, noMelee: true, hideWhile: (a: Attack) => a.t >= a.skill.start && (a.mode ?? 0) === NANAMI_BUSH.creep };

/* ---- I 一发命中，很普通吧？ ---- */

/** The claw catches whoever is this close to the shadow when it lands; it lands on the nearest foe ahead, or this far out. */
const CLAW_CATCH = 64;
const CLAW_EMPTY = 220;
/** Recovery left after an empty grab. */
const CLAW_WHIFF = .5;
const claws = new WeakMap<Attack, Effect>();
function clawEffect(_g: FightGame, a: Attack): Effect | undefined {
  const e = claws.get(a);
  return e && e.life > 0 ? e : undefined;
}
/** a.anchor is the shadow's x; a.tossAt the catch time; a.hold the caught body. */
function step_claw(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? NANAMI_CLAW.aim;
  if (a.t < s.start) return;
  if (!a.emitted) {
    a.emitted = true;
    const o = foeAhead(g, f, s.range);
    a.anchor = o ? o.x : clamp(f.x + f.facing * CLAW_EMPTY, X_MIN, X_MAX);
    g.effect('nanami-mark', a.anchor, FLOOR, ORANGE, NANAMI_CLAW_DROP + NANAMI_CLAW_FALL + .1, { radius: CLAW_CATCH });
    claws.set(a, g.effect('nanami-claw', a.anchor, FLOOR, ORANGE, NANAMI_CLAW_DROP + NANAMI_CLAW_FALL + NANAMI_CLAW_HANG + .9, {
      t0: NANAMI_CLAW_DROP, n: 0, radius: 181,
    }));
    return;
  }
  const land = s.start + NANAMI_CLAW_DROP + NANAMI_CLAW_FALL;
  if (mode === NANAMI_CLAW.aim) {
    if (a.t < land) return;
    const e = clawEffect(g, a);
    let caught: Fighter | undefined;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
      if (Math.abs(o.x - a.anchor) > CLAW_CATCH) continue;
      if (!caught || Math.abs(o.x - a.anchor) < Math.abs(caught.x - a.anchor)) caught = o;
    }
    if (!caught) {
      // Nothing between the prongs: it closes on air and goes back up. She is left at the controls a short while.
      a.mode = NANAMI_CLAW.done;
      a.t = Math.max(a.t, s.duration - CLAW_WHIFF);
      if (e) e.n = 2;
      return;
    }
    a.mode = NANAMI_CLAW.held;
    a.hold = caught.id;
    a.tossAt = a.t;
    caught.vx = 0; caught.vy = 0; caught.knocked = 0; caught.attack = null;
    caught.stun = Math.max(caught.stun, .4);
    retainEscape(caught);
    if (e) { e.n = 1; e.follow = caught.id; e.ox = 0; e.oy = 0; e.radius = headOf(caught); }
    g.hitstop = Math.max(g.hitstop, .05);
    return;
  }
  if (mode !== NANAMI_CLAW.held) return;
  const o = g.fighterById(a.hold);
  const e = clawEffect(g, a);
  if (!o || o.hp <= 0 || isInvulnerable(o)) {
    a.mode = NANAMI_CLAW.done;
    if (e) { e.n = 2; e.follow = undefined; }
    return;
  }
  const k = clamp((a.t - a.tossAt) / (NANAMI_CLAW_HANG * .5), 0, 1);
  o.x = clamp(a.anchor + Math.sin((a.t - a.tossAt) * 22) * 3 * k, X_MIN, X_MAX);
  o.y = FLOOR - NANAMI_CLAW_LIFT * (1 - (1 - k) ** 2);
  o.vx = 0; o.vy = 0; o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  if (a.t < a.tossAt + NANAMI_CLAW_HANG) return;
  // Let go: they drop out of the claw onto the floor.
  a.mode = NANAMI_CLAW.done;
  a.hit.clear();
  if (hit(g, f, o, s, a)) slip(g, f);
  if (e) { e.n = 3; e.follow = undefined; e.y = FLOOR; e.t0 = e.max - e.life; }
  g.shake = Math.max(g.shake, 5);
}
SCRIPTS['nanami-claw'] = { update: step_claw, noMelee: true, placesHold: [NANAMI_CLAW.held] };

/* ---- O 我说了什么奇怪的话吗？ ---- */
// A plain projectile: the kernel spawns it, lays the 混乱 on a clean hit; the bubbles are drawn in nanamiFx.ts.
// A clean hit (the gate the 混乱 rides on) lets one layer slip.
SCRIPTS['nanami-weird'] = {
  trail: 0,
  hitStatus(g, _target, list, attacker) {
    if (attacker) slip(g, attacker);
    return list;
  },
};

/* ---- L 不再假装普通 ---- */

const STROKE_AIR = 100;
/** The butterfly: base damage from the data (finale), plus this per layer spent. Full layers reach this far. */
const WING_PER_TELL = 25;
const WING_FULL_RANGE = 520;
/** The guard chip of a butterfly painted before the act is fully dropped: it stays blockable. */
const WING_SOFT_GUARD = 22;
const PAINT_BACK = 40;
function paintHit(g: FightGame, f: Fighter, a: Attack, skill: Skill, air: number): void {
  a.hit.clear();
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -PAINT_BACK || ahead > skill.range || o.y < FLOOR - air) continue;
    hit(g, f, o, skill, a);
  }
}
const paintParts = new WeakMap<Skill, Skill[][]>();
/** One list per layer count: four strokes, then the butterfly that layer count paints. */
function partsOf(s: Skill, tell: number): Skill[] {
  let v = paintParts.get(s);
  if (!v) {
    const strokes = NANAMI_PAINT_STROKES.map((_, i) => withGuard({ ...s, finale: undefined }, i));
    v = [];
    for (let n = 0; n <= TELL_MAX; n++) {
      const base = { ...s, ...s.finale, finale: undefined };
      const wing: Skill = n >= TELL_MAX
        ? { ...base, damage: (base.damage ?? 0) + WING_PER_TELL * n, range: WING_FULL_RANGE, noBlock: true, guardDmg: undefined, guardPlan: undefined }
        : { ...withGuard(base, NANAMI_PAINT_STROKES.length), damage: (base.damage ?? 0) + WING_PER_TELL * n, guardDmg: WING_SOFT_GUARD };
      v.push([...strokes, wing]);
    }
    paintParts.set(s, v);
  }
  return v[clamp(tell, 0, TELL_MAX)];
}
/** The layers this cast spent (read and cleared on the first frame). */
const spent = new WeakMap<Attack, number>();
/** a.shots is the next beat: 0..3 the strokes, 4 the butterfly. */
function step_paint(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const h = headOf(f);
  if (!spent.has(a)) {
    spent.set(a, tellOf(f));
    setTell(f, 0);
  }
  const tell = spent.get(a)!;
  if (!a.emitted && a.t >= NANAMI_PAINT_PIN) {
    a.emitted = true;
    g.effect('nanami-pin', f.x + f.facing * 8, f.y - h * .9, ORANGE, .9, { dir: f.facing });
  }
  if (a.liftAt === 0 && a.t >= NANAMI_PAINT_CANVAS) {
    a.liftAt = a.t;
    g.effect('nanami-canvas', f.x - f.facing * 30, FLOOR, ORANGE, s.duration - NANAMI_PAINT_CANVAS + .5, {
      dir: f.facing, radius: h, fighter: f.id, t0: NANAMI_PAINT_CANVAS,
    });
  }
  const parts = partsOf(s, tell);
  while (a.shots < parts.length) {
    const i = a.shots;
    const at = i < NANAMI_PAINT_STROKES.length ? NANAMI_PAINT_STROKES[i] : NANAMI_PAINT_FINAL;
    if (a.t < at) break;
    a.shots++;
    // 霸体 only holds while the pin comes off and the easel goes up: from the first stroke a hit can stop her.
    if (i === 0) a.endure = 0;
    if (i < NANAMI_PAINT_STROKES.length) {
      g.effect('nanami-stroke', f.x + f.facing * 26, FLOOR, NANAMI_FOUR[i], .75, { dir: f.facing, n: i, radius: s.range });
      paintHit(g, f, a, parts[i], STROKE_AIR);
      g.shake = Math.max(g.shake, 3);
      continue;
    }
    const full = tell >= TELL_MAX;
    g.effect('nanami-butterfly', f.x + f.facing * 40, FLOOR - h * .55, ORANGE, 1.6, { dir: f.facing, radius: parts[i].range * (full ? 1 : .8) });
    paintHit(g, f, a, parts[i], full ? Infinity : STROKE_AIR);
    g.flash = Math.max(g.flash, .06);
    g.shake = Math.max(g.shake, 10);
    g.hitstop = Math.max(g.hitstop, .07);
  }
  if (a.mode !== 1 && a.t >= s.duration - .05) {
    a.mode = 1;
    if (tell >= TELL_MAX) addMod(f, 'look', NANAMI_GENIUS_TIME, { tag: GENIUS_TAG, mark: 'nanami-genius' });
  }
}
SCRIPTS['nanami-paint'] = { update: step_paint, noMelee: true };
