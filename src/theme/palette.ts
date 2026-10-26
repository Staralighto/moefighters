/** 亮色主题不手写，由 style.css 顶部 :root 的暗色 token 推导。
 *
 *  每个颜色 token 按「角色」换算，而不是逐个配色：
 *  - surface 暗色中性底（--bg、--panel、--line…）：以 --panel 为「纸」。暗色里离纸越远的层（更暗的页底、
 *    更亮的按钮、描边），亮色里就是越深一点的灰。白纸之上没有更白，所以凸起和凹陷都折成「比纸深」。
 *  - ink 暗色中性字（--text、--muted）：明度翻过来，再压到对比度达标。
 *  - accent 彩色（--p1、--cyan…）：本色是品牌色，两种主题都不变，按钮、能量条照用。
 *    另外自动生成 --x-ink：暗色里等于本色；亮色里同色相压暗到对比度达标，给文字、描边、选中圈用。
 *  - on-* 写在强调色填充上的字（--on-accent）：填充不变，它也不变。
 *  - shade-* 阴影和遮罩：仍是暗色，透明度收到四成，白底上的投影不发脏。
 *  - wash-* 叠在面板上的提亮层：亮色里换成同等强度的压暗层。
 *
 *  带 data-scheme="dark" 的子树（舞台、战斗画面、游戏内浮层）画在美术上，亮色下仍用暗色 token。
 *  纯函数，不碰 DOM：vite 插件拿它生成 CSS，selfcheck 拿它验对比度。 */

export interface Rgba { r: number; g: number; b: number; a: number }
interface Lch { l: number; c: number; h: number }

export type Role = 'surface' | 'ink' | 'accent' | 'on' | 'shade' | 'wash';

/** 暗色里的主阅读面。亮色里它是白纸，其他底色按离它多远换算。 */
export const PAPER = '--panel';
/** 美术面：这里面的界面永远按暗色画。 */
export const DARK_ISLAND = '[data-scheme="dark"]';
/** 正文、次要字、强调色文字的最低对比度（WCAG AA 正文）。 */
export const MIN_CONTRAST = 4.5;

// ---------- 颜色解析 ----------

export function parseColor(raw: string): Rgba | null {
  const v = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(ch => ch + ch).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (s: string) => s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s) / 255;
    const al = (s?: string) => s === undefined ? 1 : s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
    const c = { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a: al(parts[3]) };
    return Object.values(c).every(Number.isFinite) ? c : null;
  }
  return null;
}

export function formatColor(c: Rgba): string {
  const b = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  if (c.a >= 0.999) return '#' + [c.r, c.g, c.b].map(x => b(x).toString(16).padStart(2, '0')).join('');
  return `rgb(${b(c.r)} ${b(c.g)} ${b(c.b)} / ${Math.round(c.a * 100)}%)`;
}

// ---------- OKLCH ----------

const toLin = (x: number) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
const toGam = (x: number) => x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;

function toLch({ r, g, b }: Rgba): Lch {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, Bb), h: (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360 };
}

function lchToRgb({ l, c, h }: Lch): [number, number, number] {
  const A = c * Math.cos(h * Math.PI / 180), B = c * Math.sin(h * Math.PI / 180);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** 超出 sRGB 时只收色度，明度和色相不动。 */
function fromLch(lch: Lch, a = 1): Rgba {
  const l = Math.min(1, Math.max(0, lch.l));
  const inGamut = (c: number) => lchToRgb({ l, c, h: lch.h }).every(x => x >= -1e-4 && x <= 1 + 1e-4);
  let c = lch.c;
  if (!inGamut(c)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(mid)) lo = mid; else hi = mid; }
    c = lo;
  }
  const [r, g, b] = lchToRgb({ l, c, h: lch.h }).map(x => toGam(Math.min(1, Math.max(0, x))));
  return { r, g, b, a };
}

// ---------- 对比度 ----------

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 沿明度往下压，直到在每一块底上都够对比度。 */
function darkenUntil(lch: Lch, grounds: Rgba[], min: number): Rgba {
  for (let l = lch.l; l > 0; l -= 0.005) {
    const c = fromLch({ ...lch, l });
    if (grounds.every(g => contrast(c, g) >= min)) return c;
  }
  return fromLch({ ...lch, l: 0 });
}

// ---------- 角色 ----------

/** 色度低于这个就当中性色。 */
const NEUTRAL_CHROMA = 0.07;

export function roleOf(name: string, color: Rgba): Role {
  if (name.startsWith('--on-')) return 'on';
  if (name.startsWith('--shade')) return 'shade';
  if (name.startsWith('--wash')) return 'wash';
  const { l, c } = toLch(color);
  if (c >= NEUTRAL_CHROMA) return 'accent';
  return l < 0.5 ? 'surface' : 'ink';
}

export interface Token { name: string; value: string; color: Rgba; role: Role }

/** style.css 里第一个 :root 块的颜色 token。非颜色的（字体等）跳过。 */
export function readTokens(css: string): Token[] {
  const block = /:root\s*\{([^}]*)\}/.exec(css);
  if (!block) return [];
  const out: Token[] = [];
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const color = parseColor(m[2]);
    if (color) out.push({ name: m[1], value: m[2].trim(), color, role: roleOf(m[1], color) });
  }
  return out;
}

