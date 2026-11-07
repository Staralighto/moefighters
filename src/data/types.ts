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

/** 异常: the four reusable status kinds. The kernel reads only the kind — damage, pace, lock and the
 *  count a super collects on. What it looks like is the mark, and only the render layer reads that.
 *  chill rides the shared 减速 mod and freeze the 禁足-tier 定身, so 冻僵 and 冻住 are the same clocks
 *  as every other slow and lock; burn and confuse are mods of their own. follow (跟班) is a mod too: the
 *  body loses its controls and walks behind whoever laid it (game.ts stepFollow). */
export type StatusKind = 'burn' | 'chill' | 'freeze' | 'confuse' | 'follow';

/** One status a clean hit lays. Parameters are read by kind; anything a kind does not use is ignored. */
export interface StatusApply {
  kind: StatusKind;
  /** Seconds. A live status of the same kind is refreshed, never stacked. */
  time: number;
  /** Visual key in src/render/statusMarks.ts. Unset uses the kind's default (DEFAULT_MARK). */
  mark?: string;
  /** burn: damage per tick, and seconds between ticks (default .5). */
  dmg?: number;
  tick?: number;
  /** chill: walk, jump launch and attack-speed multipliers (default .6 / .75 / .75). */
  move?: number;
  jump?: number;
  atk?: number;
  /** An upgrade: lands only while the target already carries this kind. When any upgrade in the list
   *  lands, the plain entries of the same list are skipped (一人一半: already 冻僵 → 冻住 instead). */
  ifHas?: StatusKind;
  /** A guard does not stop it, only shortens it: on a (non-perfect) block it lands for time × onBlock.
   *  Unset: a block stops it. Upgrades never land on a block. A perfect block always stops it. */
  onBlock?: number;
  /** follow: seconds after it ends before the same body can be made a follower again (default 4), and how
   *  long the 部下 badge it leaves stays on after it (default 6; 0 leaves none). */
  immune?: number;
  badge?: number;
}

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
  /** Timed protection for a dash or breakout. 'cast' protects the entire move, including against reversals. */
  invuln?: number | 'cast';
  /** 解控 (e.g. 恐湖, 轮奏). Castable out of any control state — hitstun, knockdown, root, lock —
   *  and the press cuts earlier inputs. The kernel grants the shared short invuln on every cast and
   *  fires the shared shockwave (combat.ts escapePulse) at the active frame. Damage, brace, veil
   *  and a longer invuln stay on the skill as extras. */
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
  /** Attack-speed multiplier while 减速 holds. Unset is 1. J/K cooldown clocks tick at this rate. */
  slowAtk?: number;
  /** 蝶变: a blocked hit still applies `slow`. 花道·缠 leaves this unset and only slows clean hits. */
  slowOnBlock?: boolean;
  /** Fraction of damage that pierces a guard (e.g. 火的故事 .5). Defaults to .24 for supers, .13 otherwise. */
  blockMul?: number;
  /** 削防: guard damage this hit deals to a blocking target. Set directly for a single-hit move;
   *  multi-hit supers leave it unset and declare `guardPlan` instead. Unset falls back to the
   *  kernel default (supers 42, heavy 26, everything else 15). */
  guardDmg?: number;
  /** 削防 plan for a multi-hit move: the i-th segment uses index i, and the last entry repeats.
   *  The delivery point stamps the value into `guardDmg` (see withGuard); hit() never reads the
   *  plan directly. Front entries are deliberately cheap so the opening segments stay blockable,
   *  and the later entries break the bar. Grabs and noBlock moves are unblockable by design and
   *  carry no plan. */
  guardPlan?: number[];
  /** Status mark while 减速 holds. Unset keeps the shared petal aura. */
  slowMark?: string;
  /** Flat extra damage on a clean hit when the target is already 减速. This hit's own slow does not qualify. */
  slowBonus?: number;
  /** 异常: statuses a clean hit lays, in order. Braced, poised and enduring bodies shrug them off,
   *  the same gate as 减速 and 定身. */
  status?: StatusApply[];
  /** 异常: statuses laid on whoever swings into this move's counter window (社交派对的微笑). Read by the
   *  move's script, which owns the counter. */
  counterStatus?: StatusApply[];
  /** 异常引爆: the super snapshots how many status kinds the target carries when it connects, and the
   *  finale deals `per` more for each. Read by the move's script through statusCount(). */
  statusBonus?: { per: number };
  /** 异常延长: before this move lays its own statuses, every status the target already carries runs this much
   *  longer (1 = +100%, its remaining time doubled). Read by the move's script (社交派对的微笑). */
  statusExtend?: number;
  /** A status tick (烧焦): never springs a counter, never eats a 一肩扛下 charge. */
  dot?: boolean;
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
  /** 完美格挡's counter orb: perfect-blocking it never fires another orb back. */
  parryOrb?: boolean;
  /** 冰川打火姬: a guard does not catch this hit. A jump still clears a low shot. */
  noBlock?: boolean;
  /** 小摩卡要上了: a defender who is already 减速 cannot block this hit. */
  noBlockSlow?: boolean;
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
  /** 领域: the field this move opens. See DomainSpec. */
  domain?: DomainSpec;
  /** A debuff laid on the defender by a clean hit (和泉朋花: 飘了 cuts their damage, 主角 raises what
   *  they take). `v` is the multiplier on the defender: .75 deals a quarter less, 1.2 takes a fifth more. `mark`
   *  picks the status graphic; `text` pops once when the mod is fresh. */
  curse?: {
    kind: 'dmgDealt' | 'incoming'; time: number; v: number; mark?: string; text?: string;
    /** 珍稀动物认证: an 'incoming' curse that only the attacker who laid it collects on. */
    own?: boolean;
    /** 珍稀动物认证: a clean hit while this curse (or its upgrade) is live from the same attacker lays
     *  the upgrade instead — one step only; the upgrade then just refreshes. */
    up?: { v: number; mark: string };
    /** 珍稀动物认证: 'specials' — a clean hit from any of the owner's U I O L, not only this move, upgrades a
     *  live tag (other moves only upgrade; re-applying and refreshing stay with this move). */
    upBy?: 'specials';
  };
}

