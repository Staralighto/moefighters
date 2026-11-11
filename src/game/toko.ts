import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, spawnShot, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS } from './scripts.ts';
import {
  TOKO_MASTER_AT, TOKO_MASTER_IN, TOKO_SELFIE, TOKO_SELFIE_LUNGE, TOKO_SELFIE_SNAP, TOKO_SELFIE_TAIL,
  TOKO_SOLO_FINAL, TOKO_SOLO_SKY, TOKO_SOLO_WAVES,
} from '../render/clips.ts';

/* 桐谷透子 — Morfonica 的吉他，学校和 SNS 上的万人迷辣妹。全部空手：她自己那一下是空气吉他。
   U 这张必火: a lunge, an arm round their shoulders, the phone up, one flash.
   I 师父示范一下: her own muddy note, then 纱夜 behind her with the arrow she should have played.
   O 笑到你破防: pointing and laughing; whoever it reaches takes more from everything for a while.
   L 天上天下 本小姐独尊: one hand to the sky, one to the floor — a pillar down, three waves along, five colours out. */

const RED = '#EE6666';
const SAYO = '#00AABB';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 这张必火 ---- */

/** She pulls them in this close for the picture. */
const SELFIE_REACH = 46;
/** 上头: what a picture that lands is worth to her, and for how long. */
const HYPE_TIME = 4;
const HYPE_DMG = .15;
function releaseSelfie(a: Attack): void {
  a.mode = TOKO_SELFIE.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - TOKO_SELFIE_TAIL);
}
/** a.tossAt is the catch time; a.anchor is where she stands for the picture. */
function step_selfie(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? TOKO_SELFIE.lunge;
  if (mode === TOKO_SELFIE.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && Math.abs(o.y - f.y) < 112 && !isInvulnerable(o)) {
      a.mode = TOKO_SELFIE.held;
      a.hold = o.id;
      a.tossAt = a.t;
      f.x = clamp(o.x - f.facing * SELFIE_REACH, X_MIN, X_MAX);
      a.anchor = f.x;
      o.vx = 0;
      o.vy = 0;
      o.knocked = 0;
      o.attack = null;
      o.stun = Math.max(o.stun, .35);
      retainEscape(o);
      g.hitstop = Math.max(g.hitstop, .04);
      g.effect('grab', o.x, o.y - 100, RED, .22, { radius: 40 });
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 560) * dt, X_MIN, X_MAX);
    if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) {
      g.effect('ghost', f.x - f.facing * 22, f.y, f.data.color, .2, { fighter: f.id, alpha: .3 });
    }
    if (a.t >= s.start + TOKO_SELFIE_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      // Nobody there: she takes the picture of thin air anyway.
      a.mode = TOKO_SELFIE.done;
      a.t = Math.max(a.t, s.duration - .5);
      g.effect('toko-frame', f.x + f.facing * 30, f.y - headOf(f) * .62, RED, .7, { dir: f.facing, n: 0 });
    }
    return;
  }
  if (mode !== TOKO_SELFIE.held) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0 || isInvulnerable(o)) {
    releaseSelfie(a);
    return;
  }
  f.x = a.anchor;
  o.x = clamp(a.anchor + f.facing * SELFIE_REACH, X_MIN, X_MAX);
  o.y = FLOOR;
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  if (a.t < a.tossAt + TOKO_SELFIE_SNAP) return;
  a.hit.clear();
  const landed = hit(g, f, o, s, a);
  const mid = (f.x + o.x) / 2;
  g.flash = Math.max(g.flash, .22);
  g.effect('toko-frame', mid, f.y - Math.max(headOf(f), headOf(o)) * .62, RED, .95, { dir: f.facing, n: 1 });
  if (landed) {
    addMod(f, 'dmgDealt', HYPE_TIME, { v: HYPE_DMG, tag: 'toko-hype' });
    for (const e of g.effects) if (e.type === 'toko-hype' && e.follow === f.id) e.life = 0;
    g.effect('toko-hype', f.x, f.y, RED, HYPE_TIME, { follow: f.id, ox: 0, oy: 0, radius: headOf(f) });
  }
  releaseSelfie(a);
}
SCRIPTS['toko-selfie'] = { update: step_selfie, noMelee: true, placesHold: [TOKO_SELFIE.held] };

/* ---- I 师父示范一下 ---- */

