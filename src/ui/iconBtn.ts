/** Desktop caption → Phosphor symbol. Mobile shows the icon; the words stay for desktop and for the accessible name. */
const ICON_FOR: Record<string, string> = {
  '♪ 音效开': 'speaker-high',
  '♪ 音效关': 'speaker-slash',
  '暂停 ESC': 'pause',
  '继续 ESC': 'play',
  '再来一局 ↻': 'arrow-clockwise',
  '再来一次 ↻': 'arrow-clockwise',
  '下一关 ▶': 'arrow-right',
  '重新选人': 'users',
  '返回选人': 'arrow-left',
  '← 返回选人': 'arrow-left',
  '返回选人 ◀': 'arrow-left',
  '返回休息': 'house',
  '继续战斗 ▶': 'play',
};

export function setIconBtn(el: HTMLElement, label: string): void {
  const text = el.querySelector('.btn-label');
  const use = el.querySelector('use');
  if (text) text.textContent = label;
  const icon = ICON_FOR[label];
  if (use && icon) use.setAttribute('href', `#i-${icon}`);
  el.setAttribute('aria-label', label.replace(/[♪↻▶◀←]/g, '').replace(/\s*ESC\s*$/, '').trim());
  // Icon-only buttons drop the caption, so the label doubles as the hover tooltip; it carries what
  // the icon cannot, such as a key (暂停 ESC).
  el.title = label;
}
