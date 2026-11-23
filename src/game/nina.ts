import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withFinale, withGuard } from './combat.ts';
import { addMod, type Mod } from './mods.ts';
import { SCRIPTS } from './scripts.ts';
import { NINA_LAMP, NINA_SCREAM, NINA_STAND, NINA_STAND_TIME, NINA_THORNS } from '../render/clips.ts';

/* 井芹仁菜 — Girls Band Cry / TOGENASHI TOGEARI 的主唱，「小孩姐」。刺猬反击型: I keeps them off her, U pesters from
   mid range, O stands it out and answers face to face. Four scripts on SCRIPTS by fx name (combat.ts imports this once):
     nina-lamp    U 吸顶灯乱舞  episode 2: the ceiling light she was carrying home, swung round twice and thrown
     nina-thorns  I 正义之刺    the red-and-white spikes that burst out of her when it all gets too much; then the hedgehog:
                               a swing at her pricks back and every hit grows them a level (「刺比预想的还多」)
     nina-stand   O 绝不低头    「我没有错」: chest out, she takes it at half and answers with the slap (episode 8)
     nina-scream  L 雨夜嘶吼    alone in the rain with the thorns, the borrowed mic (episode 1), then the light of the five
                               playing together for the first time breaks through: three screams of prism light and a tide
   不认输 (passive): under 30% health 正义之刺 starts at the top level and the hedgehog does not flinch.
   The lamp is lamp.png; the mic stand is drawn into her L cells; every scratch, ray and drop of rain is render/ninaFx.ts. */

const ID = 'nina';
const RED = '#D90E2C';
const PALE = '#ffe6e9';
const THORN_TAG = 'nina';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 吸顶灯乱舞 ---- */

const swings = new WeakMap<Skill, Skill>();
/** The two swings are melee (thorns and counters see them as such), the throw is the skill itself. */
function swingOf(s: Skill): Skill {
  let v = swings.get(s);
  if (!v) swings.set(s, v = { ...s, type: 'heavy', damage: NINA_LAMP.damage, knock: 40, react: { kind: 'stand', stun: .22 }, guardDmg: 8 } as Skill);
  return v;
}
function step_lamp(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  // a.emitted belongs to the kernel here (it fires the lamp at the start), so the swing graphic keys on a.mode.
  if (a.mode == null) {
    a.mode = 0;
    a.liftAt = 0;
    g.effect('nina-swing', f.x, f.y, '#fff4d6', s.start + .05, { follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f), fighter: f.id, cast: { serial: a.serial, tail: 0 } });
  }
  while ((a.liftAt | 0) < NINA_LAMP.swings.length && a.t >= NINA_LAMP.swings[a.liftAt | 0]) {
    const i = a.liftAt | 0;
    a.liftAt = i + 1;
    a.hit.clear();
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -30 || ahead > NINA_LAMP.reach || Math.abs(o.y - f.y) > 120) continue;
      if (hit(g, f, o, swingOf(s), a)) g.effect('nina-flicker', o.x, o.y - headOf(o) * .55, '#fff4d6', .3, { dir: f.facing, n: i });
    }
  }
}
SCRIPTS[`${ID}-lamp`] = {
  update: step_lamp,
  trail: 0,
  hitY: 96,
  hit(g: FightGame, attacker: Fighter, defender: Fighter): boolean {
    g.effect('nina-lamp-break', defender.x, defender.y - headOf(defender) * .55, '#fff4d6', .55, { dir: attacker.x <= defender.x ? 1 : -1 });
    g.shake = Math.max(g.shake, 4);
    return false;
  },
};

/* ---- I 正义之刺 ---- */

