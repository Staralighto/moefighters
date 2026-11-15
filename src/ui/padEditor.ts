/** 横屏自定义布局编辑器。在暂停的真实战斗画面上摆键，所见即实战。
 *
 *  - 选择：点一个键单选；空白处拖出框多选；按住一个键 0.4 秒把它加入 / 移出选择；「全选」。
 *  - 移动：拖选中的任意一个键，整组一起走。中心和别的键横竖对齐时出参考线并吸住（可关）。
 *  - 大小：选中框角上的拉手，或双指在画面任意处捏合。单个键绕自己中心缩放；
 *    一组键以选框靠屏幕角的那个角为锚点整体缩放，大小和间距一起变。100% 附近轻吸。
 *  - 透明度：四个档位，作用于选中的键；什么都没选时作用于整体。
 *  - 预设：全部按键一键「小 / 中 / 大」，三套布局（紧凑 / 宽松 / 平板），左右镜像。
 *  - 撤销 / 重做：每次拖动、缩放、换透明度、预设、镜像、恢复默认都记一步。恢复默认另有二次确认。
 *  工具条只放图标；点完弹一句提示说明刚做了什么，长按 / 悬停有名字。
 *
 *  草稿只走 previewLayout，保存才写存档；取消、ESC 收回到存档。 */

import {
  MAX_SCALE, MIN_KEY_PX, applyControls, centerSpot, emptyLayout, layoutOf, padUnit, previewLayout, saveLayout,
  scheme, spotCenter, type KeySpot, type PadLayout, type Scheme,
} from './controls.ts';
import { TOUCH_LAYOUT } from './touchLayout.data.ts';

/** 手指移动超过这么多才算拖，不算点。 */
const SLOP = 6;
const LONG_PRESS = 400;
/** 对齐吸附的距离。 */
const SNAP = 8;
const HISTORY = 60;

const $ = (id: string) => document.getElementById(id)!;

interface Pt { x: number; y: number }
interface Item { x: number; y: number; k: number }

type Gesture =
  | { kind: 'press'; id: number; key: string; start: Pt; moved: boolean; prevSel: string[]; wasSelected: boolean; timer: number; from: Map<string, Item> }
  | { kind: 'marquee'; id: number; start: Pt; now: Pt }
  | { kind: 'scale'; id: number; start: Pt; anchor: Pt; from: Map<string, Item> }
  | { kind: 'pinch'; ids: [number, number]; d0: number; anchor: Pt; from: Map<string, Item> };

interface Session {
  scheme: Scheme;
  draft: PadLayout;
  /** 打开时（或恢复默认后）的按键改动。没碰过按键就原样存回，默认布局以后改了还能跟上。 */
  baseKeys: Record<string, KeySpot>;
  keysTouched: boolean;
  sel: Set<string>;
  gesture: Gesture | null;
  /** 手势开始前的草稿，手势真的改了东西才压进撤销栈。 */
  before: string | null;
  undo: string[];
  redo: string[];
  snap: boolean;
  /** 打开时各键的位置、大小、透明度，算「改了几个键」用。 */
  opened: Map<string, Item & { a: number }>;
  openedAlpha: number;
  done: (saved: boolean) => void;
}
let session: Session | null = null;
const pointers = new Map<number, Pt>();

const clone = (l: PadLayout): PadLayout => JSON.parse(JSON.stringify(l)) as PadLayout;

function pad(): HTMLElement { return $('touchpad'); }
function keyEls(): HTMLElement[] {
  return [...pad().querySelectorAll<HTMLElement>('.tp-actions [data-pad]')].filter(el => el.offsetWidth > 0);
}
function el(key: string): HTMLElement | null { return pad().querySelector<HTMLElement>(`[data-pad="${key}"]`); }
function allIds(): string[] { return ['stick', ...keyEls().map(k => k.dataset.pad!)]; }
/** 场地尺寸、按键单位、每个键未缩放的直径：编辑期间不变（只有窗口尺寸变了才变），缓存起来。
 *  每次拖动都要算十几个键，逐个去量 DOM 会在手机上一帧一帧强制重排，这是手机端点了慢半拍的来源之一。 */
let geo: { w: number; h: number; unit: number; base: Map<string, number> } | null = null;
function geom(): NonNullable<typeof geo> {
  if (!geo) { const p = pad(); geo = { w: p.clientWidth, h: p.clientHeight, unit: padUnit(p), base: new Map() }; }
  return geo;
}
window.addEventListener('resize', () => { geo = null; });
function size(): { w: number; h: number } { const g = geom(); return { w: g.w, h: g.h }; }
function unitNow(): number { return geom().unit; }

/** 指针 → 场地本地坐标。转屏时整块战斗顺时针转了 90°：内容的右是屏幕的下，内容的下是屏幕的左。 */
function local(x: number, y: number): Pt {
  const r = pad().getBoundingClientRect();
  if (document.body.classList.contains('turned')) return { x: y - r.top, y: r.right - x };
  return { x: x - r.left, y: y - r.top };
}

/* ---------- 草稿读写：中心、缩放、透明度 ---------- */

