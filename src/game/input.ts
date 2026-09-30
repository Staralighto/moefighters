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

/* On-screen pad → the same keyDown / keyUp the keyboard uses. Buttons carry data-key; the stick is left / right plus jump at the edge. */
export class TouchInput {
  private readonly getGame: () => FightGame | null;
  private readonly pad: HTMLElement;
  private readonly arena: HTMLElement | null;
  private readonly held = new Map<number, HTMLElement>();
  private stickId: number | null = null;
  private stickJump = false;
  private stickLeft = false;
  private stickRight = false;
  /** Cached at grab time: the ring center never moves during a drag, and pointermove can fire
   *  faster than the display — re-querying the DOM on every event was pure waste. */
  private stickBox: DOMRect | null = null;
  private stickKnob: HTMLElement | null = null;
  private guardId: number | null = null;
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
      b.setPointerCapture(e.pointerId);
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
    if (this.stickId === null && el.closest('.tp-stick')) {
      e.preventDefault();
      this.stick()?.setPointerCapture(e.pointerId);
      this.stickId = e.pointerId;
      this.stickKnob = this.pad.querySelector<HTMLElement>('.tp-knob-move');
      const ring = this.pad.querySelector<HTMLElement>('.tp-ring');
      this.stickBox = ring ? ring.getBoundingClientRect() : null;
      this.moveStick(e);
    }
  };
  private readonly move = (e: PointerEvent) => {
    if (document.body.classList.contains('pad-tune')) return;
    if (e.pointerId === this.stickId) this.moveStick(e);
  };
  private readonly up = (e: PointerEvent) => {
    if (document.body.classList.contains('pad-tune')) return;
    const b = this.held.get(e.pointerId);
    if (b) {
      this.held.delete(e.pointerId);
      b.classList.remove('held');
      if (b.hasAttribute('data-atk')) this.releaseAtk(e.pointerId, b, e.type !== 'pointercancel');
      // A tap on the guard button stays a block. Blank-screen taps are still the back-dodge.
      else if (b.hasAttribute('data-guard')) this.getGame()?.keyUp('KeyS', false);
      else this.getGame()?.keyUp(b.dataset.key!);
    }
    if (e.pointerId === this.stickId) this.releaseStick();
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
    g.keyDown('KeyS');
  };
  private readonly guardUp = (e: PointerEvent) => {
    if (e.pointerId !== this.guardId) return;
    this.guardId = null;
    // dodge stays on: the engine turns a release before DODGE_TAP into the back-dodge and a longer hold into a block.
    this.getGame()?.keyUp('KeyS');
  };
  private readonly noMenu = (e: Event) => {
    if (this.guardId !== null) e.preventDefault();
  };

  constructor(getGame: () => FightGame | null, pad: HTMLElement) {
    this.getGame = getGame;
    this.pad = pad;
    this.arena = document.getElementById('arena');
  }

  attach(): void {
    this.pad.addEventListener('pointerdown', this.down);
    this.pad.addEventListener('pointermove', this.move);
    this.pad.addEventListener('pointerup', this.up);
    this.pad.addEventListener('pointercancel', this.up);
    const blank = this.arena ?? this.pad;
    blank.addEventListener('pointerdown', this.guardDown);
    blank.addEventListener('pointerup', this.guardUp);
    blank.addEventListener('pointercancel', this.guardUp);
    blank.addEventListener('contextmenu', this.noMenu);
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
    if (heavy) g.keyUp('KeyK');
    else if (fireLight) { g.keyDown('KeyJ'); g.keyUp('KeyJ'); }
  }

  /**
   * Fixed ring: direction is from the ring center to the finger, the knob stops inside the ring.
   * Past the strict outer edge, and mostly upward, the same gesture is the jump — there is no jump key.
   */
  private moveStick(e: PointerEvent): void {
    const g = this.getGame();
    const box = this.stickBox;
    if (!g || !box || !this.stickKnob) return;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const max = box.width / 2;
    const len = Math.hypot(dx, dy) || 1;
    const travel = Math.min(len, max * KNOB_TRAVEL);
    this.stickKnob.style.transform = `translate(${dx / len * travel}px, ${dy / len * travel}px)`;

    const out = len / max;
    const jump = isTouchJump({ out, up: -dy > JUMP_UP * Math.abs(dx) }, this.stickJump);
    if (jump !== this.stickJump) {
      this.stickJump = jump;
      if (jump) g.keyDown('Space'); else g.keyUp('Space');
    }

    const dead = max * .28;
    const wantLeft = dx < -dead, wantRight = dx > dead;
    if (wantLeft) { if (!g.keys.has('KeyA')) g.keyDown('KeyA'); }
    else if (this.stickLeft) g.keyUp('KeyA');
    if (wantRight) { if (!g.keys.has('KeyD')) g.keyDown('KeyD'); }
    else if (this.stickRight) g.keyUp('KeyD');
    this.stickLeft = wantLeft;
    this.stickRight = wantRight;
  }

  private releaseStick(): void {
    this.stickId = null;
    const g = this.getGame();
    if (this.stickLeft) { this.stickLeft = false; g?.keyUp('KeyA'); }
    if (this.stickRight) { this.stickRight = false; g?.keyUp('KeyD'); }
    if (this.stickJump) { this.stickJump = false; g?.keyUp('Space'); }
    if (this.stickKnob) this.stickKnob.style.transform = '';
    this.stickKnob = null;
    this.stickBox = null;
  }
}