function thornMod(f: Fighter): Mod | undefined {
  return f.mods.find(m => m.kind === 'thorns' && m.tag === THORN_TAG && m.left > 0);
}
/** The hedgehog's level (0 when there is none). */
export function thornLevel(f: Fighter): number {
  return thornMod(f)?.v ?? 0;
}
function setLevel(g: FightGame, f: Fighter, m: Mod, level: number): void {
  m.v = level;
  f.thorns = Math.max(m.acc ?? 0, NINA_THORNS.levels[level - 1]);
  for (const e of g.effects) if (e.type === 'nina-spines' && e.fighter === f.id) e.n = level;
}
function prick(g: FightGame, who: Fighter, attacker: Fighter, blocked: boolean): void {
  if (blocked || attacker.id === who.id) return;
  const m = thornMod(who);
  if (!m) return;
  const gap = attacker.x - who.x;
  if (Math.abs(gap) <= NINA_THORNS.prick) {
    const dir = Math.sign(gap) || who.facing;
    attacker.vx = dir * NINA_THORNS.push;
    attacker.x = clamp(attacker.x + dir * 18, X_MIN, X_MAX);
    g.effect('nina-prick', who.x + dir * 34, who.y - headOf(who) * .5, RED, .32, { dir, n: m.v ?? 1 });
  }
  if ((m.v ?? 1) < NINA_THORNS.levels.length) {
    setLevel(g, who, m, (m.v ?? 1) + 1);
    g.effect('nina-grow', who.x, who.y, RED, .4, { follow: who.id, ox: 0, oy: 0, radius: headOf(who), n: m.v });
  }
}
function arm(g: FightGame, f: Fighter): void {
  const old = thornMod(f);
  const base = old ? old.acc ?? 0 : f.thorns;
  const low = f.hp < f.data.hp * NINA_THORNS.low;
  const m = addMod(f, 'thorns', NINA_THORNS.time, {
    tag: THORN_TAG, acc: base, hurt: prick,
    onExpire: (game, who) => {
      who.thorns = who.mods.find(x => x.kind === 'thorns' && x.tag === THORN_TAG)?.acc ?? 0;
      for (const e of game.effects) if (e.type === 'nina-spines' && e.fighter === who.id) e.life = Math.min(e.life, .2);
    },
  });
  m.acc = base;
  for (const e of g.effects) if (e.type === 'nina-spines' && e.fighter === f.id) e.life = 0;
  g.effect('nina-spines', f.x, f.y, RED, NINA_THORNS.time, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id, n: 1, hit: low });
  setLevel(g, f, m, low ? NINA_THORNS.levels.length : 1);
  // 不认输: the hedgehog does not flinch.
  if (low) addMod(f, 'poise', NINA_THORNS.time, { max: true });
}
const BURST_TALL = 150;
function step_thorns(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.t < s.start || a.emitted) return;
  a.emitted = true;
  arm(g, f);
  g.effect('nina-burst-front', f.x, f.y, RED, 1, { radius: headOf(f), dir: f.facing });
  g.effect('nina-burst', f.x, f.y, RED, 1.1, { radius: headOf(f), dir: f.facing, hit: thornLevel(f) >= NINA_THORNS.levels.length });
  g.shake = Math.max(g.shake, 6);
  g.hitstop = Math.max(g.hitstop, .04);
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - f.x) > s.range || Math.abs(o.y - f.y) > BURST_TALL) continue;
    hit(g, f, o, s, a);
  }
}
SCRIPTS[`${ID}-thorns`] = { update: step_thorns, noMelee: true };

/* ---- O 绝不低头 ---- */

function counter_stand(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  const swing = attacker.attack?.skill;
  const taken = Math.round((swing?.damage ?? 30) * attacker.data.power * NINA_STAND_TIME.half);
  f.hp = Math.max(1, f.hp - taken);
  g.text('-' + taken, f.x, f.y - 175, PALE, .6, 18);
  a.mode = NINA_STAND.slap;
  a.hold = attacker.id;
  a.anchor = f.x;
  a.shots = 0;
  a.t = a.skill.duration - (NINA_STAND_TIME.lunge + NINA_STAND_TIME.recover);
  a.tossAt = a.t;
  f.facing = (Math.sign(attacker.x - f.x) || f.facing) as 1 | -1;
  g.effect('nina-unbowed', f.x, f.y, RED, .45, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
  g.hitstop = Math.max(g.hitstop, .06);
}
/** The slap: unblockable. Earned by standing a hit out, it grows with the health she has already lost; thrown cold
 *  (nobody came) it is half as hard and never grows. */
function slapOf(f: Fighter, s: Skill, cold: boolean): Skill {
  const fin = withFinale(s, true);
  const mul = cold ? NINA_STAND_TIME.cold : 1 + NINA_STAND_TIME.rage * clamp(1 - f.hp / f.data.hp, 0, 1);
  return { ...fin, damage: Math.round(fin.damage * mul), noBlock: true, noSparks: true };
}
/** How far ahead a cold slap will step in to reach someone. */
const COLD_REACH = 200;
function step_stand(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? NINA_STAND.wait;
  if (mode === NINA_STAND.wait) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('nina-glare', f.x, f.y, RED, s.start, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
    }
    if (a.t < s.start) return;
    // Nobody came: she slaps anyway (「我没有错」), at half strength and without the anger bonus.
    a.mode = NINA_STAND.cold;
    a.anchor = f.x;
    a.shots = 0;
    a.tossAt = a.t;
    const foe = g.nearestEnemyTo(f, f.x);
    const ahead = foe ? (foe.x - f.x) * f.facing : -1;
    a.hold = foe && foe.hp > 0 && ahead > -20 && ahead <= COLD_REACH ? foe.id : -1;
    return;
  }
  if (mode !== NINA_STAND.slap && mode !== NINA_STAND.cold) return;
  const cold = mode === NINA_STAND.cold;
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  const k = clamp((a.t - a.tossAt) / NINA_STAND_TIME.lunge, 0, 1);
  const target = o ? o.x - f.facing * 52 : a.anchor + f.facing * 60;
  f.x = clamp(a.anchor + (target - a.anchor) * k, X_MIN, X_MAX);
  f.vx = 0;
  if (a.shots === 0 && k >= 1) {
    a.shots = 1;
    a.hit.clear();
    let landed = false;
    const slap = slapOf(f, s, cold);
    const connect = (foe: Fighter) => {
      const ahead = (foe.x - f.x) * f.facing;
      if (foe.hp <= 0 || ahead < -30 || ahead > 130 || Math.abs(foe.y - f.y) > 120) return;
      if (hit(g, f, foe, slap, a)) {
        landed = true;
        g.effect('nina-slap', foe.x, foe.y - headOf(foe) * .62, RED, .6, { dir: f.facing, radius: headOf(foe), n: cold ? 1 : 0 });
      }
    };
    if (o) connect(o);
    else for (const foe of g.fighters) if (g.isEnemy(f, foe) && foe.hp > 0 && !foe.echo) connect(foe);
    if (landed) {
      g.shake = Math.max(g.shake, cold ? 5 : 8);
      g.hitstop = Math.max(g.hitstop, cold ? .05 : .08);
      if (!cold) g.flash = Math.max(g.flash, .06);
    } else g.effect('nina-shove', f.x + f.facing * 70, f.y - headOf(f) * .55, PALE, .3, { dir: f.facing });
  }
}
SCRIPTS[`${ID}-stand`] = { update: step_stand, counter: counter_stand, noMelee: true };

