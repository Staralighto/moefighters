/** 主页样式（商店里卖的配色）：只换品牌色和主操作色，其余 token 不动。
 *  亮色版本和暗色美术面由 palette.ts 的 skinCss 按同一套规则推导，这里只写暗色。
 *  primary 上是白字，要到 4.5:1（npm run check 会验）。背景几何的变体写在 style.css 的 [data-skin] 段。
 *  darkOnly：整套主页美术按暗色画，装上后亮色设置不生效（skinCss 把亮色块整套换回暗色）。 */
export interface Skin { id: string; brand: string; primary: string; darkOnly?: boolean }

export const SKINS: readonly Skin[] = [
  { id: 'sapphire', brand: '#4d8dff', primary: '#2f62d8' },
  { id: 'violet', brand: '#a46bff', primary: '#7c45e0' },
  { id: 'mint', brand: '#22b98f', primary: '#0f7f62' },
  { id: 'sunset', brand: '#ff7a3d', primary: '#c84f12' },
  { id: 'winter', brand: '#ff5468', primary: '#c8102e', darkOnly: true },
];
