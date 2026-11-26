import type { Skill } from '../data/types.ts';
import { gainGauge, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit, withGuard } from './combat.ts';
import { addMod } from './mods.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { TENSORA_CHIPS, TENSORA_DASH, TENSORA_DASH_MODE, TENSORA_EGG, TENSORA_FAT, TENSORA_WAIL } from '../render/clips.ts';

/* 天素罗 — 长崎素世的梗形态：一只穿着炸虾套装的黄色毛绒球，没有手，两只橙色小脚，会自己下蛋。治愈搞笑向。
   Four scripts on SCRIPTS by fx name (combat.ts imports this once), and one step watcher:
     tensora-dash   U 最神速的脚脚  stamping on the spot, then the feet blur and she runs half the screen into the first
                                    grounded body (further and faster on chip fuel); 火车头 steam puffs behind her
     tensora-egg    I 欧耶！        squashed flat she strains for an egg (a hit here is 「耶不出来」: the cast is lost and
                                    half the wait comes back); the 天素球 hatches and the chick walks into the foe
     tensora-chips  O 薯片挑战      a chip crunched to crumbs ahead; heals, feeds the 胖度 and fuels the next run
     tensora-wail   L 坏人类！      puffed up round, then the tantrum: a ring of tear ripples rolls out along the floor,
                                    and every egg and chick of hers cries along with its own small ring
   胖宝宝 (the watcher): a full 胖度 gauge turns her 大胖 for a while — 霸体, harder hits, slower feet, a wider cry —
   and empties it. Every picture is render/tensoraFx.ts; the shared numbers live in render/clips.ts. */

const ID = 'tensora';
const YELLOW = '#FFD84A';
const ORANGE = '#FF9A3C';
const TEAR = '#8fd3ff';

function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
const bigFat = (f: Fighter) => f.mods.some(m => m.kind === 'bigfat' && m.left > 0);

/* ---- U 最神速的脚脚 ---- */

function step_dash(g: FightGame, f: Fighter, a: Attack, dt: number): boolean {
  const s = a.skill, D = TENSORA_DASH;
  a.emitted = true;
  const h = headOf(f);
  if (a.mode === undefined) {
    a.mode = TENSORA_DASH_MODE.wind;
    g.effect('tensora-stamp', f.x, f.y, ORANGE, s.start + .05, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: h, fighter: f.id, cast: { serial: a.serial, mode: TENSORA_DASH_MODE.wind, tail: .04 },
    });
  }
  if (a.mode === TENSORA_DASH_MODE.wind) {
    f.vx = 0;
    if (a.t < s.start) return true;
    // Chip fuel burns here: the run is longer and quicker, and the fuel is gone.
    const fuel = f.mods.find(m => m.kind === 'chips' && m.left > 0);
    if (fuel) fuel.left = 0;
    a.anchor = fuel ? D.boostReach : D.reach;
    a.stall = fuel ? D.boostRun : D.run;
    a.mode = TENSORA_DASH_MODE.run;
    a.tossAt = a.t;
    a.runX = f.x;
    // Bound to the run: a bump or a knock that ends it takes the feet with it.
    g.effect('tensora-feet', f.x, FLOOR, ORANGE, a.stall + .08, {
      follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: h, n: fuel ? 1 : 0, fighter: f.id, cast: { serial: a.serial, mode: TENSORA_DASH_MODE.run, tail: .06 },
    });
    g.effect('tensora-kick', f.x - f.facing * 20, FLOOR, ORANGE, .45, { dir: f.facing, radius: h * .6 });
  }
  if (a.mode === TENSORA_DASH_MODE.run) {
    const run = a.stall ?? D.run;
    const k = clamp((a.t - a.tossAt) / run, 0, 1);
    f.x = clamp((a.runX ?? f.x) + f.facing * a.anchor * k, X_MIN, X_MAX);
    f.vx = 0;
    // 火车头: a puff of steam off her back every few frames, ghosts on the even ones.
    const bucket = Math.floor(a.t * 28);
    if (bucket !== Math.floor((a.t - dt) * 28)) {
      if (bucket % 2 === 0) g.effect('ghost', f.x, f.y, YELLOW, .18, { fighter: f.id, alpha: .3, tint: '#ffe9a0' });
      if (bucket % 3 === 0) g.effect('tensora-steam', f.x - f.facing * h * .35, f.y - h * .55, '#ffffff', .6, { dir: f.facing, radius: 12 + g.random() * 8 });
    }
    for (const o of g.fighters) {
      if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo || isInvulnerable(o)) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead < -20 || ahead > D.grip || o.y < FLOOR - D.air) continue;
      // Pass an origin behind her so crossing an opponent's center in one step never flips knockback or block direction.
      if (!hit(g, f, o, s, a, f.x - f.facing * 30)) continue;
      g.effect('tensora-bonk', o.x - f.facing * 26, f.y - h * .45, ORANGE, .45, { dir: f.facing, radius: 46 });
      g.shake = Math.max(g.shake, 5);
      a.mode = TENSORA_DASH_MODE.brake;
      a.tossAt = a.t;
      break;
    }
    if (a.mode === TENSORA_DASH_MODE.run && k >= 1) {
      a.mode = TENSORA_DASH_MODE.brake;
      a.tossAt = a.t;
    }
    if (a.mode === TENSORA_DASH_MODE.brake) g.effect('tensora-skid', f.x, FLOOR, '#d9c7a0', .5, { dir: f.facing, radius: h * .5 });
    return true;
  }
  f.vx = 0;
  if (a.t >= a.tossAt + D.brake) a.t = Math.max(a.t, s.duration);
  return true;
}
SCRIPTS['tensora-dash'] = {
  update: step_dash, customDash: true, noMelee: true, trail: 0, commit: true,
  passThrough: (a: Attack) => a.mode === TENSORA_DASH_MODE.run,
};

