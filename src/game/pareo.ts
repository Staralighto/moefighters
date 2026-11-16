import type { Skill } from '../data/types.ts';
import { gainEnergy, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  PAREO_CHASE, PAREO_CHASE_RUN, PAREO_CHASE_TAIL, PAREO_COLOR, PAREO_GRAY, PAREO_KICK, PAREO_KICK_AIR,
  PAREO_WIGS, PAREO_WIG_FAIL, PAREO_WIG_TAG, PAREO_WIG_TIME,
} from '../render/clips.ts';

/* PAREO（鳰原令王那）— RAISE A SUILEN 的键盘手，CHU² 的忠犬。全部空手，不拿键盘。
   J / K 欢迎光临 / 厚底重踏: the maid's palm push and a stamp of the platform shoes.
   U 忠犬追击: CHU² calls and she is off — she chases where the foe is now (S3 追六花 without losing her breath).
   I 百变假发: a new wig in one of Pastel*Palettes' colours, each with that member's buff; hit mid-spin and she is
     left in 日菜蓝 + 白 with nothing (S3E6: the 冰川 sisters walked in before she could change).
   O 献身飞踢: 「要踢就踢PAREO吧！」 — arms open, she takes the hit gladly (half damage, twice that as 气), then
     Reo's flying kick (the live kick that broke the keys).
   L 灰色重染: the world goes grey and so does she (black-haired 令王那); CHU²'s silhouette holds out a hand, the colour
     floods back from it, and the dog runs. */

const PINK = PAREO_COLOR;

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function nearestFoe(g: FightGame, f: Fighter): Fighter | undefined {
  let best: Fighter | undefined;
  for (const o of g.opponents(f)) if (!best || Math.abs(o.x - f.x) < Math.abs(best.x - f.x)) best = o;
  return best;
}

/* ---- J / K ---- */
function flash_jk(g: FightGame, f: Fighter, a: Attack): void {
  g.effect('pareo-jk', f.x + f.facing * a.skill.range * .62, f.y - (a.index === 1 ? 40 : 96), PINK, .32, {
    dir: f.facing, heavy: a.index === 1, hit: a.hit.size > 0, radius: a.skill.range * .4,
  });
  if (a.index === 1) g.effect('pareo-stomp', f.x + f.facing * 38, FLOOR, PINK, .45, { dir: f.facing });
}
SCRIPTS['pareo-jk'] = { flash: flash_jk };

/* ---- U 忠犬追击 ---- */

/** Close enough to dive; a body this far off the floor is run under. */
const CHASE_NEAR = 62;
const CHASE_AIR = 46;
/** 对 LOCK: S3E2 — she has chased this one before. */
const CHASE_LOCK = 1.25;
function step_chase(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? PAREO_CHASE.run;
  if (a.t < s.start || mode !== PAREO_CHASE.run) return;
  if (!a.emitted) {
    a.emitted = true;
    // The ears are bound to the run (cast.mode): the mode has to be set, an unset one never matches and drops them at once.
    a.mode = PAREO_CHASE.run;
    g.effect('pareo-ears', f.x, f.y, PINK, PAREO_CHASE_RUN + .15, {
      follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id, cast: { serial: a.serial, mode: PAREO_CHASE.run, tail: .12 },
    });
  }
  const o = nearestFoe(g, f);
  if (o) f.facing = (Math.sign(o.x - f.x) || f.facing) as 1 | -1;
  const speed = (s.speed ?? 330) * (o?.data.id === 'lock' ? CHASE_LOCK : 1);
  f.x = clamp(f.x + f.facing * speed * dt, X_MIN, X_MAX);
  const bucket = Math.floor(a.t * 12);
  if (bucket !== Math.floor((a.t - dt) * 12)) g.effect('pareo-dust', f.x - f.facing * 14, FLOOR, PINK, .35, { dir: f.facing, radius: 10 });
  if (o && Math.abs(o.x - f.x) < CHASE_NEAR && o.y >= FLOOR - CHASE_AIR && !isInvulnerable(o)) {
    a.mode = PAREO_CHASE.tackle;
    a.t = Math.max(a.t, s.duration - PAREO_CHASE_TAIL);
    a.hit.clear();
    if (hit(g, f, o, s, a)) g.effect('pareo-tackle', o.x, o.y - 70, PINK, .5, { dir: f.facing, radius: 60 });
    return;
  }
  if (a.t >= s.start + PAREO_CHASE_RUN) {
    a.mode = PAREO_CHASE.done;
    a.t = Math.max(a.t, s.duration - PAREO_CHASE_TAIL);
  }
}
SCRIPTS['pareo-chase'] = { update: step_chase, customDash: true, noMelee: true, flip: true };

