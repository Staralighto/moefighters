import type { StageData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { FighterView } from './view.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, SIDE, W } from '../game/constants.ts';
import { violetHidden } from '../game/combat.ts';
import { drawBanSign, drawCombo, drawEffect, drawGauge, drawKuji, drawParticles, drawProjectile, drawRootFx, drawTexts, UI_FONT } from './fx.ts';

/** Hard 1px rim, yellow for the left team and green for the right. */
const TEAM_GLOW = SIDE;

/** On when one side has two real fighters, or the same character stands on both sides.
 *  2v2 and the 2-on-1 激战 are the first case; a 1v1 mirror match is the second.
 *  Minions and echoes are not real fighters; a minion still completes a mirror pair. */
export function teamGlowOn(g: { fighters: { team: number; minion?: boolean; echo?: boolean; data: { id: string } }[] }): boolean {
  const n = [0, 0];
  const side = new Map<string, number>();
  for (const f of g.fighters) {
    if (!f.minion && !f.echo) n[f.team]++;
    const prev = side.get(f.data.id);
    if (prev === undefined) side.set(f.data.id, f.team);
    else if (prev !== f.team) return true;
  }
  return n[0] > 1 || n[1] > 1;
}

let veilBuf: HTMLCanvasElement | undefined;
/** The scanline tile is one 1×4 pattern; the overlay itself never changes. */
let scanPattern: CanvasPattern | null = null;
/** Gradients below depend only on FLOOR (and the fixed origin under a translate), so they are built once. */
let eraseGrad: CanvasGradient | null = null;
let poolEraseGrad: CanvasGradient | null = null;
let beamGrad: CanvasGradient | null = null;
let glowGrad: CanvasGradient | null = null;
let poolGrad: CanvasGradient | null = null;

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
  if (!eraseGrad) {
    eraseGrad = v.createLinearGradient(0, 0, 0, FLOOR);
    eraseGrad.addColorStop(0, 'rgba(0,0,0,.5)');
    eraseGrad.addColorStop(1, 'rgba(0,0,0,.92)');
  }
  v.fillStyle = eraseGrad;
  // The gradient is drawn in translated space, so the cached one works at any cone position.
  const cone = (topX: number) => {
    v.save();
    v.translate(topX, 0);
    v.beginPath();
    v.moveTo(-20, 0);
    v.lineTo(20, 0);
    v.lineTo(gx + 100 + sway - topX, FLOOR);
    v.lineTo(gx - 100 + sway - topX, FLOOR);
    v.closePath();
    v.fill();
    v.restore();
  };
  cone(-34);
  cone(W + 34);
  if (!poolEraseGrad) {
    poolEraseGrad = v.createRadialGradient(0, 0, 10, 0, 0, 150);
    poolEraseGrad.addColorStop(0, 'rgba(0,0,0,.9)');
    poolEraseGrad.addColorStop(1, 'rgba(0,0,0,0)');
  }
  v.save();
  v.translate(gx + sway, FLOOR);
  v.fillStyle = poolEraseGrad;
  v.beginPath();
  v.ellipse(0, 0, 130, 36, 0, 0, Math.PI * 2);
  v.fill();
  v.restore();
  v.globalCompositeOperation = 'source-over';
  return veilBuf;
}

