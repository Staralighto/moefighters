import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, spawnShot, withGuard } from './combat.ts';
import { addMod, clearTag, has, type Mod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { RINKO_BLOOM, RINKO_TENT, RINKO_TOSS } from './rinkoPath.ts';

/* 白金燐子 — Roselia 的键盘手，社恐的「燐燐」（萌娘百科）。Scripts, registered on SCRIPTS by fx name (combat.ts
   imports this module once for the side effect):
     rinko-tent       U 帐篷出行        a tent drops over her; inside it she plods on at half pace, takes a fifth of
                                       every hit and does not flinch, and nothing comes out (game.ts canAttack reads the
                                       'tent' mod). When it runs out she flings the whole tent: rinko-tent-fly
     rinko-dots       I 键盘手有话要说  a speech bubble swells over her head and three 「……」 dots drop out of it; the
                                       last, biggest one silences (沉默)
     rinko-chat       O 线上话痨模式    a chat window; eight kaomoji fly out of it as fast as she types
     rinko-bloom      L 燐燐开花        the spotlight, a still and pale audience in the dark; keys of light run along the floor
                                       (rinko-keys); whoever they reach is held while five white roses open, and the
                                       big one throws them
   Pictures in render/rinkoFx.ts, shared numbers in rinkoPath.ts. The tent is a mod with its own clock in acc, run by
   a step watcher, so a lockstep dump resumes it (no closures). */

const GREY = '#BBBBBB';
const ROSE = '#f4f1ff';
/** A mod's `left` is only a ceiling that keeps it alive; the watcher ends it. */
const CEILING = 1;

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
/** The move as its last shot wears it. */
const lastParts = new WeakMap<Skill, Skill>();
const lastOf = (s: Skill) => derive(lastParts, s, k => ({ ...k, ...k.finale, finale: undefined }));

/** Free to strike a pose of her own: standing, not held, not in another move. */
function free(f: Fighter): boolean {
  return !f.attack && f.hp > 0 && f.stun <= 0 && f.knocked <= 0 && f.root <= 0 && !has(f, 'follow') && f.y >= FLOOR - .5;
}

/* ---- U 帐篷出行 ---- */

const TENT_TAG = 'rinko-tent';
function emit_tent(g: FightGame, f: Fighter, a: Attack): void {
  a.emitted = true;
  const t = RINKO_TENT.time;
  addMod(f, 'tent', t + CEILING, { acc: t, v: a.index });
  addMod(f, 'brace', t, { v: RINKO_TENT.brace, tag: TENT_TAG });
  addMod(f, 'poise', t, { tag: TENT_TAG });
  addMod(f, 'speed', t, { v: RINKO_TENT.pace, tag: TENT_TAG });
  g.effect('rinko-tent', f.x, FLOOR, GREY, t + .1, { follow: f.id, ox: 0, oy: 0, fighter: f.id, dir: f.facing });
  g.effect('rinko-tent-drop', f.x, FLOOR, '#d9d4e8', .5, { radius: 90 });
}
SCRIPTS['rinko-tent'] = {
  emit: emit_tent,
  update(_g: FightGame, _f: Fighter, a: Attack): void {
    if (a.mode !== RINKO_TOSS.mode) return;
    a.emitted = true;
    if (a.t >= RINKO_TOSS.time) a.t = a.skill.duration;
  },
};
/** The tent is done: the mods come off; standing, she flings it, knocked down, it folds where she fell. */
function endTent(g: FightGame, f: Fighter, m: Mod): void {
  m.left = 0;
  clearTag(f, TENT_TAG);
  for (const e of g.effects) if (e.type === 'rinko-tent' && e.fighter === f.id) e.life = Math.min(e.life, .02);
  const s = f.data.skills[m.v ?? 2];
  if (!s || s.fx !== 'rinko-tent' || f.hp <= 0 || f.knocked > 0) {
    g.effect('rinko-tent-fold', f.x, FLOOR, GREY, .6, { dir: f.facing });
    return;
  }
  g.projectiles.push({
    owner: f.id, x: clamp(f.x + f.facing * 40, X_MIN, X_MAX), y: FLOOR - 70, vx: f.facing * (s.speed ?? 560), vy: 0,
    life: s.life ?? .6, skill: s, color: GREY, radius: 40, size: s.size ?? 120, fx: 'rinko-tent-fly',
    attack: f.attack ?? { skill: s, index: 2, serial: 0, t: 0, emitted: true, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: f.x },
    hit: new Set(), trail: [], age: 0, solid: false, face: f.facing,
  });
  if (free(f)) {
    f.attack = {
      skill: s, index: m.v ?? 2, form: f.form, serial: ++f.attackSerial, t: 0, emitted: true, shots: 0, burst: 0, hit: new Set(),
      endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: f.x, mode: RINKO_TOSS.mode,
    };
  }
}
SCRIPTS['rinko-tent-fly'] = {
  trail: 0, hitY: 72,
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    g.effect('rinko-tent-crash', o.x, FLOOR, GREY, .7, { dir: Math.sign(p.vx) || 1, radius: 80 });
    g.shake = Math.max(g.shake, 5);
  },
};

