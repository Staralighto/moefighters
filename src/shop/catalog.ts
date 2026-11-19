/* 物品目录：商店和仓库共用。id = 类别:名字。
   - price 有值才在商店上架；没有的只能从别处拿（source 写获取途径，仓库里显示）。
   - base 是默认款：天然拥有，什么都没装备时就是它。
   - 舞台、终幕不用「装备」，拥有即生效；头像框、结算票根、主页样式一类一个槽；皮肤按角色各一个槽（skin:角色）。 */

import { ALBUMS } from '../tasks/defs.ts';
import { PUBLIC_ROSTER } from '../data/characters.ts';
import { STAGES } from '../data/stages.ts';
import { SKINS } from '../theme/skins.ts';

export type Kind = 'frame' | 'ticket' | 'theme' | 'stage' | 'finale' | 'skin';

export interface ItemDef {
  id: string;
  kind: Kind;
  name: string;
  price?: number;
  /** 不卖的东西从哪来，仓库里写给玩家看。 */
  source?: string;
  base?: boolean;
  /** 头像框、主页样式的主色。 */
  color?: string;
  /** 终幕、皮肤所属角色。 */
  char?: string;
  /** 终幕立绘、舞台图等预览图。 */
  art?: string;
  /** 预览图里脸的位置（宽高的比例），缩略图按它居中裁切。 */
  focus?: { x: number; y: number };
}

/** short：手机分类条上的短名（图标下面一行，六格等分放得下）；icon：index.html 里的 symbol。 */
export const KINDS: readonly { kind: Kind; name: string; en: string; slot: boolean; short: string; icon: string }[] = [
  { kind: 'frame', name: '头像框', en: 'FRAMES', slot: true, short: '头像框', icon: 'k-frame' },
  { kind: 'ticket', name: '结算票根', en: 'TICKETS', slot: true, short: '票根', icon: 'k-ticket' },
  { kind: 'theme', name: '主页样式', en: 'THEMES', slot: true, short: '主页', icon: 'k-theme' },
  { kind: 'stage', name: '舞台', en: 'STAGES', slot: false, short: '舞台', icon: 'k-stage' },
  { kind: 'finale', name: '终幕', en: 'FINALES', slot: false, short: '终幕', icon: 'k-finale' },
  { kind: 'skin', name: '皮肤', en: 'SKINS', slot: true, short: '皮肤', icon: 'k-skin' },
];

const FRAMES_FOR_SALE: ItemDef[] = [
  { id: 'frame:gold', kind: 'frame', name: '金色舞台', price: 150, color: '#F2C14E' },
  { id: 'frame:neon', kind: 'frame', name: '霓虹灯牌', price: 120, color: '#3FF0FF' },
  { id: 'frame:sakura', kind: 'frame', name: '樱色', price: 100, color: '#FFB7CE' },
  { id: 'frame:lime', kind: 'frame', name: '荧光棒', price: 100, color: '#B8FF3C' },
  { id: 'frame:moon', kind: 'frame', name: '月夜', price: 120, color: '#FFE79A' },
  { id: 'frame:ember', kind: 'frame', name: '余烬', price: 120, color: '#FF7A2E' },
];

/** 乐队专属头像框的名字：取乐队的剧情设定和代表意象，不直接叫乐队名。 */
const FRAME_NAMES: Record<string, string> = {
  'ave-mujica': '假面舞会',
  mygo: '迷途之子',
  yumemita: '无限梦境',
  'poppin-party': '闪闪发光',
  'pastel-palettes': '粉彩调色盘',
  roselia: '蓝蔷薇',
  'hello-happy': '笑容满载',
  sumimi: '甜蜜双星',
  afterglow: '一如既往的夕阳',
  'raise-a-suilen': '最强之音',
  morfonica: '蓝闪蝶',
  millsage: '幸福乐章',
  'ikka-dumb-rock': '一家团圆',
  'kessoku-band': '结束之绳',
  best: '金色唱片',
};

/** 头像框描边色：取自每张框图 SVG 的 data-ring（public/frames/<id>.svg），和图对齐。没写的用乐队色。 */
const FRAME_RING: Record<string, string> = { afterglow: '#EE3322', 'hello-happy': '#FFD21E', best: '#E8B84A' };

const THEME_NAMES: Record<string, string> = { sapphire: '蔚蓝', violet: '暮紫', mint: '薄荷', sunset: '夕阳', winter: '冬日浪漫' };
/** 主页样式默认 300；整页换美术的款单独定价。 */
const THEME_PRICE: Record<string, number> = { winter: 800 };

export const ITEMS: readonly ItemDef[] = [
  { id: 'frame:base', kind: 'frame', name: '默认', base: true, color: '#97a1c3' },
  ...FRAMES_FOR_SALE,
  ...ALBUMS.map(a => ({ id: a.frame, kind: 'frame' as const, name: FRAME_NAMES[a.id] ?? a.name, color: FRAME_RING[a.id] ?? a.color, source: `任务 · ${a.name}全清奖励` })),
  { id: 'ticket:live', kind: 'ticket', name: '乐队演出票', base: true },
  { id: 'theme:base', kind: 'theme', name: '乐团粉', base: true, color: '#ff3b7f' },
  ...SKINS.map(k => ({ id: `theme:${k.id}`, kind: 'theme' as const, name: THEME_NAMES[k.id] ?? k.id, price: THEME_PRICE[k.id] ?? 300, color: k.brand })),
  /* 新舞台：StageData.item 指向这里的 id 时，未拥有就不出现在选人页。 */
  ...STAGES.filter(s => s.item).map(s => ({ id: s.item!, kind: 'stage' as const, name: s.name, price: 150, art: s.image })),
  ...PUBLIC_ROSTER.filter(c => c.finale).map(c => ({ id: `finale:${c.id}`, kind: 'finale' as const, name: c.name, price: 500, char: c.id, art: c.finale!.art, focus: c.finale!.focus })),
];

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map(i => [i.id, i]));
export const itemsOf = (kind: Kind) => ITEMS.filter(i => i.kind === kind);
export const slotOf = (i: ItemDef) => i.kind === 'skin' ? `skin:${i.char}` : i.kind;
