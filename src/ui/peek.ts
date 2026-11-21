/* 长按预览（只看不做，松手就收；注册到 mobile.ts 的 onLongPress）：
   - 名册角色卡：角色名、称号、六个招式（键位 + 招式名 + 一句话说明），不用切到招式页就能看一眼。
   物品不做：商店货架的图已经够大，仓库小方格点一下就有方舟式的概览卡，长按再放大是重复。 */
import { onLongPress } from './mobile.ts';
import { ROSTER } from '../data/characters.ts';

const KEYS = ['轻', '重', '技1', '技2', '技3', '必'];
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function bindPeeks(): void {
  onLongPress('.character', el => {
    const name = (el.getAttribute('aria-label') ?? '').replace(/^选择/, '');
    const c = ROSTER.find(x => x.name === name);
    if (!c) return null;
    const card = document.createElement('div');
    card.className = 'peek-char';
    card.style.setProperty('--c', c.color);
    card.innerHTML = `<header><b>${esc(c.name)}</b><small>${esc(c.title)}</small></header><ol>`
      + c.skills.slice(0, 6).map((s, i) => `<li${s.super ? ' class="ult"' : ''}><kbd>${KEYS[i] ?? ''}</kbd><span><b>${esc(s.name)}</b><small>${esc(s.brief)}</small></span></li>`).join('')
      + '</ol>';
    return card;
  });
}
