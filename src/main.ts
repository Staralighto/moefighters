import { PLAYABLE, PLAYABLE_BY_ID, guestsFor } from './data/characters.ts';
import { STAGES } from './data/stages.ts';
import type { CharacterData, StageData } from './data/types.ts';
import { FightGame, MINION_BAND } from './game/game.ts';
import { KeyboardInput, TouchInput } from './game/input.ts';
import type { Renderer } from './render/renderer.ts';
import { isLiteFx, setLiteFx, shouldGoLite } from './render/fxQuality.ts';
import { createViews } from './render/view.ts';
import { assetsFor, cssUrl, easeLoad, holdBulk, holdIdle, imageQueue, trimImages, liteFight, loadInto, loadKujiFont, missingImages, pendingNet, portraitSrc, preload, slowLink, stageThumbSrc, supportsWebp, type ImageCache } from './assets/loader.ts';
import { noteRecent, predict, prefetchHas, recentIds, setPrefetchScene, startPrefetch } from './assets/prefetch.ts';
import { Sfx } from './audio/sfx.ts';
import { cycleMusicOrder, onMusicChange, fightShuffle, musicEnabled, musicOrder, musicTitle, musicVolume, nudgeMusic, pokeMusic, setFightShuffle, setMusicEnabled, setMusicHeld, setMusicOrder, setMusicSuspended, setMusicVolume, shuffleFightTrack, stepMusic } from './audio/bgm.ts';
import { matchName, parseRosterThumb, SelectScreen, type MatchSetup } from './ui/select.ts';
import { bestLabel, challengeName, deckLabel, foeCount, hideBuffPicker, readBest, readRun, rollEnemies, showBuffPicker, stageSetup, writeBest, writeRun, type ChallengeKind, type ChallengeRun } from './ui/challenge.ts';
import { cycleSkillTier, hideEnd, setBattleGuide, setRoundLabel, showBanner, showEnd, updateHUD } from './ui/hud.ts';
import { preloadReport } from './ui/report.ts';
import { recordMatchClear, renderStampBook, setStampLayout, setStripOn, stampLayout, stampPoster, stripOn, type StampLayout } from './ui/stamps.ts';
import { buildReport, humanTeam } from './game/report.ts';
import { setIconBtn } from './ui/iconBtn.ts';
import { hideVersus, showVersus, versusHeld, versusProgress, versusSides } from './ui/versusCut.ts';
import { resetUltCut, watchUlt } from './ui/ultCut.ts';
import { mountSegThumbs } from './ui/segThumb.ts';
import { applyTouchDevice, watchTouch } from './ui/device.ts';
import { applyTouchLayout, bindBattleFrame, onBattleLayout } from './ui/touchLayout.ts';
import { resetCamera, stepCamera } from './ui/battleCamera.ts';
import { onMediaChange } from './ui/media.ts';
import { bindDialogFallback, closePopover } from './ui/overlays.ts';
import { bindSwipeGuard } from './ui/swipeBack.ts';
import { bindPick, bindSeg, bindSwitch, bindTabs, bindTip, setTrainPrefs, setUltShowPref, trainPrefs, ultShowPref, type UltShow } from './ui/settings.ts';
import { blankGesture, hasCustom, onControls, resetLayout, scheme, setBlankGesture, setScheme, type Scheme } from './ui/controls.ts';
import { abortPadEditor, openPadEditor, padEditing } from './ui/padEditor.ts';
import { setThemePref, themePref, type ThemePref } from './ui/theme.ts';
import { bindOnline, CODENAME_ADJS, CODENAME_CHARS, ensureCodename, formatCodename, setCodenameWords, type NetPlan } from './ui/online.ts';
import { beginNet, endNet, keepLink, netAfter, netAudio, netBefore, netEpoch, netHidden, netLock, netLockFrame, netLog, netRematch, noteEnd, type NetEnd } from './net/play.ts';
import { paintConnection } from './ui/netConnection.ts';
import type { Link } from './net/rtc.ts';
import { LocalPad } from './net/localPad.ts';
import './save/sections.ts';
import { afterMatch } from './tasks/hook.ts';
import { bindSaveUi } from './ui/saveUi.ts';
import { bindResources } from './ui/resources.ts';
import { chunk } from './assets/chunk.ts';
import { bindHub, closeHub, hubOpen, openHub, registerHubPage, setNavHome, setNavStamps } from './ui/hub.ts';
import { bindLayerBack, registerLayer } from './ui/layerBack.ts';
import { bindPeeks } from './ui/peek.ts';
import { bindLobby, selectOnScreen } from './ui/lobby.ts';
import { bindBackdropClose, bindFeel, bindScrollLock, bindPress, cue, fadeMore, bindSheetDrag, lobbyMode, lobbyPrefValue, setLobbyPref, setUiCue, type LobbyPref } from './ui/mobile.ts';
import { bindArtFocus } from './ui/artFocus.ts';
import { bindAppHeight } from './ui/appHeight.ts';
import { bindBrowse } from './ui/browse.ts';
import { bindMusicPage, ORDER_ICONS } from './ui/musicPage.ts';
import { bindTasksPage } from './ui/tasksPage.ts';
import { applyHudFrame, bindLooks, finaleOwned } from './shop/state.ts';
import { setRewardOpener } from './ui/reward.ts';
import { bindShopPage } from './ui/shopPage.ts';
import { bindLockerPage } from './ui/lockerPage.ts';
import { bindFramePreview, setFramePreviewOpener } from './ui/framePreview.ts';
import { bindFinalePreview, setFinalePreviewHooks } from './ui/finalePreview.ts';
import { bindItemPreview, setItemPreviewOpener } from './ui/itemPreview.ts';
import { Rng } from './net/lock.ts';
import { progressLine, refreshStoryMap, selectStage, setStoryPlay, setStoryRules, storyPage, storyRulesHtml } from './story/map.ts';
import { afterWin, bindStory, leaveStory, playStage, storyFight } from './story/run.ts';
import { hasNew, nextStage, onStory } from './story/progress.ts';
import { ALL_STAGES, stageById } from './story/chapters.ts';
import { setTheatreSound } from './story/theatre.ts';

/* 展示模式：只给录宣传视频 / 截宣传图用（地址带 ?showcase）。版式不变，只把会被低倍率栅格化的部分改成按设备像素清晰重画；
   平时不带参数，什么都不改。录制时浏览器自己把 deviceScaleFactor 设到 4，大厅 852×393 就出 3408×1572。 */
if (new URLSearchParams(location.search).has('showcase')) document.documentElement.classList.add('showcase');

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const sfx = new Sfx();
const images: ImageCache = new Map();

let game: FightGame | null = null;
let renderer: Renderer | null = null;
/* Dev builds only: the online E2E run reads the live match from here. */
if (import.meta.env.DEV) (window as unknown as { __mf?: unknown }).__mf = { game: () => game, lock: () => netLock(), log: () => netLog };
/* 开发检测工具（ui/devProbe.ts）：后台页跳转、模拟减少动效、截断 / 溢出扫描、强制演加载条。生产包不含。 */
if (import.meta.env.DEV) void import('./ui/devProbe.ts');
let raf = 0;
let lastSetup: MatchSetup | null = null;
/** Live endless run of whichever sub-mode is being played: set when a challenge fight starts,
    cleared the moment its battle screen closes. A parked (card-not-yet-picked) run lives in
    storage only — holding it here would make other modes' end screens read as "in challenge". */
let challenge: ChallengeRun | null = null;

/** Lockstep: inputs write to this device's pad, which the session samples; the sim never sees a raw key. */
let localPad: LocalPad | null = null;
const inputGame = (): FightGame | null => (game?.netRole === 'lock' && localPad ? localPad as unknown as FightGame : game);
const input = new KeyboardInput(inputGame);
input.attach();
new TouchInput(inputGame, $('touchpad')).attach();
applyTouchLayout();
bindBattleFrame();
bindSwipeGuard();
/* Phones get one on-screen key set, so body.touch caps the match at one human.
   The ruling itself lives in ui/device.ts: capability is decided in one place, not per call site. */
applyTouchDevice();
syncFullscreenLabel();
if (import.meta.env.DEV) {
  void import('./render/propTune.ts').then(m => m.mountPropTune());
  void import('./ui/touchTune.ts').then(m => m.mountTouchTune($('touchpad')));
}

/* Idle sheets arrive after the select screen is up. Fight sheets and the kuji font wait until a match actually starts.
   A slow link (see slowLink) opens on the stage preview and starts fights on half-size sheets;
   the full sheets stream in during the fight and replace them. */
performance.setResourceTimingBufferSize?.(1000);
const previewViews = createViews(PLAYABLE, images);
const queue = imageQueue(images, 2);
// 网络恢复：断网期间失败的图全部作废重来（否则这一整次访问都只剩色块人形）。
window.addEventListener('online', () => { missingImages.clear(); queue.retry(); });
let followCast = false;
let webpOk = false;
void supportsWebp().then(ok => { webpOk = ok; });