/** 没有改动的键按当前默认排法量出中心，写进草稿，之后每个键各管各的位置，拖一个不会挤动别的。 */
function snapshotKeys(s: Session): void {
  applyControls(emptyLayout());
  const p = pad();
  const actions = p.querySelector<HTMLElement>('.tp-actions');
  const unit = padUnit(p);
  const { w, h } = size();
  if (!actions || !(unit > 0)) return;
  const keys: Record<string, KeySpot> = {};
  for (const k of keyEls()) {
    const id = k.dataset.pad!;
    const kept = s.baseKeys[id];
    if (kept) { keys[id] = { ...kept }; continue; }
    const cx = actions.offsetLeft + k.offsetLeft + k.offsetWidth / 2;
    const cy = actions.offsetTop + k.offsetTop + k.offsetHeight / 2;
    keys[id] = centerSpot(cx, cy, w, h, unit);
  }
  s.draft.keys = keys;
}

/** 摇杆第一次被动时才记下它的位置；没动过就一直跟默认走。 */
function ensureStick(s: Session): NonNullable<PadLayout['stick']> {
  if (!s.draft.stick) {
    const e = el('stick');
    const x = Number.parseFloat(e?.style.getPropertyValue('--x') ?? '');
    const y = Number.parseFloat(e?.style.getPropertyValue('--y') ?? '');
    s.draft.stick = { x: Number.isFinite(x) ? x : 12, y: Number.isFinite(y) ? y : 82, k: 1, a: 1 };
  }
  return s.draft.stick;
}

/** 未缩放的直径。 */
function baseSize(key: string): number {
  const g = geom();
  let v = g.base.get(key);
  if (v === undefined) {
    const e = key === 'stick' ? pad().querySelector<HTMLElement>('.tp-ring') : el(key);
    v = e?.offsetWidth ?? 0;
    if (v > 0) g.base.set(key, v);
  }
  return v;
}

function item(key: string): Item | null {
  const s = session;
  if (!s) return null;
  const { w, h } = size();
  if (key === 'stick') {
    const st = s.draft.stick;
    if (st) return { x: st.x / 100 * w, y: st.y / 100 * h, k: st.k };
    const e = el('stick');
    const x = Number.parseFloat(e?.style.getPropertyValue('--x') ?? '');
    const y = Number.parseFloat(e?.style.getPropertyValue('--y') ?? '');
    return Number.isFinite(x) && Number.isFinite(y) ? { x: x / 100 * w, y: y / 100 * h, k: 1 } : null;
  }
  const spot = s.draft.keys[key];
  if (!spot) return null;
  return { ...spotCenter(spot, w, h, unitNow()), k: spot.k };
}

function radius(key: string, k: number): number { return baseSize(key) * k / 2; }

function setItem(key: string, x: number, y: number, k: number): void {
  const s = session;
  if (!s) return;
  const { w, h } = size();
  const r = radius(key, k);
  x = Math.min(w - r, Math.max(r, x));
  y = Math.min(h - r, Math.max(r, y));
  if (key === 'stick') {
    const st = ensureStick(s);
    st.x = x / w * 100;
    st.y = y / h * 100;
    st.k = k;
    return;
  }
  const old = s.draft.keys[key];
  s.draft.keys[key] = centerSpot(x, y, w, h, unitNow(), k, old?.a ?? 1);
  s.keysTouched = true;
}

function minScale(key: string): number {
  const w = baseSize(key);
  return w > 0 ? Math.min(1, MIN_KEY_PX / w) : .5;
}

function snapshotItems(keys: Iterable<string>): Map<string, Item> {
  const out = new Map<string, Item>();
  for (const k of keys) { const it = item(k); if (it) out.set(k, it); }
  return out;
}

/* ---------- 撤销 / 重做 ---------- */

const freeze = (s: Session) => JSON.stringify({ d: s.draft, t: s.keysTouched });
function thaw(s: Session, raw: string): void {
  const v = JSON.parse(raw) as { d: PadLayout; t: boolean };
  s.draft = v.d;
  s.keysTouched = v.t;
}
function beginEdit(s: Session): void { s.before = freeze(s); }
function commit(s: Session): void {
  if (s.before === null) return;
  if (s.before !== freeze(s)) {
    s.undo.push(s.before);
    if (s.undo.length > HISTORY) s.undo.shift();
    s.redo = [];
  }
  s.before = null;
  syncBar();
}
function stepHistory(back: boolean): void {
  const s = session;
  if (!s || s.gesture) return;
  const from = back ? s.undo : s.redo;
  const to = back ? s.redo : s.undo;
  const raw = from.pop();
  if (!raw) return;
  to.push(freeze(s));
  thaw(s, raw);
  paint();
}

/* ---------- 画面 ---------- */

let layer: HTMLElement | null = null;
const part = (cls: string) => {
  const d = document.createElement('div');
  d.className = cls;
  d.hidden = true;
  layer!.append(d);
  return d;
};
let box: HTMLElement, handle: HTMLElement, marquee: HTMLElement, guideV: HTMLElement, guideH: HTMLElement, readout: HTMLElement;

