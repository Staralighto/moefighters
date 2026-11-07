import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, withFinale, withGuard } from './combat.ts';
import { SCRIPTS } from './scripts.ts';
import {
  BURROW, BURROW_HIGH, BURROW_POP, BURROW_REACH, BURROW_SHORT, BURROW_TAIL, BURROW_WAIT,
  POLICE, POLICE_CUFF, POLICE_LUNGE, POLICE_TAIL, RABBIT_COATS, rabbitHop,
  WARREN, WARREN_BIG, WARREN_BIG_LEAD, WARREN_DIVE, WARREN_FALL, WARREN_FIRST, WARREN_GAP, WARREN_HOLES,
  WARREN_KICK_H, WARREN_LEAD, WARREN_ORDER, WARREN_RISE, WARREN_TAIL, WARREN_TOP,
} from '../render/clips.ts';

/* 花园多惠 — Poppin'Party 的主音吉他。天然、电波，家里养着至少 23 只兔子，最爱异色瞳的小欧（萌娘百科）。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     tae-burrow  U 神出鬼没           down a rabbit hole, up out of one under the foe
     tae-police  I 花园警察，出动！   the cap, a lunge and the cuffs; caught mid-move is 现行犯
     tae-hop     O 欢迎来到兔子王国   five rabbits out of a hole, hopping at the foe (each one a tae-rabbit shot)
     tae-warren  L 花园兔王           a warren round the foe, rabbits kicking them up, 小欧, her rabbit kick
   Shared numbers and the cell picks live in clips.ts, every picture in render/taeFx.ts. Every rabbit is drawn in
   code, never a picture, so a coat is just an index (0 is 小欧).

   Whatever belongs to a move while it runs (the siren, the crown, the warren's holes, the moon) is *kept*: the
   move refreshes a short life every tick, so anything that cuts it short — a grab, a KO, the round ending — lets
   it fade within its linger time, with no cleanup path to forget. */

const DIRT = '#7a5a3e';
const WHITE = '#f8f6f2';
const DUST = '#c9b394';

/** Keep `type` on her this tick, creating it the first time; it lingers `life` seconds once nobody keeps it.
 *  Kept effects are owned through `fighter`; they follow her unless `extra` says otherwise. `age` is set to the
 *  attack clock (callers may rebase it). */
function keepOn(g: FightGame, f: Fighter, a: Attack, type: string, color: string, life: number, extra: Partial<Effect> = {}): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, f.x, f.y, color, life, { follow: f.id, ox: 0, oy: 0, ...extra, fighter: f.id });
  // Top the life back up and stretch max by the same amount, so the effect's own clock keeps counting.
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  e.dir = f.facing;
  e.age = a.t;
  return e;
}
/** Hit variants of a skill, built once per skill object and shared by every cast. */
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
/** The skill with its finale folded in, the finale itself dropped. */
const finaleOf = (s: Skill): Skill => ({ ...s, ...s.finale, finale: undefined });
/** Live foes standing within `reach` of x and no higher than `air` off the floor. */
function* foesAround(g: FightGame, f: Fighter, x: number, reach: number, air: number): Generator<Fighter> {
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - x) <= reach && o.y >= FLOOR - air) yield o;
  }
}
/** Hold the body still where a move put it. */
function pin(o: Fighter, stun: number): void {
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, stun);
}

/* ---- U 神出鬼没 ---- */

/** The pop catches bodies this close to the far hole and no higher than this off the floor. */
const BURROW_R = 82;
const BURROW_AIR = 150;
/** 神出鬼没 (萌娘百科别号「瞬移怪」; 兔子「静若处子，动如脱兔」): she drops into a rabbit hole at her feet and is gone.
 *  A hole opens where the nearest foe (within reach) stood that moment and two white ears poke out of it — the
 *  tell; step off it or jump. Then she comes up out of it with 小欧 and both of them throw whoever is on it into
 *  the air. No guard holds a hit from under the floor (noBlock in data). a.mode walks BURROW; a.anchor is the
 *  far hole, a.tossAt the dig, a.liftAt the pop. */
