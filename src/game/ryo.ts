import type { Skill } from '../data/types.ts';
import { gainEnergy, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, withFinale, withGuard } from './combat.ts';
import { addMod, type Mod } from './mods.ts';
import { CAST_WATCHERS, SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { BORROW, RYO_BORROW, RYO_BROKE, RYO_GRASS, RYO_WEIRD, WEIRD } from '../render/clips.ts';

/* 山田凉 — 孤独摇滚！/ 结束乐队的贝斯手兼作曲，「世界的山田」。穷富循环型: her 气 is her wallet. Four scripts on SCRIPTS
   by fx name (combat.ts imports this module once):
     ryo-grass   U 路边的野草        the weed by the road (episode 3): she pulls it and eats it. The meal heals, more when
                                     she is broke (under RYO_GRASS.poor 气); a hit while she chews chokes it off; the third
                                     meal in a row makes her sick (B 站: 吃草吃中毒的山田凉)
     ryo-borrow  I 下次一定还        凉乞钞: hands together, then the palm out. She catches them and borrows their 气 for
                                     good, and the IOU she leaves skims half of every 气 they gain for a while. More from
                                     一里; only 虹夏 can make her pay it back (the 彩蛋s)
     ryo-weird   O 怪人是夸奖        she likes being called a weirdo: a melee hit in the window does nothing, she blushes,
                                     chops them away and swings faster for a while
     ryo-broke   L 倾家荡产的低音    every yen goes on instruments: the super spends the whole bar (CharacterData.meterMax
                                     holds 150), the coins turn into low waves, the drop; every 气 past the cost hurts more
   No passive of her own beyond focus. Everything drawn is render/ryoFx.ts. */

const ID = 'ryo';
const BLUE = '#3D5DAF';
const LEAF = '#7cc46a';
const GOLD = '#f2c94c';
const IOU_TAG = 'ryo-iou';
const MEAL_TAG = 'ryo-meal';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* U and O are endure moves only for the template's clock: U has no armour at all (a hit chokes the meal), and O's
   window is the counter, not a shield. The cast arms endure for every endure move, so it is taken off here. */
CAST_WATCHERS.push((_g, f, _slot, skill) => {
  if (skill.fx === `${ID}-grass` && f.attack) f.attack.endure = 0;
});

/* ---- U 路边的野草 ---- */

/** a.shots: 1 once the weed is out of the ground, 2 once it is eaten. */
function step_grass(g: FightGame, f: Fighter, a: Attack): void {
  const G = RYO_GRASS;
  f.vx = 0;
  a.endure = 0;
  if (a.shots === 0 && a.t >= G.pluck) {
    a.shots = 1;
    g.effect('ryo-pluck', f.x + f.facing * 34, FLOOR, LEAF, .5, { dir: f.facing });
    g.effect('ryo-chew', f.x + f.facing * 14, f.y - headOf(f) * .78, LEAF, G.chew - G.pluck + .05, {
      follow: f.id, ox: f.facing * 14, oy: -headOf(f) * .78, dir: f.facing, fighter: f.id, cast: { serial: a.serial, tail: .05 },
    });
  }
  if (a.shots !== 1 || a.t < G.chew) return;
  a.shots = 2;
  // Meals inside the window: the third one is one too many.
  const meal = f.mods.find(m => m.kind === 'look' && m.tag === MEAL_TAG && m.left > 0);
  const n = (meal?.v ?? 0) + 1;
  const sick = n >= G.meals;
  const poor = f.energy < G.poor;
  let heal: number = poor ? G.poorHeal : G.heal;
  if (sick) {
    heal = Math.round(heal / 2);
    if (meal) meal.left = 0;
    addMod(f, 'slow', G.sick, { v: .65, jump: .85, atk: .9, mark: 'ryo-sick' });
    g.effect('ryo-sick', f.x, f.y - headOf(f) * .8, '#9bcf5a', .7, { follow: f.id, ox: 0, oy: -headOf(f) * .8 });
  } else {
    addMod(f, 'look', G.mealWindow, { tag: MEAL_TAG, v: n });
    if (poor) addMod(f, 'regen', G.regenTime, { v: G.regen, tag: 'ryo-grass' });
  }
  f.hp = Math.min(f.data.hp, f.hp + heal);
  g.effect('ryo-heal', f.x, f.y, LEAF, poor && !sick ? G.regenTime : .9, {
    follow: f.id, ox: 0, oy: 0, radius: headOf(f), hit: poor && !sick, n: sick ? 1 : 0,
  });
  g.effect('ryo-bitter', f.x + f.facing * 22, f.y - headOf(f) * .8, LEAF, .55, { dir: f.facing, n: sick ? 1 : 0 });
}
SCRIPTS[`${ID}-grass`] = { update: step_grass, noMelee: true };

/* ---- I 下次一定还 ---- */

/** The IOU on the lender: a 'skim' mod whose thief is her. While it holds, RYO_BORROW.skim of every 气 they gain goes
 *  to her (fighter.ts gainEnergy); `acc` collects what she took since the last graphic. A 'look' twin wears the slip. */
function skimOf(o: Fighter, debtor: number): Mod | undefined {
  return o.mods.find(m => m.kind === 'skim' && m.tag === IOU_TAG && m.from === debtor && m.left > 0);
}
function noteOn(o: Fighter, debtor: number): Mod | undefined {
  return o.mods.find(m => m.kind === 'look' && m.tag === IOU_TAG && m.from === debtor && m.left > 0);
}
/** 彩蛋: only 虹夏 ever makes her pay. Her clean hit on 凉 while the IOU holds lands × RYO_BORROW.nijika, takes the loan
 *  back and tears the note up. Everyone else just watches the money go. */
function collect(g: FightGame, f: Fighter, attacker: Fighter, blocked: boolean): void {
  if (blocked || attacker.data.id !== 'nijika') return;
  const m = f.mods.find(x => x.kind === 'incoming' && x.tag === IOU_TAG && x.from === attacker.id && x.left > 0);
  if (!m) return;
  const back = Math.min(m.acc ?? 0, Math.floor(f.energy));
  f.energy = clamp(f.energy - back, 0, f.energyMax);
  if (back > 0) gainEnergy(attacker, back, true);
  m.left = 0;
  m.acc = 0;
  const skim = skimOf(attacker, f.id);
  if (skim) { skim.left = 0; skim.onExpire = undefined; }
  const note = noteOn(attacker, f.id);
  if (note) note.left = 0;
  g.effect('ryo-repay', f.x, f.y - headOf(f) * .6, GOLD, .6, { tx: attacker.x - f.x, ty: -headOf(attacker) * .55 + headOf(f) * .6, n: Math.max(1, Math.round(back / 5)) });
  g.effect('ryo-nijika', attacker.x, attacker.y - headOf(attacker) - 10, '#F9D648', .6, { follow: attacker.id, ox: 0, oy: -headOf(attacker) - 10 });
}
/** The IOU runs out: the slip on the lender tears away, and she pockets the lot. */
function expired(debtor: number) {
  return (g: FightGame, o: Fighter) => {
    g.effect('ryo-default', o.x, o.y - headOf(o) - 18, GOLD, .7, { follow: o.id, ox: 0, oy: -headOf(o) - 18 });
    const f = g.fighterById(debtor);
    if (f) g.effect('ryo-pocket', f.x, f.y - headOf(f) * .5, GOLD, .5, { follow: f.id, ox: 0, oy: -headOf(f) * .5 });
  };
}
function lend(g: FightGame, f: Fighter, o: Fighter, take: number): void {
  const B = RYO_BORROW;
  addMod(o, 'skim', B.iou, { tag: IOU_TAG, from: f.id, v: B.skim, acc: 0, thief: f, onExpire: expired(f.id) });
  addMod(o, 'look', B.iou, { tag: IOU_TAG, from: f.id, mark: 'ryo-iou' });
  if (o.data.id === 'nijika') {
    const owed = (f.mods.find(x => x.kind === 'incoming' && x.tag === IOU_TAG && x.from === o.id && x.left > 0)?.acc ?? 0) + take;
    addMod(f, 'incoming', B.iou, { tag: IOU_TAG, from: o.id, v: B.nijika, acc: owed, hurt: collect });
  }
}
/** The coins she skims hop over now and then (host side; the effect is sent to a guest). Small gains are pooled until
 *  SKIM_FX 气 has gone over, so a trickle of meter does not spawn a coin effect every few steps. */
const SKIM_FX = 2;
STEP_WATCHERS.push((g, o) => {
  if (g.netRole === 'guest') return;
  for (const m of o.mods) {
    if (m.kind !== 'skim' || m.tag !== IOU_TAG || m.left <= 0 || (m.acc ?? 0) < SKIM_FX) continue;
    const f = m.from != null ? g.fighterById(m.from) : undefined;
    const took = m.acc ?? 0;
    m.acc = 0;
    if (!f) continue;
    g.effect('ryo-coins', o.x, o.y - headOf(o) * .55, GOLD, .55, { tx: f.x - o.x, ty: -headOf(f) * .58 + headOf(o) * .55, n: clamp(Math.round(took / 3), 1, 4) });
  }
});

function release(a: Attack): void {
  a.mode = BORROW.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - RYO_BORROW.tail);
}
/** a.mode walks BORROW; a.tossAt is the catch; a.liftAt the 气 they had before it; a.shots flips to 1 when the money changes hands. */
function step_borrow(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill, B = RYO_BORROW;
  const mode = a.mode ?? BORROW.reach;
  if (mode === BORROW.reach) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && Math.abs(o.y - f.y) < 100 && !isInvulnerable(o)) {
      a.hit = new Set();
      // What they had before the catch paid them their own little bit of meter: that is all she can borrow.
      const had = o.energy;
      if (hit(g, f, o, s, a)) {
        a.mode = BORROW.held;
        a.liftAt = had;
        a.hold = o.id;
        a.tossAt = a.t;
        f.x = clamp(o.x - f.facing * 62, X_MIN, X_MAX);
        g.effect('ryo-ask', f.x + f.facing * 30, f.y - headOf(f) * .58, GOLD, B.hold, {
          follow: f.id, ox: f.facing * 30, oy: -headOf(f) * .58, dir: f.facing, fighter: f.id, cast: { serial: a.serial, mode: BORROW.held, tail: .1 },
        });
        return;
      }
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? B.step) * dt, X_MIN, X_MAX);
    if (a.t >= s.start + B.lunge || f.x <= X_MIN || f.x >= X_MAX) {
      // Nobody to borrow from: the hand comes back empty.
      a.mode = BORROW.whiff;
      a.t = Math.max(a.t, s.duration - B.tail - .1);
    }
    return;
  }
  if (mode !== BORROW.held) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0 || a.t >= a.tossAt + B.hold) { release(a); return; }
  o.x = clamp(f.x + f.facing * 62, X_MIN, X_MAX);
  o.y = FLOOR;
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, .2);
  if (a.shots > 0 || a.t < a.tossAt + B.take) return;
  a.shots = 1;
  // 彩蛋: she always goes to 一里 first, and gets more out of her.
  const bocchi = o.data.id === 'bocchi';
  const take = Math.min(bocchi ? B.bocchi : B.sum, Math.floor(Math.min(a.liftAt, o.energy)));
  if (take <= 0) {
    // Their pockets are as empty as hers.
    g.effect('ryo-empty', o.x, o.y - headOf(o) * .6, '#c8c8d0', .7, { dir: -f.facing });
    return;
  }
  o.energy = clamp(o.energy - take, 0, o.energyMax);
  gainEnergy(f, take, true);
  lend(g, f, o, take);
  g.effect('ryo-coins', o.x, o.y - headOf(o) * .55, GOLD, .55, { tx: f.x + f.facing * 30 - o.x, ty: -headOf(f) * .58 + headOf(o) * .55, n: Math.round(take / 5) });
  g.effect('ryo-iou-stick', o.x, o.y - headOf(o) - 18, GOLD, .5, { follow: o.id, ox: 0, oy: -headOf(o) - 18 });
  if (bocchi) g.effect('ryo-bocchi', o.x, o.y - headOf(o) * .7, '#F5A9C0', .8, { follow: o.id, ox: 0, oy: -headOf(o) * .7, radius: headOf(o) });
}
SCRIPTS[`${ID}-borrow`] = { update: step_borrow, noMelee: true, placesHold: [BORROW.held] };

