import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { attackHeld, hit, withFinale, withGuard } from './combat.ts';
import { SCRIPTS } from './scripts.ts';
import { bodyLift } from './hoverBody.ts';
import { PRAYER, REFUSE, SHIORI_CHARTER, SHIORI_PRAYER, SHIORI_REFUSE, SHIORI_SEAL } from '../render/clips.ts';

/** 悬浮 (view.hover): where her drawn body stands, for the few effects that are placed once and do not follow her. */
const bodyY = (f: Fighter) => f.y - bodyLift(f);

/* 香农栞 — 萌趣世界「编织者」之一，织萌神殿的司书，圣女。规则控场型. Four scripts on SCRIPTS by fx name
   (combat.ts imports this module once):
     shiori-seal     U 封缄之印   a sigil goes down under the nearest foe ahead and reads them (审视); it closes on
                                  whoever is still in it: damage and 沉默. Swinging while it reads is 触犯戒律: the long seal
     shiori-refuse   I 恕难从命   pages up in front of her for the window: a melee hit is refused (no damage, no flinch),
                                  the hitter is pushed off and 削弱; a shot is stopped and goes back as one page
     shiori-prayer   O 三重祷言   held: she prays and the stage climbs (俳句 → 颂诗 → 巨典, Haiku / Sonnet / Opus);
                                  let go and it comes down; a full prayer lets go by itself
     shiori-charter  L 圣典裁决   (200 气) the charter goes up; four acolytes (her own art under gold) cross the foe from
                                  alternating sides; the verdict's pillar lands on them: knockdown and 沉默
   Everything that shines is render/shioriFx.ts. */

const ID = 'shiori';
const ORANGE = '#D97757';
const GOLD = '#ffd98a';
const CREAM = '#fff4dc';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/** A plain shot of hers that is not the skill's own spawn (the petals, the pages, a page sent back). */
function shoot(g: FightGame, f: Fighter, a: Attack, skill: Skill, x: number, y: number, vx: number, vy: number): Projectile {
  const p: Projectile = {
    owner: f.id, x, y, vx, vy, life: skill.life ?? 1.2, skill, color: ORANGE,
    radius: Math.min(30, (skill.size ?? 40) * .3), size: skill.size ?? 40, fx: skill.fx,
    attack: a, hit: new Set(), trail: [], age: 0, solid: false,
  };
  g.projectiles.push(p);
  return p;
}

/* ---- U 封缄之印 ---- */

const sealParts = new WeakMap<Skill, { base: Skill; long: Skill }>();
function sealOf(s: Skill): { base: Skill; long: Skill } {
  let p = sealParts.get(s);
  if (!p) {
    const long: Skill = { ...s, status: s.status?.map(st => ({ ...st, time: 2.6 })) };
    sealParts.set(s, p = { base: s, long });
  }
  return p;
}
/** a.anchor is the sigil's x; a.hold the foe it was put under (-1: nobody in reach); a.liftAt 1 once they swung. */
function step_seal(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = SHIORI_SEAL;
  if (!a.emitted) {
    a.emitted = true;
    a.mode = 0;
    let target: Fighter | undefined;
    let best = Infinity;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -40 || ahead > S.reach) continue;
      if (Math.abs(ahead) < best) { best = Math.abs(ahead); target = o; }
    }
    a.hold = target ? target.id : -1;
    a.anchor = clamp(target ? target.x : f.x + f.facing * S.miss, X_MIN, X_MAX);
    a.liftAt = 0;
    g.effect('shiori-sigil', a.anchor, FLOOR, GOLD, s.start + .12, { radius: S.radius, dir: f.facing, fighter: f.id, cast: { serial: a.serial, tail: .12 } });
    g.effect('shiori-cast-glow', f.x + f.facing * 26, f.y - headOf(f) * .62, GOLD, s.start, { follow: f.id, ox: f.facing * 26, oy: -headOf(f) * .62 });
  }
  if (a.mode === 0 && a.t < s.start) {
    // 审视: swinging at all while it reads them is 触犯戒律.
    const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
    if (o && o.attack && o.attack.t > 0) a.liftAt = 1;
    return;
  }
  if (a.mode !== 0) return;
  a.mode = 1;
  const parts = sealOf(s);
  const skill = a.liftAt ? parts.long : parts.base;
  let any = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - a.anchor) > S.radius || FLOOR - o.y > S.tall) continue;
    if (hit(g, f, o, skill, a)) {
      any = true;
      g.effect('shiori-bind', o.x, o.y, GOLD, .7, { follow: o.id, ox: 0, oy: 0, radius: headOf(o), n: a.liftAt ? 1 : 0 });
    }
  }
  g.effect('shiori-seal-slam', a.anchor, FLOOR, GOLD, .55, { radius: S.radius, hit: any, n: a.liftAt ? 1 : 0 });
  if (any) {
    g.shake = Math.max(g.shake, a.liftAt ? 6 : 4);
    g.hitstop = Math.max(g.hitstop, .05);
  }
}
SCRIPTS[`${ID}-seal`] = { update: step_seal, noMelee: true };

