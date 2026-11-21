import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, spawnShot, withFinale } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS, SLOT_TINTS, STEP_WATCHERS } from './scripts.ts';
import {
  MAYA_BOW, MAYA_CONSOLE_X, MAYA_SCARE, MAYA_SHOW, MAYA_SHOW_BEATS, MAYA_SHOW_TAIL, MAYA_TALK, MAYA_TALK_BEATS,
  MAYA_TALK_SPAN, MAYA_TALK_TAIL,
} from '../render/clips.ts';

/* 大和麻弥（萌娘百科）— Pastel*Palettes 的鼓手，别号狂乱的器材宅 / 12321；笑声「呼嘿嘿」，被千圣禁止后是「哦吼吼」；
   事务所技术人员出身、学校演艺部的后台技术担当；怕狗。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     maya-laugh    U 双调怪笑       odd casts: a shivering wave that roots ('maya-shiver'); even casts: the 哦吼吼 fan, knockdown
     maya-lecture  I 器材宅讲座     a grab; talked at for two seconds, five ticks, then 沉默 ('maya-gearhead')
     maya-leo      O 金毛惊魂       Leo runs out along the floor, she leaps back (invuln on the jump), lands and bows
     maya-show     L 幕后演出·全开  the console; a bass wave checks for a body, then beams, lasers, CO2 and the spark fall
   The odd / even count is the 'laugh' mod (v = casts so far), so a lockstep dump resumes it. Shared numbers and the
   cell picks live in clips.ts, every picture in render/mayaFx.ts. */

const GREEN = '#99DD88';
const PINK = '#ffa8c8';
const GOLD = '#ffd77a';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
const KEEP = .12;
function keepOn(g: FightGame, f: Fighter, type: string, color: string, extra: Partial<Effect> = {}, life = KEEP): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, f.x, f.y, color, life, { ...extra, fighter: f.id });
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  return e;
}
function* foes(g: FightGame, f: Fighter): Generator<Fighter> {
  for (const o of g.fighters) if (g.isEnemy(f, o) && o.hp > 0 && !o.echo) yield o;
}
/** Anything this far off the floor is over the move (jump it). */
const LOW_AIR = 90;
const grounded = (o: Fighter) => o.y >= FLOOR - LOW_AIR;

/* ---- U 双调怪笑 ---- */

/** Casts so far this round; odd is 呼嘿嘿, even is 哦吼吼. */
export function laughCount(f: Fighter): number {
  return f.mods.find(m => m.kind === 'laugh' && m.left > 0)?.v ?? 0;
}
/** The next U is the 哦吼吼 one. The movelist border reads this. */
export function nextLaughIsOhoho(f: Fighter): boolean {
  return laughCount(f) % 2 === 1;
}
/** 哦吼吼: a short wide fan in front of her. */
const FAN_R = 210;
const ohohoParts = new WeakMap<Skill, Skill>();
function ohohoOf(s: Skill): Skill {
  let v = ohohoParts.get(s);
  if (!v) {
    v = { ...s, damage: 24, root: undefined, knock: 300, react: { kind: 'knockdown', vy: -220, knocked: .6 } };
    ohohoParts.set(s, v);
  }
  return v;
}
function emit_laugh(g: FightGame, f: Fighter, a: Attack): void {
  const n = laughCount(f) + 1;
  addMod(f, 'laugh', 999, { v: n });
  const h = headOf(f);
  g.effect('maya-glint', f.x + f.facing * 14, f.y - h * .86, '#ffffff', .4, { follow: f.id, ox: f.facing * 14, oy: -h * .86, dir: f.facing });
  if (n % 2 === 1) {
    a.mode = 0;
    spawnShot(g, f, a);
    return;
  }
  a.mode = 1;
  const s = ohohoOf(a.skill);
  g.effect('maya-ohoho', f.x + f.facing * 30, f.y - h * .62, PINK, .55, { dir: f.facing, radius: FAN_R });
  a.hit = new Set();
  for (const o of foes(g, f)) {
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > FAN_R || !grounded(o)) continue;
    hit(g, f, o, s, a);
  }
}
SCRIPTS['maya-laugh'] = {
  emit: emit_laugh,
  noMelee: true,
  // The wave hangs at chest height and wobbles a little; a jump clears it.
  hitY: 64,
  shot(g: FightGame, p: Projectile): boolean {
    p.y = FLOOR - 95 + Math.sin(p.age * 18) * 4;
    return false;
  },
};

