import type { FightGame } from '../game/game.ts';
import { skillsOf } from '../game/fighter.ts';
import { assetUrl, assignFirst } from '../assets/loader.ts';
import { musicLatency, stagePause, stagePosition, stageTake } from '../audio/bgm.ts';
import { TAGS } from './songs.ts';
import { heatColor } from './constants.ts';
import type { MusouDirector, MuSound } from './director.ts';
import { autoWeaponCount, listBuild, type Glyph } from './upgrades.ts';

/* 音浪无双的 HUD：沿用主游血条（左主角、右梦魇 Boss），中间计时换成「本首剩余 + 歌曲进度」，
   主角条下多一条细经验条，拾取强化时在顶部提示。 */

const cache = new Map<string, HTMLElement>();
const $ = (id: string): HTMLElement => {
  let el = cache.get(id);
  if (!el || !el.isConnected) { el = document.getElementById(id) as HTMLElement; cache.set(id, el); }
  return el;
};
const setText = (el: HTMLElement, t: string) => { if (el.textContent !== t) el.textContent = t; };
const setW = (el: HTMLElement, pct: number) => { const v = Math.max(0, Math.min(100, pct)) + '%'; if (el.style.width !== v) el.style.width = v; };
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let sound: ((k: MuSound, n: number, at: number) => void) | null = null;
/** main.ts 接上：导演排的声音从这里交给 sfx。 */
export function bindMusouSound(fn: (k: MuSound, n: number, at: number) => void): void { sound = fn; }
/** 开始每帧模拟前采样音频。HUD 的刷新间隔会给踩拍判定引入额外误差。 */
export function syncMusouAudio(g: FightGame, m: MusouDirector): void {
  if (m.musicTrack != null) { stageTake(m.musicTrack); m.musicTrack = null; }
  stagePause(g.paused);
  m.audioT = m.phase === 'shift' ? null : stagePosition();
  m.audioLat = m.audioT == null ? 0 : musicLatency();
  for (const c of m.sounds) sound?.(c.k, c.n, c.at);
  m.sounds.length = 0;
}

export function musouHud(g: FightGame, m: MusouDirector): void {
  $('hud-ally').hidden = true;
  $('hud-enemy2').hidden = true;
  const p1 = g.fighters[0];
  setText($('hud-name1'), p1.data.name);
  setText($('score1'), `${m.kills.toLocaleString('en-US')} 击破`);
  const av1 = $('hud-avatar1') as HTMLImageElement;
  if (av1.hidden) av1.hidden = false;
  face(av1, p1.data.id);
  const st = p1.hp <= 0 ? 'ko' : p1.hp <= p1.data.hp / 4 ? 'low' : '';
  if ((av1.dataset.state ?? '') !== st) av1.dataset.state = st;
  setW($('hp1'), p1.hp / p1.data.hp * 100);
  const box = $('hp1').parentElement!;
  const guard = String(Math.max(0, Math.min(1, p1.guard / 100)));
  if (box.style.getPropertyValue('--guard') !== guard) box.style.setProperty('--guard', guard);
  setText($('health1'), p1.hp <= 0 ? 'K.O.' : '');
  setW($('mp1'), p1.energy / p1.energyMax * 100);
  $('mp1').parentElement?.classList.toggle('full', p1.energy >= Math.min(p1.energyMax, skillsOf(p1)[5]?.cost ?? p1.energyMax));

  const xp = $('musou-xp');
  if (xp.hidden) xp.hidden = false;
  setW(xp.firstElementChild as HTMLElement, m.xp / m.nextXp * 100);
  setText($('musou-lv'), `LV ${m.level}`);

  // 右侧：Boss 在场才出现，平时整块留空（不显示假血条）。
  const boss = m.activeBoss();
  const side = $('hp2').closest('.hud-player') as HTMLElement;
  side.classList.toggle('musou-idle', !boss);
  if (boss) {
    setText($('hud-name2'), `梦魇 · ${boss.data.name}`);
    setText($('score2'), 'BOSS');
    const av2 = $('hud-avatar2') as HTMLImageElement;
    if (av2.hidden) av2.hidden = false;
    face(av2, boss.data.id);
    setW($('hp2'), boss.hp / boss.data.hp * 100);
    setText($('health2'), '');
    setW($('mp2'), boss.energy / boss.energyMax * 100);
  }

  setText($('round'), m.halfLabel);
  setText($('timer'), m.phase === 'hold' ? '安可' : m.phase === 'shift' ? '—' : mmss(Math.max(0, m.song.dur - m.songT)));
  const bar = $('musou-song');
  if (bar.hidden) bar.hidden = false;
  setW(bar.firstElementChild as HTMLElement, m.phase === 'shift' ? 100 : m.songP * 100);
  bar.dataset.tag = m.song.tag;
  // 歌曲进度条上标出这首歌的副歌段；FEVER 中整条亮起来。
  const songKey = `${m.half}|${m.song.title}`;
  if (bar.dataset.key !== songKey) {
    bar.dataset.key = songKey;
    for (const b of [...bar.querySelectorAll('b')]) b.remove();
    for (const c of m.plan.chorus) {
      const b = document.createElement('b');
      b.style.left = `${c.s / m.song.dur * 100}%`;
      b.style.width = `${(c.e - c.s) / m.song.dur * 100}%`;
      bar.appendChild(b);
    }
  }
  bar.classList.toggle('is-fever', m.fever >= 0);
  setText($('battle-mode'), `音浪无双 · ${m.song.title} · ${TAGS[m.song.tag].name}`);
  syncHeat(m);
  syncAward(m);
}

