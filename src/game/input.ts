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

const STICK_CODES = ['KeyA', 'KeyD'] as const;
/** Hold the attack button this long and it becomes a heavy. Shorter releases stay light. */
const HEAVY_HOLD = 200;

/* On-screen pad → the same keyDown / keyUp the keyboard uses. Buttons carry data-key. The stick is left / right only. */
export class TouchInput {
  private readonly getGame: () => FightGame | null;
  private readonly pad: HTMLElement;
  private readonly held = new Map<number, HTMLElement>();
  private stickId: number | null = null;
  private stickOn = new Set<string>();
  private readonly atkTimer = new Map<number, number>();
  private readonly atkHeavy = new Set<number>();
  private readonly down = (e: PointerEvent) => {
    if (document.body.classList.contains('pad-tune')) return;
    const g = this.getGame();
    if (!g) return;
    const el = e.target as HTMLElement;
    const b = el.closest<HTMLElement>('[data-key], [data-atk]');
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
      } else g.keyDown(b.dataset.key!);
      return;
    }
    if (this.stickId === null && el.closest('.tp-stick')) {
      e.preventDefault();
      this.stick()?.setPointerCapture(e.pointerId);
      this.stickId = e.pointerId;
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
      else this.getGame()?.keyUp(b.dataset.key!, b.dataset.key !== 'KeyS');
    }
    if (e.pointerId === this.stickId) this.releaseStick();
  };

  constructor(getGame: () => FightGame | null, pad: HTMLElement) { this.getGame = getGame; this.pad = pad; }

  attach(): void {
    this.pad.addEventListener('pointerdown', this.down);
    this.pad.addEventListener('pointermove', this.move);
    this.pad.addEventListener('pointerup', this.up);
    this.pad.addEventListener('pointercancel', this.up);
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

  /** Fixed ring: direction is from the ring center to the finger, knob stays inside the ring. */
  private moveStick(e: PointerEvent): void {
    const g = this.getGame();
    const ring = this.pad.querySelector('.tp-ring');
    const knob = this.pad.querySelector<HTMLElement>('.tp-knob-move');
    if (!g || !ring || !knob) return;
    const box = ring.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const max = box.width / 2;
    const len = Math.hypot(dx, dy) || 1;
    const travel = Math.min(len, max * .62);
    knob.style.transform = `translate(${dx / len * travel}px, ${dy / len * travel}px)`;
    const dead = max * .28;
    const want = new Set<string>();
    if (dx < -dead) want.add('KeyA');
    if (dx > dead) want.add('KeyD');
    for (const code of STICK_CODES) {
      if (want.has(code)) { if (!g.keys.has(code)) g.keyDown(code); }
      else if (this.stickOn.has(code)) g.keyUp(code);
    }
    this.stickOn = want;
  }

  private releaseStick(): void {
    this.stickId = null;
    const g = this.getGame();
    for (const code of this.stickOn) g?.keyUp(code);
    this.stickOn = new Set();
    const knob = this.pad.querySelector<HTMLElement>('.tp-knob-move');
    if (knob) knob.style.transform = '';
  }
}
