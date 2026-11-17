/* 设置 → 资源 → 预载全部资源。
   清单（dist/asset-manifest.json，构建时生成）列出线上会用到的每个文件和大小，按目录分组显示占用。
   点开始后在下载闸的第 3 级（最低）里逐个 fetch：只填浏览器缓存，不解码、不留在内存，
   眼前要看的图、开打预载、对战换图都排在它前面，所以玩家不用等它，也不会被它拖慢。 */

import { assetUrl, netTask } from '../assets/loader.ts';

const $ = (id: string) => document.getElementById(id)!;

const GROUPS: [string, string][] = [
  ['sprites', '角色动作'], ['bgm', '音乐'], ['avatars', '头像'], ['stages', '舞台'], ['finale', '终幕图'],
  ['assets', '程序'], ['albums', '乐队封面'], ['frames', '头像框'], ['fonts', '字体'], ['icons', '按键图标'], ['sfx', '音效'],
];
const LABEL = new Map(GROUPS);

interface Group { key: string; label: string; total: number; done: number; files: [string, number][] }

let groups: Group[] = [];
let all: [string, number][] = [];
const doneSet = new Set<string>();
let failed = 0;
let state: 'loading' | 'none' | 'idle' | 'running' | 'paused' | 'done' = 'loading';
let gen = 0;
let left = 0;

const mb = (n: number) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const sum = (xs: [string, number][]) => xs.reduce((n, f) => n + f[1], 0);
const groupOf = (path: string) => LABEL.has(path.split('/')[0]) ? path.split('/')[0] : 'assets';

function paint(): void {
  const list = $('set-res-list');
  const total = sum(all);
  const done = sum(all.filter(f => doneSet.has(f[0])));
  if (state === 'loading') $('set-res-sum').textContent = '正在读取资源清单…';
  else if (state === 'none') $('set-res-sum').textContent = '开发版没有资源清单，构建后的线上版本可用。';
  else if (state === 'idle' && !done) $('set-res-sum').textContent = `共 ${mb(total)}，建议连 Wi-Fi`;
  else $('set-res-sum').textContent = `已缓存 ${mb(done)} / 共 ${mb(total)}` + (failed ? `，${failed} 个失败` : '');
  ($('set-res-bar') as HTMLElement).style.setProperty('--p', total ? String(done / total) : '0');
  // 设置里的入口行：一行字，宽度不随状态跳。
  const entry = $('set-res-open');
  entry.style.setProperty('--p', total && state !== 'done' && done ? String(done / total) : '0');
  $('set-res-state').textContent = state === 'loading' ? '…' : state === 'none' ? '仅线上版本'
    : state === 'running' ? `下载中 ${Math.floor(done / total * 100)}%`
    : state === 'paused' ? `已暂停 ${Math.floor(done / total * 100)}%`
    : state === 'done' ? (failed ? `${failed} 个失败` : '已全部缓存')
    : done ? `还剩 ${mb(total - done)}` : mb(total);
  list.innerHTML = groups.map(g => {
    const p = g.total ? g.done / g.total : 0;
    return `<li style="--p:${p}"><b>${g.label}</b><span>${g.done && g.done < g.total ? `${mb(g.done)} / ` : ''}${mb(g.total)}</span>${p >= 1 ? '<em>✓</em>' : ''}</li>`;
  }).join('');
  const go = $('set-res-go') as HTMLButtonElement;
  go.disabled = state === 'loading' || state === 'none';
  go.textContent = state === 'running' ? '暂停' : state === 'paused' ? '继续下载'
    : state === 'done' ? (failed ? '重试失败的文件' : '已全部缓存') : `开始预载（${mb(total - done)}）`;
  if (state === 'done' && !failed) go.disabled = true;
}

function recount(): void {
  for (const g of groups) g.done = sum(g.files.filter(f => doneSet.has(f[0])));
}

/** Files this page already pulled count as cached: a fetch now would only hit the browser cache. */
function seenThisVisit(): Set<string> {
  const seen = new Set<string>();
  try {
    for (const e of performance.getEntriesByType('resource')) seen.add(e.name.split('#')[0]);
  } catch { /* no timing API */ }
  return seen;
}

const urlOf = (path: string) => new URL(assetUrl('/' + path), document.baseURI).href;

async function loadManifest(): Promise<void> {
  try {
    const r = await fetch(assetUrl('/asset-manifest.json'), { cache: 'no-cache' });
    if (!r.ok) throw Error(String(r.status));
    const data = await r.json() as { files?: [string, number][] };
    all = (data.files ?? []).filter(f => Array.isArray(f) && typeof f[0] === 'string' && Number.isFinite(f[1]));
    if (!all.length) throw Error('empty');
  } catch {
    state = 'none';
    paint();
    return;
  }
  const by = new Map<string, Group>();
  for (const f of all) {
    const key = groupOf(f[0]);
    let g = by.get(key);
    if (!g) by.set(key, g = { key, label: LABEL.get(key) ?? key, total: 0, done: 0, files: [] });
    g.files.push(f);
    g.total += f[1];
  }
  groups = [...by.values()].sort((a, b) => b.total - a.total);
  const seen = seenThisVisit();
  for (const f of all) if (seen.has(urlOf(f[0]))) doneSet.add(f[0]);
  recount();
  state = doneSet.size === all.length ? 'done' : 'idle';
  paint();
}

/** Read the body to the end so the browser keeps it in its cache, without holding the bytes. */
async function warm(path: string): Promise<boolean> {
  const r = await fetch(assetUrl('/' + path), { priority: 'low' } as RequestInit);
  if (!r.ok) return false;
  const reader = r.body?.getReader();
  if (!reader) { await r.arrayBuffer(); return true; }
  for (;;) { const { done } = await reader.read(); if (done) return true; }
}

function start(): void {
  const my = ++gen;
  failed = 0;
  const todo = all.filter(f => !doneSet.has(f[0]));
  // Small files first: the list fills in quickly, the big music and sheets come last.
  todo.sort((a, b) => a[1] - b[1]);
  left = todo.length;
  state = left ? 'running' : 'done';
  paint();
  let painted = 0;
  for (const [path] of todo) {
    void netTask(`bulk:${path}`, 3, async () => {
      if (my !== gen) return;
      try { if (await warm(path)) doneSet.add(path); else failed++; }
      catch { failed++; }
    }).then(() => {
      if (my !== gen) return;
      left--;
      recount();
      if (!left) state = 'done';
      // A few hundred small files: repaint at most every 120ms, plus the last one.
      const now = performance.now();
      if (!left || now - painted > 120) { painted = now; paint(); }
    });
  }
}

function pause(): void {
  gen++; // queued jobs of the old generation return without fetching
  state = 'paused';
  paint();
}

export function bindResources(openDialog: (d: HTMLDialogElement) => void): void {
  const box = $('set-res-open');
  const dlg = $('res-dialog') as HTMLDialogElement;
  box.addEventListener('click', () => openDialog(dlg));
  $('close-res').addEventListener('click', () => dlg.close());
  $('set-res-go').addEventListener('click', () => {
    if (state === 'running') pause();
    else if (state === 'idle' || state === 'paused' || (state === 'done' && failed)) start();
  });
  paint();
  let asked = false;
  const ask = () => { if (!asked) { asked = true; void loadManifest(); } };
  // The manifest is read the first time this card is on screen, not on page load.
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); ask(); } });
    io.observe(box);
  } else ask();
}
