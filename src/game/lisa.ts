import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { applyMelee, hit } from './combat.ts';
import { addMod, clearMod, has, type Mod } from './mods.ts';
import { CAST_WATCHERS, SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  LISA_CAT_BODY, LISA_CLING, LISA_GAL_TRAVEL, LISA_COOKIE, LISA_FLICK_TIME, LISA_FUSE, LISA_READ, LISA_READ_TIME, LISA_TEA,
} from '../render/clips.ts';

/* 今井莉莎 — Roselia 的贝斯。外表辣妹、内里人妻，R 团的精神支柱；理解力满级，友希那不开口她也全懂（萌娘百科）。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     lisa-gal     U 元气辣妹☆            the stock dash, with a trail of little stars behind her
     lisa-cat     I 银猫扑脸              a silver cat runs along the floor and clings to the face it reaches
     lisa-read    O 不用说我也懂          a read on her; the first U / I / O a foe starts is cut off with a flick
     lisa-cookie  L 特制曲奇·隐藏风味     a cookie lobbed into their mouth; the mustard in it goes off a beat later
   Shared numbers and the cell picks live in clips.ts, every picture in render/lisaFx.ts, the two status looks
   ('lisa-cat' 混乱, 'lisa-wasabi' 烧焦) in render/statusMarks.ts. Everything that outlives her own move — the
   clinging cat, the read, the mustard — is a mod on a body ('cling', 'read', 'mustard'), so a round reset or a KO
   takes it with no cleanup. The mods carry no closures: `acc` is the seconds left on their own clock, `v` a count,
   `from` who laid it, and step_lisa (a STEP_WATCHER) runs them, so a lockstep dump resumes them exactly. Their
   `left` is only a ceiling that keeps them alive; step_lisa ends them. */

const SILVER = '#c9c6d6';
const STAR = '#ffd56a';
const WASABI = '#8fd14f';

/** A skill with fields swapped, built once per base skill. */
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
/** Head height on this body (sprite heights differ; the geometry dummies are 181). */
function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 元气辣妹☆ ---- */

/** 元气辣妹☆ (萌娘百科: 辣妹、元气; 说话爱带「☆」): the stock dash's reach, but all of it in LISA_GAL_TRAVEL — a burst
 *  that brakes hard — so the sprite never glides; she skids to a stop into a V sign. A ribbon of her colours runs
 *  from where she set off to where she is, stars spill off her, and the hit gets a hair whip and a pop of stars.
 *  a.anchor is where she set off; a.mode 1 once she has stopped; a.tossAt the hit (0 until then). */
function step_gal(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  if (a.t < s.start) return;
  const reach = (s.speed ?? 580) * (s.duration - .08 - s.start);
  if (a.mode !== 1) {
    // One ribbon per cast, born on the first sliding tick; its far end is moved in place after that (no rescan of
    // every effect to decide whether it exists).
    const ribbon = a.t - dt < s.start
      ? g.effect('lisa-gal-ribbon', a.anchor, f.y, f.data.color, LISA_GAL_TRAVEL + .45, { fighter: f.id, dir: f.facing, tx: 0, n: a.serial })
      : g.effects.find(e => e.type === 'lisa-gal-ribbon' && e.fighter === f.id && e.n === a.serial);
    const u = Math.min(1, (a.t - s.start) / LISA_GAL_TRAVEL);
    const x = clamp(a.anchor + f.facing * reach * (1 - (1 - u) ** 3), X_MIN, X_MAX);
    f.x = x;
    if (ribbon) ribbon.tx = x - ribbon.x;
    applyMelee(g, f, a);
    if (a.hit.size > 0 && !a.tossAt) {
      a.tossAt = a.t;
      g.effect('lisa-flick-hair', f.x + f.facing * 46, f.y - 120, f.data.color, .42, { dir: f.facing });
      g.hitstop = Math.max(g.hitstop, .05);
    }
    if (Math.floor(a.t * 25) !== Math.floor((a.t - dt) * 25)) {
      g.effect('lisa-star', f.x - f.facing * 30, f.y - 50 - (a.shots % 4) * 28, STAR, .5, { dir: f.facing, n: a.shots });
      a.shots++;
    }
    // A ghost is a whole sprite draw: 15 a second while she is still fast is plenty to read the speed.
    if (Math.floor(a.t * 15) !== Math.floor((a.t - dt) * 15) && u < .7) {
      g.effect('ghost', f.x - f.facing * 22, f.y, f.data.color, .2, { fighter: f.id, alpha: .35 - u * .25 });
    }
    if (u < 1) return;
    a.mode = 1;
    g.effect('lisa-skid', f.x, FLOOR, '#e9dccb', .5, { dir: f.facing });
    g.effect('lisa-gal-stop', f.x + f.facing * 26, f.y - 150, STAR, .6, { dir: f.facing });
  }
}
SCRIPTS['lisa-gal'] = Object.assign(SCRIPTS['lisa-gal'] ?? {}, { update: step_gal, customDash: true });

