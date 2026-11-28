import type { Lift, RareKind } from './director.ts';

export const SHIFT_TIME = 2.6;
export const DROP_ARM = .5;
export const DROP_REACH = 70;

export const RARE_COLOR: Record<RareKind, string> = { tri: '#7fe7ff', fire: '#ffb347', cymbal: '#FDE979', metro: '#ff6fa8' };
const HEAT_COLORS = ['#ffffff', '#fff1b0', '#FDE979', '#ffb35c', '#ff6fa8', '#7fe7ff'];

export function heatColor(h: number): string { return HEAT_COLORS[Math.max(0, Math.min(5, h))]; }
export function liftH(l: Lift): number { return 26 * (l.phase === 'rise' ? Math.min(1, l.t / .5) : l.phase === 'sink' ? Math.max(0, 1 - l.t / .6) : 1); }
