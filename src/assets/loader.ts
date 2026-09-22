import type { CharacterData, StageData } from '../data/types.ts';

export type ImageCache = Map<string, HTMLImageElement>;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(Error('图片加载失败：' + src));
    im.src = src;
  });
}

/** Every image a match needs: sprite views plus the stage backdrop. */
export function assetsFor(characters: CharacterData[], stage: StageData): string[] {
  const srcs = characters.flatMap(c => c.view.kind === 'sprite' ? [c.view.common, c.view.special, ...(c.view.extras ?? [])] : []);
  if (stage.image) srcs.push(stage.image);
  return [...new Set(srcs)];
}

/** Loads independently so one missing file does not wipe the rest of the cache. */
export async function preload(cache: ImageCache, srcs: string[]): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(srcs.filter(s => !cache.has(s)).map(async s => {
    try { cache.set(s, await loadImage(s)); }
    catch { missing.push(s); }
  }));
  return missing;
}
