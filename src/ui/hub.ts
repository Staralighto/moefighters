/* 后台四个页面（商店 / 仓库 / 任务 / 音乐库）的壳：选人页底部的入口卡、全屏页面的开合、顶栏的碎片计数。
   大厅模式另有备战三页（作战 / 场景 / 招式，ui/lobby.ts 注册）：同一个壳。
   开合：打开是一次快速渐入（motion.ts），关上是瞬间的；不从卡片位置铺开、不做入场级联；眼前的图没到齐时先出加载条（loadGate.ts）。
   第一次进入和之后一样快，不再「首访加长版」：每次进出都播的效果，看久了只会累。 */

import { FADE_IN_MS, fadeIn, reducedMotion } from './motion.ts';
import { beginGate } from './loadGate.ts';
import { netMark, pendingNet } from '../assets/loader.ts';
import { onWallet, shards } from '../save/wallet.ts';
import { cue, lobbyMode } from './mobile.ts';
import { settleAppHeight } from './appHeight.ts';
import { backOne, setPageBack } from './layerBack.ts';

export type HubId = 'shop' | 'locker' | 'tasks' | 'music' | 'battle' | 'stage' | 'moves';

export interface HubPage {
  title: string;
  en: string;
  /** 建一次，之后复用。 */
  mount(host: HTMLElement): void;
  /** 每次打开。构建较重的页面可在小批次之间 yield，让壳按帧调度。 */
  enter?(): void | Generator<void>;
  ready?(): void;
  leave?(): void;
  /** 加载条上的说法（loadGate.ts）：用游戏里的事说「正在加载」，如音乐库「调音中」。缺省用通用的「舞台连线中」。 */
  loading?: { line: string; en: string };
}

const $ = (id: string) => document.getElementById(id)!;
const NO: Record<HubId, string> = { shop: 'A', locker: 'B', tasks: 'C', music: 'D', battle: '01', stage: '02', moves: '03' };
const BUILD_BUDGET_MS = 8;
const pages = new Map<HubId, HubPage>();
const hosts = new Map<HubId, HTMLElement>();
/** 已经 mount 过的页（host 先建、mount 可能推迟一帧，见 openHub）。 */
const mounted = new Set<HubId>();

let current: HubId | null = null;
let opener: HTMLElement | null = null;
let coverTimer: ReturnType<typeof setTimeout> | undefined;
let visit: AbortController | null = null;
let cancelBuild: (() => void) | undefined;
let cancelGate: (() => void) | undefined;
const reduced = reducedMotion;

function afterPaint(run: () => void): () => void {
  let task: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { cancelAnimationFrame(frame); clearTimeout(task); clearTimeout(fallback); };
  const resume = () => { stop(); run(); };
  // 帧回调里再排一个任务，给浏览器绘制机会。后台标签页仍由定时器推进。
  const frame = requestAnimationFrame(() => { task = setTimeout(resume, 0); });
  const fallback = setTimeout(resume, 50);
  return stop;
}

export function registerHubPage(id: HubId, page: HubPage): void { pages.set(id, page); }

/** 列表在批次之间留出调度点。调用方决定何时清空和提交缓存。 */
export function* appendHubItems<T>(list: HTMLElement, items: readonly T[], html: (item: T, index: number) => string): Generator<void> {
  for (let i = 0; i < items.length; i += 4) {
    list.insertAdjacentHTML('beforeend', items.slice(i, i + 4).map((item, slot) => html(item, i + slot)).join(''));
    yield;
  }
}

/* ---- 碎片计数：所有 [data-shards] 一起滚。 ---- */
let shown = shards();
let rollRaf = 0;
function paintShards(n: number): void {
  const text = Math.round(n).toLocaleString('en-US');
  for (const el of document.querySelectorAll<HTMLElement>('[data-shards]')) el.textContent = text;
}
function rollTo(target: number): void {
  cancelAnimationFrame(rollRaf);
  const from = shown, t0 = performance.now(), dur = reduced() ? 0 : Math.min(900, 300 + Math.abs(target - from) * 4);
  const step = (now: number) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    shown = from + (target - from) * (1 - (1 - k) ** 3);
    paintShards(shown);
    if (k < 1) rollRaf = requestAnimationFrame(step);
    else { shown = target; paintShards(target); }
  };
  rollRaf = requestAnimationFrame(step);
  for (const chip of document.querySelectorAll<HTMLElement>('.shard-chip')) {
    chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
  }
}


