import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { SCRIPTS } from './scripts.ts';
import { clipFor } from '../render/clips.ts';

/* 千早爱音 — MyGO!!!!! 的吉他手（萌娘百科：伪阳角、AnonTokyo 的创始人、校舍里追着立希跑的跑女）。
   Visual-only hooks: no damage, timing, hitbox or status number changes here. Every picture is in
   render/anonFx.ts. combat.ts imports this module once for the side effect; its own Object.assign of
   'chord' / 'spin' (guitar, hold, trail …) merges on top of these.
     anon-run  U 羽丘跑女      heart dust at the start, hair streak, sparkly steps, pink ghosts, skid, flash pop on hit
     chord     I C和弦         a ring per strum (every fourth one sparkles), a note pops into hearts on contact
     heart     O 多夸夸我嘛    the selfie flash; a rooted foe wears the 'anon-light' heart bubble
     spin      L 不会再逃避了  spotlight, the guitar's arc, flung notes, a star per hit, the MyGO confetti finale */

const PINK = '#FF8899';
const GHOST_TINTS = ['#ffb3c6', '#ffffff'] as const;

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
/** Crossed a boundary of `every` seconds between the last tick and this one. */
const ticked = (t: number, dt: number, every: number) => Math.floor(t / every) !== Math.floor((t - dt) / every);

/* ---- U 羽丘跑女 ---- */

SCRIPTS['anon-run'] = Object.assign(SCRIPTS['anon-run'] ?? {}, {
  update(g: FightGame, f: Fighter, a: Attack, dt: number): void {
    const s = a.skill;
    const h = headOf(f);
    const stop = s.duration - .08;
    const prev = a.t - dt;
    if (prev < s.start && a.t >= s.start) {
      g.effect('anon-dust', f.x, f.y, PINK, .5, { dir: f.facing });
      g.effect('anon-streak', f.x, f.y - h * .62, PINK, .35, { fighter: f.id, tx: 0, dir: f.facing });
    }
    if (a.t >= s.start && a.t < stop) {
      const streak = g.effects.find(e => e.type === 'anon-streak' && e.fighter === f.id);
      if (streak) {
        streak.tx = f.x - streak.x;
        streak.y = f.y - h * .62;
        streak.life = streak.max;
      }
      if (ticked(a.t, dt, 1 / 14)) {
        g.effect('anon-step', f.x - f.facing * 12, f.y, PINK, .35, { dir: f.facing, n: Math.floor(a.t * 14) });
      }
      if (ticked(a.t, dt, 1 / 12)) {
        const clip = clipFor(f);
        const tint = GHOST_TINTS[Math.floor(a.t * 12) % 2];
        g.effect('ghost', f.x - f.facing * 26, f.y, PINK, .22, {
          fighter: f.id, alpha: .45, tint, sheet: clip.sheet, col: clip.col, row: clip.row, facing: f.facing,
        });
      }
    }
    if (prev < stop && a.t >= stop) g.effect('anon-skid', f.x + f.facing * 24, f.y, PINK, .45, { dir: f.facing });
  },
  hit(g: FightGame, attacker: Fighter, defender: Fighter): false {
    g.effect('anon-pop', defender.x, defender.y - headOf(defender) * .55, PINK, .42, { dir: attacker.facing });
    return false;
  },
});

/* ---- I C和弦 ---- */

SCRIPTS['chord'] = Object.assign(SCRIPTS['chord'] ?? {}, {
  update(g: FightGame, f: Fighter, a: Attack): void {
    // The volley fires after this hook, so a new shot shows up here one tick later. a.mode counts the rings drawn.
    const seen = a.mode ?? 0;
    if (a.shots <= seen) return;
    for (let k = seen + 1; k <= a.shots; k++) {
      const big = k % 4 === 0;
      g.effect('anon-strum', f.x + f.facing * 12, f.y - 92, PINK, big ? .5 : .32, {
        dir: f.facing, n: big ? k : 0, follow: f.id, ox: f.facing * 12, oy: -92,
      });
    }
    a.mode = a.shots;
  },
  pulse(g: FightGame, p: Projectile): void {
    g.effect('anon-note-pop', p.x, p.y, PINK, .45);
  },
});

/* ---- O 多夸夸我嘛 ---- */

SCRIPTS['heart'] = Object.assign(SCRIPTS['heart'] ?? {}, {
  update(g: FightGame, f: Fighter, a: Attack): void {
    if (a.mode || a.t < .1) return;
    a.mode = 1;
    const h = headOf(f);
    g.effect('anon-flash', f.x + f.facing * 8, f.y - h * .8, '#ffffff', .65, {
      follow: f.id, ox: f.facing * 8, oy: -h * .8, dir: f.facing, radius: h,
    });
  },
  pulse(g: FightGame, p: Projectile, o: Fighter): void {
    if (o.root > 0 && o.rootFx === 'heart' && !o.rootMark) {
      o.rootMark = 'anon-light';
      g.effect('anon-light@apply', o.x, o.y, PINK, .6, { follow: o.id, ox: 0, oy: 0, radius: headOf(o) });
    }
    g.effect('anon-pop', p.x, p.y, PINK, .42, { dir: Math.sign(p.vx) || 1 });
  },
});

/* ---- L 不会再逃避了 ---- */

/** The spin guitar's pivot height and the radius its body sweeps (propLayout 'anon-spin'). */
const SPIN_PIVOT = 96;
const SPIN_REACH = 200;

SCRIPTS['spin'] = Object.assign(SCRIPTS['spin'] ?? {}, {
  update(g: FightGame, f: Fighter, a: Attack, dt: number): void {
    const s = a.skill;
    if (!a.mode) {
      a.mode = 1;
      g.effect('anon-spot', f.x, f.y, PINK, s.duration + .25, { follow: f.id, ox: 0, oy: 0 });
      g.effect('anon-arc', f.x, f.y, PINK, s.duration, { follow: f.id, ox: 0, oy: 0 });
    }
    // Notes and the odd heart flung off the guitar body along its tangent.
    const u = (a.t - .28) / .7;
    if (u > 0 && u < 1 && ticked(a.t, dt, .06)) {
      const k = Math.floor(a.t / .06);
      const ang = u * Math.PI * 4;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const v = 230 + (k % 3) * 40;
      g.effect('anon-fling', f.x + c * SPIN_REACH, f.y - SPIN_PIVOT + sn * SPIN_REACH, PINK, .55, {
        vx: -sn * v + c * 70, vy: c * v + sn * 70 - 60, n: k,
      });
    }
  },
  hit(g: FightGame, _attacker: Fighter, defender: Fighter, source: Attack | { hit: Set<number> }): false {
    const a = 'shots' in source ? source : undefined;
    const idx = a?.shots ?? 0;
    const last = idx >= (a?.skill.count ?? 6) - 1;
    const y = defender.y - headOf(defender) * .55;
    if (last) {
      g.effect('anon-finale', defender.x, y, PINK, 1.15);
      g.flash = Math.max(g.flash, .05);
    } else {
      g.effect('anon-hitpop', defender.x, y, PINK, .42, { n: idx });
    }
    return false;
  },
});
