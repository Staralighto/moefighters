import type { Skill, StatusApply } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withFinale, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { layStatus } from './status.ts';
import { SCRIPTS } from './scripts.ts';
import { MOMOKA_BOX, MOMOKA_CANS, MOMOKA_DRUNK, MOMOKA_PAST } from '../render/clips.ts';

/* 河原木桃香 — Girls Band Cry / TOGENASHI TOGEARI 的吉他手，「脱退之人」。进退无常型: U backs off and leaves something
   behind, I litters the floor, O sways a hit off on a fixed beat, L shuts them in a box of light.
   Four scripts on SCRIPTS by fx name (combat.ts imports this once):
     momoka-past   U 又想逃了？   「脱退のひと」: she runs from her past, and the girl she was (the ponytail days of 钻石星尘)
                                 stays standing where she left; touch it and it breaks into diamond dust
     momoka-snake  I 快拿去扔掉！ 智's snake at her feet: she shrieks and throws beer cans (「捨ててこい」); foam on the floor
     momoka-drunk  O 微醺醉拳     one gulp and she is merry: a hit every beat slides off her; then she remembers nothing
     momoka-box    L 空之箱       the street live of episode 1 in its blue light: the empty box, her song inside it
   The cans are beer.png; the guitar is drawn into her L cells; everything else is render/momokaFx.ts. */

const ID = 'momoka';
const BLUE = '#85C9DC';
const ICE = '#cfeeff';
const FOAM = '#eaf8ff';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 又想逃了？ ---- */

/** The stardust: the move itself, carrying the chill. Cached per skill so nothing allocates per shot. */
const dustOf = new WeakMap<Skill, Skill>();
function dustSkill(s: Skill): Skill {
  let d = dustOf.get(s);
  if (!d) dustOf.set(s, d = { ...s, type: 'projectile', react: { kind: 'stand', stun: .4 } });
  return d;
}
/** The two ghosts that make up the past self (art at low alpha, then an ice wash over it) carry n = MOMOKA_PAST.tag. */
function pastGhosts(g: FightGame, owner: number, x: number, fn: (e: import('./game.ts').Effect) => void): void {
  for (const e of g.effects) if (e.type === 'ghost' && e.fighter === owner && e.n === MOMOKA_PAST.tag && Math.abs(e.x - x) < 1) fn(e);
}
function step_past(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  if (a.mode == null) {
    a.mode = 0;
    a.anchor = f.x;
  }
  if (a.mode === 0 && a.t >= s.start) {
    a.mode = 1;
    const from = f.x;
    a.anchor = from;
    // The girl she was, standing where she turned away: frozen in her standing cell, facing the way she faced.
    const pose = { sheet: 'common', col: 0, row: 0, facing: f.facing };
    const life = MOMOKA_PAST.fuse + .1;
    g.effect('ghost', from, f.y, BLUE, life, { fighter: f.id, alpha: .5, n: MOMOKA_PAST.tag, ...pose });
    g.effect('ghost', from, f.y, BLUE, life, { fighter: f.id, alpha: .42, tint: ICE, n: MOMOKA_PAST.tag, ...pose });
    g.effect('momoka-past', from, f.y, BLUE, life, { radius: headOf(f), dir: f.facing, fighter: f.id });
    g.projectiles.push({
      owner: f.id, x: from, y: f.y, vx: 0, vy: 0, life, age: 0,
      skill: dustSkill(s), color: BLUE, radius: 0, size: headOf(f),
      fx: 'momoka-past', attack: a, hit: new Set(), trail: [], solid: false, face: f.facing,
    });
    g.effect('momoka-flee', from, f.y, BLUE, .5, { radius: headOf(f), dir: -f.facing });
  }
  if (a.mode === 1) {
    const k = clamp((a.t - s.start) / MOMOKA_PAST.run, 0, 1);
    const eased = 1 - (1 - k) ** 2;
    f.x = clamp(a.anchor - f.facing * MOMOKA_PAST.back * eased, X_MIN, X_MAX);
    f.vx = 0;
    // A couple of pale copies along the way out, enough to read the run.
    const bucket = Math.floor(a.t * 24);
    if (k < 1 && bucket % 2 === 0 && bucket !== Math.floor((a.t - dt) * 24)) {
      g.effect('ghost', f.x, f.y, BLUE, .22, { fighter: f.id, alpha: .35, tint: ICE });
    }
    if (k >= 1) a.mode = 2;
  }
}
/** The past stands still until someone comes near it, or until the fuse; then it breaks into stardust. */
function shot_past(g: FightGame, p: Projectile): boolean {
  if (p.returned) return true;
  const owner = g.fighterById(p.owner);
  let near = false;
  // A beat before it can break, so the girl she left behind is seen standing there first.
  if (owner && p.age >= MOMOKA_PAST.arm) {
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo) continue;
      if (Math.abs(o.x - p.x) < MOMOKA_PAST.near && Math.abs(o.y - p.y) < 140) { near = true; break; }
    }
  }
  if (!near && p.age < MOMOKA_PAST.fuse && owner && owner.hp > 0) {
    // Hold the two ghosts at full strength while she waits.
    pastGhosts(g, p.owner, p.x, e => { e.life = e.max; });
    return true;
  }
  p.returned = true;
  p.life = 0;
  pastGhosts(g, p.owner, p.x, e => { e.life = Math.min(e.life, .14); });
  for (const e of g.effects) if (e.type === 'momoka-past' && e.fighter === p.owner && Math.abs(e.x - p.x) < 1) e.life = 0;
  if (owner && owner.hp > 0) {
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo) continue;
      if (Math.abs(o.x - p.x) < MOMOKA_PAST.blast && Math.abs(o.y - p.y) < 160) hit(g, owner, o, p.skill, p, p.x);
    }
  }
  g.effect('momoka-dust', p.x, p.y, ICE, .9, { radius: MOMOKA_PAST.blast, dir: p.face ?? 1, n: p.size });
  g.shake = Math.max(g.shake, 5);
  return true;
}
SCRIPTS[`${ID}-past`] = { update: step_past, shot: shot_past, customDash: true, noMelee: true, trail: 0 };

