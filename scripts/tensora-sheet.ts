import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block 天素罗 (tensora). Do not import write-sheets.ts.
   She is not a stick figure: a round yellow plush ball (炸虾套装) with an anime face set high on the front, light-brown
   hair framing it, no arms, and two small orange feet under the body. So this sheet draws a ball, not the shared
   skeleton: J is a headbutt (the whole ball pitches forward), K a kick of one little foot, the guard is curling up
   into a lower, wider ball, the knockdown is the ball on its back with both feet up.
   Special columns: U 最神速的脚脚 (crouched forward, feet stamping / leaning far forward at a run, both feet blurring
   front and back / leaning back in a skid, front foot planted), I 欧耶！ (squashed flat, eyes shut, straining / popped
   up tall, mouth open in a cheer / standing happy, glancing back), O 薯片挑战 (a chip held in the mouth, up on tiptoe /
   leaning in, mouth open on the crunch / cheeks round, chewing), L 坏人类！ (puffed up rounder, eyes shut, red cheeks /
   head thrown back crying with the mouth wide, one foot stamping / sniffling, slumped a little).
   Colour blocks only: plush, hair and face detail belong to the img2img prompt. The chip in O is the one prop drawn
   into the cells. `--svg <dir>` writes common.svg, special.svg and egg.svg there; rasterize them with sharp
   (scripts/__probe/subaru-raster.ts shows how) into public/sprites/tensora/, stamped as placeholders. */

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const BODY = '#e8c64a';
const HAIR = '#a8784e';
const FACE = '#f6dcc4';
const EYE = '#3a6fc4';
const FEET = '#f08a2c';
const CHEEK = '#f08aa0';
const CHIP = '#e6b84a';
const FOOT = 12;
/** Ball radius in the shared sheet units; SHEET_SCALE fills the cell like everyone else's figure. */
const R = 70 * SHEET_SCALE;
const FOOT_H = 14 * SHEET_SCALE;

interface Pose {
  /** Tilt of the whole ball (radians, positive pitches forward / to the right). */
  rot: number;
  sx?: number; sy?: number;
  ox?: number; oy?: number;
  /** Feet: [dx, dy] from under the ball's centre, front and back. dy negative lifts the foot. */
  front: [number, number]; back: [number, number];
  /** 0 shut, 1 open. */
  eyes?: number;
  /** 0 closed, 1 open, 2 wide (the cry). */
  mouth?: number;
  cheeks?: boolean;
  chip?: boolean;
  /** On its back on the floor (down / ko). */
  lying?: boolean;
}

const IDLE: Pose = { rot: 0, front: [18, 0], back: [-18, 0] };
const RUN: Pose[] = [
  { rot: .06, oy: -2, front: [30, -6], back: [-24, 0] },
  { rot: .04, oy: -6, front: [8, -10], back: [-8, 0] },
  { rot: .06, oy: -2, front: [-22, 0], back: [28, -6] },
  { rot: .04, oy: -6, front: [-6, 0], back: [10, -10] },
];
const JUMP: Pose = { rot: .05, oy: -40, front: [14, -10], back: [-14, -10] };
const BLOCK: Pose = { rot: -.05, sx: 1.08, sy: .84, front: [12, 0], back: [-12, 0], eyes: 0 };
const DODGE: Pose = { rot: -.32, ox: -18, oy: -6, front: [20, -12], back: [-26, 0] };
const HURT: Pose = { rot: -.36, ox: -10, front: [26, -8], back: [-16, 0], eyes: 0, mouth: 1 };
const DOWN: Pose = { rot: -1.45, lying: true, front: [10, -16], back: [-10, -16], eyes: 0 };
const KO: Pose = { ...DOWN, sy: .92, mouth: 1 };
const LIGHT_WIND: Pose = { rot: -.16, ox: -6, front: [20, 0], back: [-16, 0] };
const LIGHT_HIT: Pose = { rot: .38, ox: 24, front: [6, 0], back: [-30, -4], eyes: 0 };
const LIGHT_BACK: Pose = { rot: .1, ox: 8, front: [16, 0], back: [-20, 0] };
const KICK_WIND: Pose = { rot: -.1, ox: -6, front: [-14, -14], back: [-6, 0] };
const KICK_HIT: Pose = { rot: -.22, ox: -4, front: [62, -26], back: [-10, 0] };
const KICK_BACK: Pose = { rot: -.06, front: [22, -4], back: [-14, 0] };
const AIR = (p: Pose): Pose => ({ ...p, oy: (p.oy ?? 0) - 40 });
const AIR_KICK_HIT: Pose = { rot: .12, oy: -40, front: [56, -22], back: [-14, -6] };

