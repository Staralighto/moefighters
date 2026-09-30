/** 摇杆中心，相对战斗画面的百分比。开发时点「键位」拖动，松手写入这里。手改后刷新。
    攻击、技能、必杀都不在这里：横屏的键位由 `.touchpad.in-tower` 按 --atk 定位。 */
export const TOUCH_LAYOUT: Record<string, { x: number; y: number }> = {
  stick: { x: 12, y: 82 },
};