function mountLayer(): void {
  if (layer) return;
  layer = document.createElement('div');
  layer.className = 'pe-layer';
  pad().append(layer);
  box = part('pe-box');
  marquee = part('pe-marquee');
  guideV = part('pe-guide v');
  guideH = part('pe-guide h');
  readout = part('pe-readout');
  handle = part('pe-handle');
  handle.setAttribute('aria-hidden', 'true');
}

function place(e: HTMLElement, x: number, y: number, w: number, h: number): void {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  e.style.width = `${Math.max(0, w)}px`;
  e.style.height = `${Math.max(0, h)}px`;
}

/** 选中框：所有选中键外接圆的包围盒，外扩 6px。拉手放在离屏幕边更远的那个上角，拇指够得着、不出屏。 */
function selectionBox(): { x0: number; y0: number; x1: number; y1: number } | null {
  const s = session;
  if (!s || !s.sel.size) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of s.sel) {
    const it = item(k);
    if (!it) continue;
    const r = radius(k, it.k);
    x0 = Math.min(x0, it.x - r); y0 = Math.min(y0, it.y - r);
    x1 = Math.max(x1, it.x + r); y1 = Math.max(y1, it.y + r);
  }
  return Number.isFinite(x0) ? { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6 } : null;
}
function handleCorner(b: { x0: number; x1: number; y0: number }): Pt {
  const { w } = size();
  return (b.x0 + b.x1) / 2 > w / 2 ? { x: b.x0, y: b.y0 } : { x: b.x1, y: b.y0 };
}
/** 缩放锚点：拉手的对角，也就是选框靠屏幕下角的那个角。 */
function anchorFor(b: { x0: number; x1: number; y1: number }): Pt {
  const { w } = size();
  return (b.x0 + b.x1) / 2 > w / 2 ? { x: b.x1, y: b.y1 } : { x: b.x0, y: b.y1 };
}

function drawOverlay(): void {
  const s = session;
  if (!s || !layer) return;
  for (const k of pad().querySelectorAll<HTMLElement>('[data-pad]')) k.classList.toggle('picked', s.sel.has(k.dataset.pad!));
  const b = selectionBox();
  box.hidden = !b;
  handle.hidden = !b;
  if (b) {
    place(box, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    const c = handleCorner(b);
    handle.style.left = `${c.x}px`;
    handle.style.top = `${c.y}px`;
  }
  const g = s.gesture;
  marquee.hidden = g?.kind !== 'marquee';
  if (g?.kind === 'marquee') {
    place(marquee, Math.min(g.start.x, g.now.x), Math.min(g.start.y, g.now.y), Math.abs(g.now.x - g.start.x), Math.abs(g.now.y - g.start.y));
  }
}

function syncBar(): void {
  const s = session;
  if (!s) return;
  const n = s.sel.size;
  const badge = $('pe-count');
  badge.hidden = n === 0;
  badge.textContent = String(n);
  $('pe-undo').setAttribute('aria-disabled', String(!s.undo.length));
  $('pe-redo').setAttribute('aria-disabled', String(!s.redo.length));
  $('pe-snap').setAttribute('aria-pressed', String(s.snap));
  // 档位高亮：选中的键透明度都一样时亮那一档；没选时看整体透明度。
  const values = n ? [...s.sel].map(k => alphaOf(k)) : [s.draft.alpha];
  const same = values.every(v => Math.abs(v - values[0]) < .001) ? values[0] : -1;
  for (const b of $('pe-alpha-pop').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('active', Math.abs(Number(b.dataset.a) - same) < .001);
}

function alphaOf(key: string): number {
  const s = session!;
  return (key === 'stick' ? s.draft.stick?.a : s.draft.keys[key]?.a) ?? 1;
}

/** 两键圆形相交就标红，保存不可用。留 2px 余量，贴边摆不算重叠。 */
function checkClash(): boolean {
  const ids = allIds();
  const circles = ids.map(id => { const it = item(id); return it ? { id, x: it.x, y: it.y, r: radius(id, it.k) } : null; })
    .filter((c): c is { id: string; x: number; y: number; r: number } => !!c);
  const bad = new Set<string>();
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i], b = circles[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 2) { bad.add(a.id); bad.add(b.id); }
    }
  }
  for (const id of ids) el(id)?.classList.toggle('clash', bad.has(id));
  $('pe-warn').hidden = bad.size === 0;
  $('pe-save').setAttribute('aria-disabled', String(bad.size > 0));
  return bad.size > 0;
}

/** 画面刷新合并到下一帧：一帧里来几次 pointermove 也只排一次版、量一次重叠。
 *  草稿本身是同步改的，所有读草稿的逻辑（吸附、夹边、保存前的重叠检查）不受影响。 */
let paintQueued = 0;
function paint(): void {
  if (!session || paintQueued) return;
  paintQueued = requestAnimationFrame(() => {
    paintQueued = 0;
    if (!session) return;
    previewLayout(session.draft);
    applyControls();
    drawOverlay();
    dodgeBar();
    syncBar();
    checkClash();
  });
}

