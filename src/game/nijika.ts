import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withFinale, withGuard } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { CAST_WATCHERS, SCRIPTS } from './scripts.ts';
import { NIJIKA_ATTACK, NIJIKA_ROLL, NIJIKA_STARRY, nijikaRollBeat } from '../render/clips.ts';

/* 伊地知虹夏 — 孤独摇滚！/ 结束乐队的鼓手兼队长，「下北泽大天使」。稳健队长型: I pushes out, O bursts up close,
   U keeps them honest from range. Four scripts on SCRIPTS by fx name (combat.ts imports this module once):
     nijika-ahoge   U 悬浮呆毛回旋   the triangle ahoge (the Dorito) flies out spinning and comes back; both passes hit
     nijika-volume  I 最大音量       both sticks into the floor: the loudest instrument, the speaker turned all the way up
                                     (she did that to 星歌 once); close in knocks down, further out shoves and roots
     nijika-roll    O 虹色神速滚奏   the 超高速打鼓 scene: rainbow glow, more arms than she has, cymbals everywhere
     nijika-star    L 繁星的起拍     STARRY: the house goes dark, four clicks of the sticks, stars fall on the beat
   进攻姿态 (passive, 「攻めの姿勢で行こうよ〜」): U, I and O all inside 6 s → a short burst of speed.
   Sticks are drawn into her special cells; every light, ring, cymbal and star is render/nijikaFx.ts. */

const ID = 'nijika';
const GOLD = '#F9D648';
const WARM = '#ffe9a8';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- 进攻姿态 ---- */

const OFFENSE_WINDOW = 6;
CAST_WATCHERS.push((g, f, slot) => {
  if (f.data.id !== ID || f.echo || slot < 2 || slot > 4) return;
  addMod(f, 'offense', OFFENSE_WINDOW, { tag: 'nijika-' + slot });
  for (const s of [2, 3, 4]) if (!f.mods.some(m => m.kind === 'offense' && m.tag === 'nijika-' + s && m.left > 0)) return;
  for (const s of [2, 3, 4]) clearMod(f, 'offense', 'nijika-' + s);
  addMod(f, 'speed', NIJIKA_ATTACK.time, { v: NIJIKA_ATTACK.speed, atk: NIJIKA_ATTACK.speed, tag: 'nijika-attack' });
  g.effect('nijika-attack', f.x, f.y, GOLD, NIJIKA_ATTACK.time, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id });
});
export function attackStance(f: Fighter): boolean {
  return f.mods.some(m => m.kind === 'speed' && m.tag === 'nijika-attack' && m.left > 0);
}

/* ---- U 悬浮呆毛回旋 ---- */

SCRIPTS[`${ID}-ahoge`] = {
  boomerang: true,
  trail: 0,
  hitY: 96,
  hit(g: FightGame, attacker: Fighter, defender: Fighter): boolean {
    g.effect('nijika-chip', defender.x, defender.y - headOf(defender) * .55, GOLD, .4, { dir: attacker.x <= defender.x ? 1 : -1 });
    return false;
  },
};

/* ---- I 最大音量 ---- */

/** Inside `near` the wave knocks down; out to the skill's range it shoves and roots. */
const VOLUME = { near: 130, tall: 80, shove: 70 } as const;
const VOLUME_NEAR: Partial<Skill> = { damage: 46, root: undefined, rootBreak: undefined, knock: 380, react: { kind: 'knockdown', vy: -300, knocked: .8 } };
/** The close-in variant of a skill, built once per skill object instead of once per hit. */
const nearSkills = new WeakMap<Skill, Skill>();
function nearOf(s: Skill): Skill {
  let v = nearSkills.get(s);
  if (!v) nearSkills.set(s, v = { ...s, ...VOLUME_NEAR } as Skill);
  return v;
}
function step_volume(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.t < s.start || a.emitted) return;
  a.emitted = true;
  g.effect('nijika-volume', f.x, FLOOR, GOLD, .75, { radius: s.range, dir: f.facing });
  g.shake = Math.max(g.shake, 7);
  g.hitstop = Math.max(g.hitstop, .04);
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const gap = Math.abs(o.x - f.x);
    if (gap > s.range || FLOOR - o.y > VOLUME.tall) continue;
    const near = gap <= VOLUME.near;
    if (hit(g, f, o, near ? nearOf(s) : s, a)) {
      // The root holds the feet where they are, so the shove further out is placed by hand.
      if (!near) o.x = clamp(o.x + Math.sign(o.x - f.x || f.facing) * VOLUME.shove, X_MIN, X_MAX);
      g.effect('nijika-boom', o.x, o.y - headOf(o) * .5, WARM, .35, { dir: o.x >= f.x ? 1 : -1, hit: near });
    }
  }
}
SCRIPTS[`${ID}-volume`] = { update: step_volume, noMelee: true };

/* ---- O 虹色神速滚奏 ---- */

