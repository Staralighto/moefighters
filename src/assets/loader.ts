import type { CharacterData, StageData } from '../data/types.ts';

export type ImageCache = Map<string, HTMLImageElement>;

/** 1×1 WebP. One decode decides the browser can use the format, so a no is not N failed sheet requests. */
const WEBP_PROBE = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

/**
 * Production lists the built WebP, then the PNG. Dev, and a browser that cannot decode
 * WebP, get the PNG only — one request, no fallback storm.
 */
export function imageSources(src: string, prod = import.meta.env.PROD, webpOk = true): readonly string[] {
  if (prod && webpOk && src.endsWith('.png')) return [src.slice(0, -4) + '.webp', src];
  return [src];
}

function fetchImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      // Decode here, while the loading screen or the queue is the thing waiting, so a
      // first drawImage mid-fight never stalls on a 2048px sheet's synchronous decode.
      const decoded = im.decode?.().catch(() => {}) ?? Promise.resolve();
      void decoded.then(() => resolve(im));
    };
    im.onerror = () => reject(Error('图片加载失败：' + src));
    im.src = src;
  });
}

let webpOk: Promise<boolean> | null = null;
function supportsWebp(): Promise<boolean> {
  if (!import.meta.env.PROD) return Promise.resolve(false);
  webpOk ??= fetchImage(WEBP_PROBE).then(() => true, () => false);
  return webpOk;
}

/** One in-flight load per logical path. A later caller joins it instead of starting a second download. */
const loaded = new Map<string, Promise<HTMLImageElement>>();

async function fetchFirst(src: string): Promise<HTMLImageElement> {
  const sources = imageSources(src, import.meta.env.PROD, src.endsWith('.png') ? await supportsWebp() : false);
  let err: unknown;
  for (const url of sources) {
    try { return await fetchImage(url); }
    catch (e) { err = e; }
  }
  throw err instanceof Error ? err : Error('图片加载失败：' + src);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = loaded.get(src);
  if (!pending) {
    pending = fetchFirst(src).catch(err => {
      loaded.delete(src);
      throw err;
    });
    loaded.set(src, pending);
  }
  return pending;
}

/** Paint the URL that already loaded. A swapped icon does not treat the aborted request as a PNG fallback. */
export function assignImage(img: HTMLImageElement, src: string): void {
  const gen = String((Number(img.dataset.imgGen) || 0) + 1);
  img.dataset.imgGen = gen;
  img.onerror = null;
  void loadImage(src).then(im => {
    if (img.dataset.imgGen !== gen) return;
    if (img.src !== im.src) img.src = im.src;
  }).catch(() => {});
}

/** CSS has no error event. The url is applied only after loadImage picked WebP or PNG, so the sheet is not fetched twice. */
export function applyImageUrl(src: string, apply: (url: string) => void): void {
  void loadImage(src).then(im => apply(im.src)).catch(() => {});
}

/** Every image a match needs: sprite views plus the stage backdrop. */
export function assetsFor(characters: CharacterData[], stage: StageData): string[] {
  const srcs = characters.flatMap(c => c.view.kind === 'sprite'
    ? [c.view.common, c.view.special, ...(c.view.frenzy ? [c.view.frenzy] : []), ...(c.view.king ? [c.view.king] : []), ...(c.view.world ? [c.view.world] : []), ...(c.view.box ? [c.view.box] : []), ...(c.view.extras ?? [])]
    : []);
  if (stage.image) srcs.push(stage.image);
  return [...new Set(srcs)];
}

/** 马善政毛笔楷书, subset to the nine kuji characters. OFL, see public/fonts/MaShanZheng-OFL.txt. */
let kujiFont: Promise<void> | null = null;
export function loadKujiFont(): Promise<void> {
  if (kujiFont) return kujiFont;
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const face = new FontFace('Ma Shan Zheng', 'url(/fonts/ma-shan-zheng-kuji.woff2)');
  kujiFont = face.load().then(loaded => { document.fonts.add(loaded); }).catch(() => {});
  return kujiFont;
}

/** Sheets that failed once. Portraits stop waiting and fall back to the block figure. */
export const missingImages = new Set<string>();

const inflight = new Map<string, Promise<boolean>>();