/** The movelist row and the touch key say which laugh is next: green 呼嘿嘿, pink 哦吼吼. */
SLOT_TINTS['maya-laugh'] = f => nextLaughIsOhoho(f) ? PINK : GREEN;

/* ---- I 器材宅讲座 ---- */

/** She holds them this close while she talks. */
const TALK_REACH = 70;
function letGo(g: FightGame, f: Fighter, a: Attack, o?: Fighter): void {
  for (const e of g.effects) if (e.fighter === f.id && (e.type === 'maya-orbit' || e.type === 'maya-chatter')) e.life = Math.min(e.life, .15);
  if (o && o.hp > 0) g.effect('maya-steam', o.x, o.y - headOf(o), '#ffffff', 1, { follow: o.id, ox: 0, oy: -headOf(o) });
  a.mode = MAYA_TALK.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - MAYA_TALK_TAIL);
}
function step_lecture(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? MAYA_TALK.lunge;
  if (mode === MAYA_TALK.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (!o || !grounded(o) || isInvulnerable(o)) {
      a.mode = MAYA_TALK.done;
      a.t = Math.max(a.t, s.duration - MAYA_TALK_TAIL - .05);
      return;
    }
    a.mode = MAYA_TALK.held;
    a.hold = o.id;
    a.tossAt = a.t;
    a.shots = 0;
    o.attack = null;
    retainEscape(o, true);
    const oh = headOf(o), h = headOf(f);
    g.effect('maya-orbit', o.x, o.y - oh - 26, GREEN, MAYA_TALK_SPAN + .2, { follow: o.id, ox: 0, oy: -oh - 26, fighter: f.id });
    // The talk itself: a dense chattering wave from her mouth to their head (both are held still, so the offset holds).
    g.effect('maya-chatter', f.x + f.facing * 22, f.y - h * .8, GREEN, MAYA_TALK_SPAN + .2, {
      follow: f.id, ox: f.facing * 22, oy: -h * .8, dir: f.facing, fighter: f.id,
      tx: f.facing * (TALK_REACH - 22 - 8), ty: (FLOOR - oh * .78) - (FLOOR - h * .8),
    });
    g.effect('maya-sparkle-eyes', f.x + f.facing * 10, f.y - h * .86, '#ffffff', MAYA_TALK_SPAN, { follow: f.id, ox: f.facing * 10, oy: -h * .86, dir: f.facing, fighter: f.id });
    g.hitstop = Math.max(g.hitstop, .04);
    return;
  }
  if (mode !== MAYA_TALK.held) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0) { letGo(g, f, a, o); return; }
  o.x = clamp(f.x + f.facing * TALK_REACH, X_MIN, X_MAX);
  f.x = clamp(o.x - f.facing * TALK_REACH, X_MIN, X_MAX);
  o.y = FLOOR; o.vx = 0; o.vy = 0; o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  o.facing = (-f.facing) as 1 | -1;
  while (a.shots < MAYA_TALK_BEATS.length && a.t >= a.tossAt + MAYA_TALK_BEATS[a.shots]) {
    const i = a.shots++;
    const last = i === MAYA_TALK_BEATS.length - 1;
    a.hit = new Set();
    // Only the last tick carries the 沉默, so it runs its full length after she lets go.
    hit(g, f, o, last ? s : { ...s, status: undefined }, a);
    g.effect('maya-tick', o.x, o.y - headOf(o) - 26, GREEN, .35, { n: i });
  }
  if (a.t >= a.tossAt + MAYA_TALK_SPAN) letGo(g, f, a, o);
}
SCRIPTS['maya-lecture'] = { update: step_lecture, noMelee: true, skipCount: true, placesHold: [MAYA_TALK.held] };

/* ---- O 金毛惊魂 ---- */

