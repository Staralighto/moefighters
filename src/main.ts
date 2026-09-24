import { PLAYABLE } from './data/characters.ts';
import { STAGES } from './data/stages.ts';
import { FightGame } from './game/game.ts';
import { KeyboardInput, TouchInput } from './game/input.ts';
import { Renderer } from './render/renderer.ts';
import { createViews } from './render/view.ts';
import { assetsFor, preload, type ImageCache } from './assets/loader.ts';
import { Sfx } from './audio/sfx.ts';
import { matchName, SelectScreen, type MatchSetup } from './ui/select.ts';
import { hideEnd, setBattleGuide, showBanner, showEnd, updateHUD } from './ui/hud.ts';
import { applyTouchLayout } from './ui/touchLayout.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const stage = STAGES[0];
const sfx = new Sfx();
const images: ImageCache = new Map();

let game: FightGame | null = null;
let renderer: Renderer | null = null;
let raf = 0;
let lastSetup: MatchSetup | null = null;

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

const select = new SelectScreen(PLAYABLE, previewViews, stage, startGame, () => { sfx.unlock(); sfx.play('select'); });
select.mount();
coarse.addEventListener('change', () => { document.body.classList.toggle('touch', coarse.matches); select.refresh(); });

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
  $('battle-mode').textContent = matchName(setup) + ' · ' + stage.name;
  setBattleGuide(setup.characters, setup.controllers);
  $('pause').textContent = '暂停 ESC';
  $('resume').hidden = true;
  $('pause-quit').hidden = true;

  game = new FightGame(setup.characters, {
    mode: setup.mode,
    difficulty: setup.difficulty,
    controllers: setup.controllers,
    stage,
    audio: sfx,
    onHUD: updateHUD,
    onBanner: showBanner,
    onEnd: showEnd,
    onPause: paused => { $('pause').textContent = paused ? '继续 ESC' : '暂停 ESC'; $('resume').hidden = !paused; $('pause-quit').hidden = !paused; },
  });
  renderer = new Renderer($('game') as HTMLCanvasElement, createViews(setup.characters, images), stage, images);
  raf = requestAnimationFrame(frame);
  if (!document.body.classList.contains('touch')) {
    $('game').focus();
    window.scrollTo(0, 0);
  }
}

function frame(now: number): void {
  if (!game || !renderer) return;
  game.advance(now);
  renderer.draw(game);
  raf = requestAnimationFrame(frame);
}

function goBack(): void {
  cancelAnimationFrame(raf);
  game = null;
  renderer = null;
  $('battle').hidden = true;
  $('selection').hidden = false;
  document.body.classList.remove('in-battle');
  leaveBattleFullscreen();
  hideEnd();
  select.refresh();
}

$('back').onclick = goBack;
$('reselect').onclick = goBack;
$('rematch').onclick = () => { if (lastSetup) void startGame(lastSetup); };
$('pause').onclick = () => game?.togglePause();
document.querySelector('.timer')?.addEventListener('click', () => {
  if (document.body.classList.contains('touch')) game?.togglePause();
});
$('resume').onclick = () => { if (game?.paused) game.togglePause(false); };
$('pause-quit').onclick = () => goBack();

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