/* ---- I 键盘手有话要说 ---- */

/** The three dots are born in the bubble and settle to chest height as they fly. */
const CHEST = 88;
function volley_dots(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const n = s.count ?? 3;
  const h = headOf(f);
  // a.mode marks the bubble as up, so it is spawned once without scanning the effect list every step.
  if (a.mode === undefined) {
    a.mode = 1;
    g.effect('rinko-bubble', f.x, f.y - h - 46, '#ffffff', s.duration + .15, {
      follow: f.id, ox: f.facing * 30, oy: -h - 46, dir: f.facing, fighter: f.id, n: a.serial, t0: s.start,
    });
    // On her: the words being squeezed out — dots streaming up into the bubble, a trembling aura, a blush.
    g.effect('rinko-muster', f.x, f.y - h * .5, '#ffffff', s.duration, {
      follow: f.id, ox: 0, oy: -h * .5, dir: f.facing, radius: h, t0: s.start,
    });
  }
  while (a.shots < n && a.t >= s.start + a.shots * (s.interval ?? .26)) {
    const i = a.shots++;
    const last = i >= n - 1;
    const p = spawnShot(g, f, a, 0, i);
    if (last) {
      p.skill = lastOf(s);
      p.size = p.skill.size ?? p.size;
      p.radius = Math.min(54, p.size * .23);
    }
    p.x = f.x + f.facing * (30 + i * 22);
    p.y = f.y - h - 46;
    p.wave = i;
    p.color = '#2a2433';
  }
}
SCRIPTS['rinko-dots'] = {
  volley: volley_dots, trail: 0, hitY: 72,
  shot(_g: FightGame, p: Projectile, dt: number): boolean {
    p.y += (FLOOR - CHEST - p.y) * Math.min(1, 5 * dt);
    return false;
  },
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    if (p.wave !== 2) return;
    const h = headOf(o);
    g.effect('rinko-hush-pop', o.x, o.y - h - 30, '#ffffff', .9, { follow: o.id, ox: 0, oy: -h - 30 });
  },
};

/* ---- O 线上话痨模式 ---- */

/** Lanes the kaomoji take, around the chest. */
const CHAT_LANES = [-28, 6, -12, 22, -22, 10, -4, 0];
function volley_chat(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const n = s.count ?? 8;
  if (a.mode === undefined) {
    a.mode = 1;
    g.effect('rinko-chat', f.x + f.facing * 78, f.y - 128, '#9fd0ff', s.duration + .1, {
      follow: f.id, ox: f.facing * 78, oy: -128, dir: f.facing, fighter: f.id, n: a.serial, t0: s.start,
    });
  }
  while (a.shots < n && a.t >= s.start + a.shots * (s.interval ?? .1)) {
    const i = a.shots++;
    const p = spawnShot(g, f, a, CHAT_LANES[i % CHAT_LANES.length], i);
    if (i >= n - 1) p.skill = lastOf(s);
    p.x = f.x + f.facing * 100;
    p.wave = i;
  }
}
SCRIPTS['rinko-chat'] = { volley: volley_chat, trail: 0, hitY: 72 };

/* ---- L 燐燐开花 ---- */

