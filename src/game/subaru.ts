import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withFinale, withGuard } from './combat.ts';
import { SCRIPTS } from './scripts.ts';
import { SUBARU_CATCH, SUBARU_CHOP, SUBARU_FILM, SUBARU_GRAB, SUBARU_GUARD, SUBARU_SMILE } from '../render/clips.ts';

/* 安和昴 — Girls Band Cry / TOGENASHI TOGEARI 的鼓手，「大骗子」。笑面缠斗型: a sunny smile on top, quick and sly
   underneath. Three of her moves are fights she really had in the anime. Four scripts on SCRIPTS by fx name
   (combat.ts imports this once):
     subaru-catch  U 别想走        擒拿术: the crane stance in her hallway and the pounce that stops 仁菜 leaving
                                   (reaches further on someone backing off or turned away)
     subaru-smile  I 笑容满面      踩脚加肘击: eyes shut in a big smile while her foot stamps and her elbow digs in;
                                   the one on the end of it goes pale (桃香's blue face)
     subaru-guard  O 手刀架挡      手刀与手刀格挡: the night platform, chop against chop (「你是笨蛋吗」)
     subaru-film   L 找到想做的事了 her grandmother's old film 《すばる。》: she tears up the script, colour breaks through the
                                   sepia, six beats on the drum that is her own choice, the Pleiades burst
   Everything is empty-handed; every star, petal, sheet of paper and the film itself is render/subaruFx.ts. */

const ID = 'subaru';
const GREEN = '#76BD53';
const LEAF = '#c9f0a8';
const PAPER = '#f4efe2';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
/** Nearest live foe ahead of f within `reach` (a little behind counts), grounded if asked. */
function aheadOf(g: FightGame, f: Fighter, reach: number, grounded: boolean): Fighter | undefined {
  let best: Fighter | undefined;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > reach) continue;
    if (grounded && o.y < FLOOR - 12) continue;
    if (!best || Math.abs(o.x - f.x) < Math.abs(best.x - f.x)) best = o;
  }
  return best;
}

/* ---- U 别想走 ---- */

/** Someone trying to leave: moving away from her, or with their back turned. */
function leaving(f: Fighter, o: Fighter): boolean {
  return o.vx * f.facing > 30 || o.facing === f.facing;
}
function step_catch(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill, G = SUBARU_GRAB;
  const mode = a.mode ?? SUBARU_CATCH.stance;
  if (mode === SUBARU_CATCH.stance) {
    if (!a.emitted) {
      a.emitted = true;
      a.hold = -1;
      g.effect('subaru-crane', f.x, f.y, GREEN, s.start + .05, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
    }
    f.vx = 0;
    if (a.t < s.start) return;
    // How far the pounce goes is settled as she leaves: further after someone who is walking out on her.
    const foe = aheadOf(g, f, G.flee + 40, false);
    a.anchor = foe && leaving(f, foe) ? G.flee : G.reach;
    a.mode = SUBARU_CATCH.lunge;
    a.tossAt = a.t;
    a.runX = f.x;
    g.effect('subaru-pounce', f.x, f.y, GREEN, .4, { radius: headOf(f), dir: f.facing, n: a.anchor > G.reach ? 1 : 0 });
  }
  if (a.mode === SUBARU_CATCH.lunge) {
    const k = clamp((a.t - a.tossAt) / G.run, 0, 1);
    f.x = clamp((a.runX ?? f.x) + f.facing * a.anchor * (1 - (1 - k) ** 2), X_MIN, X_MAX);
    f.vx = 0;
    const bucket = Math.floor(a.t * 30);
    if (k < 1 && bucket % 2 === 0 && bucket !== Math.floor((a.t - dt) * 30)) {
      g.effect('ghost', f.x, f.y, GREEN, .2, { fighter: f.id, alpha: .32, tint: LEAF });
    }
    // The hands close on the first body they reach. Air and a timed dodge are out of reach of a hallway tackle.
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -16 || ahead > G.grip || o.y < FLOOR - 48) continue;
      a.mode = SUBARU_CATCH.lock;
      a.hold = o.id;
      a.tossAt = a.t;
      a.anchor = f.x;
      a.shots = 0;
      g.effect('subaru-lock', o.x - f.facing * 18, o.y - headOf(o) * .6, '#ffffff', .4, { dir: f.facing });
      g.hitstop = Math.max(g.hitstop, .05);
      g.shake = Math.max(g.shake, 3);
      break;
    }
    if (a.mode === SUBARU_CATCH.lunge && k >= 1) {
      // Missed: she sprawls where the pounce ran out, and stays down a long beat.
      a.mode = SUBARU_CATCH.whiff;
      g.effect('subaru-sprawl', f.x + f.facing * 20, FLOOR, GREEN, .5, { dir: f.facing });
    }
    return;
  }
  if (a.mode !== SUBARU_CATCH.lock) return;
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  if (a.shots === 0) {
    if (!o || o.hp <= 0) { a.t = Math.max(a.t, s.duration - G.recover); return; }
    // The arm lock: she leans back and hauls them in.
    const k = clamp((a.t - a.tossAt) / G.hold, 0, 1);
    f.x = clamp(a.anchor - f.facing * G.drag * k, X_MIN, X_MAX);
    f.vx = 0;
    o.x = clamp(f.x + f.facing * 60, X_MIN, X_MAX);
    o.y = FLOOR;
    o.vx = 0; o.vy = 0;
    o.knocked = 0;
    o.stun = Math.max(o.stun, .3);
    o.facing = (-f.facing) as 1 | -1;
    if (k < 1) return;
    a.shots = 1;
    a.hit.clear();
    if (hit(g, f, o, s, a)) {
      g.effect('subaru-throw', o.x, o.y - headOf(o) * .5, GREEN, .5, { dir: f.facing, radius: headOf(o) });
      g.shake = Math.max(g.shake, 7);
      g.hitstop = Math.max(g.hitstop, .07);
    }
    a.t = Math.max(a.t, s.duration - G.recover);
  }
}
SCRIPTS[`${ID}-catch`] = { update: step_catch, skipCount: true, noMelee: true, placesHold: [SUBARU_CATCH.lock] };

