/* Pure data shapes. Nothing here knows about pixels or the DOM. */

export type SkillType =
  | 'light' | 'heavy' | 'dash' | 'projectile' | 'grab'
  | 'upper' | 'sweep' | 'endure' | 'launch';

/** How tightly 定身 holds the body. 'move' is the arcade root: legs locked, attacks and blocks
 *  stay open. 'freeze' is the time-stop tier: the pose holds and nothing comes out at all. */
export type RootLevel = 'move' | 'freeze';

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
  /** Costs 100 energy, no cooldown. */
  super: boolean;
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
  /** Per-skill hit knockback velocity; falls back to the type/fx default when unset. */
  knock?: number;
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

export interface StageData {
  id: string;
  name: string;
  sky: string;
  ground: string;
  accent: string;
  /** Optional backdrop; when present it replaces the flat colours. */
  image?: string;
}
