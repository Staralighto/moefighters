import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { applyMelee, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { AKO_BIG_TOP, AKO_BIG_Y, AKO_CHANT, AKO_GATE, AKO_SPIRIT_SPEED } from './akoPath.ts';

/* 宇田川亚子 — Roselia 的鼓手，别号「暗之大魔姬」（萌娘百科）。Four scripts, registered on SCRIPTS by fx name
   (combat.ts imports this module once for the side effect):
     ako-hypno   U 宇田川催眠波      a spiral wave; a hit roots (定身) in the 'ako-hypno' look — asleep
     ako-chant   I 暗黑咏唱·提词版   the chant sticks (「……那个……是什么来着？」); a hit inside that window breaks the
                                    cast (no armour there) and gives back half the wait. Past it 燐子 slips her the
                                    line, armour comes on, and the dark orb goes out and knocks down
     ako-sister  O 世界第二强        two little hits; if one landed, 巴 (himari/friends.png) rises behind her and
                                    throws the third, heavy one
     ako-nfo     L 邪灵大法师·降临   the NFO frame; eight little spirits home in, then the big one drops — STAGE 1 CLEAR
   The pictures are in render/akoFx.ts; the shared numbers in akoPath.ts. Nothing here closes over a body: the chant
   window is a 'chant' mod, read back by a step watcher, so a lockstep dump resumes it. */

const PINK = '#DD0088';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}

/* ---- U 宇田川催眠波 ---- */

SCRIPTS['ako-hypno'] = {
  trail: 0, hitY: 80,
  update(g: FightGame, f: Fighter, a: Attack): void {
    if (a.mode !== undefined) return;
    a.mode = 0;
    // 龙之右眼: a great eye opens in front of her face, stares, and blinks the wave out.
    const h = headOf(f);
    g.effect('ako-eye', f.x + f.facing * 64, f.y - h * .8, PINK, a.skill.start + .25, {
      follow: f.id, ox: f.facing * 64, oy: -h * .8, dir: f.facing, fighter: f.id, t0: a.skill.start,
    });
  },
  pulse(g: FightGame, _p: Projectile, o: Fighter): void {
    if (o.root > 0 && o.rootFx === 'ako-hypno') {
      o.rootMark = 'ako-hypno';
      g.effect('ako-hypno@apply', o.x, o.y, PINK, .6, { follow: o.id, ox: 0, oy: 0 });
    }
  },
};

/* ---- I 暗黑咏唱·提词版 ---- */

/** a.mode: chanting, stuck, prompted. */
const CHANT = { reading: 0, stuck: 1, prompted: 2 } as const;
function step_chant(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const h = headOf(f);
  if (a.mode === undefined) {
    a.mode = CHANT.reading;
    const cast = { serial: a.serial, tail: .15 };
    g.effect('ako-circle', f.x, FLOOR, PINK, s.duration, { follow: f.id, ox: 0, oy: 0, radius: 70, fighter: f.id, cast });
    g.effect('ako-scroll', f.x, f.y - h - 30, PINK, s.duration, { follow: f.id, ox: 0, oy: -h - 30, dir: f.facing, fighter: f.id, cast });
    g.effect('ako-sigil', f.x - f.facing * 18, f.y - h * .52, PINK, s.duration, { follow: f.id, ox: -f.facing * 18, oy: -h * .52, radius: h * .5, dir: f.facing, fighter: f.id, cast });
  }
  if (a.t >= AKO_CHANT.stuckFrom && a.t < AKO_CHANT.stuckTo) {
    if (a.mode === CHANT.reading) {
      a.mode = CHANT.stuck;
      g.effect('ako-sweat', f.x, f.y - h, '#9fd8ff', AKO_CHANT.stuckTo - AKO_CHANT.stuckFrom, {
        follow: f.id, ox: -f.facing * 22, oy: -h + 4, fighter: f.id, cast: { serial: a.serial, tail: 0 },
      });
    }
    // No armour while she is stuck: a hit drops the attack, and the watcher below sees the mod outlive it.
    addMod(f, 'chant', .06, { v: a.index });
    return;
  }
  if (a.t >= AKO_CHANT.stuckTo && a.mode !== CHANT.prompted) {
    a.mode = CHANT.prompted;
    for (const m of f.mods) if (m.kind === 'chant') m.left = 0;
    addMod(f, 'poise', s.duration - a.t, { max: true });
    g.effect('ako-rinko', f.x - f.facing * 70, FLOOR, '#7a7cff', AKO_CHANT.rinko, { follow: f.id, ox: -f.facing * 70, oy: 0, dir: f.facing, radius: h * .96 });
    // The line comes back: her right eye flashes and the circle relights with a ring.
    g.effect('ako-glint', f.x + f.facing * 8, f.y - h * .83, '#ffffff', .8, { follow: f.id, ox: f.facing * 8, oy: -h * .83, dir: f.facing, t0: .22 });
    g.effect('ako-relight', f.x, FLOOR, PINK, .85, { follow: f.id, ox: 0, oy: 0, radius: 110, t0: .22 });
  }
}
SCRIPTS['ako-chant'] = {
  update: step_chant, trail: 0, hitY: 76,
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    g.effect('ako-impact', o.x, FLOOR, PINK, .8, { radius: 120, dir: Math.sign(p.vx) || 1 });
    g.shake = Math.max(g.shake, 7);
  },
};

