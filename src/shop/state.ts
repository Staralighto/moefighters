/* 商店与仓库的业务：买、装备、当前生效的款式，以及它们落到界面上的地方（主页配色、战斗头像框）。 */

import { cssUrl } from '../assets/loader.ts';
import { STAGES } from '../data/stages.ts';
import type { StageData } from '../data/types.ts';
import { equip, equipped, grant, hasFlag, onInventory, owns, setFlag } from '../save/inventory.ts';
import { earn, spend, shards } from '../save/wallet.ts';
import { hintExportOnce } from '../ui/saveUi.ts';
import { SKINS } from '../theme/skins.ts';
import { ITEM_BY_ID, itemsOf, slotOf, type ItemDef, type Kind } from './catalog.ts';

/** 头像框美术图（public/frames/<id>.svg）。 */
export const frameArt = (key: string) => cssUrl(`/frames/${key}.svg`);

export const has = (id: string) => !!ITEM_BY_ID.get(id)?.base || owns(id);

/** 某一类当前生效的物品：装备了且仍拥有的那件，否则默认款。 */
export function current(kind: Kind, slot: string = kind): ItemDef | undefined {
  const id = equipped(slot);
  const item = id ? ITEM_BY_ID.get(id) : undefined;
  if (item && item.kind === kind && has(item.id)) return item;
  return itemsOf(kind).find(i => i.base);
}

export type BuyResult = 'ok' | 'owned' | 'poor' | 'unknown';
export function buy(id: string): BuyResult {
  const item = ITEM_BY_ID.get(id);
  if (!item || item.price == null) return 'unknown';
  if (has(id)) return 'owned';
  if (shards() < item.price) return 'poor';
  if (!spend(item.price)) return 'poor';
  if (!grant(id)) { earn(item.price); return 'unknown'; }
  hintExportOnce();
  return 'ok';
}

export function wear(item: ItemDef): void {
  if (!has(item.id)) return;
  equip(slotOf(item), item.base ? undefined : item.id);
}

/* ---- 首场赠礼：第一次进商店，在祥子和爱音里任选一个终幕。名单是写死的，以后上架别的终幕也不会出现在这里。 ---- */
const GIFT = 'gift-finale';
const GIFT_FINALES = ['finale:sakiko', 'finale:anon'];

export function giftOptions(): ItemDef[] {
  return GIFT_FINALES.flatMap(id => {
    const item = ITEM_BY_ID.get(id);
    return item && item.kind === 'finale' && !has(item.id) ? [item] : [];
  });
}

export const giftPending = () => !hasFlag(GIFT) && giftOptions().length > 0;

export function takeGift(id: string): boolean {
  const item = ITEM_BY_ID.get(id);
  if (!item || !GIFT_FINALES.includes(id) || hasFlag(GIFT) || has(id)) return false;
  if (!grant(id)) return false;
  setFlag(GIFT);
  return true;
}
export function skipGiftForNow(): void { /* 不记：下次进商店还会问。 */ }

/* ---- 生效到界面 ---- */

/** 主页样式：<html data-skin>。index.html 头部的内联脚本在首帧前做同一件事。 */
export function applyTheme(): void {
  const key = current('theme')?.id.split(':')[1];
  const root = document.documentElement;
  if (!key || key === 'base') delete root.dataset.skin;
  else root.dataset.skin = key;
  // 只有暗色美术的款：设置里的主题开关失效，置灰；换回别的款时恢复原选择（偏好本身没动）。
  document.getElementById('set-theme-seg')?.toggleAttribute('inert', !!SKINS.find(s => s.id === key)?.darkOnly);
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

/** 战斗 HUD 的头像框：双方同一款，挂在 .hud 上。 */
export function applyHudFrame(): void {
  const hud = document.querySelector<HTMLElement>('.hud');
  const f = current('frame');
  if (!hud) return;
  if (!f || f.base) { delete hud.dataset.frame; hud.style.removeProperty('--fr'); hud.style.removeProperty('--frimg'); return; }
  const key = f.id.split(':')[1];
  hud.dataset.frame = key;
  hud.style.setProperty('--fr', f.color ?? 'var(--gold)');
  hud.style.setProperty('--frimg', frameArt(key));
}

/** 结算票根款式，结算海报读它挂 data-ticket。 */
export function ticketStyle(): string { return current('ticket')?.id.split(':')[1] ?? 'live'; }

/** 选人页能选的舞台：基础舞台 + 已买的新舞台。 */
export function stagePool(): StageData[] { return STAGES.filter(s => !s.item || has(s.item)); }

/** 本地对战里哪些角色的终幕可以播。联机两端必须一致，不走这里（全部放行）。 */
export function finaleOwned(charId: string): boolean { return has(`finale:${charId}`); }

export function bindLooks(): void {
  applyTheme();
  onInventory(applyTheme);
}
