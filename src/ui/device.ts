/**
 * 设备能力（这局用不用触屏玩）的唯一裁决处，产出两个 body 类：touch、keys。
 *
 * 三层归属（规则全文见 docs/device-adaptation.md，selfcheck 有源码锁）：
 * - 能力：本文件，多信号裁决后写 body 类。CSS 和别的模块不得自己写能力媒体查询。
 * - 布局：视口多少空间是 CSS 的事（style.css 的断点、touchLayout.ts 的 orientation 查询）。
 * - 开关：宽屏、横屏这类玩法开关由 main.ts 的按钮写 body 类，不得掺能力信号。
 *
 * 触屏判定，先中先得：
 * 1. `(hover: none) and (pointer: coarse)` —— 标准手机/平板。iPad 的媒体查询恒报 coarse
 *    （detect-it 注明，接了鼠标也不变），桌面 UA 改不了它，iPad 靠这条就够。
 * 2. `(any-hover: none) and (any-pointer: coarse)` —— 主指针被谎报成鼠标、屏幕尺寸也被报成桌面，
 *    但机器上根本没有能悬停的指针。触屏笔记本接着鼠标时 any-hover 仍是 hover，过不了这条。
 * 3. 短边 < 768，且（触屏硬件或 `any-pointer: coarse`）。厂商壳和桌面 UA 会把主指针谎报成鼠标；
 *    硬件计数和物理屏幕尺寸通常不跟着谎。短边 768 沿用 detect-it 区分 iPhone/iPad 的边界，
 *    把 1366×768 触屏笔记本挡回键鼠。`ontouchstart` 同时看 window 和 documentElement（Phaser 双检）。
 *
 * keys（正向键鼠）要主指针是细指针、能悬停、短边 ≥ 768，并且上面三条都没判成触屏。
 * 宽屏只在 body.keys 上收摇杆。探测失手的小屏没有 keys，进了宽屏也留着杆。
 *
 * 有意取舍：带触屏、接了鼠标、主查询没命中、短边 ≥ 768 → 键鼠优先，不加 touch。
 * 已知极限：主指针、any-hover、触屏硬件、屏幕尺寸全部谎报时分不出手机和触屏本。
 * （多信号思路对齐 detect-it / is-mobile；判定完全依赖浏览器报告，所以信号必须冗余。）
 */
const coarse = matchMedia('(hover: none) and (pointer: coarse)');
const touchOnly = matchMedia('(any-hover: none) and (any-pointer: coarse)');
const anyPointer = matchMedia('(any-pointer: coarse)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');

function shortSide(): number {
  return Math.min(screen.width, screen.height);
}

export function touchDevice(): boolean {
  if (coarse.matches || touchOnly.matches) return true;
  if (shortSide() >= 768) return false;
  return navigator.maxTouchPoints > 0
    || 'ontouchstart' in window
    || 'ontouchstart' in document.documentElement
    || anyPointer.matches;
}

/** 正向键鼠。宽屏收杆只认这个，不认「没有 touch」。 */
export function keysDevice(): boolean {
  return !touchDevice() && fine.matches && shortSide() >= 768;
}

/** 把当前裁决写进 body。touch 与 keys 互斥。 */
export function applyTouchDevice(): void {
  const touch = touchDevice();
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('keys', !touch && keysDevice());
}

/**
 * 能力变化通知。回调触发时 body 类已是最新；没变化不回调。
 * 主指针、any-hover / any-pointer、resize、转屏都会重算：折叠屏跨过 768、晚到的 screen 尺寸靠这个。
 * 窗口变窄不改 screen 短边，触屏本不会因此被判成触屏。
 */
export function watchTouch(onChange: () => void): void {
  const fire = () => {
    const before = document.body.classList.contains('touch') ? 't' : document.body.classList.contains('keys') ? 'k' : '';
    applyTouchDevice();
    const after = document.body.classList.contains('touch') ? 't' : document.body.classList.contains('keys') ? 'k' : '';
    if (after !== before) onChange();
  };
  for (const q of [coarse, touchOnly, anyPointer, fine]) q.addEventListener('change', fire);
  window.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
}
