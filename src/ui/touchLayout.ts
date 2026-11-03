import { battleFrame, pictureHud } from './battleFrame.ts';
import { clampStick } from './stageFit.ts';
import { TOUCH_LAYOUT } from './touchLayout.data.ts';
import { onMediaChange } from './media.ts';

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
    pad.classList.remove('in-tower');
    setClass('stage-deck', false);
    // 竖屏画面只有手机那么宽。血条按桌面像素画会占掉上沿，这里跟画面宽度走，再留 1.2 倍。
    if (split && arena.clientWidth >= 2) setStyle(arena, '--hud', pictureHud(arena.clientWidth).toFixed(4));
    else arena.style.removeProperty('--hud');
    applyTouchLayout();
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

    // 先定 HUD 比例，再量 HUD 有多高，画面才知道往下让多少。
    const probe = battleFrame(viewW, viewH);
    // 手机用 probe.hud（高度占比）：矮屏把 HUD 压到和桌面 16:9 相同的画面占比。
    // 宽屏不走占比：桌面窗口按宽铺满后画面已放大 scale 倍，HUD 跟画面同倍数，压在 1–2 倍之间。
    const hud = wide ? Math.min(2, Math.max(1, probe.scale)) : probe.hud;
    setStyle(arena, '--hud', hud.toFixed(4));
    let shift = 0;
    let frame = probe;
    if (probe.deck) {
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

    // 摇杆中心按场地夹紧，矮窗口里 1.25 倍环的盒子不探出边。每次从原始中心重算。
    if (stick) {
      const ring = pad.querySelector('.tp-ring')?.getBoundingClientRect().width ?? 0;
      // 有按键台时摇杆也落到台上：环的盒子贴底（和技能键同样留 6px），不再悬在画面地面中段。
      // 摇杆按控件层夹紧：控件层已经扣掉刘海和 home 条，画面本身铺到屏幕边。
      const padW = pad.clientWidth || viewW;
      const padH = pad.clientHeight || viewH;
      let y = TOUCH_LAYOUT.stick.y;
      if (frame.deck && ring > 0) y = Math.max(y, (padH - 6 - ring * 1.25 / 2) / padH * 100);
      const placed = clampStick(TOUCH_LAYOUT.stick.x, y, ring, padW, padH);
      setStyle(stick, '--x', `${Math.round(placed.x * 10) / 10}%`);
      setStyle(stick, '--y', `${Math.round(placed.y * 10) / 10}%`);
    }
  };

  // 同一帧合并。apply 自己写的类和样式会再触发观察者，值不变时 setStyle / setClass 不写，循环自然停下。
  let queued = 0;
  const schedule = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; apply(); });
  };
  // 转屏、全屏、回到前台之后，不少浏览器的视口数要过几帧才落定，且不一定再发 resize。
  // 之后再补量几次；apply 幂等，值没变什么也不写。
  const settle = () => {
    schedule();
    for (const ms of [120, 350, 800]) setTimeout(schedule, ms);
  };
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
  apply();
}
