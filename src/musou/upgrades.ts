import type { Fighter } from '../game/fighter.ts';
import type { FightGame } from '../game/game.ts';
import { WEAPON_NAME, type WeaponId } from './weapons.ts';

/* 强化卡。卡面只写一行：名字 + 一句短效果（≤ 10 字左右），数值放在效果里。
   类别决定卡面颜色：武器（青）、普攻形变（黄）、技能改造（粉）、数值（灰白）、进化（金）。 */

export type CardCat = 'weapon' | 'normal' | 'skill' | 'stat' | 'evo';
export type Glyph = WeaponId | 'reach' | 'triple' | 'quake2' | 'mine' | 'burst' | 'encore' | 'amp' | 'tempo' | 'flow' | 'crit' | 'heart' | 'magnet' | 'star' | 'wave' | 'shock' | 'chain' | 'beat' | 'echo' | 'pierce';

export interface UpgradeCard {
  id: string;
  name: string;
  line: string;
  cat: CardCat;
  glyph: Glyph;
  /** 选了以后的等级；1 = 新获得。 */
  lv: number;
  max: number;
}

export interface MusouBuild {
  stacks: Map<string, number>;
  /** 本角色的乐器武器。 */
  own: WeaponId;
  evo: Set<string>;
}

export interface EvoHint {
  evoId: string;
  evoName: string;
  partnerId: string;
  partnerName: string;
  partnerHave: number;
  partnerNeed: number;
}

export interface BuildEntry {
  id: string;
  name: string;
  glyph: Glyph;
  cat: CardCat;
  lv: number;
  max: number;
  evo: boolean;
}

interface Def { id: string; name: string; cat: CardCat; glyph: Glyph; max: number; line(lv: number): string; weight?: number }

const AUTO: WeaponId[] = ['notes', 'homing', 'rig', 'aura'];
const AUTO_LINE: Record<string, (lv: number) => string> = {
  notes: lv => `身边环绕音符 ×${lv + 1}`,
  homing: lv => `自动追踪拨片 ×${lv}`,
  rig: lv => `灯架砸向敌群 ×${lv}`,
  aura: lv => `身周持续伤害 ${95 + lv * 16}`,
};
const OWN_LINE: Record<WeaponId, (lv: number) => string> = {
  fan: lv => `扇形音符 ×${3 + lv}`,
  ring: lv => `节拍冲击波 半径 ${140 + lv * 20}`,
  quake: lv => `左右地震波 ${380 + lv * 40}`,
  beam: lv => `贯穿光束 长 ${600 + lv * 50}`,
  cone: lv => `前方声波 射程 ${220 + lv * 22}`,
  orbit: lv => `环绕唱片 ×${1 + lv}`,
  notes: AUTO_LINE.notes, homing: AUTO_LINE.homing, rig: AUTO_LINE.rig, aura: AUTO_LINE.aura,
};

