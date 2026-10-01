import type { Skill } from '../data/types.ts';
import { gainEnergy, type Attack, type Fighter } from './fighter.ts';
import type { FightGame, Projectile, SealVolley } from './game.ts';
import { CONTROLS, FLOOR, GRAVITY, SIDE, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { clipFor, drumRow, vowBeatTime, VOW_BEATS } from '../render/clips.ts';

/* Every damage source (melee swing, projectile) funnels through hit(). Guard, combo and energy rules live here once. */

/** Blocking a projectile siphons the attacker's energy, proportional to the shot's full damage. */
const GUARD_DRAIN = .3;

/** 就由我来结束一切: the arcade frenzy. Rate, J/K cooldown cut and the jab-chain live in
 *  CharacterData.frenzy now; these stay as the defaults when a character leaves it unset. */
const FRENZY_TIME = 8;
const FRENZY_RATE = 1.55;
/** The brown of her hair, used for the frenzy afterimages. */
const FRENZY_TINT = '#a5714f';
/** 秋叶原马拉松: the pose has to finish. Then walking is faster and ordinary hits don't flinch her. */
export const MARATHON_TIME = 4.5;
export const MARATHON_SPEED = 1.45;
/** 九字真言: a clean hit seals block and back-dodge for this long, refreshed by later clean hits. */
const PURGE_TIME = 3;
const SEAL_HITS = 6;
const SEAL_FINALE_KNOCK = 280;
/** 高肌肉！: seconds the flex holds, the damage bonus while it does, and the shove the pose gives the crowd. */
const MUSCLE_TIME = 7;
const MUSCLE_BONUS = .3;
const MUSCLE_REPEL_PUSH = 500;
/** 梦想即力量！: the transformation shoves like the sing, then the frenzy and the brace run together. */
const DREAM_REPEL_PUSH = 420;
/** 高音量！: anyone inside a wave gets carried along at this speed until it passes them. */
const MEGA_PUSH = 300;
/** 微笑号出航: twelve segments per body, one per interval window — the first SHIP_FULL at full
 *  damage, the rest at a fifth strength. The picture is the truth: the hull waits SHIP_HOLD,
 *  then takes SHIP_SWEEP to go fully off one side to fully off the other, and the strike point
 *  rides the visible bow, pulled back SHIP_BLANK of the picture width because the sprite's
 *  right edge is blank. Bodies in the waterline are carried at the hull's own speed. */
const SHIP_SEGMENTS = 12;
const SHIP_FULL = 6;
const SHIP_TAIL_MUL = .2;
const SHIP_BLANK = .2;
export const SHIP_HOLD = .45;
export const SHIP_SWEEP = 2;
const SHIP_PUSH = 2 * W / SHIP_SWEEP;
/** 抛球杂耍: the ball bounces between the walls, the ceiling and the floor. Every bounce
 *  re-angles the flight by up to JUGGLE_JITTER, speeds it up 20% to at most double the launch
 *  speed, and the angle is kept out of the flat and the vertical so the ball neither stalls
 *  sideways nor gets stuck bouncing in place. */
const JUGGLE_TOP = 36;
const JUGGLE_JITTER = .5;
const JUGGLE_MIN_CROSS = .35;
const JUGGLE_MIN_RISE = .25;
const JUGGLE_ACCEL = 1.2;
const JUGGLE_MAX_MUL = 2;
/** 就由我来结束一切: the cast shoves everyone inside this radius away, no damage. */
const RESOLVE_REPEL_RANGE = 190;
const RESOLVE_REPEL_PUSH = 540;
/** 求你了: the kneel holds this long after the catch, so the pause reads before the headbutt. */
const ONEGAI_PAUSE = .5;
/** 大份牛排: one bite, then the same brace as the plaster. A hit before the bite cancels both. */
const STEAK_HEAL = 60;
const STEAK_BRACE = 4;
/** 超恢复: the brace, this much hp each second, and J/K stay locked. The three end together. */
export const FEAST_TIME = 6;
export const FEAST_REGEN = 36;
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
/** 我要拉黑他: seconds of total lock, and the damage cut while it holds. Only the clock lifts it. */
const BAN_TIME = 3;
const BAN_DAMAGE = .5;
/** 鼓点: beat stacks cap; each one speeds cooldowns 6% and walking 2%. */
const BEAT_MAX = 8;
/** 和灯在一起的话: the final double-kick throws the body this hard. Beats live on the clip schedule. */
const VOW_LAUNCH = 700;
/** 吉他激奏: ten waves while the key stays down; each one reaches further, hits harder, shoves harder. */
const RIFF_WAVES = 10;
const RIFF_R0 = 144, RIFF_R1 = 240;
const RIFF_D0 = 12, RIFF_D1 = 22;
const RIFF_K0 = 240, RIFF_K1 = 380;
/** 吉他激奏: the tap cools from 2s; every extra wave adds its share of the rest, so a full
 *  10-wave channel sits at 7s from cast — about 2.5s left once the strum plays out. */
const RIFF_CD_TAP = 2, RIFF_CD_MAX = 7;
/** 韵律直觉: tap is one ring at the base cooldown; a full six-pulse channel sits at 7.5s. */
const GROOVE_WAVES = 6;
const GROOVE_CD_TAP = 3, GROOVE_CD_MAX = 7.5;
/** 韵律直觉 notes steer this many radians per second, and only on the horizontal. */
const GROOVE_TURN = 1.4;
/** 抹茶大芭菲: the parfait stands this far ahead and lobs blobs on its own clock. */
const PARFAIT_DIST = 120;
/** 剪: the locked field catches this wide and this tall around the marked spot. */
const SNIP_BAND_X = 96;
const SNIP_BAND_Y = 72;
/** 哭泣的紫罗兰: the vanish holds this long between the two bursts; she is gone the whole way. */
export const VIOLET_WARP = .5;
/** 火的故事: the arrow is only the fuse — the blast is the one damage event. A quarter of the stage. */
const FUGA_RADIUS = 240;
const FUGA_DAMAGE = 170;
const FUGA_KNOCK = 520;
const FUGA_BURST_TIME = .6;
/** Seconds of flight before the arrow may detonate: it visibly leaves the bow, and a
    point-blank blast lands just after her cast invuln ends, so hugging the foe still burns her. */
const FUGA_FUSE = .12;
/** 甜甜圈: strawberry roots for this long; chocolate frails at this bonus for that long. */
const DONUT_ROOT = 2;
const DONUT_FRAIL = 3.5;
const DONUT_FRAIL_BONUS = .25;
const DONUT_KNOCK = 150;
/** 五冠王的威压: five waves, each wider, harder and shove-ier than the last. */
const CROWN_WAVES = 5;
const CROWN_R0 = 230, CROWN_R1 = 330;
const CROWN_D0 = 14, CROWN_D1 = 20;
const CROWN_K0 = 420, CROWN_K1 = 600;
/** Multi-swing melee stamp offsets, cycled per swing. Constant: rebuilding it per step was pure churn. */
const SWING_RING = [
  { x: 76, y: -74, dir: 1 },
  { x: 6, y: -128, dir: 1 },
  { x: -42, y: -76, dir: -1 },
];

/** 哭泣的紫罗兰: she does not exist between the vanish and the reappear — no body is drawn. */
export function violetHidden(f: Fighter): boolean {
  const a = f.attack;
  return !!a && a.skill.fx === 'violet' && a.t >= a.skill.start && a.t < a.skill.start + VIOLET_WARP;
}

/** 悲鸣: more cries as she breaks. Resolved once per cast so the shared skill stays put. */
/** 不会再逃避了: every swing except the last stays in place. shots is the swing index before it increments. */
function spinFinale(skill: Skill, source: HitSource): boolean {
  if (skill.fx !== 'spin') return false;
  const shots = 'shots' in source ? Number((source as Attack).shots) : 0;
  return shots >= Math.max(0, (skill.count ?? 1) - 1);
}

/** 和灯在一起的话: the last beat is the launch; every earlier one keeps the victim pinned in front. */
function vowFinale(skill: Skill, source: HitSource): boolean {
  if (skill.fx !== 'vow') return false;
  const shots = 'shots' in source ? Number((source as Attack).shots) : 0;
  return shots >= VOW_BEATS - 1;
}

/** 高能量！: the last punch is the shove; every earlier one keeps the victim inside the flurry. */
function flurryFinale(skill: Skill, source: HitSource): boolean {
  if (skill.fx !== 'flurry') return false;
  const shots = 'shots' in source ? Number((source as Attack).shots) : 0;
  return shots >= Math.max(0, (skill.count ?? 1) - 1);
}

/** 抱抱还是亲亲: the fifth kiss is the knockdown. shots is the index before it increments. */
function kissFinale(skill: Skill, source: HitSource): boolean {
  if (skill.fx !== 'kiss') return false;
  const shots = 'shots' in source ? Number((source as Attack).shots) : 0;
  return shots >= 4;
}

/** C和弦 and 吉他激奏 keep firing past the first shots only while the attack key is still down. CPU taps. */
function attackHeld(g: FightGame, f: Fighter): boolean {
  if (f.controller === null || !f.attack) return false;
  const code = CONTROLS[f.controller]?.attacks[f.attack.index];
  return !!code && g.keys.has(code);
}

/** 微笑大回旋: the direction held right now, for the mid-flight reversal. CPUs read 0 and dash straight. */
function heldDir(g: FightGame, f: Fighter): number {
  if (f.controller === null) return 0;
  const c = CONTROLS[f.controller];
  if (!c) return 0;
  return (g.keys.has(c.right) ? 1 : 0) - (g.keys.has(c.left) ? 1 : 0);
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

/** 吉他激奏: the wave fired at index i, with its own reach, damage and shove. */
export function riffShot(s: Skill, i: number): Skill {
  const k = i / (RIFF_WAVES - 1);
  const lerp = (a: number, b: number) => a + (b - a) * k;
  return {
    ...s,
    range: Math.round(lerp(RIFF_R0, RIFF_R1)),
    damage: Math.round(lerp(RIFF_D0, RIFF_D1)),
    knock: Math.round(lerp(RIFF_K0, RIFF_K1)),
  };
}

/** 五冠王的威压: the wave fired at index i, with its own reach, damage and shove. */
export function crownShot(s: Skill, i: number): Skill {
  const k = i / (CROWN_WAVES - 1);
  const lerp = (a: number, b: number) => a + (b - a) * k;
  return {
    ...s,
    range: Math.round(lerp(CROWN_R0, CROWN_R1)),
    damage: Math.round(lerp(CROWN_D0, CROWN_D1)),
    knock: Math.round(lerp(CROWN_K0, CROWN_K1)),
  };
}

/** 甜甜圈: the flavour is rolled at the cast into a per-shot copy, so the shared skill stays put. */
function donutVariant(g: FightGame, s: Skill): Skill {
  return g.random() < .5
    ? { ...s, fx: 'donut-straw', knock: 0, root: DONUT_ROOT, rootBreak: 0, rootPin: true }
    : { ...s, fx: 'donut-choc', frail: DONUT_FRAIL, frailBonus: DONUT_FRAIL_BONUS, knock: DONUT_KNOCK };
}

export interface HitSource { hit: Set<number> }

export function hit(g: FightGame, attacker: Fighter, defender: Fighter, skill: Skill, source: HitSource, originX = attacker.x): boolean {
  // 火的故事: the blast reads everyone on the field — its fuga skill is the one friendly-fire opt-in.
  const blast = skill.fx === 'fuga';
  if ((!g.isEnemy(attacker, defender) && !blast) || defender.echo || defender.hp <= 0 || defender.invuln > 0 || source.hit.has(defender.id)) return false;
  source.hit.add(defender.id);
  // 我会保护小睦: every hitstun this defender takes runs through the stack multiplier.
  const hitStun = (v: number) => v * defender.stunMul;
  const wasRooted = defender.root > 0;
  let holdStill = wasRooted;
  const dir = defender.x >= originX ? 1 : -1;
  const inFront = defender.facing === -dir;
  const isGrab = skill.type === 'grab';
  const blocked = defender.blocking && inFront && defender.guard > 0 && !isGrab;
  // Super armour: an endure move in wind-up eats one strike. 恐湖 and 哈？ keep it through the hit. Grabs and supers still go through.
  const armour = defender.attack;
  const rippleLive = !!armour && (armour.skill.fx === 'ripple' || armour.skill.fx === 'huh') && armour.t < armour.skill.duration - .22;
  const endured = !blocked && !!armour && armour.endure > 0 && (rippleLive || armour.t < armour.skill.start) && !isGrab && !skill.super;
  // 绊创膏: the buffed fighter eats the damage without the flinch. Grabs and supers ignore the plaster.
  const braced = !blocked && defender.braced > 0 && !isGrab && !skill.super;
  // 秋叶原马拉松: same no-flinch as the plaster, without the damage cut or the halved knockback.
  const poised = !blocked && defender.poise > 0 && !isGrab && !skill.super;
  // 梦想即力量！: the frenzy brace is true super armour — only the control set (grabs, the
  // roots, the ban) staggers her. Supers lose their pierce and the combo escape never fires.
  // 满月嚎叫 wears the same brace for the howl itself, and it ends when the howl does.
  const howling = defender.attack?.skill.fx === 'howl';
  const superBrace = !blocked && !isGrab
    && skill.fx !== 'heart' && skill.fx !== 'shout' && skill.fx !== 'ban'
    && skill.fx !== 'wink' && skill.fx !== 'donut-straw' && skill.fx !== 'smile-wave'
    && ((defender.braced > 0 && defender.frenzy > 0) || howling);
  let damage = skill.damage * attacker.data.power * (defender.data.trait === 'armor' ? .9 : 1) * ((braced || superBrace) ? BRACED_DAMAGE : 1) * (defender.ban > 0 ? BAN_DAMAGE : 1) * attacker.baseDmgMul * attacker.dmgMul * (attacker.muscle > 0 ? 1 + MUSCLE_BONUS : 1) * (defender.frail > 0 ? 1 + defender.frailBonus : 1);
  // 堕天: below half health the attacker swings harder; 这是最后通牒: a defender under a quarter takes more.
  if (attacker.lowHpDmg > 0 && attacker.hp < attacker.data.hp * .5) damage *= 1 + attacker.lowHpDmg;
  if (defender.executeDmg > 0 && defender.hp < defender.data.hp * .25) damage *= 1 + defender.executeDmg;

  // 直接无限大: ordinary hits are written on the bill and do not flinch. Grabs and the
  // control set (root, ban) still land now, so they are not also billed.
  const control = isGrab || skill.fx === 'heart' || skill.fx === 'shout' || skill.fx === 'ban'
    || skill.fx === 'wink' || skill.fx === 'donut-straw' || skill.fx === 'smile-wave';
  if (!blocked && defender.debt > 0 && !control) {
    attacker.combo = attacker.comboTime > 0 ? attacker.combo + 1 : 1;
    attacker.comboTime = 1.3 + attacker.comboTimeBonus;
    attacker.hitCount++;
    g.totalHits[attacker.id]++;
    g.maxCombo[attacker.id] = Math.max(g.maxCombo[attacker.id], attacker.combo);
    damage *= Math.max(.4, 1 - (attacker.combo - 1) * attacker.comboDecay);
    const rounded = Math.round(damage);
    defender.debtDmg += rounded;
    defender.hitFlash = .08;
    const rushBonus = attacker.data.trait === 'rush' && attacker.hitCount % 3 === 0 ? 14 : 0;
    gainEnergy(attacker, (skill.gain ?? (skill.super ? 2 : 9)) + rushBonus);
    g.audio.play('hit');
    g.text('-' + rounded, defender.x, defender.y - 160, '#f4b4c8', .45, 18);
    return true;
  }

  if (blocked) {
    const fullHit = damage;
    damage *= skill.super ? .24 : .13;
    defender.guard -= skill.super ? 42 : skill.type === 'heavy' ? 26 : 15;
    defender.stun = hitStun(.075);
    defender.blockTap = 1;
    gainEnergy(defender, 5);
    gainEnergy(attacker, 4);
    // 远程反制：挡下投掷物按其伤害削减对方的气，静默结算，不跳字。
    // 剪 is a trap and 火的故事 is her own blast: neither siphons meter for being blocked.
    if (skill.type === 'projectile' && skill.fx !== 'snip' && skill.fx !== 'fuga') attacker.energy = clamp(attacker.energy - fullHit * GUARD_DRAIN, 0, 100);
    g.effect('shield', defender.x - dir * 30, defender.y - 78, '#8df0ff', .22, { radius: 65 });
    g.audio.play('block');
    g.text('格挡', defender.x, defender.y - 170, '#91eaff', .35, 16);
    if (defender.guard <= 0) {
      defender.guard = 0;
      defender.stun = hitStun(.9);
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
    attacker.comboTime = 1.3 + attacker.comboTimeBonus;
    attacker.hitCount++;
    g.totalHits[attacker.id]++;
    g.maxCombo[attacker.id] = Math.max(g.maxCombo[attacker.id], attacker.combo);
    damage *= Math.max(.4, 1 - (attacker.combo - 1) * attacker.comboDecay);
    // 最喜欢闪闪发光的东西！: unblocked hits only, and the damage number prints one size up.
    const crit = attacker.critChance > 0 && g.random() < attacker.critChance;
    if (crit) damage *= 1.5;
    // 鼓点: a clean hit adds a beat; taking one shakes two off.
    if (attacker.data.trait === 'beat') attacker.beatStacks = Math.min(BEAT_MAX, attacker.beatStacks + 1);
    if (defender.data.trait === 'beat') defender.beatStacks = Math.max(0, defender.beatStacks - 2);
    defender.hitFlash = .13;
    if (endured && armour) {
      if (armour.skill.fx !== 'ripple' && armour.skill.fx !== 'huh') armour.endure--;
      g.text('霸体', defender.x, defender.y - 195, '#ffd27a', .5, 18);
    } else if (braced || superBrace || poised) {
      // 绊创膏: the hit lands, nothing flinches, and the combo escape below still applies.
      // The dream brace is stronger: no escape either, just the throttled golden absorb.
      if (superBrace) {
        if (defender.braceFx <= 0) g.text('霸体', defender.x, defender.y - 195, '#ffd27a', .5, 18);
        defender.braceFx = .3;
      } else if (attacker.combo >= defender.escapeCombo) {
        defender.invuln = .48;
        defender.vx = dir * 470;
        defender.stun = hitStun(.24);
        g.text('脱离连段', defender.x, defender.y - 195, SIDE[1], .7, 16);
      }
    } else {
      if (wasRooted && defender.rootBreak > 0 && skill.fx !== defender.rootFx) {
        // The root's own follow-up segments (微笑号 waves and friends) do not break it;
        // only outside hits count toward the early shake-off.
        defender.rootHits++;
        if (defender.rootHits >= defender.rootBreak) {
          defender.root = 0;
          defender.rootHits = 0;
          holdStill = false;
        }
      }
      defender.stun = hitStun(skill.fx === 'groove-note' ? .16 : skill.fx === 'bag' ? .26 : skill.fx === 'matcha' ? .18 : skill.fx === 'ripple' || skill.fx === 'huh' ? .35 : skill.type === 'light' ? .28 : skill.super ? .42 : .37);
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
      if (skill.root && !wasRooted) {
        // 定身: the parameterized control. root seconds and the tier come from the skill,
        // rootBreak clean hits shake it off early (default 2, 0 holds to the clock),
        // rootPin freezes the body in place.
        defender.root = skill.root;
        defender.rootLevel = skill.rootLevel ?? 'move';
        defender.rootBreak = skill.rootBreak ?? 2;
        defender.rootHits = 0;
        defender.rootFx = skill.fx;
        defender.dodge = 0;
        defender.stun = hitStun(.25);
        if (skill.rootPin) {
          defender.vy = 0;
          defender.knocked = 0;
          holdStill = true;
        }
        g.text('定身!', defender.x, defender.y - 195, '#ffd27a', .6, 20);
      } else if (skill.fx === 'onegai') {
        // The headbutt hurls them out of the kneel: a real launch, and the grab shakes the root off.
        defender.root = 0;
        defender.rootHits = 0;
        defender.rootLevel = 'move';
        holdStill = false;
        defender.vy = -440;
        defender.knocked = .72;
        defender.downTime = 0;
        defender.stun = hitStun(.5);
      } else if (skill.fx === 'spin' && !spinFinale(skill, source)) {
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = hitStun(.2);
      } else if (skill.fx === 'flurry' && !flurryFinale(skill, source)) {
        // 高能量！: every punch but the last keeps the victim standing inside the flurry.
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = hitStun(.2);
      } else if (skill.fx === 'rabbit') {
        // 食兔者: three bites, pinned, still standing when the last one lets go.
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = hitStun(.25);
        holdStill = true;
      } else if (skill.fx === 'kiss' && !kissFinale(skill, source)) {
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = hitStun(.28);
        holdStill = true;
      } else if (skill.fx === 'kiss') {
        defender.vy = -120;
        defender.knocked = .9;
        defender.downTime = 0;
        defender.stun = hitStun(.45);
      } else if (skill.fx === 'shove') {
        // Hold them in front, turned to face the attacker. The lift and throw wait on the attack clock.
        defender.stun = hitStun(.5);
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
        defender.stun = hitStun(.4);
      } else if (skill.fx === 'ripple' || skill.fx === 'bag') {
        defender.vy = 0;
        defender.knocked = 0;
      } else if (skill.fx === 'seal') {
        // 九字真言: the circle holds them on their feet. A clean hit seals block and the back-dodge.
        defender.vy = 0;
        defender.knocked = 0;
        if (defender.purge <= 0) g.text('驱邪', defender.x, defender.y - 195, '#e6d4ff', .6, 20);
        defender.purge = PURGE_TIME;
      } else if (skill.fx === 'ban') {
        // 我要拉黑他: frozen for three seconds, holding the hit pose. Nothing but the clock lifts it.
        defender.ban = BAN_TIME;
        defender.root = 0;
        defender.rootHits = 0;
        defender.rootLevel = 'move';
        defender.vy = Math.min(defender.vy, 0);
        defender.knocked = 0;
        defender.dodge = 0;
        defender.stun = hitStun(BAN_TIME);
        holdStill = true;
        g.text('拉黑!', defender.x, defender.y - 195, '#ff5a5a', .7, 22);
      } else if (skill.fx === 'vow' && !vowFinale(skill, source)) {
        // 和灯在一起的话: every beat but the last keeps the victim pinned in front of her.
        defender.vy = 0;
        defender.knocked = 0;
        defender.stun = hitStun(.3);
        holdStill = true;
      } else if (isGrab || skill.super || skill.type === 'upper' || skill.type === 'sweep') {
        defender.vy = skill.type === 'upper' ? -430 : skill.type === 'sweep' ? -140 : -240;
        defender.knocked = .72;
        defender.downTime = 0;
      } else if (skill.type === 'launch') {
        // Float, not knockdown: the defender stays hittable until they land.
        // High enough to meet with a jump attack; the fall itself is slowed in stepFighter.
        defender.vy = -600;
        defender.stun = hitStun(1.1);
        g.text('浮空!', defender.x, defender.y - 200, '#ffd27a', .6, 20);
      }
      if (!blocked && skill.air && defender.y < FLOOR - .5) {
        // Juggle: an air normal pops a floating victim slightly upward and locks them briefly.
        // Small enough that the attacker still has to land; combo escapes past the threshold still break out.
        defender.vy = Math.min(defender.vy, -80);
        defender.stun = Math.max(defender.stun, hitStun(.4));
      }
      if (attacker.combo >= defender.escapeCombo) {
        defender.invuln = .48;
        defender.vx = dir * 470;
        defender.stun = hitStun(.24);
        g.text('脱离连段', defender.x, defender.y - 195, SIDE[1], .7, 16);
      }
    }
    const rushBonus = attacker.data.trait === 'rush' && attacker.hitCount % 3 === 0 ? 14 : 0;
    gainEnergy(attacker, (skill.gain ?? (skill.super ? 2 : 9)) + rushBonus);
    gainEnergy(defender, 7);
    if (skill.drain) {
      // 离灯远点: the abuse strips the victim's meter raw — no multipliers, and it says so out loud.
      defender.energy = clamp(defender.energy - skill.drain, 0, 100);
      g.text(`-${skill.drain} 气`, defender.x, defender.y - 135, '#ffd27a', .6, 16);
    }
    g.audio.play('hit');
    g.text('-' + Math.round(damage), defender.x + dir * 15, defender.y - 160, skill.super ? SIDE[attacker.team] : '#fff', .65, (skill.super ? 30 : 23) + (crit ? 6 : 0));
    // 剪 draws its own spindle burst — no sparks and no star on top, so the cut reads as blades only.
    if (skill.fx !== 'snip') {
      g.sparks(defender.x - dir * 23, defender.y - 85, attacker.data.color, skill.super ? 36 : 18, skill.super ? 1.6 : 1);
      g.effect('hit', defender.x - dir * 23, defender.y - 85, attacker.data.color, .25, { radius: skill.super ? 90 : 48 });
    }
    if (skill.frail) {
      const fresh = defender.frail <= 0;
      const bonus = skill.frailBonus ?? 0;
      if (fresh || bonus >= defender.frailBonus) defender.frailBonus = bonus;
      defender.frail = Math.max(defender.frail, skill.frail);
      if (fresh) g.text('脆弱', defender.x, defender.y - 195, '#ffb4c8', .6, 18);
    }
  }

  defender.hp = clamp(defender.hp - damage, 0, defender.data.hp);
  if (defender.hp <= 0 && defender.deathSave > 0) {
    // 想成为人类: lethal damage stops at 1 hp, spends a charge, and clears the hit's locks. One sparks, no text.
    defender.deathSave--;
    defender.hp = 1;
    defender.invuln = 1.5;
    defender.stun = 0;
    defender.knocked = 0;
    defender.downTime = 0;
    g.sparks(defender.x, defender.y - 80, defender.data.color);
  } else if (defender.hp <= 0 && attacker.vainDmg > 0) {
    // 因为我爱慕虚荣: the first kill of the round arms the bonus until resetRound rebuilds the fighters.
    attacker.dmgMul *= 1 + attacker.vainDmg;
    attacker.energyMul *= 1 + attacker.vainEnergy;
    attacker.vainDmg = 0;
    attacker.vainEnergy = 0;
  }
  // 潜在表明: a quiet cut of the damage dealt comes back as healing, capped at max health.
  if (attacker.lifesteal > 0 && damage > 0) attacker.hp = Math.min(attacker.data.hp, attacker.hp + damage * attacker.lifesteal);
  // 竟敢无视灯: melee hits pain the attacker back — pure hp loss, no stagger, no fx, it can kill.
  if (defender.thorns > 0 && skill.type !== 'projectile' && damage > 0) attacker.hp = Math.max(0, attacker.hp - damage * defender.thorns);
  const knock = skill.fx === 'bag' || skill.fx === 'heart' || skill.fx === 'wink' || skill.fx === 'donut-straw' ? 0
    : skill.fx === 'chord' ? 160
    : skill.fx === 'onegai' ? 360 : skill.fx === 'shout' ? 110
    : skill.fx === 'spin' && !spinFinale(skill, source) ? 0
    : skill.fx === 'flurry' && !flurryFinale(skill, source) ? 0
    : skill.fx === 'ripple' ? 620 : skill.fx === 'slam' ? 120 : blocked ? 75 : skill.knock ?? (skill.type === 'light' ? 95 : skill.super ? 340 : 235);
  if (skill.fx !== 'shove' && defender.invuln <= 0 && !endured) defender.vx = dir * knock * (braced || superBrace ? .5 : 1);
  // 高能量！: the finale shove outruns the combo-escape push, so the last punch always reads as the finisher.
  else if (skill.fx === 'flurry' && flurryFinale(skill, source)) defender.vx = dir * knock;
  if (holdStill) { defender.vx = 0; defender.vy = 0; }
  g.shake = blocked ? 2 : skill.fx === 'slam' ? 14 : skill.fx === 'onegai' ? 10 : skill.super ? 12 : skill.type === 'heavy' ? 7 : 4;
  const juggleHit = !blocked && !!skill.air && defender.y < FLOOR - .5;
  g.hitstop = blocked ? .018 : juggleHit ? .085 : skill.fx === 'slam' ? .09 : skill.fx === 'onegai' ? .08 : skill.fx === 'seal' ? .09 : skill.super ? .065 : skill.type === 'heavy' ? .065 : .032;
  return true;
}

/** ponytail: shared scratch so the per-step melee sweeps do not allocate. Not reentrant —
 *  hit() never calls back into melee code. */
const meleeSweep: Fighter[] = [];

export function applyMelee(g: FightGame, f: Fighter, a: Attack): void {
  if (f.hp <= 0 || f.stun > 0) return;
  const s = a.skill;
  meleeSweep.length = 0;
  for (const o of g.fighters) if (g.isEnemy(f, o) && o.hp > 0 && !o.echo) meleeSweep.push(o);
  // Insertion sort by |x - f.x|: the sweep holds at most a handful of fighters and must
  // keep the array's original order on ties, exactly like the stable sort it replaced.
  for (let i = 1; i < meleeSweep.length; i++) {
    const t = meleeSweep[i];
    const d = Math.abs(t.x - f.x);
    let j = i - 1;
    while (j >= 0 && Math.abs(meleeSweep[j].x - f.x) > d) { meleeSweep[j + 1] = meleeSweep[j]; j--; }
    meleeSweep[j + 1] = t;
  }
  for (const o of meleeSweep) {
    const dist = Math.abs(o.x - f.x);
    const dy = Math.abs(o.y - f.y);
    const ripple = s.fx === 'ripple' || s.fx === 'huh';
    if (s.fx === 'riff' || s.fx === 'howl' || s.fx === 'groove' || s.fx === 'crown') {
      // 吉他激奏: a screen-facing disc centred on her — every direction, any height. A jump no longer dodges it.
      if (Math.hypot(o.x - f.x, o.y - f.y) < s.range) {
        hit(g, f, o, s, a);
        if (f.hp <= 0) break;
      }
      continue;
    }
    const radial = ripple || s.fx === 'spin' || (s.type === 'grab' && s.fx !== 'shove' && s.fx !== 'slam');
    const front = (o.x - f.x) * f.facing >= -20;
    // Sweeps only touch grounded targets; air normals and uppers reach further vertically.
    // A crawl's hand only reaches a standing chest, so a real jump clears it.
    const height = ripple || s.fx === 'yokan' || s.fx === 'skewer' || s.type === 'sweep' ? o.y > FLOOR - 40
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
  // 奇独点: the well takes a fixed spot ahead and never travels. 抹茶大芭菲 stands on the floor the same way.
  const hole = s.fx === 'blackhole';
  const parfait = s.fx === 'parfait';
  const speed = lob ? lob.vx : (s.speed ?? (s.super ? 650 : 480)) * (f.data.trait === 'focus' ? 1.15 : 1);
  // 抛球杂耍: the toss leaves at a small random climb or drop, so two balls never fly the same lane.
  const juggleAng = s.fx === 'juggle-ball' ? (Math.random() * 2 - 1) * .3 : 0;
  const p: Projectile = {
    owner: f.id,
    x: parfait ? clamp(f.x + f.facing * PARFAIT_DIST, X_MIN, X_MAX) : hole ? clamp(f.x + f.facing * BLACKHOLE_DIST, X_MIN, X_MAX) : f.x + f.facing * 53,
    y: parfait ? FLOOR : hole ? FLOOR - 95 : f.y - 85 + offsetY,
    vx: hole || parfait ? 0 : f.facing * speed * (s.fx === 'juggle-ball' ? Math.cos(juggleAng) : 1),
    vy: s.fx === 'juggle-ball' ? Math.sin(juggleAng) * speed : lob ? lob.vy : 0,
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
    v0: s.fx === 'juggle-ball' ? speed : undefined,
  };
  g.projectiles.push(p);
  // 微笑号出航: a horn blast the moment the hull is called, so the sweep has a warning.
  if (s.fx === 'smile-ship') g.audio.play('whistle');
  return p;
}

/** 韵律直觉: a slow note that only steers left and right, so a jump clears it. */
function spawnGrooveNote(g: FightGame, f: Fighter, a: Attack): void {
  const speed = 250 * (f.data.trait === 'focus' ? 1.15 : 1);
  const skill: Skill = { ...a.skill, type: 'projectile', damage: 12, knock: 90, gain: 2, fx: 'groove-note', speed: 250, size: 32, life: 2 };
  g.projectiles.push({
    owner: f.id,
    x: f.x + f.facing * 40,
    y: f.y - 85,
    vx: f.facing * speed,
    vy: 0,
    life: 2,
    skill,
    color: f.data.color,
    radius: 8,
    size: 32,
    fx: 'groove-note',
    attack: a,
    hit: new Set(),
    trail: [],
    age: 0,
  });
}

/** 高性能作曲AI: one tick of the lane. No stun, no combo, no hitstop — leaving is the way out. */
function composeTick(g: FightGame, attacker: Fighter, defender: Fighter, skill: Skill): void {
  if (!g.isEnemy(attacker, defender) || defender.hp <= 0 || defender.invuln > 0) return;
  const dir = defender.x >= attacker.x ? 1 : -1;
  const blocked = defender.blocking && defender.facing === -dir && defender.guard > 0;
  let damage = skill.damage * attacker.data.power * (defender.data.trait === 'armor' ? .9 : 1)
    * attacker.baseDmgMul * attacker.dmgMul * (attacker.muscle > 0 ? 1 + MUSCLE_BONUS : 1)
    * (defender.frail > 0 ? 1 + defender.frailBonus : 1);
  if (blocked) {
    damage *= .13;
    defender.guard -= 15;
    if (defender.guard <= 0) {
      defender.guard = 0;
      defender.stun = Math.max(defender.stun, .9);
      defender.guardBroken = 1.2;
      defender.blocking = false;
      defender.queue = [];
      g.text('破防!', defender.x, defender.y - 200, SIDE[0], .8, 30);
    }
  }
  const rounded = Math.round(damage);
  if (rounded <= 0) return;
  defender.hp = clamp(defender.hp - rounded, 0, defender.data.hp);
  g.audio.play('key');
  g.text('-' + rounded, defender.x + dir * 8, defender.y - 148, '#fff', .35, 16);
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

/** 抹茶大芭菲: fixed lob table, sides alternate through near-to-far pairs. Retune the pairs if the spread drifts. */
const PARFAIT_ARCS = [
  { vx: 90, vy: -720 },
  { vx: 160, vy: -660 },
  { vx: 230, vy: -700 },
  { vx: 300, vy: -620 },
  { vx: 330, vy: -680 },
];

function spawnMatchaBlob(g: FightGame, owner: Fighter, zone: Projectile, index: number): void {
  const arc = PARFAIT_ARCS[index % PARFAIT_ARCS.length];
  const s = zone.skill;
  g.projectiles.push({
    owner: owner.id,
    x: zone.x,
    y: FLOOR - 175,
    vx: (index % 2 ? 1 : -1) * arc.vx,
    vy: arc.vy,
    life: 2.4,
    skill: s,
    color: owner.data.color,
    radius: 13,
    size: s.size ?? 56,
    fx: 'matcha',
    attack: zone.attack,
    hit: new Set(),
    trail: [],
    age: 0,
  });
}

/** True once this move will not produce more hits. Supers and the throw cinematics stay committed. */
export function effectSettled(a: Attack): boolean {
  const s = a.skill;
  if (s.super || s.fx === 'shove' || s.fx === 'slam' || s.fx === 'rabbit' || s.fx === 'kiss') return false;
  // 剪 and 火的故事 hand their pay-off to a zone or an arrow; once that is away she may act.
  if (s.fx === 'snip' || s.fx === 'fuga') return a.emitted;
  if (s.type === 'dash') return a.t >= s.duration - .08;
  if (s.type === 'upper') return a.t >= s.start + .25;
  const volley = a.burst || s.count || 1;
  if (volley > 1) return a.shots >= volley || (s.fx === 'chord' && a.t >= s.duration - .22) || (s.fx === 'riff' && a.t >= s.duration - .3);
  return a.emitted;
}

/** 哭泣的紫罗兰: one petal burst — mid damage in a wide ring, the vanish and the reappear each throw one. */
function violetBurst(g: FightGame, f: Fighter, s: Skill): void {
  g.effect('violet', f.x, f.y - 85, f.data.color, .55, { radius: s.range });
  for (const o of g.opponents(f)) {
    if (o.hp <= 0 || o.invuln > 0) continue;
    if (Math.abs(o.x - f.x) < s.range && Math.abs((o.y - 83) - (f.y - 85)) < 90) {
      hit(g, f, o, s, { hit: new Set() });
    }
  }
}

/** 火的故事: the blast is the one damage event, and it reads friend and foe alike —
    she has to open the distance before firing. Super rules on guard, a quarter of the stage. */
function fugaBurst(g: FightGame, p: Projectile, owner: Fighter | undefined): void {
  g.effect('fuga-burst', p.x, p.y, p.color, FUGA_BURST_TIME, { radius: FUGA_RADIUS });
  g.shake = 14;
  g.flash = Math.max(g.flash, .22);
  g.sparks(p.x, p.y, '#ffb46a', 40, 1.6);
  if (!owner || owner.hp <= 0) return;
  const sk = { ...p.skill, damage: FUGA_DAMAGE, knock: FUGA_KNOCK, gain: 0 };
  const hitSet = new Set<number>();
  for (const o of g.fighters) {
    if (o.hp <= 0 || o.echo) continue;
    if (Math.hypot(o.x - p.x, (o.y - 83) - p.y) < FUGA_RADIUS) hit(g, owner, o, sk, { hit: hitSet }, p.x);
  }
}

export function updateAttack(g: FightGame, f: Fighter, dt: number): void {
  const a = f.attack;
  if (!a) return;
  // 时停级定身: their move clock stops with the pose and resumes when the freeze lifts.
  if (f.root > 0 && f.rootLevel === 'freeze') return;
  const s = a.skill;
  // Frenzy only hurries the ground jab and kick; specials and air normals keep their own clock.
  const rate = f.frenzy > 0 && a.index <= 1 && !s.air ? (f.data.frenzy?.rate ?? FRENZY_RATE) : 1;
  a.t += dt * rate;
  // 狂化: every attack trails an afterimage frozen on the frame it stamped, one behind her live pose.
  // Nono国王 keeps the frenzy clock for the staff buffs, but the cape form has no ghosts.
  if (f.frenzy > 0 && !f.king && Math.floor(a.t * 16) !== Math.floor((a.t - dt * rate) * 16)) {
    const clip = clipFor(f);
    g.effect('ghost', f.x - f.facing * 20, f.y, f.data.color, .28, { fighter: f.id, alpha: .5, tint: f.data.frenzy?.tint ?? FRENZY_TINT, sheet: clip.sheet, col: clip.col, row: clip.row, facing: f.facing });
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

/** Repel pulse while the drums super is up: anyone closing in gets bounced. Returns whether anyone was pushed. */
function repelPulse(g: FightGame, f: Fighter, power: number): boolean {
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
}

  // 满场: the kit stays up for the sit; nearby foes are bounced on every pulse. No extra hit.
  if (s.fx === 'drums' && !a.emitted) {
    a.emitted = true;
    repelPulse(g, f, DRUM_REPEL_PUSH);
    g.effect('drums', f.x, f.y, f.data.color, s.duration, { dir: f.facing });
  }
  if (s.fx === 'drums' && a.t < s.duration) {
    const prev = Math.floor(Math.max(0, a.t - dt) / DRUM_REPEL_EVERY);
    const cur = Math.floor(a.t / DRUM_REPEL_EVERY);
    if (cur > prev && repelPulse(g, f, DRUM_REPEL_PUSH)) {
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

  // 来去如风: no travel at all — the wind coil bursts where she stood and she steps out ahead.
  if (s.fx === 'wind' && !a.emitted && a.t >= s.start) {
    a.emitted = true;
    g.effect('wind', f.x, f.y - 85, f.data.color, .45, { dir: f.facing });
    f.x = clamp(f.x + f.facing * s.range, X_MIN, X_MAX);
    g.effect('wind', f.x, f.y - 85, f.data.color, .45, { dir: -f.facing });
    g.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
  }
  // 哭泣的紫罗兰: burst where she stood, ride the petals out, burst again on the far edge.
  if (s.fx === 'violet' && !a.emitted && a.t >= s.start) {
    a.emitted = true;
    violetBurst(g, f, s);
  }
  if (s.fx === 'violet' && a.emitted && a.shots === 0 && a.t >= s.start + VIOLET_WARP) {
    a.shots = 1;
    f.x = f.x < W / 2 ? X_MAX : X_MIN;
    const foe = g.targetFor(f);
    if (foe) f.facing = foe.x >= f.x ? 1 : -1;
    g.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
    violetBurst(g, f, s);
  }
  // 剪: the spot is read once at cast — the mark freezes where the enemy stood and pinches shut.
  // The wind-up is the window to leave it; nothing tracks them after that.
  if (s.fx === 'snip' && a.t < s.start) {
    if (a.shots === 0) {
      a.shots = 1;
      const mark = g.opponents(f)
        .filter(o => Math.abs(o.x - f.x) <= s.range)
        .sort((p, q) => Math.abs(p.x - f.x) - Math.abs(q.x - f.x))[0];
      a.anchor = mark ? mark.x : f.x;
    }
    let live = g.effects.find(e => e.type === 'snip-mark' && e.fighter === f.id);
    if (!live) {
      g.effect('snip-mark', a.anchor, FLOOR - 85, f.data.color, s.start, { fighter: f.id });
      live = g.effects[g.effects.length - 1];
    }
    live.x = a.anchor;
    live.y = FLOOR - 85;
    live.max = s.start;
    live.life = Math.max(.04, s.start - a.t);
  }
  // 火的故事: the void bow condenses over the draw; its spread reads the time left on the tell.
  if (s.fx === 'fuga' && a.t < s.start) {
    let live = g.effects.find(e => e.type === 'fuga-bow' && e.fighter === f.id);
    if (!live) {
      g.effect('fuga-bow', f.x, f.y - 85, f.data.color, s.start, { fighter: f.id, dir: f.facing });
      live = g.effects[g.effects.length - 1];
    }
    live.x = f.x;
    live.y = f.y - 85;
    live.dir = f.facing;
    live.max = s.start;
    live.life = Math.max(.04, s.start - a.t);
  }
  if (s.type === 'dash' && s.fx !== 'wind' && s.fx !== 'violet' && a.t >= s.start && a.t < s.duration - .08) {
    // 微笑大回旋: one mid-flight reversal, then later inputs ride out the whirl. Held straight,
    // it is the stock dash line — the flag is what keeps it from becoming a pinball.
    if (s.fx === 'cartwheel' && !a.flipped) {
      const held = heldDir(g, f);
      if (held !== 0 && held !== f.facing) {
        f.facing = held > 0 ? 1 : -1;
        a.flipped = true;
      }
    }
    f.x += f.facing * (s.speed ?? (s.super ? 820 : 580)) * dt;
    applyMelee(g, f, a);
    // 微笑大回旋: the spin reads as separated poses, not a smear — one spaced stamp every
    // eighth of a second. The stock dash line fires on floor(a.t * 30) % 3, which stays true
    // for four consecutive fixed steps and quadruple-stamps the same spot; other dashes keep it.
    if (s.fx === 'cartwheel') {
      if (Math.floor(a.t * 8) !== Math.floor((a.t - dt) * 8)) g.effect('ghost', f.x - f.facing * 18, f.y, f.data.color, .18, { fighter: f.id, alpha: .3 });
    } else if (Math.floor(a.t * 30) % 3 === 0) g.effect('ghost', f.x - f.facing * 18, f.y, f.data.color, .18, { fighter: f.id, alpha: .3 });
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
  // 食兔者 / 抱抱还是亲亲: a short lunge, then a pin. Bites let go standing; the fifth kiss knocks down.
  if (s.fx === 'rabbit' || s.fx === 'kiss') {
    if (!a.emitted) a.emitted = true;
    const kiss = s.fx === 'kiss';
    const lunge = kiss ? .24 : .3;
    const gap = kiss ? .3 : .2;
    const bites = kiss ? 5 : 3;
    const reach = kiss ? 48 : 52;
    if (a.hold < 0 && a.t >= s.start && a.t < s.start + lunge) {
      let caught: Fighter | undefined;
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const front = (o.x - f.x) * f.facing >= -20;
        if (!front || Math.abs(o.y - f.y) >= 112) continue;
        if ((o.x - f.x) * f.facing < 70) { caught = o; break; }
      }
      if (caught) {
        a.hold = caught.id;
        a.tossAt = a.t;
        f.x = clamp(caught.x - f.facing * reach, X_MIN, X_MAX);
        g.hitstop = Math.max(g.hitstop, .06);
        g.effect('grab', caught.x, caught.y - 80, f.data.color, .25, { radius: 48 });
        caught.stun = Math.max(caught.stun, .35);
        caught.vx = 0;
        caught.vy = 0;
        caught.knocked = 0;
        caught.attack = null;
        caught.queue = [];
      } else {
        f.x = clamp(f.x + f.facing * (s.speed ?? (kiss ? 420 : 580)) * dt, X_MIN, X_MAX);
        if (f.x === X_MIN || f.x === X_MAX) a.t = Math.max(a.t, s.duration - .2);
      }
    }
    // Whiff only. A finished pin has tossAt set; pulling t backward here froze her in the recover pose forever.
    if (a.hold < 0 && a.tossAt === 0 && a.t >= s.start + lunge && a.t < s.duration - .2) a.t = s.duration - .2;
    if (a.hold >= 0) {
      const o = g.fighters.find(p => p.id === a.hold);
      if (!o || o.hp <= 0) {
        a.t = s.duration;
      } else {
        o.x = clamp(f.x + f.facing * reach, X_MIN, X_MAX);
        o.y = FLOOR;
        o.vx = 0;
        o.vy = 0;
        o.knocked = 0;
        o.stun = Math.max(o.stun, .3);
        o.facing = (-f.facing) as 1 | -1;
        if (a.shots < bites && a.t >= a.tossAt + a.shots * gap) {
          a.hit = new Set();
          hit(g, f, o, s, a);
          g.effect(kiss ? 'kiss' : 'rabbit', o.x, o.y - (kiss ? 110 : 64), f.data.color, kiss ? .4 : .2, { radius: kiss ? 28 : 34 });
          a.shots++;
          if (a.shots >= bites) {
            a.hold = -1;
            a.t = Math.max(a.t, s.duration - .22);
          }
        }
      }
    }
  }
  // 和灯在一起的话: a short lunge, she catches a wrist, says the line, then plays the foe like a kit —
  // beats start slow and accelerate, and the last one double-kicks them across the stage.
  if (s.fx === 'vow') {
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
          // The catch lands with a freeze-frame, so the vow reads before the first beat.
          g.hitstop = Math.max(g.hitstop, .09);
          g.effect('grab', o.x, o.y - 80, f.data.color, .3, { radius: 55 });
          const line = f.hp < f.data.hp * .3 ? '反正我就是做不到像祥子那样好啊！' : '我发誓，和灯在一起的话，一辈子也可以。';
          g.text(line, o.x, o.y - 235, '#a9d3f5', 1.1, 15);
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
    // Whiff: nothing was ever caught, so the last clip frame is already up when the lunge ends.
    if (a.hold < 0 && a.tossAt === 0 && a.t >= s.start + .45) a.t = s.duration;
    if (a.hold >= 0) {
      const o = g.fighters.find(p => p.id === a.hold);
      if (!o || o.hp <= 0) {
        a.t = s.duration;
      } else {
        // Held by the wrist in front of her, pinned to the floor and turned to face her.
        o.x = f.x + f.facing * 58;
        o.y = FLOOR;
        o.vx = 0;
        o.vy = 0;
        o.knocked = 0;
        o.stun = Math.max(o.stun, .3);
        o.facing = (-f.facing) as 1 | -1;
        if (a.shots < VOW_BEATS && a.t >= a.tossAt + vowBeatTime(a.shots)) {
          a.hit = new Set();
          hit(g, f, o, s, a);
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
            // Release the wrist: the body flies free and a short recover plays out the clock.
            a.hold = -1;
            a.t = Math.max(a.t, s.duration - .35);
          }
        }
      }
    }
  }
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

  // 高性能作曲AI: a fixed lane. The falling notes are paint; the damage is this clock.
  if (s.fx === 'compose' && a.t >= s.start) {
    if (!a.emitted) {
      a.emitted = true;
      g.effect('compose', a.anchor + f.facing * 148, FLOOR, f.data.color, Math.max(.2, s.duration - s.start), { dir: f.facing, radius: 100, fighter: f.id });
      g.text(s.name, f.x, f.y - 190, f.data.color, .65, 17);
    }
    const near = a.anchor + f.facing * 48;
    const far = a.anchor + f.facing * 248;
    const lo = Math.min(near, far), hi = Math.max(near, far);
    while (a.shots < (s.count ?? 1) && a.t >= s.start + a.shots * (s.interval ?? .12)) {
      for (const o of g.opponents(f)) {
        if (o.x >= lo && o.x <= hi) composeTick(g, f, o, s);
      }
      a.shots++;
    }
  }

  const volley = a.burst || s.count || 1;
  if (s.type === 'projectile' && volley > 1 && s.fx !== 'snip' && s.fx !== 'smile-ship') {
    if (s.fx === 'drums') {
      while (a.shots < volley && a.t >= drumShotTime(s, a.shots)) {
        spawnRain(g, f, a, a.shots);
        a.shots++;
      }
    } else if (s.fx === 'parfait') {
      // 抹茶大芭菲: one standing zone; the blobs erupt from it on the zone's own clock in stepProjectiles.
      if (!a.emitted && a.t >= s.start) {
        a.emitted = true;
        spawnShot(g, f, a);
        g.effect('parfait', clamp(f.x + f.facing * PARFAIT_DIST, X_MIN, X_MAX), FLOOR, f.data.color, s.life ?? 6.5);
      }
    } else while (a.shots < volley && a.t >= s.start + a.shots * (s.interval ?? .14)) {
      if (s.fx === 'chord' && a.shots >= 3 && !attackHeld(g, f)) break;
      // 不甘的演奏: two notes leave the bass at the floor, the second a shade lower than the first.
      const off = s.fx === 'sob' ? (a.shots === 0 ? 45 : 70) : (a.shots % 3 - 1) * 15;
      spawnShot(g, f, a, off, a.shots);
      a.shots++;
    }
    if (s.fx === 'chord' && a.shots >= 3 && !attackHeld(g, f) && a.t < s.duration - .22) a.t = s.duration - .22;
    // 为什么要演奏春日影: the last wave carries the whole super, so the moment it leaves she is free to act.
    if (s.fx === 'shout' && a.shots >= volley) a.t = s.duration;
  } else if ((s.count ?? 1) > 1 && s.fx !== 'compose' && s.fx !== 'snip' && s.fx !== 'smile-ship') {
    // ponytail: N swings, one cooldown. Each swing gets a fresh hit set so the same target can be caught again.
    while (a.shots < (s.count ?? 1) && a.t >= s.start + a.shots * (s.interval ?? .11)) {
      // 吉他激奏 / 韵律直觉: past the first wave the key has to stay down.
      if ((s.fx === 'riff' || s.fx === 'groove') && a.shots >= 1 && !attackHeld(g, f)) break;
      const swing = SWING_RING[a.shots % SWING_RING.length];
      if (a.shots === 0 && a.index >= 2) g.text(s.name, f.x, f.y - 190, f.data.color, .65, 17);
      a.hit = new Set();
      if (s.fx === 'riff') {
        a.skill = riffShot(s, a.shots);
        applyMelee(g, f, a);
        g.effect('riff', f.x, f.y - 85, f.data.color, .4, { radius: a.skill.range });
      } else if (s.fx === 'crown') {
        // 五冠王的威压: every wave is its own copy — wider, harder, shove-ier.
        a.skill = crownShot(s, a.shots);
        applyMelee(g, f, a);
        g.effect('crown', f.x, f.y - 85, f.data.color, .45, { radius: a.skill.range });
      } else if (s.fx === 'groove') {
        applyMelee(g, f, a);
        g.effect('burst', f.x, f.y - 80, f.data.color, .22, { radius: s.range });
        // The tap is the ring only. Notes start on the second pulse.
        if (a.shots >= 1) spawnGrooveNote(g, f, a);
      } else {
        applyMelee(g, f, a);
        if (s.fx === 'flurry') {
          // 高能量！: every punch stamps an afterimage of the pose she just threw.
          g.effect('ghost', f.x - f.facing * 14, f.y, f.data.color, .22, { fighter: f.id, alpha: .4 });
        } else if (s.fx !== 'mortis' && s.fx !== 'spin') {
          g.effect(s.fx, f.x + f.facing * swing.x, f.y + swing.y, f.data.color, .18, { dir: f.facing * swing.dir, radius: s.range * .34 });
        }
      }
      a.shots++;
      if (s.fx === 'riff' && a.shots > 1) {
        // The first wave is the tap at base cooldown; every wave past it lengthens the cooldown clock.
        f.cooldowns[a.index] = Math.min(RIFF_CD_MAX, f.cooldowns[a.index] + f.cdMul * (RIFF_CD_MAX - RIFF_CD_TAP) / (RIFF_WAVES - 1));
      }
      if (s.fx === 'groove' && a.shots > 1) {
        f.cooldowns[a.index] = Math.min(GROOVE_CD_MAX, f.cooldowns[a.index] + f.cdMul * (GROOVE_CD_MAX - GROOVE_CD_TAP) / (GROOVE_WAVES - 1));
      }
    }
    if ((s.fx === 'riff' || s.fx === 'groove') && a.shots >= 1 && !attackHeld(g, f) && a.t < s.duration - .3) a.t = s.duration - .3;
  } else if (!a.emitted && a.t >= s.start) {
    a.emitted = true;
    if (s.fx === 'world') {
      // 此即世界: the chant ends the freeze. The pulse roots every opponent outright — no
      // damage, nothing to block or dodge; seconds, tier and break rule all come from the skill.
      for (const o of g.opponents(f)) {
        if (o.hp <= 0) continue;
        o.root = s.root ?? 0;
        o.rootLevel = s.rootLevel ?? 'move';
        o.rootBreak = s.rootBreak ?? 0;
        o.rootHits = 0;
        o.rootFx = s.fx;
        o.dodge = 0;
        o.vy = 0;
        o.knocked = 0;
        o.stun = Math.max(o.stun, .25);
        g.effect('world-heart', o.x, o.y - 85, f.data.color, 1.6, { radius: 92 });
        g.text('定身!', o.x, o.y - 195, '#ffd27a', .6, 20);
      }
      g.flash = Math.max(g.flash, .25);
      g.timeStop = null;
      a.t = Math.max(a.t, s.duration);
    } else if (s.fx === 'resolve') {
      // 就由我来结束一切: no strike, just the mask dropping. The ripple shoves everyone away; the frenzy clock starts here.
      f.frenzy = f.data.frenzy?.time ?? FRENZY_TIME;
      g.effect('resolve', f.x, f.y - 80, f.data.color, .75, { radius: RESOLVE_REPEL_RANGE });
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) < RESOLVE_REPEL_RANGE) {
          o.vx = (Math.sign(dx) || f.facing) * RESOLVE_REPEL_PUSH;
          o.stun = Math.max(o.stun, .22);
        }
      }
    } else if (s.fx === 'muscle') {
      // 高肌肉！: no strike either — the double-biceps flex shoves the crowd and arms the damage buff.
      f.muscle = MUSCLE_TIME;
      g.effect('muscle', f.x, f.y - 80, f.data.color, .75, { radius: s.range });
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) < s.range) {
          o.vx = (Math.sign(dx) || f.facing) * MUSCLE_REPEL_PUSH;
          o.stun = Math.max(o.stun, .2);
        }
      }
    } else if (s.fx === 'dream') {
      // 梦想即力量！: the golden burst shoves like the sing, then the frenzy and the brace run
      // together — and the meter locks (禁回) for the whole window, the pay-off can't fund itself.
      const time = f.data.frenzy?.time ?? FRENZY_TIME;
      f.frenzy = time;
      f.braced = Math.max(f.braced, time);
      f.noGain = time;
      g.effect('dream', f.x, f.y - 80, f.data.color, .9, { radius: s.range });
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) < s.range) {
          o.vx = (Math.sign(dx) || f.facing) * DREAM_REPEL_PUSH;
          o.stun = Math.max(o.stun, .2);
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
    } else if (s.fx === 'half') {
      // 对半分: a softer copy steps out behind the foe.
      g.summonHalf(f);
    } else if (s.fx === 'king') {
      // Nono国王: glow, cape, then the staff form. No armour — the push only makes room for the first swing.
      const time = f.data.frenzy?.time ?? 7;
      f.frenzy = time;
      f.noGain = time;
      f.king = true;
      g.effect('king', f.x, f.y - 80, f.data.color, .7, { radius: s.range });
      for (const o of g.opponents(f)) {
        if (o.hp <= 0 || o.invuln > 0) continue;
        const dx = o.x - f.x;
        if (Math.abs(dx) < s.range) {
          o.vx = (Math.sign(dx) || f.facing) * 380;
          o.stun = Math.max(o.stun, .2);
        }
      }
    } else if (s.fx === 'marathon') {
      // 秋叶原马拉松: the pose itself does nothing. Speed and poise start only if it finishes.
    } else if (s.fx === 'steak') {
      // 大份牛排: the bite is the active frame. Wind-up that gets hit never reaches here.
      f.hp = Math.min(f.data.hp, f.hp + STEAK_HEAL);
      f.braced = Math.max(f.braced, STEAK_BRACE);
      g.text(`+${STEAK_HEAL}`, f.x, f.y - 160, '#ffd0d8', .6, 18);
      g.effect('steak', f.x, f.y - 118, '#6eb6ff', .55, { dir: f.facing });
    } else if (s.fx === 'infinite') {
      // 直接无限大: the pose is the switch. The bill window and the gain lock run together from here.
      f.debt = 4;
      f.debtDmg = 0;
      f.noGain = Math.max(f.noGain, 4);
      g.effect('burst', f.x, f.y - 80, f.data.color, .7, { radius: 120 });
    } else if (s.fx === 'feast') {
      // 超恢复: brace, regen and the J/K lock share one window. A later steak must not shorten it.
      // The side arcs are drawn while feast > 0, so they leave with the buff.
      f.braced = Math.max(f.braced, FEAST_TIME);
      f.feast = FEAST_TIME;
      g.effect('burst', f.x, f.y - 80, '#9ad4ff', .4, { radius: 80 });
    } else if (s.fx === 'snip') {
      // 剪: the tell dies with the lock. The void field plants on the frozen spot, not on the runner.
      const mark = g.effects.find(e => e.type === 'snip-mark' && e.fighter === f.id);
      if (mark) mark.life = 0;
      if (!a.shots) {
        a.shots = 1;
        const caught = g.opponents(f)
          .filter(o => Math.abs(o.x - f.x) <= s.range)
          .sort((p, q) => Math.abs(p.x - f.x) - Math.abs(q.x - f.x))[0];
        a.anchor = caught ? caught.x : f.x;
      }
      g.projectiles.push({
        owner: f.id, x: a.anchor, y: FLOOR - 85, vx: 0, vy: 0,
        life: s.life ?? .8, skill: s, color: f.data.color,
        radius: 24, size: s.size ?? 105, fx: 'snip',
        attack: a, hit: new Set(), trail: [], age: 0,
      });
    } else if (s.fx === 'fuga') {
      // 火的故事: the bow dissolves with the release. The arrow flies level until something ends it,
      // and she is free the moment it leaves — the flight is the recover.
      const bow = g.effects.find(e => e.type === 'fuga-bow' && e.fighter === f.id);
      if (bow) bow.life = 0;
      g.projectiles.push({
        owner: f.id, x: f.x + f.facing * 53, y: FLOOR - 85,
        vx: f.facing * (s.speed ?? 200), vy: 0,
        life: s.life ?? 6, skill: s, color: f.data.color,
        radius: 30, size: s.size ?? 160, fx: 'fuga',
        attack: a, hit: new Set(), trail: [], age: 0,
      });
      // The draw is protected; the flight is not. Her own blast can catch her the moment it leaves.
      f.invuln = Math.min(f.invuln, s.start);
      a.t = Math.max(a.t, s.duration);
    } else if (s.type === 'projectile') {
      if (s.fx === 'donut') a.skill = donutVariant(g, s);
      spawnShot(g, f, a);
    } else if (s.type !== 'dash' && s.fx !== 'slam' && s.fx !== 'onegai' && s.fx !== 'vow' && s.fx !== 'compose' && s.fx !== 'record') {
      if (s.type !== 'upper') applyMelee(g, f, a);
      if (s.fx === 'ripple') g.effect('ripple', f.x, FLOOR, f.data.color, .45, { radius: s.range });
      else if (s.fx === 'huh') g.effect('huh', f.x, FLOOR, f.data.color, .5, { radius: s.range });
      else if (s.fx === 'howl') g.effect('howl', f.x, f.y - 80, f.data.color, .4, { radius: s.range });
      else if (s.fx === 'yokan') g.effect('yokan', f.x + f.facing * 70, FLOOR, f.data.color, .28, { dir: f.facing, radius: 80 });
      else if (s.fx === 'rib') g.effect('slash', f.x + f.facing * 65, f.y - 83, f.data.color, .22, { dir: f.facing, radius: s.range * .5 });
      else g.effect(s.fx, f.x + f.facing * 65, f.y - (s.type === 'sweep' ? 22 : 83), f.data.color, .22, { dir: f.facing, radius: s.range * .5 });
    }
    if (a.index >= 2 && !s.super) g.text(s.name, f.x, f.y - 190, f.data.color, .65, 17);
  }

  syncGuitar(g, f, a);
  if (a.t >= s.duration) {
    if (s.fx === 'marathon' && f.attack === a && f.hp > 0 && f.stun <= 0) {
      f.sprint = MARATHON_TIME;
      f.poise = MARATHON_TIME;
      g.effect('marathon', f.x, f.y - 70, f.data.color, .55, { radius: 80 });
    }
    // 录音: a finished pose starts the tape — the stand-in rises where she stands.
    if (s.fx === 'record' && f.attack === a && f.hp > 0 && f.stun <= 0) g.spawnEcho(f);
    if (f.attack === a) f.attack = null;
  }
}