/* Reads game state, writes pixels. Never mutates the game. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly views: Map<string, FighterView>;
  private readonly stage: StageData;
  private readonly images: ImageCache;
  /** World → raster scale: the backing store is device sized, the world stays 960×540. */
  private sx = 1;
  private sy = 1;

  constructor(canvas: HTMLCanvasElement, views: Map<string, FighterView>, stage: StageData, images: ImageCache) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.canvas = canvas;
    this.views = views;
    this.stage = stage;
    this.images = images;
    this.resize();
  }

  /** Size the backing store to the on-screen box × devicePixelRatio, so the compositor blits
      the canvas 1:1 (the CSS `image-rendering: pixelated` stretch never resamples it) and the
      fixed 960×540 world rasterises at screen resolution instead. Cheap to call every frame:
      a no-op unless the box, the zoom or the monitor's scale moved. */
  resize(): void {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(cw * dpr));
    const h = Math.max(1, Math.round(ch * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.sx = w / W;
    this.sy = h / H;
  }

  draw(g: FightGame): void {
    const c = this.ctx;
    // Refit before painting: a ResizeObserver would fire after this rAF and clearing the
    // bitmap there would flash a blank frame on every window change.
    this.resize();
    c.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, H);
    c.save();
    if (g.shake > 0) c.translate((g.random() - .5) * g.shake, (g.random() - .5) * g.shake);
    this.drawStage();

    // 圆形地面影子：跳得越高影越小；中心比脚线高 7px（FLOOR+3 再上移 10），对齐成图的实际脚线。
    for (const f of g.fighters) {
      if (violetHidden(f)) continue;
      c.fillStyle = '#05050c40';
      c.beginPath();
      c.ellipse(f.x, FLOOR - 7, Math.max(0, 50 - (FLOOR - f.y) * .09), 9, 0, 0, Math.PI * 2);
      c.fill();
    }

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
    const teamRim = teamGlowOn(g);
    for (const f of order) {
      // 哭泣的紫罗兰: between the vanish and the reappear she does not exist on screen.
      if (violetHidden(f)) continue;
      const view = this.view(f.data.id);
      const outline = teamRim ? TEAM_GLOW[f.team] : undefined;
      view.draw(c, f, f.x, f.hp <= 0 ? FLOOR : f.y, f.hp <= 0 ? .3 : f.basic ? .55 : f.echo ? .45 : 1, undefined, outline);
      if (f.blocking) drawEffect(c, { type: 'shield', x: f.x + f.facing * 28, y: f.y - 80, color: '#a6eeff', life: .14, max: .22, radius: 58 });
      if (f.root > 0 && f.hp > 0) drawRootFx(c, f, g.age);
      if (f.slow > 0 && f.hp > 0) drawEffect(c, { type: 'petal-aura', x: f.x, y: f.y - 105, color: '#EE0022', life: 1, max: 1, radius: 44, age: g.age });
      drawGauge(c, f);
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
      if (!beamGrad) {
        beamGrad = c.createLinearGradient(0, 0, 0, FLOOR);
        beamGrad.addColorStop(0, 'rgba(255, 240, 205, .3)');
        beamGrad.addColorStop(1, 'rgba(255, 240, 205, .06)');
      }
      c.fillStyle = beamGrad;
      // Same trick as the veil cones: translate to the apex so the cached gradient fits any sway.
      const beam = (topX: number) => {
        c.save();
        c.translate(topX, 0);
        c.beginPath();
        c.moveTo(-20, 0);
        c.lineTo(20, 0);
        c.lineTo(gx + 100 + sway - topX, FLOOR);
        c.lineTo(gx - 100 + sway - topX, FLOOR);
        c.closePath();
        c.fill();
        c.restore();
      };
      beam(-34);
      beam(W + 34);
      // A warm halo at chest height sells the hit of the spot on her body, not just the floor.
      if (!glowGrad) {
        glowGrad = c.createRadialGradient(0, 0, 6, 0, 0, 90);
        glowGrad.addColorStop(0, 'rgba(255, 244, 210, .26)');
        glowGrad.addColorStop(1, 'rgba(255, 244, 210, 0)');
      }
      c.save();
      c.translate(gx + sway, FLOOR - 88);
      c.fillStyle = glowGrad;
      c.beginPath();
      c.arc(0, 0, 90, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.translate(gx + sway, FLOOR);
      c.scale(1, .3);
      if (!poolGrad) {
        poolGrad = c.createRadialGradient(0, 0, 8, 0, 0, 105);
        poolGrad.addColorStop(0, 'rgba(255, 244, 210, .38)');
        poolGrad.addColorStop(1, 'rgba(255, 244, 210, 0)');
      }
      c.fillStyle = poolGrad;
      c.beginPath();
      c.arc(0, 0, 105, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    if (!scanPattern) {
      const tile = document.createElement('canvas');
      tile.width = 1;
      tile.height = 4;
      const t = tile.getContext('2d');
      if (t) {
        t.fillStyle = '#0000000c';
        t.fillRect(0, 0, 1, 1);
        scanPattern = c.createPattern(tile, 'repeat');
      }
    }
    if (scanPattern) { c.fillStyle = scanPattern; c.fillRect(0, 0, W, H); }
  }

  private view(id: string): FighterView {
    const v = this.views.get(id);
    if (!v) throw Error('缺少角色视图：' + id);
    return v;
  }

  private drawStage(): void {
    const c = this.ctx, s = this.stage;
    const bg = s.image ? this.images.get(s.image) : undefined;
    // The art is world-sized (960×540), so painting it straight onto the transformed canvas
    // each frame is the same single resample a bake would produce, with no buffer to size or
    // rebake on window changes. Smoothing stays on for the upscale and off for the rest of
    // the frame.
    // ponytail: no backdrop bake — drawImage allocates nothing, so this only costs one scaled
    // quad per frame. Re-add a bake if phone profiling ever blames this line.
    if (bg && bg.naturalWidth) {
      c.imageSmoothingEnabled = true;
      this.paintBackdrop(c, bg);
      c.imageSmoothingEnabled = false;
    } else {
      this.paintFlat(c);
    }
    c.fillStyle = s.shade ?? '#10101b20'; c.fillRect(0, 0, W, H);
  }

  /** No art on the stage — none declared, or the file 404'd (the loader drops it from the cache).
      The flat sky/ground arena is the fallback the stage data always carries. */
  private paintFlat(g: CanvasRenderingContext2D): void {
    const s = this.stage;
    g.fillStyle = s.sky; g.fillRect(0, 0, W, FLOOR + 4);
    g.fillStyle = s.ground; g.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
    g.fillStyle = s.accent + '30';
    for (let x = 40; x < W; x += 120) g.fillRect(x, 60 + (x % 240) / 4, 6, 6);
  }

  /** Cover the canvas with the art, anchoring its own ground line (`stage.groundY`, canvas space)
      onto FLOOR so fighters stand on the painted pavement. A 960×540 stage without `groundY`
      reduces to the plain full stretch; an off line zooms just enough to keep the canvas covered. */
  private paintBackdrop(g: CanvasRenderingContext2D, bg: HTMLImageElement): void {
    const fy = (this.stage.groundY ?? FLOOR) / H;
    const iw = bg.naturalWidth, ih = bg.naturalHeight;
    const scale = Math.max(W / iw, FLOOR / (ih * fy), (H - FLOOR) / (ih * (1 - fy)));
    const dx = (W - iw * scale) / 2;
    const dy = FLOOR - ih * fy * scale;
    g.drawImage(bg, dx, dy, iw * scale, ih * scale);
  }
}
