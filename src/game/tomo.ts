import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withFinale, withGuard } from './combat.ts';
import { hasStatus } from './status.ts';
import { SCRIPTS } from './scripts.ts';
import { TOMO_FRACTAL, TOMO_PUFF, TOMO_SCOLD, TOMO_SNAKE } from '../render/clips.ts';

/* 海老冢智 — Girls Band Cry / TOGENASHI TOGEARI 的键盘手，「红生姜 / 吉野家少主」。
   辛辣压制 + 爬宠控场型。Four scripts on SCRIPTS by fx name (combat.ts imports this once):
     tomo-puff     U 拿去吃掉！  《智与蒙布朗》: bouncing cream puff; clean hit confuses with cream on the face,
                                 or it settles on the floor so she can walk over and eat it for HP
     tomo-snake    I 少主，上！  宠物蛇「少主」贴地扑咬定身（跳起可躲），同时抚摸肩头守宫「千代丸」心情变好回血
     tomo-scold    O 给我重练！  148cm 跳起毒舌霸体震开并沉默（可解控）；对已混乱的对手追加额外伤害
     tomo-fractal  L 心象的分形  第 6 话 beni-shouga 插曲：架起 Nord 键盘，五道分形琴键光阵推进后晶体炸裂击倒沉默
   All sprites are empty-handed except L cells 0–1 (the red keyboard); every puff, snake, gecko and fractal
   beam is drawn by render/tomoFx.ts. */

const ID = 'tomo';
const PINK = '#E34D8D';
const CREAM = '#ffe9a8';
const SNAKE = '#ece6da';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function focusMul(f: Fighter): number {
  return f.data.trait === 'focus' ? 1.15 : 1;
}

/* ---- U 拿去吃掉！ ---- */

function step_puff(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (a.emitted || a.t < s.start) return;
  a.emitted = true;
  const spd = (s.speed ?? 460) * focusMul(f);
  g.projectiles.push({
    owner: f.id,
    x: f.x + f.facing * 30,
    y: f.y - headOf(f) * .58,
    vx: f.facing * spd,
    vy: TOMO_PUFF.vy,
    life: s.life ?? 2.5,
    age: 0,
    skill: s,
    color: CREAM,
    radius: 18,
    size: s.size ?? 46,
    fx: 'tomo-puff',
    attack: a,
    hit: new Set(),
    trail: [],
    solid: false,
    face: f.facing,
    wave: 0,
  });
}
function shot_puff(g: FightGame, p: Projectile, dt: number): boolean {
  const owner = g.fighterById(p.owner);
  if (p.settled) {
    // Owner walks up to eat the dropped puff for HP.
    if (owner && owner.hp > 0 && Math.abs(owner.x - p.x) < TOMO_PUFF.pickR && owner.y >= FLOOR - 18) {
      const heal = Math.max(0, Math.min(TOMO_PUFF.heal, owner.data.hp - owner.hp));
      owner.hp += heal;
      p.life = 0;
      g.effect('tomo-puff-eat', owner.x, owner.y - headOf(owner) * .62, PINK, .45, { dir: owner.facing });
      if (heal > 0) g.text('+' + Math.round(heal), owner.x, owner.y - 168, '#ffcf70', .6, 18);
      return true;
    }
    // An enemy stepping on the dropped puff squishes it.
    if (owner) {
      for (const o of g.fighters) {
        if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
        if (Math.abs(o.x - p.x) < TOMO_PUFF.hitR && o.y >= FLOOR - 16) {
          p.life = 0;
          g.effect('tomo-puff-pop', p.x, FLOOR - 8, CREAM, .4, { dir: 1 });
          return true;
        }
      }
    }
    return true;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += TOMO_PUFF.g * dt;
  if (owner && owner.hp > 0) {
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id) || isInvulnerable(o)) continue;
      if (Math.abs(o.x - p.x) > TOMO_PUFF.hitR || p.y < o.y - headOf(o) - 8 || p.y > o.y + 12) continue;
      if (hit(g, owner, o, p.skill, p, p.x - Math.sign(p.vx) * 20)) {
        p.life = 0;
        g.effect('tomo-puff-pop', p.x, p.y, CREAM, .45, { dir: Math.sign(p.vx) || 1 });
        return true;
      }
    }
  }
  if (p.y >= FLOOR - 6) {
    if ((p.wave ?? 0) < 1) {
      p.wave = 1;
      p.y = FLOOR - 6;
      p.vy = TOMO_PUFF.bounceVy;
      p.vx *= TOMO_PUFF.bounceFriction;
      g.effect('tomo-puff-bounce', p.x, FLOOR, CREAM, .32, { dir: Math.sign(p.vx) || 1 });
    } else {
      p.y = FLOOR;
      p.settled = true;
      p.vx = 0;
      p.vy = 0;
      p.age = 0;
      p.life = TOMO_PUFF.floorLife;
    }
  }
  if (p.x <= X_MIN - 30 || p.x >= X_MAX + 30) p.life = 0;
  return true;
}
SCRIPTS[`${ID}-puff`] = { update: step_puff, shot: shot_puff, skipVolley: true, noMelee: true, trail: 0 };

