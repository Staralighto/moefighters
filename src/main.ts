import { PLAYABLE } from './data/characters.ts';
import { STAGES } from './data/stages.ts';
import type { CharacterData } from './data/types.ts';
import { FightGame } from './game/game.ts';
import { KeyboardInput, TouchInput } from './game/input.ts';
import { Renderer } from './render/renderer.ts';
import { createViews } from './render/view.ts';
import { assetsFor, preload, type ImageCache } from './assets/loader.ts';
import { Sfx } from './audio/sfx.ts';
import { matchName, SelectScreen, type MatchSetup } from './ui/select.ts';
import { bestLabel, challengeName, deckLabel, foeCount, hideBuffPicker, readBest, readRun, rollEnemies, showBuffPicker, stageSetup, writeBest, writeRun, type ChallengeKind, type ChallengeRun } from './ui/challenge.ts';
import { hideEnd, setBattleGuide, setRoundLabel, showBanner, showEnd, updateHUD } from './ui/hud.ts';
import { applyTouchLayout } from './ui/touchLayout.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const stage = STAGES[0];
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
/* Phones get one on-screen key set, so body.touch caps the match at one human. */
const coarse = matchMedia('(hover: none) and (pointer: coarse)');
document.body.classList.toggle('touch', coarse.matches);
if (import.meta.env.DEV) {
  void import('./render/propTune.ts').then(m => m.mountPropTune());
  void import('./ui/touchTune.ts').then(m => m.mountTouchTune($('touchpad')));
}

/* Sprite-backed characters need their image before the select screen can draw them. */
{
  const missing = await preload(images, assetsFor(PLAYABLE, stage));
  if (missing.length) console.warn('缺图，已回退色块人形：' + missing.join(', '));
}
const previewViews = createViews(PLAYABLE, images);

const select = new SelectScreen(PLAYABLE, previewViews, stage, setup => {
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
}, () => { sfx.unlock(); sfx.play('select'); });
select.mount();
coarse.addEventListener('change', () => { document.body.classList.toggle('touch', coarse.matches); select.refresh(); });

/* A saved run survives a refresh or crash; 激战 wins ties because it is the long-standing mode.
   With the stage's card already picked the fight restarts directly; otherwise the run just sits
   parked and the select screen renders its continue entry from storage on its own. */
const saved = [readRun('brawl'), readRun('climb')].find(r => r?.armed) ?? readRun('brawl') ?? readRun('climb');
if (saved) {
  challenge = saved;
  if (saved.armed) startChallengeStage();
}

function selectLoop(now: number): void {
  if (!$('selection').hidden) select.animate(now);
  requestAnimationFrame(selectLoop);
}
requestAnimationFrame(selectLoop);

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
  const missing = await preload(images, assetsFor(setup.characters, stage));
  if (missing.length) console.warn('缺图，已回退色块人形：' + missing.join(', '));
  lastSetup = setup;

  cancelAnimationFrame(raf);
  $('selection').hidden = true;
  $('battle').hidden = false;
  document.body.classList.add('in-battle');
  hideEnd();
  hideBuffPicker();
  $('battle-mode').textContent = setup.mode === 'challenge'
    ? challengeName(setup.challengeKind ?? 'brawl') + ' · 第 ' + setup.stageNumber + ' 关'
    : matchName(setup) + ' · ' + stage.name;
  setRoundLabel(setup.mode === 'challenge' ? '第 ' + setup.stageNumber + ' 关' : '');
  setBattleGuide(setup.characters, setup.controllers);
  $('pause').textContent = '暂停 ESC';
  $('resume').hidden = true;
  $('pause-quit').hidden = true;
  $('rematch').textContent = '再来一局 ↻';
  $('reselect').textContent = setup.mode === 'challenge' ? '返回选人' : '重新选人';

  game = new FightGame(setup.characters, {
    mode: setup.mode,
    difficulty: setup.difficulty,
    controllers: setup.controllers,
    mods: setup.mods,
    roundsToWin: setup.mode === 'challenge' ? 1 : undefined,
    stage,
    audio: sfx,
    onHUD: updateHUD,
    onBanner: showBanner,
    onEnd: onFightEnd,
    onPause: paused => {
      $('pause').textContent = paused ? '继续 ESC' : '暂停 ESC';
      $('resume').hidden = !paused;
      $('pause-quit').hidden = !paused;
      // The deck line rides the pause banner; challenge stages with a deck only.
      const deck = paused && game?.mode === 'challenge' ? deckLabel(challenge?.picks ?? []) : '';
      $('deck-label').hidden = !deck;
      $('deck-label').textContent = deck;
    },
  });
  // previewViews covers the whole roster: a 诗超绊 teammate borrows anon/soyo sheets mid-match.
  renderer = new Renderer($('game') as HTMLCanvasElement, previewViews, stage, images);
  raf = requestAnimationFrame(frame);
  if (!document.body.classList.contains('touch')) {
    $('game').focus();
    window.scrollTo(0, 0);
  }
}

/** Build and run the stage the pending challenge currently points at. */
function startChallengeStage(): void {
  if (!challenge) return;
  writeRun(challenge.kind, challenge);
  void startGame(stageSetup(challenge.kind, challenge.char, challenge.picks, challenge.stage, challenge.enemies));
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
    $('rematch').textContent = '下一关 ▶';
    $('reselect').textContent = '返回休息';
    challenge.stage = stage + 1;
    challenge.enemies = rollEnemies(foeCount(kind));
    // The deck stays; the next stage only reopens the picker. Saved at once: closing the tab
    // on this end screen still resumes at the next stage's picker.
    challenge.armed = false;
    writeRun(kind, challenge);
  } else {
    showEnd('挑战结束', (challenge.newBest ? '新纪录！' : '') + `止步第 ${stage} 关 · 历史最高 ${bestLabel(readBest(kind))} 关`);
    $('rematch').textContent = '再来一次 ↻';
    $('reselect').textContent = '返回选人';
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
  document.body.classList.remove('in-battle');
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
document.querySelector('.timer')?.addEventListener('click', () => {
  if (document.body.classList.contains('touch')) game?.togglePause();
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
  $('sound').textContent = sfx.muted ? '♪ 音效关' : '♪ 音效开';
  if (!sfx.muted) sfx.unlock();
};

document.addEventListener('pointerdown', e => {
  const t = e.target;
  /* Start/rematch spend the tap on fullscreen. Audio unlock here would consume it first, and Chrome then rejects requestFullscreen. */
  if (t instanceof Element && t.closest('#start, #rematch')) {
    enterBattleFullscreen();
    return;
  }
  sfx.unlock();
}, { capture: true });
document.addEventListener('keydown', e => { if (!e.repeat) sfx.unlock(); }, { capture: true });
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
