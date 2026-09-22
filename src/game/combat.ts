import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { CONTROLS, FLOOR, GRAVITY, W, clamp } from './constants.ts';
import { drumRow } from '../render/clips.ts';

/* Every damage source (melee swing, projectile) funnels through hit(). Guard, combo and energy rules live here once. */

/** 悲鸣: more cries as she breaks. Resolved once per cast so the shared skill stays put. */
/** 不会再逃避了: every swing except the last stays in place. shots is the swing index before it increments. */
function spinFinale(skill: Skill, source: HitSource): boolean {
  if (skill.fx !== 'spin') return false;
  const shots = 'shots' in source ? Number((source as Attack).shots) : 0;
  return shots >= Math.max(0, (skill.count ?? 1) - 1);
}

/** C和弦 keeps firing past the third note only while the attack key is still down. CPU taps. */
function chordHeld(g: FightGame, f: Fighter): boolean {
  if (f.controller === null || !f.attack) return false;
  const code = CONTROLS[f.controller]?.attacks[f.attack.index];
  return !!code && g.keys.has(code);
}

function syncGuitar(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  if (s.fx !== 'chord' && s.fx !== 'spin') return;
  const kind = s.fx === 'spin' ? 'spin' : 'strum';
  let live = g.effects.find(e => e.type === kind && e.fighter === f.id);
  if (!live) {
    g.effect(kind, f.x, f.y, f.data.color, s.duration, { dir: f.facing, fighter: f.id });
    live = g.effects[g.effects.length - 1];
  }
  live.x = f.x;
  live.y = f.y;
  live.dir = f.facing;
  live.age = a.t;
  live.max = s.duration;
  live.life = Math.max(.04, s.duration - a.t);
}

export function wailShots(hp: number, max: number): number {
  const ratio = max > 0 ? hp / max : 1;
  if (ratio > .75) return 1;
  if (ratio > .5) return 2;
  if (ratio > .25) return 3;
  return 4;
}

export interface HitSource { hit: Set<number> }

