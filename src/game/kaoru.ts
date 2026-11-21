import type { Skill } from '../data/types.ts';
import { gainEnergy, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, retainEscape, withFinale } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { hasStatus } from './status.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  KAORU_APEX, KAORU_DROP, KAORU_FALL, KAORU_HANG, KAORU_LIE, KAORU_RISE, KAORU_ROSE, KAORU_SNAP_DELAY,
} from '../render/clips.ts';

/* 濑田薰（萌娘百科）— Hello, Happy World! 的吉他手，羽丘的「王子」，口癖「儚い」（别号哈卡奈），管粉丝叫小猫咪；
   背得出莎士比亚却一句不懂，被追问就「つまり、そういうことさ」（口头禅来自千圣）；恐高，被心拉去跳伞时念了一串
   不会飞的鸟的名字，在空中微笑着昏了过去；千圣一声「小薰」就破功脸红（唯一撩不动的小猫咪）。
   Four scripts on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     kaoru-fall   U 高空微笑坠落   an elegant leap toward them, she faints smiling at the top and drops straight down on them
     kaoru-quote  I 似懂非懂的名言 a slow vortex of violet petals (混乱); already muddled, she snaps her fingers for more
     kaoru-fans   O 小猫咪亲卫队   a counter: her fans lean out behind her; swing at her and they stampede over you
     kaoru-rose   L 虚幻蔷薇·终幕  the spotlight; a giant rose closes round them, a finger snap, a storm of petals
   彩蛋: 千圣 is the one kitten her fans will not charge (the counter is halved and they back off), and the
   curtain call after 终幕 blushes when it is 千圣 she played it to. Pictures in render/kaoruFx.ts. */

const VIOLET = '#AA33CC';
const PINK = '#ffb3dd';
const ID = 'kaoru';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
const isChisato = (o: Fighter | undefined) => o?.data.id === 'chisato';

/* ---- U 高空微笑坠落 ---- */

const FALL_REACH = 86;
/** How far forward she can carry the leap; a target past this is met at the edge of it. */
const FALL_TRAVEL = 430;
function step_fall(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const F = KAORU_FALL;
  const mode = a.mode ?? F.crouch;
  if (mode === F.crouch) {
    if (a.t < s.start) return;
    // The spot is chosen at take-off: the shadow on the floor is the tell, and walking out of it is the answer.
    const o = g.nearestEnemyTo(f, f.x);
    const want = o && o.hp > 0 ? o.x : f.x + f.facing * 240;
    a.anchor = f.x;
    a.liftAt = clamp(clamp(want, f.x - FALL_TRAVEL, f.x + FALL_TRAVEL), X_MIN, X_MAX);
    a.mode = F.rise;
    a.tossAt = a.t;
    g.effect('kaoru-flip', f.x, FLOOR, VIOLET, .5, { dir: f.facing });
    g.effect('kaoru-mark', a.liftAt, FLOOR, VIOLET, KAORU_RISE + KAORU_HANG + KAORU_DROP + .05, { radius: FALL_REACH });
    return;
  }
  const since = a.t - a.tossAt;
  f.vx = 0; f.vy = 0;
  if (mode === F.rise) {
    const u = clamp(since / KAORU_RISE, 0, 1);
    const k = 1 - (1 - u) ** 2;
    f.x = a.anchor + (a.liftAt - a.anchor) * k;
    f.y = FLOOR - KAORU_APEX * k;
    if (u >= 1) {
      a.mode = F.hang;
      a.tossAt = a.t;
      // The flightless birds go round her head while she loses her nerve, then the smile and the sparkle.
      g.effect('kaoru-birds', f.x, f.y, VIOLET, KAORU_HANG + .1, { follow: f.id, ox: 0, oy: -headOf(f), dir: f.facing });
    }
    return;
  }
  if (mode === F.hang) {
    f.x = a.liftAt;
    f.y = FLOOR - KAORU_APEX + Math.sin(since * 9) * 3;
    if (since >= KAORU_HANG) {
      a.mode = F.drop;
      a.tossAt = a.t;
      g.effect('kaoru-faint', f.x, f.y, '#ffffff', KAORU_DROP + .15, { follow: f.id, ox: 0, oy: -headOf(f) * .55 });
    }
    return;
  }
  if (mode === F.drop) {
    const u = clamp(since / KAORU_DROP, 0, 1);
    f.y = FLOOR - KAORU_APEX * (1 - u * u);
    if (u < 1) return;
    f.y = FLOOR;
    a.mode = F.lie;
    a.tossAt = a.t;
    a.hit.clear();
    let any = false;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      if (Math.abs(o.x - f.x) <= FALL_REACH && o.y > FLOOR - 120 && hit(g, f, o, s, a)) any = true;
    }
    g.effect('kaoru-land', f.x, FLOOR, VIOLET, .7, { radius: FALL_REACH * 1.6, hit: any });
    g.shake = Math.max(g.shake, any ? 8 : 5);
    if (any) g.hitstop = Math.max(g.hitstop, .06);
    return;
  }
  f.y = FLOOR;
  if (mode === F.lie && since >= KAORU_LIE) {
    // Up again as if it had all been part of the act.
    a.mode = F.done;
    g.effect('kaoru-pose', f.x, f.y, VIOLET, .5, { follow: f.id, ox: 0, oy: -headOf(f) * .9, dir: f.facing });
  }
}
SCRIPTS[`${ID}-fall`] = {
  update: step_fall, noMelee: true, skipCount: true,
  // Stiff as a board through the faint and the drop: hits land, but do not knock her out of it.
  brace: (a: Attack) => a.mode === KAORU_FALL.hang || a.mode === KAORU_FALL.drop ? 1 : undefined,
};

