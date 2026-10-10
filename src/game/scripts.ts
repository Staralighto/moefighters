import type { Skill } from '../data/types.ts';
import type { Attack } from './fighter.ts';
import type { Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { VOW_BEATS, vowBeatTime } from '../render/clips.ts';
import { applyMelee, hit, retainEscape, withFinale } from './combat.ts';

/** 和灯在一起的话: the last beat throws them. The pin itself is the same shape as stepHold. */
const VOW_LAUNCH = 700;

export interface MoveScript {
  /** Per attack-clock tick. Return true when this script owns the move for the frame. */
  update?: (g: FightGame, f: Fighter, a: Attack, dt: number) => boolean | void;
  /** Projectile tick. Return true when motion and hits were handled here. */
  shot?: (g: FightGame, p: import('./game.ts').Projectile, dt: number) => boolean;
  /** Clean-hit pose. Return 'still' to pin, true when the pose was applied. dir is the knockback sign. */
  hit?: (g: FightGame, attacker: Fighter, defender: Fighter, source: Attack | { hit: Set<number> }, dir: number) => boolean | 'still';
  /** On the cast, before the attack clock starts. */
  cast?: (g: FightGame, f: Fighter) => void;
  /** This hit places the body itself, so the kernel does not add knockback. */
  noKnock?: boolean;
  /** The cast freezes the match until the move ends. */
  timeStop?: boolean;
  /** Only one live projectile of this move. */
  oneShot?: boolean;
  /** Shot count for a cast that scales with state (悲鸣). */
  burst?: (f: Fighter) => number;
  /** Stay committed until the move ends (推落、信用). */
  commit?: boolean;
  /** While this pose is up, hits do not drop it (全力碰撞). Full damage and knockback. Grabs and supers still do. */
  poise?: boolean;
  /** Once the payload is away, the pose is done (剪、火的故事). */
  freeWhenEmitted?: boolean;
  /** Seconds before the end that a released hold counts as finished. */
  settle?: number;
  /** From this shot on, the key has to stay down. */
  holdFrom?: number;
  /** Snap the clock this many seconds before the end when the key is up. */
  release?: number;
  /** The last shot of a volley ends the pose immediately. */
  freeOnLast?: boolean;
  /** This projectile volley is not the generic rain. */
  skipVolley?: boolean;
  /** This counted move is not the generic swing loop. */
  skipCount?: boolean;
  /** No generic melee stamp on the active frame. */
  noMelee?: boolean;
  /** Dash travel is the script's, not the stock line. */
  customDash?: boolean;
  /** One mid-dash facing change. */
  flip?: boolean;
  /** Spaced ghost stamps instead of the stock dash smear. */
  sparseGhost?: boolean;
  /** Off-screen centre still counts as on stage. */
  wide?: boolean;
  /** Trail length. `speed` stretches with the juggle ball. */
  trail?: number | 'speed';
  /** Body effect kept on the fighter for the whole pose (strum / spin). */
  guitar?: string;
  /** The body is not drawn during the warp. */
  hidden?: boolean;
  /** Outbound half passes through bodies, then the shot turns around. */
  boomerang?: boolean;
  /** Vertical overlap against the chest. Unset keeps the stock 72. */
  hitY?: number;
  /** Horn the moment the shot is born. */
  whistle?: boolean;
  /** How spawnShot places the body. */
  spawn?: 'milk' | 'bag' | 'well' | 'zone' | 'juggle';
  /** Homing before the step. */
  home?: 'flat' | 'seek';
  /** Counted string uses the skill's own count (剪). */
  ownCount?: boolean;
  /** Effect stamped on each tick of that string. */
  mark?: string;
  /** The zone swells while it overlaps a body (九字真言). */
  swell?: boolean;
  /** Overlap is the seal, not a one-shot touch. */
  seal?: boolean;
  /** A finished pose leaves the echo. */
  echo?: boolean;
  /** Counted melee stamps no swing graphic (墨缇丝、吉他激奏's sibling). */
  noStamp?: boolean;
  /** Each swing of a counted melee leaves a ghost. */
  ghostSwing?: boolean;
  /** Vertical offsets for the generic volley, indexed by shot. */
  noteOff?: number[];
  /** Extra cooldown pasted on after the opening swing. */
  cd?: { tap: number; max: number; waves: number };
  /** Replace the generic multi-shot spawn. */
  volley?: (g: FightGame, f: Fighter, a: Attack) => void;
  /** One swing of a counted melee. `s` is the skill as the frame began. */
  swing?: (g: FightGame, f: Fighter, a: Attack, s: Skill) => void;
  /** The active frame, instead of melee or a plain shot. */
  emit?: (g: FightGame, f: Fighter, a: Attack) => void;
  /** Burst graphic for a generic melee active frame. */
  flash?: (g: FightGame, f: Fighter, a: Attack) => void;
  /** Per-cast copy of the skill (甜甜圈). */
  variant?: (g: FightGame, s: Skill) => Skill;
  /** Pinball off the stage walls after the step (抛球杂耍). */
  bounce?: boolean;
  /** After integration. Return true to skip landing and touch. */
  after?: (g: FightGame, p: import('./game.ts').Projectile, dt: number) => boolean;
  /** Extra graphic when this shot connects. */
  pulse?: (g: FightGame, p: import('./game.ts').Projectile, target: Fighter) => void;
  /** Rolled once when the shot is born. 0 leaves the art as drawn (幻海). */
  hue?: (g: FightGame) => number;
}

/**
 * Keyed by fx, which stays the render key. Rules live here once src/game stops branching on the name.
 * ponytail: the registry is a plain record. A second lookup table would only exist to hide this one.
 */
export const SCRIPTS: Record<string, MoveScript> = {
  fries: {
    flash(g, f) {
      // Must sit on the FRIES_H hand of scripts/hina-sheet.ts at a 181 px body; move both together.
      g.effect('fries', f.x + f.facing * 55, f.y - 136, '#ffe14a', .6, { dir: f.facing });
    },
  },
  // The shared swing ring puts the third chop behind the body. These three stay in front.
  lulu: {
    swing(g, f, a, s) {
      const prev = a.skill;
      a.skill = withFinale(s, a.shots >= (s.count ?? 1) - 1);
      applyMelee(g, f, a);
      a.skill = prev;
      const x = 110 + a.shots * 40;
      const y = a.shots === 1 ? -110 : -78;
      g.effect('slash', f.x + f.facing * x, f.y + y, f.data.color, .18, { dir: f.facing, radius: 48 });
    },
  },
  vow: {
    update(g, f, a, dt) {
      const s = a.skill;
      a.emitted = true;
      if (a.hold < 0 && a.t >= s.start && a.t < s.start + .45) {
        f.x += f.facing * (s.speed ?? 500) * dt;
        if (Math.floor(a.t * 16) !== Math.floor((a.t - dt) * 16)) {
          g.effect('ghost', f.x - f.facing * 24, f.y, f.data.color, .3, { fighter: f.id, alpha: .35 });
        }
        for (const o of g.opponents(f)) {
          if (o.hp <= 0 || o.invuln > 0) continue;
          const front = (o.x - f.x) * f.facing >= -20;
          if (Math.abs(o.x - f.x) < s.range && front && Math.abs(o.y - f.y) < 112) {
            a.hold = o.id;
            a.tossAt = a.t;
            g.hitstop = Math.max(g.hitstop, .09);
            g.effect('grab', o.x, o.y - 80, f.data.color, .3, { radius: 55 });
            const line = f.hp < f.data.hp * .3 ? '反正我就是做不到像祥子那样好啊！' : '我发誓，和灯在一起的话，一辈子也可以。';
            g.text(line, o.x, o.y - 235, '#a9d3f5', 1.1, 15);
            o.stun = Math.max(o.stun, .35);
            o.vx = 0;
            o.vy = 0;
            o.knocked = 0;
            o.attack = null;
            retainEscape(o, !!s.super);
            break;
          }
        }
      }
      if (a.hold < 0 && a.tossAt === 0 && a.t >= s.start + .45) a.t = s.duration;
      if (a.hold >= 0) {
        const o = g.fighters.find(p => p.id === a.hold);
        if (!o || o.hp <= 0) {
          a.t = s.duration;
        } else {
          o.x = f.x + f.facing * 58;
          o.y = FLOOR;
          o.vx = 0;
          o.vy = 0;
          o.knocked = 0;
          o.stun = Math.max(o.stun, .3);
          o.facing = (-f.facing) as 1 | -1;
          if (a.shots < VOW_BEATS && a.t >= a.tossAt + vowBeatTime(a.shots)) {
            a.hit = new Set();
            hit(g, f, o, withFinale(s, a.shots >= VOW_BEATS - 1), a);
            g.effect('drum-wave', o.x, o.y - 90, '#f4ecff', .32, { radius: 22 + a.shots * 9 });
            g.text(String(120 + a.shots * 30), f.x, f.y - 255, f.data.color, .45, 14 + a.shots * 2);
            a.shots++;
            if (a.shots >= VOW_BEATS) {
              const dir = Math.sign(o.x - f.x) || f.facing;
              o.vx = dir * VOW_LAUNCH;
              o.vy = -520;
              o.knocked = .9;
              o.downTime = 0;
              o.stun = Math.max(o.stun, .5);
              g.flash = .2;
              a.hold = -1;
              a.t = Math.max(a.t, s.duration - .35);
            }
          }
        }
      }
      return true;
    },
  },
};
