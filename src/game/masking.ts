import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame } from './game.ts';
import { FLOOR, H, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { addMod } from './mods.ts';
import { applyMelee, foeAhead, hit, retainEscape } from './combat.ts';
import { SCRIPTS } from './scripts.ts';
import {
  BIKE_NOSE, BIKE_SEAT_X, BIKE_W, CUTE, CUTE_FIRST, CUTE_GAP, CUTE_LUNGE, CUTE_TAIL, FILL, FILL_TAIL, FILLS,
  LOCK_COLOR, METEOR, METEOR_CARRY, METEOR_CHARGE, METEOR_HIGH, METEOR_LEAP, METEOR_RISE, METEOR_TAIL,
  RIDE, RIDE_SKID, RIDE_TAIL, RIDE_TIME,
} from '../render/clips.ts';

/* MASKING（佐藤益木）— RAS 的鼓手。凶脸、金发、骑一辆叫「死亡银河号」的红黑摩托（萌娘百科），心里是个可爱控。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     galaxy-ride  U 死亡银河号   the bike across the screen, through bodies, and a skid
     cute-check   I 可爱鉴定     pinch the cheeks, pat the head, leave them blushing (混乱)
     fill-in      O 即兴加花     an off-grid string of jabs and a crash
     meteor-kick  L 银河流星踢   LOCK on the back, a body carried to the wall, the kick from the seat
   Shared numbers and the cell picks live in clips.ts, every picture in render/maskingFx.ts.

   Anything that rides on her (the bike, LOCK, the headlight, the dim) is an effect the move *keeps* alive:
   keepOn() refreshes a short life every tick, so whatever cuts the move short — a grab, a KO, the round
   ending — loses it within KEEP seconds, with no cleanup path to forget. The bike's `age` is the attack clock,
   so its wheels turn with the move (and stop in hitstop) instead of with the wall clock. */

/** Seconds a kept effect outlives the last tick that kept it. */
const KEEP = .12;
/** Keep `type` on her this tick, creating it the first time. Kept effects are owned through `fighter` (so
 *  one that does not ride on her, like the dim, is still hers); they follow her unless `extra` says not.
 *  `life` is how long it lingers once nobody keeps it (the dim fades out over that). Returns the effect so
 *  the caller can set its pose. */
function keepOn(g: FightGame, f: Fighter, a: Attack, type: string, color: string, extra: Partial<Effect> = {}, life = KEEP): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, f.x, f.y, color, life, { follow: f.id, ox: 0, oy: 0, ...extra, fighter: f.id });
  // Top the life back up and stretch max by the same amount, so max − life (the effect's own clock,
  // which the pictures fade and sweep on) keeps counting up while it is kept.
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  e.dir = f.facing;
  e.age = a.t;
  return e;
}
/** 死亡银河号 / 银河流星踢: the bike under her. `n` is the pose the picture reads: 0 riding, 1 skidding, 2 revving. */
function keepBike(g: FightGame, f: Fighter, a: Attack, n: number): void {
  keepOn(g, f, a, 'masking-bike', f.data.color).n = n;
}
const RIDE_FX = new Set(['masking-bike', 'masking-lock', 'masking-headlight']);
/** Let go of everything she rides with, at once (stepping off, or leaping off the seat). */
function dropRide(g: FightGame, f: Fighter): void {
  for (const e of g.effects) if (e.fighter === f.id && RIDE_FX.has(e.type)) e.life = 0;
}
/** The red tail light streaks behind the bike at 30 Hz while it moves, dust every other streak. */
function tailLight(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const bucket = Math.floor(a.t * 30);
  if (bucket === Math.floor((a.t - dt) * 30)) return;
  g.effect('masking-tail', f.x + f.facing * (BIKE_SEAT_X - BIKE_W * .46), FLOOR - 52, '#ff2a3a', .26, { dir: f.facing });
  if (bucket % 2 === 0) g.effect('masking-dust', f.x - f.facing * (BIKE_W * .4), FLOOR, '#d9cbb4', .4, { dir: f.facing, radius: 10 + (bucket % 3) * 4 });
}
/** Hit variants of a skill, built once per skill object and shared by every cast. */
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
/** The skill with its finale folded in, the finale itself dropped. */
const finaleOf = (s: Skill): Skill => ({ ...s, ...s.finale, finale: undefined });
/** A grounded foe; anything this far off the floor rides over the bike (jump it). */
const RIDE_AIR = 96;
const grounded = (o: Fighter) => o.y >= FLOOR - RIDE_AIR;
/** Every live foe, for the moves that sweep more than one body. */
function* foes(g: FightGame, f: Fighter): Generator<Fighter> {
  for (const o of g.fighters) if (g.isEnemy(f, o) && o.hp > 0 && !o.echo) yield o;
}
/** Pin a held body `reach` ahead of her, facing her, on the floor. */
function pinAhead(f: Fighter, o: Fighter, reach: number, stun: number): void {
  o.x = clamp(f.x + f.facing * reach, X_MIN, X_MAX);
  o.y = FLOOR;
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, stun);
  o.facing = (-f.facing) as 1 | -1;
}