/** null on a fast link: the fight waits for the full set, as before. */
function litePlan(characters: CharacterData[], stage: StageData): { need: string[]; rest: string[] } | null {
  if (!webpOk || !slowLink()) return null;
  const plan = liteFight(characters, stage, s => images.has(s) || prefetchHas(s));
  // 整张已在 worker 缓存里的不拉半尺寸替身，开打直接等整张：从缓存读只剩解码，比慢网下 lite 快。
  // （liteFight 把「已有」的当成不用等，这里把它们补回 need，否则会以色块人形开打。）
  plan.need.push(...assetsFor(characters, stage).filter(s => !images.has(s) && prefetchHas(s)));
  plan.need = [...new Set(plan.need)];
  return plan;
}

function portraitOf(list: CharacterData[]): string[] {
  return list.flatMap(c => c.view.kind === 'sprite' ? [portraitSrc(c.view.common)] : []);
}

function commonOf(list: CharacterData[]): string[] {
  return list.flatMap(c => c.view.kind === 'sprite' ? [c.view.common] : []);
}

/** Sheets for the card, plus anyone the card can call onto it. */
function withGuests(characters: CharacterData[]): CharacterData[] {
  const guests = guestsFor(characters, MINION_BAND);
  return guests.length ? [...characters, ...guests] : characters;
}

function fightSources(characters: CharacterData[], stage: StageData): string[] {
  return assetsFor(withGuests(characters), stage);
}

/** Fight sheets only (no backdrop): what the background downloader guesses a fighter will need. */
function sheetsOf(characters: CharacterData[]): string[] {
  return assetsFor(withGuests(characters), { ...select.stage, image: undefined } as StageData);
}

let bootPins: string[] = [];
let castGuess = 0;
let bootAt = 0;
let bootDisplay = 0;
let bootShown = false;
let bootDone = true;
let selectRaf = 0;

function noteMissing(): void {
  const miss = bootPins.filter(s => missingImages.has(s));
  if (miss.length) console.warn('缺图，已回退色块人形：' + miss.join(', '));
}

function beginWait(srcs: string[]): void {
  const keep = bootShown && !bootDone;
  bootPins = [...new Set(srcs)];
  bootAt = performance.now();
  bootDone = false;
  setMusicHeld(true);
  queueSelectFrame();
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
  versusProgress(real >= 1 ? 1 : bootDisplay);
  if (real < 1 || bootDisplay <= 0.995) return;
  bootDone = true;
  noteMissing();
  const el = $('stage-load');
  el.classList.add('is-out');
  $('select-stage').setAttribute('aria-busy', 'false');
  window.setTimeout(() => { el.hidden = true; el.classList.remove('is-out'); }, 400);
}

const select = new SelectScreen(PLAYABLE, previewViews, setup => {
  queue.soon(litePlan(withGuests(setup.characters), setup.stage)?.need ?? commonOf(withGuests(setup.characters)));
  if (setup.mode === 'challenge') {
    // Each sub-mode keeps its own run: switching kinds here reloads the other one from storage,
    // so a parked 闯关 run and a parked 激战 run never block each other.
    const kind = setup.challengeKind ?? 'brawl';
    if (!challenge || challenge.kind !== kind) challenge = readRun(kind);
    if (!challenge) {
      // Stage 1 fights the exact foe(s) shown in the select screen's enemy slots; the cast locks
      // the moment it is shown, so refreshing out of the picker cannot reroll it.
      challenge = { kind, stage: 1, char: setup.characters[0], enemies: setup.characters.slice(1), picks: [], armed: false, newBest: false };
    }
    hideEnd();
    openChallengeStage();
    return;
  }
  void startGame(setup);
}, cue => {
  sfx.unlock();
  if (cue === 'pick') sfx.ui('confirm');
  else if (cue === 'mode') sfx.ui('swish');
  else if (cue === 'deny') sfx.ui('deny');
  else sfx.play('select');
}, shown => {
  if (followCast) queue.soon(portraitOf(shown));
  // 站上舞台的就是最可能开打的：整套动作图提前进缓存（不解码），点开打时只剩解码。
  // 停留 0.8 秒才算：连着点过一串角色时不给每个都下整套。
  clearTimeout(castGuess);
  castGuess = window.setTimeout(() => predict(sheetsOf(shown), 'cast'), 800);
});
select.liteStage = slowLink();
select.onLand = () => sfx.ui('land');
select.onNeedSprite = (c, background) => {
  const srcs = portraitOf([c]);
  // 头像卡上看不见全身。若把待机图排进两条并发的队列，头像先出来，一点击舞台才去拉全身，手机上就是这一下卡顿。
  // 和头像同时直接进缓存；loadInto 与队列去重，点的时候舞台用的是已经解码的那张。
  if (background) {
    for (const src of srcs) void loadInto(images, src);
    return;
  }
  queue.soon(srcs);
};
select.mount();
/* 横屏手机的大厅：盖在选人页上，备战三块借选人页的节点当子视图。 */
bindLobby(select);
mountSegThumbs($('selection'));
/* Mouse hover ticks on the select screen and header. Touch has no hover, so it stays quiet. */
{
  let over: Element | null = null;
  let at = 0;
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || !(e.target instanceof Element)) return;
    const el = e.target.closest('button:not(:disabled), summary, .fighter-preview');
    if (el === over) return;
    over = el;
    if (!el || !el.closest('#selection, header')) return;
    const now = performance.now();
    if (now - at < 45) return;
    at = now;
    sfx.ui('hover');
  }, { passive: true });
}
let pendingLink: Link | null = null;
bindOnline(() => select.onlinePick(), (role, hostChar, guestChar, stageId, link, plan: NetPlan) => {
  const host = PLAYABLE_BY_ID.get(hostChar);
  const guest = PLAYABLE_BY_ID.get(guestChar);
  const stage = STAGES.find(s => s.id === stageId);
  if (!host || !guest || !stage || (!select.showsHidden && (role === 'host' ? host : guest).hidden)) { link.close(); return; }
  pendingLink = link;
  void startGame({
    characters: [host, guest],
    mode: 'cpu',
    difficulty: 1,
    // Lockstep runs the full sim on both sides; the snapshot guest locally pre-animates 2P on 1P keys.
    controllers: role === 'host' || plan.mode === 'lock' ? [0, 1] : [null, 0],
    stage,
    online: role,
    lock: plan.mode === 'lock' ? { seed: plan.seed } : undefined,
    ultCut: plan.cut === true,
  });
}, on => select.setNetLocked(on), (charId, codename) => select.setOnlinePeer(charId, codename), openDialog);
{
  const idles = portraitOf(select.cast());
  const stageSrc = select.stage.image && select.liteStage ? stageThumbSrc(select.stage.image) : select.stage.image;
  beginWait([...new Set([...(stageSrc ? [stageSrc] : []), ...idles])]);
  // The backdrop is the large file. Keep it off the two-wide portrait queue so the second
  // standing picture is not stuck behind it.
  queue.pin(idles);
  if (stageSrc) void loadInto(images, stageSrc, 0);
  // Roster crops (or avatars) load on scroll. Full sheets wait until a fight starts.
  followCast = true;
  select.watchRoster();
  // 后台下载在首屏的图都到齐后再起：不和首屏抢。顺序：最近玩过的角色、当前舞台大图，然后按清单分档。
  const order = PLAYABLE.flatMap(c => c.view.kind === 'sprite' ? [c.view.common.split('/')[2] ?? ''] : []);
  void Promise.all(pendingNet(1)).then(() => window.setTimeout(() => {
    const recent = recentIds().flatMap(id => PLAYABLE.filter(c => c.id === id));
    startPrefetch(order, [...sheetsOf(recent), ...(select.stage.image ? [select.stage.image] : [])]);
  }, 2500));
}
watchTouch(() => { syncFullscreenLabel(); select.refresh(); });

/* An armed run survives a refresh or crash: with the stage's card already picked, the fight was
   the next thing the player was about to see, so it restarts directly. A parked run (stage won,
   next card not picked) stays in storage only — seeding it here would leak challenge state into
   other modes' end screens. The select screen renders a parked run's 继续挑战 entry from storage. */
const saved = [readRun('brawl'), readRun('climb')].find(r => r?.armed && (select.showsHidden || !r.char.hidden));
if (saved) {
  challenge = saved;
  startChallengeStage();
}

function queueSelectFrame(): void {
  if (!selectRaf && !$('selection').hidden && (!bootDone || selectOnScreen())) selectRaf = requestAnimationFrame(selectLoop);
}

function selectLoop(now: number): void {
  selectRaf = 0;
  if (!$('selection').hidden) {
    /* 首屏加载进度不看遮挡：大厅盖着也要走完，否则音乐一直被按住。 */
    if (!bootDone) {
      tickBoot(now);
      if (bootDone) setMusicHeld(false);
    }
    if (selectOnScreen()) select.animate(now);
  }
  queueSelectFrame();
}
const selectVisibility = new MutationObserver(queueSelectFrame);
selectVisibility.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
selectVisibility.observe($('hub'), { attributes: true, attributeFilter: ['data-page'] });
queueSelectFrame();

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