/* ---- I 恕难从命 ---- */

const refuseParts = new WeakMap<Skill, { push: Skill; page: Skill }>();
function refuseOf(s: Skill): { push: Skill; page: Skill } {
  let p = refuseParts.get(s);
  if (!p) {
    const push: Skill = { ...s, noBlock: true };
    const page: Skill = {
      ...s, type: 'projectile', damage: 30, knock: 120, curse: undefined, noBlock: false, speed: 760, size: 46, life: 1.4,
      fx: `${ID}-page`, react: { kind: 'stand', stun: .3 },
    };
    refuseParts.set(s, p = { push, page });
  }
  return p;
}
function refuseFlash(g: FightGame, f: Fighter, attacker: Fighter): void {
  g.effect('shiori-refuse-flash', f.x + f.facing * 44, bodyY(f) - headOf(f) * .55, CREAM, .45, { dir: f.facing, radius: headOf(f) });
  g.hitstop = Math.max(g.hitstop, .06);
  g.audio.play('block', attacker.id);
}
function counter_refuse(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  refuseFlash(g, f, attacker);
  a.mode = REFUSE.push;
  a.hold = attacker.id;
  a.tossAt = a.t;
  f.facing = (Math.sign(attacker.x - f.x) || f.facing) as 1 | -1;
}
/** A shot that meets the pages is stopped; one page goes back at whoever sent it. */
function parry_refuse(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  refuseFlash(g, f, attacker);
  const dir = (Math.sign(attacker.x - f.x) || f.facing) as 1 | -1;
  const page = refuseOf(a.skill).page;
  shoot(g, f, a, page, f.x + dir * 50, f.y - 90, dir * (page.speed ?? 760), 0);
}
function step_refuse(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? REFUSE.wait;
  if (!a.emitted) {
    a.emitted = true;
    a.mode = REFUSE.wait;
    g.effect('shiori-pages', f.x, bodyY(f), CREAM, s.start + .1, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f), fighter: f.id, cast: { serial: a.serial, mode: REFUSE.wait, tail: .18 },
    });
  }
  if (mode === REFUSE.wait) {
    // Nobody came: the pages settle back into the book.
    if (a.t >= s.start) a.mode = REFUSE.done;
    return;
  }
  if (mode !== REFUSE.push || a.t < a.tossAt + SHIORI_REFUSE.push) return;
  a.mode = REFUSE.done;
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  a.hit.clear();
  if (o && o.hp > 0) {
    hit(g, f, o, refuseOf(s).push, a);
    g.effect('shiori-refuse-push', o.x, o.y - headOf(o) * .55, CREAM, .5, { dir: f.facing });
  }
  a.t = Math.max(a.t, s.duration - SHIORI_REFUSE.tail);
}
SCRIPTS[`${ID}-refuse`] = { update: step_refuse, counter: counter_refuse, parryShot: parry_refuse, noMelee: true };

/* ---- O 三重祷言 ---- */