/** The startled leap: straight up and back. */
const LEAP_VY = -480;
const LEAP_VX = 1700;
/** Leo comes out from behind her and runs ahead along the floor. */
const LEO_FLOOR = 44;
function releaseLeo(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const speed = s.speed ?? 640;
  const skill: Skill = { ...s, type: 'projectile', fx: 'maya-leo-dog', invuln: undefined };
  g.projectiles.push({
    owner: f.id,
    x: clamp(f.x - f.facing * 30, X_MIN - 60, X_MAX + 60),
    y: FLOOR - LEO_FLOOR,
    vx: f.facing * speed,
    vy: 0,
    life: s.life ?? 1.4,
    skill,
    color: '#e0a64a',
    radius: 26,
    size: s.size ?? 80,
    fx: 'maya-leo-dog',
    attack: a,
    hit: new Set(),
    trail: [],
    age: 0,
  });
  g.effect('maya-bark', f.x - f.facing * 20, f.y - 70, '#ffffff', .45, { dir: f.facing });
}
function step_leo(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? MAYA_SCARE.startle;
  if (mode === MAYA_SCARE.startle) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('maya-startle', f.x, f.y - headOf(f) - 10, '#ffffff', .5, { follow: f.id, ox: 0, oy: -headOf(f) - 10, dir: f.facing });
    }
    if (a.t < s.start) return;
    a.mode = MAYA_SCARE.leap;
    a.tossAt = a.t;
    releaseLeo(g, f, a);
    f.vy = LEAP_VY;
    f.vx = -f.facing * LEAP_VX;
    return;
  }
  if (mode === MAYA_SCARE.leap) {
    if (a.t - a.tossAt > .1 && f.y >= FLOOR - .5) {
      a.mode = MAYA_SCARE.bow;
      a.liftAt = a.t;
      f.vx = 0;
      g.effect('maya-sweat', f.x, f.y - headOf(f) * .8, '#bfe6ff', MAYA_BOW + .2, { follow: f.id, ox: f.facing * 18, oy: -headOf(f) * .8, dir: f.facing });
      return;
    }
    // Hold the pose open until she lands, however long the arc is.
    a.t = Math.min(a.t, s.duration - MAYA_BOW - .02);
    return;
  }
  if (mode === MAYA_SCARE.bow && a.t >= a.liftAt + MAYA_BOW) {
    a.mode = MAYA_SCARE.done;
    a.t = s.duration;
  }
}
SCRIPTS['maya-leo'] = { update: step_leo, customDash: true, noMelee: true };
SCRIPTS['maya-leo-dog'] = {
  hitY: 72,
  pulse(g: FightGame, p: Projectile, target: Fighter): void {
    g.effect('maya-pounce', target.x, FLOOR - 60, '#ffe6b0', .5, { dir: Math.sign(p.vx) || 1 });
    // Leo does not stop to look: he trots off the stage wagging.
    g.effect('maya-leo-off', p.x, FLOOR - LEO_FLOOR, '#e0a64a', 1.1, { dir: Math.sign(p.vx) || 1 });
  },
};

/* ---- L 幕后演出·全开 ---- */

/** The opening thump: early in the trot a ring of sound shoves everyone near her back. It does not hold them —
 *  they recover in REPEL_STUN, and a guard put up straight away is in time for the bass wave. */