/* ---- I 欧耶！ ---- */

/** Oldest live egg or chick of hers (optionally skipping those already stamped with `skipSerial`), zero allocation. */
function oldestEgg(g: FightGame, f: Fighter, skipSerial?: number): { egg: Projectile | undefined; count: number } {
  let egg: Projectile | undefined;
  let count = 0;
  for (const p of g.projectiles) {
    if (p.owner !== f.id || p.fx !== 'tensora-egg' || p.life <= 0) continue;
    if (skipSerial !== undefined && p.ticked === skipSerial) continue;
    count++;
    if (!egg || p.age > egg.age) egg = p;
  }
  return { egg, count };
}
function step_egg(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, h = headOf(f);
  if (a.mode === undefined) {
    a.mode = 0;
    // No armour while she strains: a hit drops the attack, and the watcher sees the mod outlive it.
    addMod(f, 'strain', s.start + .5, { v: a.index });
    g.effect('tensora-strain', f.x, f.y - h * .5, '#9fd8ff', s.start, {
      follow: f.id, ox: 0, oy: -h * .5, dir: f.facing, radius: h * .5, fighter: f.id, cast: { serial: a.serial, tail: 0 },
    });
  }
}
function emit_egg(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, h = headOf(f);
  for (const m of f.mods) if (m.kind === 'strain') m.left = 0;
  // Two of hers on the field at most: the oldest makes room.
  for (;;) {
    const { egg, count } = oldestEgg(g, f);
    if (!egg || count < TENSORA_EGG.max) break;
    egg.life = 0;
    g.effect('tensora-poof', egg.x, egg.y, '#fff3c4', .45, { radius: 30 });
  }
  const x = clamp(f.x - f.facing * TENSORA_EGG.back, X_MIN, X_MAX);
  g.projectiles.push({
    owner: f.id, x, y: FLOOR - TENSORA_EGG.y, vx: 0, vy: 0, life: s.life ?? TENSORA_EGG.life, skill: s, color: ORANGE,
    radius: TENSORA_EGG.reach, size: s.size ?? 60, fx: 'tensora-egg', attack: a, hit: new Set(), trail: [], age: 0,
    solid: false, face: f.facing, settled: false,
  });
  g.effect('tensora-pop', f.x, f.y - h * .9, YELLOW, .7, { dir: f.facing, radius: h * .6 });
  g.effect('tensora-lay', x, FLOOR, ORANGE, .5, { radius: 34 });
}
/** The egg sits; at `hatch` the shell breaks and the chick walks at the nearest foe and bumps the first grounded body. */
function shot_egg(g: FightGame, p: Projectile, dt: number): boolean {
  const owner = g.fighterById(p.owner);
  if (!owner || owner.hp <= 0) { p.life = 0; return true; }
  p.y = FLOOR - TENSORA_EGG.y;
  if (!p.settled) {
    if (p.age < TENSORA_EGG.hatch) return true;
    p.settled = true;
    p.solid = true;
    g.effect('tensora-hatch', p.x, FLOOR - TENSORA_EGG.y, ORANGE, .6, { radius: 30 });
  }
  const o = g.nearestEnemyTo(owner, p.x);
  const dir = o ? (Math.sign(o.x - p.x) || p.face || 1) : (p.face ?? 1);
  p.face = dir as 1 | -1;
  p.vx = dir * TENSORA_EGG.walk;
  p.x = clamp(p.x + p.vx * dt, X_MIN, X_MAX);
  for (const t of g.fighters) {
    if (!g.isEnemy(owner, t) || t.hp <= 0 || t.echo || isInvulnerable(t) || t.y < FLOOR - 40 || Math.abs(t.x - p.x) > TENSORA_EGG.reach) continue;
    const originX = Math.abs(t.x - p.x) < 6 ? p.x - dir * 12 : p.x;
    if (!hit(g, owner, t, p.skill, p, originX)) continue;
    g.effect('tensora-bonk', p.x + dir * 14, FLOOR - 40, ORANGE, .4, { dir, radius: 30 });
    p.life = 0;
    break;
  }
  return true;
}
SCRIPTS['tensora-egg'] = { update: step_egg, emit: emit_egg, shot: shot_egg, skipVolley: true, trail: 0, wide: true };

