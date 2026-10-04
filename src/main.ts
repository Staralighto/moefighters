import { PLAYABLE } from './data/characters.ts';
import type { CharacterData, StageData } from './data/types.ts';
import { FightGame, MINION_POOL } from './game/game.ts';
import { KeyboardInput, TouchInput } from './game/input.ts';
import { Renderer } from './render/renderer.ts';
import { createViews } from './render/view.ts';
import { assetsFor, easeLoad, imageQueue, loadKujiFont, missingImages, preload, type ImageCache } from './assets/loader.ts';
import { Sfx } from './audio/sfx.ts';
import { musicEnabled, musicVolume, pokeMusic, setMusicEnabled, setMusicSuspended, setMusicVolume } from './audio/bgm.ts';
import { matchName, SelectScreen, type MatchSetup } from './ui/select.ts';
import { bestLabel, challengeName, deckLabel, foeCount, hideBuffPicker, readBest, readRun, rollEnemies, showBuffPicker, stageSetup, writeBest, writeRun, type ChallengeKind, type ChallengeRun } from './ui/challenge.ts';
import { cycleSkillTier, hideEnd, setBattleGuide, setRoundLabel, showBanner, showEnd, updateHUD } from './ui/hud.ts';
import { setIconBtn } from './ui/iconBtn.ts';
import { applyTouchDevice, watchTouch } from './ui/device.ts';
import { applyTouchLayout, bindBattleFrame } from './ui/touchLayout.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const sfx = new Sfx();
const images: ImageCache = new Map();

let game: FightGame | null = null;
let renderer: Renderer | null = null;
let raf = 0;
let lastSetup: MatchSetup | null = null;
/** Live endless run of whichever sub-mode is being played: null whenever the player is not inside challenge mode. */
let challenge: ChallengeRun | null = null;

const input = new KeyboardInput(() => game);
input.attach();
new TouchInput(() => game, $('touchpad')).attach();
applyTouchLayout();
bindBattleFrame();
/* Phones get one on-screen key set, so body.touch caps the match at one human.
   The ruling itself lives in ui/device.ts: capability is decided in one place, not per call site. */
applyTouchDevice();
if (import.meta.env.DEV) {
  void import('./render/propTune.ts').then(m => m.mountPropTune());
  void import('./ui/touchTune.ts').then(m => m.mountTouchTune($('touchpad')));
}

/* Idle sheets arrive after the select screen is up. Fight sheets wait until a match actually starts. */
void loadKujiFont();
const previewViews = createViews(PLAYABLE, images);
const queue = imageQueue(images, 2);
let followCast = false;

function commonOf(list: CharacterData[]): string[] {
  return list.flatMap(c => c.view.kind === 'sprite' ? [c.view.common] : []);
}

/** 诗超绊 calls a teammate who is not on the match card. Their sheets ride the fight load. */
function fightSources(characters: CharacterData[], stage: StageData): string[] {
  const mates = characters.some(c => c.skills.some(s => s.fx === 'poem'))
    ? MINION_POOL.flatMap(id => PLAYABLE.filter(c => c.id === id))
    : [];
  return assetsFor([...characters, ...mates], stage);
}

let bootPins: string[] = [];
let bootAt = 0;
let bootDisplay = 0;
let bootShown = false;
let bootDone = true;

function noteMissing(): void {
  const miss = bootPins.filter(s => missingImages.has(s));
  if (miss.length) console.warn('缺图，已回退色块人形：' + miss.join(', '));
}

function beginWait(srcs: string[]): void {
  const keep = bootShown && !bootDone;
  bootPins = [...new Set(srcs)];
  bootAt = performance.now();
  bootDone = false;
  if (keep) return;
  bootDisplay = 0;
  bootShown = false;
  const el = $('stage-load');
  el.classList.remove('is-out');
  el.hidden = true;
  $('select-stage').setAttribute('aria-busy', 'false');
}

function bootFraction(): number {
  if (!bootPins.length) return 1;
  let n = 0;
  for (const s of bootPins) if (images.has(s) || missingImages.has(s)) n++;
  return n / bootPins.length;
}

function tickBoot(now: number): void {
  if (bootDone || !bootPins.length) return;
  const real = bootFraction();
  const elapsed = now - bootAt;
  if (!bootShown) {
    if (real >= 1) { bootDone = true; noteMissing(); return; }
    if (elapsed < 300) return;
    $('stage-load').hidden = false;
    $('select-stage').setAttribute('aria-busy', 'true');
    bootShown = true;
  }
  bootDisplay = easeLoad(bootDisplay, real, elapsed);
  $('stage-load-bar').style.width = `${Math.round(bootDisplay * 1000) / 10}%`;
  if (real < 1 || bootDisplay <= 0.995) return;
  bootDone = true;
  noteMissing();
  const el = $('stage-load');
  el.classList.add('is-out');
  $('select-stage').setAttribute('aria-busy', 'false');
  window.setTimeout(() => { el.hidden = true; el.classList.remove('is-out'); }, 400);
}

