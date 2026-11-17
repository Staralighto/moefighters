/* 唱片封面：没有图的曲目用代码生成一张海报式封面。同一首歌永远同一张（按曲名哈希取构图和配色）。
   构图只用平涂几何：大圆、斜切、条纹、网点、三角，和站点墙面同一套图形语言。
   形状挂 --lv（0..1 的低频能量），音乐库在放歌时逐帧写入，形状随之轻微起伏。 */

const INKS = ['--brand', '--cyan', '--p1', '--p2', '--gold', '--danger'] as const;

export function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface CoverLook { main: string; accent: string; layout: number }

export function coverLook(title: string): CoverLook {
  const h = hashOf(title);
  const main = INKS[h % INKS.length];
  let accent = INKS[(h >>> 4) % INKS.length];
  if (accent === main) accent = INKS[(INKS.indexOf(main) + 2) % INKS.length];
  return { main: `var(${main})`, accent: `var(${accent})`, layout: (h >>> 9) % 4 };
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** 封面内层的 HTML。外层容器由调用方给（决定尺寸），这里只填满它。 */
export function coverHTML(title: string, no: number, image?: string): string {
  if (image) return `<img class="cv-img" src="${esc(image)}" alt="">`;
  const { main, accent, layout } = coverLook(title);
  return `<div class="cv" data-layout="${layout}" style="--cv-main:${main};--cv-accent:${accent}">`
    + '<i class="cv-a"></i><i class="cv-b"></i><i class="cv-c"></i><i class="cv-dots"></i>'
    + `<span class="cv-no">${String(no).padStart(2, '0')}</span>`
    + `<b class="cv-title">${esc(title)}</b>`
    + '<span class="cv-mark">MOE FIGHTERS · OST</span></div>';
}