/* ---- I 百变假发 ---- */

const WIG_TAG = PAREO_WIG_TAG;
/** The members of Pastel*Palettes in this game, by wig: a mirror match hands her that colour (为你染发). */
const WIG_OF_ID: Record<string, number> = { aya: 0, hina: 1, chisato: 2, eve: 4 };
const WIG_REGEN = 6;
const WIG_SPEED = 1.25;
const WIG_GUARD = .75;
const WIG_CD = 1.7;
const WIG_DMG = .2;
function wear(g: FightGame, f: Fighter, wig: number): void {
  for (const m of f.mods) if (m.tag === WIG_TAG) m.left = 0;
  addMod(f, 'look', PAREO_WIG_TIME, { tag: WIG_TAG, v: wig, mark: 'pareo-wig' });
  if (wig === 0) addMod(f, 'regen', PAREO_WIG_TIME, { tag: WIG_TAG, v: WIG_REGEN });
  else if (wig === 1) addMod(f, 'speed', PAREO_WIG_TIME, { tag: WIG_TAG, v: WIG_SPEED });
  else if (wig === 2) addMod(f, 'dmgTaken', PAREO_WIG_TIME, { tag: WIG_TAG, v: WIG_GUARD });
  else if (wig === 4) addMod(f, 'dmgDealt', PAREO_WIG_TIME, { tag: WIG_TAG, v: WIG_DMG });
  // 麻弥绿 runs her U / O clocks faster in the step watcher below.
  g.effect('pareo-wig-pop', f.x, f.y, PAREO_WIGS[wig].hair, .7, { follow: f.id, ox: 0, oy: 0, n: wig, radius: headOf(f) });
}
/** The spin of the cast she is in; a hit before it finishes leaves her in 日菜蓝 + 白. */
const spinning = new WeakMap<Fighter, number>();
function step_wig(g: FightGame, f: Fighter, a: Attack): void {
  if (!a.emitted && a.t < a.skill.start) { spinning.set(f, a.serial); return; }
  if (a.emitted) return;
  a.emitted = true;
  spinning.delete(f);
  const o = nearestFoe(g, f);
  const wig = o && o.data.id in WIG_OF_ID ? WIG_OF_ID[o.data.id] : Math.floor(g.random() * 5);
  wear(g, f, wig);
}
SCRIPTS['pareo-wig'] = { update: step_wig, noMelee: true };
STEP_WATCHERS.push((g, f, dt) => {
  const serial = spinning.get(f);
  if (serial != null && f.attack?.serial !== serial) {
    spinning.delete(f);
    if (f.hp > 0) {
      // 来不及换: the half-done wig, no buff.
      for (const m of f.mods) if (m.tag === WIG_TAG) m.left = 0;
      addMod(f, 'look', PAREO_WIG_TIME, { tag: WIG_TAG, v: PAREO_WIG_FAIL, mark: 'pareo-wig-fail' });
      g.effect('pareo-wig-pop', f.x, f.y, PAREO_WIGS[PAREO_WIG_FAIL].hair, .7, { follow: f.id, ox: 0, oy: 0, n: PAREO_WIG_FAIL, radius: headOf(f) });
    }
  }
  if (!f.mods.some(m => m.kind === 'look' && m.tag === WIG_TAG && m.v === 3 && m.left > 0)) return;
  for (const i of [2, 4]) if (f.cooldowns[i] > 0) f.cooldowns[i] = Math.max(0, f.cooldowns[i] - dt * (WIG_CD - 1));
});