export function hubOpen(): HubId | null { return current; }
export function hubSignal(): AbortSignal | undefined { return visit?.signal; }

/* ---- 弹出式导航（照明日方舟二级页的导航栏：不用先回首页就能跳到别的系统）。
   点顶栏的页面标题，从顶栏下面降下一条「巡演路线」：一根线从左往右画出来，站点依次弹出；
   当前页是实心粉点。点某一站，新页面从这个站点的位置铺开。点暗处、再点标题、按返回都先收起它。 ---- */
type StopId = HubId | 'home' | 'stamps';
type Stop = { id: StopId; name: string; icon: string };
const STOPS: readonly Stop[] = [
  { id: 'home', name: '首页', icon: 'i-house' },
  { id: 'shop', name: '商店', icon: 'n-shop' },
  { id: 'locker', name: '仓库', icon: 'n-locker' },
  { id: 'tasks', name: '任务', icon: 'n-tasks' },
  { id: 'music', name: '音乐库', icon: 'i-music-notes' },
  { id: 'stamps', name: '印章册', icon: 'i-seal' },
];
/* 横屏手机：首页是大厅，路线多出「备战」三站（作战 / 场景 / 招式），上方两段括号标出备战和后台。竖屏仍是六站。 */
const LAND_STOPS: readonly Stop[] = [
  { id: 'home', name: '大厅', icon: 'i-house' },
  { id: 'battle', name: '作战', icon: 'n-battle' },
  { id: 'stage', name: '场景', icon: 'k-stage' },
  { id: 'moves', name: '招式', icon: 'n-moves' },
  ...STOPS.slice(1),
];
const GROUPS = [{ name: '备战', from: 2, to: 5 }, { name: '后台', from: 5, to: 9 }];
/** 大厅模式：多出备战三站、返回叫「‹ 大厅」。只看大厅模式，不看版式（关了大厅的横屏手机仍是原来 6 站）。 */
const land = () => lobbyMode();
let prepMeta: (id: StopId) => string = () => '';
/** lobby.ts 给备战三站接上实时信息（对阵、场景名、招式数）。 */
export function setPrepMeta(fn: (id: StopId) => string): void { prepMeta = fn; }
let openStampBook: () => void = () => {};
/** main.ts 把印章册的打开方式交给导航。 */
export function setNavStamps(fn: () => void): void { openStampBook = fn; }
let confirmHome: (go: () => void) => void = go => go();
/** main.ts 给「首页」一站接上二次确认弹窗。 */
export function setNavHome(fn: (go: () => void) => void): void { confirmHome = fn; }
let navOpen = false;
let navTimer: ReturnType<typeof setTimeout> | undefined;

/** 站点下面那一行实时信息：可领取数、正在放的歌。直接读首页入口卡上已经算好的字。碎片数顶栏已有，不重复。 */
function stopMeta(id: StopId): string {
  if (id === 'tasks') { const el = document.getElementById('bs-ready'); return el && !el.hidden ? el.textContent ?? '' : ''; }
  if (id === 'music') return document.querySelector('#bs-now span')?.textContent ?? '';
  return prepMeta(id);
}

function paintNav(): void {
  const list = $('hub-nav').querySelector<HTMLElement>('.hn-stops')!;
  const grouped = land();
  const stops = grouped ? LAND_STOPS : STOPS;
  list.classList.toggle('grouped', grouped);
  list.style.setProperty('--stops', String(stops.length));
  const groups = grouped ? GROUPS.map(g => `<li class="hn-grp" style="grid-column:${g.from} / ${g.to}" aria-hidden="true"><b>${g.name}</b></li>`).join('') : '';
  list.innerHTML = groups + stops.map((s, i) => {
    const meta = stopMeta(s.id);
    const here = s.id === current;
    return `<li style="--n:${i};grid-column:${i + 1}"><button type="button" class="hn-stop" data-stop="${s.id}" data-cue="tab"${here ? ' aria-current="page"' : ''}>`
      + `<span class="hn-dot"><svg viewBox="0 0 256 256" aria-hidden="true"><use href="#${s.icon}"/></svg></span>`
      + `<b>${s.name}</b><small${s.id === 'tasks' && meta ? ' class="hot"' : ''}>${meta.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</small></button></li>`;
  }).join('');
  for (const b of list.querySelectorAll<HTMLButtonElement>('.hn-stop')) b.onclick = () => goStop(b.dataset.stop as StopId, b);
}

