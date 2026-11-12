import type { Attack, Fighter } from '../game/fighter.ts';
import { attackPhase, stateFor } from '../game/animState.ts';
import { YOKAN_OX } from './miyakoSheet.ts';
import { RIB_OX, SKEWER_OX, STEAK_OX } from './ritsuSheet.ts';

/** Square cell. Img2img replacements must keep this size and the grids below.
 *  Common is 8×3 so the sheet is 2048×768 (8:3), under the 3:1 upload limit.
 *  Do not downscale a 2048×768 export to 1024×384; the game samples this cell. */
export const CELL = 256;
export const COMMON_COLS = 8;
export const COMMON_ROWS = 3;
export const SPECIAL_COLS = 4;
export const SPECIAL_ROWS = 3;

export const PHASES = ['windup', 'active', 'recover'] as const;
export const SPECIAL_KEYS = ['U', 'I', 'O', 'L'] as const;

const PHASE_COL: Record<(typeof PHASES)[number], number> = { windup: 0, active: 1, recover: 2 };

/** Row 0 is the walk. Row 1 finishes locomotion and the grounded normals. Row 2 is ko plus air normals. */
export const COMMON_LABELS: string[][] = [
  ['idle', 'run0', 'run1', 'run2', 'run3', 'jump', 'block', 'dodge'],
  ['hurt', 'down', 'light-windup', 'light-active', 'light-recover', 'heavy-windup', 'heavy-active', 'heavy-recover'],
  ['ko', 'airLight-windup', 'airLight-active', 'airLight-recover', 'airHeavy-windup', 'airHeavy-active', 'airHeavy-recover', ''],
];

const LOCO: Record<string, { c: number; r: number }> = {
  idle: { c: 0, r: 0 },
  run0: { c: 1, r: 0 },
  run1: { c: 2, r: 0 },
  run2: { c: 3, r: 0 },
  run3: { c: 4, r: 0 },
  jump: { c: 5, r: 0 },
  block: { c: 6, r: 0 },
  dodge: { c: 7, r: 0 },
  hurt: { c: 0, r: 1 },
  down: { c: 1, r: 1 },
  ko: { c: 0, r: 2 },
};

const RUN_FRAMES = ['run0', 'run1', 'run2', 'run3'] as const;

const NORMAL: Record<'light' | 'heavy' | 'airLight' | 'airHeavy', { c: number; r: number }> = {
  light: { c: 2, r: 1 },
  heavy: { c: 5, r: 1 },
  airLight: { c: 1, r: 2 },
  airHeavy: { c: 4, r: 2 },
};

export interface Clip {
  sheet: 'common' | 'special' | 'frenzy' | 'world';
  col: number;
  row: number;
  sx: number;
  sy: number;
  /** Cell-space body offset baked into the art. SpriteView translates it back out. */
  ox?: number;
  /** Playback scale about the foot line. The art was pre-shrunk so the prop fits the cell. */
  scale?: number;
}

function at(sheet: Clip['sheet'], col: number, row: number): Clip {
  return { sheet, col, row, sx: col * CELL, sy: row * CELL };
}

function loco(key: keyof typeof LOCO): Clip {
  const { c, r } = LOCO[key];
  return at('common', c, r);
}

/** 天台是我的: seconds into the move when she drops from the mark, and how long the stomp cell holds
 *  after the landing. Shared by the script (combat.ts) and the cell pick above. */
export const ROOFTOP_DIVE = .4;
/** 好痛……♡: once the trap springs, the strike cell holds this long before the settle. */
export const FEIGN_STRIKE = .24;
/** 好痛……♡: from the spring to the end of the move — the strike plus the settle. */
export const FEIGN_TAIL = .55;
/** 康乃馨盛开之日: one ring's clock. It closes for `shrink` seconds from `r0` to `rmin`, then bursts
 *  back out to `rmax` in `burst`; the front hits once on its way. */
export interface RingSpec { shrink: number; burst: number; r0: number; rmin: number; rmax: number }
/** Seven small rings land on the foe one after another: light, and they never interrupt. */
export const RING_SMALL: RingSpec = { shrink: .5, burst: .08, r0: 120, rmin: 8, rmax: 80 };
/** The last ring is the big one: dodge it or eat the real damage. */
export const RING_BIG: RingSpec = { shrink: .85, burst: .12, r0: 270, rmin: 16, rmax: 250 };
export const RING_SMALLS = 7;
/** Attack-clock time of the first small ring, and the gap to each next ring (the big one included). */
export const RING_FIRST = .15;
export const RING_GAP = .26;
export const COFFIN_OUT = .5;
/** She tips back into the coffin this long after the spotlight lands; then she is out of sight. */
export const COFFIN_TIP = .14;
export const ROOFTOP_STOMP = .12;

/** 打水漂: one hop of the stone run; every landing is a touch. Each cast rolls SKIP_MIN～SKIP_MAX hops;
 *  SKIP_MAX is also the face that knocks down. */
export const SKIP_HOP = .16;
export const SKIP_MIN = 3;
export const SKIP_MAX = 5;
/** 打水漂: the landing crouch after the strike. */
export const SKIP_TAIL = .25;

/** 精准踩雷: the mine under their feet goes off this long after the pat. */
export const MINE_FUSE = .35;
/** 精准踩雷: the hand stays on their shoulder this long after the blast, then she straightens up. */
export const MINE_HOLD = .12;
/** 一肩扛下: the pile she carries sits this high over her feet (game spawns, renderer draws, fx stacks). */
export const BURDEN_Y = 172;
/** 绝不退场: each clean hit taken adds this much damage, up to the cap. */
export const UNBOWED_STEP = .06;
export const UNBOWED_MAX = .3;
/** 绝不退场: stacks shown for a damage bonus. */
export function unbowedStacks(v: number | undefined): number {
  return Math.round((v ?? 0) / UNBOWED_STEP);
}
/** 安可是主唱的: phases on Attack.mode — the encore calls, the dark face, the run, off the stage, the run home from the other side. */
export const ENCORE = { crowd: 0, face: 1, dash: 2, gone: 3, back: 4 } as const;
/** 安可是主唱的: the dark face holds this long before she runs. */
export const ENCORE_FACE = .35;
/** 安可是主唱的: seconds off the frame before she walks back in. */
export const ENCORE_GONE = 1;
/** 安可是主唱的: her face goes dark from the third call through the run. */
export function encoreDark(mode: number | undefined): boolean {
  return mode === ENCORE.face || mode === ENCORE.dash;
}

/** 我背你！: phases on Attack.mode — the dash, the run with them on her back, the throw's tail,
 *  and the stumble after a blocked dash. */
export const PIGGY = { dash: 0, carry: 1, done: 2, blocked: 3 } as const;
/** 我背你！: the dash looks for a back to fill this long after the start. */
export const PIGGY_DASH = .3;
/** 我背你！: she runs with them at most this long, or until a wall. */
export const PIGGY_CARRY = .75;
/** 我背你！: the turn after the throw. */
export const PIGGY_TAIL = .25;
/** 我背你！: the rider sits this far behind her and this high off the floor. */
export const PIGGY_BACK_X = 26;
export const PIGGY_BACK_Y = 72;

/** 爱之拥抱: the lunge looks for a body this long after the start; the first squeeze lands this
 *  long after the catch, then one every HUG_GAP. Each squeeze shows the tight cell for HUG_SQUEEZE. */
export const HUG_LUNGE = .28;
export const HUG_FIRST = .12;
export const HUG_GAP = .2;
export const HUG_SQUEEZE = .09;
export const HUG_TAIL = .3;
/** 爱之拥抱: a.mode — lunging, holding, let go (or nobody caught). */
export const HUG = { lunge: 0, held: 1, done: 2 } as const;
/** 奥泽美咲 / 米歇尔 (一人二役). Shared by the game scripts and the cells they pick.
 *  快乐飞行模式: the jets light through the start, then a carry (caught) or a short hop (missed). */
export const FLIGHT = { lift: 0, carry: 1, whiff: 2, done: 3 } as const;
/** Seconds of the carry: up through the fireworks and back down. */
export const FLIGHT_CARRY = 1.05;
/** Seconds of the missed hop. */
export const FLIGHT_WHIFF = .45;
/** The landing pose after either. */
export const FLIGHT_TAIL = .3;
/** How high the carry arcs, and how far forward the carry and the hop each travel. */
export const FLIGHT_RISE = 175;
export const FLIGHT_TRAVEL = 170;
export const FLIGHT_HOP = 260;
/** 明明我才是米歇尔！: the bagged lunge, the three yanks and the tear on a fixed beat, the dazed settle. */
export const WITHDRAW = { lunge: 0, held: 1, done: 2 } as const;
export const WITHDRAW_LUNGE = .42;
export const WITHDRAW_FIRST = .2;
export const WITHDRAW_GAP = .27;
export const WITHDRAW_YANKS = 3;
/** Seconds each yank holds the pull-up cell. */
export const WITHDRAW_PULL = .13;
export const WITHDRAW_TAIL = .55;
/** 黑衣人，拜托了: from the start the curtain hides her until the move ends (she is changing). */
export const SUITS_REVEAL = .08;

/** 我开动了！: palms together this long before the bowl comes up. */
export const MEAL_GRACE = .15;

/** 上吧，My Family！: the four who answer, in the order they come in. Strikes are seconds after the
 *  catch; `enter` is how long each is on screen before her first strike (蓬咲 peeks out first, 心玖
 *  is just a flash); `cm` is the official height, so the silhouettes stand as tall as they really
 *  are next to 蕾叶 (RAIKA_CM). The column on family.png is the index. Colours are the official ones. */
export interface FamilyMember { name: string; color: string; cm: number; enter: number; strikes: readonly number[] }
export const FAMILY_MEMBERS: readonly FamilyMember[] = [
  { name: '千樱梨', color: '#FF55AA', cm: 154, enter: .22, strikes: [.24, .38] },
  { name: '蓬咲', color: '#448888', cm: 168, enter: .36, strikes: [.68] },
  { name: '宁月', color: '#9999FF', cm: 143, enter: .24, strikes: [.98] },
  { name: '心玖', color: '#22CCFF', cm: 162, enter: .14, strikes: [1.26] },
];
export const RAIKA_CM = 162;
/** 上吧，My Family！: the lunge window, and how long a member lingers after her last strike.
 *  Her own strum lands FAMILY_FINALE after the catch. */
export const FAMILY_LUNGE = .3;
export const FAMILY_LINGER = .3;
export const FAMILY_FINALE = 1.58;
export const FAMILY_TAIL = .55;

/* ---- 丰川祥子 ---- */

/** 忘却之影: pixels of the blink, radius of the shove at each end, then the 白祥 left behind —
 *  its fuse, the last stretch it flickers, and the blast radius. `land` is how long the landing cell
 *  holds after the blink. Shared by the script (combat.ts), the cell pick below and the fx. */
export const OBLIVION = { blink: 300, pulse: 140, fuse: 1.2, flicker: .3, blast: 170, land: .22 } as const;
/** 双月轮舞: out this far, back past the start by `over`, then a short brake. a.mode walks these phases. */
export const TWIN_MOON = { out: 360, over: 120, brake: .2 } as const;
export const TWIN_PHASE = { out: 0, back: 1, brake: 2 } as const;
/** 血月的奏鸣: launch angle band in degrees (positive climbs), the bob of each note, the opening shove,
 *  and the tail where the last sweep cell holds. */
