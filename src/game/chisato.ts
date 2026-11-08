import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, H, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, retainEscape, withFinale } from './combat.ts';
import { addMod, clearMod, clearTag, type Mod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  CHISATO_BUBBLES, CHISATO_BUBBLE_FIRST, CHISATO_BUBBLE_GAP, CHISATO_HOP, CHISATO_HOPS, CHISATO_LECTURE,
  CHISATO_LECTURE_SPAN, CHISATO_PULL, CHISATO_SMILE, CHISATO_VEINS,
} from '../render/clips.ts';

/* 白鹭千圣 (Pastel*Palettes). U 这明明是狗 — 画伯's 珍妮弗 hops off the sketchbook and bites (混乱);
   I 铁壁微笑 — the business smile: armour and less damage while she keeps moving, a vein on her temple for
   every hit, and on the third she glares back; O 垃圾分拣 — the look: 脆弱 and 驱邪, a guard does not help;
   L 有必要说教一下呢 — beckoned over, sat down on a cushion, lectured smaller and smaller, 花丸. */

const GOLD = '#FFEEAA';
const VIOLET = '#9d7fd6';

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

/* ---- U 这明明是狗 ---- */

/** The doodle rides this far above the floor between hops. */
const DOODLE_FLOOR = 26;
/** 「这是狗啊！？」: on 丸山彩 the 混乱 runs this much longer. */
const AYA_EXTRA = .5;
SCRIPTS['chisato-jennifer'] = {
  trail: 0,
  hitY: 76,
  update(g: FightGame, f: Fighter, a: Attack, dt: number): void {
    // The page tears out of the sketchbook the moment the drawing comes alive.
    if (a.t >= a.skill.start && a.t - dt < a.skill.start) {
      g.effect('chisato-page', f.x + f.facing * 46, f.y - headOf(f) * .55, GOLD, .45, { dir: f.facing });
    }
  },
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    const ph = p.age * CHISATO_HOPS;
    p.y = FLOOR - DOODLE_FLOOR - Math.abs(Math.sin(ph * Math.PI)) * CHISATO_HOP;
    // A crayon paw print on every landing.
    if (p.age > dt && Math.floor(ph) !== Math.floor(ph - dt * CHISATO_HOPS)) {
      g.effect('chisato-print', p.x, FLOOR, GOLD, 1.1, { dir: Math.sign(p.vx) || 1, n: Math.floor(ph) });
    }
    // Missed: it wags at the crowd and gets crumpled up.
    if (!p.returned && p.life <= dt * 2 && p.hit.size === 0) {
      p.returned = true;
      g.effect('chisato-bye', p.x, FLOOR, GOLD, .9, { dir: Math.sign(p.vx) || 1 });
    }
    return false;
  },
  pulse(g: FightGame, p: Projectile): void {
    g.effect('chisato-bite', p.x, p.y, GOLD, .4, { dir: Math.sign(p.vx) || 1 });
  },
  hitStatus(g, target, list) {
    if (target.data.id !== 'aya') return list;
    const h = headOf(target);
    g.effect('chisato-aya', target.x, target.y - h - 30, GOLD, .9, { follow: target.id, ox: 0, oy: -h - 30 });
    return list.map(st => st.kind === 'confuse' ? { ...st, time: st.time + AYA_EXTRA } : st);
  },
};

/* ---- O 垃圾分拣 ---- */

/** The look misses anyone this far off the floor (a jump clears it). */
const GLARE_AIR = 70;
/** 驱邪 after the look. */
const GLARE_PURGE = 2;
const trash = new WeakMap<Fighter, Effect>();

/** The look itself: the first foe ahead within the skill's range, on the floor. Shared by O and 铁壁微笑's snap. */
function glare(g: FightGame, f: Fighter, s: Skill, source: Attack | { hit: Set<number> }): void {
  const h = headOf(f);
  const eyeY = f.y - h * .86;
  let target: Fighter | undefined, gap = Infinity;
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || o.y < FLOOR - GLARE_AIR) continue;
    const ahead = (o.x - f.x) * f.facing;
    if (ahead < -20 || ahead > s.range || ahead >= gap) continue;
    gap = ahead; target = o;
  }
  const reach = target ? Math.max(40, gap) : s.range;
  g.effect('chisato-shade', f.x, f.y, VIOLET, .6, { follow: f.id, ox: 0, oy: 0, radius: h, dir: f.facing });
  g.effect('chisato-cutin', W / 2, H / 2, VIOLET, .5, { fighter: f.id, dir: f.facing });
  g.effect('chisato-gaze', f.x + f.facing * 18, eyeY, VIOLET, .32, { dir: f.facing, tx: f.facing * reach, ty: target ? target.y - headOf(target) * .7 - eyeY : 0 });
  if (!target) return;
  if (!hit(g, f, target, s, source)) return;
  const th = headOf(target);
  // 日菜 cannot read the room: no 驱邪, just a little star.
  if (target.data.id === 'hina') {
    g.effect('chisato-star', target.x, target.y - th - 20, '#55DDEE', .8, { follow: target.id, ox: 0, oy: -th - 20 });
  } else {
    if (target.purge <= 0) g.text('驱邪', target.x, target.y - th - 22, '#c9b8ef', .6, 18);
    addMod(target, 'lockGuard', GLARE_PURGE, { max: true });
  }
  const old = trash.get(target);
  if (old) old.life = 0;
  trash.set(target, g.effect('chisato-trash', target.x, target.y, '#8f8aa3', s.frail ?? 4, { follow: target.id, ox: 0, oy: 0, radius: th }));
}
SCRIPTS['chisato-glare'] = {
  noMelee: true,
  emit(g: FightGame, f: Fighter, a: Attack): void { glare(g, f, a.skill, a); },
};

