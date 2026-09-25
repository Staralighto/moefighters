// @ts-nocheck — Node script. Snap loose sprite-sheet subjects onto the 256 grid.
// Finds connected subjects across the whole image (they may straddle the old grid),
// sorts them left-to-right top-to-bottom, and translates each one into its cell:
// horizontally centred, lowest pixel on the shared ground line. Pure translation, no scaling.
// Usage: node --experimental-strip-types scripts/grid-snap.ts <in.png> <out.png> [cols=4] [rows=3] [baseline=243] [scale=1]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const [, , inPath, outPath, colsArg, rowsArg, baseArg, scaleArg] = process.argv;
const COLS = Number(colsArg ?? 4), ROWS = Number(rowsArg ?? 3), BASELINE = Number(baseArg ?? 243), SCALE = Number(scaleArg ?? 1);
if (!inPath || !outPath) throw new Error('usage: grid-snap.ts <in.png> <out.png> [cols] [rows] [baseline]');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8, w = 0, h = 0, type = 0, idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('ascii', o + 4, o + 8);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error('bit depth ' + body[8] + ' unsupported');
      if (body[12] !== 0) throw new Error('interlaced PNG unsupported');
      type = body[9];
      if (type !== 6 && type !== 2) throw new Error('colour type ' + type + ' unsupported (want RGB/RGBA)');
    } else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      px[(y * w + x) * 4] = cur[x * bpp];
      px[(y * w + x) * 4 + 1] = cur[x * bpp + 1];
      px[(y * w + x) * 4 + 2] = cur[x * bpp + 2];
      px[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, px };
}

function encode(w, h, px) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (kind, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind, 'ascii'), body])) >>> 0, 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const { w, h, px } = decode(readFileSync(inPath));
if (w % 256 !== 0 || h % 256 !== 0) throw new Error(`sheet is ${w}x${h}, cells must tile by 256`);
const at = (x, y) => (y * w + x) * 4;

/* Background: sample the top-left corner; a pixel is background when it is close to that
   colour or reads as strong chroma green. Dark uniform pixels stay foreground. */
const bgR = px[0], bgG = px[1], bgB = px[2];
console.log(`background sample rgb(${bgR},${bgG},${bgB})`);
const isBg = (x, y) => {
  const i = at(x, y), r = px[i], g = px[i + 1], b = px[i + 2];
  if (Math.abs(r - bgR) < 60 && Math.abs(g - bgG) < 60 && Math.abs(b - bgB) < 60) return true;
  return g > 140 && r < g * 0.72 && b < g * 0.72;
};

/* Connected components, 8-neighbour, iterative. */
const label = new Int32Array(w * h).fill(-1);
const comps = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (label[y * w + x] !== -1 || isBg(x, y)) continue;
  const id = comps.length;
  const pixels = [];
  label[y * w + x] = id;
  const stack = [[x, y]];
  let bx0 = x, bx1 = x, by0 = y, by1 = y;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    pixels.push(cx, cy);
    if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx;
    if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || label[ny * w + nx] !== -1 || isBg(nx, ny)) continue;
      label[ny * w + nx] = id;
      stack.push([nx, ny]);
    }
  }
  comps.push({ id, pixels, n: pixels.length / 2, bx0, bx1, by0, by1 });
}

/* Drop specks, then merge components whose padded boxes overlap (a hand split off the body). */
const live = comps.filter(k => k.n >= 400).sort((a, b) => b.n - a.n);
console.log(`${comps.length} raw components, ${live.length} over 400px`);
const pad = 4;
const merged = [];
for (const k of live) {
  const hit = merged.find(m => k.bx0 <= m.bx1 + pad && k.bx1 >= m.bx0 - pad && k.by0 <= m.by1 + pad && k.by1 >= m.by0 - pad);
  if (!hit) { merged.push({ pixels: [...k.pixels], n: k.n, bx0: k.bx0, bx1: k.bx1, by0: k.by0, by1: k.by1 }); continue; }
  hit.pixels.push(...k.pixels);
  hit.n += k.n;
  hit.bx0 = Math.min(hit.bx0, k.bx0); hit.bx1 = Math.max(hit.bx1, k.bx1);
  hit.by0 = Math.min(hit.by0, k.by0); hit.by1 = Math.max(hit.by1, k.by1);
}
console.log(`${merged.length} subjects after merge`);

