/* 剧情演出：小型舞台剧 + 纸板立牌（设计记录第 3 节；样机 docs/mockups/story-stage.html）。
   一张 1280×720 的画布叠在全屏浮层里：战斗背景压暗当布景，顶幕、侧幕、脚灯、聚光灯，纸板角色按剧本走位、说话。
   点画面 / 空格推进，「自动」按停顿自己走，「跳过」直接演完这一段。演出只靠代码动纸板，不用 walk 帧。

   纸板换图能表达的情绪有限，表现力主要靠这几层（都从现有剧本自动推出来，不用改剧本格式）：
   · 漫符：头顶弹出「？」「！」「!?」「…」、汗滴、怒筋、星星、阴影竖线。
   · 纸板小动作：惊吓（压扁再弹起）、点头、摇头、跺脚、开心时原地蹦两下。吃惊、开心都不换图（受击格往后仰、跳跃格双脚离地，立在台上都怪）。受击格只留给「后退」这种真被吓退的时候。
   · 文字节奏：逗号、句号、省略号、感叹号处停顿；短促的喊叫字号放大、对话框一震。
   · 声音：打字音（每个角色自己的音高和音色，广播带失真）、脚步、翻纸、震屏、漫符、幕布、开场铃。
   · 开场的大幕 + 关卡标题卡；章末关落幕后出「完」。 */

import { ROSTER_BY_ID } from '../data/characters.ts';
import { STAGES } from '../data/stages.ts';
import { portraitOf } from '../data/portraits.ts';
import { loadImage } from '../assets/loader.ts';
import { setMusicPausedForTheatre } from '../audio/bgm.ts';
import type { StorySound } from '../audio/sfx.ts';
import { registerLayer } from '../ui/layerBack.ts';
import { reducedMotion } from '../ui/motion.ts';
import { bakeCard, CARD_SIZE, PAD, type Card } from './cards.ts';
import { isNightmare, isPhantom, type Cmd, type Pose, type Script } from './script.ts';
import { SLOT_X, ahead, block, enter, faceIn, openStage, reaim as reaimCast } from './stage.ts';
import { drawProps, propCmd, propSrc, resetProps, setPropImage, snapProps, stepProps, type PropEnv } from './props.ts';
import { FX_LASTING, drawFx, fxCmd, fxDissolve, fxGather, fxImpact, resetFx, snapFx, stepFx, type FxEnv } from './fx.ts';

const W = 1280, H = 720, FLOOR = 578, CELL = 256;
/** 纸板只比战斗时略大：战斗里格子画成 view.height（960×540 场地），这里 ×(720/540)×1.1。 */
const BIG = 720 / 540 * 1.1;
const WALK = 560;
/** 大屏（舞台显示宽度 ≥ BIG_SCREEN 个 CSS 像素，PC 一类）：纸板缩小到 1 个 256 格像素最多放大成 MAX_MAG 个 CSS 像素，
 *  减少放大后的模糊。手机这类小屏本来看不清细节缺陷，保持原尺寸。按一个标准身高（181）算统一倍率，人物之间的相对高矮不变。 */
const BIG_SCREEN = 960;
const MAX_MAG = 1.1;
const REF_K = 181 * BIG / 256;
let zoom = 1;
const VIOLA = '#9b6bff';
const $ = (id: string) => document.getElementById(id)!;

/* ---- 声音：main.ts 接到 Sfx.story。跳过中不出声。 ---- */
type SoundOpts = { pitch?: number; wave?: OscillatorType; fuzz?: boolean; soft?: boolean };
let sound: (k: StorySound, o?: SoundOpts) => void = () => {};
export function setTheatreSound(fn: (k: StorySound, o?: SoundOpts) => void): void { sound = fn; }
const sfx = (k: StorySound, o?: SoundOpts) => { if (!skipping) sound(k, o); };

/** 打字音：每个角色一个音高和音色。没列的按 id 散列出一个。 */
const VOICE: Record<string, { pitch: number; wave: OscillatorType }> = {
  sakiko: { pitch: 300, wave: 'triangle' }, uika: { pitch: 430, wave: 'triangle' }, mutsumi: { pitch: 280, wave: 'sine' },
  umiri: { pitch: 320, wave: 'sine' }, nyamu: { pitch: 600, wave: 'square' },
  soyo: { pitch: 400, wave: 'triangle' }, anon: { pitch: 560, wave: 'square' }, tomori: { pitch: 460, wave: 'sine' },
  taki: { pitch: 360, wave: 'square' }, rana: { pitch: 520, wave: 'sine' },
  kasumi: { pitch: 680, wave: 'square' }, arisa: { pitch: 480, wave: 'square' },
  yukina: { pitch: 340, wave: 'sine' }, sayo: { pitch: 380, wave: 'triangle' },
  mitake: { pitch: 360, wave: 'triangle' }, moca: { pitch: 420, wave: 'sine' },
  chuchu: { pitch: 640, wave: 'square' }, pareo: { pitch: 620, wave: 'triangle' },
  viola: { pitch: 230, wave: 'sawtooth' },
};
function voiceOf(id: string | null, tag?: string): SoundOpts {
  if (!id) return { pitch: 520, wave: 'sine', soft: true };
  let v = VOICE[id];
  if (!v) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v = { pitch: 340 + h % 300, wave: (['triangle', 'square', 'sine'] as const)[h % 3] };
  }
  return { ...v, fuzz: tag === '广播', soft: tag === '心声' };
}

/* ---- 漫符 ---- */
type Mark = 'q' | 'ex' | 'qex' | 'dots' | 'sweat' | 'anger' | 'star' | 'gloom';
const GLYPH: Partial<Record<Mark, string>> = { q: '?', ex: '!', qex: '!?', dots: '…' };
/* 开心 = 小星星 + 原地蹦两下（不换纸板）。 */

interface Flip { t: number; dur: number; from: number; to: number | 'back' }
interface Actor {
  name: string;
  id: string | null;
  x: number;
  to: number;
  face: number;
  pose: Pose;
  alpha: number;
  leaving: boolean;
  flip: Flip | null;
  /** 复制体翻面后停在深色背面。 */
  revealed: boolean;
  copy: boolean;
  /** 影子深度 0–1，复制体伏笔。 */
  deep: number;
  deepTo: number;
  hop: number;
  hopH: number;
  shake: number;
  pop: number;
  /** 小动作计时（秒，倒数到 0）。 */
  startle: number;
  /** 开心：原地连蹦两下、左右轻晃。 */
  happy: number;
  nod: number;
  headShake: number;
  stomp: number;
  /** 后退时短暂换成受击格。 */
  recoil: number;
  /** 走路相位：每半个周期落一步，响一声。 */
  stepPh: number;
  mark: { kind: Mark; t: number; life: number } | null;
  /** 剧本写了「转身」：自动朝向不再动她，直到她下一次移动。 */
  lock: boolean;
  /** 已经现身的梦魇（剧本写「梦魇海铃」）：暗紫纸板、影子极深。 */
  nightmare: boolean;
  /** 梦魇被打倒后化光消散的倒计时（秒）。 */
  fade: number;
  fadeMax: number;
  /** 墨提斯（睦的分身）：半透明冷色、浮在地上。 */
  phantom: boolean;
  /** 「虚化」：身体变得透明、一闪一闪。 */
  ghostly: boolean;
}
const FADE = 1;

interface Line {
  who: string | null; id: string | null; tag?: string; text: string;
  chars: string[];
  /** 每个字出现的时刻（秒，从这句开始算）。标点后面留停顿。 */
  at: number[];
  t: number;
  shown: number;
  /** 短促的喊叫：字大一号，出完一震。 */
  shout: boolean;
  jolt: number;
}

export interface PlayOptions {
  /** 剧本简称 → 'always' 或触发影子变深的台词片段。 */
  copies?: Record<string, string>;
  /** 进入战斗前的收纸板过场（只在战前段结束、后面接战斗时播）。 */
  toBattle?: boolean;
  /** 先瞬间演完这些指令（战后段从战前段的最终站位开始）。 */
  warm?: Cmd[];
  /** 开场大幕上的标题卡（战后段不出）。 */
  card?: { kicker: string; title: string };
  /** 落幕后大幕上的字（章末关）。 */
  endCard?: { kicker: string; title: string };
  /** 预览跳行（?story=3-01&at=27）：剧本第 at 行之前的指令瞬间演完，从这一行开始正常演。审定截图用。 */
  at?: number;
}

let built = false;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let raf = 0;
let scale = 1;

/* ---- 资源 ---- */
const sheets = new Map<string, HTMLImageElement>();
const avatars = new Map<string, HTMLImageElement>();
const portraits = new Map<string, HTMLImageElement>();
const cards = new Map<string, Card>();
let backdrop: HTMLImageElement | null = null;

