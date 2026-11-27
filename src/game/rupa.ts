import type { Skill } from '../data/types.ts';
import { gainEnergy, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withFinale, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { isRecruit } from './status.ts';
import { SCRIPTS } from './scripts.ts';
import { RUPA_BASS, RUPA_BOLD, RUPA_RUSH, RUPA_RUSH_MODE, RUPA_SNAP } from '../render/clips.ts';

/* 卢帕 — Girls Band Cry / TOGENASHI TOGEARI 的贝斯手，「酒豪 / 珠颈斑鸠」。
   稳重反差压制型。Four scripts on SCRIPTS by fx name (combat.ts imports this once):
     rupa-rush  U 特盛急送      吉野家打工高速端盘突进；撞实回血并回气，跳起可躲
     rupa-snap  I 芳心快门      踏前拍立得快门抓拍；命中让对手成为跟班并额外回气，留心动印记
     rupa-bold  O 酒胆无忌      豪饮后霸体解控震开，进入大胆状态：加速增伤但受击伤害略增
     rupa-bass  L 因此才需要摇滚 真霸体抱起 Gibson SG Standard Bass 前冲贴脸四连重拨击倒，第四段破防；
                                大胆状态或对手带跟班印记时强化
   All common & U / I / O sprites are empty-handed; only L holds the cherry-red Gibson SG Bass. */

const ID = 'rupa';
const GOLD = '#EEDA01';
const AMBER = '#ff9f2e';
const CRIMSON = '#d9283c';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function hasBold(f: Fighter): boolean {
  return f.mods.some(m => m.kind === 'look' && m.tag === 'rupa-bold' && m.left > 0);
}
function validTarget(g: FightGame, f: Fighter, o: Fighter, minAhead: number, maxAhead: number, maxDy: number, floorAir?: number): boolean {
  if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) return false;
  const ahead = (o.x - f.x) * f.facing;
  if (ahead < minAhead || ahead > maxAhead) return false;
  if (floorAir != null) return o.y >= FLOOR - floorAir;
  return Math.abs(o.y - f.y) <= maxDy;
}
function grantEnergyWithText(g: FightGame, f: Fighter, amount: number, yOff: number, xOff = 0): void {
  const before = f.energy;
  gainEnergy(f, amount);
  const gained = Math.round(f.energy - before);
  if (gained > 0) g.text('+' + gained + '气', f.x + xOff, f.y - yOff, GOLD, .55, 14);
}

/* ---- U 特盛急送 ---- */

function step_rush(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill, R = RUPA_RUSH;
  a.emitted = true;
  const h = headOf(f);
  if (a.mode === undefined) {
    a.mode = RUPA_RUSH_MODE.wind;
    g.effect('rupa-tray', f.x, f.y, GOLD, s.start + R.run, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: h, fighter: f.id,
      cast: { serial: a.serial, tail: .04 },
    });
  }
  if (a.mode === RUPA_RUSH_MODE.wind) {
    f.vx = 0;
    if (a.t < s.start) return;
    a.mode = RUPA_RUSH_MODE.run;
    a.tossAt = a.t;
    a.runX = f.x;
    g.effect('rupa-dash-wind', f.x - f.facing * 20, FLOOR, GOLD, .42, { dir: f.facing, radius: h * .65 });
  }
  if (a.mode === RUPA_RUSH_MODE.run) {
    const k = clamp((a.t - a.tossAt) / R.run, 0, 1);
    f.x = clamp((a.runX ?? f.x) + f.facing * R.reach * k, X_MIN, X_MAX);
    f.vx = 0;
    const bucket = Math.floor(a.t * 28);
    if (bucket !== Math.floor((a.t - dt) * 28) && bucket % 2 === 0) {
      g.effect('ghost', f.x - f.facing * 12, f.y, GOLD, .18, { fighter: f.id, alpha: .3, tint: '#ffe97d' });
    }
    for (const o of g.fighters) {
      if (!validTarget(g, f, o, -20, R.grip, 0, R.air)) continue;
      if (hit(g, f, o, s, a, f.x - f.facing * 24)) {
        if (!o.blocking) {
          const heal = Math.max(0, Math.min(R.heal, f.data.hp - f.hp));
          f.hp += heal;
          g.effect('rupa-serve', f.x + f.facing * 28, f.y - h * .68, GOLD, .5, { dir: f.facing, radius: 48 });
          if (heal > 0) g.text('+' + Math.round(heal), f.x, f.y - 178, '#9cff7a', .65, 18);
          grantEnergyWithText(g, f, R.gain, 154, f.facing * 18);
        }
        g.shake = Math.max(g.shake, 5);
        a.mode = RUPA_RUSH_MODE.brake;
        a.tossAt = a.t;
        break;
      }
    }
    if (a.mode === RUPA_RUSH_MODE.run && k >= 1) {
      a.mode = RUPA_RUSH_MODE.brake;
      a.tossAt = a.t;
    }
    return;
  }
  f.vx = 0;
  if (a.t >= a.tossAt + R.brake) a.t = Math.max(a.t, s.duration);
}
SCRIPTS[`${ID}-rush`] = {
  update: step_rush,
  customDash: true,
  noMelee: true,
  passThrough: (a: Attack) => a.mode === RUPA_RUSH_MODE.run,
};

