import { PUBLIC_ROSTER, ROSTER_BY_ID } from '../data/characters.ts';
import type { CharacterData, Skill } from '../data/types.ts';
import { clamp, FLOOR, GRAVITY, X_MAX, X_MIN } from '../game/constants.ts';
import { isInvulnerable, makeFighter, skillsOf, type Fighter } from '../game/fighter.ts';
import type { FightGame } from '../game/game.ts';
import { hit } from '../game/combat.ts';
import { DROP_ARM, DROP_REACH, heatColor, liftH, RARE_COLOR, SHIFT_TIME } from './constants.ts';
import { WORLD_W, VIEW_W } from './placeholders.ts';
import { chorusAt, HALF_DUR, intensity, songPlan, TAGS, type MobKind, type MusouSong, type PropKind, type SongPlan, type SongTag, type SupplyKind, type ThreatKind } from './songs.ts';
import { applyUpgrade, createBuild, lvOf, recommendUpgrade, rollUpgradeChoices, type MusouBuild, type UpgradeCard } from './upgrades.ts';
import { Arsenal, instrumentWeapon, type ArmsHost, type WeaponId } from './weapons.ts';

export interface MusouOptions {
  /** 全部可用曲目；没给（自检）就用一首默认歌。 */
  songs?: MusouSong[];
  /** 上半场的曲目（songs 下标），-1 随机。 */
  first?: number;
  /** 预先抽好的 Boss（开打前就把精灵表下好）。上半场、下半场依次用，安可轮流。 */
  bosses?: string[];
  /** 「乐队乱入」用的队友。 */
  guest?: string;
}

/** 镜头左缘在长街上能走到的最远处。两头是真墙。 */
const STREET_MAX = WORLD_W - VIEW_W;
const FOLLOW_L = 400;
const FOLLOW_R = 560;
const CATCH_UP = 1500;
const MAX_ALIVE_DESKTOP = 150;
const MAX_ALIVE_TOUCH = 100;

export interface MobDebris { kind: MobKind; x: number; y: number; vx: number; vy: number; spin: number; vspin: number; life: number; bounced: boolean; depth: number; facing: 1 | -1; big?: boolean; bomb?: number }
/** 地上的补给：落地后上下轻浮，走过去就捡起来；最后 3 秒闪烁。 */
export interface Supply { kind: SupplyKind; x: number; y: number; vy: number; t: number; life: number }
export type ChestPrize = 'card' | 'rare' | SupplyKind;
/** 精英掉的宝箱：碰到就开，光柱升起、轮盘转 1.6 秒停在奖品上。 */
export interface Chest { x: number; state: 0 | 1 | 2; t: number; reel: ChestPrize[]; land: number; face?: number }
/** 机关预警：地面先亮一圈，到点砸下（灯架）。 */
export interface Warn { x: number; t: number; max: number; r: number; dmg: number }
/** 全屏的一次性冲击（大招清场、爆音音箱、扩音器、FEVER 起跳、精英砸地）。 */
/** 围堵圈：圈心 cx、半径 R；form 两侧人墙就位，close 往里收。 */
export interface Ring { cx: number; R: number; t: number; phase: 'form' | 'close'; left: Fighter[]; right: Fighter[]; tick: number }
/** 横幅冲锋：warn 时一排人举着横幅停在街的一头（地上亮出冲锋道），run 时横扫整条街。 */
export interface Charge { dir: 1 | -1; x: number; t: number; phase: 'warn' | 'run'; hit: boolean; broken: number; seed: number }
/** 稀有道具：三角铁弹幕（360° 三角子弹）、烟花筒（往前抛烟花）、镲片回旋（两片镲绕身）、节拍器（每一下都算完美）。 */
export type RareKind = 'tri' | 'fire' | 'cymbal' | 'metro';
export const RARE_NAME: Record<RareKind, string> = { tri: '三角铁弹幕', fire: '烟花筒', cymbal: '镲片回旋', metro: '节拍器' };
/** 强化卡掉在舞台上的道具：从上面落下，落地 DROP_ARM 秒后才能重砸拾取。land < 0 = 还在空中。 */
export interface CardDrop { card: UpgradeCard; x: number; y: number; vy: number; land: number }
/** 拾取 / 自动拿 / 碎掉的一瞬（只给画面用）。 */
export interface DropFx { card: UpgradeCard; x: number; y: number; t: number; k: 'take' | 'auto' | 'shatter' }
/** 升一级要的经验上限（3 级后按 ×1.45+10 递增，到这里封顶）。 */
const XP_CAP = 200;
const DROP_GAP = 160;
export interface RarePick { kind: RareKind; x: number; y: number; vy: number; t: number; life: number }
export interface RareShot { k: 'tri' | 'fire'; x: number; y: number; vx: number; vy: number; life: number; dmg: number; hit: Set<number>; spin: number }
/** 巨型障碍物（啸叫扩音塔）：warn 时阴影加深然后砸落；stand 时每 2 拍放狂暴波，8 拍倒计时内打爆可反向清屏，超时全屏过载震爆。 */
export interface Giant { kind: 'tower' | 'board' | 'balloon'; x: number; t: number; phase: 'warn' | 'stand' | 'gone' | 'broken' | 'blown'; hp: number; max: number; life: number; lifeMax: number; flash: number; pulseCd: number }
/** 高空激光灯网：封锁离地半空（地面完全安全），预警 3 拍后亮起 2 拍；打爆两侧灯箱可过载反杀下方人群。 */
export interface LaserNode { x: number; y: number; hp: number; max: number; flash: number; dead: boolean }
export interface LaserNet { ys: number[]; nodes: LaserNode[]; phase: 'warn' | 'fire' | 'clear'; t: number; warnDur: number; fireDur: number; hitCd: number; tick: number }
/** 移动聚光灯死线：全场压暗只留一束移动追光，圈内伤害 +30%，离开超过 1.2 秒遭暗影围攻并掉热度。 */
export interface SpotlightSolo { x: number; vx: number; r: number; t: number; dur: number; outT: number; drainCd: number; inZone: boolean }
/** 空中高压电球：慢飘在高空，无脑跳撞会触电；用冲锋/攻击/弹幕打爆会坠地炸清一片小怪。 */
export interface SkyOrb { x: number; y: number; vx: number; vy: number; r: number; hp: number; t: number; life: number; phase: 'float' | 'fall' }
/** 共鸣弹球：攻击/冲锋/下砸可抽飞并在屏幕壁间来回反弹撞怪，越抽越快越大。 */
export interface StageBall { x: number; y: number; vx: number; vy: number; r: number; spin: number; level: number; life: number; hitCd: number; hit: Set<number>; flash: number; trail: { x: number; y: number }[] }
/** 半空鼓点串：沿空弧排开的发光跳板，踩中自动托举弹起、刷新二段跳与冲锋。 */
export interface SkyPad { x: number; y: number; r: number; hit: boolean; hitT: number }
export interface SkyPadChain { pads: SkyPad[]; next: number; t: number; life: number; done: boolean; doneT: number }
/** 天地异象（太阳变大等阶段性全屏氛围事件，后续可扩展更多种类）。 */
export type AnomalyKind = 'sun';
export interface Anomaly { kind: AnomalyKind; phase: 'in' | 'hold' | 'out'; t: number; dur: number; k: number }
/** 动态黑胶评分：按换招多样性评分（0..100），防复读。 */
export type GrooveMove = 'jab' | 'heavy' | 'skill' | 'dash' | 'slam' | 'toy';
export interface GrooveTrack { kind: GrooveMove; t: number; fresh: boolean }
/** 升降舞台：从地里升起的发光圆台，站上去小怪进不来，几秒后闪、下沉。 */
export interface Lift { x: number; r: number; t: number; phase: 'rise' | 'up' | 'sink'; up: number }
/** 下砸：rise 起手往上顶一下 → hang 停一瞬 → dive 高速往下扎；heavy = 起手时够高（重砸）。 */
export interface Slam { phase: 'rise' | 'hang' | 'dive'; t: number; heavy: boolean; y0: number }
/** 冲锋：往前冲一段，沿途撞飞。 */
export interface Dash { t: number; dir: 1 | -1; hit: Set<number>; x0: number }
/** 给 HUD 播的声音（导演不碰音频）：n 是档位 / 连击数，at 是延后几秒（对齐到拍点）。 */
export type MuSound = 'hit' | 'kill' | 'perfect' | 'heatUp' | 'heatDown' | 'cardIn' | 'cardPick' | 'riser' | 'fever' | 'ultCast' | 'ultDrop'
  | 'tick' | 'ding' | 'supply' | 'boom' | 'warn' | 'rush' | 'break' | 'squeeze' | 'hurt' | 'slam'
  | 'milestone' | 'grab' | 'escape' | 'dash' | 'slow' | 'pop' | 'crowd'
  | 'slam' | 'slamHeavy' | 'jump2' | 'charge' | 'bowl' | 'pip' | 'pipBreak' | 'armor' | 'shieldUp'
  | 'giantLand' | 'giantBreak' | 'liftUp' | 'liftDown' | 'rare' | 'rareEnd'
  | 'laser' | 'feedback' | 'zap' | 'anomaly' | 'ball' | 'pad' | 'grooveUp' | 'scratch';
/** 给渲染层的镜头事件：shot = 推 / 拉到某处一会儿（lb 上下黑边 + 名牌）；kick = 往打击方向顶一下。导演不碰画面，只排事件。 */
export type CamEvent = { k: 'shot'; x: number; y: number; zoom: number; dur: number; lb?: boolean; name?: string; sub?: string } | { k: 'kick'; dx: number; dy: number };
export interface MuCue { k: MuSound; n: number; at: number }
export interface Pulse { k: 'ult' | 'boom' | 'mega' | 'fever' | 'slam' | 'open' | 'perfect' | 'break' | 'impact' | 'shield' | 'feedback' | 'zap'; x: number; y: number; t: number; max: number; color: string; dir?: number; n?: number; seed?: number; big?: boolean; perfect?: boolean }
export interface Gem { x: number; y: number; vx: number; vy: number; v: number; t: number }
export interface MobShot { x: number; y: number; vx: number; vy: number; life: number; owner: Fighter; spin: number }
export interface Prop { kind: PropKind; x: number; hp: number; t: number; state: number; cd: number }
export interface Mine { x: number; t: number; dmg: number }
export interface DmgNum { x: number; y: number; vy: number; v: number; t: number; max: number; kind: 'boss' | 'crit' | 'break' }

interface MobSpec { hp: number; speed: number; dmg: number; range: number; xp: number }
const SPECS: Record<MobKind, MobSpec> = {
  fan: { hp: 34, speed: 135, dmg: 5, range: 64, xp: 1 },
  glow: { hp: 26, speed: 120, dmg: 6, range: 60, xp: 1 },
  amp: { hp: 70, speed: 92, dmg: 9, range: 70, xp: 2 },
  guard: { hp: 110, speed: 88, dmg: 9, range: 74, xp: 3 },
  scalper: { hp: 40, speed: 190, dmg: 0, range: 50, xp: 2 },
};
/** 死亡时掉补给的基础概率（再乘曲风的 dropRate）。 */
const DROP: Record<MobKind, number> = { fan: .002, glow: .003, amp: .01, guard: .015, scalper: .05 };
/** 补给名（玩家可见）。 */
export const SUPPLY_NAME: Record<SupplyKind, string> = { candy: '润喉糖', drink: '应援饮料', mega: '扩音器', boom: '爆音音箱', spot: '舞台追光' };
/** 大招槽：击破一只、精英、连击每满 30 各充多少（百分比，FEVER 里翻倍）。 */
const ULT_KILL = .05, ULT_ELITE = 15, ULT_STREAK = 2;
const SPOT_TIME = 6;
/** 精英的名牌（登场镜头上显示）。 */
const ELITE_NAME: Record<MobKind, string> = { fan: '头号粉丝', glow: '荧光棒团长', amp: '巨型音箱', guard: '安保队长', scalper: '黄牛头子' };
/** 被抓住时连按几下挣脱、多久没挣脱就被摔出去。 */
const GRAB_MASH = 6, GRAB_TIME = 1.6;
/** 下砸：离地高于这条线起手是重砸；最多连弹几次；弹起速度。 */
const SLAM_HEAVY = 150, SLAM_CHAIN = 4, SLAM_BOUNCE = 720;
/** 冲锋：几格、每格回复秒数、冲多快冲多久。 */
const DASH_CHARGES = 2, DASH_REGEN = 2.4, DASH_SPEED = 1150, DASH_TIME = .22;
const RARE_TIME = 10;
/** 踩拍判定窗口（秒，相对拍点，已扣掉出声延迟）：早一点、晚一点都算，晚的那边宽一点（人总是按得稍晚）。 */
const PERFECT_EARLY = .065, PERFECT_LATE = .085;
/** 热度：每档要几次完美，最高几档；每档伤害、击飞、充能的加成。 */
const HEAT_STEP = 4, HEAT_MAX = 5, HEAT_DMG = .08;
/** 天地异象「烈日」：渐变入场 / 悬顶 / 退场时长（秒），以及轻量增伤。 */
const ANOMALY_IN = 2.4, ANOMALY_HOLD = 14, ANOMALY_OUT = 2.4, ANOMALY_SUN_DMG = .12;
/** 动态黑胶评分档位门槛（0..5：COLD / WARM / GROOVE / HOT / BLAZING / ENCORE）。 */
const GROOVE_RANKS = [0, 15, 35, 55, 75, 92] as const;
const CHEST_SPIN = 1.6;
const MOB_COLORS: Record<MobKind, string> = { fan: '#38bdf8', glow: '#c084fc', amp: '#a78bfa', guard: '#76e7ff', scalper: '#e9c46a' };

const jab = (dmg: number, range: number): Skill => ({
  key: 'J', name: '扑击', type: 'light', damage: dmg, range, start: .2, duration: .5, cd: .6,
  super: false, fx: 'hit', brief: '', detail: '', knock: 70, gain: 0,
});
const SHOT_SKILL: Skill = { ...jab(9, 0), name: '荧光棒', type: 'projectile', knock: 60 };

function mobData(kind: MobKind, hp: number, dmg: number): CharacterData {
  const s = SPECS[kind], j = jab(dmg, s.range);
  return {
    id: `mob:${kind}`, name: kind, title: '', quote: '', color: MOB_COLORS[kind],
    hp, speed: s.speed, power: 1, trait: 'rush', passive: ['', ''],
    skills: [j, j, j, j, j, j], view: { kind: 'geometry', build: 'slim' },
  };
}

/** 升降舞台此刻台面离地多高（升起 / 下沉的过渡）。 */
const DEFAULT_SONG: MusouSong = { track: -1, title: '音浪', tag: 'hot', bpm: 160, dur: HALF_DUR };

/**
 * 音浪无双导演。
 * - 世界平移卷轴：模拟始终在 960 局部坐标里跑，主角走出中间段时整个世界反向平移、scrollX 累加，
 *   原版 75 人脚本里的 X_MIN/X_MAX 一处不改。
 * - 一局 = 上半场 + 下半场两首歌，之后安可无尽。每首最后一段副歌出梦魇 Boss，打倒才切歌。
 * - 杂兵仍是 Fighter（原版技能脚本都打得到），AI、受击、绘制走轻量分支，死了立刻移出 fighters。
 */
export class MusouDirector implements ArmsHost {
  readonly build: MusouBuild;
  readonly arms = new Arsenal();

  elapsed = 0;
  kills = 0;
  bossesDefeated = 0;
  level = 1;
  xp = 0;
  nextXp = 8;
  streak = 0;
  streakTime = 0;
  bestStreak = 0;
  scrollX = 0;

  private choices: UpgradeCard[] | null = null;
  private queuedOffers = 0;
  /** 队头那一组三选一，变成地上的三个道具（重砸拾取，倒数走完自动拿推荐）。 */
  drops: CardDrop[] = [];
  dropFx: DropFx[] = [];
  /** 推荐第几个、倒数走了多久 / 总长（全部落地后才开始倒数）。 */
  dropRec = 0;
  dropT = 0;
  dropMax = 4;
  private dropsFor: UpgradeCard[] | null = null;
  private dropWait = 0;
  /** 刚选下的卡（HUD 播一下「盖章」）。 */
  lastPicked: UpgradeCard | null = null;
  rerolls = 3;
  /** 一线生机（窗口防秒杀闸门）：HP >= 25% 时蓄满 0.65s 保护窗口，连段打空时锁血到 1 点并给无敌脱身，不回血不复活。 */
  gateArmed = true;
  gateWindowT = 0;
  gateFlash = 0;
  dmgNums: DmgNum[] = [];
  private dmgAt: Record<DmgNum['kind'], number> = { boss: -9, crit: -9, break: -9 };
  debris: MobDebris[] = [];
  gems: Gem[] = [];
  shots: MobShot[] = [];
  props: Prop[] = [];
  mines: Mine[] = [];
  musicTrack: number | null = null;
  /** 打倒的梦魇（结算海报用）。 */
  defeated: string[] = [];

  readonly songs: MusouSong[];
  played: MusouSong[] = [];
  song: MusouSong;
  /** 第几首（0 上半场、1 下半场、2+ 安可）。 */
  half = 0;
  songT = 0;
  phase: 'play' | 'hold' | 'shift' = 'play';
  shiftT = 0;
  mood: SongTag;
  prevMood: SongTag;
  boss: Fighter | null = null;
  /** 这首歌的节奏表（副歌段、精英、机关、Boss 的时刻）。 */
  plan: SongPlan;
  /** 正在第几段副歌（-1 不在 FEVER）；feverK 是给画面用的 0..1 渐变量。 */
  fever = -1;
  feverK = 0;
  /** 地上的补给、宝箱、机关预警、全屏冲击。 */
  supplies: Supply[] = [];
  chests: Chest[] = [];
  warns: Warn[] = [];
  pulses: Pulse[] = [];
  /** 舞台追光剩余秒数（无敌 + 伤害提升）。 */
  spotT = 0;
  /** 受伤反馈 0..1：屏幕边缘泛红。 */
  hurtK = 0;
  /** 主角正在放 L：杂兵定住，放完全屏清场。 */
  ultOn = false;
  /** 拍点时钟：音乐在放就跟音乐（HUD 每帧写 audioT，期间按 dt 往前推），否则跟歌曲进度。audioLat 是出声延迟。 */
  audioT: number | null = null;
  audioLat = .03;
  /** 热度 0..5、当前档的完美次数、连续完美数、最近一次完美的时刻（HUD 闪一下）。 */
  heat = 0;
  heatFill = 0;
  pstreak = 0;
  perfectAt = -9;
  /** 群体威胁。 */
  ring: Ring | null = null;
  charges: Charge[] = [];
  sounds: MuCue[] = [];
  cams: CamEvent[] = [];
  /** 慢动作剩余（模拟秒）；game.advance 读 timeScale。 */
  slowT = 0;
  get timeScale(): number { return this.slowT > 0 ? .3 : 1; }
  /** 被精英抓住：连按挣脱（mash 是已经按了几下）。 */
  grabbed: { by: Fighter; t: number; mash: number } | null = null;
  /** 击破里程碑（每 100）：HUD 盖一个章。 */
  milestone = 0;
  milestoneAt = -9;
  /** 机动：二段跳用掉没、下砸状态、连砸第几下、冲锋格数与回复、正在冲锋。 */
  airJumped = false;
  slam: Slam | null = null;
  slamChain = 0;
  dashCharges = DASH_CHARGES;
  dashRegen = 0;
  dash: Dash | null = null;
  /** 满热度的沸腾状态（加速 + 残影）。 */
  boil = false;
  /** 稀有道具与它的投射物、正在生效的形态。 */
  rares: RarePick[] = [];
  rshots: RareShot[] = [];
  power: { kind: RareKind; t: number } | null = null;
  /** 大事件与 P4 空中反制。 */
  giants: Giant[] = [];
  lifts: Lift[] = [];
  lasers: LaserNet[] = [];
  solo: SpotlightSolo | null = null;
  orbs: SkyOrb[] = [];
  balls: StageBall[] = [];
  padChains: SkyPadChain[] = [];
  anomaly: Anomaly | null = null;
  frenzyT = 0;
  private soloDmgApplied = false;
  private anomalyDmgApplied = 0;
  private anomalyCd = 8;
  private anomalyDoneSong = false;
  private anomalySeenCount = 0;
  private anomalyPity = 0;
  private toyCd = 9;
  private toyFlip = 0;
  /** 动态黑胶评分：0..100，按换招多样性评分，防复读。 */
  groove = 0;
  grooveRank = 0;
  grooveRepeat = 0;
  groovePop = 0;
  grooveScratch = 0;
  grooveNeedle = 0;
  grooveTracks: GrooveTrack[] = [];
  private grooveHist: GrooveMove[] = [];
  private grooveCastSerial = -1;
  get grooveK(): number { return this.groove / 100; }
  private airTime = 0;
  private orbCd = 9;
  private seenP4 = new Set<string>();
  private echoes: { t: number; x: number; dir: number; r: number; dmg: number; n: number }[] = [];
  private powerCd = 0;
  private boilApplied = 0;
  private ghostCd = 0;
  private majorDone = -1;
  private lastMajor = '';
  private minorTurn = 0;
  private squadNext = false;
  private frameHits = 0;
  private frameDir = 1;
  private ampWarned = false;
  private threatCd = 6;
  private seenThreat = new Set<ThreatKind>();
  private heatApplied = 0;
  private heatGrace = 0;
  private perfectSerial = -1;
  private perfectOn = false;
  private soundGap = new Map<MuSound, number>();
  private hurtGap = 0;
  private noChargeUntil = 0;
  private lastHp = 0;
  private lastEnergy = 0;
  private allowedEnergy = 0;
  private swingRate = 1;
  private throwCd = 0;
  private streakMark = 0;
  private bossSpawned = false;
  private bossPool: string[];
  private guest: string | undefined;
  private bandAt = -1;
  private leaving: { f: Fighter; t: number }[] = [];

  private trickleCd = .4;
  private surgeCd = 4;
  private surge: { side: -1 | 0 | 1; left: number; gap: number; cd: number; flip: 1 | -1 } | null = null;
  private swingCd = 0;
  private crowdSeen = new WeakSet<Set<number>>();
  private silent = new WeakSet<Set<number>>();
  private readonly maxAlive: number;
  private lead: Fighter;
  private normalSerial = -1;
  private judgedSerial = -1;
  private giantSerial = -1;
  private normals = 0;
  private ultSerial = -1;
  private burstAt = new WeakMap<Fighter, number>();
  private chantCd = 0;
  private zoneOn = false;
  private skillCache = new Map<string, Skill>();

