/* 剧本：解析在 parse.ts（node 脚本也用），这里只加 Vite 的按章懒加载。 */

import { parseScript, type Script } from './parse.ts';
import { withLoadTimeout } from '../assets/loader.ts';

export * from './parse.ts';

/* 定稿按章懒加载：进剧情页才把这一章的文本打进来。文件名就是关卡编号。 */
const FILES = import.meta.glob<string>('../../story/ch*/[0-9]*-[0-9]*.md', { query: '?raw', import: 'default' });

export async function loadScript(id: string): Promise<Script | null> {
  const ch = id.split('-')[0];
  const load = FILES[`../../story/ch${ch}/${id}.md`];
  if (!load) return null;
  return parseScript(await withLoadTimeout(load()));
}
