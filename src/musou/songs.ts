/* 音浪无双的曲目与曲风。加新歌：在 bgm.ts 的 TRACKS 里加，再在 SONG_META 里按曲名补一行（不补就按「燃·快」）。
   一首歌只需标曲风与真实拍点参数（BPM、beat0、half）；每个半场统一 HALF_DUR = 90 秒，
   波次节奏（热身、狂热浪潮 FEVER、精英战、机关事件、Boss）由 songPlan 统一推出来，不为单首歌写规则。 */

export const HALF_DUR = 90;

export type SongTag = 'hot' | 'dark' | 'cute' | 'epic';
export type MobKind = 'fan' | 'glow' | 'amp' | 'guard' | 'scalper';
export type PropKind = 'speaker' | 'rig' | 'cheer' | 'crate';
/** 补给（应援 / 乐队主题）：润喉糖、应援饮料回血，扩音器吸经验，爆音音箱清屏，舞台追光无敌加伤。 */
export type SupplyKind = 'candy' | 'drink' | 'mega' | 'boom' | 'spot';
/** 主歌 B 的舞台机关事件。 */
export type StageEvent = 'speakers' | 'rigs' | 'crates' | 'band';
/** 群体威胁：围堵圈（两侧人墙往里收）、横幅冲锋（一排人举着横幅横扫整条街）。 */
export type ThreatKind = 'ring' | 'charge';

export interface MusouSong {
  /** bgm.ts TRACKS 下标。 */
  track: number;
  title: string;
  tag: SongTag;
  bpm: number;
  /** 半场时长（秒，默认统一 HALF_DUR = 90）。 */
  dur: number;
  /** 第一拍落在第几秒；half = 踩拍按每两拍判一次（快歌踩重拍，不用跟着八分音符狂按）。 */
  beat0?: number;
  half?: boolean;
  /** 狂热浪潮时段（秒，[开始, 结束]），按先后排。最后一段是「终盘浪潮 + 两侧包围」，结束时 Boss 登场；
      之前每段结束时出一只精英。不填按 90 秒统一波次比例推算。 */
  chorus?: readonly (readonly [number, number])[];
}

/* bpm / beat0 是对音频做起音检测拟合出来的（整首恒定速度、第一拍位置），踩拍判定就靠它们。 */
type Meta = { tag: SongTag; bpm: number; beat0: number; half?: boolean };
const SONG_META: Record<string, Meta> = {
  '少女乐团PICO': { tag: 'cute', bpm: 190, beat0: .162, half: true },
  '全速前进！': { tag: 'hot', bpm: 150, beat0: .252 },
  '胜利的冲动': { tag: 'hot', bpm: 190, beat0: .046, half: true },
  '燃烧的冲动': { tag: 'hot', bpm: 150, beat0: .304 },
  '钢铁之诗': { tag: 'epic', bpm: 186.3, beat0: .242, half: true },
  '黑色剧场序曲': { tag: 'dark', bpm: 150, beat0: .002 },
};

export function musouSongs(tracks: readonly { title: string }[]): MusouSong[] {
  return tracks.map((t, track) => {
    const m = SONG_META[t.title];
    return { track, title: t.title, tag: m?.tag ?? 'hot', bpm: m?.bpm ?? 160, dur: HALF_DUR, beat0: m?.beat0 ?? 0, half: m?.half ?? (m?.bpm ?? 160) > 170 };
  });
}

/** 一首歌的波次节奏表（默认 90 秒）：0–10s 热身、8s 第一张卡、18s 第一次补给、28–44s 狂热浪潮 1（结尾精英）、
    54s 机关事件、60–76s 终盘浪潮 + 包围、76s Boss 登场。 */
export interface SongPlan {
  chorus: { s: number; e: number; big: boolean }[];
  introEnd: number;
  firstCard: number;
  supplyAt: number;
  /** 每段非最后狂热浪潮结束后：精英战结束 → 机关事件的时刻。 */
  events: number[];
  bossAt: number;
}

export function songPlan(song: MusouSong): SongPlan {
  const d = song.dur;
  const k = d / HALF_DUR;
  const hasCustom = !!song.chorus?.length;
  const raw = hasCustom ? song.chorus! : [[28 * k, 44 * k], [60 * k, 76 * k]] as const;
  const chorus = raw.map(([s, e], i) => ({ s, e, big: i === raw.length - 1 }));
  const events: number[] = [];
  if (!hasCustom) {
    events.push(54 * k);
  } else {
    for (let i = 0; i < chorus.length - 1; i++) {
      const a = chorus[i].e + Math.min(20, (chorus[i + 1].s - chorus[i].e) * .45);
      events.push((a + chorus[i + 1].s) / 2);
    }
  }
  return { chorus, introEnd: 10 * k, firstCard: 8 * k, supplyAt: 18 * k, events, bossAt: chorus[chorus.length - 1].e };
}

/** 这一刻在第几段狂热浪潮里（-1 不在）。 */
export function chorusAt(plan: SongPlan, t: number): number {
  for (let i = 0; i < plan.chorus.length; i++) if (t >= plan.chorus[i].s && t < plan.chorus[i].e) return i;
  return -1;
}

