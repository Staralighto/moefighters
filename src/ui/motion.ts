/* 动效的唯一出口（docs/motion-and-loading.md）。
   - 「减少动态效果」只从这里读：reducedMotion()。开发工具（devProbe）可以强制打开，所有走这里的路径一起变。
   - 进页面、开弹窗只许快速渐入（FADE_IN_MS）：不放大缩小、不从卡片位置铺开、不做入场级联。关后台页是瞬间的（hub.ts closeHub），
     不渐出：渐出途中透明的页面会吃掉点击。fadeOut 只给加载条这类不挡操作的东西用。
     放大和级联很抢眼，每次进出都播一遍，看久了累。保留的动效只有操作反馈：打小票、领奖励、选人卡翻面、切歌、点不动时的抖动。
   - 状态切换不等动画事件：fadeOut 的 done 由定时器保证一定会到。页面不在渲染（切到后台、WebView 节流、浏览器面板隐藏）时
     动画的 finish 事件不派发，等它会把后台页卡在半开状态。 */

export const FADE_IN_MS = 140;
export const FADE_OUT_MS = 100;

let forced: boolean | null = null;

/** 每次现查（不缓存查询对象）：系统设置随时会变，测试环境也会晚装 matchMedia。 */
export function reducedMotion(): boolean {
  if (forced != null) return forced;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 开发工具用：强制打开 / 关闭「减少动态效果」，null 回到跟随系统。只影响走 reducedMotion() 的 JS 路径。 */
export function forceReducedMotion(v: boolean | null): void { forced = v; }

/** 渐入。不改任何状态，播不播都一样能用。 */
export function fadeIn(el: Element, ms = FADE_IN_MS): void {
  if (reducedMotion() || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.2, .8, .2, 1)' });
}

/** 渐出，结束后调 done（一定会调，且只调一次）。返回取消函数：取消后 done 不再调用。 */
export function fadeOut(el: Element, done: () => void, ms = FADE_OUT_MS): () => void {
  let over = false;
  let anim: Animation | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { over = true; clearTimeout(timer); anim?.cancel(); };
  const finish = () => { if (over) return; stop(); done(); };
  if (reducedMotion() || typeof (el as HTMLElement).animate !== 'function') { finish(); return () => {}; }
  anim = (el as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' });
  timer = setTimeout(finish, ms + 40);
  return stop;
}