export function hit(g: FightGame, attacker: Fighter, defender: Fighter, skill: Skill, source: HitSource, originX = attacker.x): boolean {
  if (!g.isEnemy(attacker, defender) || defender.hp <= 0 || defender.invuln > 0 || source.hit.has(defender.id)) return false;
  source.hit.add(defender.id);
  const wasRooted = defender.root > 0;
  let holdStill = wasRooted;
  const dir = defender.x >= originX ? 1 : -1;
  const inFront = defender.facing === -dir;
  const isGrab = skill.type === 'grab';
  const blocked = defender.blocking && inFront && defender.guard > 0 && !isGrab;
  // Super armour: an endure move in wind-up eats one strike. 恐湖 keeps it through the hit. Grabs and supers still go through.
  const armour = defender.attack;
  const rippleLive = !!armour && armour.skill.fx === 'ripple' && armour.t < armour.skill.duration - .22;
  const endured = !blocked && !!armour && armour.endure > 0 && (rippleLive || armour.t < armour.skill.start) && !isGrab && !skill.super;
  let damage = skill.damage * attacker.data.power * (defender.data.trait === 'armor' ? .9 : 1);

  if (blocked) {
    damage *= skill.super ? .24 : .13;
    defender.guard -= skill.super ? 42 : skill.type === 'heavy' ? 26 : 15;
    defender.stun = .075;
    defender.blockTap = 1;
    defender.energy = clamp(defender.energy + 5, 0, 100);
    attacker.energy = clamp(attacker.energy + 4, 0, 100);
    g.effect('shield', defender.x - dir * 30, defender.y - 78, '#8df0ff', .22, { radius: 65 });
    g.audio.play('block');
    g.text('格挡', defender.x, defender.y - 170, '#91eaff', .35, 16);
    if (defender.guard <= 0) {
      defender.guard = 0;
      defender.stun = .9;
      defender.guardBroken = 1.2;
      defender.blocking = false;
      g.text('破防!', defender.x, defender.y - 200, '#ff75a4', .8, 30);
    }
  } else {
    attacker.combo = attacker.comboTime > 0 ? attacker.combo + 1 : 1;
    attacker.comboTime = 1.3;
    attacker.hitCount++;
    g.totalHits[attacker.id]++;
    g.maxCombo[attacker.id] = Math.max(g.maxCombo[attacker.id], attacker.combo);
    damage *= Math.max(.4, 1 - (attacker.combo - 1) * .085);
    defender.hitFlash = .13;
    if (endured && armour) {
      if (armour.skill.fx !== 'ripple') armour.endure--;
      g.text('霸体', defender.x, defender.y - 195, '#ffd27a', .5, 18);
    } else {
      if (wasRooted) {
        defender.rootHits++;
        if (defender.rootHits >= 2) {
          defender.root = 0;
          defender.rootHits = 0;
          holdStill = false;
        }
      }
      defender.stun = skill.fx === 'bag' ? .26 : skill.fx === 'ripple' ? .35 : skill.type === 'light' ? .28 : skill.super ? .42 : .37;
      defender.attack = null;
      defender.hitBySuper = skill.super;
      // A super wipes the buffer except 恐湖, so the escape can still come out between hits.
      defender.queue = skill.super && defender.data.skills[4]?.fx === 'ripple'
        ? defender.queue.filter(q => q.index === 4)
        : [];
      defender.blocking = false;
      if (skill.fx === 'heart' && !wasRooted) {
        defender.root = 3;
        defender.rootHits = 0;
        defender.dodge = 0;
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = .25;
        holdStill = true;
      } else if (skill.fx === 'spin' && !spinFinale(skill, source)) {
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = .2;
      } else if (skill.fx === 'shove') {
        // Hold them in front, turned to face the attacker. The lift and throw wait on the attack clock.
        defender.stun = .5;
        defender.knocked = 0;
        defender.vx = 0;
        defender.vy = 0;
        defender.x -= dir * 28;
        const face = Math.sign(attacker.x - defender.x) || (dir > 0 ? -1 : 1);
        defender.facing = face < 0 ? -1 : 1;
        if ('tossAt' in source) {
          const atk = source as Attack;
          atk.liftAt = atk.t + .1;
          atk.tossAt = atk.t + .22;
        }
      } else if (skill.fx === 'slam') {
        defender.y = FLOOR;
        defender.vy = 0;
        defender.knocked = 1;
        defender.downTime = 0;
        defender.stun = .4;
      } else if (skill.fx === 'ripple' || skill.fx === 'bag') {
        defender.vy = 0;
        defender.knocked = 0;
      } else if (isGrab || skill.super || skill.type === 'upper' || skill.type === 'sweep') {
        defender.vy = skill.type === 'upper' ? -360 : skill.type === 'sweep' ? -140 : -240;
        defender.knocked = .72;
        defender.downTime = 0;
      } else if (skill.type === 'launch') {
        // Float, not knockdown: the defender stays hittable until they land.
        defender.vy = -520;
        defender.stun = .9;
        g.text('浮空!', defender.x, defender.y - 200, '#ffd27a', .6, 20);
      }
      if (attacker.combo >= 7) {
        defender.invuln = .48;
        defender.vx = dir * 470;
        defender.stun = .24;
        g.text('脱离连段', defender.x, defender.y - 195, '#c6ff85', .7, 16);
      }
    }
    const rushBonus = attacker.data.trait === 'rush' && attacker.hitCount % 3 === 0 ? 14 : 0;
    attacker.energy = clamp(attacker.energy + (skill.super ? 2 : 9) + rushBonus, 0, 100);
    defender.energy = clamp(defender.energy + 7, 0, 100);
    g.audio.play('hit');
    g.text('-' + Math.round(damage), defender.x + dir * 15, defender.y - 160, skill.super ? '#d8ff62' : '#fff', .65, skill.super ? 30 : 23);
    g.sparks(defender.x - dir * 23, defender.y - 85, attacker.data.color, skill.super ? 36 : 18, skill.super ? 1.6 : 1);
    g.effect('hit', defender.x - dir * 23, defender.y - 85, attacker.data.color, .25, { radius: skill.super ? 90 : 48 });
  }

  defender.hp = clamp(defender.hp - damage, 0, defender.data.hp);
  const knock = skill.fx === 'bag' || skill.fx === 'heart' ? 0
    : skill.fx === 'chord' ? 160
    : skill.fx === 'spin' && !spinFinale(skill, source) ? 0
    : skill.fx === 'ripple' ? 620 : skill.fx === 'slam' ? 120 : blocked ? 75 : skill.type === 'light' ? 95 : skill.super ? 340 : 235;
  if (skill.fx !== 'shove' && defender.invuln <= 0 && !endured) defender.vx = dir * knock;
  if (holdStill) { defender.vx = 0; defender.vy = 0; }
  g.shake = blocked ? 2 : skill.fx === 'slam' ? 14 : skill.super ? 12 : skill.type === 'heavy' ? 7 : 4;
  g.hitstop = blocked ? .018 : skill.fx === 'slam' ? .09 : skill.super ? .065 : skill.type === 'heavy' ? .065 : .032;
  return true;
}

