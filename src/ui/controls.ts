/** 操控设置：键位方案（基础 / 进阶）、进阶下的空白处手势开关、每个方案各自的横屏自定义布局。
 *  只有横屏叠键（.touchpad.in-tower）用得上进阶键位和自定义布局；竖屏分板一律按基础方案排。
 *
 *  布局坐标：按键中心按「离最近的左右边、离底边」存，单位是攻击键直径 ÷ 1.4（即 CSS 的 --atk），
 *  所以同一份布局在手机横屏、平板按键台、转屏之间都落在拇指的同一处。摇杆沿用 TOUCH_LAYOUT 的百分比。 */

export type Scheme = 'basic' | 'advanced';
export const SCHEMES: Scheme[] = ['basic', 'advanced'];

/** 按键中心。side = 从哪条边量 dx；dy 从底边量。k 缩放，a 透明度。 */
export interface KeySpot { side: 'l' | 'r'; dx: number; dy: number; k: number; a: number }
/** 摇杆中心，场地宽高的百分比。 */
export interface StickSpot { x: number; y: number; k: number; a: number }
export interface PadLayout { keys: Record<string, KeySpot>; stick: StickSpot | null; alpha: number }

interface ControlPrefs { scheme: Scheme; blank: boolean; layouts: Record<Scheme, PadLayout> }

const KEY = 'mf-controls';
/** 两键之间允许的最小直径，再小手指就点不准。 */
export const MIN_KEY_PX = 44;
export const MAX_SCALE = 1.8;

export const emptyLayout = (): PadLayout => ({ keys: {}, stick: null, alpha: 1 });
const prefs: ControlPrefs = { scheme: 'basic', blank: true, layouts: { basic: emptyLayout(), advanced: emptyLayout() } };

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** 读存档时逐项校验：坏一项丢一项，不让一条脏数据把按键摆出屏幕。 */
export function readLayout(raw: unknown): PadLayout {
  const out = emptyLayout();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { keys?: unknown; stick?: unknown; alpha?: unknown };
  out.alpha = num(r.alpha, .2, 1, 1);
  if (r.keys && typeof r.keys === 'object') {
    for (const [id, v] of Object.entries(r.keys as Record<string, unknown>)) {
      if (!/^[a-z0-9]{1,8}$/.test(id) || !v || typeof v !== 'object') continue;
      const s = v as Partial<KeySpot>;
      if (s.side !== 'l' && s.side !== 'r') continue;
      if (typeof s.dx !== 'number' || typeof s.dy !== 'number' || !Number.isFinite(s.dx) || !Number.isFinite(s.dy)) continue;
      out.keys[id] = { side: s.side, dx: num(s.dx, 0, 40, 0), dy: num(s.dy, 0, 40, 0), k: num(s.k, .3, MAX_SCALE, 1), a: num(s.a, .2, 1, 1) };
    }
  }
  if (r.stick && typeof r.stick === 'object') {
    const s = r.stick as Partial<StickSpot>;
    if (typeof s.x === 'number' && typeof s.y === 'number' && Number.isFinite(s.x) && Number.isFinite(s.y)) {
      out.stick = { x: num(s.x, 0, 100, 12), y: num(s.y, 0, 100, 82), k: num(s.k, .5, MAX_SCALE, 1), a: num(s.a, .2, 1, 1) };
    }
  }
  return out;
}

function load(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as { scheme?: unknown; blank?: unknown; layouts?: Record<string, unknown> };
    if (s.scheme === 'basic' || s.scheme === 'advanced') prefs.scheme = s.scheme;
    if (typeof s.blank === 'boolean') prefs.blank = s.blank;
    for (const k of SCHEMES) prefs.layouts[k] = readLayout(s.layouts?.[k]);
  } catch { /* private mode, or no localStorage */ }
}
load();

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  for (const fn of listeners) fn();
}

const listeners: (() => void)[] = [];
/** 方案、开关或布局变了。按键板据此重排。 */
export function onControls(fn: () => void): void { listeners.push(fn); }

export function scheme(): Scheme { return prefs.scheme; }
export function setScheme(s: Scheme): void { if (prefs.scheme !== s) { prefs.scheme = s; save(); } }
export function blankGesture(): boolean { return prefs.blank; }
export function setBlankGesture(on: boolean): void { if (prefs.blank !== on) { prefs.blank = on; save(); } }
export function layoutOf(s: Scheme): PadLayout { return prefs.layouts[s]; }
export function hasCustom(s: Scheme): boolean {
  const l = prefs.layouts[s];
  return !!l.stick || Object.keys(l.keys).length > 0 || l.alpha < 1;
}
export function saveLayout(s: Scheme, layout: PadLayout): void { prefs.layouts[s] = readLayout(layout); save(); }
export function resetLayout(s: Scheme): void { prefs.layouts[s] = emptyLayout(); save(); }

/** 编辑器拖动中的布局。存在时按键板照它画，存档不动。 */
let draft: PadLayout | null = null;
/** 编辑器预览：画上 `layout`（null 收回到存档），并让按键板重排一次。 */
export function previewLayout(layout: PadLayout | null): void {
  draft = layout;
  for (const fn of listeners) fn();
}

