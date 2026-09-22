import type { FightGame } from './game.ts';

/* Keyboard → game. Also pauses when the tab loses focus so nobody gets hit while alt-tabbed. */
export class KeyboardInput {
  private readonly getGame: () => FightGame | null;
  private readonly down = (e: KeyboardEvent) => {
    const g = this.getGame();
    if (!g || (e.target as HTMLElement | null)?.closest?.('dialog')) return;
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
