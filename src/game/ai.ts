import type { FightGame } from './game.ts';
import { FLOOR } from './constants.ts';

/* Two difficulty tiers, rule based. ponytail: fixed reaction tables, no behaviour tree; add a third column per array for a harder CPU. */
const REACTION = [.36, .22];
const REACTION_JITTER = [.15, .15];
const PROJECTILE_SIGHT = [160, 240];
const DEFEND_CHANCE = [.22, .48];
const DODGE_CHANCE = [.25, .55];
const ATTACK_CHANCE = [.55, .8];

export function stepAI(g: FightGame, dt: number): void {
  if (g.mode === 'training') return;
  const hard = g.difficulty;
  for (const f of g.fighters) {
    if (f.controller !== null || f.hp <= 0) continue;
    const o = g.targetFor(f);
    if (!o) continue;
    const dist = Math.abs(o.x - f.x);
    const dir = (Math.sign(o.x - f.x) || f.facing) as 1 | -1;
    f.ai.wait -= dt;
    f.ai.block = Math.max(0, f.ai.block - dt);
    if (f.ai.wait > 0) continue;
    f.ai.wait = REACTION[hard] + g.random() * REACTION_JITTER[hard];
    if (f.stun > 0 || f.knocked > 0 || f.dodge > 0) continue;

    const incoming = g.projectiles.find(p =>
      g.isEnemy(f, g.fighters[p.owner]) && p.life > 0 && (f.x - p.x) * p.vx >= 0 &&
      Math.abs(p.x - f.x) < PROJECTILE_SIGHT[hard] && Math.abs(p.y - (f.y - 80)) < 95);
    const threatened = g.opponents(f).find(v => v.attack && Math.abs(v.x - f.x) < Math.min(240, v.attack.skill.range + 35));
    const grabThreat = threatened?.attack?.skill.type === 'grab';
    const targetAirborne = o.y < FLOOR - 40;

    // Grabs cannot be blocked, so the answer is a dodge; a close projectile is also worth a dodge.
    if ((grabThreat || (incoming && dist < 200)) && f.dodgeCd <= 0 && g.random() < DODGE_CHANCE[hard]) {
      f.dodgeRequest = true;
      f.ai.move = 0;
      continue;
    }
    if ((incoming || threatened) && !grabThreat && g.random() < DEFEND_CHANCE[hard]) {
      f.ai.block = .18 + g.random() * .24;
      f.ai.move = 0;
      const threatX = incoming?.x ?? threatened?.x ?? o.x;
      f.ai.facing = (Math.sign(threatX - f.x) || dir) as 1 | -1;
      f.facing = f.ai.facing;
      continue;
    }

    f.ai.move = dist > 100 ? dir : g.random() < .12 ? -dir : 0;
    if (incoming && g.random() < .35) { f.jumpRequest = true; continue; }

    const candidates = [0, 1, 2, 3, 4, 5].filter(i => {
      if (!g.canAttack(f, i)) return false;
      const s = g.skillFor(f, i);
      if (s.type === 'sweep' && targetAirborne) return false;
      return s.type === 'projectile' || dist < s.range + 30;
    });
    if (candidates.length && g.random() < ATTACK_CHANCE[hard]) {
      const ofType = (type: string) => candidates.filter(i => g.skillFor(f, i).type === type);
      const uppers = ofType('upper'), grabs = ofType('grab');
      // Jumpers eat the upper; a blocking opponent invites the grab.
      const pool = targetAirborne && uppers.length ? uppers : o.blocking && grabs.length ? grabs : candidates;
      const index = pool[Math.floor(g.random() * pool.length)];
      if (!f.queue.some(q => q.index === index)) f.queue.push({ index, ttl: .18 });
    }
    if (dist < 180 && g.random() < .09) f.jumpRequest = true;
  }
}