export const BLOOD = { low: -14, high: 22, bob: 40, bobRate: 3.2, repel: 150, tail: .32 } as const;

/** 血月的奏鸣: windup with the hands up, then the press and the lift trade on the note clock; the sweep closes. */
export function bloodRow(t: number, start: number, interval: number, duration: number): number {
  if (t < start) return 0;
  if (t >= duration - BLOOD.tail) return 2;
  return Math.floor((t - start) / interval) % 2 === 0 ? 1 : 0;
}
/** 上吧，My Family！: the strum cell holds this long after the finale. */
export const FAMILY_STRUM = .18;
/** 上吧，My Family！: a.mode — lunging, holding while the family comes in, done, the hold lost
 *  midway, and the zone: nobody caught, so the family pound the ground ahead of where she stopped. */
export const FAMILY = { lunge: 0, held: 1, done: 2, whiff: 3, zone: 4 } as const;
/** 上吧，My Family！ zone: the strike point sits this far ahead of her; a foe within FAMILY_ZONE_R of it
 *  (and not high in the air) is hit by every strike that lands there. */
export const FAMILY_ZONE_AHEAD = 130;
export const FAMILY_ZONE_R = 95;
/** Seconds a member's silhouette is on screen: in, every strike, out. */
export function familyLife(m: FamilyMember): number {
  return m.enter + (m.strikes[m.strikes.length - 1] - m.strikes[0]) + FAMILY_LINGER;
}

/* ---- 马桥心玖 ---- */

/** 表面烤得很漂亮: a.mode — the sparkle blink, the beat between the pat and the cut, done.
 *  She leans in with the polite smile, dissolves into pastel sparkles and reappears PUFF_STOP in front of
 *  the nearest foe within PUFF_REACH (or PUFF_HOP ahead with nobody there). PUFF_BLINK is how long she is
 *  out of sight; the pat comes PUFF_ARRIVE after she lands. `beat` the gap from the pat to the cut,
 *  `cut` how long the cut cell holds, `tail` the settle. */
export const PUFF = { glide: 0, beat: 1, done: 2 } as const;
export const PUFF_BLINK = .1;
export const PUFF_ARRIVE = .04;
export const PUFF_REACH = 250;
export const PUFF_STOP = 58;
export const PUFF_HOP = 160;
export const PUFF_BEAT = .12;
export const PUFF_CUT = .18;
export const PUFF_TAIL = .26;

/** 珍稀动物认证: how long the tag hangs over them, and how high above the feet. */
export const RARE_TIME = 12;
export const RARE_Y = 214;

/** 才没有在撒谎: a.mode — the ear-touch, caught out, or the four palms.
 *  A release before EAR_DECIDE is the far tap; still holding, the window locks in.
 *  After a catch the palm lands EAR_PALM later, the knee EAR_KNEE later; the strike cell holds EAR_HOLD past the knee.
 *  The push is EAR_PALM_HITS palms, EAR_PALM_GAP apart; the strike cell holds EAR_SOLO past the last one. */
export const EAR = { act: 0, caught: 1, palm: 2 } as const;
export const EAR_DECIDE = .14;
export const EAR_PALM_HITS = 4;
export const EAR_PALM_GAP = .1;
export const EAR_PALM = .08;
export const EAR_KNEE = .22;
export const EAR_HOLD = .12;
/** From the catch to the end of the move. */
export const EAR_TAIL = .55;
/** The lone palm, when nobody swung: the strike cell holds this long after the active frame. */
export const EAR_SOLO = .15;
/** Where the glint sits on her earlobe, from the feet (side view facing right). It only shows on special
 *  cells: measured on the O wind-up cell (finger on the ear at cell 116, 52), mapped onto her 176 px body,
 *  shrunk ×0.95 about the foot line (specialScale) and lifted 11 px. Move with view.height / lift / specialScale. */
export const EAR_GLINT = { x: -8, y: 145 } as const;
/** Her eye line on the special cells, from the feet, and how far ahead of her centre it sits. */
export const MIKU_EYE = { x: 12, y: 151 } as const;

/** 过家家到此为止: a.mode walks the cast — the bow, the cut that runs through them, the stillness after
 *  (she stands outside the house with her back to them; she does not walk), the goodbye, and (only if
 *  they are still standing) the touch of the earlobe. */
/** 世界如此广阔 (四宫宁月 L): pray with stars in her eyes, a short dash to find them, the three accidents
 *  while she stares (arms wide), then she stands in the suds. combat.ts step_wideWorld walks a.mode. */
export const WIDE = { pray: 0, dash: 1, held: 2, tail: 3 } as const;
/** The dash looks for a body this long after the prayer. */
export const WIDE_DASH = .22;
/** After the catch: when each appliance lands, and when its accident goes off (the hit). */
export const WIDE_DROPS = [.05, .55, 1.05] as const;
export const WIDE_BLAST = .3;
/** After the catch: the suds burst and throw them (the finale), then she stands for the tail. */
export const WIDE_POP = 1.85;
export const WIDE_TAIL = .5;
/** One appliance on screen: drop, rumble, blast, then it breaks apart into pieces. */
export const WIDE_APPLIANCE_LIFE = 1;
/** Which appliance goes where: the stand-in drawings and the PNGs share these (shizukuFx.ts). */
export const WIDE_APPLIANCES = [
  { src: '/sprites/shizuku/microwave.png', h: 115, w: 100 },
  { src: '/sprites/shizuku/fridge.png', h: 200, w: 110 },
  { src: '/sprites/shizuku/washer.png', h: 130, w: 100 },
] as const;
/** How far behind them (on the far side from her, or the near side against a wall) the appliances stand. */
export const WIDE_SLOT = 96;
/** A dash that catches nobody still sets the kitchen off: centred this far ahead of where the dash stopped,
 *  and every blast (and the burst) reaches anyone within this radius of that centre. */
export const WIDE_ZONE_AHEAD = 110;
export const WIDE_ZONE_R = 110;

/* ---- 梅里千樱梨 ---- */
/** 千樱梨登场: crouch → leap at the nearest foe ahead within `reach` (else `hop` forward) → land. The leap
 *  is a plain ballistic arc from vy; `quake` is how long the landing cell holds; `cheer` the seconds of 独占欢呼. */
export const ENTRANCE = { crouch: 0, air: 1, land: 2 } as const;
export const ENTRANCE_VY = 560;
export const ENTRANCE_REACH = 380;
export const ENTRANCE_HOP = 200;
export const ENTRANCE_QUAKE = .2;
export const ENTRANCE_TAIL = .27;
export const ENTRANCE_CHEER = 5;
/** 千樱梨樱桃炸弹: the fuse is the skill's start. Stacks cap here; each stack widens the blast this much. */
export const CHERRY_MAX = 3;
export const CHERRY_R0 = 130;
export const CHERRY_R_STEP = 34;
/** Holding O past the fuse keeps her lit: the blast may wait until this long after the cast. */
export const CHERRY_HOLD_MAX = 2.1;
/** The settle after the blast, however long she held. */
export const CHERRY_TAIL = .45;
/** How long the shout cell holds after the blast before the hands-on-hips settle. */
export const CHERRY_SHOUT = .25;
/** Where her two buns sit (the cherries grow out of them): above her feet, and either side of the crown. */
export const CHIERI_BUN = { x: -4, y: 158, gap: 15 } as const;
/** 千樱梨联盟集合: the call is the skill's start; then the pull, five beats `beat` apart, a breath, the cymbal. */
export const ASSEMBLE = { call: 0, pull: 1, drum: 2, done: 3, whiff: 4 } as const;
export const ASSEMBLE_PULL = .3;
export const ASSEMBLE_BEAT = .2;
export const ASSEMBLE_FINALE = .2;
export const ASSEMBLE_STOP = 72;
export const ASSEMBLE_TAIL = .45;
export const ASSEMBLE_WHIFF = 1;
/** The 部下 count on the board: the league before, and after the cymbal. */
export const LEAGUE_START = 3;
export const LEAGUE_GOAL = 100000000;
/** The board floats this high over her feet: clear of her head, well under the top-of-screen HUD. */
export const LEAGUE_BOARD_Y = 236;

/* ---- 矢仓蓬咲 ---- */
/** 心跳计: the gauge value where each tier starts (平静 / 紧张 / 失控 / 爆表), and the seconds between two beats in each. */
export const HEART_TIERS = [25, 55, 85] as const;
export const HEART_GAP = [.86, .5, .33, .25] as const;
export function heartTier(v: number): number {
  return v >= HEART_TIERS[2] ? 3 : v >= HEART_TIERS[1] ? 2 : v >= HEART_TIERS[0] ? 1 : 0;
}
/** Where her heart sits on the 177 px body (lift 6) (from the feet, forward of the spine), and her eye line. */
export const YOMOGI_CHEST = { x: 14, y: 123 } as const;
/** Her sprite box (characters.ts view.height / lift, held equal by selfcheck): the shadow is this cell, scaled. */
export const YOMOGI_BODY = { height: 177, lift: 6 } as const;
export const YOMOGI_EYE = { x: 12, y: 162 } as const;
/** 躲到你身后: the slip through (to `gap` behind their back), the crouch they have to turn round in, the punch cell, the settle. */
export const HIDE = { sneak: 0, hide: 1, punch: 2 } as const;
export const HIDE_REACH = 320;
export const HIDE_GAP = 58;
export const HIDE_HOP = 140;
export const HIDE_TRAVEL = .22;
export const HIDE_WAIT = .4;
export const HIDE_PUNCH = .22;
export const HIDE_TAIL = .3;
/** 拳化为掌: a.mode is FIST when the key was still down at the active frame. The strike cell holds this long. */
export const PALM_FIST = 1;
export const PALM_HIT = .18;
/** 人体感应雷达: the crouch lasts at most `RADAR_WAIT`; the burst cell, then the weak-kneed settle. */
export const RADAR = { crouch: 0, burst: 1, idle: 2 } as const;
export const RADAR_WAIT = 1;
export const RADAR_BURST = .16;
export const RADAR_TAIL = .45;
/** 想象吧，变强的我: the shadow rises (the skill's start), scares her, rushes in and punches on her heartbeat —
 *  five beats at these offsets, a breath, the slap — then the oxygen can. The shadow is her own sprite, this much
 *  bigger, `SHADOW_OFF` ahead of her when it stands and `SHADOW_GAP` short of the foe when it punches. */
export const SHADOW = { rise: 0, scare: 1, rush: 2, beat: 3, done: 4 } as const;
export const SHADOW_SCARE = .35;
export const SHADOW_DASH = .18;
export const SHADOW_BEATS = [0, .34, .6, .8, .94] as const;
export const SHADOW_PAUSE = .5;
export const SHADOW_TAIL = 1;
export const SHADOW_SCALE = 1.32;
export const SHADOW_OFF = 46;
export const SHADOW_GAP = 72;
/** The shadow's poses, as [sheet, col, row]: standing, the leap of the rush, the two strikes it trades on the beats,
 *  the wind-up before the slap, the slap (the I strike cell). yomogiFx bakes exactly these ahead of time. */
