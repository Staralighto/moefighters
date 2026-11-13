import type { Skill, StatusApply } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { spawnShot, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { layStatus } from './status.ts';
import { CAST_WATCHERS, SCRIPTS } from './scripts.ts';
import {
  JELLY_OUT, SEA_BIG_SIZE, SEA_BIG_Y, SEA_DROP, SEA_GAP, SEA_RISE, SEA_TOP, SEA_WARN, STEPS, TRAIL, WANDER,
  fueeGlyph, jellyY, wanderAt,
} from './kanonPath.ts';

/* 松原花音 — Hello, Happy World! 的鼓手，别号「迷宫水母」（萌娘百科）。Four scripts, registered on SCRIPTS by fx name
   (combat.ts imports this module once for the side effect):
     kanon-lost   U 十米迷路   she wanders a looping trail to a random spot (untouchable on the way); a foe who walks
                              onto the footprints gets lost too (混乱, the 'kanon-maze' look)
     kanon-fuee   I 云之呼诶   ふ ぇ ぇ ぇ, each glyph its own shot, bigger down the line; the last one pushes
     kanon-jelly  O 迷宫水母   a jellyfish bobbing ahead of her; touching it stings (定身, the 'kanon-zap' look)
     kanon-sea    L 水母之海   the night aquarium: little jellyfish rise from the floor, then the big one drops
   越慌越稳 (心：「平时一直战战兢兢，关键时刻反而最稳」) is a cast watcher: at 30% hp or less, U I O come out with
   霸体 and 10% more damage. Every picture is in render/kanonFx.ts; the shared shapes in kanonPath.ts.
   Nothing here closes over a body: the walk is on the attack (liftAt → anchor), the trail and the jellyfish are
   shots — a lockstep dump resumes them. */

const BLUE = '#44DDFF';
/** One reused sample so the walk and the footprint span do not allocate a point per tick. */
const wanderPt = { x: 0, dy: 0 };

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
/** Hit variants of a skill, built once per skill object and shared by every cast. */
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}

/* ---- U 十米迷路 ---- */

/** Where she can end up: just past the foe, a little way from where she stood, or well away from the foe. */
const LOST = { behind: 90, near: 70, away: 300 } as const;
/** The footprints catch a body on the floor that walks onto them (not one standing still where they were laid). */
const TRAIL_PAD = 26;
const TRAIL_AIR = 24;
const TRAIL_MOVING = 30;
/** 一个路痴和一个不会搭电车的人: on 白鹭千圣 the 混乱 runs this much longer. */
const CHISATO_EXTRA = 1;

function step_lost(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.t < s.start) return;
  if (a.mode === undefined) {
    const o = g.nearestEnemyTo(f, f.x);
    const side = o ? (o.x >= f.x ? 1 : -1) : f.facing;
    // Fully random, as the meme wants: she does not choose where she ends up.
    const pick = Math.min(2, Math.floor(g.random() * 3));
    const to = pick === 0
      ? (o ? o.x + side * LOST.behind : f.x + side * LOST.behind * 2)
      : pick === 1 ? f.x + (g.random() * 2 - 1) * LOST.near
      : f.x - side * LOST.away;
    a.mode = 1;
    a.shots = pick;
    a.tossAt = a.t;
    a.liftAt = f.x;
    a.anchor = clamp(to, X_MIN, X_MAX);
    g.projectiles.push({
      owner: f.id, x: a.anchor, y: FLOOR, vx: 0, vy: 0, life: WANDER + TRAIL, skill: s, color: BLUE,
      radius: 0, size: 0, fx: 'kanon-trail', attack: a, hit: new Set(), trail: [], age: 0, solid: false,
      aim: a.liftAt, settled: true, wave: Math.floor(g.random() * 1000),
    });
    const h = headOf(f);
    g.effect('kanon-pin', f.x, f.y - h - 16, BLUE, WANDER + .1, { follow: f.id, ox: 0, oy: -h - 16 });
  }
  if (a.mode !== 1) return;
  const u = (a.t - a.tossAt) / WANDER;
  if (u < 1) {
    f.invuln = Math.max(f.invuln, .05);
    const before = f.x;
    f.x = clamp(wanderAt(a.liftAt, a.anchor, u, wanderPt).x, X_MIN, X_MAX);
    f.vx = 0;
    if (Math.abs(f.x - before) > .2) f.facing = f.x > before ? 1 : -1;
    return;
  }
  a.mode = 2;
  f.x = a.anchor;
  const o = g.nearestEnemyTo(f, f.x);
  if (o) f.facing = o.x >= f.x ? 1 : -1;
  const h = headOf(f);
  g.effect('kanon-huh', f.x, f.y - h - 26, BLUE, .8, { follow: f.id, ox: f.facing * 18, oy: -h - 26, dir: f.facing });
}
SCRIPTS['kanon-lost'] = { update: step_lost, customDash: true, noMelee: true, trail: 0 };

