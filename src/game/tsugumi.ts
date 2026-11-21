import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, withFinale } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { CAST_WATCHERS, SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  TSUGUMI_EFFORT_MAX, TSUGUMI_KEYS, TSUGUMI_KEY_GAP, TSUGUMI_KEY_STEP, TSUGUMI_KEY_FIRST, TSUGUMI_SQUEEZE, TSUGUMI_SQUEEZE_BEATS,
  TSUGUMI_SQUEEZE_IN, TSUGUMI_SQUEEZE_LUNGE, TSUGUMI_SQUEEZE_TAIL, TSUGUMI_STAR, TSUGUMI_STAR_GAP, TSUGUMI_STAR_MIN,
  TSUGUMI_SISTER_GAP,
} from '../render/clips.ts';

/* 羽泽鸫（萌娘百科）— Afterglow 的键盘手，别号「伟大的普通人」；羽泽咖啡店的看板娘，羽丘学生会长，努力家，
   对冰川家有独特的吸引力（冰川三明治不可避），曾因为过分工作而倒下，特技是训练后最快找到最亮的星星。
   Four scripts on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     tsugumi-squeeze  U 冰川夹心  a lunge and a grab; 纱夜 and 日菜 slide in either side and squeeze them twice (定身)
     tsugumi-tray     I 银盘回旋  the café's silver tray, out and back (a boomerang; both passes hit)
     tsugumi-keys     O 琴键重锤  a wrong note, both fists down: a row of light keys pressed one after another along the floor
     tsugumi-star     L 平凡之星  night falls; her stars gather into the brightest one and come down as a meteor
   努力家 (passive): every U / I / O hit lights one star over the stage ('effort' mod, v stars, at most
   TSUGUMI_EFFORT_MAX); a knockdown costs one; 平凡之星 spends them all. Three U / I / O inside 6 s and she
   overworks: a short fever stall once the third one is over ('overwork' mod). Pictures in render/tsugumiFx.ts. */

const YELLOW = '#FFEE88';
const TEAL = '#00AABB';
const CYAN = '#55DDEE';
const ID = 'tsugumi';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
const LOW_AIR = 90;
const grounded = (o: Fighter) => o.y >= FLOOR - LOW_AIR;

/* ---- 努力家 ---- */

export function effortOf(f: Fighter): number {
  return f.mods.find(m => m.kind === 'effort' && m.left > 0)?.v ?? 0;
}
function setEffort(f: Fighter, v: number): void {
  const m = f.mods.find(x => x.kind === 'effort' && x.left > 0);
  const n = clamp(v, 0, TSUGUMI_EFFORT_MAX);
  if (m) m.v = n;
  else addMod(f, 'effort', 999, { v: n, acc: 0 });
}
/** One more star, with a spark rising from where it was earned. */
function earn(g: FightGame, f: Fighter, at: Fighter): void {
  if (f.data.id !== ID) return;
  const before = effortOf(f);
  setEffort(f, before + 1);
  if (effortOf(f) > before) g.effect('tsugumi-earn', at.x, at.y - headOf(at) * .7, YELLOW, .7, { n: before, tx: skyX(f) - at.x, fighter: f.id });
}
/** Her stars hang over her half of the stage. */
export function skyX(f: Fighter): number {
  return f.id % 2 === 0 ? W * .3 : W * .7;
}
const OVERWORK_WINDOW = 6;
const OVERWORK_CASTS = 3;
const FEVER = .6;
CAST_WATCHERS.push((g, f, slot) => {
  if (f.data.id !== ID || slot < 2 || slot > 4) return;
  const m = f.mods.find(x => x.kind === 'overwork' && x.left > 0);
  const n = (m?.v ?? 0) + 1;
  if (n >= OVERWORK_CASTS) {
    // acc 1: the fever is due as soon as this move is over.
    if (m) { m.v = 0; m.acc = 1; m.left = Math.max(m.left, 4); }
    else addMod(f, 'overwork', 4, { v: 0, acc: 1 });
    return;
  }
  if (m) m.v = n;
  else addMod(f, 'overwork', OVERWORK_WINDOW, { v: n, acc: 0 });
});
STEP_WATCHERS.push((g, f, dt) => {
  if (f.data.id !== ID) return;
  const e = f.mods.find(x => x.kind === 'effort' && x.left > 0);
  // acc mirrors "was down last step", so one knockdown costs exactly one star.
  if (e) {
    const down = f.knocked > 0 ? 1 : 0;
    if (down && !e.acc && (e.v ?? 0) > 0) {
      e.v = (e.v ?? 0) - 1;
      g.effect('tsugumi-lose', skyX(f), 150, YELLOW, .6, { n: e.v, fighter: f.id });
    }
    e.acc = down;
  }
  const sky = g.effects.find(x => x.type === 'tsugumi-sky' && x.fighter === f.id);
  const n = effortOf(f);
  if (n > 0 && f.hp > 0 && f.attack?.skill.fx !== `${ID}-star`) {
    if (sky) { sky.n = n; sky.life = Math.max(sky.life, .3); sky.age = (sky.age ?? 0) + dt; }
    else g.effect('tsugumi-sky', skyX(f), 0, YELLOW, .3, { n, fighter: f.id, age: 0 });
  } else if (sky) sky.life = Math.min(sky.life, .25);
  const w = f.mods.find(x => x.kind === 'overwork' && x.left > 0 && x.acc === 1);
  if (w && !f.attack) {
    w.acc = 0;
    clearMod(f, 'overwork');
    if (f.hp > 0 && f.knocked <= 0) {
      f.stun = Math.max(f.stun, FEVER);
      f.vx = 0;
      g.effect('tsugumi-fever', f.x, f.y, '#ff8f8f', FEVER + .15, { follow: f.id, ox: 0, oy: 0, radius: headOf(f) });
    }
  }
});