/* ---- I 银猫扑脸 ---- */

const catParts = new WeakMap<Skill, Skill>();
/** One scratch: a quiet tick on a face the cat already holds. */
const scratchOf = (s: Skill) => derive(catParts, s, k => ({
  ...k, damage: 6, knock: 0, status: undefined, finale: undefined, guardPlan: undefined, noBlock: true, noSparks: true,
  gain: 1, react: { kind: 'none' },
} satisfies Skill));
/** Seconds between two scratches, and how many while the cat holds on. */
const SCRATCH_GAP = .4;
const SCRATCHES = 4;
/** A mod's `left` is only a ceiling over its own `acc` clock; step_lisa ends it. */
const CEILING = 1;

function catHome(g: FightGame, o: Fighter, ownerId: number | undefined): void {
  // The clinging cat is a kept effect; let it go.
  for (const e of g.effects) if (e.type === 'lisa-cling' && e.follow === o.id) e.life = Math.min(e.life, .05);
  const owner = ownerId != null ? g.fighterById(ownerId) : undefined;
  const h = headOf(o);
  g.effect('lisa-cat-home', o.x, o.y - h, SILVER, .55, { dir: owner && owner.x < o.x ? -1 : 1, tx: owner ? owner.x - o.x : 0, ty: h });
}
/** One tick of the cat on a face: a scratch every SCRATCH_GAP, off at the end or on a knockdown. */
function stepCling(g: FightGame, o: Fighter, m: Mod, dt: number): void {
  const owner = m.from != null ? g.fighterById(m.from) : undefined;
  const base = owner?.data.skills[3];
  m.acc = (m.acc ?? 0) - dt;
  const done = (m.v ?? 0);
  if (owner && base && owner.hp > 0 && o.hp > 0 && o.knocked <= 0 && done < SCRATCHES && LISA_CLING - m.acc >= (done + 1) * SCRATCH_GAP) {
    m.v = done + 1;
    hit(g, owner, o, scratchOf(base), { hit: new Set() }, o.x - (owner.x <= o.x ? 1 : -1));
    g.effect('lisa-scratch', o.x, o.y - headOf(o) * .82, '#ffffff', .3, { n: done, dir: owner.x <= o.x ? 1 : -1 });
  }
  if (m.acc > 0 && o.hp > 0 && o.knocked <= 0 && owner && owner.hp > 0) return;
  m.left = 0;
  // Off the face: the 混乱 it was causing goes with it.
  for (const c of o.mods) if (c.kind === 'confuse' && c.mark === 'lisa-cat') c.left = Math.min(c.left, .01);
  catHome(g, o, m.from);
}
/** 银猫扑脸 (PICO Fever 第 18 话「ねこねこタイム」: 友希那和猫换了灵魂，猫身的她钻进莉莎衣服里蹭背，莉莎一下就认出来了;
 *  银灰毛、金眼 — 友希那的颜色): she lets a silver cat go, it runs low along the floor (jump it, or guard it), and on a
 *  face it jumps up and clings — 混乱 (data: Skill.status, mark 'lisa-cat') and a scratch every 0.4 s. A knockdown
 *  shakes it off; either way it runs back to her. */