/** x at u = k/STEPS. The ends do not move, so the curve is sampled once per projectile. */
const trailXs = new WeakMap<Projectile, { from: number; to: number; xs: Float32Array }>();
function trailSamples(p: Projectile): Float32Array {
  const from = p.aim ?? p.x;
  const hit = trailXs.get(p);
  if (hit && hit.from === from && hit.to === p.x) return hit.xs;
  const xs = new Float32Array(STEPS + 1);
  for (let k = 0; k <= STEPS; k++) xs[k] = wanderAt(from, p.x, k / STEPS, wanderPt).x;
  trailXs.set(p, { from, to: p.x, xs });
  return xs;
}
/** The footprints laid so far span this much of the floor. */
function trailSpan(p: Projectile): { lo: number; hi: number } {
  const xs = trailSamples(p);
  const laid = Math.min(1, p.age / WANDER);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k <= STEPS; k++) {
    if (k / STEPS > laid) break;
    const x = xs[k];
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return { lo, hi };
}
SCRIPTS['kanon-trail'] = {
  trail: 0, wide: true,
  shot(g: FightGame, p: Projectile): boolean {
    if (g.netRole === 'guest' || p.age < .08) return true;
    const owner = g.fighterById(p.owner);
    const st = p.skill.status?.[0];
    if (!owner || !st) return true;
    const { lo, hi } = trailSpan(p);
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id) || isInvulnerable(o)) continue;
      if (o.y < FLOOR - TRAIL_AIR || o.x < lo - TRAIL_PAD || o.x > hi + TRAIL_PAD) continue;
      const moving = o.walk > 0 || Math.abs(o.vx) > TRAIL_MOVING || o.dodge > 0 || o.attack?.skill.type === 'dash';
      if (!moving) continue;
      p.hit.add(o.id);
      let lay: StatusApply = st;
      if (o.data.id === 'chisato') {
        lay = { ...st, time: st.time + CHISATO_EXTRA };
        const h = headOf(o);
        g.effect('kanon-chisato', o.x, o.y - h - 34, BLUE, 1, { follow: o.id, ox: 0, oy: -h - 34 });
      }
      layStatus(g, owner, o, lay, 'kanon-lost');
      g.effect('kanon-stepped', o.x, FLOOR, BLUE, .5, { radius: 30 });
    }
    return true;
  },
};

/* ---- I 云之呼诶 ---- */

/** The last glyph shoves. Not a derived skill: a lockstep dump carries a shot's skill as a roster reference, so the
 *  difference rides on the shot (`wave`) and lands here. */
const FUEE_SHOVE = 170;
SCRIPTS['kanon-fuee'] = {
  trail: 0, hitY: 64,
  volley(g: FightGame, f: Fighter, a: Attack): void {
    const s = a.skill;
    const n = s.count ?? 4;
    while (a.shots < n && a.t >= s.start + a.shots * (s.interval ?? .09)) {
      const i = a.shots++;
      if (i === 0) g.effect('kanon-cloud', f.x + f.facing * 40, f.y - headOf(f) * .62, '#ffffff', .7, { dir: f.facing });
      const p = spawnShot(g, f, a, -12, i);
      const { scale } = fueeGlyph(i);
      p.wave = i;
      p.size = (s.size ?? 80) * scale;
      p.radius = Math.min(54, p.size * .24);
      p.ticked = n - 1;
    }
  },
  pulse(_g: FightGame, p: Projectile, o: Fighter): void {
    if (p.wave !== p.ticked || o.blocking) return;
    o.vx = (Math.sign(p.vx) || 1) * FUEE_SHOVE;
  },
};

/* ---- O 迷宫水母 ---- */

SCRIPTS['kanon-jelly'] = {
  trail: 0, hitY: 54, oneShot: true,
  emit(g: FightGame, f: Fighter, a: Attack): void {
    const s = a.skill;
    // One on the field: a new one replaces the old.
    for (const p of g.projectiles) if (p.fx === 'kanon-jelly' && p.owner === f.id) p.life = 0;
    const x = clamp(f.x + f.facing * JELLY_OUT, X_MIN + 20, X_MAX - 20);
    g.projectiles.push({
      owner: f.id, x, y: FLOOR - jellyY(0), vx: 0, vy: 0, life: s.life ?? 4, skill: s, color: BLUE,
      radius: 26, size: s.size ?? 80, fx: 'kanon-jelly', attack: a, hit: new Set(), trail: [], age: 0, solid: false,
      face: f.facing, hue: Math.floor(g.random() * 360),
    });
    g.effect('kanon-bloom', x, FLOOR - jellyY(0), BLUE, .5, { radius: 40 });
  },
  shot(_g: FightGame, p: Projectile): boolean {
    p.y = FLOOR - jellyY(p.age);
    return false;
  },
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    if (o.root > 0 && o.rootFx === 'kanon-jelly') {
      o.rootMark = 'kanon-zap';
      g.effect('kanon-zap@apply', o.x, o.y, BLUE, .6, { follow: o.id, ox: 0, oy: 0 });
    }
    g.effect('kanon-sting', p.x, p.y, BLUE, .45, { radius: 44 });
  },
};