let releaseBulk: (() => void) | null = null;
async function startGame(setup: MatchSetup): Promise<void> {
  closeHub(true);
  sfx.unlock();
  /* pointerdown 上的开始/重开把这次手势让给了全屏，音乐改在这条仍处于点击里的路径接上。 */
  shuffleFightTrack();
  pokeMusic();
  syncMusicUi();
  const versusLabel = setup.online ? '联机对战'
    : setup.story ? storyLabel(setup.story)
    : setup.mode === 'challenge' ? challengeName(setup.challengeKind ?? 'brawl') + ' · 第 ' + setup.stageNumber + ' 关'
    : matchName(setup);
  showVersus(versusSides(setup.characters, setup.mode === 'team', setup.allies), setup.stage.name, versusLabel, previewViews, k => sfx.ui(k));
  const cast = withGuests(setup.characters);
  // Result-screen faces and glyphs ride the versus load, so the end of the match shows them at once.
  preloadReport(setup.characters);
  const srcs = fightSources(setup.characters, setup.stage);
  const lite = litePlan(cast, setup.stage);
  const need = lite?.need ?? srcs;
  if (need.some(s => !images.has(s) && !missingImages.has(s))) beginWait(need);
  $('start').setAttribute('disabled', '');
  // The fight's own sheets take the link; the background roster queue waits so the
  // "开打" wait is not competing with 2-at-a-time prefetch for the same bandwidth.
  // 选人队列一直停到回选人页（restBack）：对战里看不见名单，不该再和对战换图抢链路。
  queue.pause();
  // 后台下载：联机整场停着（holdBulk，回选人页 restBack 再继续）；本地对战只走小文件慢车道（prefetch.ts）。
  if (setup.online) releaseBulk ??= holdBulk();
  setPrefetchScene(setup.online ? 'online' : 'local');
  // 最近玩过 = 玩家自己操控的角色（人机对手不算）。没写操控表时 1P 是玩家。
  noteRecent(setup.characters.filter((c, i) => !c.hidden && (setup.controllers ? setup.controllers[i] != null : i === 0)).map(c => c.id));
  const releaseIdle = holdIdle();
  // 开打是玩家主动的一次请求：之前失败过的图（断网、切网）这次重新下，不沿用整局会话的「缺图」结论。
  for (const s of need) missingImages.delete(s);
  let missing: string[];
  let render: typeof import('./render/renderer.ts');
  try {
    // Online starts the instant it is ready: the cut only covers the load, it never holds a live match.
    [missing, render] = await Promise.all([
      preload(images, need), chunk(() => import('./render/renderer.ts')), loadKujiFont(), setup.online ? Promise.resolve() : versusHeld(),
      // 终幕 textures bake here, behind the versus screen, not in the middle of a fight.
      setup.characters.some(c => c.finale)
        ? chunk(() => import('./render/finale.ts')).then(m => { for (const c of setup.characters) if (c.finale) m.prewarmFinale(c.finale); })
        : Promise.resolve(),
    ]);
  } catch (err) {
    queue.resume();
    releaseBulk?.();
    releaseBulk = null;
    setPrefetchScene('menu');
    hideVersus();
    throw err;
  } finally {
    releaseIdle();
    $('start').removeAttribute('disabled');
  }
  {
    const finaleSrcs = setup.characters.flatMap(c => [c.finale?.art, ...(c.finale?.props ?? [])]).filter((s): s is string => !!s);
    const keep = new Set([...srcs, ...need, ...(lite?.rest ?? []), ...finaleSrcs, ...(select.stage.image ? [select.stage.image] : [])]);
    // 手机给 160MB 解码预算（约两三场 1V1 的量），桌面 384MB。
    trimImages(images, keep, (document.body.classList.contains('touch') ? 160 : 384) << 20);
  }
  // Lite form sheets first (an ultimate can come early), then the full set replaces the soft one —
  // one at a time in the background lane, so a live fight never decodes two sheets in the same moment.
  if (lite) {
    for (const s of lite.rest) void loadInto(images, s, 1);
    for (const s of srcs) void loadInto(images, s, 2);
  }
  if (missing.length) console.warn('缺图，已回退色块人形：' + missing.join(', '));
  // 终幕 illustrations load behind the fight: a picture not in yet just means that kill skips the cut-in art.
  for (const c of setup.characters) for (const src of [c.finale?.art, ...(c.finale?.props ?? [])]) if (src) void loadInto(images, src, 2);
  if (setup.characters.some(c => c.finale)) sfx.preloadFinale();
  lastSetup = setup;

  cancelAnimationFrame(raf);
  cancelAnimationFrame(selectRaf);
  selectRaf = 0;
  bootDone = true;
  setMusicHeld(false);
  $('stage-load').hidden = true;
  $('stage-load').classList.remove('is-out');
  $('select-stage').setAttribute('aria-busy', 'false');
  $('selection').hidden = true;
  $('battle').hidden = false;
  document.body.classList.add('in-battle');
  hideVersus();
  hideEnd();
  hideBuffPicker();
  paintConnection('battle-connection', null);
  $('battle-mode').textContent = setup.online
    ? '联机 · ' + setup.stage.name
    : setup.story ? storyLabel(setup.story)
    : setup.mode === 'challenge'
    ? challengeName(setup.challengeKind ?? 'brawl') + ' · 第 ' + setup.stageNumber + ' 关'
    : matchName(setup) + ' · ' + setup.stage.name;
  setRoundLabel(setup.story ?? (setup.mode === 'challenge' ? '第 ' + setup.stageNumber + ' 关' : ''));
  setBattleGuide(setup.characters, setup.online === 'guest' ? [null, 0] : setup.controllers);
  setIconBtn($('pause'), '暂停 ESC');
  showPauseMenu(false);
  resetCamera();
  $('wide-exit').hidden = true;
  setIconBtn($('rematch'), '再来一局 ↻');
  $('rematch').hidden = false;
  $('end-book').hidden = true;
  setIconBtn($('reselect'), setup.story ? '返回地图' : setup.mode === 'challenge' ? '返回选人' : '重新选人');
  // 剧情关的战斗里，左上返回和暂停菜单的离开都是回剧情地图（battleExit），字要对上。
  setIconBtn($('back'), setup.story ? '← 返回地图' : '← 返回选人');
  setIconBtn($('pause-quit'), setup.story ? '返回地图' : '返回选人');

  const lockRng = setup.lock ? new Rng(setup.lock.seed) : null;
  // Lockstep plays its own sounds; a resync replay runs with them off, so nothing is heard twice.
  // A fallback mid-match turns this host into a snapshot host, so its sounds also feed the guest.
  let muted = false;
  const hostAudio = netAudio(sfx);
  const lockSound = setup.lock ? { play: (k: Parameters<typeof sfx.play>[0], source?: number) => { if (muted) return; if (game?.netRole === 'host' || game?.netRole === 'guest') hostAudio.play(k, source); else sfx.play(k); } } : null;
  // 必杀演出：本地对局看设置；联机看握手协商结果（双方都选特写才是特写），两端必须一致（定格会改时序）。
  ultCut = setup.online ? setup.ultCut === true : ultShowPref() === 'cut';
  game = new FightGame(setup.characters, {
    mode: setup.mode,
    difficulty: setup.difficulty,
    controllers: setup.controllers,
    mods: setup.mods,
    roundsToWin: setup.mode === 'challenge' || setup.story ? 1 : undefined,
    allies: setup.allies,
    survive: setup.survive,
    roundTime: setup.roundTime,
    stage: setup.stage,
    ultFreeze: ultCut,
    training: trainPrefs(),
    random: lockRng?.next,
    audio: lockSound ?? (setup.online ? netAudio(sfx) : sfx),
    netRole: setup.lock ? 'lock' : setup.online,
    finaleOk: setup.online || setup.lock ? undefined : finaleOwned,
    onHUD: updateHUD,
    onBanner: showBanner,
    onEnd: (title, stats) => {
      if (!setup.online || !game) { onFightEnd(title, stats); return; }
      if (game.netRole === 'lock') {
        // Both sides ran the match: each says it from its own seat.
        const me = setup.online === 'host' ? 0 : 1;
        const f = game.fighters[me];
        noteEnd();
        const mine = buildReport(game, me, true);
        afterMatch(game, mine, { online: true });
        showEnd(game.winnerTeam === me ? '你赢了' : '你输了',
          f ? `${game.wins[me]} : ${game.wins[1 - me]} · ${f.data.name} 最高 ${game.maxCombo[me]} 连击 · ${game.totalHits[f.id]} 次命中` : stats,
          mine);
        return;
      }
      // Mirror matches share a name: say who won from this seat. The guest reads its own line.
      const g = game;
      const guest = g.fighters[1];
      const guestStats = guest ? `${g.wins[1]} : ${g.wins[0]} · ${guest.data.name} 最高 ${g.maxCombo[1]} 连击 · ${g.totalHits[guest.id]} 次命中` : stats;
      const end: NetEnd = { title, stats, win: g.winnerTeam, guestStats, guestReport: buildReport(g, 1, true) };
      g.netEnd = end;
      noteEnd();
      const hostReport = buildReport(g, 0, true);
      afterMatch(g, hostReport, { online: true });
      showEnd(g.winnerTeam === 0 ? '你赢了' : g.winnerTeam === 1 ? '你输了' : title, stats, hostReport);
    },
    onPause: paused => {
      setIconBtn($('pause'), paused ? '继续 ESC' : '暂停 ESC');
      showPauseMenu(paused);
      showLayoutExit(paused);
      // The deck line rides the pause menu; challenge stages with a deck only.
      const deck = paused && game?.mode === 'challenge' ? deckLabel(challenge?.picks ?? []) : '';
      $('deck-label').hidden = !deck;
      $('deck-label').textContent = deck;
    },
  });
  const wire = pendingLink;
  pendingLink = null;
  if (setup.online && wire) {
    beginNet(setup.online, wire, {
      hud: updateHUD,
      banner: showBanner,
      end: (title, stats, report) => {
        const left = title === '对手已离开' || title === '连接已断开';
        if (game && report && !left) afterMatch(game, report, { online: true });
        showEnd(title, stats, report);
        if (left) $('rematch').hidden = true;
      },
      quality: status => paintConnection('battle-connection', status),
      again: (state, seed) => {
        if (state === 'go') { rematchOnline(seed); return; }
        setIconBtn($('rematch'), state === 'wait' ? '等待对手…' : '对手想再来一局 ↻');
      },
      fallback: () => {
        // The rest of the match is host snapshots with guest local pre-animation.
        if (!game) return;
        game.netRole = setup.online === 'host' ? 'host' : 'guest';
        if (game.netRole === 'guest') {
          if (game.fighters[0]) game.fighters[0].controller = null;
          if (game.fighters[1]) game.fighters[1].controller = 0;
        }
        localPad = null;
      },
    }, setup.match ?? 0, setup.lock && lockRng && game ? {
      g: game,
      rng: lockRng,
      sample: () => localPad?.sample() ?? { bits: 0, taps: [0, 0, 0, 0, 0, 0, 0, 0] },
      mute: on => { muted = on; },
    } : undefined);
  }
  localPad = setup.lock && game ? new LocalPad(game) : null;
  applyHudFrame();
  hostTicker(setup.online === 'host' || !!setup.lock);
  // previewViews covers the whole roster: a 诗超绊 bandmate borrows their sheets mid-match.
  renderer = new render.Renderer($('game') as HTMLCanvasElement, previewViews, setup.stage, images);
  // 报幕模式不需要立绘，不预先烘焙。
  resetUltCut(ultCut ? setup.characters.map(c => ({ id: c.id, color: c.color })) : []);
  // 跟随镜头拉远时，画布外面垫的是同一张场景图（CSS 背景），不是黑边。
  const art = setup.stage.image ? images.get(setup.stage.image)?.src || setup.stage.image : '';
  if (art) $('arena').style.setProperty('--stage-art', cssUrl(art));
  else $('arena').style.removeProperty('--stage-art');
  lastNow = gapSum = gapCount = 0;
  raf = requestAnimationFrame(frame);
  if (!document.body.classList.contains('touch')) {
    $('game').focus();
    // Desktop only. Park the arena's text bar on the top edge of the viewport, so the site header is
    // out of the way and a short window still shows the fight plus the movelist. The offset is
    // measured off the element, so any window ratio lands the same way; when the page has nothing
    // left to scroll the browser clamps it and the header simply stays.
    const bar = document.querySelector<HTMLElement>('.battle-top');
    window.scrollTo(0, bar ? bar.getBoundingClientRect().top + window.scrollY : 0);
  } else window.scrollTo(0, 0);
}