function cardOf(id: string, pose: Pose): Card | null {
  const k = id + ':' + pose;
  let c = cards.get(k);
  if (c) return c;
  const sheet = sheets.get(id);
  if (!sheet?.naturalWidth) return null;
  c = bakeCard(sheet, pose);
  cards.set(k, c);
  return c;
}
const heightOf = (id: string): number => {
  const v = ROSTER_BY_ID.get(id)?.view;
  return v && v.kind === 'sprite' ? v.height : 180;
};
const colorOf = (id: string | null, who: string | null): string => id ? ROSTER_BY_ID.get(id)?.color ?? '#97a1c3' : who === '薇欧拉' ? VIOLA : who === ZHIMENG ? ZHIMENG_COLOR : '#97a1c3';

/* ---- 织萌：结局前只以「星空剪影」出现 ----
   完整的织萌留到结局。游戏里只放她的剪影蒙版（public/story/zhimeng-silhouette.webp，只有轮廓的 alpha，
   没有任何颜色和细节），在这里填成深紫黑、描一圈淡粉白的光、里面闪着星点，半透明地飘在舞台中后方。
   她第一次开口时由星点汇聚成形，暗场时跟着暗下去。 */
const ZHIMENG = '织萌';
const ZHIMENG_COLOR = '#ffc8e6';
const GHOST_SRC = '/story/zhimeng-silhouette.webp';
const GHOST_H = 430;
let ghostMask: HTMLImageElement | null = null;
let ghostBody: HTMLCanvasElement | null = null;
let ghostGlow: HTMLCanvasElement | null = null;
let ghostTmp: HTMLCanvasElement | null = null;
let ghost = 0, ghostTo = 0;
/** 剪影里的星点：位置固定（0–1），各自按自己的相位闪。 */
const GHOST_STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1), y: r(2), s: .8 + r(3) * 1.8, ph: r(4) * 6.28, sp: 1.2 + r(5) * 2.2 };
});

function bakeGhost(mask: HTMLImageElement): void {
  const h = GHOST_H, w = Math.round(h * mask.naturalWidth / mask.naturalHeight), pad = 28;
  const make = () => { const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; return c; };
  // 本体：深紫黑，上浅下深一点，像夜空。
  ghostBody = make();
  let g = ghostBody.getContext('2d')!;
  g.drawImage(mask, pad, pad, w, h);
  g.globalCompositeOperation = 'source-in';
  const grad = g.createLinearGradient(0, pad, 0, pad + h);
  grad.addColorStop(0, '#2a1a44'); grad.addColorStop(.55, '#180f2c'); grad.addColorStop(1, '#0d0818');
  g.fillStyle = grad; g.fillRect(0, 0, ghostBody.width, ghostBody.height);
  // 光晕：同一个轮廓染成淡粉白再糊开，垫在本体后面，就是一圈边光。
  ghostGlow = make();
  g = ghostGlow.getContext('2d')!;
  g.filter = 'blur(7px)';
  g.drawImage(mask, pad, pad, w, h);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffd9ef'; g.fillRect(0, 0, ghostGlow.width, ghostGlow.height);
  ghostTmp = make();
}

function drawGhost(): void {
  if (ghost < .01 || !ghostBody || !ghostGlow || !ghostTmp) return;
  const bw = ghostBody.width, bh = ghostBody.height;
  const cx = W / 2, cy = 292 + Math.sin(clock * 1.1) * 9;
  const x = cx - bw / 2, y = cy - bh / 2;
  // 信号不稳：偶尔闪一下。别人说话时退后一点。
  const flicker = reducedMotion() ? 1 : Math.sin(clock * 13) * Math.sin(clock * 3.7) > .82 ? .6 : 1;
  const listening = line && line.who !== ZHIMENG ? .78 : 1;
  const a = ease(ghost) * flicker * listening;
  // 星点在本体里闪：先把本体铺到临时画布，再只在轮廓内画星。
  const t = ghostTmp.getContext('2d')!;
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, bw, bh);
  t.drawImage(ghostBody, 0, 0);
  t.globalCompositeOperation = 'source-atop';
  const band = t.createLinearGradient(0, 0, 0, bh);
  // 一道微光从上往下扫过。色标必须落在 0–1，越界 addColorStop 会抛错。
  const k = (clock * .18) % 1.4 - .2;
  const c01 = (v: number) => Math.min(1, Math.max(0, v));
  band.addColorStop(c01(k - .12), 'rgba(255,200,236,0)');
  band.addColorStop(c01(k), 'rgba(255,200,236,.13)');
  band.addColorStop(c01(k + .12), 'rgba(255,200,236,0)');
  t.fillStyle = band; t.fillRect(0, 0, bw, bh);
  for (const st of GHOST_STARS) {
    const tw = .35 + .65 * Math.max(0, Math.sin(clock * st.sp + st.ph));
    // 成形时星点先亮：ghost 小时星多、身体淡。
    const al = Math.min(1, tw * (.55 + .45 * (1 - ghost)) + (1 - ghost) * .4);
    t.fillStyle = `rgba(255,238,250,${al})`;
    t.beginPath(); t.arc(st.x * bw, st.y * bh, st.s, 0, 7); t.fill();
  }
  ctx.save();
  ctx.globalAlpha = a * .75;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(ghostGlow, x, y);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a * .82;
  ctx.drawImage(ghostTmp, x, y);
  // 身边慢慢升起的光点。
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const s = GHOST_STARS[i];
    const life = (clock * .22 + s.ph / 6.28) % 1;
    const px = cx + (s.x - .5) * bw * 1.25 + Math.sin(clock * .8 + s.ph) * 10;
    const py = cy + bh * .45 - life * bh * 1.05;
    ctx.globalAlpha = a * Math.sin(life * Math.PI) * .7;
    ctx.fillStyle = '#ffe3f4';
    ctx.beginPath(); ctx.arc(px, py, s.s + .6, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/** 这一段要用到的所有人、场景都下完、纸板都烘好。 */
async function prepare(s: Script, cmds: Cmd[]): Promise<void> {
  const ids = new Set<string>();
  const port = new Set<string>();
  const onStage = new Set<string>();
  const poses = new Map<string, Set<Pose>>();
  const needPose = (id: string, p: Pose) => {
    let set = poses.get(id);
    if (!set) poses.set(id, set = new Set<Pose>(['idle']));
    set.add(p);
  };
  for (const o of s.opening) { const id = idOfName(o.who); if (id) { ids.add(id); onStage.add(id); needPose(id, 'idle'); } }
  for (const c of cmds) {
    if ((c.k === 'act' || c.k === 'line') && c.id) ids.add(c.id);
    if (c.k === 'act' && c.id) {
      onStage.add(c.id);
      needPose(c.id, 'idle');
      if (c.verb === '倒下') needPose(c.id, 'down');
      else if (c.verb === '后退') needPose(c.id, 'hurt');
      else if (c.verb === '换' && c.arg) { const p = POSE_OF[c.arg]; if (p && p !== 'hurt' && p !== 'jump') needPose(c.id, p); }
    }
    if (c.k === 'line' && c.id && c.pose && c.pose !== 'hurt' && c.pose !== 'jump') needPose(c.id, c.pose);
    if (c.k === 'stage' && c.verb === '立绘' && c.arg) { const id = idOfName(c.arg); if (id) port.add(id); }
  }
  const stage = STAGES.find(x => x.id === s.scene || x.name === s.scene);
  const jobs: Promise<unknown>[] = [];
  const get = (map: Map<string, HTMLImageElement>, key: string, src: string) => {
    if (map.has(key)) return;
    jobs.push(loadImage(src).then(im => { map.set(key, im); }, () => {}));
  };
  for (const id of ids) {
    const v = ROSTER_BY_ID.get(id)?.view;
    if (v?.kind === 'sprite' && onStage.has(id)) get(sheets, id, v.common);
    get(avatars, id, `/avatars/${id}.png`);
  }
  for (const id of port) { const p = portraitOf(id); if (p) get(portraits, id, p.src); }
  if (cmds.some(c => c.k === 'line' && c.who === ZHIMENG) && !ghostMask) {
    jobs.push(loadImage(GHOST_SRC).then(im => { ghostMask = im; try { bakeGhost(im); } catch (e) { console.warn('织萌剪影烘焙失败', e); } }, () => {}));
  }
  for (const c of cmds) if (c.k === 'prop') { const src = propSrc(c.name); if (src) jobs.push(loadImage(src).then(im => setPropImage(c.name, im), () => {})); }
  backdrop = null;
  if (stage?.image) jobs.push(loadImage(stage.image).then(im => { backdrop = im; }, () => {}));
  // 网络卡住（请求既不成功也不报错）时不能让玩家一直停在「下载中」的大幕上：最多等 PREPARE_WAIT 毫秒，
  // 没到的图按缺图演（纸板、背景、道具各自有缺图退路），晚到的照样记进缓存，下一句就用上。
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, PREPARE_WAIT))]);
  // 纸板在这里烘：只预烘这一段实际用到的动作格（其余动作真用到时再由 cardOf 按需补烘），避免 20 人同关时一次烘上百张卡顿。
  for (const id of onStage) for (const p of poses.get(id) ?? ['idle']) { try { cardOf(id, p); } catch (e) { console.warn('纸板烘焙失败', id, p, e); } }
}
let idOfName: (n: string) => string | null = () => null;
/** 开演前最多等素材这么久（毫秒）。 */
const PREPARE_WAIT = 15000;