/* ---- L 水母之海 ---- */

const seaParts = new WeakMap<Skill, Skill[]>();
function seaPart(s: Skill, i: number, big: boolean): Skill {
  const list = derive(seaParts, s, () => [] as Skill[]);
  return list[i] ??= big
    ? withGuard({ ...s, ...s.finale, finale: undefined }, i)
    : withGuard({ ...s, finale: undefined, react: { kind: 'none', stun: 0 }, shake: 0, hitstop: 0, noSparks: true }, i);
}
/** a.mode: the little ones rising, the warning ring up, the big one away. */
const SEA = { rise: 0, warn: 1, dropped: 2 } as const;
function step_sea(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.mode === undefined) {
    a.mode = SEA.rise;
    g.effect('kanon-sea', 0, 0, BLUE, s.duration + .3, { fighter: f.id });
    g.effect('kanon-hug', f.x, f.y, BLUE, s.duration, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
  }
  if (a.t < s.start) return;
  const n = s.count ?? 12;
  const gap = s.interval ?? .1;
  while (a.shots < n && a.t >= s.start + a.shots * gap) {
    const i = a.shots++;
    const x = X_MIN + 30 + g.random() * (X_MAX - X_MIN - 60);
    const k = .8 + g.random() * .45;
    g.projectiles.push({
      owner: f.id, x, y: FLOOR + 40, vx: 0, vy: -SEA_RISE * k, life: s.life ?? 2.4, skill: seaPart(s, i, false),
      color: BLUE, radius: 18, size: (s.size ?? 60) * k, fx: 'kanon-sea-small', attack: a, hit: new Set(), trail: [], age: 0,
      solid: false, hue: (i * 47) % 70 - 35, wave: i,
    });
  }
  if (a.mode === SEA.rise && a.shots >= n && a.t >= s.start + n * gap + SEA_GAP) {
    const o = g.nearestEnemyTo(f, f.x);
    a.mode = SEA.warn;
    a.tossAt = a.t;
    a.anchor = clamp(o ? o.x : f.x + f.facing * 240, X_MIN, X_MAX);
    g.effect('kanon-warn', a.anchor, FLOOR, BLUE, SEA_WARN + .3, { radius: 110 });
    return;
  }
  if (a.mode === SEA.warn && a.t >= a.tossAt + SEA_WARN) {
    a.mode = SEA.dropped;
    g.projectiles.push({
      owner: f.id, x: a.anchor, y: SEA_TOP, vx: 0, vy: SEA_DROP, life: 1, skill: seaPart(s, n, true),
      color: BLUE, radius: 92, size: SEA_BIG_SIZE, fx: 'kanon-sea-big', attack: a, hit: new Set(), trail: [], age: 0,
      solid: false, wave: n,
    });
  }
}
SCRIPTS['kanon-sea'] = { update: step_sea, noMelee: true, skipVolley: true, skipCount: true, trail: 0, commit: true };
SCRIPTS['kanon-sea-small'] = { trail: 0, hitY: 70, wide: true };
SCRIPTS['kanon-sea-big'] = {
  trail: 0, hitY: 210, wide: true,
  after(g: FightGame, p: Projectile): boolean {
    if (p.returned || p.y < FLOOR - SEA_BIG_Y) return false;
    // Down over them: the tentacles close, a blue-white flash, and it fades.
    p.returned = true;
    p.y = FLOOR - SEA_BIG_Y;
    p.vy = 0;
    p.ticked = p.age;
    p.life = Math.min(p.life, .45);
    g.effect('kanon-shock', p.x, FLOOR, '#e8fbff', .6, { radius: 120 });
    g.shake = Math.max(g.shake, 8);
    g.flash = Math.max(g.flash, .12);
    return false;
  },
};

/* ---- 越慌越稳 ---- */

const STEADY_AT = .3;
const STEADY_DMG = 1.1;
CAST_WATCHERS.push((g, f, slot) => {
  const a = f.attack;
  if (f.data.id !== 'kanon' || slot < 2 || slot > 4 || !a || f.hp > f.data.hp * STEADY_AT) return;
  // A per-cast copy, as 一个人才行 does: the shared skill data stays as written.
  a.skill = { ...a.skill, damage: Math.round(a.skill.damage * STEADY_DMG) };
  addMod(f, 'poise', a.skill.duration, { max: true });
  g.effect('kanon-steady', f.x, f.y, BLUE, a.skill.duration + .2, { follow: f.id, ox: 0, oy: 0, radius: headOf(f) });
});