/* ---- O 献身飞踢 ---- */

const KICK_HALF = .5;
const KICK_GAIN = 2;
const KICK_LIFT = 70;
const kicks = new WeakMap<Skill, Skill>();
function kickOf(s: Skill): Skill {
  let k = kicks.get(s);
  if (!k) {
    k = { ...s, damage: s.finale?.damage ?? 24, knock: s.finale?.knock ?? 380, react: s.finale?.react ?? s.react, noBlock: true, finale: undefined };
    kicks.set(s, k);
  }
  return k;
}
function counter_kick(g: FightGame, f: Fighter, attacker: Fighter, a: Attack): void {
  const s = a.skill;
  const swing = attacker.attack?.skill;
  const taken = Math.round((swing?.damage ?? 30) * attacker.data.power * KICK_HALF);
  f.hp = Math.max(1, f.hp - taken);
  gainEnergy(f, taken * KICK_GAIN);
  g.text('-' + taken, f.x, f.y - 175, '#ffd0e2', .6, 18);
  a.mode = PAREO_KICK.kick;
  a.hold = attacker.id;
  a.anchor = f.x;
  a.t = s.duration - (PAREO_KICK_AIR + .35);
  a.tossAt = a.t;
  f.facing = (Math.sign(attacker.x - f.x) || f.facing) as 1 | -1;
  // CHU² kicking her for real is the dream (S2E12): twice the hearts.
  g.effect('pareo-hearts', f.x, f.y - headOf(f) * .55, PINK, .7, { n: attacker.data.id === 'chuchu' ? 2 : 1, dir: f.facing, radius: 70 });
  g.hitstop = Math.max(g.hitstop, .06);
}
function step_kick(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? PAREO_KICK.wait;
  if (mode === PAREO_KICK.wait) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('pareo-open', f.x, f.y, PINK, s.start, { follow: f.id, ox: 0, oy: 0, radius: headOf(f) });
    }
    if (a.t >= s.start) {
      a.mode = PAREO_KICK.sulk;
      g.effect('pareo-sulk', f.x, f.y - headOf(f) * .9, PINK, .6, { follow: f.id, ox: 0, oy: -headOf(f) * .9 });
    }
    return;
  }
  if (mode !== PAREO_KICK.kick) return;
  const k = clamp((a.t - a.tossAt) / PAREO_KICK_AIR, 0, 1);
  const o = g.fighterById(a.hold);
  const target = o ? o.x - f.facing * 46 : a.anchor + f.facing * 120;
  f.x = clamp(a.anchor + (target - a.anchor) * Math.min(1, k * 1.6), X_MIN, X_MAX);
  f.y = k < 1 ? FLOOR - Math.sin(Math.PI * k) * KICK_LIFT : FLOOR;
  f.vx = 0; f.vy = 0;
  if (a.shots === 0 && k >= .55) {
    a.shots = 1;
    if (o && o.hp > 0 && Math.abs(o.x - f.x) < 120) {
      a.hit.clear();
      if (hit(g, f, o, kickOf(s), a)) {
        g.effect('pareo-keys', o.x, o.y - 80, PINK, .6, { dir: f.facing, radius: 90 });
        g.shake = Math.max(g.shake, 6);
      }
    }
  }
}
SCRIPTS['pareo-kick'] = { update: step_kick, counter: counter_kick, noMelee: true };

/* ---- L 灰色重染 ---- */

