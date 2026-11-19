/* 后台页准备期间留着可操作的顶栏。真的等了一小段才显示加载条，快路径直接交付。 */
import { fadeIn, fadeOut } from './motion.ts';

export const GATE_DELAY_MS = 120;
export const GATE_MIN_SHOW_MS = 180;
export const GATE_MAX_WAIT_MS = 8000;

type Say = { loading?: { line: string; en: string } };
let bar: HTMLElement | null = null;
let forcedMs: number | null = null;

/** 开发工具用：模拟本次打开需要等待首屏资源。 */
export function forceLoadMs(ms: number | null): void { forcedMs = ms; }

function ensureBar(hub: HTMLElement): HTMLElement {
  if (bar && bar.parentElement === hub) return bar;
  bar = document.createElement('div');
  bar.className = 'hub-load';
  bar.dataset.scheme = 'dark';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span class="hl-dots" aria-hidden="true">' + Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('')
    + '</span><span class="hl-line"><b></b><small></small></span><span class="hl-n" aria-hidden="true"></span>';
  hub.append(bar);
  return bar;
}

function criticalImages(host: HTMLElement, scroll: HTMLElement): HTMLImageElement[] {
  const images = [...host.querySelectorAll<HTMLImageElement>('img[src]')].filter(img => !img.complete && img.getAttribute('src'));
  if (!images.length) return images;
  const view = scroll.getBoundingClientRect();
  return images.filter(img => {
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > view.top && r.top < view.bottom && r.right > view.left && r.left < view.right;
  });
}

/** 一次打开持有自己的计时器和监听。网络失败、超时都用现有占位放行。 */
export function beginGate(hub: HTMLElement, scroll: HTMLElement, page: Say) {
  const started = performance.now();
  const forced = forcedMs;
  let closed = false;
  let shownAt = 0;
  let visibleBar: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  let got = 0, total = 0;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelFade: (() => void) | undefined;
  const stopWatching: (() => void)[] = [];

  hub.classList.add('preparing');
  scroll.inert = true;
  scroll.setAttribute('aria-busy', 'true');

  const paintCount = () => { if (count) count.textContent = total ? `${got} / ${total}` : ''; };
  const showTimer = setTimeout(() => {
    const say = page.loading ?? { line: '舞台连线中', en: 'STAGE LINK' };
    const el = visibleBar = ensureBar(hub);
    el.querySelector('b')!.textContent = say.line;
    el.querySelector('small')!.textContent = say.en;
    count = el.querySelector<HTMLElement>('.hl-n')!;
    paintCount();
    shownAt = performance.now();
    el.hidden = false;
    fadeIn(el);
  }, GATE_DELAY_MS);

  function stopWaiting(): void {
    clearTimeout(showTimer);
    clearTimeout(waitTimer);
    for (const stop of stopWatching.splice(0)) stop();
  }

  function reveal(): void {
    hub.classList.remove('preparing');
    scroll.inert = false;
    scroll.removeAttribute('aria-busy');
  }

  function complete(host: HTMLElement, jobs: readonly Promise<void>[], onReady: () => void): void {
    if (closed) return;
    const images = criticalImages(host, scroll);
    total = jobs.length + images.length;
    paintCount();

    const finish = () => {
      closed = true;
      stopWaiting();
      reveal();
      const el = visibleBar;
      if (el) {
        fadeIn(scroll);
        cancelFade = fadeOut(el, () => { el.hidden = true; });
      }
      onReady();
    };
    const ready = () => {
      if (closed) return;
      stopWaiting();
      const remaining = visibleBar ? GATE_MIN_SHOW_MS - (performance.now() - shownAt) : 0;
      if (remaining > 0) waitTimer = setTimeout(finish, remaining);
      else finish();
    };
    const done = () => {
      if (closed) return;
      got++;
      paintCount();
      if (got === total && forced == null) ready();
    };

    if (!total && forced == null) { ready(); return; }
    const remaining = GATE_MAX_WAIT_MS - (performance.now() - started);
    const delay = forced == null ? remaining : Math.min(forced - (performance.now() - started), remaining);
    waitTimer = setTimeout(ready, Math.max(0, delay));
    for (const job of jobs) void job.then(done, done);
    for (const img of images) {
      const stop = () => { img.removeEventListener('load', end); img.removeEventListener('error', end); };
      const end = () => { stop(); done(); };
      img.addEventListener('load', end);
      img.addEventListener('error', end);
      stopWatching.push(stop);
      if (img.loading === 'lazy') img.loading = 'eager';
    }
  }

  return { complete, cancel() {
    closed = true;
    stopWaiting();
    cancelFade?.();
    if (visibleBar) visibleBar.hidden = true;
    reveal();
  } };
}