SCRIPTS['lisa-cat'] = Object.assign(SCRIPTS['lisa-cat'] ?? {}, {
  trail: 0,
  hitY: 72,
  shot(_g: FightGame, p: Projectile): boolean {
    p.y = FLOOR - LISA_CAT_BODY;
    return false;
  },
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    const owner = g.fighterById(p.owner);
    // Caught means this hit laid (or refreshed) the 混乱 just now; a guarded cat on an already dizzy face is not.
    const fresh = (p.skill.status?.[0]?.time ?? LISA_CLING) - .05;
    const caught = o.hp > 0 && o.mods.some(m => m.kind === 'confuse' && m.mark === 'lisa-cat' && m.left > fresh);
    if (!owner || !caught) {
      // Guarded: it bounces off and runs home.
      g.effect('lisa-cat-home', p.x, p.y, SILVER, .55, { dir: -Math.sign(p.vx) || 1, tx: owner ? owner.x - p.x : 0, ty: 0 });
      return;
    }
    const live = o.mods.find(m => m.kind === 'cling' && m.left > 0);
    if (live) { live.left = 0; catHome(g, o, live.from); }
    const h = headOf(o);
    g.effect('lisa-cling', o.x, o.y, SILVER, LISA_CLING, { follow: o.id, ox: 0, oy: -h, dir: owner.x <= o.x ? 1 : -1, radius: h });
    addMod(o, 'cling', LISA_CLING + CEILING, { from: owner.id, acc: LISA_CLING, v: 0 });
  },
});

/* ---- O 不用说我也懂 ---- */

const flickParts = new WeakMap<Skill, Skill>();
const flickOf = (s: Skill) => derive(flickParts, s, k => ({
  ...k, knock: 70, noBlock: true, finale: undefined, guardPlan: undefined, react: { kind: 'stand', stun: .8 },
} satisfies Skill));

/** One tick of the read: the thread's far end follows whoever she would read; it ends on its own clock. */
function stepRead(g: FightGame, f: Fighter, m: Mod, dt: number): void {
  m.acc = (m.acc ?? 0) - dt;
  const e = g.effects.find(x => x.type === 'lisa-thread' && x.fighter === f.id);
  if (m.acc <= 0) {
    m.left = 0;
    if (e) e.life = Math.min(e.life, .15);
    return;
  }
  // The thread's far end only needs to move at drawing rate, not every simulation step.
  if (!e || Math.floor(m.acc * 30) === Math.floor((m.acc + dt) * 30)) return;
  const o = g.nearestEnemyTo(f, f.x);
  e.tx = o ? o.x - f.x : 0;
  e.ty = o ? (o.y - headOf(o) * .9) - (f.y - 110) : 0;
}
/** 不用说我也懂 (PICO Fever 第 24 话「ありがとう」: 友希那练歌练到失声，一句话说不出来，莉莎全都懂 — 看得出她想点可可，
 *  却给她点了护嗓的花草茶; 楚萍芳嘲讽时站出来护着她; B 站「心意相通」「R 组二号提词姬」): a wink, and a thin warm thread runs
 *  from her to the foe. She keeps moving and fighting; the read is a mod on her (LISA_READ_TIME). */
function emit_read(g: FightGame, f: Fighter, a: Attack): void {
  a.emitted = true;
  g.effect('lisa-wink', f.x, f.y - 150, STAR, .5, { follow: f.id, ox: f.facing * 12, oy: -150, dir: f.facing });
  g.effect('lisa-thread', f.x, f.y - 110, '#ffb36b', LISA_READ_TIME, { follow: f.id, ox: 0, oy: -110, fighter: f.id, tx: 0, ty: 0 });
  addMod(f, 'read', LISA_READ_TIME + CEILING, { acc: LISA_READ_TIME });
}
/** The flick pose she answers with: her own O, replayed from the hit cell. */
function step_read(_g: FightGame, _f: Fighter, a: Attack): void {
  if (a.mode !== LISA_READ.flick) return;
  a.emitted = true;
  if (a.t >= LISA_FLICK_TIME) a.t = a.skill.duration;
}
SCRIPTS['lisa-read'] = Object.assign(SCRIPTS['lisa-read'] ?? {}, { update: step_read, emit: emit_read });

/** Somebody just started a move. If it is a U / I / O and a foe of theirs is reading them, the move never comes
 *  out: she is in front of them already, and flicks their forehead (该进冷却的照样进冷却). */
