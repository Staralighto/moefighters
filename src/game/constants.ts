export const W = 960;
export const H = 540;
export const FLOOR = 443;
export const GRAVITY = 1650;
export const STEP = 1 / 120;
/** How long a press stays queued once the fighter can act. Locks pause this clock. */
export const INPUT_BUFFER = .2;
export const X_MIN = 44;
export const X_MAX = W - 44;

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** 1P yellow, 2P green. */
export const SIDE = ['#FDE979', '#C8F181'] as const;

export interface Controls {
  left: string;
  right: string;
  jump: string[];
  block: string;
  attacks: string[];
}

/* Slot 0 is the only human in v1; slot 1 exists so a second local player is data, not code. */
export const CONTROLS: Controls[] = [
  { left: 'KeyA', right: 'KeyD', jump: ['KeyW', 'Space'], block: 'KeyS', attacks: ['KeyJ', 'KeyK', 'KeyU', 'KeyI', 'KeyO', 'KeyL'] },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: ['ArrowUp'], block: 'ArrowDown', attacks: ['Numpad1', 'Numpad2', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad3'] },
];
