import type { AnimState, Attack, Fighter } from './fighter.ts';
import { ATTACK_STATES } from './fighter.ts';
import { FLOOR, clamp } from './constants.ts';

/* Animation state is derived from combat state, never stored separately by the renderer. */
export function stateFor(f: Fighter): AnimState {
  if (f.hp <= 0) return 'ko';
  if (f.knocked > 0) return 'down';
  if (f.stun > 0 && !f.blocking) return 'hurt';
  if (f.dodge > 0) return 'dodge';
  if (f.attack) return ATTACK_STATES[f.attack.index];
  if (f.blocking) return 'block';
  if (f.y < FLOOR - .5 || f.landing > 0) return 'jump';
  if (f.walk > 0) return 'run';
  return 'idle';
}

export function advanceAnim(f: Fighter, dt: number): void {
  const next = stateFor(f);
  const serial = f.attack?.serial ?? 0;
  if (f.animState !== next || f.animSerial !== serial) {
    f.animState = next;
    f.animSerial = serial;
    f.animTime = 0;
  } else {
    f.animTime += dt;
  }
}

export type AttackPhase = { phase: 'windup' | 'active' | 'recover'; k: number };

/** Splits a move into wind-up / impact / recovery so any view (geometry or sprite) lines up with skill.start. */
export function attackPhase(a: Attack): AttackPhase {
  const s = a.skill;
  if (a.t < s.start) return { phase: 'windup', k: a.t / Math.max(.03, s.start) };
  const activeLen = Math.min(.1, (s.duration - s.start) * .4);
  if (a.t < s.start + activeLen) return { phase: 'active', k: (a.t - s.start) / activeLen };
  const recoverLen = Math.max(.05, s.duration - s.start - activeLen);
  return { phase: 'recover', k: clamp((a.t - s.start - activeLen) / recoverLen, 0, 1) };
}