/* ---- O 怪人是夸奖 ---- */

function counter_weird(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  const W = RYO_WEIRD;
  a.mode = WEIRD.strike;
  a.hold = attacker.id;
  a.shots = 0;
  a.t = a.skill.duration - (W.strike + W.recover);
  a.tossAt = a.t;
  f.invuln = Math.max(f.invuln, W.invuln);
  f.facing = (Math.sign(attacker.x - f.x) || f.facing) as 1 | -1;
  for (const e of g.effects) if (e.type === 'ryo-aloof' && e.fighter === f.id) e.life = Math.min(e.life, .08);
  g.effect('ryo-blush', f.x, f.y, '#ff9db5', .9, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing, fighter: f.id });
  g.hitstop = Math.max(g.hitstop, .06);
}
const CHOP_REACH = 150;
const chopOf = new WeakMap<Skill, Skill>();
function chopSkill(s: Skill): Skill {
  let c = chopOf.get(s);
  if (!c) chopOf.set(s, c = { ...withFinale(s, true), noBlock: true });
  return c;
}
function step_weird(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, W = RYO_WEIRD;
  const mode = a.mode ?? WEIRD.wait;
  f.vx = 0;
  if (mode === WEIRD.wait) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('ryo-aloof', f.x, f.y, BLUE, s.start, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing, fighter: f.id });
    }
    // Nobody called her a weirdo: she drops the pose.
    if (a.t >= s.start) a.mode = WEIRD.done;
    return;
  }
  if (mode !== WEIRD.strike || a.shots > 0 || a.t < a.tossAt + W.strike) return;
  a.shots = 1;
  a.hit.clear();
  const o = g.fighterById(a.hold);
  let landed = false;
  if (o && o.hp > 0) {
    const ahead = (o.x - f.x) * f.facing;
    if (ahead >= -30 && ahead <= CHOP_REACH && Math.abs(o.y - f.y) <= 130 && hit(g, f, o, chopSkill(s), a)) landed = true;
  }
  g.effect('ryo-chop', f.x + f.facing * 64, f.y - headOf(f) * .55, BLUE, .4, { dir: f.facing, hit: landed });
  addMod(f, 'speed', W.buff, { v: 1, atk: W.atk, tag: 'ryo-weird' });
  g.effect('ryo-pleased', f.x, f.y, '#ff9db5', W.buff, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id });
  if (landed) {
    g.shake = Math.max(g.shake, 6);
    g.hitstop = Math.max(g.hitstop, .06);
  }
}
SCRIPTS[`${ID}-weird`] = { update: step_weird, counter: counter_weird, noMelee: true };