function syncHeat(m: MusouDirector): void {
  const box = $('musou-heat');
  if (box.hidden) box.hidden = false;
  const col = heatColor(Math.max(1, m.heat));
  if (box.style.getPropertyValue('--heat') !== col) box.style.setProperty('--heat', col);
  const pips = box.firstElementChild!.children;
  for (let i = 0; i < pips.length; i++) {
    const f = i < m.heat ? 100 : i === m.heat ? m.heatFill / 4 * 100 : 0;
    const v = `${f}%`;
    const el = pips[i] as HTMLElement;
    if (el.style.getPropertyValue('--f') !== v) el.style.setProperty('--f', v);
  }
  box.classList.toggle('up', m.heat >= 5);
  const em = box.lastElementChild as HTMLElement;
  const hot = m.elapsed - m.perfectAt < .35;
  setText(em, m.pstreak > 1 ? `PERFECT ×${m.pstreak}` : 'PERFECT');
  em.classList.toggle('on', hot);
}

/** 离开无双时把只属于无双的 HUD 件收起来。 */
export function clearMusouHud(): void {
  for (const id of ['musou-xp', 'musou-song', 'musou-got', 'musou-heat']) { const el = document.getElementById(id); if (el) el.hidden = true; }
  document.getElementById('hp2')?.closest('.hud-player')?.classList.remove('musou-idle');
  clearTimeout(gotTimer);
}

function face(img: HTMLImageElement, id: string): void {
  const logical = `/avatars/${id}.png`;
  const src = assetUrl(logical);
  if (img.dataset.src !== src) { img.dataset.src = src; assignFirst(img, [logical, '/avatars/placeholder.png']); }
}

/* ---- 强化卡 ---- */

let gotTimer = 0;

function syncAward(m: MusouDirector): void {
  if (m.lastPicked) {
    const c = m.lastPicked;
    m.lastPicked = null;
    const got = $('musou-got');
    got.innerHTML = `<i data-cat="${c.cat}">${glyphSVG(c.glyph)}</i><b>${esc(c.name)}</b><span>${c.cat === 'evo' ? 'EVOLVED' : c.lv > 1 ? 'LV ' + c.lv : 'NEW'}</span>`;
    got.hidden = false;
    got.classList.remove('is-in');
    void got.offsetWidth;
    got.classList.add('is-in');
    clearTimeout(gotTimer);
    gotTimer = window.setTimeout(() => { got.hidden = true; }, 1400);
  }
}

/** 暂停页左侧展示当前已拿武器、进化和强化构筑。 */
export function renderPauseBuild(m: MusouDirector): string {
  const entries = listBuild(m.build);
  const autos = autoWeaponCount(m.build);
  const chips = entries.map(e =>
    `<span class="pb-chip" data-cat="${e.evo ? 'evo' : e.cat}">`
    + `${glyphSVG(e.glyph)}<b>${esc(e.name)}</b>`
    + `<em>${e.cat === 'evo' ? '进化' : e.lv >= e.max ? 'MAX' : `LV${e.lv}`}</em>`
    + `</span>`,
  ).join('');
  return `<div class="pb-head"><span>当前构筑</span><small>自动武器 ${autos}/3 · 重随 ${m.rerolls}</small></div>`
    + `<div class="pb-grid">${chips}</div>`;
}

