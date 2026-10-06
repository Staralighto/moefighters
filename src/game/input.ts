import type { FightGame } from './game.ts';
import { atkIcon } from '../ui/touchIcons.ts';

/* Keyboard → game. Also pauses when the tab loses focus so nobody gets hit while alt-tabbed. */
export class KeyboardInput {
  private readonly getGame: () => FightGame | null;
  private readonly down = (e: KeyboardEvent) => {
    const g = this.getGame();
    if (!g || (e.target as HTMLElement | null)?.closest?.('dialog, [data-prop-tune]')) return;
    if (!g.isControl(e.code)) return;
    e.preventDefault();
    if (!e.repeat) g.keyDown(e.code);
  };
  private readonly up = (e: KeyboardEvent) => this.getGame()?.keyUp(e.code);
  private readonly blur = () => {
    const g = this.getGame();
    if (!g) return;
    g.keys.clear();
    if (!g.paused && g.phase !== 'finished') g.togglePause(true);
  };
  private readonly visibility = () => { if (document.hidden) this.blur(); };

  constructor(getGame: () => FightGame | null) { this.getGame = getGame; }

  attach(): void {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
  }

  detach(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}

/** Hold the attack button this long and it becomes a heavy. Shorter releases stay light. */
const HEAVY_HOLD = 200;
/** The knob stops here, so the finger can travel past 1.0 and still show "fully out". */
const KNOB_TRAVEL = .8;
/** Jump only fires past this share of the real ring radius — the strict outer edge. */
const JUMP_OUT = .72;
/** Dropping back inside this share re-arms the jump, so holding at the edge cannot chain jumps. */
const JUMP_IN = .6;
/** And the push has to be mostly upward, not a sideways drag past the edge. */
const JUMP_UP = .8;
/** Nothing here may swallow a blank-screen press: the keys, the stick, the HUD and every overlay. */
const NOT_BLANK = '.hud, .tp-actions, .tp-stick, [data-pad], .game-banner, .end-overlay, dialog';

/** Where the stick sits, as a share of the ring radius, and whether that spot means "jump". */
export interface StickPush { out: number; up: boolean }

/**
 * Jump fires only at the strict outer edge (JUMP_OUT) with a mostly upward push (JUMP_UP), and only
 * re-arms after the stick drops back inside JUMP_IN. Holding at the edge therefore jumps once, and a
 * long sideways drag that clips the edge does not jump at all.
 */
export function isTouchJump(push: StickPush, wasOut: boolean): boolean {
  if (push.out > JUMP_OUT && push.up) return true;
  return push.out < JUMP_IN ? false : wasOut;
}

/**
 * Blank presses at or below this Y do not dodge or block. The line sits just under the attack
 * button's top (`attackTop` plus a small share of `attackSize`), so the skill row is inside
 * the band and the blank area above the attack button still dodges and blocks.
 */
export function thumbBandTop(attackTop: number, attackSize: number): number {
  return attackTop + Math.max(0, attackSize) * .08;
}

/**
 * Pair a stick pointer with the touch that started it. pointerId and the touch identifier are not
 * the same number on every browser, so match the contact. The window is one event turn, not a
 * second human tap — a leftover touch must not claim the next press.
 */
export function matchStickTouch(
  x: number, y: number,
  touch: { id: number; x: number; y: number; t: number } | null,
  now: number,
): number | null {
  if (!touch || now - touch.t > 40) return null;
  return Math.hypot(touch.x - x, touch.y - y) <= 24 ? touch.id : null;
}

/**
 * What a touchend / touchcancel should drop. `all` when the screen is clear — a pointerup the
 * browser never delivered must not leave the stick latched. `stick` when that finger lifted and
 * another is still down. `none` when the ended touch is someone else's.
 */
export function touchRelease(stickTouch: number | null, ended: number[], touchesLeft: number): 'all' | 'stick' | 'none' {
  if (touchesLeft === 0) return 'all';
  if (stickTouch !== null && ended.includes(stickTouch)) return 'stick';
  return 'none';
}

/**
 * The stick's finger is gone only when a touch list — the full set, which a pointer event does not
 * carry — both has someone in it and does not include that finger. An empty list is not evidence:
 * the last-finger case is `touchRelease`. A second finger therefore cannot retire the first.
 */
export function stickFingerGone(stickTouch: number | null, activeIds: number[]): boolean {
  return stickTouch !== null && activeIds.length > 0 && !activeIds.includes(stickTouch);
}

/* On-screen pad → the same keyDown / keyUp the keyboard uses. Buttons carry data-key; the stick is left / right plus jump at the edge. */
export class TouchInput {
  private readonly getGame: () => FightGame | null;
  private readonly pad: HTMLElement;
  private readonly arena: HTMLElement | null;
  private readonly held = new Map<number, HTMLElement>();
  private stickId: number | null = null;
  private stickTouch: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private aimX = 0;
  private aimY = 0;
  /** Last TouchEvent `touches` snapshot. Pointer events are not a stand-in for this list. */
  private liveTouches: number[] = [];
  private pendingTouch: { id: number; x: number; y: number; t: number } | null = null;
  private stickJump = false;
  private stickLeft = false;
  private stickRight = false;
  /** Cached at grab time: the ring center never moves during a drag, and pointermove can fire
   *  faster than the display — re-querying the DOM on every event was pure waste. */
  private stickBox: DOMRect | null = null;
  private stickKnob: HTMLElement | null = null;
  private touchMoveOn = false;
  /** Non-zero while a follow frame is queued. Round reset and pause wipe `keys` without a pointermove. */
  private follow = 0;
  private reflowQueued = false;
  private reflowAgain = false;
  private guardId: number | null = null;
  private guardEl: Element | null = null;
  private readonly atkTimer = new Map<number, number>();
  private readonly atkHeavy = new Set<number>();
  private readonly down = (e: PointerEvent) => {
    if (document.body.classList.contains('pad-tune')) return;
    const g = this.getGame();
    if (!g) return;
    const el = e.target as HTMLElement;
    const b = el.closest<HTMLElement>('[data-key], [data-atk], [data-guard]');
    if (b && this.pad.contains(b)) {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch { /* window still hears the lift */ }
      b.classList.add('held');
      this.held.set(e.pointerId, b);
      if (b.hasAttribute('data-atk')) {
        const id = e.pointerId;
        this.atkTimer.set(id, window.setTimeout(() => {
          this.atkTimer.delete(id);
          if (!this.held.has(id)) return;
          this.atkHeavy.add(id);
          const mark = b.querySelector('img');
          if (mark) mark.src = atkIcon(true);
          this.getGame()?.keyDown('KeyK');
        }, HEAVY_HOLD));
      } else if (b.hasAttribute('data-guard')) g.keyDown('KeyS');
      else g.keyDown(b.dataset.key!);
      return;
    }
    const stick = el.closest<HTMLElement>('.tp-stick');
    if (!stick || !this.pad.contains(stick)) return;
    if (this.stickId === e.pointerId) return;
    // A second finger on the base must not yank the stick off the thumb that is still down.
    // Take over only after a touch list has already shown that finger is gone. touch-action:none
    // covers scrolling here — preventDefault on pointerdown is what breaks the other thumb.
    if (this.stickId !== null && !stickFingerGone(this.stickTouch, this.liveTouches)) return;
    if (this.stickId !== null) this.releaseStick();
    this.beginStick(stick, e.pointerId, e.clientX, e.clientY);
  };
  private readonly move = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return;
    if (document.body.classList.contains('pad-tune')) { this.releaseStick(); return; }
    // WebKit reports buttons as 0 for a live touch, so this only catches a mouse release
    // that arrived as a move and never as a pointerup.
    if (e.pointerType !== 'touch' && e.buttons === 0) { this.releaseStick(); return; }
    if (e.cancelable) e.preventDefault();
    this.placeStick(e.clientX, e.clientY);
  };
  private readonly up = (e: PointerEvent) => {
    const b = this.held.get(e.pointerId);
    if (b) this.releaseButton(e.pointerId, b, e.type !== 'pointercancel');
    if (e.pointerId === this.stickId) this.releaseStick();
    // A cancel is the browser taking the gesture, not a deliberate lift, so it must not dodge.
    if (e.pointerId === this.guardId) this.endGuard(e.type !== 'pointercancel');
  };
  /** Blank screen: a tap shorter than the engine's DODGE_TAP becomes a back-dodge, a longer hold becomes a block. */
  private readonly guardDown = (e: PointerEvent) => {
    if (document.body.classList.contains('pad-tune') || this.guardId !== null) return;
    const el = e.target as HTMLElement;
    if (el.closest(NOT_BLANK)) return;
    const band = this.thumbBandTop();
    if (band !== null && e.clientY >= band) {
      e.preventDefault();
      return;
    }
    const g = this.getGame();
    if (!g) return;
    e.preventDefault();
    this.guardId = e.pointerId;
    this.guardEl = el;
    try { el.setPointerCapture(e.pointerId); } catch { /* window still hears the lift */ }
    g.keyDown('KeyS');
  };
  private readonly noMenu = (e: Event) => {
    const t = e.target;
    // A long-press callout cancels the gesture. The stick and the buttons never want one;
    // a blank-screen block doesn't either. HUD text stays selectable.
    if (t instanceof Element && t.closest('.tp-stick, .tp-actions')) e.preventDefault();
    else if (this.guardId !== null) e.preventDefault();
  };

