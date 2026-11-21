import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, spawnShot, withGuard } from './combat.ts';
import { SCRIPTS } from './scripts.ts';
import {
  RUI_BOX_BURST, RUI_CHOCO_GAP, RUI_CHOCO_LAST, RUI_CHOCO_R, RUI_CHOCO_SMALL, RUI_CHOCO_WARN,
  RUI_FINAL, RUI_STRINGS,
} from '../render/clips.ts';

/* 八潮瑠唯 — Morfonica 的小提琴，月之森学生会长。
   U 一针见血: the bow as a foil, one thin straight line; a guard holds it and pays for it (guardDmg).
   I 取消使用许可: a plain shot, the council seal; the 沉默 look is 'rui-seal' (statusMarks / ruiFx).
   O 情人节收不完: arms folded; a shadow over whoever is in front, then the chocolate rains on that patch.
   L 无意义的旋律: the house goes grey, five strings across the stage, then Morfonica's five colours and the resonance.
   绷住了 is data (CharacterData.unfazed), read by status.ts and the 脆弱 gate in combat.ts. */

const GREEN = '#669988';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 一针见血 ---- */

/** The point travels at chest height: a jump clears it, a step behind her does not count. */
const THRUST_AIR = 70;
function emit_thrust(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const y = f.y - headOf(f) * .55;
  // The line stops at the first body it reaches, or runs the full length.
  let reach = s.range;
  let target: Fighter | undefined;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -10 || ahead > s.range || o.y < FLOOR - THRUST_AIR) continue;
    if (ahead < reach) { reach = Math.max(30, ahead); target = o; }
  }
  g.effect('rui-thrust', f.x + f.facing * 34, y, GREEN, .32, { dir: f.facing, radius: reach - 34 });
  if (!target) return;
  const blocking = target.blocking;
  if (!hit(g, f, target, s, a)) return;
  g.effect('rui-pierce', target.x - f.facing * 18, y, blocking ? '#cfe3ff' : GREEN, .45, { dir: f.facing, n: blocking ? 1 : 0 });
  g.hitstop = Math.max(g.hitstop, .05);
}
SCRIPTS['rui-thrust'] = { emit: emit_thrust, noMelee: true };

/* ---- O 情人节收不完 (脱手技) ----
   She folds her arms and is done: the rain is seven shots of her own that wait on the patch and land on their own clock,
   so she can walk out of the recovery (walkCancel) while the chocolate is still coming down. A shot keeps the patch
   centre in `aim`, the age it lands at in `ticked` and her facing in `face`; it is never drawn as a shot (the falling
   boxes are effects) and nothing can shoot it down. */

const chocoParts = new WeakMap<Skill, { small: Skill; last: Skill }>();
function chocoOf(s: Skill): { small: Skill; last: Skill } {
  let v = chocoParts.get(s);
  if (!v) {
    v = { small: { ...s, finale: undefined }, last: { ...s, ...s.finale, finale: undefined, slow: undefined } };
    chocoParts.set(s, v);
  }
  return v;
}
/** Where box i lands on the patch: scattered, the big one dead centre. Visual only: every box hits the whole patch. */
function boxOff(i: number): number {
  return i === RUI_CHOCO_SMALL ? 0 : ((i * 37) % 7 / 6 - .5) * RUI_CHOCO_R * 1.4;
}
/** Seconds after the throw that box i lands. */
function boxAt(i: number): number {
  return i < RUI_CHOCO_SMALL ? RUI_CHOCO_WARN + i * RUI_CHOCO_GAP : RUI_CHOCO_LAST;
}
function emit_choco(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const o = foeAhead(g, f, s.range);
  const anchor = o ? o.x : clamp(f.x + f.facing * 260, X_MIN, X_MAX);
  g.effect('rui-shadow', anchor, FLOOR, '#ff9cc0', RUI_CHOCO_LAST + .2, { dir: f.facing, radius: RUI_CHOCO_R });
  const parts = chocoOf(s);
  for (let i = 0; i <= RUI_CHOCO_SMALL; i++) {
    const big = i === RUI_CHOCO_SMALL ? 1 : 0;
    const land = boxAt(i);
    g.effect('rui-box', anchor + boxOff(i), FLOOR, '#ff9cc0', land + RUI_BOX_BURST[big], { t0: land, n: big, dir: i % 2 ? 1 : -1 });
    const p = spawnShot(g, f, a);
    p.x = anchor;
    p.y = FLOOR - 40;
    p.vx = 0;
    p.vy = 0;
    p.aim = anchor;
    p.ticked = land;
    p.face = f.facing;
    p.life = land + .1;
    p.skill = big ? parts.last : parts.small;
    p.solid = false;
  }
}
/** The box waits for its age, then lands on everyone over the patch (in the air too) and is gone. */
function shot_choco(g: FightGame, p: Projectile): boolean {
  if (p.age < (p.ticked ?? 0)) return true;
  p.life = 0;
  const owner = g.fighterById(p.owner);
  if (!owner) return true;
  const x = p.aim ?? p.x;
  const face = p.face ?? 1;
  p.hit.clear();
  for (const o of g.fighters) {
    if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - x) > RUI_CHOCO_R) continue;
    hit(g, owner, o, p.skill, p, x - face * 40);
  }
  if (p.skill.react?.kind === 'knockdown') { g.shake = Math.max(g.shake, 6); g.hitstop = Math.max(g.hitstop, .05); }
  return true;
}
SCRIPTS['rui-choco'] = { emit: emit_choco, shot: shot_choco, freeWhenEmitted: true, walkCancel: true, trail: 0 };

/* ---- L 无意义的旋律 ---- */

/** The strings reach everything ahead, in the air too (a machine does not miss). The resonance rolls along the floor:
 *  the colour coming into the strings is the cue, and a jump then clears it. */
const WAVE_AIR = 60;
const BEATS = [...RUI_STRINGS.map((t, n) => ({ t, n })), { t: RUI_FINAL, n: 5 }];
const melodyParts = new WeakMap<Skill, Skill[]>();
function melodyOf(s: Skill): Skill[] {
  let v = melodyParts.get(s);
  if (!v) {
    v = BEATS.map((b, i) => withGuard(b.n === 5 ? { ...s, ...s.finale, finale: undefined } : { ...s, finale: undefined }, i));
    melodyParts.set(s, v);
  }
  return v;
}
/** a.shots is the next beat. */
function step_melody(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted) {
    a.emitted = true;
    // The grey under the bodies, and the strings: one effect for the whole song, read off its own clock.
    g.effect('rui-grey', f.x, FLOOR, '#7d8587', RUI_FINAL + .35, {});
    g.effect('rui-strings', f.x, FLOOR, GREEN, s.duration + .25, { dir: f.facing, radius: s.range });
  }
  const parts = melodyOf(s);
  while (a.shots < BEATS.length && a.t >= BEATS[a.shots].t) {
    const i = a.shots++;
    const final = BEATS[i].n === 5;
    const air = final ? WAVE_AIR : Infinity;
    a.hit.clear();
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -40 || ahead > s.range || o.y < FLOOR - air) continue;
      hit(g, f, o, parts[i], a);
    }
    if (final) {
      g.effect('rui-wave', f.x + f.facing * 40, FLOOR, GREEN, .8, { dir: f.facing, radius: s.range });
      g.flash = Math.max(g.flash, .05);
      g.shake = Math.max(g.shake, 10);
      g.hitstop = Math.max(g.hitstop, .07);
    } else {
      g.shake = Math.max(g.shake, 2);
    }
  }
}
SCRIPTS['rui-strings'] = { update: step_melody, noMelee: true };