/** 九字真言: the first overlap commits six hits. Later ticks ignore the body, so a wall or a short tail cannot drop them. */
function stepSeal(g: FightGame, p: Projectile, owner: Fighter): void {
  if (!p.marks) p.marks = new Map();
  let touching = false;
  for (const target of g.opponents(owner)) {
    if (target.hp <= 0 || p.life <= 0) continue;
    const near = Math.abs(p.x - target.x) < 38 + p.radius && Math.abs(p.y - (target.y - 83)) < 72;
    if (near) touching = true;
    if (p.marks.has(target.id) || !near) continue;
    const dir = Math.sign(p.vx || 1);
    const sk = { ...p.skill, knock: 0 };
    if (!hit(g, owner, target, sk, { hit: new Set() }, p.x - dir * 40)) continue;
    p.marks.set(target.id, { n: 1, next: 0 });
    g.effect('burst', p.x, p.y, p.color, .2, { radius: p.size * .4 });
    g.sealVolleys.push({
      owner: owner.id, target: target.id, n: 1, wait: p.skill.interval ?? .07, dir, color: p.color, skill: p.skill,
    });
  }
  p.swellTo = touching ? 1 : 0;
}

const SEAL_SWELL_TIME = .1;

/** Linear approach. One add per circle; hitstop keeps ticking it so the grow reads on the frozen hit. */
export function easeSealSwells(g: FightGame, dt: number): void {
  const step = dt / SEAL_SWELL_TIME;
  for (const p of g.projectiles) {
    if (p.fx !== 'seal') continue;
    const cur = p.swell ?? 0;
    const to = p.swellTo ?? 0;
    if (cur === to) continue;
    p.swell = cur < to ? Math.min(to, cur + step) : Math.max(to, cur - step);
  }
}