export const SHADOW_POSE = {
  stand: ['common', 0, 0], leap: ['common', 5, 0], jab: ['common', 3, 1], kick: ['common', 6, 1], wind: ['common', 5, 1], slap: ['special', 1, 1],
} as const satisfies Record<string, readonly ['common' | 'special', number, number]>;
export const SHADOW_CELLS = Object.values(SHADOW_POSE);
/** Once the move lets go: the shadow holds `hold`, then sinks over `sink`; the cord and the speed lines fade over theirs. */
export const SHADOW_LET = { hold: .25, sink: .75, cord: .25, focus: .35 } as const;
export const PLAY = { bow: 0, dash: 1, away: 2, bye: 3, ear: 4 } as const;
/** The dash looks for a body this long after the bow. */
export const PLAY_DASH = .22;
/** The cut carries her this far past them — out past the wall of the crayon house — over PLAY_THROUGH. */
export const PLAY_PASS = 182;
export const PLAY_THROUGH = .12;
/** The cut cell holds this long after the catch; then she stands, head bowed, her back to them. */
export const PLAY_CUT_HOLD = .2;
/** After the cut: the house draws itself round them, then three late slashes, then the goodbye. */
export const PLAY_DRAW = .5;
export const PLAY_SLASHES: readonly number[] = [.72, .97, 1.22];
export const PLAY_BYE = 1.5;
/** After the goodbye: the second thought, the touch of the earlobe (or the end if they are down). */
export const PLAY_THOUGHT = .15;
export const PLAY_EAR_AT = .9;
export const PLAY_EAR_HOLD = .5;
/** 再见 is the curtain call: the curtains close over the stage, hold with 完 written on them, then fly
 *  up and away. Seconds after the goodbye. `half` is the half-width of the stage they close over —
 *  inside where she stands, so she is left outside the curtain. */
export const PLAY_CURTAIN = { close: .22, hold: .62, gone: .9, half: 160, top: 300 } as const;
/** The crayon house round the one she cut: half-width, wall height and roof peak over the floor. */
export const PLAY_HOUSE = { w: 124, wall: 150, roof: 240 } as const;
/** The four crayon figures holding hands across the house with them in the middle. `x` is the offset
 *  from the centre, positive toward the side she leaves by; `tear` is the slash that tears each
 *  (3 is the goodbye). 蕾叶 holds their hand and goes last, with the house: the word Family was hers.
 *  Colours are the official ones. */
export const PLAY_FIGURES: readonly { name: string; color: string; x: number; tear: number; cm: number; hair: 'twin' | 'long' | 'bangs' | 'bow' }[] = [
  { name: '千樱梨', color: '#FF55AA', x: -98, tear: 0, cm: 154, hair: 'twin' },
  { name: '蕾叶', color: '#FF7700', x: -56, tear: 3, cm: 162, hair: 'long' },
  { name: '蓬咲', color: '#448888', x: 56, tear: 1, cm: 168, hair: 'bangs' },
  { name: '宁月', color: '#9999FF', x: 98, tear: 2, cm: 143, hair: 'bow' },
];
/** A 162 cm crayon figure stands this tall; the others scale by their official height. */
export const PLAY_FIGURE_H = 104;

/** ……来练习吧: seven strums. The gap shrinks evenly from the first to the last, the way the
 *  bridge of Odd Dice speeds up beat by beat. Never under 0.09s (docs/public/moves.md 削防). */
export const PRACTICE_HITS = 7;
export const PRACTICE_GAP0 = .22;
export const PRACTICE_GAP1 = .09;
export function practiceGap(i: number): number {
  return PRACTICE_GAP0 + (PRACTICE_GAP1 - PRACTICE_GAP0) * Math.min(1, i / (PRACTICE_HITS - 2));
}
/** Offset of each strum from the skill's start, summed once: the sea reads these every frame. */
const PRACTICE_BEATS: readonly number[] = (() => {
  const out: number[] = [];
  for (let i = 0, t = 0; i < PRACTICE_HITS; t += practiceGap(i++)) out.push(t);
  return out;
})();
export function practiceBeat(i: number): number {
  return PRACTICE_BEATS[Math.max(0, Math.min(PRACTICE_HITS - 1, i))];
}
/** Strums already struck `local` seconds after the skill's start. */
export function practiceStrums(local: number): number {
  let n = 0;
  while (n < PRACTICE_HITS && PRACTICE_BEATS[n] <= local) n++;
  return n;
}
/** Wind-up, then each strum shows the downstroke for the first half of its gap and the lifted hand
 *  for the rest; after the last strum the hand stays lifted. */
export function practiceRow(t: number, start: number): number {
  if (t < start) return 0;
  const local = t - start;
  const j = Math.max(0, practiceStrums(local) - 1);
  const since = local - PRACTICE_BEATS[j];
  const hold = j === PRACTICE_HITS - 1 ? .12 : practiceGap(j) * .5;
  return since < hold ? 1 : 2;
}

/** 双踩地狱 (nyamu L, front-facing on the stool): the raised sticks (0) and the strike (1) trade on every
 *  DRUM_BEAT; the last DRUM_SLUMP of the cast is the third cell, face down on the kit (「打鼓打似了」). */
export const DRUM_BEAT = .16;
export const DRUM_SLUMP = .5;
export function drumRow(t: number, duration: number): number {
  if (t >= duration - DRUM_SLUMP) return 2;
  return Math.floor(Math.max(0, t) / DRUM_BEAT) % 2;
}

/** 左右开弓 (nyamu U): beat gaps tighten from ROLL_GAP0 to ROLL_GAP1 across ROLL_MAX beats. A tap still
 *  plays ROLL_MIN; the throw cell holds ROLL_THROW; a roll held to the last beat ends in ROLL_SLUMP on the floor. */
export const ROLL_MAX = 12;
export const ROLL_MIN = 3;
export const ROLL_GAP0 = .2;
export const ROLL_GAP1 = .09;
export const ROLL_THROW = .28;
export const ROLL_SLUMP = .6;
/** a.mode for 左右开弓. tired is the throw that follows a full roll and goes on into the slump. */
export const ROLL = { roll: 0, throw: 1, tired: 2, slump: 3 } as const;
export function rollGap(i: number): number {
  const k = Math.min(1, Math.max(0, i / (ROLL_MAX - 1)));
  return ROLL_GAP0 + (ROLL_GAP1 - ROLL_GAP0) * k;
}
/** Seconds after the skill's start that beat i lands. */
export const ROLL_BEATS: readonly number[] = (() => {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < ROLL_MAX; i++) { out.push(t); t += rollGap(i); }
  return out;
})();
/** The strike cell shows for the first half of each gap, the raised sticks for the rest. */
export function rollRow(t: number, start: number, shots: number): number {
  if (t < start || shots <= 0) return 0;
  const j = shots - 1;
  return t - start - ROLL_BEATS[j] < rollGap(j) * .5 ? 1 : 0;
}

/** 蹭热度 (nyamu I): the lunge window, how long the photo holds them, and the tail. */
export const SELFIE = { lunge: 0, held: 1, done: 2, whiff: 3 } as const;
export const SELFIE_LUNGE = .26;
export const SELFIE_HOLD = .56;
export const SELFIE_TAIL = .22;
/** 蹭热度: after the catch, the arm round their shoulder shows this long; then the peace sign for the photo,
 *  which is taken SELFIE_SNAP after the catch. */
export const SELFIE_HOOK = .12;
export const SELFIE_SNAP = .26;

/** 喵姆喵姆 (nyamu O): four paws after the heart, one per syllable. PAW_FAIL is the pose she is left
 *  holding when nobody was charmed. */
export const PAW_FIRST = .14;
export const PAW_GAP = .12;
export const PAW_HITS = 4;
export const PAW_FAIL = .25;
export const PAW = { pose: 0, charmed: 1, failed: 2 } as const;
/** Seconds after the skill's start that paw i swings. */
export function pawTime(i: number): number { return PAW_FIRST + i * PAW_GAP; }
/** Pose until the heart, then each paw shows the swipe (the last one the big swing, cell 2) for half a gap
 *  and the cheek paws between; after the last, a hit holds the swing and a miss falls back to the pose. */
export function pawRow(t: number, start: number, mode: number): number {
  if (t < start) return 0;
  const local = t - start;
  if (local < pawTime(0)) return 0;
  const last = pawTime(PAW_HITS - 1);
  if (local >= last) return mode === PAW.failed && local >= last + PAW_GAP ? 0 : 2;
  const i = Math.min(PAW_HITS - 1, Math.floor((local - PAW_FIRST) / PAW_GAP));
  return local - pawTime(i) < PAW_GAP * .55 ? 1 : 0;
}

/** 让大家幸福的音乐: the seated piano changes cells on every repel beat — ten beats over the cast. */
export function musicRow(t: number, duration: number): number {
  const u = duration > 0 ? Math.min(0.999, Math.max(0, t / duration)) : 0;
  return Math.floor(u * 10) % 3;
}

/** Strum loop. The last 0.22s is the recover cell, matching the early release in combat. */
export function chordRow(t: number, duration: number): number {
  if (t >= duration - .22) return 2;
  return Math.floor(Math.max(0, t) / .14) % 3;
}

/** 高能量！／高音量！: one column of the special sheet is a single cycle — punch or shout — and
 *  the three cells repeat once per shot at the hit interval, each shot landing as the middle
 *  cell comes up. After the last one the recover cell holds out the tail. */
export function volleyRow(t: number, s: { start: number; duration: number; count?: number; interval?: number }): number {
  const count = s.count ?? 1;
  const interval = s.interval ?? Math.max(.05, (s.duration - s.start) / count);
  const first = s.start - interval / 3;
  if (t < first) return 0;
  const k = Math.floor((t - first) / interval);
  if (k >= count) return 2;
  const p = (t - first) / interval - k;
  return p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2;
}

/** 吉他激奏: the strum loop repeats for as long as the key is held — one 0.42s cycle per wave.
 *  The release fast-forward in combat lands in the 0.3s recover tail. */
export function riffRow(t: number, duration: number): number {
  if (t >= duration - .3) return 2;
  return Math.floor(Math.max(0, t) / .14) % 3;
}

/** 这次是真的在唱！: the channel holds the singing (hit) cell the whole way through —
 *  the generic phase mapping would park it on the settle row for five seconds. */
export function singRow(t: number, start: number, duration: number): number {
  if (t >= duration - .3) return 2;
  return t < start ? 0 : 1;
}

/** 韵律直觉: wind and hit alternate once per pulse. Release lands on the recover cell. */
export function grooveRow(t: number, duration: number): number {
  if (t >= duration - .3) return 2;
  return Math.floor(Math.max(0, t) / .42) % 2;
}

/** 改变世界: reach, then the hands alternate on the deck, then a settle. */
export function changeRow(t: number, start: number, duration: number): number {
  if (t >= duration - .35) return 2;
  if (t < start) return 0;
  return Math.floor((t - start) / .14) % 2;
}

/** 高性能作曲AI: the mash alternates until the last quarter-second bows out. */
export function composeRow(t: number, start: number, duration: number): number {
  if (t < start) return 0;
  if (t >= duration - .25) return 2;
  return Math.floor((t - start) / .12) % 2;
}