const RUSH_BACK = 64;
const WAVE_AIR = 60;
const grayParts = new WeakMap<Skill, Skill[]>();
/** 0: the opening wave (the lock), 1..4: the rush, 5: the flying kick. */
function grayOf(s: Skill): Skill[] {
  let v = grayParts.get(s);
  if (!v) {
    const n = PAREO_GRAY.hits.length;
    const wave: Skill = { ...s, damage: 8, knock: 0, noBlock: true, root: PAREO_GRAY.kick + .3, rootPin: true, rootBreak: 0, rootLevel: 'freeze', react: { kind: 'stand', stun: .3 }, finale: undefined };
    const jab = (i: number): Skill => withGuard({ ...s, root: undefined, finale: undefined }, i);
    v = [wave, ...PAREO_GRAY.hits.map((_, i) => jab(i)), withGuard({ ...s, ...s.finale, root: undefined, finale: undefined }, n)];
    grayParts.set(s, v);
  }
  return v;
}
function step_gray(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, G = PAREO_GRAY;
  const h = headOf(f);
  const parts = grayOf(s);
  if (!a.emitted) {
    a.emitted = true;
    // CHU² will stand off her back shoulder, at the edge of the stage behind her; the colour comes back from her hand.
    a.anchor = clamp(f.x - f.facing * 210, X_MIN + 40, X_MAX - 40);
    g.effect('pareo-gray', a.anchor, FLOOR, PINK, s.duration + .1, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .25 } });
  }
  // The wave: whoever it reaches on the floor is held for the whole super.
  if (a.shots === 0 && a.t >= G.wave) {
    a.shots = 1;
    g.effect('pareo-wave', f.x + f.facing * 30, f.y - h * .5, PINK, .6, { dir: f.facing, radius: s.range });
    a.hit.clear();
    for (const o of g.opponents(f)) {
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -20 || ahead > s.range || o.y < FLOOR - WAVE_AIR) continue;
      if (hit(g, f, o, parts[0], a)) a.hold = o.id;
    }
  }
  if (a.liftAt === 0 && a.t >= G.chu) {
    a.liftAt = a.t;
    g.effect('pareo-chu', a.anchor, FLOOR, '#00BBFF', s.duration - G.chu + .2, {
      dir: f.facing, fighter: f.id, t0: G.chu, tx: f.x - a.anchor, ty: -h * .58,
    });
  }
  // The rush and the kick: only on a body the wave caught.
  const o = g.fighterById(a.hold);
  const caught = !!o && o.hp > 0;
  const n = G.hits.length;
  if (a.shots >= 1 && a.shots <= n + 1) {
    const i = a.shots - 1;
    const at = i < n ? G.hits[i] : G.kick;
    if (a.t >= at) {
      a.shots++;
      if (caught && o) {
        f.facing = (Math.sign(o.x - f.x) || f.facing) as 1 | -1;
        if (i === 0) g.effect('ghost', f.x, f.y, PINK, .35, { fighter: f.id, alpha: .45 });
        f.x = clamp(o.x - f.facing * (i < n ? RUSH_BACK : RUSH_BACK + 8), X_MIN, X_MAX);
        a.hit.clear();
        if (hit(g, f, o, parts[i + 1], a)) {
          if (i < n) g.effect('pareo-heart-hit', o.x - f.facing * 10, o.y - 90 + (i % 2) * 22, PINK, .4, { dir: f.facing, n: i });
          else {
            g.effect('pareo-keys', o.x, o.y - 80, PINK, .8, { dir: f.facing, radius: 130, heavy: true });
            g.flash = Math.max(g.flash, .06);
            g.shake = Math.max(g.shake, 10);
            g.hitstop = Math.max(g.hitstop, .08);
          }
        }
      }
    }
  }
  // The flying kick lifts her a little off the floor.
  if (caught && a.t >= G.kick && a.t < G.bow) f.y = FLOOR - Math.sin(Math.PI * clamp((a.t - G.kick) / (G.bow - G.kick), 0, 1)) * 40;
  else if (f.y < FLOOR && a.t >= G.bow) f.y = FLOOR;
}
SCRIPTS['pareo-gray'] = { update: step_gray, noMelee: true, commit: true, noSuperFx: true };

