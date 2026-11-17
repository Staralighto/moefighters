/* 终幕播放器与终幕详情弹窗。
   playFinale：在任意 canvas 上循环播放某位角色的终幕（与战斗里同一个 drawFinale，喂一个只带时间的假对局）。
   每轮播完停一小会儿再从头；定格帧和切走后露出来的都是舞台图。商店的展台和仓库的详情弹窗都用它。 */

import { loadInto, staticUrl, type ImageCache } from '../assets/loader.ts';
import { PUBLIC_ROSTER } from '../data/characters.ts';
import type { CharacterData } from '../data/types.ts';
import { FINALE_TIME, finaleCues, type FightGame, type SfxKind } from '../game/game.ts';
import { ITEM_BY_ID } from '../shop/catalog.ts';
import { stageArtUrl } from './framePreview.ts';
import type { CardState } from './merch.ts';
import { renderSide, type SideRun } from './detailSide.ts';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const GAP = .9;

let openDialog: (d: HTMLDialogElement) => void = d => d.showModal();
let play: (k: SfxKind) => void = () => {};
let preload: () => void = () => {};
export function setFinalePreviewHooks(open: (d: HTMLDialogElement) => void, sound: (k: SfxKind) => void, warm: () => void): void {
  openDialog = open; play = sound; preload = warm;
}

const images: ImageCache = new Map();
let runs = 0;

export interface FinalePlayer { stop(): void; restart(): void }

/** 在 canvas 上循环播放。box 在加载期间挂 .loading。muted() 每次出声前问一次。 */
export function playFinale(canvas: HTMLCanvasElement, box: HTMLElement, char: CharacterData, muted: () => boolean): FinalePlayer {
  const spec = char.finale!;
  const at = 1e6 + ++runs * 100;
  let raf = 0, t0 = 0, cue = 0, live = true, onScreen = true;
  /* 看不见就不画：滚出视野，或者上面盖着别的弹窗（商店展台在详情弹窗后面时）。 */
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }) : null;
  io?.observe(canvas);
  const covered = () => { const d = document.querySelector('dialog[open]'); return !!d && !d.contains(canvas); };
  const restart = () => { t0 = performance.now(); cue = 0; };
  box.classList.add('loading');
  preload();
  const art = stageArtUrl();
  const srcs = [spec.art, ...(spec.props ?? []), art].filter((s): s is string => !!s);
  void Promise.all([import('../render/finale.ts'), ...srcs.map(s => loadInto(images, s))]).then(([m]) => {
    if (!live) return;
    m.prewarmFinale(spec);
    box.classList.remove('loading');
    restart();
    const cues = finaleCues(spec);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      let t = (performance.now() - t0) / 1000;
      if (t > FINALE_TIME + GAP) { restart(); t = 0; }
      const seen = onScreen && !covered();
      while (cue < cues.length && cues[cue][0] <= t) { const k = cues[cue++][1]; if (k && seen && !muted()) play(k); }
      if (!seen) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const c = canvas.getContext('2d');
      if (!c) return;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      if (t >= FINALE_TIME) return;
      /* drawFinale 只读这几个字段。finaleAt 每个播放器各不相同：终幕按它清烘焙缓存，换角色不会串图。 */
      const fake = { finaleBy: 0, finaleAt: at, age: at + t, finaleHint: 0, fighterById: () => ({ data: char }) } as unknown as FightGame;
      const snap = images.get(art);
      m.drawFinale(c, w, h, fake, images, snap ? { img: snap, x: 0, y: 0, w, h } : null);
    };
    raf = requestAnimationFrame(tick);
  });
  return {
    stop() { live = false; io?.disconnect(); cancelAnimationFrame(raf); const c = canvas.getContext('2d'); c?.clearRect(0, 0, canvas.width, canvas.height); },
    restart,
  };
}

export const charOfFinale = (id: string): CharacterData | undefined => {
  const c = PUBLIC_ROSTER.find(x => x.id === ITEM_BY_ID.get(id)?.char);
  return c?.finale ? c : undefined;
};

/* ---- 详情弹窗（仓库用） ---- */
let player: FinalePlayer | null = null;
let muted = false;

export function openFinalePreview(id: string, state: () => CardState, run: SideRun): void {
  const char = charOfFinale(id);
  if (!char) return;
  const dlg = $('finale-dialog') as HTMLDialogElement;
  const box = $('fn-stage');
  box.style.setProperty('--fv-art', `url("${staticUrl(stageArtUrl())}")`);
  const ult = char.skills.find(s => s.key === 'L')?.name ?? '';
  renderSide($('fn-side'), {
    id, kicker: 'FINALE', nameId: 'fn-name', state, run, dialog: dlg,
    sub: ult ? `<small>必杀</small>${esc(ult)}` : undefined,
    hint: '本地对战中用必杀终结对手时播放；联机对战双方都会看到。',
    tools: [
      { label: '重播', onClick: () => player?.restart() },
      { label: muted ? '声音 关' : '声音 开', pressed: !muted, onClick: b => { muted = !muted; b.textContent = muted ? '声音 关' : '声音 开'; b.setAttribute('aria-pressed', String(!muted)); } },
    ],
  });
  openDialog(dlg);
  player?.stop();
  player = playFinale($('fn-canvas') as HTMLCanvasElement, box, char, () => muted);
}

export function bindFinalePreview(): void {
  const dlg = $('finale-dialog') as HTMLDialogElement;
  dlg.querySelector<HTMLButtonElement>('.fv-close')!.onclick = () => dlg.close();
  dlg.addEventListener('close', () => { player?.stop(); player = null; });
}
