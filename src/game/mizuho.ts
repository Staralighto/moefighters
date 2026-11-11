import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, H, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, retainEscape, spawnShot, withFinale } from './combat.ts';
import { addMod, clearTag } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';

/* 丰川瑞穗 — 祥子的母亲. Everything she does is taken from her daughter's kit and turned gentle, so the two read
   as one family: U 再抱一会儿 — the hug (「她只想和妈妈多抱一会儿」), two moons closing into one; I 留给你的人偶 —
   the doll she left 祥子 takes the hit for her and answers in 祥子's blue; O 妈妈的小祥 — the 白祥 that 忘却之影
   leaves behind to blow up runs back to her mother instead (same picture, sakiko/shiro.png) and leaves 脆弱;
   L 化作星星 — stars fall from a strip of night sky, and two pale moons stay a breath after (ふたつの月).
   Passive 还想再看看你: once a round, the hit that would drop her leaves her standing in a soft light. */

const MOON = '#e8eefc';
const ICE = '#bcd4ff';
const WARM = '#ffe9c4';
const GOLD = '#e8c873';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function nearestFoe(g: FightGame, f: Fighter): Fighter | undefined {
  let best: Fighter | undefined, gap = Infinity;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const d = Math.abs(o.x - f.x);
    if (d < gap) { gap = d; best = o; }
  }
  return best;
}

/* ---- U 再抱一会儿 ---- */

const HUG = { reach: 0, held: 1, done: 2 } as const;
/** They are held this far in front of her; a jump this high clears the arms. */
const HUG_SEAT = 46;
const HUG_AIR = 90;
/** First beat after the catch, then the gap between beats. */
const HUG_FIRST = .3;
const HUG_GAP = .25;
/** Each beat that lands gives her this much back. */
const HUG_HEAL = 12;

function hugEnd(a: Attack): void {
  a.mode = HUG.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - .3);
}
function hugPin(o: Fighter, f: Fighter): void {
  o.x = clamp(f.x + f.facing * HUG_SEAT, X_MIN, X_MAX);
  o.y = FLOOR;
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  o.facing = (-f.facing) as 1 | -1;
}
function step_hug(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? HUG.reach;
  if (mode === HUG.done) return;
  const h = headOf(f);
  if (mode === HUG.reach) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('mizuho-arms', f.x, f.y, MOON, s.start + .12, { follow: f.id, ox: 0, oy: 0, radius: h, dir: f.facing });
    }
    if (a.t < s.start) return;
    let o: Fighter | undefined, gap = Infinity;
    for (const c of g.fighters) {
      if (!g.isEnemy(f, c) || c.hp <= 0 || c.echo || isInvulnerable(c) || Math.abs(c.y - f.y) > HUG_AIR) continue;
      const ahead = (c.x - f.x) * f.facing;
      if (ahead < -20 || ahead > s.range || ahead >= gap) continue;
      gap = ahead; o = c;
    }
    if (!o) { hugEnd(a); return; }
    a.mode = HUG.held;
    a.hold = o.id;
    a.tossAt = a.t;
    o.attack = null;
    retainEscape(o, false);
    hugPin(o, f);
    g.hitstop = Math.max(g.hitstop, .05);
    const span = HUG_FIRST + ((s.count ?? 4) - 1) * HUG_GAP + .25;
    const ox = f.facing * HUG_SEAT / 2;
    g.effect('mizuho-halo', f.x + ox, f.y, WARM, span, { follow: f.id, ox, oy: 0, radius: h });
    g.effect('mizuho-warm', f.x + ox, f.y, WARM, span, { follow: f.id, ox, oy: 0, radius: h });
    return;
  }
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0) { hugEnd(a); return; }
  hugPin(o, f);
  const count = s.count ?? 4;
  while (a.shots < count && a.t >= a.tossAt + HUG_FIRST + a.shots * HUG_GAP) {
    const i = a.shots++;
    const last = i === count - 1;
    a.hit.clear();
    const landed = hit(g, f, o, withFinale(s, last), a);
    if (landed) {
      f.hp = Math.min(f.data.hp, f.hp + HUG_HEAL);
      g.effect('mizuho-heart', f.x + f.facing * HUG_SEAT / 2, f.y - h * .8, WARM, .7, { n: i });
    }
    if (last && landed) {
      g.effect('mizuho-bloom', f.x + f.facing * HUG_SEAT / 2, f.y - h * .52, WARM, .6, { radius: 160 });
      g.shake = Math.max(g.shake, 4);
    }
    if (last || !landed || isInvulnerable(o)) { hugEnd(a); return; }
  }
}
SCRIPTS['mizuho-hug'] = { update: step_hug, noMelee: true, skipCount: true, placesHold: [HUG.held] };