function showGuides(x: number | null, y: number | null): void {
  guideV.hidden = x === null;
  guideH.hidden = y === null;
  const { w, h } = size();
  if (x !== null) place(guideV, x, 0, 0, h);
  if (y !== null) place(guideH, 0, y, w, 0);
}

function showReadout(text: string | null, at?: Pt): void {
  readout.hidden = text === null;
  if (text === null || !at) return;
  readout.textContent = text;
  readout.style.left = `${at.x}px`;
  readout.style.top = `${at.y}px`;
}

/* ---------- 手势 ---------- */

/** 整组平移。被按住的键（primary）的中心跟别的键横竖对齐时吸过去，整组跟着补同样的量。 */
function moveGroup(g: Extract<Gesture, { kind: 'press' }>, p: Pt): void {
  const s = session!;
  let dx = p.x - g.start.x, dy = p.y - g.start.y;
  let gx: number | null = null, gy: number | null = null;
  const primary = g.from.get(g.key);
  if (s.snap && primary) {
    const want = { x: primary.x + dx, y: primary.y + dy };
    let bx = SNAP + 1, by = SNAP + 1;
    for (const id of allIds()) {
      if (s.sel.has(id)) continue;
      const o = item(id);
      if (!o) continue;
      if (Math.abs(o.x - want.x) < bx) { bx = Math.abs(o.x - want.x); gx = o.x; }
      if (Math.abs(o.y - want.y) < by) { by = Math.abs(o.y - want.y); gy = o.y; }
    }
    if (gx !== null) dx = gx - primary.x;
    if (gy !== null) dy = gy - primary.y;
  }
  // 整组一起夹在场地里：最先碰边的那个键决定这一步能走多远。
  const { w, h } = size();
  for (const [k, it] of g.from) {
    const r = radius(k, it.k);
    dx = Math.min(w - r - it.x, Math.max(r - it.x, dx));
    dy = Math.min(h - r - it.y, Math.max(r - it.y, dy));
  }
  for (const [k, it] of g.from) setItem(k, it.x + dx, it.y + dy, it.k);
  showGuides(gx, gy);
  paint();
}

/** 按比例 f 缩放：一个键绕自己中心；一组键绕锚点，位置和大小一起变。每个键的上下限换算成 f 的上下限。 */
function scaleGroup(from: Map<string, Item>, anchor: Pt, f: number): number {
  let lo = 0, hi = Infinity;
  for (const [k, it] of from) {
    lo = Math.max(lo, minScale(k) / it.k);
    hi = Math.min(hi, MAX_SCALE / it.k);
  }
  if (Math.abs(f - 1) < .03) f = 1;
  if (from.size === 1) {
    // 单个键吸到 100%：用户说的「原始大小」是 k = 1，不是手势开始时的大小。
    const [, it] = [...from][0];
    if (Math.abs(it.k * f - 1) < .04) f = 1 / it.k;
  }
  f = Math.min(hi, Math.max(lo, f));
  const single = from.size === 1;
  for (const [k, it] of from) {
    const x = single ? it.x : anchor.x + (it.x - anchor.x) * f;
    const y = single ? it.y : anchor.y + (it.y - anchor.y) * f;
    setItem(k, x, y, Math.round(it.k * f * 100) / 100);
  }
  return f;
}

function readoutText(from: Map<string, Item>, f: number): string {
  if (from.size === 1) return Math.round([...from.values()][0].k * f * 100) + '%';
  return '×' + f.toFixed(2);
}