/* ---- I 笑容满面 ---- */

const stompOf = new WeakMap<Skill, Skill>();
function stompSkill(s: Skill): Skill {
  let d = stompOf.get(s);
  if (!d) stompOf.set(s, d = { ...s, damage: 10, knock: 0, root: SUBARU_SMILE.root, rootPin: true, rootBreak: 0, react: { kind: 'stand', stun: .2 } });
  return d;
}
function step_smile(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, S = SUBARU_SMILE;
  if (!a.emitted) {
    a.emitted = true;
    a.shots = 0;
    // The smile is the show: little sparkles and blossoms round her head while the work goes on below.
    g.effect('subaru-beam', f.x, f.y - headOf(f) * .86, GREEN, s.duration, { follow: f.id, ox: f.facing * 6, oy: -headOf(f) * .86, dir: f.facing, radius: headOf(f) });
  }
  if (a.shots === 0 && a.t >= S.stomp) {
    a.shots = 1;
    const o = aheadOf(g, f, S.reach, true);
    g.effect('subaru-stomp', (o ? o.x - f.facing * 14 : f.x + f.facing * 56), FLOOR, GREEN, .35, { dir: f.facing });
    if (o && hit(g, f, o, stompSkill(s), a) && o.root > 0) {
      g.effect('subaru-pale', o.x, o.y, '#5b8de0', S.root + .1, { follow: o.id, ox: 0, oy: 0, radius: headOf(o), dir: -f.facing });
    }
  }
  if (a.shots === 1 && a.t >= S.elbow) {
    // The elbow comes whether or not the stomp got through: she steps in on it.
    a.shots = 2;
    f.x = clamp(f.x + f.facing * 18, X_MIN, X_MAX);
    a.hit.clear();
    const o = aheadOf(g, f, S.reach + 10, false);
    const ex = f.x + f.facing * 58, ey = f.y - headOf(f) * .55;
    if (o && Math.abs(o.y - f.y) < 110 && hit(g, f, o, s, a)) {
      g.effect('subaru-elbow', o.x - f.facing * 20, o.y - headOf(o) * .55, GREEN, .4, { dir: f.facing });
      g.shake = Math.max(g.shake, 4);
    } else g.effect('subaru-elbow', ex, ey, GREEN, .3, { dir: f.facing, n: 1 });
  }
}
SCRIPTS[`${ID}-smile`] = { update: step_smile, noMelee: true };

