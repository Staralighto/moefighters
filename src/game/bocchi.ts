import type { Skill } from '../data/types.ts';
import { skill } from '../data/skills.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { applyMelee, hit, spawnShot, withGuard } from './combat.ts';
import { addMod, has } from './mods.ts';
import { CAST_WATCHERS, SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { BOCCHI_HERO, BOCCHI_OUT } from '../render/clips.ts';

/* 后藤一里（波奇）— 孤独摇滚！/ 结束乐队的主音吉他。The first fighter from outside BanG Dream!.
   The kit is 形态不定: U I O are never thrown in her own shape, and L is the only moment she looks cool.
     bocchi-box     U 完熟芒果       inside the mango box: the body is hidden, the box slides and bumps
     bocchi-tsuchi  I 下北泽槌子蛇   a tsuchinoko along the floor, under everything, biting an ankle
     bocchi-like    O 给我点赞       the 承认欲求怪兽 behind her breathes a stream of thumbs-up
     bocchi-hero    L 吉他英雄       the solo: scrolling 弹幕 are the hits; then the stage dive, face first
   Passives. 一个人才行: U I O hit harder when nobody is near at the cast, softer when someone is in her face.
   崩坏: knocked onto the floor she comes apart into a scribble instead of lying there, cannot be touched, and is
   sanded back into shape (the 青春情结 collapse; game state is an internal move, so the body is held and hidden
   by the same machinery as any other pose).
   The four pictures (box, kaiju, tsuchinoko, the scribble) are separate PNGs under public/sprites/bocchi/;
   everything that moves them is render/bocchiFx.ts. */

const PINK = '#F5A9C0';
const HOT = '#ff5c9a';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- 一个人才行 ---- */

/** Nobody within `far` at the cast: U I O deal `up`. Someone within `near`: `down`. */
const ALONE = { far: 300, near: 120, up: 1.2, down: .85 } as const;
const scale = (n: number, k: number) => Math.round(n * k);
CAST_WATCHERS.push((g, f, slot) => {
  const a = f.attack;
  if (f.data.id !== 'bocchi' || slot < 2 || slot > 4 || !a) return;
  const foe = g.nearestEnemyTo(f, f.x);
  const gap = foe ? Math.abs(foe.x - f.x) : Infinity;
  const k = gap >= ALONE.far ? ALONE.up : gap <= ALONE.near ? ALONE.down : 1;
  if (k === 1) return;
  // A per-cast copy, the same way a frenzy boosts J / K: the shared skill data stays as written.
  a.skill = { ...a.skill, damage: scale(a.skill.damage, k) };
  if (k > 1) g.effect('bocchi-alone', f.x, FLOOR, PINK, .5, { follow: f.id, ox: 0, oy: FLOOR - f.y, radius: headOf(f) });
});

/* ---- U 完熟芒果 ---- */

/** Damage taken inside the box. */
const BOX_CUT = .6;
/** a.mode: 0 crouching, 1 in the box, 2 out again. */
function step_box(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const end = s.duration - BOCCHI_OUT;
  const mode = a.mode ?? 0;
  if (mode === 0) {
    if (a.t < s.start) return;
    a.mode = 1;
    f.y = FLOOR;
    f.vy = 0;
    g.effect('bocchi-box', f.x, FLOOR, PINK, end - s.start + .12, {
      follow: f.id, dir: f.facing, fighter: f.id, cast: { serial: a.serial, mode: 1, tail: 0 },
    });
    g.effect('bocchi-puff', f.x, FLOOR, '#e9d9b8', .35, { radius: 40 });
  }
  if (a.mode === 1) {
    if (a.t < end) {
      f.x = clamp(f.x + f.facing * (s.speed ?? 430) * dt, X_MIN, X_MAX);
      f.vx = 0;
      applyMelee(g, f, a);
      return;
    }
    a.mode = 2;
    g.effect('bocchi-box-pop', f.x, FLOOR, PINK, .5, { dir: f.facing });
  }
}
SCRIPTS['bocchi-box'] = {
  update: step_box, customDash: true,
  hideWhile: (a: Attack) => a.mode === 1,
  brace: (a: Attack) => a.mode === 1 ? BOX_CUT : undefined,
};

/* ---- I 下北泽槌子蛇 ---- */

/** a.mode: 0 going down, 1 crawling, 2 getting up. */
function step_tsuchi(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const end = s.duration - BOCCHI_OUT;
  const mode = a.mode ?? 0;
  if (mode === 0) {
    if (a.t < s.start) return;
    a.mode = 1;
    f.y = FLOOR;
    f.vy = 0;
    g.effect('bocchi-tsuchi', f.x, FLOOR, PINK, end - s.start + .1, {
      follow: f.id, dir: f.facing, fighter: f.id, cast: { serial: a.serial, mode: 1, tail: .08 },
    });
    g.effect('bocchi-puff', f.x, FLOOR, '#e9d9b8', .3, { radius: 30 });
  }
  if (a.mode !== 1) return;
  // Flat on the floor: nothing reaches her while she crawls.
  f.invuln = Math.max(f.invuln, .05);
  if (a.t < end) {
    f.x = clamp(f.x + f.facing * (s.speed ?? 620) * dt, X_MIN, X_MAX);
    f.vx = 0;
    applyMelee(g, f, a);
    if (!a.hit.size) return;
    // The bite ends the crawl where it landed.
    g.effect('bocchi-bite', f.x + f.facing * 46, FLOOR - 22, HOT, .3, { dir: f.facing });
    a.t = Math.max(a.t, end);
  }
  a.mode = 2;
  g.effect('bocchi-puff', f.x, FLOOR, '#e9d9b8', .3, { radius: 30 });
}
SCRIPTS['bocchi-tsuchi'] = {
  update: step_tsuchi, customDash: true,
  hideWhile: (a: Attack) => a.mode === 1,
};

/* ---- O 给我点赞 ---- */

SCRIPTS['bocchi-like'] = {
  trail: 0,
  noteOff: [-14, 10, -4, 16, -10, 4],
  update(g: FightGame, f: Fighter, a: Attack): void {
    if (a.mode) return;
    a.mode = 1;
    // The 承认欲求怪兽 rises behind her for the whole pose.
    g.effect('bocchi-kaiju', f.x - f.facing * 34, FLOOR, PINK, a.skill.duration + .15, {
      dir: f.facing, radius: headOf(f), t0: a.skill.start, fighter: f.id, cast: { serial: a.serial, tail: .18 },
    });
  },
  pulse(g: FightGame, p: Projectile, target: Fighter): void {
    // The follower count jumps with every thumb that lands (a.liftAt is free on a volley: it counts them).
    const n = ++p.attack.liftAt;
    g.text('赞 ×' + n, target.x, target.y - headOf(target) - 14 - n * 3, n >= 5 ? HOT : PINK, .55, 14 + n);
    g.effect('bocchi-heart', p.x, p.y, HOT, .35, { n });
  },
};

/* ---- L 吉他英雄 ---- */

/** The comments scroll in from behind her (this far back, so they are already moving when they pass her), in
 *  lanes above the floor. The back wall of comments that fills the screen is only a picture (bocchiFx.ts). */
const DANMAKU_BACK = 150;
const DANMAKU_LANES = [96, 58, 134, 76, 116] as const;
/** After the last comment she waits this long and flies this long with this much hop. She lands `short` of the
 *  nearest foe ahead, no nearer than `min` and no farther than `max`; the dive catches bodies within `reach`. */
const HERO = { gap: .3, dive: .3, hop: 46, reach: 90, short: 36, min: 150, max: 340 } as const;
const diveSkills = new WeakMap<Skill, Skill>();
function diveOf(s: Skill): Skill {
  let v = diveSkills.get(s);
  if (!v) diveSkills.set(s, v = withGuard({ ...s, ...s.finale, finale: undefined, count: 1 }, s.count ?? 1));
  return v;
}
function heroDiveAt(s: Skill): number {
  return s.start + (s.count ?? 1) * (s.interval ?? .15) + HERO.gap;
}
function cast_hero(g: FightGame, f: Fighter): void {
  const a = f.attack;
  if (!a) return;
  g.effect('bocchi-stage', f.x, 0, PINK, a.skill.duration, {
    fighter: f.id, follow: f.id, cast: { serial: a.serial, tail: .3 },
  });
  g.effect('super-zoom', f.x, f.y - 90, '#000000', .75, { radius: 1.1 });
}
function volley_hero(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const count = s.count ?? 1;
  while (a.shots < count && a.t >= s.start + a.shots * (s.interval ?? .15)) {
    const i = a.shots++;
    const p = spawnShot(g, f, a, 0, i);
    p.x = f.x - f.facing * DANMAKU_BACK;
    p.y = FLOOR - DANMAKU_LANES[i % DANMAKU_LANES.length];
    p.life = (W + 160) / Math.abs(p.vx);
    // Which comment this one is (render/bocchiFx.ts DANMAKU); `wave` is a free per-shot number.
    p.wave = i;
  }
}
function step_hero(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? BOCCHI_HERO.play;
  if (mode === BOCCHI_HERO.play) {
    if (a.t < heroDiveAt(s)) return;
    a.mode = BOCCHI_HERO.dive;
    a.tossAt = a.t;
    a.hit = new Set();
    // Where she takes off (liftAt) and where she will land (anchor).
    let gap = Infinity;
    for (const o of g.opponents(f)) {
      const ahead = (o.x - f.x) * f.facing;
      if (ahead > 0 && ahead < gap) gap = ahead;
    }
    a.liftAt = f.x;
    a.anchor = clamp(f.x + f.facing * clamp(gap - HERO.short, HERO.min, HERO.max), X_MIN, X_MAX);
    g.effect('bocchi-puff', f.x, FLOOR, '#e9d9b8', .3, { radius: 34 });
  }
  if (a.mode !== BOCCHI_HERO.dive) return;
  const u = (a.t - a.tossAt) / HERO.dive;
  if (u < 1) {
    f.invuln = Math.max(f.invuln, .05);
    f.x = a.liftAt + (a.anchor - a.liftAt) * u;
    f.vx = 0;
    f.vy = 0;
    f.y = FLOOR - HERO.hop * 4 * u * (1 - u);
    const dive = diveOf(s);
    for (const o of g.fighters) {
      if (o.hp <= 0 || o.echo || a.hit.has(o.id) || !g.isEnemy(f, o) || isInvulnerable(o)) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead > -24 && ahead < HERO.reach && Math.abs(o.y - f.y) < 130) hit(g, f, o, dive, a);
    }
    return;
  }
  // Nobody catches her.
  f.y = FLOOR;
  a.mode = BOCCHI_HERO.down;
  g.effect('bocchi-flop', f.x + f.facing * 30, FLOOR, PINK, .5, { dir: f.facing });
  g.shake = Math.max(g.shake, 5);
}
SCRIPTS['bocchi-hero'] = {
  cast: cast_hero, volley: volley_hero, update: step_hero,
  trail: 0, noSuperFx: true, wide: true, hitY: 84,
};