/* ---- I 芳心快门 ---- */

function step_snap(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill, S = RUPA_SNAP;
  const h = headOf(f);
  if (!a.shots) {
    a.shots = 1;
    g.effect('rupa-finder', f.x, f.y, GOLD, s.start + .05, {
      follow: f.id, ox: f.facing * 32, oy: -h * .68, dir: f.facing, radius: 44,
      cast: { serial: a.serial, tail: .04 },
    });
  }
  // Step forward cleanly during the end of windup so the shutter flash lands at peak reach with exact distance.
  const t0 = Math.max(0, s.start - S.lungeTime);
  const span = Math.max(.001, s.start - t0);
  const prev = clamp((a.t - dt - t0) / span, 0, 1);
  const next = clamp((a.t - t0) / span, 0, 1);
  if (next > prev) {
    f.x = clamp(f.x + f.facing * S.lunge * (next - prev), X_MIN, X_MAX);
  }
}
function emit_snap(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, S = RUPA_SNAP;
  const h = headOf(f);
  g.effect('rupa-shutter', f.x + f.facing * 56, f.y - h * .62, GOLD, .48, { dir: f.facing, radius: 74 });
  g.flash = Math.max(g.flash, .06);
  let rewarded = false;
  for (const o of g.fighters) {
    if (!validTarget(g, f, o, -18, S.reach, 0, S.air)) continue;
    const landed = hit(g, f, o, s, a, f.x - f.facing * 18);
    if (landed && !o.blocking && !rewarded) {
      rewarded = true;
      grantEnergyWithText(g, f, S.gain, 168);
    }
  }
}
SCRIPTS[`${ID}-snap`] = { update: step_snap, emit: emit_snap, noMelee: true };

/* ---- O 酒胆无忌 ---- */

function step_bold(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, h = headOf(f);
  if (!a.shots) {
    a.shots = 1;
    g.effect('rupa-drink', f.x, f.y, AMBER, s.start + .06, {
      follow: f.id, ox: f.facing * 18, oy: -h * .76, dir: f.facing, radius: 38,
      cast: { serial: a.serial, tail: .04 },
    });
  }
}
function emit_bold(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, B = RUPA_BOLD, h = headOf(f);
  g.effect('rupa-bold-wave', f.x, f.y - h * .5, AMBER, .48, { dir: f.facing, radius: B.reach });
  g.shake = Math.max(g.shake, 5);
  addMod(f, 'speed', B.time, { v: B.speed, tag: 'rupa-bold', max: true });
  addMod(f, 'dmgDealt', B.time, { v: B.dmgDealt, tag: 'rupa-bold', max: true });
  addMod(f, 'dmgTaken', B.time, { v: B.dmgTaken, tag: 'rupa-bold', max: true });
  addMod(f, 'look', B.time, { tag: 'rupa-bold', mark: 'rupa-bold', max: true });
  g.text('酒胆无忌！', f.x, f.y - 200, AMBER, .75, 18);
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
    if (Math.abs(o.x - f.x) > B.reach || Math.abs(o.y - f.y) > 135) continue;
    hit(g, f, o, s, a, f.x);
  }
}
SCRIPTS[`${ID}-bold`] = { update: step_bold, emit: emit_bold, noMelee: true };

/* ---- L 因此才需要摇滚 ---- */

const bassBeatOf = new WeakMap<Skill, Skill[]>();
function bassBeatSkill(s: Skill, i: number): Skill {
  let list = bassBeatOf.get(s);
  if (!list) {
    bassBeatOf.set(s, list = RUPA_BASS.beats.map((_, j): Skill => ({
      ...withGuard(s, j),
      react: { kind: 'pin', stun: .32, holdStill: true },
    })));
  }
  return list[i];
}
const bassFinPlainOf = new WeakMap<Skill, Skill>();
const bassFinBoldOf = new WeakMap<Skill, Skill>();
function bassFinaleSkill(s: Skill, bold: boolean): Skill {
  const map = bold ? bassFinBoldOf : bassFinPlainOf;
  let fin = map.get(s);
  if (!fin) {
    const base = withFinale(withGuard(s, RUPA_BASS.beats.length), true);
    fin = bold ? { ...base, damage: Math.round(base.damage * (1 + RUPA_BASS.boldBonus)) } : base;
    map.set(s, fin);
  }
  return fin;
}

