import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { applyMelee, hit, withFinale, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { FLEE, KITA_AURA, KITA_FLEE, KITA_SOLO } from '../render/clips.ts';

/* 喜多郁代 — 孤独摇滚！/ 结束乐队的吉他手兼主唱，阳角到会发光的现充。光芒压制型. Four scripts on SCRIPTS by fx name
   (combat.ts imports this module once):
     kita-aura   U 阳角光环        the Kita aura: she lights up and the light follows her; anyone standing in it burns a
                                   little and slows down (一里 melts in it)
     kita-flee   I 逃跑的吉他手    she runs off (the lie about the guitar); a second press of I in the window and she is
                                   pulled back in and rushes them (一里 found her and brought her back); no press, a sheepish laugh
     kita-spell  O 变好吃的咒语    the maid-café spell: hands in a heart, a ketchup heart flies, it muddles whoever it hits
     kita-solo   L 撑住舞台的即兴  episode 12: 一里's string snaps and she covers with an improvised solo; five waves, then
                                   her whole aura goes off. 一里 shows up behind her for the last bars (the 彩蛋, her own sheet)
   No passive of her own beyond rush. Everything that lights up is render/kitaFx.ts. */

const ID = 'kita';
const RED = '#E4524E';
const WARM = '#ffd9a8';
const PINK = '#F5A9C0';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 阳角光环 ---- */

/** How far up the light reaches (a jump over her clears it). */
const AURA_TALL = 150;
function step_aura(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.emitted || a.t < s.start) return;
  a.emitted = true;
  // A recast while it is still up (training's no-cooldown) replaces the light instead of stacking a second one.
  dimAura(g, f, .12);
  // The first burn lands at once; then every KITA_AURA.every while it lasts.
  addMod(f, 'aura', KITA_AURA.time, { acc: 0, tag: ID });
  g.effect('kita-aura', f.x, f.y, RED, KITA_AURA.time + .15, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id });
  g.effect('kita-aura-glint', f.x, f.y, RED, KITA_AURA.time + .15, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id });
  g.effect('kita-shine', f.x, f.y - headOf(f) * .55, WARM, .5, { radius: KITA_AURA.reach });
}
SCRIPTS[`${ID}-aura`] = { update: step_aura, noMelee: true };

/** Fades out the light that follows her (on a recast, and when she goes down with it still up). */
function dimAura(g: FightGame, f: Fighter, tail: number): void {
  for (const e of g.effects) {
    if (e.fighter === f.id && (e.type === 'kita-aura' || e.type === 'kita-aura-glint') && e.life > tail) e.life = tail;
  }
}
/** The aura's burns run off her mods, so they keep going after the cast pose is over. */
const auraSkills = new WeakMap<Fighter, Skill>();
function auraSkill(f: Fighter): Skill | undefined {
  let s = auraSkills.get(f);
  if (!s) {
    const base = f.data.skills.find(x => x.fx === `${ID}-aura`);
    if (!base) return undefined;
    auraSkills.set(f, s = { ...base, noSparks: true });
  }
  return s;
}
STEP_WATCHERS.push((g, f, dt) => {
  // The host lands the burns; a guest only draws the light it is sent.
  if (f.data.id !== ID) return;
  const m = f.mods.find(x => x.kind === 'aura' && x.left > 0);
  if (!m) return;
  if (g.netRole === 'guest') return;
  m.acc = (m.acc ?? 0) - dt;
  if (m.acc > 0) return;
  m.acc += KITA_AURA.every;
  const s = auraSkill(f);
  if (!s) return;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - f.x) > KITA_AURA.reach || f.y - o.y > AURA_TALL) continue;
    // A quiet burn never flinches (that would lock them), so the slow is put on by hand, and only past the guard.
    const guarded = o.blocking;
    if (hit(g, f, o, s, { hit: new Set() })) {
      if (!guarded && s.slow) addMod(o, 'slow', s.slow, { v: s.slowMul ?? .7, jump: s.slowJump ?? .85, atk: s.slowAtk ?? .85, mark: s.slowMark });
      g.effect('kita-burn', o.x, o.y - headOf(o) * .55, WARM, .4, { dir: o.x >= f.x ? 1 : -1 });
    }
  }
});