const bloomParts = new WeakMap<Skill, Skill[]>();
/** Segment i of the move: the keys (0), the small roses, then the big one. Each rides guardPlan[i]. */
function bloomPart(s: Skill, i: number): Skill {
  const list = derive(bloomParts, s, () => [] as Skill[]);
  const n = s.count ?? 6;
  return list[i] ??= i >= n
    ? withGuard({ ...s, ...s.finale, finale: undefined, count: undefined }, i)
    : withGuard({ ...s, finale: undefined, count: undefined, knock: 0, shake: 0, react: { kind: 'pin', stun: .5, holdStill: true } }, i);
}
function step_bloom(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  const B = RINKO_BLOOM;
  if (a.mode === undefined) {
    a.mode = B.fright;
    g.effect('rinko-spot', 0, 0, ROSE, s.duration + .3, { fighter: f.id, follow: f.id, ox: 0, oy: 0, t0: s.start });
    const h = headOf(f);
    g.effect('rinko-shiver', f.x, f.y - h - 20, '#ffffff', s.start, { follow: f.id, ox: 0, oy: -h - 20 });
  }
  if (a.mode === B.fright) {
    if (a.t < s.start) return;
    a.mode = B.run;
    a.anchor = f.x;
    g.effect('rinko-chord', f.x, f.y - 120, ROSE, .7, { follow: f.id, ox: f.facing * 20, oy: -120, dir: f.facing });
    // The keyboard grows at the keys' own speed on its own clock (vx); the hit stops it (vx 0, tx its length).
    const speed = s.speed ?? 1100;
    g.effect('rinko-keyboard', f.x + f.facing * 40, FLOOR, ROSE, 1.9, { fighter: f.id, dir: f.facing, vx: speed, tx: speed * (s.life ?? .9), n: a.serial });
    g.projectiles.push({
      owner: f.id, x: f.x + f.facing * 40, y: FLOOR - B.keyY, vx: f.facing * speed, vy: 0, life: s.life ?? .9,
      skill: bloomPart(s, 0), color: ROSE, radius: 26, size: s.size ?? 70, fx: 'rinko-keys', attack: a, hit: new Set(),
      trail: [], age: 0, solid: false, face: f.facing,
    });
    return;
  }
  if (a.mode === B.run) {
    // The keys have run their full length without reaching anyone (a hit switches to bloom in rinko-keys' pulse).
    if (a.t >= s.start + (s.life ?? .9)) {
      a.mode = B.miss;
      a.t = Math.max(a.t, s.duration - B.bow);
    }
    return;
  }
  if (a.mode === B.bloom) {
    const o = g.fighterById(a.hold);
    const n = s.count ?? 6;
    const gap = s.interval ?? .14;
    if (!o || o.hp <= 0) {
      a.mode = B.done;
      a.t = Math.max(a.t, s.duration - B.bow);
      return;
    }
    // Hold the clock until the last rose is out.
    if (a.t > s.duration - B.bow) a.t = s.duration - B.bow;
    const h = headOf(o);
    while (a.shots < n && a.t >= a.tossAt + a.shots * gap) {
      const i = a.shots++;
      hit(g, f, o, bloomPart(s, i), { hit: new Set() }, f.x);
      // Each beat is one note of a rising arpeggio: it flies in and bursts into a ring of petals, a little higher each time.
      g.effect('rinko-note', o.x, o.y - h * (.22 + i * .13), ROSE, .6, { n: i, dir: f.facing });
    }
    if (a.shots >= n && a.t >= a.tossAt + (n - 1) * gap + B.bigGap) {
      a.shots++;
      a.mode = B.done;
      hit(g, f, o, bloomPart(s, n), { hit: new Set() }, f.x);
      // The rose window opens behind them, then breaks into the petal storm.
      g.effect('rinko-glass', o.x, FLOOR - 170, ROSE, 1.25, { radius: 150, dir: f.facing });
      g.effect('rinko-petals', o.x, FLOOR - 170, ROSE, 2.3, { fighter: f.id, dir: f.facing, t0: RINKO_BLOOM.shatter });
      g.hitstop = Math.max(g.hitstop, .1);
      g.effect('rinko-smile', f.x, f.y - headOf(f) - 20, '#ffd6e6', .9, { follow: f.id, ox: f.facing * 6, oy: -headOf(f) - 20 });
      g.flash = Math.max(g.flash, .16);
      g.shake = Math.max(g.shake, 9);
      a.t = Math.max(a.t, s.duration - B.bow);
    }
  }
}
SCRIPTS['rinko-bloom'] = { update: step_bloom, noMelee: true, skipVolley: true, skipCount: true, trail: 0, commit: true, noSuperFx: true };
/** The keys reach someone: they stop, and the roses begin around them. */
SCRIPTS['rinko-keys'] = {
  trail: 0, hitY: 50, wide: true,
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    const a = p.attack;
    const f = g.fighterById(p.owner);
    p.life = 0;
    if (!f || f.attack !== a || a.mode !== RINKO_BLOOM.run) return;
    a.mode = RINKO_BLOOM.bloom;
    a.hold = o.id;
    a.tossAt = a.t;
    a.shots = 1;
    const kb = g.effects.find(e => e.type === 'rinko-keyboard' && e.fighter === f.id && e.n === a.serial);
    if (kb) { kb.vx = 0; kb.tx = Math.abs(o.x - kb.x); }
    g.effect('rinko-ring', o.x, FLOOR, ROSE, .8, { radius: 110 });
  },
};

/* ---- her mods, run every step ---- */

function step_rinko(g: FightGame, f: Fighter, dt: number): void {
  if (g.netRole === 'guest') return;
  for (const m of f.mods) {
    if (m.left <= 0 || m.kind !== 'tent') continue;
    m.acc = (m.acc ?? 0) - dt;
    if (m.acc <= 0 || f.knocked > 0 || f.hp <= 0) endTent(g, f, m);
  }
}
STEP_WATCHERS.push(step_rinko);