/* ---- I 似懂非懂的名言 ---- */

const SNAP: Partial<Skill> = { damage: 10, knock: 140, status: undefined, react: { kind: 'stand', stun: .35 } };
SCRIPTS[`${ID}-quote`] = {
  hitY: 100,
  // Already muddled by the last one: つまり、そういうことさ — a finger snap a beat later is worth a little more.
  hitStatus(g, defender, list, attacker) {
    if (attacker && attacker.data.id === ID && hasStatus(defender, 'confuse')) addMod(defender, 'snap', 1, { from: attacker.id, acc: KAORU_SNAP_DELAY });
    return list;
  },
};
STEP_WATCHERS.push((g, f, dt) => {
  const m = f.mods.find(x => x.kind === 'snap' && x.left > 0);
  if (!m) return;
  m.acc = (m.acc ?? 0) - dt;
  if (m.acc > 0) return;
  clearMod(f, 'snap');
  const k = g.fighterById(m.from ?? -1);
  if (!k || k.hp <= 0 || f.hp <= 0 || isInvulnerable(f)) return;
  const base = k.data.skills[3];
  hit(g, k, f, { ...base, ...SNAP } as Skill, { hit: new Set() }, f.x - k.facing);
  g.effect('kaoru-snap', f.x, f.y - headOf(f) * .62, VIOLET, .55, { dir: k.facing });
});

/* ---- O 小猫咪亲卫队 ---- */

/** a.mode: 0 the window, 1 a swing was caught and the fans are coming, 2 nobody came and they fainted. */
const FANS = { wait: 0, rush: 1, swoon: 2 } as const;
const FANS_RUSH_AT = .16;
const FANS_TAIL = .45;
const FANS_GAIN = 15;
function step_fans(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted) {
    a.emitted = true;
    g.effect('kaoru-fans', f.x, FLOOR, PINK, s.start + .05, { follow: f.id, ox: 0, oy: 0, dir: f.facing, n: 0 });
  }
  const mode = a.mode ?? FANS.wait;
  if (mode === FANS.wait) {
    if (a.t < s.start) return;
    // Nobody swung: one by one they clutch their chests and swoon — and the applause is energy.
    a.mode = FANS.swoon;
    g.effect('kaoru-swoon', f.x, FLOOR, PINK, 1, { dir: f.facing });
    gainEnergy(f, FANS_GAIN);
    return;
  }
  if (mode !== FANS.rush || a.shots > 0 || a.t < a.tossAt + FANS_RUSH_AT) return;
  a.shots = 1;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0 || isInvulnerable(o)) return;
  const shy = isChisato(o);
  a.hit.clear();
  hit(g, f, o, shy ? { ...s, damage: s.damage * .5, knock: (s.knock ?? 0) * .5, react: { kind: 'stand', stun: .4 } } : s, a, f.x);
  g.shake = Math.max(g.shake, shy ? 2 : 6);
}
function counter_fans(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  const s = a.skill;
  a.mode = FANS.rush;
  a.hold = attacker.id;
  a.t = Math.max(a.t, s.duration - FANS_TAIL - FANS_RUSH_AT);
  a.tossAt = a.t;
  f.invuln = Math.max(f.invuln, .35);
  attacker.stun = Math.max(attacker.stun, .3);
  attacker.attack = null;
  retainEscape(attacker);
  for (const e of g.effects) if (e.type === 'kaoru-fans' && e.follow === f.id) e.life = Math.min(e.life, .08);
  // 千圣: the one kitten they do not dare charge — they shuffle back and she only gets a polite little shove.
  const shy = isChisato(attacker);
  g.effect(shy ? 'kaoru-shy' : 'kaoru-rush', f.x, FLOOR, PINK, shy ? .8 : .7, { dir: (attacker.x >= f.x ? 1 : -1), tx: attacker.x - f.x });
  g.hitstop = Math.max(g.hitstop, .06);
}
SCRIPTS[`${ID}-fans`] = { update: step_fans, counter: counter_fans, noMelee: true };

