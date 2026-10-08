/* Pure data shapes. Nothing here knows about pixels or the DOM. */

import type { BandId } from './bands.ts';

export type SkillType =
  | 'light' | 'heavy' | 'dash' | 'projectile' | 'grab'
  | 'upper' | 'sweep' | 'endure' | 'launch';

/** How tightly 定身 holds the body. 'move' is the arcade root: legs locked, attacks and blocks
 *  stay open. 'freeze' is the time-stop tier: the pose holds and nothing comes out at all. */
export type RootLevel = 'move' | 'freeze';

/** What a clean hit does to the body, once root / ban / seal / shove have had their say.
 *  Unset kind falls through to the type default (launch floats, grab/super/upper/sweep knock down). */
export type ReactKind = 'none' | 'stand' | 'pin' | 'float' | 'knockdown' | 'launch';

export interface HitReact {
  kind?: ReactKind;
  stun?: number;
  vy?: number;
  knocked?: number;
  /** Pin the feet: vx and vy cleared after knockback. */
  holdStill?: boolean;
  /** 求你了: the hit shakes a root off before the launch. */
  clearRoot?: boolean;
  /** Plant the body on the floor (信用). */
  snapFloor?: boolean;
  /** The shove lands even when combo escape already set invuln (高能量末拳). */
  forceKnock?: boolean;
}