export const inkName = (accent: string) => accent + '-ink';

export interface Scheme {
  /** 暗色补齐的派生 token（各 -ink 指回本色）。 */
  darkExtra: Record<string, string>;
  /** 亮色下全部颜色 token 的值。 */
  light: Record<string, string>;
}

export function deriveScheme(tokens: Token[]): Scheme {
  const paper = tokens.find(t => t.name === PAPER);
  if (!paper) throw new Error(`theme: ${PAPER} is missing from :root`);
  const paperL = toLch(paper.color).l;
  const light: Record<string, string> = {};
  const darkExtra: Record<string, string> = {};

  // 底色先算：字和强调色要拿它们验对比度。
  const surfaces: Rgba[] = [];
  for (const t of tokens.filter(t => t.role === 'surface')) {
    const { l, c, h } = toLch(t.color);
    const d = l - paperL;
    // 凸起（按钮、描边）在暗色里拉开得少，亮色里要多给一点深度才分得清；凹陷（页底、输入框）反之。
    const lightL = 1 - (d > 0 ? 1.15 : 0.75) * Math.abs(d);
    const col = fromLch({ l: lightL, c: c * 0.5, h }, t.color.a);
    light[t.name] = formatColor(col);
    // 描边不是字的底，验对比度时不算它。
    if (!t.name.startsWith('--line')) surfaces.push(col);
  }

  for (const t of tokens) {
    const lch = toLch(t.color);
    switch (t.role) {
      case 'surface': break;
      case 'ink':
        light[t.name] = formatColor(darkenUntil({ ...lch, l: Math.min(0.9, 1.18 - lch.l) }, surfaces, MIN_CONTRAST));
        break;
      case 'accent':
        light[t.name] = t.value;
        darkExtra[inkName(t.name)] = `var(${t.name})`;
        // 黄色压暗会发橄榄绿，往金色偏一点；离黄越远偏得越少，别的色相不动。
        const warm = 12 * Math.max(0, 1 - Math.abs(lch.h - 100) / 15);
        light[inkName(t.name)] = formatColor(darkenUntil({ ...lch, c: lch.c * 1.1, h: lch.h - warm }, surfaces, MIN_CONTRAST));
        break;
      case 'on':
        light[t.name] = t.value;
        break;
      case 'shade':
        light[t.name] = formatColor({ ...t.color, a: t.color.a * 0.4 });
        break;
      case 'wash':
        light[t.name] = formatColor({ ...fromLch({ ...lch, l: 1 - lch.l }), a: t.color.a * 0.8 });
        break;
    }
  }
  return { darkExtra, light };
}

/** 亮色能「自动涌现」的前提：规则里不写死会随主题变的颜色。npm run check 跑这个，返回违规清单。
 *  - 不透明的中性色字面量（#000 / #fff 和近白高光除外）必须换成 token：它在亮色里不会跟着变。
 *    半透明的深色和白色是叠在美术上的遮罩、描边、高光，允许。
 *  - 强调色当文字、描边、轮廓用时必须写 -ink；同一条规则里拿它当底色的（按钮自己的边）除外。 */
export function auditCss(css: string): string[] {
  const tokens = readTokens(css);
  const accents = tokens.filter(t => t.role === 'accent').map(t => t.name.slice(2));
  const body = css.replace(/:root\s*\{[^}]*\}/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const problems: string[] = [];
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop()!.trim();
    if (selector.startsWith('@') || /^(from|to|[\d.]+%)/.test(selector)) continue;
    const fills = new Set([...m[2].matchAll(/background(?:-color)?:\s*var\(--([\w-]+)\)/g)].map(x => x[1]));
    for (const d of m[2].split(';')) {
      const [prop, ...rest] = d.split(':');
      const p = prop?.trim(), v = rest.join(':');
      if (!p || !v) continue;
      for (const lit of v.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []) {
        const c = parseColor(lit);
        if (!c || c.a < 0.999) continue;
        const { l, c: chroma } = toLch(c);
        if (chroma < NEUTRAL_CHROMA && l > 0.02 && l < 0.95) problems.push(`${selector} { ${p}: ${lit} } — 中性色请用 token`);
      }
      if (/^(color|border(-\w+)*|outline(-color)?|accent-color|caret-color|text-decoration-color)$/.test(p)) {
        for (const a of accents) {
          if (v.includes(`var(--${a})`) && !fills.has(a)) problems.push(`${selector} { ${p}: var(--${a}) } — 文字/描边请用 var(--${a}-ink)`);
        }
      }
    }
  }
  return problems;
}

const decls = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `  ${k}: ${v};`).join('\n');

/** 追加在 style.css 后面的生成块。手写的规则一条都不用改。 */
export function themeCss(css: string): string {
  const tokens = readTokens(css);
  const { darkExtra, light } = deriveScheme(tokens);
  const dark = Object.fromEntries(tokens.map(t => [t.name, t.value]));
  return `
/* ---- generated by src/theme/palette.ts: light theme derived from the :root dark tokens ---- */
:root {
${decls(darkExtra)}
}
:root[data-theme="light"] {
  color-scheme: light;
${decls(light)}
}
:root[data-theme="light"] ${DARK_ISLAND} {
  color-scheme: dark;
${decls({ ...dark, ...darkExtra })}
  color: var(--text);
}
`;
}
