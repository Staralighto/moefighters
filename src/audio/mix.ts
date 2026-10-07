/** 音乐滑条的电平。音效包络不走这里：战斗音效仍是 0.06 收到 0.0001 的敲击。 */

const DB_PER_20 = Math.LN10 / 20;

/** 100% 对应的振幅，等于旧线性滑条拉满时的 `1 * 0.63`，老存档能一一对上。 */
export const MUSIC_CAP = 0.63;

/** 滑条从满到静音的行程。页面上 `step="5"`，一格是 5% = 2 dB。 */
export const FADER_DB = 40;

function dbToAmp(db: number): number {
  return Math.exp(db * DB_PER_20);
}

/** 滑条 0–1 → 音乐增益。0 是静音；其余每 0.05 正好 2 dB，1 是 MUSIC_CAP。 */
export function musicGain(slider: number): number {
  if (!(slider > 0)) return 0;
  const t = Math.min(1, slider);
  return MUSIC_CAP * dbToAmp((t - 1) * FADER_DB);
}

/** 旧存档把滑条位置当成线性振幅（增益 = t * MUSIC_CAP）。折到对数滑条上，振幅保持不变，
 *  并落到 5% 一格上。差不超过 1 dB。 */
export function migrateLinearSlider(t: number): number {
  if (!(t > 0)) return 0;
  const clamped = Math.min(1, t);
  const exact = 1 + (20 * Math.log10(clamped)) / FADER_DB;
  return Math.min(1, Math.max(0, Math.round(exact * 20) / 20));
}
