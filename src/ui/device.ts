/**
 * 设备能力（这局用不用触屏玩）的唯一裁决处，产出只有一个：body.touch。
 *
 * 三层归属（规则全文见 docs/device-adaptation.md，selfcheck 有源码锁）：
 * - 能力：本文件，多信号裁决后写 body 类。CSS 和别的模块不得自己写能力媒体查询。
 * - 布局：视口多少空间是 CSS 的事（style.css 的断点、touchLayout.ts 的 orientation 查询）。
 * - 开关：宽屏这类玩法开关由 main.ts 的按钮写 body 类，不得掺能力信号。
 *
 * 判定优先级：
 * 1. `(hover: none) and (pointer: coarse)` —— 标准手机/平板浏览器的报告。iPad 的媒体查询恒报
 *    coarse（detect-it 注明，接了鼠标也不变），桌面 UA 改不了它，iPad 靠这条就够，不走回退。
 * 2. 回退：触屏硬件信号（`maxTouchPoints > 0` 或 `ontouchstart`，Phaser 的同款双检，单检会漏）
 *    且屏幕短边 < 768 —— 厂商壳浏览器和桌面 UA 模式会把主指针谎报成鼠标，媒体查询漏判真手机；
 *    硬件计数和物理屏幕尺寸不会说谎（桌面 UA 只改布局视口，screen 仍是物理屏尺寸）。短边 768
 *    分界沿用 detect-it 区分 iPhone/iPad 的边界，顺带把 1366×768 触屏笔记本挡回键盘 UI。
 *
 * 有意取舍：带触屏、接了鼠标且第 1 条没命中的设备判为桌面——键鼠优先。
 * 已知极限：主指针、触屏硬件、屏幕尺寸全部谎报的大屏设备探测不到，真遇到再按机型加信号。
 * （多信号思路对齐 detect-it / is-mobile；判定完全依赖浏览器报告，所以信号必须冗余。）
 */
const coarse = matchMedia('(hover: none) and (pointer: coarse)');

export function touchDevice(): boolean {
  return coarse.matches ||
    ((navigator.maxTouchPoints > 0 || 'ontouchstart' in window) &&
      Math.min(screen.width, screen.height) < 768);
}

/** 开局裁决一次写进 body 类；之后能力只会随主指针属性变化（外接键鼠、DevTools 模拟）。 */
export function applyTouchDevice(): void {
  document.body.classList.toggle('touch', touchDevice());
}

/** 能力变化通知：回调触发时 body.touch 已是最新，做 UI 刷新即可。 */
export function watchTouch(onChange: () => void): void {
  coarse.addEventListener('change', onChange);
}