function step_burrow(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? BURROW.dig;
  if (mode === BURROW.dig) {
    if (a.t < s.start) return;
    const foe = g.nearestEnemyTo(f, f.x);
    const mark = foe && Math.abs(foe.x - f.x) <= BURROW_REACH ? foe.x : f.x + f.facing * BURROW_SHORT;
    a.anchor = clamp(mark, X_MIN + 20, X_MAX - 20);
    a.tossAt = a.t;
    a.mode = BURROW.under;
    g.effect('tae-dig', f.x + f.facing * 8, FLOOR, DIRT, .55, { dir: f.facing, radius: 34 });
    g.effect('tae-hole', a.anchor, FLOOR, DIRT, BURROW_WAIT + BURROW_POP + .3, { radius: 34 });
    g.effect('tae-ears', a.anchor, FLOOR, WHITE, BURROW_WAIT + .05, { dir: f.facing });
    return;
  }
  if (mode === BURROW.under) {
    f.invuln = Math.max(f.invuln, .06);
    pin(f, 0);
    f.y = FLOOR;
    if (a.t < a.tossAt + BURROW_WAIT) return;
    f.x = a.anchor;
    const foe = g.nearestEnemyTo(f, f.x);
    if (foe && Math.abs(foe.x - f.x) > 6) f.facing = foe.x > f.x ? 1 : -1;
    a.mode = BURROW.pop;
    a.liftAt = a.t;
    a.hit = new Set();
    // From under them: the knock goes the way she faces.
    for (const o of foesAround(g, f, a.anchor, BURROW_R, BURROW_AIR)) hit(g, f, o, s, a, a.anchor - f.facing);
    // 小欧 comes up with her, on the same beat (no lead: the hit is already in).
    g.effect('tae-pop', a.anchor + f.facing * 16, FLOOR, WHITE, .5, { n: 0, dir: f.facing, t0: .08, tx: 0, ty: -BURROW_HIGH * .7 });
    g.effect('tae-dirt', a.anchor, FLOOR, DIRT, .5, { radius: 50 });
    g.shake = Math.max(g.shake, 4);
    return;
  }
  if (mode === BURROW.pop) {
    const u = (a.t - a.liftAt) / BURROW_POP;
    pin(f, 0);
    if (u < 1) { f.y = FLOOR - BURROW_HIGH * 4 * u * (1 - u); return; }
    f.y = FLOOR;
    a.mode = BURROW.done;
    g.effect('tae-dust', f.x, FLOOR, DUST, .35, { radius: 22, dir: f.facing });
    a.t = Math.max(a.t, s.duration - BURROW_TAIL);
  }
}
SCRIPTS['tae-burrow'] = Object.assign(SCRIPTS['tae-burrow'] ?? {}, {
  update: step_burrow, noMelee: true, hideWhile: (a: Attack) => a.mode === BURROW.under,
});

/* ---- I 花园警察，出动！ ---- */

/** She holds them this close for the cuffs; caught mid-move (现行犯), the 定身 runs this long. */
const POLICE_REACH = 50;
const POLICE_RED = 3;
const policeParts = new WeakMap<Skill, Skill>();
/** 花园警察，出动！ (官方四格「花园 land」: 伪造签证的话，花园警察会出动的哦; 第三季第 1 话「逮捕だ！」「花園警察だぞ」;
 *  B 站「花园警察，出动」出警表情包): the cap snaps on, red and blue lights blink at her temple for as long as the
 *  move runs, a short lunge — and the cuffs. A plain catch roots them; catching someone in the middle of a move is
 *  现行犯 and roots them longer. The root wears the 'cuffs' look. a.mode walks POLICE; a.tossAt the catch. */