/** One request per src, shared by the select queue and the fight preload. */
export function loadInto(cache: ImageCache, src: string): Promise<boolean> {
  if (cache.has(src)) return Promise.resolve(true);
  if (missingImages.has(src)) return Promise.resolve(false);
  let pending = inflight.get(src);
  if (!pending) {
    pending = loadImage(src).then(im => {
      cache.set(src, im);
      return true;
    }).catch(() => {
      missingImages.add(src);
      return false;
    }).finally(() => { inflight.delete(src); });
    inflight.set(src, pending);
  }
  return pending;
}

/** Loads independently so one missing file does not wipe the rest of the cache. */
export async function preload(cache: ImageCache, srcs: string[]): Promise<string[]> {
  const results = await Promise.all(srcs.map(async s => (await loadInto(cache, s)) ? null : s));
  return results.filter((s): s is string => s !== null);
}

/**
 * Displayed load fraction. Creeps while nothing has arrived yet, and stays under 1
 * until `real` is 1 so the bar cannot finish early.
 */
export function easeLoad(display: number, real: number, elapsedMs: number): number {
  const creep = 1 - Math.exp(-Math.max(0, elapsedMs) / 6000);
  const target = real >= 1 ? 1 : Math.min(0.96, Math.max(real * 0.9, creep * 0.85));
  const next = display + (target - display) * 0.12;
  return real >= 1 ? Math.min(1, next) : Math.min(next, 0.96);
}

/** Next download: a pinned src before anything that merely jumped the queue. */
export function nextSrc(pins: readonly string[], front: readonly string[], back: readonly string[], settled: ReadonlySet<string>): string | null {
  const waiting = (s: string) => !settled.has(s);
  const pinned = pins.find(s => waiting(s) && (front.includes(s) || back.includes(s)));
  return pinned ?? front.find(waiting) ?? back.find(waiting) ?? null;
}

export interface ImageQueue {
  /** These finish before `soon` entries. The first screen pins the stage and whoever is standing on it. */
  pin(srcs: readonly string[]): void;
  /** Jump the queue, still behind anything pinned. */
  soon(srcs: readonly string[]): void;
  /** After the pinned and jumped entries. */
  later(srcs: readonly string[]): void;
  /** Stop dispatching new background loads (a fight preload takes the link); in-flight ones finish. */
  pause(): void;
  /** Resume dispatching. */
  resume(): void;
}

/**
 * ponytail: two downloads at a time so a phone does not decode every sheet in one frame.
 * A desktop with memory to spare can raise the limit; the pin order stays the same.
 */
export function imageQueue(cache: ImageCache, limit: number, load: (src: string) => Promise<boolean> = s => loadInto(cache, s)): ImageQueue {
  const pins: string[] = [];
  const front: string[] = [];
  const back: string[] = [];
  const flying = new Set<string>();
  const settled = new Set<string>();
  let active = 0;
  let paused = false;

  function drop(src: string): void {
    const fi = front.indexOf(src);
    if (fi >= 0) front.splice(fi, 1);
    const bi = back.indexOf(src);
    if (bi >= 0) back.splice(bi, 1);
  }

  function pump(): void {
    if (paused) return;
    while (active < limit) {
      const src = nextSrc(pins, front, back, settled);
      if (!src) return;
      drop(src);
      if (cache.has(src) || missingImages.has(src)) { settled.add(src); continue; }
      active++;
      flying.add(src);
      void load(src).finally(() => {
        flying.delete(src);
        settled.add(src);
        active--;
        pump();
      });
    }
  }

  function soon(srcs: readonly string[]): void {
    for (let i = srcs.length - 1; i >= 0; i--) {
      const src = srcs[i];
      if (!src || settled.has(src) || flying.has(src)) continue;
      if (cache.has(src) || missingImages.has(src)) { settled.add(src); continue; }
      drop(src);
      front.unshift(src);
    }
    pump();
  }

  return {
    pin(srcs) {
      pins.splice(0, pins.length, ...new Set(srcs.filter(Boolean)));
      soon(pins);
    },
    soon,
    later(srcs) {
      for (const src of srcs) {
        if (!src || settled.has(src) || flying.has(src) || front.includes(src) || back.includes(src)) {
          if (src && (cache.has(src) || missingImages.has(src))) settled.add(src);
          continue;
        }
        if (cache.has(src) || missingImages.has(src)) { settled.add(src); continue; }
        back.push(src);
      }
      pump();
    },
    pause() { paused = true; },
    resume() {
      paused = false;
      pump();
    },
  };
}