/* ---- U 死亡银河号 ---- */

/** The skid's back wheel swings round this far either side of her; she brakes this far past the first body she clips. */
const SKID_R = 150;
const SKID_PAST = 96;
const rideParts = new WeakMap<Skill, { pass: Skill; skid: Skill }>();
const rideOf = (s: Skill) => derive(rideParts, s, s => ({
  pass: { ...s, finale: undefined, knock: 90, react: { kind: 'stand' as const, stun: .42 } },
  skid: finaleOf(s),
}));
/** 死亡银河号 (萌娘百科: 「会骑着它四处奔走」; 第三季第 10、11 话东京一路飙到千叶): a kick start in a puff of
 *  exhaust, then flat out across the screen — every body in the way is clipped once as the bike goes through
 *  (jump it to get clear) — and a little past the first one (or at the end of the run) she throws the back wheel
 *  round in a skid that bats away anyone near, and steps off. a.mode walks RIDE; a.tossAt is when the run
 *  began, a.liftAt the skid; a.hold / a.anchor the first body clipped and where. */
function step_galaxy_ride(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? RIDE.mount;
  const speed = s.speed ?? 760;
  if (mode === RIDE.mount) {
    if (a.shots === 0) {
      a.shots = 1;
      g.effect('masking-exhaust', f.x - f.facing * 70, FLOOR - 30, '#e2dad0', .55, { dir: f.facing, radius: 46 });
      g.audio.play('engine', f.id);
    }
    keepBike(g, f, a, 2);
    if (a.t < s.start) return;
    a.mode = RIDE.ride;
    a.tossAt = a.t;
    g.shake = Math.max(g.shake, 3);
    return;
  }
  if (mode === RIDE.ride) {
    keepBike(g, f, a, 0);
    f.x = clamp(f.x + f.facing * speed * dt, X_MIN, X_MAX);
    tailLight(g, f, a, dt);
    const { pass, skid } = rideOf(s);
    for (const o of foes(g, f)) {
      if (a.hit.has(o.id) || Math.abs(o.x - f.x) > s.range || !grounded(o)) continue;
      if (!hit(g, f, o, pass, a)) continue;
      g.effect('masking-clip', o.x, o.y - 70, f.data.color, .3, { dir: f.facing, radius: 40 });
      // The first body she clips is where she brakes: a little past it, so the back wheel comes round into them.
      if (a.hold < 0) { a.hold = o.id; a.anchor = o.x; }
    }
    const pastClip = a.hold >= 0 && (f.x - a.anchor) * f.facing >= SKID_PAST;
    if (!pastClip && a.t < a.tossAt + RIDE_TIME && f.x > X_MIN && f.x < X_MAX) return;
    a.mode = RIDE.skid;
    a.liftAt = a.t;
    a.hit = new Set();
    // The back wheel comes round: everyone close, either side, is batted away from her.
    for (const o of foes(g, f)) if (Math.abs(o.x - f.x) <= SKID_R && grounded(o)) hit(g, f, o, skid, a, f.x);
    g.effect('masking-skid', f.x, FLOOR, '#e6d8c2', .55, { dir: f.facing, radius: SKID_R });
    g.shake = Math.max(g.shake, 6);
    return;
  }
  if (mode === RIDE.skid) {
    keepBike(g, f, a, 1);
    // The bike slides on a little and stops.
    const k = Math.max(0, 1 - (a.t - a.liftAt) / RIDE_SKID);
    f.x = clamp(f.x + f.facing * speed * .35 * k * dt, X_MIN, X_MAX);
    if (a.t < a.liftAt + RIDE_SKID) return;
    a.mode = RIDE.done;
    dropRide(g, f);
    g.effect('masking-exhaust', f.x, FLOOR - 40, '#e2dad0', .45, { dir: f.facing, radius: 54 });
    a.t = Math.max(a.t, s.duration - RIDE_TAIL);
  }
}
SCRIPTS['galaxy-ride'] = Object.assign(SCRIPTS['galaxy-ride'] ?? {}, { update: step_galaxy_ride, customDash: true, noMelee: true });

