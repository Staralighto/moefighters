/* 剧情选关地图（样机 docs/mockups/story-map.html，V2 定稿）：后台壳里的一页（hub.ts），巡演导航里是「剧情」一站。
   背景：深靛底 + 3D 线框几何体缓慢旋转、随拖动视差 + 透视舞台地板 + 主界面同款装饰（斜纹胶囊、点阵圆、五线谱）。
   路线：地铁图式圆角折线连通上下两行；节点形状区分类型；右侧（竖屏是下方）明日方舟式详情大面板。
   交互（照明日方舟）：点关卡，详情面板从右侧（竖屏从下方）滑出；点地图空白处、按返回或 Esc 收回面板、取消选关。
   没解锁的关点了只抖一下，不出面板。键盘：←→ 在已解锁的关之间切换，Enter 开演。 */

import { STAGES } from '../data/stages.ts';
import { ROSTER_BY_ID } from '../data/characters.ts';
import { assetUrl } from '../assets/loader.ts';
import { reducedMotion } from '../ui/motion.ts';
import { hubOpen, type HubPage } from '../ui/hub.ts';
import { registerLayer } from '../ui/layerBack.ts';
import { cue, refuse } from '../ui/mobile.ts';
import { CHAPTERS, HEROES, goalText, stageById, type StoryStage } from './chapters.ts';
import { chapterProgress, cleared, goalMask, markSeen, nextStage, setLead, starCount, storyProgress, unlocked } from './progress.ts';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const ICON: Record<string, string> = {
  剧情: '<path d="M40 48h176M52 48c0 64 8 116 22 160M204 48c0 64-8 116-22 160M52 48c13 26 27 26 40 0 13 26 27 26 40 0 13 26 27 26 40 0 13 26 27 26 32 0"/>',
  战斗: '<path d="M48 48l160 160M208 48L48 208M48 160l48 48M160 208l48-48"/>',
  Boss: '<path d="M40 192l24-120 48 48 16-72 16 72 48-48 24 120z"/>',
  章末: '<path d="M128 32l26 62 66 6-50 44 15 66-57-35-57 35 15-66-50-44 66-6z"/>',
};
const KIND: Record<string, string> = { 剧情: 'story', 战斗: 'battle', Boss: 'boss', 章末: 'end' };
const STAR = (cls: string) => `<svg class="sm-star ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.5l-5.2 2.7 1-5.8L3.6 9.3l5.8-.8z"/></svg>`;
const starOf = (n: number) => n >= 3 ? 'full' : n > 0 ? 'part' : 'none';
const CHECK = '<span class="sm-done" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>';
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

let root: HTMLElement;
let mapEl: HTMLElement;
let world: HTMLElement;
let detail: HTMLElement;
let bg: HTMLCanvasElement;
let sel = '';
let raf = 0;
let S = 1;
let X0 = 0;
let GAP = 150;
let onPlay: (id: string) => void = () => {};

/** main.ts 接上「开演」。 */
export function setStoryPlay(fn: (id: string) => void): void { onPlay = fn; }
/** 回到地图时选中哪一关（刚打完的那关的下一关），面板直接开着。 */
let pending = '';
export function selectStage(id: string): void { pending = id; }

interface Placed { s: StoryStage; i: number; x: number; y: number }
let placed: Placed[] = [];