/** 竖屏分板不吃进阶和自定义：那里的按键是固定网格。 */
function landscapePad(): boolean { return !document.body.classList.contains('pad-split'); }
/** 当前这块按键板实际按哪套方案走。 */
export function liveScheme(): Scheme { return landscapePad() ? prefs.scheme : 'basic'; }
/** 进阶键位此刻生效：攻击键按下即出轻击，重击和后撤有自己的键。 */
export function advancedLive(): boolean { return liveScheme() === 'advanced'; }
/** 空白处点按后撤、按住格挡此刻是否接收。 */
export function blankLive(): boolean { return !advancedLive() || prefs.blank; }
/** 横屏自定义的摇杆位置；没有改过返回 null。 */
export function stickSpot(): StickSpot | null { return landscapePad() ? (draft ?? prefs.layouts[liveScheme()]).stick : null; }

/** 攻击键直径 ÷ 1.4，按键坐标的单位。量不到（宽屏键鼠收了攻击键）返回 0。 */
export function padUnit(pad: HTMLElement): number {
  const atk = pad.querySelector<HTMLElement>('.tp-actions .atk');
  const w = atk?.offsetWidth ?? 0;
  return w >= 2 ? w / 1.4 : 0;
}

/** 按键中心落在场地的哪一点（场地本地坐标，不受转屏旋转影响）。 */
export function spotCenter(spot: KeySpot, w: number, h: number, unit: number): { x: number; y: number } {
  return { x: spot.side === 'r' ? w - spot.dx * unit : spot.dx * unit, y: h - spot.dy * unit };
}
/** 反过来：场地本地坐标 → 存档用的按键中心。离哪边近就从哪边量。 */
export function centerSpot(x: number, y: number, w: number, h: number, unit: number, k = 1, a = 1): KeySpot {
  const side = x < w / 2 ? 'l' : 'r';
  const u = unit > 0 ? unit : 1;
  return { side, dx: Math.max(0, (side === 'r' ? w - x : x) / u), dy: Math.max(0, (h - y) / u), k, a };
}

function setClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}
function setVar(el: HTMLElement, prop: string, value: string | null): void {
  if (value === null) { if (el.style.getPropertyValue(prop)) el.style.removeProperty(prop); return; }
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

/**
 * 把方案和自定义布局画到按键板上。按键改成绝对定位（.free），--r / --b 是按键右下角到
 * .tp-actions 右下角的距离：那个盒子用 right / bottom 钉在场地右下，按键怎么挪它的右下角都不动。
 * `override` 给编辑器用：拖动中的布局先画上，不写存档。
 */
export function applyControls(override?: PadLayout): void {
  const pad = document.getElementById('touchpad');
  if (!pad) return;
  setClass(document.body, 'pad-adv', advancedLive());
  // 键鼠宽屏收了摇杆和攻击键，只剩技能指示，不套自定义布局；量不到攻击键也一样。
  const body = document.body.classList;
  const tower = pad.classList.contains('in-tower') && landscapePad() && !(body.contains('wide') && body.contains('keys')) && padUnit(pad) > 0;
  const layout = override ?? draft ?? prefs.layouts[liveScheme()];
  const actions = pad.querySelector<HTMLElement>('.tp-actions');
  const keys = actions ? [...actions.querySelectorAll<HTMLElement>('[data-pad]')] : [];
  const stick = pad.querySelector<HTMLElement>('[data-pad="stick"]');
  setVar(pad, '--pad-a', tower && layout.alpha < 1 ? String(layout.alpha) : null);
  if (stick) {
    const s = tower ? layout.stick : null;
    setVar(stick, '--k', s && s.k !== 1 ? String(s.k) : null);
    setVar(stick, '--a', s && s.a !== 1 ? String(s.a) : null);
  }
  const placed: [HTMLElement, KeySpot][] = [];
  for (const el of keys) {
    const spot = tower ? layout.keys[el.dataset.pad ?? ''] : undefined;
    setClass(el, 'free', !!spot);
    if (!spot) { for (const p of ['--r', '--b', '--k', '--a']) setVar(el, p, null); continue; }
    setVar(el, '--k', spot.k !== 1 ? String(spot.k) : null);
    setVar(el, '--a', spot.a !== 1 ? String(spot.a) : null);
    placed.push([el, spot]);
  }
  if (!placed.length || !actions) return;
  const unit = padUnit(pad);
  const w = pad.clientWidth, h = pad.clientHeight;
  if (!(unit > 0) || w < 2 || h < 2) return;
  const right = actions.offsetLeft + actions.offsetWidth;
  const bottom = actions.offsetTop + actions.offsetHeight;
  for (const [el, spot] of placed) {
    const c = spotCenter(spot, w, h, unit);
    // 存档是在别的屏幕上摆的（平板存、手机用，分屏改窗口）：中心夹回场地里，整颗键不出屏。
    const r = el.offsetWidth * spot.k / 2;
    c.x = Math.min(w - r, Math.max(r, c.x));
    c.y = Math.min(h - r, Math.max(r, c.y));
    setVar(el, '--r', `${Math.round((right - c.x) * 10) / 10}px`);
    setVar(el, '--b', `${Math.round((bottom - c.y) * 10) / 10}px`);
  }
}
