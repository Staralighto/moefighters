/* 逐层返回：左上角返回键、弹窗上的悬浮返回键、手机系统返回 / 侧滑返回，全部走 backOne()，一次只退一层：
   先收起页面里的小浮层（导航、音乐弹层、仓库小卡片）→ 再关最上面的弹窗 → 再关后台页 / 备战页 → 大厅里什么都不做。
   连点保护：退一层后 260ms 内的返回请求直接吞掉（第一下关弹窗、悬浮返回键消失，第二下正好落在页面的返回键上，不会连页面一起退）。
   弹窗开着时，顶上整条导航带照样亮着、能点（见下面 layer-bar）。 */
import { cue, phoneLayout } from './mobile.ts';
import { closePopover, openPopover, popoverOpen } from './overlays.ts';

const GUARD_MS = 260;
let lastBack = 0;
const layers: (() => boolean)[] = [];
let pageBack: () => boolean = () => false;

/** 页面里的小浮层：开着就收起并返回 true。后注册的先收。 */
export function registerLayer(close: () => boolean): void { layers.unshift(close); }
/** 后台页 / 备战页那一层（hub.ts 注册）。 */
export function setPageBack(fn: () => boolean): void { pageBack = fn; }

/* 弹窗按打开顺序记成栈（DOM 顺序不是叠放顺序）。 */
const stack: HTMLDialogElement[] = [];
const topDialog = () => stack[stack.length - 1] ?? null;
/** 不吃返回的弹窗：领奖演出（进行中的展示，关不关由「收下」决定）。 */
const NO_BACK = '.reward-dialog';

/** 退一层。silent：调用方的按钮自己已经发了声。返回 true = 这次请求被消化了（退了一层或在连点保护里）。 */
export function backOne(silent = false): boolean {
  const now = performance.now();
  if (now - lastBack < GUARD_MS) return true;
  const done = () => { lastBack = now; if (!silent) cue('back'); return true; };
  for (const close of layers) if (close()) return done();
  const d = topDialog();
  if (d) {
    if (d.matches(NO_BACK)) return true;
    if (d.dispatchEvent(new Event('cancel', { cancelable: true }))) d.close();
    return done();
  }
  if (pageBack()) return done();
  return false;
}

/* ---- 弹窗开着时，顶上整条导航带照样亮、照样能点（横屏手机）：
   后台页 / 备战页是 .hub-bar（返回、页名 = 弹出式导航、碎片、任务的全部领取），大厅是站点顶栏（碎片、印章册 / 设置 / 音乐 / 说明）+ 左上角返回。
   模态弹窗会把外面的一切设成不可点，所以在当前弹窗里放一个 popover（进顶层），里面是导航带的一份拷贝，盖在原位上：
   - 拷贝的返回 = backOne()（退一层）；
   - 拷贝的其他按钮 = 先关掉所有弹窗，再点原来的那个（切页、开导航、开设置都从干净的状态开始，不叠窗）。
   原导航带有变化（碎片滚动、领取数）就在下一帧重抄。暗色遮罩在 CSS 里从导航带下沿才开始（渐入），所以整条不压暗。 ---- */
const canPop = () => typeof HTMLElement.prototype.showPopover === 'function';
let bar: HTMLElement | null = null, source: HTMLElement | null = null, mo: MutationObserver | null = null, raf = 0;

