/* 详情弹窗右侧的说明栏：头像框、终幕、其他物品三种弹窗共用。按钮与卡片上同一个动作；
   在商店里买下时，栏底的出纸口打印一张小票。 */

import { ITEM_BY_ID } from '../shop/catalog.ts';
import { itemName } from './items.ts';
import { SHARD, type CardState } from './merch.ts';
import { printReceipt } from './receipt.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export interface SideTool { label: string; pressed?: boolean; onClick(b: HTMLButtonElement): void }
/** run 返回 'bought' 表示刚买下（打小票）。 */
export type SideRun = (act: string) => 'bought' | void;

export interface SideOpts {
  id: string;
  kicker: string;
  nameId: string;
  /** 名字下面多一行（终幕的必杀名）。 */
  sub?: string;
  hint: string;
  tools?: SideTool[];
  state: () => CardState;
  run: SideRun;
  dialog: HTMLDialogElement;
}

export function renderSide(side: HTMLElement, o: SideOpts, pop = false): void {
  const item = ITEM_BY_ID.get(o.id);
  const state = o.state();
  const badge = state.worn ? '<p class="fv-worn">使用中</p>' : state.owned && !item?.base ? '<p class="fv-worn">已拥有</p>' : '';
  const price = item?.price != null && !state.owned ? `<p class="fv-price">${SHARD}<b>${item.price}</b></p>` : '';
  const btn = state.action
    ? `<button type="button" class="fv-act${['buy', 'wear'].includes(state.action.act) ? ' set-primary' : ''}"${state.action.disabled ? ' disabled' : ''}>${state.action.act === 'buy' ? SHARD : ''}${esc(state.action.label)}</button>`
    : '';
  const tools = o.tools?.length ? `<div class="fn-row">${o.tools.map((t, i) => `<button type="button" class="fv-tool" data-i="${i}"${t.pressed === undefined ? '' : ` aria-pressed="${t.pressed}"`}>${esc(t.label)}</button>`).join('')}</div>` : '';
  side.innerHTML = `<p class="fv-kicker">${esc(o.kicker)}</p><h2 class="fv-name" id="${esc(o.nameId)}">${esc(itemName(o.id))}</h2>${badge}`
    + (o.sub ? `<p class="fn-ult">${o.sub}</p>` : '')
    + `<p class="fv-note">${esc(state.note ?? '')}</p>${price}<p class="fv-hint">${esc(o.hint)}</p>`
    + `<div class="fv-actions">${tools}${btn}</div><div class="ss-printer" aria-hidden="true"></div>`;
  side.querySelectorAll<HTMLButtonElement>('.fv-tool').forEach(b => { b.onclick = () => o.tools![Number(b.dataset.i)].onClick(b); });
  const act = side.querySelector<HTMLButtonElement>('.fv-act');
  if (act && state.action) {
    const what = state.action.act;
    act.onclick = () => {
      const r = o.run(what);
      if (what === 'shop' || what === 'tasks' || what === 'locker') { o.dialog.close(); return; }
      if (!o.dialog.open) return;
      renderSide(side, o, true);
      if (r === 'bought' && item) void printReceipt(side.querySelector<HTMLElement>('.ss-printer')!, item, document.querySelector<HTMLElement>('.sh-locker'));
    };
  }
  if (pop) { side.classList.remove('fv-done'); void side.offsetWidth; side.classList.add('fv-done'); }
}
