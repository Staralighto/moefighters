/* 头像框详情：左边是一块战斗画面（舞台图 + 和战斗里同一套 .hud 标记与样式），框直接套在双方头像上；
   右边是名字、获取途径和与卡片上同一个按钮（购买 / 使用 / 去商店…）。「换一组」随机换两位角色看效果。
   HUD 在这里不挂 id，样式只靠类名，和战斗里的规则完全一致；--hud 按画面宽度 ÷ 1000 缩放。 */

import { PUBLIC_ROSTER } from '../data/characters.ts';
import { STAGES } from '../data/stages.ts';
import { ITEM_BY_ID } from '../shop/catalog.ts';
import { ALBUMS } from '../tasks/defs.ts';
import { applyImageUrl, cssUrl, loadImage } from '../assets/loader.ts';
import { hubSignal } from './hub.ts';
import { frameArt } from '../shop/state.ts';
import { avatarImg } from './items.ts';
import type { CardState } from './merch.ts';
import { renderSide, type SideRun } from './detailSide.ts';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

let openDialog: (d: HTMLDialogElement) => void = d => d.showModal();
let openTick = 0;
export function setFramePreviewOpener(fn: (d: HTMLDialogElement) => void): void { openDialog = fn; }

let faces: [string, string] = ['', ''];

function player(n: 1 | 2, who: string, hp: number, mp: number): string {
  const c = PUBLIC_ROSTER.find(x => x.id === who);
  const name = esc(c?.name ?? '');
  const dots = n === 1 ? '●○' : '○○';
  const head = n === 1 ? `<div><b>${name}</b><span>${dots}</span></div>` : `<div><span>${dots}</span><b>${name}</b></div>`;
  return `<div class="hud-player${n === 2 ? ' second' : ''}">${head}`
    + `<div class="health" style="--guard:${n === 1 ? .8 : .45}"><span style="width:${hp}%"></span></div><small></small>`
    + `<div class="energy${mp >= 100 ? ' full' : ''}"><span style="width:${mp}%"></span></div>`
    + `${avatarImg(who, 'class="hud-avatar" width="96" height="96" decoding="async"')}</div>`;
}

/** 往一块画面里画 HUD 并套上头像框。scene 里要有一个 .hud.faces；尺寸由调用方用 sizeHudScene 跟着。 */
export function paintHudScene(scene: HTMLElement, id: string, who: [string, string] = defaultFaces(id)): void {
  const item = ITEM_BY_ID.get(id);
  const hud = scene.querySelector<HTMLElement>('.hud')!;
  const faces = who;
  hud.innerHTML = `<div class="hud-side">${player(1, faces[0], 72, 100)}</div>`
    + '<div class="timer"><small>ROUND 2</small><b>47</b></div>'
    + `<div class="hud-side">${player(2, faces[1], 38, 50)}</div>`;
  if (!item || item.base) { delete hud.dataset.frame; hud.style.removeProperty('--fr'); }
  else { const key = id.split(':')[1]; hud.dataset.frame = key; hud.style.setProperty('--fr', item.color ?? 'var(--gold)'); hud.style.setProperty('--frimg', frameArt(key)); }
}

const sized = new WeakSet<HTMLElement>();
let sceneSizer: ResizeObserver | null = null;
function setHudWidth(scene: HTMLElement, width: number): void {
  const hud = String(Math.min(1, width / 1000));
  if (scene.style.getPropertyValue('--hud') !== hud) scene.style.setProperty('--hud', hud);
}

/** 画面里的 HUD 按画面宽度 ÷ 1000 缩放（战斗里桌面画面约 1000 宽时 --hud = 1）。 */
export function sizeHudScene(scene: HTMLElement): void {
  setHudWidth(scene, scene.clientWidth || 700);
  if (sized.has(scene) || typeof ResizeObserver === 'undefined') return;
  sized.add(scene);
  sceneSizer ??= new ResizeObserver((entries, observer) => {
    for (const { target, contentRect } of entries) {
      const el = target as HTMLElement;
      if (!el.isConnected) { observer.unobserve(el); sized.delete(el); }
      else if (contentRect.width) setHudWidth(el, contentRect.width);
    }
  });
  sceneSizer.observe(scene);
}

export function stageArtUrl(): string { return (STAGES.find(s => s.id === 'ring') ?? STAGES[0])?.image ?? ''; }

/* 只预解码详情实际展示的框和头像。 */
function decodeUrl(src: string): Promise<void> {
  return src ? loadImage(src, 1).then(() => {}, () => {}) : Promise.resolve();
}
/** 把舞台图挂到 el 的 --fv-art 上：下好才挂，挂上的是绝对地址。 */
export function paintStageArt(el: HTMLElement): void {
  const src = stageArtUrl();
  if (src) applyImageUrl(src, url => el.style.setProperty('--fv-art', cssUrl(url)));
}

function paintScene(id: string): void { paintHudScene($('fv-scene'), id, faces); }

export function defaultFaces(id: string): [string, string] {
  const band = ALBUMS.find(a => a.id === id.split(':')[1]);
  if (band && band.members.length >= 2) return [band.members[0], band.members[1]];
  const a = pick(PUBLIC_ROSTER).id;
  let b = pick(PUBLIC_ROSTER).id;
  while (b === a && PUBLIC_ROSTER.length > 1) b = pick(PUBLIC_ROSTER).id;
  return [a, b];
}

/** 打开详情。state() 每次取最新状态，run 执行与卡片按钮相同的动作（买下时返回 'bought'）。 */
export function openFramePreview(id: string, state: () => CardState, run: SideRun): void {
  const tick = ++openTick;
  const signal = hubSignal();
  const mine = defaultFaces(id);
  const key = id.split(':')[1] ?? '';
  void Promise.all([
    decodeUrl(`/avatars/${mine[0]}.png`),
    decodeUrl(`/avatars/${mine[1]}.png`),
    key && key !== 'base' ? decodeUrl(`/frames/${key}.svg`) : Promise.resolve(),
  ]).then(() => {
    if (tick !== openTick || signal?.aborted) return;
    const dlg = $('frame-dialog') as HTMLDialogElement;
    const scene = $('fv-scene');
    paintStageArt(scene);
    faces = mine;
    paintScene(id);
    renderSide($('fv-side'), {
      id, kicker: 'FRAME', nameId: 'fv-name', hint: '战斗中双方头像都会换成这款。', state, run, dialog: dlg,
      tools: [{ label: '换一组角色', icon: 'i-shuffle', onClick: () => {
        const next = defaultFaces('frame:_');
        void Promise.all(next.map(who => decodeUrl(`/avatars/${who}.png`))).then(() => { faces = next; paintScene(id); });
      } }],
    });
    sizeHudScene(scene);
    openDialog(dlg);
  });
}

export function bindFramePreview(): void {
  const dlg = $('frame-dialog') as HTMLDialogElement;
  dlg.querySelector<HTMLButtonElement>('.fv-close')!.onclick = () => dlg.close();
}
