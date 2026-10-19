import type { StageData } from './types.ts';

/* Backdrop is drawn over the flat colours. sky/ground remain the fallback if the file is missing. */
export const STAGES: StageData[] = [
  { id: 'ring', name: 'RiNG · 夜', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/ring.png' },
  { id: 'ring-cafe', name: 'RiNG · 咖啡厅', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/ring-cafe.png', shade: '#10101b40' },
  { id: 'tsukinomori', name: '月之森 · 校门', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/tsukinomori.png', groundY: 453 },
  { id: 'lot-rain', name: '空地 · 雨', sky: '#241f39', ground: '#17131f', accent: '#FDE979', image: '/stages/lot-rain.png' },
  { id: 'underwater', name: '水下 · 晴', sky: '#20a4c8', ground: '#183842', accent: '#7ef5ff', image: '/stages/underwater.png', groundY: 458 },
  { id: 'yumemita', name: '梦限大 · 虚空', sky: '#f7a8c8', ground: '#18a8b8', accent: '#ffffff', image: '/stages/yumemita.png' },
  { id: 'asukayama', name: '飞鸟山 · 夜', sky: '#1e1633', ground: '#121018', accent: '#e6edff', image: '/stages/asukayama.png' },
  { id: 'sanctuary', name: '圣域 · 晴', sky: '#c8f0b0', ground: '#2a5028', accent: '#ffffc0', image: '/stages/sanctuary.png' },
  { id: 'tenkyuu', name: '天球 · 舞台', sky: '#1a0933', ground: '#0d0614', accent: '#c084fc', image: '/stages/tenkyuu.png' },
];