const MODS: Def[] = [
  // 普攻形变：现在全靠手动打，普攻是主力，这一类卡最多、权重最高，后期点几下就清一大片。
  { id: 'n:reach', name: '扩音', cat: 'normal', glyph: 'reach', max: 3, weight: 1.4, line: lv => `普攻范围 +${lv * 18}%` },
  { id: 'n:wave', name: '音浪斩', cat: 'normal', glyph: 'wave', max: 4, weight: 1.6, line: lv => `普攻甩出声波 射程 ${150 + lv * 36}` },
  { id: 'n:chain', name: '和弦连锁', cat: 'normal', glyph: 'chain', max: 3, weight: 1.4, line: lv => `普攻连到 ${1 + lv} 个敌人` },
  { id: 'n:shock', name: '重音', cat: 'normal', glyph: 'shock', max: 3, weight: 1.3, line: lv => `重击落点炸开 半径 ${100 + lv * 28}` },
  { id: 'n:beat', name: '踩点爆发', cat: 'normal', glyph: 'beat', max: 3, weight: 1.3, line: lv => `完美时身边炸开 半径 ${130 + lv * 32}` },
  { id: 'n:triple', name: '三连弹幕', cat: 'normal', glyph: 'triple', max: 3, weight: 1.2, line: lv => `每 3 下普攻射 ${3 + lv} 音符` },
  { id: 'n:after', name: '余震', cat: 'normal', glyph: 'quake2', max: 3, weight: 1.3, line: lv => `普攻溅射 ${30 + lv * 15}%` },
  { id: 'n:mine', name: '音符地雷', cat: 'normal', glyph: 'mine', max: 3, line: lv => `普攻命中留雷 ×${lv}` },
  // 两条破防路线：多段（敲次数盾）、破甲（打厚甲）。
  { id: 'n:echo', name: '回声', cat: 'normal', glyph: 'echo', max: 3, weight: 1.3, line: lv => `普攻后再响一下 伤害 ${6 + lv * 4}` },
  { id: 'n:pierce', name: '破甲', cat: 'normal', glyph: 'pierce', max: 3, weight: 1.2, line: lv => `厚甲门槛 −${lv * 22}%` },
  { id: 's:burst', name: '共鸣引爆', cat: 'skill', glyph: 'burst', max: 3, line: lv => `U/I/O 命中爆炸 ${25 + lv * 15}` },
  { id: 's:encore', name: '安可追加', cat: 'skill', glyph: 'encore', max: 2, line: lv => `放完 L 全屏冲击 ${lv}波` },
  { id: 't:amp', name: '破音过载', cat: 'stat', glyph: 'amp', max: 5, line: () => '伤害 +20%' },
  { id: 't:tempo', name: '双踩节拍', cat: 'stat', glyph: 'tempo', max: 4, line: () => '冷却 −15%' },
  { id: 't:flow', name: '无限气流', cat: 'stat', glyph: 'flow', max: 3, line: () => '回气 +50%' },
  { id: 't:crit', name: '闪耀金平糖', cat: 'stat', glyph: 'crit', max: 4, line: () => '暴击率 +12%' },
  { id: 't:magnet', name: '棉花糖', cat: 'stat', glyph: 'magnet', max: 3, line: () => '吸取星屑范围 +60' },
  { id: 't:heal', name: '抹茶芭菲', cat: 'stat', glyph: 'heart', max: 3, weight: .35, line: () => '立刻回血 15%' },
];

interface Evo { id: string; name: string; line: string; a: string; aLv: number; b: string; bLv: number }
const EVOS: Evo[] = [
  { id: 'e:own', name: '觉醒', line: '乐器武器进化', a: 'w:own', aLv: 5, b: 't:amp', bLv: 2 },
  { id: 'e:notes', name: '星环', line: '音符化作星环', a: 'w:notes', aLv: 5, b: 't:tempo', bLv: 2 },
  { id: 'e:homing', name: '流星拨片', line: '拨片命中爆炸', a: 'w:homing', aLv: 5, b: 't:crit', bLv: 2 },
  { id: 'e:normal', name: '轰鸣', line: '音浪斩前后齐发、更长', a: 'n:wave', aLv: 4, b: 'n:reach', bLv: 2 },
  { id: 'e:echo', name: '和声', line: '回声响两下，专敲次数盾', a: 'n:echo', aLv: 3, b: 'n:chain', bLv: 2 },
  { id: 'e:break', name: '碎甲', line: '重击无视厚甲、一下敲两格盾', a: 'n:pierce', aLv: 2, b: 'n:shock', bLv: 2 },
];

export const lvOf = (b: MusouBuild, id: string): number => b.stacks.get(id) ?? 0;

function resolveId(b: MusouBuild, id: string): string {
  return id === 'w:own' ? 'w:' + b.own : id;
}

function evoReady(b: MusouBuild, e: Evo): boolean {
  return lvOf(b, resolveId(b, e.a)) >= e.aLv && lvOf(b, resolveId(b, e.b)) >= e.bLv;
}

function evoName(b: MusouBuild, e: Evo): string { return e.id === 'e:own' ? `觉醒·${WEAPON_NAME[b.own]}` : e.name; }

export function cardTitle(b: MusouBuild, id: string): string {
  if (id.startsWith('w:')) return WEAPON_NAME[id.slice(2) as WeaponId] ?? id;
  if (id.startsWith('e:')) {
    const e = EVOS.find(x => x.id === id);
    return e ? evoName(b, e) : id;
  }
  return MODS.find(m => m.id === id)?.name ?? id;
}