/* ---- O 手刀架挡 ---- */

function parry(g: FightGame, f: Fighter, attacker: Fighter): void {
  const y = f.y - headOf(f) * .7;
  g.effect('subaru-clash', f.x + f.facing * 34, y, '#ffffff', .4, { dir: f.facing });
  g.hitstop = Math.max(g.hitstop, .06);
  g.audio.play('block', attacker.id);
}
function counter_guard(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  parry(g, f, attacker);
  a.mode = SUBARU_GUARD.chop;
  a.hold = attacker.id;
  a.shots = 0;
  a.t = a.skill.duration - SUBARU_CHOP.total;
  a.tossAt = a.t;
  f.facing = (Math.sign(attacker.x - f.x) || f.facing) as 1 | -1;
}
/** A shot that meets the guard is knocked away; nothing comes back for it. */
function parry_shot(g: FightGame, f: Fighter, attacker: Fighter): void {
  parry(g, f, attacker);
}
const chopOf = new WeakMap<Skill, Skill[]>();
function chops(s: Skill): Skill[] {
  let c = chopOf.get(s);
  if (!c) {
    const fin = withFinale(s, true);
    chopOf.set(s, c = SUBARU_CHOP.damage.map((d, i): Skill => i < SUBARU_CHOP.damage.length - 1
      ? { ...s, damage: d, knock: 40, react: { kind: 'stand', stun: .3 } }
      : { ...fin, damage: d, noBlock: true }));
  }
  return c;
}
function step_guard(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? SUBARU_GUARD.wait;
  if (mode === SUBARU_GUARD.wait) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('subaru-guard', f.x, f.y, GREEN, s.start, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
    }
    if (a.t >= s.start) a.mode = SUBARU_GUARD.idle;
    return;
  }
  if (mode !== SUBARU_GUARD.chop) return;
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  while (a.shots < SUBARU_CHOP.chops.length && a.t >= a.tossAt + SUBARU_CHOP.chops[a.shots]) {
    const i = a.shots++;
    a.hit.clear();
    const last = i === SUBARU_CHOP.chops.length - 1;
    if (o && o.hp > 0 && Math.abs(o.x - f.x) < SUBARU_CHOP.reach && Math.abs(o.y - f.y) < 120) {
      // Step in behind each chop so the string stays on them.
      f.x = clamp(o.x - f.facing * 66, X_MIN, X_MAX);
      if (hit(g, f, o, chops(s)[i], a)) {
        g.effect('subaru-chop', o.x - f.facing * 6, o.y - headOf(o) * (last ? .98 : .7), GREEN, last ? .5 : .32, { dir: f.facing, n: last ? 1 : 0 });
        g.shake = Math.max(g.shake, last ? 6 : 2);
        if (last) g.hitstop = Math.max(g.hitstop, .06);
      }
    } else g.effect('subaru-chop', f.x + f.facing * 70, f.y - headOf(f) * .7, GREEN, .25, { dir: f.facing, n: 2 });
  }
}
SCRIPTS[`${ID}-guard`] = { update: step_guard, counter: counter_guard, parryShot: parry_shot, noMelee: true };

/* ---- L 找到想做的事了 ---- */

const frameOf = new WeakMap<Skill, Skill>();
function frameSeal(s: Skill): Skill {
  let b = frameOf.get(s);
  if (!b) frameOf.set(s, b = { ...withGuard(s, 0), damage: 6, knock: 0, root: 2, rootPin: true, rootBreak: 0, react: { kind: 'stand', stun: .3 } });
  return b;
}
/** The six beats, cached per skill. Quiet: the frame already holds them, and six of them must not count toward the
 *  combo escape (the seventh hit would let them break out before the burst). */