/** 火鸟: the pillar sheet plays eruption → burn → embers over the projectile's own clock.
 *  Row 0 erupts (4 frames over .2s), row 1 burns (a 4-frame loop at 12fps), row 2 sinks into
 *  embers over the last .25s; the empty last cell never plays. `life` is the remaining clock
 *  (it hits 0 exactly when the pillar dies), so the die-down reads off it directly — pairing
 *  it with `age` would run the tail at double speed and freeze the last ember frame.
 *  Lives here so the renderer and any future scheduler share one mapping. */
export function pillarFrame(age: number, life: number): [number, number] {
  if (age < .2) return [Math.min(3, Math.floor(age / .05)), 0];
  if (life < .25) return [Math.min(2, Math.floor((.25 - life) / .09)), 2];
  return [Math.floor(age * 12) % 4, 1];
}

/** BRAVE JEWEL: the tongue sheet plays ignition → travel → embers on the projectile clock.
 *  Row 0 grows over .48s (four lengths you can actually see), row 1 loops, row 2 dies
 *  across the last .2s. The empty last cell never plays. `life` is the remaining clock,
 *  same reason as pillarFrame. */
export function flameFrame(age: number, life: number): [number, number] {
  if (age < .48) return [Math.min(3, Math.floor(age / .12)), 0];
  if (life < .2) return [Math.min(2, Math.floor((.2 - life) / .07)), 2];
  return [Math.floor(age * 12) % 4, 1];
}

/** 抹茶芭菲: the arms-wide beat holds 0.25s — well past the default 0.1s active — then the bow. */
export function parfaitRow(t: number, start: number, duration: number): number {
  if (t < start) return 0;
  if (t < duration - .15) return 1;
  return 2;
}

/** Wink, heart hands, then back to standing. */
export function heartRow(t: number, start: number): number {
  if (t < start) return 0;
  if (t < start + .32) return 1;
  return 2;
}

/** 丸山闪光: the wink raise holds an extra beat and the まんまるお山 circle plays the last .6s
 *  (the generic phase split would park the settle cell for a full second). */
export function flashRow(t: number, start: number, duration: number): number {
  if (t < start) return 0;
  if (t >= duration - .6) return 2;
  return 1;
}

/** 诗超绊: a short breath, a 0.6s sung note that lands right on the summon, then the bow. */
export function poemRow(t: number, start: number): number {
  if (t < start - .6) return 0;
  if (t < start) return 1;
  return 2;
}

/** 此即世界: the cast gesture rides the special L column, the chant plays the dedicated dance
 *  sheet while the world stands still, and the pulse lands on the row-2 hold pose. Cell meaning
 *  is fixed: row 0 dance beats, row 1 fancier beats, row 2 cell 0 the post-pulse pose. */
export const WORLD_CAST = .4;
export function manaWorldFrame(t: number, s: { start: number }): Clip {
  if (t < WORLD_CAST) {
    const row = t < WORLD_CAST / 3 ? 0 : t < (WORLD_CAST * 2) / 3 ? 1 : 2;
    return at('special', 3, row);
  }
  if (t >= s.start) return at('world', 0, 2);
  const beat = Math.floor((t - WORLD_CAST) / .2) % 8;
  return at('world', beat % 4, beat < 4 ? 0 : 1);
}

/** 和灯在一起的话: seven accelerating beats after the catch — first gap, then shrink per beat.
 *  Lives here so the hit scheduler (combat), the geometry poses and the row mapper share one schedule. */
export const VOW_BEATS = 7;
const VOW_GAP = .32;
const VOW_SHRINK = .8;

/** Catch-to-beat k, shared by the hit scheduler and the animators so they never drift. */
export function vowBeatTime(k: number): number {
  let t = 0;
  for (let i = 0; i < k; i++) t += VOW_GAP * Math.pow(VOW_SHRINK, i);
  return t;
}

/** 全力碰撞: row 0 hoists, row 1 drives them into the floor, row 2 settles.
 *  tossAt 0 is still reaching; tossAt < 0 is a miss. Each beat splits in half. */
export function crashRow(t: number, tossAt: number, shots: number, start: number, duration: number, interval: number): number {
  if (t < start || tossAt === 0) return 0;
  if (tossAt < 0 || t >= duration - .3) return 2;
  const u = (t - tossAt - shots * interval) / Math.max(.05, interval);
  return u < .5 ? 0 : 1;
}

/** 剑道三连: per-move phase — 0 pending, 1 tap, 2 stance, 3 waves. */
export const IAIDO_PHASE = { pending: 0, tap: 1, stance: 2, waves: 3 } as const;
/** 请你喝茶: the pin cycle — 0 lunge, 1 caught, 2 whiff. */
export const TEA_PHASE = { lunge: 0, caught: 1, whiff: 2 } as const;
/** 剑道三连: the press is still a tap until this moment. Past it, a held key is the stance. */
export const IAIDO_DECIDE = .2;
/** Stance auto-fires the three waves once it has been held this long. */
export const IAIDO_CHARGE = .7;
/** Recover tail shared by the tap and the waves. */
export const IAIDO_RECOVER = .28;
/** The tap lands three wooden cuts, one beat per gap. */
export const IAIDO_HITS = 3;
export const IAIDO_GAP = .14;
/** The wave branch fires the same three beats, tighter. */
export const IAIDO_WAVE_GAP = .08;
/** 剑道三连: how full the held stance's charge is, 0 → 1. 1 is where it auto-fires. */
export function iaidoCharge(t: number): number {
  return Math.min(1, Math.max(0, (t - IAIDO_DECIDE) / IAIDO_CHARGE));
}
/** 请你喝茶: after the catch, the tail is the long whiff or the settle. */
export const TEA_RECOVER = .3;

/** 武士道: windup and sheathe stay on special column L. The twelve cells in between are all cuts. */
export const BUSHIDO_TAIL = .32;

export function bushidoClip(t: number, s: { start: number; duration: number }): Clip {
  if (t < s.start) return at('special', 3, 0);
  if (t >= s.duration - BUSHIDO_TAIL) return at('special', 3, 2);
  const span = Math.max(.05, s.duration - BUSHIDO_TAIL - s.start);
  const cell = Math.min(11, Math.floor((t - s.start) / span * 12));
  return at('world', cell % 4, Math.floor(cell / 4));
}

/** 大闹一场: seven hits, then the follow-through. The combo escape fires on the seventh
 *  clean hit, so the route stops there; cells 7–11 are the slam settling, not more damage. */
export const RIOT_HITS = 7;
export const RIOT_GAP = .16;

/** Cell 0–6 are the strikes, one per gap. After the last strike the tail walks 7–11. */
export function riotCell(t: number, caughtAt: number): number {
  const bt = Math.max(0, t - caughtAt);
  const hitSpan = (RIOT_HITS - 1) * RIOT_GAP;
  if (bt <= hitSpan + 1e-4) return Math.min(RIOT_HITS - 1, Math.floor(bt / RIOT_GAP + 1e-4));
  return Math.min(11, RIOT_HITS + Math.floor((bt - hitSpan) / .11));
}

/** 一辈子: cell 0 is the lunge and the catch; after the catch the loop coils (1) through most of
 *  each gap and slams (2) on the beat, faster every beat. Row 2 holds through the recover. */
export function vowRow(t: number, tossAt: number): number {
  if (tossAt <= 0 || t < tossAt) return 0;
  const bt = t - tossAt;
  if (bt >= vowBeatTime(VOW_BEATS - 1)) return 2;
  let j = 0;
  while (j + 1 < VOW_BEATS && vowBeatTime(j + 1) <= bt) j++;
  const span = vowBeatTime(j + 1) - vowBeatTime(j);
  const p = Math.max(0, Math.min(1, (bt - vowBeatTime(j)) / span));
  return p < .62 ? 1 : 2;
}

/** 狂化 J/K on the frenzy sheet. Row 0 is the light flurry, row 1 the kicks.
 *  Cells: 0 windup, 1 and 2 the two flurry beats, 3 the follow-through. */
export function soyoFrenzyFrame(kind: 'light' | 'heavy', t: number, s: { start: number; duration: number }): [number, number] {
  const row = kind === 'light' ? 0 : 1;
  if (t < s.start) return [0, row];
  if (t >= s.duration - .1) return [3, row];
  const span = Math.max(.05, s.duration - .1 - s.start);
  const beat = Math.floor(((t - s.start) / span) * 2);
  return [1 + Math.min(1, beat), row];
}

/** Which cell a fighter occupies this frame. Missing sheets still fall back in SpriteView. */
/* ---- MASKING（佐藤益木） ---- */

/** 死亡银河号 / 银河流星踢: the red-black bike (bike.png, side view facing right). Drawn BIKE_W wide in the
 *  world with its wheels on the floor; the art's tyres touch BIKE_FOOT of the way down the picture.
 *  The rider cells are drawn with her feet BIKE_PEG cell px above the foot line, so on the seat she sits
 *  that high; BIKE_SEAT_X is where the seat sits from her origin (negative: behind her feet). */
export const BIKE_W = 236;
export const BIKE_FOOT = 500 / 512;
export const BIKE_PEG = 34;
export const BIKE_SEAT_X = -6;
/** The nose of the bike sits this far ahead of her; a body carried on it is pinned here. */
export const BIKE_NOSE = 104;
/** 死亡银河号: a.mode — the kick start in the exhaust, the run, the skid, off the bike. */
export const RIDE = { mount: 0, ride: 1, skid: 2, done: 3 } as const;
/** Seconds of the run (or until a wall), of the skid, and of the step off. */
export const RIDE_TIME = .5;
export const RIDE_SKID = .22;
export const RIDE_TAIL = .26;
/** 可爱鉴定: a.mode — the reach, the cheeks held, done (or nobody caught). The first pinch comes
 *  CUTE_FIRST after the catch, then one every CUTE_GAP; each holds the pinch cell for CUTE_PINCH. */
export const CUTE = { lunge: 0, held: 1, done: 2 } as const;
export const CUTE_LUNGE = .22;
export const CUTE_FIRST = .14;
export const CUTE_GAP = .2;
export const CUTE_PINCH = .08;
export const CUTE_TAIL = .38;
/** 即兴加花: the fills she plays, in seconds after the start — never the same groove twice in a row,
 *  and never on the grid. The last entry is the crash (the skill's finale). One is rolled per cast. */
export const FILLS: readonly (readonly number[])[] = [
  [0, .09, .25, .31, .47, .55, .82],
  [0, .16, .22, .38, .44, .6, .86],
  [0, .07, .14, .34, .5, .57, .8],
];
/** 即兴加花: each jab holds the punch cell this long; the crash cell holds through the tail. */
export const FILL_JAB = .07;
export const FILL_TAIL = .32;
/** 即兴加花: a.mode — playing, the crash has landed. */
export const FILL = { play: 0, done: 1 } as const;
/** 银河流星踢: a.mode — revving with LOCK on the back, the charge, a body carried on the nose, the leap
 *  off the seat and the kick, done. */
export const METEOR = { rev: 0, charge: 1, carry: 2, leap: 3, done: 4 } as const;
/** Charge window before she gives up on a body and leaps anyway; carry at most this long (or to a wall). */
export const METEOR_CHARGE = .7;
export const METEOR_CARRY = 1;
/** The leap: up off the seat, the turn at the top, then the kick down onto the mark. */
export const METEOR_LEAP = .58;
export const METEOR_RISE = .42;
export const METEOR_HIGH = 210;
export const METEOR_TAIL = .42;
/** LOCK, on the back seat: her official colour and height (萌娘百科《朝日六花》). */
export const LOCK_COLOR = '#AAEE22';
export const LOCK_CM = 155;
export const MASKING_CM = 170;

