import type { NetQuality } from '../net/play.ts';

type Trigger = 'room-connection' | 'battle-connection';
const statusByTrigger = new Map<Trigger, NetQuality>();
let openedFrom: Trigger | null = null;

function details(status: NetQuality): void {
  const put = (id: string, text: string) => {
    const el = document.getElementById(id)!;
    if (el.textContent !== text) el.textContent = text;
  };
  const ms = status.rtt ?? status.path?.rtt;
  put('net-detail-route', status.path?.route === 'relay' ? '中继' : status.path ? '直连' : '检测中');
  put('net-detail-rtt', ms == null ? '测量中' : ms + ' ms');
  put('net-detail-mode', status.mode === 'snap' ? '房主快照' : status.delay === undefined ? '锁步' : '锁步 · 延迟 ' + status.delay + ' 帧');
  const reason = status.fallback === '高延迟直切快照' ? '往返延迟持续偏高'
    : status.fallback === '跟不上' ? '模拟进度跟不上'
    : status.fallback === '反复不同步' ? '双方战斗状态反复不同步'
    : status.fallback ? '锁步无法继续' : '';
  put('net-detail-fallback', reason);
  document.getElementById('net-detail-fallback-label')!.hidden = !reason;
  document.getElementById('net-detail-fallback')!.hidden = !reason;
}

export function paintConnection(id: Trigger, status: NetQuality | null): void {
  const button = document.getElementById(id)!;
  button.hidden = !status;
  if (!status) {
    statusByTrigger.delete(id);
    if (openedFrom === id) (document.getElementById('net-connection-dialog') as HTMLDialogElement).close();
    return;
  }
  statusByTrigger.set(id, status);
  const route = status.path?.route === 'relay' ? '中继' : status.path ? '直连' : '连接';
  const ms = status.rtt ?? status.path?.rtt;
  const text = status.shaky ? '连接不稳' : route + (id === 'battle-connection' && ms != null ? ' · ' + ms + ' ms' : '');
  const caption = button.firstElementChild!;
  if (caption.textContent !== text) {
    caption.textContent = text;
    button.setAttribute('aria-label', '连接详情，' + text);
  }
  if (openedFrom === id) details(status);
}

export function bindConnectionDetails(openModal: (dialog: HTMLDialogElement) => void): void {
  const dialog = document.getElementById('net-connection-dialog') as HTMLDialogElement;
  for (const id of ['room-connection', 'battle-connection'] as const) {
    document.getElementById(id)!.onclick = () => {
      const status = statusByTrigger.get(id);
      if (!status) return;
      openedFrom = id;
      details(status);
      openModal(dialog);
    };
  }
  document.getElementById('close-net-connection')!.onclick = () => dialog.close();
  dialog.addEventListener('close', () => { openedFrom = null; });
}
