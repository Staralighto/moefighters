import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, H, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { foeAhead, hit, retainEscape, withFinale } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  HIMARI_AAO_WORDS, HIMARI_ANSWER_AT, HIMARI_ANSWER_GAP, HIMARI_CALL_A, HIMARI_CALL_FINAL, HIMARI_CALL_O, HIMARI_FRIENDS,
  HIMARI_SHAKE, HIMARI_SHAKE_FIRST, HIMARI_SHAKE_GAP, HIMARI_SHAKE_LUNGE, HIMARI_SHAKE_TAIL,
} from '../render/clips.ts';

const PINK = '#FF9999';
const FOAM = '#d9a274';
const CREAM = '#fff3df';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}

/* ---- U 摇匀一杯摩卡 ---- */

/** She holds them this close while she shakes, and this hard (pixels either way, both bodies). */
const SHAKE_REACH = 58;
const SHAKE_JIGGLE = 7;
const SHAKE_HZ = 11;
function releaseShake(a: Attack): void {
  a.mode = HIMARI_SHAKE.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - HIMARI_SHAKE_TAIL);
}

/** a.tossAt is the catch time; a.anchor is where she holds the target. */
function step_shake(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? HIMARI_SHAKE.lunge;
  if (mode === HIMARI_SHAKE.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && Math.abs(o.y - f.y) < 112 && !isInvulnerable(o)) {
      a.mode = HIMARI_SHAKE.held;
      a.hold = o.id;
      a.tossAt = a.t;
      f.x = clamp(o.x - f.facing * SHAKE_REACH, X_MIN, X_MAX);
      a.anchor = f.x;
      o.vx = 0;
      o.vy = 0;
      o.knocked = 0;
      o.attack = null;
      o.stun = Math.max(o.stun, .35);
      retainEscape(o);
      g.hitstop = Math.max(g.hitstop, .05);
      g.effect('grab', o.x, o.y - 100, PINK, .25, { radius: 46 });
      g.text('摇匀～！', f.x, f.y - 214, PINK, .8, 17);
      // Shake lines round them while she shakes, and a latte over their head that fills on every beat.
      const h = headOf(o);
      const shaking = HIMARI_SHAKE_FIRST + ((s.count ?? 4) - 1) * HIMARI_SHAKE_GAP;
      g.effect('himari-jiggle', o.x, o.y, '#ffffff', shaking + .1, { follow: o.id, ox: 0, oy: 0, radius: h });
      g.effect('himari-latte', o.x, o.y - h - 34, CREAM, shaking + .55, { follow: o.id, ox: 0, oy: -h - 34 });
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 560) * dt, X_MIN, X_MAX);
    if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) {
      g.effect('ghost', f.x - f.facing * 22, f.y, f.data.color, .2, { fighter: f.id, alpha: .3 });
    }
    if (a.t >= s.start + HIMARI_SHAKE_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = HIMARI_SHAKE.done;
      a.t = Math.max(a.t, s.duration - .25);
    }
    return;
  }
  if (mode !== HIMARI_SHAKE.held) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0 || isInvulnerable(o)) {
    releaseShake(a);
    return;
  }
  // Both of them jiggle, she the opposite way, so the pair reads as one shaking unit.
  const k = Math.sin((a.t - a.tossAt) * SHAKE_HZ * Math.PI * 2);
  f.x = clamp(a.anchor - k * SHAKE_JIGGLE * .5, X_MIN, X_MAX);
  o.x = clamp(a.anchor + f.facing * SHAKE_REACH + k * SHAKE_JIGGLE, X_MIN, X_MAX);
  o.y = FLOOR;
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  o.facing = (-f.facing) as 1 | -1;
  const count = s.count ?? 4;
  while (a.shots < count && a.t >= a.tossAt + HIMARI_SHAKE_FIRST + a.shots * HIMARI_SHAKE_GAP) {
    const i = a.shots++;
    const last = i === count - 1;
    a.hit.clear();
    hit(g, f, o, withFinale(s, last), a);
    const h = headOf(o);
    g.effect('himari-foam', o.x, o.y - h * .72, FOAM, .5, { n: i, dir: f.facing, hit: last });
    if (last) {
      g.effect('himari-beans', o.x, o.y - h * .6, '#6b3f25', .7, { dir: f.facing });
      g.shake = Math.max(g.shake, 4);
    } else if (o.hp > 0 && !isInvulnerable(o)) continue;
    releaseShake(a);
    return;
  }
}
SCRIPTS['himari-shake'] = { update: step_shake, noMelee: true, skipCount: true };