function step_police(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  if (a.shots === 0) {
    a.shots = 1;
    g.effect('tae-cap', f.x, f.y, '#2a3a66', .45, { follow: f.id, ox: 0, oy: 0, dir: f.facing });
  }
  keepOn(g, f, a, 'tae-siren', '#ff3a4a', .12);
  const mode = a.mode ?? POLICE.lunge;
  if (mode === POLICE.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && Math.abs(o.y - f.y) < 112 && !isInvulnerable(o)) {
      // 现行犯: caught with a move of their own still running.
      const red = !!o.attack;
      f.x = clamp(o.x - f.facing * POLICE_REACH, X_MIN, X_MAX);
      a.hit = new Set();
      const skill = red ? derive(policeParts, s, k => ({ ...k, root: POLICE_RED })) : s;
      if (hit(g, f, o, skill, a)) {
        if (o.root > 0 && o.rootFx === s.fx) {
          o.rootMark = 'cuffs';
          g.effect('cuffs@apply', o.x, o.y, f.data.color, .6, { follow: o.id, ox: 0, oy: 0 });
        }
        g.text(red ? '现行犯，逮捕！' : '逮捕！', f.x, f.y - 222, f.data.color, .9, red ? 19 : 18);
        g.hitstop = Math.max(g.hitstop, .06);
      }
      a.mode = POLICE.cuff;
      a.tossAt = a.t;
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 560) * dt, X_MIN, X_MAX);
    if (a.t >= s.start + POLICE_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = POLICE.done;
      a.t = Math.max(a.t, s.duration - POLICE_TAIL);
    }
    return;
  }
  if (mode === POLICE.cuff && a.t >= a.tossAt + POLICE_CUFF) {
    a.mode = POLICE.done;
    a.t = Math.max(a.t, s.duration - POLICE_TAIL);
  }
}
SCRIPTS['tae-police'] = Object.assign(SCRIPTS['tae-police'] ?? {}, { update: step_police, noMelee: true });

/* ---- O 欢迎来到兔子王国 ---- */

/** A rabbit's body centre sits this far over the floor between hops; that is the height its hit is read at. */
const RABBIT_BODY = 20;
/** A rabbit that never reached anyone dives back underground this long before its life runs out. */
const RABBIT_DIVE = .2;
/** Out of the hole a little ahead of her feet. */
const RABBIT_OUT = 52;
/** 欢迎来到兔子王国 (官方四格「花园 land」: 多惠请人参观她的兔子王国): she pats the floor and the rabbits come out of a
 *  hole in front of her one after another — 小紫、团十郎、可可亚、BB King, and 小欧 last — and hop along the floor at
 *  the foe. Each is its own blockable shot that a jump clears; the last one is the heavy one. A rabbit that
 *  touches someone somersaults back and burrows away (萌娘百科: 连兔子形状的面包都舍不得吃 — they never get hurt). */
function step_hop(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.t < s.start) return;
  const count = s.count ?? 5;
  const gap = s.interval ?? .2;
  while (a.shots < count && a.t >= s.start + a.shots * gap) {
    const i = a.shots++;
    const x = f.x + f.facing * RABBIT_OUT;
    if (i === 0) g.effect('tae-hole', x, FLOOR, DIRT, count * gap + .4, { radius: 26 });
    const last = i === count - 1;
    g.projectiles.push({
      owner: f.id, x, y: FLOOR - RABBIT_BODY,
      vx: f.facing * (s.speed ?? 380) * (1 + (i % 2) * .06), vy: 0, life: s.life ?? 2, skill: withFinale(s, last), color: WHITE,
      radius: last ? 22 : 18, size: s.size ?? 60, fx: 'tae-rabbit', attack: a, hit: new Set(), trail: [], age: 0, solid: false,
      // The coat: 小欧 (0) comes last; the others take turns.
      wave: last ? 0 : 1 + (i % (RABBIT_COATS - 1)),
    });
  }
}
SCRIPTS['tae-hop'] = Object.assign(SCRIPTS['tae-hop'] ?? {}, { update: step_hop, noMelee: true, skipVolley: true, skipCount: true });
SCRIPTS['tae-rabbit'] = Object.assign(SCRIPTS['tae-rabbit'] ?? {}, {
  trail: 0,
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    const coat = p.wave ?? 1;
    const dir = Math.sign(p.vx) || 1;
    if (p.life <= RABBIT_DIVE) {
      g.effect('tae-dive', p.x, FLOOR, p.color, .5, { n: coat, dir });
      p.life = 0;
      return true;
    }
    const now = rabbitHop(p.age, coat);
    // Each landing kicks up a little dust.
    if (p.age > dt && now.u < rabbitHop(p.age - dt, coat).u) g.effect('tae-dust', p.x, FLOOR, DUST, .3, { radius: 12, dir });
    p.y = FLOOR - RABBIT_BODY - now.lift;
    return false;
  },
  pulse(g: FightGame, p: Projectile): void {
    g.effect('tae-flip', p.x, FLOOR, p.color, .55, { n: p.wave ?? 1, dir: Math.sign(p.vx) || 1 });
  },
});

/* ---- L 花园兔王 ---- */