/* ---- I 铁壁微笑 ---- */

/** Damage multiplier under the smile. */
const SMILE_CUT = .6;
/** 丸山彩 always gets to her: one of her hits is two veins. */
const AYA_VEINS = 2;
const smiles = new WeakMap<Fighter, { mod: Mod; effects: Effect[] }>();
function dropSmileFx(f: Fighter): void {
  const smile = smiles.get(f);
  if (!smile) return;
  for (const e of smile.effects) e.life = Math.min(e.life, .15);
  smiles.delete(f);
}
SCRIPTS['chisato-smile'] = {
  noMelee: true,
  emit(g: FightGame, f: Fighter): void {
    dropSmileFx(f);
    addMod(f, 'brace', CHISATO_SMILE, { v: SMILE_CUT, tag: 'chisato-smile' });
    const h = headOf(f);
    const effects = [g.effect('chisato-bloom', f.x, f.y, GOLD, CHISATO_SMILE, { follow: f.id, ox: 0, oy: 0, radius: h })];
    const mod = addMod(f, 'smile', CHISATO_SMILE, {
      v: 0,
      hurt(game, who, attacker) {
        const before = mod.v ?? 0;
        if (before >= CHISATO_VEINS) return;
        mod.v = Math.min(CHISATO_VEINS, before + (attacker.data.id === 'aya' ? AYA_VEINS : 1));
        game.effect('chisato-petals', who.x, who.y - h * .55, GOLD, .7, { dir: attacker.x < who.x ? -1 : 1 });
        for (let n = before; n < mod.v; n++) {
          effects.push(game.effect('chisato-vein', who.x, who.y - h, '#ff7aa8', mod.left, { follow: who.id, ox: 0, oy: -h, n, dir: who.facing }));
        }
      },
    });
    smiles.set(f, { mod, effects });
  },
};
/** The smile cracks: the flowers wilt grey-violet and she gives them the look, free. */
function snap(g: FightGame, f: Fighter): void {
  clearMod(f, 'smile');
  clearTag(f, 'chisato-smile');
  dropSmileFx(f);
  const h = headOf(f);
  g.effect('chisato-wilt', f.x, f.y, VIOLET, .9, { follow: f.id, ox: 0, oy: 0, radius: h });
  const o = nearestFoe(g, f);
  const s = f.data.skills[4];
  if (!o || !s || s.fx !== 'chisato-glare') return;
  if (!f.attack) f.facing = o.x >= f.x ? 1 : -1;
  glare(g, f, s, { hit: new Set() });
}

/* ---- L 有必要说教一下呢 ---- */