function step_bass(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill, B = RUPA_BASS, h = headOf(f);
  if (!a.emitted) {
    a.emitted = true;
    a.shots = 0;
    a.mode = 0; // 0 prep, 1 rushing, 2 locked/done-rush, 3 finale done
    a.liftAt = hasBold(f) ? 1 : 0;
    a.anchor = f.x;
    g.effect('rupa-stage', f.x, f.y, CRIMSON, s.duration + .1, {
      follow: f.id, ox: 0, oy: 0, fighter: f.id, dir: f.facing, n: a.liftAt, cast: { serial: a.serial, tail: .25 },
    });
    g.effect('rupa-bass-aura', f.x, FLOOR, GOLD, s.duration, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: 118, n: a.liftAt,
      cast: { serial: a.serial, tail: .15 },
    });
    g.effect('rupa-tune', f.x + f.facing * 26, f.y - h * .58, GOLD, B.dashStart + .06, {
      follow: f.id, ox: f.facing * 26, oy: -h * .58, dir: f.facing, radius: 56,
      cast: { serial: a.serial, tail: .04 },
    });
  }

  const bold = a.liftAt === 1;
  const reach = B.dashReach * (bold ? B.boldRangeMul : 1);

  if (a.mode === 0 && a.t >= B.dashStart) {
    a.mode = 1;
    a.runX = f.x;
  }
  if (a.mode === 1) {
    const k = clamp((a.t - B.dashStart) / (B.dashEnd - B.dashStart), 0, 1);
    f.x = clamp((a.runX ?? f.x) + f.facing * reach * k, X_MIN, X_MAX);
    f.vx = 0;
    const bucket = Math.floor(a.t * 28);
    if (bucket !== Math.floor((a.t - dt) * 28) && bucket % 2 === 0) {
      g.effect('ghost', f.x - f.facing * 16, f.y, GOLD, .2, { fighter: f.id, alpha: .36, tint: CRIMSON });
    }
    for (const o of g.fighters) {
      if (validTarget(g, f, o, -20, B.grip, 130)) {
        a.mode = 2;
        break;
      }
    }
    if (a.mode === 1 && k >= 1) a.mode = 2;
  }

  while (a.shots < B.beats.length && a.t >= B.beats[a.shots]) {
    const i = a.shots++;
    a.mode = Math.max(a.mode ?? 0, 2);
    a.hit.clear();
    const beatSkill = bassBeatSkill(s, i);
    g.effect('rupa-slap', f.x + f.facing * 52, f.y - h * .52, i % 2 ? CRIMSON : GOLD, .38, {
      dir: f.facing, radius: 88 + i * 14, n: i + (bold ? 10 : 0),
    });
    g.shake = Math.max(g.shake, 4 + i);
    for (const o of g.fighters) {
      const maxX = isRecruit(o, f.id) ? B.hitReach + 65 : B.hitReach;
      if (!validTarget(g, f, o, -26, maxX, 135)) continue;
      if (hit(g, f, o, beatSkill, a, f.x - f.facing * 20)) {
        g.effect('rupa-hit-ripple', o.x, o.y - headOf(o) * .52, i % 2 ? CRIMSON : GOLD, .36, {
          dir: f.facing, radius: 64 + i * 10, n: i + (bold ? 10 : 0),
        });
        if (!o.blocking && isRecruit(o, f.id)) {
          o.x = clamp(f.x + f.facing * 66, X_MIN, X_MAX);
        }
      }
    }
  }

  if ((a.mode ?? 0) < 3 && a.t >= B.finale) {
    a.mode = 3;
    a.hit.clear();
    const fin = bassFinaleSkill(s, bold);
    g.effect('rupa-finale', f.x + f.facing * 64, f.y - h * .54, CRIMSON, .62, {
      dir: f.facing, radius: 142, n: bold ? 1 : 0,
    });
    g.shake = Math.max(g.shake, 11);
    g.hitstop = Math.max(g.hitstop, .08);
    g.flash = Math.max(g.flash, .08);
    for (const o of g.fighters) {
      if (!validTarget(g, f, o, -26, B.hitReach + 30, 150)) continue;
      if (hit(g, f, o, fin, a, f.x - f.facing * 20)) {
        g.effect('rupa-hit-ripple', o.x, o.y - headOf(o) * .54, CRIMSON, .46, {
          dir: f.facing, radius: 98, n: 3 + (bold ? 10 : 0),
        });
      }
    }
  }
}
SCRIPTS[`${ID}-bass`] = {
  update: step_bass,
  skipCount: true,
  noMelee: true,
  noSuperFx: true,
  passThrough: (a: Attack) => a.mode === 1,
};