function pose(label: string): Pose | null {
  switch (label) {
    case 'idle': return IDLE;
    case 'run0': return RUN[0];
    case 'run1': return RUN[1];
    case 'run2': return RUN[2];
    case 'run3': return RUN[3];
    case 'jump': return JUMP;
    case 'block': return BLOCK;
    case 'dodge': return DODGE;
    case 'hurt': return HURT;
    case 'down': return DOWN;
    case 'ko': return KO;
    case 'light-windup': return LIGHT_WIND;
    case 'light-active': return LIGHT_HIT;
    case 'light-recover': return LIGHT_BACK;
    case 'heavy-windup': return KICK_WIND;
    case 'heavy-active': return KICK_HIT;
    case 'heavy-recover': return KICK_BACK;
    case 'airLight-windup': return AIR(LIGHT_WIND);
    case 'airLight-active': return AIR(LIGHT_HIT);
    case 'airLight-recover': return JUMP;
    case 'airHeavy-windup': return AIR(KICK_WIND);
    case 'airHeavy-active': return AIR_KICK_HIT;
    case 'airHeavy-recover': return JUMP;
    default: return null;
  }
}

const SPECIAL: Pose[][] = [
  // U 最神速的脚脚
  [
    { rot: .22, sx: 1.04, sy: .92, ox: -4, front: [22, -8], back: [-20, 0] },
    { rot: .42, ox: 14, oy: -6, front: [46, -10], back: [-44, -4] },
    { rot: -.28, ox: -6, front: [40, 0], back: [-12, -6], mouth: 1 },
  ],
  // I 欧耶！
  [
    { rot: 0, sx: 1.16, sy: .8, front: [22, 0], back: [-22, 0], eyes: 0, cheeks: true },
    { rot: -.06, sx: .92, sy: 1.1, oy: -10, front: [12, -6], back: [-12, -6], mouth: 1 },
    { rot: -.1, front: [18, 0], back: [-18, 0], mouth: 1 },
  ],
  // O 薯片挑战
  [
    { rot: .05, oy: -4, front: [14, -2], back: [-16, -2], chip: true },
    { rot: .16, ox: 8, front: [20, 0], back: [-18, 0], mouth: 1 },
    { rot: 0, sx: 1.06, front: [18, 0], back: [-18, 0], cheeks: true, eyes: 0 },
  ],
  // L 坏人类！
  [
    { rot: 0, sx: 1.12, sy: 1.06, front: [22, 0], back: [-22, 0], eyes: 0, cheeks: true },
    { rot: -.24, front: [24, -18], back: [-18, 0], eyes: 0, mouth: 2, cheeks: true },
    { rot: .1, sy: .96, front: [18, 0], back: [-18, 0], eyes: 0, mouth: 1 },
  ],
];