/* ---- I 可爱鉴定 ---- */

/** She holds their face this close. */
const CUTE_REACH = 50;
const cuteParts = new WeakMap<Skill, { pinch: Skill; last: Skill }>();
const cuteOf = (s: Skill) => derive(cuteParts, s, s => ({
  pinch: { ...s, finale: undefined, status: undefined, knock: 0, react: { kind: 'pin' as const, stun: .35, holdStill: true } },
  last: finaleOf(s),
}));
/** 可爱鉴定 (萌娘百科首句「你……挺可爱的嘛。」; 萌点 凶恶脸 / 可爱控 / 反差萌; B 站「masking 捏 lock」): the scary face
 *  reaches out — and pinches their cheeks. Three squeezes, little gold hearts popping, her face softening; then a
 *  pat on the head and a push, and they wander off blushing (混乱, the 'blush' look). a.mode walks CUTE;
 *  a.tossAt is the catch, a.liftAt the latest pinch. */
function step_cute_check(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? CUTE.lunge;
  if (mode === CUTE.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && Math.abs(o.y - f.y) < 112 && !isInvulnerable(o)) {
      a.mode = CUTE.held;
      a.hold = o.id;
      a.tossAt = a.t;
      f.x = clamp(o.x - f.facing * CUTE_REACH, X_MIN, X_MAX);
      o.attack = null;
      pinAhead(f, o, CUTE_REACH, .35);
      retainEscape(o);
      g.hitstop = Math.max(g.hitstop, .05);
      g.effect('masking-glare', f.x + f.facing * 14, f.y - 166, '#ffe08a', .4, { follow: f.id, ox: f.facing * 14, oy: -166, dir: f.facing });
      g.text('……嗯？', f.x, f.y - 214, f.data.color, .7, 16);
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 420) * dt, X_MIN, X_MAX);
    if (a.t >= s.start + CUTE_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = CUTE.done;
      a.t = Math.max(a.t, s.duration - .26);
    }
    return;
  }
  if (mode !== CUTE.held) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0) {
    a.mode = CUTE.done;
    a.hold = -1;
    a.t = Math.max(a.t, s.duration - CUTE_TAIL);
    return;
  }
  pinAhead(f, o, CUTE_REACH, .3);
  const parts = cuteOf(s);
  const count = s.count ?? 3;
  // count pinches, then the pat (the finale).
  while (a.shots <= count && a.t >= a.tossAt + CUTE_FIRST + a.shots * CUTE_GAP) {
    const i = a.shots++;
    const last = i === count;
    a.hit = new Set();
    hit(g, f, o, last ? parts.last : parts.pinch, a);
    if (!last) {
      a.liftAt = a.t;
      g.effect('masking-pinch', (f.x + o.x) / 2 + f.facing * 8, o.y - 150, '#ffd56a', .5, { n: i, dir: f.facing });
      continue;
    }
    g.effect('masking-pat', o.x, o.y - 186, '#ffd56a', .7, { dir: f.facing });
    g.text('还挺可爱的嘛。', f.x, f.y - 214, f.data.color, 1, 17);
    a.mode = CUTE.done;
    a.hold = -1;
    a.t = Math.max(a.t, s.duration - CUTE_TAIL);
  }
}
SCRIPTS['cute-check'] = Object.assign(SCRIPTS['cute-check'] ?? {}, { update: step_cute_check, noMelee: true, skipCount: true });