function stepSealVolleys(g: FightGame, dt: number): void {
  // 剪: the field's string runs its own count with the skill's own finale knock; the seal stays six.
  const cap = (v: SealVolley) => v.skill.fx === 'snip' ? (v.skill.count ?? 4) : SEAL_HITS;
  for (const v of g.sealVolleys) {
    if (v.n >= cap(v)) continue;
    v.wait -= dt;
    if (v.wait > 0) continue;
    const owner = g.fighterById(v.owner);
    const target = g.fighterById(v.target);
    v.n += 1;
    v.wait = v.skill.interval ?? .07;
    if (!owner || !target || target.hp <= 0) { v.n = cap(v); continue; }
    const sk = { ...v.skill, knock: v.n >= cap(v) ? (v.skill.knock ?? SEAL_FINALE_KNOCK) : 0 };
    if (hit(g, owner, target, sk, { hit: new Set() }, target.x - v.dir * 40)) {
      if (v.skill.fx === 'snip') g.effect('snip', target.x, target.y - 85, v.color, .22, { dir: v.dir, radius: 56 });
      else g.effect('burst', target.x, target.y - 80, v.color, .2, { radius: (v.skill.size ?? 140) * .4 });
    }
  }
  // ponytail: in-place cull, same reason as the projectile list — this runs every step.
  let w = 0;
  for (let i = 0; i < g.sealVolleys.length; i++) {
    const v = g.sealVolleys[i];
    if (v.n < cap(v)) g.sealVolleys[w++] = v;
  }
  g.sealVolleys.length = w;
}