const select = new SelectScreen(PLAYABLE, previewViews, setup => {
  queue.soon(commonOf(setup.characters));
  if (setup.mode === 'challenge') {
    // Each sub-mode keeps its own run: switching kinds here reloads the other one from storage,
    // so a parked 闯关 run and a parked 激战 run never block each other.
    const kind = setup.challengeKind ?? 'brawl';
    if (!challenge || challenge.kind !== kind) challenge = readRun(kind);
    if (!challenge) {
      // Stage 1 fights the exact foe(s) shown in the select screen's enemy slots; the cast locks
      // the moment it is shown, so refreshing out of the picker cannot reroll it.
      challenge = { kind, stage: 1, char: setup.characters[0], enemies: setup.characters.slice(1), picks: [], armed: false, newBest: false };
      writeRun(kind, challenge);
    }
    hideEnd();
    showBuffPicker(challenge.stage, challenge.enemies, previewViews, challenge.picks, cardId => {
      // The pick joins the deck for good; startChallengeStage writes the run with it armed.
      challenge!.picks.push(cardId);
      challenge!.armed = true;
      startChallengeStage();
    });
    return;
  }
  void startGame(setup);
}, () => { sfx.unlock(); sfx.play('select'); }, shown => {
  if (followCast) queue.soon(commonOf(shown));
});
select.mount();
{
  const first = [...new Set([...(select.stage.image ? [select.stage.image] : []), ...commonOf(select.cast())])];
  beginWait(first);
  queue.pin(first);
  // The rest of the roster loads on scroll (the observer below) or at fight start — not up front:
  // eager-fetching all 17 sheets spends ~13MB of bandwidth most sessions never use.
  followCast = true;
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        const c = PLAYABLE[Number((e.target as HTMLElement).dataset.index)];
        if (c) queue.soon(commonOf([c]));
      }
    }, { rootMargin: '240px' });
    $('roster').querySelectorAll('.character').forEach(el => io.observe(el));
  }
}
watchTouch(() => { applyTouchDevice(); select.refresh(); });

/* A saved run survives a refresh or crash; 激战 wins ties because it is the long-standing mode.
   With the stage's card already picked the fight restarts directly; otherwise the run just sits
   parked and the select screen renders its continue entry from storage on its own. */
const saved = [readRun('brawl'), readRun('climb')].find(r => r?.armed) ?? readRun('brawl') ?? readRun('climb');
if (saved) {
  challenge = saved;
  if (saved.armed) startChallengeStage();
}

let selectRaf = 0;
function selectLoop(now: number): void {
  if (!$('selection').hidden) {
    tickBoot(now);
    select.animate(now);
  }
  selectRaf = requestAnimationFrame(selectLoop);
}
selectRaf = requestAnimationFrame(selectLoop);

/** Phone only. Call from the tap's pointerdown, before anything else spends that gesture. */
function enterBattleFullscreen(): void {
  if (!document.body.classList.contains('touch')) return;
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.body as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || doc.webkitFullscreenElement) return;
  // ponytail: one Fullscreen API call per tap. A rejected promise is not retried; that retry would miss the gesture.
  try {
    const pending = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
    void Promise.resolve(pending).catch(() => {});
  } catch { /* this browser has no fullscreen */ }
}

function leaveBattleFullscreen(): void {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
}