/* ---- 舞台状态 ---- */
let actors: Actor[] = [];
let line: Line | null = null;
let dark = 0, darkTo = 0;
let shake = 0;
let flash = 0;
let fold = 0, foldTo = 0;
let sepia = 0, sepiaTo = 0;
/** 大幕：1 合上，0 拉开。 */
let curtain = 0, curtainTo = 0;
/** 大幕上的字和它的透明度。 */
let plate: { kicker: string; title: string } | null = null;
let plateA = 0, plateTo = 0;
let pop: { id: string; t: number } | null = null;
let clock = 0;
let skipping = false;
let auto = false;
let waits: { until: number; done: () => void }[] = [];
let tapWait: (() => void) | null = null;
let copyCues: { name: string; cue: string }[] = [];

function wait(sec: number): Promise<void> {
  if (skipping || sec <= 0) return Promise.resolve();
  return new Promise(r => waits.push({ until: clock + sec, done: r }));
}
function waitTap(): Promise<void> {
  if (skipping) return Promise.resolve();
  return new Promise(r => { tapWait = r; });
}
function settle(): void {
  for (const w of waits) w.done();
  waits = [];
  tapWait?.(); tapWait = null;
}

const find = (name: string) => actors.find(a => a.name === name && !a.leaving);
/* 走位规则（朝向、让位、铺开）在 stage.ts，和排练脚本共用；这里只把它接到台上的人和翻面动画上。 */
const present = () => actors.filter(o => !o.leaving);
function turnTo(a: Actor, dir: number): void {
  if (a.face === dir || a.lock || a.revealed || a.leaving || a.pose === 'down') return;
  if (skipping) { a.face = dir; a.flip = null; return; }
  if (a.flip) return;
  a.flip = { t: 0, dur: .3, from: a.face, to: dir };
}
const reaim = () => reaimCast(present(), turnTo);
let lastSpeaker: string | null = null;
/** 这一段已经有人开口了（开场的「背对」直接站好，不演转身）。 */
let spokeAny = false;

function place(name: string, id: string | null, slot: string, copies: Record<string, string>): Actor {
  const x = SLOT_X[slot] ?? W / 2;
  const nightmare = isNightmare(name);
  const deep = copies[name] === 'always' || nightmare ? 1 : 0;
  const a: Actor = {
    name, id, x, to: x, face: faceIn(x), pose: 'idle', alpha: 1, leaving: false, flip: null, revealed: false, copy: name in copies || nightmare, nightmare, fade: 0, fadeMax: FADE, phantom: isPhantom(name), ghostly: false,
    deep, deepTo: deep, hop: 0, hopH: 60, shake: 0, pop: 0, startle: 0, happy: 0, nod: 0, headShake: 0, stomp: 0, recoil: 0, stepPh: 0, mark: null, lock: false,
  };
  actors = actors.filter(o => o.name !== name).concat(a);
  return a;
}

function busy(): boolean { return actors.some(a => Math.abs(a.x - a.to) > 1 || a.flip || a.hop > 0 || a.fade > 0 || (a.leaving && a.alpha > 0)); }
async function settleActors(): Promise<void> {
  for (let i = 0; i < 120 && busy() && !skipping; i++) await wait(1 / 30);
  if (skipping) snap();
}
function snap(): void {
  for (const a of actors) {
    a.x = a.to; a.hop = 0; a.shake = 0; a.pop = 0; a.deep = a.deepTo;
    a.startle = a.happy = a.nod = a.headShake = a.stomp = a.recoil = 0; a.mark = null;
    if (a.flip) { if (a.flip.to === 'back') a.revealed = true; else a.face = a.flip.to; a.flip = null; }
  }
  for (const a of actors) a.fade = 0;
  actors = actors.filter(a => !a.leaving);
  snapProps();
  snapFx();
  dark = darkTo; fold = foldTo; sepia = sepiaTo; curtain = curtainTo; plateA = plateTo; shake = 0; flash = 0; pop = null;
}

function mark(a: Actor, kind: Mark, life = 1.5): void {
  if (kind === 'star') life = 1.7;
  a.mark = { kind, t: 0, life };
  sfx(kind === 'star' ? 'sparkle' : kind === 'gloom' ? 'flip' : 'pop');
}
function startle(a: Actor): void { a.startle = .34; sfx('boing'); }

/** 化作光点散去（消散、墨提斯退场）。 */
function dissolve(a: Actor, dur: number): void {
  a.leaving = true; a.to = a.x; a.fade = a.fadeMax = dur;
  if (a.id && !skipping) fxDissolve(a.x, heightOf(a.id) * BIG * zoom, zoom, a.phantom ? 'cold' : 'gold', dur, a.pose === 'down');
  sfx('sparkle');
}

function act(c: Extract<Cmd, { k: 'act' }>, copies: Record<string, string>, prev?: Cmd): void {
  if (c.verb === '走入') {
    const a = place(c.who, c.id, c.arg ?? '中', copies);
    enter(present(), a, c.arg);
    // 墨提斯不是走上来的：在站位上由光点汇聚成形。
    if (a.phantom) {
      a.x = a.to; a.alpha = 0;
      if (a.id && !skipping) fxGather(a.x, heightOf(a.id) * BIG * zoom, zoom);
      sfx('sparkle');
    }
    return;
  }
  const a = find(c.who);
  if (!a) return;
  // 墨提斯「退场」不写方向 = 化光散去；写了左 / 右就是护送别人一起走下台。
  if (c.verb === '消散' || (c.verb === '退场' && a.phantom && !c.arg)) { dissolve(a, a.phantom ? .9 : 1.6); return; }
  const turn = block(present(), a, c.verb, c.arg, {
    target: (c.verb === '靠近' || c.verb === '背对' || c.verb === '面向') && c.arg ? find(c.arg) : undefined,
    afterEnter: prev?.k === 'act' && prev.who === c.who && prev.verb === '走入',
    instant: !spokeAny,
  });
  if (turn) { a.flip = { t: turn.t0, dur: .45, from: turn.from, to: turn.to }; sfx('flip'); }
  switch (c.verb) {
    // 真被吓退：短暂换成受击格往后滑一步，带汗。
    case '后退': a.recoil = .45; mark(a, 'sweat', 1); break;
    case '跳': a.hop = .5; a.hopH = 60; sfx('boing'); break;
    case '倒下':
      a.pose = 'down'; a.pop = .25; sfx('stomp');
      // 梦魇被打倒不会躺在台上：化作光点消散（剧情设定：被击败后暂时消散）。
      if (a.nightmare) {
        a.leaving = true; a.fade = a.fadeMax = FADE; mark(a, 'star', FADE);
        if (a.id && !skipping) fxDissolve(a.x, heightOf(a.id) * BIG * zoom, zoom, 'night', FADE, true);
      }
      break;
    case '起身': a.pose = 'idle'; a.pop = .25; sfx('nod'); break;
    case '发抖': a.shake = .7; mark(a, 'gloom', 1.1); break;
    case '换': {
      const p = c.arg ? POSE_OF[c.arg] : undefined;
      if (p === 'hurt') startle(a);
      else if (p === 'jump') { a.happy = .7; mark(a, 'star'); }
      else if (p) { a.pose = p; a.pop = .25; }
      break;
    }
    case '复制体翻面': a.flip = { t: 0, dur: 1.1, from: a.face, to: 'back' }; a.copy = true; a.deepTo = 1; sfx('glitch'); break;
    case '虚化': a.ghostly = true; sfx('glitch'); break;
  }
}
/** 开场前可以直接做好的状态类指令（见 run）。 */
const PRESET = ['换', '背对', '面向', '倒下', '虚化'];
const POSE_OF: Record<string, Pose> = { 平常: 'idle', 开心: 'jump', 吃惊: 'hurt', 防备: 'block', 倒地: 'down' };

async function stageCmd(c: Extract<Cmd, { k: 'stage' }>): Promise<void> {
  switch (c.verb) {
    case '暗场': darkTo = 1; await wait(.6); break;
    case '亮场': darkTo = 0; await wait(.5); break;
    case '震屏': shake = .5; sfx('thud'); fxImpact(); await wait(.35); break;
    case '停顿': await wait(.9); break;
    case '闪回开始': sepiaTo = 1; sfx('flip'); await wait(.5); break;
    case '闪回结束': sepiaTo = 0; sfx('flip'); await wait(.5); break;
    case '立绘': { const id = c.arg ? idOfName(c.arg) : null; if (id && portraits.get(id)?.naturalWidth) { pop = { id, t: 0 }; sfx('pop'); await wait(1.4); pop = null; } break; }
  }
}