const G: Record<Glyph, string> = {
  fan: '<path d="M5 19c3-1 4-4 4-7V5l8-2v11"/><circle cx="7" cy="18" r="2.4"/><circle cx="15" cy="15" r="2.4"/>',
  notes: '<path d="M10 17V5l8-2v12"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="15.5" cy="15" r="2.5"/>',
  ring: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M3 12a9 9 0 0 1 3-6.7M21 12a9 9 0 0 1-3 6.7"/>',
  quake: '<path d="M2 17h4l2-6 3 9 3-12 2 9 2-4h4"/>',
  beam: '<path d="M3 12h18"/><path d="M5 8h14M5 16h14" opacity=".55"/>',
  cone: '<path d="M4 12h2"/><path d="M9 7a7 7 0 0 1 0 10"/><path d="M13 4a11 11 0 0 1 0 16"/><path d="M17 2a14 14 0 0 1 0 20"/>',
  orbit: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/><path d="M4 9a9 4 -20 0 1 16 -3"/><circle cx="19" cy="6" r="1.6"/>',
  homing: '<path d="M12 20c-5-5-7-9-6-12 2-3 10-3 12 0 1 3-1 7-6 12z"/>',
  rig: '<path d="M3 4h18M7 4l-1 5M17 4l1 5"/><path d="M9 9h6l1 4H8z"/><path d="M8 17l-2 4M12 17v4M16 17l2 4" opacity=".6"/>',
  aura: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3"/>',
  reach: '<path d="M8 12H3m0 0 3-3m-3 3 3 3M16 12h5m0 0-3-3m3 3-3 3"/><circle cx="12" cy="12" r="2"/>',
  triple: '<circle cx="5" cy="12" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><path d="M14 6l6 6-6 6" opacity=".6"/>',
  quake2: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  mine: '<circle cx="12" cy="14" r="6"/><path d="M12 8V3M10 5h4"/>',
  burst: '<path d="M12 2l2.2 6.3L21 7l-4.6 5L21 17l-6.8-1.3L12 22l-2.2-6.3L3 17l4.6-5L3 7l6.8 1.3z"/>',
  encore: '<path d="M2 15c3-6 6-6 9 0s6 6 9 0"/><path d="M2 9c3-6 6-6 9 0s6 6 9 0" opacity=".55"/>',
  amp: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  tempo: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  flow: '<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 16c3-3 6 3 9 0s6 3 9 0"/>',
  crit: '<path d="M12 3c.7 4.5 2.5 6.3 7 7-4.5.7-6.3 2.5-7 7-.7-4.5-2.5-6.3-7-7 4.5-.7 6.3-2.5 7-7z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>',
  star: '<path d="M12 2c.9 6 4 9.1 10 10-6 .9-9.1 4-10 10-.9-6-4-9.1-10-10 6-.9 9.1-4 10-10z"/>',
  wave: '<path d="M4 18c4-1 7-5 8-12"/><path d="M9 20c4-1 8-6 10-14"/><path d="M3 12c2 0 4-2 5-5" opacity=".55"/>',
  shock: '<path d="M12 4v6M9 7l3 3 3-3"/><path d="M4 18c2-3 5-4 8-4s6 1 8 4"/><path d="M2 21h20" opacity=".55"/>',
  chain: '<circle cx="5" cy="17" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="19" cy="15" r="2"/><path d="M6.5 15.5 10.5 8.5M13.5 8.5l4 5"/>',
  echo: '<path d="M6 12a6 6 0 0 1 6-6"/><path d="M3 12a9 9 0 0 1 9-9" opacity=".55"/><path d="M12 12l8 8"/><circle cx="12" cy="12" r="1.5"/>',
  pierce: '<path d="M4 20 18 6"/><path d="M14 4h6v6"/><path d="M6 10l-2 2 8 8 2-2" opacity=".55"/>',
  beat: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
};
export function glyphSVG(g: Glyph): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${G[g] ?? G.star}</svg>`;
}