export interface Skill {
  key: string;
  name: string;
  type: SkillType;
  damage: number;
  /** Melee reach, or max travel for projectiles. */
  range: number;
  /** Seconds until the active frame. */
  start: number;
  /** Total seconds the move occupies the fighter. */
  duration: number;
  cd: number;
  /** Ult: no cooldown; costs `cost` energy, and the meter caps at it. */
  super: boolean;
  /** Super cost in 气. Default 100; the meter caps at max(100, cost) so a pricier super stays reachable. */
  cost?: number;
  /** Key into the renderer's FX table. */
  fx: string;
  /** 档二简述：战斗中唯一常显的一档，动作或类型 + 全部影响打法的机制，不带强度数字。
   *  写作规范见 docs/skill-desc-guide.md，硬规则由 scripts/selfcheck.ts 兜住。 */
  brief: string;
  /** 档三详述：同一套机制 + 数值行（伤害/段数/冷却/气）推不出来的数字。 */
  detail: string;
  /** Shared airborne normal; never lives in a character's skill list. */
  air?: boolean;
  speed?: number;
  count?: number;
  interval?: number;
  size?: number;
  life?: number;
  /** Startup invuln for dashes; for breakout skills, the invuln granted on every cast. */
  invuln?: number;
  /** Combo escape (e.g. 恐湖, 轮奏): stays buffered through a super and clears control on cast. */
  breakout?: boolean;
  /** Per-skill hit knockback velocity; falls back to the type default when unset.
   *  A blocked hit is 75 unless knockOnBlock is set, in which case this value is used (including 0). */
  knock?: number;
  /** Blocked hits keep `knock` instead of the 75 chip shove. */
  knockOnBlock?: boolean;
  /** Unblocked hits cut this much energy from the victim (raw, no multipliers). */
  drain?: number;
  /** Energy granted per unblocked hit; falls back to the 9 (2 for supers) arcade default. */
  gain?: number;
  /** Seconds of 脆弱 on a clean hit. The amount is frailBonus. */
  frail?: number;
  /** Extra damage taken during 脆弱. 0.2 is +20%, and it multiplies with every other factor. */
  frailBonus?: number;
  /** Seconds of 定身 on a clean hit. Unset means the move never roots. */
  root?: number;
  /** Clean hits the root can absorb before it breaks early. Default 2; 0 holds until the clock lifts it. */
  rootBreak?: number;
  /** 定身 also pins the body: vy and knockdown zeroed and held still for the whole root. */
  rootPin?: boolean;
  /** How completely the 定身 holds the body. Default 'move'. 'freeze' is the time-stop tier. */
  rootLevel?: RootLevel;
  /** 花道·缠: seconds of 减速 on a clean hit. A soft control — the body still acts, just duller. */
  slow?: number;
  /** Walk multiplier while 减速 holds. Default .6. */
  slowMul?: number;
  /** Jump launch-velocity multiplier while 减速 holds. Default .75 (height ≈ .56 of normal). */
  slowJump?: number;
  /** 蝶变: a blocked hit still applies `slow`. 花道·缠 leaves this unset and only slows clean hits. */
  slowOnBlock?: boolean;
  /** Clean-hit pose. Stun-only (no kind) just overrides hitstun. */
  react?: HitReact;
  /** Screen shake on a clean hit. Block and juggle keep their own numbers. */
  shake?: number;
  /** Hitstop on a clean hit. Block and juggle keep their own numbers. */
  hitstop?: number;
  /** Pierces dream-brace and is not written onto a debt bill. Grabs already do this. */
  control?: boolean;
  /** The blast hits teammates too (火的故事). */
  friendly?: boolean;
  /** A blocked projectile does not siphon the attacker's energy (剪, 火的故事). */
  noSiphon?: boolean;
  /** Clean hits with this move do not charge the attacker's gauge (这次是真的在唱！ self-feed guard). */
  noGauge?: boolean;
  /** No hit sparks (剪 draws its own burst). */
  noSparks?: boolean;
  /** Endure lasts the whole move, not only the windup (恐湖, 哈？). */
  holdEndure?: boolean;
  /** A jump press this many seconds into the move hops and drops it (这次是真的在唱！). */
  jumpCancel?: number;
  /** Active frames are true super armour (满月嚎叫). */
  superArmor?: boolean;
  /** Melee shape. Grabs default to radial unless this is 'front'. */
  hitbox?: 'front' | 'radial' | 'disc';
  /** Vertical reach. Sweeps default to ground. */
  reach?: 'ground' | 'low';
  /** A radial hit connects with everyone in the arc, instead of stopping at the first. */
  hitAll?: boolean;
  /** Last swing of a counted move. Spread over the base skill for that hit only. */
  finale?: Partial<Skill>;
  /** Timeless ops at the active frame. Replaces a self-buff branch. */
  onActive?: Op[];
  /** Timeless ops when the move ends without being interrupted. */
  onFinish?: Op[];
  /** Pin grab. rabbit / kiss / hug only; a third finale shape goes back to a script. */
  hold?: Hold;
  /** 'fall' drops under gravity until the floor axis settles the shot. */
  motion?: 'fall';
  /** 'pass' stays in the air after a hit. The default pops. */
  contact?: 'pass';
  /** Landing. 'pop' bursts above the floor; 'stick' waits to be picked up; 'drop' dies; 'splash' pops on the floor. */
  floor?: 'pop' | 'stick' | 'drop' | 'splash';
  /** False: other shots fly through. The default can be shot down. */
  solid?: boolean;
}

/** Scalar buffs a move can arm. The kernel still stores these on Fighter until mods.ts folds them. */
export type BuffKind = 'brace' | 'poise' | 'muscle' | 'shout' | 'feast' | 'box' | 'sprint' | 'noGain' | 'rose' | 'debt' | 'encore';

/** No clock of its own. Runs at one of the three gates the attack clock already has. */
export type Op =
  | { op: 'mod'; kind: BuffKind; time?: number; v?: number; set?: boolean; max?: boolean }
  | { op: 'form'; king?: boolean }
  | { op: 'repel'; range?: number; push: number; stun?: number }
  | { op: 'heal'; hp: number }
  | { op: 'fx'; type?: string; life: number; y?: number; radius?: number; dir?: boolean; floor?: boolean; color?: string; flash?: number; announce?: { color: string; life: number; size: number; y: number } }
  | { op: 'shot' }
  | { op: 'summon'; kind: 'ally' | 'half' };