/* ---- 台词的节奏 ---- */
const PUNCT = /[，、；：,;:。．.！!？?…—~～「」『』（）()“”"\s]/;
function timing(chars: string[]): number[] {
  const at: number[] = [];
  let t = 0;
  for (const ch of chars) {
    at.push(t);
    t += ch === '…' ? .11 : 1 / 32;
    if ('，、；：,;:'.includes(ch)) t += .12;
    else if ('。．.'.includes(ch)) t += .22;
    else if ('！!？?'.includes(ch)) t += .16;
    else if ('—～~'.includes(ch)) t += .05;
  }
  return at;
}

/** 按表情和台词推断小动作、漫符。剧本只写了 [吃惊] 之类的五种表情，其余从标点和开头的字看。 */
function react(a: Actor, c: Extract<Cmd, { k: 'line' }>): void {
  const t = c.text;
  const core = t.replace(/[…。.！!？?\s—～~]/g, '');
  const ask = /[？?]/.test(t), cry = /[！!]/.test(t);
  const stammer = /(.)、\1/.test(t) || /^[诶呃那我]、/.test(t);
  let m: Mark | null = null;
  // 吃惊：不换受击格（往后仰得太多），保持当前纸板，压扁再弹起 + 「？ / ！ / !?」。
  if (c.pose === 'hurt') { startle(a); m = ask && cry ? 'qex' : ask ? 'q' : 'ex'; }
  else if (c.pose) {
    // 开心也不换跳跃格（那一格双脚离地，立在台上很怪）：保持当前纸板，原地蹦两下 + 小星星。
    if (c.pose !== 'jump' && a.pose !== c.pose) { a.pose = c.pose; a.pop = .25; }
    if (c.pose === 'jump') { a.happy = .7; m = 'star'; }
    if (c.pose === 'block' && cry && core.length <= 16 && !ask) { a.stomp = .3; sfx('stomp'); m = 'anger'; }
  }
  if (c.pose !== 'down') {
    if (/^(嗯|好|对|是的|没错|明白|了解|知道了)/.test(t)) { a.nod = .5; sfx('nod'); }
    else if (/^(不|才不|没有|别|不行|不要)/.test(t)) { a.headShake = .55; sfx('nod'); }
  }
  if (!m && core.length === 0) m = 'dots';
  if (!m && stammer) m = 'sweat';
  if (!m && ask && core.length <= 5 && !c.pose) m = 'q';
  if (m) mark(a, m);
}

async function say(c: Extract<Cmd, { k: 'line' }>): Promise<void> {
  const a = c.who && !c.tag ? find(c.who) : undefined;
  spokeAny = true;
  // 说话时对着上一位说话的人：她在身后就转过去。
  if (a) {
    const prev = lastSpeaker && lastSpeaker !== a.name ? find(lastSpeaker) : undefined;
    if (prev && !ahead(a, prev) && Math.abs(prev.x - a.x) > 1) turnTo(a, Math.sign(prev.x - a.x));
    lastSpeaker = a.name;
  }
  // 织萌第一次开口：星点汇聚成形。
  if (c.who === ZHIMENG && !c.tag && ghostTo === 0) {
    ghostTo = 1;
    if (skipping) ghost = 1;
    else { sfx('sparkle'); flash = Math.max(flash, .35); }
  }
  if (a) { a.pop = .22; if (!skipping) react(a, c); else if (c.pose && c.pose !== 'hurt' && c.pose !== 'jump') a.pose = c.pose; }
  for (const cue of copyCues) if (c.text.includes(cue.cue)) { const t = find(cue.name); if (t) t.deepTo = 1; }
  const chars = [...c.text];
  const core = chars.filter(ch => !PUNCT.test(ch));
  line = {
    who: c.who, id: c.id, tag: c.tag, text: c.text, chars, at: timing(chars), t: 0, shown: skipping ? chars.length : 0,
    shout: !!c.who && /[！!]$/.test(c.text) && core.length <= 10, jolt: 0,
  };
  if (skipping) return;
  await waitTap();
}

/** 1 → 一、12 → 十二：大幕上的「第一章 · 第三幕」。 */
export function chineseNo(n: number): string {
  const d = '零一二三四五六七八九';
  if (n <= 10) return n === 10 ? '十' : d[n];
  if (n < 20) return '十' + d[n - 10];
  if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
  return String(n);
}

async function run(s: Script, cmds: Cmd[], o: PlayOptions): Promise<void> {
  const copies = o.copies ?? {};
  copyCues = Object.entries(copies).filter(([, v]) => v !== 'always').map(([name, cue]) => ({ name, cue }));
  actors = [];
  resetProps();
  resetFx();
  spokeAny = false;
  for (const p of s.opening) place(p.who, idOfName(p.who), p.slot, copies);
  openStage(actors);
  lastSpeaker = null;
  dark = darkTo = 0; sepia = sepiaTo = 0; fold = foldTo = 0; line = null; plate = null; plateA = plateTo = 0; ghost = ghostTo = 0;
  let pre = 0;
  if (o.warm?.length) {
    skipping = true;
    for (const [i, c] of o.warm.entries()) { if (c.k === 'act') { act(c, copies, o.warm[i - 1]); snap(); reaim(); } else if (c.k === 'stage') await stageCmd(c); else if (c.k === 'prop') { propCmd(c.name, c.verb, c.arg, propEnv()); snapProps(); } else if (c.k === 'fx') { fxCmd(c.verb, c.arg, fxEnv()); snapFx(); } else await say(c); }
    curtainTo = 0;
    snap(); line = null; skipping = false; spokeAny = false;
    // 战后从亮处开始：战前段多半以暗场收尾。
    dark = darkTo = 0;
    fold = 1; foldTo = 0; flash = .6;
    sfx('flip');
    await wait(.45);
  } else if (o.at) {
    curtain = curtainTo = 0;
  } else {
    // 幕开之前就该是这样的：开头连着的「换 / 背对 / 倒下 / 虚化」、摆道具、开持续特效，在大幕后面直接做好（幕一拉开她就已经倒在地上、背着身）。
    skipping = true;
    for (; pre < cmds.length; pre++) {
      const c = cmds[pre];
      if (c.k === 'act' && PRESET.includes(c.verb)) { act(c, copies, cmds[pre - 1]); snap(); }
      else if (c.k === 'prop' && c.verb === '摆') { propCmd(c.name, c.verb, c.arg, propEnv()); snapProps(); }
      else if (c.k === 'fx' && FX_LASTING.includes(c.verb)) { fxCmd(c.verb, c.arg, fxEnv()); snapFx(); }
      else break;
    }
    skipping = false;
    // 开场：大幕合着，幕上打关卡标题，开场铃，然后拉幕。
    curtain = curtainTo = 1;
    if (o.card) {
      plate = o.card; plateTo = 1;
      sfx('bell');
      await wait(1.7);
      plateTo = 0;
      await wait(.25);
    }
    curtainTo = 0;
    sfx('curtain');
    await wait(.8);
  }
  let jumping = !!o.at;
  if (jumping) skipping = true;
  for (let i = pre; i < cmds.length; i++) {
    const c = cmds[i];
    if (jumping && (c.ln ?? 0) >= o.at!) { snap(); reaim(); skipping = false; jumping = false; }
    if (c.k === 'act') {
      act(c, copies, cmds[i - 1]);
      if (cmds[i + 1]?.k !== 'act') { await settleActors(); reaim(); }
    } else if (c.k === 'stage') {
      await stageCmd(c);
    } else if (c.k === 'prop') {
      const t = propCmd(c.name, c.verb, c.arg, propEnv());
      if (skipping) snapProps(); else await wait(t);
    } else if (c.k === 'fx') {
      const t = fxCmd(c.verb, c.arg, fxEnv());
      if (skipping) snapFx(); else await wait(t);
    } else {
      await say(c);
    }
    if (finished) return;
  }
  line = null;
  if (skipping) snap();
  skipping = false;
  if (o.toBattle) {
    // 纸板白边一收、阴影一散：开打。
    darkTo = 0; foldTo = 1; flash = .9;
    sfx('flip');
    await wait(.55);
  } else {
    // 落幕。章末在幕上出「完」。
    curtainTo = 1;
    sfx('curtain');
    await wait(.9);
    if (o.endCard) {
      plate = o.endCard; plateTo = 1;
      sfx('bell');
      await wait(2.4);
    }
  }
}

/* ---- 绘制 ---- */
const ease = (k: number) => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const backOut = (k: number) => { const c = 1.9; const x = Math.min(1, Math.max(0, k)) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
function rr(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const POSTER = '"MF Poster", "Noto Sans SC", "Microsoft YaHei", sans-serif';

/* 背景压暗 / 闪回褪色：滤镜每帧对整张背景跑一遍很贵（手机尤其），按场景图烘成两张（平常、闪回），闪回时两张交叉淡入。 */
const bakedBg = new WeakMap<HTMLImageElement, [HTMLCanvasElement, HTMLCanvasElement]>();
function bakeBg(bg: HTMLImageElement): [HTMLCanvasElement, HTMLCanvasElement] {
  let pair = bakedBg.get(bg);
  if (pair) return pair;
  const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
  const one = (filter: string) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.filter = filter;
    g.drawImage(bg, (W - bg.naturalWidth * s) / 2, (H - bg.naturalHeight * s) / 2 - 30, bg.naturalWidth * s, bg.naturalHeight * s);
    return c;
  };
  pair = [one('brightness(.6) saturate(.72)'), one('brightness(.6) saturate(0) sepia(.8)')];
  bakedBg.set(bg, pair);
  return pair;
}
function drawBackdrop(): void {
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, W, H);
  const bg = backdrop;
  if (bg?.naturalWidth) {
    const [plain, faded] = bakeBg(bg);
    if (sepia < .99) ctx.drawImage(plain, 0, 0);
    if (sepia > .01) { ctx.save(); ctx.globalAlpha = Math.min(1, sepia); ctx.drawImage(faded, 0, 0); ctx.restore(); }
  }
  const fy = FLOOR - 26;
  const fl = ctx.createLinearGradient(0, fy, 0, H);
  fl.addColorStop(0, '#2a1b1a'); fl.addColorStop(.25, '#1e1414'); fl.addColorStop(1, '#0c0809');
  ctx.fillStyle = fl; ctx.fillRect(0, fy, W, H - fy);
  ctx.strokeStyle = '#ffffff0d'; ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) { const y = fy + i * i * 5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = '#e9c46a55'; ctx.fillRect(0, fy, W, 1.5);
}

function drawSpot(x: number, on: number): void {
  if (on <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = on;
  const cone = ctx.createLinearGradient(0, 0, 0, FLOOR);
  cone.addColorStop(0, '#fff3d018'); cone.addColorStop(1, '#fff3d00a');
  ctx.fillStyle = cone;
  ctx.beginPath(); ctx.moveTo(x - 34, 0); ctx.lineTo(x + 34, 0); ctx.lineTo(x + 120, FLOOR + 10); ctx.lineTo(x - 120, FLOOR + 10); ctx.closePath(); ctx.fill();
  ctx.translate(x, FLOOR + 4); ctx.scale(1, .22);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 140);
  pool.addColorStop(0, '#fff0c838'); pool.addColorStop(1, '#fff0c800');
  ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, 170, 0, 7); ctx.fill();
  ctx.restore();
}