/** 两根捏合手指的距离。按开始捏合时那两根的 id 取，第三根手指不算。 */
function spread(ids?: [number, number]): number {
  const [a, b] = ids ? [pointers.get(ids[0]), pointers.get(ids[1])] : [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function endGesture(cancel = false): void {
  const s = session;
  const g = s?.gesture;
  if (!s || !g) return;
  if (g.kind === 'press') clearTimeout(g.timer);
  s.gesture = null;
  $('pad-editor').classList.remove('pe-busy');
  showGuides(null, null);
  showReadout(null);
  if (cancel && s.before) { thaw(s, s.before); s.before = null; paint(); return; }
  commit(s);
  drawOverlay();
}

const onDown = (e: PointerEvent) => {
  const s = session;
  if (!s) return;
  const t = e.target as Element;
  if (t.closest?.('.pe-ui') || !$('arena').contains(t)) return;
  e.preventDefault();
  e.stopPropagation();
  closePops();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = local(e.clientX, e.clientY);

  // 第二根手指：不管第一根在做什么，改成捏合缩放当前选择。
  if (pointers.size === 2) {
    const g = s.gesture;
    if (g?.kind === 'press' && !s.sel.has(g.key)) s.sel = new Set([g.key]);
    if (g) { if (g.kind === 'press') clearTimeout(g.timer); s.gesture = null; }
    showGuides(null, null);
    const b = selectionBox();
    if (!b) { drawOverlay(); return; }
    if (s.before === null) beginEdit(s);
    const ids = [...pointers.keys()] as [number, number];
    s.gesture = { kind: 'pinch', ids, d0: spread(ids), anchor: anchorFor(b), from: snapshotItems(s.sel) };
    drawOverlay();
    return;
  }
  if (pointers.size > 2) return;

  if (t.closest('.pe-handle') && s.sel.size) {
    const b = selectionBox()!;
    beginEdit(s);
    s.gesture = { kind: 'scale', id: e.pointerId, start: p, anchor: s.sel.size === 1 ? { x: 0, y: 0 } : anchorFor(b), from: snapshotItems(s.sel) };
    return;
  }
  const keyEl = t.closest<HTMLElement>('[data-pad]');
  if (keyEl && pad().contains(keyEl)) {
    const key = keyEl.dataset.pad!;
    const prevSel = [...s.sel];
    const wasSelected = s.sel.has(key);
    if (!wasSelected) s.sel = new Set([key]);
    beginEdit(s);
    const g: Gesture = { kind: 'press', id: e.pointerId, key, start: p, moved: false, prevSel, wasSelected, timer: 0, from: snapshotItems(s.sel) };
    // 按住不动：把这个键加入 / 移出原来的选择。
    g.timer = window.setTimeout(() => {
      if (s.gesture !== g || g.moved) return;
      const next = new Set(g.prevSel);
      if (g.wasSelected) next.delete(key); else next.add(key);
      s.sel = next;
      s.gesture = null;
      s.before = null;
      navigator.vibrate?.(12);
      drawOverlay();
      syncBar();
    }, LONG_PRESS);
    s.gesture = g;
    drawOverlay();
    syncBar();
    return;
  }
  s.gesture = { kind: 'marquee', id: e.pointerId, start: p, now: p };
};

const onMove = (e: PointerEvent) => {
  const s = session;
  if (!s || !pointers.has(e.pointerId)) return;
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const g = s.gesture;
  if (!g) return;
  // 手指在摆键时工具条退到半透明，不挡视线。
  if (g.kind !== 'press' || g.moved) $('pad-editor').classList.add('pe-busy');
  if (g.kind === 'pinch') {
    if (!(g.d0 > 0)) return;
    const f = scaleGroup(g.from, g.anchor, spread(g.ids) / g.d0);
    const b = selectionBox();
    paint();
    if (b) showReadout(readoutText(g.from, f), handleCorner(b));
    return;
  }
  if (g.id !== e.pointerId) return;
  const p = local(e.clientX, e.clientY);
  if (g.kind === 'press') {
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < SLOP) return;
    if (!g.moved) { g.moved = true; clearTimeout(g.timer); }
    moveGroup(g, p);
  } else if (g.kind === 'marquee') {
    g.now = p;
    drawOverlay();
  } else if (g.kind === 'scale') {
    const a = g.from.size === 1 ? [...g.from.values()][0] : g.anchor;
    const d0 = Math.hypot(g.start.x - a.x, g.start.y - a.y);
    if (!(d0 > 0)) return;
    const f = scaleGroup(g.from, g.anchor, Math.hypot(p.x - a.x, p.y - a.y) / d0);
    paint();
    const b = selectionBox();
    if (b) showReadout(readoutText(g.from, f), handleCorner(b));
  }
};

const onUp = (e: PointerEvent) => {
  const s = session;
  if (!s || !pointers.delete(e.pointerId)) return;
  const g = s.gesture;
  if (!g) return;
  if (g.kind === 'pinch') { if (!g.ids.every(id => pointers.has(id))) endGesture(); return; }
  if (g.id !== e.pointerId) return;
  if (e.type === 'pointercancel') { endGesture(true); return; }
  if (g.kind === 'press' && !g.moved) {
    // 点一下组里的某个键：收成只选它。
    s.sel = new Set([g.key]);
  } else if (g.kind === 'marquee') {
    const x0 = Math.min(g.start.x, g.now.x), x1 = Math.max(g.start.x, g.now.x);
    const y0 = Math.min(g.start.y, g.now.y), y1 = Math.max(g.start.y, g.now.y);
    const tap = x1 - x0 < SLOP && y1 - y0 < SLOP;
    s.sel = new Set(tap ? [] : allIds().filter(id => {
      const it = item(id);
      return !!it && it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1;
    }));
  }
  endGesture();
  syncBar();
};

const onKey = (e: KeyboardEvent) => {
  const s = session;
  if (!s) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!$('pe-confirm').hidden) { $('pe-confirm').hidden = true; confirmAct = null; }
    else if (closePops()) return;
    else close(false);
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); stepHistory(!e.shiftKey); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopImmediatePropagation(); stepHistory(false); }
};

function setAlpha(a: number): void {
  const s = session;
  if (!s) return;
  beginEdit(s);
  if (!s.sel.size) s.draft.alpha = a;
  else for (const k of s.sel) {
    if (k === 'stick') ensureStick(s).a = a;
    else if (s.draft.keys[k]) { s.draft.keys[k].a = a; s.keysTouched = true; }
  }
  paint();
  commit(s);
  toast(`${s.sel.size ? `${s.sel.size} 个键` : '整体'}透明度 ${Math.round(a * 100)}%`);
}