export function applyMelee(g: FightGame, f: Fighter, a: Attack): void {
  if (f.hp <= 0 || f.stun > 0) return;
  const s = a.skill;
  const targets = g.opponents(f).sort((p, q) => Math.abs(p.x - f.x) - Math.abs(q.x - f.x));
  for (const o of targets) {
    const dist = Math.abs(o.x - f.x);
    const dy = Math.abs(o.y - f.y);
    const ripple = s.fx === 'ripple';
    const radial = ripple || s.fx === 'spin' || (s.type === 'grab' && s.fx !== 'shove' && s.fx !== 'slam');
    const front = (o.x - f.x) * f.facing >= -20;
    // Sweeps only touch grounded targets; air normals and uppers reach further vertically.
    // A crawl's hand only reaches a standing chest, so a real jump clears it.
    const height = ripple || s.type === 'sweep' ? o.y > FLOOR - 40
      : s.fx === 'crawl' ? dy < 48
      : dy < (s.super ? 170 : s.air || s.type === 'upper' ? 150 : 112);
    if (dist < s.range && (radial || front) && height) {
      hit(g, f, o, s, a);
      if (f.hp <= 0 || f.stun > 0 || f.attack !== a || (radial && !ripple && a.hit.size)) break;
    }
  }
}

/* Thrown arcs. vx/vy are the release, then GRAVITY. Numbers picked so 报价
   clears a standing body in the middle and comes down again before it lands.
   ponytail: fixed table, not a physics solver. Retune the pairs if the zones drift. */
const MILK_ARC = { vx: 560, vy: -640 };
const BAG_ARCS = [
  { vx: 280, vy: -760 },
  { vx: 420, vy: -680 },
  { vx: 560, vy: -600 },
  { vx: 700, vy: -520 },
  { vx: 360, vy: -820 },
  { vx: 640, vy: -560 },
];

export function spawnShot(g: FightGame, f: Fighter, a: Attack, offsetY = 0, arc = 0): Projectile {
  const s = a.skill;
  const lob = s.fx === 'milk' ? MILK_ARC : s.fx === 'bag' ? BAG_ARCS[arc % BAG_ARCS.length] : null;
  if (s.fx === 'milk') g.projectiles = g.projectiles.filter(p => !(p.fx === 'milk' && p.owner === f.id));
  const speed = lob ? lob.vx : (s.speed ?? (s.super ? 650 : 480)) * (f.data.trait === 'focus' ? 1.15 : 1);
  const p: Projectile = {
    owner: f.id,
    x: f.x + f.facing * 53,
    y: f.y - 85 + offsetY,
    vx: f.facing * speed,
    vy: lob ? lob.vy : 0,
    life: s.life ?? 2.7,
    skill: s,
    color: f.data.color,
    radius: s.size ? Math.min(54, s.size * .23) : 17,
    size: s.size ?? 62,
    fx: s.fx,
    attack: a,
    hit: new Set(),
    trail: [],
    age: 0,
  };
  g.projectiles.push(p);
  return p;
}

/** Notes dropped across the whole stage. vx stays 0; stepProjectiles applies vy. */
function spawnRain(g: FightGame, f: Fighter, a: Attack, index: number): void {
  const s = a.skill;
  const count = Math.max(1, s.count ?? 8);
  const p: Projectile = {
    owner: f.id,
    x: 70 + (index + .5) * ((W - 140) / count),
    y: -24 - (index % 3) * 40,
    vx: 0,
    vy: 280,
    life: s.life ?? 2.4,
    skill: s,
    color: f.data.color,
    radius: s.size ? Math.min(54, s.size * .23) : 14,
    size: s.size ?? 36,
    fx: 'note',
    attack: a,
    hit: new Set(),
    trail: [],
    age: 0,
  };
  g.projectiles.push(p);
}

