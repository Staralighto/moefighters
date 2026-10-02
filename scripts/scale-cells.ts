import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { decodePng, encodePng, ink, CELL } from './align-down.ts';

/* Scales the subject in every cell of a finished sheet by one factor, anchored at each cell's
   ink bounding-box bottom-centre, so the feet stay planted and the head clears the cell top.
   Nearest-neighbour sampling keeps pixel art crisp. Preview only: writes <base>.scaled.png
   next to the source and never touches the original. Run align-feet on the preview after. */

function scaleFile(src: string, factor: number): void {
  const abs = resolve(src);
  const img = decodePng(readFileSync(abs));
  const cols = img.w / CELL;
  const rows = img.h / CELL;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error(`这张是 ${img.w}×${img.h}，不是 ${CELL} 格的整数倍`);
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * CELL, y0 = row * CELL;
      let minX = CELL, minY = CELL, maxX = -1, maxY = -1;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          if (ink(img.rgba, ((y0 + y) * img.w + x0 + x) * 4)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) continue;
      // The anchor is the subject's foot point: shrink pulls everything toward it, so the
      // head drops away from the cell top and nothing can land outside the cell.
      const ax = x0 + (minX + maxX) / 2;
      const ay = y0 + maxY;
      const cellCopy = Buffer.alloc(CELL * CELL * 4);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const sx = Math.round(ax + (x0 + x - ax) / factor) - x0;
          const sy = Math.round(ay + (y0 + y - ay) / factor) - y0;
          if (sx < 0 || sx >= CELL || sy < 0 || sy >= CELL) continue;
          const s = ((y0 + sy) * img.w + x0 + sx) * 4;
          const d = (y * CELL + x) * 4;
          cellCopy[d] = img.rgba[s];
          cellCopy[d + 1] = img.rgba[s + 1];
          cellCopy[d + 2] = img.rgba[s + 2];
          cellCopy[d + 3] = img.rgba[s + 3];
        }
      }
      // Wipe the cell before pasting, so the un-scaled rim cannot ghost behind the copy.
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = ((y0 + y) * img.w + x0 + x) * 4;
          const s = (y * CELL + x) * 4;
          img.rgba[i] = cellCopy[s];
          img.rgba[i + 1] = cellCopy[s + 1];
          img.rgba[i + 2] = cellCopy[s + 2];
          img.rgba[i + 3] = cellCopy[s + 3];
        }
      }
    }
  }
  const out = join(dirname(abs), basename(abs).replace(/\.png$/i, '') + `.scaled.png`);
  writeFileSync(out, encodePng(img));
  console.log(`每格主体 ×${factor}（锚点：主体底边中点），写出 ${out}，原图未改`);
}

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  console.log('用法: node --experimental-strip-types scripts/scale-cells.ts <sheet.png> [缩放倍数=0.95]');
  process.exit(1);
}
scaleFile(args[0], args[1] ? Number(args[1]) : .95);
