/* 懒加载的代码块（renderer、finale）挂掉时的兜底。
   典型场景：发版后，玩家手里的 index.html 还是旧的（文档是 stale-while-revalidate），它引用的旧哈希
   chunk 在服务器上已经没了。第一次开打就会 import 失败，按钮按下去什么都不发生。
   先原样重试一次（瞬断）；还不行就整页刷新一次——后台重新验证已经把新的 index.html 拿到缓存里了。
   60 秒内只刷新一次，避免真坏掉时无限刷新。 */

const KEY = 'mf.chunk-reload';

export function reloadOnce(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY)) || 0;
    if (Date.now() - at < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}

export function chunk<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(() => load()).catch(err => {
    reloadOnce();
    throw err;
  });
}

// Vite 预加载某个 chunk 的依赖（含 CSS）失败时发这个事件；不处理的话它会把错误抛给 import()。
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', e => {
    if (reloadOnce()) e.preventDefault();
  });
}