/** Knocked out with the light up: a body that is down no longer steps (game.ts retires it), so the first living
 *  fighter puts her light out. Both sides run this, so a guest's picture goes dark too. */
STEP_WATCHERS.push((g, f) => {
  for (const o of g.fighters) if (o.hp > 0) { if (o !== f) return; break; }
  for (const k of g.fighters) {
    if (k.hp > 0 || k.data.id !== ID) continue;
    const m = k.mods.find(x => x.kind === 'aura' && x.left > 0);
    if (!m) continue;
    m.left = 0;
    dimAura(g, k, .3);
  }
});

/* ---- I 逃跑的吉他手 ---- */

/** Takes a queued press of I off the buffer; the second press is read here, not by FightGame.attack. */
function takePress(f: Fighter): boolean {
  const i = f.queue.findIndex(q => q.index === 3);
  if (i < 0) return false;
  f.queue.splice(i, 1);
  return true;
}
/** The CPU has no second press: it comes back when they gave chase, a beat into the wait. */
const CPU_CHASE = 320;
const CPU_DELAY = .14;
function cpuWants(g: FightGame, f: Fighter, a: Attack): boolean {
  // An online guest's copy of the host's fighter also has no controller: only the side that owns the sim decides.
  if (f.controller !== null || g.netRole === 'guest' || a.t < a.tossAt + CPU_DELAY) return false;
  const o = g.nearestEnemyTo(f, f.x);
  return !!o && o.hp > 0 && Math.abs(o.x - f.x) < CPU_CHASE;
}
function rush(g: FightGame, f: Fighter, a: Attack): void {
  a.mode = FLEE.rush;
  a.tossAt = a.t;
  a.hit.clear();
  g.effect('kita-rejoin', f.x, f.y, PINK, KITA_FLEE.rush + .2, {
    follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f), fighter: f.id, cast: { serial: a.serial, mode: FLEE.rush, tail: .14 },
  });
}
function settle(a: Attack): void {
  a.mode = FLEE.done;
  a.t = Math.max(a.t, a.skill.duration - KITA_FLEE.recover);
}
/** a.anchor is where she turned and ran; a.tossAt the time the current phase began; a.liftAt 1 once I was pressed early. */
function step_flee(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? FLEE.start;
  if (mode === FLEE.start) {
    if (a.t < s.start) return;
    a.mode = FLEE.run;
    a.anchor = f.x;
    a.tossAt = a.t;
    a.liftAt = 0;
    f.y = FLOOR;
    f.vy = 0;
    g.effect('kita-dust', f.x, FLOOR, '#f2d9cf', .45, { dir: -f.facing, radius: headOf(f) });
  }
  if (a.mode === FLEE.run) {
    f.invuln = Math.max(f.invuln, .05);
    if (takePress(f)) a.liftAt = 1;
    const k = clamp((a.t - a.tossAt) / KITA_FLEE.run, 0, 1);
    f.x = clamp(a.anchor - f.facing * KITA_FLEE.back * (1 - (1 - k) ** 2), X_MIN, X_MAX);
    f.vx = 0;
    const bucket = Math.floor(a.t * 30);
    if (k < 1 && bucket % 2 === 0 && bucket !== Math.floor((a.t - dt) * 30)) {
      g.effect('ghost', f.x, f.y, RED, .2, { fighter: f.id, alpha: .32, tint: '#ffb0a0' });
    }
    if (k < 1) return;
    a.mode = FLEE.wait;
    a.tossAt = a.t;
    if (a.liftAt) { rush(g, f, a); return; }
    g.effect('kita-sweat', f.x, f.y - headOf(f), '#bfe6ff', KITA_FLEE.wait, {
      follow: f.id, ox: f.facing * 18, oy: -headOf(f) * .98, dir: f.facing, fighter: f.id, cast: { serial: a.serial, mode: FLEE.wait, tail: .1 },
    });
  }
  if (a.mode === FLEE.wait) {
    if (takePress(f) || cpuWants(g, f, a)) { rush(g, f, a); return; }
    if (a.t - a.tossAt >= KITA_FLEE.wait) settle(a);
    return;
  }
  if (a.mode === FLEE.rush) {
    const run = a.t - a.tossAt;
    // Only the wall ahead stops the rush: she may well have backed into the one behind her.
    const open = f.facing > 0 ? f.x < X_MAX : f.x > X_MIN;
    if (run < KITA_FLEE.rush && open) {
      f.x = clamp(f.x + f.facing * (s.speed ?? 980) * dt, X_MIN, X_MAX);
      f.vx = 0;
      applyMelee(g, f, a);
      if (!a.hit.size) return;
      g.effect('kita-hug', f.x + f.facing * 54, f.y - headOf(f) * .52, RED, .5, { dir: f.facing });
      g.shake = Math.max(g.shake, 5);
    }
    settle(a);
  }
}
SCRIPTS[`${ID}-flee`] = { update: step_flee, customDash: true, noMelee: true };