/** 即兴加花: the punch cell for a beat after each jab, the guard cell between, the crash cell after. */
export function fillRow(mode: number | undefined, t: number, liftAt: number): number {
  if (mode === FILL.done) return 2;
  return liftAt > 0 && t < liftAt + FILL_JAB ? 1 : 0;
}

/* ---- 花园多惠 ---- */

/** 神出鬼没: a.mode — the dig, underground (the body is hidden, the ears peek out of the far hole), the pop
 *  out of it, done. She surfaces BURROW_WAIT after going under, on the spot the foe stood when she dug in. */
export const BURROW = { dig: 0, under: 1, pop: 2, done: 3 } as const;
export const BURROW_WAIT = .36;
/** The far hole opens on the nearest foe within this reach; beyond it, this far ahead of her. */
export const BURROW_REACH = 430;
export const BURROW_SHORT = 260;
/** The pop: up out of the hole and back down onto it. */
export const BURROW_POP = .44;
export const BURROW_HIGH = 118;
export const BURROW_TAIL = .3;
/** 花园警察，出动！: a.mode — the lunge, the cuffs going on, done. */
export const POLICE = { lunge: 0, cuff: 1, done: 2 } as const;
export const POLICE_LUNGE = .22;
export const POLICE_CUFF = .2;
export const POLICE_TAIL = .34;
/** 欢迎来到兔子王国 and the rabbits everywhere: one hop takes RABBIT_HOP seconds and clears RABBIT_HIGH px;
 *  the rabbit's feet sit on the floor between hops. The coats are 小欧 (white, odd eyes), 小紫, 团十郎,
 *  可可亚, BB King and 小白 (萌娘百科: 家里至少 23 只兔子). */
export const RABBIT_HOP = .34;
export const RABBIT_HIGH = 40;
export const RABBIT_COATS = 6;
/** Where a hopping rabbit is in its hop: u runs 0→1 across one hop (0 and 1 on the floor), lift is the height
 *  over the floor. Each coat hops at its own pace and height, so a line of them never moves in step. */
export function rabbitHop(age: number, coat: number): { lift: number; u: number } {
  const hop = RABBIT_HOP * (1 + (coat % 3) * .06);
  const u = (Math.max(0, age) / hop) % 1;
  return { lift: RABBIT_HIGH * (1 + ((coat * 7) % 5 - 2) * .08) * Math.sin(Math.PI * u), u };
}
/** 后藤一里: U / I stand back up, and 崩坏 is sanded back, this long before the pose ends. */
export const BOCCHI_OUT = .22;
/** 吉他英雄: a.mode — the solo, the stage dive, face down on the floor. */
export const BOCCHI_HERO = { play: 0, dive: 1, down: 2 } as const;
/** Integer beats start on a downstroke. The lightning uses the same clock. */
export function bocchiSoloBeat(a: Attack): number {
  return (a.t - a.skill.start) / (a.skill.interval ?? .15);
}
/** 花园兔王: a.mode — pointing at the sky, the warren erupting, her own dive, the rise beside them, the kick
 *  and the fall, done. */
export const WARREN = { call: 0, erupt: 1, dive: 2, rise: 3, fall: 4, done: 5 } as const;
/** Four holes round the mark (and 小欧's big one on it); the rabbits pop in this order, WARREN_GAP apart. */
export const WARREN_HOLES: readonly number[] = [-104, -38, 38, 104];
export const WARREN_ORDER: readonly number[] = [1, 2, 0, 3, 2, 1, 3, 0];
export const WARREN_FIRST = .12;
export const WARREN_GAP = .15;
/** 小欧 comes this long after the last small rabbit; she dives as 小欧 jumps. */
export const WARREN_BIG = .24;
export const WARREN_DIVE = .18;
export const WARREN_RISE = .3;
export const WARREN_FALL = .3;
export const WARREN_KICK_H = 210;
/** Height 小欧 throws them to. */
export const WARREN_TOP = 236;
export const WARREN_TAIL = .4;
/** A rabbit is on its way this long before its hit lands, so the kick and the damage arrive together; 小欧 a
 *  little longer (the bigger jump). */
export const WARREN_LEAD = .1;
export const WARREN_BIG_LEAD = .15;

/* ---- 今井莉莎 ---- */
/** 元气辣妹☆: the slide covers its whole distance in LISA_GAL_TRAVEL, fast then braking (ease-out), so the hit cell
 *  is never carried across the floor at a constant speed; she stops into the V-sign cell. */
export const LISA_GAL_TRAVEL = .3;
/** 不用说我也懂: how long the read holds, and the flick she answers with — the flick cell, then hands on hips. */
export const LISA_READ = { cast: 0, flick: 1 } as const;
export const LISA_READ_TIME = 4;
export const LISA_FLICK_HIT = .22;
export const LISA_FLICK_TIME = .5;
/** 特制曲奇·隐藏风味: the toss cell holds this long after the active frame; the mustard goes off LISA_FUSE after
 *  the cookie lands; then, if she is free, a cup of herbal tea for LISA_TEA. */
export const LISA_COOKIE = { cast: 0, tea: 1 } as const;
export const LISA_TOSS = .28;
export const LISA_FUSE = 1.5;
export const LISA_TEA = .8;
/** 银猫扑脸: how long the cat clings (the 混乱 runs the same), and the cat's height off the floor as it runs. */
export const LISA_CLING = 2;
/** 摇匀一杯摩卡: the lunge, the grip (four shakes on a fixed beat), the let-go. Shared by game/himari.ts and the cell pick. */
export const HIMARI_SHAKE = { lunge: 0, held: 1, done: 2 } as const;
export const HIMARI_SHAKE_LUNGE = .3;
export const HIMARI_SHAKE_FIRST = .12;
export const HIMARI_SHAKE_GAP = .17;
export const HIMARI_SHAKE_TAIL = .32;
/** 一呼零应: the three words go up at these seconds into the cast (before Skill.start); the fist stays up this long
 *  after the silence falls, then her shoulders drop. */
export const HIMARI_AAO_WORDS = [.02, .16, .3] as const;
export const HIMARI_AAO_RAISE = .32;
/** 一呼百应: her two 「A！」 and the 「O——！」 (seconds into the move), the four who answer (鸫, 巴, 摩卡, 兰 in that order,
 *  HIMARI_ANSWER_AT + n × HIMARI_ANSWER_GAP), the sunset wave they make together, and when she turns for the V. */
export const HIMARI_CALL_A = [.5, .78] as const;
export const HIMARI_CALL_O = 1.04;
export const HIMARI_ANSWER_AT = 1.16;
export const HIMARI_ANSWER_GAP = .22;
export const HIMARI_CALL_FINAL = 2.06;
export const HIMARI_CALL_TURN = 2.24;
/** friends.png: 4 columns (the four, in answer order) × 3 rows — HIMARI_FRIEND_ROW. Shared by himariFx.ts and the sheet script. */
export const HIMARI_FRIENDS_SRC = '/sprites/himari/friends.png';
export const HIMARI_FRIEND_ROW = { rise: 0, shout: 1, after: 2 } as const;
export interface HimariFriend { name: string; color: string; height: number }
/** 一呼百应: who answers, in order; the column on friends.png is the index. */
export const HIMARI_FRIENDS: readonly HimariFriend[] = [
  { name: '鸫', color: '#FFEE88', height: 172 },
  { name: '巴', color: '#BB0033', height: 188 },
  { name: '摩卡', color: '#00CCAA', height: 175 },
  { name: '兰', color: '#EE0022', height: 181 },
];

/** 这张必火: the lunge, the arm round their shoulders until the flash, the look at the phone. Shared by game/toko.ts and the cell pick. */
export const TOKO_SELFIE = { lunge: 0, held: 1, done: 2 } as const;
export const TOKO_SELFIE_LUNGE = .3;
export const TOKO_SELFIE_SNAP = .22;
export const TOKO_SELFIE_TAIL = .3;
/** 师父示范一下: seconds after her own muddy note that 纱夜 steps in (TOKO_MASTER_IN) and looses the arrow (TOKO_MASTER_AT);
 *  the strum cell holds TOKO_STRUM. 纱夜 is the U column of her own special sheet. */
export const TOKO_MASTER_IN = .25;
export const TOKO_MASTER_AT = .45;
export const TOKO_STRUM = .3;
export const TOKO_MASTER_SRC = '/sprites/sayo/special.png';
export const TOKO_MASTER_HEIGHT = 199;
/** 天上天下 本小姐独尊: the pillar from the sky, three waves along the floor, the five colours together, and when she turns away. */
export const TOKO_SOLO_SKY = .6;
export const TOKO_SOLO_WAVES = [.9, 1.08, 1.26] as const;
export const TOKO_SOLO_FINAL = 1.7;
export const TOKO_SOLO_TURN = 1.95;
/** The five of Morfonica in line-up order (真白 / 透子 / 七深 / 筑紫 / 瑠唯): the colours the one spotlight splits into. */
export const TOKO_FIVE = ['#6677CC', '#EE6666', '#EE7744', '#EE7788', '#669988'] as const;

/** 白鹭千圣. 这明明是狗: the doodle hops this many times a second along the floor, this high at the top of a hop. */
export const CHISATO_HOPS = 2.6;
export const CHISATO_HOP = 54;
/** 铁壁微笑: how long the smile holds, and how many veins it takes before she glares back. */
export const CHISATO_SMILE = 3.5;
export const CHISATO_VEINS = 3;
/** 有必要说教一下呢: the beckon (Skill.start), the pull, six bubbles on a beat, the 花丸. Seconds after the catch. */
export const CHISATO_LECTURE = { beckon: 0, pull: 1, held: 2, done: 3, whiff: 4 } as const;
export const CHISATO_PULL = .22;
export const CHISATO_BUBBLE_FIRST = .45;
export const CHISATO_BUBBLE_GAP = .28;
export const CHISATO_BUBBLES = 6;
export const CHISATO_STAMP_AFTER = .42;
/** Catch to 花丸. The 'lecture' mod on the one being lectured counts this down; the squash reads it. */
export const CHISATO_LECTURE_SPAN = CHISATO_BUBBLE_FIRST + (CHISATO_BUBBLES - 1) * CHISATO_BUBBLE_GAP + CHISATO_STAMP_AFTER;
/** 正坐: the one being lectured sits on the standing cell, pressed flat and low, and shrinks with every bubble. */
export function lectureSquash(f: Fighter): { x: number; y: number } | undefined {
  const m = f.mods.find(x => x.kind === 'lecture' && x.left > 0);
  if (!m) return undefined;
  const k = Math.min(1, Math.max(0, 1 - m.left / CHISATO_LECTURE_SPAN));
  const settle = Math.min(1, (CHISATO_LECTURE_SPAN - m.left) / .12);
  const s = 1 - .26 * k;
  return { x: s * (1 + .08 * settle), y: s * (1 - .2 * settle) };
}

export const LISA_CAT_BODY = 22;