/* ---------- 工具条：提示、弹层、避让 ---------- */

let toastTimer = 0;
function toast(text: string): void {
  const t = $('pe-toast');
  t.textContent = text;
  t.hidden = false;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, 1400);
}

const POPS: [string, string][] = [['pe-alpha-btn', 'pe-alpha-pop'], ['pe-preset-btn', 'pe-preset-pop']];
/** 收起弹层；有弹层被收起时返回 true。 */
function closePops(): boolean {
  let any = false;
  for (const [b, p] of POPS) {
    if (!$(p).hidden) any = true;
    $(p).hidden = true;
    $(b).setAttribute('aria-expanded', 'false');
  }
  return any;
}
function togglePop(btnId: string, popId: string): void {
  const open = $(popId).hidden;
  closePops();
  if (!open) return;
  const btn = $(btnId), pop = $(popId), bar = btn.parentElement!;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  placePop(btn, pop, bar);
}

/** 屏幕坐标 → 编辑器外壳里的本地坐标（转屏时同样顺时针转 90°）。 */
function rootLocal(x: number, y: number): Pt {
  const r = $('pad-editor').getBoundingClientRect();
  if (document.body.classList.contains('turned')) return { x: y - r.top, y: r.right - x };
  return { x: x - r.left, y: y - r.top };
}

/** 弹层挂在按钮正下方（工具条在下沿时挂在正上方），左右夹在画面里。全部用实际量出来的位置写 left / top，
 *  不依赖 CSS 里的 calc：之前那条 top 在一些内核里整条失效，弹层掉回左上角。 */
function placePop(btn: HTMLElement, pop: HTMLElement, bar: HTMLElement): void {
  const root = $('pad-editor');
  const r = btn.getBoundingClientRect();
  const c = rootLocal(r.left + r.width / 2, r.top + r.height / 2);
  const half = pop.offsetWidth / 2 + 8;
  const low = root.classList.contains('pe-low');
  const top = low ? bar.offsetTop - 8 - pop.offsetHeight : bar.offsetTop + bar.offsetHeight + 8;
  pop.style.left = `${Math.min(root.clientWidth - half, Math.max(half, c.x))}px`;
  pop.style.top = `${Math.max(4, top)}px`;
  pop.style.bottom = 'auto';
}

/** 选中的键跑到工具条底下时，工具条换到画面下沿。 */
function dodgeBar(): void {
  const root = $('pad-editor');
  // 手指正按在工具条上时不挪它：按下和松开落在不同位置，这次点击就丢了。
  if (root.querySelector('.pe-bar:active, .pe-pop:active')) return;
  const bar = root.querySelector<HTMLElement>('.pe-bar');
  const b = selectionBox();
  if (!bar) return;
  // 上沿和下沿各算一次会不会盖住选中的键：上面挡住、下面不挡才换到下面，两边都挡就留在上面。
  const zone = bar.offsetHeight + 22;
  const x0 = (root.clientWidth - bar.offsetWidth) / 2, x1 = x0 + bar.offsetWidth;
  const across = !!b && b.x1 > x0 && b.x0 < x1;
  const hitTop = across && b!.y0 < zone;
  const hitBottom = across && b!.y1 > root.clientHeight - zone;
  const low = hitTop && !hitBottom;
  if (root.classList.contains('pe-low') !== low) root.classList.toggle('pe-low', low);
}

/* ---------- 预设、镜像、全部大小 ---------- */

/** 左半边的东西以左下角为锚，右半边以右下角为锚：各自朝自己的角收拢或展开。 */
function sides(keys: Iterable<string>): [Map<string, Item>, Pt][] {
  const { w, h } = size();
  const left = new Map<string, Item>(), right = new Map<string, Item>();
  for (const [k, it] of snapshotItems(keys)) (it.x < w / 2 ? left : right).set(k, it);
  return [[left, { x: 0, y: h }], [right, { x: w, y: h }]];
}

/** 位置按 fPos、大小按 fSize 绕各自的角缩放，再整体挪 (dx, dy)。 */
function transform(keys: Iterable<string>, fPos: number, fSize: number, dx = 0, dy = 0): void {
  for (const [group, anchor] of sides(keys)) {
    for (const [k, it] of group) {
      const k2 = Math.min(MAX_SCALE, Math.max(minScale(k), Math.round(it.k * fSize * 100) / 100));
      const toward = anchor.x === 0 ? 1 : -1;
      setItem(k, anchor.x + (it.x - anchor.x) * fPos + toward * dx, anchor.y + (it.y - anchor.y) * fPos - dy, k2);
    }
  }
}

/** 草稿换回默认排法（保留各键透明度），给预设当起点。 */
function toDefault(s: Session): void {
  const alpha = new Map(allIds().map(k => [k, alphaOf(k)]));
  s.draft.keys = {};
  s.baseKeys = {};
  previewLayout(s.draft);
  snapshotKeys(s);
  s.draft.stick = { x: TOUCH_LAYOUT.stick.x, y: TOUCH_LAYOUT.stick.y, k: 1, a: alpha.get('stick') ?? 1 };
  for (const [k, a] of alpha) if (k !== 'stick' && s.draft.keys[k]) s.draft.keys[k].a = a;
  s.keysTouched = true;
}