function layout(): void {
  const r = root.getBoundingClientRect();
  const port = r.width < r.height * 1.05;
  root.classList.toggle('port', port);
  // 竖屏：没选关时地图占满整页，选了关地图让出下半屏给详情。
  const H = port && sel ? r.height * .5 : r.height;
  S = Math.max(.82, Math.min(1.3, H / 393));
  const dw = port ? 0 : Math.round(Math.max(300 * S, Math.min(r.width * .38, 470 * S)));
  root.style.setProperty('--s', String(S));
  root.style.setProperty('--dw', dw + 'px');
  const bar = document.querySelector<HTMLElement>('#hub .hub-bar')?.offsetHeight ?? 56;
  const top = bar, mapH = H - top;
  const Y = (row: number) => top + mapH * .5 - 8 * S + (row - .5) * 120 * S;
  X0 = 300 * S; GAP = 150 * S;
  let html = '';
  placed = [];
  let i = 0, chX = 40 * S;
  for (const ch of CHAPTERS) {
    const prog = ch.stages.filter(s => cleared(s.id)).length;
    html += `<div class="sm-chapter" style="left:${chX}px;top:${top + mapH * .5 - 104 * S}px"><div class="no">${String(ch.no).padStart(2, '0')}</div><div class="en">${ch.en}</div><div class="zh">第${'一二三四五六七八九十'[ch.no - 1] ?? ch.no}章</div><div class="sub">${esc(ch.name)} · ${ch.stages.length} 关</div><div class="bar2"><i style="--k:${prog / ch.stages.length}"></i>${prog} / ${ch.stages.length}</div></div>`;
    // 每章的关从本章标题右边重新数起（j），不能接着全局序号 i 往后排，否则第 2 章起会多空出一整章的宽度。
    for (const [j, s] of ch.stages.entries()) {
      const x = X0 + chX - 40 * S + j * GAP + (s.type === 'Boss' ? 14 * S : 0) + (s.type === '章末' ? 30 * S : 0);
      placed.push({ s, i, x, y: Y(s.row) });
      i++;
    }
    chX = placed[placed.length - 1].x + 200 * S;
  }
  const worldW = placed[placed.length - 1].x + 160 * S;
  world.style.width = worldW + 'px';
  let done = '', todo = '';
  for (let k = 0; k < placed.length - 1; k++) {
    const a = placed[k], b = placed[k + 1];
    // 章与章之间不连线：中间是下一章的标题，线会从大号章节编号上穿过去。
    if (a.s.id.split('-')[0] !== b.s.id.split('-')[0]) continue;
    const mx = (a.x + b.x) / 2, rad = Math.min(14 * S, Math.abs(b.y - a.y) / 2), dir = Math.sign(b.y - a.y);
    const seg = dir === 0 ? `M${a.x} ${a.y}H${b.x}` : `M${a.x} ${a.y}H${mx - rad}Q${mx} ${a.y} ${mx} ${a.y + dir * rad}V${b.y - dir * rad}Q${mx} ${b.y} ${mx + rad} ${b.y}H${b.x}`;
    if (cleared(a.s.id)) done += seg; else todo += seg;
  }
  html += `<svg class="sm-path" aria-hidden="true"><path class="done" d="${done}"/><path class="todo" d="${todo}"/></svg>`;
  const next = nextStage();
  for (const p of placed) {
    const s = p.s, open = unlocked(s.id), ok = cleared(s.id);
    const st = ok ? 'cleared' : s.id === next ? 'next' : open ? '' : 'locked';
    let tail = '';
    if (ok) tail = s.battle ? STAR(starOf(starCount(goalMask(s.id)))) : CHECK;
    html += `<button type="button" class="sm-node ${KIND[s.type]} ${st}${s.id === sel ? ' sel' : ''}" data-id="${s.id}" style="left:${p.x}px;top:${p.y}px" data-cue="tab" aria-label="${s.id} ${open ? esc(s.title) : '未解锁'}">`
      + `<span class="card"><span class="ico"><svg viewBox="0 0 256 256" aria-hidden="true">${ICON[s.type]}</svg></span><span class="code">${s.id}</span>${tail}</span>`
      + `<span class="name">${open ? esc(s.title) : '？？？'}</span></button>`;
  }
  world.innerHTML = html;
  for (const b of world.querySelectorAll<HTMLButtonElement>('.sm-node')) b.onclick = () => pick(b.dataset.id!);
  root.classList.toggle('has-sel', !!sel);
  detail.inert = !sel;
}

function face(id: string, foe = false): string {
  const c = ROSTER_BY_ID.get(id);
  return c ? `<img class="${foe ? 'foe' : ''}" src="${assetUrl(`/avatars/${id}.png`)}" alt="${esc(c.name)}" title="${esc(c.name)}">` : '';
}

