import type { Skill } from '../data/types.ts';
import { gainEnergy, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, GRAVITY, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, retainEscape, withFinale, withGuard } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { DRILL, RIMI_DRILL, RIMI_ROLL, RIMI_TOSS, RIMI_TV, ROLL } from './rimiPath.ts';

/* 牛込里美 — Poppin'Party 的贝斯，「告一段"螺"」。Four scripts, registered on SCRIPTS by fx name (combat.ts imports this
   module once for the side effect):
     rimi-tv      U 今晚放映恐怖片      an old TV on the floor; a long-haired ghost climbs out of the screen and crawls along
                                         the floor; an ankle it reaches is held (定身, the 'rimi-hands' look). The ghost is
                                         the shot (fx rimi-tv, so oneShot keeps one on the field); the TV is an effect.
     rimi-cornet  I 巧克力螺，请收下！  four cornets thrown in arcs (PICO 片头撒巧克力螺); the ones that miss lie on the floor
                                         and she eats them when she walks over them (hp and 气).
     rimi-drill   O 告一段"螺"          a big cornet as a drill: she drives forward carrying whoever the tip catches, then
                                         chocolate sprays out of the open end (冻僵, the 'rimi-choco' look).
     rimi-roll    L 我的心是巧克力螺    PICO #09: one bite too many and she is a giant cornet; it rolls to the wall, turns,
                                         rolls back; whoever it rolls over is flattened (the 'flat' mod), the second pass
                                         throws them. Cornets on the floor are rolled up into the finale.
   Pictures in render/rimiFx.ts; shared numbers and the cell picks in rimiPath.ts. No floating words anywhere. */

const PINK = '#ff55bb';
const COCOA = '#6b3a24';
const PALE = '#f4f1ff';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function pin(o: Fighter, stun: number): void {
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, stun);
}
/** A guard up and facing the hit: hit() still returns true for it, so the callers that pay off clean hits ask first. */
function guarding(fromX: number, o: Fighter): boolean {
  return o.blocking && o.guard > 0 && o.facing === -(o.x >= fromX ? 1 : -1);
}
/** Keep `type` on her this tick, creating it the first time; it lingers `life` seconds once nobody keeps it. */
function keepOn(g: FightGame, f: Fighter, a: Attack, type: string, color: string, life: number, mode = 0): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, f.x, f.y, color, life, { follow: f.id, ox: 0, oy: 0, fighter: f.id, radius: headOf(f) });
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  e.dir = f.facing;
  e.age = a.t;
  e.n = mode;
  return e;
}
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}

/* ---- U 今晚放映恐怖片 ---- */

/** 今晚放映恐怖片 (PICO Fever #15「ポピモニロードショー」: the horror-film night; she and 七深 are the fans, and she cheers
 *  while the others get got — 弹幕「队友被打还叫好的屑里美」): she sets an old TV down ahead of her; the screen flickers,
 *  and a little long-haired ghost climbs out and crawls along the floor. The first ankle it reaches is held (定身 in the
 *  'rimi-hands' look) and it puffs back into the TV. Ground only (a jump clears it), a guard dissolves it, one on the
 *  field. She claps through the rest of the move. */