const beatsOf = new WeakMap<Skill, Skill[]>();
function beatSkill(s: Skill, i: number): Skill {
  let b = beatsOf.get(s);
  if (!b) beatsOf.set(s, b = SUBARU_FILM.beats.map((_, j): Skill => ({ ...withGuard(s, j + 1), react: { kind: 'none' } })));
  return b[i];
}
function step_film(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, S = SUBARU_FILM;
  if (!a.emitted) {
    a.emitted = true;
    a.hold = -1;
    a.liftAt = 0;
    // The whole screen is her grandmother's film until the colour comes back from her feet.
    g.effect('subaru-film', f.x, f.y, '#d9b98a', s.duration + .2, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .3 } });
    g.effect('subaru-script', f.x + f.facing * 26, f.y - headOf(f) * .58, PAPER, S.tear + .05, { follow: f.id, ox: f.facing * 26, oy: -headOf(f) * .58, dir: f.facing });
  }
  if (a.mode == null && a.t >= S.frame) {
    a.mode = 1;
    const o = aheadOf(g, f, S.reach, false);
    a.anchor = o ? o.x : clamp(f.x + f.facing * 240, X_MIN, X_MAX);
    g.effect('subaru-frame', a.anchor, FLOOR, '#ffffff', .5, { dir: f.facing, radius: 150 });
    if (o && o.y >= FLOOR - 60 && hit(g, f, o, frameSeal(s), a)) a.hold = o.id;
    g.shake = Math.max(g.shake, 3);
  }
  if (a.mode === 1 && a.t >= S.tear) {
    a.mode = 2;
    g.effect('subaru-tear', f.x + f.facing * 26, f.y - headOf(f) * .62, PAPER, 1.3, { dir: f.facing });
  }
  if (a.mode === 2 && a.t >= S.flood) {
    a.mode = 3;
    a.runX = f.x;
    a.tossAt = a.t;
    g.effect('subaru-flood', f.x, f.y, GREEN, S.burst - S.flood + .4, { dir: f.facing });
  }
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  if (a.mode === 3) {
    // She closes the gap on the one in the frame (or a short way ahead, if nobody is in it).
    const goal = o ? o.x - f.facing * 70 : (a.runX ?? f.x) + f.facing * 60;
    const k = clamp((a.t - a.tossAt) / S.dash, 0, 1);
    const from = a.runX ?? f.x;
    f.x = clamp(from + (goal - from) * (1 - (1 - k) ** 2), X_MIN, X_MAX);
    f.vx = 0;
  }
  while (a.mode === 3 && (a.liftAt | 0) < S.beats.length && a.t >= S.beats[a.liftAt | 0]) {
    const i = a.liftAt | 0;
    a.liftAt = i + 1;
    const hx = o ? o.x : f.x + f.facing * 70;
    g.effect('subaru-beat', hx - f.facing * 10, f.y - headOf(f) * (.45 + (i % 3) * .12), GREEN, .45, { dir: f.facing, n: i });
    if (o && Math.abs(o.x - f.x) < 150) {
      a.hit.clear();
      hit(g, f, o, beatSkill(s, i), a);
    }
    g.shake = Math.max(g.shake, 2 + i * .5);
  }
  if (a.mode === 3 && a.t >= S.stars) {
    a.mode = 4;
    g.effect('subaru-stars', o ? o.x : f.x + f.facing * 70, (o ? o.y : f.y) - 100, '#eaffd8', S.burst - S.stars + .9, { dir: f.facing, follow: o?.id, ox: 0, oy: -100 });
  }
  if (a.mode === 4 && a.t >= S.burst) {
    a.mode = 5;
    g.shake = Math.max(g.shake, 8);
    if (o && Math.abs(o.x - f.x) < 170) {
      o.root = 0;
      a.hit.clear();
      if (hit(g, f, o, withGuard(withFinale(s, true), S.beats.length + 1), a)) {
        g.hitstop = Math.max(g.hitstop, .09);
        g.effect('subaru-burst', o.x, o.y - headOf(o) * .55, '#eaffd8', 1, { dir: f.facing, radius: headOf(o) });
      }
    } else g.effect('subaru-burst', f.x + f.facing * 70, f.y - 100, '#eaffd8', 1, { dir: f.facing, radius: 181 });
  }
}
// The frame holds them from the catch through the beats; the burst (mode 5) lets go.
SCRIPTS[`${ID}-film`] = { update: step_film, noMelee: true, noSuperFx: true, placesHold: [1, 2, 3, 4] };