/* ---- L 雨夜嘶吼 ---- */

const WAVE_TALL = 170;
const TIDE_TALL = 230;
/** Each sweep catches anyone ahead of her its front has reached. a.hit is cleared once per sweep. */
function sweep(g: FightGame, f: Fighter, a: Attack, from: number, speed: number, reach: number, tall: number, skill: Skill): void {
  const front = (a.t - from) * speed;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > front || ahead > reach || FLOOR - o.y > tall) continue;
    hit(g, f, o, skill, a);
  }
}
function step_scream(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = NINA_SCREAM;
  const mouthY = f.y - headOf(f) * .74;
  if (!a.emitted) {
    a.emitted = true;
    a.liftAt = 0;
    g.effect('nina-rain', f.x, f.y, RED, s.duration + .3, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .4 } });
    g.effect('nina-spot', f.x, f.y, '#fff2e0', s.duration + .2, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id, cast: { serial: a.serial, tail: .3 } });
  }
  // Each scream: the prism opens at the mic and a band of light crosses the stage.
  while ((a.liftAt | 0) < S.waves.length && a.t >= S.waves[a.liftAt | 0]) {
    const i = a.liftAt | 0;
    a.liftAt = i + 1;
    a.hit.clear();
    g.effect('nina-prism', f.x + f.facing * 34, mouthY, '#ffffff', .7, { n: i, dir: f.facing, radius: headOf(f) });
    g.effect('nina-wave', f.x + f.facing * 40, mouthY + 20, '#ffffff', s.range / S.speed + .4, { n: i, dir: f.facing, radius: s.range });
    g.shake = Math.max(g.shake, 3 + i);
  }
  const live = (a.liftAt | 0) - 1;
  if (live >= 0 && a.mode == null) sweep(g, f, a, S.waves[live], S.speed, s.range, WAVE_TALL, withGuard(s, live));
  // The tide: every colour at once, white at the front, and the rain stops.
  if (a.mode == null && a.t >= S.tide) {
    a.mode = 1;
    a.hit.clear();
    g.effect('nina-tide', f.x + f.facing * 40, mouthY + 30, '#ffffff', .95, { dir: f.facing, radius: s.range });
    g.effect('nina-prism', f.x + f.facing * 34, mouthY, '#ffffff', .9, { n: 3, dir: f.facing, radius: headOf(f) });
    g.flash = Math.max(g.flash, .05);
    g.shake = Math.max(g.shake, 10);
  }
  if (a.mode === 1) {
    const before = a.hit.size;
    sweep(g, f, a, S.tide, S.tideSpeed, s.range, TIDE_TALL, withGuard(withFinale(s, true), S.waves.length));
    if (a.hit.size > before) g.hitstop = Math.max(g.hitstop, .07);
  }
  if (a.shots === 0 && a.t >= S.pinky) {
    a.shots = 1;
    g.effect('nina-pinky', f.x + f.facing * 30, f.y - headOf(f) * .78, PALE, .7, { dir: f.facing });
  }
}
SCRIPTS[`${ID}-scream`] = { update: step_scream, noMelee: true, noSuperFx: true };
