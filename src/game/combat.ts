import type { Skill } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import type { FightGame, Projectile } from './game.ts';
import { CONTROLS, FLOOR, GRAVITY, SIDE, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { drumRow } from '../render/clips.ts';

/* Every damage source (melee swing, projectile) funnels through hit(). Guard, combo and energy rules live here once. */

/** Blocking a projectile siphons the attacker's energy, proportional to the shot's full damage. */
const GUARD_DRAIN = .3;

/** 就由我来结束一切: seconds the frenzy lasts and how much faster her ground J/K clock runs. */
const FRENZY_TIME = 8;
const FRENZY_RATE = 1.55;
/** The brown of her hair, used for the frenzy afterimages. */
const FRENZY_TINT = '#a5714f';
/** 就由我来结束一切: the cast shoves everyone inside this radius away, no damage. */
const RESOLVE_REPEL_RANGE = 190;
const RESOLVE_REPEL_PUSH = 540;
/** 求你了: the kneel holds this long after the catch, so the pause reads before the headbutt. */
const ONEGAI_PAUSE = .5;
/** 绊创膏: seconds of no-flinch, the damage cut while it holds, and the shove the plaster gives the people around her. */
const BRACED_TIME = 6;
const BRACED_DAMAGE = .67;
const PLASTER_REPEL_RANGE = 190;
const PLASTER_REPEL_PUSH = 500;
/** 奇独点: the well spawns this far ahead and drags bodies toward its centre. Airborne bodies feel a fraction of it. */
const BLACKHOLE_DIST = 320;
const BLACKHOLE_RADIUS = 150;
const BLACKHOLE_PULL = 200;
/** 诗超绊: the first note clears this radius, so the one-second sing is not free to walk into. */
const POEM_REPEL_RANGE = 220;
const POEM_REPEL_PUSH = 420;

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
  // 绊创膏: the buffed fighter eats the damage without the flinch. Grabs and supers ignore the plaster.
  const braced = !blocked && defender.braced > 0 && !isGrab && !skill.super;
  let damage = skill.damage * attacker.data.power * (defender.data.trait === 'armor' ? .9 : 1) * (braced ? BRACED_DAMAGE : 1);

  if (blocked) {
    const fullHit = damage;
    damage *= skill.super ? .24 : .13;
    defender.guard -= skill.super ? 42 : skill.type === 'heavy' ? 26 : 15;
    defender.stun = .075;
    defender.blockTap = 1;
    defender.energy = clamp(defender.energy + 5, 0, 100);
    attacker.energy = clamp(attacker.energy + 4, 0, 100);
    // 远程反制：挡下投掷物按其伤害削减对方的气，静默结算，不跳字。
    if (skill.type === 'projectile') attacker.energy = clamp(attacker.energy - fullHit * GUARD_DRAIN, 0, 100);
    g.effect('shield', defender.x - dir * 30, defender.y - 78, '#8df0ff', .22, { radius: 65 });
    g.audio.play('block');
    g.text('格挡', defender.x, defender.y - 170, '#91eaff', .35, 16);
    if (defender.guard <= 0) {
      defender.guard = 0;
      defender.stun = .9;
      defender.guardBroken = 1.2;
      defender.blocking = false;
      defender.queue = [];
      defender.jumpRequest = false;
      defender.jumpBuffer = 0;
      defender.dodgeRequest = false;
      defender.dodgeBuffer = 0;
      defender.blockBuffer = 0;
      defender.blockLeft = 0;
      g.text('破防!', defender.x, defender.y - 200, SIDE[0], .8, 30);
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
    } else if (braced) {
      // 绊创膏: the hit lands, nothing flinches. The 7-hit escape below still applies.
      if (attacker.combo >= 7) {
        defender.invuln = .48;
        defender.vx = dir * 470;
        defender.stun = .24;
        g.text('脱离连段', defender.x, defender.y - 195, SIDE[1], .7, 16);
      }
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
      // A super wipes the buffer except combo escapes (恐湖, 轮奏), so the escape can still come out between hits.
      defender.queue = skill.super && defender.data.skills.some(s => s.breakout)
        ? defender.queue.filter(q => defender.data.skills[q.index]?.breakout)
        : [];
      defender.jumpRequest = false;
      defender.jumpBuffer = 0;
      defender.dodgeRequest = false;
      defender.dodgeBuffer = 0;
      defender.blockBuffer = 0;
      defender.blockLeft = 0;
      defender.blocking = false;
      if (skill.fx === 'heart' && !wasRooted) {
        defender.root = 3;
        defender.rootHits = 0;
        defender.dodge = 0;
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = .25;
        holdStill = true;
      } else if (skill.fx === 'shout' && !wasRooted) {
        // 为什么要演奏春日影: rooted for four seconds; the wave itself still shoves a little.
        defender.root = 4;
        defender.rootHits = 0;
        defender.stun = .3;
        g.text('定身!', defender.x, defender.y - 195, '#ffd27a', .6, 20);
      } else if (skill.fx === 'onegai') {
        // The headbutt hurls them out of the kneel: a real launch, and the grab shakes the root off.
        defender.root = 0;
        defender.rootHits = 0;
        holdStill = false;
        defender.vy = -440;
        defender.knocked = .72;
        defender.downTime = 0;
        defender.stun = .5;
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
        defender.vy = skill.type === 'upper' ? -430 : skill.type === 'sweep' ? -140 : -240;
        defender.knocked = .72;
        defender.downTime = 0;
      } else if (skill.type === 'launch') {
        // Float, not knockdown: the defender stays hittable until they land.
        // High enough to meet with a jump attack; the fall itself is slowed in stepFighter.
        defender.vy = -600;
        defender.stun = 1.1;
        g.text('浮空!', defender.x, defender.y - 200, '#ffd27a', .6, 20);
      }
      if (!blocked && skill.air && defender.y < FLOOR - .5) {
        // Juggle: an air normal pops a floating victim slightly upward and locks them briefly.
        // Small enough that the attacker still has to land; combo escapes past 7 hits still break out.
        defender.vy = Math.min(defender.vy, -80);
        defender.stun = Math.max(defender.stun, .4);
      }
      if (attacker.combo >= 7) {
        defender.invuln = .48;
        defender.vx = dir * 470;
        defender.stun = .24;
        g.text('脱离连段', defender.x, defender.y - 195, SIDE[1], .7, 16);
      }
    }
    const rushBonus = attacker.data.trait === 'rush' && attacker.hitCount % 3 === 0 ? 14 : 0;
    attacker.energy = clamp(attacker.energy + (skill.super ? 2 : 9) + rushBonus, 0, 100);
    defender.energy = clamp(defender.energy + 7, 0, 100);
    g.audio.play('hit');
    g.text('-' + Math.round(damage), defender.x + dir * 15, defender.y - 160, skill.super ? SIDE[attacker.team] : '#fff', .65, skill.super ? 30 : 23);
    g.sparks(defender.x - dir * 23, defender.y - 85, attacker.data.color, skill.super ? 36 : 18, skill.super ? 1.6 : 1);
    g.effect('hit', defender.x - dir * 23, defender.y - 85, attacker.data.color, .25, { radius: skill.super ? 90 : 48 });
  }

  defender.hp = clamp(defender.hp - damage, 0, defender.data.hp);
  const knock = skill.fx === 'bag' || skill.fx === 'heart' ? 0
    : skill.fx === 'chord' ? 160
    : skill.fx === 'onegai' ? 360 : skill.fx === 'shout' ? 110
    : skill.fx === 'spin' && !spinFinale(skill, source) ? 0
    : skill.fx === 'ripple' ? 620 : skill.fx === 'slam' ? 120 : blocked ? 75 : skill.knock ?? (skill.type === 'light' ? 95 : skill.super ? 340 : 235);
  if (skill.fx !== 'shove' && defender.invuln <= 0 && !endured) defender.vx = dir * knock * (braced ? .5 : 1);
  if (holdStill) { defender.vx = 0; defender.vy = 0; }
  g.shake = blocked ? 2 : skill.fx === 'slam' ? 14 : skill.fx === 'onegai' ? 10 : skill.super ? 12 : skill.type === 'heavy' ? 7 : 4;
  const juggleHit = !blocked && !!skill.air && defender.y < FLOOR - .5;
  g.hitstop = blocked ? .018 : juggleHit ? .085 : skill.fx === 'slam' ? .09 : skill.fx === 'onegai' ? .08 : skill.super ? .065 : skill.type === 'heavy' ? .065 : .032;
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
  // 奇独点: the well takes a fixed spot ahead and never travels.
  const hole = s.fx === 'blackhole';
  const speed = lob ? lob.vx : (s.speed ?? (s.super ? 650 : 480)) * (f.data.trait === 'focus' ? 1.15 : 1);
  const p: Projectile = {
    owner: f.id,
    x: hole ? clamp(f.x + f.facing * BLACKHOLE_DIST, X_MIN, X_MAX) : f.x + f.facing * 53,
    y: hole ? FLOOR - 95 : f.y - 85 + offsetY,
    vx: hole ? 0 : f.facing * speed,
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

/** 满场: sixteen notes in two full-stage drops. Slots repeat every 8 so each wave spans the stage. */
const DRUM_PER_WAVE = 8;
/** Pause between the two drops, on top of the regular interval. */
const DRUM_GAP = .55;
/** Repel pulse while the super is up: anyone closing in gets bounced, again and again. */
const DRUM_REPEL_EVERY = .3;
const DRUM_REPEL_RANGE = 180;
const DRUM_REPEL_PUSH = 520;

export function drumShotTime(s: Skill, i: number): number {
  const interval = s.interval ?? .1;
  return s.start + i * interval + Math.floor(i / DRUM_PER_WAVE) * DRUM_GAP;
}

/** Notes dropped across the whole stage. vx stays 0; stepProjectiles applies vy. */
function spawnRain(g: FightGame, f: Fighter, a: Attack, index: number): void {
  const s = a.skill;
  const pos = index % DRUM_PER_WAVE;
  const wave = Math.floor(index / DRUM_PER_WAVE);
  const p: Projectile = {
    owner: f.id,
    x: 70 + (pos + .5) * ((W - 140) / DRUM_PER_WAVE),
    y: -24 - (pos % 3) * 40 - wave * 70,
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

/** True once this move will not produce more hits. Supers and the throw cinematics stay committed. */
export function effectSettled(a: Attack): boolean {
  const s = a.skill;
  if (s.super || s.fx === 'shove' || s.fx === 'slam') return false;
  if (s.type === 'dash') return a.t >= s.duration - .08;
  if (s.type === 'upper') return a.t >= s.start + .25;
  const volley = a.burst || s.count || 1;
  if (volley > 1) return a.shots >= volley || (s.fx === 'chord' && a.t >= s.duration - .22);
  return a.emitted;
}

export function updateAttack(g: FightGame, f: Fighter, dt: number): void {
  const a = f.attack;
  if (!a) return;
  const s = a.skill;
  // Frenzy only hurries the ground jab and kick; specials and air normals keep their own clock.
  const rate = f.frenzy > 0 && a.index <= 1 && !s.air ? FRENZY_RATE : 1;
  a.t += dt * rate;
  // 狂化: every attack trails a brown afterimage of whatever pose she is in right now.
  if (f.frenzy > 0 && Math.floor(a.t * 16) !== Math.floor((a.t - dt * rate) * 16)) {
    g.effect('ghost', f.x - f.facing * 20, f.y, f.data.color, .28, { fighter: f.id, alpha: .5, tint: FRENZY_TINT });
  }

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

  // 满场: the kit stays up for the sit; nearby foes are bounced on every pulse. No extra hit.
  const repel = (power: number) => {
    let pushed = false;
    for (const o of g.opponents(f)) {
      if (o.hp <= 0 || o.invuln > 0) continue;
      const dx = o.x - f.x;
      if (Math.abs(dx) < DRUM_REPEL_RANGE) {
        const dir = Math.sign(dx) || f.facing;
        o.vx = dir * power;
        o.stun = Math.max(o.stun, .22);
        pushed = true;
      }
    }
    return pushed;
  };
  if (s.fx === 'drums' && !a.emitted) {
    a.emitted = true;
    repel(DRUM_REPEL_PUSH);
    g.effect('drums', f.x, f.y, f.data.color, s.duration, { dir: f.facing });
  }
  if (s.fx === 'drums' && a.t < s.duration) {
    const prev = Math.floor(Math.max(0, a.t - dt) / DRUM_REPEL_EVERY);
    const cur = Math.floor(a.t / DRUM_REPEL_EVERY);
    if (cur > prev && repel(DRUM_REPEL_PUSH)) {
      g.effect('burst', f.x, f.y - 80, f.data.color, .25, { radius: DRUM_REPEL_RANGE });
    }
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

  // 诗超绊: the first note shoves everyone nearby, so the one-second sing is not free to walk into.
  if (s.fx === 'poem' && a.shots === 0) {
    a.shots = 1;
    for (const o of g.opponents(f)) {
      if (o.hp <= 0 || o.invuln > 0) continue;
      const dx = o.x - f.x;
      if (Math.abs(dx) < POEM_REPEL_RANGE) {
        o.vx = (Math.sign(dx) || f.facing) * POEM_REPEL_PUSH;
        o.stun = Math.max(o.stun, .2);
      }
    }
    g.effect('poem', f.x, f.y - 80, f.data.color, s.start, { radius: POEM_REPEL_RANGE });
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
  // 求你了: a short lunge, she catches a wrist, a frozen beat, the kneel pause, then the headbutt launches.
  if (s.fx === 'onegai' && a.hold < 0 && a.t >= s.start && a.t < s.start + .42) {
    f.x += f.facing * (s.speed ?? 520) * dt;
    if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) {
      g.effect('ghost', f.x - f.facing * 24, f.y, f.data.color, .3, { fighter: f.id, alpha: .35 });
    }
    for (const o of g.opponents(f)) {
      if (o.hp <= 0 || o.invuln > 0) continue;
      const front = (o.x - f.x) * f.facing >= -20;
      if (Math.abs(o.x - f.x) < s.range && front && Math.abs(o.y - f.y) < 112) {
        a.hold = o.id;
        a.tossAt = a.t + ONEGAI_PAUSE;
        // The catch lands with a freeze-frame and a flash, so the pause reads as power, not lag.
        g.hitstop = Math.max(g.hitstop, .09);
        g.effect('grab', o.x, o.y - 80, f.data.color, .3, { radius: 55 });
        o.stun = Math.max(o.stun, .35);
        o.vx = 0;
        o.vy = 0;
        o.knocked = 0;
        o.attack = null;
        o.queue = [];
        break;
      }
    }
  }
  if (s.fx === 'onegai' && a.hold >= 0 && a.tossAt > 0) {
    const o = g.fighters.find(p => p.id === a.hold);
    if (o && o.hp > 0) {
      if (a.t < a.tossAt) {
        // Held by the wrist in front of the kneel, turned to face her.
        o.x = f.x + f.facing * 58;
        o.y = FLOOR;
        o.vx = 0;
        o.vy = 0;
        o.knocked = 0;
        o.stun = Math.max(o.stun, .3);
        o.facing = (-f.facing) as 1 | -1;
      } else {
        hit(g, f, o, s, a);
        g.effect('hit', o.x, o.y - 90, f.data.color, .25, { radius: 60 });
        a.tossAt = 0;
        a.t = Math.max(a.t, s.duration - .3);
      }
    }
  }
  if (s.fx === 'onegai' && a.hold < 0 && a.t >= s.start + .42) a.t = s.duration;
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
    if (s.fx === 'drums') {
      while (a.shots < volley && a.t >= drumShotTime(s, a.shots)) {
        spawnRain(g, f, a, a.shots);
        a.shots++;
      }
    } else while (a.shots < volley && a.t >= s.start + a.shots * (s.interval ?? .14)) {
      if (s.fx === 'chord' && a.shots >= 3 && !chordHeld(g, f)) break;
      // 不甘的演奏: two notes leave the bass at the floor, the second a shade lower than the first.
      const off = s.fx === 'sob' ? (a.shots === 0 ? 45 : 70) : (a.shots % 3 - 1) * 15;
      spawnShot(g, f, a, off, a.shots);
      a.shots++;
    }
    if (s.fx === 'chord' && a.shots >= 3 && !chordHeld(g, f) && a.t < s.duration - .22) a.t = s.duration - .22;
    // 为什么要演奏春日影: the last wave carries the whole super, so the moment it leaves she is free to act.
    if (s.fx === 'shout' && a.shots >= volley) a.t = s.duration;
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
    if (s.fx === 'resolve') {
      // 就由我来结束一切: no strike, just the mask dropping. The ripple shoves everyone away; the frenzy clock starts here.
      f.frenzy = FRENZY_TIME;
      g.effect('resolve', f.x, f.y - 80, f.data.color, .75, { radius: RESOLVE_REPEL_RANGE });
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) < RESOLVE_REPEL_RANGE) {
          o.vx = (Math.sign(dx) || f.facing) * RESOLVE_REPEL_PUSH;
          o.stun = Math.max(o.stun, .22);
        }
      }
    } else if (s.fx === 'plaster') {
      // 绊创膏: the plaster on her chest pulses three translucent copies of itself, then holds.
      f.braced = BRACED_TIME;
      g.effect('plaster', f.x, f.y - 80, f.data.color, 1.2, { dir: f.facing });
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) < PLASTER_REPEL_RANGE) {
          o.vx = (Math.sign(dx) || f.facing) * PLASTER_REPEL_PUSH;
          o.stun = Math.max(o.stun, .2);
        }
      }
    } else if (s.fx === 'poem') {
      // 诗超绊: the sing lands, and a teammate takes the stage beside her.
      g.summonAlly(f);
    } else if (s.type === 'projectile') {
      spawnShot(g, f, a);
    } else if (s.type !== 'dash' && s.fx !== 'slam' && s.fx !== 'onegai') {
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
    if (p.fx === 'blackhole') {
      // 奇独点: a standing well. It drags bodies toward the centre and ticks the skill's damage on its interval.
      const owner = g.fighterById(p.owner);
      if (!owner) continue;
      for (const o of g.opponents(owner)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = p.x - o.x;
        if (Math.abs(dx) < BLACKHOLE_RADIUS) {
          o.vx = Math.sign(dx) * BLACKHOLE_PULL * (o.y < FLOOR - .5 ? .4 : 1);
        }
      }
      const tick = Math.floor(p.age / (p.skill.interval ?? .2));
      if (tick !== p.ticked) {
        p.ticked = tick;
        p.hit.clear();
        for (const o of g.opponents(owner)) {
          if (Math.abs(o.x - p.x) < BLACKHOLE_RADIUS && Math.abs(o.y - 83 - p.y) < 72) {
            hit(g, owner, o, p.skill, { hit: p.hit }, p.x);
          }
        }
      }
      continue;
    }
    // Outbound half, then one turn. The hit list clears so the way back can connect again.
    if (p.fx === 'cucumber' && !p.returned && p.age >= (p.skill.life ?? 2.4) / 2) {
      p.vx = -p.vx;
      p.hit.clear();
      p.returned = true;
    }
    if ((p.fx === 'milk' || p.fx === 'bag') && !p.settled) p.vy += GRAVITY * dt;
    const owner = g.fighterById(p.owner);
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
    const trailCap = p.fx === 'mutsumi-note' || p.fx === 'chord' || p.fx === 'sob' ? 14 : 7;
    if (p.trail.length > trailCap) p.trail.shift();
    if (p.settled && p.fx === 'milk' && owner && owner.hp > 0 && Math.abs(owner.x - p.x) < 40 && owner.y >= FLOOR - 1) {
      owner.energy = clamp(owner.energy + 26, 0, 100);
      p.life = 0;
      g.text('+26', owner.x, owner.y - 170, owner.data.color, .6, 18);
    }
    if (owner) for (const target of g.opponents(owner)) {
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
      // Shots die on each other; the well is a zone, so shots pass through it.
      if (!p.settled && !q.settled && p.fx !== 'blackhole' && q.fx !== 'blackhole' && g.isEnemy(g.fighterById(p.owner), g.fighterById(q.owner)) && p.life > 0 && q.life > 0 && Math.abs(p.x - q.x) < 25 && Math.abs(p.y - q.y) < 27) {
        p.life = q.life = 0;
        g.sparks(p.x, p.y, '#fff', 12);
      }
    }
  }
  g.projectiles = g.projectiles.filter(p => p.life > 0 && p.x > -60 && p.x < W + 60 && p.y < FLOOR + 60);
}