async function startGame(setup: MatchSetup): Promise<void> {
  sfx.unlock();
  const srcs = fightSources(setup.characters, setup.stage);
  if (srcs.some(s => !images.has(s) && !missingImages.has(s))) beginWait(srcs);
  $('start').setAttribute('disabled', '');
  // The fight's own sheets take the link; the background roster queue waits so the
  // "开打" wait is not competing with 2-at-a-time prefetch for the same bandwidth.
  queue.pause();
  let missing: string[];
  try {
    [missing] = await Promise.all([preload(images, srcs), loadKujiFont()]);
  } finally {
    queue.resume();
  }
  $('start').removeAttribute('disabled');
  if (missing.length) console.warn('缺图，已回退色块人形：' + missing.join(', '));
  lastSetup = setup;

  cancelAnimationFrame(raf);
  cancelAnimationFrame(selectRaf);
  bootDone = true;
  $('stage-load').hidden = true;
  $('stage-load').classList.remove('is-out');
  $('select-stage').setAttribute('aria-busy', 'false');
  $('selection').hidden = true;
  $('battle').hidden = false;
  document.body.classList.add('in-battle');
  hideEnd();
  hideBuffPicker();
  $('battle-mode').textContent = setup.mode === 'challenge'
    ? challengeName(setup.challengeKind ?? 'brawl') + ' · 第 ' + setup.stageNumber + ' 关'
    : matchName(setup) + ' · ' + setup.stage.name;
  setRoundLabel(setup.mode === 'challenge' ? '第 ' + setup.stageNumber + ' 关' : '');
  setBattleGuide(setup.characters, setup.controllers);
  setIconBtn($('pause'), '暂停 ESC');
  $('resume').hidden = true;
  $('pause-quit').hidden = true;
  $('wide-exit').hidden = true;
  setIconBtn($('rematch'), '再来一局 ↻');
  setIconBtn($('reselect'), setup.mode === 'challenge' ? '返回选人' : '重新选人');

  game = new FightGame(setup.characters, {
    mode: setup.mode,
    difficulty: setup.difficulty,
    controllers: setup.controllers,
    mods: setup.mods,
    roundsToWin: setup.mode === 'challenge' ? 1 : undefined,
    stage: setup.stage,
    audio: sfx,
    onHUD: updateHUD,
    onBanner: showBanner,
    onEnd: onFightEnd,
    onPause: paused => {
      setIconBtn($('pause'), paused ? '继续 ESC' : '暂停 ESC');
      $('resume').hidden = !paused;
      $('pause-quit').hidden = !paused;
      // 退出宽屏的按钮只活在宽屏的暂停浮层里；这条随暂停状态一起刷新。
      $('wide-exit').hidden = !paused || !document.body.classList.contains('wide');
      // The deck line rides the pause banner; challenge stages with a deck only.
      const deck = paused && game?.mode === 'challenge' ? deckLabel(challenge?.picks ?? []) : '';
      $('deck-label').hidden = !deck;
      $('deck-label').textContent = deck;
    },
  });
  // previewViews covers the whole roster: a 诗超绊 teammate borrows anon/soyo sheets mid-match.
  renderer = new Renderer($('game') as HTMLCanvasElement, previewViews, setup.stage, images);
  raf = requestAnimationFrame(frame);
  if (!document.body.classList.contains('touch')) {
    $('game').focus();
    // Desktop only. Park the arena's text bar on the top edge of the viewport, so the site header is
    // out of the way and a short window still shows the fight plus the movelist. The offset is
    // measured off the element, so any window ratio lands the same way; when the page has nothing
    // left to scroll the browser clamps it and the header simply stays.
    const bar = document.querySelector<HTMLElement>('.battle-top');
    window.scrollTo(0, bar ? bar.getBoundingClientRect().top + window.scrollY : 0);
  }
}

/** Build and run the stage the pending challenge currently points at. */
function startChallengeStage(): void {
  if (!challenge) return;
  writeRun(challenge.kind, challenge);
  void startGame(stageSetup(challenge.kind, challenge.char, challenge.picks, challenge.stage, challenge.enemies, select.resolveStage()));
}

function onFightEnd(title: string, stats: string): void {
  if (!game || game.mode !== 'challenge' || !challenge) {
    showEnd(title, stats);
    return;
  }
  const kind = challenge.kind;
  const stage = challenge.stage;
  const lead = game.fighters[0];
  const record = `${lead.data.name} 最高 ${game.maxCombo[0]} 连击 · ${game.totalHits[lead.id]} 次命中`;
  if (game.winnerTeam === 0) {
    // Write the record per stage: a run can end right after this, so nothing waits for the run.
    const prev = readBest(kind);
    if (stage > prev) {
      writeBest(kind, stage);
      challenge.newBest = true;
    }
    showEnd('第 ' + stage + ' 关 完成', record);
    setIconBtn($('rematch'), '下一关 ▶');
    setIconBtn($('reselect'), '返回休息');
    challenge.stage = stage + 1;
    challenge.enemies = rollEnemies(foeCount(kind));
    // The deck stays; the next stage only reopens the picker. Saved at once: closing the tab
    // on this end screen still resumes at the next stage's picker.
    challenge.armed = false;
    writeRun(kind, challenge);
  } else {
    showEnd('挑战结束', (challenge.newBest ? '新纪录！' : '') + `止步第 ${stage} 关 · 历史最高 ${bestLabel(readBest(kind))} 关`);
    setIconBtn($('rematch'), '再来一次 ↻');
    setIconBtn($('reselect'), '返回选人');
    // A dead run drops the whole deck.
    challenge.stage = 1;
    challenge.enemies = rollEnemies(foeCount(kind));
    challenge.picks = [];
    challenge.armed = false;
    writeRun(kind, null);
  }
}

