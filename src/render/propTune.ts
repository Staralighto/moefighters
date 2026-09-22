import { PROP_LAYOUT, propIds, type PropPlace } from './propLayout.ts';

const NOTES: Record<string, string> = {
  'anon-strum': '扫弦。x 朝她面向为正（负数在身后），y 相对脚底、向上为负。',
  'anon-spin': '大招。不跟面向翻。x 向屏幕右为正，y 向上为负。rot 加在旋转上。',
};

const KEYS = ['x', 'y', 'rot', 'size'] as const;

/** Dev-only panel. Numbers are the same object the fight draws, and a save writes the data file. */
export function mountPropTune(): void {
  const bar = document.querySelector('.battle-top');
  if (!bar) return;

  const open = document.createElement('button');
  open.type = 'button';
  open.dataset.propTune = '';
  open.id = 'prop-tune-open';
  open.textContent = '部件';
  bar.append(open);

  const panel = document.createElement('div');
  panel.className = 'prop-tune';
  panel.dataset.propTune = '';
  panel.hidden = true;
  panel.innerHTML = `
    <p>打出技能后按 ESC 暂停，画面会停在这一帧。改完自动写入 <code>src/render/propLayout.data.ts</code>。手改那个文件后要刷新。</p>
    <label>部件 <select data-prop-id></select></label>
    <p data-prop-note></p>
    ${KEYS.map(k => `<label>${k} <button type="button" data-d="-1" data-k="${k}">−</button><input data-k="${k}" type="number" step="any"><button type="button" data-d="1" data-k="${k}">+</button></label>`).join('')}
    <label>步进 <input data-step type="number" value="2" min="0.1" step="any"></label>
    <small data-prop-status></small>
  `;
  document.body.append(panel);

  const select = panel.querySelector('[data-prop-id]') as HTMLSelectElement;
  const note = panel.querySelector('[data-prop-note]') as HTMLElement;
  const status = panel.querySelector('[data-prop-status]') as HTMLElement;
  const stepInput = panel.querySelector('[data-step]') as HTMLInputElement;
  const fields = Object.fromEntries(KEYS.map(k => [k, panel.querySelector(`input[data-k="${k}"]`) as HTMLInputElement])) as Record<(typeof KEYS)[number], HTMLInputElement>;

  let id = 'anon-strum';
  let listed = '';
  let filling = false;
  let saveTimer = 0;

  const show = () => {
    const ids = propIds();
    const key = ids.join('\n');
    if (!ids.includes(id)) id = ids[0] ?? id;
    if (key !== listed) {
      listed = key;
      filling = true;
      select.replaceChildren(...ids.map(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        opt.selected = name === id;
        return opt;
      }));
      filling = false;
    }
    note.textContent = NOTES[id] ?? '新部件，先放在脚边上方。x 向右为正，y 向上为负，size 是图宽。';
  };

  const load = () => {
    filling = true;
    const place = PROP_LAYOUT[id];
    if (place) for (const k of KEYS) fields[k].value = String(place[k]);
    filling = false;
    show();
  };

  const read = (): PropPlace | null => {
    const place = {} as PropPlace;
    for (const k of KEYS) {
      const n = Number(fields[k].value);
      if (!Number.isFinite(n)) return null;
      place[k] = k === 'rot' ? Math.round(n * 1000) / 1000 : Math.round(n * 10) / 10;
    }
    return place;
  };

  const save = () => {
    const place = read();
    if (!place || !PROP_LAYOUT[id]) return;
    Object.assign(PROP_LAYOUT[id], place);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      status.textContent = '写入中…';
      void fetch('/__prop-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PROP_LAYOUT),
      }).then(res => {
        status.textContent = res.ok ? '已写入 propLayout.data.ts' : '没写上，确认是 npm run dev';
      }).catch(() => { status.textContent = '没写上，确认是 npm run dev'; });
    }, 250);
  };

  open.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) load();
  });
  select.addEventListener('change', () => { if (filling) return; id = select.value; load(); });
  panel.addEventListener('input', e => {
    if (filling || (e.target as HTMLElement).matches('[data-step]')) return;
    save();
  });
  panel.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('button[data-k]') as HTMLButtonElement | null;
    if (!btn) return;
    const k = btn.dataset.k as (typeof KEYS)[number];
    const step = Math.abs(Number(stepInput.value)) || 1;
    const delta = (btn.dataset.d === '-1' ? -1 : 1) * (k === 'rot' ? step / 100 : step);
    fields[k].value = String(Number(fields[k].value) + delta);
    save();
  });
  window.setInterval(() => { if (!panel.hidden) show(); }, 500);
}