const REPEL_AT = .08;
const REPEL_R = 240;
const REPEL_STUN = .3;
const REPEL_PUSH = 1600;
/** She trots this far up to the console before the faders go up. */
const WALK = 46;
/** The bass wave runs along the floor this fast, from the console. */
const WAVE_SPEED = 950;
const showParts = new WeakMap<Skill, { repel: Skill; wave: Skill; beat: Skill; co2: Skill; last: Skill }>();
function partsOf(s: Skill) {
  let v = showParts.get(s);
  if (!v) {
    // The beats in between are quiet (react 'none'): no combo count, so no combo escape halfway through the show;
    // the move itself keeps them pinned.
    const beat: Skill = { ...s, finale: undefined, guardDmg: undefined, noBlock: true, react: { kind: 'none', stun: 0 } };
    v = {
      repel: {
        ...s, finale: undefined, guardDmg: undefined, damage: 4, gain: 0, noBlock: true, knock: REPEL_PUSH,
        react: { kind: 'stand', stun: REPEL_STUN },
      },
      wave: { ...s, finale: undefined, react: { kind: 'pin', stun: .5, holdStill: true } },
      beat,
      co2: { ...beat, status: [{ kind: 'chill', time: 1.5 }] },
      last: { ...withFinale(s, true), guardDmg: undefined, noBlock: true },
    };
    showParts.set(s, v);
  }
  return v;
}
/** The cue for beat i: 0–1 beams, 2–4 lasers, 5–6 CO2, 7 the spark fall. */
function cue(i: number): 'beam' | 'laser' | 'co2' | 'spark' {
  return i < 2 ? 'beam' : i < 5 ? 'laser' : i < 7 ? 'co2' : 'spark';
}
/** a.liftAt is the attack time of the last beat (the wave going out, then every cue), so the stage wave can pump on it. */
function keepStage(g: FightGame, f: Fighter, a: Attack): void {
  keepOn(g, f, 'maya-dim', '#05060a', { x: W / 2, y: 0 }, .35);
  const wave = keepOn(g, f, 'maya-stagewave', GREEN, { x: W / 2, y: FLOOR, dir: f.facing }, .35);
  const mode = a.mode ?? MAYA_SHOW.walk;
  wave.n = mode === MAYA_SHOW.walk ? 0 : 1 + a.shots;
  wave.age = mode === MAYA_SHOW.walk ? 9 : a.t - a.liftAt;
  const c = keepOn(g, f, 'maya-console', GREEN, { x: a.anchor, y: FLOOR, dir: f.facing }, .35);
  c.x = a.anchor;
  c.n = a.mode === MAYA_SHOW.walk ? 0 : 1;
}
function stampCue(g: FightGame, f: Fighter, a: Attack, i: number, x: number, y: number, h: number): void {
  a.liftAt = a.t;
  const kind = cue(i);
  const n = i < 2 ? i : i < 5 ? i - 2 : i < 7 ? i - 5 : 0;
  if (kind === 'beam') g.effect('maya-beam', x, y, '#e8fff0', .5, { n, dir: f.facing, radius: h });
  else if (kind === 'laser') {
    // Fired from the console: the line runs from its deck through the target and on across the stage.
    const ly = y - h * (.25 + n * .22);
    g.effect('maya-laser', x, ly, GREEN, .42, { n, dir: f.facing, tx: a.anchor - x, ty: (FLOOR - 92) - ly });
  }
  else if (kind === 'co2') g.effect('maya-co2', x + (n ? 40 : -40), FLOOR, '#eef6ff', .9, { n });
  else {
    g.effect('maya-spark', x, FLOOR, GOLD, 1.4, { radius: h });
    g.flash = Math.max(g.flash, .14);
    g.shake = Math.max(g.shake, 9);
  }
}
function finish(g: FightGame, f: Fighter, a: Attack): void {
  a.mode = MAYA_SHOW.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - MAYA_SHOW_TAIL);
  g.effect('maya-confetti', a.anchor, 40, GOLD, 1.6, { dir: f.facing });
}
/** a.anchor is the console's x, a.tossAt the moment the wave left (walk → wave) and then the moment it landed
 *  (the show's clock), a.shots the beats played. */
