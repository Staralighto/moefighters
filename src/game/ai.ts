import type { FightGame } from './game.ts';
import { FLOOR, INPUT_BUFFER, X_MAX, X_MIN } from './constants.ts';
import type { Fighter } from './fighter.ts';
import { has } from './mods.ts';

/* Three tiers, rule based. ponytail: fixed tables, no behaviour tree. Master is the third column.
   The extra brain is one clock check (MBAACC wakeup timing, MUGEN punish): no search, no tree. */
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
/** Jab a swing that already came out. Takes the turn without an invincible super. */
const PUNISH = [.2, .62, .94];
/** Jump toward center on a corner gap. A back-dodge from here only slides into the wall. */
const CORNER_OUT = [.35, .72, .92];
/** Super a knocked opponent. */
const SUPER_OKI = [0, .4, .75];
/** Super while actually under pressure. Easy rarely, master usually. One roll, not a mash. */
const SUPER_PANIC = [.15, .5, .8];
const WALL = 72;
/** Cast invuln on every super (game.ts). Dash supers overwrite it down to .42. */
const SUPER_INVULN = .64;
/** One decision, two slots in the priority list. `now` beats a meaty; `later` waits out the jab and the corner jump. */
type SuperWhen = 'now' | 'later' | 'no';

/** Swing has connected (or the shot has left) and no further hit is scheduled.
 *  ponytail: inferred from start/count/type, not a real active-frame field.
 *  Ceiling: a lingering custom hitbox still looks punishable. Upgrade path is an active window on Skill. */
function recovering(o: Fighter): boolean {
  const a = o.attack;
  if (!a || a.t < a.skill.start) return false;
  const s = a.skill;
  const n = a.burst || s.count || 1;
  if (n > 1 && a.shots < n) return false;
  if (s.type === 'dash' && a.t < s.duration - .08) return false;
  if (s.type === 'upper' && a.t < s.start + .25) return false;
  return a.emitted || s.type === 'projectile';
}

function pushAttack(f: Fighter, index: number): void {
  if (!f.queue.some(q => q.index === index)) f.queue.push({ index, ttl: INPUT_BUFFER });
}

function buffLive(f: Fighter, fx: string): boolean {
  if (fx === 'dream' || fx === 'declaration') return f.frenzy > 0;
  if (fx === 'king') return !!f.king;
  if (fx === 'box') return f.box > 0;
  if (fx === 'feast') return f.feast > 0;
  if (fx === 'infinite') return f.debt > 0;
  if (fx === 'black-shout') return f.shout > 0;
  if (fx === 'flash') return has(f, 'nocd');
  return false;
}

function roll(g: FightGame, p: number): boolean {
  return p > 0 && g.random() < p;
}

function useSuper(f: Fighter, dir: 1 | -1): void {
  f.ai.facing = dir;
  f.facing = dir;
  f.ai.move = dir;
  pushAttack(f, 5);
}

/** One lookup, one roll. Special fx first; everyone else is type + range + whether cast invuln covers startup.
 *  ponytail: no per-character function. A new super needs a case only when its fx lies about type or range.
 *  `pressed` is a live threat, low hp, or a dying guard. `safe` means nobody is swinging at us. */