/* ---- O 即兴加花 ---- */

/** The crash is the move's one moment of armour — it starts this long before the downbeat. */
const FILL_POISE = .14;
const fillParts = new WeakMap<Skill, { jab: Skill; crash: Skill }>();
const fillOf = (s: Skill) => derive(fillParts, s, s => ({ jab: { ...s, finale: undefined }, crash: finaleOf(s) }));
/** 即兴加花 (官方简介: 演奏到忘我就会即兴加入高难度的加花，把共演者带乱，被叫作「狂犬」): empty-handed, a string of jabs
 *  on one of FILLS — syncopated, never on the grid, so a guard timed to a steady beat keeps missing — and a
 *  two-fisted downbeat that hits the floor like a crash cymbal. The fill is picked by the attack serial: no
 *  roll to replay, and two casts in a row never play the same groove. a.shots the strokes played, a.liftAt
 *  the latest jab. */
function step_fill(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if ((a.mode ?? FILL.play) !== FILL.play) return;
  const fill = FILLS[a.serial % FILLS.length];
  const last = fill.length - 1;
  if (a.shots === last && a.t >= s.start + fill[last] - FILL_POISE) addMod(f, 'poise', .2, { max: true });
  if (a.shots > last || a.t < s.start + fill[a.shots]) return;
  const crash = a.shots === last;
  a.shots++;
  const parts = fillOf(s);
  const own = a.skill;
  a.skill = crash ? parts.crash : parts.jab;
  a.hit = new Set();
  applyMelee(g, f, a);
  a.skill = own;
  if (!crash) {
    a.liftAt = a.t;
    g.effect('masking-fill', f.x + f.facing * (62 + (a.shots % 2) * 14), f.y - 104 - (a.shots % 3) * 14, f.data.color, .32, { n: a.shots, dir: f.facing, hit: a.hit.size > 0 });
    return;
  }
  g.effect('masking-crash', f.x + f.facing * 88, FLOOR, f.data.color, .62, { dir: f.facing, radius: s.range });
  g.shake = Math.max(g.shake, 8);
  a.mode = FILL.done;
  a.t = Math.max(a.t, s.duration - FILL_TAIL);
}
SCRIPTS['fill-in'] = Object.assign(SCRIPTS['fill-in'] ?? {}, { update: step_fill, noMelee: true, skipCount: true });

/* ---- L 银河流星踢 ---- */