function closeNav(instant = false): boolean {
  if (!navOpen && !instant) return false;
  navOpen = false;
  const nav = $('hub-nav');
  $('hub-nav-btn').setAttribute('aria-expanded', 'false');
  nav.classList.remove('on');
  nav.inert = true;
  clearTimeout(navTimer);
  if (instant || reduced()) nav.hidden = true;
  else navTimer = setTimeout(() => { nav.hidden = true; }, 200);
  return true;
}

function openNav(): void {
  if (navOpen || !current) return;
  navOpen = true;
  const nav = $('hub-nav');
  clearTimeout(navTimer);
  nav.style.setProperty('--bar-h', `${$('hub').querySelector<HTMLElement>('.hub-bar')!.offsetHeight}px`);
  paintNav();
  nav.hidden = false;
  nav.inert = false;
  $('hub-nav-btn').setAttribute('aria-expanded', 'true');
  void nav.offsetWidth;
  nav.classList.add('on');
  cue('swish');
}

function goStop(id: StopId, from: HTMLElement): void {
  if (id === current) { closeNav(); return; }
  if (id === 'home') { closeNav(); confirmHome(() => closeHub()); return; }
  if (id === 'stamps') { closeNav(); openStampBook(); return; }
  if (!pages.has(id)) { closeNav(); return; }
  /* 先把新页从站点的位置铺开，再收起导航（站点矩形要在导航还在的时候量）。 */
  openHub(id, from);
  closeNav();
}

/** 顶栏星之碎片左边的一小段进度（仓库的已收集、任务的已完成）。null 收起；换页时自动收起。
    有 icon 时和碎片胶囊一样写成「图标 + 数字」，label 是读屏读的全称；给了 act 就换成一颗实心主按钮（任务页横屏的「全部领取」）。 */
export function setHubCount(text: string | null, o: { icon?: string; label?: string; act?: () => void } = {}): void {
  const el = $('hub-count');
  el.hidden = !text;
  el.textContent = text ?? '';
  if (o.label && !o.act) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', o.label); el.title = o.label; }
  else { el.removeAttribute('role'); el.removeAttribute('aria-label'); el.removeAttribute('title'); }
  if (text && o.icon && !o.act) el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 256 256" aria-hidden="true"><use href="#${o.icon}"/></svg>`);
  const act = o.act;
  if (!text || !act) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'set-primary';
  b.dataset.cue = 'none';
  b.textContent = text;
  b.onclick = act;
  el.replaceChildren(b);
}

export function openHub(id: HubId, from?: HTMLElement | null): void {
  const page = pages.get(id);
  if (!page || current === id) return;
  const mark = (phase: string) => {
    if (!import.meta.env?.DEV) return;
    const name = `hub:${id}:${phase}`;
    performance.clearMarks(name);
    performance.mark(name);
  };
  mark('open');
  const hub = $('hub');
  const scroll = $('hub-scroll');
  cue('open');
  if (current) leavePage(current);
  current = id;
  const opening = visit = new AbortController();
  const gate = beginGate(hub, scroll, page);
  cancelGate = gate.cancel;
  opener = from ?? null;
  $('hub-no').textContent = NO[id];
  /* 横屏：编号圆标换成这一页的图标（和弹出式导航里同一个），字母 / 编号对玩家没有意义。 */
  const ico = document.getElementById('hub-ico');
  if (ico) ico.querySelector('use')?.setAttribute('href', `#${LAND_STOPS.find(s => s.id === id)?.icon ?? 'i-house'}`);
  setHubCount(null);
  $('hub-title').textContent = page.title;
  $('hub-en').textContent = page.en;
  let host = hosts.get(id);
  if (!host) {
    host = document.createElement('div');
    host.className = 'hub-page';
    host.dataset.page = id;
    scroll.append(host);
    hosts.set(id, host);
  }
  const pageHost = host;
  for (const [k, el] of hosts) el.hidden = k !== id;
  hub.dataset.page = id;
  hub.hidden = false;
  document.documentElement.classList.add('hub-open');
  /* 锁住整页滚动这一下，沉浸模式里浏览器可能不更新固定定位的参照框：按真实可见高度重新钉。 */
  settleAppHeight();
  /* 后面的选人页 / 大厅先摘掉焦点和点击；渐入结束后再整块藏起来停画（渐入途中藏会透出底色闪一下）。 */
  const shield = (on: boolean) => {
    for (const el of [document.getElementById('selection'), document.getElementById('lobby'), document.querySelector('body > header'), document.querySelector('.site-foot')]) el?.toggleAttribute('inert', on);
  };
  shield(true);
  /* 进页面只做一次快速渐入（motion.ts）：不从入口卡铺开、没有入场级联。状态立刻到位，「盖住」靠定时器，不等动画事件。 */
  const cover = () => { if (current) document.documentElement.classList.add('hub-covered'); };
  clearTimeout(coverTimer);
  if (document.documentElement.classList.contains('hub-covered') || reduced()) cover();
  else { fadeIn(hub); coverTimer = setTimeout(cover, FADE_IN_MS); }
  ($('hub-back') as HTMLButtonElement).focus({ preventScroll: true });
  function* prepare(): Generator<void> {
    mark('build-start');
    scroll.scrollTop = 0;
    if (!mounted.has(id)) {
      page!.mount(pageHost);
      mounted.add(id);
      yield;
    }
    const steps = page!.enter?.();
    if (steps) yield* steps;
  }
  const work = prepare();
  const jobs: Promise<void>[] = [];
  const run = () => {
    cancelBuild = undefined;
    if (opening.signal.aborted) return;
    try {
      const start = performance.now(), since = netMark();
      let done = false;
      do { done = !!work.next().done; }
      while (!done && !opening.signal.aborted && performance.now() - start < BUILD_BUDGET_MS);
      if (opening.signal.aborted) return;
      jobs.push(...pendingNet(1, since));
      if (!done) { cancelBuild = afterPaint(run); return; }
      mark('build-end');
      gate.complete(pageHost, jobs, () => { mark('ready'); page.ready?.(); });
    } catch (error) {
      if (!opening.signal.aborted) closeHub();
      console.error('后台页准备失败', id, error);
    }
  };
  cancelBuild = afterPaint(run);
}

