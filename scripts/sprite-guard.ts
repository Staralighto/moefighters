// @ts-nocheck — Node script. App typecheck includes it only through selfcheck.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { crc32 } from 'node:zlib';

/* Finished art has no marker. A sheet script may overwrite only a missing file or one it stamped.
   ponytail: one tEXt chunk. Ceiling = tools that preserve unknown chunks; a normal save drops it. */

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KEY = 'moefighters';
const VALUE = 'placeholder';

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

export function isPlaceholderPng(buf: Buffer): boolean {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) return false;
  let o = 8;
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    if (o + 12 + len > buf.length) return false;
    if (type === 'tEXt') {
      const data = buf.subarray(o + 8, o + 8 + len);
      const nul = data.indexOf(0);
      if (nul > 0 && data.toString('latin1', 0, nul) === KEY && data.toString('latin1', nul + 1) === VALUE) return true;
    }
    if (type === 'IEND') return false;
    o += 12 + len;
  }
  return false;
}

export function stampPlaceholder(buf: Buffer): Buffer {
  if (isPlaceholderPng(buf)) return buf;
  const iend = buf.lastIndexOf(Buffer.from('IEND'));
  if (iend < 4) throw new Error('PNG has no IEND');
  const at = iend - 4;
  const text = Buffer.concat([Buffer.from(KEY), Buffer.from([0]), Buffer.from(VALUE)]);
  return Buffer.concat([buf.subarray(0, at), chunk('tEXt', text), buf.subarray(at)]);
}

function finishedArt(pngPath: string, replace: boolean): boolean {
  if (replace || !existsSync(pngPath)) return false;
  return !isPlaceholderPng(readFileSync(pngPath));
}

/** Refuses to replace a PNG that is not one of our stamped placeholders. `--replace` is the authorization. */
export function assertWritable(pngPath: string, replace = process.argv.includes('--replace')): void {
  if (finishedArt(pngPath, replace)) throw new Error(`${pngPath} is finished art. Re-run with --replace to overwrite it.`);
}

/** Check the whole batch before any screenshot, so one locked file does not hide the rest. */
export function assertAllWritable(paths: string[], replace = process.argv.includes('--replace')): void {
  const blocked = paths.filter(p => finishedArt(p, replace));
  if (!blocked.length) return;
  throw new Error(blocked.map(p => `${p} is finished art.`).join('\n') + '\nRe-run with --replace to overwrite.');
}

function chromeBin(): string {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  const hit = candidates.find(p => existsSync(p));
  if (!hit) throw new Error('Chrome or Edge is required to rasterize sprite sheets');
  return hit;
}

/** Screenshot an SVG to a PNG of exactly w×h, then stamp it as a placeholder. The target is written only after the shot checks out. */
export function rasterSheet(pngPath: string, svg: string, w: number, h: number): void {
  assertWritable(pngPath);
  const scratch = mkdtempSync(join(tmpdir(), 'sheet-'));
  const svgPath = join(scratch, 'sheet.svg');
  const shot = join(scratch, 'sheet.png');
  writeFileSync(svgPath, svg);
  const url = 'file:///' + svgPath.replaceAll('\\', '/');
  const run = spawnSync(chromeBin(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--user-data-dir=${join(scratch, 'profile')}`, `--window-size=${w},${h}`, `--screenshot=${shot}`, url,
  ], { stdio: 'pipe' });
  if (run.status !== 0 || !existsSync(shot)) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(`raster ${pngPath} failed\n${run.stderr?.toString() ?? ''}`);
  }
  const buf = readFileSync(shot);
  rmSync(scratch, { recursive: true, force: true });
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  if (pw !== w || ph !== h) throw new Error(`${pngPath} raster is ${pw}x${ph}, wanted ${w}x${h}`);
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, stampPlaceholder(buf));
}

export function checkSpriteGuard(): void {
  const ihdr = chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
  const png = Buffer.concat([SIG, ihdr, chunk('IEND', Buffer.alloc(0))]);
  if (isPlaceholderPng(png)) throw new Error('blank png looked like a placeholder');
  const stamped = stampPlaceholder(png);
  if (!isPlaceholderPng(stamped) || !stampPlaceholder(stamped).equals(stamped)) throw new Error('stamp did not stick');
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  const file = join(dir, 'art.png');
  writeFileSync(file, png);
  let threw = false;
  try { assertWritable(file, false); } catch { threw = true; }
  if (!threw) throw new Error('unstamped png was writable');
  assertWritable(file, true);
  writeFileSync(file, stamped);
  assertWritable(file, false);
  rmSync(dir, { recursive: true, force: true });
}
