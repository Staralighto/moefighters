import { assignFirst, loadInto, portraitSrc, type ImageCache } from '../assets/loader.ts';
import { PUBLIC_ROSTER } from '../data/characters.ts';
import { shortName } from '../data/shortNames.ts';
import type { CharacterData } from '../data/types.ts';
import { advanceAnim } from '../game/animState.ts';
import { previewFighter, type Fighter } from '../game/fighter.ts';
import type { FighterView } from '../render/view.ts';
import { fitCanvasCached } from '../ui/canvasFit.ts';
import type { HubPage } from '../ui/hub.ts';
import { reducedMotion } from '../ui/motion.ts';
import { mountSegThumbs } from '../ui/segThumb.ts';
import { getPlaceholderPack, resolveCustomArt, STREET_ART, VIEW_H, VIEW_W } from './placeholders.ts';
import { musicTracks } from '../audio/bgm.ts';
import { glyphSVG } from './hud.ts';
import { readMusouRecords, type MusouCharRecord } from './records.ts';
import { musouSongs, TAGS } from './songs.ts';
import { instrumentWeapon, WEAPON_NAME } from './weapons.ts';

export interface MusouHooks {
  images: ImageCache;
  views: Map<string, FighterView>;
  defaultCharId: () => string;
  /** song：musicTracks() 下标，-1 随机。 */
  startMusou: (char: CharacterData, song: number) => void;
}

let hooks: MusouHooks | null = null;
export function bindMusou(h: MusouHooks): void { hooks = h; }

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PORTRAIT_BOX = { w: 240, h: 290 };

let hostEl: HTMLElement | null = null;
let selectedCharId = '';
/** 上半场曲目：-1 随机。 */
let selectedSong = -1;
let previewRaf = 0;
let previewLast = 0;
let previewPan = 0;
let previewDummy: Fighter | null = null;
let records: Record<string, MusouCharRecord> = {};
let activeCard: HTMLButtonElement | null = null;
let faceObserver: IntersectionObserver | null = null;

function currentRoster(): readonly CharacterData[] {
  return PUBLIC_ROSTER;
}

function pickedChar(): CharacterData {
  const list = currentRoster();
  return list.find(c => c.id === selectedCharId) ?? list[0];
}

function q<T extends HTMLElement>(id: string): T {
  return hostEl!.querySelector<T>('#' + id)!;
}

function buildHtml(): string {
  return `
    <div class="pb-stage">
      <div class="stage-frame">
        <div class="select-stage musou-stage" data-scheme="dark">
          <canvas class="musou-bg-preview" id="musou-bg-preview" width="960" height="540" aria-hidden="true"></canvas>
          <div class="fighter-preview left active" id="musou-preview">
            <div class="slot-head">
              <span class="side-label">1P</span>
              <span class="musou-tag">SOUND RUSH</span>
            </div>
            <canvas id="musou-portrait" width="240" height="290" aria-label="出战角色预览"></canvas>
            <h1 id="musou-name"></h1>
            <small class="slot-title" id="musou-title"></small>
            <div class="musou-meta">
              <span class="musou-own" id="musou-own"></span>
              <span class="musou-pb" id="musou-pb" hidden></span>
            </div>
            <p class="slot-quote" id="musou-quote"></p>
          </div>
        </div>
      </div>
    </div>
    <div class="pb-pick">
      <div class="action-mode seg musou-songs" id="musou-songs" role="group" aria-label="上半场曲目"></div>
      <div class="roster musou-roster" id="musou-roster"></div>
      <div class="action-foot">
        <div class="action-options">
        </div>
        <button type="button" class="start action-start" id="musou-start">开演！ <span>↗</span></button>
      </div>
    </div>
  `;
}