function frame(now: number): void {
  if (!game || !renderer) return;
  game.advance(now);
  renderer.draw(game);
  raf = requestAnimationFrame(frame);
}

/** Leave the battle screen for the select one; any waiting run stays parked, storage untouched. */
function restBack(): void {
  cancelAnimationFrame(raf);
  game = null;
  renderer = null;
  $('battle').hidden = true;
  $('selection').hidden = false;
  selectRaf = requestAnimationFrame(selectLoop);
  document.body.classList.remove('in-battle');
  // The fight parked the page on its text bar (see startGame); the select screen opens at the top.
  if (!document.body.classList.contains('touch')) window.scrollTo(0, 0);
  leaveBattleFullscreen();
  hideEnd();
  hideBuffPicker();
  setRoundLabel('');
  select.refresh();
}

/** End the run for real: one of the only two ways a challenge dies (mid-fight quit after the confirm). */
function goBack(): void {
  if (challenge) writeRun(challenge.kind, null);
  challenge = null;
  restBack();
}

/** Every battle-side exit routes here: mid-fight a challenge must be confirmed away, the win
    screen parks the run, and a dead run (or a plain match) just leaves. */
function battleExit(): void {
  if (game?.mode === 'challenge' && challenge && $('end').hidden) {
    openQuit('结束本次挑战？',
      `当前进行到第 ${challenge.stage} 关。离开后本次挑战结束、进度清零，历史最高纪录保留。`,
      '结束挑战并离开', '继续战斗', goBack);
    return;
  }
  // Just won: the run is already on disk, so leaving rests it instead of ending it.
  if (challenge && readRun(challenge.kind)) { restBack(); return; }
  goBack();
}

$('back').onclick = battleExit;
$('reselect').onclick = battleExit;
$('rematch').onclick = () => {
  if (challenge) {
    // Endless run: the button is either 下一关 (won) or 再来一次 (lost); both show the foe(s), then a card.
    // The cast locks here too, so a refresh out of the picker keeps it.
    writeRun(challenge.kind, challenge);
    showBuffPicker(challenge.stage, challenge.enemies, previewViews, challenge.picks, cardId => {
      challenge!.picks.push(cardId);
      challenge!.armed = true;
      startChallengeStage();
    });
    return;
  }
  if (lastSetup) void startGame(lastSetup);
};
$('pause').onclick = () => game?.togglePause();
$('skill-tier').onclick = () => cycleSkillTier();
/* 桌面宽屏：顶栏开关只管进。宽屏里顶栏整个隐藏，退出走暂停浮层的 退出宽屏 按钮（ESC 或点
   计时区域打开）。触屏上这个按钮本来就是隐藏的。 */
$('fullscreen').onclick = () => document.body.classList.add('wide');
$('wide-exit').onclick = () => {
  document.body.classList.remove('wide');
  $('wide-exit').hidden = true;
};
document.querySelector('.timer')?.addEventListener('click', () => {
  const body = document.body;
  // 手机点计时暂停；桌面宽屏同理——顶栏藏了，这是鼠标开暂停浮层的入口。
  if (body.classList.contains('touch') || body.classList.contains('wide')) game?.togglePause();
});
$('resume').onclick = () => { if (game?.paused) game.togglePause(false); };
$('pause-quit').onclick = battleExit;

const quitDialog = $('quit-dialog') as HTMLDialogElement;
let quitAction: (() => void) | null = null;

/** One confirm dialog for both destructive exits; pauses the fight the way the help dialog does. */
function openQuit(title: string, text: string, yes: string, cancel: string, action: () => void): void {
  $('quit-title').textContent = title;
  $('quit-text').textContent = text;
  $('quit-yes').textContent = yes;
  $('quit-cancel').textContent = cancel;
  quitAction = action;
  if (game && !game.paused) game.togglePause(true);
  quitDialog.showModal();
}

$('quit-close').onclick = () => quitDialog.close();
$('quit-cancel').onclick = () => quitDialog.close();
$('quit-yes').onclick = () => { const act = quitAction; quitDialog.close(); act?.(); };
quitDialog.addEventListener('click', e => { if (e.target === quitDialog) quitDialog.close(); });

