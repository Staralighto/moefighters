import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { FLOOR, W, clamp } from './constants.ts';

/* Every damage source (melee swing, projectile) funnels through hit(). Guard, combo and energy rules live here once. */

export interface HitSource { hit: Set<number> }

export function hit(g: FightGame, attacker: Fighter, defender: Fighter, skill: Skill, source: HitSource, originX = attacker.x): boolean {
  if (!g.isEnemy(attacker, defender) || defender.hp <= 0 || defender.invuln > 0 || source.hit.has(defender.id)) return false;
  source.hit.add(defender.id);
  const dir = defender.x >= originX ? 1 : -1;
  const inFront = defender.facing === -dir;
  const isGrab = skill.type === 'grab';
  const blocked = defender.blocking && inFront && defender.guard > 0 && !isGrab;
  // Super armour: an endure move in wind-up eats one strike. Grabs and supers still go through.
  const armour = defender.attack;
  const endured = !blocked && !!armour && armour.endure > 0 && armour.t < armour.skill.start && !isGrab && !skill.super;
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
      armour.endure--;
      g.text('霸体', defender.x, defender.y - 195, '#ffd27a', .5, 18);
    } else {
      defender.stun = skill.type === 'light' ? .28 : skill.super ? .42 : .37;
      defender.attack = null;
      defender.queue = [];
      defender.blocking = false;
      if (isGrab || skill.super || skill.type === 'upper' || skill.type === 'sweep') {
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
  if (defender.invuln <= 0 && !endured) defender.vx = dir * (blocked ? 75 : skill.type === 'light' ? 95 : skill.super ? 340 : 235);
  g.shake = blocked ? 2 : skill.super ? 12 : skill.type === 'heavy' ? 7 : 4;
  g.hitstop = blocked ? .018 : skill.super ? .065 : skill.type === 'heavy' ? .065 : .032;
  return true;
}

export function applyMelee(g: FightGame, f: Fighter, a: Attack): void {
  if (f.hp <= 0 || f.stun > 0) return;
  const s = a.skill;
  const targets = g.opponents(f).sort((p, q) => Math.abs(p.x - f.x) - Math.abs(q.x - f.x));
  for (const o of targets) {
    const dist = Math.abs(o.x - f.x);
    const dy = Math.abs(o.y - f.y);
    const radial = s.type === 'grab';
    const front = (o.x - f.x) * f.facing >= -20;
    // Sweeps only touch grounded targets; air normals and uppers reach further vertically.
    const height = s.type === 'sweep' ? o.y > FLOOR - 40 : dy < (s.super ? 170 : s.air || s.type === 'upper' ? 150 : 112);
    if (dist < s.range && (radial || front) && height) {
      hit(g, f, o, s, a);
      if (f.hp <= 0 || f.stun > 0 || f.attack !== a || (radial && a.hit.size)) break;
    }
  }
}

export function spawnShot(g: FightGame, f: Fighter, a: Attack, offsetY = 0): Projectile {
  const s = a.skill;
  const speed = (s.speed ?? (s.super ? 650 : 480)) * (f.data.trait === 'focus' ? 1.15 : 1);
  const p: Projectile = {
    owner: f.id,
    x: f.x + f.facing * 53,
    y: f.y - 85 + offsetY,
    vx: f.facing * speed,
    vy: 0,
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

export function updateAttack(g: FightGame, f: Fighter, dt: number): void {
  const a = f.attack;
  if (!a) return;
  const s = a.skill;
  a.t += dt;

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
    f.x += f.facing * (s.super ? 820 : 580) * dt;
    applyMelee(g, f, a);
    if (Math.floor(a.t * 30) % 3 === 0) g.effect('ghost', f.x - f.facing * 18, f.y, f.data.color, .18, { fighter: f.id, alpha: .3 });
  }
  // The rising fist stays live for a while so it catches jumpers at any height.
  if (s.type === 'upper' && a.t >= s.start && a.t < s.start + .25) applyMelee(g, f, a);

  if (s.type === 'projectile' && (s.count ?? 1) > 1) {
    while (a.shots < (s.count ?? 1) && a.t >= s.start + a.shots * (s.interval ?? .14)) {
      spawnShot(g, f, a, (a.shots % 3 - 1) * 15);
      a.shots++;
      g.audio.play('cast');
    }
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
      if (s.fx !== 'mortis') g.effect(s.fx, f.x + f.facing * swing.x, f.y + swing.y, f.data.color, .18, { dir: f.facing * swing.dir, radius: s.range * .34 });
      a.shots++;
    }
  } else if (!a.emitted && a.t >= s.start) {
    a.emitted = true;
    if (s.type === 'projectile') {
      spawnShot(g, f, a);
    } else if (s.type !== 'dash') {
      if (s.type !== 'upper') applyMelee(g, f, a);
      g.effect(s.fx, f.x + f.facing * 65, f.y - (s.type === 'sweep' ? 22 : 83), f.data.color, .22, { dir: f.facing, radius: s.range * .5 });
    }
    if (a.index >= 2 && !s.super) g.text(s.name, f.x, f.y - 190, f.data.color, .65, 17);
  }

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
    p.x += p.vx * dt;
    p.trail.push({ x: p.x, y: p.y });
    const trailCap = p.fx === 'mutsumi-note' ? 14 : 7;
    if (p.trail.length > trailCap) p.trail.shift();
    const owner = g.fighters[p.owner];
    for (const target of g.opponents(owner)) {
      if (p.life > 0 && Math.abs(p.x - target.x) < 38 + p.radius && Math.abs(p.y - (target.y - 83)) < 72) {
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
      if (g.isEnemy(g.fighters[p.owner], g.fighters[q.owner]) && p.life > 0 && q.life > 0 && Math.abs(p.x - q.x) < 25 && Math.abs(p.y - q.y) < 27) {
        p.life = q.life = 0;
        g.sparks(p.x, p.y, '#fff', 12);
      }
    }
  }
  g.projectiles = g.projectiles.filter(p => p.life > 0 && p.x > -60 && p.x < W + 60 && p.y < FLOOR + 60);
}