/* ---- O 变好吃的咒语 ---- */

SCRIPTS[`${ID}-spell`] = {
  trail: 0,
  update(g: FightGame, f: Fighter, a: Attack): void {
    if (a.mode) return;
    a.mode = 1;
    g.effect('kita-spell-cast', f.x + f.facing * 30, f.y - headOf(f) * .56, RED, a.skill.start + .25, {
      follow: f.id, ox: f.facing * 30, oy: -headOf(f) * .56, dir: f.facing, t0: a.skill.start,
    });
  },
  hit(g: FightGame, _attacker: Fighter, defender: Fighter): boolean {
    g.effect('kita-heart-pop', defender.x, defender.y - headOf(defender) * .58, RED, .55);
    return false;
  },
};

/* ---- L 撑住舞台的即兴 ---- */

const WAVE_TALL = 220;
function waveHit(g: FightGame, f: Fighter, a: Attack, reach: number, skill: Skill): boolean {
  a.hit.clear();
  let any = false;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -30 || ahead > reach || FLOOR - o.y > WAVE_TALL) continue;
    if (hit(g, f, o, skill, a)) any = true;
  }
  return any;
}
function step_solo(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = KITA_SOLO;
  f.vx = 0;
  if (!a.emitted) {
    a.emitted = true;
    g.effect('kita-stage', f.x, 0, RED, s.duration + .2, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .3 } });
    g.effect('kita-stage-front', f.x, 0, RED, s.duration + .2, { fighter: f.id, radius: headOf(f), cast: { serial: a.serial, tail: .3 } });
  }
  while (a.shots < S.waves.length && a.t >= S.waves[a.shots]) {
    const i = a.shots++;
    const land = waveHit(g, f, a, S.reach, withGuard(s, i));
    g.effect('kita-wave', f.x + f.facing * 40, f.y - headOf(f) * .5, RED, .55, { n: i, dir: f.facing, radius: S.reach, hit: land });
    g.shake = Math.max(g.shake, 2);
  }
  if (!a.liftAt && a.t >= S.duo) {
    a.liftAt = 1;
    g.effect('kita-duo', f.x - f.facing * 74, f.y, PINK, s.duration - S.duo + .25, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .25 } });
  }
  if (a.mode == null && a.t >= S.burst) {
    a.mode = 1;
    waveHit(g, f, a, S.burstReach, withGuard(withFinale(s, true), S.waves.length));
    g.effect('kita-finale', f.x, f.y - headOf(f) * .55, RED, 1, { dir: f.facing, radius: S.burstReach });
    g.flash = Math.max(g.flash, .16);
    g.shake = Math.max(g.shake, 10);
    g.hitstop = Math.max(g.hitstop, .07);
  }
}
SCRIPTS[`${ID}-solo`] = { update: step_solo, noMelee: true, noSuperFx: true };
