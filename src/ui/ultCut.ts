import type { FightGame } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { ULT_FREEZE } from '../game/game.ts';
import { portraitOf, type Portrait } from '../data/portraits.ts';
import { loadImage } from '../assets/loader.ts';

/* 必杀快切：主角色放 L 时全场定格 ULT_FREEZE 秒（game.ts 用 hitstop 冻住，联机随状态同步），这层画面在定格期间演完。
   版式按 960×540 设计，整体缩放贴到看得见的战斗画面上（见 fit）：
   · 代表色斜带从施法者一侧的下角划到对角，带上是招式名 + TRACK L；斜带同色深浅渐变，划完扫一道光。
   · 半身立绘（头到大腿）淡入并放大，然后缓慢放大、往对手方向推；最后整块淡出，正好在解冻时消失。
   · 遮细节（逆光）：立绘压暗、外缘细亮边 + 角色色柔光，脸保持原亮度，胸口往下渐暗沉进深色。
     这些在开打时按角色烘焙进一张画布（bake），播放时只动 transform / opacity，没有实时滤镜和遮罩。
   施法者在右边时整组几何左右镜像，立绘和文字本身不翻。立绘来自 data/portraits.ts（没有立绘的角色只演斜带和招式名）。 */

const W = 960, H = 540;
/** 立绘在设计稿里的尺寸（2:3）和脸落点。 */
const FIG_H = 800, FIG_W = FIG_H * 2 / 3;
const FACE_X = 205, FACE_Y = 120;
/** 下半身沉进的暗色。 */
const DEEP = [0x1a, 0x22, 0x38] as const;

export interface UltCast { id: string; color: string }

/** 每个出手者最后看过的招式序号。按对象记：换回合重建的出手者、召唤物都不会串号。 */
let seen = new WeakMap<Fighter, number>();
let timer = 0;
/** 烘焙好的立绘（一张约 8MB 显存）。只留最近用到的几张，闯关连打很多对手也不会越积越多。 */
const BAKED_MAX = 4;
const baked = new Map<string, Promise<HTMLCanvasElement>>();

const $ = (id: string) => document.getElementById(id);

/** 每帧看一眼：谁刚开始一招 L，就演一次。和 game.ts 的定格条件保持一致。 */
export function watchUlt(game: FightGame): void {
  // 定格期间暂停对局：画面跟着停住，继续时接着演完，而不是演完了对局还冻着。
  const cut = $('ult-cut');
  if (cut && !cut.hidden) cut.classList.toggle('held', game.paused);
  for (const f of game.fighters) {
    const a = f.attack;
    if (!a) continue;
    if (seen.get(f) === a.serial) continue;
    seen.set(f, a.serial);
    if (a.index !== 5 || f.echo || f.minion || game.phase !== 'fight') continue;
    const foes = game.opponents(f);
    const foeX = foes.length ? foes.reduce((s, o) => s + o.x, 0) / foes.length : f.x + f.facing;
    play(f.data.id, a.skill.name, f.data.color, f.x <= foeX ? 'l' : 'r');
  }
}

/** 新的一局：清掉上一局的记号，并在空闲时把这局人物的立绘烘焙好（第一次放 L 时不卡）。 */
export function resetUltCut(cast: readonly UltCast[] = []): void {
  seen = new WeakMap();
  clearTimeout(timer);
  const cut = $('ult-cut');
  if (cut) { cut.hidden = true; cut.classList.remove('on', 'held'); }
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  for (const c of cast) idle(() => { void artFor(c.id, c.color).catch(() => {}); });
}

function artFor(id: string, color: string): Promise<HTMLCanvasElement> {
  const art = portraitOf(id);
  if (!art) return Promise.reject(new Error('no portrait'));
  const key = `${art.src}|${color}`;
  let p = baked.get(key);
  if (p) baked.delete(key); // 重新插到最后 = 最近用过
  else {
    p = loadImage(art.src, 0).then(img => bake(img, color, art));
    p.catch(() => baked.delete(key));
  }
  baked.set(key, p);
  while (baked.size > BAKED_MAX) baked.delete(baked.keys().next().value!);
  return p;
}

