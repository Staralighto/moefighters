import type { StageData } from './types.ts';

/* Backdrop is drawn over the flat colours. sky/ground remain the fallback if the file is missing. */
export const STAGES: StageData[] = [
  { id: 'ring', name: 'RiNG · 夜', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/ring.png' },
  { id: 'ring-cafe', name: 'RiNG · 咖啡厅', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/ring-cafe.png', shade: '#10101b40' },
  { id: 'tsukinomori', name: '月之森 · 校门', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/tsukinomori.png', groundY: 453 },
  { id: 'lot-rain', name: '空地 · 雨', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/lot-rain.png' },
];
