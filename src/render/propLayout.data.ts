import type { PropPlace } from './propLayout.ts';

/** 部件相对角色的位置。用开发面板改（战斗中 Shift+P），改完会写回这个文件。手改后刷新页面。
    x：扫弦朝面向为正；大招向屏幕右为正。y：相对脚底，向上为负。rot：弧度，正数让远端往下倒。size：图宽像素。 */
export const PROP_LAYOUT: Record<string, PropPlace> = {
  'anon-spin': { x: 0, y: -96, rot: 0, size: 300 },
  'anon-strum': { x: 75, y: -140, rot: 2.5, size: 156 },
  // 泽海奏多 大招的立式钢琴。x 向前，让琴身从手边伸向场外，人和凳子留在琴后。
  'kanata-piano': { x: 40, y: -177, rot: 0, size: 200 },
  // 汐见萤 大招的三角钢琴，比师傅的大一圈。图 512×512，琴身同样向前伸。
  'hotaru-piano': { x: 176, y: -248, rot: 0, size: 300 },
};