function paintDetail(): void {
  const s = placed.find(p => p.s.id === sel)?.s;
  // 收回时保留旧内容，让面板带着内容滑出去。
  if (!s) return;
  const open = unlocked(s.id);
  const scene = STAGES.find(x => x.id === s.scene);
  const mask = goalMask(s.id);
  const fight = s.battle;
  const lead = storyProgress().lead;
  const goals = fight ? `<ul class="sm-goals">${fight.goals.map((g, k) => {
    const got = !!(mask >> k & 1);
    return `<li class="${got ? 'got' : ''}">${STAR(got ? starOf(starCount(mask)) : 'none')}${esc(goalText(g))}</li>`;
  }).join('')}</ul>` : '';
  const us = fight ? fight.us ?? (lead ? [...HEROES].reverse() : [...HEROES]) : s.cast;
  const cast = fight
    ? `${us.map(id => face(id)).join('')}<span class="vs">VS</span>${fight.foes.map(f => face(f.id, true)).join('')}`
    : us.map(id => face(id)).join('');
  // 操控切换只在祥子 + 初华同上的关（第 1 章）；第 2 章起每关出战角色固定。
  const leadSeg = fight && !fight.us ? `<div class="sm-row"><span class="sm-label">操控</span><span class="seg sm-lead" role="radiogroup" aria-label="操控">${HEROES.map((id, k) => `<button type="button" role="radio" data-lead="${k}" aria-checked="${lead === k}"${lead === k ? ' class="active"' : ''}>${esc(ROSTER_BY_ID.get(id)?.name ?? id)}</button>`).join('')}</span></div>` : '';
  detail.innerHTML = `
    <div class="sm-scene">${scene?.image && open ? `<img src="${assetUrl(scene.image)}" alt="">` : ''}</div>
    <span class="sm-deco" aria-hidden="true"></span><span class="sm-water" aria-hidden="true">${s.id}</span>
    <div class="sm-body">
      <span class="sm-tag">${esc(open && scene ? scene.name : '？？？')}</span>
      <div class="sm-head"><span class="code">${s.id}</span><span class="type${s.type === 'Boss' ? ' boss' : ''}">${s.type}</span></div>
      <div class="sm-title">${open ? esc(s.title) : '？？？'}</div>
      <p class="sm-teaser">${open ? esc(s.teaser) : '通过上一关后解锁。'}</p>
      ${open ? `<div class="sm-row"><span class="sm-label">${fight ? '对阵' : '登场'}</span><div class="sm-cast">${cast}</div></div>` : ''}
      ${open && fight?.rule ? `<p class="sm-rule">${esc(fight.rule)}</p>` : ''}
      ${open ? goals : ''}
      ${open ? leadSeg : ''}
      <button type="button" class="sm-go" ${open ? '' : 'disabled'} data-cue="none">${fight ? '开演' : '观看'}<small>${fight ? 'START' : 'PLAY'}</small>${ARROW}</button>
    </div>`;
  detail.querySelector<HTMLButtonElement>('.sm-go')!.onclick = () => { if (unlocked(s.id)) onPlay(s.id); };
  for (const b of detail.querySelectorAll<HTMLButtonElement>('[data-lead]')) b.onclick = () => { setLead(Number(b.dataset.lead)); paintDetail(); };
}

function pick(id: string): void {
  const node = world.querySelector<HTMLElement>(`.sm-node[data-id="${id}"]`);
  if (!unlocked(id)) { refuse(node?.querySelector<HTMLElement>('.card') ?? null); return; }
  if (id === sel) return;
  const reflow = root.classList.contains('port') && !sel;
  sel = id;
  remember(id);
  for (const b of world.querySelectorAll<HTMLElement>('.sm-node')) b.classList.toggle('sel', b.dataset.id === id);
  paintDetail();
  root.classList.add('has-sel');
  detail.inert = false;
  if (reflow) layout();
  reveal(true);
}

/** 收回面板、取消选关。 */
function deselect(): boolean {
  if (!sel) return false;
  const reflow = root.classList.contains('port');
  sel = '';
  for (const b of world.querySelectorAll<HTMLElement>('.sm-node.sel')) b.classList.remove('sel');
  root.classList.remove('has-sel');
  detail.inert = true;
  if (reflow) layout();
  return true;
}