/* ---- I 一呼零应 ---- */

/** 委屈: one per 一呼零应 this round, at most this many; 一呼百应's last wave is worth GRIEVANCE_DMG more for each. */
const GRIEVANCE_MAX = 3;
const GRIEVANCE_DMG = 15;
/** How far behind her the awkwardness still reaches. Ahead it is the skill's range. */
const AAO_BACK = 70;
const replies = new WeakMap<Fighter, Effect>();
/** The three words, one at a time, each bigger. a.shots counts the words already up. */
function step_aao(g: FightGame, f: Fighter, a: Attack): void {
  while (a.shots < HIMARI_AAO_WORDS.length && a.t >= HIMARI_AAO_WORDS[a.shots]) {
    const n = a.shots++;
    g.effect('himari-word', f.x + f.facing * (n - 1) * 40, f.y - 214, PINK, a.skill.start + .5 - HIMARI_AAO_WORDS[n], {
      n, dir: f.facing, follow: f.id, ox: f.facing * (n - 1) * 40, oy: -214,
    });
  }
}
function emit_aao(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  g.effect('himari-hush', W / 2, H / 2, '#0b0814', s.duration - s.start + .25);
  g.effect('himari-crow', W + 40, 96, '#1b1620', 1.3, { dir: -1 });
  g.effect('himari-wind', f.x + f.facing * 160, FLOOR, '#dfe8f2', 1.2, { dir: -f.facing });
  g.effect('himari-sweat', f.x, f.y, '#bfe6ff', s.duration - s.start + .2, { follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f) });
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -AAO_BACK || ahead > s.range) continue;
    const wasRooted = o.root > 0;
    if (!hit(g, f, o, s, a) || wasRooted || o.root <= 0) continue;
    o.rootMark = 'himari-awkward';
    g.effect('himari-awkward@apply', o.x, o.y, PINK, .6, { follow: o.id, ox: 0, oy: 0 });
    const h = headOf(o);
    replies.set(o, g.effect('himari-reply', o.x, o.y - h, '#ffffff', o.root, { follow: o.id, ox: 0, oy: -h }));
  }
  const m = f.mods.find(x => x.kind === 'grievance' && x.left > 0);
  addMod(f, 'grievance', 999, { v: Math.min(GRIEVANCE_MAX, (m?.v ?? 0) + 1) });
}
// Let the bubble fade with her root, including when other hits break it early.
STEP_WATCHERS.push((_g, f) => {
  if (f.root > 0 && f.rootMark === 'himari-awkward') return;
  const reply = replies.get(f);
  if (!reply) return;
  reply.life = Math.min(reply.life, .12);
  replies.delete(f);
});
SCRIPTS['himari-aao'] = { update: step_aao, emit: emit_aao, noMelee: true };

/* ---- O 热量全部送给你 ---- */

/** The scale rides the floor at this height; its own `hitY` reaches the ankles. */
const SCALE_Y = 18;
/** What lighter means for her, and for how long. */
const LIGHT_TIME = 4;
const LIGHT_SPEED = 1.2;
SCRIPTS['himari-scale'] = {
  trail: 0,
  hitY: 96,
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    p.y = FLOOR - SCALE_Y;
    if (!p.returned && p.life <= dt * 2 && p.hit.size === 0) {
      p.returned = true;
      g.effect('himari-scale-stop', p.x, FLOOR, PINK, .9, { dir: Math.sign(p.vx) || 1 });
    }
    return false;
  },
  hit(g: FightGame, attacker: Fighter, defender: Fighter): boolean {
    addMod(attacker, 'speed', LIGHT_TIME, { v: LIGHT_SPEED, tag: 'himari-light' });
    g.effect('himari-scale-read', defender.x, FLOOR, PINK, 1.1, { dir: attacker.x <= defender.x ? 1 : -1, radius: headOf(defender) });
    for (const e of g.effects) if (e.type === 'himari-wings' && e.follow === attacker.id) e.life = 0;
    g.effect('himari-wings', attacker.x, attacker.y, PINK, LIGHT_TIME, { follow: attacker.id, ox: 0, oy: 0, radius: headOf(attacker) });
    g.text('叮！', defender.x, FLOOR - 70, '#ffffff', .6, 20);
    return false;
  },
};