/* A subject much wider than a cell means two figures fused. Split at the emptiest column near the middle. */
function splitWide(sub) {
  const width = sub.bx1 - sub.bx0 + 1;
  if (width <= 320) return [sub];
  const hist = new Int32Array(width);
  for (let i = 0; i < sub.pixels.length; i += 2) hist[sub.pixels[i] - sub.bx0]++;
  let cut = -1, best = Infinity;
  for (let x = Math.floor(width / 3); x < Math.ceil(width * 2 / 3); x++) {
    if (hist[x] < best) { best = hist[x]; cut = x; }
  }
  const cutX = sub.bx0 + cut;
  const a = { pixels: [], n: 0, bx0: sub.bx0, bx1: cutX, by0: sub.by0, by1: sub.by1 };
  const b = { pixels: [], n: 0, bx0: cutX + 1, bx1: sub.bx1, by0: sub.by0, by1: sub.by1 };
  for (let i = 0; i < sub.pixels.length; i += 2) {
    const x = sub.pixels[i], y = sub.pixels[i + 1];
    (x <= cutX ? a : b).pixels.push(x, y);
    (x <= cutX ? a : b).n++;
  }
  if (!a.n || !b.n) return [sub];
  const rebox = s => {
    let bx0 = w, bx1 = -1, by0 = h, by1 = -1;
    for (let i = 0; i < s.pixels.length; i += 2) {
      const x = s.pixels[i], y = s.pixels[i + 1];
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    s.bx0 = bx0; s.bx1 = bx1; s.by0 = by0; s.by1 = by1;
    return s;
  };
  return [...splitWide(rebox(a)), ...splitWide(rebox(b))];
}
const subjects = merged.flatMap(splitWide).sort((a, b) => b.n - a.n).slice(0, COLS * ROWS);
console.log(`${subjects.length} subjects placed (want ${COLS * ROWS})`);

/* Reading order: rows by centre-y, columns by centre-x. */
for (const s of subjects) { s.cx = (s.bx0 + s.bx1) / 2; s.cy = (s.by0 + s.by1) / 2; }
subjects.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
const rows = [];
for (const s of subjects) {
  const last = rows[rows.length - 1];
  if (!last || s.cy - last.mean > 100) rows.push({ items: [s], mean: s.cy });
  else { last.items.push(s); last.mean = last.items.reduce((t, k) => t + k.cy, 0) / last.items.length; }
}
const ordered = rows.flatMap(r => r.items.sort((a, b) => a.cx - b.cx));
if (rows.length !== ROWS) console.log(`note: grouped into ${rows.length} rows, expected ${ROWS}`);

/* Paint: fresh background, each subject translated into its cell. */
const out = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) { out[i * 4] = bgR; out[i * 4 + 1] = bgG; out[i * 4 + 2] = bgB; out[i * 4 + 3] = 255; }
ordered.forEach((s, k) => {
  const cell = Math.floor(k / COLS), col = k % COLS;
  const bw = s.bx1 - s.bx0 + 1, bh = s.by1 - s.by0 + 1;
  const dx = Math.round(col * 256 + 128 - bw / 2) - s.bx0;
  const dy = Math.round(cell * 256 + BASELINE - bh + 1) - s.by0;
  for (let i = 0; i < s.pixels.length; i += 2) {
    const x = s.pixels[i] + dx, y = s.pixels[i + 1] + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const src = at(s.pixels[i], s.pixels[i + 1]), dst = at(x, y);
    out[dst] = px[src]; out[dst + 1] = px[src + 1]; out[dst + 2] = px[src + 2]; out[dst + 3] = px[src + 3];
  }
  const cellBox = `cell r${cell}c${col}`;
  const warn = (bw > 256 ? ` WARNING ${bw}px wide overflows` : '') + (bh > BASELINE + 1 ? ` WARNING ${bh}px tall overflows` : '');
  console.log(`${cellBox}: ${bw}x${bh} moved (${dx >= 0 ? '+' : ''}${dx},${dy >= 0 ? '+' : ''}${dy})${warn}`);
});

writeFileSync(outPath, encode(w, h, out));
console.log('wrote ' + outPath);
