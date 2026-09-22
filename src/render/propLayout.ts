import { PROP_LAYOUT } from './propLayout.data.ts';

export interface PropPlace {
  x: number;
  y: number;
  rot: number;
  size: number;
}

export { PROP_LAYOUT };

const seen = new Set<string>();

/** Draw code asks for an id. A new id shows up in the dev panel and starts near the feet. */
export function watchProp(id: string): PropPlace {
  seen.add(id);
  let place = PROP_LAYOUT[id];
  if (!place) {
    place = { x: 0, y: -100, rot: 0, size: 128 };
    PROP_LAYOUT[id] = place;
  }
  return place;
}

export function propIds(): string[] {
  return [...new Set([...Object.keys(PROP_LAYOUT), ...seen])].sort();
}