/** The charge speed, the bumps' beat while carried, the kick's reach. */
const METEOR_SPEED = 900;
const METEOR_BUMP_GAP = .13;
const METEOR_KICK_R = 120;
/** A missed charge still kicks the floor this far ahead of where the bike stopped. */
const METEOR_MISS_AHEAD = 130;
/** The wreck goes off this long after the kick lands, so the two bursts read as two hits, not one blur. */
const WRECK_DELAY = .14;
/** The house lights stay down while she rides, and come back up over this long once she leaps. */
const DIM_FADE = .3;
/** The headlight's own fade once she stops revving. */
const HEADLIGHT_KEEP = .15;
const meteorParts = new WeakMap<Skill, { ram: Skill; bump: Skill; kick: Skill; miss: Skill }>();
const meteorOf = (s: Skill) => derive(meteorParts, s, s => {
  const kick = finaleOf(s);
  return {
    ram: { ...s, finale: undefined, knock: 0, react: { kind: 'pin' as const, stun: .5, holdStill: true } },
    // Quiet: the bumps chip without counting into the combo, so the kick at the end lands at full weight.
    bump: { ...s, finale: undefined, damage: 10, knock: 0, react: { kind: 'none' as const } },
    kick,
    miss: { ...kick, damage: Math.round((kick.damage ?? 0) * .55) },
  };
});
/** On the bike through the rev, the charge and the carry: the bike, LOCK, the dim, the headlight while revving. */
function keepRide(g: FightGame, f: Fighter, a: Attack, n: number): void {
  keepBike(g, f, a, n);
  keepOn(g, f, a, 'masking-lock', LOCK_COLOR);
  keepOn(g, f, a, 'masking-dim', '#07060c', { follow: undefined, x: W / 2, y: H / 2 }, DIM_FADE);
}
/** The leap: off the seat at a.liftAt from where she was (a.tossAt holds that x), the kick lands on a.anchor. */
function meteorLeap(g: FightGame, f: Fighter, a: Attack, mark: number): void {
  a.mode = METEOR.leap;
  a.liftAt = a.t;
  a.tossAt = f.x;
  a.anchor = clamp(mark, X_MIN, X_MAX);
  // LOCK hops off as the bike rears: a puff of her own green. The bike goes on without her — it rears up,
  // tips, and goes off behind her a beat after the kick lands.
  const lock = g.effects.find(e => e.type === 'masking-lock' && e.fighter === f.id);
  if (lock) g.effect('masking-lock-off', lock.x, lock.y, LOCK_COLOR, .7, { dir: f.facing });
  dropRide(g, f);
  g.effect('masking-wreck', f.x, FLOOR, f.data.color, METEOR_LEAP + WRECK_DELAY + 1.15, { dir: f.facing, t0: METEOR_LEAP + WRECK_DELAY });
  g.effect('masking-meteor', f.x, f.y, f.data.color, METEOR_LEAP + .05, { follow: f.id, ox: 0, oy: 0, dir: f.facing, t0: METEOR_LEAP * METEOR_RISE });
}
/** 银河流星踢 (第三季第 10、11 话: 载着 LOCK 从东京飙到千叶; B 站「护六狂魔 mas王」、「假面骑士 MASKING」): the house
 *  lights drop and the headlight finds them; LOCK holds on behind her. Full throttle: the first body on the nose
 *  is rammed and carried, bumped all the way to the edge of the stage (no guard holds a bike; jump it). There the
 *  bike rears, LOCK hops clear, she springs off the seat, turns at the top and comes down in a flying kick like a
 *  falling star; the bike behind her goes up in a gold starburst. A charge that finds nobody still leaps and
 *  kicks the floor ahead (lighter). a.mode walks METEOR; a.hold the body on the nose; a.shots the bumps. */