/* ---- I 少主，上！ ---- */

function step_snake(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted) {
    a.emitted = true;
    a.shots = 0;
    g.effect('tomo-gecko', f.x, f.y, PINK, s.duration + .2, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
  }
  if (a.shots === 0 && a.t >= s.start) {
    a.shots = 1;
    const heal = Math.max(0, Math.min(TOMO_SNAKE.heal, f.data.hp - f.hp));
    f.hp += heal;
    if (heal > 0) g.text('+' + Math.round(heal), f.x, f.y - 168, '#ffcf70', .6, 18);
    const spd = (s.speed ?? 520) * focusMul(f);
    g.projectiles.push({
      owner: f.id,
      x: f.x + f.facing * 36,
      y: FLOOR,
      vx: f.facing * spd,
      vy: 0,
      life: s.life ?? 1.5,
      age: 0,
      skill: s,
      color: SNAKE,
      radius: 16,
      size: s.size ?? 42,
      fx: 'tomo-snake',
      attack: a,
      hit: new Set(),
      trail: [],
      solid: false,
      face: f.facing,
    });
  }
}
function shot_snake(g: FightGame, p: Projectile, dt: number): boolean {
  p.x += p.vx * dt;
  const owner = g.fighterById(p.owner);
  if (owner && owner.hp > 0) {
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id) || isInvulnerable(o)) continue;
      if (Math.abs(o.x - p.x) > TOMO_SNAKE.hitR || o.y < FLOOR - TOMO_SNAKE.groundTol) continue;
      const landed = hit(g, owner, o, p.skill, p, p.x - Math.sign(p.vx) * 16);
      if (landed) {
        p.life = 0;
        g.effect('tomo-snake-bite', o.x, FLOOR - 18, PINK, .45, { dir: Math.sign(p.vx) || 1 });
        if (o.root > 0) {
          g.effect('tomo-snake-coil', o.x, o.y, SNAKE, o.root + .08, { follow: o.id, ox: 0, oy: 0, radius: headOf(o), dir: Math.sign(p.vx) || 1 });
        }
        return true;
      }
    }
  }
  if (p.x <= X_MIN - 30 || p.x >= X_MAX + 30) p.life = 0;
  return true;
}
SCRIPTS[`${ID}-snake`] = { update: step_snake, shot: shot_snake, skipVolley: true, noMelee: true, trail: 0 };

/* ---- O 给我重练！ ---- */

const bonusScoldOf = new WeakMap<Skill, Skill>();
function scoldSkill(s: Skill, bonus: boolean): Skill {
  if (!bonus) return s;
  let b = bonusScoldOf.get(s);
  if (!b) bonusScoldOf.set(s, b = { ...s, damage: s.damage + TOMO_SCOLD.bonus });
  return b;
}
function step_scold(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (!a.emitted) {
    a.emitted = true;
    a.shots = 0;
    g.effect('tomo-hop', f.x, f.y, PINK, s.duration, { follow: f.id, ox: 0, oy: 0, radius: headOf(f), dir: f.facing });
  }
  if (a.shots === 0 && a.t >= s.start) {
    a.shots = 1;
    g.effect('tomo-scold', f.x, f.y - headOf(f) * .55, PINK, .48, { dir: f.facing, radius: s.range });
    g.shake = Math.max(g.shake, 5);
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
      if (Math.abs(o.x - f.x) > s.range || Math.abs(o.y - f.y) > 130) continue;
      const confused = hasStatus(o, 'confuse');
      hit(g, f, o, scoldSkill(s, confused), a, f.x);
    }
  }
}
SCRIPTS[`${ID}-scold`] = { update: step_scold, noMelee: true };

