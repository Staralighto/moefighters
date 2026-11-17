/* 物品的名字和预览，商店、仓库、领奖演出共用。
   头像框是代码画的：主色粗边 + 两个切角 + 一枚小星；框里放一位角色的头像（按物品 id 固定挑一位）。 */

import { staticUrl } from '../assets/loader.ts';
import { PUBLIC_ROSTER } from '../data/characters.ts';
import { ITEM_BY_ID, KINDS, itemsOf } from '../shop/catalog.ts';
import { ALBUMS } from '../tasks/defs.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const pickFace = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PUBLIC_ROSTER[h % PUBLIC_ROSTER.length]?.id ?? 'placeholder';
};
function previewFaces(id: string): [string, string] {
  const band = ALBUMS.find(a => a.id === (id.split(':')[1] ?? ''));
  return band && band.members.length >= 2 ? [band.members[0], band.members[1]] : [pickFace(id), pickFace(id + '#2')];
}
/** 货架上每个在售头像框会用到的图。详情弹窗在打开前把同一批 URL 解码掉，避免第一次点开时同步解码卡住。 */
export function frameShelfSrcs(): string[] {
  const srcs: string[] = [];
  for (const it of itemsOf('frame')) {
    if (it.price == null) continue;
    srcs.push(`/frames/${it.id.split(':')[1]}.svg`, `/avatars/${previewFaces(it.id)[0]}.png`);
  }
  return srcs;
}
export const avatarImg = (who: string, attrs = 'loading="lazy"') => `<img src="${esc(staticUrl(`/avatars/${who}.png`))}" alt="" ${attrs} onerror="this.onerror=null;this.src='${esc(staticUrl('/avatars/placeholder.png'))}'">`;
const avatar = (who: string) => avatarImg(who);

export function itemName(id: string): string {
  const item = ITEM_BY_ID.get(id);
  if (!item) return id;
  if (item.kind === 'frame') return `${item.name} 头像框`;
  if (item.kind === 'finale') return `${item.name} · 终幕`;
  return item.name;
}

export function itemKind(id: string): string {
  const kind = ITEM_BY_ID.get(id)?.kind;
  return KINDS.find(k => k.kind === kind)?.name ?? '物品';
}

/** 头像框预览：默认只摆 1P 一侧，边缘看得清楚；pair=true 时再加 2P，往右歪、叠在后面。
 *  默认款就是战斗里那张黄绿票根；其他款换成框色底板 + 描边 + 两个折角。
 *  头像没下载完时，img 底下先垫占位头像，网慢时不会只看到空框。 */
export function frameHTML(id: string, faces?: [string, string], pair = false): string {
  const item = ITEM_BY_ID.get(id);
  const key = id.split(':')[1] ?? '';
  const [a, b] = faces ?? previewFaces(id);
  const unit = (who: string, side: 'a' | 'b') => `<span class="fp-unit fp-${side}"><i class="fp-back"></i>${avatar(who)}<i class="fp-corners"></i></span>`;
  return `<span class="fp" data-base="${item?.base ? 'true' : 'false'}" data-frame="${esc(key)}" style="--fr:${esc(item?.color ?? '#E9C46A')};--frimg:url('${esc(staticUrl(`/frames/${key}.svg`))}')">${unit(a, 'a')}${pair ? unit(b === a ? pickFace(id + '#3') : b, 'b') : ''}</span>`;
}

/** 主页样式预览：缩小的首页一角——色块大圆、斜条、开打按钮、编号徽章。 */
export function themeHTML(color: string, id = ''): string {
  return `<span class="theme-mini" data-look="${esc(id.split(':')[1] ?? '')}" style="--tm:${esc(color)}"><i class="tm-disc"></i><i class="tm-stripes"></i><i class="tm-badge">01</i><i class="tm-line"></i><i class="tm-line s"></i><i class="tm-btn"></i></span>`;
}

/** 结算票根预览。 */
export function ticketHTML(style: string): string {
  return `<span class="ticket-mini" data-ticket="${esc(style)}"><b>LIVE</b><i></i><small>ADMIT ONE</small></span>`;
}

export function itemPreviewHTML(id: string): string {
  const item = ITEM_BY_ID.get(id);
  if (!item) return '';
  switch (item.kind) {
    case 'frame': return frameHTML(id);
    case 'theme': return themeHTML(item.color ?? '#ff3b7f', id);
    case 'ticket': return ticketHTML(id.split(':')[1]);
    case 'finale':
    case 'stage': return item.art ? `<img class="art-mini" src="${esc(staticUrl(item.art))}" alt="" loading="lazy">` : '<span class="art-mini"></span>';
    case 'skin': return item.char ? `<span class="fp" data-base="true"><span class="fp-unit fp-a"><i class="fp-back"></i>${avatar(item.char)}</span></span>` : '';
  }
}