function step_show(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? MAYA_SHOW.walk;
  if (mode === MAYA_SHOW.walk) {
    if (!a.emitted) {
      a.emitted = true;
      a.anchor = clamp(f.x + f.facing * (WALK + MAYA_CONSOLE_X), X_MIN, X_MAX);
    }
    keepStage(g, f, a);
    // The thump: once, early in the trot (a.tossAt -1 marks it spent until the wave reuses the field).
    if (a.t >= REPEL_AT && a.tossAt === 0) {
      a.tossAt = -1;
      a.hit = new Set();
      g.effect('maya-repel', f.x, f.y - 90, GREEN, .5, { radius: REPEL_R });
      g.shake = Math.max(g.shake, 5);
      const p = partsOf(s);
      for (const o of foes(g, f)) {
        if (Math.abs(o.x - f.x) > REPEL_R || o.y < FLOOR - 200) continue;
        hit(g, f, o, p.repel, a, f.x);
      }
    }
    // The trot up: she stops behind the console.
    const k = Math.min(1, a.t / (s.start * .7));
    f.x = clamp(a.anchor - f.facing * (MAYA_CONSOLE_X + WALK * (1 - k)), X_MIN, X_MAX);
    if (a.t < s.start) return;
    a.mode = MAYA_SHOW.wave;
    a.tossAt = a.t;
    a.shots = 0;
    a.hit = new Set();
    g.effect('maya-faders', a.anchor, FLOOR, GREEN, .5, { dir: f.facing });
    a.liftAt = a.t;
    g.effect('maya-bass', a.anchor, FLOOR, GREEN, 1.1, { dir: f.facing });
    g.shake = Math.max(g.shake, 5);
    return;
  }
  keepStage(g, f, a);
  if (mode === MAYA_SHOW.wave) {
    const front = a.anchor + f.facing * WAVE_SPEED * (a.t - a.tossAt);
    for (const o of foes(g, f)) {
      if (a.hit.has(o.id) || !grounded(o)) continue;
      const passed = (front - o.x) * f.facing >= 0 && (o.x - a.anchor) * f.facing >= -30;
      if (!passed) continue;
      const inFront = o.facing === (f.x >= o.x ? 1 : -1);
      const guarded = o.blocking && inFront && o.guard > 0;
      const p = partsOf(s);
      if (!hit(g, f, o, p.wave, a) || guarded || isInvulnerable(o)) continue;
      a.mode = MAYA_SHOW.show;
      a.hold = o.id;
      a.tossAt = a.t;
      a.shots = 0;
      o.attack = null;
      retainEscape(o, true);
      return;
    }
    const gone = f.facing > 0 ? front > X_MAX + 60 : front < X_MIN - 60;
    if (gone || a.t > s.start + 1) {
      a.mode = MAYA_SHOW.empty;
      a.tossAt = a.t;
      a.shots = 0;
    }
    return;
  }
  if (mode === MAYA_SHOW.empty) {
    // Nobody caught: the show plays to the empty stage, no damage.
    const x = clamp(a.anchor + f.facing * 260, X_MIN, X_MAX);
    while (a.shots < MAYA_SHOW_BEATS.length && a.t >= a.tossAt + MAYA_SHOW_BEATS[a.shots] * .8) {
      stampCue(g, f, a, a.shots++, x, FLOOR, 181);
    }
    if (a.shots >= MAYA_SHOW_BEATS.length) finish(g, f, a);
    return;
  }
  if (mode === MAYA_SHOW.show) {
    const o = g.fighterById(a.hold);
    if (!o || o.hp <= 0) { finish(g, f, a); return; }
    o.vx = 0; o.vy = 0; o.knocked = 0;
    o.y = FLOOR;
    o.stun = Math.max(o.stun, .45);
    const p = partsOf(s);
    while (a.shots < MAYA_SHOW_BEATS.length && a.t >= a.tossAt + MAYA_SHOW_BEATS[a.shots]) {
      const i = a.shots++;
      const last = i === MAYA_SHOW_BEATS.length - 1;
      const kind = cue(i);
      a.hit = new Set();
      stampCue(g, f, a, i, o.x, o.y, headOf(o));
      const landed = hit(g, f, o, last ? p.last : kind === 'co2' ? p.co2 : p.beat, a);
      g.hitstop = Math.max(g.hitstop, last ? .08 : .03);
      if (last || !landed) { finish(g, f, a); return; }
    }
    return;
  }
  void dt;
}
SCRIPTS['maya-show'] = {
  update: step_show, noMelee: true, skipCount: true, skipVolley: true, emit: () => {},
  placesHold: [MAYA_SHOW.show],
};

STEP_WATCHERS.push((g, f) => {
  // 呼嘿嘿 roots through the stock 定身; it wears the shiver.
  if (f.root > 0 && f.rootFx === 'maya-laugh' && !f.rootMark) {
    f.rootMark = 'maya-shiver';
    g.effect('maya-shiver@apply', f.x, f.y, '#bfe6ff', .6, { follow: f.id, ox: 0, oy: 0 });
  }
  // A talk cut short (she was knocked out of it): let go at once.
  for (const e of g.effects) {
    if (e.type !== 'maya-orbit' || e.fighter !== f.id || e.life <= .15) continue;
    if (f.attack?.skill.fx !== 'maya-lecture' || f.attack.mode !== MAYA_TALK.held) e.life = .15;
  }
});