/* ---- I 快拿去扔掉！ ---- */

const FOAM_STATUS: StatusApply = { kind: 'chill', time: 1.2, mark: 'beer-foam', move: .6, jump: .8, atk: .85 };
const foamOf = new WeakMap<Skill, Skill>();
function foamSkill(s: Skill): Skill {
  let d = foamOf.get(s);
  if (!d) foamOf.set(s, d = { ...s, damage: 0, status: [FOAM_STATUS] });
  return d;
}
/** A can's arc: vx/vy so it lands `dist` ahead after `flight` seconds from the hand (y0) to the floor. */
const CAN_G = 2600;
function volley_cans(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.shots === 0 && !a.emitted) {
    a.emitted = true;
    g.effect('momoka-snake', f.x + f.facing * 34, FLOOR, '#5fae63', s.duration + .4, { dir: f.facing, radius: headOf(f) });
    g.effect('momoka-shriek', f.x, f.y - headOf(f) * .8, '#ffffff', .5, { follow: f.id, ox: 0, oy: -headOf(f) * .8, dir: f.facing });
  }
  while (a.shots < MOMOKA_CANS.throws.length && a.t >= MOMOKA_CANS.throws[a.shots]) {
    const i = a.shots;
    const dist = MOMOKA_CANS.lands[i] + (g.random() * 2 - 1) * MOMOKA_CANS.jitter;
    const x0 = f.x + f.facing * 30, y0 = f.y - headOf(f) * .62;
    const T = MOMOKA_CANS.flight * (.9 + g.random() * .2);
    const vy = ((FLOOR - y0) - .5 * CAN_G * T * T) / T;
    g.projectiles.push({
      owner: f.id, x: x0, y: y0, vx: f.facing * (dist - 30) / T, vy, life: T + .5, age: 0,
      skill: withGuard(s, i), color: FOAM, radius: 18, size: 34,
      fx: 'momoka-snake', attack: a, hit: new Set(), trail: [], solid: false, face: f.facing,
      wave: g.random() * 6.28,
    });
    a.shots++;
  }
}
/** Cans fly their own arc and hit like any shot; on the floor they burst into a puddle. Puddles (settled) chill anyone
 *  grounded who stands in them, once each. */