/** The warren reaches bodies this far from a hole and this high; 小欧 a little further. */
const WARREN_REACH = 80;
const WARREN_AIR = 230;
const WARREN_BIG_REACH = 124;
const WARREN_POP_DMG = 14;
const WARREN_BUMP_DMG = 10;
const WARREN_BIG_DMG = 30;
/** A caught body rides this high on the first rabbit and this much higher on each one after. */
const WARREN_LIFT0 = 34;
const WARREN_LIFT_STEP = 16;
const WARREN_LIFT_MAX = 150;
/** How long the holes take to close, and the moon to set, once the move lets go of them. */
const HOLES_LINGER = .3;
const MOON_LINGER = .4;
const CROWN_LINGER = .15;
const warrenParts = new WeakMap<Skill, { pop: Skill; bump: Skill; big: Skill; kick: Skill }>();
const partsOf = (s: Skill) => derive(warrenParts, s, k => ({
  pop: { ...k, finale: undefined, damage: WARREN_POP_DMG, knock: 0, react: { kind: 'pin', stun: .5, holdStill: true } },
  // Quiet: a body already riding the rabbits takes the bumps without counting into the combo.
  bump: { ...k, finale: undefined, guardPlan: undefined, damage: WARREN_BUMP_DMG, knock: 0, noBlock: true, noSparks: true, react: { kind: 'none' } },
  big: { ...k, finale: undefined, guardPlan: undefined, damage: WARREN_BIG_DMG, knock: 0, noBlock: true, react: { kind: 'pin', stun: .6, holdStill: true } },
  kick: { ...finaleOf(k), guardPlan: undefined, noBlock: true },
} satisfies Record<string, Skill>));
/** One cast's warren: when it opened, rabbits sent so far (小欧 is the one after the last), and the ride of the
 *  body caught on it — the shot it was caught on and the height it had when 小欧 took over. */
type Warren = NonNullable<Attack['warren']>;
/** Height of the caught body over the floor: up a step on every rabbit, then thrown to the top by 小欧. */
function warrenHeight(a: Attack, w: Warren): number {
  if ((a.mode ?? WARREN.call) === WARREN.erupt) {
    const base = Math.min(WARREN_LIFT_MAX, WARREN_LIFT0 + WARREN_LIFT_STEP * (a.shots - w.from));
    return base + 22 * Math.sin(Math.PI * Math.min(1, (a.t - a.liftAt) / .16));
  }
  const k = Math.min(1, (a.t - a.liftAt) / .32);
  return w.base + (WARREN_TOP - w.base) * (1 - (1 - k) ** 3);
}
function pinWarren(f: Fighter, a: Attack, w: Warren, o: Fighter, dt: number): void {
  o.x = clamp(o.x + (a.anchor - o.x) * Math.min(1, dt * 10), X_MIN, X_MAX);
  o.y = FLOOR - warrenHeight(a, w);
  pin(o, .35);
  o.facing = (o.x > f.x ? -1 : 1) as 1 | -1;
}
/** Catch a body on the warren: from here on the rabbits carry it. */
function catchOn(g: FightGame, a: Attack, w: Warren, o: Fighter): void {
  a.hold = o.id;
  a.liftAt = a.t;
  w.from = a.shots;
  o.attack = null;
  retainEscape(o, true);
}
/** Where a rabbit's kick lands on a body: low on them, from below. `clean` is false for a guarded one. */
function warrenImpact(g: FightGame, o: Fighter, fromX: number, clean: boolean, big: boolean): void {
  g.effect('tae-impact', o.x + Math.sign(fromX - o.x) * 6, o.y - (big ? 36 : 22), clean ? '#ffffff' : '#9fd8ff', big ? .6 : .38, {
    dir: fromX <= o.x ? 1 : -1, hit: clean, heavy: big,
  });
  if (clean) {
    g.hitstop = Math.max(g.hitstop, big ? .07 : .028);
    g.shake = Math.max(g.shake, big ? 8 : 2.5);
  }
}
/** Send the rabbits (and then 小欧) up out of their holes a beat before their hits, each jumping in at whoever is
 *  over the warren, so the kick and the damage arrive together. */
