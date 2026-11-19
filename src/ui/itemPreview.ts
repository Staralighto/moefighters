/* 其他物品（主页样式、结算票根、舞台、皮肤）的详情弹窗：左边大预览，右边同一套说明栏。 */

import { ITEM_BY_ID, KINDS } from '../shop/catalog.ts';
import { renderSide, type SideRun } from './detailSide.ts';
import { itemPreviewHTML, themeHTML, ticketHTML } from './items.ts';
import type { CardState } from './merch.ts';

const $ = (id: string) => document.getElementById(id)!;
let openDialog: (d: HTMLDialogElement) => void = d => d.showModal();
export function setItemPreviewOpener(fn: (d: HTMLDialogElement) => void): void { openDialog = fn; }

const HINTS: Record<string, string> = {
  theme: '全站的品牌色和背景几何换成这一套。',
  ticket: '对战结算海报换成这一款票根。',
  stage: '解锁后出现在选人页的场景里。',
  skin: '这位角色的战斗形象换成这一套。',
};

export function openItemPreview(id: string, state: () => CardState, run: SideRun): void {
  const item = ITEM_BY_ID.get(id);
  if (!item) return;
  const dlg = $('item-dialog') as HTMLDialogElement;
  const show = $('iv-show');
  show.dataset.kind = item.kind;
  show.innerHTML = item.kind === 'theme' ? themeHTML(item.color ?? '#ff3b7f', id)
    : item.kind === 'ticket' ? ticketHTML(id.split(':')[1]) : itemPreviewHTML(id);
  renderSide($('iv-side'), {
    id, kicker: (KINDS.find(k => k.kind === item.kind)?.en ?? 'ITEM').replace(/S$/, ''), nameId: 'iv-name',
    hint: HINTS[item.kind] ?? '', state, run, dialog: dlg,
  });
  openDialog(dlg);
}

export function bindItemPreview(): void {
  const dlg = $('item-dialog') as HTMLDialogElement;
  dlg.querySelector<HTMLButtonElement>('.fv-close')!.onclick = () => dlg.close();
}
