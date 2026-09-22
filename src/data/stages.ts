import type { StageData } from './types.ts';

/* Backdrop is drawn over the flat colours. sky/ground remain the fallback if the file is missing. */
export const STAGES: StageData[] = [
  { id: 'dojo', name: '练武场', sky: '#241f39', ground: '#17131f', accent: '#d8ff62', image: '/stages/ring.png' },
];
