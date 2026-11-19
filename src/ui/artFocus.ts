/* 终幕缩略图的「脸部居中」：卡片里的立绘按 object-fit: cover 裁切，默认居中裁，脸常常被裁到边上。
   每张图带上脸在原图里的位置（data-fx / data-fy，取自角色的 finale.focus），按卡片和原图的实际尺寸
   算出 object-position，让脸落在卡片正中；脸太靠边时停在刚好不露空白的地方。卡片尺寸变了自动重算。 */

const watched = new WeakSet<HTMLImageElement>();
let ro: ResizeObserver | null = null;

function place(img: HTMLImageElement, w = img.clientWidth, h = img.clientHeight): void {
  const fx = Number(img.dataset.fx), fy = Number(img.dataset.fy);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih || !w || !h || !Number.isFinite(fx) || !Number.isFinite(fy)) return;
  const k = Math.max(w / iw, h / ih);
  const sw = iw * k, sh = ih * k;
  /* cover 下，object-position p 让图的左边落在 (w - sw) * p。要脸（fx * sw）落在 w / 2。 */
  const axis = (box: number, size: number, f: number) => size - box < .5 ? 50 : Math.min(100, Math.max(0, (box / 2 - f * size) / (box - size) * 100));
  const position = `${Math.round(axis(w, sw, fx) * 10) / 10}% ${Math.round(axis(h, sh, fy) * 10) / 10}%`;
  if (img.style.objectPosition !== position) img.style.objectPosition = position;
}

function watch(img: HTMLImageElement): void {
  place(img);
  if (watched.has(img) || typeof ResizeObserver === 'undefined') return;
  watched.add(img);
  ro ??= new ResizeObserver((list, observer) => {
    for (const e of list) {
      const target = e.target as HTMLImageElement;
      if (target.isConnected) place(target, e.contentRect.width, e.contentRect.height);
      else { observer.unobserve(target); watched.delete(target); }
    }
  });
  ro.observe(img);
}

/** 只装一次：图片加载完（load 不冒泡，用捕获）就定位并开始跟踪尺寸。 */
export function bindArtFocus(): void {
  document.addEventListener('load', e => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.dataset.fx) watch(t);
  }, true);
}