/** Build and run the stage the pending challenge currently points at. */
function startChallengeStage(): void {
  if (!challenge) return;
  if (!select.showsHidden && challenge.char.hidden) { restBack(); return; }
  writeRun(challenge.kind, challenge);
  void startGame(stageSetup(challenge.kind, challenge.char, challenge.picks, challenge.stage, challenge.enemies, select.resolveStage()));
}

/** A saved stage with a card already picked resumes directly. */
function openChallengeStage(): void {
  const run = challenge;
  if (!run) return;
  if (!select.showsHidden && run.char.hidden) { restBack(); return; }
  if (run.armed) { startChallengeStage(); return; }
  writeRun(run.kind, run);
  showBuffPicker(run.stage, run.enemies, previewViews, run.picks, cardId => {
    if (challenge !== run) return;
    if (!select.showsHidden && run.char.hidden) { restBack(); return; }
    run.picks.push(cardId);
    run.armed = true;
    startChallengeStage();
  });
}

function onFightEnd(title: string, stats: string): void {
  // 结算画面没有对战手感要顾：本地对战回到正常的后台下载（下一关的对手图能在选 buff 时下完）。联机还停着。
  if (game && !game.netRole) setPrefetchScene('menu');
  // 剧情闯关：赢了直接接战后演出（纸板一展开就是战后），输了停在结算上给「再来一次 / 返回地图」。
  if (game && lastSetup?.story && storyFight()) {
    const g = game;
    const report = buildReport(g, 0);
    afterMatch(g, report);
    if (g.winnerTeam === 0) { restBack(); void afterWin(g); return; }
    showEnd('败北', storyLabel(lastSetup.story) + ' · 调整一下再来', report);
    setIconBtn($('rematch'), '再来一次 ↻');
    setIconBtn($('reselect'), '返回地图');
    return;
  }
  if (!game || game.mode !== 'challenge' || !challenge) {
    const report = game ? buildReport(game, humanTeam(game)) : null;
    const first = game && report ? recordMatchClear(game, report) : false;
    if (game) afterMatch(game, report);
    $('end-book').hidden = !first;
    showEnd(title, stats, report);
    return;
  }
  const kind = challenge.kind;
  const stage = challenge.stage;
  const lead = game.fighters[0];
  const record = `${lead.data.name} 最高 ${game.maxCombo[0]} 连击 · ${game.totalHits[lead.id]} 次命中`;
  if (game.winnerTeam === 0) {
    // Write the record per stage: a run can end right after this, so nothing waits for the run.
    const prev = readBest(kind);
    if (!challenge.char.hidden && stage > prev) {
      writeBest(kind, stage);
      challenge.newBest = true;
    }
    afterMatch(game, buildReport(game, 0), { stage });
    showEnd('第 ' + stage + ' 关 完成', record, { ...buildReport(game, 0), tour: { stage, best: readBest(kind), newBest: !!challenge.newBest && readBest(kind) === stage } });
    setIconBtn($('rematch'), '下一关 ▶');
    setIconBtn($('reselect'), '返回休息');
    challenge.stage = stage + 1;
    challenge.enemies = rollEnemies(foeCount(kind));
    // 结算 + 选 buff 的这几秒够把下一关对手的动作图下进缓存。
    predict(sheetsOf(challenge.enemies), 'challenge');
    // The deck stays; the next stage only reopens the picker. Saved at once: closing the tab
    // on this end screen still resumes at the next stage's picker.
    challenge.armed = false;
    writeRun(kind, challenge);
  } else {
    afterMatch(game, buildReport(game, 0), { stage });
    showEnd('挑战结束', (challenge.newBest ? '新纪录！' : '') + `止步第 ${stage} 关 · 历史最高 ${bestLabel(readBest(kind))} 关`,
      { ...buildReport(game, 0), tour: { stage, best: readBest(kind), newBest: false } });
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

/* Frame-gap sampler for the lite tier and the ?fps readout. Only live fight frames count:
   the intro, pauses and a tab coming back (gaps over 250ms) would skew the average. */
const showFps = new URLSearchParams(location.search).has('fps');
let lastNow = 0;
let gapSum = 0;
let gapCount = 0;
let avgGap = 0;

/** 这一局放 L 用不用「特写」（否则「报幕」）。开局时定下，整局不变。 */
let ultCut = false;
const endOverlay = $('end');
const finaleCut = $('finale-cut') as HTMLCanvasElement;

function frame(now: number): void {
  if (!game || !renderer) return;
  const gap = lastNow ? now - lastNow : 0;
  lastNow = now;
  document.body.classList.toggle('in-finale', game.phase === 'finale');
  if (game.netRole === 'lock') netLockFrame(now);
  else if (game.netRole === 'guest') netAfter(game, now);
  else {
    if (game.netRole === 'host') hostTick(now);
    else game.advance(now);
    if (gap > 0 && gap < 250 && !game.paused && game.phase === 'fight') {
      gapSum += gap;
      if (++gapCount >= 90) {
        avgGap = gapSum / gapCount;
        gapSum = gapCount = 0;
        if (!isLiteFx() && shouldGoLite(avgGap, document.body.classList.contains('touch'))) setLiteFx(true);
      }
    }
  }
  // The result poster covers the arena: once it is up, the frozen last frame stays and the canvas rests.
  if (game.phase !== 'finished' || !endOverlay.classList.contains('has-report') || endOverlay.hidden) {
    stepCamera(game);
    // 摆键时战斗是暂停的、画面不会变：不重画整张画布，手机上拖键更跟手。
    if (!(game.paused && document.body.classList.contains('pad-edit'))) renderer.draw(game);
    renderer.drawFinaleCut(finaleCut, game);
    if (ultCut) watchUlt(game);
    if (showFps) renderer.drawFps(avgGap);
  }
  raf = requestAnimationFrame(frame);
}

/** Online host: fold the guest in, step, publish. */
function hostTick(now: number): void {
  if (!game || game.netRole !== 'host') return;
  netBefore(game);
  game.advance(now);
  netAfter(game, now);
}

/* A hidden tab gets no animation frames and its main-thread timers are throttled to about once a
   second. A dedicated worker's timer is not, so while the host tab is hidden the worker's beat
   steps the match (no drawing). Visible again, requestAnimationFrame takes back over. */
let ticker: Worker | null = null;
function hostTicker(on: boolean): void {
  if (!on) { ticker?.terminate(); ticker = null; return; }
  if (ticker || typeof Worker === 'undefined') return;
  try {
    const src = 'setInterval(() => postMessage(0), 16);';
    ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    ticker.onmessage = () => {
      if (!document.hidden || !game) return;
      if (game.netRole === 'lock') netLockFrame(performance.now());
      else hostTick(performance.now());
    };
  } catch {
    ticker = null;
  }
}

/** Both sides asked: the same link carries the next match, same picks, counted up. */
function rematchOnline(seed?: number): void {
  const setup = lastSetup;
  if (!setup?.online) return;
  if (hiddenRematch(setup)) { restBack(); return; }
  const match = netEpoch() + 1;
  const wire = keepLink();
  if (!wire) return;
  pendingLink = wire;
  void startGame({ ...setup, match, lock: setup.lock && seed !== undefined ? { seed } : setup.lock });
}

function hiddenRematch(setup: MatchSetup): boolean {
  if (select.showsHidden) return false;
  const mine = setup.online ? [setup.characters[setup.online === 'host' ? 0 : 1]] : setup.characters;
  return mine.some(c => c.hidden);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) netHidden(); });