/** 逆光烘焙：压暗（亮度 .7、对比 .9、饱和 .85）→ 脸部椭圆内渐回原色 → 胸口往下渐混入暗色 → 外缘角色色柔光 + 细亮边。
 *  画布四周留出柔光的边距，显示时按边距外扩回去。 */
function bake(img: HTMLImageElement, color: string, art: Portrait): HTMLCanvasElement {
  // 只烘焙到这块屏幕用得上的清晰度：立绘最大显示高度 ≈ 设计稿 800 × 放大 1.25 × 舞台缩放 × 设备像素比。
  // 手机上往往只要原图的一半多，像素循环和显存都跟着省；大屏不放大，最多用原图。
  const stageK = Math.min(window.innerWidth / W, window.innerHeight / H) * (window.devicePixelRatio || 1);
  const k = Math.min(1, (FIG_H * 1.25 * stageK) / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const s = src.getContext('2d', { willReadFrequently: true })!;
  s.drawImage(img, 0, 0, w, h);
  const data = s.getImageData(0, 0, w, h);
  const px = data.data;
  const fx = art.face.x * w, fy = (art.face.y + .015) * h, rx = .22 * w, ry = .13 * h;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const deep = v < .3 ? 0 : v < .48 ? (v - .3) / .18 * .55 : v < .66 ? .55 + (v - .48) / .18 * .35 : .9;
    const dy = (y - fy) / ry;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] === 0) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      let dr = (r * .7 - 128) * .9 + 128, dg = (g * .7 - 128) * .9 + 128, db = (b * .7 - 128) * .9 + 128;
      const l = .2126 * dr + .7152 * dg + .0722 * db;
      dr = l + (dr - l) * .85; dg = l + (dg - l) * .85; db = l + (db - l) * .85;
      const dx = (x - fx) / rx;
      const e = Math.sqrt(dx * dx + dy * dy);
      const face = e <= .55 ? 1 : e >= 1 ? 0 : 1 - (e - .55) / .45;
      const sink = deep * (1 - face);
      let cr = dr + (r - dr) * face, cg = dg + (g - dg) * face, cb = db + (b - db) * face;
      cr += (DEEP[0] - cr) * sink; cg += (DEEP[1] - cg) * sink; cb += (DEEP[2] - cb) * sink;
      px[i] = cr; px[i + 1] = cg; px[i + 2] = cb;
    }
  }
  s.putImageData(data, 0, 0);
  const unit = h / FIG_H; // 源图像素 / 设计稿像素
  const pad = Math.ceil(14 * unit);
  const out = document.createElement('canvas');
  out.width = w + pad * 2; out.height = h + pad * 2;
  const o = out.getContext('2d')!;
  o.shadowColor = color; o.shadowBlur = 10 * unit;
  o.drawImage(src, pad, pad);
  o.shadowColor = 'rgba(255,255,255,.9)'; o.shadowBlur = 1.5 * unit;
  o.drawImage(src, pad, pad);
  out.className = 'uc-art';
  Object.assign(out.style, {
    left: `${-pad / w * 100}%`, top: `${-pad / h * 100}%`,
    width: `${out.width / w * 100}%`, height: `${out.height / h * 100}%`,
  });
  return out;
}

/** 显示机制：先求「真正看得见的战斗画面」= #game 画布 ∩ 竞技场视口 ∩ 浏览器窗口（宽屏、全屏、信箱、
 *  画布比窗口大时都只算露出来的那块）。压暗层铺满这块；960×540 的舞台按 min(宽/960, 高/540) 等比缩放、
 *  水平居中、贴底。于是任何屏幕上人物占画面高度的比例、头顶到大腿的取景都一样；更宽的屏幕只是两边多出斜带，
 *  更高的屏幕上方多出暗场，人物不会被拉变形、也不会出框。 */
function fit(cut: HTMLElement): void {
  const game = $('game');
  const stage = cut.querySelector<HTMLElement>('.uc-stage');
  const host = cut.parentElement;
  if (!game || !stage || !host) return;
  const g = game.getBoundingClientRect(), v = host.getBoundingClientRect();
  const left = Math.max(g.left, v.left, 0), top = Math.max(g.top, v.top, 0);
  const right = Math.min(g.right, v.right, window.innerWidth), bottom = Math.min(g.bottom, v.bottom, window.innerHeight);
  const w = right - left, h = bottom - top;
  if (!(w > 0 && h > 0)) return;
  const k = Math.min(w / W, h / H);
  cut.style.left = `${left - v.left}px`;
  cut.style.top = `${top - v.top}px`;
  cut.style.width = `${w}px`;
  cut.style.height = `${h}px`;
  stage.style.left = `${(w - W * k) / 2}px`;
  // 贴底：半身立绘的裁切线永远是画面底边；更高的屏幕把多出来的暗场留在上面。
  stage.style.top = `${h - H * k}px`;
  stage.style.transform = `scale(${k})`;
}