/* 进地图时停在哪：上次最后选的关（还开着的话）→ 下一关 → 全部通过时最后一关。
   只是浏览位置，存本机就够，不进存档文件。 */
const LAST_KEY = 'mf.story.last';
function remember(id: string): void { try { localStorage.setItem(LAST_KEY, id); } catch { /* 无痕模式 */ } }
function focusId(): string {
  let last = '';
  try { last = localStorage.getItem(LAST_KEY) ?? ''; } catch { /* 无痕模式 */ }
  if (last && stageById(last) && unlocked(last)) return last;
  return nextStage() ?? placed[placed.length - 1]?.s.id ?? '';
}

/** 面板盖住的宽度（横屏）。 */
const covered = () => root.classList.contains('port') || !sel ? 0 : detail.offsetWidth;
/** 选中的关在地图可见区里（被面板盖住或在屏外就滚过去）。 */
function reveal(smooth: boolean): void {
  const p = placed.find(x => x.s.id === (sel || focusId()));
  if (!p) return;
  const vis = mapEl.clientWidth - covered();
  const x = p.x - mapEl.scrollLeft;
  if (smooth && x > 80 * S && x < vis - 90 * S) return;
  mapEl.scrollTo({ left: Math.max(0, p.x - vis * .45), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
}

/** 剧情页正开着，且上面没有导航、弹窗、演出。 */
function onTop(): boolean {
  return !!root?.isConnected && hubOpen() === 'story' && document.getElementById('hub-nav')?.hidden !== false
    && !document.querySelector('dialog[open]') && document.getElementById('story-theatre')?.hidden !== false;
}

function step(dir: number): void {
  const open = placed.filter(p => unlocked(p.s.id));
  if (!open.length) return;
  const i = open.findIndex(p => p.s.id === sel);
  const to = i < 0 ? open.find(p => p.s.id === focusId()) ?? open[open.length - 1] : open[Math.max(0, Math.min(open.length - 1, i + dir))];
  if (to.s.id !== sel) { cue('tab'); pick(to.s.id); }
}

/* ---------- 背景 ---------- */
const PHI = (1 + Math.sqrt(5)) / 2;
type V3 = [number, number, number];
const ICO_V: V3[] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const edgesOf = (V: V3[]) => {
  const E: [number, number][] = [];
  const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const d = Math.min(...V.slice(1).map(v => dist(v, V[0])));
  for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++) if (Math.abs(dist(V[a], V[b]) - d) < .01) E.push([a, b]);
  return E;
};
const ICO_E = edgesOf(ICO_V);
const OCT_V: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], OCT_E = edgesOf(OCT_V);
const CUBE_V: V3[] = [...Array(8)].map((_, k) => [k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1] as V3), CUBE_E = edgesOf(CUBE_V);
const SOLIDS = [
  { at: -0.9, y: .5, size: 170, z: 1.5, V: ICO_V, E: ICO_E, spin: [.11, .07], col: '255,255,255', dot: '255,59,127', a: .2 },
  { at: 2.6, y: .2, size: 46, z: 2.4, V: OCT_V, E: OCT_E, spin: [.3, .2], col: '118,231,255', dot: '118,231,255', a: .35 },
  { at: 5.6, y: .8, size: 60, z: 2.0, V: CUBE_V, E: CUBE_E, spin: [.14, .22], col: '255,255,255', dot: '253,233,121', a: .22 },
  { at: 10, y: .5, size: 150, z: 1.3, V: ICO_V, E: ICO_E, spin: [-.09, .12], col: '255,59,127', dot: '255,59,127', a: .3 },
  { at: 8.2, y: .18, size: 34, z: 2.8, V: OCT_V, E: OCT_E, spin: [.4, -.25], col: '253,233,121', dot: '253,233,121', a: .4 },
];
const DECO = [
  { k: 'stripes', at: 1.3, y: .86, w: 200, h: 56, rot: -18, z: 1.8, col: '255,59,127', a: .22 },
  { k: 'dots', at: 3.9, y: .2, r: 62, z: 2.2, col: '118,231,255', a: .16 },
  { k: 'ring', at: 6.8, y: .82, r: 46, z: 1.7, col: '255,255,255', a: .1 },
  { k: 'tri', at: 4.7, y: .84, r: 24, rot: 12, z: 2.4, col: '253,233,121', a: .22 },
  { k: 'stripes', at: 9.1, y: .16, w: 160, h: 40, rot: 14, z: 2.0, col: '118,231,255', a: .16 },
  { k: 'dots', at: 11.3, y: .82, r: 54, z: 1.9, col: '255,59,127', a: .16 },
  { k: 'tri', at: .4, y: .16, r: 20, rot: -20, z: 2.6, col: '255,59,127', a: .3 },
];
function rot([x, y, z]: V3, a: number, b: number): V3 {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const x1 = x * ca - z * sa, z1 = x * sa + z * ca;
  return [x1, y * cb - z1 * sb, y * sb + z1 * cb];
}

