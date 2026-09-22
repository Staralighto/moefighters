/* Pure data shapes. Nothing here knows about pixels or the DOM. */

export type SkillType =
  | 'light' | 'heavy' | 'dash' | 'projectile' | 'grab'
  | 'upper' | 'sweep' | 'endure' | 'launch';

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
  desc: string;
  /** Shared airborne normal; never lives in a character's skill list. */
  air?: boolean;
  speed?: number;
  count?: number;
  interval?: number;
  size?: number;
  life?: number;
  invuln?: number;
}

export type Trait = 'rush' | 'focus' | 'armor';

/** How a character is drawn. Swap the spec, not the code. PNG of the same grid replaces the SVG path. */
export type ViewSpec =
  | { kind: 'geometry'; build: 'slim' | 'bulky' | 'tall' }
  | { kind: 'sprite'; common: string; special: string; height: number; extras?: string[] };

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