const PRESETS: Record<string, { name: string; pos: number; size: number; up?: number; inward?: number }> = {
  compact: { name: '紧凑', pos: .86, size: .9 },
  roomy: { name: '宽松', pos: 1.18, size: 1 },
  // 平板拿在手里，拇指搭在两侧中段：按键整体抬高、往里收一点、放大一档。
  tablet: { name: '平板', pos: 1.05, size: 1.12, up: .12, inward: .02 },
};

function applyPreset(id: string): void {
  const s = session;
  const p = PRESETS[id];
  if (!s || !p) return;
  beginEdit(s);
  toDefault(s);
  const { w, h } = size();
  transform(allIds(), p.pos, p.size, (p.inward ?? 0) * w, (p.up ?? 0) * h);
  paint();
  commit(s);
  toast(`已套用「${p.name}」布局`);
}

/** 全部按键一键大小：按现在的平均大小换算倍数，位置和大小一起朝各自的角缩放。 */
function applySize(target: number, label: string): void {
  const s = session;
  if (!s) return;
  const ids = allIds();
  const ks = ids.map(k => item(k)?.k ?? 1);
  const avg = ks.reduce((a, b) => a + b, 0) / Math.max(1, ks.length);
  const f = target / avg;
  beginEdit(s);
  transform(ids, f, f);
  paint();
  commit(s);
  toast(`全部按键：${label}`);
}

function mirror(): void {
  const s = session;
  if (!s) return;
  beginEdit(s);
  const { w } = size();
  for (const [k, it] of snapshotItems(allIds())) setItem(k, w - it.x, it.y, it.k);
  paint();
  commit(s);
  toast('已左右镜像');
}

/** 工具条按钮：手指一抬起就执行，不等浏览器的 click（手机上 click 可能晚到，手指稍微一滑还会被当成拖动吞掉）。
 *  按下立刻挂 .down 给出按压反馈；键盘的回车 / 空格仍走 click。 */
function tap(el: HTMLElement, fn: () => void): void {
  let id: number | null = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    id = e.pointerId;
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
  });
  const end = (e: PointerEvent, fire: boolean) => {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('down');
    if (!fire) return;
    const r = el.getBoundingClientRect();
    // 抬起时还在按钮上（留 12px 余量）才算点到。
    if (e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12) fn();
  };
  el.addEventListener('pointerup', e => end(e, true));
  // 动作已经在 pointerup 里做了。吞掉触摸后浏览器补发的 click：保存 / 取消会立刻换出设置弹窗，
  // 那个迟到的 click 会落在新弹出来的控件上（iOS 尤其明显）。
  el.addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  el.addEventListener('pointercancel', e => end(e, false));
  el.addEventListener('click', e => { if (e.detail === 0) fn(); });
}

let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  // 按键板的盒子变了（视觉视口、刘海区、按键台）就丢掉几何缓存，下次用时重量。
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { geo = null; }).observe(pad());
  // 窗口捕获阶段最先拿到指针：编辑时战斗输入一律收不到。
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  document.addEventListener('keydown', onKey, true);
  // 不用 disabled：点了没反应最让人困惑。撤不了也给一句话。
  tap($('pe-undo'), () => { closePops(); toast(session?.undo.length ? (stepHistory(true), '已撤销') : '没有可以撤销的操作'); });
  tap($('pe-redo'), () => { closePops(); toast(session?.redo.length ? (stepHistory(false), '已重做') : '没有可以重做的操作'); });
  // 再按一次全选 = 全不选。
  tap($('pe-all'), () => {
    if (!session) return;
    closePops();
    const all = allIds();
    const full = all.every(k => session!.sel.has(k));
    session.sel = new Set(full ? [] : all);
    drawOverlay();
    dodgeBar();
    syncBar();
    toast(full ? '已取消选择' : `已全选 ${session.sel.size} 个`);
  });
  tap($('pe-snap'), () => {
    if (!session) return;
    closePops();
    session.snap = !session.snap;
    syncBar();
    toast(session.snap ? '已开启对齐吸附' : '已关闭对齐吸附');
  });
  tap($('pe-mirror'), () => { closePops(); mirror(); });
  for (const [b, p] of POPS) tap($(b), () => togglePop(b, p));
  for (const b of $('pe-alpha-pop').querySelectorAll<HTMLButtonElement>('button')) tap(b, () => setAlpha(Number(b.dataset.a)));
  for (const b of $('pe-preset-pop').querySelectorAll<HTMLButtonElement>('[data-size]')) tap(b, () => { closePops(); applySize(Number(b.dataset.size), b.textContent ?? ''); });
  for (const b of $('pe-preset-pop').querySelectorAll<HTMLButtonElement>('[data-preset]')) tap(b, () => { closePops(); applyPreset(b.dataset.preset!); });
  // 恢复默认会清掉所有改动，先问一句（撤销也能找回，但一下子全没了太吓人）。
  tap($('pe-reset'), () => {
    closePops();
    ask('恢复默认布局？', '恢复默认', () => {
      const s = session;
      if (!s) return;
      beginEdit(s);
      s.draft = emptyLayout();
      s.baseKeys = {};
      s.keysTouched = false;
      previewLayout(s.draft);
      snapshotKeys(s);
      paint();
      commit(s);
      toast('已恢复默认布局');
      // 摇杆回到默认后位置要等下一次排版。
      requestAnimationFrame(() => { if (session) drawOverlay(); });
    });
  });
  tap($('pe-confirm-no'), () => { $('pe-confirm').hidden = true; });
  $('pe-confirm').addEventListener('click', e => { if (e.target === $('pe-confirm')) $('pe-confirm').hidden = true; });
  tap($('pe-confirm-yes'), () => {
    $('pe-confirm').hidden = true;
    const act = confirmAct;
    confirmAct = null;
    act?.();
  });
  tap($('pe-cancel'), () => {
    const n = changedCount();
    if (!n) { close(false); return; }
    ask(`放弃这次对 ${n} 个按键的改动？`, '放弃改动', () => close(false));
  });
  tap($('pe-save'), () => {
    const s = session;
    if (!s) return;
    if (checkClash()) { toast('有按键重叠，先把标红的键挪开'); return; }
    const n = changedCount();
    if (!n) { close(false); return; }
    // 退出后就撤不回了：保存前把改了几个键说清楚，误触进来的人还有一次机会。
    ask(`本次改动了 ${n} 个按键，确认保存？`, '保存', () => {
      const out = clone(s.draft);
      if (!s.keysTouched) out.keys = s.baseKeys;
      saveLayout(s.scheme, out);
      close(true);
    });
  });
}