// Closing or reloading the tab says bye on the reliable channel, so the other side reads 对手已离开 at once.
window.addEventListener('pagehide', () => { if (game?.netRole) endNet(); });

/** The pause overlay is up: a real pause offline, just the menu online. */
function menuUp(): boolean {
  return !!game && (game.paused || game.netMenu);
}

/** Leave the battle screen for the select one; any waiting run stays parked, storage untouched. */
function restBack(): void {
  abortPadEditor();
  showPauseMenu(false);
  endNet();
  paintConnection('battle-connection', null);
  hostTicker(false);
  pendingLink = null;
  cancelAnimationFrame(raf);
  game = null;
  renderer = null;
  // The fight's run stays parked in storage; the variable itself must not outlive the battle
  // screen, or a later match in any other mode would read it as "we are inside challenge".
  challenge = null;
  $('battle').hidden = true;
  $('selection').hidden = false;
  queue.resume();
  releaseBulk?.();
  releaseBulk = null;
  setPrefetchScene('menu');
  queueSelectFrame();
  document.body.classList.remove('in-battle', 'turned', 'end-up');
  select.paintSeals();
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
  if (lastSetup?.story && storyFight()) { const id = leaveStory(); restBack(); backToStory(id); return; }
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
  // What 再来一局 does is decided by the fight that just ended, not by whether some run happens
  // to be parked: a challenge end screen reopens the picker for its next stage, any other mode
  // restarts its own lastSetup. Inside an end screen game is still that fight, so the mode gate
  // is exact; the challenge check only guards the callbacks below.
  if (game?.mode === 'challenge' && challenge) {
    openChallengeStage();
    return;
  }
  if (lastSetup && hiddenRematch(lastSetup)) { restBack(); return; }
  if (game?.netRole) { netRematch(); return; }
  if (lastSetup) void startGame(lastSetup);
};
$('pause').onclick = () => game?.togglePause();
$('skill-tier').onclick = () => { sfx.play('key'); cycleSkillTier(); };
/* 桌面宽屏、手机横屏：顶栏开关只管进。进去后顶栏藏掉，退出走暂停浮层（ESC 或点计时区域打开）。 */
function syncFullscreenLabel(): void {
  setIconBtn($('fullscreen'), document.body.classList.contains('touch') ? '横屏' : '宽屏');
}
function showLayoutExit(paused: boolean): void {
  const turned = document.body.classList.contains('turned');
  const on = paused && (turned || document.body.classList.contains('wide'));
  $('wide-exit').hidden = !on;
  if (on) setIconBtn($('wide-exit'), turned ? '退出横屏' : '退出宽屏');
}
$('fullscreen').onclick = () => {
  if (document.body.classList.contains('touch')) {
    document.body.classList.add('turned');
    if (menuUp()) game?.togglePause(false);
    return;
  }
  document.body.classList.add('wide');
  if (menuUp()) showLayoutExit(true);
};
$('wide-exit').onclick = () => {
  document.body.classList.remove('wide', 'turned');
  $('wide-exit').hidden = true;
};
const battleOrientation = matchMedia('(orientation: landscape)');
onMediaChange(battleOrientation, () => {
  if (window.innerWidth > window.innerHeight) document.body.classList.remove('turned');
  if (menuUp()) showLayoutExit(true);
});
// 手机点计时暂停；桌面宽屏同理——顶栏藏了，这是鼠标开暂停浮层的入口。
// 按下即停，跟摇杆和技能键一样。横屏会吃掉 touchmove，等松开的 click 经常到不了。
document.querySelector<HTMLElement>('.timer')?.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const body = document.body;
  if (body.classList.contains('pad-edit')) return;
  if (body.classList.contains('touch') || body.classList.contains('wide')) game?.togglePause();
});
$('resume').onclick = () => { if (menuUp()) game?.togglePause(false); };
$('pause-quit').onclick = battleExit;
$('pause-reset').onclick = () => {
  if (!game || game.mode !== 'training' || game.netRole) return;
  game.trainingReset();
  game.togglePause(false);
};
$('pause-settings').onclick = () => openSettings(document.body.classList.contains('touch') ? 'controls' : undefined);

/** 暂停菜单。联机时暂停只是菜单、对局照跑，所以不给设置和观察。
 *  竖屏分板铺在按键板上：量出按键板在竞技场里的位置写给 CSS，画面一点不挡。 */
function showPauseMenu(on: boolean): void {
  const menu = $('pause-menu');
  if (!on) hidePeek();
  menu.hidden = !on;
  if (!on) return;
  const online = !!game?.netRole;
  $('pause-settings').hidden = online;
  $('pause-reset').hidden = online || game?.mode !== 'training';
  $('pause-peek').hidden = online || document.body.classList.contains('pad-split');
  placePauseMenu();
}
function placePauseMenu(): void {
  const menu = $('pause-menu');
  if (menu.hidden || !document.body.classList.contains('pad-split')) {
    menu.style.removeProperty('--pm-top');
    menu.style.removeProperty('--pm-h');
    return;
  }
  const arena = $('arena').getBoundingClientRect();
  const pad = $('touchpad').getBoundingClientRect();
  if (pad.height < 2) return;
  menu.style.setProperty('--pm-top', `${Math.round(pad.top - arena.top)}px`);
  menu.style.setProperty('--pm-h', `${Math.round(pad.height)}px`);
}
window.addEventListener('resize', () => requestAnimationFrame(placePauseMenu));
// 版式换了（退出横屏回到分板、按键台变化）不一定有 resize：跟着战斗版式重放一次，「观察」在分板下也随之收起。
onBattleLayout(() => { if (!$('pause-menu').hidden) showPauseMenu(true); });
function hidePeek(): void {
  $('pause-peek-layer').hidden = true;
  document.body.classList.remove('pause-peek-on');
}
$('pause-peek').onclick = () => {
  if (!game?.paused || game.netRole) return;
  $('pause-menu').hidden = true;
  $('pause-peek-layer').hidden = false;
  document.body.classList.add('pause-peek-on');
};
// 点画面任意处回到菜单。按下即回，跟计时暂停一样不等 click。
// 菜单在按下时就回来了；吞掉触摸后补发的 click，不然它会落在刚出现的菜单按钮上（比如「返回选人」）。
$('pause-peek-layer').addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
$('pause-peek-layer').addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  hidePeek();
  if (menuUp()) showPauseMenu(true);
});

const quitDialog = $('quit-dialog') as HTMLDialogElement;
let quitAction: (() => void) | null = null;

/** Native modal, with the scrollbar's width held as padding so the page does not shift. Measured before the lock, or the gap is already gone. */
let modalDepth = 0;
function lockScroll(): void {
  if (modalDepth++) return;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--scrollbar-gap', gap + 'px');
  document.documentElement.classList.add('modal-open');
}
function unlockScroll(): void {
  if (modalDepth === 0) return;
  if (--modalDepth > 0) return;
  document.documentElement.classList.remove('modal-open');
  document.documentElement.style.removeProperty('--scrollbar-gap');
}
/* 弹窗开着时，手指在弹窗上下滑不能拖动后面的页面。overscroll-behavior 只管得住「本身能滚」的盒子，
   内容不够长时滑动照样链到页面上，所以这里自己拦：从手指下往上找到弹窗为止，有能朝这个方向滚的盒子
   就放行，没有就吞掉这次滑动。滑条横拖不拦。 */