/** 点阵底纹：每帧三千多个 fillRect 换成一块平铺图案，按视差偏移平铺。 */
let dotTile: CanvasPattern | null = null, dotStep = 0;
function dotPattern(cx: CanvasRenderingContext2D, step: number, dpr: number): CanvasPattern | null {
  if (dotTile && dotStep === step * dpr) return dotTile;
  const n = Math.max(1, Math.round(step * dpr));
  const t = document.createElement('canvas');
  t.width = t.height = n;
  const g = t.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,.045)';
  g.fillRect(0, 0, 1.3 * dpr, 1.3 * dpr);
  dotTile = cx.createPattern(t, 'repeat');
  dotStep = step * dpr;
  return dotTile;
}

function drawBg(t: number): void {
  // 剧情演出盖在地图上时不画（看不见，白占一份帧时间）。尺寸用 offsetWidth/Height：不像 getBoundingClientRect 那样每帧带出变换计算。
  if (document.documentElement.classList.contains('story-on')) return;
  const W = root.offsetWidth, H = root.offsetHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (!W || !H) return;
  if (bg.width !== Math.round(W * dpr) || bg.height !== Math.round(H * dpr)) { bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr); }
  const cx = bg.getContext('2d')!;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const port = root.classList.contains('port');
  const MH = port ? H * .5 : H;
  const dw = port ? 0 : parseFloat(root.style.getPropertyValue('--dw')) || 0;
  const scroll = mapEl.scrollLeft;
  cx.fillStyle = '#080a15'; cx.fillRect(0, 0, W, H);
  let g = cx.createRadialGradient(W * .18, H * .2, 0, W * .18, H * .2, W * .6); g.addColorStop(0, 'rgba(255,59,127,.10)'); g.addColorStop(1, 'rgba(255,59,127,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  g = cx.createRadialGradient(W * .8, H * .95, 0, W * .8, H * .95, W * .55); g.addColorStop(0, 'rgba(118,231,255,.07)'); g.addColorStop(1, 'rgba(118,231,255,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  const step = 14 * S, ox = -(scroll * .5) % step;
  const dots = dotPattern(cx, step, dpr);
  if (dots) {
    // 图案按设备像素铺：先回到 1:1，再平移到点阵的起点。
    cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0);
    dots.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round((ox + step) * dpr), Math.round(7 * dpr)]));
    cx.fillStyle = dots; cx.fillRect(0, 0, bg.width, bg.height);
    cx.restore();
  }
  const hz = MH * .64, vx = (W - dw) * .5;
  cx.save(); cx.beginPath(); cx.rect(0, hz, W, MH - hz); cx.clip();
  const fg = cx.createLinearGradient(0, hz, 0, MH); fg.addColorStop(0, 'rgba(255,59,127,0)'); fg.addColorStop(1, 'rgba(255,59,127,.16)');
  cx.strokeStyle = fg; cx.lineWidth = 1;
  const sp = 46 * S, off = -(scroll * .9) % sp;
  for (let k = -40; k <= 40; k++) { cx.beginPath(); cx.moveTo(vx + (k * sp + off) * .05, hz); cx.lineTo(vx + (k * sp + off) * 4, MH + 20); cx.stroke(); }
  for (let j = 1; j < 12; j++) { const yy = hz + Math.pow(j / 11, 2.2) * (MH - hz + 10); cx.beginPath(); cx.moveTo(0, yy); cx.lineTo(W, yy); cx.stroke(); }
  cx.restore();
  g = cx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.42, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.fillRect(0, hz, W, 1);
  for (const [x, col] of [[W * .3, '255,59,127'], [W * .62, '118,231,255']] as [number, string][]) {
    const b = cx.createLinearGradient(0, 0, 0, hz); b.addColorStop(0, `rgba(${col},.07)`); b.addColorStop(1, `rgba(${col},0)`);
    cx.fillStyle = b; cx.beginPath(); cx.moveTo(x - 20 * S, 0); cx.lineTo(x + 20 * S, 0); cx.lineTo(x + 160 * S, hz); cx.lineTo(x - 160 * S, hz); cx.fill();
  }
  const staffY = MH * .5 - 40 * S;
  cx.strokeStyle = 'rgba(255,255,255,.045)'; cx.lineWidth = 1;
  for (let k = 0; k < 5; k++) { cx.beginPath(); cx.moveTo(0, staffY + k * 9 * S); cx.lineTo(W, staffY + k * 9 * S); cx.stroke(); }
  const wx = (at: number) => X0 + at * GAP;
  const px = (at: number, z: number) => (wx(at) - scroll) / z + (W - dw) * (1 - 1 / z) * .5;
  for (const d of DECO) {
    const x = px(d.at, d.z), y = MH * d.y + Math.sin(t * .4 + d.at) * 4 * S;
    if (x < -300 || x > W + 300) continue;
    cx.save(); cx.translate(x, y); cx.rotate((d.rot ?? 0) * Math.PI / 180); cx.globalAlpha = d.a;
    if (d.k === 'stripes') {
      const w = d.w! * S, h = d.h! * S; cx.beginPath(); cx.roundRect(-w / 2, -h / 2, w, h, h / 2); cx.clip();
      cx.strokeStyle = `rgb(${d.col})`; cx.lineWidth = 7 * S; for (let s = -w; s < w; s += 16 * S) { cx.beginPath(); cx.moveTo(s, h); cx.lineTo(s + h * 2, -h); cx.stroke(); }
    } else if (d.k === 'dots') {
      const rr = d.r! * S; cx.fillStyle = `rgb(${d.col})`;
      for (let yy = -rr; yy <= rr; yy += 12 * S) for (let xx = -rr; xx <= rr; xx += 12 * S) if (xx * xx + yy * yy < rr * rr) { cx.beginPath(); cx.arc(xx, yy, 2 * S, 0, 7); cx.fill(); }
    } else if (d.k === 'ring') { cx.strokeStyle = `rgb(${d.col})`; cx.lineWidth = 10 * S; cx.beginPath(); cx.arc(0, 0, d.r! * S, 0, 7); cx.stroke(); }
    else { const rr = d.r! * S; cx.strokeStyle = `rgb(${d.col})`; cx.lineWidth = 4 * S; cx.lineJoin = 'round'; cx.beginPath(); cx.moveTo(0, -rr); cx.lineTo(rr * .87, rr * .5); cx.lineTo(-rr * .87, rr * .5); cx.closePath(); cx.stroke(); }
    cx.restore();
  }
  for (const o of SOLIDS) {
    const x = px(o.at, o.z), y = MH * o.y, R = o.size * S;
    if (x < -R * 2 || x > W + R * 2) continue;
    const a = t * o.spin[0] + o.at, b = t * o.spin[1] + .5;
    const pts = o.V.map(v => { const n = Math.hypot(...v); const [rx, ry, rz] = rot(v.map(c => c / n) as V3, a, b); const f = 3 / (3 + rz); return [x + rx * R * f, y + ry * R * f, rz]; });
    cx.lineWidth = 1.2;
    for (const [i, j] of o.E) { const d = (pts[i][2] + pts[j][2]) / 2; cx.strokeStyle = `rgba(${o.col},${o.a * (.35 + .65 * (1 - d) / 2)})`; cx.beginPath(); cx.moveTo(pts[i][0], pts[i][1]); cx.lineTo(pts[j][0], pts[j][1]); cx.stroke(); }
    for (const p of pts) { cx.fillStyle = `rgba(${o.dot},${o.a * 1.6 * (1 - p[2]) / 2 + .05})`; cx.beginPath(); cx.arc(p[0], p[1], 2.2 * S * (3 / (3 + p[2])), 0, 7); cx.fill(); }
  }
}