function step_meteor(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? METEOR.rev;
  const parts = meteorOf(s);
  if (mode === METEOR.rev) {
    if (a.shots === 0) {
      a.shots = 1;
      g.effect('masking-exhaust', f.x - f.facing * 90, FLOOR - 30, '#e2dad0', .6, { dir: f.facing, radius: 60 });
      g.text('LOCK，抓紧了！', f.x, f.y - 236, f.data.color, 1.1, 19);
      g.audio.play('engine-rev', f.id);
    }
    keepRide(g, f, a, 2);
    keepOn(g, f, a, 'masking-headlight', '#fff2c0', { oy: -70 }, HEADLIGHT_KEEP).ox = f.facing * BIKE_NOSE;
    if (a.t < s.start) return;
    a.mode = METEOR.charge;
    a.tossAt = a.t;
    a.shots = 0;
    g.shake = Math.max(g.shake, 5);
    return;
  }
  if (mode === METEOR.charge) {
    keepRide(g, f, a, 0);
    f.x = clamp(f.x + f.facing * METEOR_SPEED * dt, X_MIN, X_MAX);
    tailLight(g, f, a, dt);
    const o = foeAhead(g, f, BIKE_NOSE + 20);
    if (o && grounded(o) && !isInvulnerable(o)) {
      a.hit = new Set();
      if (hit(g, f, o, parts.ram, a)) {
        a.mode = METEOR.carry;
        a.hold = o.id;
        a.tossAt = a.t;
        a.shots = 0;
        o.attack = null;
        retainEscape(o, true);
        g.hitstop = Math.max(g.hitstop, .08);
        g.effect('masking-ram', o.x, o.y - 80, f.data.color, .4, { dir: f.facing, radius: 60 });
        g.shake = Math.max(g.shake, 9);
        return;
      }
    }
    const wall = f.facing > 0 ? f.x >= X_MAX : f.x <= X_MIN;
    if (a.t >= a.tossAt + METEOR_CHARGE || wall) meteorLeap(g, f, a, f.x + f.facing * METEOR_MISS_AHEAD);
    return;
  }
  if (mode === METEOR.carry) {
    keepRide(g, f, a, 0);
    const o = g.fighterById(a.hold);
    if (!o || o.hp <= 0) {
      a.hold = -1;
      meteorLeap(g, f, a, f.x + f.facing * METEOR_MISS_AHEAD);
      return;
    }
    // Pushed along on the nose; pinned against the wall, the bike can only push so far.
    f.x = clamp(f.x + f.facing * METEOR_SPEED * dt, X_MIN, X_MAX);
    pinAhead(f, o, BIKE_NOSE, .4);
    f.x = clamp(o.x - f.facing * BIKE_NOSE, X_MIN, X_MAX);
    tailLight(g, f, a, dt);
    while (a.t >= a.tossAt + (a.shots + 1) * METEOR_BUMP_GAP) {
      a.shots++;
      a.hit = new Set();
      hit(g, f, o, parts.bump, a);
      g.effect('masking-bump', o.x - f.facing * 16, o.y - 70 - (a.shots % 3) * 22, '#ffd56a', .25, { dir: f.facing, n: a.shots });
    }
    const wallX = f.facing > 0 ? X_MAX : X_MIN;
    if (Math.abs(o.x - wallX) < 1 || a.t >= a.tossAt + METEOR_CARRY) {
      g.effect('masking-ram', o.x, o.y - 80, '#ffffff', .35, { dir: f.facing, radius: 80 });
      g.shake = Math.max(g.shake, 10);
      meteorLeap(g, f, a, o.x);
    }
    return;
  }
  if (mode !== METEOR.leap) return;
  const u = (a.t - a.liftAt) / METEOR_LEAP;
  const held = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  if (held && held.hp > 0) {
    held.x = clamp(a.anchor, X_MIN, X_MAX);
    held.y = FLOOR;
    held.vx = 0;
    held.vy = 0;
    held.knocked = 0;
    held.stun = Math.max(held.stun, .35);
  }
  f.vy = 0;
  f.invuln = Math.max(f.invuln, .05);
  const fromX = a.tossAt - f.facing * 50;
  if (u < METEOR_RISE) {
    // Up off the seat and a little back: the turn at the top.
    const k = u / METEOR_RISE;
    f.y = FLOOR - METEOR_HIGH * (1 - (1 - k) * (1 - k));
    f.x = clamp(a.tossAt - f.facing * 50 * k, X_MIN, X_MAX);
    return;
  }
  // Down along a line onto the mark, foot first.
  const k = Math.min(1, (u - METEOR_RISE) / (1 - METEOR_RISE));
  const toX = a.anchor - f.facing * 44;
  f.x = clamp(fromX + (toX - fromX) * k * k, X_MIN, X_MAX);
  f.y = FLOOR - METEOR_HIGH * (1 - k * k);
  if (u < 1) return;
  f.y = FLOOR;
  a.hit = new Set();
  let landed = false;
  if (held && held.hp > 0) landed = hit(g, f, held, parts.kick, a);
  for (const o of foes(g, f)) {
    if (o === held || Math.abs(o.x - a.anchor) > METEOR_KICK_R || !grounded(o)) continue;
    if (hit(g, f, o, held ? parts.kick : parts.miss, a)) landed = true;
  }
  a.hold = -1;
  g.effect('masking-impact', a.anchor, FLOOR - 70, f.data.color, 1, { dir: f.facing, radius: 140, hit: landed });
  g.flash = Math.max(g.flash, landed ? .2 : .1);
  g.shake = Math.max(g.shake, landed ? 14 : 8);
  g.audio.play('slam', f.id);
  a.mode = METEOR.done;
  a.t = Math.max(a.t, s.duration - METEOR_TAIL);
}
SCRIPTS['meteor-kick'] = Object.assign(SCRIPTS['meteor-kick'] ?? {}, { update: step_meteor, customDash: true, noMelee: true, skipCount: true });