/** 招式名可用的长度（设计稿 px，沿斜带方向）：从起点到文字上沿碰到画面顶边为止，留一点余量。
 *  两行时整块更高、上沿更早碰顶，所以更短。 */
const TITLE_ROOM = 440, TITLE_ROOM_2 = 330;
const TITLE_SIZE = 58, TITLE_MIN = 32;
/** 超过这个字数且有断点（逗号、顿号、空格、间隔号、感叹号）的招式名拆成两行。 */
const TITLE_WRAP = 10;

/** 招式名排版：一行放得下就原样；放不下时，很长的先在中间附近的断点拆成两行，仍放不下再按比例缩小字号。
 *  以 lisa「特制曲奇·隐藏风味」为准：9 个字一行放不下，缩到约 43px。 */
function fitTitle(el: HTMLElement, text: string): void {
  el.style.fontSize = '';
  el.textContent = text;
  let w = el.scrollWidth;
  let room = TITLE_ROOM;
  if (w <= room) return;
  const chars = [...text];
  if (chars.length > TITLE_WRAP) {
    const mid = chars.length / 2;
    let best = -1;
    chars.forEach((ch, i) => {
      if (i > 0 && i < chars.length - 1 && /[，,、·\s！!？?]/.test(ch) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    });
    if (best > 0) {
      const head = chars.slice(0, best + 1).join('').trim(), tail = chars.slice(best + 1).join('').trim();
      el.textContent = head;
      el.append(document.createElement('br'), tail);
      w = el.scrollWidth;
      room = TITLE_ROOM_2;
    }
  }
  if (w > room) el.style.fontSize = `${Math.max(TITLE_MIN, Math.floor(TITLE_SIZE * room / w))}px`;
}

export function play(id: string, skill: string, color: string, side: 'l' | 'r'): void {
  const cut = $('ult-cut');
  if (!cut) return;
  // 交付表里没有立绘的角色：斜带和招式名照演，只是没有人物。
  const art = portraitOf(id);
  const face = art?.face ?? { x: .5, y: .16 };
  cut.style.setProperty('--c', color);
  cut.style.setProperty('--fx', String(face.x));
  cut.style.setProperty('--fig-l', `${FACE_X - face.x * FIG_W}px`);
  cut.style.setProperty('--fig-t', `${FACE_Y - face.y * FIG_H}px`);
  cut.style.setProperty('--life', `${ULT_FREEZE + .02}s`);
  cut.dataset.side = side;
  const fig = cut.querySelector<HTMLElement>('.uc-fig')!;
  const key = art ? `${art.src}|${color}` : '';
  fig.dataset.key = key;
  fig.classList.remove('ok');
  void artFor(id, color).then(canvas => {
    if (fig.dataset.key !== key) return;
    if (canvas.parentElement !== fig) fig.replaceChildren(canvas);
    fig.classList.add('ok');
  }).catch(() => {});
  clearTimeout(timer);
  cut.classList.remove('on');
  cut.hidden = false;
  fit(cut);
  fitTitle(cut.querySelector<HTMLElement>('.uc-skill')!, skill);
  void cut.offsetWidth; // restart the keyframes
  cut.classList.add('on');
  cut.classList.remove('held');
  // 演完（淡出动画结束）就收起；暂停时动画停住，这里自然等着。兜底计时只防动画事件丢失。
  const stage = cut.querySelector<HTMLElement>('.uc-stage')!;
  const done = () => { clearTimeout(timer); stage.onanimationend = null; cut.hidden = true; cut.classList.remove('on', 'held'); };
  stage.onanimationend = e => { if (e.target === stage) done(); };
  timer = window.setTimeout(done, (ULT_FREEZE + 4) * 1000);
}