/** 绒布褶：竖向深浅相间。 */
function velvet(x0: number, x1: number, folds: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= folds * 2; i++) g.addColorStop(i / (folds * 2), i % 2 ? '#5a1430' : '#3a0b1f');
  return g;
}

function drawCurtains(): void {
  const side = (dir: number) => {
    ctx.save();
    const w = 92;
    ctx.beginPath();
    if (dir > 0) { ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.bezierCurveTo(w - 10, 260, w - 46, 420, w - 30, H); ctx.lineTo(0, H); }
    else { ctx.moveTo(W, 0); ctx.lineTo(W - w, 0); ctx.bezierCurveTo(W - w + 10, 260, W - w + 46, 420, W - w + 30, H); ctx.lineTo(W, H); }
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = velvet(dir > 0 ? 0 : W, dir > 0 ? w : W - w, 3); ctx.fillRect(0, 0, W, H);
    const e = ctx.createLinearGradient(dir > 0 ? w - 40 : W - w + 40, 0, dir > 0 ? w : W - w, 0);
    e.addColorStop(0, '#00000000'); e.addColorStop(1, '#ff7aa833');
    ctx.fillStyle = e; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save(); ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 3;
    const ty = 352, tx = dir > 0 ? 58 : W - 58;
    ctx.beginPath(); ctx.moveTo(dir > 0 ? 0 : W, ty - 6); ctx.quadraticCurveTo(tx, ty + 10, tx + dir * 14, ty - 2); ctx.stroke();
    ctx.restore();
  };
  side(1); side(-1);
  ctx.save();
  const n = 9, sw = W / n, top = 52, drop = 26;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, top);
  for (let i = n - 1; i >= 0; i--) ctx.quadraticCurveTo(i * sw + sw / 2, top + drop * 2, i * sw, top);
  ctx.closePath();
  const vg = ctx.createLinearGradient(0, 0, 0, top + drop);
  vg.addColorStop(0, '#2a0716'); vg.addColorStop(1, '#5e1532');
  ctx.fillStyle = vg; ctx.fill();
  ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const x = 150 + i * 98, y = H - 4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
    g.addColorStop(0, '#ffd98a30'); g.addColorStop(1, '#ffd98a00');
    ctx.fillStyle = g; ctx.fillRect(x - 46, y - 46, 92, 92);
  }
  ctx.restore();
}

/** 大幕：两扇从两侧合到中间，内缘一道金边。 */
function drawMainCurtain(): void {
  const k = ease(curtain);
  if (k <= .002) return;
  const half = W / 2 * k + 2;
  for (const dir of [1, -1]) {
    ctx.save();
    const x0 = dir > 0 ? 0 : W, x1 = dir > 0 ? half : W - half;
    ctx.beginPath();
    ctx.moveTo(x0, 0); ctx.lineTo(x1, 0);
    ctx.bezierCurveTo(x1 - dir * 4, 240, x1 - dir * 10, 520, x1, H);
    ctx.lineTo(x0, H);
    ctx.closePath();
    ctx.fillStyle = velvet(x0, x1, Math.max(2, Math.round(7 * k)));
    ctx.fill();
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,.35)'); shade.addColorStop(.5, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = shade; ctx.fill();
    ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.bezierCurveTo(x1 - dir * 4, 240, x1 - dir * 10, 520, x1, H); ctx.stroke();
    ctx.restore();
  }
}

function drawPlate(): void {
  if (!plate || plateA <= .01) return;
  ctx.save();
  ctx.globalAlpha = plateA;
  ctx.textAlign = 'center';
  const y = H / 2 - 10 + (1 - plateA) * 10;
  ctx.font = `900 22px ${POSTER}`;
  ctx.fillStyle = '#e9c46a';
  ctx.fillText(plate.kicker, W / 2, y - 34);
  ctx.strokeStyle = '#e9c46a88'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W / 2 - 160, y - 18); ctx.lineTo(W / 2 + 160, y - 18); ctx.stroke();
  ctx.font = `900 52px ${POSTER}`;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#fbf3e4';
  ctx.fillText(plate.title, W / 2, y + 46);
  ctx.restore();
}