function foot(x: number, y: number): string {
  return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(11 * SHEET_SCALE).toFixed(1)}" ry="${(7 * SHEET_SCALE).toFixed(1)}" fill="${FEET}" stroke="${OUTLINE}" stroke-width="2"/>`;
}
function ball(p: Pose): string {
  const sx = p.sx ?? 1, sy = p.sy ?? 1;
  const ry = R * sy, rx = R * sx;
  // Body centre above the foot line.
  // The ball sits on its feet: they tuck half under its bottom edge (drawn behind it), so only their toes show.
  const cy = -(FOOT_H * .55 + ry);
  const feet = [p.back, p.front].map(([dx, dy]) => foot(dx * SHEET_SCALE, -FOOT_H * .3 + dy * SHEET_SCALE)).join('');
  const eyes = p.eyes ?? 1, mouth = p.mouth ?? 0;
  // The face sits on the front-upper side of the ball (she faces right).
  const fx = rx * .42, fy = cy - ry * .18;
  const eye = eyes
    ? `<ellipse cx="${fx + 8}" cy="${fy - 6}" rx="5" ry="8" fill="${EYE}"/>`
    : `<path d="M${fx + 2} ${fy - 6} q6 5 12 0" stroke="${OUTLINE}" stroke-width="3" fill="none"/>`;
  const mouthSvg = mouth === 2
    ? `<ellipse cx="${fx + 14}" cy="${fy + 18}" rx="9" ry="11" fill="#8a2a3a"/>`
    : mouth === 1
      ? `<ellipse cx="${fx + 14}" cy="${fy + 16}" rx="6" ry="5" fill="#8a2a3a"/>`
      : `<path d="M${fx + 9} ${fy + 14} q5 4 10 0" stroke="${OUTLINE}" stroke-width="2.5" fill="none"/>`;
  const cheeks = p.cheeks ? `<ellipse cx="${fx + 2}" cy="${fy + 10}" rx="8" ry="5" fill="${CHEEK}"/>` : '';
  const chip = p.chip ? `<ellipse cx="${fx + 30}" cy="${fy + 16}" rx="15" ry="11" fill="${CHIP}" stroke="${OUTLINE}" stroke-width="2"/>` : '';
  const face = `<ellipse cx="${fx}" cy="${fy}" rx="${rx * .5}" ry="${ry * .46}" fill="${FACE}" stroke="${OUTLINE}" stroke-width="2"/>`
    + `<path d="M${fx - rx * .55} ${fy - ry * .1} Q${fx - rx * .2} ${fy - ry * .75} ${fx + rx * .45} ${fy - ry * .42} L${fx + rx * .2} ${fy - ry * .22} Q${fx - rx * .1} ${fy - ry * .4} ${fx - rx * .3} ${fy + ry * .25} Z" fill="${HAIR}" stroke="${OUTLINE}" stroke-width="2"/>`
    + eye + mouthSvg + cheeks + chip;
  const body = `<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BODY}" stroke="${OUTLINE}" stroke-width="3"/>`;
  const turn = `rotate(${(p.rot * 180 / Math.PI).toFixed(2)} 0 ${cy.toFixed(1)})`;
  // Standing, the feet stay planted while the ball pitches over them; lying, they turn with it and point up.
  return p.lying ? `<g transform="${turn}">${feet}${body}${face}</g>` : `${feet}<g transform="${turn}">${body}${face}</g>`;
}

function cell(label: string, p: Pose | null, col: number, row: number): string {
  let fig = '';
  if (p) {
    const x = CELL / 2 + (p.ox ?? 0);
    // Lying: the ball on its back, resting on the floor; its centre sits one radius up.
    const y = p.lying ? CELL - FOOT + FOOT_H * .2 : CELL - FOOT + (p.oy ?? 0);
    fig = `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">${ball(p)}</g>`;
  }
  const clip = `c${row}${col}`;
  const text = label ? `<text x="4" y="13" fill="${GRID}" font-size="10" font-family="monospace">${label}</text>` : '';
  return `<g transform="translate(${col * CELL},${row * CELL})"><clipPath id="${clip}"><rect width="${CELL}" height="${CELL}"/></clipPath><g clip-path="url(#${clip})"><rect width="${CELL}" height="${CELL}" fill="${BG}"/>${fig}</g><rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`;
}
function sheet(cols: number, rows: number, at: (c: number, r: number) => Pose | null, labelAt: (c: number, r: number) => string): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(cell(labelAt(c, r), at(c, r), c, r));
  const w = cols * CELL, h = rows * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}
/** Placeholder 天素球: a transparent-backed orange egg, so the drawn egg reads in the arena until egg.png lands. */
function eggSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="320" viewBox="0 0 256 320">`
    + `<defs><radialGradient id="g" cx=".42" cy=".35" r=".7"><stop offset="0" stop-color="#ffecaa"/><stop offset=".7" stop-color="#ffaa46" stop-opacity=".92"/><stop offset="1" stop-color="#e6782a"/></radialGradient></defs>`
    + `<path d="M128 14 C214 14 226 300 128 306 C30 300 42 14 128 14 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="5"/>`
    + `<ellipse cx="128" cy="196" rx="52" ry="42" fill="#ffe06e" opacity=".9"/>`
    + `<ellipse cx="92" cy="92" rx="16" ry="30" fill="#fff" opacity=".7" transform="rotate(-18 92 92)"/></svg>\n`;
}

const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'common.svg'), sheet(COMMON_COLS, COMMON_ROWS, (c, r) => pose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]));
  writeFileSync(join(out, 'special.svg'), sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]));
  writeFileSync(join(out, 'egg.svg'), eggSvg());
  console.log('wrote tensora svgs to ' + out);
} else {
  console.log('usage: tensora-sheet.ts --svg <dir>, then rasterize with sharp into public/sprites/tensora/');
}