/** Broken while stuck: the strip shatters, she says 「呜……」, and half the wait comes back. */
STEP_WATCHERS.push((g, f) => {
  const m = f.mods.find(x => x.kind === 'chant' && x.left > 0);
  if (!m) return;
  if (f.attack && f.attack.skill.fx === 'ako-chant') return;
  m.left = 0;
  const slot = m.v ?? 3;
  f.cooldowns[slot] = f.cooldowns[slot] * AKO_CHANT.refund;
  const h = headOf(f);
  g.effect('ako-fizzle', f.x, f.y - h - 30, PINK, .7, { follow: f.id, ox: 0, oy: -h - 30, dir: f.facing });
});

/* ---- O 世界第二强 ---- */

/** 巴 rises this far behind her, and her heavy hit reaches this much further than Ako's own. */
const SISTER_BACK = 46;
SCRIPTS['ako-sister'] = {
  noStamp: true,
  swing(g: FightGame, f: Fighter, a: Attack, s: Skill): void {
    const n = s.count ?? 3;
    const last = a.shots >= n - 1;
    if (last && !a.mode) return;
    const prev = a.skill;
    a.skill = withGuard(last && s.finale ? { ...s, ...s.finale, range: s.range + 40 } : s, a.shots);
    applyMelee(g, f, a);
    a.skill = prev;
    const landed = a.hit.size > 0;
    if (landed) a.mode = 1;
    const h = headOf(f);
    if (!last) {
      g.effect('ako-jab', f.x + f.facing * 70, f.y - h * (a.shots ? .38 : .55), PINK, .32, { dir: f.facing, radius: 30, n: a.shots, hit: landed });
      // After the second, if either landed: 巴 comes up behind her for the third.
      if (a.shots === n - 2 && a.mode) {
        g.effect('ako-tomoe', f.x - f.facing * SISTER_BACK, FLOOR, '#BB0033', .75, { follow: f.id, ox: -f.facing * SISTER_BACK, oy: 0, dir: f.facing });
      }
      return;
    }
    g.effect('ako-sister-hit', f.x + f.facing * 95, f.y - h * .5, '#BB0033', .55, { dir: f.facing, radius: 60, hit: landed });
    g.effect('ako-medals', f.x, f.y - h - 40, '#ffd66b', 1.1, { follow: f.id, ox: 0, oy: -h - 40, dir: f.facing });
    if (landed) g.shake = Math.max(g.shake, 6);
  },
};

/* ---- L 邪灵大法师·降临 ---- */