/** 漫符：小纸板贴片从头顶弹出。x, y 是头顶。 */
function drawMark(a: Actor, x: number, y: number, color: string): void {
  const m = a.mark;
  if (!m) return;
  const inK = backOut(m.t / .24), out = 1 - ease((m.t - (m.life - .22)) / .22);
  ctx.save();
  ctx.globalAlpha = a.alpha * Math.max(0, out);
  const g = GLYPH[m.kind];
  if (g) {
    ctx.translate(x + a.face * 46, y - 26);
    ctx.rotate(a.face * .14 + Math.sin(clock * 5) * .03);
    ctx.scale(inK, inK);
    const w = g.length > 1 ? 64 : 46, h = 46;
    ctx.fillStyle = '#a99f8f'; rr(-w / 2 + 2, -h / 2 + 3, w, h, 12); ctx.fill();
    ctx.fillStyle = '#fbf9f4'; rr(-w / 2, -h / 2, w, h, 12); ctx.fill();
    ctx.fillStyle = m.kind === 'dots' ? '#6b7090' : color;
    ctx.font = `900 ${m.kind === 'dots' ? 30 : 34}px ${POSTER}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(g, 0, m.kind === 'dots' ? -4 : 2);
  } else if (m.kind === 'sweat') {
    // 汗滴：贴在后脑一侧，慢慢往下滑
    ctx.translate(x - a.face * 34, y + 18 + Math.min(1, m.t / m.life) * 14); ctx.scale(inK, inK);
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.bezierCurveTo(10, -4, 11, 8, 0, 10); ctx.bezierCurveTo(-11, 8, -10, -4, 0, -18); ctx.closePath();
    ctx.lineWidth = 6; ctx.strokeStyle = '#fbf9f4'; ctx.stroke();
    ctx.fillStyle = '#7fd3ff'; ctx.fill();
    ctx.fillStyle = '#ffffffcc'; ctx.beginPath(); ctx.arc(-3, 2, 2.6, 0, 7); ctx.fill();
  } else if (m.kind === 'anger') {
    // 怒筋：四段弯折，一跳一跳
    const beat = 1 + Math.sin(clock * 14) * .06;
    ctx.translate(x + a.face * 40, y - 14); ctx.scale(inK * beat, inK * beat);
    ctx.lineCap = 'round';
    for (const [lw, col] of [[11, '#fbf9f4'], [5, '#ff4d6d']] as const) {
      ctx.lineWidth = lw; ctx.strokeStyle = col;
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(5, -15); ctx.quadraticCurveTo(5, -5, 15, -5); ctx.stroke();
        ctx.restore();
      }
    }
  } else if (m.kind === 'star') {
    // 开心：三颗小星在头边一闪一闪
    for (let i = 0; i < 3; i++) {
      const ang = -Math.PI / 2 + (i - 1) * .7 + a.face * .3;
      const r = 54 + i * 4, s = (9 + (i === 1 ? 5 : 0)) * inK * (.75 + .25 * Math.sin(clock * 9 + i * 2));
      ctx.save();
      ctx.translate(x + Math.cos(ang) * r, y + 20 + Math.sin(ang) * r);
      ctx.beginPath();
      for (let j = 0; j < 8; j++) { const len = j % 2 ? s * .32 : s; const aa = j * Math.PI / 4; if (j) ctx.lineTo(Math.cos(aa) * len, Math.sin(aa) * len); else ctx.moveTo(Math.cos(aa) * len, Math.sin(aa) * len); }
      ctx.closePath();
      ctx.lineWidth = 5; ctx.strokeStyle = '#fbf9f4'; ctx.stroke();
      ctx.fillStyle = i === 1 ? '#FDE979' : '#ff8fb8'; ctx.fill();
      ctx.restore();
    }
  } else if (m.kind === 'gloom') {
    // 心里发凉：头顶一排竖线
    ctx.strokeStyle = 'rgba(120,130,200,.75)'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const lx = x - 34 + i * 17, len = (26 + (i % 2) * 12) * inK;
      ctx.beginPath(); ctx.moveTo(lx, y + 4); ctx.lineTo(lx, y + 4 + len); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawActor(a: Actor, dim: boolean): void {
  if (!a.id) return;
  const pose: Pose = a.recoil > 0 ? 'hurt' : a.pose;
  const card = cardOf(a.id, pose);
  const z = zoom;
  const k = heightOf(a.id) * BIG / CELL * z;
  const size = CARD_SIZE * k;
  const walking = Math.abs(a.x - a.to) > 1;
  // 转身：scaleX 压到 0 再翻过来，中间露出纸板背面。复制体翻面慢转，停在深色背面。
  let sx = a.face, back = a.revealed;
  if (a.flip) {
    const p = Math.max(0, Math.min(1, a.flip.t / a.flip.dur));
    if (a.flip.to === 'back') {
      if (p < .45) sx = a.flip.from * Math.cos(p / .45 * Math.PI / 2);
      else { back = true; sx = a.flip.from * -Math.sin((p - .45) / .55 * Math.PI / 2); }
    } else {
      sx = Math.cos(p * Math.PI) * a.flip.from;
      if (p > .3 && p < .7) back = true;
    }
  }
  let rot = 0, bob = 0, dx = 0, sy = 1, sxk = 1;
  if (walking && a.recoil <= 0) { const ph = a.stepPh; rot = Math.sin(ph) * .075; bob = -Math.abs(Math.sin(ph)) * 9; }
  if (a.hop > 0) bob -= Math.sin((1 - a.hop / (a.hopH > 40 ? .5 : .4)) * Math.PI) * a.hopH;
  if (a.shake > 0) dx = Math.sin(clock * 70) * 4 * Math.min(1, a.shake * 3);
  if (a.startle > 0) {
    // 惊吓：先压扁，再弹高拉长，落回。
    const p = 1 - a.startle / .34;
    if (p < .25) { const q = p / .25; sy = 1 - .14 * q; sxk = 1 + .08 * q; }
    else { const q = (p - .25) / .75; sy = 1 + .1 * Math.sin(q * Math.PI); bob -= Math.sin(q * Math.PI) * 22; }
  }
  if (a.happy > 0) {
    const p = 1 - a.happy / .7;
    bob -= Math.abs(Math.sin(p * Math.PI * 2)) * 14 * (1 - p * .4);
    rot += Math.sin(p * Math.PI * 2) * .045;
    // 落地那一下微微压扁，蹦起来时拉长一点。
    const air = Math.abs(Math.sin(p * Math.PI * 2));
    sy *= 1 - .05 + .09 * air; sxk *= 1 + .04 - .06 * air;
  }
  if (a.nod > 0) { const p = 1 - a.nod / .5; bob += Math.abs(Math.sin(p * Math.PI * 2)) * 5; rot += a.face * Math.sin(p * Math.PI * 2) * .025; }
  if (a.headShake > 0) { const p = 1 - a.headShake / .55; rot += Math.sin(p * Math.PI * 4) * .05 * (1 - p); }
  if (a.stomp > 0) { const p = 1 - a.stomp / .3; bob -= Math.abs(Math.sin(p * Math.PI * 2)) * 10; }
  if (a.recoil > 0) rot -= a.face * .05 * Math.sin((a.recoil / .45) * Math.PI);
  // 蹦跳、抖动的位移跟纸板一起按大屏倍率缩。
  bob *= z; dx *= z;
  const pp = a.pop > 0 ? 1 + Math.sin((1 - a.pop / .25) * Math.PI) * .05 : 1;
  const unfold = 1 - ease(fold);
  // 墨提斯：半透明、离地浮着轻轻上下；虚化：透明并一闪一闪。
  if (a.phantom) bob += (-10 + Math.sin(clock * 2.1) * 4) * z;
  const see = a.phantom ? .8 : a.ghostly ? .5 + .12 * Math.sin(clock * 5) + (Math.sin(clock * 17) > .93 ? -.18 : 0) : 1;
  ctx.save();
  ctx.globalAlpha = a.alpha * see;
  // 投影：复制体的影子更深，深到几乎看不清地面（观众能察觉的伏笔）。
  ctx.save();
  ctx.translate(a.x + dx, FLOOR + 2); ctx.scale(z, .2 * z);
  const d = a.deep;
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 80 + 8 * d);
  sh.addColorStop(0, `rgba(0,0,0,${(.6 + .36 * d) * unfold})`);
  sh.addColorStop(.4 + .3 * d, `rgba(0,0,0,${(.33 + .49 * d) * unfold})`);
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, 95, 0, 7); ctx.fill();
  ctx.restore();
  if (card) {
    const img = back ? (a.revealed || (a.flip?.to === 'back') ? card.copyBack : card.back) : a.nightmare ? nightmareCard(card) : a.phantom ? phantomCard(card) : card.front;
    ctx.save();
    ctx.translate(a.x + dx, FLOOR + bob);
    ctx.rotate(rot);
    ctx.scale((sx || .001) * pp * sxk, pp * sy);
    const ox = -size / 2, oy = -(card.foot + 1) * k;
    if (unfold > .01) {
      ctx.save();
      ctx.globalAlpha = .35 * a.alpha * unfold;
      const soft = softSil(card.sil);
      const m = soft.width / card.sil.width;
      ctx.drawImage(soft, ox + 10 * Math.sign(sx || 1) - (m - 1) * size / 2, oy - 6 - (m - 1) * size / 2, size * m, size * m);
      ctx.restore();
    }
    if (fold > .01 && !back) {
      // 收纸板：白边淡掉，只剩角色本身（开战 / 战后展开）。
      ctx.globalAlpha = a.alpha * unfold;
      ctx.drawImage(dim ? dimmed(img) : img, ox, oy, size, size);
      if (dim || a.nightmare) ctx.filter = a.nightmare ? 'brightness(.5) saturate(.7)' : 'brightness(.72) saturate(.85)';
      ctx.globalAlpha = a.alpha * (1 - unfold);
      const sheet = sheets.get(a.id);
      if (sheet) { const [c, r] = CELLS[pose]; ctx.drawImage(sheet, c * CELL, r * CELL, CELL, CELL, ox + PAD * k, oy + PAD * k, CELL * k, CELL * k); }
    } else ctx.drawImage(dim ? dimmed(img) : img, ox, oy, size, size);
    ctx.restore();
    // 漫符：贴在头顶，不跟着纸板摇摆、压扁，只跟着上下。
    if (a.mark && unfold > .5) { ctx.save(); const hx = a.x + dx, hy = FLOOR + bob - (card.foot - card.top) * k * pp; ctx.translate(hx, hy); ctx.scale(.6 + .4 * z, .6 + .4 * z); drawMark(a, 0, 0, colorOf(a.id, a.name)); ctx.restore(); }
  }
  // 底座小立板
  if (unfold > .01) {
    ctx.save();
    ctx.globalAlpha = a.alpha * unfold;
    ctx.translate(a.x + dx, FLOOR);
    ctx.scale(z, z);
    ctx.fillStyle = '#e8e3da'; ctx.strokeStyle = '#a39bb0'; ctx.lineWidth = 1.5;
    rr(-28, -4, 56, 8, 4); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
/* 纸板的柔影和「没在说话」的压暗原来每帧用 ctx.filter 现算（blur 尤其贵），改成每张纸板第一次用到时烘一次。 */
const SOFT_PAD = 14;
const softCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function softSil(sil: HTMLCanvasElement): HTMLCanvasElement {
  let c = softCache.get(sil);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = sil.width + SOFT_PAD * 2; c.height = sil.height + SOFT_PAD * 2;
  const g = c.getContext('2d')!;
  // 纸板画出来比烘焙图略大（约 1.1 倍），烘焙空间里的 5.5px 画到台上约等于原来的 6px。
  g.filter = 'blur(5.5px)';
  g.drawImage(sil, SOFT_PAD, SOFT_PAD);
  softCache.set(sil, c);
  return c;
}
/** 梦魇纸板：正面压一层深紫（白边也一起变暗，像被抽走了光），外圈一道模糊的紫光。和战斗里的梦魇同一个紫。 */
const nightCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function nightmareCard(card: Card): HTMLCanvasElement {
  let c = nightCache.get(card.front);
  if (c) return c;
  const w = card.front.width, h = card.front.height;
  const mk = () => { const x = document.createElement('canvas'); x.width = w; x.height = h; return [x, x.getContext('2d')!] as const; };
  const [body, bg] = mk();
  bg.drawImage(card.front, 0, 0);
  bg.globalCompositeOperation = 'source-atop';
  bg.fillStyle = 'rgba(34,12,64,.55)';
  bg.fillRect(0, 0, w, h);
  const [rim, rg] = mk();
  rg.drawImage(card.sil, 0, 0, w, h);
  rg.globalCompositeOperation = 'source-in';
  rg.fillStyle = '#9a5cff';
  rg.fillRect(0, 0, w, h);
  const [out, og] = mk();
  // 两层：宽一点的柔光 + 贴边的一圈，在亮背景（虚空舞台的粉天）上也看得出紫。
  og.filter = 'blur(8px)';
  og.drawImage(rim, 0, 0);
  og.drawImage(rim, 0, 0);
  og.filter = 'blur(2px)';
  og.drawImage(rim, 0, 0);
  og.filter = 'none';
  og.globalAlpha = 1;
  og.drawImage(body, 0, 0);
  nightCache.set(card.front, out);
  c = out;
  return c;
}
/** 墨提斯纸板：整张染成冷蓝、外圈一道淡青的光，像投影出来的分身。 */
const phantomCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function phantomCard(card: Card): HTMLCanvasElement {
  let c = phantomCache.get(card.front);
  if (c) return c;
  const w = card.front.width, h = card.front.height;
  const mk = () => { const x = document.createElement('canvas'); x.width = w; x.height = h; return [x, x.getContext('2d')!] as const; };
  const [body, bg] = mk();
  bg.filter = 'grayscale(.6) brightness(1.05)';
  bg.drawImage(card.front, 0, 0);
  bg.filter = 'none';
  bg.globalCompositeOperation = 'source-atop';
  bg.fillStyle = 'rgba(90,150,255,.42)';
  bg.fillRect(0, 0, w, h);
  const [rim, rg] = mk();
  rg.drawImage(card.sil, 0, 0, w, h);
  rg.globalCompositeOperation = 'source-in';
  rg.fillStyle = '#9fd4ff';
  rg.fillRect(0, 0, w, h);
  const [out, og] = mk();
  og.filter = 'blur(7px)';
  og.drawImage(rim, 0, 0);
  og.filter = 'none';
  og.drawImage(body, 0, 0);
  phantomCache.set(card.front, out);
  c = out;
  return c;
}
const dimCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function dimmed(img: HTMLCanvasElement): HTMLCanvasElement {
  let c = dimCache.get(img);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.filter = 'brightness(.72) saturate(.85)';
  g.drawImage(img, 0, 0);
  dimCache.set(img, c);
  return c;
}
const CELLS: Record<Pose, [number, number]> = { idle: [0, 0], jump: [5, 0], block: [6, 0], hurt: [0, 1], down: [1, 1] };

function wrap(chars: string[], width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of chars) {
    if (ctx.measureText(cur + ch).width > width && cur) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function drawDialogue(): void {
  const l = line;
  if (!l) return;
  const k = ease(l.t / .18);
  const jx = l.jolt > 0 && !reducedMotion() ? Math.sin(clock * 90) * 5 * (l.jolt / .2) : 0;
  const bx = 150 + jx, by = 588 + (1 - k) * 12, bw = W - 300, bh = 112;
  ctx.save(); ctx.globalAlpha = k;
  ctx.shadowColor = '#000a'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#0d1020ee'; rr(bx, by, bw, bh, 16); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#ffffff1c'; ctx.lineWidth = 1; ctx.stroke();
  const shown = l.chars.slice(0, l.shown);
  const body = `${l.shout ? 800 : 500} ${l.shout ? 34 : 26}px Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  if (l.who) {
    const color = colorOf(l.id, l.who);
    const av = l.id ? avatars.get(l.id) : undefined;
    const as = 112, ax = bx + 18, ay = by - 22;
    let tx = bx + 28;
    if (av?.naturalWidth) {
      ctx.save();
      ctx.fillStyle = color; rr(ax - 3, ay - 3, as + 6, as + 6, 18); ctx.fill();
      rr(ax, ay, as, as, 15); ctx.clip();
      ctx.fillStyle = '#1a2037'; ctx.fillRect(ax, ay, as, as);
      if (l.tag === '广播') ctx.filter = 'saturate(.6) brightness(.9)';
      ctx.drawImage(av, ax, ay, as, as);
      ctx.restore();
      tx = ax + as + 22;
    }
    ctx.font = `900 22px ${POSTER}`;
    const tag = l.tag ? ` · ${l.tag}` : '';
    const name = (l.id ? ROSTER_BY_ID.get(l.id)?.name ?? l.who : l.who) + tag;
    const nw = ctx.measureText(name).width + 28;
    ctx.fillStyle = color; rr(tx - 2, by - 15, nw, 32, 8); ctx.fill();
    ctx.fillStyle = '#0d1020'; ctx.fillText(name, tx + 12, by + 9);
    ctx.font = l.tag === '心声' ? 'italic ' + body : body;
    ctx.fillStyle = l.tag === '心声' ? '#c9d0ea' : l.tag === '广播' ? '#e3d6ff' : '#eef0fa';
    wrap(shown, bx + bw - tx - 36).slice(0, 2).forEach((s, i) => ctx.fillText(s, tx, by + (l.shout ? 70 : 56) + i * 36));
  } else {
    ctx.font = 'italic ' + body;
    ctx.fillStyle = '#f4e3c0'; ctx.textAlign = 'center';
    const two = wrap(l.chars, bw - 120).length > 1;
    wrap(shown, bw - 120).slice(0, 2).forEach((s, i) => ctx.fillText(s, W / 2, by + (two ? 46 : 64) + i * 36));
  }
  if (l.shown >= l.chars.length) {
    const blink = .5 + .5 * Math.sin(clock * 6);
    ctx.globalAlpha = k * (.4 + .6 * blink);
    ctx.fillStyle = '#ff3b7f';
    ctx.beginPath(); ctx.moveTo(bx + bw - 34, by + bh - 28); ctx.lineTo(bx + bw - 20, by + bh - 28); ctx.lineTo(bx + bw - 27, by + bh - 19); ctx.fill();
  }
  ctx.restore();
}

function drawPortrait(): void {
  if (!pop) return;
  const im = portraits.get(pop.id);
  if (!im?.naturalWidth) return;
  const t = pop.t, inK = ease(t / .3), outK = ease((t - 1.1) / .3);
  const h = 560, w = h * im.naturalWidth / im.naturalHeight;
  const x = W / 2 - w / 2, y = 40 + (1 - inK) * 60;
  ctx.save();
  ctx.globalAlpha = inK * (1 - outK);
  ctx.translate(W / 2, y + h);
  ctx.transform(1, 0, 0, .9 + .1 * inK, 0, 0);
  ctx.translate(-W / 2, -(y + h));
  ctx.fillStyle = '#fbf9f4';
  rr(x - 14, y - 14, w + 28, h + 28, 18); ctx.fill();
  ctx.drawImage(im, x, y, w, h);
  ctx.restore();
}

function frame(now: number): void {
  // 先排好下一帧：这一帧哪里抛错，演出也不会整个停住（等待、点击推进都靠 step 在跑）。
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (last || now)) / 1000);
  last = now;
  step(dt);
  draw();
}
let last = 0;