function step_tv(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.t >= s.start && a.shots > 0) keepOn(g, f, a, 'rimi-cheer', PINK, .25);
  if (a.t < s.start || a.shots) return;
  a.shots = 1;
  a.emitted = true;
  const x = clamp(f.x + f.facing * RIMI_TV.out, X_MIN + 20, X_MAX - 20);
  const crawl = (s.range ?? 520) / (s.speed ?? 160);
  const life = RIMI_TV.rise + crawl;
  g.effect('rimi-tvdim', x, FLOOR, '#101018', life + RIMI_TV.fade, { dir: f.facing, fighter: f.id });
  g.effect('rimi-tvset', x, FLOOR, '#c9c4d8', life + RIMI_TV.fade, { dir: f.facing, fighter: f.id });
  g.projectiles.push({
    owner: f.id, x, y: FLOOR, vx: f.facing * (s.speed ?? 160), vy: 0, life, age: 0,
    skill: s, color: PALE, radius: RIMI_TV.reach, size: s.size ?? 80, fx: s.fx, attack: a, hit: new Set(), trail: [],
    solid: false, face: f.facing, aim: x,
  });
}
/** The ghost is gone (grabbed, blocked, ran out): a puff, and the TV switches off. */
function ghostOut(g: FightGame, p: Projectile, grabbed: boolean): void {
  p.life = 0;
  g.effect('rimi-ghostpuff', p.x, FLOOR - 30, PALE, .55, { dir: p.face, hit: grabbed });
  for (const e of g.effects) {
    if ((e.type === 'rimi-tvset' || e.type === 'rimi-tvdim') && e.fighter === p.owner && e.x === p.aim) e.life = Math.min(e.life, RIMI_TV.fade);
  }
}
SCRIPTS['rimi-tv'] = Object.assign(SCRIPTS['rimi-tv'] ?? {}, {
  update: step_tv, noMelee: true, skipVolley: true, skipCount: true, oneShot: true, trail: 0,
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    const owner = g.fighterById(p.owner);
    if (!owner || owner.hp <= 0) { ghostOut(g, p, false); return true; }
    if (p.age < RIMI_TV.rise) return true;
    p.x += p.vx * dt;
    if (p.x <= X_MIN || p.x >= X_MAX || p.life <= dt) { ghostOut(g, p, false); return true; }
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id)) continue;
      if (Math.abs(o.x - p.x) > RIMI_TV.reach + 14 || o.y < FLOOR - RIMI_TV.air) continue;
      if (isInvulnerable(o)) continue;
      const blocked = guarding(p.x, o);
      if (!hit(g, owner, o, p.skill, p, p.x)) continue;
      p.hit.add(o.id);
      if (!blocked && o.root > 0 && o.rootFx === p.skill.fx) {
        o.rootMark = 'rimi-hands';
        g.effect('rimi-hands@apply', o.x, o.y, PALE, .6, { follow: o.id, ox: 0, oy: 0 });
      }
      ghostOut(g, p, !blocked);
      return true;
    }
    return true;
  },
});

/* ---- I 巧克力螺，请收下！ ---- */

/** 巧克力螺，请收下！ (PICO 片头「往观众席撒巧克力螺」, and the 7th live where she really threw them into the crowd): both
 *  hands fling four cornets out in arcs of four lengths. One that hits a body breaks into crumbs; one that lands lies
 *  there for RIMI_TOSS.settle seconds, and if she walks over it she eats it (hp and 气; 「生活就是巧克力螺」). */
function step_toss(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.t < s.start || a.shots) return;
  a.shots = 1;
  const sc = headOf(f) / 172;
  RIMI_TOSS.throws.forEach(([vx, vy], i) => {
    g.projectiles.push({
      owner: f.id, x: f.x + f.facing * 26, y: f.y - RIMI_TOSS.hand * sc, vx: f.facing * vx, vy, life: 3, age: 0,
      skill: s, color: COCOA, radius: 16, size: s.size ?? 40, fx: s.fx, attack: a, hit: new Set(), trail: [],
      solid: false, face: f.facing, wave: i, settled: false,
    });
  });
  // The oldest of the ones lying around go when there are too many.
  const lying = g.projectiles.filter(p => p.fx === s.fx && p.owner === f.id && p.settled && p.life > 0).sort((x, y) => y.age - x.age);
  for (let i = 0; i < lying.length - RIMI_TOSS.keep; i++) lying[i].life = 0;
}
SCRIPTS['rimi-cornet'] = Object.assign(SCRIPTS['rimi-cornet'] ?? {}, {
  update: step_toss, noMelee: true, skipVolley: true, skipCount: true, trail: 0,
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    const owner = g.fighterById(p.owner);
    if (!p.settled) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < X_MIN || p.x > X_MAX) { p.x = clamp(p.x, X_MIN, X_MAX); p.vx *= -.3; }
      if (owner) {
        for (const o of g.fighters) {
          if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id)) continue;
          if (Math.abs(o.x - p.x) > 30 || p.y < o.y - headOf(o) - 8 || p.y > o.y + 6) continue;
          if (!hit(g, owner, o, p.skill, p, p.x)) continue;
          p.hit.add(o.id);
          p.life = 0;
          g.effect('rimi-crumb', p.x, p.y, COCOA, .5, { dir: Math.sign(p.vx) || 1, radius: 30 });
          return true;
        }
      }
      if (p.y < FLOOR) return true;
      p.y = FLOOR;
      p.vx = 0;
      p.vy = 0;
      p.settled = true;
      p.life = RIMI_TOSS.settle;
      p.age = 0;
      g.effect('rimi-plop', p.x, FLOOR, '#e8d6c0', .35, { radius: 22 });
      return true;
    }
    if (owner && owner.hp > 0 && Math.abs(owner.x - p.x) < RIMI_TOSS.pick && owner.y >= FLOOR - 1) {
      p.life = 0;
      owner.hp = Math.min(owner.data.hp, owner.hp + RIMI_TOSS.heal);
      gainEnergy(owner, RIMI_TOSS.energy);
      g.effect('rimi-yum', owner.x, owner.y - headOf(owner) * .62, PINK, .7, { follow: owner.id, ox: 0, oy: -headOf(owner) * .62 });
    }
    return true;
  },
});

