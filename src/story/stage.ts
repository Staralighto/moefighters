/* 舞台走位规则（纯逻辑，不碰画布）：站位坐标、自动朝向、让位、人多时铺开、走位类指令的落点。
   游戏里的演出（theatre.ts）和排练脚本（npm run story -- rehearse N）共用这一份，排练的结果才和游戏一致。 */

import type { Pose } from './parse.ts';

export const W = 1280;
export const SLOT_X: Record<string, number> = { 左: 250, 中左: 470, 中: 640, 中右: 810, 右: 1030 };

/** 走位只关心这些字段；theatre 的 Actor 在此基础上加动画状态。 */
export interface Body {
  name: string;
  x: number;
  to: number;
  face: number;
  pose: Pose;
  leaving: boolean;
  revealed: boolean;
  /** 剧本写了「转身」：自动朝向不再动她，直到她下一次移动。 */
  lock: boolean;
  flip: { to: number | 'back' } | null;
}

export const faceIn = (x: number) => x < W / 2 ? 1 : -1;

/* ---- 朝向：剧本只写站位，朝谁看由这里推断 ----
   原则：身前至少有一个人就不动（中间的人夹在两人之间时随说话对象转）；身前一个人都没有（背对全场）就转向最近的人；
   说话时如果上一位说话的人在身后，转过去对着她（theatre 的 say）。剧本写了「转身」的人锁住朝向，直到她再移动。
   下面的 cast 都是台上的人（不含正在退场的）。 */
export const ahead = (a: Body, o: Body) => (o.x - a.x) * a.face > 0;

export function nearest<T extends Body>(cast: T[], a: T): T | undefined {
  let best: T | undefined;
  for (const o of cast) if (o !== a && Math.abs(o.x - a.x) > 1 && (!best || Math.abs(o.x - a.x) < Math.abs(best.x - a.x))) best = o;
  return best;
}

/** 背对全场的人转向最近的人。 */
export function reaim<T extends Body>(cast: T[], turn: (a: T, dir: number) => void): void {
  for (const a of cast) {
    if (a.flip || Math.abs(a.x - a.to) > 1) continue;
    const others = cast.filter(o => o !== a && Math.abs(o.x - a.x) > 1);
    if (!others.length || others.some(o => ahead(a, o))) continue;
    const n = nearest(cast, a);
    if (n) turn(a, Math.sign(n.x - a.x));
  }
}

/** 走到 / 靠近的落点离别人太近（会叠在一起）：先到的人往外让一步。 */
export function makeRoom<T extends Body>(cast: T[], a: T): void {
  for (const o of cast) {
    if (o === a || Math.abs(o.to - a.to) >= 130) continue;
    // 往落点的哪一边让：看她在落点的哪一侧（挡在半路上的人往外让，不会被推到落点另一边去）。
    const side = Math.sign(o.to - a.to) || Math.sign(o.to - a.x) || (o.to < W / 2 ? -1 : 1);
    const to = a.to + side * 150;
    o.to = to < 120 || to > W - 120 ? a.to - side * 150 : to;
    // 让位是侧身挪一步，朝向不变（不然挪完就背对着原来面对的人）。
  }
  spread(cast);
}

/** 同屏最多 6 人，站位只有 5 个：人一多（或者让位后还挤在一起），就按左右顺序均匀铺开。
 *  5 人以内、彼此不挤时不动，保持剧本写的站位。snap：开场直接站好，不走过去。 */
export const SPREAD_GAP = 195, SPREAD_MIN = 130;
export function spread<T extends Body>(cast: T[], snap = false): void {
  const list = [...cast].sort((p, q) => p.to - q.to || p.x - q.x);
  const tight = list.some((o, i) => i > 0 && o.to - list[i - 1].to < SPREAD_MIN);
  if (list.length <= 5 && !tight) return;
  const gap = Math.min(SPREAD_GAP, (W - 300) / Math.max(1, list.length - 1));
  const left = W / 2 - gap * (list.length - 1) / 2;
  list.forEach((o, i) => {
    const to = left + gap * i;
    if (Math.abs(to - o.to) < .5) return;
    o.to = to;
    // 铺开是给别人让位置的小挪步：保持原来的朝向侧身挪过去（原来会转向走的方向，挪完就背对着原来说话的人）。
    if (snap) o.x = to;
  });
}