/** 一首歌里的基础强度（不含 FEVER 倍率）：热身稀疏、爬坡、狂热浪潮顶满、精英战略缓、再爬坡、Boss 段压一点。 */
export function intensity(plan: SongPlan, t: number): number {
  if (t < plan.introEnd) return .28;
  if (t >= plan.bossAt) return .5;
  if (chorusAt(plan, t) >= 0) return 1;
  // 在哪两段副歌之间。
  let prevEnd = plan.introEnd, nextStart = plan.chorus[0].s;
  for (let i = 0; i < plan.chorus.length; i++) {
    if (t < plan.chorus[i].s) { nextStart = plan.chorus[i].s; break; }
    prevEnd = plan.chorus[i].e;
  }
  const u = Math.max(0, Math.min(1, (t - prevEnd) / Math.max(1, nextStart - prevEnd)));
  const lull = prevEnd > plan.introEnd ? Math.max(0, 1 - u * 3) * .25 : 0;
  return .5 + u * .3 - lull;
}

export interface TagProfile {
  name: string;
  en: string;
  /** 出怪权重。 */
  mobs: Record<MobKind, number>;
  /** 同屏密度倍率、人潮规模倍率、杂兵血量倍率。 */
  density: number;
  surge: number;
  hp: number;
  props: Record<PropKind, number>;
  /** 这首歌里发生「乐队乱入」的概率。 */
  band: number;
  /** 补给权重与掉率倍率。 */
  drops: Record<SupplyKind, number>;
  dropRate: number;
  /** 主歌 B 的机关事件。 */
  event: StageEvent;
  /** 主歌里每隔一会儿来一次的群体威胁：围堵圈 / 横幅冲锋的权重，和两次之间的秒数。 */
  threats: Record<ThreatKind, number>;
  threatGap: number;
  mood: Mood;
}

export interface Mood {
  /** 整体调色（叠在长街上）。 */
  tint: string;
  tintAlpha: number;
  /** 0..1 暗场程度：四周压暗。 */
  dark: number;
  /** 环境粒子。 */
  mote: 'spark' | 'spot' | 'bubble' | 'feather';
  /** 粒子与光的主色、副色。 */
  c1: string;
  c2: string;
  /** FEVER 时全场灯光换成的两种颜色。 */
  f1: string;
  f2: string;
}

export const TAGS: Record<SongTag, TagProfile> = {
  hot: {
    name: '燃·快', en: 'HOT',
    mobs: { fan: 6, glow: 1, amp: 2, guard: .6, scalper: .5 },
    density: 1.15, surge: 1.3, hp: 1,
    props: { speaker: 3, rig: 1, cheer: 1, crate: 1 },
    band: .25,
    drops: { candy: 2, drink: 1, mega: 1, boom: 3, spot: 1 }, dropRate: 1, event: 'speakers', threats: { ring: 1, charge: 2 }, threatGap: 10,
    mood: { tint: '#ff5a2e', tintAlpha: .14, dark: .1, mote: 'spark', c1: '#ffb347', c2: '#ff3b7f', f1: '#ff2e88', f2: '#ffd23f' },
  },
  dark: {
    name: '酷·暗', en: 'DARK',
    mobs: { fan: 3, glow: 2, amp: 1, guard: 2, scalper: .5 },
    density: .8, surge: .75, hp: 1,
    props: { speaker: 1, rig: 3, cheer: 1, crate: 1 },
    band: .2,
    drops: { candy: 2, drink: 1.5, mega: 1, boom: 1, spot: 3 }, dropRate: .9, event: 'rigs', threats: { ring: 1, charge: 1.5 }, threatGap: 11,
    mood: { tint: '#4b2bd6', tintAlpha: .22, dark: .55, mote: 'spot', c1: '#b9a6ff', c2: '#7a5cff', f1: '#8f6bff', f2: '#3ff0ff' },
  },
  cute: {
    name: '可爱·轻快', en: 'CUTE',
    mobs: { fan: 3, glow: 1, amp: 1, guard: .5, scalper: 3 },
    density: 1, surge: 1, hp: .95,
    props: { speaker: 1, rig: .5, cheer: 3, crate: 3 },
    band: .3,
    drops: { candy: 2.5, drink: 1, mega: 2, boom: 1.5, spot: 1.2 }, dropRate: .9, event: 'crates', threats: { ring: 2, charge: 1 }, threatGap: 10.5,
    mood: { tint: '#ff9ad5', tintAlpha: .13, dark: 0, mote: 'bubble', c1: '#ffe1f3', c2: '#9fe8ff', f1: '#ff6fd0', f2: '#7fe7ff' },
  },
  epic: {
    name: '抒情·宏大', en: 'EPIC',
    mobs: { fan: 2, glow: 1, amp: 3, guard: 2, scalper: .5 },
    density: .8, surge: 1.6, hp: 1.35,
    props: { speaker: 1.5, rig: 1, cheer: 1, crate: 1 },
    band: .55,
    drops: { candy: 1.5, drink: 2, mega: 1, boom: 1.5, spot: 2 }, dropRate: 1, event: 'band', threats: { ring: 2, charge: 1 }, threatGap: 11.5,
    mood: { tint: '#ffc94a', tintAlpha: .15, dark: .2, mote: 'feather', c1: '#fff1c2', c2: '#ffc94a', f1: '#ffd76a', f2: '#ff8a5c' },
  },
};