/* ---- U 冰川夹心 ---- */

/** She holds them this close; the sisters stand this far either side of them. */
const SQUEEZE_REACH = 64;
function releaseSqueeze(a: Attack): void {
  a.mode = TSUGUMI_SQUEEZE.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - TSUGUMI_SQUEEZE_TAIL);
}
function step_squeeze(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? TSUGUMI_SQUEEZE.lunge;
  if (mode === TSUGUMI_SQUEEZE.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    // Feet on the floor only: a jump clears the grab.
    if (o && Math.abs(o.y - f.y) < 70 && !isInvulnerable(o)) {
      a.mode = TSUGUMI_SQUEEZE.held;
      a.hold = o.id;
      a.tossAt = a.t;
      f.x = clamp(o.x - f.facing * SQUEEZE_REACH, X_MIN, X_MAX);
      a.anchor = o.x;
      o.vx = 0; o.vy = 0; o.knocked = 0; o.attack = null;
      o.stun = Math.max(o.stun, .4);
      retainEscape(o);
      g.hitstop = Math.max(g.hitstop, .05);
      g.effect('grab', o.x, o.y - 100, YELLOW, .25, { radius: 44 });
      const span = TSUGUMI_SQUEEZE_BEATS[TSUGUMI_SQUEEZE_BEATS.length - 1] + .35;
      // 纱夜 on her side (behind them), 日菜 on the far side; both walk in off their own standing cell.
      g.effect('tsugumi-sister', o.x, FLOOR, TEAL, span, { n: 0, dir: f.facing, tx: -f.facing * TSUGUMI_SISTER_GAP });
      g.effect('tsugumi-sister', o.x, FLOOR, CYAN, span, { n: 1, dir: -f.facing, tx: f.facing * TSUGUMI_SISTER_GAP });
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 560) * dt, X_MIN, X_MAX);
    if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) g.effect('ghost', f.x - f.facing * 22, f.y, f.data.color, .2, { fighter: f.id, alpha: .3 });
    if (a.t >= s.start + TSUGUMI_SQUEEZE_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = TSUGUMI_SQUEEZE.done;
      a.t = Math.max(a.t, s.duration - .25);
    }
    return;
  }
  if (mode !== TSUGUMI_SQUEEZE.held) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0 || isInvulnerable(o)) {
    releaseSqueeze(a);
    return;
  }
  // She slips out backwards once the sisters are in; they hold the body where it was caught.
  const since = a.t - a.tossAt;
  const slip = clamp((since - TSUGUMI_SQUEEZE_IN) / .2, 0, 1);
  f.x = clamp(a.anchor - f.facing * (SQUEEZE_REACH + slip * 46), X_MIN, X_MAX);
  o.x = a.anchor; o.y = FLOOR; o.vx = 0; o.vy = 0; o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  o.facing = (-f.facing) as 1 | -1;
  const beats = TSUGUMI_SQUEEZE_BEATS;
  while (a.shots < beats.length && since >= beats[a.shots]) {
    const i = a.shots++;
    const last = i === beats.length - 1;
    a.hit.clear();
    if (hit(g, f, o, withFinale(s, last), a)) {
      if (i === 0) earn(g, f, o);
      addMod(o, 'squeeze', .28, { from: f.id });
    }
    g.effect('tsugumi-press', o.x, o.y - headOf(o) * .55, '#ffffff', .4, { n: i, radius: headOf(o), hit: last });
    g.shake = Math.max(g.shake, last ? 5 : 3);
    if (!last && o.hp > 0 && !isInvulnerable(o)) continue;
    releaseSqueeze(a);
    return;
  }
}
SCRIPTS[`${ID}-squeeze`] = { update: step_squeeze, noMelee: true, skipCount: true };

/* ---- I 银盘回旋 ---- */

SCRIPTS[`${ID}-tray`] = {
  boomerang: true,
  trail: 0,
  hitY: 90,
  hit(g: FightGame, attacker: Fighter, defender: Fighter): boolean {
    earn(g, attacker, defender);
    g.effect('tsugumi-clang', defender.x, defender.y - headOf(defender) * .55, '#f4f6ff', .35, { dir: attacker.x <= defender.x ? 1 : -1 });
    return false;
  },
};

