/** 手机按键中心，相对战斗画面宽高的百分比。开发时点「键位」拖动，松手写入这里。手改后刷新。
 *  竖屏技能键的位置在 style.css 的 pad-split 里，不写进这里，避免盖掉那套等距。 */
export const TOUCH_LAYOUT: Record<string, { x: number; y: number }> = {
  stick: { x: 12, y: 82 },
};