/* ---- L 一呼百应 ---- */

/** Ahead of her, and a step behind, the waves reach this far; her own two 「A！」 stay low (a jump clears them),
 *  the answers reach up to ANSWER_AIR, and the sunset wave they make together reaches everything. */
const CALL_BACK = 40;
const SHOUT_AIR = 100;
const ANSWER_AIR = 230;
/** Where the four stand: behind her on the floor, each a step further back (pictures: friends.png). */
const FRIEND_BACK = 64;
const FRIEND_STEP = 50;
function callWave(g: FightGame, f: Fighter, a: Attack, skill: Skill, air: number): void {
  a.hit.clear();
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -CALL_BACK || ahead > skill.range || o.y < FLOOR - air) continue;
    hit(g, f, o, skill, a);
  }
}
/** a.shots is the next beat, including the O that only shows the shout. */
const CALL_BEATS: readonly { t: number; kind: 'A' | 'O' | 'friend' | 'final'; n: number }[] = [
  { t: HIMARI_CALL_A[0], kind: 'A', n: 0 },
  { t: HIMARI_CALL_A[1], kind: 'A', n: 1 },
  { t: HIMARI_CALL_O, kind: 'O', n: 2 },
  ...HIMARI_FRIENDS.map((_, n) => ({ t: HIMARI_ANSWER_AT + n * HIMARI_ANSWER_GAP, kind: 'friend' as const, n })),
  { t: HIMARI_CALL_FINAL, kind: 'final', n: 0 },
];
function step_call(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted) {
    a.emitted = true;
    g.effect('himari-sunset', W / 2, H / 2, '#ff8a4a', s.duration + .35);
    for (const o of g.fighters) {
      if (o.hp > 0 && !o.echo) g.effect('himari-shadow', o.x, o.y, '#1a0a14', s.duration + .35, { follow: o.id, ox: 0, oy: 0 });
    }
  }
  while (a.shots < CALL_BEATS.length && a.t >= CALL_BEATS[a.shots].t) {
    const b = CALL_BEATS[a.shots++];
    if (b.kind === 'A' || b.kind === 'O') {
      g.effect('himari-word', f.x, f.y - 214, PINK, b.kind === 'O' ? 1 : .6, { n: b.n, dir: f.facing, follow: f.id, ox: 0, oy: -214, hit: true });
      if (b.kind === 'O') continue;
      g.effect('himari-wave', f.x + f.facing * 40, FLOOR - 70, PINK, .55, { dir: f.facing, n: b.n });
      callWave(g, f, a, s, SHOUT_AIR);
      continue;
    }
    if (b.kind === 'friend') {
      const m = HIMARI_FRIENDS[b.n];
      const x = clamp(f.x - f.facing * (FRIEND_BACK + (HIMARI_FRIENDS.length - 1 - b.n) * FRIEND_STEP), X_MIN - 30, X_MAX + 30);
      g.effect('himari-friend', x, FLOOR, m.color, s.duration - b.t + .45, { n: b.n, dir: f.facing });
      g.effect('himari-wave', x + f.facing * 30, FLOOR - 90, m.color, .6, { dir: f.facing, n: 2 + b.n, tx: f.x + f.facing * 40 - x });
      callWave(g, f, a, s, ANSWER_AIR);
      g.flash = Math.max(g.flash, .04);
      continue;
    }
    // Everyone answered: the five colours go out as one.
    const grief = f.mods.find(x => x.kind === 'grievance' && x.left > 0);
    const stacks = Math.min(GRIEVANCE_MAX, grief?.v ?? 0);
    clearMod(f, 'grievance');
    const last = { ...s, ...s.finale, damage: (s.finale?.damage ?? s.damage) + stacks * GRIEVANCE_DMG };
    g.effect('himari-final', f.x + f.facing * 90, FLOOR, '#ff8a4a', .85, { dir: f.facing, n: stacks, radius: 150 + stacks * 30 });
    callWave(g, f, a, last, Infinity);
    g.flash = Math.max(g.flash, .16);
    g.shake = Math.max(g.shake, 10 + stacks * 2);
    g.hitstop = Math.max(g.hitstop, .07);
  }
}
SCRIPTS['himari-call'] = { update: step_call, noMelee: true, noSuperFx: true };