/** 查这张卡有没有尚未解锁的合成进化；有就返回「需配合哪张卡 → 合出什么」。 */
export function evoHintFor(b: MusouBuild, cardId: string): EvoHint | null {
  for (const e of EVOS) {
    if (b.evo.has(e.id)) continue;
    const aId = resolveId(b, e.a), bId = resolveId(b, e.b);
    if (cardId !== aId && cardId !== bId) continue;
    const partnerId = cardId === aId ? bId : aId;
    const partnerNeed = cardId === aId ? e.bLv : e.aLv;
    return {
      evoId: e.id,
      evoName: evoName(b, e),
      partnerId,
      partnerName: cardTitle(b, partnerId),
      partnerHave: lvOf(b, partnerId),
      partnerNeed,
    };
  }
  return null;
}

export function autoWeaponCount(b: MusouBuild): number {
  return AUTO.filter(w => w !== b.own && lvOf(b, 'w:' + w) > 0).length;
}

/** 按类别整理当前已拿到的构筑（进化 → 武器 → 强化），给暂停面板和结算海报展示。 */
export function listBuild(b: MusouBuild): BuildEntry[] {
  const out: BuildEntry[] = [];
  for (const e of EVOS) {
    if (b.evo.has(e.id)) out.push({ id: e.id, name: evoName(b, e), glyph: 'star', cat: 'evo', lv: 1, max: 1, evo: true });
  }
  const ownId = 'w:' + b.own;
  const weaponOrder = [ownId, ...AUTO.filter(w => w !== b.own).map(w => 'w:' + w)];
  for (const id of weaponOrder) {
    const lv = lvOf(b, id);
    if (lv <= 0) continue;
    const w = id.slice(2) as WeaponId;
    const evolved = (w === b.own && b.evo.has('e:own')) || (w === 'notes' && b.evo.has('e:notes')) || (w === 'homing' && b.evo.has('e:homing'));
    out.push({ id, name: WEAPON_NAME[w], glyph: w, cat: 'weapon', lv, max: 5, evo: evolved });
  }
  for (const d of MODS) {
    const lv = lvOf(b, d.id);
    if (lv <= 0) continue;
    out.push({ id: d.id, name: d.name, glyph: d.glyph, cat: d.cat, lv, max: d.max, evo: false });
  }
  return out;
}

export function createBuild(own: WeaponId): MusouBuild {
  const b: MusouBuild = { stacks: new Map(), own, evo: new Set() };
  b.stacks.set('w:' + own, 1);
  return b;
}

function weaponDefs(b: MusouBuild): Def[] {
  const own: Def = { id: 'w:' + b.own, name: WEAPON_NAME[b.own], cat: 'weapon', glyph: b.own, max: 5, line: OWN_LINE[b.own], weight: 1.6 };
  return [own, ...AUTO.filter(w => w !== b.own).map(w => ({ id: 'w:' + w, name: WEAPON_NAME[w], cat: 'weapon' as const, glyph: w, max: 5, line: AUTO_LINE[w], weight: lvOf(b, 'w:' + w) ? 1.3 : 1 }))];
}