/** She sits them down this far in front of her. A jump clears the beckon. */
const LECTURE_REACH = 84;
const LECTURE_AIR = 70;
/** A lecture to thin air runs this long before she gives up. */
const WHIFF_TAIL = 1.1;
const lectures = new WeakMap<Fighter, { caster: Fighter; attack: Attack; effects: Effect[] }>();
function release(a: Attack, o?: Fighter): void {
  if (o) {
    const lecture = lectures.get(o);
    if (lecture?.attack === a) {
      clearMod(o, 'lecture');
      for (const e of lecture.effects) e.life = Math.min(e.life, .2);
      lectures.delete(o);
    }
  }
  a.mode = CHISATO_LECTURE.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - .4);
}
function pin(o: Fighter, f: Fighter, x: number): void {
  o.x = clamp(x, X_MIN, X_MAX);
  o.y = FLOOR;
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, .3);
  o.facing = (-f.facing) as 1 | -1;
}
function beatAt(a: Attack, i: number): number {
  return i < CHISATO_BUBBLES ? a.tossAt + CHISATO_BUBBLE_FIRST + i * CHISATO_BUBBLE_GAP : a.tossAt + CHISATO_LECTURE_SPAN;
}
function step_lecture(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const mode = a.mode ?? CHISATO_LECTURE.beckon;
  if (mode === CHISATO_LECTURE.beckon) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('chisato-gogo', f.x, f.y, VIOLET, s.duration, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
    }
    if (a.t < s.start) return;
    let o: Fighter | undefined, gap = Infinity;
    for (const c of g.fighters) {
      if (!g.isEnemy(f, c) || c.hp <= 0 || c.echo || isInvulnerable(c) || c.y < FLOOR - LECTURE_AIR) continue;
      const ahead = (c.x - f.x) * f.facing;
      if (ahead < -30 || ahead > s.range || ahead >= gap || lectures.has(c)) continue;
      gap = ahead; o = c;
    }
    if (!o) {
      a.mode = CHISATO_LECTURE.whiff;
      a.t = Math.max(a.t, s.duration - WHIFF_TAIL);
      for (let i = 0; i < 2; i++) {
        g.effect('chisato-bubble', f.x + f.facing * 30, f.y - headOf(f) - 10, GOLD, .7 + i * .25, { dir: f.facing, n: i, tx: f.facing * (150 + i * 60), ty: -30 - i * 20 });
      }
      return;
    }
    a.mode = CHISATO_LECTURE.pull;
    a.hold = o.id;
    a.tossAt = a.t;
    a.anchor = o.x;
    o.attack = null;
    retainEscape(o, true);
    pin(o, f, o.x);
    addMod(o, 'lecture', CHISATO_LECTURE_SPAN);
    g.hitstop = Math.max(g.hitstop, .05);
    const life = CHISATO_LECTURE_SPAN + .2;
    const effects = [
      g.effect('chisato-split', f.x + f.facing * LECTURE_REACH / 2, H / 2, GOLD, life + .2, { dir: f.facing, fighter: f.id }),
      g.effect('chisato-cushion', o.x, FLOOR, '#c64f6c', life, { follow: o.id, ox: 0, oy: 0 }),
      g.effect('chisato-sweat', o.x, o.y, '#bfe6ff', life, { follow: o.id, ox: 0, oy: 0, radius: headOf(o), dir: -f.facing }),
    ];
    lectures.set(o, { caster: f, attack: a, effects });
    return;
  }
  if (mode === CHISATO_LECTURE.whiff || mode === CHISATO_LECTURE.done) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0) { release(a, o); return; }
  const seat = f.x + f.facing * LECTURE_REACH;
  if (mode === CHISATO_LECTURE.pull) {
    const k = clamp((a.t - a.tossAt) / CHISATO_PULL, 0, 1);
    pin(o, f, a.anchor + (seat - a.anchor) * (1 - (1 - k) ** 3));
    if (k >= 1) a.mode = CHISATO_LECTURE.held;
    return;
  }
  pin(o, f, seat);
  const count = s.count ?? CHISATO_BUBBLES + 1;
  while (a.shots < count && a.t >= beatAt(a, a.shots)) {
    const i = a.shots++;
    const last = i === count - 1;
    const h = headOf(o);
    a.hit.clear();
    const landed = hit(g, f, o, withFinale(s, last), a);
    if (landed && !last) {
      g.effect('chisato-bubble', f.x + f.facing * 26, f.y - headOf(f) - 8, GOLD, .34, {
        dir: f.facing, n: i, hit: true, tx: o.x - f.x - f.facing * 6, ty: (o.y - h * .78) - (f.y - headOf(f) - 8),
      });
    }
    if (last) {
      g.effect('chisato-hanamaru', o.x, o.y - h * .7, '#ff5f7e', .9, { radius: 64 });
      g.flash = Math.max(g.flash, .12);
      g.shake = Math.max(g.shake, 8);
      g.hitstop = Math.max(g.hitstop, .07);
      release(a, o);
      return;
    }
    if (!landed || isInvulnerable(o)) { release(a, o); return; }
  }
}
SCRIPTS['chisato-lecture'] = {
  update: step_lecture, noMelee: true, skipCount: true,
  placesHold: [CHISATO_LECTURE.pull, CHISATO_LECTURE.held],
};

STEP_WATCHERS.push((g, f) => {
  const smile = smiles.get(f);
  // Retaliate outside hit() so the original hit finishes before the return glare.
  if (smile) {
    if (f.hp > 0 && (smile.mod.v ?? 0) >= CHISATO_VEINS) snap(g, f);
    else if (f.hp <= 0 || smile.mod.left <= 0) dropSmileFx(f);
  }
  const lecture = lectures.get(f);
  if (lecture && (lecture.caster.attack !== lecture.attack || lecture.caster.hp <= 0)) release(lecture.attack, f);
});
