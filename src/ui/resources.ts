/* 设置 → 资源下载。设置里只是一行入口，明细在二级弹窗 #res-dialog。
   下载本身归 src/assets/prefetch.ts：这里只显示进度（有缓存 worker 时读 Cache Storage，重开游戏也记得）、
   切「后台下载」三档、「立即下载全部」/ 暂停，以及清除缓存。 */

import {
  boostPrefetch, clearAssetCache, onPrefetchChange, pausePrefetch, prefetchMode, prefetchView, resumePrefetch, setPrefetchMode,
  type Entry, type Mode,
} from '../assets/prefetch.ts';
import { bindSeg } from './settings.ts';

const $ = (id: string) => document.getElementById(id)!;

const GROUPS: [string, string][] = [
  ['sprites', '角色动作'], ['bgm', '音乐'], ['portraits', '立绘'], ['avatars', '头像'], ['stages', '舞台'], ['finale', '终幕图'],
  ['assets', '程序'], ['albums', '乐队封面'], ['frames', '头像框'], ['fonts', '字体'], ['icons', '按键图标'], ['sfx', '音效'],
];
const LABEL = new Map(GROUPS);
const TIP: Record<Mode, string> = {
  smart: '空闲时自动下载。移动网络或无法判断网络时，只下小文件和马上要用的。',
  all: '空闲时自动下载全部资源，不区分网络。',
  off: '只在用到时下载。',
};

const mb = (n: number) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const sum = (xs: readonly Entry[]) => xs.reduce((n, f) => n + f[1], 0);
const groupOf = (path: string) => LABEL.has(path.split('/')[0]) ? path.split('/')[0] : 'assets';

let clearArmed = 0;

function paint(): void {
  const v = prefetchView();
  const total = sum(v.files);
  const done = sum(v.files.filter(f => v.have.has(f[0])));
  const all = v.state === 'ok' && done >= total && total > 0;
  const pct = total ? Math.floor(done / total * 100) : 0;
  const status = v.paused ? '，已暂停' : v.stalled ? '，网络恢复后继续' : v.active ? '，下载中' : '';
  $('set-res-sum').textContent = v.state === 'loading' ? '正在读取资源清单…'
    : v.state === 'none' ? '开发版没有资源清单，构建后的线上版本可用。'
    : all ? `已全部缓存，共 ${mb(total)}`
    : `已缓存 ${mb(done)} / 共 ${mb(total)}${status}`;
  ($('set-res-bar') as HTMLElement).style.setProperty('--p', total ? String(done / total) : '0');
  $('set-res-tip').textContent = TIP[v.mode];

  const entry = $('set-res-open');
  entry.style.setProperty('--p', total && !all && done ? String(done / total) : '0');
  $('set-res-state').textContent = v.state === 'loading' ? '…' : v.state === 'none' ? '仅线上版本'
    : all ? '已全部缓存'
    : v.paused ? `已暂停 ${pct}%`
    : v.active ? `下载中 ${pct}%`
    : done ? `已缓存 ${pct}%` : mb(total);

  const by = new Map<string, { label: string; total: number; done: number }>();
  for (const f of v.files) {
    const key = groupOf(f[0]);
    let g = by.get(key);
    if (!g) by.set(key, g = { label: LABEL.get(key) ?? key, total: 0, done: 0 });
    g.total += f[1];
    if (v.have.has(f[0])) g.done += f[1];
  }
  $('set-res-list').innerHTML = [...by.values()].sort((a, b) => b.total - a.total).map(g => {
    const p = g.total ? g.done / g.total : 0;
    return `<li style="--p:${p}"><b>${g.label}</b><span>${g.done && g.done < g.total ? `${mb(g.done)} / ` : ''}${mb(g.total)}</span>${p >= 1 ? '<em>✓</em>' : ''}</li>`;
  }).join('');

  const go = $('set-res-go') as HTMLButtonElement;
  go.disabled = v.state !== 'ok' || all;
  go.textContent = v.state === 'none' ? '仅线上版本'
    : all ? '已全部缓存'
    : v.paused ? '继续下载'
    : v.boost || v.active ? '暂停'
    : `立即下载全部（${mb(total - done)}）`;
  const clear = $('set-res-clear') as HTMLButtonElement;
  clear.hidden = v.state !== 'ok' || !done;
  clear.textContent = clearArmed ? '再点一次清除' : '清除缓存';
}

let painting = 0;
function schedulePaint(): void {
  if (painting) return;
  painting = window.setTimeout(() => { painting = 0; paint(); }, 150);
}

export function bindResources(openDialog: (d: HTMLDialogElement) => void): void {
  const dlg = $('res-dialog') as HTMLDialogElement;
  $('set-res-open').addEventListener('click', () => { paint(); openDialog(dlg); });
  $('close-res').addEventListener('click', () => dlg.close());
  $('set-res-go').addEventListener('click', () => {
    const v = prefetchView();
    if (v.paused) resumePrefetch();
    else if (v.boost || v.active) pausePrefetch();
    else boostPrefetch();
    paint();
  });
  $('set-res-clear').addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = window.setTimeout(() => { clearArmed = 0; paint(); }, 3000);
      paint();
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = 0;
    void clearAssetCache().then(paint);
  });
  bindSeg('set-res-mode-seg', {
    get: prefetchMode,
    set: value => setPrefetchMode(value as Mode),
  });
  onPrefetchChange(schedulePaint);
  paint();
}