  constructor(getGame: () => FightGame | null, pad: HTMLElement) {
    this.getGame = getGame;
    this.pad = pad;
    this.arena = document.getElementById('arena');
  }

  attach(): void {
    this.pad.addEventListener('pointerdown', this.down);
    const blank = this.arena ?? this.pad;
    blank.addEventListener('pointerdown', this.guardDown);
    blank.addEventListener('contextmenu', this.noMenu);
    blank.addEventListener('dragstart', this.noMenu);
    // The pad is pointer-events:none outside the stick, and a thumb at the rim leaves that box.
    // Pointer capture is best-effort: it drops when the hit node moves, and some phones never
    // deliver pointerup/pointercancel for a gesture the browser stole. Window (capture phase,
    // so a later stopPropagation cannot eat it) plus touchend/touchcancel plus leaving the page
    // are the paths that still clear a latched stick. A new press takes it back only after the
    // touch list shows the old finger is gone, so the other thumb cannot steal it.
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('pointerup', this.up, true);
    window.addEventListener('pointercancel', this.up, true);
    window.addEventListener('touchstart', this.noteTouch, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
    window.addEventListener('blur', this.onDrop);
    window.addEventListener('pagehide', this.onDrop);
    window.addEventListener('orientationchange', this.onDrop);
    document.addEventListener('visibilitychange', this.onHide);
    document.addEventListener('freeze', this.onDrop);
    // The ring is anchored to the arena, and that box is rewritten when the visual viewport
    // changes. A cached center then throws the knob to the rim under a finger that has not moved.
    // Two frames: the battle layout pass occupies the first.
    window.addEventListener('resize', this.scheduleReflow);
    window.visualViewport?.addEventListener('resize', this.scheduleReflow);
    window.visualViewport?.addEventListener('scroll', this.scheduleReflow);
  }

  /** Y of the thumb band, in viewport coordinates. Null when the attack key cannot be measured. */
  private thumbBandTop(): number | null {
    const atk = this.pad.querySelector<HTMLElement>('.tp-actions .atk');
    if (!atk) return null;
    const r = atk.getBoundingClientRect();
    if (r.height < 2) return null;
    return thumbBandTop(r.top, r.height);
  }

  private stick(): HTMLElement | null { return this.pad.querySelector('.tp-stick'); }

  /** Short release queues a light. A hold past HEAVY_HOLD already queued a heavy and just lets go. */
  private releaseAtk(id: number, b: HTMLElement, fireLight: boolean): void {
    const timer = this.atkTimer.get(id);
    if (timer) window.clearTimeout(timer);
    this.atkTimer.delete(id);
    const heavy = this.atkHeavy.delete(id);
    const mark = b.querySelector('img');
    if (mark) mark.src = atkIcon(false);
    const g = this.getGame();
    if (!g) return;
    if (heavy) this.upKey('KeyK');
    else if (fireLight) { g.keyDown('KeyJ'); g.keyUp('KeyJ'); }
  }

  /** Skip keyUp when a blur already cleared the set — keyUp would re-arm a block or a dodge after pause. */
  private upKey(code: string, dodge = true): void {
    const g = this.getGame();
    if (!g?.keys.has(code)) return;
    g.keyUp(code, dodge);
  }

  private readonly noteTouch = (e: TouchEvent) => {
    this.liveTouches = [...e.touches].map(t => t.identifier);
    if (stickFingerGone(this.stickTouch, this.liveTouches)) this.releaseStick();
    for (const t of e.changedTouches) {
      this.pendingTouch = { id: t.identifier, x: t.clientX, y: t.clientY, t: performance.now() };
      if (this.stickId === null || this.stickTouch !== null) continue;
      const id = matchStickTouch(this.stickX, this.stickY, this.pendingTouch, performance.now());
      if (id === null) continue;
      this.stickTouch = id;
      this.pendingTouch = null;
    }
  };
  private readonly onTouchMove = (e: TouchEvent) => {
    if (this.stickTouch === null) return;
    for (const t of e.touches) {
      if (t.identifier !== this.stickTouch) continue;
      if (e.cancelable) e.preventDefault();
      this.placeStick(t.clientX, t.clientY);
      return;
    }
  };
  private readonly onTouchEnd = (e: TouchEvent) => {
    const ended = [...e.changedTouches].map(t => t.identifier);
    if (this.pendingTouch && ended.includes(this.pendingTouch.id)) this.pendingTouch = null;
    this.liveTouches = [...e.touches].map(t => t.identifier);
    const lift = e.type !== 'touchcancel';
    const kind = touchRelease(this.stickTouch, ended, e.touches.length);
    if (kind === 'all') this.releaseAll(lift, lift);
    else if (kind === 'stick' || stickFingerGone(this.stickTouch, this.liveTouches)) this.releaseStick();
  };
  private readonly onDrop = () => { this.releaseAll(false, false); };
  private readonly onHide = () => { if (document.hidden) this.onDrop(); };
  private readonly scheduleReflow = () => {
    if (this.reflowQueued) { this.reflowAgain = true; return; }
    this.reflowQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.reflowQueued = false;
      const again = this.reflowAgain;
      this.reflowAgain = false;
      if (this.stickId !== null) {
        const ring = this.pad.querySelector<HTMLElement>('.tp-ring');
        this.stickBox = ring ? ring.getBoundingClientRect() : null;
        this.placeStick(this.aimX, this.aimY);
      }
      if (again) this.scheduleReflow();
    }));
  };

  private beginStick(stick: HTMLElement, pointerId: number, x: number, y: number): void {
    try { stick.setPointerCapture(pointerId); } catch { /* window still hears the lift */ }
    this.stickId = pointerId;
    this.stickX = x;
    this.stickY = y;
    const paired = matchStickTouch(x, y, this.pendingTouch, performance.now());
    this.stickTouch = paired;
    if (paired !== null) this.pendingTouch = null;
    this.stickKnob = this.pad.querySelector<HTMLElement>('.tp-knob-move');
    const ring = this.pad.querySelector<HTMLElement>('.tp-ring');
    this.stickBox = ring ? ring.getBoundingClientRect() : null;
    this.armTouchMove();
    this.armFollow();
    this.placeStick(x, y);
  }

  private armTouchMove(): void {
    if (this.touchMoveOn) return;
    this.touchMoveOn = true;
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }
  private disarmTouchMove(): void {
    if (!this.touchMoveOn) return;
    this.touchMoveOn = false;
    window.removeEventListener('touchmove', this.onTouchMove);
  }

  /** ponytail: one frame loop for the life of the grab. A missed lift keeps the last direction
   *  until touchend, blur, or the next press clears stickId — those are the upgrade if this walks on. */
  private armFollow(): void {
    if (this.follow) return;
    const tick = () => {
      if (this.stickId === null) { this.follow = 0; return; }
      this.holdKeys();
      this.follow = requestAnimationFrame(tick);
    };
    this.follow = requestAnimationFrame(tick);
  }
  private disarmFollow(): void {
    if (!this.follow) return;
    cancelAnimationFrame(this.follow);
    this.follow = 0;
  }
  private holdKeys(): void {
    const g = this.getGame();
    if (!g || g.paused) return;
    if (this.stickLeft && !g.keys.has('KeyA')) g.keyDown('KeyA');
    if (this.stickRight && !g.keys.has('KeyD')) g.keyDown('KeyD');
    if (this.stickJump && !g.keys.has('Space')) g.keyDown('Space');
  }

  /** A tap on the guard button stays a block. Blank-screen taps are still the back-dodge. */
  private releaseButton(id: number, b: HTMLElement, light: boolean): void {
    this.held.delete(id);
    b.classList.remove('held');
    try { if (b.hasPointerCapture(id)) b.releasePointerCapture(id); } catch { /* already gone */ }
    if (b.hasAttribute('data-atk')) this.releaseAtk(id, b, light);
    else if (b.hasAttribute('data-guard')) this.upKey('KeyS', false);
    else this.upKey(b.dataset.key!);
  }

  private endGuard(dodge: boolean): void {
    const id = this.guardId;
    const el = this.guardEl;
    this.guardId = null;
    this.guardEl = null;
    if (id !== null && el) {
      try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* already gone */ }
    }
    this.upKey('KeyS', dodge);
  }

  /** `light` fires a short attack that never got its pointerup. `dodge` lets a blank tap still back-step.
   *  A blur, a hidden page, or a cancelled gesture passes false for both — those are not a finger lift. */
  private releaseAll(light: boolean, dodge: boolean): void {
    this.releaseStick();
    for (const [id, b] of [...this.held]) this.releaseButton(id, b, light);
    if (this.guardId !== null) this.endGuard(dodge);
  }

  /**
   * Fixed ring: direction is from the ring center to the finger, the knob stops inside the ring.
   * Past the strict outer edge, and mostly upward, the same gesture is the jump — there is no jump key.
   */
  private placeStick(clientX: number, clientY: number): void {
    this.aimX = clientX;
    this.aimY = clientY;
    const g = this.getGame();
    const box = this.stickBox;
    if (!g || !box || !this.stickKnob) return;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const max = box.width / 2;
    if (!(max > 0)) return;
    const len = Math.hypot(dx, dy) || 1;
    const travel = Math.min(len, max * KNOB_TRAVEL);
    this.stickKnob.style.transform = `translate(${dx / len * travel}px, ${dy / len * travel}px)`;

    const out = len / max;
    const jump = isTouchJump({ out, up: -dy > JUMP_UP * Math.abs(dx) }, this.stickJump);
    // Re-press when a round reset cleared the set under a finger that has not moved.
    if (jump) { if (!g.keys.has('Space')) g.keyDown('Space'); }
    else if (this.stickJump) this.upKey('Space');
    this.stickJump = jump;

    const dead = max * .28;
    const wantLeft = dx < -dead, wantRight = dx > dead;
    if (wantLeft) { if (!g.keys.has('KeyA')) g.keyDown('KeyA'); }
    else if (this.stickLeft) this.upKey('KeyA');
    if (wantRight) { if (!g.keys.has('KeyD')) g.keyDown('KeyD'); }
    else if (this.stickRight) this.upKey('KeyD');
    this.stickLeft = wantLeft;
    this.stickRight = wantRight;
  }

  private releaseStick(): void {
    const id = this.stickId;
    const el = this.stick();
    this.stickId = null;
    this.stickTouch = null;
    this.disarmTouchMove();
    this.disarmFollow();
    if (id !== null && el) {
      try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* already gone */ }
    }
    if (this.stickLeft) { this.stickLeft = false; this.upKey('KeyA'); }
    if (this.stickRight) { this.stickRight = false; this.upKey('KeyD'); }
    if (this.stickJump) { this.stickJump = false; this.upKey('Space'); }
    if (this.stickKnob) this.stickKnob.style.transform = '';
    this.stickKnob = null;
    this.stickBox = null;
  }
}
