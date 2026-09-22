import type { StageData } from './types.ts';

/* One flat arena for v1. Add `image: '/stages/foo.webp'` to swap in a backdrop. */
export const STAGES: StageData[] = [
  { id: 'dojo', name: '练武场', sky: '#241f39', ground: '#17131f', accent: '#d8ff62' },
];