/** One continuous effect a domain projects while it is the newest live field. */
export type DomainBuffKind =
  | 'regen' | 'speed' | 'slow' | 'lifesteal'
  | 'dmgDealt' | 'dmgTaken' | 'incoming' | 'thorns';

export interface DomainBuff {
  kind: DomainBuffKind;
  v?: number;
  /** Attack-speed multiplier carried by a 'speed' buff. */
  atk?: number;
  mark?: string;
}

/** 领域: the L-skill field. It always swaps the backdrop and projects its buffs while it is the
 *  newest live one. A later domain covers it without ending its clock; when the cover ends, the
 *  field with remaining time comes back. */
export interface DomainSpec {
  /** Backdrop image. A domain always changes the stage. */
  background: string;
  /** Seconds the field and its buffs last, together. */
  time: number;
  buffs: DomainBuff[];
  /** Who the buffs land on. Defaults to the caster; the other two are reserved for later fields. */
  target?: 'self' | 'team' | 'enemies';
}

/** Scalar buffs a move can arm. The kernel still stores these on Fighter until mods.ts folds them. */
export type BuffKind = 'brace' | 'poise' | 'muscle' | 'shout' | 'feast' | 'box' | 'sprint' | 'noGain' | 'rose' | 'debt' | 'encore' | 'relapse'
  | 'vulnerable' | 'reflect' | 'guard' | 'lifesteal' | 'undying';

/** No clock of its own. Runs at one of the three gates the attack clock already has. */
export type Op =
  /** mark: the status graphic this mod wears, when one kind serves two looks (完全复活's halo). */
  | { op: 'mod'; kind: BuffKind; time?: number; v?: number; set?: boolean; max?: boolean; mark?: string }
  | { op: 'form'; king?: boolean }
  /** 一人二役 (奥泽美咲): flip to the other of the two CharacterData.forms. */
  | { op: 'swap' }
  | { op: 'repel'; range?: number; push: number; stun?: number }
  | { op: 'heal'; hp: number }
  | { op: 'fx'; type?: string; life: number; y?: number; radius?: number; dir?: boolean; floor?: boolean; color?: string; flash?: number; announce?: { color: string; life: number; size: number; y: number } }
  | { op: 'shot' }
  | { op: 'summon'; kind: 'ally' | 'half' }
  /** 和姐姐在一起: `id` is the roster member who answers. */
  | { op: 'summon'; kind: 'named'; id: string }
  /** 舞台装置: a basic-only copy of the caster that never retires on a clock. */
  | { op: 'summon'; kind: 'apparatus' };

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
  | { kind: 'sprite'; common: string; special: string; height: number; frenzy?: string; king?: string; kingScale?: number; world?: string; box?: string; extras?: string[];
      /** Special-sheet playback scale, pivoted on the foot line so the feet stay. */
      specialScale?: number;
      /** World-sheet playback scale, pivoted on the foot line so the feet stay. */
      worldScale?: number;
      /** Pixels to draw the whole cell above the fighter origin. Positive is up. */
      lift?: number };

