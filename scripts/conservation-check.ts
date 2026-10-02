import { readFileSync } from 'node:fs';
import { decodePng } from './align-down.ts';

/* Non-transparent (alpha > 24) pixel conservation for the accept flow: a pure translation must
   keep the count identical. Pass archived-original/current pairs as args; with no args it runs
   the pending previews of every character dir that still has archived originals to compare. */

const count = (p: string): number => {
  const img = decodePng(readFileSync(p));
  let n = 0;
  for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] > 24) n++;
  return n;
};

const args = process.argv.slice(2);
if (args.length && args.length % 2 === 0) {
  for (let i = 0; i < args.length; i += 2) {
    const ca = count(args[i]), cb = count(args[i + 1]);
    console.log(`${args[i]} → ${args[i + 1]}: ${ca} → ${cb} ${ca === cb ? '守恒 ✓' : '不等 ✗ 差 ' + (cb - ca)}`);
  }
} else {
  console.log('用法: node --experimental-strip-types scripts/conservation-check.ts <归档原图.png> <当前表.png> [...更多成对参数]');
  process.exit(args.length ? 1 : 0);
}