/** Append to a capped trail. ponytail: the evicted point object is recycled as the newest head —
 *  a full-screen barrage would otherwise hand GC ~2000 short-lived points a second. */
function pushTrail(p: Projectile, cap: number): void {
  if (p.trail.length >= cap) {
    const head = p.trail.shift();
    if (head) { head.x = p.x; head.y = p.y; p.trail.push(head); }
    return;
  }
  p.trail.push({ x: p.x, y: p.y });
}

export function stepProjectiles(g: FightGame, dt: number): void {
  for (const p of g.projectiles) {
    p.life -= dt;
    p.age += dt;
    if (p.fx === 'parfait') {
      // 抹茶大芭菲: the parfait lobs one blob per interval, sides alternating, until the volley runs out.
      const owner = g.fighterById(p.owner);
      if (!owner) continue;
      const tick = Math.floor(p.age / (p.skill.interval ?? .28));
      if (tick !== p.ticked && tick < (p.skill.count ?? 22)) {
        p.ticked = tick;
        spawnMatchaBlob(g, owner, p, tick);
      }
      continue;
    }
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
    if (p.fx === 'mega') {
      // 高音量！: a travelling wall of sound. Anyone inside is carried along at its push speed
      // until the wave passes them — blockers brace against it, jumpers clear it like the hit.
      const owner = g.fighterById(p.owner);
      if (!owner) continue;
      for (const o of g.opponents(owner)) {
        if (o.hp <= 0 || o.invuln > 0 || o.blocking) continue;
        if (Math.abs(o.x - p.x) < 38 + p.radius && Math.abs(p.y - (o.y - 83)) < 72) {
          o.vx = Math.sign(p.vx || 1) * MEGA_PUSH;
        }
      }
    }
    if (p.fx === 'smile-ship') {
      // 微笑号出航: the picture is the truth. The strike zone spans the hull itself, narrowed by
      // the sprite's blank leading margin (SHIP_BLANK of the picture width), so nothing lands
      // before the visible bow reaches a body and nothing lands after the stern has passed. The
      // hull carries anyone in the waterline at its own speed — a body shoved into the wall
      // still has the hull over it, so the full string can land: twelve per body, one per
      // interval window, segment seven onward at a fifth. Blockers brace (chip only, no ride),
      // jumpers clear the waterline like any shot.
      const dir = Math.sign(p.vx) || 1;
      const u = Math.min(1, Math.max(0, (p.age - SHIP_HOLD) / SHIP_SWEEP));
      const front = dir > 0 ? u * 2 * W - SHIP_BLANK * W : W - u * 2 * W + SHIP_BLANK * W;
      const stern = front - dir * (1 - SHIP_BLANK) * W;
      p.x = front;
      pushTrail(p, 12);
      if (p.age >= SHIP_HOLD + SHIP_SWEEP) { p.life = 0; continue; }
      if (p.age < SHIP_HOLD) continue;
      const lo = Math.min(front, stern), hi = Math.max(front, stern);
      const owner = g.fighterById(p.owner);
      if (owner) {
        for (const o of g.opponents(owner)) {
          if (o.hp <= 0 || o.invuln > 0) continue;
          if (o.x > hi + 38 || o.x < lo - 38 || Math.abs(p.y - (o.y - 83)) >= 72) continue;
          if (!o.blocking) o.vx = dir * SHIP_PUSH;
          const mark = p.marks?.get(o.id);
          let n = 1;
          if (mark) {
            if (mark.n >= SHIP_SEGMENTS || p.age < mark.next) continue;
            mark.n++;
            mark.next = p.age + (p.skill.interval ?? .12);
            n = mark.n;
          } else {
            if (!p.marks) p.marks = new Map();
            p.marks.set(o.id, { n: 1, next: p.age + (p.skill.interval ?? .12) });
          }
          const seg = n > SHIP_FULL ? { ...p.skill, damage: p.skill.damage * SHIP_TAIL_MUL } : p.skill;
          if (hit(g, owner, o, seg, { hit: new Set() }, o.x - dir * 40)) {
            g.effect('burst', o.x, p.y, p.color, .3, { radius: p.size * .45 });
          }
        }
      }
      continue;
    }
    if (p.fx === 'snip') {
      // 剪: a standing void field. The first body inside commits the whole multi-cut string;
      // the field keeps waiting for anyone else who steps in before it fades.
      const owner = g.fighterById(p.owner);
      if (!owner) continue;
      if (!p.marks) p.marks = new Map();
      for (const o of g.opponents(owner)) {
        if (o.hp <= 0 || p.life <= 0) continue;
        if (p.marks.has(o.id)) continue;
        if (Math.abs(p.x - o.x) >= SNIP_BAND_X || Math.abs(p.y - (o.y - 83)) >= SNIP_BAND_Y) continue;
        const dir = Math.sign(o.x - p.x) || 1;
        if (!hit(g, owner, o, { ...p.skill, knock: 0 }, { hit: new Set() }, p.x)) continue;
        p.marks.set(o.id, { n: 1, next: 0 });
        g.effect('snip', p.x, p.y, p.color, .22, { dir, radius: 56 });
        g.sealVolleys.push({ owner: owner.id, target: o.id, n: 1, wait: p.skill.interval ?? .15, dir, color: p.color, skill: p.skill });
      }
      continue;
    }
    if (p.fx === 'fuga') {
      // 火的故事: level flight, contact or the far edge ends it, and the blast does the talking.
      p.x += p.vx * dt;
      // History long enough for the golden afterimages to reach a few body-lengths behind.
      pushTrail(p, 48);
      const owner = g.fighterById(p.owner);
      // The fuse: no detonation for the first stretch of flight, so the arrow visibly leaves
      // the bow — and a point-blank blast lands just after her cast invuln is gone.
      let boom = false;
      if (p.age >= FUGA_FUSE) {
        if (owner) {
          for (const o of g.opponents(owner)) {
            if (o.hp <= 0 || o.invuln > 0) continue;
            if (Math.abs(p.x - o.x) < 38 + p.radius && Math.abs(p.y - (o.y - 83)) < 72) { boom = true; break; }
          }
        }
        if (!boom && ((p.vx < 0 && p.x <= X_MIN + 6) || (p.vx > 0 && p.x >= X_MAX - 6))) boom = true;
      }
      if (boom) {
        fugaBurst(g, p, owner);
        p.life = 0;
      }
      continue;
    }
    // Outbound half, then one turn. The hit list clears so the way back can connect again.
    if (p.fx === 'cucumber' && !p.returned && p.age >= (p.skill.life ?? 2.4) / 2) {
      p.vx = -p.vx;
      p.hit.clear();
      p.returned = true;
    }
    if ((p.fx === 'milk' || p.fx === 'bag' || p.fx === 'matcha') && !p.settled) p.vy += GRAVITY * dt;
    const owner = g.fighterById(p.owner);
    if (p.fx === 'groove-note' && owner && owner.hp > 0) {
      const foe = g.nearestEnemyTo(owner, p.x);
      if (foe) {
        const dx = foe.x - p.x;
        const spd = Math.abs(p.vx) || 250;
        const ang = Math.atan2(0, p.vx || 1);
        let diff = Math.atan2(0, dx || 1) - ang;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-GROOVE_TURN * dt, Math.min(GROOVE_TURN * dt, diff));
        p.vx = Math.cos(ang + turn) * spd;
        p.vy = 0;
      }
    }
    if (p.fx === 'chord' && owner && owner.hp > 0) {
      const foe = g.nearestEnemyTo(owner, p.x);
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
    if (p.fx === 'meat') {
      // Lives until she touches it. The per-frame decay above is undone unless this pass ends it.
      p.life += dt;
      if (p.x <= X_MIN && p.vx < 0) { p.x = X_MIN; p.vx = -p.vx; p.hit.clear(); }
      else if (p.x >= X_MAX && p.vx > 0) { p.x = X_MAX; p.vx = -p.vx; p.hit.clear(); }
      if (!owner || owner.hp <= 0) p.life = 0;
      else if (Math.abs(p.x - owner.x) < 38 + p.radius && Math.abs(p.y - (owner.y - 83)) < 72) p.life = 0;
    }
    if (p.fx === 'juggle-ball') {
      // 抛球杂耍: a pinball off three walls. Each bounce reflects the flight, tilts it by up to
      // JUGGLE_JITTER, and speeds it up 20% to at most double the launch speed, and clears the
      // hit list so the next pass can connect. The component floors
      // keep the ball crossing the stage and climbing or dropping — never stalled on either axis.
      let reflectX = false;
      let reflectY = false;
      if (p.x <= X_MIN && p.vx < 0) { p.x = X_MIN; reflectX = true; }
      else if (p.x >= X_MAX && p.vx > 0) { p.x = X_MAX; reflectX = true; }
      if (p.y <= JUGGLE_TOP && p.vy < 0) { p.y = JUGGLE_TOP; reflectY = true; }
      else if (p.y >= FLOOR && p.vy > 0) { p.y = FLOOR; reflectY = true; }
      if (reflectX || reflectY) {
        const outX = reflectX ? -p.vx : p.vx;
        const outY = reflectY ? -p.vy : p.vy;
        const speed = Math.min(Math.hypot(outX, outY) * JUGGLE_ACCEL, (p.v0 ?? Math.hypot(outX, outY)) * JUGGLE_MAX_MUL);
        const ang = Math.atan2(outY, outX) + (Math.random() * 2 - 1) * JUGGLE_JITTER;
        let cs = Math.cos(ang);
        let sn = Math.sin(ang);
        if (Math.abs(cs) < JUGGLE_MIN_CROSS) cs = Math.sign(outX || 1) * JUGGLE_MIN_CROSS;
        if (Math.abs(sn) < JUGGLE_MIN_RISE) sn = Math.sign(outY || 1) * JUGGLE_MIN_RISE;
        const m = Math.hypot(cs, sn);
        p.vx = cs / m * speed;
        p.vy = sn / m * speed;
        p.hit.clear();
      }
    }
    if ((p.fx === 'milk' || p.fx === 'bag' || p.fx === 'matcha') && !p.settled && p.y >= FLOOR) {
      p.y = FLOOR;
      if (p.fx === 'matcha') {
        // 抹茶熔岩 pops where it lands; direct hits only, so the splash is just paint.
        p.life = 0;
        g.effect('burst', p.x, FLOOR - 8, p.color, .3, { radius: 44 });
      } else if (p.fx === 'bag') p.life = 0;
      else {
        p.vx = 0;
        p.vy = 0;
        p.settled = true;
        p.life = 3;
        p.hit.clear();
      }
    }
    // 抛球杂耍: the gold trail stretches with the ball — the cap rides the speed from the
    // launch baseline (10 points) up to the 2× speed ceiling (20), so every bounce leaves
    // a longer ribbon behind.
    const trailCap = p.fx === 'mutsumi-note' || p.fx === 'chord' || p.fx === 'sob' ? 14
      : p.fx === 'juggle-ball' ? Math.round(10 * clamp(Math.hypot(p.vx, p.vy) / (p.v0 ?? 1), 1, 2))
      : p.fx === 'wink' ? 10 : 7;
    pushTrail(p, trailCap);
    if (p.settled && p.fx === 'milk' && owner && owner.hp > 0 && Math.abs(owner.x - p.x) < 40 && owner.y >= FLOOR - 1) {
      gainEnergy(owner, 26);
      p.life = 0;
      g.text('+26', owner.x, owner.y - 170, owner.data.color, .6, 18);
    }
    if (owner && p.fx === 'seal') stepSeal(g, p, owner);
    else if (owner) for (const target of g.opponents(owner)) {
      if (!p.settled && p.life > 0 && Math.abs(p.x - target.x) < 38 + p.radius && Math.abs(p.y - (target.y - 83)) < 72) {
        if (hit(g, owner, target, p.skill, { hit: p.hit }, p.x - Math.sign(p.vx) * 40)) {
          g.effect('burst', p.x, p.y, p.color, .3, { radius: p.size * .8 });
          // 世界微笑 impact pulse: the wave's own grin swells once off the victim — ghostly,
          // fast, gone, and ~150% of the victim's height at full swell.
          if (p.fx === 'smile-wave') {
            const h = target.data.view.kind === 'sprite' ? target.data.view.height : 181;
            g.effect('smile-pulse', target.x, target.y - 83, p.color, .28, { radius: h * 1.5, dir: Math.sign(p.vx) || 1 });
          }
          // The cucumber stays up on the way out and only pops on the return hit; the mega wave
          // washes through and keeps carrying whoever it caught; the juggle ball is a bout of
          // interference, not a shell.
          if (!(p.fx === 'cucumber' && !p.returned) && p.fx !== 'mega' && p.fx !== 'meat' && p.fx !== 'juggle-ball') p.life = 0;
          break;
        }
      }
    }
  }
  // Opposing shots cancel each other. Owner lookups are hoisted: the pair loop ran two linear
  // scans per pair (~10k element visits a second during barrage supers) for the same answer.
  const owners: (Fighter | undefined)[] = new Array(g.projectiles.length);
  for (let i = 0; i < g.projectiles.length; i++) owners[i] = g.fighterById(g.projectiles[i].owner);
  for (let i = 0; i < g.projectiles.length; i++) {
    for (let j = i + 1; j < g.projectiles.length; j++) {
      const p = g.projectiles[i], q = g.projectiles[j];
      // Shots die on each other; the well is a zone, so shots pass through it.
      // 剪 is the same kind of zone, the fuga arrow is a super nobody pecks down, and the
      // cruise shrugs pebbles off — but the juggle ball is mortal like any shot.
      if (!p.settled && !q.settled && p.fx !== 'blackhole' && q.fx !== 'blackhole' && p.fx !== 'parfait' && q.fx !== 'parfait' && p.fx !== 'seal' && q.fx !== 'seal' && p.fx !== 'meat' && q.fx !== 'meat' && p.fx !== 'snip' && q.fx !== 'snip' && p.fx !== 'fuga' && q.fx !== 'fuga' && p.fx !== 'smile-ship' && q.fx !== 'smile-ship' && g.isEnemy(owners[i], owners[j]) && p.life > 0 && q.life > 0 && Math.abs(p.x - q.x) < 25 && Math.abs(p.y - q.y) < 27) {
        p.life = q.life = 0;
        g.sparks(p.x, p.y, '#fff', 12);
      }
    }
  }
  // ponytail: in-place cull — this ran every step and the filter allocated even when nothing died.
  let w = 0;
  for (let i = 0; i < g.projectiles.length; i++) {
    const p = g.projectiles[i];
    // 微笑号的画面比弹丸中心宽一整屏，中心出界时船尾还在画面里。
    const onStage = p.fx === 'smile-ship' || (p.x > -60 && p.x < W + 60);
    if (p.life > 0 && onStage && p.y < FLOOR + 60) g.projectiles[w++] = p;
  }
  g.projectiles.length = w;
  stepSealVolleys(g, dt);
  easeSealSwells(g, dt);
}