function shot_can(g: FightGame, p: Projectile, dt: number): boolean {
  const owner = g.fighterById(p.owner);
  if (p.settled) {
    if (owner) {
      for (const o of g.fighters) {
        if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo) continue;
        if (p.hit.has(o.id) || Math.abs(o.x - p.x) > MOMOKA_CANS.puddle || o.y < FLOOR - 12) continue;
        p.hit.add(o.id);
        layStatus(g, owner, o, FOAM_STATUS, 'momoka-foam');
      }
    }
    return true;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += CAN_G * dt;
  if (owner && owner.hp > 0) {
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo) continue;
      if (p.hit.has(o.id) || Math.abs(o.x - p.x) > 30 || p.y < o.y - headOf(o) || p.y > o.y + 10) continue;
      if (hit(g, owner, o, p.skill, p, p.x - Math.sign(p.vx) * 20)) {
        g.effect('momoka-can-hit', p.x, p.y, FOAM, .4, { dir: Math.sign(p.vx) || 1 });
      }
    }
  }
  if (p.y >= FLOOR - 4 || p.x <= X_MIN - 40 || p.x >= X_MAX + 40) {
    p.y = FLOOR;
    p.settled = true;
    p.vx = 0; p.vy = 0;
    p.age = 0;
    p.life = MOMOKA_CANS.foam;
    p.skill = foamSkill(p.skill);
    p.hit.clear();
    g.effect('momoka-foam', p.x, FLOOR, FOAM, MOMOKA_CANS.foam, { radius: MOMOKA_CANS.puddle, dir: p.face ?? 1 });
  }
  return true;
}
SCRIPTS[`${ID}-snake`] = { volley: volley_cans, shot: shot_can, skipVolley: false, trail: 0 };

/* ---- O 微醺醉拳 ---- */

/** Combat's hit() asks this before anything lands: a ready sway leans the whole hit off her. */
export function swayOff(g: FightGame, defender: Fighter, attacker: Fighter): boolean {
  const m = defender.mods.find(x => x.kind === 'sway' && x.left > 0 && (x.v ?? 0) > 0);
  if (!m) return false;
  m.v = 0;
  const back = Math.sign(defender.x - attacker.x) || -defender.facing;
  // Her lean-back cell (O, last row), frozen a beat behind her: the body she slid out of.
  const col = defender.data.skills.findIndex(s => s.fx === `${ID}-drunk`) - 2;
  if (col >= 0) g.effect('ghost', defender.x + back * 10, defender.y, BLUE, .32, { fighter: defender.id, alpha: .55, sheet: 'special', col, row: 2, facing: defender.facing });
  g.effect('momoka-sway', defender.x, defender.y, BLUE, .5, { radius: headOf(defender), dir: back });
  g.hitstop = Math.max(g.hitstop, .03);
  return true;
}
/** 记不得了: what was hanging on her is gone, and so is the next half second. */
function forget(g: FightGame, f: Fighter): void {
  for (const m of f.mods) {
    if (m.left <= 0) continue;
    if (m.kind === 'burn' || m.kind === 'confuse' || m.kind === 'silence' || m.kind === 'slow') m.left = 1e-6;
  }
  f.root = 0;
  if (f.hp > 0 && !f.attack && f.knocked <= 0) f.stun = Math.max(f.stun, MOMOKA_DRUNK.hangover * f.stunMul);
  g.effect('momoka-hangover', f.x, f.y - headOf(f) - 8, BLUE, MOMOKA_DRUNK.hangover + .3, { follow: f.id, ox: 0, oy: -headOf(f) - 8 });
}
function step_drunk(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted && a.t >= s.start) {
    a.emitted = true;
    g.effect('momoka-gulp', f.x + f.facing * 14, f.y - headOf(f) * .82, FOAM, .5, { dir: f.facing });
    addMod(f, 'dmgDealt', MOMOKA_DRUNK.time, { tag: 'drunk', v: MOMOKA_DRUNK.bonus });
    addMod(f, 'sway', MOMOKA_DRUNK.time, {
      // pulseEvery is a rate (pulses per second): one fresh sway every beat.
      v: 1, pulseEvery: 1 / MOMOKA_DRUNK.beat,
      pulse: (game, who) => {
        const m = who.mods.find(x => x.kind === 'sway' && x.left > 0);
        if (!m || (m.v ?? 0) > 0) return;
        m.v = 1;
        game.effect('momoka-beat', who.x, who.y - headOf(who) * .5, BLUE, .4, { follow: who.id, ox: 0, oy: -headOf(who) * .5 });
      },
      onExpire: forget,
    });
    for (const e of g.effects) if (e.type === 'momoka-drunk' && e.fighter === f.id) e.life = 0;
    g.effect('momoka-drunk', f.x, f.y, BLUE, MOMOKA_DRUNK.time, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), fighter: f.id });
  }
}
SCRIPTS[`${ID}-drunk`] = { update: step_drunk, noMelee: true };