const nfoParts = new WeakMap<Skill, Skill[]>();
function nfoPart(s: Skill, i: number, big: boolean): Skill {
  const list = derive(nfoParts, s, () => [] as Skill[]);
  return list[i] ??= big
    ? withGuard({ ...s, ...s.finale, finale: undefined }, i)
    : withGuard({ ...s, finale: undefined, react: { kind: 'none', stun: 0 }, shake: 0, hitstop: 0, noSparks: true }, i);
}
/** a.mode: the little ones out, the warning ring up, the big one away. */
const NFO = { swarm: 0, warn: 1, dropped: 2 } as const;
function step_nfo(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.mode === undefined) {
    a.mode = NFO.swarm;
    g.effect('ako-nfo', 0, 0, PINK, s.duration + .4, { fighter: f.id, dir: f.facing, n: 0 });
    g.effect('ako-dim', 0, 0, PINK, s.duration + .3, { fighter: f.id });
    g.effect('ako-nfo-circle', f.x, FLOOR, PINK, s.duration, { follow: f.id, ox: 0, oy: 0, radius: 96 });
    g.effect('ako-gate', f.x - f.facing * AKO_GATE.back, FLOOR - AKO_GATE.y, PINK, s.duration, { follow: f.id, ox: -f.facing * AKO_GATE.back, oy: -AKO_GATE.y, radius: 78, dir: f.facing });
  }
  if (a.t < s.start) return;
  const n = s.count ?? 8;
  const gap = s.interval ?? .12;
  while (a.shots < n && a.t >= s.start + a.shots * gap) {
    const i = a.shots++;
    // Out of the gate behind her, flung up and forward before they turn on the foe.
    const gx = f.x - f.facing * AKO_GATE.back;
    g.projectiles.push({
      owner: f.id, x: gx + (g.random() - .5) * 30, y: FLOOR - AKO_GATE.y + (g.random() - .5) * 60,
      vx: f.facing * (120 + g.random() * 120), vy: -260 - g.random() * 160,
      life: s.life ?? 1.4, skill: nfoPart(s, i, false), color: PINK, radius: 22, size: s.size ?? 60,
      fx: 'ako-spirit', attack: a, hit: new Set(), trail: [], age: 0, solid: false, wave: i, face: f.facing,
    });
  }
  if (a.mode === NFO.swarm && a.shots >= n && a.t >= s.start + n * gap + AKO_CHANT.bigGap) {
    const o = g.nearestEnemyTo(f, f.x);
    a.mode = NFO.warn;
    a.tossAt = a.t;
    a.anchor = clamp(o ? o.x : f.x + f.facing * 240, X_MIN, X_MAX);
    g.effect('ako-warn', a.anchor, FLOOR, PINK, AKO_CHANT.bigWarn + .3, { radius: 100 });
    return;
  }
  if (a.mode === NFO.warn && a.t >= a.tossAt + AKO_CHANT.bigWarn) {
    a.mode = NFO.dropped;
    g.projectiles.push({
      owner: f.id, x: a.anchor, y: AKO_BIG_TOP, vx: 0, vy: 1150, life: 1, skill: nfoPart(s, n, true),
      color: PINK, radius: 86, size: 200, fx: 'ako-spirit-big', attack: a, hit: new Set(), trail: [], age: 0,
      solid: false, wave: n, face: f.facing,
    });
  }
}
SCRIPTS['ako-nfo'] = { update: step_nfo, noMelee: true, skipVolley: true, skipCount: true, trail: 0, commit: true, noSuperFx: true };
/** Every connecting spirit pops an RPG damage number and ticks the HIT counter on her game frame. */
function tally(g: FightGame, p: Projectile, o: Fighter, crit: boolean): void {
  g.effect(crit ? 'ako-crit' : 'ako-dmg', o.x + (g.random() - .5) * 40, o.y - headOf(o) - 10, crit ? '#ffd66b' : '#ffffff', crit ? 1.1 : .7, { n: p.skill.damage });
  for (const e of g.effects) if (e.type === 'ako-nfo' && e.fighter === p.owner) e.n = (e.n ?? 0) + 1;
}
SCRIPTS['ako-spirit'] = {
  trail: 0, hitY: 80, wide: true,
  pulse(g: FightGame, p: Projectile, o: Fighter): void { tally(g, p, o, false); },
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    // After a short rise, steer at the nearest foe's chest; a capped speed keeps a gap to walk through.
    if (p.age < .22) { p.vy += 900 * dt; return false; }
    const owner = g.fighterById(p.owner);
    const o = owner ? g.nearestEnemyTo(owner, p.x) : undefined;
    if (!o) return false;
    const tx = o.x - p.x, ty = (o.y - 90) - p.y;
    const d = Math.hypot(tx, ty) || 1;
    const k = Math.min(1, 5 * dt);
    p.vx += ((tx / d) * AKO_SPIRIT_SPEED - p.vx) * k;
    p.vy += ((ty / d) * AKO_SPIRIT_SPEED - p.vy) * k;
    return false;
  },
};
SCRIPTS['ako-spirit-big'] = {
  trail: 0, hitY: 200, wide: true,
  pulse(g: FightGame, p: Projectile, o: Fighter): void { tally(g, p, o, true); },
  after(g: FightGame, p: Projectile): boolean {
    if (p.returned || p.y < FLOOR - AKO_BIG_Y) return false;
    p.returned = true;
    p.y = FLOOR - AKO_BIG_Y;
    p.vy = 0;
    p.ticked = p.age;
    p.life = Math.min(p.life, .45);
    g.effect('ako-clear', 0, 0, '#ffd66b', 1.4, { fighter: p.owner });
    g.effect('ako-burst', p.x, FLOOR, PINK, .6, { radius: 120 });
    g.shake = Math.max(g.shake, 8);
    g.flash = Math.max(g.flash, .1);
    return false;
  },
};
