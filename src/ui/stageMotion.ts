/** Select stage parallax: the pointer (or a slow idle drift when there is none) eases two CSS
 *  variables, --mx and --my in [-1, 1], onto the stage. style.css turns them into the tilt and the
 *  per-layer offsets (backdrop back, portraits mid, chips and VS front).
 *
 *  Cost control: the values are written only when they move by a visible step (STEP), so the idle
 *  drift restyles the stage a few times a second rather than every frame, and the stage rect is
 *  measured once per hover and again only after a scroll or resize, never per pointer event. */

const EASE = 6;
const IDLE = .22;
/** Smallest change worth a style write: .005 of the range is a fraction of a pixel of travel. */
const STEP = .005;

export class StageMotion {
  private x = 0;
  private y = 0;
  private tx = 0;
  private ty = 0;
  private pointer = false;
  private wx = NaN;
  private wy = NaN;
  private rect: DOMRect | null = null;
  private readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly stage: HTMLElement;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    if (this.still) return;
    const forget = () => { this.rect = null; };
    window.addEventListener('scroll', forget, { passive: true });
    window.addEventListener('resize', forget, { passive: true });
    stage.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = this.rect ??= stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.tx = clamp((e.clientX - r.left) / r.width * 2 - 1);
      this.ty = clamp((e.clientY - r.top) / r.height * 2 - 1);
      this.pointer = true;
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { this.pointer = false; this.rect = null; }, { passive: true });
  }

  /** Call once per select frame. `time` is seconds. */
  tick(time: number, dt: number): void {
    if (this.still) return;
    const gx = this.pointer ? this.tx : Math.sin(time * .31) * IDLE;
    const gy = this.pointer ? this.ty : Math.sin(time * .47 + 1.3) * IDLE * .6;
    const k = 1 - Math.exp(-dt * (this.pointer ? EASE : EASE * .3));
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    if (Math.abs(this.x - this.wx) >= STEP || Number.isNaN(this.wx)) {
      this.wx = this.x;
      this.stage.style.setProperty('--mx', this.x.toFixed(3));
    }
    if (Math.abs(this.y - this.wy) >= STEP || Number.isNaN(this.wy)) {
      this.wy = this.y;
      this.stage.style.setProperty('--my', this.y.toFixed(3));
    }
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