/** 耶不出来: the cast fell while she was still straining. A sad little puff, and half the wait comes back. */
STEP_WATCHERS.push((g, f) => {
  const m = f.mods.find(x => x.kind === 'strain' && x.left > 0);
  if (!m) return;
  if (f.attack && f.attack.skill.fx === 'tensora-egg') return;
  m.left = 0;
  // A round that ends under her, or a knockout, is not a failed egg.
  if (g.phase !== 'fight' || f.hp <= 0) return;
  const slot = m.v ?? 3;
  f.cooldowns[slot] = f.cooldowns[slot] * TENSORA_EGG.refund;
  const h = headOf(f);
  g.effect('tensora-fizzle', f.x, f.y - h * .95, '#b9b2c8', .8, { follow: f.id, ox: 0, oy: -h * .95, dir: f.facing });
});

/* ---- O 薯片挑战 ---- */

SCRIPTS['tensora-chips'] = {
  trail: 0,
  update(g: FightGame, f: Fighter, a: Attack): void {
    const s = a.skill, h = headOf(f);
    if (a.mode === undefined) {
      a.mode = 0;
      g.effect('tensora-chip', f.x + f.facing * h * .34, f.y - h * .5, '#f2c14e', s.start + .05, {
        follow: f.id, ox: f.facing * h * .34, oy: -h * .5, dir: f.facing, fighter: f.id, cast: { serial: a.serial, tail: 0 },
      });
    }
    if (a.mode === 0 && a.t >= s.start) {
      a.mode = 1;
      // Whether or not the crumbs land: the chip is eaten.
      f.hp = Math.min(f.data.hp, f.hp + TENSORA_CHIPS.heal);
      g.text(`+${TENSORA_CHIPS.heal}`, f.x, f.y - 160, '#9dffc0', .6, 18);
      gainGauge(f, TENSORA_CHIPS.gauge);
      addMod(f, 'chips', TENSORA_CHIPS.fuel);
      g.effect('tensora-crumbs', f.x + f.facing * h * .4, f.y - h * .48, '#f2c14e', .6, { dir: f.facing, radius: s.range });
      g.effect('tensora-munch', f.x, f.y - h * .5, '#ffffff', .7, { follow: f.id, ox: 0, oy: -h * .5, dir: f.facing, radius: h * .5 });
    }
  },
  flash() { /* the crumbs are the swing */ },
};

/* ---- L 坏人类！ ---- */

