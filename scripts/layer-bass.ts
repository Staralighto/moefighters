import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rasterSheet } from './sprite-guard.ts';
import { SHEET_SCALE } from '../src/render/proportions.ts';

/* Placeholder Spector bass. Grip is the neck/body joint at (256, 500) on this 512×768 picture.
   Replace the PNG in place; the game keys off that grip. SHEET_SCALE is unused: this is not a cell. */
void SHEET_SCALE;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">
  <polygon points="256,500 198,488 148,418 178,460 152,540 138,650 172,728 256,748 348,728 378,650 358,540 332,460 368,418 312,488" fill="#1a1a1e" stroke="#CC0000" stroke-width="6" stroke-linejoin="round"/>
  <polygon points="208,548 252,522 304,558 292,688 218,708 186,624" fill="#f0e2c8"/>
  <rect x="226" y="578" width="50" height="14" fill="#111"/>
  <rect x="226" y="608" width="50" height="14" fill="#111"/>
  <rect x="242" y="78" width="28" height="428" fill="#e6c48a" stroke="#151222" stroke-width="3"/>
  <polygon points="242,78 214,50 224,22 312,22 300,78" fill="#e6c48a" stroke="#151222" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="206" cy="38" r="7" fill="#111"/>
  <circle cx="206" cy="56" r="7" fill="#111"/>
  <circle cx="328" cy="38" r="7" fill="#111"/>
  <circle cx="328" cy="56" r="7" fill="#111"/>
</svg>
`;

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'layer', 'bass.png');
rasterSheet(dest, svg, 512, 768);
console.log('wrote ' + dest);