function sendRabbits(g: FightGame, f: Fighter, a: Attack, w: Warren, held: Fighter | undefined): void {
  const bigAt = w.open + WARREN_FIRST + (WARREN_ORDER.length - 1) * WARREN_GAP + WARREN_BIG;
  while (w.shown < WARREN_ORDER.length && a.t >= w.open + WARREN_FIRST + w.shown * WARREN_GAP - WARREN_LEAD) {
    const i = w.shown++;
    const hx = a.anchor + WARREN_HOLES[WARREN_ORDER[i]];
    const aim = held ?? g.nearestEnemyTo(f, hx);
    const at = aim && Math.abs(aim.x - hx) <= WARREN_REACH + 40 ? aim.x : a.anchor;
    g.effect('tae-pop', hx, FLOOR, WHITE, .58, {
      n: 1 + (i % (RABBIT_COATS - 1)), dir: hx <= at ? 1 : -1, t0: WARREN_LEAD,
      tx: clamp(at - hx, -110, 110), ty: -(held ? warrenHeight(a, w) + 30 : 46),
    });
  }
  if (w.shown === WARREN_ORDER.length && a.t >= bigAt - WARREN_BIG_LEAD) {
    w.shown++;
    g.effect('tae-pop-big', a.anchor, FLOOR, WHITE, .9, { n: 0, dir: f.facing, t0: WARREN_BIG_LEAD, tx: 0, ty: -(held ? warrenHeight(a, w) + 20 : 40) });
  }
}
/** 花园兔王 (萌娘百科: 至少 23 只兔子、最爱异色瞳的小欧、梦想是去兔岛; 官方四格「花园 land」的兔子王国): a little crown, a
 *  finger to the sky — and the floor round the foe opens into a warren under a rising full moon. Rabbit after
 *  rabbit jumps out of the holes and kicks up into them; the first that lands clean catches them and every one
 *  after bumps them higher (a guard holds the rabbits off and wears down; once it breaks they are caught). Then
 *  小欧, three times the size and odd-eyed, comes up out of the big hole under them and throws them to the top —
 *  no guard holds 小欧 — while she dives into a hole of her own, comes up beside them (瞬移怪 again) and finishes
 *  with a flying rabbit kick. The warren closes behind her. a.mode walks WARREN; a.anchor is the middle of the
 *  warren; a.hold the body riding it; a.tossAt the start of each of her own phases. */