function step(dt: number): void {
  clock += dt;
  const app = (v: number, to: number, rate: number) => v + (to - v) * Math.min(1, dt * rate);
  dark = Math.abs(darkTo - dark) < .01 ? darkTo : app(dark, darkTo, 7);
  fold = Math.abs(foldTo - fold) < .01 ? foldTo : app(fold, foldTo, 8);
  curtain = Math.abs(curtainTo - curtain) < .005 ? curtainTo : app(curtain, curtainTo, 4.2);
  plateA = Math.abs(plateTo - plateA) < .01 ? plateTo : app(plateA, plateTo, 7);
  sepia = app(sepia, sepiaTo, 6);
  ghost = Math.abs(ghostTo - ghost) < .005 ? ghostTo : app(ghost, ghostTo, 1.4);
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt * 2.2);
  if (pop) pop.t += dt;
  for (const a of actors) {
    const d = a.to - a.x;
    if (Math.abs(d) > 1) {
      const before = Math.floor(a.stepPh / Math.PI);
      a.stepPh += dt * 9.5;
      if (Math.floor(a.stepPh / Math.PI) !== before && a.x > -60 && a.x < W + 60) sfx('step');
    }
    a.x = Math.abs(d) <= WALK * dt ? a.to : a.x + Math.sign(d) * WALK * dt;
    if (a.flip) { a.flip.t += dt; if (a.flip.t >= a.flip.dur) { if (a.flip.to === 'back') a.revealed = true; else a.face = a.flip.to; a.flip = null; } }
    a.hop = Math.max(0, a.hop - dt);
    a.shake = Math.max(0, a.shake - dt);
    a.pop = Math.max(0, a.pop - dt);
    a.startle = Math.max(0, a.startle - dt);
    a.happy = Math.max(0, a.happy - dt);
    a.nod = Math.max(0, a.nod - dt);
    a.headShake = Math.max(0, a.headShake - dt);
    a.stomp = Math.max(0, a.stomp - dt);
    a.recoil = Math.max(0, a.recoil - dt);
    if (a.mark) { a.mark.t += dt; if (a.mark.t >= a.mark.life) a.mark = null; }
    a.deep = app(a.deep, a.deepTo, 1.2);
    if (a.fade > 0) { a.fade = Math.max(0, a.fade - dt); a.alpha = a.fade / a.fadeMax; }
    else if (a.phantom && !a.leaving && a.alpha < 1) a.alpha = Math.min(1, a.alpha + dt * 2.2);
    else if (a.leaving && a.x === a.to) a.alpha = 0;
  }
  actors = actors.filter(a => !(a.leaving && a.alpha <= 0));
  stepProps(dt);
  stepFx(dt, fxEnv());
  const l = line;
  if (l) {
    l.t += dt;
    l.jolt = Math.max(0, l.jolt - dt);
    const end = l.at.length ? l.at[l.at.length - 1] : 0;
    while (l.shown < l.chars.length && l.at[l.shown] <= l.t - .12) {
      const ch = l.chars[l.shown];
      // 打字音：每两个字一声，标点不响。
      if (!PUNCT.test(ch) && l.shown % 2 === 0) sfx('blip', voiceOf(l.id, l.tag));
      l.shown++;
      if (l.shown === l.chars.length && l.shout) { l.jolt = .2; sfx('stomp'); }
    }
    if (auto && l.shown >= l.chars.length && tapWait && l.t > end + .12 + 1.1 + l.chars.length * .025) { const r = tapWait; tapWait = null; r(); }
  }
  const due = waits.filter(w => w.until <= clock);
  if (due.length) { waits = waits.filter(w => w.until > clock); for (const w of due) w.done(); }
}