/* ---- I 留给你的人偶 ---- */

/** After the doll answers, the pose runs this much longer; she cannot be touched for a moment. */
const DOLL_TAIL = .5;
const DOLL_INVULN = .35;
/** The light the doll gives off reaches this far. */
const DOLL_BLAST = 150;
function dollAt(f: Fighter): { ox: number; oy: number } {
  return { ox: f.facing * 44, oy: -headOf(f) * .58 };
}
function step_doll(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted && (a.mode ?? 0) === 0) {
    a.emitted = true;
    const { ox, oy } = dollAt(f);
    g.effect('mizuho-doll', f.x + ox, f.y + oy, ICE, s.start + .1, { follow: f.id, ox, oy, dir: f.facing, n: a.serial });
  }
  if ((a.mode ?? 0) === 0 && a.t >= s.start) {
    a.mode = 2;
    f.hp = Math.min(f.data.hp, f.hp + 40);
    a.t = Math.max(a.t, s.duration - .22);
  }
}
function counter_doll(g: FightGame, f: Fighter, _attacker: Fighter, a: Attack): void {
  const s = a.skill;
  a.mode = 1;
  a.t = Math.max(a.t, s.duration - DOLL_TAIL);
  f.invuln = Math.max(f.invuln, DOLL_INVULN);
  const doll = g.effects.find(e => e.type === 'mizuho-doll' && e.follow === f.id && e.n === a.serial);
  if (doll) doll.life = Math.min(doll.life, .12);
  const { ox, oy } = dollAt(f);
  const x = f.x + ox, y = f.y + oy;
  g.effect('mizuho-doll-burst', x, y, ICE, .6, { radius: DOLL_BLAST, dir: f.facing });
  const once = { hit: new Set<number>() };
  for (const o of g.opponents(f)) {
    if (isInvulnerable(o)) continue;
    if (Math.hypot(o.x - x, o.y - 80 - y) < DOLL_BLAST) hit(g, f, o, s, once, x);
  }
  g.hitstop = Math.max(g.hitstop, .07);
  g.shake = Math.max(g.shake, 6);
}
SCRIPTS['mizuho-doll'] = { update: step_doll, counter: counter_doll, noMelee: true };

/* ---- O 妈妈的小祥 ---- */

SCRIPTS['mizuho-shiro'] = {
  trail: 0,
  hitY: 96,
  update(g: FightGame, f: Fighter, a: Attack, dt: number): void {
    if (a.t >= a.skill.start && a.t - dt < a.skill.start) {
      const oy = -headOf(f) * .7;
      g.effect('mizuho-beckon', f.x + f.facing * 30, f.y + oy, MOON, .4, { follow: f.id, ox: f.facing * 30, oy, dir: f.facing });
    }
  },
  // She runs along the floor: a jump clears her.
  shot(_g: FightGame, p: Projectile): boolean {
    p.y = FLOOR - 80;
    return false;
  },
  pulse(g: FightGame, p: Projectile, target: Fighter): void {
    g.effect('mizuho-petals', p.x, target.y - 90, ICE, .6, { dir: Math.sign(p.vx) || 1 });
  },
};

/* ---- L 化作星星 ---- */