/** 二次确认：压暗画面，正中一张小卡。 */
let confirmAct: (() => void) | null = null;
function ask(title: string, yes: string, act: () => void): void {
  confirmAct = act;
  $('pe-confirm-title').textContent = title;
  $('pe-confirm-yes').textContent = yes;
  $('pe-confirm').hidden = false;
  ($('pe-confirm-no') as HTMLButtonElement).focus({ preventScroll: true });
}

/** 跟打开时比，位置、大小、透明度有变化的键数；整体透明度变了也算一项。 */
function changedCount(): number {
  const s = session;
  if (!s) return 0;
  let n = 0;
  for (const id of allIds()) {
    const a = s.opened.get(id), b = item(id);
    if (!a || !b) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > .5 || Math.abs(a.k - b.k) > .001 || Math.abs(a.a - alphaOf(id)) > .001) n++;
  }
  // 整体透明度动了，所有键都变了。
  if (Math.abs(s.openedAlpha - s.draft.alpha) > .001) n = allIds().length;
  return n;
}

function close(saved: boolean, notify = true): void {
  const s = session;
  if (!s) return;
  if (paintQueued) { cancelAnimationFrame(paintQueued); paintQueued = 0; }
  if (s.gesture?.kind === 'press') clearTimeout(s.gesture.timer);
  session = null;
  geo = null;
  pointers.clear();
  previewLayout(null);
  document.body.classList.remove('pad-edit');
  for (const k of pad().querySelectorAll('[data-pad]')) k.classList.remove('picked', 'clash');
  layer?.remove();
  layer = null;
  closePops();
  $('pe-confirm').hidden = true;
  $('pe-toast').hidden = true;
  $('pad-editor').classList.remove('pe-busy', 'pe-low');
  $('pad-editor').hidden = true;
  applyControls();
  if (notify) s.done(saved);
}

/** 战斗被别的路径收掉时（回选人、断线）直接关掉编辑器，不回调、不存。 */
export function abortPadEditor(): void { close(false, false); }

export function padEditing(): boolean { return !!session; }

/** 打开编辑器。调用方先把战斗暂停、把版式切到横屏叠键。 */
export function openPadEditor(done: (saved: boolean) => void): void {
  if (session) return;
  wire();
  const sch = scheme();
  const base = layoutOf(sch);
  document.body.classList.add('pad-edit');
  geo = null;
  const s: Session = {
    scheme: sch, draft: clone(base), baseKeys: clone(base).keys, keysTouched: false, sel: new Set(),
    gesture: null, before: null, undo: [], redo: [], snap: true, opened: new Map(), openedAlpha: base.alpha, done,
  };
  session = s;
  snapshotKeys(s);
  for (const [k, it] of snapshotItems(allIds())) s.opened.set(k, { ...it, a: alphaOf(k) });
  mountLayer();
  $('pad-editor').hidden = false;
  paint();
  syncBar();
  // 第一次进来提示一次三种基本手势，之后不再出现。
  let seen = true;
  try { seen = localStorage.getItem(HINT_KEY) === '1'; localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ }
  const hint = $('pe-hint');
  hint.hidden = seen;
  if (!seen) setTimeout(() => { hint.hidden = true; }, 3200);
}

const HINT_KEY = 'mf-pad-hint';
