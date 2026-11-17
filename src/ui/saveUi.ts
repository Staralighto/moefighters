/* 设置 → 存档：导出成一个 .json 文件，导入时与本机合并、先给确认表、确认后写入并重载页面。 */

import { hasFlag, setFlag } from '../save/inventory.ts';
import { currentRows, exportSave, optionalSections, planImport, saveFileName, type ImportPlan, type SummaryRow } from '../save/registry.ts';
import { toast } from './toast.ts';

const $ = (id: string) => document.getElementById(id)!;
const IMPORTED = 'mf.save.imported';
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function table(rows: SummaryRow[], head: string): string {
  if (!rows.length) return `<p class="save-empty">${esc(head)}：还没有任何进度</p>`;
  return `<dl class="save-table"><dt class="save-head">${esc(head)}</dt>${rows.map(r => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>`;
}

function stamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function download(skip: Set<string>): void {
  const blob = new Blob([exportSave(skip)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = saveFileName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('存档已导出');
}

const EXPORT_HINT = 'hint-export';
/** 第一次买成东西后留一条可关掉的提示。关过就不再出现。 */
export function hintExportOnce(): void {
  if (hasFlag(EXPORT_HINT) || typeof document === 'undefined') return;
  if (!setFlag(EXPORT_HINT)) return;
  const bar = document.createElement('div');
  bar.className = 'export-hint';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = '进度在这台设备上。可以到设置里导出一份存档。';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '知道了';
  close.onclick = () => bar.remove();
  bar.append(text, close);
  document.body.append(bar);
}

export function bindSaveUi(openDialog: (d: HTMLDialogElement) => void): void {
  const dialog = $('save-dialog') as HTMLDialogElement;
  const body = $('save-body');
  const ok = $('save-ok') as HTMLButtonElement;
  const file = $('save-file') as HTMLInputElement;
  let onOk: (() => void) | null = null;

  const show = (title: string, html: string, okLabel: string | null, action: (() => void) | null) => {
    $('save-heading').textContent = title;
    body.innerHTML = html;
    ok.hidden = !okLabel;
    ok.textContent = okLabel ?? '';
    onOk = action;
    ($('save-cancel') as HTMLButtonElement).textContent = okLabel ? '取消' : '知道了';
    if (!dialog.open) openDialog(dialog);
  };

  const exportFlow = () => {
    const opts = optionalSections().filter(o => o.has);
    if (!opts.length) { download(new Set()); return; }
    show('导出存档',
      table(currentRows(), '将导出') + opts.map(o => `<label class="save-opt"><input type="checkbox" data-opt="${esc(o.id)}" checked> 包含${esc(o.label)}</label>`).join(''),
      '导出', () => {
        const skip = new Set([...body.querySelectorAll<HTMLInputElement>('[data-opt]')].filter(c => !c.checked).map(c => c.dataset.opt!));
        dialog.close();
        download(skip);
      });
  };

  const confirmImport = (plan: ImportPlan) => {
    const when = stamp(plan.savedAt);
    const note = plan.fresh
      ? '<p class="save-note save-safe">这台设备上还没有游戏记录，导入只会把存档里的进度放进来，不会弄丢或弄坏任何东西。</p>'
      : '<p class="save-note">存档会和这台设备上的进度合并：解锁过的都保留，数字取较大的一边。</p>';
    const broken = plan.broken ? `<p class="save-note">存档里有 ${plan.broken} 部分已损坏，已跳过，其余照常导入。</p>` : '';
    const fine = plan.fresh ? '' : '<p class="save-fine">如果不放心，可以先<button type="button" class="save-link" id="save-backup">导出</button>一份现在的进度备份，以便找回。</p>';
    show('导入存档', (when ? `<p class="save-when">存档时间 ${when}</p>` : '') + table(plan.rows, '导入后') + note + broken + fine, '确认导入', () => {
      plan.apply();
      try { sessionStorage.setItem(IMPORTED, '1'); } catch { /* 只是少一条提示 */ }
      location.reload();
    });
    document.getElementById('save-backup')?.addEventListener('click', () => download(new Set()));
  };

  $('set-save-export').onclick = exportFlow;
  $('set-save-import').onclick = () => { file.value = ''; file.click(); };
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    let text = '';
    try { text = await f.text(); } catch { /* 读不了按坏文件处理 */ }
    const plan = f.size > 5_000_000 ? 'not-save' : planImport(text);
    if (plan === 'not-json') show('导入存档', '<p class="save-note">这个文件打不开，可能不是萌趣格斗的存档。</p>', null, null);
    else if (plan === 'not-save') show('导入存档', '<p class="save-note">这个文件不是萌趣格斗的存档。</p>', null, null);
    else if (!plan.used) show('导入存档', '<p class="save-note">这个存档里没有可以导入的进度。</p>', null, null);
    else confirmImport(plan);
  };
  ok.onclick = () => onOk?.();
  $('save-cancel').onclick = () => dialog.close();
  $('close-save').onclick = () => dialog.close();

  try {
    if (sessionStorage.getItem(IMPORTED)) {
      sessionStorage.removeItem(IMPORTED);
      requestAnimationFrame(() => toast('存档已导入'));
    }
  } catch { /* 无痕模式 */ }
}