/* ---- O 告一段"螺" ---- */

const drillTick = new WeakMap<Skill, Skill>();
/** 告一段"螺" (别号「告一段"螺"」; B 站「海螺包是最卑鄙的女人」, 高赞「海螺包好像真能拿来用」; 「巧克力螺哪边才是上面？」):
 *  she lifts a cornet as long as her arm — it is the wrong way round, she flips it tip-first — and drives forward with it
 *  spinning like a drill, carrying whoever the tip catches; at the end chocolate bursts out of the open end over them
 *  (冻僵, 'rimi-choco'). a.mode walks DRILL; a.tossAt the start of the drive; a.shots the ticks so far. */
function step_drill(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? DRILL.wind;
  if (mode !== DRILL.done) keepOn(g, f, a, 'rimi-drill', COCOA, .08, mode);
  if (mode === DRILL.wind) {
    if (a.t < s.start) return;
    a.mode = DRILL.drill;
    a.tossAt = a.t;
    a.shots = 0;
    a.emitted = true;
    g.effect('rimi-drillgo', f.x, f.y, '#fff1e0', .3, { dir: f.facing, radius: headOf(f) });
    return;
  }
  if (mode !== DRILL.drill) return;
  const el = a.t - a.tossAt;
  f.vx = 0;
  f.x = clamp(f.x + f.facing * (s.speed ?? 560) * dt, X_MIN, X_MAX);
  const tick = derive(drillTick, s, k => ({ ...k, finale: undefined, knock: 0, react: { kind: 'stand' as const, stun: .22 } }));
  // Carry what the tip has caught.
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || !a.hit.has(o.id) || guarding(f.x, o) || isInvulnerable(o)) continue;
    o.x = clamp(f.x + f.facing * RIMI_DRILL.carry, X_MIN, X_MAX);
    o.vx = 0;
  }
  while (a.shots < RIMI_DRILL.ticks && el >= a.shots * RIMI_DRILL.tick) {
    a.shots++;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      const along = (o.x - f.x) * f.facing;
      if (along < -10 || along > RIMI_DRILL.reach || o.y < f.y - headOf(f) * .9) continue;
      a.hit.delete(o.id);
      if (hit(g, f, o, tick, a, f.x)) {
        a.hit.add(o.id);
        g.effect('rimi-grind', f.x + f.facing * (RIMI_DRILL.carry - 14), f.y - headOf(f) * .5, COCOA, .25, { dir: f.facing, n: a.shots });
      }
    }
  }
  if (el < RIMI_DRILL.dash && f.x > X_MIN && f.x < X_MAX) return;
  // The spray out of the open end.
  const fin = withFinale(s, true);
  const mouth = f.x + f.facing * RIMI_DRILL.carry;
  let landed = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const along = (o.x - f.x) * f.facing;
    if (along < -10 || along > RIMI_DRILL.spray || o.y < f.y - headOf(f) * 1.1) continue;
    a.hit.delete(o.id);
    if (hit(g, f, o, fin, a, f.x)) landed = true;
  }
  g.effect('rimi-spray', mouth, f.y - headOf(f) * .5, COCOA, .6, { dir: f.facing, hit: landed });
  // Dizzy, she lets go: the cornet drops out of her hands and bounces.
  g.effect('rimi-drop', f.x, f.y, COCOA, .7, { dir: f.facing, radius: headOf(f) });
  for (const e of g.effects) if (e.type === 'rimi-drill' && e.fighter === f.id) e.life = 0;
  g.shake = Math.max(g.shake, 4);
  a.mode = DRILL.done;
  a.t = Math.max(a.t, s.duration - RIMI_DRILL.tail);
}
SCRIPTS['rimi-drill'] = Object.assign(SCRIPTS['rimi-drill'] ?? {}, {
  update: step_drill, noMelee: true, customDash: true, skipCount: true, skipVolley: true,
});