let modalTouchX = 0;
let modalTouchY = 0;
document.addEventListener('touchstart', e => { modalTouchX = e.touches[0]?.clientX ?? 0; modalTouchY = e.touches[0]?.clientY ?? 0; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (!document.documentElement.classList.contains('modal-open')) return;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('input[type="range"]')) return;
  // 双指（捏合缩放）和横向滑动不归这里管，只拦竖向的滚动链。
  if (e.touches.length > 1) return;
  const x = e.touches[0]?.clientX ?? modalTouchX;
  const y = e.touches[0]?.clientY ?? modalTouchY;
  const dx = x - modalTouchX;
  const dy = y - modalTouchY;
  modalTouchX = x;
  modalTouchY = y;
  if (Math.abs(dx) > Math.abs(dy)) return;
  const dialog = target?.closest('dialog');
  for (let el = target; el && dialog && dialog.contains(el); el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) continue;
    if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
    const up = el.scrollTop > 0, down = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    if ((dy > 0 && up) || (dy < 0 && down) || dy === 0) return;
  }
  if (e.cancelable) e.preventDefault();
}, { passive: false });
const dialogTriggers = new WeakMap<HTMLDialogElement, HTMLElement | null>();
function openDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  dialogTriggers.set(dialog, document.activeElement as HTMLElement | null);
  lockScroll();
  dialog.showModal();
}
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => {
  bindDialogFallback(dialog);
  /* 点空白处关：按下和抬起都要落在弹窗框外（::backdrop 的点击 target 也是 dialog 本身，所以按坐标判）。
     只看 click 的话，从框里拖出来（滑列表、拖音量、左右翻页）在框外松手也会关；点到框自己的内边距也会关。 */
  let downOutside = false;
  const outside = (e: MouseEvent) => {
    if (e.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  dialog.addEventListener('pointerdown', e => { downOutside = outside(e); });
  dialog.addEventListener('click', e => { if (downOutside && outside(e)) { cue('back'); dialog.close(); } downOutside = false; });
  dialog.addEventListener('close', () => {
    unlockScroll();
    const trigger = dialogTriggers.get(dialog);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    dialogTriggers.delete(dialog);
  });
});

/** One confirm dialog for both destructive exits; pauses the fight the way the help dialog does. */
function openQuit(title: string, text: string, yes: string, cancel: string, action: () => void): void {
  $('quit-title').textContent = title;
  $('quit-text').textContent = text;
  $('quit-text').hidden = !text;
  $('quit-yes').textContent = yes;
  $('quit-cancel').textContent = cancel;
  quitAction = action;
  if (game && !game.paused) game.togglePause(true);
  openDialog(quitDialog);
}

$('quit-close').onclick = () => quitDialog.close();
$('quit-cancel').onclick = () => quitDialog.close();
$('quit-yes').onclick = () => { const act = quitAction; quitDialog.close(); act?.(); };

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

const stampDialog = $('stamp-dialog') as HTMLDialogElement;
function paintStampLayout(): void {
  const layout = stampLayout();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#stamp-layout button')) b.classList.toggle('active', b.dataset.layout === layout);
  renderStampBook($('stamp-body'), layout, $('stamp-total'));
}
function openStamps(): void {
  if (game && !game.paused && game.phase !== 'finished') game.togglePause(true);
  closeStampShot();
  paintStampLayout();
  openDialog(stampDialog);
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#stamp-layout button')) {
  b.onclick = () => { setStampLayout(b.dataset.layout as StampLayout); paintStampLayout(); };
}
let stampShotUrl = '';
function closeStampShot(): void {
  $('stamp-shot').hidden = true;
  ($('stamp-shot-img') as HTMLImageElement).removeAttribute('src');
  if (stampShotUrl) URL.revokeObjectURL(stampShotUrl);
  stampShotUrl = '';
}
/* 一览海报：电脑直接下载 PNG；触屏浏览器多数不认 download，改成整页显示图片，长按保存。 */
$('stamp-save').onclick = async () => {
  const btn = $('stamp-save') as HTMLButtonElement;
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const canvas = await stampPoster(formatCodename(ensureCodename()));
    if (!canvas) return;
    closeStampShot();
    if (document.body.classList.contains('touch')) {
      // data: URL rather than blob: — in-app browsers (QQ, 微信, B站) often refuse to long-press save a blob image.
      ($('stamp-shot-img') as HTMLImageElement).src = canvas.toDataURL('image/png');
      $('stamp-shot').hidden = false;
    } else {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) return;
      stampShotUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = stampShotUrl;
      a.download = 'moefighters-stamps.png';
      document.body.append(a);
      a.click();
      a.remove();
    }
  } finally {
    btn.disabled = false;
  }
};
$('stamp-shot-close').onclick = closeStampShot;
stampDialog.addEventListener('close', closeStampShot);
$('stamps').onclick = openStamps;
$('end-book').onclick = openStamps;
$('close-stamps').onclick = () => stampDialog.close();
document.body.classList.toggle('no-seal-strip', !stripOn());

const helpDialog = $('help-dialog') as HTMLDialogElement;
$('help').onclick = () => { if (game && !game.paused) game.togglePause(true); openDialog(helpDialog); };
$('close-help').onclick = () => helpDialog.close();

/* 音乐弹层里的三个状态钮（音效 / 音乐 / 播放方式）：桌面和竖屏照旧显示整句文字（.pop-full），
   大厅里显示图标 + 短名（.pop-short），图标随状态换（关 = 带斜杠）。24 网格、2px 描边。 */
const SPEAKER = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>';
const NOTES = '<path d="M9 18V6l10.5-2.5v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>';
const POP_ICONS: Record<string, string> = {
  sfxOn: SPEAKER + '<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.2 6.5a7.5 7.5 0 0 1 0 11"/>',
  sfxOff: SPEAKER + '<path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  bgmOn: NOTES,
  bgmOff: NOTES + '<path d="M3.5 3.5l17 17"/>',
};
function setPopTile(btn: HTMLElement, full: string, short: string, icon: string): void {
  if (!btn.classList.contains('pop-tile')) {
    btn.classList.add('pop-tile');
    btn.innerHTML = '<svg class="pop-ico" viewBox="0 0 24 24" aria-hidden="true"></svg><span class="pop-full"></span><span class="pop-short" aria-hidden="true"></span>';
  }
  const ico = btn.querySelector('.pop-ico')!, f = btn.querySelector('.pop-full')!, sh = btn.querySelector('.pop-short')!;
  if (ico.innerHTML !== icon) ico.innerHTML = icon;
  if (f.textContent !== full) f.textContent = full;
  if (sh.textContent !== short) sh.textContent = short;
}
/* 竖屏手机把音效开关收进音乐弹层（#sound-toggle），两处是同一个开关。 */
function toggleSound(): void {
  sfx.muted = !sfx.muted;
  setIconBtn($('sound'), sfx.muted ? '♪ 音效关' : '♪ 音效开');
  setPopTile($('sound-toggle'), sfx.muted ? '♪ 音效关' : '♪ 音效开', '音效', POP_ICONS[sfx.muted ? 'sfxOff' : 'sfxOn']);
  $('sound-toggle').setAttribute('aria-pressed', String(!sfx.muted));
  if (!sfx.muted) { sfx.unlock(); sfx.play('select'); }
  syncAudioSettings();
}
$('sound').onclick = toggleSound;
$('sound-toggle').onclick = toggleSound;
setPopTile($('sound-toggle'), sfx.muted ? '♪ 音效关' : '♪ 音效开', '音效', POP_ICONS[sfx.muted ? 'sfxOff' : 'sfxOn']);

/* 音乐与音效各自独立，这条只管 BGM。做法对齐参考站的 music-settings：开关是同步布尔，
   点击立即翻转并刷 UI，点击路径上不 await 任何东西，关闭永远跟手；面板用原生 details
   展开，点外面或 ESC 收起，音乐状态不变。
   UI 写入做 rAF 节流：拖音量时 input 事件比帧快，直接逐事件写 DOM 会抖；每帧合并成
   一次写入，且内容没变的文本不重写。 */
const ORDER_LABEL = { seq: '顺序播放', shuffle: '随机播放', one: '单曲循环' } as const;
let musicUiRaf = 0;
function syncMusicUi(): void {
  if (musicUiRaf) return;
  musicUiRaf = requestAnimationFrame(() => {
    musicUiRaf = 0;
    const on = musicEnabled();
    const label = on ? '♫ 音乐开' : '♫ 音乐关';
    const btn = $('music-toggle');
    setPopTile(btn, label, '音乐', POP_ICONS[on ? 'bgmOn' : 'bgmOff']);
    btn.setAttribute('aria-pressed', String(on));
    const orderBtn = $('music-order');
    const orderLabel = ORDER_LABEL[musicOrder()];
    setPopTile(orderBtn, orderLabel, orderLabel.slice(0, 2), ORDER_ICONS[musicOrder()]);
    const title = $('music-title');
    const name = musicTitle();
    if (title.textContent !== name) title.textContent = name;
    const out = $('music-volume-value') as HTMLOutputElement;
    const text = ($('music-volume') as HTMLInputElement).value + '%';
    if (out.textContent !== text) out.textContent = text;
    syncAudioSettings();
  });
}