export function rollUpgradeChoices(b: MusouBuild, rng: () => number, count = 3, exclude?: Set<string>): UpgradeCard[] {
  const out: UpgradeCard[] = [];
  for (const e of EVOS) if (!b.evo.has(e.id) && evoReady(b, e) && !exclude?.has(e.id) && out.length < 1) {
    out.push({ id: e.id, name: evoName(b, e), line: e.line, cat: 'evo', glyph: 'star', lv: 1, max: 1 });
  }
  if (out.length === 0) {
    for (const e of EVOS) if (!b.evo.has(e.id) && evoReady(b, e) && out.length < 1) {
      out.push({ id: e.id, name: evoName(b, e), line: e.line, cat: 'evo', glyph: 'star', lv: 1, max: 1 });
    }
  }
  // 自动武器最多同时带 3 把，满了就只给已经拿到的。
  const autos = autoWeaponCount(b);
  const pool = [...weaponDefs(b), ...MODS].filter(d => {
    const lv = lvOf(b, d.id);
    if (lv >= d.max) return false;
    if (d.cat === 'weapon' && d.id !== 'w:' + b.own && lv === 0 && autos >= 3) return false;
    return true;
  });
  const pickBag = (list: Def[]) => {
    const bag = list.map(d => ({ d, w: d.weight ?? 1 }));
    while (out.length < count && bag.length) {
      let sum = 0;
      for (const x of bag) sum += x.w;
      let r = rng() * sum, i = 0;
      while (i < bag.length - 1 && (r -= bag[i].w) > 0) i++;
      const { d } = bag.splice(i, 1)[0];
      if (out.some(c => c.id === d.id)) continue;
      const lv = lvOf(b, d.id) + 1;
      out.push({ id: d.id, name: d.name, line: d.line(lv), cat: d.cat, glyph: d.glyph, lv, max: d.max });
    }
  };
  if (exclude?.size) pickBag(pool.filter(d => !exclude.has(d.id)));
  if (out.length < count) pickBag(pool);
  return out;
}

/** 数值卡直接改 Fighter；武器、形变、进化只记等级，由导演每步读。 */
export function applyUpgrade(g: FightGame, f: Fighter, b: MusouBuild, id: string): UpgradeCard | null {
  const lv = lvOf(b, id) + 1;
  if (id.startsWith('e:')) b.evo.add(id);
  b.stacks.set(id, lv);
  switch (id) {
    case 't:amp': f.dmgMul += .2; break;
    case 't:tempo': f.cdMul = Math.max(.35, f.cdMul * .85); break;
    case 't:flow': f.energyMul += .5; break;
    case 't:crit': f.critChance = Math.min(.9, f.critChance + .12); break;
    case 't:heal': f.hp = Math.min(f.data.hp, f.hp + Math.round(f.data.hp * .15)); break;
    case 'n:reach': f.musouRangeMul = 1 + lv * .18; break;
  }
  const def = [...weaponDefs(b), ...MODS].find(d => d.id === id);
  const evo = EVOS.find(e => e.id === id);
  const card: UpgradeCard | null = def ? { id, name: def.name, line: def.line(lv), cat: def.cat, glyph: def.glyph, lv, max: def.max }
    : evo ? { id, name: evoName(b, evo), line: evo.line, cat: 'evo', glyph: 'star', lv: 1, max: 1 } : null;
  if (card) g.sparks(f.x, f.y - 90, CAT_COLOR[card.cat], 16, 1.1);
  return card;
}

export const CAT_COLOR: Record<CardCat, string> = { weapon: '#76e7ff', normal: '#FDE979', skill: '#ff6fa8', stat: '#d8dcef', evo: '#E9C46A' };

/** 局势：给「推荐」打分用（掉落道具里高亮的那张、倒数走完自动拿的那张）。 */
export interface PickContext { hpFrac: number; crowd: number; boss: boolean }

const AOE = new Set(['n:reach', 'n:wave', 'n:shock', 'n:after', 'n:beat', 'n:chain', 's:encore']);
const SINGLE = new Set(['t:amp', 't:crit', 'n:pierce', 's:burst']);

/** 三张里推荐哪张：进化 > 补齐合成 > 升级已有的 > 普攻形变；再按血量、怪多少、有没有 Boss 微调。不随机，同局面同结果。 */
export function recommendUpgrade(b: MusouBuild, cards: readonly UpgradeCard[], ctx: PickContext): number {
  let best = 0, bestS = -Infinity;
  cards.forEach((c, i) => {
    let s = 1;
    if (c.cat === 'evo') s += 100;
    const h = evoHintFor(b, c.id);
    if (h) s += h.partnerHave > 0 ? 3 : 1;
    if (c.lv > 1) s += 1.5;
    if (c.cat === 'normal') s += 1;
    if (c.id === 't:heal') s += ctx.hpFrac < .6 ? (1 - ctx.hpFrac) * 8 : -2;
    if (ctx.crowd >= 12 && (AOE.has(c.id) || c.cat === 'weapon')) s += 1;
    if (ctx.boss && SINGLE.has(c.id)) s += 1.5;
    if (s > bestS) { bestS = s; best = i; }
  });
  return best;
}