const wailParts = new WeakMap<Skill, Skill[]>();
function wailPart(s: Skill, i: number): Skill {
  const list = derive(wailParts, s, () => [] as Skill[]);
  return list[i] ??= i === 0
    ? withGuard({ ...s, finale: undefined }, 0)
    : withGuard({ ...s, ...s.finale, finale: undefined }, i);
}
function ring(g: FightGame, f: Fighter, a: Attack, x: number, reach: number, part: Skill, echo: boolean): void {
  g.projectiles.push({
    owner: f.id, x, y: FLOOR, vx: 0, vy: 0, life: reach / TENSORA_WAIL.speed + .25, skill: part, color: TEAR,
    radius: 0, size: reach, fx: 'tensora-ripple', attack: a, hit: new Set(), trail: [], age: 0, solid: false,
    face: f.facing, returned: echo,
  });
}
function step_wail(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill, h = headOf(f);
  a.emitted = true;
  if (a.mode === undefined) {
    a.mode = 0;
    g.effect('tensora-puff', f.x, f.y - h * .55, '#ff8aa8', s.start, {
      follow: f.id, ox: 0, oy: -h * .55, dir: f.facing, radius: h * .55, fighter: f.id, cast: { serial: a.serial, tail: 0 },
    });
  }
  if (a.t < s.start) return;
  if (a.mode === 0) {
    a.mode = 1;
    // The answering choir is whoever of hers is out right now; each one cries in turn.
    a.hold = -1;
    a.burst = 0;
    const reach = bigFat(f) ? TENSORA_WAIL.fatReach : TENSORA_WAIL.reach;
    ring(g, f, a, f.x, reach, wailPart(s, 0), false);
    g.effect('tensora-tears', f.x, f.y - h * .62, TEAR, TENSORA_WAIL.cry + .3, {
      follow: f.id, ox: 0, oy: -h * .62, dir: f.facing, radius: h, n: bigFat(f) ? 1 : 0, fighter: f.id, cast: { serial: a.serial, tail: .1 },
    });
    g.effect('tensora-stomp', f.x, FLOOR, TEAR, TENSORA_WAIL.cry, {
      follow: f.id, ox: 0, oy: 0, radius: h * .6, fighter: f.id, cast: { serial: a.serial, tail: .06 },
    });
    g.shake = Math.max(g.shake, 6);
  }
  // Oldest first, one every echoGap. A choir member is stamped with this cast's serial once it has cried, so an
  // egg that pops or a chick that bumps someone mid-cry never shifts who is next.
  while (a.burst < TENSORA_EGG.max && a.t >= s.start + (a.burst + 1) * TENSORA_WAIL.echoGap) {
    const p = oldestEgg(g, f, a.serial).egg;
    if (!p) break;
    p.ticked = a.serial;
    a.burst++;
    ring(g, f, a, p.x, TENSORA_WAIL.echoR, wailPart(s, Math.min(a.burst, TENSORA_EGG.max)), true);
    g.effect('tensora-sob', p.x, p.y - 30, TEAR, .7, { radius: 24, dir: p.face ?? 1 });
  }
}
SCRIPTS['tensora-wail'] = { update: step_wail, noMelee: true, trail: 0, commit: true };

/** One ring of tear ripples: it rolls out both ways along the floor and catches grounded bodies at its wet front. */
SCRIPTS['tensora-ripple'] = {
  trail: 0, wide: true,
  shot(g: FightGame, p: Projectile): boolean {
    const owner = g.fighterById(p.owner);
    if (!owner) { p.life = 0; return true; }
    const r = Math.min(p.size, p.age * TENSORA_WAIL.speed);
    p.radius = r;
    for (const o of g.fighters) {
      if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo || p.hit.has(o.id) || isInvulnerable(o) || o.y < FLOOR - 40) continue;
      const d = Math.abs(o.x - p.x);
      if (d > r + 20 || d < r - TENSORA_WAIL.band) continue;
      if (hit(g, owner, o, p.skill, p, p.x)) g.effect('tensora-splash', o.x, FLOOR, TEAR, .5, { radius: p.returned ? 26 : 40 });
    }
    return true;
  },
};

/* ---- 胖宝宝 ---- */

STEP_WATCHERS.push((g, f) => {
  if (f.data.id !== ID || !f.data.gauge) return;
  const max = f.data.gauge.max;
  const fat = f.mods.find(m => m.kind === 'bigfat' && m.left > 0);
  if (fat) {
    // The meter empties as 大胖 runs out, so the bar over her head is the clock.
    f.gauge = max * clamp(fat.left / TENSORA_FAT.time, 0, 1);
    if (fat.left <= .02) f.gauge = 0;
    return;
  }
  if (f.hp <= 0 || f.gauge < max) return;
  // Passive transformation must not trigger addMod's castingUlt() window extension if it pops during 坏人类！.
  const prevUlt = f.ultLeft;
  addMod(f, 'bigfat', TENSORA_FAT.time, { onExpire: (_g, who) => { who.gauge = 0; } });
  addMod(f, 'poise', TENSORA_FAT.time, { max: true });
  addMod(f, 'dmgDealt', TENSORA_FAT.time, { v: TENSORA_FAT.dmg, tag: 'fat' });
  addMod(f, 'speed', TENSORA_FAT.time, { v: TENSORA_FAT.speed, tag: 'fat' });
  f.ultLeft = prevUlt;
  const h = headOf(f);
  g.effect('tensora-fat', f.x, f.y - h * .5, YELLOW, TENSORA_FAT.time, { follow: f.id, ox: 0, oy: -h * .5, radius: h * .6, fighter: f.id });
  g.effect('tensora-fat-on', f.x, f.y - h * .5, YELLOW, .8, { follow: f.id, ox: 0, oy: -h * .5, radius: h * .7 });
});