/** 纱夜 stands this far behind her; her arrow is 纱夜's own 百发百中 at a touch less. */
const MASTER_BACK = 74;
const MASTER_ARROW = { damage: 30, speed: 700, size: 28, life: .95, knock: 160, fx: 'arrow' } as const;
const arrows = new WeakMap<Skill, Skill>();
function arrowOf(s: Skill): Skill {
  let v = arrows.get(s);
  if (!v) {
    v = { ...s, ...MASTER_ARROW, slow: undefined, slowMul: undefined, slowOnBlock: undefined, slowMark: undefined, solid: undefined, react: undefined };
    arrows.set(s, v);
  }
  return v;
}
/** a.mode: 0 her own note is out, 1 纱夜 has stepped in, 2 the arrow is away. */
function step_master(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? 0;
  if (mode === 0 && a.t >= s.start + TOKO_MASTER_IN) {
    a.mode = 1;
    const x = clamp(f.x - f.facing * MASTER_BACK, X_MIN - 20, X_MAX + 20);
    g.effect('toko-master', x, FLOOR, SAYO, TOKO_MASTER_AT - TOKO_MASTER_IN + .55, { dir: f.facing });
    return;
  }
  if (mode === 1 && a.t >= s.start + TOKO_MASTER_AT) {
    a.mode = 2;
    a.skill = arrowOf(s);
    const p = spawnShot(g, f, a);
    a.skill = s;
    p.x = f.x - f.facing * (MASTER_BACK - 50);
    p.color = SAYO;
  }
}
SCRIPTS['toko-mud'] = { update: step_master, trail: 0 };

/* ---- O 笑到你破防 ---- */

/** A jump clears the laugh; it reaches a step behind her too. */
const LAUGH_AIR = 110;
const LAUGH_BACK = 30;
function emit_laugh(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  g.effect('toko-laugh', f.x + f.facing * 40, f.y - headOf(f) * .78, RED, .7, { dir: f.facing, radius: s.range });
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -LAUGH_BACK || ahead > s.range || o.y < FLOOR - LAUGH_AIR) continue;
    const was = o.frail;
    if (!hit(g, f, o, s, a) || !(o.frail > was)) continue;
    const h = headOf(o);
    for (const e of g.effects) if (e.type === 'toko-crack' && e.follow === o.id) e.life = 0;
    g.effect('toko-crack', o.x, o.y - h - 26, '#bfe6ff', o.frail, { follow: o.id, ox: 0, oy: -h - 26 });
  }
}
SCRIPTS['toko-laugh'] = { emit: emit_laugh, noMelee: true };

/* ---- L 天上天下 本小姐独尊 ---- */

/** The waves stay on the floor (a jump clears them); the pillar and the five colours reach everything ahead. */
const SOLO_BACK = 40;
const WAVE_AIR = 100;
function soloHit(g: FightGame, f: Fighter, a: Attack, skill: Skill, air: number): number {
  a.hit.clear();
  let n = 0;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -SOLO_BACK || ahead > skill.range || o.y < FLOOR - air) continue;
    if (hit(g, f, o, skill, a)) n++;
  }
  return n;
}
const SOLO_BEATS: readonly { t: number; kind: 'sky' | 'wave' | 'five'; n: number }[] = [
  { t: TOKO_SOLO_SKY, kind: 'sky', n: 0 },
  ...TOKO_SOLO_WAVES.map((t, n) => ({ t, kind: 'wave' as const, n })),
  { t: TOKO_SOLO_FINAL, kind: 'five', n: 0 },
];
const soloParts = new WeakMap<Skill, Skill[]>();
/** One resolved skill per beat: the guard plan stamped in, the last one wearing the finale. */
function partsOf(s: Skill): Skill[] {
  let v = soloParts.get(s);
  if (!v) {
    v = SOLO_BEATS.map((b, i) => withGuard(b.kind === 'five' ? { ...s, ...s.finale, finale: undefined } : { ...s, finale: undefined }, i));
    soloParts.set(s, v);
  }
  return v;
}
/** a.shots is the next beat. */
function step_solo(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted) {
    a.emitted = true;
    g.effect('toko-spot', f.x, FLOOR, '#0c0812', s.duration + .3, { follow: f.id, ox: 0, oy: 0, radius: headOf(f) });
  }
  const parts = partsOf(s);
  while (a.shots < SOLO_BEATS.length && a.t >= SOLO_BEATS[a.shots].t) {
    const i = a.shots++;
    const b = SOLO_BEATS[i];
    if (b.kind === 'sky') {
      // The pillar comes down on whoever is nearest ahead, or on the empty floor in front of her.
      const o = foeAhead(g, f, s.range);
      const x = o ? o.x : clamp(f.x + f.facing * 240, X_MIN, X_MAX);
      g.effect('toko-pillar', x, FLOOR, RED, .8, { dir: f.facing });
      soloHit(g, f, a, parts[i], Infinity);
      g.shake = Math.max(g.shake, 6);
      continue;
    }
    if (b.kind === 'wave') {
      g.effect('toko-wave', f.x + f.facing * 30, FLOOR, RED, .6, { dir: f.facing, n: b.n, radius: s.range });
      soloHit(g, f, a, parts[i], WAVE_AIR);
      continue;
    }
    g.effect('toko-five', f.x, FLOOR, RED, .9, { dir: f.facing, radius: s.range });
    soloHit(g, f, a, parts[i], Infinity);
    g.flash = Math.max(g.flash, .05);
    g.shake = Math.max(g.shake, 10);
    g.hitstop = Math.max(g.hitstop, .07);
  }
}
SCRIPTS['toko-solo'] = { update: step_solo, noMelee: true };