function loop(now: number): void {
  drawBg(reducedMotion() ? 4 : now / 1000);
  raf = reducedMotion() ? 0 : requestAnimationFrame(loop);
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
export const storyPage: HubPage = {
  title: '剧情',
  en: 'STORY',
  loading: { line: '舞台布景中', en: 'SETTING THE STAGE' },
  mount(host) {
    host.innerHTML = '<div class="sm" data-scheme="dark"><canvas class="sm-bg" aria-hidden="true"></canvas><div class="sm-map"><div class="sm-world"></div></div><aside class="sm-detail" aria-live="polite"></aside></div>';
    root = host.querySelector('.sm')!;
    bg = root.querySelector('.sm-bg')!;
    mapEl = root.querySelector('.sm-map')!;
    world = root.querySelector('.sm-world')!;
    detail = root.querySelector('.sm-detail')!;
    mapEl.addEventListener('scroll', () => { if (!raf) drawBg(4); }, { passive: true });
    // 点地图空白处（不是关卡节点）：收回面板。拖动地图后的那次点击已在下面拦掉。
    mapEl.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.sm-node') && deselect()) cue('back'); });
    // 返回键 / 系统返回：面板开着先收面板，再退出剧情页。
    registerLayer(() => onTop() && deselect());
    // Esc 在后台壳里是直接关页面：面板开着时先在捕获阶段接住，只收面板。键盘左右切关、Enter 开演。
    addEventListener('keydown', e => {
      if (!onTop() || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape' && sel) { e.preventDefault(); e.stopPropagation(); deselect(); cue('back'); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
      else if (e.key === 'Enter' && sel && !(e.target as HTMLElement).closest?.('button, input, textarea')) { e.preventDefault(); if (unlocked(sel)) onPlay(sel); }
    }, { capture: true });
    // 鼠标拖动整条路线（触屏本来就能横滑）。
    let drag: { x: number; left: number; moved: boolean } | null = null;
    mapEl.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: mapEl.scrollLeft, moved: false }; });
    addEventListener('pointermove', e => { if (!drag) return; const d = e.clientX - drag.x; if (Math.abs(d) > 4) drag.moved = true; mapEl.scrollLeft = drag.left - d; });
    addEventListener('pointerup', () => { if (drag?.moved) { const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); }; mapEl.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => mapEl.removeEventListener('click', stop, { capture: true }), 0); } drag = null; });
    mapEl.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { mapEl.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (root.isConnected && root.offsetParent) { layout(); paintDetail(); drawBg(4); } }, 120); });
  },
  enter() {
    // 从首页进来：不选关，面板收着（明日方舟同款）；打完一关回来：选中下一关、面板开着。
    sel = stageById(pending) && unlocked(pending) ? pending : '';
    if (sel) remember(sel);
    pending = '';
    layout();
    paintDetail();
  },
  ready() {
    layout();
    paintDetail();
    reveal(false);
    markSeen();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  },
  leave() { cancelAnimationFrame(raf); raf = 0; },
};

/** 地图已经开着（剧情关演完回来）：按新进度重画。 */
export function refreshStoryMap(): void {
  if (!root?.isConnected) return;
  // 打完一关回来选中的下一关也算「最后选的关」：下次进地图停在这里。
  if (stageById(pending) && unlocked(pending)) { sel = pending; remember(sel); }
  pending = '';
  layout();
  paintDetail();
  reveal(false);
  markSeen();
}

/** 首页入口卡、大厅进度卡上的一行字。 */
export function progressLine(): { title: string; done: number; total: number } {
  const p = chapterProgress();
  return { title: `第${'一二三四五六七八九十'[p.no - 1] ?? p.no}章`, done: p.done, total: p.total };
}