  constructor(g: FightGame, opts: MusouOptions) {
    const touch = typeof document !== 'undefined' && document.body.classList.contains('touch');
    this.maxAlive = touch ? MAX_ALIVE_TOUCH : MAX_ALIVE_DESKTOP;
    this.scrollX = Math.round(STREET_MAX * .35);
    this.lead = g.fighters[0];
    const lead = this.lead;
    this.build = createBuild(instrumentWeapon(lead.data.title, lead.data.id));
    this.syncArms();
    lead.x = (FOLLOW_L + FOLLOW_R) / 2;
    // 大招槽就是主游的气槽：满格 = 一次 L。只吃击破、连击（FEVER 翻倍）的充能，格斗里的命中回气不算。
    lead.energyMax = Math.max(100, skillsOf(lead)[5]?.cost ?? 100);
    lead.energy = lead.energyMax * .3;
    this.lastEnergy = lead.energy;
    this.lastHp = lead.hp;
    // 格斗的连段衰减是给 1v1 用的；这里一招打一片，连击数越滚越大是乐趣本身。
    lead.comboDecay = 0;

    this.songs = opts.songs?.length ? opts.songs : [DEFAULT_SONG];
    const first = opts.first != null && opts.first >= 0 && opts.first < this.songs.length ? opts.first : Math.floor(g.random() * this.songs.length);
    this.song = this.songs[first];
    this.mood = this.prevMood = this.song.tag;
    this.plan = songPlan(this.song);
    const pool = PUBLIC_ROSTER.filter(c => c.id !== lead.data.id).map(c => c.id);
    this.bossPool = opts.bosses?.length ? [...opts.bosses] : [pool[Math.floor(g.random() * pool.length)]];
    this.guest = opts.guest;
    this.startSong(g, this.song, true);
  }

  get wave(): number { return this.half + 1; }
  get shardsEarned(): number { return Math.max(10, Math.round(this.kills * .15 + this.bossesDefeated * 40 + this.elapsed / 8)); }
  /** 歌曲进度 0..1（hold 时停在 1）。 */
  get songP(): number { return Math.min(1, this.songT / this.song.dur); }
  get halfLabel(): string { return this.half === 0 ? '上半场' : this.half === 1 ? '下半场' : `安可 ${this.half - 1}`; }
  activeBoss(_g?: FightGame): Fighter | undefined { return this.boss && this.boss.hp > 0 ? this.boss : undefined; }
  get bpm(): number { return this.song.bpm; }
  get upgradeOffers(): number { return this.queuedOffers + (this.choices ? 1 : 0); }
  pendingChoices(): UpgradeCard[] | null { return this.choices; }
  /** 大招槽满了、可以按 L。 */
  ultReady(): boolean { const f = this.lead; return f.hp > 0 && f.energy >= (skillsOf(f)[5]?.cost ?? 100); }
  get feverBig(): boolean { return this.fever >= 0 && this.plan.chorus[this.fever].big; }

  /* ---- 拍点 ---- */

  /** 判定用的一拍有多长（快歌按两拍一判）。 */
  get beatLen(): number { return 60 / this.song.bpm * (this.song.half ? 2 : 1); }
  private beatTime(): number { return this.audioT ?? this.songT; }
  /** 离最近一拍差多少秒（负 = 早），扣掉出声延迟。 */
  beatErr(lat = this.audioLat): number {
    const L = this.beatLen;
    let d = (this.beatTime() - lat - (this.song.beat0 ?? 0)) % L;
    if (d < 0) d += L;
    return d > L / 2 ? d - L : d;
  }
  /** 本拍走了多少（0 刚过拍点 → 1 下一拍），画面跟着出声的时刻走。 */
  beatFrac(): number {
    const L = this.beatLen;
    let d = (this.beatTime() - this.audioLat - (this.song.beat0 ?? 0)) % L;
    if (d < 0) d += L;
    return d / L;
  }

  /** 排一个声音。quant：离下一个半拍够近就推到半拍上（和背景音乐咬合），否则立刻响。gap：同类最短间隔。 */
  cue(k: MuSound, n = 0, quant = false, gap = 0): void {
    if (gap && (this.soundGap.get(k) ?? -9) > this.elapsed - gap) return;
    this.soundGap.set(k, this.elapsed);
    let at = 0;
    if (quant) {
      const half = this.beatLen / 2;
      let d = (this.beatTime() - (this.song.beat0 ?? 0)) % half;
      if (d < 0) d += half;
      const wait = half - d;
      if (wait < .13) at = wait;
    }
    if (this.sounds.length < 40) this.sounds.push({ k, n, at });
  }

  /** 下砸、冲锋、被抓途中主角不出别的招。 */
  busy(): boolean { return !!this.slam || !!this.dash || !!this.grabbed || this.landLag > 0; }

  /** 空中按 K：下砸。离地够高是重砸，否则轻砸；起手先往上顶一下、停一瞬，再高速往下扎。 */
  startSlam(f: Fighter): boolean {
    if (this.slam || this.dash || this.grabbed || f.stun > 0 || f.knocked > 0 || f.hp <= 0) return false;
    const h = FLOOR - f.y;
    if (h < 14) return false;
    f.attack = null;
    this.slam = { phase: 'rise', t: 0, heavy: h >= SLAM_HEAVY || this.slamChain > 0, y0: f.y };
    f.vy = -260;
    f.vx = 0;
    return true;
  }

  /** 闪避键：往前冲锋。没格子了返回 false（退回原版闪避）。 */
  startDash(g: FightGame, f: Fighter): boolean {
    if (this.dash || this.slam || this.grabbed || this.dashCharges < 1) return false;
    this.dashCharges--;
    // 冲锋本身也判一下拍点：踩拍返还这一格。
    const e = this.beatErr();
    const onBeat = e >= -PERFECT_EARLY && e <= PERFECT_LATE;
    if (onBeat) { this.dashCharges = Math.min(DASH_CHARGES, this.dashCharges + 1); this.pulses.push({ k: 'perfect', x: f.x, y: FLOOR, t: 0, max: .45, color: heatColor(this.heat) }); }
    const dir = (f.facing || 1) as 1 | -1;
    this.dash = { t: 0, dir, hit: new Set(), x0: f.x };
    f.attack = null;
    f.blocking = false;
    f.dodgeCd = .12;
    f.invuln = Math.max(f.invuln, DASH_TIME + .12);
    this.cue('charge', onBeat ? 1 : 0);
    this.kick(dir * 8, 0);
    g.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
    return true;
  }

  /** 空中再按一次跳：二段跳（落地刷新；下砸弹起后也刷新）。 */
  airJump(g: FightGame, f: Fighter): boolean {
    if (this.airJumped || this.slam || this.dash || this.grabbed || f.stun > 0 || f.knocked > 0 || f.attack || f.vy < -450) return false;
    this.airJumped = true;
    f.vy = -600;
    this.cue('jump2');
    this.pulses.push({ k: 'shield', x: f.x, y: f.y - 10, t: 0, max: .35, color: f.data.color, n: 0 });
    g.effect('ghost', f.x, f.y, f.data.color, .22, { fighter: f.id, alpha: .35 });
    return true;
  }

  /** 镜头事件（渲染层读）。 */
  shot(x: number, y: number, zoom: number, dur: number, extra: { lb?: boolean; name?: string; sub?: string } = {}): void {
    if (this.cams.length < 12) this.cams.push({ k: 'shot', x, y, zoom, dur, ...extra });
  }
  kick(dx: number, dy = 0): void { if (this.cams.length < 12) this.cams.push({ k: 'kick', dx, dy }); }
  /** 慢动作收尾：模拟放慢到三成，持续 sim 秒（真实时间约三倍）。 */
  slow(t: number): void { if (this.slowT < t) { this.slowT = t; this.cue('slow', 0, false, .6); } }

  /** 给大招槽充能（百分比）。FEVER 里翻倍，强化卡「能量」的倍率照算。 */
  charge(pct: number): void {
    const f = this.lead;
    // 放 L 的过程中、以及清场后那一下打飞的杂兵不回槽：大招不能自己给自己充满。
    if (this.ultOn || this.elapsed < this.noChargeUntil) return;
    const add = pct / 100 * f.energyMax * (this.fever >= 0 ? 2 : 1) * (1 + this.heat * .1) * (1 + this.grooveRank * .05) * (1 + (f.energyMul - 1) * .5);
    f.energy = Math.min(f.energyMax, f.energy + add);
    this.allowedEnergy = Math.min(f.energyMax, this.allowedEnergy + add);
  }

  pickUpgrade(g: FightGame, cardId: string): boolean {
    const card = this.choices?.find(c => c.id === cardId);
    const lead = this.lead;
    if (!card || lead.hp <= 0) return false;
    this.lastPicked = applyUpgrade(g, lead, this.build, card.id);
    this.syncArms();
    this.cue('cardPick', card.cat === 'evo' ? 2 : card.lv > 1 ? 1 : 0);
    this.choices = null;
    if (this.queuedOffers > 0) {
      this.queuedOffers--;
      this.pushUpgradeOffer(g);
      if (!this.choices) this.queuedOffers = 0;
    }
    return true;
  }

  /* ---- 掉落道具（强化卡） ---- */

