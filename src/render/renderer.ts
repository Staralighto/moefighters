import type { StageData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { FighterView } from './view.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, SIDE, W } from '../game/constants.ts';
import { violetHidden } from '../game/combat.ts';
import { drawBanSign, drawCombo, drawEffect, drawKuji, drawParticles, drawProjectile, drawRootFx, drawTexts, UI_FONT } from './fx.ts';

/** Hard 1px rim, yellow for the left team and green for the right. Used in 2v2 and the 2-on-1 challenge. */
const TEAM_GLOW = SIDE;

let veilBuf: HTMLCanvasElement | undefined;

/** The stage-darkness layer with the lit cone punched out, so the spotlight leaves her bright.
    One reused offscreen buffer; only drawn while the chant holds the world still. */
function stageVeil(gx: number, sway: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!veilBuf) veilBuf = document.createElement('canvas');
  if (veilBuf.width !== W || veilBuf.height !== H) { veilBuf.width = W; veilBuf.height = H; }
  const v = veilBuf.getContext('2d');
  if (!v) return null;
  v.globalCompositeOperation = 'source-over';
  v.clearRect(0, 0, W, H);
  v.fillStyle = 'rgba(12, 8, 26, .58)';
  v.fillRect(0, 0, W, H);
  // Punch the light cones out of the darkness: dim high up, near-full strength at stage level,
  // so the whole standing body inside the beam clears the veil, not just the legs.
  v.globalCompositeOperation = 'destination-out';
  const erase = v.createLinearGradient(0, 0, 0, FLOOR);
  erase.addColorStop(0, 'rgba(0,0,0,.5)');
  erase.addColorStop(1, 'rgba(0,0,0,.92)');
  v.fillStyle = erase;
  const cone = (topX: number) => {
    v.beginPath();
    v.moveTo(topX - 20, 0);
    v.lineTo(topX + 20, 0);
    v.lineTo(gx + 100 + sway, FLOOR);
    v.lineTo(gx - 100 + sway, FLOOR);
    v.closePath();
    v.fill();
  };
  cone(-34);
  cone(W + 34);
  const poolErase = v.createRadialGradient(gx + sway, FLOOR, 10, gx + sway, FLOOR, 150);
  poolErase.addColorStop(0, 'rgba(0,0,0,.9)');
  poolErase.addColorStop(1, 'rgba(0,0,0,0)');
  v.fillStyle = poolErase;
  v.beginPath();
  v.ellipse(gx + sway, FLOOR, 130, 36, 0, 0, Math.PI * 2);
  v.fill();
  v.globalCompositeOperation = 'source-over';
  return veilBuf;
}

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
      // 梦想即力量！: ghosts stamped with a cell draw that frozen pose; the rest mirror the live one.
      const pose = e.sheet ? { sheet: e.sheet, col: e.col ?? 0, row: e.row ?? 0, facing: e.facing ?? f.facing } : undefined;
      this.view(f.data.id).draw(c, f, e.x, e.y, (e.alpha ?? .3) * (e.life / e.max), e.tint, undefined, pose);
    }
    const order = [...g.fighters].sort((a, b) => Number(a.hp > 0) - Number(b.hp > 0) || a.y - b.y);
    // Team rims only where sides can be confused: 2v2 and the 2-on-1 激战, summons never tip it.
    const teamRim = g.mode === 'team' || (g.mode === 'challenge' && g.fighters.filter(x => !x.minion).length > 2);
    for (const f of order) {
      // 哭泣的紫罗兰: between the vanish and the reappear she does not exist on screen.
      if (violetHidden(f)) continue;
      const view = this.view(f.data.id);
      const outline = teamRim ? TEAM_GLOW[f.team] : undefined;
      view.draw(c, f, f.x, f.hp <= 0 ? FLOOR : f.y, f.hp <= 0 ? .3 : f.basic ? .55 : f.echo ? .45 : 1, undefined, outline);
      if (f.blocking) drawEffect(c, { type: 'shield', x: f.x + f.facing * 28, y: f.y - 80, color: '#a6eeff', life: .14, max: .22, radius: 58 });
      if (f.root > 0 && f.hp > 0) drawRootFx(c, f, g.age);
      if (f.feast > 0 && f.hp > 0) drawEffect(c, { type: 'feast', x: f.x, y: f.y - 92, color: '#9ad4ff', life: 1, max: 1, radius: 40 });
      if (f.debt > 0 && f.hp > 0) {
        drawEffect(c, { type: 'debt', x: f.x, y: FLOOR, color: f.data.color, life: 1, max: 1, radius: 52 });
        if (f.debtDmg > 0) {
          c.save();
          c.font = `16px ${UI_FONT}`;
          c.textAlign = 'center';
          c.fillStyle = '#f4b4c8';
          c.fillText(String(Math.round(f.debtDmg * 1.5)), Math.round(f.x), Math.round(f.y - 156));
          c.restore();
        }
      }
      if (f.minion && f.hp > 0) {
        const bw = 44, bx = Math.round(f.x) - bw / 2, by = Math.round(f.y) - 196;
        c.fillStyle = '#171120aa';
        c.fillRect(bx - 1, by - 1, bw + 2, 5);
        c.fillStyle = f.data.color;
        c.fillRect(bx, by, Math.max(0, bw * (f.hp / f.data.hp)), 3);
      }
    }
    for (const p of g.projectiles) drawProjectile(c, p, this.images);
    for (const f of g.fighters) if (f.ban > 0 && f.hp > 0) drawBanSign(c, f);
    for (const e of g.effects) if (e.type !== 'ghost') drawEffect(c, e, this.images);
    drawParticles(c, g.particles);
    drawTexts(c, g.texts);
    drawKuji(c, g);
    drawCombo(c, g);
    if (g.mode === 'training') {
      c.textAlign = 'center'; c.font = `14px ${UI_FONT}`; c.fillStyle = '#ddd9ee';
      c.fillText('训练模式 · 无限能量 · 停手后对手恢复', W / 2, 520);
    }
    c.restore();

    if (g.flash > 0) { c.fillStyle = `rgba(255,248,221,${g.flash * 2.3})`; c.fillRect(0, 0, W, H); }
    // 此即世界: the stage goes dark, two spotlights pin her — the cone leaves her lit, not veiled.
    if (g.timeStop !== null) {
      const her = g.fighterById(g.timeStop);
      const gx = her ? her.x : W / 2;
      const sway = Math.sin(g.age * 5) * 10;
      const veil = stageVeil(gx, sway);
      if (veil && her) {
        // Her own silhouette is stamped out of the darkness: the spotlight never dims her body.
        const v = veil.getContext('2d');
        if (v) {
          v.globalCompositeOperation = 'destination-out';
          if (!violetHidden(her)) this.view(her.data.id).draw(v, her, her.x, her.y, 1);
          v.globalCompositeOperation = 'source-over';
        }
        c.drawImage(veil, 0, 0);
      }
      c.save();
      c.globalCompositeOperation = 'lighter';
      const beam = (topX: number) => {
        const grad = c.createLinearGradient(0, 0, 0, FLOOR);
        grad.addColorStop(0, 'rgba(255, 240, 205, .3)');
        grad.addColorStop(1, 'rgba(255, 240, 205, .06)');
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(topX - 20, 0);
        c.lineTo(topX + 20, 0);
        c.lineTo(gx + 100 + sway, FLOOR);
        c.lineTo(gx - 100 + sway, FLOOR);
        c.closePath();
        c.fill();
      };
      beam(-34);
      beam(W + 34);
      // A warm halo at chest height sells the hit of the spot on her body, not just the floor.
      const glow = c.createRadialGradient(gx + sway, FLOOR - 88, 6, gx + sway, FLOOR - 88, 90);
      glow.addColorStop(0, 'rgba(255, 244, 210, .26)');
      glow.addColorStop(1, 'rgba(255, 244, 210, 0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(gx + sway, FLOOR - 88, 90, 0, Math.PI * 2);
      c.fill();
      c.translate(gx + sway, FLOOR);
      c.scale(1, .3);
      const pool = c.createRadialGradient(0, 0, 8, 0, 0, 105);
      pool.addColorStop(0, 'rgba(255, 244, 210, .38)');
      pool.addColorStop(1, 'rgba(255, 244, 210, 0)');
      c.fillStyle = pool;
      c.beginPath();
      c.arc(0, 0, 105, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
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