export function updateAttack(g: FightGame, f: Fighter, dt: number): void {
  const a = f.attack;
  if (!a) return;
  const s = a.skill;
  a.t += dt;

  // 推落: a short hold, a small lift, then the throw. Facing stays toward the attacker.
  if (s.fx === 'shove' && a.tossAt > 0) {
    const release = a.t >= a.tossAt;
    for (const id of a.hit) {
      const o = g.fighters.find(p => p.id === id);
      if (!o || o.hp <= 0) continue;
      const face = Math.sign(f.x - o.x) || -f.facing;
      o.facing = face < 0 ? -1 : 1;
      if (release) {
        const dir = Math.sign(o.x - f.x) || f.facing;
        o.vx = dir * 3200;
        o.vy = -560;
        o.knocked = .9;
        o.downTime = 0;
        o.stun = Math.max(o.stun, .4);
      } else {
        o.vx = 0;
        o.vy = a.t < a.liftAt ? -20 : -120;
        o.knocked = 0;
        o.stun = Math.max(o.stun, .3);
      }
    }
    if (release) {
      a.liftAt = 0;
      a.tossAt = 0;
      a.t = Math.max(a.t, s.duration - .22);
    }
  }

  // 满场: push whoever is standing in front, then keep the kit up for the sit. No extra hit.
  if (s.fx === 'drums' && !a.emitted) {
    a.emitted = true;
    for (const o of g.opponents(f)) {
      if (o.hp <= 0) continue;
      if ((o.x - f.x) * f.facing >= -20 && Math.abs(o.x - f.x) < 140) {
        o.vx = f.facing * 480;
        o.stun = Math.max(o.stun, .25);
      }
    }
    g.effect('drums', f.x, f.y, f.data.color, s.duration, { dir: f.facing });
  }
  if (s.fx === 'drums' && drumRow(a.t, s.duration) === 1 && drumRow(Math.max(0, a.t - dt), s.duration) !== 1) {
    const y = f.y - 78;
    g.effect('drum-wave', f.x - 110, y, '#f4ecff', .32, { radius: 24 });
    g.effect('drum-wave', f.x + 110, y, '#f4ecff', .32, { radius: 24 });
  }

  // One travelling double for the whole super. The four grabs still come from the flurry below.
  if (s.fx === 'mortis' && !a.emitted) {
    a.emitted = true;
    const foe = g.opponents(f)
      .filter(o => o.hp > 0 && (o.x - f.x) * f.facing >= -20 && Math.abs(o.x - f.x) < s.range)
      .sort((p, q) => Math.abs(p.x - f.x) - Math.abs(q.x - f.x))[0];
    const dist = foe ? Math.max(48, Math.abs(foe.x - f.x)) : s.range;
    g.effect('mortis', f.x, f.y, f.data.color, s.duration, { dir: f.facing, radius: dist });
  }

  if (s.type === 'dash' && a.t >= s.start && a.t < s.duration - .08) {
    f.x += f.facing * (s.speed ?? (s.super ? 820 : 580)) * dt;
    applyMelee(g, f, a);
    if (Math.floor(a.t * 30) % 3 === 0) g.effect('ghost', f.x - f.facing * 18, f.y, f.data.color, .18, { fighter: f.id, alpha: .3 });
  }
  // A grab that lunges. It stops on contact; a whiff runs out the active window.
  if (s.fx === 'shove' && a.hit.size === 0 && a.t >= s.start && a.t < s.start + .72) {
    f.x += f.facing * (s.speed ?? 700) * dt;
    applyMelee(g, f, a);
    // Pale gold silhouette, same source-atop wash as 墨缇丝. One stamp per 1/16s along the lunge.
    if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) {
      g.effect('ghost', f.x - f.facing * 24, f.y, '#ffe7a8', .3, { fighter: f.id, alpha: .55, tint: '#ffe7a8' });
    }
  }
  // Whiff: the last clip frame is already up when the lunge ends. 2.2s is the throw, not the miss.
  if (s.fx === 'shove' && a.hit.size === 0 && a.t >= s.start + .72) a.t = s.duration;
  // 信用: catch in front, then slam the other way. Damage waits for the impact.
  if (s.fx === 'slam' && a.hold < 0 && a.t >= s.start && a.t < s.start + .45) {
    f.x += f.facing * (s.speed ?? 220) * dt;
    for (const o of g.opponents(f)) {
      if (o.hp <= 0 || o.invuln > 0) continue;
      const front = (o.x - f.x) * f.facing >= -20;
      if (Math.abs(o.x - f.x) < s.range && front && Math.abs(o.y - f.y) < 112) {
        a.hold = o.id;
        a.tossAt = a.t + .18;
        o.stun = .6;
        o.vx = 0;
        o.vy = 0;
        o.knocked = 0;
        o.attack = null;
        o.queue = [];
        break;
      }
    }
  }
  if (s.fx === 'slam' && a.hold >= 0 && a.tossAt > 0) {
    const o = g.fighters.find(p => p.id === a.hold);
    if (o && o.hp > 0) {
      if (a.t < a.tossAt) {
        o.x = f.x + f.facing * 48;
        o.y = FLOOR;
        o.vx = 0;
        o.vy = 0;
        o.stun = Math.max(o.stun, .3);
        const face = Math.sign(f.x - o.x) || -f.facing;
        o.facing = face < 0 ? -1 : 1;
      } else {
        o.x = f.x - f.facing * 80;
        o.y = FLOOR;
        hit(g, f, o, s, a);
        g.effect('slam', o.x, FLOOR, f.data.color, .45, { radius: 90 });
        a.tossAt = 0;
        a.t = Math.max(a.t, s.duration - .35);
      }
    }
  }
  if (s.fx === 'slam' && a.hold < 0 && a.t > s.start + .5) a.t = s.duration;
  // The rising fist stays live for a while so it catches jumpers at any height.
  if (s.type === 'upper' && a.t >= s.start && a.t < s.start + .25) applyMelee(g, f, a);

  // 月牙踢: two or three copies of the kicking pose, stepped back along the arc.
  if (s.fx === 'arc-kick' && a.t >= s.start && a.t < s.start + .34) {
    const tick = Math.floor((a.t - s.start) * 12);
    if (tick > a.shots && tick <= 3) {
      a.shots = tick;
      g.effect('ghost', f.x - f.facing * (14 + tick * 16), f.y, f.data.color, .2, { fighter: f.id, alpha: .32 });
    }
  }

  const volley = a.burst || s.count || 1;
  if (s.type === 'projectile' && volley > 1) {
    while (a.shots < volley && a.t >= s.start + a.shots * (s.interval ?? .14)) {
      if (s.fx === 'chord' && a.shots >= 3 && !chordHeld(g, f)) break;
      if (s.fx === 'drums') spawnRain(g, f, a, a.shots);
      else spawnShot(g, f, a, (a.shots % 3 - 1) * 15, a.shots);
      a.shots++;
      g.audio.play('cast');
    }
    if (s.fx === 'chord' && a.shots >= 3 && !chordHeld(g, f) && a.t < s.duration - .22) a.t = s.duration - .22;
  } else if ((s.count ?? 1) > 1) {
    // ponytail: N swings, one cooldown. Each swing gets a fresh hit set so the same target can be caught again.
    const ring = [
      { x: 76, y: -74, dir: 1 },
      { x: 6, y: -128, dir: 1 },
      { x: -42, y: -76, dir: -1 },
    ];
    while (a.shots < (s.count ?? 1) && a.t >= s.start + a.shots * (s.interval ?? .11)) {
      const swing = ring[a.shots % ring.length];
      if (a.shots === 0 && a.index >= 2) g.text(s.name, f.x, f.y - 190, f.data.color, .65, 17);
      a.hit = new Set();
      applyMelee(g, f, a);
      if (s.fx !== 'mortis' && s.fx !== 'spin') g.effect(s.fx, f.x + f.facing * swing.x, f.y + swing.y, f.data.color, .18, { dir: f.facing * swing.dir, radius: s.range * .34 });
      a.shots++;
    }
  } else if (!a.emitted && a.t >= s.start) {
    a.emitted = true;
    if (s.type === 'projectile') {
      spawnShot(g, f, a);
    } else if (s.type !== 'dash' && s.fx !== 'slam') {
      if (s.type !== 'upper') applyMelee(g, f, a);
      if (s.fx === 'ripple') g.effect('ripple', f.x, FLOOR, f.data.color, .45, { radius: s.range });
      else g.effect(s.fx, f.x + f.facing * 65, f.y - (s.type === 'sweep' ? 22 : 83), f.data.color, .22, { dir: f.facing, radius: s.range * .5 });
    }
    if (a.index >= 2 && !s.super) g.text(s.name, f.x, f.y - 190, f.data.color, .65, 17);
  }

  syncGuitar(g, f, a);
  if (a.t >= s.duration) f.attack = null;
}