/* ---- L 我的心是巧克力螺 ---- */

type RollParts = { seg: Skill; fin: Skill };
const rollParts = new WeakMap<Skill, RollParts>();
function partsOf(s: Skill): RollParts {
  return derive(rollParts, s, k => ({
    seg: { ...k, finale: undefined, damage: k.damage, knock: 0, react: { kind: 'none' }, noSparks: false },
    fin: withFinale(k, true),
  }));
}
/** The segment count so far rides a.burst's high digits; the cornets rolled up its low digit. */
function segs(a: Attack): number { return Math.floor(a.burst / 10); }
function eaten(a: Attack): number { return a.burst % 10; }
/** Everyone a pass has rolled over and still owes segments to: how many, when the next lands, and whether the last is the throw. */
const pressing = new WeakMap<Attack, Map<number, { left: number; next: number; last: boolean }>>();
function pressOf(a: Attack): Map<number, { left: number; next: number; last: boolean }> {
  let m = pressing.get(a);
  if (!m) pressing.set(a, m = new Map());
  return m;
}
function flatten(g: FightGame, f: Fighter, o: Fighter): void {
  addMod(o, 'flat', RIMI_ROLL.flat, { from: f.id });
  o.attack = null;
  retainEscape(o, true);
  pin(o, .3);
  g.effect('rimi-squish', o.x, FLOOR, COCOA, .45, { dir: f.facing, radius: 60 });
}
function unflatten(o: Fighter | undefined): void {
  if (o) clearMod(o, 'flat');
}
/** 我的心是巧克力螺 (PICO #09「チョココロネだいすき」: 一天五个、越吃越多，结果自己变成了巧克力螺; 角色歌《私の心はチョココロネ》):
 *  a big bite, cheeks full — poof — and she is a giant cornet with her bangs and hairclip peeking out of the open end.
 *  It rolls tip-first to the wall, turns, and rolls back to where she started. Whoever it rolls over is pressed flat
 *  (three segments a pass) and stays flat on the floor; the second pass ends in the throw. Cornets lying on the floor
 *  are rolled up on the way and each makes the throw harder. Ground only (a jump clears a pass), blockable segment by
 *  segment, poised the whole way. Then she pops back out and sits on the floor, a hand over her mouth. */
