import type { Fighter } from '../game/fighter.ts';
import type { HoverSpec } from '../data/types.ts';
import { stateFor } from '../game/animState.ts';

/* 悬浮 (view.hover): a floating character, like Orochi's stance. Purely a picture: the fighter's x / y, hitbox,
   grabs and ground-only moves are untouched, so she is hit exactly as if she stood on the floor.
   - the sprite is drawn `lift` px up (spriteView), breathing with a slow bob that stops while she swings;
   - hurt sinks her a little, down / ko drop her onto the floor (fast) — the fall is where the divinity breaks —
     and she rises back slowly once she is up; her L lifts her `ultRise` higher;
   - the first frame she is seen she starts high and settles down: the fight opens on her descent (and every
     later round too, since a won round sends her up out of the frame and the next one brings her back down);
   - a KO win lifts her slowly, then faster, up out of the frame;
   - it also keeps what her look needs: her meter fullness eased (满气威压) and a short trail of where she was (滑行残影).
   The renderer steps this once a frame (stepHover) from the game clock; everyone else reads the getters. */

export const HOVER_PERIOD = 2.4;
/** How far above her rest height she starts, so the round opens on her settling down. */
export const HOVER_DESCENT = 70;
/** A KO win: how long she lingers before rising, how long the rise takes, and how high it goes. */
export const HOVER_ASCEND = { wait: .35, time: 1.3, height: 720 } as const;
const TAU = Math.PI * 2;
const TRAIL = .3;

interface State {
  v: number; amp: number; age: number;
  /** 0 … 1, eased: her meter is full. */
  full: number;
  /** 0 … 1, eased: she is gliding. */
  glide: number;
  /** Game clock of a KO win, while it lasts. */
  wonAt?: number;
  trail: { x: number; age: number }[];
}
const states = new WeakMap<Fighter, State>();

export function hoverSpec(f: Fighter): HoverSpec | undefined {
  const v = f.data?.view;
  return v && v.kind === 'sprite' ? v.hover : undefined;
}

function target(f: Fighter, h: HoverSpec): { lift: number; amp: number } {
  const s = stateFor(f);
  if (s === 'ko' || s === 'down') return { lift: 0, amp: 0 };
  if (s === 'hurt') return { lift: h.lift * .55, amp: 0 };
  if (f.attack) return { lift: h.lift + (f.attack.index === 5 ? h.ultRise ?? 0 : 0), amp: 0 };
  return { lift: h.lift, amp: 1 };
}

const ease = (k: number, dt: number) => 1 - Math.exp(-k * dt);

/** Advance her float to the game clock `age`. `won`: the round just ended on a KO in her favour.
 *  Safe to call more than once a frame. */
export function stepHover(f: Fighter, age: number, won = false): void {
  const h = hoverSpec(f);
  if (!h) return;
  let st = states.get(f);
  if (!st) {
    st = { v: h.lift + HOVER_DESCENT, amp: 0, age, full: 0, glide: 0, trail: [{ x: f.x, age }] };
    states.set(f, st);
    return;
  }
  // 时停级定身: she hangs exactly where the freeze caught her.
  if (f.root > 0 && f.rootLevel === 'freeze') { st.age = age; return; }
  // 时钟倒回（新一局重置了 game.age）：旧的残影位置作废，不然开局会从上一局的位置拖出残影。
  if (age < st.age) st.trail = [{ x: f.x, age }];
  const dt = Math.min(.1, Math.max(0, age - st.age));
  st.age = age;
  if (dt <= 0) return;
  const t = target(f, h);
  // Falling to the floor is fast, the settle and the rise are slow.
  const k = t.lift < st.v ? (t.lift === 0 ? 16 : 3) : 4;
  st.v += (t.lift - st.v) * ease(k, dt);
  st.amp += (t.amp - st.amp) * ease(6, dt);
  if (won) {
    st.wonAt ??= age;
    const u = Math.min(1, Math.max(0, (age - st.wonAt - HOVER_ASCEND.wait) / HOVER_ASCEND.time));
    st.v = Math.max(st.v, h.lift + HOVER_ASCEND.height * u * u);
    st.amp = 0;
  } else st.wonAt = undefined;
  st.full += ((f.energy >= f.energyMax - .01 && f.hp > 0 ? 1 : 0) - st.full) * ease(4, dt);
  st.glide += ((stateFor(f) === 'run' ? 1 : 0) - st.glide) * ease(10, dt);
  st.trail.push({ x: f.x, age });
  while (st.trail.length > 2 && st.trail[1].age < age - TRAIL) st.trail.shift();
}

/** Pixels to draw her above the floor right now (0 for everyone who does not float). */
export function hoverLift(f: Fighter): number {
  const h = hoverSpec(f);
  if (!h) return 0;
  const st = states.get(f);
  // Never stepped (select screen, previews): resting height with the bob on the wall clock.
  const t = st ? st.age : typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
  const v = st ? st.v : h.lift, amp = st ? st.amp : 1;
  return Math.max(0, v + Math.sin(t * TAU / HOVER_PERIOD + (f.id ?? 0)) * h.bob * amp);
}

/** 0 on the floor … 1 at rest height or above: how strongly her hover look shows. */
export function hoverLevel(f: Fighter): number {
  const h = hoverSpec(f);
  if (!h || h.lift <= 0) return 0;
  const st = states.get(f);
  return Math.min(1, Math.max(0, (st ? st.v : h.lift) / h.lift));
}

/** 1 at the top of the opening descent … 0 once she has settled (or before she was ever stepped). */
export function hoverDescent(f: Fighter): number {
  const h = hoverSpec(f), st = states.get(f);
  if (!h || !st || st.wonAt !== undefined) return 0;
  return Math.min(1, Math.max(0, (st.v - h.lift) / HOVER_DESCENT));
}

/** 满气威压: 0 … 1, eased, while her meter is full. */
export function hoverFull(f: Fighter): number {
  return states.get(f)?.full ?? 0;
}

/** 滑行残影: 0 … 1, eased, while she glides; and where she was `ago` seconds back (the oldest kept if longer). */
export function hoverGlide(f: Fighter): number {
  return states.get(f)?.glide ?? 0;
}
export function hoverTrailX(f: Fighter, ago: number): number {
  const st = states.get(f);
  if (!st) return f.x;
  const at = st.age - ago;
  for (let i = st.trail.length - 1; i >= 0; i--) if (st.trail[i].age <= at) return st.trail[i].x;
  return st.trail[0].x;
}
