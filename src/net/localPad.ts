/* Lockstep: this device's keys never touch the sim directly. Keyboard and touch input write here
   (the same surface they use on a FightGame), and the lockstep session samples it once a tick. */

import type { FightGame } from '../game/game.ts';
import { TAP_SLOTS, packBits, tapSlot, type Pad } from './proto.ts';

export class LocalPad {
  readonly keys = new Set<string>();
  readonly netRole = 'lock' as const;
  private readonly taps: number[] = new Array(TAP_SLOTS).fill(0);
  private readonly game: FightGame;

  constructor(game: FightGame) { this.game = game; }

  get paused(): boolean { return this.game.paused; }
  get phase(): FightGame['phase'] { return this.game.phase; }
  isLocalControl(code: string): boolean { return this.game.isLocalControl(code); }
  togglePause(force?: boolean): void { this.game.togglePause(force); }

  keyDown(code: string): void {
    if (code === 'Escape') { this.game.togglePause(); return; }
    if (this.keys.has(code)) return;
    this.keys.add(code);
    const slot = tapSlot(code);
    if (slot >= 0) this.taps[slot] = (this.taps[slot] + 1) % 256;
  }

  keyUp(code: string): void { this.keys.delete(code); }

  sample(touch: boolean): Pad { return { bits: packBits(this.keys, touch), taps: this.taps.slice() }; }
}