/* ---- O 琴键重锤 ---- */

function step_keys(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.t < s.start) return;
  if (!a.emitted) {
    a.emitted = true;
    a.anchor = f.x;
    a.tossAt = f.facing;
    g.effect('tsugumi-slam', f.x + f.facing * 34, FLOOR, '#ffffff', .4, { dir: f.facing });
    g.shake = Math.max(g.shake, 4);
    g.effect('tsugumi-tear', f.x, f.y, '#bfe6ff', s.duration - s.start, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
  }
  const dir = (a.tossAt || f.facing) as 1 | -1;
  while (a.shots < TSUGUMI_KEYS && a.t >= s.start + TSUGUMI_KEY_FIRST + a.shots * TSUGUMI_KEY_GAP) {
    const i = a.shots++;
    const last = i === TSUGUMI_KEYS - 1;
    const x = a.anchor + dir * (TSUGUMI_KEY_STEP * (i + 1));
    g.effect('tsugumi-key', x, FLOOR, YELLOW, .55, { n: i, dir, hit: last });
    // The key front catches anyone between the last key and this one.
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || !grounded(o)) continue;
      const ahead = (o.x - a.anchor) * dir;
      if (ahead < -10 || ahead > TSUGUMI_KEY_STEP * (i + 1) + TSUGUMI_KEY_STEP * .5) continue;
      if (hit(g, f, o, s, a)) {
        earn(g, f, o);
        g.effect('tsugumi-chord', o.x, FLOOR, YELLOW, .5, { dir });
      }
    }
  }
}
SCRIPTS[`${ID}-keys`] = { update: step_keys, noMelee: true };

/* ---- L 平凡之星 ---- */

/** The meteor lands within this of the spot chosen when it starts to fall. */
const STAR_REACH = 120;
/** Each 努力 star she brought adds this much to the meteor. */
const STAR_BONUS = 4;
const SMALL: Partial<Skill> = { damage: 6, knock: 0, react: { kind: 'stand', stun: .3 } };
function starHit(g: FightGame, f: Fighter, a: Attack, x: number, skill: Skill, reach: number): boolean {
  a.hit.clear();
  let any = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - x) > reach) continue;
    if (hit(g, f, o, skill, a, x)) any = true;
  }
  return any;
}
function step_star(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = TSUGUMI_STAR;
  if (!a.emitted) {
    a.emitted = true;
    // a.liftAt holds how many stars this one is made of; she always has at least TSUGUMI_STAR_MIN.
    a.liftAt = Math.max(TSUGUMI_STAR_MIN, effortOf(f));
    a.tossAt = effortOf(f);
    g.effect('tsugumi-night', W / 2, 0, '#14214a', s.duration + .2);
    g.effect('tsugumi-gather', skyX(f), 0, YELLOW, s.duration, { n: a.liftAt, tx: 0, fighter: f.id });
    for (const e of g.effects) if (e.type === 'tsugumi-sky' && e.fighter === f.id) e.life = 0;
  }
  if (a.mode == null && a.t >= S.fall) {
    a.mode = 1;
    const o = g.nearestEnemyTo(f, f.x);
    a.anchor = clamp(o && o.hp > 0 ? o.x : f.x + f.facing * 260, X_MIN, X_MAX);
    setEffort(f, 0);
    g.effect('tsugumi-meteor', a.anchor, FLOOR, YELLOW, S.land - S.fall + .9, { tx: skyX(f) - a.anchor, n: a.liftAt, t0: S.land - S.fall });
  }
  if (a.mode == null) return;
  const smalls = a.liftAt;
  while (a.shots < smalls && a.t >= S.land + a.shots * TSUGUMI_STAR_GAP) {
    const i = a.shots++;
    const x = a.anchor + (hash01(i) - .5) * 140;
    g.effect('tsugumi-spark', x, FLOOR, YELLOW, .45, { n: i });
    // Only the first few hit (a long chain of small hits would free them before the big one); the rest are light,
    // and what they are worth rides on the big star instead (STAR_BONUS).
    if (i < TSUGUMI_STAR_MIN) starHit(g, f, a, a.anchor, { ...s, ...SMALL } as Skill, STAR_REACH);
  }
  if (a.mode === 1 && a.t >= S.land + smalls * TSUGUMI_STAR_GAP + S.finale) {
    a.mode = 2;
    const bonus = a.tossAt * STAR_BONUS;
    const last = { ...withFinale(s, true), damage: (s.finale?.damage ?? s.damage) + bonus };
    starHit(g, f, a, a.anchor, last, STAR_REACH);
    g.effect('tsugumi-impact', a.anchor, FLOOR, YELLOW, .9, { n: a.tossAt, radius: 140 + a.tossAt * 10 });
    g.flash = Math.max(g.flash, .14);
    g.shake = Math.max(g.shake, 10);
    g.hitstop = Math.max(g.hitstop, .07);
  }
}
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
SCRIPTS[`${ID}-star`] = { update: step_star, noMelee: true, noSuperFx: true };