/* ---- 崩坏 ---- */

/** Seconds between two collapses, how long she is a scribble, and the no-flinch after she is sanded back. */
const CRUMBLE = { cd: 12, time: .95, poise: .6 } as const;
/** Not one of her six: the pose that holds her while she is a scribble. Never cast from a key. */
const CRUMBLE_POSE: Skill = skill(1, 'endure', '崩坏', {
  damage: 0, range: 0, start: 0, duration: CRUMBLE.time, cd: 0, fx: 'bocchi-crumble', brief: '', detail: '',
});
function held(g: FightGame, f: Fighter): boolean {
  for (const o of g.fighters) if (o.attack?.hold === f.id && g.isEnemy(o, f)) return true;
  return false;
}
SCRIPTS['bocchi-crumble'] = {
  noMelee: true,
  hideWhile: (a: Attack) => a.t < a.skill.duration - BOCCHI_OUT * .5,
  update(g: FightGame, f: Fighter, a: Attack, dt: number): void {
    const out = a.skill.duration - BOCCHI_OUT * .5;
    f.vx = 0;
    f.vy = 0;
    f.y = FLOOR;
    if (a.t < out) { f.invuln = Math.max(f.invuln, .08); return; }
    if (a.t - dt >= out) return;
    // Sanded back into shape (喜多 and 凉 did it with sandpaper).
    addMod(f, 'poise', CRUMBLE.poise, { max: true });
    f.invuln = Math.max(f.invuln, .2);
    g.effect('bocchi-sand', f.x, FLOOR, '#ffffff', .45, { radius: headOf(f), dir: f.facing });
  },
};
STEP_WATCHERS.push((g, f) => {
  if (f.data.id !== 'bocchi' || f.echo || f.minion) return;
  let m = f.mods.find(x => x.kind === 'crumble');
  if (!m) {
    // Armed once per body; v is the game age it is ready again.
    if (f.hp > 0) m = addMod(f, 'crumble', 1e6, { v: 0 });
    return;
  }
  // Only a body that was knocked down and has reached the floor; a super or a hold keeps what it caught.
  if (f.hp <= 0 || f.knocked <= 0 || f.y < FLOOR - .1 || f.vy < 0) return;
  if (g.age < (m.v ?? 0) || f.attack || f.hitBySuper || f.ban > 0 || f.root > 0 || has(f, 'follow') || held(g, f)) return;
  m.v = g.age + CRUMBLE.cd;
  f.knocked = 0;
  f.downTime = 0;
  f.stun = 0;
  f.vx = 0;
  f.vy = 0;
  f.y = FLOOR;
  f.queue = [];
  f.invuln = Math.max(f.invuln, .1);
  f.attack = {
    skill: CRUMBLE_POSE, index: 1, form: f.form, serial: ++f.attackSerial, t: 0, emitted: true, shots: 0, hit: new Set(),
    burst: 0, endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: f.x,
  };
  g.effect('bocchi-crumble', f.x, FLOOR, PINK, CRUMBLE.time - BOCCHI_OUT * .5 + .06, {
    follow: f.id, dir: f.facing, radius: headOf(f), fighter: f.id, cast: { serial: f.attack.serial, tail: .08 },
  });
  g.hitstop = Math.max(g.hitstop, .05);
});
