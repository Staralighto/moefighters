import type { FightGame } from './game.ts';
import { INPUT_BUFFER } from './constants.ts';
import type { Fighter } from './fighter.ts';
import { FLOOR } from './constants.ts';

/* Three tiers, rule based. ponytail: fixed tables, no behaviour tree. Master is the third column. */
const REACTION = [.36, .22, .1];
const REACTION_JITTER = [.15, .15, .04];
const PROJECTILE_SIGHT = [160, 240, 380];
const DEFEND_CHANCE = [.22, .48, .74];
const DODGE_CHANCE = [.25, .55, .8];
/** Bails out of sustained block pressure with a dodge or a jump instead of guard-breaking. */
const ESCAPE_CHANCE = [.35, .6, .85];
/** Jumps up to meet a floated victim with an air normal instead of swinging from the ground. */
const JUGGLE_CHANCE = [.35, .6, .9];
const ATTACK_CHANCE = [.55, .8, .96];
const COMFORT = [100, 88, 64];
const RETREAT = [.12, .1, .02];
/** Chance to peek at a move still in startup. Easier tiers stay 0 and only see an active threat. */
const READ_CHANCE = [0, 0, .68];

export function stepAI(g: FightGame, dt: number): void {
  if (g.mode === 'training') return;
  const hard = g.difficulty;
  for (const f of g.fighters) {
    if (f.controller !== null || f.hp <= 0) continue;
    const o = aiTarget(g, f);
    if (!o) continue;
    const dist = Math.abs(o.x - f.x);
    const dir = (Math.sign(o.x - f.x) || f.facing) as 1 | -1;
    f.ai.wait -= dt;
    f.ai.block = Math.max(0, f.ai.block - dt);
    f.ai.press = Math.max(0, f.ai.press - dt * 2);
    if (f.ai.wait > 0) continue;
    f.ai.wait = REACTION[hard] + g.random() * REACTION_JITTER[hard];
    if (f.stun > 0 || f.knocked > 0 || f.dodge > 0) continue;

    const incoming = g.projectiles.find(p =>
      g.isEnemy(f, g.fighters[p.owner]) && p.life > 0 && (f.x - p.x) * p.vx >= 0 &&
      Math.abs(p.x - f.x) < PROJECTILE_SIGHT[hard] && Math.abs(p.y - (f.y - 80)) < 95);
    const threatened = g.opponents(f).find(v => v.attack && Math.abs(v.x - f.x) < Math.min(240, v.attack.skill.range + 35));
    const grabThreat = threatened?.attack?.skill.type === 'grab';
    const targetAirborne = o.y < FLOOR - 40;
    const floatH = FLOOR - o.y;
    const floated = floatH > 40 && o.stun > 0 && o.knocked <= 0;

    // Grabs cannot be blocked, so the answer is a dodge; a close projectile is also worth a dodge.
    if ((grabThreat || (incoming && dist < 200)) && f.dodgeCd <= 0 && g.random() < DODGE_CHANCE[hard]) {
      f.dodgeRequest = true;
      f.ai.move = 0;
      continue;
    }
    // Held block loses to sustained pressure: the guard breaks and the combo is free.
    // Slip out with a dodge, or jump clear, instead of blocking until broken.
    const pressured = threatened && !grabThreat && (f.guard < 45 || f.ai.press >= 1);
    if (pressured && f.y >= FLOOR - .1 && g.random() < ESCAPE_CHANCE[hard]) {
      f.ai.move = -dir;
      f.ai.facing = dir;
      f.facing = dir;
      if (f.dodgeCd <= 0 && g.random() < .7) f.dodgeRequest = true;
      else f.jumpRequest = true;
      continue;
    }
    if ((incoming || threatened) && !grabThreat && g.random() < DEFEND_CHANCE[hard]) {
      f.ai.block = .18 + g.random() * .24;
      f.ai.press += .34;
      f.ai.move = 0;
      const threatX = incoming?.x ?? threatened?.x ?? o.x;
      f.ai.facing = (Math.sign(threatX - f.x) || dir) as 1 | -1;
      f.facing = f.ai.facing;
      continue;
    }
    // ponytail: reads attack.t, which a player never gets as data. Only answers in the last .22s of startup, so the dodge still covers the hit.
    const startup = g.opponents(f).find(v => {
      const a = v.attack;
      if (!a || a.t >= a.skill.start) return false;
      return a.skill.start - a.t < .22 && Math.abs(v.x - f.x) < a.skill.range + 80;
    });
    if (startup && g.random() < READ_CHANCE[hard]) {
      const grab = startup.attack!.skill.type === 'grab';
      f.ai.move = 0;
      f.ai.facing = (Math.sign(startup.x - f.x) || dir) as 1 | -1;
      f.facing = f.ai.facing;
      if ((grab || g.random() < .5) && f.dodgeCd <= 0) f.dodgeRequest = true;
      else f.ai.block = .34;
      continue;
    }

    f.ai.move = dist > COMFORT[hard] ? dir : g.random() < RETREAT[hard] ? -dir : 0;
    if (incoming && g.random() < .35) { f.jumpRequest = true; continue; }

    // A floated victim is out of reach from the ground: jump up and meet them with an air normal.
    if (floated && g.random() < JUGGLE_CHANCE[hard]) {
      f.ai.facing = dir;
      f.facing = dir;
      f.ai.move = dir;
      if (f.y >= FLOOR - .1 && f.stun <= 0 && !f.attack) f.jumpRequest = true;
      else if (f.y < FLOOR - .1) {
        const airs = [0, 1].filter(i => g.canAttack(f, i) && Math.abs(o.x - f.x) < g.skillFor(f, i).range + 30);
        if (airs.length) {
          const index = airs.includes(1) && g.random() < .5 ? 1 : airs[0];
          if (!f.queue.some(q => q.index === index)) f.queue.push({ index, ttl: INPUT_BUFFER });
        }
      }
      continue;
    }

    const candidates = [0, 1, 2, 3, 4, 5].filter(i => {
      if (!g.canAttack(f, i)) return false;
      const s = g.skillFor(f, i);
      if (s.type === 'sweep' && targetAirborne) return false;
      if (floated && floatH > 110 && f.y >= FLOOR - .1) return s.type === 'projectile';
      return s.type === 'projectile' || dist < s.range + 30;
    });
    if (candidates.length && g.random() < ATTACK_CHANCE[hard]) {
      const ofType = (type: string) => candidates.filter(i => g.skillFor(f, i).type === type);
      const uppers = ofType('upper'), grabs = ofType('grab');
      // Jumpers eat the upper; a blocking opponent invites the grab.
      const pool = targetAirborne && uppers.length ? uppers : o.blocking && grabs.length ? grabs : candidates;
      const index = pool[Math.floor(g.random() * pool.length)];
      if (!f.queue.some(q => q.index === index)) f.queue.push({ index, ttl: INPUT_BUFFER });
    }
    if (dist < 180 && g.random() < .09) f.jumpRequest = true;
  }
}

/** Prefer an enemy no closer teammate is already on, so the CPUs don't pile onto one body. */
function aiTarget(g: FightGame, f: Fighter): Fighter | undefined {
  const foes = g.opponents(f);
  if (foes.length <= 1) return foes[0];
  const mates = g.fighters.filter(m => m !== f && m.team === f.team && m.hp > 0);
  const open = foes.filter(o => {
    const mine = Math.abs(o.x - f.x);
    return !mates.some(m => Math.abs(o.x - m.x) < mine);
  });
  const pool = open.length ? open : foes;
  return pool.slice().sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
}