/** 道具模块要的舞台信息（props.ts）。 */
function propEnv(): PropEnv {
  return {
    ctx, clock, zoom, fold: ease(fold),
    xOf: n => find(n)?.x ?? null,
    heightOf: n => { const a = find(n); return a?.id ? heightOf(a.id) * BIG * zoom : 240; },
    sfx: k => sfx(k),
  };
}
/** 特效模块要的舞台信息（fx.ts）。 */
function fxEnv(): FxEnv {
  return {
    ctx, clock, zoom, fold: ease(fold),
    xOf: n => find(n)?.x ?? null,
    heightOf: n => { const a = find(n); return a?.id ? heightOf(a.id) * BIG * zoom : 240; },
    faceOf: n => find(n)?.face ?? 1,
    sfx: k => sfx(k),
    shake: v => { shake = Math.max(shake, v); },
    flash: v => { flash = Math.max(flash, v); },
  };
}
function draw(): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  if (shake > 0 && !reducedMotion()) ctx.translate(Math.sin(clock * 80) * 8 * shake, Math.cos(clock * 66) * 5 * shake);
  drawBackdrop();
  // 装饰层出错只丢这一层，不能拖停整场演出。
  try { drawGhost(); } catch (e) { console.warn('织萌剪影绘制失败', e); ghostTo = ghost = 0; }
  const speaker = line?.who ? find(line.who) : undefined;
  try { drawProps('back', propEnv()); } catch (e) { console.warn('道具绘制失败', e); }
  try { drawFx('back', fxEnv()); } catch (e) { console.warn('特效绘制失败', e); }
  for (const a of actors) drawSpot(a.x, speaker ? (a === speaker ? 1 : .25) : line ? .15 : .3);
  for (const a of [...actors].sort((p, q) => (p === speaker ? 1 : 0) - (q === speaker ? 1 : 0))) drawActor(a, !!line && a !== speaker);
  try { drawProps('front', propEnv()); } catch (e) { console.warn('道具绘制失败', e); }
  try { drawFx('front', fxEnv()); } catch (e) { console.warn('特效绘制失败', e); }
  if (sepia > .01) { ctx.fillStyle = `rgba(112,82,40,${sepia * .22})`; ctx.fillRect(0, 0, W, H); }
  drawMainCurtain();
  drawCurtains();
  ctx.restore();
  // 暗场压在整个舞台上；大幕合上时幕布还隐约看得见（暗里落幕也看得到）。
  const dk = dark * (1 - .72 * ease(curtain));
  if (dk > .001) { ctx.fillStyle = `rgba(4,3,10,${dk})`; ctx.fillRect(0, 0, W, H); }
  drawPlate();
  drawPortrait();
  drawDialogue();
  if (flash > 0) { ctx.fillStyle = `rgba(255,252,244,${flash * .7})`; ctx.fillRect(0, 0, W, H); }
}

/* ---- DOM 壳 ---- */
let finished = false;
let onLayerBack: (() => void) | null = null;

function build(): void {
  if (built) return;
  built = true;
  canvas = $('st-canvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;
  const tap = () => {
    const l = line;
    if (!l) return;
    if (l.shown < l.chars.length) {
      l.shown = l.chars.length;
      l.t = Math.max(l.t, (l.at[l.at.length - 1] ?? 0) + .12);
      return;
    }
    const r = tapWait; tapWait = null; r?.();
  };
  $('story-theatre').addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('button')) return;
    tap();
  });
  // 捕获阶段先接住：演出盖在后台页上时，Esc 只跳过演出，不连带关掉下面的剧情页。
  addEventListener('keydown', e => {
    if ($('story-theatre').hidden) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'j' || e.key === 'J') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) tap(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); }
  }, { capture: true });
  $('st-skip').onclick = () => skip();
  $('st-auto').onclick = () => {
    auto = !auto;
    $('st-auto').setAttribute('aria-pressed', String(auto));
  };
  registerLayer(() => { if ($('story-theatre').hidden) return false; onLayerBack?.(); return true; });
  addEventListener('resize', fit);
}

let skippedAny = false;
function skip(): void {
  if (skipping) return;
  skipping = true;
  skippedAny = true;
  settle();
}

function fit(): void {
  if (!built || $('story-theatre').hidden) return;
  // 画布按 16:9 塞进整个浮层（CSS 不写视口单位，尺寸在这里算）。
  const box = $('story-theatre');
  const cw = Math.max(1, Math.min(box.clientWidth, box.clientHeight * W / H));
  canvas.style.width = cw + 'px';
  canvas.style.height = cw * H / W + 'px';
  zoom = cw >= BIG_SCREEN ? Math.min(1, MAX_MAG / (REF_K * cw / W)) : 1;
  const k = Math.max(.5, Math.min(2, (cw * (devicePixelRatio || 1)) / W));
  if (Math.abs(k - scale) > .01 || canvas.width !== Math.round(W * k)) {
    scale = k;
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
  }
}

export interface PlayResult { skipped: boolean }

/** 演一段。resolve 时浮层还开着（接战斗的话由调用方关），close() 收起。 */
export async function play(s: Script, cmds: Cmd[], o: PlayOptions & { idOf: (n: string) => string | null; label: string }): Promise<PlayResult> {
  build();
  idOfName = o.idOf;
  finished = false;
  skipping = false;
  const el = $('story-theatre');
  $('st-label').textContent = o.label;
  $('st-loading').hidden = false;
  el.hidden = false;
  setMusicPausedForTheatre(true);
  document.documentElement.classList.add('story-on');
  fit();
  // 下载期间：大幕合着（战后段是暗场）。
  actors = []; line = null; plate = null; plateA = plateTo = 0;
  dark = darkTo = o.warm?.length ? 1 : 0;
  curtain = curtainTo = o.warm?.length ? 0 : 1;
  cancelAnimationFrame(raf);
  last = 0;
  raf = requestAnimationFrame(frame);
  await prepare(s, [...(o.warm ?? []), ...cmds]);
  $('st-loading').hidden = true;
  skippedAny = false;
  onLayerBack = skip;
  await run(s, cmds, o);
  onLayerBack = null;
  return { skipped: skippedAny };
}

export function closeTheatre(): void {
  finished = true;
  settle();
  cancelAnimationFrame(raf);
  raf = 0;
  if (built) $('story-theatre').hidden = true;
  setMusicPausedForTheatre(false);
  document.documentElement.classList.remove('story-on');
  line = null;
  // 纸板和背景留着：同一章反复进出不用重烘。超出上限时清理，避免切章或切到无尽模式后大贴图常驻。
  if (cards.size > 120) cards.clear();
  if (sheets.size > 24) sheets.clear();
  if (avatars.size > 48) avatars.clear();
  if (portraits.size > 12) portraits.clear();
}