const prayerParts = new WeakMap<Skill, { haiku: Skill[]; page: Skill; tome: Skill }>();
function prayerOf(s: Skill): { haiku: Skill[]; page: Skill; tome: Skill } {
  let p = prayerParts.get(s);
  if (!p) {
    const P = SHIORI_PRAYER;
    p = {
      haiku: P.haiku.map(d => ({ ...s, damage: d, fx: `${ID}-haiku` })),
      page: { ...s, damage: 6, knock: 30, size: 34, speed: 720, life: 1.1, fx: `${ID}-page`, react: { kind: 'stand', stun: .18 } },
      tome: { ...s, damage: 90, knock: 300, guardDmg: 30, react: { kind: 'knockdown', vy: -300, knocked: .8 } },
    };
    prayerParts.set(s, p);
  }
  return p;
}
/** The stage a prayer of `held` seconds has reached. */
export function prayerStage(held: number): number {
  return held >= SHIORI_PRAYER.tome ? PRAYER.tome : held >= SHIORI_PRAYER.sonnet ? PRAYER.sonnet : PRAYER.haiku;
}
/** The CPU has no key to hold: it picks how long to pray from the distance. */
function cpuPrayer(g: FightGame, f: Fighter): number {
  const o = g.nearestEnemyTo(f, f.x);
  const d = o ? Math.abs(o.x - f.x) : 400;
  if (d < 200) return SHIORI_PRAYER.sonnet + .05;
  return g.random() < .5 ? 0 : SHIORI_PRAYER.tome;
}
const prayGlow = new WeakMap<Attack, import('./game.ts').Effect>();
/** a.tossAt is how long she has prayed; a.anchor the CPU's chosen length, then 巨典's landing x. */
function step_prayer(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const P = SHIORI_PRAYER;
  f.vx = 0;
  if (!a.emitted) {
    a.emitted = true;
    a.mode = PRAYER.pray;
    a.tossAt = 0;
    const cpu = f.controller === null && g.netRole !== 'guest';
    a.anchor = cpu ? cpuPrayer(g, f) : -1;
    prayGlow.set(a, g.effect('shiori-pray', f.x, f.y, GOLD, .2, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing, n: 0, t0: 0 }));
  }
  if (a.mode === PRAYER.pray) {
    a.tossAt += dt;
    const glow = prayGlow.get(a);
    const stage = a.tossAt >= P.tome ? 2 : a.tossAt >= P.sonnet ? 1 : 0;
    if (glow) {
      if (stage > (glow.n ?? 0)) g.effect('shiori-pray-up', f.x, bodyY(f) - headOf(f) * .6, GOLD, .4, { n: stage, radius: headOf(f) });
      glow.n = stage;
      glow.t0 = a.tossAt;
      glow.life = Math.max(glow.life, .1);
    }
    if (a.t < s.start) return;
    // Still holding (or the CPU still praying): the clock waits just under the start.
    // An online guest's copy of the other side's fighter has no key to read: it keeps praying until the host's
    // state lets go (or the prayer is full), instead of firing petals of its own.
    const remote = f.controller === null && g.netRole === 'guest';
    const holding = remote || (a.anchor >= 0 ? a.tossAt < a.anchor : attackHeld(g, f));
    if (holding && a.tossAt < P.tome) {
      a.t = s.start - 1e-4;
      return;
    }
    a.mode = prayerStage(a.tossAt);
    a.t = s.start;
    a.shots = 0;
    if (glow) glow.life = Math.min(glow.life, .15);
    if (a.mode === PRAYER.tome) {
      const o = g.nearestEnemyTo(f, f.x);
      const ahead = o ? (o.x - f.x) * f.facing : -1;
      a.anchor = clamp(o && ahead > -30 && ahead < P.seek ? o.x : f.x + f.facing * P.aim, X_MIN, X_MAX);
      g.effect('shiori-tome', a.anchor, FLOOR, ORANGE, P.fall + .75, { radius: P.radius, t0: P.fall });
    }
  }
  const parts = prayerOf(s);
  const local = a.t - s.start;
  if (a.mode === PRAYER.haiku) {
    while (a.shots < 3 && local >= a.shots * P.haikuGap) {
      const i = a.shots++;
      shoot(g, f, a, parts.haiku[i], f.x + f.facing * 52, f.y - headOf(f) * .5 + (i - 1) * 10, f.facing * (s.speed ?? 760), 0);
    }
    return;
  }
  if (a.mode === PRAYER.sonnet) {
    while (a.shots < P.pages && local >= a.shots * P.sonnetSpan / (P.pages - 1)) {
      const i = a.shots++;
      const ang = P.fanUp + (P.fanDown - P.fanUp) * (i % 2 ? 1 - i / (P.pages - 1) : i / (P.pages - 1));
      const v = parts.page.speed ?? 720;
      shoot(g, f, a, parts.page, f.x + f.facing * 46, f.y - headOf(f) * .52, f.facing * Math.cos(ang) * v, Math.sin(ang) * v);
    }
    return;
  }
  if (a.mode === PRAYER.tome && a.shots === 0 && local >= P.fall) {
    a.shots = 1;
    a.hit.clear();
    let any = false;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      if (Math.abs(o.x - a.anchor) > P.radius || FLOOR - o.y > 150) continue;
      if (hit(g, f, o, parts.tome, a)) any = true;
    }
    g.shake = Math.max(g.shake, any ? 9 : 6);
    if (any) g.hitstop = Math.max(g.hitstop, .06);
  }
}
SCRIPTS[`${ID}-prayer`] = { update: step_prayer, noMelee: true };