/* ---- L 虚幻蔷薇·终幕 ---- */

const ROSE_REACH = 92;
const PETAL: Partial<Skill> = { damage: 5, knock: 0, react: { kind: 'stand', stun: .4 } };
function hold(o: Fighter, x: number): void {
  o.x = x; o.y = FLOOR; o.vx = 0; o.vy = 0; o.knocked = 0;
  o.stun = Math.max(o.stun, .35);
}
function step_rose(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const R = KAORU_ROSE;
  if (!a.emitted) {
    a.emitted = true;
    a.hold = -1;
    g.effect('kaoru-spot', f.x, FLOOR, '#fff4fb', s.duration + .1, { follow: f.id, ox: 0, oy: 0 });
  }
  if (a.mode == null && a.t >= R.bloom) {
    a.mode = 1;
    const o = g.nearestEnemyTo(f, f.x);
    a.anchor = clamp(o && o.hp > 0 ? o.x : f.x + f.facing * 220, X_MIN, X_MAX);
    g.effect('kaoru-rose', a.anchor, FLOOR, VIOLET, s.duration - R.bloom + .1, { t0: R.wrap - R.bloom });
  }
  if (a.mode === 1 && a.t >= R.wrap) {
    // The petals fold shut: anyone standing in the bloom is inside it. A jump at the bloom clears it.
    a.mode = 2;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
      if (Math.abs(o.x - a.anchor) > ROSE_REACH || o.y < FLOOR - 70) continue;
      a.hold = o.id;
      o.attack = null;
      hold(o, a.anchor);
      retainEscape(o);
      g.hitstop = Math.max(g.hitstop, .05);
      break;
    }
    if (a.hold < 0) for (const e of g.effects) if (e.type === 'kaoru-rose') e.hit = false;
    else for (const e of g.effects) if (e.type === 'kaoru-rose') e.hit = true;
  }
  const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
  if (o && o.hp > 0 && a.mode === 2 && a.t < R.finale) hold(o, a.anchor);
  if (a.mode === 2 && a.t >= R.snap && a.shots === 0) {
    a.shots = 1;
    g.effect('kaoru-snap', f.x + f.facing * 30, f.y - headOf(f) * .6, '#ffffff', .5, { dir: f.facing });
    g.effect('kaoru-storm', a.anchor, FLOOR, VIOLET, R.finale - R.snap + .6, { hit: !!o });
  }
  // A few petal cuts (a long chain of small hits would let them break out before the last one), then the burst.
  while (o && a.mode === 2 && a.shots >= 1 && a.shots - 1 < R.hits.length && a.t >= R.hits[a.shots - 1]) {
    a.shots++;
    a.hit.clear();
    if (o.hp > 0) hit(g, f, o, { ...s, ...PETAL } as Skill, a, a.anchor);
  }
  if (a.mode === 2 && a.t >= R.finale) {
    a.mode = 3;
    if (o && o.hp > 0) {
      a.hit.clear();
      hit(g, f, o, withFinale(s, true), a, a.anchor - f.facing);
      g.effect('kaoru-bloom', a.anchor, FLOOR, VIOLET, 1.1, { radius: 150 });
      g.flash = Math.max(g.flash, .12);
      g.shake = Math.max(g.shake, 9);
      g.hitstop = Math.max(g.hitstop, .07);
    }
  }
  if (a.mode === 3 && a.t >= R.bow) {
    a.mode = 4;
    // The curtain call. Played to 千圣, the prince slips: 「小薰」 is all it takes.
    const foe = o ?? g.nearestEnemyTo(f, f.x);
    if (isChisato(foe)) g.effect('kaoru-blush', f.x, f.y, '#ff9ec4', s.duration - R.bow + .2, { follow: f.id, ox: f.facing * 8, oy: -headOf(f) * .84 });
  }
}
SCRIPTS[`${ID}-rose`] = { update: step_rose, noMelee: true, noSuperFx: true };
