/** 页面底部的一行短提示，2.4 秒后自己退场。同时只留一条。 */
let el: HTMLElement | null = null;
let timer = 0;

export function toast(text: string): void {
  if (!el) {
    el = document.createElement('div');
    el.className = 'site-toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('show'), 2400);
}
