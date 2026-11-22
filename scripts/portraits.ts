/* 全身立绘入库（npm run portraits）。
   唯一来源：素材/fighter-portraits/INDEX.md（最终交付表）。表里每行 = 一个角色 ID + 它当前交付的透明 PNG（<id>/<id>-vN.png）。
   换版本只需要改交付表那一行，然后跑这个脚本：
   · 产出 public/portraits/<id>.webp —— 游戏只认这一个文件名，不带版本号；
   · 重写 src/data/portraits.gen.ts —— 每个 ID 的版本、内容指纹（URL 上的 ?v=，换图后浏览器缓存自动失效）、脸的位置；
   · 写 素材/fighter-portraits/_check/faces.png —— 全员半身裁切 + 脸点的检查图，换图后看一眼。
   源 PNG 指纹没变的跳过重编码。脸的位置是按轮廓自动估的，个别不准就在 src/data/portraits.ts 的 FACE_FIX 里手改。
   --check：只核对交付表和产物是否一致，不写文件（有出入时退出码 1）。 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC_DIR = join(ROOT, '素材/fighter-portraits');
const OUT_DIR = join(ROOT, 'public/portraits');
const GEN = join(ROOT, 'src/data/portraits.gen.ts');
const CHECK_DIR = join(SRC_DIR, '_check');
/** webp 质量。80 比 86 小约 16%，画质差约 1.3dB（PSNR），看不出来；整张保留不裁，留给以后别处用。 */
const QUALITY = 80;
const checkOnly = process.argv.includes('--check');

interface Row { id: string; name: string; file: string; v: string }
interface Entry { v: string; h: string; face: [number, number] }

/** 交付表的一行：| 名字 | `id` | [文件](id/文件.png) | … */
function readIndex(): Row[] {
  const rows: Row[] = [];
  for (const line of readFileSync(join(SRC_DIR, 'INDEX.md'), 'utf8').split(/\r?\n/)) {
    const m = /^\|\s*([^|]+?)\s*\|\s*`([a-z0-9-]+)`\s*\|\s*\[[^\]]*\]\(([^)]+\.png)\)/.exec(line);
    if (!m) continue;
    const v = /-(v\d+)\.png$/.exec(m[3])?.[1] ?? 'v?';
    rows.push({ name: m[1], id: m[2], file: m[3], v });
  }
  return rows;
}

function readGen(): Record<string, Entry> {
  if (!existsSync(GEN)) return {};
  const m = /=\s*(\{[\s\S]*\});/.exec(readFileSync(GEN, 'utf8'));
  return m ? JSON.parse(m[1]) : {};
}

/** 脸的估计：轮廓最上沿往下 8.5% 画高处；横向取头顶那一段（上沿往下 2%–9%）不透明像素的重心。 */
async function estimateFace(buf: Buffer): Promise<[number, number]> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const opaque = (x: number, y: number) => data[(y * w + x) * c + 3] > 128;
  let top = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (opaque(x, y)) n++;
    if (n > w * .005) { top = y; break; }
  }
  let sx = 0, sn = 0;
  for (let y = Math.round(top + h * .02); y < Math.min(h, top + h * .09); y++) {
    for (let x = 0; x < w; x++) if (opaque(x, y)) { sx += x; sn++; }
  }
  const fx = sn ? sx / sn / w : .5;
  const fy = top / h + .085;
  return [Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000];
}

/** 检查图：每人一格，裁成快切 / VS 用的半身（头顶到大腿），脸点画个粉圈。 */
async function contactSheet(rows: Row[], gen: Record<string, Entry>): Promise<void> {
  const CW = 180, CH = 154, COLS = 10;
  const tiles: sharp.OverlayOptions[] = [];
  for (const [i, r] of rows.entries()) {
    const e = gen[r.id];
    const img = sharp(join(OUT_DIR, `${r.id}.webp`));
    const meta = await img.metadata();
    const W = meta.width!, H = meta.height!;
    const top = Math.round(H * .05), ch = Math.round(H * .57);
    const crop = await img.extract({ left: 0, top, width: W, height: ch }).resize(CW, CH, { fit: 'contain', background: '#151a29' }).toBuffer();
    const k = Math.min(CW / W, CH / ch);
    const ox = (CW - W * k) / 2, oy = (CH - ch * k) / 2;
    const dot = Buffer.from(`<svg width="${CW}" height="${CH}"><circle cx="${ox + e.face[0] * W * k}" cy="${oy + (e.face[1] * H - top) * k}" r="7" fill="none" stroke="#ff3b7f" stroke-width="2.5"/><text x="4" y="${CH - 5}" font-size="12" font-family="monospace" fill="#fff">${r.id}</text></svg>`);
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
    tiles.push({ input: crop, left: x, top: y }, { input: dot, left: x, top: y });
  }
  mkdirSync(CHECK_DIR, { recursive: true });
  await sharp({ create: { width: CW * COLS, height: CH * Math.ceil(rows.length / COLS), channels: 3, background: '#0b0e1a' } })
    .composite(tiles).png().toFile(join(CHECK_DIR, 'faces.png'));
}

const rows = readIndex();
const old = readGen();
const gen: Record<string, Entry> = {};
const problems: string[] = [];
let encoded = 0;
mkdirSync(OUT_DIR, { recursive: true });
for (const r of rows) {
  const src = join(SRC_DIR, r.file);
  if (!existsSync(src)) { problems.push(`${r.id}: 交付表指向的 ${r.file} 不存在`); continue; }
  const buf = readFileSync(src);
  // 指纹 = 源图 + 编码参数：换图或改质量都会重新编码，URL 的 ?v= 也跟着变。
  const h = createHash('sha256').update(buf).update(`webp-q${QUALITY}`).digest('hex').slice(0, 8);
  const out = join(OUT_DIR, `${r.id}.webp`);
  const same = old[r.id]?.h === h && existsSync(out);
  if (!same && checkOnly) { problems.push(`${r.id}: 产物和交付表的 ${r.v} 不一致，需要重新跑 npm run portraits`); continue; }
  if (!same) {
    await sharp(buf).webp({ quality: QUALITY, alphaQuality: 100, effort: 6 }).toFile(out);
    encoded++;
  }
  gen[r.id] = { v: r.v, h, face: same ? old[r.id].face : await estimateFace(buf) };
}
const listed = new Set(rows.map(r => r.id));
const stale = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter(f => f.endsWith('.webp') && !listed.has(f.slice(0, -5))) : [];
for (const f of stale) problems.push(`public/portraits/${f} 不在交付表里（可删除）`);

if (!checkOnly) {
  const body = JSON.stringify(gen, null, 2).replace(/\[\n\s+([\d.]+),\n\s+([\d.]+)\n\s+\]/g, '[$1, $2]');
  writeFileSync(GEN, `// 由 scripts/portraits.ts 按 素材/fighter-portraits/INDEX.md 生成，不要手改；换图后跑 npm run portraits。\n// v = 交付版本，h = 源 PNG 指纹（URL 的 ?v=），face = 脸中心在整张图里的比例坐标（自动估计，手改去 portraits.ts 的 FACE_FIX）。\nexport const PORTRAITS: Record<string, { v: string; h: string; face: readonly [number, number] }> = ${body};\n`);
  await contactSheet(rows.filter(r => gen[r.id]), gen);
}
console.log(`portraits: ${rows.length} 位，重新编码 ${encoded}，${checkOnly ? '只检查' : '已写 portraits.gen.ts 和 _check/faces.png'}`);
for (const p of problems) console.log('  ! ' + p);
if (problems.some(p => !p.includes('可删除'))) process.exitCode = 1;
