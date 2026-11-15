/** 跟随镜头：比 16:9 高、但不算方的屏幕（4:3、16:10 平板，16:10 桌面窗口）。
 *
 *  画面按高度铺满，左右裁掉一部分；镜头水平对准双方中点，夹在场地两端之内。两人拉开到看不全时
 *  平滑拉远，上方短暂露出底色，靠近了再推回来。整块就是给画布换一个 CSS transform：
 *  合成器做位移和缩放，不重画、不碰排版；渲染器和 960×540 的世界坐标一行不改。
 *
 *  太方的屏幕（宽高比 < CAM_MIN_RATIO）裁得太多，镜头会一直拉远，继续走按键台版式。 */

import { H, W } from '../game/constants.ts';
import type { FightGame } from '../game/game.ts';

/** 低于这个宽高比不用镜头，退回「血条 + 画面 + 按键台」。 */
export const CAM_MIN_RATIO = 1.25;
/** 每个人身边至少留出的世界宽度：半个身位加一点出招的余量。 */
const MARGIN = 110;
/** 跟随的快慢：每秒逼近剩余距离的比例常数。 */
const FOLLOW = 6;

let box: { canvas: HTMLElement; w: number; h: number } | null = null;
let z = 1;
let cx = W / 2;
let snap = true;
let lastT = 0;
let last = '';
/** 这一帧实际写到画布上的镜头（CSS 像素），渲染器拿它把界面层反算回屏幕。 */
let view: { tx: number; ty: number; z: number; k: number; w: number; h: number } | null = null;

/** 镜头关着时返回 null。 */
export function cameraView(): typeof view { return view; }

/** 镜头开 / 关。w、h 是竞技场（未旋转）的宽高；画布已按高度铺满、左上角对齐。 */
export function setCameraBox(canvas: HTMLElement, w: number, h: number): void {
  if (!(w > 0 && h > 0)) {
    if (box) { box.canvas.style.removeProperty('transform'); box.canvas.classList.remove('cam-out'); }
    box = null;
    view = null;
    last = '';
    return;
  }
  if (box && box.canvas === canvas && box.w === w && box.h === h) return;
  box = { canvas, w, h };
  snap = true;
}

/** 新开一局：下一帧直接落位，不从上一局的镜头缓过来。 */
export function resetCamera(): void {
  snap = true;
  lastT = 0;
}

/** 镜头算法本身，纯函数：给定双方位置和上一帧状态，算出这一帧的缩放和中心。 */
export function cameraTarget(xs: number[], viewW: number, viewH: number): { z: number; cx: number } {
  const k = viewH / H;
  const zMin = viewW / (W * k);
  // 场上一个人都没有（理论上不会）：看整条场地。
  if (!xs.length) return { z: Math.min(1, zMin), cx: W / 2 };
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const zFit = viewW / (k * (hi - lo + MARGIN * 2));
  const tz = Math.min(1, Math.max(zMin, zFit));
  return { z: tz, cx: clampCenter((lo + hi) / 2, viewW, k, tz) };
}

function clampCenter(c: number, viewW: number, k: number, zoom: number): number {
  const half = viewW / (k * zoom) / 2;
  return half * 2 >= W ? W / 2 : Math.min(W - half, Math.max(half, c));
}

/** 每帧在画之前调一次：界面层要按这一帧的镜头反算。 */
export function stepCamera(g: FightGame | null): void {
  if (!box || !g) return;
  const now = performance.now();
  const dt = Math.min(.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  // 倒下的人也要在画面里：KO 的那一下正是要看的，不能镜头一转把他甩出去。召唤物和残影不算。
  const xs = g.fighters.filter(f => !f.minion && !f.echo).map(f => f.x);
  const t = cameraTarget(xs, box.w, box.h);
  if (snap) { z = t.z; cx = t.cx; snap = false; }
  else {
    const a = 1 - Math.exp(-dt * FOLLOW);
    z += (t.z - z) * a;
    cx += (t.cx - cx) * a;
  }
  const k = box.h / H;
  const c = clampCenter(cx, box.w, k, z);
  const tx = box.w / 2 - c * k * z;
  // 拉远时底边贴住屏幕下沿：地面和按键还在原处，多出来的那条在上面，正好垫在血条后面。
  const ty = box.h * (1 - z);
  const txr = Math.round(tx * 10) / 10, tyr = Math.round(ty * 10) / 10, zr = Math.round(z * 1e4) / 1e4;
  const css = `translate(${txr}px, ${tyr}px) scale(${zr})`;
  if (css !== last) {
    box.canvas.style.transform = css;
    last = css;
    // 拉远时画布上沿柔化，露出后面的同一张场景图（见 style.css 的 .cam-out）。
    box.canvas.classList.toggle('cam-out', zr < .995);
  }
  view = { tx: txr, ty: tyr, z: zr, k, w: box.w, h: box.h };
}