function leavePage(id: HubId): void {
  visit?.abort();
  visit = null;
  cancelBuild?.();
  cancelBuild = undefined;
  cancelGate?.();
  cancelGate = undefined;
  pages.get(id)?.leave?.();
}

/** 关上后台页：瞬间完成，没有渐出。隐藏、交还点击、解除滚动锁全部同步做完，关之后不留任何计时器或动画。
    （试过 100ms 渐出：渐出途中透明的后台页会吃掉点击，交还点击的时机也被计时器推迟，表现为「按入口格没反应」。）
    instant 参数保留给调用方，现在总是瞬间关。 */
export function closeHub(_instant = false): void {
  if (!current) return;
  closeNav(true);
  const hub = $('hub');
  const id = current;
  current = null;
  leavePage(id);
  clearTimeout(coverTimer);
  hub.hidden = true;
  document.documentElement.classList.remove('hub-covered', 'hub-open');
  for (const el of [document.getElementById('selection'), document.getElementById('lobby'), document.querySelector('body > header'), document.querySelector('.site-foot')]) el?.removeAttribute('inert');
  opener?.focus({ preventScroll: true });
}

export function bindHub(): void {
  paintShards(shown);
  onWallet(w => rollTo(w.shards));
  for (const tile of document.querySelectorAll<HTMLButtonElement>('.bs-tile')) {
    tile.onclick = () => openHub(tile.dataset.hub as HubId, tile);
  }
  /* 返回、Esc 都先收起最上面那一层：导航开着就只收导航。 */
  /* 返回键、系统返回、Esc 都走 layerBack 的逐层返回：导航开着只收导航，然后才关页面。 */
  setPageBack(() => { if (!current) return false; if (!closeNav()) closeHub(); return true; });
  $('hub-back').onclick = () => { backOne(true); };
  $('hub-nav-btn').onclick = () => { if (!closeNav()) openNav(); };
  $('hub-nav').querySelector<HTMLElement>('.hn-scrim')!.onclick = () => { cue('back'); closeNav(); };
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !current || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (!closeNav()) closeHub();
  });
  /* 系统返回键 / 返回手势（触屏有 swipeBack 的同页历史哨兵接住它）：和返回按钮一样逐层退，导航开着先收导航。 */
  window.addEventListener('popstate', () => {
    /* 哨兵只在触屏挂（swipeBack.ts）；键鼠访问的返回是真离开，触屏刚被撤掉时哨兵自己退的那一步也不算。 */
    if (!document.body.classList.contains('touch')) return;
    /* 弹窗开着时先关弹窗（原来这里直接不管，系统返回在弹窗上没反应）。战斗中不接。 */
    if (document.body.classList.contains('in-battle') && !document.querySelector('dialog[open]')) return;
    backOne();
  });
}
