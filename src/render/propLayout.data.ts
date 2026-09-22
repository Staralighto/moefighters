import type { PropPlace } from './propLayout.ts';

/** 部件相对角色的位置。用开发面板「部件」改，改完会写回这个文件。手改后刷新页面。
    x：扫弦朝面向为正；大招向屏幕右为正。y：相对脚底，向上为负。rot：弧度，正数让远端往下倒。size：图宽像素。 */
export const PROP_LAYOUT: Record<string, PropPlace> = {
  'anon-spin': { x: 0, y: -96, rot: 0, size: 300 },
  'anon-strum': { x: 75, y: -140, rot: 2.5, size: 156 },
};