CAST_WATCHERS.push((g, f, slot, skill) => {
  if (g.netRole === 'guest' || slot < 2 || slot > 4 || skill.breakout || skill.invuln === 'cast' || f.echo || f.minion || !f.attack) return;
  for (const l of g.fighters) {
    if (!g.isEnemy(l, f) || l.hp <= 0 || l.echo || !has(l, 'read')) continue;
    // She has to be free to answer: not down, held, frozen, walking behind someone (跟班), or in her own super
    // (the flick would throw away a paid-for L). The read waits for the next cast in that case.
    if (l.knocked > 0 || l.stun > 0 || l.hitBySuper || (l.root > 0 && l.rootLevel === 'freeze') || has(l, 'follow')) continue;
    if (l.attack?.skill.super && l.attack.mode !== LISA_COOKIE.tea) continue;
    const o = l.data.skills[4];
    if (o?.fx !== 'lisa-read') continue;
    clearMod(l, 'read');
    for (const e of g.effects) if (e.type === 'lisa-thread' && e.fighter === l.id) e.life = Math.min(e.life, .12);
    // Their move is gone; whatever it gave them for the cast (a dash's invuln) goes with it.
    f.attack = null;
    f.invuln = 0;
    const fromX = l.x, fromY = l.y;
    l.x = clamp(f.x + f.facing * 62, X_MIN, X_MAX);
    l.y = FLOOR;
    l.vx = 0;
    l.vy = 0;
    l.facing = f.x >= l.x ? 1 : -1;
    for (let i = 1; i <= 2; i++) {
      const k = i / 3;
      g.effect('ghost', fromX + (l.x - fromX) * k, fromY + (l.y - fromY) * k, l.data.color, .3, { fighter: l.id, alpha: .45 - k * .2 });
    }
    l.attack = {
      skill: o, index: 4, form: l.form, serial: ++l.attackSerial, t: 0, emitted: true, shots: 0, burst: 0, hit: new Set(),
      endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: l.x, mode: LISA_READ.flick,
    };
    hit(g, l, f, flickOf(o), l.attack, l.x);
    const h = headOf(f);
    g.effect('lisa-snap', l.x, l.y - 110, '#ffb36b', .35, { tx: fromX - l.x, ty: fromY - l.y, dir: l.facing });
    g.effect('lisa-flick', f.x - f.facing * 4, f.y - h * .9, STAR, .5, { dir: l.facing });
    g.hitstop = Math.max(g.hitstop, .1);
    g.shake = Math.max(g.shake, 3);
    return;
  }
});

/* ---- L 特制曲奇·隐藏风味 ---- */

/** The cookie flies at most this long; it is aimed at the mouth this far below the top of the head. */
const COOKIE_FLIGHT = { min: .38, max: .8, speed: 560 };
const MOUTH = .17;
const cookieParts = new WeakMap<Skill, { lob: Skill; blast: Skill }>();
const cookieOf = (s: Skill) => derive(cookieParts, s, k => ({
  lob: { ...k, finale: undefined, noBlock: true, react: { kind: 'stand', stun: .35 } },
  blast: {
    ...k, ...k.finale, finale: undefined, noBlock: true,
    status: [{ kind: 'burn', time: 4, dmg: 6, tick: .5, mark: 'lisa-wasabi' }],
  },
} satisfies Record<string, Skill>));

/** It goes off: green to the ears, steam, tears straight out sideways, and a ring of green that throws them. */
function mustard(g: FightGame, o: Fighter, m: Mod): void {
  const owner = m.from != null ? g.fighterById(m.from) : undefined;
  const s = owner?.data.skills[5];
  if (!owner || !s || s.fx !== 'lisa-cookie' || o.hp <= 0 || o.echo) return;
  // It is already eaten: no dodge, no guard, no invuln holds it.
  o.invuln = 0;
  o.blocking = false;
  const h = headOf(o);
  hit(g, owner, o, cookieOf(s).blast, { hit: new Set() }, o.x - (owner.x <= o.x ? 1 : -1) * 30);
  g.effect('lisa-blast', o.x, o.y - h * .9, WASABI, .9, { dir: owner.x <= o.x ? 1 : -1, radius: h });
  g.flash = Math.max(g.flash, .14);
  g.shake = Math.max(g.shake, 10);
  g.hitstop = Math.max(g.hitstop, .08);
  // A cup of herbal tea, if she is free to drink it (Fever 第 24 话).
  if (!owner.attack && owner.hp > 0 && owner.stun <= 0 && owner.knocked <= 0 && owner.root <= 0 && !has(owner, 'follow') && owner.y >= FLOOR - .5) {
    owner.attack = {
      skill: s, index: 5, form: owner.form, serial: ++owner.attackSerial, t: 0, emitted: true, shots: 0, burst: 0, hit: new Set(),
      endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: owner.x, mode: LISA_COOKIE.tea,
    };
    g.effect('lisa-tea', owner.x, owner.y, '#f3e2b8', LISA_TEA, { follow: owner.id, ox: 0, oy: 0, dir: owner.facing });
  }
}
/** 特制曲奇·隐藏风味 (萌娘百科《相关梗及用语》名场面「莉莎在饼干里加芥末」: 友希那「潸然泪下」的卡面配莉莎「再次制作饼干」;
 *  友希那「只要是莉莎做的曲奇饼，我都喜欢吃」): she holds up a heart-shaped cookie and lobs it straight into the nearest
 *  mouth. A jump gets out from under it; nothing else does. Hearts — it is good. Then nothing at all for
 *  LISA_FUSE while their face goes green from the chin up (they can move, she can hit them), and the mustard
 *  goes off. a.mode is LISA_COOKIE.tea only on the tea pose mustard() starts. */