/** 开场：站好、铺开、面向最近的人（同在左半边的两人不能都朝右，后面那个只能看见前面那个的后脑勺）。 */
export function openStage<T extends Body>(cast: T[]): void {
  spread(cast, true);
  for (const a of cast) { const n = nearest(cast, a); if (n) a.face = Math.sign(n.x - a.x); }
}

/** 走入：从站位那一侧的台外走到站位。a 已经在 cast 里。 */
export function enter<T extends Body>(cast: T[], a: T, slot: string | undefined): void {
  const x = SLOT_X[slot ?? ''] ?? W / 2;
  a.x = x < W / 2 ? -180 : W + 180;
  a.to = x;
  a.face = faceIn(x);
  makeRoom(cast, a);
}

/** 转身要演的翻面（from → to；t0 < 0 表示稍等一拍再翻）。 */
export interface Turn { from: number; to: number; t0: number }

/** 走位类指令（走到 / 退场 / 转身 / 背对 / 消散 / 靠近 / 后退）的落点、朝向、锁定。其他指令不动位置，返回 null。
 *  afterEnter：上一条就是她的「走入」——剧本的意思是她本来就背对大家站在那里，然后回过身来。
 *  instant：这一段还没人开口（开场）——「背对」直接就是背着站好的，不演转身。 */
export function block<T extends Body>(cast: T[], a: T, verb: string, arg: string | undefined, o: { target?: T; afterEnter?: boolean; instant?: boolean } = {}): Turn | null {
  if (verb === '走到' || verb === '靠近' || verb === '后退') a.lock = false;
  switch (verb) {
    case '走到': a.to = SLOT_X[arg ?? ''] ?? a.to; a.face = Math.sign(a.to - a.x) || a.face; makeRoom(cast, a); break;
    // 「退场 左 / 右」指定从哪一侧下台；不写就从近的一侧。
    case '退场': a.leaving = true; a.to = arg === '左' ? -200 : arg === '右' ? W + 200 : a.x < W / 2 ? -200 : W + 200; a.face = Math.sign(a.to - a.x) || a.face; break;
    // 背对 [某人]：背向某人（不写就背向最近的人），锁住朝向，直到她下一次移动或「转身」。
    case '背对': {
      const b = o.target ?? nearest(cast.filter(x => !x.leaving), a);
      const away = b ? -Math.sign(b.x - a.x) || -a.face : -faceIn(a.x);
      a.lock = true;
      if (a.face === away) return null;
      if (o.instant) { a.face = away; return null; }
      return { from: a.face, to: away, t0: 0 };
    }
    // 面向 某人：转过去对着她（不锁朝向，之后照常随说话对象转）。
    case '面向': {
      const b = o.target;
      if (!b) return null;
      const to = Math.sign(b.x - a.x) || a.face;
      a.lock = false;
      if (a.face === to) return null;
      if (o.instant) { a.face = to; return null; }
      return { from: a.face, to, t0: 0 };
    }
    // 消散：原地化作光点散去（之后算下台）。
    case '消散': a.leaving = true; a.to = a.x; break;
    case '转身': {
      if (o.afterEnter) {
        a.x = a.to;
        const n = nearest(cast, a);
        const toward = n ? Math.sign(n.x - a.x) : faceIn(a.x);
        a.face = -toward;
        return { from: a.face, to: toward, t0: -.35 };
      }
      a.lock = true;
      return { from: a.face, to: -a.face, t0: 0 };
    }
    case '靠近': {
      const b = o.target;
      if (b) { const side = Math.sign(a.x - b.x) || 1; a.to = Math.max(120, Math.min(W - 120, b.x + side * 150)); a.face = -side; makeRoom(cast, a); }
      break;
    }
    case '后退': a.to = Math.max(120, Math.min(W - 120, a.x - a.face * 100)); break;
  }
  return null;
}