/** Only every other beat and the crash land (six damaging segments: a seventh would free them from the combo). */
const ROLL_TALL = 120;
function rollHit(g: FightGame, f: Fighter, a: Attack, skill: Skill): boolean {
  a.hit.clear();
  let any = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > skill.range || Math.abs(o.y - f.y) > ROLL_TALL) continue;
    if (hit(g, f, o, skill, a)) any = true;
  }
  return any;
}
function step_roll(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  f.vx = 0;
  // The cymbals ring on the attack clock (hitstop holds it, not the effect clock), so they stay on the strokes.
  if (a.emitted) for (const e of g.effects) if (e.type === 'nijika-cymbals' && e.fighter === f.id) e.age = a.t - s.start;
  if (!a.emitted && a.t >= s.start) {
    a.emitted = true;
    g.effect('nijika-cymbals', f.x, f.y, GOLD, NIJIKA_ROLL.crash - s.start + .4, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f), fighter: f.id, t0: NIJIKA_ROLL.crash - s.start,
    });
  }
  while (a.shots < NIJIKA_ROLL.beats && nijikaRollBeat(a) >= a.shots) {
    const i = a.shots++;
    const ahead = f.x + f.facing * (58 + (i % 3) * 18);
    const land = i % 2 === 0 && rollHit(g, f, a, s);
    g.effect('nijika-beat', ahead, f.y - headOf(f) * (.42 + (i % 4) * .06), GOLD, .3, { n: i, dir: f.facing, hit: land });
  }
  if (a.mode == null && a.t >= NIJIKA_ROLL.crash) {
    a.mode = 1;
    rollHit(g, f, a, withFinale(s, true));
    g.effect('nijika-crash', f.x + f.facing * 74, f.y - headOf(f) * .5, GOLD, .6, { dir: f.facing, radius: headOf(f) });
    g.shake = Math.max(g.shake, 6);
    g.hitstop = Math.max(g.hitstop, .06);
  }
}
SCRIPTS[`${ID}-roll`] = { update: step_roll, noMelee: true };

/* ---- L 繁星的起拍 ---- */

/** A falling star catches anyone this close to where it was aimed. */
const STAR_REACH = 92;
const STAR_TALL = 200;
function starHit(g: FightGame, f: Fighter, a: Attack, x: number, skill: Skill): boolean {
  a.hit.clear();
  let any = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - x) > STAR_REACH || FLOOR - o.y > STAR_TALL) continue;
    if (hit(g, f, o, skill, a, x)) any = true;
  }
  return any;
}
function aimAt(g: FightGame, f: Fighter): number {
  const o = g.nearestEnemyTo(f, f.x);
  return clamp(o && o.hp > 0 ? o.x : f.x + f.facing * 240, X_MIN, X_MAX);
}
/** Where a star was aimed lives on the attack, so a replayed or mirrored attack carries it: two stars are in the air at
 *  most, so even ones use a.anchor and odd ones a.tossAt; a.mode counts the stars aimed so far. */
function aimOf(a: Attack, i: number): number {
  return i % 2 === 0 ? a.anchor : a.tossAt;
}
function setAim(a: Attack, i: number, x: number): void {
  if (i % 2 === 0) a.anchor = x; else a.tossAt = x;
}
function step_star(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = NIJIKA_STARRY;
  if (!a.emitted) {
    a.emitted = true;
    a.mode = 0;
    g.effect('nijika-starry', f.x, 0, GOLD, s.duration + .25, { fighter: f.id, cast: { serial: a.serial, tail: .35 } });
  }
  // The count-in: four clicks of the sticks over her head.
  while ((a.liftAt | 0) < S.clicks.length && a.t >= S.clicks[a.liftAt | 0]) {
    const i = a.liftAt | 0;
    a.liftAt = i + 1;
    g.effect('nijika-click', f.x + f.facing * 6, f.y - headOf(f) - 18, WARM, .4, { n: i, hit: i === S.clicks.length - 1 });
  }
  const n = S.stars.length;
  // Aim each star when it starts to fall; it lands S.fall later.
  while ((a.mode ?? 0) < n + 1 && a.t >= ((a.mode ?? 0) < n ? S.stars[a.mode ?? 0] : S.big)) {
    const i = a.mode ?? 0;
    const x = aimAt(g, f);
    setAim(a, i, x);
    a.mode = i + 1;
    const big = i === n;
    g.effect(big ? 'nijika-bigstar' : 'nijika-meteor', x, FLOOR, big ? '#fff6d0' : GOLD, (big ? S.bigFall : S.fall) + .5, {
      n: i, t0: big ? S.bigFall : S.fall, dir: f.facing,
    });
  }
  while (a.shots < (a.mode ?? 0)) {
    const i = a.shots;
    const big = i === n;
    const lands = (big ? S.big + S.bigFall : S.stars[i] + S.fall);
    if (a.t < lands) break;
    a.shots++;
    const seg = withGuard(withFinale(s, big), i);
    const x = aimOf(a, i);
    starHit(g, f, a, x, seg);
    if (big) {
      g.effect('nijika-ribbon', x, FLOOR, '#e8455a', 1.1, { dir: f.facing });
      g.flash = Math.max(g.flash, .14);
      g.shake = Math.max(g.shake, 10);
      g.hitstop = Math.max(g.hitstop, .07);
    } else g.shake = Math.max(g.shake, 3);
  }
}
SCRIPTS[`${ID}-star`] = { update: step_star, noMelee: true, noSuperFx: true };