/* ---- LOCK（朝日六花）: shared by src/game/lock.ts, the cell picks below and render/lockFx.ts ---- */
/** 限制器解除: after the cast's start, the throw cell holds this long (the flash) before the stage pose. */
export const LOCK_UNSEAL_FLASH = .14;
/** 护六出动: her hop back, MASKING's ride (speed px/s, how far behind her he starts, half-width the bike
 *  hits on, the longest ride). */
export const LOCK_HOP = .34;
export const LOCK_RIDE = { speed: 980, back: 170, reach: 74, time: .9 } as const;
/** 少女乐团大时代: the timeline on the attack clock. The intro (glasses off) only plays from street clothes;
 *  cast in costume, the clock starts at `intro`. */
export const LOCK_LIVE = { intro: .4, inhale: .18, scream: .55, bang: .26, bangs: 5, star: .32, bow: .6, settle: .32 } as const;
export const LOCK_LIVE_SCREAM = LOCK_LIVE.intro + LOCK_LIVE.inhale;
export const LOCK_LIVE_BANGS = LOCK_LIVE_SCREAM + LOCK_LIVE.scream;
export const LOCK_LIVE_STAR = LOCK_LIVE_BANGS + LOCK_LIVE.bang * LOCK_LIVE.bangs;
export const LOCK_LIVE_BOW = LOCK_LIVE_STAR + LOCK_LIVE.star;
export const LOCK_LIVE_END = LOCK_LIVE_BOW + LOCK_LIVE.bow + LOCK_LIVE.settle;
/** Within one headbang, the head goes down (the hit) this far into the beat. */
export const LOCK_BANG_HIT = .45;
/** The Galaxy 开业 bands, then her own: one colour per headbang (bands.ts). */
export const LOCK_BAND_COLORS = ['#4455BB', '#FFEE22', '#EE0022', '#FF5522', '#CC0000'] as const;
/** The special cells: U and I columns are street clothes; U's last cell, the O column and L are the stage outfit. */
function lockLiveCell(t: number): Clip {
  if (t < LOCK_LIVE.intro) return at('special', 0, t < LOCK_LIVE.intro * .55 ? 0 : 1);
  if (t < LOCK_LIVE_SCREAM) return at('special', 2, 0);
  if (t < LOCK_LIVE_BANGS) return at('special', 3, 0);
  if (t < LOCK_LIVE_STAR) {
    const k = ((t - LOCK_LIVE_BANGS) / LOCK_LIVE.bang) % 1;
    return at('special', 3, k < LOCK_BANG_HIT ? 2 : 1);
  }
  if (t < LOCK_LIVE_BOW) return at('special', 3, 2);
  return at('special', 2, t < LOCK_LIVE_BOW + LOCK_LIVE.bow ? 1 : 2);
}