function step_roll(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? ROLL.bite;
  if (mode === ROLL.bite) {
    keepOn(g, f, a, 'rimi-bite', PINK, .15);
    if (a.t < s.start) return;
    a.mode = ROLL.out;
    a.anchor = f.x;
    a.burst = 0;
    a.tossAt = a.t;
    a.emitted = true;
    f.y = FLOOR;
    f.vy = 0;
    g.effect('rimi-poof', f.x, FLOOR, '#ffc4e6', .7, { radius: 120, dir: f.facing });
    g.shake = Math.max(g.shake, 5);
    return;
  }
  if (mode === ROLL.spit) return;
  const parts = partsOf(s);
  const press = pressOf(a);
  const roll = keepOn(g, f, a, 'rimi-giant', COCOA, .12, mode);
  roll.tx = (a.mode === ROLL.back ? -1 : 1) * f.facing;
  f.vx = 0;
  f.vy = 0;
  f.y = FLOOR;
  const dir = (mode === ROLL.back ? -1 : 1) * f.facing;
  // Deliver the segments owed to everyone under the roller.
  for (const [id, st] of press) {
    const o = g.fighterById(id);
    if (!o || o.hp <= 0) { press.delete(id); continue; }
    if (o.mods.some(m => m.kind === 'flat' && m.left > 0)) pin(o, .3);
    while (st.left > 0 && a.t >= st.next) {
      st.left--;
      st.next += RIMI_ROLL.gap;
      const n = segs(a);
      a.burst += 10;
      const last = st.last && st.left === 0;
      const base = last ? { ...parts.fin, damage: parts.fin.damage + RIMI_ROLL.bonus * eaten(a) } : parts.seg;
      a.hit.delete(id);
      const clean = !guarding(f.x, o);
      if (last) unflatten(o);
      if (!hit(g, f, o, withGuard(base, n), a, f.x)) { unflatten(o); press.delete(id); break; }
      if (!clean || last) unflatten(o);
      g.effect(last ? 'rimi-launch' : 'rimi-press', o.x, FLOOR - 20, last ? PINK : COCOA, last ? .7 : .3, { dir, n, hit: clean });
      g.shake = Math.max(g.shake, last ? 9 : 2.5);
      if (last) { g.hitstop = Math.max(g.hitstop, .06); g.flash = Math.max(g.flash, .08); }
    }
    if (st.left <= 0) press.delete(id);
  }
  if (mode === ROLL.turn) {
    if (a.t >= a.tossAt + RIMI_ROLL.turn) { a.mode = ROLL.back; a.tossAt = a.t; a.hit.clear(); }
    return;
  }
  f.x = clamp(f.x + dir * RIMI_ROLL.speed * dt, X_MIN, X_MAX);
  // Rolled over.
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || press.has(o.id) || a.hit.has(o.id)) continue;
    if (Math.abs(o.x - f.x) > RIMI_ROLL.reach) continue;
    const flat = o.mods.some(m => m.kind === 'flat' && m.left > 0);
    if (!flat && (o.y < FLOOR - RIMI_ROLL.air || isInvulnerable(o))) continue;
    a.hit.add(o.id);
    press.set(o.id, { left: RIMI_ROLL.hits, next: a.t, last: mode === ROLL.back });
    if (!guarding(f.x, o)) flatten(g, f, o);
  }
  // Cornets lying on the floor are rolled up.
  for (const p of g.projectiles) {
    if (p.fx !== 'rimi-cornet' || p.owner !== f.id || !p.settled || p.life <= 0 || Math.abs(p.x - f.x) > RIMI_ROLL.slurp) continue;
    p.life = 0;
    if (eaten(a) < 9) a.burst++;
    g.effect('rimi-slurp', p.x, FLOOR - 16, PINK, .45, { dir });
  }
  const wall = dir > 0 ? f.x >= X_MAX - RIMI_ROLL.wall : f.x <= X_MIN + RIMI_ROLL.wall;
  if (mode === ROLL.out) {
    if (!wall) return;
    a.mode = ROLL.turn;
    a.tossAt = a.t;
    g.effect('rimi-wall', f.x + dir * 70, FLOOR - 60, '#ffe0f0', .45, { dir, radius: 90 });
    g.shake = Math.max(g.shake, 6);
    return;
  }
  // Back past where she began (or the other wall): pop out, once the last pass has paid out.
  const home = (f.x - a.anchor) * dir >= 0 || wall;
  if (!home || press.size) return;
  for (const o of g.fighters) if (o.mods.some(m => m.kind === 'flat' && m.left > 0 && m.from === f.id)) unflatten(o);
  a.mode = ROLL.spit;
  a.t = Math.max(a.t, s.duration - RIMI_ROLL.tail);
  a.tossAt = a.t;
  g.effect('rimi-spit', f.x, FLOOR, '#ffd0ea', .9, { dir: f.facing, radius: headOf(f), follow: f.id, ox: 0, oy: 0 });
}
SCRIPTS['rimi-roll'] = Object.assign(SCRIPTS['rimi-roll'] ?? {}, {
  update: step_roll, noMelee: true, customDash: true, skipCount: true, skipVolley: true, poise: true,
  hideWhile: (a: Attack) => a.mode === ROLL.out || a.mode === ROLL.turn || a.mode === ROLL.back,
});

/** A body left flat by a roll that is no longer running (she was knocked out of it, the round reset) springs back. */
STEP_WATCHERS.push((g, f) => {
  const m = f.mods.find(x => x.kind === 'flat' && x.left > 0);
  if (!m) return;
  const roller = m.from != null ? g.fighterById(m.from) : undefined;
  const a = roller?.attack;
  if (!roller || roller.hp <= 0 || !a || a.skill.fx !== 'rimi-roll' || a.mode === ROLL.spit) clearMod(f, 'flat');
});