export function stepProjectiles(g: FightGame, dt: number): void {
  for (const p of g.projectiles) {
    p.life -= dt;
    p.age += dt;
    // Outbound half, then one turn. The hit list clears so the way back can connect again.
    if (p.fx === 'cucumber' && !p.returned && p.age >= (p.skill.life ?? 2.4) / 2) {
      p.vx = -p.vx;
      p.hit.clear();
      p.returned = true;
    }
    if ((p.fx === 'milk' || p.fx === 'bag') && !p.settled) p.vy += GRAVITY * dt;
    const owner = g.fighters[p.owner];
    if (p.fx === 'chord' && owner && owner.hp > 0) {
      const foe = g.opponents(owner).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (foe) {
        const dx = foe.x - p.x, dy = (foe.y - 83) - p.y;
        const spd = Math.hypot(p.vx, p.vy) || 420;
        const ang = Math.atan2(p.vy, p.vx);
        let diff = Math.atan2(dy, dx) - ang;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
        p.vx = Math.cos(ang + turn) * spd;
        p.vy = Math.sin(ang + turn) * spd;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if ((p.fx === 'milk' || p.fx === 'bag') && !p.settled && p.y >= FLOOR) {
      p.y = FLOOR;
      if (p.fx === 'bag') p.life = 0;
      else {
        p.vx = 0;
        p.vy = 0;
        p.settled = true;
        p.life = 3;
        p.hit.clear();
      }
    }
    p.trail.push({ x: p.x, y: p.y });
    const trailCap = p.fx === 'mutsumi-note' || p.fx === 'chord' ? 14 : 7;
    if (p.trail.length > trailCap) p.trail.shift();
    if (p.settled && p.fx === 'milk' && owner && owner.hp > 0 && Math.abs(owner.x - p.x) < 40 && owner.y >= FLOOR - 1) {
      owner.energy = clamp(owner.energy + 26, 0, 100);
      p.life = 0;
      g.text('+26', owner.x, owner.y - 170, owner.data.color, .6, 18);
    }
    for (const target of g.opponents(owner)) {
      if (!p.settled && p.life > 0 && Math.abs(p.x - target.x) < 38 + p.radius && Math.abs(p.y - (target.y - 83)) < 72) {
        if (hit(g, owner, target, p.skill, { hit: p.hit }, p.x - Math.sign(p.vx) * 40)) {
          g.effect('burst', p.x, p.y, p.color, .3, { radius: p.size * .8 });
          // The cucumber stays up on the way out and only pops on the return hit.
          if (p.fx !== 'cucumber' || p.returned) p.life = 0;
          break;
        }
      }
    }
  }
  // Opposing shots cancel each other.
  for (let i = 0; i < g.projectiles.length; i++) {
    for (let j = i + 1; j < g.projectiles.length; j++) {
      const p = g.projectiles[i], q = g.projectiles[j];
      if (!p.settled && !q.settled && g.isEnemy(g.fighters[p.owner], g.fighters[q.owner]) && p.life > 0 && q.life > 0 && Math.abs(p.x - q.x) < 25 && Math.abs(p.y - q.y) < 27) {
        p.life = q.life = 0;
        g.sparks(p.x, p.y, '#fff', 12);
      }
    }
  }
  g.projectiles = g.projectiles.filter(p => p.life > 0 && p.x > -60 && p.x < W + 60 && p.y < FLOOR + 60);
}