$('abandon').onclick = () => {
  // Abandoning only touches the sub-mode the select screen is pointing at.
  const kind = select.challengeKind;
  const stage = readRun(kind)?.stage ?? 1;
  openQuit('放弃本次挑战？',
    `放弃后第 ${stage} 关的进度和已锁定的对手都会清空，历史最高纪录保留。`,
    '放弃本次挑战', '先不打', () => {
      if (challenge?.kind === kind) challenge = null;
      writeRun(kind, null);
      select.refresh();
    });
};

const helpDialog = $('help-dialog') as HTMLDialogElement;
$('help').onclick = () => { if (game && !game.paused) game.togglePause(true); helpDialog.showModal(); };
$('close-help').onclick = () => helpDialog.close();
helpDialog.addEventListener('click', e => { if (e.target === helpDialog) helpDialog.close(); });

$('sound').onclick = () => {
  sfx.muted = !sfx.muted;
  setIconBtn($('sound'), sfx.muted ? '♪ 音效关' : '♪ 音效开');
  if (!sfx.muted) sfx.unlock();
};

/* 音乐与音效各自独立，这条只管 BGM。做法对齐参考站的 music-settings：开关是同步布尔，
   点击立即翻转并刷 UI，点击路径上不 await 任何东西，关闭永远跟手；面板用原生 details
   展开，点外面或 ESC 收起，音乐状态不变。
   UI 写入做 rAF 节流：拖音量时 input 事件比帧快，直接逐事件写 DOM 会抖；每帧合并成
   一次写入，且内容没变的文本不重写。 */
let musicUiRaf = 0;
function syncMusicUi(): void {
  if (musicUiRaf) return;
  musicUiRaf = requestAnimationFrame(() => {
    musicUiRaf = 0;
    const on = musicEnabled();
    const label = on ? '♫ 音乐开' : '♫ 音乐关';
    const btn = $('music-toggle');
    if (btn.textContent !== label) btn.textContent = label;
    btn.setAttribute('aria-pressed', String(on));
    const out = $('music-volume-value') as HTMLOutputElement;
    const text = ($('music-volume') as HTMLInputElement).value + '%';
    if (out.textContent !== text) out.textContent = text;
  });
}
$('music-toggle').onclick = () => { setMusicEnabled(!musicEnabled()); syncMusicUi(); };
$('music-volume').oninput = () => {
  setMusicVolume(Number(($('music-volume') as HTMLInputElement).value) / 100);
  syncMusicUi();
};
/* 开关与音量从 sessionStorage 恢复（关掉标签页才重置）：滑条回到上次的档位，开关若上次
   是开的，第一次点击/按键时 pokeMusic 会把音乐接上。 */
($('music-volume') as HTMLInputElement).value = String(Math.round(musicVolume() * 100));
syncMusicUi();
document.addEventListener('pointerdown', e => {
  const settings = $('music-settings') as HTMLDetailsElement;
  if (settings.open && e.target instanceof Node && !settings.contains(e.target)) settings.open = false;
}, { capture: true });
document.addEventListener('keydown', e => {
  const settings = $('music-settings') as HTMLDetailsElement;
  if (e.key === 'Escape' && settings.open) {
    settings.open = false;
    ($('music') as HTMLElement).focus();
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, { capture: true });
document.addEventListener('visibilitychange', () => setMusicSuspended(document.hidden));
window.addEventListener('blur', () => setMusicSuspended(true));
window.addEventListener('focus', () => setMusicSuspended(false));

document.addEventListener('pointerdown', e => {
  const t = e.target;
  /* Start/rematch spend the tap on fullscreen. Audio unlock here would consume it first, and Chrome then rejects requestFullscreen. */
  if (t instanceof Element && t.closest('#start, #rematch')) {
    enterBattleFullscreen();
    return;
  }
  sfx.unlock();
  pokeMusic();
}, { capture: true });
document.addEventListener('keydown', e => { if (!e.repeat) { sfx.unlock(); pokeMusic(); } }, { capture: true });
for (const type of ['contextmenu', 'selectstart', 'dragstart', 'dblclick', 'gesturestart']) {
  $('arena').addEventListener(type, e => e.preventDefault());
}
document.addEventListener('selectionchange', () => {
  if (!document.body.classList.contains('touch') || !document.body.classList.contains('in-battle')) return;
  const sel = document.getSelection();
  const node = sel?.anchorNode;
  if (!sel || sel.isCollapsed || !node || !$('battle').contains(node)) return;
  sel.removeAllRanges();
});