function superWhen(g: FightGame, f: Fighter, o: Fighter, dist: number, hard: number, pressed: boolean, safe: boolean): SuperWhen {
  if (!g.canAttack(f, 5)) return 'no';
  const s = g.skillFor(f, 5);
  const fx = s.fx;
  if (buffLive(f, fx)) return 'no';
  const panic = SUPER_PANIC[hard];
  switch (fx) {
    case 'fuga':
      // The blast hurts her. Only from outside it, and never into a meaty.
      return safe && dist > 240 && dist < 720 && roll(g, .5) ? 'later' : 'no';
    case 'world':
      // Time stop is the cast itself, so the 1.2s windup never plays out.
      if (!(pressed || (safe && hard > 0))) return 'no';
      return roll(g, pressed ? panic : .4) ? (pressed ? 'now' : 'later') : 'no';
    case 'poem':
    case 'wish':
      // The payoff lands after the 0.64s invuln.
      return safe && hard > 0 && roll(g, .45) ? 'later' : 'no';
    case 'drums':
      // The repel starts the same frame as the move.
      if (pressed) return roll(g, panic) ? 'now' : 'no';
      return safe && dist > 180 && roll(g, .4) ? 'later' : 'no';
    case 'black-shout':
      // Ends by taking 10% max hp.
      if (f.hp < f.data.hp * .4) return 'no';
      return pressed && roll(g, panic) ? 'now' : 'no';
    case 'dream':
    case 'king':
    case 'box':
    case 'feast':
    case 'infinite':
    case 'flash':
    case 'declaration':
      return pressed && roll(g, panic) ? 'now' : 'no';
    default: {
      const cover = s.type === 'dash' ? .42 : SUPER_INVULN;
      const inRange = dist < (s.range > 0 ? s.range : 180) + 36;
      if (s.start > cover) return safe && hard > 0 && roll(g, .35) ? 'later' : 'no';
      if (s.type === 'projectile') {
        if (pressed && dist < 220) return roll(g, panic) ? 'now' : 'no';
        const far = safe && dist > 150 && dist < Math.max(s.range, 480);
        return far && roll(g, hard === 2 ? .55 : .28) ? 'later' : 'no';
      }
      if (pressed && inRange) return roll(g, panic) ? 'now' : 'no';
      return safe && o.knocked > 0 && inRange && roll(g, SUPER_OKI[hard]) ? 'later' : 'no';
    }
  }
}