  private stepDrops(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const f of this.dropFx) { f.t += dt; if (f.t < .6) this.dropFx[w++] = f; }
    this.dropFx.length = w;
    const head = this.choices;
    if (head !== this.dropsFor) {
      if (!head) { this.drops = []; this.dropsFor = null; }
      else if (this.phase !== 'shift') {
        this.dropWait = Math.max(0, this.dropWait - dt);
        if (this.dropWait <= 0) this.spawnDrops(g, lead, head);
      }
      if (head !== this.dropsFor) return;
    }
    if (!this.drops.length) return;
    let landed = true;
    for (const d of this.drops) {
      if (d.land < 0) {
        d.vy += GRAVITY * .8 * dt;
        d.y += d.vy * dt;
        if (d.y >= FLOOR) { d.y = FLOOR; d.vy = 0; d.land = 0; g.effect('dust', d.x, FLOOR, '#afa1c1', .25, { radius: 22 }); }
        else landed = false;
      } else d.land += dt;
    }
    if (!landed || lead.hp <= 0 || this.grabbed) return;
    this.dropT += dt;
    if (this.dropT >= this.dropMax) this.takeDrop(g, this.dropRec, true);
  }

  /** 队头换了（新的一组、重随、按键选走）：在主角前方落三个道具。重随时沿用原来的位置。 */
  private spawnDrops(g: FightGame, lead: Fighter, head: UpgradeCard[]): void {
    const old = this.drops.length === head.length ? this.drops.map(d => d.x) : null;
    const c = clamp(lead.x + (lead.facing || 1) * 170, 330, 630);
    this.drops = head.map((card, i) => ({
      card,
      x: old ? old[i] : c + (i - (head.length - 1) / 2) * DROP_GAP,
      y: FLOOR - 250 - i * 24,
      vy: 0,
      land: -1,
    }));
    this.dropsFor = head;
    let crowd = 0;
    for (const f of g.fighters) if (f.mob && f.hp > 0 && Math.abs(f.x - lead.x) < 320) crowd++;
    this.dropRec = recommendUpgrade(this.build, head, { hpFrac: lead.hp / lead.data.hp, crowd, boss: !!this.activeBoss() });
    this.dropT = 0;
    // 自动拿推荐的倒数：8 拍，按这首歌的速度换成秒，快歌不至于太急、慢歌不至于太久。
    this.dropMax = clamp(8 * 60 / this.song.bpm, 3.5, 5.5);
  }

  /** 重砸落地：砸在哪个已落稳的道具上就拿哪个。 */
  private slamDrop(g: FightGame, lead: Fighter): void {
    if (this.dropsFor !== this.choices) return;
    let best = -1, bd = DROP_REACH;
    this.drops.forEach((d, i) => {
      const dx = Math.abs(d.x - lead.x);
      if (d.land >= DROP_ARM && dx <= bd) { bd = dx; best = i; }
    });
    if (best >= 0) this.takeDrop(g, best, false);
  }

  private takeDrop(g: FightGame, i: number, auto: boolean): void {
    const d = this.drops[i];
    if (!d || !this.pickUpgrade(g, d.card.id)) return;
    for (const o of this.drops) this.dropFx.push({ card: o.card, x: o.x, y: o.y, t: 0, k: o === d ? (auto ? 'auto' : 'take') : 'shatter' });
    g.sparks(d.x, FLOOR - 40, d.card.cat === 'evo' ? '#E9C46A' : '#FDE979', auto ? 12 : 22, auto ? .9 : 1.3);
    if (!auto) this.pulses.push({ k: 'open', x: d.x, y: FLOOR - 30, t: 0, max: .45, color: '#FDE979' });
    this.drops = [];
    this.dropsFor = null;
    this.dropWait = .35;
  }

  pushUpgradeOffer(g: FightGame): void {
    if (this.choices) { this.queuedOffers++; return; }
    const cards = rollUpgradeChoices(this.build, g.random, 3);
    if (cards.length) { this.choices = cards; this.cue('cardIn', cards.some(c => c.cat === 'evo') ? 1 : 0, false, .4); }
  }

  /** 重随当前队头三选一强化卡（按 R 或点按钮）。 */
  rerollUpgrade(g: FightGame): boolean {
    const head = this.choices;
    if (!head || this.rerolls <= 0 || this.lead.hp <= 0) return false;
    const exclude = new Set(head.map(c => c.id));
    const fresh = rollUpgradeChoices(this.build, g.random, 3, exclude);
    if (!fresh.length) return false;
    this.rerolls--;
    this.choices = fresh;
    this.cue('cardIn', fresh.some(c => c.cat === 'evo') ? 1 : 0, false, .15);
    return true;
  }

  /** 全屏吸取地上所有星屑；节点事件静默吸取，主动爆表才额外发脉冲。 */
  magnetAll(_g: FightGame, silent = false): void {
    if (!this.gems.length) return;
    for (const gm of this.gems) gm.t = 99;
    if (!silent) this.pulses.push({ k: 'mega', x: this.lead.x, y: this.lead.y - 80, t: 0, max: .65, color: '#FDE979' });
  }

  /** 窗口防猝死闸门：血量曾在 25% 以上的 0.65s 窗口内遇到致命一击，锁在 1 HP + 0.65s 无敌震退贴身怪，绝不回血或复活。 */
  guardLethal(g: FightGame, lead: Fighter): boolean {
    if (lead !== this.lead || !this.gateArmed || this.gateWindowT <= 0) return false;
    this.gateArmed = false;
    this.gateWindowT = 0;
    this.gateFlash = .55;
    lead.hp = 1;
    lead.invuln = Math.max(lead.invuln, .65);
    lead.stun = 0;
    lead.knocked = 0;
    lead.downTime = 0;
    for (const f of g.fighters) {
      if (!f.mob || f.hp <= 0 || f.mob.elite) continue;
      if (Math.abs(f.x - lead.x) < 170) {
        f.vx = (Math.sign(f.x - lead.x) || 1) * 320;
        f.stun = Math.max(f.stun, .25);
      }
    }
    this.cue('break', 0, true);
    this.pulses.push({ k: 'shield', x: lead.x, y: lead.y - 60, t: 0, max: .55, color: '#ff5a78', n: 1 });
    g.text('一线生机！', lead.x, lead.y - 210, '#ff6fa8', 1.0, 24);
    g.hitstop = Math.max(g.hitstop, .07);
    return true;
  }

  popDmg(x: number, y: number, val: number, kind: DmgNum['kind']): void {
    const v = Math.round(val);
    if (v < 1) return;
    if (this.dmgNums.length >= 12 && this.elapsed - this.dmgAt[kind] < .04) return;
    this.dmgAt[kind] = this.elapsed;
    if (this.dmgNums.length >= 18) this.dmgNums.shift();
    this.dmgNums.push({
      x: x + ((this.dmgNums.length % 3) - 1) * 14,
      y,
      vy: kind === 'crit' ? -92 : -68,
      v,
      t: 0,
      max: kind === 'crit' ? .62 : .5,
      kind,
    });
  }

  onBossHit(x: number, y: number, lost: number, crit: boolean): void {
    if (lost < 1) return;
    this.popDmg(x, y, lost, crit || this.perfectOn ? 'crit' : 'boss');
    const a = this.lead.attack;
    if (a && a.serial !== this.grooveCastSerial) {
      this.grooveCastSerial = a.serial;
      this.addGroove(a.index === 0 ? 'jab' : a.index === 1 ? 'heavy' : 'skill', a.index === 0 ? 7 : a.index === 1 ? 10 : 12, this.perfectOn ? 4 : 0);
    }
  }

  private syncArms(): void {
    const b = this.build;
    for (const [id, lv] of b.stacks) {
      if (!id.startsWith('w:')) continue;
      const w = id.slice(2) as WeaponId;
      const evo = (w === b.own && b.evo.has('e:own')) || (w === 'notes' && b.evo.has('e:notes')) || (w === 'homing' && b.evo.has('e:homing'));
      this.arms.set(w, lv, evo);
    }
  }

  /* ---- 命中：武器、机关、爆炸都走原版 hit()，但不给顿帧和震屏 ---- */

  strike(g: FightGame, target: Fighter, dmg: number, o: { dir?: number; up?: number; knock?: number; heavy?: boolean } = {}): void {
    if (target.hp <= 0) return;
    // 打 Boss 只掉血不硬直：环绕、光环一直蹭，否则 Boss 会被定死。
    const quiet = !target.mob;
    const key = `${o.heavy ? 1 : 0}|${o.knock ?? 120}|${quiet ? 1 : 0}`;
    let base = this.skillCache.get(key);
    if (!base) {
      base = { ...jab(0, 0), name: '音浪', type: o.heavy ? 'heavy' : 'light', knock: o.knock ?? 120, ...(quiet ? { react: { kind: 'none' } } : {}) } as Skill;
      this.skillCache.set(key, base);
    }
    const src = { hit: new Set<number>() };
    this.silent.add(src.hit);
    const hs = g.hitstop, sh = g.shake;
    hit(g, this.lead, target, { ...base, damage: dmg }, src, target.x - (o.dir ?? 1) * 20);
    g.hitstop = hs;
    g.shake = sh;
    if (o.up && target.mob && target.hp > 0 && !(target.mob.kind === 'guard' && target.mob.shield > 0)) { target.vy = Math.min(target.vy, -o.up); target.knocked = Math.max(target.knocked, .4); }
  }

  /* ---- combat.ts hit() 的钩子 ---- */

  private kept: Fighter | null = null;
  /** 杂兵已经抡起来了，主角一下不踩拍的轻击（J）打断不了它：站着连按 J 压不住人群，要么踩拍、要么重击 / 技能。 */
  keepSwing(m: Fighter, attacker: Fighter, skill: Skill): boolean {
    const keep = !!m.mob && !m.mob.elite && !!m.attack && m.attack.index === 0 && attacker === this.lead
      && skill.type === 'light' && !this.perfectOn && !skill.super;
    this.kept = keep ? m : null;
    return keep;
  }

  firstCrowdHit(hitSet: Set<number>): boolean {
    if (this.silent.has(hitSet) || this.crowdSeen.has(hitSet)) return false;
    this.crowdSeen.add(hitSet);
    return true;
  }

  onMobHit(g: FightGame, m: Fighter, attacker: Fighter, skill: Skill, dir: number, knock: number, nth: number, lost: number, hitSet: Set<number>): void {
    const mob = m.mob!;
    const weapon = this.silent.has(hitSet);
    const big = skill.super || skill.type === 'heavy' || skill.type === 'upper';
    // 保安：盾没破之前轻击只吃两成；重击、技能、必杀打一下少一层盾。
    // 次数盾：每次命中只敲掉一格、这一下不掉血（不管伤害多高）。攻速、多段、弹幕、回声克它。
    const heavyBreak = this.build.evo.has('e:break') && attacker === this.lead && !weapon && (skill.key === 'K' || big);
    if (mob.pips && mob.pips > 0 && lost > 0) {
      mob.pips = Math.max(0, mob.pips - (heavyBreak ? 2 : 1));
      if (m.hp <= 0) m.hp = 1;
      m.hp = Math.min(m.data.hp, m.hp + lost);
      m.vx = dir * 50;
      m.stun = Math.min(m.stun, .06);
      m.knocked = 0;
      if (m.y >= FLOOR - 1) m.vy = 0;
      if (mob.pips === 0) { this.cue('pipBreak', 0, false, .05); this.pulses.push({ k: 'shield', x: m.x, y: m.y - 70, t: 0, max: .35, color: '#9ff3ff', n: 1 }); }
      else this.cue('pip', 0, false, .04);
      return;
    }
    // 厚甲：单次伤害低于门槛只掉一成半。重击、踩拍、下砸、大招克它；「破甲」降低门槛。
    if (mob.armor && lost > 0) {
      const pierce = lvOf(this.build, 'n:pierce');
      const gate = mob.armor * (1 - pierce * .22) * (heavyBreak ? 0 : 1);
      const perfectHit = this.perfectOn && attacker === this.lead;
      if (lost < gate && !perfectHit && !skill.super) {
        if (m.hp <= 0) m.hp = 1;
        m.hp = Math.min(m.data.hp, m.hp + lost * .85);
        m.vx = dir * 40;
        m.stun = Math.min(m.stun, .05);
        m.knocked = 0;
        if (m.y >= FLOOR - 1) m.vy = 0;
        if (!weapon && nth <= 2) { g.effect('hit', m.x - dir * 20, m.y - 60, '#c8d0e8', .18, { radius: 26 }); this.cue('armor', 0, false, .07); }
        return;
      }
      if (pierce) m.hp = Math.max(0, m.hp - lost * pierce * .15);
    }
    // FEVER、踩拍、热度：击飞更远。
    const spread = (1 + Math.min(.5, nth * .03)) * (1 + .5 * this.feverK) * (this.perfectOn && attacker === this.lead ? 1.4 : 1) * (1 + this.heat * .08);
    mob.lastDir = dir;
    mob.lastKnock = knock * spread * (big ? 1.4 : 1);
    // 人墙：普攻不踩拍只吃一半（踩拍、技能、重击照常）。
    if (mob.wall && !weapon && attacker === this.lead && (skill.key === 'J' || skill.key === 'K') && !this.perfectOn && m.hp > 0) m.hp = Math.min(m.data.hp, m.hp + lost * .5);
    if (mob.elite || mob.wall) {
      // 精英站得住：只往后蹭一点，不飞、不倒；砸地预警中途也不会被打断。
      m.vx = dir * 50;
      if (m.y >= FLOOR - 1) m.vy = 0;
      m.knocked = 0;
      m.stun = mob.elite && mob.elite.windup > 0 ? 0 : Math.min(m.stun, .06);
    } else {
      // 普攻不踩拍：只把人往后搡一小步、愣一下，人群照样往上挤（站着连按压不住一群人）；
      // 踩拍、重击、技能才把人整片打飞、打出长硬直。
      const light = !big && (skill.key === 'J' || skill.key === 'K') && !(this.perfectOn && attacker === this.lead) && !weapon;
      if (this.kept === m) { this.kept = null; m.vx = dir * 30; return; }
      m.vx = dir * (140 + knock * 1.5) * spread * (light ? .3 : 1);
      if (!light) m.vy = Math.min(m.vy, big ? -420 - knock * .5 : -150 * (1 + .4 * this.feverK));
      else if (m.y >= FLOOR - 1) m.vy = 0;
      if (big) m.knocked = Math.max(m.knocked, .55);
      m.stun = Math.max(m.stun, big ? .5 : light ? .14 : .32);
    }
    if (attacker === this.lead && !weapon) {
      mob.light = !big && (skill.key === 'J' || skill.key === 'K') && !this.perfectOn;
      this.frameHits++;
      this.frameDir = dir;
    } else if (weapon) mob.light = false;
    if (attacker === this.lead && lost >= 1) {
      if (mob.elite) this.popDmg(m.x, m.y - 115, lost, this.perfectOn ? 'crit' : 'boss');
      else if (lost >= (this.perfectOn ? 24 : 42)) this.popDmg(m.x, m.y - 80, lost, 'crit');
    }
    if (weapon || attacker !== this.lead) return;
    if (nth === 1) {
      this.cue('hit', big ? 1 : 0, false, .05);
      if (big || this.perfectOn) this.kick(dir * (this.perfectOn ? 7 : 5), -2);
    }
    const atk = this.lead.attack;
    if (atk && atk.serial !== this.grooveCastSerial) {
      this.grooveCastSerial = atk.serial;
      this.addGroove(atk.index === 0 ? 'jab' : atk.index === 1 ? 'heavy' : 'skill', atk.index === 0 ? 7 : atk.index === 1 ? 10 : 12, this.perfectOn ? 4 : 0);
    }
    const b = this.build;
    // 普攻形变：余震溅射、音符地雷。
    if (skill.key === 'J' || skill.key === 'K') {
      const after = lvOf(b, 'n:after');
      if (after && nth <= 3) for (const o of g.fighters) {
        if (o === m || !o.mob || o.hp <= 0 || Math.abs(o.x - m.x) > 80) continue;
        this.strike(g, o, Math.max(4, lost) * (.3 + after * .15), { dir, knock: 140 });
      }
      const mine = lvOf(b, 'n:mine');
      if (mine && nth === 1 && this.mines.length < 4 + mine * 3) this.mines.push({ x: m.x, t: .6, dmg: 20 + mine * 12 });
      // 重音：K 落下的地方炸开一圈。
      const shock = lvOf(b, 'n:shock');
      if (shock && skill.key === 'K' && nth === 1) this.arms.blast(g, this.lead, this, m.x, m.y, 100 + shock * 28, 18 + shock * 12, 'ring', { lv: shock, evo: false }, 300);
      // 和弦：普攻打中的第一只把伤害连到身边几只。
      const chain = lvOf(b, 'n:chain');
      if (chain && nth === 1) {
        let from = m, left = 1 + chain;
        const hitIds = new Set<number>([m.id]);
        while (left-- > 0) {
          let best: Fighter | null = null, bd = 240;
          for (const o of g.fighters) {
            if (!o.mob || o.hp <= 0 || hitIds.has(o.id)) continue;
            const d = Math.abs(o.x - from.x);
            if (d < bd) { bd = d; best = o; }
          }
          if (!best) break;
          hitIds.add(best.id);
          this.arms.fx.push({ k: 'chain', x: from.x, y: from.y - 50, r: best.x - from.x, dir: 1, life: .22, max: .22, lv: chain, evo: false, w: (best.y - 50) - (from.y - 50) });
          this.strike(g, best, Math.max(8, lost * (.5 + chain * .12)), { dir: Math.sign(best.x - from.x) || 1, knock: 180 });
          from = best;
        }
      }
    }
    // 技能改造：U/I/O 命中引爆。
    const burst = lvOf(b, 's:burst');
    if (burst && (skill.key === 'U' || skill.key === 'I' || skill.key === 'O') && (this.burstAt.get(m) ?? -1) < this.elapsed) {
      this.burstAt.set(m, this.elapsed + .5);
      this.arms.blast(g, this.lead, this, m.x, m.y, 95, 25 + burst * 15, 'pop', { lv: burst, evo: false }, 240);
    }
  }

  /** Boss 自己挨的连段：1.3 秒没再挨打就重数（combat.ts 的脱离连段读它）。 */
  bossCombo(d: Fighter): number {
    if (this.elapsed - this.bossHitAt > 1.3) this.bossHits = 0;
    this.bossHitAt = this.elapsed;
    const n = ++this.bossHits;
    if (n >= d.escapeCombo) this.bossHits = 0;
    return n;
  }
  private bossHits = 0;
  private bossHitAt = -9;

  /** 杂兵出手的总节拍：全场按 swingRate（次/秒）轮流出手。压迫感靠它随强度、FEVER、包围一起涨，单次伤害不涨。 */
  takeSwing(): boolean {
    if (this.swingCd > 0) return false;
    this.swingCd = 1 / this.swingRate;
    return true;
  }

  /* ---- 每步 ---- */

  step(g: FightGame, dt: number): void {
    const lead = this.lead;
    this.gateFlash = Math.max(0, this.gateFlash - dt);
    if (lead.hp <= 0) return;
    this.elapsed += dt;
    if (lead.hp >= lead.data.hp * .25) {
      this.gateArmed = true;
      this.gateWindowT = .65;
    } else if (this.gateWindowT > 0) {
      this.gateWindowT = Math.max(0, this.gateWindowT - dt);
      if (this.gateWindowT <= 0) this.gateArmed = false;
    }
    this.swingCd = Math.max(0, this.swingCd - dt);
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.frenzyT = Math.max(0, this.frenzyT - dt);
    this.airTime = lead.y < FLOOR - 45 ? Math.min(5, this.airTime + dt) : Math.max(0, this.airTime - dt * .8);
    this.streakTime = Math.max(0, this.streakTime - dt);
    if (this.streakTime === 0) this.streak = 0;

    if (this.audioT != null) this.audioT += dt;
    // 热度加伤：按差值挂到 dmgMul 上，档位变了就补差。
    const want = this.heat * HEAT_DMG;
    if (want !== this.heatApplied) { lead.dmgMul += want - this.heatApplied; this.heatApplied = want; }
    // 格斗里的命中回气不进大招槽（只认 charge()）；放 L 的扣气照常。
    if (lead.energy > this.lastEnergy) lead.energy = this.lastEnergy;
    this.allowedEnergy = lead.energy;
    this.stepHurt(g, lead, dt);

    this.follow(g, lead, dt);
    this.watchCasts(g, lead);
    this.stepUlt(g, lead);
    this.stepFever(dt);
    this.arms.step(g, lead, this, dt);
    this.stepMines(g, dt);
    this.stepProps(g, lead, dt);
    this.stepMobShots(g, lead, dt);
    this.reap(g, lead);
    this.stepDebris(g, dt);
    this.stepGems(g, lead, dt);
    this.stepSong(g, lead, dt);
    this.stepLeaving(g, dt);
    this.stepSupplies(g, lead, dt);
    this.stepGrab(g, lead, dt);
    this.stepMoves(g, lead, dt);
    this.stepEchoes(g, dt);
    this.stepPower(g, lead, dt);
    this.stepRares(g, lead, dt);
    this.stepDrops(g, lead, dt);
    this.stepGiants(g, lead, dt);
    this.stepLifts(g, lead, dt);
    this.stepLasers(g, lead, dt);
    this.stepSolo(g, lead, dt);
    this.stepAnomaly(g, lead, dt);
    this.stepOrbs(g, lead, dt);
    this.stepBalls(g, lead, dt);
    this.stepPadChains(g, lead, dt);
    this.stepToySpawner(g, lead, dt);
    if (this.phase === 'play' && this.songT > this.plan.introEnd + 5 && this.songT < this.plan.bossAt - 4) {
      this.orbCd -= dt * (this.airTime > 1.5 ? 1.6 : 1);
      if (this.orbCd <= 0 && this.orbs.length < 2) {
        this.spawnSkyOrb(g, lead);
        this.orbCd = 9 + g.random() * 4;
      }
    }
    this.stepBowling(g);
    this.stepCaptains(g, dt);
    this.stepRing(g, lead, dt);
    this.stepCharges(g, lead, dt);
    this.stepChests(g, lead, dt);
    this.stepWarns(g, lead, dt);
    this.stepSpot(lead, dt);
    this.stepGroove(dt);
    let w = 0;
    for (const p of this.pulses) { p.t += dt; if (p.t < p.max) this.pulses[w++] = p; }
    this.pulses.length = w;
    let dw = 0;
    for (const dn of this.dmgNums) {
      dn.t += dt;
      dn.y += dn.vy * dt;
      dn.vy *= Math.max(0, 1 - dt * 3.5);
      if (dn.t < dn.max) this.dmgNums[dw++] = dn;
    }
    this.dmgNums.length = dw;
    if (this.phase !== 'shift') this.spawn(g, lead, dt);
    if (this.streak >= this.streakMark + 50) { this.streakMark += 50; this.charge(ULT_STREAK); }
    if (this.streak < this.streakMark) this.streakMark = 0;
    // 一招打中一片：按这一帧打中的数量给一小段顿帧和一下镜头冲击（有上限，不卡成幻灯片）。
    if (this.frameHits >= 4) {
      g.hitstop = Math.max(g.hitstop, Math.min(.075, .016 + this.frameHits * .0035));
      this.kick(this.frameDir * Math.min(9, 2 + this.frameHits * .45), -1);
      if (this.frameHits >= 10) this.cue('crowd', this.frameHits, false, .25);
    }
    this.frameHits = 0;
    this.slowT = Math.max(0, this.slowT - dt);
    // 击破里程碑：每 100 个盖一个章。
    const ms = Math.floor(this.kills / 100);
    if (ms > this.milestone) { this.milestone = ms; this.milestoneAt = this.elapsed; this.cue('milestone', ms, true); }
    // 导演自己这一步里武器、机关打出来的回气也不算。
    if (lead.energy > this.allowedEnergy) lead.energy = this.allowedEnergy;
    this.lastEnergy = lead.energy;
    this.lastHp = lead.hp;
  }

  /* ---- 受伤反馈：屏幕边缘泛红 + 一下卡肉（顿帧、轻震），连着挨打时限频 ---- */

  private stepHurt(g: FightGame, lead: Fighter, dt: number): void {
    this.hurtGap = Math.max(0, this.hurtGap - dt);
    this.heatGrace = Math.max(0, this.heatGrace - dt);
    this.hurtK = Math.max(0, this.hurtK - dt * 1.8);
    const lost = this.lastHp - lead.hp;
    if (lost <= 0) return;
    this.hurtK = Math.min(1, this.hurtK + .35 + lost / lead.data.hp * 6);
    // 挨打掉一档热度（1 秒内只掉一次），连续完美清零。
    if (this.heatGrace <= 0 && (this.heat > 0 || this.heatFill > 0)) {
      this.heatGrace = 1;
      if (this.heat > 0) { this.heat--; this.cue('heatDown', this.heat); }
      this.heatFill = 0;
    }
    this.pstreak = 0;
    if (this.groove > 0) {
      this.groove = Math.max(0, this.groove - 10);
      this.grooveScratch = .35;
      this.cue('scratch', 1, false, .5);
      this.syncGrooveRank();
    }
    if (this.hurtGap > 0) return;
    this.cue('hurt', 0, false, .2);
    this.hurtGap = .22;
    g.hitstop = Math.max(g.hitstop, .05);
    g.shake = Math.max(g.shake, 4);
  }

  /* ---- 副歌 FEVER ---- */

  private stepFever(dt: number): void {
    const want = this.fever >= 0 ? 1 : 0;
    this.feverK += (want - this.feverK) * Math.min(1, dt * (want ? 3 : 1.6));
    if (Math.abs(this.feverK - want) < .002) this.feverK = want;
    // 攻击范围：强化卡「扩音」的等级 × FEVER 临时放大。
    this.lead.musouRangeMul = (1 + lvOf(this.build, 'n:reach') * .18) * (1 + .35 * this.feverK);
  }

  private feverStart(g: FightGame, i: number): void {
    const big = this.plan.chorus[i].big;
    const lead = this.lead;
    g.setBanner('FEVER!', big ? '终盘浪潮 · 两侧包围' : '狂热浪潮 · 全场沸腾', 1.5);
    this.pulses.push({ k: 'fever', x: lead.x, y: lead.y - 70, t: 0, max: .9, color: TAGS[this.song.tag].mood.f1 });
    this.magnetAll(g, true);
    this.cue('fever', big ? 1 : 0, true);
    // 落在第一拍：先往她身上一推，再甩到 FEVER 的远景。
    this.shot(lead.x, lead.y - 90, big ? 1.2 : 1.14, .32);
    this.surgeCd = .4;
  }

  private feverEnd(g: FightGame, i: number): void {
    if (this.plan.chorus[i].big) return; // 最后一段副歌接 Boss，不再加精英。
    this.spawnElite(g, this.lead);
  }

  /* ---- 大招：放 L 时杂兵定住，L 放完全屏清场 ---- */

  private stepUlt(g: FightGame, lead: Fighter): void {
    if (!this.ultOn) return;
    lead.invuln = Math.max(lead.invuln, .05);
    for (const f of g.fighters) if (f.mob && f.hp > 0) { f.stun = Math.max(f.stun, .08); f.ai.move = 0; if (f.mob.elite) f.mob.elite.windup = 0; }
    this.shots.length = 0;
  }

  /** 全屏一击：杂兵直接打飞，精英掉一截，Boss 掉一点。大招、爆音音箱共用。 */
  private screenClear(g: FightGame, lead: Fighter, eliteCut: number, bossCut: number): void {
    for (const f of g.fighters) {
      if (f.team === lead.team || f.hp <= 0 || f.x < -60 || f.x > VIEW_W + 60) continue;
      const dir = (Math.sign(f.x - lead.x) || 1) as 1 | -1;
      if (f.mob && !f.mob.elite) { f.mob.lastDir = dir; f.mob.lastKnock = 460; f.hp = 0; continue; }
      const cut = f.mob ? eliteCut : bossCut;
      this.strike(g, f, Math.max(1, Math.round(f.data.hp * cut)), { dir, knock: 160, heavy: true });
    }
    this.shots.length = 0;
    g.shake = Math.max(g.shake, 12);
  }

  private ultClear(g: FightGame, lead: Fighter): void {
    this.pulses.push({ k: 'ult', x: lead.x, y: lead.y - 80, t: 0, max: 1.4, color: lead.data.color });
    this.screenClear(g, lead, .4, .08);
    this.cue('ultDrop', 0, true);
    // 清场：猛地拉到全景，整条街的人一起飞出去。
    this.shot(lead.x, FLOOR - 140, .84, .9);
    this.noChargeUntil = this.elapsed + .3;
    g.hitstop = Math.max(g.hitstop, .16);
  }

  /* ---- 曲目流程 ---- */

  /** 切歌过场里已经定好的下一首（Boss 倒下那一刻抽，过场一半时换音乐和氛围）。 */
  nextUp: MusouSong | null = null;

  private startSong(g: FightGame, s: MusouSong, first = false): void {
    this.song = s;
    this.played.push(s);
    this.songT = 0;
    this.phase = 'play';
    this.bossSpawned = false;
    this.boss = null;
    this.prevMood = first ? s.tag : this.mood;
    this.mood = s.tag;
    this.plan = songPlan(s);
    this.fever = -1;
    this.audioT = null;
    this.threatCd = 6;
    this.surgeCd = 3;
    this.anomalyDoneSong = false;
    this.anomalyCd = 8;
    this.toyCd = 9;
    const prof = TAGS[s.tag];
    this.bandAt = this.guest && g.random() < prof.band ? .3 + g.random() * .35 : -1;
    if (first && s.track >= 0) this.musicTrack = s.track;
    this.placeProps(g, 6);
    if (first) g.setBanner(s.title, `上半场 · ${prof.name} · 开演！`, 2);
  }

  private nextSong(g: FightGame): MusouSong {
    const cur = this.song;
    // 换一种曲风；没有别的曲风就换一首别的歌。
    const prev = this.played.at(-2);
    let pool = this.songs.filter(s => s.tag !== cur.tag && s !== prev);
    if (!pool.length) pool = this.songs.filter(s => s !== cur);
    if (!pool.length) pool = this.songs;
    return pool[Math.floor(g.random() * pool.length)];
  }

  private stepSong(g: FightGame, lead: Fighter, dt: number): void {
    if (this.phase === 'shift') {
      const was = this.shiftT;
      this.shiftT += dt;
      const next = this.nextUp!;
      // 过场一半：换音乐、报幕（和画面上的氛围擦除同一刻）。
      if (was < 1 && this.shiftT >= 1) {
        if (next.track >= 0) this.musicTrack = next.track;
        const label = this.half === 0 ? '下半场' : `安可 ${this.half}`;
        g.setBanner(next.title, `${label} · ${TAGS[next.tag].name}`, 1.8);
      }
      if (this.shiftT >= SHIFT_TIME) {
        this.half++;
        this.nextUp = null;
        this.startSong(g, next);
      }
      return;
    }
    const t0 = this.songT;
    this.songT += dt;
    const t = this.songT, plan = this.plan;
    const at = (x: number) => t0 < x && t >= x;
    const p = this.songP;
    if (this.bandAt >= 0 && p >= this.bandAt) { this.bandAt = -1; this.bandDrop(g, lead); }
    // 节奏表：开场第一张卡、主歌第一次补给、副歌 FEVER 进出、精英战后的机关事件、Boss。
    if (this.half === 0 && at(plan.firstCard)) this.pushUpgradeOffer(g);
    if (at(plan.supplyAt)) this.dropSupply(g, clamp(lead.x + lead.facing * 180, X_MIN + 60, X_MAX - 60), FLOOR - 220, this.half === 0 ? 'drink' : undefined);
    for (const e of plan.events) if (at(e)) this.stageEvent(g, lead);
    // 副歌前 1.2 秒起一个渐强，正好顶到 FEVER 的第一拍。
    for (const c of plan.chorus) if (at(c.s - 1.2)) this.cue('riser');
    // 主歌里隔一会儿来一次群体威胁（前奏、副歌、Boss 段、精英在场、已有威胁时不来）。
    // 副歌里只来横幅冲锋（围堵圈和满屏人潮叠在一起读不清）；精英在场时也只来冲锋。
    const quiet = chorusAt(plan, t) >= 0 || g.fighters.some(f => f.mob?.elite && f.hp > 0);
    if (this.phase === 'play' && t > plan.introEnd + 2 && t < plan.bossAt - 6 && !this.ring && !this.charges.length && !this.giants.some(x => x.phase === 'stand' || x.phase === 'warn') && !this.lifts.length && !this.lasers.length && !this.solo) {
      this.threatCd -= dt;
      if (this.threatCd <= 0) {
        const prof = TAGS[this.song.tag];
        this.threatCd = prof.threatGap * (.85 + g.random() * .3) / (1 + this.half * .15);
        this.pickEvent(g, lead, quiet);
      }
    }
    if (this.phase === 'play') {
      const ci = t < plan.bossAt ? chorusAt(plan, t) : -1;
      if (ci !== this.fever) {
        const was = this.fever;
        this.fever = ci;
        if (was >= 0) this.feverEnd(g, was);
        if (ci >= 0) this.feverStart(g, ci);
      }
    } else this.fever = -1;
    if (!this.bossSpawned && t >= plan.bossAt) this.spawnBoss(g, lead);
    if (this.phase === 'play' && this.songT >= this.song.dur && this.activeBoss()) {
      this.phase = 'hold';
      // 整首自然循环续播，等玩家打倒 Boss。
      g.setBanner('安可！安可！', '打倒梦魇才能进入下一首', 1.6);
    }
    if (this.phase === 'hold') {
      this.chantCd -= dt;
      if (this.chantCd <= 0) {
        this.chantCd = 1.4;
        g.text('安可！', 120 + g.random() * 720, 150 + g.random() * 60, g.random() < .5 ? '#ff6fa8' : '#76e7ff', .9, 22);
      }
    }
    if (this.boss && this.boss.hp <= 0) this.bossDown(g, lead);
  }

  private spawnBoss(g: FightGame, lead: Fighter): void {
    this.bossSpawned = true;
    const id = this.bossPool[this.half % this.bossPool.length];
    const base = ROSTER_BY_ID.get(id) ?? PUBLIC_ROSTER[0];
    const hp = Math.round(base.hp * (1.5 + this.half * .6));
    const fid = g.nextFighterId();
    const x = lead.x < 480 ? X_MAX - 60 : X_MIN + 60;
    const b = makeFighter({ ...base, hp }, fid, { x, facing: x >= lead.x ? -1 : 1, controller: null, energy: 40, team: 1 });
    b.nightmare = true;
    b.escapeCombo = 14;
    // 梦魇的伤害按场次爬：上半场六成、下半场八成、安可起满额（一整套 1v1 连段打在割草里的残血主角身上太狠）。
    b.dmgMul *= Math.min(1, .6 + this.half * .2);
    g.ensureStats(fid);
    g.fighters.push(b);
    this.boss = b;
    g.sparks(b.x, b.y - 90, '#9a5cff', 28, 1.4);
    g.setBanner(`梦魇 · ${base.name}`, `${this.halfLabel} BOSS`, 1.8);
    g.audio.play('super', b.id);
  }

  private bossDown(g: FightGame, lead: Fighter): void {
    const b = this.boss!;
    this.boss = null;
    this.bossesDefeated++;
    this.defeated.push(b.data.id);
    this.kills++;
    this.gainXp(g, 15 + this.half * 5);
    // 冲击波清场：场上杂兵全部打飞。
    for (const f of g.fighters) if (f.mob && f.hp > 0) { f.mob.lastDir = f.x >= b.x ? 1 : -1; f.mob.lastKnock = 420; f.hp = 0; }
    this.arms.fx.push({ k: 'clear', x: b.x, y: b.y - 60, r: 1100, dir: 1, life: .8, max: .8, lv: 1, evo: true });
    g.sparks(b.x, b.y - 90, '#ffffff', 30, 1.6);
    g.shake = 10;
    g.hitstop = .12;
    // 只回一小口：血量不会自动回满，下半场靠补给续命。
    lead.hp = Math.min(lead.data.hp, lead.hp + Math.round(lead.data.hp * .1));
    this.fever = -1;
    this.warns.length = 0;
    this.ring = null;
    this.charges.length = 0;
    this.lasers.length = 0;
    this.orbs.length = 0;
    this.balls.length = 0;
    this.padChains.length = 0;
    this.frenzyT = 0;
    if (this.soloDmgApplied) { lead.dmgMul -= .3; this.soloDmgApplied = false; }
    this.solo = null;
    if (this.anomalyDmgApplied) { lead.dmgMul -= this.anomalyDmgApplied; this.anomalyDmgApplied = 0; }
    this.anomaly = null;
    this.rerolls = Math.min(5, this.rerolls + 1);
    this.dmgNums.length = 0;
    for (const gm of this.gems) gm.t = 99;
    this.shots.length = 0;
    this.pushUpgradeOffer(g);
    this.phase = 'shift';
    this.shiftT = 0;
    this.nextUp = this.nextSong(g);
    this.prevMood = this.mood;
    this.mood = this.nextUp.tag;
    g.setBanner('LIVE CLEAR', this.half === 0 ? '中场 · 换下一首' : '安可！下一首', 1.6);
    this.slow(.22);
    this.shot(b.x, b.y - 100, 1.25, .8);
    g.audio.play('super', lead.id);
    this.leaving.push({ f: b, t: 1.5 });
  }

  private stepLeaving(g: FightGame, dt: number): void {
    if (!this.leaving.length) return;
    for (const e of this.leaving) {
      e.t -= dt;
      if (e.t > 0) continue;
      const i = g.fighters.indexOf(e.f);
      if (i >= 0) g.fighters.splice(i, 1);
    }
    this.leaving = this.leaving.filter(e => e.t > 0);
  }

  /* ---- 镜头 ---- */

  private follow(g: FightGame, lead: Fighter, dt: number): void {
    for (const f of g.fighters) if (!f.mob && f.attack && f.attack.index >= 2) return;
    let want = 0;
    if (lead.x > FOLLOW_R) want = Math.min(lead.x - FOLLOW_R, STREET_MAX - this.scrollX);
    else if (lead.x < FOLLOW_L) want = -Math.min(FOLLOW_L - lead.x, this.scrollX);
    if (Math.abs(want) < .01) return;
    const cap = CATCH_UP * dt;
    const dx = clamp(want, -cap, cap);
    this.scrollX += dx;
    this.shiftWorld(g, dx);
  }

  private shiftWorld(g: FightGame, dx: number): void {
    for (const f of g.fighters) f.x -= dx;
    for (const p of g.projectiles) {
      p.x -= dx;
      for (const t of p.trail) t.x -= dx;
      if (p.aim != null) p.aim -= dx;
    }
    for (const e of g.effects) e.x -= dx;
    for (const p of g.particles) p.x -= dx;
    for (const t of g.texts) t.x -= dx;
    for (const d of this.debris) d.x -= dx;
    for (const gm of this.gems) gm.x -= dx;
    for (const s of this.shots) s.x -= dx;
    for (const p of this.props) p.x -= dx;
    for (const m of this.mines) m.x -= dx;
    for (const s of this.supplies) s.x -= dx;
    for (const c of this.chests) c.x -= dx;
    for (const w of this.warns) w.x -= dx;
    for (const p of this.pulses) p.x -= dx;
    for (const c of this.charges) c.x -= dx;
    for (const r of this.rares) r.x -= dx;
    for (const d of this.drops) d.x -= dx;
    for (const d of this.dropFx) d.x -= dx;
    for (const r of this.rshots) r.x -= dx;
    for (const gi of this.giants) gi.x -= dx;
    for (const l of this.lifts) l.x -= dx;
    for (const o of this.orbs) o.x -= dx;
    for (const b of this.balls) { b.x -= dx; for (const tr of b.trail) tr.x -= dx; }
    for (const ch of this.padChains) for (const p of ch.pads) p.x -= dx;
    for (const e of this.echoes) e.x -= dx;
    for (const dn of this.dmgNums) dn.x -= dx;
    if (this.solo) this.solo.x -= dx;
    if (this.dash) this.dash.x0 -= dx;
    if (this.ring) this.ring.cx -= dx;
    this.arms.shift(dx);
  }

  /** 主角出招：三连弹幕数普攻，安可追加盯着 L 放完。 */
  private watchCasts(g: FightGame, lead: Fighter): void {
    const a = lead.attack;
    // 踩拍：每一次新出手（J K U I O）都判一下离拍点多远。
    if (a && a.index < 5 && a.serial !== this.judgedSerial && this.phase !== 'shift') {
      this.judgedSerial = a.serial;
      const e = this.beatErr();
      if ((e >= -PERFECT_EARLY && e <= PERFECT_LATE) || this.power?.kind === 'metro') this.onPerfect(g, lead, a.serial);
    }
    // 完美的那一招整招加伤（招放完、换招就撤）。
    const on = !!a && a.serial === this.perfectSerial;
    if (on !== this.perfectOn) { this.perfectOn = on; lead.dmgMul += on ? .35 : -.35; }
    if (a && a.index < 2 && a.serial !== this.normalSerial) {
      this.normalSerial = a.serial;
      const tri = lvOf(this.build, 'n:triple');
      if (tri && ++this.normals % 3 === 0) this.arms.fanBurst(lead, 3 + tri, 14 + tri * 5);
      this.waveSlash(g, lead, a.index === 1);
      // 回声：普攻打完 0.12 秒后在前方再响一下（多一次命中，专敲次数盾）；进化「和声」响两下。
      const echo = lvOf(this.build, 'n:echo');
      if (echo) {
        const reach = ((a.skill.range ?? 90) + 30) * (lead.musouRangeMul ?? 1);
        this.echoes.push({ t: .12, x: lead.x, dir: lead.facing, r: reach, dmg: 6 + echo * 4, n: this.build.evo.has('e:echo') ? 2 : 1 });
      }
      // 普攻也打得到巨型障碍物、高空灯箱与高压电球。
      this.hitGiantsByAttack(g, lead, a);
      this.hitLaserNodes(g, lead.x + lead.facing * 70, lead.y - 95, 95, Math.max(20, (a.skill.damage ?? 20) * lead.dmgMul));
      this.hitOrbs(g, lead.x + lead.facing * 70, lead.y - 95, 95);
      this.hitBalls(g, lead, lead.x + lead.facing * 75, lead.y - 75, Math.max(95, (a.skill.range ?? 85) * (lead.musouRangeMul ?? 1)) + 40, a.index >= 1 || this.perfectOn, this.perfectOn);
    } else if (a && a.index >= 2 && a.serial !== this.giantSerial) {
      this.giantSerial = a.serial;
      this.hitGiantsByAttack(g, lead, a);
      this.hitLaserNodes(g, lead.x + lead.facing * 70, lead.y - 95, 95, Math.max(28, (a.skill.damage ?? 25) * lead.dmgMul * 1.4));
      this.hitOrbs(g, lead.x + lead.facing * 70, lead.y - 95, 95);
      this.hitBalls(g, lead, lead.x + lead.facing * 75, lead.y - 75, Math.max(105, (a.skill.range ?? 95) * (lead.musouRangeMul ?? 1)) + 45, true, this.perfectOn);
    }
    if (a && a.index === 5) {
      if (a.serial !== this.ultSerial) { this.ultOn = true; this.lastEnergy = lead.energy; this.cue('ultCast'); this.shot(lead.x, lead.y - 90, 1.16, .55); }
      this.ultSerial = a.serial;
    } else if (this.ultSerial >= 0 && (!a || a.serial !== this.ultSerial)) {
      this.ultSerial = -1;
      this.ultOn = false;
      this.ultClear(g, lead);
      const enc = lvOf(this.build, 's:encore');
      for (let i = 0; i < enc; i++) {
        this.arms.fx.push({ k: 'encore', x: lead.x, y: lead.y - 70, r: 900, dir: 1, life: .7 + i * .25, max: .7 + i * .25, lv: enc, evo: false });
        for (const f of g.fighters) if (f.team !== lead.team && f.hp > 0) this.strike(g, f, 60 + enc * 30, { dir: Math.sign(f.x - lead.x) || 1, knock: 360, up: 380, heavy: true });
      }
    }
  }

  private stepMines(g: FightGame, dt: number): void {
    let w = 0;
    for (const m of this.mines) {
      m.t -= dt;
      if (m.t <= 0) { this.arms.blast(g, this.lead, this, m.x, FLOOR, 85, m.dmg, 'mine', { lv: 1, evo: false }, 220); continue; }
      this.mines[w++] = m;
    }
    this.mines.length = w;
  }

  /* ---- 机关 ---- */

  private placeProps(g: FightGame, n: number): void {
    this.props.length = 0;
    const prof = TAGS[this.song.tag].props;
    const kinds = Object.keys(prof) as PropKind[];
    const sum = kinds.reduce((s, k) => s + prof[k], 0);
    for (let i = 0; i < n; i++) {
      let r = g.random() * sum, k = kinds[0];
      for (const kk of kinds) { if ((r -= prof[kk]) <= 0) { k = kk; break; } }
      // 沿长街均匀撒开（世界坐标 → 当前局部坐标）。
      const wx = 200 + (i + .2 + g.random() * .6) * ((WORLD_W - 400) / n);
      this.props.push(this.makeProp(k, wx - this.scrollX));
    }
  }

  private makeProp(kind: PropKind, x: number): Prop {
    return { kind, x, hp: kind === 'speaker' ? 3 : kind === 'crate' ? 2 : 1, t: kind === 'cheer' ? 18 : 0, state: 0, cd: 0 };
  }

  private stepProps(g: FightGame, lead: Fighter, dt: number): void {
    const a = lead.attack;
    const reach = a ? Math.max(90, (a.skill.range ?? 80) * (lead.musouRangeMul ?? 1)) + 40 : 0;
    let inZone = false;
    let w = 0;
    for (const pr of this.props) {
      pr.cd = Math.max(0, pr.cd - dt);
      if (pr.kind === 'cheer') {
        pr.t -= dt;
        if (Math.abs(lead.x - pr.x) < 120 && pr.t > 0) inZone = true;
        if (pr.t > 0) this.props[w++] = pr;
        continue;
      }
      if (pr.state === 0 && a && pr.cd === 0 && a.t > (a.skill.start ?? 0) && Math.abs(pr.x - lead.x) < reach
        && (Math.sign(pr.x - lead.x) === lead.facing || Math.abs(pr.x - lead.x) < 60)) {
        pr.cd = .3;
        pr.hp--;
        g.sparks(pr.x, FLOOR - 60, '#ffffff', 8, .8);
        if (pr.hp <= 0) this.triggerProp(g, lead, pr);
      }
      if (pr.state === 1) {
        pr.t += dt;
        if (pr.kind === 'rig' && pr.t >= .45 && pr.hp > -9) {
          pr.hp = -9;
          for (const f of g.fighters) if (f.team !== lead.team && f.hp > 0 && Math.abs(f.x - pr.x) < 95) this.strike(g, f, 120 + this.half * 40, { dir: Math.sign(f.x - pr.x) || 1, up: 360, knock: 200, heavy: true });
          g.shake = 8;
          g.sparks(pr.x, FLOOR - 10, '#ffe6a8', 22, 1.3);
        }
        if (pr.t > 1.2) continue;
      }
      this.props[w++] = pr;
    }
    this.props.length = w;
    // 应援区：站进去伤害 +25%、冷却快 30%；出来就撤。
    if (inZone !== this.zoneOn) {
      this.zoneOn = inZone;
      lead.dmgMul += inZone ? .25 : -.25;
      lead.cdMul *= inZone ? .7 : 1 / .7;
      if (inZone) g.text('应援中！', lead.x, lead.y - 210, '#ff6fa8', .7, 20);
    }
  }

  get inZone(): boolean { return this.zoneOn; }

  private triggerProp(g: FightGame, lead: Fighter, pr: Prop): void {
    pr.state = 1;
    pr.t = 0;
    if (pr.kind === 'speaker') {
      this.arms.blast(g, lead, this, pr.x, FLOOR, 210, 90 + this.half * 30, 'speaker', { lv: 3, evo: false }, 420);
      this.healLead(g, .02, pr.x, FLOOR - 140);
      g.shake = 9;
      g.sparks(pr.x, FLOOR - 70, '#ff6fa8', 26, 1.5);
      g.audio.play('super', lead.id);
    } else if (pr.kind === 'crate') {
      // 补给箱：弹出一份补给（按曲风抽）和一把星屑。
      this.dropSupply(g, pr.x, FLOOR - 90);
      for (let i = 0; i < 12; i++) this.dropGem(g, pr.x, FLOOR - 60, 2);
    }
  }

  /* ---- 杂兵 ---- */

  /** ai.ts 的杂兵分支整个交给这里。 */
  mobThink(g: FightGame, f: Fighter, dt: number): void {
    const m = f.mob!;
    const o = this.lead;
    m.atkCd = Math.max(0, m.atkCd - dt);
    if (o.hp <= 0 || f.stun > 0 || f.knocked > 0 || f.dodge > 0 || this.phase === 'shift') { f.ai.move = 0; return; }
    const dx = o.x - f.x, dist = Math.abs(dx);
    const dir = (Math.sign(dx) || f.facing) as 1 | -1;
    f.ai.facing = dir;
    if (!f.attack) f.facing = dir;
    if (m.elite) { this.eliteThink(g, f, o, dx, dist, dir, dt); return; }
    if (m.wall && this.ring) {
      // 人墙：站到自己那一侧的墙位上，跟着圈往里收；够得着就推搡一下。
      const r = this.ring, list = m.wall < 0 ? r.left : r.right;
      const i = Math.max(0, list.indexOf(f));
      const tx = r.cx + m.wall * (r.R + i * 15);
      f.ai.move = Math.abs(tx - f.x) > 8 ? (Math.sign(tx - f.x) as 1 | -1) : 0;
      f.ai.facing = -m.wall as 1 | -1;
      if (!f.attack) f.facing = -m.wall as 1 | -1;
      if (i < 2 && dist < (f.data.skills[0]?.range ?? 64) + 20 && m.atkCd <= 0 && this.takeSwing() && g.canAttack(f, 0)) { g.attack(f, 0); m.atkCd = 1.1 + g.random() * .6; }
      return;
    }
    if (m.kind === 'scalper') {
      if (m.flee > 0) {
        m.flee -= dt;
        const away = -dir as 1 | -1;
        f.ai.move = away;
        f.ai.facing = away;
        f.facing = away;
        // 跑到屏幕边还没被追上：带着经验溜走。
        if ((f.x <= X_MIN + 2 || f.x >= X_MAX - 2) && m.flee < 2.5) { f.hp = 0; m.lastKnock = -1; }
        return;
      }
      f.ai.move = dir;
      if (dist < 50 && Math.abs(o.y - f.y) < 60 && this.xp > 0) {
        const take = Math.max(1, Math.floor(this.xp * .4));
        this.xp -= take;
        m.stolen += take;
        m.flee = 4;
        g.text(`-${take} EXP 被抢走了！`, f.x, f.y - 150, '#E9C46A', .9, 20);
      }
      return;
    }
    if (m.kind === 'glow') {
      // 荧光棒：保持距离，隔一会儿扔一根。
      f.ai.move = dist > m.gap + 40 ? dir : dist < m.gap - 40 ? -dir as 1 | -1 : 0;
      m.throwCd -= dt;
      if (m.throwCd <= 0 && dist < 560 && this.throwCd <= 0 && this.shots.length < 2 + this.half) {
        // 全场共用一个投掷节拍：荧光棒是远处的骚扰，不是主要伤害。
        // 主角在空中时扔得更勤（防空）：连砸弹跳不是绝对安全。
        this.throwCd = (this.fever >= 0 ? 1.5 : 2.2) / (1 + this.half * .2) * Math.max(1, this.song.dur / 170) * (o.y < FLOOR - 60 ? .45 : 1);
        m.throwCd = 4.5 + g.random() * 2;
        const t = Math.max(.5, dist / 520);
        this.shots.push({ x: f.x, y: f.y - 70, vx: dx / t, vy: -GRAVITY * .45 * t, life: 2.5, owner: f, spin: 0 });
      }
      return;
    }
    const reach = (f.data.skills[0]?.range ?? 64) + 18;
    // 带电音箱：周期性通电，全身带红电刺，盲目下砸会吃反伤，用冲锋破电。
    if (m.kind === 'amp' && (this.half > 0 || this.songT > this.plan.introEnd + 15)) {
      m.thorns = Math.max(0, (m.thorns ?? 0) - dt);
      m.thornsCd = (m.thornsCd ?? (3 + g.random() * 5)) - dt;
      if (m.thorns <= 0 && m.thornsCd <= 0 && dist < 380 && !f.stun && !f.knocked) {
        let active = 0;
        for (const x of g.fighters) if ((x.mob?.thorns ?? 0) > 0 && x.hp > 0) active++;
        if (active < 2) {
          m.thorns = clamp(this.beatLen * 4, 2.2, 3.6);
          m.thornsCd = 7 + g.random() * 4;
          this.cue('zap', 0, false, .4);
          if (!this.seenP4.has('thorns')) {
            this.seenP4.add('thorns');
            g.text('带电音箱：冲锋破电，别直接砸！', f.x, f.y - 170, '#ff6fa8', 1.5, 21);
          }
        } else m.thornsCd = 2;
      }
    }
    f.ai.move = dist > m.gap ? dir : 0;
    if (this.frenzyT > 0 && f.ai.move !== 0) f.x = clamp(f.x + f.ai.move * m.speed * .42 * dt, X_MIN, X_MAX);
    if (m.atkCd > 0 || f.attack) return;
    // 主角在头顶（跳着、弹着）：够得着的人蹦起来抓一下——空中不是绝对安全区。
    const above = o.y < FLOOR - 40 && o.y > FLOOR - 230;
    if (above && dist < reach + 10 && f.y >= FLOOR - 1 && this.takeSwing()) {
      f.vy = -640;
      g.attack(f, 0);
      m.atkCd = 1.4 + g.random() * .8;
    } else if (dist < reach && !above && this.takeSwing() && g.canAttack(f, 0)) {
      g.attack(f, 0);
      m.atkCd = 1.2 + g.random() * .9;
    } else {
      m.gap = Math.max(40, m.gap - 14);
      m.atkCd = .4 + g.random() * .4;
    }
  }

  private stepMobShots(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const s of this.shots) {
      s.life -= dt;
      s.vy += GRAVITY * .9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += dt * 12;
      if (Math.abs(s.x - lead.x) < 28 && Math.abs(s.y - (lead.y - 80)) < 70) {
        hit(g, s.owner, lead, { ...SHOT_SKILL, damage: Math.round(3 * (1 + this.half * .3)) }, { hit: new Set() }, s.x);
        continue;
      }
      if (s.life > 0 && s.y < FLOOR + 10) this.shots[w++] = s;
    }
    this.shots.length = w;
  }

  /** 死掉的杂兵立刻移出 fighters，换成一张抛飞的残骸；掉星屑。 */
  private reap(g: FightGame, lead: Fighter): void {
    let i = g.fighters.length;
    while (i-- > 0) {
      const f = g.fighters[i];
      if (!f.mob || f.hp > 0) continue;
      const mob = f.mob;
      g.fighters.splice(i, 1);
      if (mob.lastKnock < 0) continue; // 黄牛溜了
      const dir = mob.lastDir || (f.x >= lead.x ? 1 : -1);
      const power = Math.max(260, mob.lastKnock);
      if (mob.elite) {
        this.chests.push(this.makeChest(g, f.x));
        this.slow(.16);
        this.shot(f.x, f.y - 100, 1.22, .6);
        if (this.grabbed?.by === f) this.grabbed = null;
        this.charge(ULT_ELITE);
        this.magnetAll(g);
        g.text('宝箱掉落！', f.x, f.y - 210, '#FDE979', 1, 24);
        g.sparks(f.x, f.y - 90, '#FDE979', 26, 1.4);
        g.shake = Math.max(g.shake, 9);
      } else if (g.random() < DROP[mob.kind] * TAGS[this.song.tag].dropRate * (this.fever >= 0 ? .5 : 1)) this.dropSupply(g, f.x, f.y - 60);
      this.debris.push({
        big: !!mob.elite,
        kind: mob.kind, x: f.x, y: Math.min(f.y, FLOOR - 4),
        vx: dir * (power * 2.1 + 180 + g.random() * 220), vy: -(380 + power * .9 + g.random() * 260),
        spin: mob.spin, vspin: dir * (9 + g.random() * 9), life: 1.15, bounced: false, depth: mob.depth, facing: f.facing,
      });
      if (this.debris.length > 90) this.debris.shift();
      this.kills++;
      this.streak++;
      this.cue('kill', this.streak, false, .045);
      this.streakTime = 1.6;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.charge(ULT_KILL);
      const xp = SPECS[mob.kind].xp + mob.stolen;
      if (mob.kind === 'scalper') for (let k = 0; k < 6; k++) this.dropGem(g, f.x, f.y - 50, Math.ceil(xp / 6));
      else this.dropGem(g, f.x, f.y - 40, xp);
      // 音箱怪：被不踩拍的轻击打死就原地炸，主角在旁边也挨一下；被重击 / 技能 / 踩拍打飞的，飞出去落地才炸，正好炸进人群里连锁。
      if (mob.kind === 'amp' && !mob.elite) {
        if (mob.light) {
          this.arms.blast(g, lead, this, f.x, f.y, 110, 30 + this.half * 10, 'amp', { lv: 1, evo: false }, 300);
          this.cue('pop', 0, false, .08);
          if (Math.abs(lead.x - f.x) < 105 && lead.y > FLOOR - 130) {
            this.hurtLead(g, Math.round(lead.data.hp * .045), f.x, false, '音箱爆炸', 260);
            if (!this.ampWarned) { this.ampWarned = true; g.text('音箱怪：用重击或踩拍把它打飞！', lead.x, lead.y - 240, '#c9b6ff', 1.6, 20); }
          }
        } else this.debris[this.debris.length - 1].bomb = 60 + this.half * 20;
      }
    }
  }

  private stepDebris(g: FightGame, dt: number): void {
    const list = this.debris;
    let w = 0;
    for (const d of list) {
      // 被打飞的音箱怪：落地那一下炸开，炸进人群里；炸死的音箱怪也会被炸飞，再落地再炸——连锁。
      if (d.bomb && d.vy > 0 && d.y > FLOOR - 6) {
        const dmg = d.bomb;
        d.bomb = 0;
        d.life = Math.min(d.life, .15);
        this.arms.blast(g, this.lead, this, d.x, FLOOR - 20, 135, dmg, 'speaker', { lv: 2, evo: false }, 380);
        this.pulses.push({ k: 'boom', x: d.x, y: FLOOR - 40, t: 0, max: .45, color: '#c08bff' });
        g.sparks(d.x, FLOOR - 30, '#d7b8ff', 14, 1.1);
        g.shake = Math.max(g.shake, 5);
        this.cue('pop', 1, false, .06);
      }
      d.life -= dt;
      d.vy += GRAVITY * .85 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.spin += d.vspin * dt;
      if (d.y > FLOOR && !d.bounced) { d.y = FLOOR; d.vy *= -.32; d.vx *= .55; d.vspin *= .5; d.bounced = true; }
      const off = d.x < -160 || d.x > VIEW_W + 160 || d.y > FLOOR + 80;
      if (d.life > 0 && !off) list[w++] = d;
    }
    list.length = w;
  }

  /* ---- 星屑经验 ---- */

  private dropGem(g: FightGame, x: number, y: number, v: number): void {
    if (this.gems.length >= 220) { this.gems[Math.floor(g.random() * this.gems.length)].v += v; return; }
    this.gems.push({ x, y, vx: (g.random() - .5) * 220, vy: -220 - g.random() * 200, v, t: 0 });
  }

  private stepGems(g: FightGame, lead: Fighter, dt: number): void {
    const magnet = 150 + lvOf(this.build, 't:magnet') * 60;
    const lx = lead.x, ly = lead.y - 60;
    let w = 0;
    for (const gm of this.gems) {
      gm.t += dt;
      const dx = lx - gm.x, dy = ly - gm.y, d = Math.hypot(dx, dy);
      if (gm.t > .35 && (d < magnet || gm.t > 30)) {
        const sp = 520 + Math.max(0, 400 - d) * 2;
        gm.vx += (dx / (d || 1) * sp - gm.vx) * Math.min(1, dt * 9);
        gm.vy += (dy / (d || 1) * sp - gm.vy) * Math.min(1, dt * 9);
      } else {
        gm.vy += GRAVITY * .8 * dt;
        gm.vx *= 1 - dt * 2;
      }
      gm.x += gm.vx * dt;
      gm.y += gm.vy * dt;
      if (gm.y > FLOOR - 8 && gm.t <= 30) { gm.y = FLOOR - 8; gm.vy *= -.3; }
      if (d < 30 && gm.t > .35) { this.gainXp(g, gm.v); continue; }
      this.gems[w++] = gm;
    }
    this.gems.length = w;
  }

  private gainXp(g: FightGame, amount: number): void {
    const wasLv = this.level;
    this.xp += amount;
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level++;
      // 前两级很快（开局就有第一组卡）；3 级起大幅放缓、越往后越慢，封顶 XP_CAP：后期不至于打几下就掉一组卡。
      this.nextXp = this.level < 3 ? Math.round(this.nextXp * 1.18 + 5) : Math.min(XP_CAP, Math.round(this.nextXp * 1.45 + 10));
      this.pushUpgradeOffer(g);
    }
    if (this.level > wasLv && this.lead.hp > 0) {
      // 升级防偷袭震退：看上方悬停选卡时不至于被贴脸白咬一口，不暂停也不打断节奏。
      const lead = this.lead;
      lead.invuln = Math.max(lead.invuln, .45);
      for (const f of g.fighters) {
        if (!f.mob || f.hp <= 0 || f.mob.elite) continue;
        if (Math.abs(f.x - lead.x) < 175) {
          f.vx = (Math.sign(f.x - lead.x) || 1) * 320;
          f.stun = Math.max(f.stun, .28);
        }
      }
      this.pulses.push({ k: 'shield', x: lead.x, y: lead.y - 60, t: 0, max: .45, color: '#FDE979', n: 1 });
    }
  }

  /* ---- 出怪：按歌曲段落的强度曲线 + 副歌人潮 ---- */

  private spawn(g: FightGame, lead: Fighter, dt: number): void {
    let alive = 0, left = 0, right = 0;
    for (const f of g.fighters) {
      if (!f.mob || f.hp <= 0) continue;
      alive++;
      const d = f.x - lead.x;
      if (d < 0 && d > -130) left++; else if (d >= 0 && d < 130) right++;
    }
    const prof = TAGS[this.song.tag];
    const plan = this.plan, t = this.songT;
    const lvl = 1 + this.half * .45;
    const boss = this.activeBoss() ? .55 : 1;
    const elite = g.fighters.some(f => f.mob?.elite && f.hp > 0) ? .7 : 1;
    const big = this.feverBig;
    // FEVER：小怪 2–3 倍（最后一段副歌最多）。
    const fv = this.fever < 0 ? 1 : big ? 3 : 2.2;
    const inten = intensity(plan, t);
    const cap = Math.round(this.maxAlive * Math.min(1, (.55 + this.half * .2) * (this.fever >= 0 ? 1.7 : 1)));
    const target = Math.min(cap, Math.round((16 + this.songP * 54) * inten * prof.density * lvl * boss * elite * fv));
    // 出手节拍：强度越高、FEVER、被两侧夹住时越密（单次伤害不变）。
    const wrap = left >= 2 && right >= 2 ? 1.8 : 1;
    // pace：按半场基准时长拉齐；曲风之间拉平：近身小怪平均一下打多疼，出手就相应疏一点（保安多的歌不会比粉丝多的歌疼一倍）。
    let ws = 0, wd = 0;
    // 黄牛不打人：算进分母，黄牛多的歌其他人就打得勤一点。
    for (const k of ['fan', 'amp', 'guard', 'scalper'] as const) { ws += prof.mobs[k]; wd += prof.mobs[k] * SPECS[k].dmg; }
    const pace = Math.max(.85, Math.min(1.05, HALF_DUR / Math.max(40, this.song.dur))) / prof.hp * (6.2 / (wd / ws));
    this.swingRate = pace * (1.15 + inten * 1.7) * (this.fever < 0 ? 1 : big ? 1.9 : 1.5) * wrap * (1 + this.half * .15) * (this.frenzyT > 0 ? 1.35 : 1);

    this.trickleCd -= dt;
    if (this.trickleCd <= 0) {
      this.trickleCd = (this.fever >= 0 ? .15 : .3) + g.random() * .3;
      if (alive < target) {
        const n = Math.min(target - alive, 1 + Math.floor(g.random() * (this.fever >= 0 ? 5 : 3)));
        for (let k = 0; k < n; k++) this.spawnMob(g, lead, g.random() < .5 ? -1 : 1);
        alive += n;
      }
    }
    this.surgeCd -= dt;
    if (!this.surge && this.surgeCd <= 0 && !this.activeBoss()) {
      const ch = this.fever >= 0;
      this.surgeCd = (big ? 3.2 : ch ? 4 : 9) + g.random() * (ch ? 1.5 : 3);
      const size = Math.round((10 + this.songP * 30) * prof.surge * (big ? 2.2 : ch ? 1.6 : 1) * lvl);
      // 终盘浪潮：两侧同时涌上来包围。
      this.surge = { side: big ? 0 : g.random() < .5 ? -1 : 1, left: Math.min(big ? 72 : 48, size), gap: .04, cd: 0, flip: 1 };
      // 三成的人潮是方阵：一整块人挤在一起、同一个速度推过来，给冲锋和下砸当靶子。
      if (!big && g.random() < .3) { this.surge.gap = .012; this.squadNext = true; }
      if (big) g.text('包围！', lead.x, lead.y - 230, TAGS[this.song.tag].mood.f2, .8, 24);
    }
    if (this.surge) {
      const s = this.surge;
      s.cd -= dt;
      while (s.cd <= 0 && s.left > 0 && alive < cap) {
        const side = s.side === 0 ? (s.flip = -s.flip as 1 | -1) : s.side;
        const sm = this.spawnMob(g, lead, side);
        if (this.squadNext && sm.mob && sm.mob.kind !== 'glow') { sm.mob.squad = true; sm.data = { ...sm.data, speed: 118 }; sm.mob.gap = 30 + g.random() * 40; }
        alive++; s.left--; s.cd += s.gap;
      }
      if (s.left <= 0 || alive >= cap) { this.surge = null; this.squadNext = false; }
    }
  }

  private spawnMob(g: FightGame, lead: Fighter, side: -1 | 1, force?: MobKind): Fighter {
    const w = TAGS[this.song.tag].mobs;
    const kinds = Object.keys(w) as MobKind[];
    // 热身阶段只出粉丝，先爽一下再上花样。
    let kind: MobKind = force ?? 'fan';
    if (!force && !(this.half === 0 && this.songT < this.plan.introEnd)) {
      let r = g.random() * kinds.reduce((s, k) => s + w[k], 0);
      for (const k of kinds) { if ((r -= w[k]) <= 0) { kind = k; break; } }
    }
    const spec = SPECS[kind];
    // 小怪血量跟着主角等级一起涨：强化越多、怪越硬，后期才不会一碰就碎、站着连按就能压住。
    const lvl = (1 + this.half * .45 + this.songP * .5) * (1 + (this.level - 1) * .07);
    const data = mobData(kind, Math.round(spec.hp * lvl * TAGS[this.song.tag].hp), Math.round(spec.dmg * (1 + this.half * .25)));
    const id = g.nextFighterId();
    const x = side < 0 ? X_MIN + g.random() * 20 : X_MAX - g.random() * 20;
    const m = makeFighter(data, id, { x, facing: x >= lead.x ? -1 : 1, controller: null, energy: 0, team: 1 });
    m.mob = {
      kind, speed: spec.speed * (.85 + g.random() * .3), atkCd: .6 + g.random(), phase: g.random() * Math.PI * 2,
      gap: kind === 'glow' ? 230 + g.random() * 80 : 46 + g.random() * 70, depth: g.random(), spin: 0, lastDir: 0, lastKnock: 0,
      shield: 0, flee: 0, stolen: 0, throwCd: 1 + g.random() * 2,
    };
    // 保安 = 厚甲；粉丝里随进度混进一些带次数盾的。
    if (kind === 'guard') m.mob.armor = Math.round(30 * lvl);
    else if (kind === 'fan' && !force && (this.half > 0 || this.songT > this.plan.introEnd + 10) && g.random() < Math.min(.35, .06 + this.half * .07 + this.songP * .15)) { m.mob.pips = m.mob.pipMax = 2 + (this.half > 0 ? 1 : 0); }
    g.ensureStats(id);
    g.fighters.push(m);
    return m;
  }

  /* ---- 踩拍 ---- */

  private onPerfect(g: FightGame, lead: Fighter, serial: number): void {
    this.perfectSerial = serial;
    this.perfectAt = this.elapsed;
    this.pstreak++;
    this.charge(.2);
    this.pulses.push({ k: 'perfect', x: lead.x, y: FLOOR, t: 0, max: .45, color: heatColor(this.heat) });
    this.cue('perfect', this.pstreak);
    if (this.heat < HEAT_MAX && ++this.heatFill >= HEAT_STEP) {
      this.heatFill = 0;
      this.heat++;
      this.cue('heatUp', this.heat, true);
      g.sparks(lead.x, lead.y - 90, heatColor(this.heat), 14, 1);
    }
    // 踩点爆发：每次完美身边炸一圈。
    const pb = lvOf(this.build, 'n:beat');
    if (pb) this.arms.blast(g, lead, this, lead.x, lead.y, 130 + pb * 32, 16 + pb * 11, 'pop', { lv: pb, evo: false }, 300);
  }

  /** 音浪斩：每一下普攻往前甩一道声波（K 更远更重）；进化「轰鸣」前后两道、更长。 */
  private waveSlash(g: FightGame, lead: Fighter, heavy: boolean): void {
    const lv = lvOf(this.build, 'n:wave');
    if (!lv) return;
    const evo = this.build.evo.has('e:normal');
    const range = (150 + lv * 36) * (heavy ? 1.3 : 1) * (evo ? 1.7 : 1) * (lead.musouRangeMul ?? 1);
    const dmg = (9 + lv * 6) * (heavy ? 1.5 : 1) * (evo ? 1.4 : 1);
    const dirs: (1 | -1)[] = evo ? [lead.facing, -lead.facing as 1 | -1] : [lead.facing];
    for (const d of dirs) {
      this.arms.fx.push({ k: 'wave', x: lead.x, y: lead.y - 60, r: range, dir: d, life: .32, max: .32, lv, evo });
      for (const f of g.fighters) {
        if (f.team === lead.team || f.hp <= 0) continue;
        const dx = (f.x - lead.x) * d;
        if (dx < -10 || dx > range || Math.abs(f.y - lead.y) > 140) continue;
        this.strike(g, f, dmg, { dir: d, knock: heavy ? 300 : 220 });
      }
    }
  }

  /* ---- 群体威胁：围堵圈、横幅冲锋 ---- */

  private startThreat(g: FightGame, lead: Fighter, kind: ThreatKind): void {
    const first = !this.seenThreat.has(kind);
    this.seenThreat.add(kind);
    this.cue('warn');
    if (kind === 'ring') {
      const cx = clamp(lead.x, X_MIN + 200, X_MAX - 200);
      const r: Ring = { cx, R: 300, t: 0, phase: 'form', left: [], right: [], tick: 0 };
      const per = 5 + Math.min(3, this.half);
      for (const side of [-1, 1] as const) for (let i = 0; i < per; i++) {
        const m = this.spawnMob(g, lead, side, 'fan');
        m.mob!.wall = side;
        m.data = { ...m.data, hp: Math.round(m.data.hp * 4) };
        m.hp = m.data.hp;
        m.mob!.depth = .2 + (i % 3) * .3;
        (side < 0 ? r.left : r.right).push(m);
      }
      this.ring = r;
      if (first) g.setBanner('围堵圈', '打穿一侧人墙 · 普攻要踩拍才打得动', 2);
      else g.text('围堵！', lead.x, lead.y - 230, '#ff6fa8', .9, 24);
    } else {
      const dir: 1 | -1 = lead.x < 480 ? -1 : 1;
      // 从离主角远的那头冲过来。
      const from: 1 | -1 = (-dir) as 1 | -1;
      this.charges.push({ dir: from, x: from > 0 ? X_MIN - 40 : X_MAX + 40, t: 0, phase: 'warn', hit: false, broken: -1, seed: Math.floor(g.random() * 1000) });
      if (first) g.setBanner('横幅冲锋', '跳过去、闪开，或用重击撕开横幅', 2);
      else g.text('冲锋！', lead.x, lead.y - 230, '#ffd23f', .9, 24);
    }
  }

  /** 给主角一下伤害（机关、挤压、冲锋）：借场上任意一个敌人当来源走原版受击，格挡、无敌照常算。 */
  private hurtLead(g: FightGame, dmg: number, x: number, heavy: boolean, name: string, knock = 220): void {
    const lead = this.lead;
    if (lead.hp <= 0) return;
    const src = g.fighters.find(f => f.team !== lead.team && f.hp > 0);
    if (src) hit(g, src, lead, { ...jab(dmg, 0), type: heavy ? 'heavy' : 'light', name, knock }, { hit: new Set() }, x);
    else if (!isInvulnerable(lead)) {
      lead.hp = Math.max(0, lead.hp - dmg);
      if (lead.hp <= 0) this.guardLethal(g, lead);
    }
  }

  /** 化解危机后的微量回血（严格控量 2%～4%，不溢出、倒地不回）。 */
  private healLead(g: FightGame, pct: number, x: number, y: number): void {
    const lead = this.lead;
    if (lead.hp <= 0 || lead.hp >= lead.data.hp) return;
    const add = Math.max(1, Math.round(lead.data.hp * pct));
    const actual = Math.min(lead.data.hp - lead.hp, add);
    if (actual <= 0) return;
    lead.hp += actual;
    g.text(`+${actual}`, x, y, '#6EE7B7', .85, 18);
    g.sparks(lead.x, lead.y - 80, '#6EE7B7', 8, .85);
  }

  private stepRing(g: FightGame, lead: Fighter, dt: number): void {
    const r = this.ring;
    if (!r) return;
    r.left = r.left.filter(f => f.hp > 0 && g.fighters.includes(f));
    r.right = r.right.filter(f => f.hp > 0 && g.fighters.includes(f));
    const end = (broke: boolean) => {
      for (const f of [...r.left, ...r.right]) if (f.mob) f.mob.wall = undefined;
      this.ring = null;
      if (broke) {
        this.cue('break', 0, true);
        this.charge(4);
        this.healLead(g, .03, lead.x, lead.y - 185);
        this.pulses.push({ k: 'break', x: lead.x, y: lead.y - 60, t: 0, max: .7, color: '#ff6fa8' });
        for (let i = 0; i < 10; i++) this.dropGem(g, lead.x, lead.y - 80, 2);
        g.text('破圈！', lead.x, lead.y - 220, '#ff6fa8', 1, 26);
        this.slow(.12);
        this.shot(lead.x, lead.y - 80, 1.15, .45);
      }
    };
    if (!r.left.length || !r.right.length) { end(true); return; }
    r.t += dt;
    if (r.phase === 'form') { if (r.t > 1.6) { r.phase = 'close'; r.t = 0; } }
    else r.R = Math.max(70, r.R - dt * (34 + this.half * 6));
    // 墙站好以后主角出不去（跳也翻不过）。
    if (r.phase === 'close') lead.x = clamp(lead.x, r.cx - r.R + 22, r.cx + r.R - 22);
    if (r.phase === 'close' && r.R < 130) {
      r.tick -= dt;
      if (r.tick <= 0) { r.tick = .5; this.hurtLead(g, Math.round(lead.data.hp * .02), r.cx, false, '挤压', 60); this.cue('squeeze', 0, false, .4); }
    }
    if (r.R <= 70) {
      // 收死：一次重挤压，圈散开变回普通人群。
      this.hurtLead(g, Math.round(lead.data.hp * .08), r.cx + (lead.x >= r.cx ? -1 : 1) * 30, true, '挤压', 320);
      g.shake = Math.max(g.shake, 10);
      end(false);
    }
  }

  private stepCharges(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    const a = lead.attack;
    for (const c of this.charges) {
      c.t += dt;
      if (c.broken >= 0) { c.broken += dt; if (c.broken < 1.2) this.charges[w++] = c; continue; }
      if (c.phase === 'warn') {
        // 冲锋队从街的一头走进画面、举起横幅。
        const stand = c.dir > 0 ? X_MIN + 180 : X_MAX - 180;
        c.x += (stand - c.x) * Math.min(1, dt * 5);
        if (c.t > 1.35) { c.phase = 'run'; c.t = 0; this.cue('rush'); }
      } else {
        c.x += c.dir * (640 + this.half * 60) * dt;
        // 撞上主角：在地上、没在无敌里就被撞飞。
        if (!c.hit && Math.abs(lead.x - c.x) < 70 && lead.y > FLOOR - 75 && lead.hp > 0) {
          c.hit = true;
          this.hurtLead(g, Math.round(lead.data.hp * .07), c.x - c.dir * 30, true, '横幅冲锋', 480);
        }
        // 顺路把挡道的杂兵撞开。
        for (const f of g.fighters) if (f.mob && f.hp > 0 && !f.mob.elite && !f.mob.wall && Math.abs(f.x - c.x) < 50 && f.y > FLOOR - 40) { f.vx = c.dir * 420; f.vy = -260; f.stun = Math.max(f.stun, .3); }
      }
      // 撕横幅：重击 / 技能，或踩拍的普攻，打到横幅所在的位置。
      if (a && a.t > (a.skill.start ?? 0) && (a.index >= 1 || this.perfectOn) && a.index !== 5) {
        const reach = Math.max(90, (a.skill.range ?? 80) * (lead.musouRangeMul ?? 1)) + 60;
        if (Math.abs(c.x - lead.x) < reach && (Math.sign(c.x - lead.x) === lead.facing || Math.abs(c.x - lead.x) < 70)) {
          c.broken = 0;
          this.cue('break', 1, true);
          this.charge(3);
          this.healLead(g, .025, c.x, FLOOR - 130);
          this.pulses.push({ k: 'break', x: c.x, y: FLOOR - 80, t: 0, max: .6, color: '#ffd23f' });
          g.sparks(c.x, FLOOR - 90, '#ffd23f', 22, 1.3);
          g.shake = Math.max(g.shake, 7);
          this.slow(.1);
          this.shot(c.x, FLOOR - 90, 1.15, .4);
          for (let i = 0; i < 5; i++) {
            const dir = (Math.sign(c.x - lead.x) || 1) as 1 | -1;
            this.debris.push({ kind: 'fan', x: c.x - c.dir * i * 34, y: FLOOR - 4, vx: dir * (420 + g.random() * 300), vy: -(520 + g.random() * 300), spin: 0, vspin: dir * 12, life: 1.1, bounced: false, depth: g.random(), facing: c.dir });
          }
          for (let i = 0; i < 8; i++) this.dropGem(g, c.x, FLOOR - 80, 2);
          this.kills += 5;
          this.charges[w++] = c;
          continue;
        }
      }
      if (c.phase === 'run' && (c.x < X_MIN - 220 || c.x > X_MAX + 220)) continue;
      this.charges[w++] = c;
    }
    this.charges.length = w;
  }

  /* ---- P3 机动：二段跳、下砸、冲锋、沸腾 ---- */

  private stepMoves(g: FightGame, lead: Fighter, dt: number): void {
    const grounded = lead.y >= FLOOR - .5 && lead.vy >= 0;
    this.landLag = Math.max(0, this.landLag - dt);
    if (grounded && !this.slam) { this.airJumped = false; if (!this.dash) this.slamChain = 0; }
    // 冲锋格子回复。
    if (this.dashCharges < DASH_CHARGES) {
      this.dashRegen += dt;
      if (this.dashRegen >= DASH_REGEN) { this.dashRegen = 0; this.dashCharges++; }
    } else this.dashRegen = 0;
    // 满热度：沸腾（移速 +25%、拖残影）。
    const boil = this.heat >= HEAT_MAX;
    if (boil !== this.boil) { this.boil = boil; if (boil) this.cue('heatUp', 6, true); }
    const want = boil ? .25 : 0;
    if (want !== this.boilApplied) { lead.moveMul += want - this.boilApplied; this.boilApplied = want; }
    this.ghostCd -= dt;
    const moving = Math.abs(lead.x - this.lastX) > .5;
    this.lastX = lead.x;
    if (this.ghostCd <= 0 && (((boil || this.grooveRank >= 5) && moving) || this.dash || this.slam?.phase === 'dive')) {
      this.ghostCd = this.dash ? .03 : .07;
      g.effect('ghost', lead.x, lead.y, boil ? heatColor(5) : lead.data.color, .26, { fighter: lead.id, alpha: .4 });
    }

    const d = this.dash;
    if (d) {
      d.t += dt;
      lead.x = clamp(lead.x + d.dir * DASH_SPEED * (this.boil ? 1.15 : 1) * dt, X_MIN, X_MAX);
      lead.vx = 0;
      // 沿途撞到的全部打飞（精英、人墙只吃伤害不飞）；撞带电音箱破电并炸开。
      for (const f of g.fighters) {
        if (f.team === lead.team || f.hp <= 0 || d.hit.has(f.id) || Math.abs(f.x - lead.x) > 46 || f.y < lead.y - 150) continue;
        d.hit.add(f.id);
        if (d.hit.size === 1) this.addGroove('dash', 11, 0);
        const thorned = (f.mob?.thorns ?? 0) > 0;
        if (thorned) f.mob!.thorns = 0;
        const dmg = (14 + this.level * 1.1) * (1 + this.heat * .08) * (thorned ? 2.5 : 1);
        this.strike(g, f, dmg, { dir: d.dir, knock: 420, up: 420, heavy: true });
        if (thorned) {
          this.arms.blast(g, lead, this, f.x, FLOOR - 30, 120, 35, 'pop', { lv: 1, evo: false }, 280);
          this.cue('pipBreak');
          g.text('破电！', f.x, f.y - 160, '#7fe7ff', .9, 22);
        }
        this.frameHits++;
        this.frameDir = d.dir;
      }
      this.hitGiants(g, lead.x, 30, 30);
      this.hitOrbs(g, lead.x, lead.y - 75, 58);
      this.hitBalls(g, lead, lead.x + d.dir * 20, lead.y - 75, 72, true, false, d.dir);
      if (d.t >= DASH_TIME) {
        if (d.hit.size >= 8) { this.cue('crowd', d.hit.size, false, .2); this.kick(d.dir * 10, 0); }
        this.dash = null;
        lead.vx = d.dir * 160;
      }
    }

    const sl = this.slam;
    if (!sl) return;
    sl.t += dt;
    if (lead.hp <= 0 || lead.stun > .2) { this.slam = null; return; }
    if (sl.phase === 'rise') {
      if (sl.t >= .07) { sl.phase = 'hang'; sl.t = 0; sl.y0 = lead.y; }
    } else if (sl.phase === 'hang') {
      lead.vy = 0;
      lead.y = sl.y0;
      if (sl.t >= .08) { sl.phase = 'dive'; sl.t = 0; this.cue('dash', 1); }
    } else {
      lead.vy = sl.heavy ? 1700 : 1300;
      lead.vx = 0;
      lead.invuln = Math.max(lead.invuln, .05);
      if (lead.y >= FLOOR - .5) this.slamImpact(g, lead, sl.heavy);
    }
  }
  private lastX = 0;

  /** 下砸落地：放射状光刺 + 冲击波；砸中就弹回空中（最多连 4 下），踩拍更大、弹得更高。 */
  private slamImpact(g: FightGame, lead: Fighter, heavy: boolean): void {
    this.slam = null;
    if (heavy) this.slamDrop(g, lead);
    const e = this.beatErr();
    const perfect = (e >= -PERFECT_EARLY && e <= PERFECT_LATE) || this.power?.kind === 'metro';
    const chain = heavy ? Math.min(SLAM_CHAIN, this.slamChain + 1) : 0;
    const R = (heavy ? 150 + chain * 18 : 100) * (perfect ? 1.2 : 1) * (lead.musouRangeMul ?? 1);
    const dmg = (heavy ? 26 + chain * 8 : 14) * (1 + this.level * .05) * (perfect ? 1.35 : 1);
    let hitN = 0;
    let hitThorns = false;
    for (const f of g.fighters) {
      if (f.team === lead.team || f.hp <= 0) continue;
      const dx = f.x - lead.x;
      if (Math.abs(dx) > R || f.y < FLOOR - 160) continue;
      hitN++;
      if ((f.mob?.thorns ?? 0) > 0) {
        hitThorns = true;
        f.mob!.thorns = 0;
      }
      const dir = (Math.sign(dx) || lead.facing) as 1 | -1;
      // 重砸是一下大力（破厚甲）；轻砸算轻击。
      this.strike(g, f, dmg * (1 - Math.abs(dx) / R * .35), { dir, knock: heavy ? 360 : 220, up: heavy ? 480 : 300, heavy });
    }
    this.hitGiants(g, lead.x, R, dmg * 1.5);
    this.hitOrbs(g, lead.x, FLOOR - 70, R * .6);
    this.hitBalls(g, lead, lead.x, FLOOR - 65, R * .85, heavy, perfect);
    if (hitN > 0) this.addGroove('slam', heavy ? 13 : 9, perfect ? 4 : 0);
    this.frameHits += hitN;
    this.pulses.push({ k: 'impact', x: lead.x, y: FLOOR, t: 0, max: heavy ? 1.2 : .8, color: lead.data.color, n: chain, seed: Math.floor(g.random() * 1e6), big: heavy, perfect });
    this.cue(heavy ? 'slamHeavy' : 'slam', chain, false);
    if (perfect) this.onPerfect(g, lead, -2);
    this.kick(0, heavy ? 9 + chain * 2 : 5);
    g.shake = Math.max(g.shake, heavy ? 8 + chain * 1.5 : 4);
    g.hitstop = Math.max(g.hitstop, heavy ? .06 + chain * .01 : .03);
    g.effect('dust', lead.x, FLOOR, '#afa1c1', .35, { radius: heavy ? 50 : 30 });
    if (hitThorns) {
      // 盲目砸中带电音箱：清掉下冲无敌、断连弹、微弹起并吃反伤电击。
      lead.invuln = 0;
      this.hurtLead(g, Math.round(lead.data.hp * .05), lead.x, true, '带电反伤', 240);
      this.cue('zap');
      this.pulses.push({ k: 'zap', x: lead.x, y: FLOOR - 40, t: 0, max: .5, color: '#ff5a5a' });
      this.slamChain = 0;
      this.landLag = .22;
      lead.vy = -260;
      lead.y = FLOOR - 2;
      g.text('带电反伤！冲锋破电', lead.x, FLOOR - 230, '#ff5a5a', 1.2, 22);
      return;
    }
    if (hitN > 0 && heavy && chain >= SLAM_CHAIN) { this.slow(.1); this.shot(lead.x, FLOOR - 90, 1.12, .35); }
    // 连砸 3～4 下引雷：在预计落点锁一道追身灯架，逼留一格冲锋闪开。
    if (hitN > 0 && heavy && chain >= 3) {
      this.warns.push({ x: clamp(lead.x, X_MIN + 45, X_MAX - 45), t: 0, max: clamp(this.beatLen * 2, .95, 1.35), r: 84, dmg: Math.round(lead.data.hp * .06) });
      this.cue('warn');
      if (!this.seenP4.has('rigChain')) {
        this.seenP4.add('rigChain');
        g.text('连砸引雷！留冲锋躲灯架', lead.x, FLOOR - 230, '#ffc27a', 1.3, 22);
      }
    }
    // 砸中就弹起：弹到重砸线以上，接着砸；第 4 下封顶、不再弹。
    if (hitN > 0 && chain < SLAM_CHAIN) {
      this.slamChain = heavy ? chain : 1;
      lead.vy = -(SLAM_BOUNCE + (perfect ? 80 : 0));
      lead.y = FLOOR - 2;
      this.airJumped = false;
    } else { this.slamChain = 0; this.landLag = heavy ? .2 : .12; }
  }
  /** 下砸落地没弹起来：一小段收招硬直（不能出招、不能冲锋），落地是要付代价的。 */
  landLag = 0;

  /* ---- 回声（普攻的第二下） ---- */

  private stepEchoes(g: FightGame, dt: number): void {
    if (!this.echoes.length) return;
    const lead = this.lead;
    let w = 0;
    for (const e of this.echoes) {
      e.t -= dt;
      if (e.t > 0) { this.echoes[w++] = e; continue; }
      this.arms.fx.push({ k: 'wave', x: e.x, y: lead.y - 60, r: e.r, dir: e.dir, life: .22, max: .22, lv: 1, evo: false });
      for (const f of g.fighters) {
        if (f.team === lead.team || f.hp <= 0) continue;
        const dx = (f.x - e.x) * e.dir;
        if (dx < -20 || dx > e.r || Math.abs(f.y - lead.y) > 140) continue;
        this.strike(g, f, e.dmg, { dir: e.dir, knock: 120 });
      }
      if (--e.n > 0) { e.t = .1; this.echoes[w++] = e; }
    }
    this.echoes.length = w;
  }

  /* ---- 击飞撞人：飞出去的人（被打飞的活人、死了的残骸）撞到别人，把别人也撞飞 ---- */

  private bowlHit = new WeakMap<object, number>();
  private bowlMobs: Fighter[] = [];
  private stepBowling(g: FightGame): void {
    const mobs = this.bowlMobs;
    for (const f of g.fighters) if (f.mob && f.hp > 0 && !f.mob.elite && !f.mob.wall) mobs.push(f);
    if (!mobs.length) return;
    const bump = (src: object, x: number, y: number, vx: number, self?: Fighter) => {
      let n = this.bowlHit.get(src) ?? 0;
      if (n >= 3) return;
      for (const m of mobs) {
        if (m === self || m.hp <= 0 || m.knocked > 0 || Math.abs(m.x - x) > 34 || Math.abs((m.y - 50) - y) > 70) continue;
        const dir = (Math.sign(vx) || 1) as 1 | -1;
        this.strike(g, m, 10 + this.half * 4 + this.level * .5, { dir, knock: 300, up: 340 });
        m.knocked = Math.max(m.knocked, .4);
        if (n === 0) this.cue('bowl', 0, false, .06);
        if (++n >= 3) break;
      }
      if (n > 0) this.bowlHit.set(src, n);
    };
    for (const d of this.debris) if (Math.abs(d.vx) > 380 && !d.bounced) bump(d, d.x, d.y - 40, d.vx);
    for (const f of mobs) if (f.hp > 0 && f.knocked > 0 && f.y < FLOOR - 20 && Math.abs(f.vx) > 360) bump(f, f.x, f.y - 50, f.vx, f);
    mobs.length = 0;
  }

  /* ---- 应援团长：后排挥旗，给身边的人加次数盾 ---- */

  private spawnCaptain(g: FightGame, lead: Fighter): void {
    const side = (lead.x < 480 ? 1 : -1) as 1 | -1;
    const m = this.spawnMob(g, lead, side, 'glow');
    m.data = { ...m.data, hp: Math.round(m.data.hp * 5) };
    m.hp = m.data.hp;
    m.mob!.captain = { cd: 1.2 };
    m.mob!.gap = 300;
    m.mob!.depth = 0;
    m.mob!.throwCd = 99;
    // 团长身边先带一队粉丝。
    for (let i = 0; i < 8; i++) { const f = this.spawnMob(g, lead, side, 'fan'); f.mob!.squad = true; f.data = { ...f.data, speed: 120 }; }
    g.text('应援团长', m.x, m.y - 210, '#9ff3ff', 1.2, 22);
  }

  private stepCaptains(g: FightGame, dt: number): void {
    for (const c of g.fighters) {
      const cap = c.mob?.captain;
      if (!cap || c.hp <= 0) continue;
      cap.cd -= dt;
      if (cap.cd > 0) continue;
      cap.cd = 3.6;
      let n = 0;
      for (const f of g.fighters) {
        if (!f.mob || f === c || f.hp <= 0 || f.mob.elite || Math.abs(f.x - c.x) > 260) continue;
        f.mob.pips = f.mob.pipMax = 3;
        n++;
      }
      if (n) { this.pulses.push({ k: 'shield', x: c.x, y: c.y - 60, t: 0, max: .6, color: '#9ff3ff', n: 2 }); this.cue('shieldUp', 0, false, .5); }
    }
  }

  /* ---- 稀有道具 ---- */

  private dropRare(g: FightGame, x: number, y: number, kind?: RareKind): void {
    const kinds: RareKind[] = ['tri', 'fire', 'cymbal', 'metro'];
    const k = kind ?? kinds[Math.floor(g.random() * kinds.length)];
    this.rares.push({ kind: k, x: clamp(x, X_MIN + 30, X_MAX - 30), y, vy: -320, t: 0, life: 16 });
  }

  private stepRares(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const r of this.rares) {
      r.t += dt;
      r.life -= dt;
      const lift = this.lifts.find(l => Math.abs(l.x - r.x) < l.r);
      const ground = FLOOR - 40 - (lift ? liftH(lift) : 0);
      if (r.y < ground || r.vy < 0) { r.vy += GRAVITY * .6 * dt; r.y = Math.min(ground, r.y + r.vy * dt); if (r.y >= ground) r.vy = 0; }
      else r.y = ground;
      if (r.life <= 0) continue;
      if (r.t > .3 && Math.abs(lead.x - r.x) < 44 && Math.abs((lead.y - 60) - r.y) < 110 && lead.hp > 0) {
        this.power = { kind: r.kind, t: RARE_TIME };
        this.powerCd = 0;
        this.cue('rare', ['tri', 'fire', 'cymbal', 'metro'].indexOf(r.kind), true);
        this.pulses.push({ k: 'break', x: lead.x, y: lead.y - 70, t: 0, max: .6, color: RARE_COLOR[r.kind] });
        this.shot(lead.x, lead.y - 90, 1.1, .3);
        g.text(RARE_NAME[r.kind], lead.x, lead.y - 230, RARE_COLOR[r.kind], 1.2, 26);
        continue;
      }
      this.rares[w++] = r;
    }
    this.rares.length = w;
  }

  private stepPower(g: FightGame, lead: Fighter, dt: number): void {
    const p = this.power;
    // 投射物照常飞完（形态结束后也是）。
    let w = 0;
    for (const s of this.rshots) {
      s.life -= dt;
      s.spin += dt * 10;
      if (s.k === 'fire') s.vy += GRAVITY * .7 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      let dead = s.life <= 0;
      if (s.k === 'fire' && (s.y >= FLOOR - 10 || dead)) {
        // 烟花：落地（或到时）炸开。
        this.arms.blast(g, lead, this, s.x, FLOOR - 30, 120, s.dmg, 'pop', { lv: 2, evo: true }, 320);
        this.pulses.push({ k: 'boom', x: s.x, y: FLOOR - 60, t: 0, max: .45, color: ['#ffb347', '#ff6fa8', '#7fe7ff', '#FDE979'][Math.floor(s.spin * 7) % 4] });
        this.cue('pop', 1, false, .07);
        continue;
      }
      if (s.k === 'tri') {
        for (const f of g.fighters) {
          if (f.team === lead.team || f.hp <= 0 || s.hit.has(f.id)) continue;
          if (Math.abs(f.x - s.x) > 30 || Math.abs((f.y - (f.mob ? 45 : 85)) - s.y) > 50) continue;
          s.hit.add(f.id);
          this.strike(g, f, s.dmg, { dir: Math.sign(s.vx) || 1, knock: 140 });
          if (s.hit.size >= 3) { dead = true; break; }
        }
        this.hitGiants(g, s.x, 0, s.dmg * .3);
        this.hitLaserNodes(g, s.x, s.y, 28, s.dmg * .5);
        this.hitOrbs(g, s.x, s.y, 28);
      }
      if (!dead && s.x > -100 && s.x < VIEW_W + 100) this.rshots[w++] = s;
    }
    this.rshots.length = w;
    if (!p) return;
    p.t -= dt;
    if (p.t <= 0) { this.power = null; this.cue('rareEnd'); return; }
    this.powerCd -= dt;
    const lvl = 1 + this.level * .06;
    if (p.kind === 'tri' && this.powerCd <= 0) {
      // 三角铁弹幕：绕身一圈不停转着发三角子弹。
      this.powerCd = .06;
      const a = this.elapsed * 7;
      for (const off of [0, Math.PI]) {
        const ang = a + off;
        this.rshots.push({ k: 'tri', x: lead.x, y: lead.y - 80, vx: Math.cos(ang) * 560, vy: Math.sin(ang) * 380, life: .9, dmg: 12 * lvl, hit: new Set(), spin: ang });
      }
    } else if (p.kind === 'fire' && this.powerCd <= 0) {
      // 烟花筒：往面朝的方向一发接一发抛烟花，落地炸开。
      this.powerCd = .38;
      this.rshots.push({ k: 'fire', x: lead.x + lead.facing * 20, y: lead.y - 110, vx: lead.facing * (380 + g.random() * 220), vy: -520 - g.random() * 120, life: 1.4, dmg: 42 * lvl, hit: new Set(), spin: this.elapsed });
      this.cue('pop', 0, false, .3);
    } else if (p.kind === 'cymbal') {
      // 镲片回旋：两片镲绕身转，碰到就砍；半径一呼一吸。
      const R = 110 + Math.sin(this.elapsed * 3) * 50;
      for (let i = 0; i < 2; i++) {
        const ang = this.elapsed * 7 + i * Math.PI;
        const cx = lead.x + Math.cos(ang) * R, cy = lead.y - 70 + Math.sin(ang) * R * .45;
        for (const f of g.fighters) {
          if (f.team === lead.team || f.hp <= 0) continue;
          if (Math.abs(f.x - cx) > 40 || Math.abs((f.y - (f.mob ? 45 : 85)) - cy) > 60) continue;
          const last = this.cymbalHit.get(f) ?? [-9, -9];
          if (last[i] > this.elapsed - .25) continue;
          last[i] = this.elapsed;
          this.cymbalHit.set(f, last);
          this.strike(g, f, 16 * lvl, { dir: Math.sign(f.x - lead.x) || 1, knock: 260, up: 220 });
        }
        this.hitGiants(g, cx, 0, 2 * lvl);
        this.hitLaserNodes(g, cx, cy, 42, 8 * lvl);
        this.hitOrbs(g, cx, cy, 42);
      }
    }
  }
  private cymbalHit = new WeakMap<Fighter, [number, number]>();

  /* ---- 啸叫扩音塔（升级巨型障碍物：每 2 拍狂暴波，8 拍未拆全屏震爆） ---- */

  spawnGiant(g: FightGame, lead: Fighter): Giant {
    const kind: Giant['kind'] = g.random() < .7 ? 'tower' : this.song.tag === 'cute' ? 'balloon' : 'board';
    const x = clamp(lead.x + lead.facing * (200 + g.random() * 120), X_MIN + 90, X_MAX - 90);
    const max = Math.round(980 * (1 + this.half * .55) * (1 + this.level * .04));
    const lifeMax = clamp(this.beatLen * 8, 5.5, 9.0);
    const pulseCd = clamp(this.beatLen * 2, 1.2, 2.2);
    const gi: Giant = { kind, x, t: 0, phase: 'warn', hp: max, max, life: lifeMax, lifeMax, flash: 0, pulseCd };
    this.giants.push(gi);
    this.cue('warn');
    g.setBanner(kind === 'tower' ? '啸叫扩音塔' : '过载障碍物', '8 拍内打爆反向清屏 · 超时全屏震爆', 1.7);
    return gi;
  }

  /** 普攻、技能打到巨型障碍物（每一招一次）。 */
  private hitGiantsByAttack(g: FightGame, lead: Fighter, a: NonNullable<Fighter['attack']>): void {
    if (!this.giants.length) return;
    const reach = Math.max(100, (a.skill.range ?? 90) * (lead.musouRangeMul ?? 1)) + 70;
    const dmg = Math.max(12, (a.skill.damage ?? 20)) * lead.dmgMul * (a.index === 5 ? 3 : a.index >= 2 ? 1.6 : 1) * (this.perfectOn ? 1.35 : 1);
    for (const gi of this.giants) {
      if (gi.phase !== 'stand') continue;
      const dx = gi.x - lead.x;
      if (Math.abs(dx) < reach && (Math.sign(dx) === lead.facing || Math.abs(dx) < 80)) this.damageGiant(g, gi, dmg);
    }
  }

  /** 范围伤害打到巨型障碍物（下砸、冲锋、爆炸、三角子弹）。 */
  hitGiants(g: FightGame, x: number, r: number, dmg: number): void {
    for (const gi of this.giants) if (gi.phase === 'stand' && Math.abs(gi.x - x) < r + 70) this.damageGiant(g, gi, dmg);
  }
  blastAt(g: FightGame, x: number, r: number, dmg: number): void {
    if (this.giants.length) this.hitGiants(g, x, r, dmg * .5);
    if (this.lasers.length) this.hitLaserNodes(g, x, FLOOR - 90, r + 40, dmg * .5);
    if (this.orbs.length) this.hitOrbs(g, x, FLOOR - 90, r + 40);
  }

  private damageGiant(g: FightGame, gi: Giant, dmg: number): void {
    gi.hp -= dmg;
    gi.flash = .12;
    this.popDmg(gi.x, FLOOR - 150, dmg, 'break');
    if (gi.hp > 0) { this.cue('armor', 1, false, .08); return; }
    gi.phase = 'broken';
    gi.t = 0;
    this.frenzyT = 0;
    // 打爆：反向过载清屏 + 大把星屑 + 回 15% 大招槽 + 四成半概率掉稀有道具。
    for (let i = 0; i < 34; i++) this.dropGem(g, gi.x + (g.random() - .5) * 60, FLOOR - 160, 3 + this.half);
    this.magnetAll(g, true);
    if (g.random() < .45) this.dropRare(g, gi.x, FLOOR - 200);
    this.charge(15);
    this.healLead(g, .04, gi.x, FLOOR - 210);
    this.pulses.push({ k: 'boom', x: gi.x, y: FLOOR - 120, t: 0, max: .85, color: '#FDE979' });
    g.sparks(gi.x, FLOOR - 140, '#ffffff', 30, 1.6);
    g.shake = Math.max(g.shake, 12);
    this.cue('giantBreak', 0, true);
    this.slow(.14);
    this.shot(gi.x, FLOOR - 140, 1.18, .55);
    g.text('拆塔反杀！大招 +15%', gi.x, FLOOR - 240, '#FDE979', 1.3, 24);
    for (const f of g.fighters) if (f.mob && f.hp > 0 && Math.abs(f.x - gi.x) < 480) this.strike(g, f, 120 + this.half * 30, { dir: Math.sign(f.x - gi.x) || 1, knock: 480, up: 500, heavy: true });
  }

  private stepGiants(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const gi of this.giants) {
      gi.t += dt;
      gi.flash = Math.max(0, gi.flash - dt);
      if (gi.phase === 'warn' && gi.t >= 1.15) {
        // 砸下来：阴影里的人都挨一下。
        gi.phase = 'stand';
        gi.t = 0;
        this.cue('giantLand', 0, true);
        g.shake = Math.max(g.shake, 12);
        this.kick(0, 10);
        g.effect('dust', gi.x, FLOOR, '#afa1c1', .5, { radius: 90 });
        if (Math.abs(lead.x - gi.x) < 95 && lead.hp > 0) this.hurtLead(g, Math.round(lead.data.hp * .07), gi.x, true, '砸落', 420);
        for (const f of g.fighters) if (f.mob && f.hp > 0 && Math.abs(f.x - gi.x) < 110) { f.mob.lastDir = Math.sign(f.x - gi.x) || 1; f.mob.lastKnock = 380; f.hp = 0; }
      } else if (gi.phase === 'stand') {
        gi.life -= dt;
        gi.pulseCd -= dt;
        if (gi.pulseCd <= 0) {
          gi.pulseCd = clamp(this.beatLen * 2, 1.2, 2.2);
          this.frenzyT = Math.max(this.frenzyT, 2.3);
          this.pulses.push({ k: 'feedback', x: gi.x, y: FLOOR - 140, t: 0, max: .7, color: '#ff5a5a' });
          this.cue('feedback', 0, false, .5);
        }
        // 立着的障碍物挡住小怪（推到两边）。
        for (const f of g.fighters) if (f.mob && f.hp > 0 && Math.abs(f.x - gi.x) < 60) f.x = gi.x + (f.x < gi.x ? -60 : 60);
        if (gi.life <= 0) {
          // 超时未拆：啸叫全屏震爆（扣血 + 掉两档热度）。
          gi.phase = 'blown';
          gi.t = 0;
          this.pulses.push({ k: 'boom', x: gi.x, y: FLOOR - 130, t: 0, max: .9, color: '#ff3b5c' });
          g.shake = Math.max(g.shake, 14);
          this.cue('giantLand');
          if (this.heat > 0) {
            this.heat = Math.max(0, this.heat - 2);
            this.heatFill = 0;
            this.pstreak = 0;
            this.cue('heatDown', this.heat);
          }
          this.hurtLead(g, Math.round(lead.data.hp * .08), gi.x, true, '啸叫过载', 280);
          g.text('啸叫过载！热度 -2', gi.x, FLOOR - 250, '#ff5a5a', 1.4, 24);
        }
      } else if ((gi.phase === 'gone' || gi.phase === 'broken' || gi.phase === 'blown') && gi.t > 1) continue;
      this.giants[w++] = gi;
    }
    this.giants.length = w;
  }

  /* ---- 高空激光灯网（4 拍封空，地面安全，打爆灯箱反杀） ---- */

  spawnLaserNet(g: FightGame, lead: Fighter): LaserNet {
    const ys = this.half === 0 ? [FLOOR - 155, FLOOR - 230] : [FLOOR - 145, FLOOR - 210, FLOOR - 275];
    const max = Math.round(90 * (1 + this.half * .45));
    const net: LaserNet = {
      ys,
      nodes: [
        { x: X_MIN + 44, y: ys[0], hp: max, max, flash: 0, dead: false },
        { x: X_MAX - 44, y: ys[0], hp: max, max, flash: 0, dead: false },
      ],
      phase: 'warn', t: 0,
      warnDur: clamp(this.beatLen * 3, 1.2, 2.0),
      fireDur: clamp(this.beatLen * 2, .95, 1.4),
      hitCd: 0, tick: -1,
    };
    this.lasers.push(net);
    this.cue('warn');
    if (!this.seenP4.has('laser')) {
      this.seenP4.add('laser');
      g.setBanner('高空激光网', '地面完全安全 · 打爆高空灯箱可反杀', 1.8);
    } else g.text('高空封锁！', lead.x, lead.y - 235, '#ff5aa5', .9, 24);
    return net;
  }

  hitLaserNodes(g: FightGame, x: number, y: number, r: number, dmg: number): void {
    for (const net of this.lasers) {
      if (net.phase === 'clear') continue;
      for (const nd of net.nodes) {
        if (nd.dead || Math.abs(nd.x - x) > r + 42 || Math.abs(nd.y - y) > r + 52) continue;
        nd.hp -= dmg;
        nd.flash = .12;
        if (nd.hp > 0) { this.cue('armor', 1, false, .08); continue; }
        nd.dead = true;
        net.phase = 'clear';
        net.t = 0;
        for (const f of g.fighters) if (f.mob && f.hp > 0) this.strike(g, f, 85 + this.half * 25, { dir: Math.sign(f.x - nd.x) || 1, up: 420, knock: 340, heavy: true });
        for (let i = 0; i < 12; i++) this.dropGem(g, 80 + i * 72, FLOOR - 180, 2);
        this.magnetAll(g, true);
        this.charge(6);
        this.healLead(g, .03, nd.x, nd.y - 55);
        this.slow(.1);
        this.cue('giantBreak', 0, true);
        g.shake = Math.max(g.shake, 9);
        g.sparks(nd.x, nd.y, '#7fe7ff', 24, 1.4);
        g.text('灯箱过载反杀！', nd.x, nd.y - 30, '#7fe7ff', 1.2, 24);
        break;
      }
    }
  }

  private stepLasers(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const net of this.lasers) {
      net.t += dt;
      net.hitCd = Math.max(0, net.hitCd - dt);
      for (const nd of net.nodes) nd.flash = Math.max(0, nd.flash - dt);
      if (net.phase === 'warn') {
        const tk = Math.floor(net.t / (net.warnDur / 3));
        if (tk > net.tick && tk < 3) { net.tick = tk; this.cue('tick', tk); }
        if (net.t >= net.warnDur) {
          net.phase = 'fire';
          net.t = 0;
          this.cue('laser');
          g.shake = Math.max(g.shake, 4);
        }
      } else if (net.phase === 'fire') {
        if (net.hitCd <= 0 && lead.hp > 0 && !isInvulnerable(lead) && net.ys.some(ly => Math.abs((lead.y - 65) - ly) < 38)) {
          net.hitCd = .55;
          this.slam = null;
          lead.vy = Math.max(lead.vy, 360);
          this.hurtLead(g, Math.round(lead.data.hp * (.055 + this.half * .015)), lead.x, true, '高空激光', 180);
          this.cue('zap');
          g.sparks(lead.x, lead.y - 70, '#ff6fa8', 16, 1.1);
        }
        if (net.t >= net.fireDur) continue;
      } else if (net.t >= .45) continue;
      this.lasers[w++] = net;
    }
    this.lasers.length = w;
  }

  /* ---- 移动聚光灯死线（全场压暗，追光内增伤，离开超时遭暗影围攻） ---- */

  spawnSolo(g: FightGame, lead: Fighter): SpotlightSolo {
    const dir = lead.x < 480 ? 1 : -1;
    const s: SpotlightSolo = {
      x: clamp(lead.x, X_MIN + 180, X_MAX - 180),
      vx: dir * 105,
      r: 130,
      t: 0,
      dur: 7.2,
      outT: 0,
      drainCd: 0,
      inZone: true,
    };
    this.solo = s;
    this.cue('warn');
    if (!this.seenP4.has('solo')) {
      this.seenP4.add('solo');
      g.setBanner('聚光灯独奏', '追光内伤害 +30% · 离开超时会遭暗影围攻', 1.8);
    } else g.text('聚光灯！', lead.x, lead.y - 235, '#ffe9a8', 1, 24);
    return s;
  }

  private stepSolo(g: FightGame, lead: Fighter, dt: number): void {
    const s = this.solo;
    if (!s) {
      if (this.soloDmgApplied) { lead.dmgMul -= .3; this.soloDmgApplied = false; }
      return;
    }
    s.t += dt;
    s.x += s.vx * dt;
    if (s.x < X_MIN + 150) { s.x = X_MIN + 150; s.vx = Math.abs(s.vx); }
    else if (s.x > X_MAX - 150) { s.x = X_MAX - 150; s.vx = -Math.abs(s.vx); }
    const inside = lead.hp > 0 && Math.abs(lead.x - s.x) <= s.r + 12 && lead.y >= FLOOR - 235;
    s.inZone = inside;
    if (inside !== this.soloDmgApplied) {
      this.soloDmgApplied = inside;
      lead.dmgMul += inside ? .3 : -.3;
    }
    if (inside) {
      s.outT = Math.max(0, s.outT - dt * 2);
      s.drainCd = 0;
    } else {
      s.outT += dt;
      if (s.outT >= 1.2) {
        s.drainCd -= dt;
        if (s.drainCd <= 0) {
          s.drainCd = .68;
          if (this.heat > 0) {
            this.heat--;
            this.heatFill = 0;
            this.pstreak = 0;
            this.cue('heatDown', this.heat);
          }
          this.hurtLead(g, Math.round(lead.data.hp * .025), s.x, false, '失焦暗影', 120);
          const side = (lead.x < s.x ? -1 : 1) as -1 | 1;
          if (g.fighters.filter(f => f.mob).length < this.maxAlive) {
            const sh = this.spawnMob(g, lead, side, 'fan');
            sh.data = { ...sh.data, speed: Math.round(sh.data.speed * 1.4) };
          }
          g.text('回到追光内！', lead.x, lead.y - 220, '#ff6fa8', .85, 22);
        }
      }
    }
    if (s.t >= s.dur) {
      if (this.soloDmgApplied) { lead.dmgMul -= .3; this.soloDmgApplied = false; }
      if (s.outT < 1.2) {
        this.charge(8);
        this.healLead(g, .04, lead.x, lead.y - 195);
        this.cue('rare', 2, true);
        g.text('独奏完美！大招 +8%', lead.x, lead.y - 230, '#FDE979', 1.2, 24);
      }
      this.solo = null;
    }
  }

  /* ---- 天地异象（太阳变大等）：低概率 + 后半程更高权重 + 保底 ---- */

  /** 触发一次天地异象（也供控制台调试直接调用：`window.__mfGame().musou.triggerAnomaly(window.__mfGame(), 'sun')`）。 */
  triggerAnomaly(g: FightGame, kind: AnomalyKind = 'sun'): Anomaly {
    this.anomaly = { kind, phase: 'in', t: 0, dur: ANOMALY_HOLD, k: 0 };
    this.anomalyDoneSong = true;
    this.anomalySeenCount++;
    this.anomalyPity = 0;
    g.setBanner('天地异象 · 烈日', '灼热增幅 · 伤害 +12%', 1.9);
    this.cue('anomaly', 0, true);
    this.shot(this.lead.x, FLOOR - 140, .88, 1.5);
    return this.anomaly;
  }

  private stepAnomaly(g: FightGame, lead: Fighter, dt: number): void {
    const a = this.anomaly;
    if (a) {
      a.t += dt;
      if (a.phase === 'in') {
        a.k = Math.min(1, a.t / ANOMALY_IN);
        if (a.t >= ANOMALY_IN) { a.phase = 'hold'; a.t = 0; a.k = 1; }
      } else if (a.phase === 'hold') {
        a.k = 1;
        if (a.t >= a.dur) { a.phase = 'out'; a.t = 0; }
      } else {
        a.k = Math.max(0, 1 - a.t / ANOMALY_OUT);
        if (a.t >= ANOMALY_OUT) this.anomaly = null;
      }
    }
    const want = this.anomaly?.kind === 'sun' && this.anomaly.k > .15 ? ANOMALY_SUN_DMG : 0;
    if (want !== this.anomalyDmgApplied) {
      lead.dmgMul += want - this.anomalyDmgApplied;
      this.anomalyDmgApplied = want;
    }
    if (this.anomaly || this.anomalyDoneSong || this.phase !== 'play' || this.solo || this.activeBoss()) return;
    if (this.songT <= this.plan.introEnd + 6 || this.songT >= this.plan.bossAt - 10) return;
    this.anomalyCd -= dt;
    if (this.anomalyCd > 0) return;
    this.anomalyCd = 10 + g.random() * 4;
    const p = this.songP;
    let chance: number;
    if (this.anomalySeenCount === 0) {
      if (this.half >= 1 && (p >= .52 || this.anomalyPity >= 5)) chance = 1;
      else {
        const base = this.half === 0 ? (p >= .5 ? .18 : .06) : (p >= .45 ? .45 : .24);
        chance = Math.min(.95, base + this.anomalyPity * .06);
      }
    } else {
      chance = p >= .5 ? .18 : .08;
    }
    if (g.random() < chance) this.triggerAnomaly(g, 'sun');
    else this.anomalyPity++;
  }

  /* ---- 场景物理玩具：共鸣弹球 + 半空鼓点串 ---- */

  /** 扔出一颗共鸣弹球：砍/冲锋/下砸抽飞后在街壁间反弹撞飞沿途杂兵。 */
  spawnBall(lead: Fighter = this.lead): StageBall {
    const dir = (lead.facing || 1) as 1 | -1;
    const x = clamp(lead.x + dir * 230, X_MIN + 80, X_MAX - 80);
    const b: StageBall = { x, y: FLOOR - 220, vx: -dir * 75, vy: 0, r: 26, spin: 0, level: 0, life: 14, hitCd: 0, hit: new Set(), flash: 0, trail: [] };
    this.balls.push(b);
    this.pulses.push({ k: 'open', x: b.x, y: b.y, t: 0, max: .45, color: '#7fe7ff' });
    this.cue('ball', 0);
    return b;
  }

  /** 抽飞范围内的共鸣弹球（越抽越快越大、音效越爬越高）。 */
  hitBalls(g: FightGame, lead: Fighter, x: number, y: number, r: number, heavy: boolean, perfect: boolean, forceDir?: 1 | -1): void {
    for (const b of this.balls) {
      if (b.hitCd > 0 || Math.hypot(b.x - x, b.y - y) > r + b.r + 14) continue;
      const onBeat = perfect || this.power?.kind === 'metro';
      b.level = Math.min(5, b.level + (onBeat ? 2 : 1));
      b.r = 26 + b.level * 2.4;
      b.life = Math.max(b.life, 9.5);
      b.hitCd = .16;
      b.flash = .16;
      b.hit.clear();
      const dir = (forceDir ?? ((Math.abs(b.x - lead.x) > 18 ? Math.sign(b.x - lead.x) : lead.facing) || 1)) as 1 | -1;
      const speed = (580 + b.level * 125) * (heavy ? 1.12 : 1);
      b.vx = dir * speed;
      b.vy = -(heavy ? 320 : 230) - b.level * 22;
      this.cue('ball', b.level);
      this.kick(dir * (4 + b.level * 1.2), -1.5);
      this.addGroove('toy', 11, onBeat ? 4 : 0);
      if (onBeat) g.hitstop = Math.max(g.hitstop, .04);
      g.sparks(b.x, b.y, b.level >= 4 ? '#ff6fa8' : '#7fe7ff', 10 + b.level * 3, 1 + b.level * .1);
      if (b.level >= 2) g.text(b.level >= 5 ? 'MAX!' : `×${b.level}`, b.x, b.y - 44, b.level >= 5 ? '#ff6fa8' : '#FDE979', .65, b.level >= 5 ? 24 : 20);
    }
  }

  private stepBalls(g: FightGame, _lead: Fighter, dt: number): void {
    let w = 0;
    const damp = Math.pow(.992, dt * 60);
    for (const b of this.balls) {
      b.life -= dt;
      b.hitCd = Math.max(0, b.hitCd - dt);
      b.flash = Math.max(0, b.flash - dt);
      if (b.life <= 0) continue;
      b.vy += GRAVITY * .68 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= damp;
      b.spin += b.vx * dt * .035;
      if (b.y > FLOOR - b.r) {
        b.y = FLOOR - b.r;
        b.vy = Math.abs(b.vy) > 90 ? -b.vy * .72 : 0;
      }
      if (b.x < X_MIN + b.r) {
        b.x = X_MIN + b.r;
        b.vx = Math.abs(b.vx) * .92;
        b.vy = Math.min(b.vy, -190);
        b.hit.clear();
        this.cue('ball', -1, false, .08);
        g.sparks(b.x, b.y, '#7fe7ff', 8, .9);
      } else if (b.x > X_MAX - b.r) {
        b.x = X_MAX - b.r;
        b.vx = -Math.abs(b.vx) * .92;
        b.vy = Math.min(b.vy, -190);
        b.hit.clear();
        this.cue('ball', -1, false, .08);
        g.sparks(b.x, b.y, '#7fe7ff', 8, .9);
      }
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();
      if (Math.abs(b.vx) > 220 || b.level >= 1) {
        for (const f of g.fighters) {
          if (f.team === this.lead.team || f.hp <= 0 || b.hit.has(f.id)) continue;
          if (Math.abs(f.x - b.x) > b.r + 32 || Math.abs((f.y - (f.mob ? 48 : 85)) - b.y) > b.r + 56) continue;
          b.hit.add(f.id);
          const dir = (Math.sign(b.vx) || 1) as 1 | -1;
          const dmg = (24 + b.level * 16) * (1 + this.level * .06);
          this.strike(g, f, dmg, { dir, knock: 340 + b.level * 70, up: 350 + b.level * 45, heavy: b.level >= 2 });
          this.cue('bowl', 0, false, .05);
          if (b.level >= 4 && f.mob) this.charge(.25);
        }
        if (b.level >= 1) {
          this.hitGiants(g, b.x, b.r + 12, 16 + b.level * 12);
          this.hitOrbs(g, b.x, b.y, b.r + 14);
        }
      }
      this.balls[w++] = b;
    }
    this.balls.length = w;
  }

  /** 在半空铺出一串 4 格发光跳板（弧线/波浪/折返三种形态）。 */
  spawnPadChain(g: FightGame, lead: Fighter = this.lead): SkyPadChain {
    const dir = (lead.x < 480 ? 1 : -1) as 1 | -1;
    const patterns: readonly (readonly [number, number])[][] = [
      [[0, 115], [120, 170], [240, 200], [360, 150]],
      [[0, 110], [125, 155], [250, 115], [375, 175]],
      [[0, 115], [120, 165], [35, 205], [-85, 155]],
    ];
    const pat = patterns[Math.floor(g.random() * patterns.length)];
    let minOx = Infinity, maxOx = -Infinity;
    for (const [ox] of pat) {
      const s = ox * dir;
      if (s < minOx) minOx = s;
      if (s > maxOx) maxOx = s;
    }
    const x0 = clamp(lead.x + dir * 105, X_MIN + 95 - minOx, X_MAX - 95 - maxOx);
    const pads: SkyPad[] = pat.map(([ox, oy]) => ({
      x: x0 + ox * dir,
      y: FLOOR - oy,
      r: 28,
      hit: false,
      hitT: 0,
    }));
    const ch: SkyPadChain = { pads, next: 0, t: 0, life: 13, done: false, doneT: 0 };
    this.padChains.push(ch);
    this.cue('pad', 0);
    return ch;
  }

  private stepPadChains(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const ch of this.padChains) {
      ch.t += dt;
      for (const p of ch.pads) if (p.hit) p.hitT += dt;
      if (ch.done) {
        ch.doneT += dt;
        if (ch.doneT < .7) this.padChains[w++] = ch;
        continue;
      }
      ch.life -= dt;
      if (ch.life <= 0) continue;
      const cur = ch.pads[ch.next];
      if (cur && lead.hp > 0 && !this.grabbed && Math.hypot(lead.x - cur.x, (lead.y - 72) - cur.y) < cur.r + 46) {
        cur.hit = true;
        cur.hitT = 0;
        this.slam = null;
        this.landLag = 0;
        this.airJumped = false;
        this.dashCharges = Math.min(DASH_CHARGES, this.dashCharges + 1);
        const idx = ch.next++;
        const last = ch.next >= ch.pads.length;
        this.cue('pad', last ? 3 : idx);
        this.addGroove('toy', last ? 15 : 8, 0);
        lead.vy = last ? -640 : -580;
        if (!last) {
          const nx = ch.pads[ch.next];
          const nd = Math.sign(nx.x - lead.x);
          if (nd) lead.vx = nd * 220;
        }
        this.pulses.push({ k: 'open', x: cur.x, y: cur.y, t: 0, max: .42, color: last ? '#FDE979' : '#7fe7ff' });
        g.sparks(cur.x, cur.y, last ? '#FDE979' : '#ff6fa8', last ? 26 : 12, last ? 1.4 : 1);
        const blastR = last ? 390 : 140;
        const blastDmg = (last ? 95 : 32) * (1 + this.half * .3 + this.level * .04);
        for (const f of g.fighters) {
          if (f.team === lead.team || f.hp <= 0 || Math.abs(f.x - cur.x) >= blastR) continue;
          this.strike(g, f, blastDmg, { dir: Math.sign(f.x - cur.x) || 1, up: last ? 460 : 300, knock: last ? 400 : 240, heavy: last });
        }
        if (last) {
          for (let k = 0; k < 12; k++) this.dropGem(g, cur.x + (g.random() - .5) * 90, cur.y, 2);
          this.charge(5);
          this.slow(.08);
          this.kick(0, 7);
          g.shake = Math.max(g.shake, 9);
          g.text('FULL CHAIN!', cur.x, cur.y - 44, '#FDE979', 1.0, 24);
          ch.done = true;
          ch.doneT = 0;
        }
      }
      this.padChains[w++] = ch;
    }
    this.padChains.length = w;
  }

  private stepToySpawner(g: FightGame, lead: Fighter, dt: number): void {
    if (this.phase !== 'play' || this.solo || this.activeBoss()) return;
    if (this.songT <= this.plan.introEnd + 4 || this.songT >= this.plan.bossAt - 8) return;
    this.toyCd -= dt;
    if (this.toyCd <= 0 && !this.balls.length && !this.padChains.length) {
      this.toyCd = 11 + g.random() * 4;
      if (this.toyFlip++ % 2 === 0) this.spawnBall(lead);
      else this.spawnPadChain(g, lead);
    }
  }

  /* ---- 动态黑胶评分（防复读换招连段评分） ---- */

  private syncGrooveRank(): number {
    let r = 0;
    for (let i = GROOVE_RANKS.length - 1; i >= 0; i--) {
      if (this.groove >= GROOVE_RANKS[i]) { r = i; break; }
    }
    this.grooveRank = r;
    return r;
  }

  /** 按动作大类累积黑胶评分：换招给满额并切出新彩色音轨，连续复读迅速衰减并在 3 次起停涨且触发卡碟。 */
  addGroove(kind: GrooveMove, base: number, bonus = 0): void {
    const last = this.grooveHist[this.grooveHist.length - 1];
    let mul: number;
    if (last === kind) {
      this.grooveRepeat++;
      mul = this.grooveRepeat === 1 ? .45 : this.grooveRepeat === 2 ? .15 : 0;
      if (this.grooveRepeat === 3) {
        this.grooveScratch = Math.max(this.grooveScratch, .28);
        this.cue('scratch', 0, false, 1.2);
      }
    } else {
      const fresh = !this.grooveHist.slice(-3).includes(kind);
      this.grooveRepeat = 0;
      mul = fresh ? 1.35 : 1;
      this.grooveTracks.push({ kind, t: 0, fresh });
      if (this.grooveTracks.length > 5) this.grooveTracks.shift();
      this.grooveNeedle = 1;
    }
    this.grooveHist.push(kind);
    if (this.grooveHist.length > 4) this.grooveHist.shift();
    const gain = base * mul + (mul > 0 ? bonus : bonus * .35);
    const oldRank = this.grooveRank;
    this.groove = clamp(this.groove + gain, 0, 100);
    const newRank = this.syncGrooveRank();
    if (newRank > oldRank) {
      this.groovePop = 1;
      this.cue('grooveUp', newRank, true);
    }
  }

  /** 调试用：直接设黑胶分值并同步档位（`g.musou.setGroove(95)` 预览 MAX/ENCORE）。 */
  setGroove(v: number): void {
    const old = this.grooveRank;
    this.groove = clamp(v, 0, 100);
    if (this.groove <= 0) {
      this.grooveRepeat = 0;
      this.grooveHist.length = 0;
      this.grooveTracks.length = 0;
    }
    const r = this.syncGrooveRank();
    if (r > old) this.groovePop = 1;
  }

  private stepGroove(dt: number): void {
    this.groovePop = Math.max(0, this.groovePop - dt * 2.8);
    this.grooveScratch = Math.max(0, this.grooveScratch - dt);
    this.grooveNeedle = Math.max(0, this.grooveNeedle - dt * 3.8);
    let tw = 0;
    for (const tr of this.grooveTracks) {
      tr.t += dt;
      if (tr.t < 4) this.grooveTracks[tw++] = tr;
    }
    this.grooveTracks.length = tw;
    if (this.phase !== 'shift' && this.groove > 0) {
      const decay = [1.4, 2.2, 3.0, 3.8, 4.6, 5.4][this.grooveRank] * (this.grooveRepeat >= 3 ? 1.6 : 1);
      this.groove = Math.max(0, this.groove - decay * dt);
      this.syncGrooveRank();
    }
  }

  /* ---- 空中高压电球（盲撞触电，冲锋/攻击打爆坠地清场） ---- */

  spawnSkyOrb(g: FightGame, lead: Fighter): SkyOrb {
    const side = (lead.x < 480 ? 1 : -1) as 1 | -1;
    const o: SkyOrb = {
      x: side > 0 ? X_MAX - 35 : X_MIN + 35,
      y: FLOOR - 155 - g.random() * 55,
      vx: -side * (58 + g.random() * 35),
      vy: 0,
      r: 26,
      hp: 1,
      t: 0,
      life: 12,
      phase: 'float',
    };
    this.orbs.push(o);
    if (!this.seenP4.has('orb')) {
      this.seenP4.add('orb');
      g.text('高压电球：冲锋或攻击打爆清场，别盲撞！', o.x, o.y - 36, '#FDE979', 1.6, 20);
    }
    return o;
  }

  hitOrbs(g: FightGame, x: number, y: number, r: number): void {
    for (const o of this.orbs) {
      if (o.phase !== 'float' || Math.hypot(o.x - x, o.y - y) > r + o.r + 18) continue;
      o.phase = 'fall';
      o.vy = 560;
      o.vx *= .2;
      this.cue('zap');
      g.sparks(o.x, o.y, '#FDE979', 12, 1);
    }
  }

  private stepOrbs(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const o of this.orbs) {
      o.t += dt;
      if (o.phase === 'float') {
        o.life -= dt;
        o.x += o.vx * dt;
        if (o.x < X_MIN + 30) { o.x = X_MIN + 30; o.vx = Math.abs(o.vx); }
        else if (o.x > X_MAX - 30) { o.x = X_MAX - 30; o.vx = -Math.abs(o.vx); }
        if (o.life <= 0) continue;
        // 无脑跳撞（非冲锋、非攻击、非下砸俯冲、非无敌）会触电。
        if (!this.dash && !lead.attack && this.slam?.phase !== 'dive' && !isInvulnerable(lead)
          && Math.abs(lead.x - o.x) < 38 && Math.abs((lead.y - 75) - o.y) < 58 && lead.hp > 0) {
          this.hurtLead(g, Math.round(lead.data.hp * .045), o.x, false, '高压电球', 180);
          lead.vy = Math.max(lead.vy, 280);
          this.cue('zap');
          g.sparks(o.x, o.y, '#FDE979', 16, 1.1);
          g.text('触电！', lead.x, lead.y - 210, '#FDE979', .9, 22);
          continue;
        }
      } else {
        o.vy += GRAVITY * .7 * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.y >= FLOOR - 12) {
          this.arms.blast(g, lead, this, o.x, FLOOR - 20, 230, 95 + this.half * 30, 'speaker', { lv: 3, evo: true }, 440);
          this.pulses.push({ k: 'zap', x: o.x, y: FLOOR - 30, t: 0, max: .65, color: '#FDE979' });
          this.charge(4);
          this.healLead(g, .025, o.x, FLOOR - 160);
          this.cue('pop', 1);
          g.shake = Math.max(g.shake, 9);
          g.sparks(o.x, FLOOR - 30, '#FDE979', 26, 1.4);
          g.text('电球清场！', o.x, FLOOR - 190, '#FDE979', 1.1, 24);
          continue;
        }
      }
      this.orbs[w++] = o;
    }
    this.orbs.length = w;
  }

  /* ---- 升降舞台 ---- */

  private spawnLift(g: FightGame, lead: Fighter): void {
    const x = clamp(lead.x + lead.facing * (150 + g.random() * 140), X_MIN + 110, X_MAX - 110);
    this.lifts.push({ x, r: 88, t: 0, phase: 'rise', up: 7 });
    if (g.random() < .65) this.dropRare(g, x, FLOOR - 200);
    this.cue('liftUp', 0, true);
    g.setBanner('升降舞台', '站上去小怪进不来 · 很快会下沉', 1.5);
  }

  private stepLifts(g: FightGame, _lead: Fighter, dt: number): void {
    let w = 0;
    for (const l of this.lifts) {
      l.t += dt;
      if (l.phase === 'rise' && l.t >= .5) { l.phase = 'up'; l.t = 0; }
      else if (l.phase === 'up' && l.t >= l.up) { l.phase = 'sink'; l.t = 0; this.cue('liftDown'); }
      else if (l.phase === 'sink' && l.t >= .6) continue;
      if (l.phase !== 'sink') {
        // 护栏光：小怪进不来（推到台边），飞进来的荧光棒也被挡掉。
        for (const f of g.fighters) if (f.mob && f.hp > 0 && !f.mob.elite && Math.abs(f.x - l.x) < l.r + 8) f.x = l.x + (f.x < l.x ? -(l.r + 10) : l.r + 10);
        for (const s of this.shots) if (Math.abs(s.x - l.x) < l.r) s.life = 0;
      }
      this.lifts[w++] = l;
    }
    this.lifts.length = w;
  }

  /** 大 / 小事件调度：每段主歌一个大事件（啸叫扩音塔 / 高空激光网 / 聚光灯死线 / 升降舞台 / 横幅冲锋，不连着重复），中间穿插小事件。 */
  private section(t: number): number { let n = 0; for (const c of this.plan.chorus) if (t >= c.e) n++; return n; }
  private pickEvent(g: FightGame, lead: Fighter, quiet: boolean): void {
    if (quiet) {
      if (this.airTime > 1.8 && !this.lasers.length && g.random() < .6) this.spawnLaserNet(g, lead);
      else this.startThreat(g, lead, 'charge');
      return;
    }
    const sec = this.section(this.songT) + this.half * 10;
    if (this.majorDone !== sec) {
      this.majorDone = sec;
      const pool = ['giant', 'laser', 'solo', 'lift', 'charge'].filter(k => k !== this.lastMajor && !(this.anomaly && k === 'solo'));
      const k = this.airTime > 2.0 && pool.includes('laser') && g.random() < .55 ? 'laser' : pool[Math.floor(g.random() * pool.length)];
      this.lastMajor = k;
      if (k === 'giant') this.spawnGiant(g, lead);
      else if (k === 'laser') this.spawnLaserNet(g, lead);
      else if (k === 'solo') this.spawnSolo(g, lead);
      else if (k === 'lift') this.spawnLift(g, lead);
      else this.startThreat(g, lead, 'charge');
      return;
    }
    const w = TAGS[this.song.tag].threats;
    const turn = this.minorTurn++ % 4;
    if (turn === 0) this.startThreat(g, lead, g.random() * (w.ring + w.charge) < w.ring ? 'ring' : 'charge');
    else if (turn === 1) this.spawnCaptain(g, lead);
    else if (turn === 2) this.spawnLaserNet(g, lead);
    else this.startThreat(g, lead, 'ring');
  }

  /* ---- 精英：大一圈、描边、血条；砸地前地面亮预警，打倒掉宝箱 ---- */

  private spawnElite(g: FightGame, lead: Fighter): void {
    const kind: MobKind = this.song.tag === 'hot' ? 'amp' : this.song.tag === 'cute' ? 'fan' : 'guard';
    const spec = SPECS[kind];
    const lvl = 1 + this.half * .5;
    const hp = Math.round(Math.max(620, spec.hp * 9) * lvl * TAGS[this.song.tag].hp);
    const id = g.nextFighterId();
    const side = lead.x < 480 ? 1 : -1;
    const x = side > 0 ? X_MAX - 30 : X_MIN + 30;
    const m = makeFighter(mobData(kind, hp, 0), id, { x, facing: side > 0 ? -1 : 1, controller: null, energy: 0, team: 1 });
    m.mob = {
      kind, speed: spec.speed * .75, atkCd: 1, phase: 0, gap: 60, depth: 1, spin: 0, lastDir: 0, lastKnock: 0,
      shield: 0, flee: 0, stolen: 0, throwCd: 9,
      elite: { windup: 0, max: .85, dir: side > 0 ? -1 : 1, cd: 1.6, reach: 165 },
    };
    g.ensureStats(id);
    g.fighters.push(m);
    this.shot(x, FLOOR - 110, 1.24, 1.05, { lb: true, name: ELITE_NAME[kind], sub: '精英 · 打倒掉落宝箱' });
    g.sparks(x, FLOOR - 110, '#FDE979', 22, 1.3);
  }

  private eliteThink(g: FightGame, f: Fighter, o: Fighter, dx: number, dist: number, dir: 1 | -1, dt: number): void {
    const e = f.mob!.elite!;
    e.cd = Math.max(0, e.cd - dt);
    // 霸体冲刺进行中：一路往前冲，撞到主角一下、撞开挡路的杂兵。
    if ((e.act ?? 0) > 0) {
      e.act = (e.act ?? 0) - dt;
      f.ai.move = 0;
      f.facing = e.dir;
      f.x = clamp(f.x + e.dir * 880 * dt, X_MIN, X_MAX);
      for (const m of g.fighters) if (m.mob && m !== f && m.hp > 0 && Math.abs(m.x - f.x) < 50) { m.vx = e.dir * 380; m.vy = -240; m.stun = Math.max(m.stun, .3); }
      if (Math.abs(o.x - f.x) < 60 && o.y > FLOOR - 90 && o.hp > 0 && e.act > -1) {
        e.act = 0;
        this.hurtLead(g, Math.round(o.data.hp * (.055 + this.half * .015)), f.x - e.dir * 20, true, '冲撞', 420);
        g.shake = Math.max(g.shake, 8);
      }
      if ((e.act ?? 0) <= 0 || f.x <= X_MIN || f.x >= X_MAX) { e.act = 0; e.cd = 2.2 + g.random() * .6; }
      return;
    }
    if (this.grabbed?.by === f) { f.ai.move = 0; return; }
    if (e.windup > 0) {
      f.ai.move = 0;
      f.facing = e.dir;
      e.windup -= dt;
      if (e.windup > 0) return;
      e.windup = 0;
      const move = e.move ?? 'slam';
      if (move === 'dash') {
        e.act = .5;
        this.cue('dash');
        this.pulses.push({ k: 'slam', x: f.x, y: FLOOR, t: 0, max: .35, color: '#ff8a5c', dir: e.dir });
        return;
      }
      if (move === 'grab') {
        // 往前一扑：够到了就抓住，没够到就扑空、露出一个大破绽。
        f.x = clamp(f.x + e.dir * 40, X_MIN, X_MAX);
        if (Math.abs(o.x - f.x) < 95 && o.y > FLOOR - 100 && o.hp > 0 && !isInvulnerable(o)) {
          this.grabbed = { by: f, t: 0, mash: 0 };
          o.queue.length = 0;
          this.cue('grab');
          this.shot((o.x + f.x) / 2, FLOOR - 110, 1.18, GRAB_TIME);
        } else e.cd = 2.6;
        e.cd = Math.max(e.cd, 2.6 + g.random() * .6);
        return;
      }
      // 砸地：预警圈里的人吃一下重击，圈里的杂兵也被震飞。
      e.cd = 3.2 + g.random() * .8;
      const cx = f.x + e.dir * e.reach * .5;
      this.pulses.push({ k: 'slam', x: cx, y: FLOOR, t: 0, max: .5, color: '#ff5a5a', dir: e.dir });
      this.cue('slam');
      this.kick(e.dir * 6, 4);
      g.shake = Math.max(g.shake, 9);
      g.sparks(cx, FLOOR - 10, '#ffd0c0', 18, 1.2);
      if (Math.abs(o.x - cx) < e.reach * .62 && o.y > FLOOR - 120 && o.hp > 0) {
        const dmg = Math.round(o.data.hp * (.045 + this.half * .015));
        hit(g, f, o, { ...jab(dmg, e.reach), type: 'heavy', name: '重击', knock: 300 }, { hit: new Set() }, f.x);
      }
      return;
    }
    f.ai.move = dist > e.reach * .7 ? dir : 0;
    if (e.cd > 0 || this.ultOn || this.grabbed) return;
    // 三招挑一招：贴身多半抓投，离得远多半冲刺，中间砸地。
    const r = g.random();
    let move: 'slam' | 'grab' | 'dash' | null = null;
    if (dist < 110) move = r < .5 ? 'grab' : 'slam';
    else if (dist < e.reach * .95) move = r < .25 ? 'dash' : 'slam';
    else if (dist < 520 && r < .02) move = 'dash';
    if (!move) return;
    e.move = move;
    e.dir = dir;
    e.windup = e.max = move === 'grab' ? .6 : move === 'dash' ? .7 : .85;
    void dx;
  }

  /** 被精英抓住：主角钉在它面前，连按任意攻击键挣脱；没挣脱就被抡起来摔出去。 */
  private stepGrab(g: FightGame, lead: Fighter, dt: number): void {
    const gr = this.grabbed;
    if (!gr) return;
    const by = gr.by;
    if (by.hp <= 0 || !g.fighters.includes(by) || lead.hp <= 0) { this.grabbed = null; return; }
    gr.t += dt;
    lead.x = by.x + by.facing * 46;
    lead.vx = 0;
    lead.stun = Math.max(lead.stun, .1);
    lead.attack = null;
    // 被抓时每按一下攻击键都会进输入队列：这里数完清掉。
    if (lead.queue.length) { gr.mash += lead.queue.length; lead.queue.length = 0; this.kick((g.random() - .5) * 6, 0); }
    if (gr.mash >= GRAB_MASH) {
      // 挣脱：把它推开、自己短暂无敌。
      this.grabbed = null;
      lead.stun = 0;
      lead.invuln = Math.max(lead.invuln, .5);
      by.vx = by.facing * -260;
      by.mob!.elite!.cd = 2;
      this.cue('escape');
      this.pulses.push({ k: 'break', x: lead.x, y: lead.y - 60, t: 0, max: .5, color: '#ffffff' });
      g.text('挣脱！', lead.x, lead.y - 220, '#ffffff', .8, 22);
      return;
    }
    if (gr.t >= GRAB_TIME) {
      this.grabbed = null;
      lead.stun = 0;
      this.hurtLead(g, Math.round(lead.data.hp * (.09 + this.half * .02)), by.x, true, '摔投', 520);
      this.kick(-by.facing * 10, 6);
      g.shake = Math.max(g.shake, 11);
      this.cue('slam');
    }
  }

  /* ---- 宝箱：碰到就开；光柱 + 轮盘，开出强化卡或补给 ---- */

  private makeChest(g: FightGame, x: number): Chest {
    const r0 = g.random();
    const prize: ChestPrize = r0 < .4 ? 'card' : r0 < .65 ? 'rare' : (['drink', 'boom', 'spot', 'mega'] as const)[Math.floor(g.random() * 4)];
    const others: ChestPrize[] = (['card', 'rare', 'drink', 'boom', 'spot', 'mega', 'candy'] as ChestPrize[]).filter(k => k !== prize);
    const reel: ChestPrize[] = [prize, ...others.slice(0, 4)];
    // 打乱顺序，记住奖品在第几格。
    for (let i = reel.length - 1; i > 0; i--) { const j = Math.floor(g.random() * (i + 1)); [reel[i], reel[j]] = [reel[j], reel[i]]; }
    return { x: clamp(x, X_MIN + 50, X_MAX - 50), state: 0, t: 0, reel, land: reel.indexOf(prize) };
  }

  /** 轮盘此刻停在哪一格（画面也读它）：转得越来越慢，最后落在奖品上。 */
  chestFace(c: Chest): number {
    const n = c.reel.length;
    const k = Math.min(1, c.t / CHEST_SPIN);
    const pos = (1 - (1 - k) ** 3) * (n * 3 + c.land);
    return Math.floor(pos) % n;
  }

  private stepChests(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const c of this.chests) {
      if (c.state === 0) {
        c.t += dt;
        const a = lead.attack;
        if (Math.abs(lead.x - c.x) < 58 || (a && Math.abs(lead.x - c.x) < 130 && Math.sign(c.x - lead.x) === lead.facing)) this.openChest(g, c);
      } else {
        c.t += dt;
        lead.invuln = Math.max(lead.invuln, c.state === 1 ? .05 : 0);
        if (c.state === 1) {
          const f = this.chestFace(c);
          if (f !== c.face) { c.face = f; this.cue('tick', Math.round(c.t / CHEST_SPIN * 8)); }
        }
        if (c.state === 1 && c.t >= CHEST_SPIN) { c.state = 2; this.grant(g, lead, c.reel[c.land], c.x); this.cue('ding', c.reel[c.land] === 'card' ? 1 : 0, true); }
        if (c.state === 2 && c.t > CHEST_SPIN + 1.1) continue;
      }
      this.chests[w++] = c;
    }
    this.chests.length = w;
  }

  private openChest(g: FightGame, c: Chest): void {
    c.state = 1;
    c.t = 0;
    this.pulses.push({ k: 'open', x: c.x, y: FLOOR - 40, t: 0, max: .7, color: '#FDE979' });
    // 开箱的一瞬间把身边的杂兵震开，留出看轮盘的空当。
    for (const f of g.fighters) if (f.mob && f.hp > 0 && !f.mob.elite && Math.abs(f.x - c.x) < 260) this.strike(g, f, 8, { dir: Math.sign(f.x - c.x) || 1, knock: 320, up: 260 });
  }

  private grant(g: FightGame, lead: Fighter, prize: ChestPrize, x: number): void {
    g.sparks(x, FLOOR - 150, '#FDE979', 24, 1.3);
    if (prize === 'card') {
      this.pushUpgradeOffer(g);
      g.text('强化卡！', x, FLOOR - 230, '#FDE979', 1.1, 26);
    } else if (prize === 'rare') this.dropRare(g, x, FLOOR - 200);
    else this.applySupply(g, lead, prize, x);
  }

  /* ---- 补给 ---- */

  private dropSupply(g: FightGame, x: number, y: number, kind?: SupplyKind): void {
    if (this.supplies.length >= 6) return;
    let k = kind;
    if (!k) {
      const w = TAGS[this.song.tag].drops;
      // 血少时回血类更容易出。
      const low = this.lead.hp < this.lead.data.hp * .45 ? 2 : 1;
      const kinds = Object.keys(w) as SupplyKind[];
      const wt = (q: SupplyKind) => w[q] * (q === 'candy' || q === 'drink' ? low : 1);
      let r = g.random() * kinds.reduce((sum, q) => sum + wt(q), 0);
      k = kinds[0];
      for (const q of kinds) { if ((r -= wt(q)) <= 0) { k = q; break; } }
    }
    this.supplies.push({ kind: k, x: clamp(x, X_MIN + 30, X_MAX - 30), y, vy: -260, t: 0, life: 18 });
  }

  private stepSupplies(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const s of this.supplies) {
      s.t += dt;
      s.life -= dt;
      if (s.y < FLOOR - 26 || s.vy < 0) { s.vy += GRAVITY * .7 * dt; s.y = Math.min(FLOOR - 26, s.y + s.vy * dt); if (s.y >= FLOOR - 26) s.vy = 0; }
      if (s.life <= 0) continue;
      if (s.t > .3 && Math.abs(lead.x - s.x) < 46 && lead.y > FLOOR - 140 && lead.hp > 0) { this.applySupply(g, lead, s.kind, s.x); continue; }
      this.supplies[w++] = s;
    }
    this.supplies.length = w;
  }

  private applySupply(g: FightGame, lead: Fighter, kind: SupplyKind, x: number): void {
    const name = SUPPLY_NAME[kind];
    this.cue(kind === 'boom' ? 'boom' : 'supply', ['candy', 'drink', 'mega', 'boom', 'spot'].indexOf(kind), kind === 'boom');
    if (kind === 'candy' || kind === 'drink') {
      const heal = Math.round(lead.data.hp * (kind === 'candy' ? .06 : .18));
      lead.hp = Math.min(lead.data.hp, lead.hp + heal);
      g.text(`${name} +${heal}`, lead.x, lead.y - 200, '#6EE7B7', 1, 22);
      g.sparks(lead.x, lead.y - 80, '#6EE7B7', 14, 1);
    } else if (kind === 'mega') {
      // 扩音器：全场星屑立刻飞过来。
      for (const gm of this.gems) gm.t = 99;
      this.pulses.push({ k: 'mega', x: lead.x, y: lead.y - 80, t: 0, max: .8, color: '#FDE979' });
      g.text(`${name} · 全场经验`, lead.x, lead.y - 200, '#FDE979', 1, 22);
    } else if (kind === 'boom') {
      this.pulses.push({ k: 'boom', x, y: FLOOR - 60, t: 0, max: .9, color: '#ff6fa8' });
      this.screenClear(g, lead, .2, .04);
      g.hitstop = Math.max(g.hitstop, .08);
      g.text(`${name}！`, x, FLOOR - 200, '#ff6fa8', 1, 26);
    } else {
      if (this.spotT <= 0) lead.dmgMul += .5;
      this.spotT = SPOT_TIME;
      g.text(`${name} · 无敌`, lead.x, lead.y - 200, '#fff1c2', 1, 22);
    }
  }

  private stepSpot(lead: Fighter, dt: number): void {
    if (this.spotT <= 0) return;
    this.spotT -= dt;
    lead.invuln = Math.max(lead.invuln, .05);
    if (this.spotT <= 0) { this.spotT = 0; lead.dmgMul -= .5; }
  }

  /* ---- 舞台机关事件（主歌 B）：按曲风来 ---- */

  private stageEvent(g: FightGame, lead: Fighter): void {
    let ev = TAGS[this.song.tag].event;
    if (ev === 'band') {
      if (this.guest) { this.bandAt = -1; this.bandDrop(g, lead); return; }
      ev = 'rigs';
    }
    const ahead = lead.facing;
    if (ev === 'speakers') {
      g.setBanner('舞台机关', '音箱阵上台 · 打爆它', 1.4);
      for (let i = 0; i < 3; i++) this.props.push(this.makeProp('speaker', clamp(lead.x + ahead * (170 + i * 120), X_MIN + 40, X_MAX - 40)));
    } else if (ev === 'crates') {
      g.setBanner('舞台机关', '补给箱空投', 1.4);
      for (let i = 0; i < 2; i++) this.props.push(this.makeProp('crate', clamp(lead.x + (i - .5) * 220, X_MIN + 40, X_MAX - 40)));
    } else {
      g.setBanner('舞台机关', '灯架松动 · 注意脚下光圈', 1.4);
      // 五架灯从一侧往另一侧依次砸下，先亮圈再落。
      for (let i = 0; i < 5; i++) {
        const x = clamp(lead.x + (i - 2) * 160 * ahead + (g.random() - .5) * 40, X_MIN + 40, X_MAX - 40);
        this.warns.push({ x, t: -i * .32, max: 1.15, r: 78, dmg: Math.round(lead.data.hp * .03) });
      }
    }
  }

  private stepWarns(g: FightGame, lead: Fighter, dt: number): void {
    let w = 0;
    for (const a of this.warns) {
      a.t += dt;
      if (a.t < a.max) { this.warns[w++] = a; continue; }
      for (const f of g.fighters) if (f.team !== lead.team && f.hp > 0 && Math.abs(f.x - a.x) < a.r * 1.2) this.strike(g, f, 140 + this.half * 40, { dir: Math.sign(f.x - a.x) || 1, up: 360, knock: 220, heavy: true });
      if (Math.abs(lead.x - a.x) < a.r && lead.hp > 0) {
        // 机关不是谁打的：借场上任意一个敌人当来源走原版受击（格挡、无敌照常算）。
        const src = g.fighters.find(f => f.team !== lead.team && f.hp > 0);
        if (src) hit(g, src, lead, { ...jab(a.dmg, 0), type: 'heavy', name: '灯架', knock: 220 }, { hit: new Set() }, a.x);
      }
      this.arms.fx.push({ k: 'rig', x: a.x, y: FLOOR, r: a.r, dir: 1, life: .55, max: .55, lv: 3, evo: false, w: 0 });
      g.shake = Math.max(g.shake, 7);
      g.sparks(a.x, FLOOR - 10, '#ffe6a8', 16, 1.2);
    }
    this.warns.length = w;
  }

  /** 舞台事件「乐队乱入」：队友空降入场，满气直接放出她的原版 L 必杀后退场。 */
  private bandDrop(g: FightGame, owner: Fighter): void {
    const data = this.guest ? ROSTER_BY_ID.get(this.guest) : undefined;
    if (!data) return;
    const id = g.nextFighterId();
    const ally = makeFighter(data, id, {
      x: clamp(owner.x - owner.facing * 60, X_MIN + 20, X_MAX - 20),
      facing: owner.facing, controller: null, energy: 0, team: owner.team,
    });
    ally.energy = ally.energyMax;
    ally.minion = true;
    ally.dmgMul = owner.dmgMul;
    ally.life = 3.4;
    g.ensureStats(id);
    g.fighters.push(ally);
    g.sparks(ally.x, ally.y - 80, ally.data.color, 24, 1.3);
    g.setBanner(`${ally.data.name} 乱入！`, '乐队支援', 1.4);
    g.attack(ally, 5);
  }
}