function emit_cookie(g: FightGame, f: Fighter, a: Attack): void {
  a.emitted = true;
  const s = a.skill;
  const o = g.nearestEnemyTo(f, f.x);
  const x0 = f.x + f.facing * 34, y0 = f.y - 124;
  const tx = o ? o.x : f.x + f.facing * 320;
  const ty = o ? o.y - headOf(o) * (1 - MOUTH) : FLOOR - 150;
  const T = clamp(Math.abs(tx - x0) / COOKIE_FLIGHT.speed, COOKIE_FLIGHT.min, COOKIE_FLIGHT.max);
  const grav = 1650;
  g.projectiles.push({
    owner: f.id, x: x0, y: y0, vx: (tx - x0) / T, vy: (ty - y0 - .5 * grav * T * T) / T, life: T + .6,
    skill: cookieOf(s).lob, color: '#e8b27a', radius: 16, size: 30, fx: 'lisa-cookie', attack: a, hit: new Set(), trail: [], age: 0,
    solid: false,
  });
}
SCRIPTS['lisa-cookie'] = Object.assign(SCRIPTS['lisa-cookie'] ?? {}, {
  emit: emit_cookie,
  update(_g: FightGame, _f: Fighter, a: Attack): void {
    if (a.mode !== LISA_COOKIE.tea) return;
    a.emitted = true;
    if (a.t >= LISA_TEA) a.t = a.skill.duration;
  },
  trail: 0,
  hitY: 110,
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    p.vy += 1650 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y >= FLOOR - 4) {
      // Nobody ate it: it breaks on the floor and a little green puff gets out.
      g.effect('lisa-crumb', p.x, FLOOR, WASABI, .7, { dir: Math.sign(p.vx) || 1 });
      p.life = 0;
      return true;
    }
    const owner = g.fighterById(p.owner);
    if (!owner) return true;
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id)) continue;
      const mouth = o.y - headOf(o) * (1 - MOUTH);
      if (Math.abs(p.x - o.x) > 34 + p.radius || Math.abs(p.y - mouth) > 40) continue;
      if (!hit(g, owner, o, p.skill, { hit: p.hit }, p.x - Math.sign(p.vx) * 40)) continue;
      p.life = 0;
      const h = headOf(o);
      g.effect('lisa-yum', o.x, o.y - h, '#ff8fb1', .9, { follow: o.id, ox: 0, oy: -h });
      g.effect('lisa-fuse', o.x, o.y, WASABI, LISA_FUSE, { follow: o.id, ox: 0, oy: -h * .9, radius: h });
      addMod(o, 'mustard', LISA_FUSE + CEILING, { from: owner.id, acc: LISA_FUSE });
      break;
    }
    return true;
  },
});

/* ---- her mods, run every step (see the header) ---- */

function step_lisa(g: FightGame, f: Fighter, dt: number): void {
  // Host-side, like the burn ticks (status.ts tickStatus): a guest gets these mods and their hits by snapshot.
  if (g.netRole === 'guest') return;
  for (const m of f.mods) {
    if (m.left <= 0) continue;
    if (m.kind === 'cling') stepCling(g, f, m, dt);
    else if (m.kind === 'read') stepRead(g, f, m, dt);
    else if (m.kind === 'mustard') {
      m.acc = Math.max(0, (m.acc ?? 0) - dt);
      if (m.acc > 0) continue;
      // The fuse is spent, but a full-cast invulnerability can postpone the blast.
      if (f.attack?.skill.invuln === 'cast') { m.left = Math.max(m.left, CEILING); continue; }
      m.left = 0;
      mustard(g, f, m);
    }
  }
}
STEP_WATCHERS.push(step_lisa);