function closeAllDialogs(): void {
  for (const d of [...stack].reverse()) if (d.open && !d.matches(NO_BACK)) d.close();
}
function backButton(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hub-back layer-back';
  b.dataset.cue = 'none';
  b.setAttribute('aria-label', '返回');
  b.innerHTML = '<svg class="btn-icon" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-arrow-left"/></svg>';
  b.onclick = () => { backOne(); };
  return b;
}
/** 拷一份导航带：去掉 id（不和原件重名），按钮按顺序对应回原件。 */
function copyOf(src: HTMLElement): HTMLElement {
  const c = src.cloneNode(true) as HTMLElement;
  for (const el of [c, ...c.querySelectorAll<HTMLElement>('[id]')]) el.removeAttribute('id');
  c.removeAttribute('data-mirrored');
  for (const el of c.querySelectorAll('[aria-controls]')) el.removeAttribute('aria-controls');
  const orig = [...src.querySelectorAll<HTMLElement>('button, summary')];
  [...c.querySelectorAll<HTMLElement>('button, summary')].forEach((el, i) => {
    el.dataset.cue = 'none';
    if (el.classList.contains('hub-back')) { el.onclick = () => { backOne(); }; return; }
    el.onclick = e => { e.preventDefault(); closeAllDialogs(); orig[i]?.click(); };
  });
  c.setAttribute('aria-hidden', 'false');
  return c;
}
function paint(): void {
  if (!bar || !source) return;
  if (source.tagName === 'HEADER') {
    /* 站点顶栏：整份拷贝一个 header，靠 CSS 里和原件同一条规则（:is(body, .layer-bar) > header）定位、缩放，
       不用量位置再换算（Safari 的 zoom 下量出来的坐标和 Chrome 不是一套，换算会把整条推下去 / 推偏）。
       原件里隐藏的项（如 #sound 靠 id 规则藏，拷贝去了 id 会冒出来）在拷贝里直接删掉。 */
    const c = copyOf(source);
    const orig = [source, ...source.querySelectorAll<HTMLElement>('*')];
    const copy = [c, ...c.querySelectorAll<HTMLElement>('*')];
    copy.forEach((el, i) => { const o = orig[i]; if (el !== c && o && !o.getClientRects().length) el.remove(); });
    bar.replaceChildren(c, backButton());
  } else {
    const r = source.getBoundingClientRect();
    const c = copyOf(source);
    c.style.position = 'absolute';
    c.style.left = `${Math.round(r.left)}px`;
    c.style.top = `${Math.round(r.top)}px`;
    c.style.width = `${Math.round(r.width)}px`;
    c.style.height = `${Math.round(r.height)}px`;
    bar.replaceChildren(c);
  }
}
function schedule(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; paint(); });
}

function sync(): void {
  const d = topDialog();
  const want = !!d && phoneLayout() === 'land' && !d.matches(NO_BACK) && canPop();
  if (bar && popoverOpen(bar)) closePopover(bar);
  mo?.disconnect(); mo = null;
  /* 拷贝盖在原位时把原件藏起来（不压暗的导航带上，差一两像素也会看出重影）。 */
  source?.removeAttribute('data-mirrored');
  if (!want) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.className = 'layer-bar'; }
  const hub = document.getElementById('hub');
  source = hub && !hub.hidden ? hub.querySelector<HTMLElement>('.hub-bar') : document.querySelector<HTMLElement>('body > header');
  if (bar.parentElement !== d) d!.append(bar);
  bar.popover = 'manual';
  paint();
  openPopover(bar);
  source?.setAttribute('data-mirrored', '');
  if (source) {
    mo = new MutationObserver(schedule);
    mo.observe(source, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-expanded', 'open'] });
  }
}

export function bindLayerBack(): void {
  const watch = (d: HTMLDialogElement) => new MutationObserver(() => {
    const i = stack.indexOf(d);
    if (i >= 0) stack.splice(i, 1);
    if (d.open) stack.push(d);
    sync();
  }).observe(d, { attributes: true, attributeFilter: ['open'] });
  for (const d of document.querySelectorAll('dialog')) { watch(d); if (d.open) stack.push(d); }
  /* 关弹窗也算退了一层：× / 点空白关掉之后，紧接着的返回请求同样受连点保护。 */
  document.addEventListener('close', e => { if (e.target instanceof HTMLDialogElement) lastBack = performance.now(); }, true);
  window.addEventListener('resize', () => { if (bar?.isConnected) schedule(); }, { passive: true });
}