/* ---- L 倾家荡产的低音 ---- */

/** How much harder it hits for the 气 she spent past the cost (kept on a.liftAt by the cast). */
function spendMul(a: Attack): number {
  return 1 + RYO_BROKE.bonus * clamp(a.liftAt / RYO_BROKE.extra, 0, 1);
}
function scaled(s: Skill, mul: number): Skill {
  return mul === 1 ? s : { ...s, damage: Math.round(s.damage * mul) };
}
const WAVE_TALL = 110;
const DROP_TALL = 220;
function waveHit(g: FightGame, f: Fighter, a: Attack, reach: number, tall: number, skill: Skill): boolean {
  a.hit.clear();
  let any = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -30 || ahead > reach || FLOOR - o.y > tall) continue;
    if (hit(g, f, o, skill, a)) any = true;
  }
  return any;
}
function step_broke(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, S = RYO_BROKE;
  f.vx = 0;
  if (!a.emitted) {
    a.emitted = true;
    g.effect('ryo-sub', f.x, 0, BLUE, s.duration + .2, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .3 } });
  }
  if (a.mode == null && a.t >= S.toss) {
    a.mode = 0;
    g.effect('ryo-spend', f.x, f.y - headOf(f) * .5, GOLD, 1.1, { dir: f.facing, n: Math.round(10 + a.liftAt / 5), radius: headOf(f) });
  }
  const mul = spendMul(a);
  while (a.shots < S.waves.length && a.t >= S.waves[a.shots]) {
    const i = a.shots++;
    const land = waveHit(g, f, a, S.reach, WAVE_TALL, scaled(withGuard(s, i), mul));
    g.effect('ryo-wave', f.x + f.facing * 30, FLOOR, BLUE, .7, { n: i, dir: f.facing, radius: S.reach, hit: land });
    g.shake = Math.max(g.shake, 3);
  }
  if (a.mode === 0 && a.t >= S.finale) {
    a.mode = 1;
    waveHit(g, f, a, S.burstReach, DROP_TALL, scaled(withGuard(withFinale(s, true), S.waves.length), mul));
    g.effect('ryo-drop', f.x + f.facing * 40, FLOOR, BLUE, 1, { dir: f.facing, radius: S.burstReach, n: Math.round(a.liftAt) });
    g.flash = Math.max(g.flash, .12);
    g.shake = Math.max(g.shake, 11);
    g.hitstop = Math.max(g.hitstop, .07);
  }
  if (a.mode === 1 && a.t >= S.broke) {
    a.mode = 2;
    g.effect('ryo-leaf', f.x, f.y - headOf(f) - 60, LEAF, s.duration - S.broke + .3, { follow: f.id, ox: 0, oy: -headOf(f), dir: f.facing });
  }
}
SCRIPTS[`${ID}-broke`] = {
  update: step_broke, noMelee: true,
  // Every 气 left after the cost goes too. a.liftAt keeps the extra for the damage.
  cast(_g: FightGame, f: Fighter) {
    if (!f.attack) return;
    f.attack.liftAt = Math.max(0, f.energy);
    f.energy = 0;
  },
};
