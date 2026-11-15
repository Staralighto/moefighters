import { battleFrame, pictureHud } from './battleFrame.ts';
import { clampStick } from './stageFit.ts';
import { TOUCH_LAYOUT } from './touchLayout.data.ts';
import { onMediaChange } from './media.ts';
import { applyControls, onControls, stickSpot } from './controls.ts';
import { CAM_MIN_RATIO, setCameraBox } from './battleCamera.ts';
import { H, W } from '../game/constants.ts';

/** Paint saved centers onto the pad. Inline styles win over the CSS defaults. Only the stick is free-placed now. */
export function applyTouchLayout(): void {
  for (const [id, place] of Object.entries(TOUCH_LAYOUT)) {
    const el = document.querySelector<HTMLElement>(`[data-pad="${id}"]`);
    if (!el) continue;
    setStyle(el, '--x', place.x + '%');
    setStyle(el, '--y', place.y + '%');
  }
}

/** 值没变就不写。重复写 inline style 会让观察者再进来一次。 */
function setStyle(el: HTMLElement, prop: string, value: string): void {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

function setClass(name: string, on: boolean): void {
  if (document.body.classList.contains(name) !== on) document.body.classList.toggle(name, on);
}

/**
 * 横屏铺满时竞技场要不要钉高度。返回 null = 不钉，交给 CSS 的 `position: fixed; inset: 0` 铺满整屏。
 *
 * 只有视觉视口确实比布局视口矮（地址栏、底部工具条盖在页面上）时才钉成视觉视口的高和偏移，
 * 让贴底的按键留在看得见的地方。不再拿几个视口数取最小值常驻：全屏切换、导航条收起的过程中
 * 只要读到一次旧的小值，盒子就被钉短，下面露出一条黑边；钉住后 ResizeObserver 也不再报告变化，
 * 不发 resize 的 WebView 里永远恢复不了。
 */
function visualPin(): { top: number; height: number } | null {
  const vv = window.visualViewport;
  const layout = window.innerHeight;
  if (!vv || !(vv.height >= 2) || !Number.isFinite(layout) || layout < 2) return null;
  // 转屏途中两套视口数各说各的（一个已经横了、一个还竖着）：这时钉高度必错，宁可不钉，等数落定再量。
  if ((vv.width > vv.height) !== (window.innerWidth > window.innerHeight)) return null;
  if (vv.height >= layout - 2) return null;
  const top = Math.min(Math.max(0, vv.offsetTop || 0), Math.max(0, layout - vv.height));
  return { top: Math.round(top), height: Math.round(vv.height) };
}

/** HUD 下沿到竞技场顶的距离，含头像下面挂出来的票根（22/96 脸高，不撑 HUD 盒子）。 */
function hudClearance(arena: HTMLElement): number {
  const hud = arena.querySelector<HTMLElement>('.hud');
  if (!hud) return 0;
  const top = arena.getBoundingClientRect().top;
  let bottom = hud.getBoundingClientRect().bottom;
  const avatar = hud.querySelector<HTMLElement>('.hud-avatar:not([hidden])');
  if (avatar) {
    const r = avatar.getBoundingClientRect();
    bottom = Math.max(bottom, r.top + r.height * (1 + 22 / 96));
  }
  return bottom - top;
}

/**
 * 战斗画面的三种排法，全部由实际窗口几何决定（不信 orientation 查询，套壳里它会和宽高各说各话）：
 *
 * - 竖屏触屏（宽高比 < 0.8）→ `pad-split`：画面在上，下面一块按键板。按键尺寸由 CSS 的 --u 封顶，平板不会放出巨型按钮。
 * - 横屏或近方屏触屏 / 转屏（turned）/ 桌面宽屏 → `stage-fill` 铺满可见区域，按键叠在画面上：
 *   · 比 16:9 宽（手机）：按宽铺满，裁掉一点天空和地面。
 *   · 比 16:9 高（平板、16:10）：再挂 `stage-deck`。画面完整显示，不拉伸也不虚化补边；
 *     多出来的高度分成上下两条：上条放血条，下条是按键台，摇杆和技能键落在台上。
 */
/** 宽高比达到这个值就不再上下分板。 */
export const SPLIT_MAX_RATIO = 0.8;

const layoutHooks: (() => void)[] = [];
/** 战斗版式每排完一次就通知（转屏、退出横屏、按键台变化……）：跟着版式走的浮层（暂停菜单）在这里重放。 */
export function onBattleLayout(fn: () => void): void { layoutHooks.push(fn); }

export function bindBattleFrame(): void {
  const arena = document.getElementById('arena');
  const canvas = document.getElementById('game');
  const pad = document.getElementById('touchpad');
  if (!arena || !canvas || !pad) return;
  const landscape = matchMedia('(orientation: landscape)');
  const stick = pad.querySelector<HTMLElement>('[data-pad="stick"]');

  const reset = (split: boolean) => {
    for (const p of ['top', 'height', 'bottom']) arena.style.removeProperty(p);
    canvas.style.top = '';
    canvas.style.height = '';
    canvas.style.width = '';
    canvas.style.left = '';
    setCameraBox(canvas, 0, 0);
    pad.classList.remove('in-tower');
    setClass('stage-deck', false);
    setClass('stage-cam', false);
    // 竖屏画面只有手机那么宽。血条按桌面像素画会占掉上沿，这里跟画面宽度走，再留 1.2 倍。
    if (split && arena.clientWidth >= 2) setStyle(arena, '--hud', pictureHud(arena.clientWidth).toFixed(4));
    else arena.style.removeProperty('--hud');
    applyTouchLayout();
    applyControls();
    for (const fn of layoutHooks) fn();
  };

  /** 摇杆中心按场地夹紧，矮窗口里 1.25 倍环的盒子不探出边。每次从原始中心重算。
   *  拆出来单独用：布局编辑器拖摇杆时只重放摇杆，不重跑整套战斗排版（那会按拖动中的键重量按键台，画面跟着上下滑）。 */
  let lastDeck = false;
  const placeStick = () => {
    if (stick) {
      const frame = { deck: lastDeck };
      const viewW = arena.clientWidth, viewH = arena.clientHeight;
      const ring = pad.querySelector('.tp-ring')?.getBoundingClientRect().width ?? 0;
      // 有按键台时摇杆也落到台上：环的盒子贴底（和技能键同样留 6px），不再悬在画面地面中段。
      // 摇杆按控件层夹紧：控件层已经扣掉刘海和 home 条，画面本身铺到屏幕边。
      const padW = pad.clientWidth || viewW;
      const padH = pad.clientHeight || viewH;
      // 玩家摆过的摇杆照摆的位置放，不再被按键台往下压。
      const own = stickSpot();
      let y = own ? own.y : TOUCH_LAYOUT.stick.y;
      if (!own && frame.deck && ring > 0) y = Math.max(y, (padH - 6 - ring * 1.25 / 2) / padH * 100);
      const placed = clampStick(own ? own.x : TOUCH_LAYOUT.stick.x, y, ring, padW, padH);
      setStyle(stick, '--x', `${Math.round(placed.x * 10) / 10}%`);
      setStyle(stick, '--y', `${Math.round(placed.y * 10) / 10}%`);
    }
  };

  const apply = () => {
    const body = document.body.classList;
    // 已经是横屏还留着 turned，会在横屏之上再转 90°，摇杆旋出屏外。change 事件不来时这里摘掉。
    if (window.innerWidth > window.innerHeight && body.contains('turned')) body.remove('turned');
    // 上下分板要竖着放下顶栏 + 两块 16:9。手机（≈0.46）和平板竖屏（≈0.75）放得下；
    // 方屏、折叠屏内屏（≥0.8）放不下，按键会掉出屏幕，改走铺满：比 16:9 高自然就是按键台版式。
    const land = window.innerWidth >= window.innerHeight * SPLIT_MAX_RATIO;
    const battle = body.contains('in-battle');
    const touch = body.contains('touch');
    const turned = body.contains('turned');
    const wide = body.contains('wide');
    const split = battle && touch && !turned && !wide && !land;
    // stage-fill 只指触屏横屏这一套 CSS；转屏和宽屏各有自己的类，三者共用下面的画面计算。
    setClass('pad-split', split);
    setClass('stage-fill', battle && touch && land && !wide);
    if (!(battle && (wide || turned || (touch && land)))) { reset(split); return; }

    // 转过来的战斗已经是横向盒子（CSS 按 vmin / dvh 量好），再钉竖屏高度会把它拉长。
    const pin = turned ? null : visualPin();
    if (pin) {
      setStyle(arena, 'top', `${pin.top}px`);
      setStyle(arena, 'height', `${pin.height}px`);
      setStyle(arena, 'bottom', 'auto');
    } else {
      for (const p of ['top', 'height', 'bottom']) arena.style.removeProperty(p);
    }
    const viewW = arena.clientWidth;
    const viewH = arena.clientHeight;
    if (viewW < 2 || viewH < 2) return;
    pad.classList.add('in-tower');
    // 方案和自定义布局先落位：按键台的高度要按挪过的键来量。
    applyControls();

    // 先定 HUD 比例，再量 HUD 有多高，画面才知道往下让多少。
    const probe = battleFrame(viewW, viewH);
    // 手机用 probe.hud（高度占比）：矮屏把 HUD 压到和桌面 16:9 相同的画面占比。
    // 宽屏不走占比：桌面窗口按宽铺满后画面已放大 scale 倍，HUD 跟画面同倍数，压在 1–2 倍之间。
    const hud = wide ? Math.min(2, Math.max(1, probe.scale)) : probe.hud;
    setStyle(arena, '--hud', hud.toFixed(4));
    let shift = 0;
    let frame = probe;
    // 比 16:9 高、但不算方：画面按高度铺满，左右交给跟随镜头（ui/battleCamera.ts）。
    const cam = probe.deck && viewW / viewH >= CAM_MIN_RATIO;
    setClass('stage-cam', cam);
    if (cam) {
      frame = { ...probe, deck: false, top: 0, imageH: viewH, scale: viewH / H };
      setStyle(canvas, 'width', `${Math.round(W * viewH / H)}px`);
      setStyle(canvas, 'left', '0px');
      setCameraBox(canvas, viewW, viewH);
    } else {
      canvas.style.width = '';
      canvas.style.left = '';
      setCameraBox(canvas, 0, 0);
    }
    if (probe.deck && !cam) {
      // HUD 可能已经被上一次排版往下推过，量的时候扣回去。
      const prior = Number.parseFloat(arena.style.getPropertyValue('--deck-shift')) || 0;
      const hudClear = Math.ceil(hudClearance(arena) - prior) + 6;
      // 按键台要的高度：贴底的技能群和摇杆里最高的那个，再留 8px。
      const ring = pad.querySelector('.tp-ring')?.getBoundingClientRect().width ?? 0;
      let deckNeed = ring > 0 ? ring * 1.25 + 6 : 0;
      const bottom = arena.getBoundingClientRect().bottom;
      for (const el of pad.querySelectorAll<HTMLElement>('.tp-actions button')) {
        const r = el.getBoundingClientRect();
        if (r.height >= 2) deckNeed = Math.max(deckNeed, bottom - r.top);
      }
      deckNeed = Math.ceil(deckNeed) + 8;
      // 方屏、折叠屏内屏的空余比 HUD + 按键台还多：HUD 和画面整块往下挪一半，空白上下各一份，
      // 不在画面和按键之间留一大条死区。
      const extra = viewH - probe.imageH - hudClear - deckNeed;
      shift = extra > 0 ? Math.round(extra / 2) : 0;
      frame = battleFrame(viewW, viewH, hudClear + shift);
    }
    setStyle(arena, '--deck-shift', `${shift}px`);
    setClass('stage-deck', frame.deck);
    setStyle(canvas, 'height', `${Math.round(frame.imageH)}px`);
    setStyle(canvas, 'top', `${Math.round(frame.top)}px`);

    lastDeck = frame.deck;
    placeStick();
    applyControls();
    for (const fn of layoutHooks) fn();
  };

  // 同一帧合并。apply 自己写的类和样式会再触发观察者，值不变时 setStyle / setClass 不写，循环自然停下。
  let queued = 0;
  const schedule = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; apply(); });
  };
  /* 转屏、进全屏、回前台之后视口数要过一阵才落定，而且落定那一下不一定再发任何事件。
     以前只在 120 / 350 / 800ms 补量三次：全屏动画或转屏慢的手机落定得更晚，最后一次量到的还是半途的数，
     画面就按那个高度钉住，上下留出大黑边，直到再转一次屏触发新事件才恢复。
     现在之后 2.5 秒内每帧比一次视口和竞技场尺寸，有变化就重排；战斗中再每秒巡检一次兜底。 */
  const viewSig = (): string => {
    const vv = window.visualViewport;
    return [window.innerWidth, window.innerHeight, vv?.width, vv?.height, vv?.offsetTop, arena.clientWidth, arena.clientHeight]
      .map(n => Math.round(n ?? 0)).join(',');
  };
  let lastSig = '';
  let settleUntil = 0;
  let settleRaf = 0;
  const settleTick = () => {
    settleRaf = 0;
    const now = viewSig();
    if (now !== lastSig) { lastSig = now; apply(); }
    if (performance.now() < settleUntil) settleRaf = requestAnimationFrame(settleTick);
  };
  const settle = () => {
    schedule();
    settleUntil = performance.now() + 2500;
    if (!settleRaf) settleRaf = requestAnimationFrame(settleTick);
  };
  setInterval(() => {
    if (document.hidden || !document.body.classList.contains('in-battle')) return;
    const now = viewSig();
    if (now !== lastSig) { lastSig = now; schedule(); }
  }, 1000);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(schedule);
    ro.observe(arena);
    // 2V2 多出副血条、头像加载后 HUD 变高，平板上画面要再往下让。
    const hudEl = arena.querySelector('.hud');
    if (hudEl) ro.observe(hudEl);
  }
  onMediaChange(landscape, () => {
    if (landscape.matches) document.body.classList.remove('turned');
    schedule();
  });
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  screen.orientation?.addEventListener?.('change', settle);
  window.addEventListener('pageshow', settle);
  document.addEventListener('fullscreenchange', settle);
  document.addEventListener('webkitfullscreenchange', settle);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); });
  window.visualViewport?.addEventListener('resize', schedule);
  // 地址栏只改偏移、不改高度时 resize 不来，贴底的键会停在可视区下面。
  window.visualViewport?.addEventListener('scroll', schedule);
  // 类变化走微任务、在绘制前排好，不让进战斗的第一帧闪一下旧布局。
  let wasBattle = false;
  new MutationObserver(() => {
    apply();
    const inBattle = document.body.classList.contains('in-battle');
    if (inBattle && !wasBattle) settle();
    wasBattle = inBattle;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  onControls(() => { if (document.body.classList.contains('pad-edit')) placeStick(); else schedule(); });
  apply();
}