/* ---- L 心象的分形 ---- */

const pillarPinOf = new WeakMap<Skill, Skill[]>();
const pillarQuietOf = new WeakMap<Skill, Skill[]>();
function pillarSkill(s: Skill, i: number, pin: boolean): Skill {
  const map = pin ? pillarPinOf : pillarQuietOf;
  let list = map.get(s);
  if (!list) {
    map.set(s, list = TOMO_FRACTAL.xs.map((_, j): Skill => ({
      ...withGuard(s, j),
      react: pin ? { kind: 'pin', stun: .75, holdStill: true } : { kind: 'none' },
    })));
  }
  return list[i];
}
const fractalFinOf = new WeakMap<Skill, Skill>();
function fractalFinale(s: Skill): Skill {
  let fin = fractalFinOf.get(s);
  if (!fin) fractalFinOf.set(s, fin = withFinale(withGuard(s, TOMO_FRACTAL.xs.length), true));
  return fin;
}
function step_fractal(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, F = TOMO_FRACTAL;
  if (!a.emitted) {
    a.emitted = true;
    a.shots = 0;
    a.mode = 0;
    a.liftAt = 0;
    g.effect('tomo-night', f.x, f.y, PINK, s.duration + .1, { fighter: f.id, dir: f.facing, cast: { serial: a.serial, tail: .25 } });
    g.effect('tomo-keys-glow', f.x + f.facing * 42, f.y - 84, PINK, F.bow + .05, { follow: f.id, ox: f.facing * 42, oy: -84, dir: f.facing });
  }
  while (a.shots < F.pillars.length && a.t >= F.pillars[a.shots]) {
    const i = a.shots++;
    const px = clamp(f.x + f.facing * F.xs[i], X_MIN + 20, X_MAX - 20);
    g.effect('tomo-pillar', px, FLOOR, PINK, .46, { dir: f.facing, n: i, radius: 190 });
  }
  while ((a.mode ?? 0) < F.pillars.length && a.t >= F.pillars[a.mode ?? 0] + F.hitDelay) {
    const i = a.mode ?? 0;
    a.mode = i + 1;
    a.hit.clear();
    const px = clamp(f.x + f.facing * F.xs[i], X_MIN + 20, X_MAX - 20);
    const halfW = 58 + i * 4;
    const tall = 265 + i * 24;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      if (Math.abs(o.x - px) > halfW || o.y < FLOOR - tall || o.y > FLOOR + 20) continue;
      const seg = pillarSkill(s, i, o.stun <= .05);
      if (hit(g, f, o, seg, a, f.x)) {
        if (!o.blocking && o.stun > 0 && i < F.pillars.length - 1) {
          const nextPx = clamp(f.x + f.facing * F.xs[i + 1], X_MIN + 20, X_MAX - 20);
          if (Math.abs(o.x - nextPx) > 26) o.x = clamp(o.x + Math.sign(nextPx - o.x) * 70, X_MIN, X_MAX);
        }
        g.effect('tomo-shard', o.x, o.y - headOf(o) * .55, PINK, .32, { dir: f.facing, n: i });
      }
    }
  }
  if (a.liftAt === 0 && a.t >= F.burstSpawn) {
    a.liftAt = 1;
    let cx = clamp(f.x + f.facing * 270, X_MIN + 50, X_MAX - 50);
    let bestD = Infinity;
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead >= -30 && ahead <= F.reach + 40 && Math.abs(ahead) < bestD) {
        bestD = Math.abs(ahead);
        cx = clamp(o.x, X_MIN + 50, X_MAX - 50);
      }
    }
    a.anchor = cx;
    g.effect('tomo-crystal', cx, FLOOR - 95, PINK, .65, { dir: f.facing, radius: 170 });
  }
  if (a.liftAt === 1 && a.t >= F.burst) {
    a.liftAt = 2;
    a.hit.clear();
    const cx = a.anchor;
    g.shake = Math.max(g.shake, 9);
    g.hitstop = Math.max(g.hitstop, .07);
    const fin = fractalFinale(s);
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
      if (Math.abs(o.x - cx) > 155 || Math.abs((o.y - headOf(o) * .5) - (FLOOR - 95)) > 165) continue;
      hit(g, f, o, fin, a, f.x);
    }
  }
}
SCRIPTS[`${ID}-fractal`] = { update: step_fractal, skipCount: true, noMelee: true };