/** Shared pin: lunge, catch, beats. Last-hit pose stays on Skill.finale. */
export interface Hold {
  lunge: number;
  reach: number;
  beats: number;
  gap: number;
  finale?: 'stand' | 'knockdown' | 'launch';
}

export type Trait = 'rush' | 'focus' | 'armor' | 'beat';

/** How a character is drawn. Swap the spec, not the code. PNG of the same grid replaces the SVG path. */
export type ViewSpec =
  | { kind: 'geometry'; build: 'slim' | 'bulky' | 'tall' }
  | { kind: 'sprite'; common: string; special: string; height: number; frenzy?: string; king?: string; kingScale?: number; world?: string; box?: string; extras?: string[] };

export interface CharacterData {
  id: string;
  name: string;
  title: string;
  quote: string;
  color: string;
  /** Units the character belongs to, ids from bands.ts. Unset = no band (薇欧拉, the
   *  headless dummies). Multiple entries only for dual-affiliation members (初华:
   *  Ave Mujica first, sumimi second — bands[0] is the select-screen group). */
  bands?: BandId[];
  /** False keeps the entry off the select screen: headless-check dummies (gale, ember,
   *  boulder). Unset means playable — new characters need no roster of ids to join. */
  playable?: boolean;
  trait: Trait;
  hp: number;
  speed: number;
  power: number;
  passive: [string, string];
  /** Exactly six: J K U I O L. */
  skills: Skill[];
  view: ViewSpec;
  /** Key of the while-rooted status effect shown at the torso. Unset draws the default pink heart. */
  rootFx?: string;
  /** 二号资源条 (打气): declared per character, charged by the kernel's hit gates, spent by moves.
   *  Absent means the fighter has no gauge and nothing is drawn or charged. */
  gauge?: GaugeSpec;
  /** 狂化 (夢はパワー！): how this character's frenzy behaves. Soyo stays on the arcade defaults
   *  (rate 1.55, J/K cooldowns ×.6, the jab-chain auto-heavy) by leaving this unset. */
  frenzy?: {
    /** Multiplier on the ground J/K attack clock. */
    rate?: number;
    /** Multiplier on ground J/K reach. */
    rangeMul?: number;
    /** Multiplier on ground J/K cooldowns. */
    cdMul?: number;
    /** Three ground jabs arm the next press as the heavy. */
    chain?: boolean;
    /** Seconds the frenzy lasts. */
    time?: number;
    /** Afterimage silhouette colour; falls back to Soyo's brown. */
    tint?: string;
    /** Ground (and air, when `air` is set) J/K damage. */
    damageMul?: number;
    /** The range, cooldown and damage multipliers also cover air J/K. */
    air?: boolean;
    /** U I O L stay locked for the form. The fighter's `king` flag is what the move sets. */
    lock?: boolean;
  };
}

/** The reusable second meter. Charge amounts are per character; the bar's home (head-floating
 *  vs HUD) is a declaration so a future character picks a style without touching the kernel. */
export interface GaugeSpec {
  max: number;
  /** Clean unblocked hits: granted to the defender (taking) and attacker (dealing). */
  onHitTaken?: number;
  onHitDealt?: number;
  /** Blocked hits: granted to the defender. */
  onBlock?: number;
  /** Bar label for the training readout. */
  label: string;
  /** Fill colour of the head-floating bar. */
  color: string;
  /** True: the bar floats over the fighter's head in the arena. */
  head?: boolean;
}

export interface StageData {
  id: string;
  name: string;
  sky: string;
  ground: string;
  accent: string;
  /** Optional backdrop; when present it replaces the flat colours. */
  image?: string;
  /** Y of the art's standing-ground line in canvas space (image stretched to 960×540).
      The renderer anchors this line onto FLOOR with a covering zoom; absent = full stretch. */
  groundY?: number;
  /** Darkening layer baked over the backdrop; defaults to the shared #10101b20. */
  shade?: string;
}