/* ---- L 圣典裁决 ---- */

const charterParts = new WeakMap<Skill, { strikes: Skill[]; verdict: Skill }>();
function charterOf(s: Skill): { strikes: Skill[]; verdict: Skill } {
  let p = charterParts.get(s);
  if (!p) {
    p = {
      strikes: SHIORI_CHARTER.strikes.map((_, i) => withGuard({ ...s, finale: undefined }, i)),
      verdict: withGuard(withFinale(s, true), SHIORI_CHARTER.strikes.length),
    };
    charterParts.set(s, p);
  }
  return p;
}
/** a.hold is the foe the charter judges (locked at the raise); a.anchor the verdict's x (locked at aim);
 *  a.shots the acolytes sent so far; a.mode 1 once the verdict has landed. */
function step_charter(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = SHIORI_CHARTER;
  f.vx = 0;
  if (!a.emitted) {
    a.emitted = true;
    a.hold = -1;
    a.mode = 0;
    g.effect('shiori-charter', f.x, f.y, GOLD, s.duration + .2, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing, fighter: f.id, cast: { serial: a.serial, tail: .3 } });
  }
  if (a.t < S.raise) return;
  if (a.hold < 0) {
    const o = g.nearestEnemyTo(f, f.x);
    a.hold = o ? o.id : -2;
  }
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  const parts = charterOf(s);
  // The acolytes: each shows up beside the foe, then crosses through them to the far side.
  while (a.shots < S.strikes.length && a.t >= S.strikes[a.shots] - S.appear) {
    const i = a.shots++;
    const side = i % 2 ? 1 : -1;
    const cx = o ? o.x : f.x + f.facing * 300;
    const from = clamp(cx + side * S.side[i], X_MIN - 60, X_MAX + 60);
    const to = clamp(cx - side * S.side[i] * .7, X_MIN - 60, X_MAX + 60);
    g.effect('shiori-acolyte', from, FLOOR, GOLD, S.appear + S.cross + .3, { radius: to - from, dir: -side, n: i, t0: S.appear, fighter: f.id });
  }
  for (let i = 0; i < S.strikes.length; i++) {
    const at = S.strikes[i] + S.cross * .5;
    if (a.shots > i && a.liftAt <= i && a.t >= at) {
      a.liftAt = i + 1;
      if (o && o.hp > 0) {
        const side = i % 2 ? 1 : -1;
        a.hit.clear();
        // From the acolyte's side: one coming from behind cannot be blocked.
        if (hit(g, f, o, parts.strikes[i], a, o.x + side * 60)) {
          g.effect('shiori-acolyte-hit', o.x, o.y - headOf(o) * .55, GOLD, .35, { dir: -side, n: i });
          g.shake = Math.max(g.shake, 3);
        }
      }
    }
  }
  if (a.t >= S.gather && !(a.burst & 1)) {
    a.burst |= 1;
    const x = o ? o.x : f.x + f.facing * 300;
    g.effect('shiori-gather', x, FLOOR, GOLD, S.verdict - S.gather + .1, { follow: o?.id, ox: 0, oy: 0, radius: o ? headOf(o) : 181 });
  }
  if (a.t >= S.aim && !(a.burst & 2)) {
    a.burst |= 2;
    a.anchor = clamp(o ? o.x : f.x + f.facing * 300, X_MIN, X_MAX);
    g.effect('shiori-verdict', a.anchor, FLOOR, GOLD, S.verdict - S.aim + 1.1, { t0: S.verdict - S.aim, radius: 150 });
    g.effect('shiori-verdict-front', a.anchor, FLOOR, GOLD, S.verdict - S.aim + 1.1, { t0: S.verdict - S.aim, radius: 150 });
  }
  if (a.mode === 0 && a.t >= S.verdict) {
    a.mode = 1;
    a.hit.clear();
    for (const v of g.fighters) {
      if (!g.isEnemy(f, v) || v.hp <= 0 || v.echo) continue;
      if (Math.abs(v.x - a.anchor) > 110) continue;
      hit(g, f, v, parts.verdict, a, a.anchor);
    }
    g.flash = Math.max(g.flash, .18);
    g.shake = Math.max(g.shake, 12);
    g.hitstop = Math.max(g.hitstop, .08);
  }
}
SCRIPTS[`${ID}-charter`] = { update: step_charter, noMelee: true };
