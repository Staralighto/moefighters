import type { StageData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { FighterView } from './view.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, SIDE, W } from '../game/constants.ts';
import { drawCombo, drawEffect, drawParticles, drawProjectile, drawTexts, UI_FONT } from './fx.ts';

/** Hard 1px rim, yellow for the left team and green for the right. Only used in 2v2. */
const TEAM_GLOW = SIDE;

/* Reads game state, writes pixels. Never mutates the game. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly views: Map<string, FighterView>;
  private readonly stage: StageData;
  private readonly images: ImageCache;

  constructor(canvas: HTMLCanvasElement, views: Map<string, FighterView>, stage: StageData, images: ImageCache) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.views = views;
    this.stage = stage;
    this.images = images;
  }

  draw(g: FightGame): void {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, H);
    c.save();
    if (g.shake > 0) c.translate((g.random() - .5) * g.shake, (g.random() - .5) * g.shake);
    this.drawStage();

    for (const e of g.effects) {
      if (e.type !== 'ghost' || e.fighter === undefined) continue;
      // By id: a summoned teammate can leave mid-effect, so index lookups would alias or miss.
      const f = g.fighters.find(x => x.id === e.fighter);
      if (!f) continue;
      this.view(f.data.id).draw(c, f, e.x, e.y, (e.alpha ?? .3) * (e.life / e.max), e.tint);
    }
    const order = [...g.fighters].sort((a, b) => Number(a.hp > 0) - Number(b.hp > 0) || a.y - b.y);
    for (const f of order) {
      const view = this.view(f.data.id);
      const outline = g.mode === 'team' ? TEAM_GLOW[f.team] : undefined;
      view.draw(c, f, f.x, f.hp <= 0 ? FLOOR : f.y, f.hp <= 0 ? .3 : 1, undefined, outline);
      if (f.blocking) drawEffect(c, { type: 'shield', x: f.x + f.facing * 28, y: f.y - 80, color: '#a6eeff', life: .14, max: .22, radius: 58 });
      if (f.minion && f.hp > 0) {
        const bw = 44, bx = Math.round(f.x) - bw / 2, by = Math.round(f.y) - 196;
        c.fillStyle = '#171120aa';
        c.fillRect(bx - 1, by - 1, bw + 2, 5);
        c.fillStyle = f.data.color;
        c.fillRect(bx, by, Math.max(0, bw * (f.hp / f.data.hp)), 3);
      }
    }
    for (const p of g.projectiles) drawProjectile(c, p, this.images);
    for (const e of g.effects) if (e.type !== 'ghost') drawEffect(c, e, this.images);
    drawParticles(c, g.particles);
    drawTexts(c, g.texts);
    drawCombo(c, g);
    if (g.mode === 'training') {
      c.textAlign = 'center'; c.font = `14px ${UI_FONT}`; c.fillStyle = '#ddd9ee';
      c.fillText('训练模式 · 无限能量 · 停手后对手恢复', W / 2, 520);
    }
    c.restore();

    if (g.flash > 0) { c.fillStyle = `rgba(255,248,221,${g.flash * 2.3})`; c.fillRect(0, 0, W, H); }
    c.fillStyle = '#0000000c';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
  }

  private view(id: string): FighterView {
    const v = this.views.get(id);
    if (!v) throw Error('缺少角色视图：' + id);
    return v;
  }

  private drawStage(): void {
    const c = this.ctx, s = this.stage;
    const bg = s.image ? this.images.get(s.image) : undefined;
    if (bg) {
      c.drawImage(bg, 0, 0, W, H);
    } else {
      c.fillStyle = s.sky; c.fillRect(0, 0, W, FLOOR + 4);
      c.fillStyle = s.ground; c.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
      c.fillStyle = s.accent + '30';
      for (let x = 40; x < W; x += 120) c.fillRect(x, 60 + (x % 240) / 4, 6, 6);
    }
    c.fillStyle = '#10101b20'; c.fillRect(0, 0, W, H);
  }
}
