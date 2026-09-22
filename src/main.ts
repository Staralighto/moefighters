import { ROSTER } from './data/characters.ts';
import { STAGES } from './data/stages.ts';
import { FightGame } from './game/game.ts';
import { KeyboardInput } from './game/input.ts';
import { Renderer } from './render/renderer.ts';
import { createViews } from './render/view.ts';
import { assetsFor, preload, type ImageCache } from './assets/loader.ts';
import { Sfx } from './audio/sfx.ts';
import { MODE_NAMES, SelectScreen, type MatchSetup } from './ui/select.ts';
import { hideEnd, setBattleGuide, showBanner, showEnd, updateHUD } from './ui/hud.ts';

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

/* Sprite-backed characters need their image before the select screen can draw them. */
{
  const missing = await preload(images, assetsFor(ROSTER, stage));
  if (missing.length) console.warn('缺图，已回退色块人形：' + missing.join(', '));
}
const previewViews = createViews(ROSTER, images);

const select = new SelectScreen(ROSTER, previewViews, startGame, () => { sfx.unlock(); sfx.play('select'); });
select.mount();

function selectLoop(now: number): void {
  if (!$('selection').hidden) select.animate(now);
  requestAnimationFrame(selectLoop);
}
requestAnimationFrame(selectLoop);

async function startGame(setup: MatchSetup): Promise<void> {
  const start = $('start') as HTMLButtonElement;
  start.disabled = true;
  start.textContent = '角色入场中…';
  sfx.unlock();
  const missing = await preload(images, assetsFor(setup.characters, stage));
  if (missing.length) console.warn('缺图，已回退色块人形：' + missing.join(', '));
  start.innerHTML = '准备好了，开打！ <span>↗</span>';
  start.disabled = false;
  lastSetup = setup;

  cancelAnimationFrame(raf);
  $('selection').hidden = true;
  $('battle').hidden = false;
  document.body.classList.add('in-battle');
  hideEnd();
  $('battle-mode').textContent = MODE_NAMES[setup.mode] + ' · ' + stage.name;
  setBattleGuide(setup.characters[0]);
  $('pause').textContent = '暂停 ESC';
  $('resume').hidden = true;

  game = new FightGame(setup.characters, {
    mode: setup.mode,
    difficulty: setup.difficulty,
    stage,
    audio: sfx,
    onHUD: updateHUD,
    onBanner: showBanner,
    onEnd: showEnd,
    onPause: paused => { $('pause').textContent = paused ? '继续 ESC' : '暂停 ESC'; $('resume').hidden = !paused; },
  });
  renderer = new Renderer($('game') as HTMLCanvasElement, createViews(setup.characters, images), stage, images);
  raf = requestAnimationFrame(frame);
  $('game').focus();
  window.scrollTo(0, 0);
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
  hideEnd();
  select.refresh();
}

$('back').onclick = goBack;
$('reselect').onclick = goBack;
$('rematch').onclick = () => { if (lastSetup) void startGame(lastSetup); };
$('pause').onclick = () => game?.togglePause();
$('resume').onclick = () => { if (game?.paused) game.togglePause(false); };

const helpDialog = $('help-dialog') as HTMLDialogElement;
$('help').onclick = () => { if (game && !game.paused) game.togglePause(true); helpDialog.showModal(); };
$('close-help').onclick = () => helpDialog.close();
helpDialog.addEventListener('click', e => { if (e.target === helpDialog) helpDialog.close(); });

$('sound').onclick = () => {
  sfx.muted = !sfx.muted;
  $('sound').textContent = sfx.muted ? '♪ 音效关' : '♪ 音效开';
  if (!sfx.muted) sfx.unlock();
};

document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
document.addEventListener('keydown', e => { if (!e.repeat) sfx.unlock(); }, { capture: true });
for (const type of ['contextmenu', 'selectstart', 'dragstart', 'dblclick']) {
  $('arena').addEventListener(type, e => { if (e.cancelable) e.preventDefault(); });
}