/* ---- L 空之箱 ---- */

const BOX_TALL = 60;
function step_box(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const S = MOMOKA_BOX;
  if (!a.emitted) {
    a.emitted = true;
    a.liftAt = 0;
    a.hold = -1;
    g.effect('momoka-night', f.x, f.y, BLUE, s.duration + .25, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .35 } });
    g.effect('momoka-column', f.x - f.facing * 46, FLOOR, ICE, s.duration + .2, { fighter: f.id, dir: f.facing, radius: headOf(f), cast: { serial: a.serial, tail: .3 } });
  }
  // The box closes round the nearest foe on the ground ahead of her. A foe in the air at that moment is not in it.
  if (a.mode == null && a.t >= S.box) {
    a.mode = 1;
    let best: Fighter | undefined;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -20 || ahead > S.reach) continue;
      if (!best || Math.abs(o.x - f.x) < Math.abs(best.x - f.x)) best = o;
    }
    const x = best ? best.x : clamp(f.x + f.facing * 260, X_MIN, X_MAX);
    a.anchor = x;
    // The box lasts until it breaks.
    g.effect('momoka-box', x, FLOOR, BLUE, S.burst - S.box + .03, { dir: f.facing, radius: S.size, fighter: f.id, cast: { serial: a.serial, tail: 0 } });
    if (best && best.y >= FLOOR - BOX_TALL && hit(g, f, best, boxSeal(s), a)) a.hold = best.id;
    g.shake = Math.max(g.shake, 4);
  }
  // Each song: one ring of sound reflecting inside the box.
  while (a.mode === 1 && (a.liftAt | 0) < S.songs.length && a.t >= S.songs[a.liftAt | 0]) {
    const i = a.liftAt | 0;
    a.liftAt = i + 1;
    g.effect('momoka-song', a.anchor, FLOOR - S.size * .5, ICE, .6, { radius: S.size, n: i, dir: f.facing });
    g.effect('momoka-voice', f.x + f.facing * 28, f.y - headOf(f) * .72, ICE, .5, { dir: f.facing, n: i });
    const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
    if (o && Math.abs(o.x - a.anchor) < S.size * .7) {
      a.hit.clear();
      hit(g, f, o, withGuard(s, i + 1), a);
    }
    g.shake = Math.max(g.shake, 2 + i);
  }
  if (a.mode === 1 && a.t >= S.burst) {
    a.mode = 2;
    g.effect('momoka-burst', a.anchor, FLOOR - S.size * .5, ICE, 1.1, { radius: S.size, dir: f.facing });
    // Soft on purpose: no screen flash, a modest shake.
    g.shake = Math.max(g.shake, 5);
    const o = a.hold >= 0 ? g.fighterById(a.hold) : undefined;
    if (o && Math.abs(o.x - a.anchor) < S.size * .8) {
      // The box is gone: nothing holds them now, so the burst can throw them.
      o.root = 0;
      a.hit.clear();
      if (hit(g, f, o, withGuard(withFinale(s, true), S.songs.length + 1), a)) g.hitstop = Math.max(g.hitstop, .08);
    }
  }
}
const sealOf = new WeakMap<Skill, Skill>();
function boxSeal(s: Skill): Skill {
  let b = sealOf.get(s);
  if (!b) sealOf.set(s, b = { ...withGuard(s, 0), damage: 6, knock: 0, root: 2, rootPin: true, react: { kind: 'stand', stun: .3 } });
  return b;
}
// mode 1 is the closed box: it places whoever it caught, so a 跟班 does not walk them out.
SCRIPTS[`${ID}-box`] = { update: step_box, noMelee: true, noSuperFx: true, placesHold: [1] };