/** 一人二役: how one of the two forms plays. Multipliers are 1 when unset. */
export interface FormTune {
  /** Shown in the movelist and on the swap. */
  name: string;
  /** Walk multiplier. */
  speed?: number;
  /** Damage dealt multiplier. */
  dmgDealt?: number;
  /** Damage taken multiplier (grabs and supers too). */
  dmgTaken?: number;
  /** Attack-speed multiplier on J / K (ground and air): their move clock and their cooldowns run at this rate. */
  atk?: number;
  /** A big body: this many pixels added to the half-width that melee reach and shots test against. */
  girth?: number;
  /** Jump launch-velocity multiplier (the height goes with its square). */
  jump?: number;
  /** Back-dodge cooldown multiplier. */
  dodgeCd?: number;
  /** Seconds of extra recovery when a J / K ends without touching anyone. Hits are untouched. */
  whiff?: number;
}

/** 一人二役: the second form swaps the whole move list and both sheets; the base form is the
 *  character's own skills and view. Fighter.form says which one is up (0 base, 1 alt). */
export interface FormPair {
  base: FormTune;
  alt: FormTune & {
    /** Exactly six: J K U I O L. Cooldowns are kept per form. */
    skills: Skill[];
    common: string;
    special: string;
    /** This form's own body height and lift; unset keeps the view's. */
    height?: number;
    lift?: number;
    /** This form's special-sheet playback scale; unset keeps the view's. */
    specialScale?: number;
  };
}

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
  /** Officially written as a genius (bang-dream.com: 冰川日菜「天才少女」, 汐见萤「音楽の天才」).
   *  和泉朋花's 天才♡ condition always holds while one stands on the other team. */
  genius?: boolean;
  /** A presence the character carries outside her moves (丰川祥子): effect keys the kernel stamps on
   *  every footfall of the walk (`step`) and on the active frame of every J / K, ground or air (`swing`,
   *  which replaces the generic slash).
   *  Data, so the kernel never reads a character id. Keep these quiet: they play all match long. */
  aura?: { step?: string; swing?: string };
  /** 二号资源条 (打气): declared per character, charged by the kernel's hit gates, spent by moves.
   *  Absent means the fighter has no gauge and nothing is drawn or charged. */
  gauge?: GaugeSpec;
  /** 心跳计 (矢仓蓬咲): the gauge is her heart rate. Declared per character so the kernel needs no id branch;
   *  combat.ts stepHeart reads it every step. Unset means no heart. */
  heart?: HeartSpec;
  /** 麦子越踩越坚强 (祐天寺喵梦, hidden): when the hp lost to hits inside `window` seconds reaches `share` of max
   *  hp, roll `chance` once (the window then starts over). A success heals `heal` of max hp and cuts all
   *  damage taken by `cut` for `time` seconds. Declared per character so the kernel needs no id branch. */
  wheat?: { window: number; share: number; chance: number; heal: number; cut: number; time: number };
  /** 彩虹色 (汐见萤): happy moments roll for a small random blessing. Declared per character so
   *  the kernel needs no character-id branch — the roll helper just checks for the spec. */
  rainbow?: {
    /** Chance per happy moment. */
    chance: number;
    /** Internal cooldown between two procs. */
    cooldown: number;
  };
  /** 一人二役 (奥泽美咲): two forms, each with its own six moves and sheets. Unset: one form. */
  forms?: FormPair;
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
    /** Effect key stamped at the active frame of every ground and air J / K while the form lasts,
     *  hit or whiff (伊泽枣's claws). Data, so the kernel never reads a move name. */
    swingFx?: string;
    /** Pixels the ground K carries her forward, spread over the windup and the strike (伊泽枣's pounce). */
    heavyLunge?: number;
  };
}

/** The reusable second meter. Charge amounts are per character; the bar's home (head-floating
 *  vs HUD) is a declaration so a future character picks a style without touching the kernel. */
/** 心跳计: what raises and calms the heart (the fighter's gauge, 0..gauge.max), the dread it puts on foes walking
 *  in at the high tiers, and the burst when it tops out. Tiers and beat gaps are shared with the render layer
 *  (clips.ts HEART_TIERS / HEART_GAP). */
export interface HeartSpec {
  /** A foe this close raises it `nearRate` a second. */
  near: number; nearRate: number;
  /** A foe this close and facing her raises it `gazeRate` a second more. */
  gaze: number; gazeRate: number;
  /** Nobody this close: it falls `calmRate` a second. */
  calm: number; calmRate: number;
  /** From tier 2 up, a foe walking toward her inside `dread` walks at `dreadMul`. */
  dread: number; dreadMul: number;
  /** Full: the heart bursts — a ring of `burstR` round her chest, `burstDamage`, a knockdown, no guard. */
  burstR: number; burstDamage: number;
  /** After a burst the rate drops to `reset` and cannot climb past it for `rest` seconds. */
  reset: number; rest: number;
}

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