function step_warren(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? WARREN.call;
  // The crown sits on her until she goes down the hole; the moon stays up while the move runs.
  if (mode <= WARREN.erupt) keepOn(g, f, a, 'tae-crown', '#ffd34d', CROWN_LINGER);
  if (mode === WARREN.call) {
    if (a.t < s.start) return;
    const foe = g.nearestEnemyTo(f, f.x);
    a.anchor = clamp(foe ? foe.x : f.x + f.facing * 300, X_MIN + 110, X_MAX - 110);
    a.warren = { open: a.t, shown: 0, from: 0, base: 0 };
    g.effect('tae-dirt', a.anchor, FLOOR, DIRT, .55, { radius: 130 });
    g.shake = Math.max(g.shake, 4);
    a.mode = WARREN.erupt;
    a.shots = 0;
    a.hold = -1;
  }
  const w = a.warren ??= { open: a.t, shown: 0, from: 0, base: 0 };
  const moon = keepOn(g, f, a, 'tae-moon', '#f6efd8', MOON_LINGER, { follow: undefined });
  moon.x = a.anchor;
  moon.y = 0;
  moon.age = a.t - w.open;
  // The holes stay open until she is back on the floor.
  if (a.mode !== WARREN.done) {
    const holes = keepOn(g, f, a, 'tae-warren', DIRT, HOLES_LINGER, { follow: undefined });
    holes.x = a.anchor;
    holes.y = FLOOR;
    holes.age = a.t - w.open;
  }
  let held = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  if (held && held.hp <= 0) { a.hold = -1; held = undefined; }
  const parts = partsOf(s);
  if (a.mode === WARREN.erupt) {
    sendRabbits(g, f, a, w, held);
    while (a.shots < WARREN_ORDER.length && a.t >= w.open + WARREN_FIRST + a.shots * WARREN_GAP) {
      const i = a.shots++;
      const hx = a.anchor + WARREN_HOLES[WARREN_ORDER[i]];
      a.hit = new Set();
      if (held) {
        if (hit(g, f, held, parts.bump, a, hx)) warrenImpact(g, held, hx, true, false);
        a.liftAt = a.t;
        continue;
      }
      for (const o of foesAround(g, f, hx, WARREN_REACH, WARREN_AIR)) {
        const guarded = o.blocking && o.guard > 0 && o.facing === -(o.x >= f.x ? 1 : -1);
        if (!hit(g, f, o, withGuard(parts.pop, i), a, f.x)) continue;
        const caught = !guarded || o.guard <= 0;
        warrenImpact(g, o, hx, caught, false);
        if (!caught) continue;
        catchOn(g, a, w, o);
        g.hitstop = Math.max(g.hitstop, .05);
        held = o;
        break;
      }
    }
    if (held) pinWarren(f, a, w, held, dt);
    if (a.shots < WARREN_ORDER.length || a.t < w.open + WARREN_FIRST + (WARREN_ORDER.length - 1) * WARREN_GAP + WARREN_BIG) return;
    // 小欧, from the big hole in the middle (already on the way: sendRabbits).
    g.effect('tae-dirt', a.anchor, FLOOR, DIRT, .55, { radius: 90 });
    g.shake = Math.max(g.shake, 7);
    a.hit = new Set();
    const target = held ?? foesAround(g, f, a.anchor, WARREN_BIG_REACH, WARREN_AIR + 60).next().value;
    const base = held ? warrenHeight(a, w) : 0;
    a.hold = -1;
    if (target && hit(g, f, target, parts.big, a, a.anchor)) {
      warrenImpact(g, target, a.anchor, true, true);
      catchOn(g, a, w, target);
      w.base = base;
      held = target;
    }
    // She goes down a hole of her own at the same moment.
    a.mode = WARREN.dive;
    a.tossAt = a.t;
    g.effect('tae-dig', f.x, FLOOR, DIRT, .5, { dir: f.facing, radius: 34 });
    return;
  }
  if (held) pinWarren(f, a, w, held, dt);
  if (a.mode === WARREN.dive) {
    f.invuln = Math.max(f.invuln, .06);
    pin(f, 0);
    if (a.t < a.tossAt + WARREN_DIVE) return;
    f.x = clamp((held ? held.x : a.anchor) - f.facing * 58, X_MIN, X_MAX);
    if (held && Math.abs(held.x - f.x) > 6) f.facing = held.x > f.x ? 1 : -1;
    g.effect('tae-dirt', f.x, FLOOR, DIRT, .45, { radius: 40 });
    a.mode = WARREN.rise;
    a.tossAt = a.t;
    return;
  }
  if (a.mode === WARREN.rise) {
    pin(f, 0);
    const k = Math.min(1, (a.t - a.tossAt) / WARREN_RISE);
    f.y = FLOOR - WARREN_KICK_H * (1 - (1 - k) ** 2);
    if (k < 1) return;
    // The rabbit kick (兔子蹬), at the top.
    a.hit = new Set();
    let landed = false;
    if (held) landed = hit(g, f, held, parts.kick, a);
    else {
      for (const o of g.fighters) {
        if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
        if ((o.x - f.x) * f.facing < -20 || Math.abs(o.x - f.x) > 130 || Math.abs((o.y - 83) - (f.y - 90)) > 150) continue;
        if (hit(g, f, o, parts.kick, a)) landed = true;
      }
    }
    a.hold = -1;
    g.effect('tae-kick', f.x + f.facing * 70, f.y - 70, f.data.color, .5, { dir: f.facing, hit: landed });
    g.flash = Math.max(g.flash, landed ? .16 : .06);
    g.shake = Math.max(g.shake, landed ? 12 : 5);
    if (landed) g.audio.play('slam', f.id);
    a.mode = WARREN.fall;
    a.tossAt = a.t;
    return;
  }
  if (a.mode === WARREN.fall) {
    pin(f, 0);
    const k = Math.min(1, (a.t - a.tossAt) / WARREN_FALL);
    f.y = FLOOR - WARREN_KICK_H * (1 - k * k);
    if (k < 1) return;
    f.y = FLOOR;
    a.mode = WARREN.done;
    g.effect('tae-fur', a.anchor, FLOOR - 120, WHITE, .9, { radius: 120 });
    g.effect('tae-dust', f.x, FLOOR, DUST, .35, { radius: 24, dir: f.facing });
    a.t = Math.max(a.t, s.duration - WARREN_TAIL);
  }
}
SCRIPTS['tae-warren'] = Object.assign(SCRIPTS['tae-warren'] ?? {}, {
  update: step_warren, noMelee: true, poise: true, hideWhile: (a: Attack) => a.mode === WARREN.dive,
});