/* 设置「音频」页：音乐和音效各一行，左边喇叭是开关，右边是音量。跟顶栏音乐弹层是同一份状态，哪边改了两边都刷。
   横屏战斗里顶栏收起来了，这里是对局中调声音的入口（暂停 → 设置 → 音频）。 */
function syncAudioSettings(): void {
  $('set-music-switch').setAttribute('aria-checked', String(musicEnabled()));
  $('set-sfx-switch').setAttribute('aria-checked', String(!sfx.muted));
  const mv = Math.round(musicVolume() * 100), sv = Math.round(sfx.volume * 100);
  const mr = $('set-music-vol-range') as HTMLInputElement, sr = $('set-sfx-vol-range') as HTMLInputElement;
  if (document.activeElement !== mr) mr.value = String(mv);
  if (document.activeElement !== sr) sr.value = String(sv);
  $('set-music-vol-value').textContent = mv + '%';
  $('set-sfx-vol-value').textContent = sv + '%';
}
$('set-music-switch').onclick = () => { setMusicEnabled(!musicEnabled()); syncMusicUi(); };
$('set-sfx-switch').onclick = toggleSound;
$('set-music-vol-range').oninput = () => {
  const v = Number(($('set-music-vol-range') as HTMLInputElement).value);
  // 静音时拖音量就是想听：顺手打开。
  if (!musicEnabled()) setMusicEnabled(true);
  setMusicVolume(v / 100);
  ($('music-volume') as HTMLInputElement).value = String(v);
  syncMusicUi();
};
$('set-sfx-vol-range').oninput = () => {
  sfx.volume = Number(($('set-sfx-vol-range') as HTMLInputElement).value) / 100;
  if (sfx.muted) toggleSound();
  syncAudioSettings();
};
// 松手时响一声，按新音量听一下。
$('set-sfx-vol-range').onchange = () => { if (!sfx.muted) { sfx.unlock(); sfx.play('select'); } };
$('music-toggle').onclick = () => { setMusicEnabled(!musicEnabled()); syncMusicUi(); };
$('music-order').onclick = () => { setMusicOrder(cycleMusicOrder(musicOrder())); syncMusicUi(); syncFightShuffleLock(); };
$('music-prev').onclick = () => { sfx.play('key'); stepMusic(-1); syncMusicUi(); };
$('music-next').onclick = () => { sfx.play('key'); stepMusic(1); syncMusicUi(); };
$('music-volume').oninput = () => {
  setMusicVolume(Number(($('music-volume') as HTMLInputElement).value) / 100);
  syncMusicUi();
};
/* 开关与音量从 localStorage 恢复（关掉标签页也在）：滑条回到上次的档位。没有存档时默认开。
   浏览器允许就会自己响；不允许的话仍显示为开，开打时 pokeMusic 才把音乐接上。 */
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

/* 设置弹窗目前只有名册显示。战斗中打开会像帮助弹窗一样先暂停；ESC 与原生 dialog 行为一致。 */
const settingsDialog = $('settings-dialog') as HTMLDialogElement;
settingsDialog.querySelector('.set-tabs')?.addEventListener('click', () => requestAnimationFrame(() => settingsDialog.querySelector('.set-panes')?.dispatchEvent(new Event('scroll'))));
const codenameDialog = $('codename-dialog') as HTMLDialogElement;
function syncCodenameUi(): void {
  const cn = ensureCodename();
  const full = formatCodename(cn);
  $('set-codename-value').textContent = full;
  $('codename-preview-text').textContent = full;
  $('codename-adj-value').textContent = cn.adj;
  $('codename-char-value').textContent = cn.charName;
  $('codename-num-lock').textContent = '#' + cn.num;
}
$('codename-adj-menu').innerHTML = CODENAME_ADJS.map(a => `<button type="button" role="option" data-value="${a}">${a}</button>`).join('');
$('codename-char-menu').innerHTML = CODENAME_CHARS.map(n => `<button type="button" role="option" data-value="${n}">${n}</button>`).join('');
syncCodenameUi();
bindPick('codename-adj-menu', {
  get: () => ensureCodename().adj,
  set: value => {
    setCodenameWords(value, ensureCodename().charName);
    syncCodenameUi();
    select.refresh();
  },
});
bindPick('codename-char-menu', {
  get: () => ensureCodename().charName,
  set: value => {
    setCodenameWords(ensureCodename().adj, value);
    syncCodenameUi();
    select.refresh();
  },
});
$('open-codename').onclick = () => {
  syncCodenameUi();
  openDialog(codenameDialog);
};
$('close-codename').onclick = () => codenameDialog.close();
/** 打开设置。战斗中打开会先暂停；从暂停菜单进来的触屏玩家默认停在「操控」页。 */
function openSettings(tab?: string): void {
  syncFightShuffleLock();
  syncAudioSettings();
  syncCodenameUi();
  syncControlsUi();
  if (game && !game.paused) game.togglePause(true);
  showSettingsTab(tab);
  openDialog(settingsDialog);
  /* 当前页下面还有选项时，底边渐隐一截提示还能往下滑（和后台页分类栏同一个提示）；切页后重算。 */
  const panes = settingsDialog.querySelector<HTMLElement>('.set-panes');
  if (panes) { fadeMore(panes); requestAnimationFrame(() => panes.dispatchEvent(new Event('scroll'))); }
}
$('settings').onclick = () => openSettings();
$('close-settings').onclick = () => settingsDialog.close();
const showSettingsTab = bindTabs(settingsDialog);
mountSegThumbs(settingsDialog);
settingsDialog.addEventListener('close', () => {
  for (const m of settingsDialog.querySelectorAll<HTMLElement>('.tip-pop')) closePopover(m);
});

/* 设置里每一行都是左名、右控件：两三个选项用分段按钮，开关用 switch。名册显示改分组后名册重渲染，
   SelectScreen 自己重挂滚动预加载观察器。训练场两项写进同一份 prefs，进行中的对局下一帧就生效。 */
bindSeg('set-theme-seg', {
  get: themePref,
  set: value => setThemePref(value as ThemePref),
});
/* 大厅模式：自动 = 横屏小屏手机开、其他关；开 / 关所有设备照办。改了立刻生效（mobile.ts 重挂 html 类并通知大厅）。 */
bindSeg('set-lobby-seg', {
  get: lobbyPrefValue,
  set: value => setLobbyPref(value as LobbyPref),
});
/* 必杀演出：报幕（默认，不停顿）/ 特写（定格快切）。下一局起生效，进行中的对局不变。 */
bindSeg('set-ult-seg', {
  get: ultShowPref,
  set: value => setUltShowPref(value as UltShow),
});
bindSeg('set-roster-seg', {
  get: () => select.isGrouped ? 'band' : 'flat',
  set: value => select.setRosterGrouped(value === 'band'),
});
const syncThumbPick = bindSeg('set-thumb-seg', {
  get: () => select.rosterThumb,
  set: value => select.setRosterThumb(parseRosterThumb(value)),
});
// The roster title row has its own quick switch; whichever control flips it, both show the same value.
select.onThumb = syncThumbPick;
bindSwitch('set-strip-switch', {
  get: stripOn,
  set: on => setStripOn(on),
});
bindSwitch('set-hidden-switch', {
  get: () => select.showsHidden,
  set: on => {
    select.setShowHidden(on);
    if (!select.showsHidden && challenge?.char.hidden && !$('buff-picker').hidden) restBack();
  },
});
bindSwitch('set-nocd-switch', {
  get: () => trainPrefs().noCd,
  set: on => { setTrainPrefs({ noCd: on }); select.refresh(); },
});
bindSwitch('set-ult-switch', {
  get: () => trainPrefs().infiniteUlt,
  set: on => { setTrainPrefs({ infiniteUlt: on }); select.refresh(); },
});
bindSwitch('set-dummy-guard-switch', {
  get: () => trainPrefs().dummyGuard,
  set: on => setTrainPrefs({ dummyGuard: on }),
});
bindSwitch('set-quick-heal-switch', {
  get: () => trainPrefs().quickHeal,
  set: on => setTrainPrefs({ quickHeal: on }),
});
bindSwitch('set-fight-shuffle-switch', {
  get: fightShuffle,
  set: on => setFightShuffle(on),
});
bindTip('set-fight-shuffle-tip');
function syncFightShuffleLock(): void {
  const btn = $('set-fight-shuffle-switch') as HTMLButtonElement;
  btn.disabled = musicOrder() !== 'shuffle';
}
syncFightShuffleLock();