export function stepAI(g: FightGame, dt: number): void {
  if (g.mode === 'training') return;
  for (const f of g.fighters) {
    if (f.controller !== null || f.hp <= 0 || f.echo) continue;
    // 诗超绊 teammates always run the master brain, whatever the match difficulty is.
    const hard = f.minion ? 2 : g.difficulty;
    const o = aiTarget(g, f);
    if (!o) continue;
    f.ai.block = Math.max(0, f.ai.block - dt);
    f.ai.press = Math.max(0, f.ai.press - dt * 2);
    // Hitstun, knockdown, dodge. Easy keeps paying reaction after it ends.
    // Standard and master bank the first free frame: a true combo refreshes stun
    // before that frame exists, so this does not cut a real string.
    const locked = f.stun > 0 || f.knocked > 0 || f.dodge > 0;
    if (locked) {
      if (hard > 0) f.ai.wait = 0;
      else {
        f.ai.wait -= dt;
        if (f.ai.wait <= 0) f.ai.wait = REACTION[0] + g.random() * REACTION_JITTER[0];
      }
      continue;
    }
    f.ai.wait -= dt;
    if (f.ai.wait > 0) continue;
    f.ai.wait = REACTION[hard] + g.random() * REACTION_JITTER[hard];

    const dist = Math.abs(o.x - f.x);
    const dir = (Math.sign(o.x - f.x) || f.facing) as 1 | -1;
    const wall = f.x <= X_MIN + WALL ? -1 : f.x >= X_MAX - WALL ? 1 : 0;
    const pinned = wall !== 0 && (o.x - f.x) * -wall > 0 && f.y >= FLOOR - .1;
    const out: -1 | 1 = pinned ? (wall === -1 ? 1 : -1) : dir;
    const incoming = g.projectiles.find(p =>
      g.isEnemy(f, g.fighterById(p.owner)) && p.life > 0 && (f.x - p.x) * p.vx >= 0 &&
      Math.abs(p.x - f.x) < PROJECTILE_SIGHT[hard] && Math.abs(p.y - (f.y - 80)) < 95);
    // A swing that already came out is not a threat — it is a turn to take. See recovering().
    const threatened = g.opponents(f).find(v => v.attack && !recovering(v) && Math.abs(v.x - f.x) < Math.min(240, v.attack.skill.range + 35));
    const grabThreat = threatened?.attack?.skill.type === 'grab';
    const targetAirborne = o.y < FLOOR - 40;
    const floatH = FLOOR - o.y;
    const floated = floatH > 40 && o.stun > 0 && o.knocked <= 0;
    // Low hp counts as pressed, but a safe cast (summon, far blast) stays in the `later` slot
    // so it is not thrown away just because the bar is low.
    const pressed = !!threatened || f.hp * 2 < f.data.hp || f.guard < 45;
    const safe = !threatened && !incoming;
    const slot = superWhen(g, f, o, dist, hard, pressed, safe);
    if (slot === 'now') { useSuper(f, dir); continue; }

    // Grabs cannot be blocked. Out in the open the answer is a dodge; on the wall a dodge
    // travels backward, into the wall, so jump over the grab instead.
    if ((grabThreat || (incoming && dist < 200)) && f.dodgeCd <= 0 && g.random() < DODGE_CHANCE[hard]) {
      if (pinned) { f.ai.move = out; f.ai.facing = dir; f.facing = dir; f.jumpRequest = true; }
      else { f.dodgeRequest = true; f.ai.move = 0; }
      continue;
    }
    // Held block loses to sustained pressure: the guard breaks and the combo is free.
    // Slip out with a dodge, or jump clear, instead of blocking until broken.
    // Pinned: the open side is through the opponent. Backing up is the wall.
    const pressured = threatened && !grabThreat && (f.guard < 45 || f.ai.press >= 1);
    if (pressured && f.y >= FLOOR - .1 && g.random() < ESCAPE_CHANCE[hard]) {
      f.ai.facing = dir;
      f.facing = dir;
      if (pinned) { f.ai.move = out; f.jumpRequest = true; }
      else {
        f.ai.move = -dir;
        if (f.dodgeCd <= 0 && g.random() < .7) f.dodgeRequest = true;
        else f.jumpRequest = true;
      }
      continue;
    }
    if ((incoming || threatened) && !grabThreat && g.random() < (pinned ? Math.min(1, DEFEND_CHANCE[hard] + .2) : DEFEND_CHANCE[hard])) {
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
      if (pinned && !grab) f.ai.block = .34;
      else if ((grab || g.random() < .5) && f.dodgeCd <= 0) f.dodgeRequest = true;
      else f.ai.block = .34;
      continue;
    }

    // Opponent's move already came out and they are still stuck in it: jab.
    // This is the interrupt that used to be "wait until the invuln pop, or super through it".
    if (recovering(o) && dist < g.skillFor(f, 0).range + 40 && g.canAttack(f, 0) && g.random() < PUNISH[hard]) {
      f.ai.facing = dir;
      f.facing = dir;
      f.ai.move = pinned ? out : dir;
      pushAttack(f, 0);
      continue;
    }
    // Corner before a calm super, so a full meter does not replace the jump-out.
    if (pinned && dist < 280 && g.random() < CORNER_OUT[hard]) {
      f.ai.facing = dir;
      f.facing = dir;
      f.ai.move = out;
      f.jumpRequest = true;
      continue;
    }
    if (slot === 'later') { useSuper(f, dir); continue; }

    const retreat = g.random() < RETREAT[hard] ? -dir : 0;
    f.ai.move = dist > COMFORT[hard] ? dir : retreat;
    if (pinned && f.ai.move !== out) f.ai.move = out;
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
          pushAttack(f, index);
        }
      }
      continue;
    }

    // Super and breakout stays out of the mash pool: those are the invuln buttons.
    const candidates = [0, 1, 2, 3, 4].filter(i => {
      if (!g.canAttack(f, i)) return false;
      const s = g.skillFor(f, i);
      if (s.breakout || s.invuln) return false;
      if (s.type === 'sweep' && targetAirborne) return false;
      if (floated && floatH > 110 && f.y >= FLOOR - .1) return s.type === 'projectile';
      return s.type === 'projectile' || dist < s.range + 30;
    });
    if (candidates.length && g.random() < ATTACK_CHANCE[hard]) {
      const ofType = (type: string) => candidates.filter(i => g.skillFor(f, i).type === type);
      const uppers = ofType('upper'), grabs = ofType('grab');
      // Jumpers eat the upper; a blocking opponent invites the grab.
      const pool = targetAirborne && uppers.length ? uppers : o.blocking && grabs.length ? grabs : candidates;
      pushAttack(f, pool[Math.floor(g.random() * pool.length)]);
    }
    if (dist < 180 && !pinned && g.random() < .09) f.jumpRequest = true;
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