/** Stars are born this high, fall this fast, and scatter this far round whoever they fall on. */
const STAR = { top: H * .25, fall: 520, spread: 70, floor: FLOOR - 10 } as const;
/** The two moons stay this long after the pose. */
const STAR_AFTER = 2.2;
function cast_star(g: FightGame, f: Fighter): void {
  const dur = f.attack?.skill.duration ?? 2.2;
  g.effect('mizuho-night', W / 2, H / 2, MOON, dur + STAR_AFTER, { t0: dur + .25, tx: f.x });
  g.effect('mizuho-pray', f.x, FLOOR, WARM, dur, { follow: f.id, ox: 0, oy: FLOOR - f.y, radius: headOf(f) });
  g.effect('super-zoom', f.x, f.y - 90, '#000000', .75, { radius: 1.1 });
}
function volley_star(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const count = s.count ?? 1;
  while (a.shots < count && a.t >= s.start + a.shots * (s.interval ?? .16)) {
    const last = a.shots >= count - 1;
    const prev = a.skill;
    a.skill = withFinale(s, last);
    const p = spawnShot(g, f, a, 0, a.shots);
    a.skill = prev;
    const o = nearestFoe(g, f);
    // The last one lands where they stand; the others scatter round them. Nobody there: ahead of her.
    const tx = o ? o.x + (last ? 0 : (g.random() * 2 - 1) * STAR.spread) : f.x + f.facing * (160 + g.random() * 320);
    const T = (STAR.floor - STAR.top) / STAR.fall;
    p.vy = STAR.fall;
    // Every star leaves the moon (render/mizuhoFx.ts: W / 2, H × .25) and falls to its own spot.
    p.vx = (clamp(tx, X_MIN, X_MAX) - W / 2) / T;
    p.x = W / 2;
    p.y = STAR.top;
    p.color = last ? GOLD : WARM;
    p.wave = g.random() * Math.PI * 2;
    if (last) { p.size *= 1.5; p.radius *= 1.4; }
    a.shots++;
  }
}
SCRIPTS['mizuho-star'] = {
  cast: cast_star, volley: volley_star, trail: 12, noSuperFx: true, wide: true,
  after(g: FightGame, p: Projectile): boolean {
    if (p.y < STAR.floor) return false;
    p.life = 0;
    g.effect('mizuho-starfall', p.x, FLOOR, p.color, .5, { radius: p.size });
    return true;
  },
  pulse(g: FightGame, p: Projectile, target: Fighter): void {
    g.effect('mizuho-starhit', p.x, Math.min(p.y, target.y - 50), p.color, .4, { radius: p.size });
  },
};

/* ---- 还想再看看你 ---- */

/** She comes back with this share of her health, untouchable this long, and the light pushes this far. */
const WISH = { heal: .3, invuln: 1.6, reach: 170, push: 520 } as const;
const WISH_TAG = 'mizuho-wish';
STEP_WATCHERS.push((g, f) => {
  if (f.data.id !== 'mizuho' || f.echo) return;
  const m = f.mods.find(x => x.kind === 'wish');
  if (!m) {
    // Armed once per body; resetRound rebuilds the fighters, so every round starts with one.
    if (f.hp <= 0) return;
    addMod(f, 'wish', 1e6, { v: 0 });
    addMod(f, 'undying', 1e6, { tag: WISH_TAG });
    return;
  }
  if ((m.v ?? 0) !== 0 || f.hp > 1 || f.hp <= 0) return;
  m.v = 1;
  clearTag(f, WISH_TAG);
  f.hp = Math.round(f.data.hp * WISH.heal);
  f.invuln = Math.max(f.invuln, WISH.invuln);
  f.stun = 0;
  f.knocked = 0;
  f.downTime = 0;
  f.vx = 0;
  for (const o of g.opponents(f)) {
    if (Math.abs(o.x - f.x) > WISH.reach || Math.abs(o.y - f.y) > 160) continue;
    o.vx = (o.x >= f.x ? 1 : -1) * WISH.push;
    o.stun = Math.max(o.stun, .3);
  }
  g.effect('mizuho-wish', f.x, FLOOR, WARM, 1.4, { radius: headOf(f) });
  g.text('还想再看看你', f.x, f.y - headOf(f) - 26, WARM, 1.1, 18);
  g.flash = Math.max(g.flash, .1);
  g.hitstop = Math.max(g.hitstop, .08);
});