function syncPickedChar(): void {
  const c = pickedChar();
  q('musou-preview').style.setProperty('--c', c.color);
  q('musou-name').textContent = c.name;
  q('musou-title').textContent = c.title;
  const own = instrumentWeapon(c.title, c.id);
  q('musou-own').innerHTML = `${glyphSVG(own)}<span>初始乐器 · ${esc(WEAPON_NAME[own])}</span>`;
  const rec = records[c.id];
  const pbEl = q('musou-pb');
  pbEl.hidden = !rec;
  if (rec) pbEl.textContent = `最高 ${rec.rank} · ${rec.kills} 击破`;
  q('musou-quote').textContent = c.quote;
  previewDummy = previewFighter(c, 0, 1);
  if (hooks && c.view.kind === 'sprite') {
    void loadInto(hooks.images, portraitSrc(c.view.common), 0);
  }
  const next = q('musou-roster').querySelector<HTMLButtonElement>(`[data-cid="${c.id}"]`);
  if (next === activeCard) return;
  for (const [btn, active] of [[activeCard, false], [next, true]] as const) if (btn) {
    btn.classList.toggle('p1', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.querySelector<HTMLElement>('.slot-tag')!.hidden = !active;
  }
  activeCard = next;
}

function renderRoster(): void {
  const list = currentRoster();
  const box = q('musou-roster');
  if (box.childElementCount === list.length) {
    return;
  }
  // Exact native .character[data-view="face"] markup from src/ui/select.ts so cards match 100%.
  box.innerHTML = list.map(c =>
    `<button type="button" class="character" data-view="face" data-face="ready" style="--c:${c.color}" data-cid="${c.id}" title="${esc(c.name)} · ${esc(c.title)}" aria-label="选择${esc(c.name)}" aria-pressed="false">`
    + `<span class="face" aria-hidden="true"><i class="face-cut"><img alt="" loading="lazy" decoding="async" draggable="false"></i></span>`
    + `<span class="slot-tag" hidden>1P</span>`
    + `<span class="musou-rk" hidden></span>`
    + `<span class="char-name"><span class="cn-full">${esc(c.name)}</span><span class="cn-short" aria-hidden="true">${esc(shortName(c))}</span></span>`
    + `<span class="pick-sheen" aria-hidden="true"></span>`
    + `</button>`,
  ).join('');
  for (const btn of box.querySelectorAll<HTMLButtonElement>('button.character')) {
    const cid = btn.dataset.cid!;
    btn.onclick = () => {
      selectedCharId = cid;
      syncPickedChar();
    };
  }
}

function watchRosterFaces(): void {
  const cards = q('musou-roster').querySelectorAll<HTMLButtonElement>('button.character');
  const load = (btn: HTMLButtonElement) => {
    const img = btn.querySelector<HTMLImageElement>('img')!;
    if (!img.dataset.imgGen) assignFirst(img, [`/avatars/${btn.dataset.cid}.png`, '/avatars/placeholder.png']);
  };
  if (typeof IntersectionObserver === 'undefined') { cards.forEach(load); return; }
  faceObserver = new IntersectionObserver((entries, observer) => {
    for (const e of entries) if (e.isIntersecting) {
      observer.unobserve(e.target);
      load(e.target as HTMLButtonElement);
    }
  }, { rootMargin: '120px' });
  cards.forEach(btn => {
    if (!btn.querySelector<HTMLImageElement>('img')!.dataset.imgGen) faceObserver!.observe(btn);
  });
}

function renderSongs(): void {
  const box = q('musou-songs');
  const songs = musouSongs(musicTracks());
  if (box.childElementCount !== songs.length + 1) {
    box.innerHTML = `<button type="button" data-song="-1">随机</button>` + songs.map(s =>
      `<button type="button" data-song="${s.track}" title="${esc(TAGS[s.tag].name)}">${esc(s.title)}</button>`).join('');
  }
  for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-song]')) {
    const on = Number(b.dataset.song) === selectedSong;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function drawPreviewFrame(now: number): void {
  if (!hostEl || !hostEl.isConnected) { previewRaf = 0; return; }
  const dt = previewLast ? Math.min(0.05, (now - previewLast) / 1000) : 1 / 60;
  previewLast = now;

  // 1. 3-layer parallax street backdrop preview
  const bgCv = q<HTMLCanvasElement>('musou-bg-preview');
  const bgCtx = bgCv.getContext('2d', { alpha: false });
  if (bgCtx && hooks) {
    if (!reducedMotion()) previewPan = (previewPan + dt * 26) % 1920;
    const drawLayer = (customSrc: string, key: 'bgFar' | 'bgMid' | 'bgNear', ox: number) => {
      const custom = resolveCustomArt(hooks!.images, customSrc);
      const img = custom ?? getPlaceholderPack()[key];
      const iw = custom?.naturalWidth ?? img.width;
      const sx = Math.min(Math.max(0, ox), Math.max(0, iw - VIEW_W));
      bgCtx.drawImage(img, sx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    };
    drawLayer(STREET_ART[0], 'bgFar', previewPan * 0.25);
    drawLayer(STREET_ART[1], 'bgMid', previewPan * 0.6);
    drawLayer(STREET_ART[2], 'bgNear', previewPan);
    bgCtx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    bgCtx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // 2. Live animated character portrait (DPR-fitted, same scale & ground shadow as select.ts)
  const pCv = q<HTMLCanvasElement>('musou-portrait');
  const k = fitCanvasCached(pCv, PORTRAIT_BOX.w, PORTRAIT_BOX.h);
  const pCtx = pCv.getContext('2d');
  if (pCtx && k !== null && previewDummy && hooks) {
    if (!reducedMotion()) advanceAnim(previewDummy, dt);
    pCtx.clearRect(0, 0, pCv.width, pCv.height);
    const view = hooks.views.get(previewDummy.data.id);
    if (view) {
      const scale = 1.38;
      pCtx.save();
      pCtx.translate((PORTRAIT_BOX.w / 2) * k, 266 * k);
      pCtx.scale(scale * k, scale * k);
      // Ground shadow under feet
      pCtx.save();
      pCtx.translate(0, -10);
      pCtx.scale(1, 0.16);
      const shade = pCtx.createRadialGradient(0, 0, 0, 0, 0, 38);
      shade.addColorStop(0, 'rgba(0,0,0,0.55)');
      shade.addColorStop(1, 'rgba(0,0,0,0)');
      pCtx.fillStyle = shade;
      pCtx.beginPath();
      pCtx.arc(0, 0, 38, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
      view.draw(pCtx, previewDummy, 0, 0, 1);
      pCtx.restore();
    }
  }

  previewRaf = requestAnimationFrame(drawPreviewFrame);
}

export const musouPage: HubPage = {
  title: '音浪无双',
  en: 'SOUND RUSH',
  loading: { line: '调试音箱中', en: 'SOUND CHECK' },
  mount(host) {
    hostEl = host;
    host.classList.add('prep');
    host.innerHTML = buildHtml();
    mountSegThumbs(host);
    q('musou-songs').addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-song]');
      if (!btn) return;
      selectedSong = Number(btn.dataset.song);
      renderSongs();
    });
    q('musou-start').onclick = () => {
      hooks?.startMusou(pickedChar(), selectedSong);
    };
  },
  enter() {
    if (!selectedCharId) selectedCharId = hooks?.defaultCharId() || currentRoster()[0].id;
    if (hooks) for (const src of STREET_ART) void loadInto(hooks.images, src, 0);
    records = readMusouRecords();
    renderRoster();
    for (const btn of q('musou-roster').querySelectorAll<HTMLButtonElement>('button.character')) {
      const rank = btn.querySelector<HTMLElement>('.musou-rk')!;
      const record = records[btn.dataset.cid!];
      rank.hidden = !record;
      if (record) { rank.dataset.rank = record.rank; rank.textContent = record.rank; }
    }
    syncPickedChar();
    renderSongs();
  },
  ready() {
    watchRosterFaces();
    previewLast = 0;
    cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(drawPreviewFrame);
  },
  leave() {
    faceObserver?.disconnect();
    faceObserver = null;
    cancelAnimationFrame(previewRaf);
    previewRaf = 0;
  },
};