/* 操控页：键位方案、进阶下的空白处手势、横屏自定义布局。只有触屏用得上，键鼠不显示这一页。 */
const syncScheme = bindSeg('set-scheme-pick', {
  get: scheme,
  set: value => { setScheme(value as Scheme); syncControlsUi(); },
});
bindSwitch('set-blank-switch', { get: blankGesture, set: setBlankGesture });
function syncControlsUi(): void {
  syncScheme();
  $('set-tab-controls').hidden = !document.body.classList.contains('touch');
  $('set-blank-row').hidden = scheme() !== 'advanced';
  ($('set-layout-reset') as HTMLButtonElement).disabled = !hasCustom(scheme());
  // 联机对局停不下来，不能在上面摆键。
  ($('set-layout-edit') as HTMLButtonElement).disabled = !!game?.netRole;
}
onControls(() => { if (!padEditing()) syncControlsUi(); });
syncControlsUi();
$('set-layout-reset').onclick = () => { resetLayout(scheme()); syncControlsUi(); };
$('set-layout-edit').onclick = () => { void editPadLayout(); };

/** 在真实战斗画面上摆键：战斗中就用这一局（先暂停），不在战斗中开一局训练场。
 *  竖屏手机转成横屏再摆，摆完转回来；结束后回到设置的「操控」页。 */
async function editPadLayout(): Promise<void> {
  if (game?.netRole || padEditing()) return;
  settingsDialog.close();
  // 结算画面上停不下来，回选人再开一局训练场。
  if (game && game.phase === 'finished') restBack();
  const fresh = !game;
  if (fresh) {
    const base = select.setup();
    try {
    // 固定 RiNG 夜景：画面暗，按键看得清；亮的场景会把半透明的键吃掉。
    const stage = STAGES.find(s => s.id === 'ring') ?? base.stage;
      await startGame({ ...base, stage, mode: 'training', difficulty: 1, characters: base.characters.slice(0, 2), controllers: [0, null], mods: undefined, challengeKind: undefined, stageNumber: undefined });
    } catch (err) {
      console.warn('布局编辑：训练场没开起来', err);
      return;
    }
  }
  const g = game;
  if (!g || g.netRole) return;
  if (!g.paused) g.togglePause(true);
  hidePeek();
  const body = document.body.classList;
  const turnedByUs = body.contains('touch') && body.contains('pad-split');
  if (turnedByUs) body.add('turned');
  // 版式要先落定：转屏后按键板在下一帧才是横屏叠键。
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  // 等的这两帧里战斗可能已经被收掉或换了一局（回选人、开了新局）：那就不开了。
  if (game !== g || !document.body.classList.contains('in-battle')) {
    if (turnedByUs) body.remove('turned');
    return;
  }
  openPadEditor(() => {
    if (turnedByUs) body.remove('turned');
    if (fresh && game === g) restBack();
    openSettings('controls');
  });
}

document.addEventListener('visibilitychange', () => setMusicSuspended(document.hidden));
window.addEventListener('blur', () => setMusicSuspended(true));
window.addEventListener('focus', () => setMusicSuspended(false));

document.addEventListener('pointerdown', e => {
  const t = e.target;
  /* Start/rematch spend the tap on fullscreen. Audio unlock here would consume it first, and Chrome then rejects requestFullscreen. */
  const start = t instanceof Element ? t.closest('#start:not([aria-disabled="true"]), #lobby-quick:not([aria-disabled="true"]), #rematch') : null;
  if (start && (start.id !== 'rematch' || !lastSetup || !hiddenRematch(lastSetup))) {
    enterBattleFullscreen();
    return;
  }
  sfx.unlock();
  nudgeMusic();
}, { capture: true });
document.addEventListener('keydown', e => { if (!e.repeat) { sfx.unlock(); nudgeMusic(); } }, { capture: true });
// 终幕 skip: every press counts; finalePress ignores the first moment, and only a second press inside the prompt skips.
document.addEventListener('pointerdown', () => game?.finalePress(), { capture: true });
document.addEventListener('keydown', e => { if (!e.repeat) game?.finalePress(); }, { capture: true });
// 选区、放大镜、双击缩放由 body.touch 的 CSS 关掉。这里再 preventDefault 会把正在进行的点击作废。

/* ---- 后台：存档、碎片、四个页面 ---- */
bindSaveUi(openDialog);
bindResources(openDialog);
bindHub();
/* 手机后台页的触感音效：只在触屏发声（ui/mobile.ts 判定），键鼠访问保持安静。 */
setUiCue((k, step) => { sfx.unlock(); sfx.ui(k, step); });
bindFeel();
bindPress();
bindLayerBack();
bindPeeks();
/* 「直接排开 / 按乐队分组」两处（印章册、设置名册）横屏换成视图图标：平铺网格 / 分组网格。图标运行时插入，文字照留（桌面显示、读屏名），横屏只看图标。 */
{
  const VIEW_ICONS: Record<string, string> = {
    flat: '<rect x="3.5" y="4" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="4" width="4.5" height="4.5" rx="1"/><rect x="16" y="4" width="4.5" height="4.5" rx="1"/><rect x="3.5" y="10" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="10" width="4.5" height="4.5" rx="1"/><rect x="16" y="10" width="4.5" height="4.5" rx="1"/><rect x="3.5" y="16" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="16" width="4.5" height="4.5" rx="1"/><rect x="16" y="16" width="4.5" height="4.5" rx="1"/>',
    band: '<path d="M3.5 4h7"/><rect x="3.5" y="6.5" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="6.5" width="4.5" height="4.5" rx="1"/><path d="M3.5 14h7"/><rect x="3.5" y="16.5" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="16.5" width="4.5" height="4.5" rx="1"/><rect x="16" y="16.5" width="4.5" height="4.5" rx="1"/>',
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>('#stamp-layout button[data-layout], #set-roster-seg button[data-value]')) {
    const k = b.dataset.layout ?? b.dataset.value ?? '';
    if (!VIEW_ICONS[k] || b.querySelector('.view-ico')) continue;
    b.setAttribute('aria-label', b.textContent?.trim() ?? '');
    b.classList.add('view-btn');
    b.insertAdjacentHTML('afterbegin', `<svg class="view-ico" viewBox="0 0 24 24" aria-hidden="true">${VIEW_ICONS[k]}</svg>`);
  }
}
registerLayer(() => { const s = $('music-settings') as HTMLDetailsElement; if (!s.open) return false; s.open = false; return true; });
bindScrollLock();
bindBackdropClose();
bindSheetDrag();
bindArtFocus();
bindAppHeight();
bindBrowse();
bindMusicPage();

/* ---- 剧情闯关（src/story/）：后台壳里的「剧情」页 + 首页「更多」入口 + 大厅进度卡 ---- */
function storyLabel(id: string): string {
  const s = stageById(id);
  return s ? `剧情 · ${s.id} ${s.title}` : '剧情';
}
function backToStory(id: string | null): void {
  if (id) selectStage(id);
  if (hubOpen() === 'story') refreshStoryMap();
  else openHub('story');
}
function paintStoryEntry(): void {
  const p = progressLine();
  const fresh = hasNew();
  $('bs-story').textContent = `${p.title} ${p.done} / ${p.total}`;
  $('bs-story-new').hidden = !fresh;
  $('lb-story-ch').textContent = p.title;
  // 大厅卡窄：只放下一关的编号（全部通过时放最后一关），进度交给下面的进度条。
  $('lb-story-n').textContent = nextStage() ?? ALL_STAGES[ALL_STAGES.length - 1].id;
  $('lb-story-n').closest('button')?.setAttribute('aria-label', `剧情 · ${p.title} ${p.done} / ${p.total}`);
  $('lb-story-bar').style.setProperty('--k', String(p.total ? p.done / p.total : 0));
  $('lb-story-new').hidden = !fresh;
}
registerHubPage('story', storyPage);
setStoryPlay(id => { sfx.unlock(); void playStage(id); });
const storyRulesDialog = $('story-rules-dialog') as HTMLDialogElement;
setStoryRules(() => { $('story-rules-body').innerHTML = storyRulesHtml(); openDialog(storyRulesDialog); });
$('close-story-rules').onclick = () => storyRulesDialog.close();
setTheatreSound((k, o) => sfx.story(k, o));
bindStory({ fight: setup => startGame(setup), back: backToStory });
onStory(paintStoryEntry);
paintStoryEntry();
/* 剧本预览：?story=1-03 直接演这一关（含战斗），不记进度。 */
{
  const id = new URLSearchParams(location.search).get('story');
  if (id && stageById(id)) void playStage(id, true);
}
setRewardOpener(openDialog);
bindTasksPage(openDialog);
setFramePreviewOpener(openDialog);
bindFramePreview();
setFinalePreviewHooks(openDialog, k => { sfx.unlock(); sfx.play(k); }, () => sfx.preloadFinale());
bindFinalePreview();
setItemPreviewOpener(openDialog);
bindItemPreview();
bindShopPage(openDialog);
bindLockerPage(openStamps);
setNavStamps(openStamps);
/* 横屏手机的首页是大厅。 */
setNavHome(go => lobbyMode() ? openQuit('回到大厅？', '', '回到大厅', '留在这里', go) : openQuit('返回首页？', '', '返回首页', '留在这里', go));
bindLooks();
/* 音乐库、自然播完换曲都会走这里：顶栏曲名、音量条、开打换曲开关跟着更新。 */
onMusicChange(() => {
  ($('music-volume') as HTMLInputElement).value = String(Math.round(musicVolume() * 100));
  syncMusicUi();
  syncFightShuffleLock();
});