export function clipFor(f: Fighter): Clip {
  // 有必要说教一下呢: whoever is being lectured sits it out on the standing cell (squashed by spriteView).
  if (!f.attack && f.mods.some(m => m.kind === 'lecture' && m.left > 0)) return loco('idle');
  if (f.attack) {
    // 狂化: ground J/K read the frenzy sheet. A king or box reskin keeps the common cells and swaps the image.
    const crowned = f.data.view.kind === 'sprite' && (!!f.data.view.king || !!f.data.view.box);
    if (f.frenzy > 0 && !crowned && f.attack.index <= 1 && !f.attack.skill.air) {
      const [col, row] = soyoFrenzyFrame(f.attack.index === 0 ? 'light' : 'heavy', f.attack.t, f.attack.skill);
      return { sheet: 'frenzy', col, row, sx: col * CELL, sy: row * CELL };
    }
    if (f.attack.skill.fx === 'flurry' || f.attack.skill.fx === 'mega')
      return at('special', f.attack.index - 2, volleyRow(f.attack.t, f.attack.skill));
    if (f.attack.skill.fx === 'drums') return at('special', f.attack.index - 2, drumRow(f.attack.t, f.attack.skill.duration));
    // 左右开弓: strike / raised on every beat; the throw is the third cell; a roll held out lies her down.
    if (f.attack.skill.fx === 'stick-roll') {
      const a = f.attack, mode = a.mode ?? ROLL.roll;
      if (mode === ROLL.slump) return loco('down');
      if (mode === ROLL.throw || mode === ROLL.tired) return at('special', a.index - 2, 2);
      return at('special', a.index - 2, rollRow(a.t, a.skill.start, a.shots));
    }
    // 蹭热度: stick up on the lunge, the arm round their shoulder as she catches them, then the peace sign for the photo.
    if (f.attack.skill.fx === 'selfie') {
      const a = f.attack, mode = a.mode ?? SELFIE.lunge;
      if (mode === SELFIE.lunge) return at('special', a.index - 2, 0);
      return at('special', a.index - 2, mode === SELFIE.held && a.t < a.tossAt + SELFIE_HOOK ? 1 : 2);
    }
    if (f.attack.skill.fx === 'nyamu-paw') return at('special', f.attack.index - 2, pawRow(f.attack.t, f.attack.skill.start, f.attack.mode ?? PAW.pose));
    if (f.attack.skill.fx === 'happymusic') return at('special', f.attack.index - 2, musicRow(f.attack.t, f.attack.skill.duration));
    // 起死开战: the same seated loop — three cells alternate hands over the cast.
    if (f.attack.skill.fx === 'war') return at('special', f.attack.index - 2, musicRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'chord') return at('special', f.attack.index - 2, chordRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'riff') return at('special', f.attack.index - 2, riffRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'sing') return at('special', f.attack.index - 2, singRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'groove') return at('special', f.attack.index - 2, grooveRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'change') return at('special', f.attack.index - 2, changeRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'compose') return at('special', f.attack.index - 2, composeRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'parfait') return at('special', f.attack.index - 2, parfaitRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'flash') return at('special', f.attack.index - 2, flashRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'heart') return at('special', f.attack.index - 2, heartRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'wink') return at('special', f.attack.index - 2, heartRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'crown') return at('special', f.attack.index - 2, volleyRow(f.attack.t, f.attack.skill));
    if (f.attack.skill.fx === 'world') return manaWorldFrame(f.attack.t, f.attack.skill);
    if (f.attack.skill.fx === 'poem') return at('special', f.attack.index - 2, poemRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'star') return at('special', f.attack.index - 2, volleyRow(f.attack.t, f.attack.skill));
    if (f.attack.skill.fx === 'rabbit' || f.attack.skill.fx === 'kiss' || f.attack.skill.fx === 'hug' || f.attack.skill.fx === 'half' || f.attack.skill.fx === 'king' || f.attack.skill.fx === 'wolf') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .22 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    if (f.attack.skill.fx === 'vow') return at('special', f.attack.index - 2, vowRow(f.attack.t, f.attack.tossAt));
    if (f.attack.skill.fx === 'riot') {
      const s = f.attack.skill;
      if (f.attack.t < s.start) return at('special', 3, 0);
      const cell = riotCell(f.attack.t, s.start);
      return at('world', cell % 4, Math.floor(cell / 4));
    }
    if (f.attack.skill.fx === 'bushido') return bushidoClip(f.attack.t, f.attack.skill);
    if (f.attack.skill.fx === 'iaido') {
      const a = f.attack, s = a.skill;
      const mode = a.mode ?? IAIDO_PHASE.pending;
      if (mode === IAIDO_PHASE.pending || mode === IAIDO_PHASE.stance) return at('special', 0, 0);
      // 剑道三连: each of the three beats replays the whole cut column (windup / hit / recover),
      // so the tap reads as three quick swings instead of one held pose.
      const start = mode === IAIDO_PHASE.tap ? IAIDO_DECIDE : a.tossAt;
      const interval = mode === IAIDO_PHASE.tap ? IAIDO_GAP : IAIDO_WAVE_GAP;
      return at('special', 0, volleyRow(a.t, { start, duration: s.duration, count: IAIDO_HITS, interval }));
    }
    if (f.attack.skill.fx === 'tea') {
      const a = f.attack;
      if ((a.mode ?? TEA_PHASE.lunge) === TEA_PHASE.lunge) return at('special', 1, 0);
      if (a.mode === TEA_PHASE.whiff || a.t >= a.skill.duration - TEA_RECOVER) return at('special', 1, 2);
      return at('special', 1, 1);
    }
    if (f.attack.skill.fx === 'cloak') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t < s.start + .4 ? 1 : 2;
      return at('special', 2, row);
    }
    if (f.attack.skill.fx === 'spin') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .26 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    // 脸靠的太近了: the generic active window is capped at .1s, which hides the scream pose.
    // Hold the hit cell through the wave instead, leaving a fixed settle tail.
    if (f.attack.skill.fx === 'tsun') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .3 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    if (f.attack.skill.fx === 'crash') {
      const a = f.attack, s = a.skill;
      return at('special', a.index - 2, crashRow(a.t, a.tossAt, a.shots, s.start, s.duration, s.interval ?? .22));
    }
    // 燃尽: the generic active window is capped at .1s. Hold the slam cell half again as long.
    if (f.attack.skill.fx === 'burnout') {
      const t = f.attack.t, s = f.attack.skill;
      const activeLen = Math.min(.1, (s.duration - s.start) * .4) * 1.5;
      const row = t < s.start ? 0 : t < s.start + activeLen ? 1 : 2;
      return at('special', f.attack.index - 2, row);
    }
    // 好痛……♡: lying in the act is the first cell. A sprung trap shows the strike, then the settle;
    // an act nobody fell for goes straight to getting up.
    if (f.attack.skill.fx === 'feign') {
      const a = f.attack, s = a.skill;
      const row = a.mode === 1 ? (a.t < a.tossAt + FEIGN_STRIKE ? 1 : 2) : a.t < s.start ? 0 : 2;
      return at('special', a.index - 2, row);
    }
    // 康乃馨盛开之日: hands folded, the tip back into the coffin, then the step out with a sigh.
    if (f.attack.skill.fx === 'coffin') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t < s.duration - COFFIN_OUT ? 1 : 2;
      return at('special', f.attack.index - 2, row);
    }
    // ……来练习吧: the downstroke and the lifted hand trade places on every strum.
    if (f.attack.skill.fx === 'practice') return at('special', f.attack.index - 2, practiceRow(f.attack.t, f.attack.skill.start));
    // 精准踩雷: the step and the reach, the hand on their shoulder until the mine goes, then upright.
    if (f.attack.skill.fx === 'landmine') {
      const a = f.attack, s = a.skill;
      const row = a.t < s.start ? 0 : a.mode === 1 || (a.mode === 2 && a.t < a.tossAt + MINE_FUSE + MINE_HOLD) ? 1 : 2;
      return at('special', a.index - 2, row);
    }
    // 安可是主唱的: the 'please' holds through the calls and the dark face; the run trades the two
    // sprint cells; the run home from the other side is the common run.
    if (f.attack.skill.fx === 'encore') {
      const a = f.attack, mode = a.mode ?? ENCORE.crowd;
      if (mode === ENCORE.dash) return at('special', a.index - 2, 1 + (Math.floor(a.t * 12) % 2));
      if (mode === ENCORE.back || mode === ENCORE.gone) return loco(RUN_FRAMES[Math.floor(a.t * 8) % 4]);
      return at('special', a.index - 2, 0);
    }
    // 表面烤得很漂亮: the smiling glide holds the first cell through the pat; the cut, then the settle.
    if (f.attack.skill.fx === 'puff-cut') {
      const a = f.attack, mode = a.mode ?? PUFF.glide;
      if (mode === PUFF.glide || (mode === PUFF.beat && a.liftAt <= 0)) return at('special', a.index - 2, 0);
      return at('special', a.index - 2, a.liftAt > 0 && a.t < a.liftAt + PUFF_CUT ? 1 : 2);
    }
    // 才没有在撒谎: the finger on the earlobe; the palms (the knee replays the strike cell); the settle.
    if (f.attack.skill.fx === 'earlobe') {
      const a = f.attack, s = a.skill, mode = a.mode ?? EAR.act;
      if (mode === EAR.caught) return at('special', a.index - 2, a.t < a.tossAt + EAR_KNEE + EAR_HOLD ? 1 : 2);
      if (mode === EAR.palm) return at('special', a.index - 2, a.t < a.tossAt + (EAR_PALM_HITS - 1) * EAR_PALM_GAP + EAR_SOLO ? 1 : 2);
      return at('special', a.index - 2, a.t < s.start ? 0 : 2);
    }
    // 世界如此广阔: hands together through the prayer and the dash; arms wide while it all goes off.
    if (f.attack.skill.fx === 'wide-world') {
      const a = f.attack, mode = a.mode ?? WIDE.pray;
      return at('special', a.index - 2, mode === WIDE.held ? 1 : mode === WIDE.tail ? 2 : 0);
    }
    // 过家家到此为止: the bow, the cut, then she stands with her back to them, head bowed, through the
    // goodbye; the finger on the earlobe is borrowed from her O column.
    if (f.attack.skill.fx === 'playhouse') {
      const a = f.attack, mode = a.mode ?? PLAY.bow;
      if (mode === PLAY.away) return at('special', a.index - 2, a.t < a.tossAt + PLAY_CUT_HOLD ? 1 : 2);
      if (mode === PLAY.ear) return at('special', 2, 0);
      return at('special', a.index - 2, mode === PLAY.bow ? 0 : mode === PLAY.dash ? 1 : 2);
    }
    // 千樱梨登场: the crouch; in the air the common jump; the landing pose held through the quake; hands on hips.
    if (f.attack.skill.fx === 'chieri-entrance') {
      const a = f.attack, mode = a.mode ?? ENTRANCE.crouch;
      if (mode === ENTRANCE.air) return loco('jump');
      if (mode === ENTRANCE.land) return at('special', a.index - 2, a.t < a.liftAt + ENTRANCE_QUAKE ? 1 : 2);
      return at('special', a.index - 2, 0);
    }
    // 千樱梨樱桃炸弹: stamping and shaking through the fuse; the shout as it goes off; hands on hips, out of breath.
    if (f.attack.skill.fx === 'cherry-bomb') {
      const a = f.attack, s = a.skill;
      // a.liftAt is the blast (0 until it goes off; a held fuse keeps the clock pinned just under the start).
      if (a.liftAt <= 0) return at('special', a.index - 2, 0);
      return at('special', a.index - 2, a.t < a.liftAt + CHERRY_SHOUT ? 1 : 2);
    }
    // 千樱梨联盟集合: the cupped-hands call holds through the pull (and through a call nobody answers); the
    // drum beats trade the strike and the raised sticks; the crossed sticks after the cymbal.
    if (f.attack.skill.fx === 'chieri-assemble') {
      const a = f.attack, mode = a.mode ?? ASSEMBLE.call;
      if (mode === ASSEMBLE.drum) return at('special', a.index - 2, ((a.t - a.tossAt) / ASSEMBLE_BEAT) % 1 < .5 ? 1 : 2);
      if (mode === ASSEMBLE.done) return at('special', a.index - 2, 2);
      return at('special', a.index - 2, 0);
    }
    // 躲到你身后: hunched scuttle; the crouch behind their back; the reflex punch; then the heavy settle.
    if (f.attack.skill.fx === 'yomogi-hide') {
      const a = f.attack, mode = a.mode ?? HIDE.sneak;
      if (mode === HIDE.hide) return at('special', a.index - 2, 1);
      if (mode === HIDE.punch) return a.t < a.liftAt + HIDE_PUNCH ? at('special', a.index - 2, 2) : at('common', NORMAL.heavy.c + 2, NORMAL.heavy.r);
      return at('special', a.index - 2, 0);
    }
    // 拳化为掌: the fist drawn back; the open-hand slap, or the common heavy strike for a held fist; staring at the hand.
    if (f.attack.skill.fx === 'yomogi-palm') {
      const a = f.attack, s = a.skill;
      if (a.t < s.start) return at('special', a.index - 2, 0);
      if (a.t < s.start + PALM_HIT) return a.mode === PALM_FIST ? at('common', NORMAL.heavy.c + 1, NORMAL.heavy.r) : at('special', a.index - 2, 1);
      return at('special', a.index - 2, 2);
    }
    // 人体感应雷达: curled up; springing up screaming as it goes off; weak at the knees after (or after nobody came).
    if (f.attack.skill.fx === 'yomogi-radar') {
      const a = f.attack, mode = a.mode ?? RADAR.crouch;
      if (mode === RADAR.crouch) return at('special', a.index - 2, 0);
      if (mode === RADAR.burst && a.t < a.liftAt + RADAR_BURST) return at('special', a.index - 2, 1);
      return at('special', a.index - 2, 2);
    }
    // 想象吧，变强的我: eyes shut, fists tight while the shadow rises; the scream when she sees it; then she hides
    // (the U crouch) while it fights for her; the oxygen can at the end.
    if (f.attack.skill.fx === 'yomogi-shadow') {
      const a = f.attack, mode = a.mode ?? SHADOW.rise;
      if (mode === SHADOW.rise) return at('special', a.index - 2, 0);
      if (mode === SHADOW.scare) return at('special', a.index - 2, 1);
      if (mode === SHADOW.done) return at('special', a.index - 2, 2);
      return at('special', 0, 1);
    }
    // 吉他英雄: alternate both guitar frames until the stage dive takes over.
    if (f.attack.skill.fx === 'bocchi-hero') {
      const a = f.attack;
      if ((a.mode ?? BOCCHI_HERO.play) !== BOCCHI_HERO.play) return at('special', a.index - 2, 2);
      const beat = bocchiSoloBeat(a);
      return at('special', a.index - 2, beat >= 0 && beat % 1 < .5 ? 1 : 0);
    }
    // 崩坏: the pose is hidden under the scribble; the last moment is her standing cell.
    if (f.attack.skill.fx === 'bocchi-crumble') return loco('idle');
    // 完熟芒果 / 下北泽槌子蛇 / 给我点赞: going in, (hidden or holding), coming out.
    if (f.attack.skill.fx.startsWith('bocchi-')) {
      const t = f.attack.t, sk = f.attack.skill;
      return at('special', f.attack.index - 2, t < sk.start ? 0 : t >= sk.duration - BOCCHI_OUT ? 2 : 1);
    }
    // 神出鬼没: the crouch into the hole; up out of the far one; standing, dusting off.
    if (f.attack.skill.fx === 'tae-burrow') {
      const a = f.attack, mode = a.mode ?? BURROW.dig;
      return at('special', a.index - 2, mode === BURROW.done ? 2 : mode === BURROW.pop ? 1 : 0);
    }
    // 花园警察，出动！: cap pulled down on the lunge; the grab; the salute.
    if (f.attack.skill.fx === 'tae-police') {
      const a = f.attack, mode = a.mode ?? POLICE.lunge;
      return at('special', a.index - 2, mode === POLICE.done ? 2 : mode === POLICE.cuff || a.t >= a.skill.start ? 1 : 0);
    }
    // 欢迎来到兔子王国: the pat on the floor; the wave while the rabbits go; standing up.
    if (f.attack.skill.fx === 'tae-hop') {
      const a = f.attack, s = a.skill;
      const last = s.start + ((s.count ?? 5) - 1) * (s.interval ?? .2);
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < last + .18 ? 1 : 2);
    }
    // 花园兔王: pointing at the sky through the call and the warren; rising and kicking; the landing.
    if (f.attack.skill.fx === 'tae-warren') {
      const a = f.attack, mode = a.mode ?? WARREN.call;
      if (mode === WARREN.done) return at('special', a.index - 2, 2);
      return at('special', a.index - 2, mode === WARREN.rise || mode === WARREN.fall ? 1 : 0);
    }
    // 元气辣妹☆: the low lean; the sweep only while she is still sliding; the V sign from the moment she stops.
    if (f.attack.skill.fx === 'lisa-gal') {
      const a = f.attack, s = a.skill;
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < s.start + LISA_GAL_TRAVEL ? 1 : 2);
    }
    // 不用说我也懂: the flick she answers a read with, then hands on hips; the cast itself is the stock three cells.
    if (f.attack.skill.fx === 'lisa-read' && f.attack.mode === LISA_READ.flick) {
      return at('special', f.attack.index - 2, f.attack.t < LISA_FLICK_HIT ? 1 : 2);
    }
    // 特制曲奇·隐藏风味: the cookie held up; the toss; hands at her mouth after — and the cup through the tea.
    if (f.attack.skill.fx === 'lisa-cookie') {
      const a = f.attack, s = a.skill;
      if (a.mode === LISA_COOKIE.tea) return at('special', a.index - 2, 2);
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < s.start + LISA_TOSS ? 1 : 2);
    }
    // 这张必火: the run with a hand out; the arm round them, phone up; looking at the phone.
    if (f.attack.skill.fx === 'toko-selfie') {
      const a = f.attack, mode = a.mode ?? TOKO_SELFIE.lunge;
      return at('special', a.index - 2, mode === TOKO_SELFIE.lunge ? 0 : mode === TOKO_SELFIE.held ? 1 : 2);
    }
    // 师父示范一下: the air-guitar stance; the big strum; looking back over her shoulder at 纱夜.
    if (f.attack.skill.fx === 'toko-mud') {
      const a = f.attack, s = a.skill;
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < s.start + TOKO_STRUM ? 1 : 2);
    }
    // 笑到你破防: the breath in; pointing and laughing; wiping a tear.
    if (f.attack.skill.fx === 'toko-laugh') {
      const a = f.attack, s = a.skill;
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < s.duration - .2 ? 1 : 2);
    }
    // 天上天下 本小姐独尊: hands on hips; one hand to the sky and one to the floor through every light; the hair flip.
    if (f.attack.skill.fx === 'toko-solo') {
      const a = f.attack;
      return at('special', a.index - 2, a.t < TOKO_SOLO_SKY - .2 ? 0 : a.t < TOKO_SOLO_TURN ? 1 : 2);
    }
    // 摇匀一杯摩卡: hands out on the lunge; the grip through the shaking; the brush-off after.
    if (f.attack.skill.fx === 'himari-shake') {
      const a = f.attack, mode = a.mode ?? HIMARI_SHAKE.lunge;
      return at('special', a.index - 2, mode === HIMARI_SHAKE.lunge ? 0 : mode === HIMARI_SHAKE.held ? 1 : 2);
    }
    // 一呼零应: fist at the chest through the three words; up in the air into the silence; then the slump.
    if (f.attack.skill.fx === 'himari-aao') {
      const a = f.attack, s = a.skill;
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < s.start + HIMARI_AAO_RAISE ? 1 : 2);
    }
    // 一呼百应: the breath; the fist up through every shout and every answer; turned round for the V.
    if (f.attack.skill.fx === 'himari-call') {
      const a = f.attack;
      return at('special', a.index - 2, a.t < HIMARI_CALL_A[0] - .05 ? 0 : a.t < HIMARI_CALL_TURN ? 1 : 2);
    }
    // 这明明是狗: drawing, the page turned out, the sketchbook hugged.
    // 铁壁微笑: hand to the mouth, the smile with hands folded, the little bow.
    // 垃圾分拣: the hair flick, the look down the nose, back to the smile.
    if (f.attack.skill.fx === 'chisato-jennifer' || f.attack.skill.fx === 'chisato-smile' || f.attack.skill.fx === 'chisato-glare') {
      const a = f.attack, s = a.skill;
      return at('special', a.index - 2, a.t < s.start ? 0 : a.t < s.duration - .16 ? 1 : 2);
    }
    // 有必要说教一下呢: the beckon; hands on hips through the pull and every bubble (and the lecture to thin air);
    // the raised finger for the 花丸.
    if (f.attack.skill.fx === 'chisato-lecture') {
      const a = f.attack, mode = a.mode ?? CHISATO_LECTURE.beckon;
      if (mode === CHISATO_LECTURE.beckon) return at('special', a.index - 2, 0);
      if (mode === CHISATO_LECTURE.whiff) return at('special', a.index - 2, a.t < a.skill.duration - .35 ? 1 : 2);
      return at('special', a.index - 2, mode === CHISATO_LECTURE.done ? 2 : 1);
    }
    // 死亡银河号: the kick start; the run and the skid lean over the tank; off the bike.
    if (f.attack.skill.fx === 'galaxy-ride') {
      const a = f.attack, mode = a.mode ?? RIDE.mount;
      return at('special', a.index - 2, mode === RIDE.mount ? 0 : mode === RIDE.done ? 2 : 1);
    }
    // 可爱鉴定: the reach; hands on their cheeks, the pinch cell on every squeeze; the pat on the head.
    if (f.attack.skill.fx === 'cute-check') {
      const a = f.attack, mode = a.mode ?? CUTE.lunge;
      if (mode === CUTE.lunge) return at('special', a.index - 2, 0);
      if (mode === CUTE.held) return at('special', a.index - 2, a.liftAt > 0 && a.t < a.liftAt + CUTE_PINCH ? 1 : 0);
      return at('special', a.index - 2, 2);
    }
    // 即兴加花: guard and jab trade off the fill's own (off-grid) clock; the crash closes it.
    if (f.attack.skill.fx === 'fill-in') {
      const a = f.attack;
      return at('special', a.index - 2, fillRow(a.mode, a.t, a.liftAt));
    }
    // 银河流星踢: on the bike through the rev, the charge and the carry; the kick through the leap; the landing.
    if (f.attack.skill.fx === 'meteor-kick') {
      const a = f.attack, mode = a.mode ?? METEOR.rev;
      return at('special', a.index - 2, mode === METEOR.done ? 2 : mode === METEOR.leap ? 1 : 0);
    }
    // 我背你！: the dash, then the run with them on her back trades the two carry cells.
    if (f.attack.skill.fx === 'piggyback') {
      const a = f.attack, mode = a.mode ?? PIGGY.dash;
      if (mode === PIGGY.carry) return at('special', a.index - 2, 1 + (Math.floor(a.t * 10) % 2));
      return at('special', a.index - 2, mode === PIGGY.dash ? 0 : 1);
    }
    // 快乐飞行模式: jets lit on the crouch; arms full in the air (the carry or the hop); the landing.
    if (f.attack.skill.fx === 'happy-flight') {
      const a = f.attack, mode = a.mode ?? FLIGHT.lift;
      if (mode === FLIGHT.lift) return at('special', a.index - 2, 0);
      return at('special', a.index - 2, mode === FLIGHT.done ? 2 : 1);
    }
    // 明明我才是米歇尔！: the bagged lunge; the grip, and the pull-up cell for a beat on every yank; dazed after.
    if (f.attack.skill.fx === 'withdrawal') {
      const a = f.attack, mode = a.mode ?? WITHDRAW.lunge;
      if (mode === WITHDRAW.lunge) return at('special', a.index - 2, 0);
      if (mode === WITHDRAW.held) return at('special', a.index - 2, a.liftAt > 0 && a.t < a.liftAt + WITHDRAW_PULL ? 2 : 1);
      return at('special', a.index - 2, 2);
    }
    // 爱之拥抱: arms out on the lunge; the hug, tightened for a beat on every squeeze.
    if (f.attack.skill.fx === 'bear-hug') {
      const a = f.attack, mode = a.mode ?? HUG.lunge;
      if (mode === HUG.lunge) return at('special', a.index - 2, 0);
      if (mode === HUG.held) return at('special', a.index - 2, a.liftAt > 0 && a.t < a.liftAt + HUG_SQUEEZE ? 2 : 1);
      return at('special', a.index - 2, 2);
    }
    // 我开动了！: palms together, the bowl at her mouth, then the full cheeks.
    if (f.attack.skill.fx === 'itadakimasu') {
      const t = f.attack.t, s = f.attack.skill;
      return at('special', f.attack.index - 2, t < MEAL_GRACE ? 0 : t < s.start ? 1 : 2);
    }
    // 上吧，My Family！: the reach and the shout hold while the family comes in; her strum, then the settle.
    if (f.attack.skill.fx === 'my-family') {
      const a = f.attack, mode = a.mode ?? FAMILY.lunge;
      if (mode === FAMILY.done) return at('special', a.index - 2, a.t < a.liftAt + FAMILY_STRUM ? 1 : 2);
      return at('special', a.index - 2, mode === FAMILY.whiff ? 2 : 0);
    }
    // 天台是我的: the crouch and leap hold the first cell; the dive and the stomp are the second;
    // the landing crouch is the third.
    if (f.attack.skill.fx === 'rooftop') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < ROOFTOP_DIVE ? 0 : t < s.start + ROOFTOP_STOMP ? 1 : 2;
      return at('special', f.attack.index - 2, row);
    }
    // 忘却之影: the flourish, the landing crouch held a moment after the blink, then upright.
    if (f.attack.skill.fx === 'oblivion') {
      const a = f.attack, s = a.skill;
      const row = a.t < s.start ? 0 : a.t < s.start + OBLIVION.land ? 1 : 2;
      return at('special', a.index - 2, row);
    }
    // 神威: skirt lifted, the stomp held through the quake, then the curtsey.
    if (f.attack.skill.fx === 'divine') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .28 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    // 双月轮舞: the start, the glide both ways (the turn mirrors it), the brake.
    if (f.attack.skill.fx === 'twin-moon') {
      const a = f.attack;
      const row = a.t < a.skill.start ? 0 : (a.mode ?? TWIN_PHASE.out) === TWIN_PHASE.brake ? 2 : 1;
      return at('special', a.index - 2, row);
    }
    if (f.attack.skill.fx === 'blood-note') {
      const s = f.attack.skill;
      return at('special', f.attack.index - 2, bloodRow(f.attack.t, s.start, s.interval ?? .13, s.duration));
    }
    // LOCK: 限制器解除 — hand to the glasses, the throw (the flash), the stage pose in costume.
    if (f.attack.skill.fx === 'lock-unseal') {
      const a = f.attack, s = a.skill;
      return at('special', 0, a.t < s.start ? 0 : a.t < s.start + LOCK_UNSEAL_FLASH ? 1 : 2);
    }
    // 戴回眼镜: the standing cell either side of the flash; the king sheet swaps it for the costume until then.
    if (f.attack.skill.fx === 'lock-reseal') return loco('idle');
    // 给我安静听着: the breath, the shout, both hands over the mouth.
    if (f.attack.skill.fx === 'lock-hush') {
      const a = f.attack, s = a.skill;
      return at('special', 1, a.t < s.start ? 0 : a.t < s.duration - .2 ? 1 : 2);
    }
    // In costume the shout rides the K cells (the king sheet): the wind-up, the head thrown forward, back up.
    if (f.attack.skill.fx === 'lock-roar') {
      const a = f.attack, s = a.skill;
      return at('common', NORMAL.heavy.c + (a.t < s.start ? 0 : a.t < s.duration - .15 ? 1 : 2), NORMAL.heavy.r);
    }
    // 护六出动: the hop back is the dodge cell; then she just watches him go.
    if (f.attack.skill.fx === 'lock-rescue') return loco(f.attack.t < LOCK_HOP ? 'dodge' : 'idle');
    if (f.attack.skill.fx === 'lock-live') return lockLiveCell(f.attack.t);
    // 筑紫四列都要把命中姿势留住：土笔蹲着、闹钟抛完、滚轮一直跑、姐姐叉腰。
    if (f.attack.skill.fx === 'sprout' || f.attack.skill.fx === 'clock' || f.attack.skill.fx === 'wheel' || f.attack.skill.fx === 'sisters'
      || f.attack.skill.fx === 'sandwich' || f.attack.skill.fx === 'excuse' || f.attack.skill.fx === 'skip'
      || f.attack.skill.fx.startsWith('mizuho-')) {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .22 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    const phase = PHASE_COL[attackPhase(f.attack).phase];
    if (f.attack.skill.air) {
      const base = f.attack.skill.type === 'heavy' ? NORMAL.airHeavy : NORMAL.airLight;
      return at('common', base.c + phase, base.r);
    }
    if (f.attack.index <= 1) {
      const base = f.attack.index === 0 ? NORMAL.light : NORMAL.heavy;
      return at('common', base.c + phase, base.r);
    }
    // 巨羊羹砸击: the cell shifts the body aside to fit the block, so hand back the inverse.
    if (f.attack.skill.fx === 'yokan') return { ...at('special', f.attack.index - 2, phase), ox: YOKAN_OX[phase] };
    // 峰月律: the same shift, one table per food column.
    if (f.attack.skill.fx === 'rib') return { ...at('special', f.attack.index - 2, phase), ox: RIB_OX[phase] };
    if (f.attack.skill.fx === 'skewer') return { ...at('special', f.attack.index - 2, phase), ox: SKEWER_OX[phase] };
    if (f.attack.skill.fx === 'steak') return { ...at('special', f.attack.index - 2, phase), ox: STEAK_OX[phase] };
    // 垃圾桶: the last cell holds 0.6s. The column was drawn at 0.8, played back at 1.25 about the feet.
    if (f.attack.skill.fx === 'trash') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t < s.duration - .6 ? 1 : 2;
      return { ...at('special', f.attack.index - 2, row), scale: 1.25 };
    }
    return at('special', f.attack.index - 2, phase);
  }
  const state = stateFor(f);
  // 狂化 stance while she is otherwise just standing around. The king/box sheet uses the common idle cell.
  const crowned = f.data.view.kind === 'sprite' && (!!f.data.view.king || !!f.data.view.box);
  if (f.frenzy > 0 && !crowned && state === 'idle') return at('frenzy', 0, 2);
  // 4 frames at 8 Hz: one stride is 0.5s.
  if (state === 'run') return loco(RUN_FRAMES[Math.floor(f.animTime * 8) % 4]);
  if (state === 'ko' || state === 'down' || state === 'hurt' || state === 'dodge' || state === 'block' || state === 'jump') return loco(state);
  return loco('idle');
}
