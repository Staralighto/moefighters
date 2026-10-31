import type { StageData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { FighterView } from './view.ts';
import { stageThumbSrc, type ImageCache } from '../assets/loader.ts';
import { FLOOR, H, SIDE, W } from '../game/constants.ts';
import { comboAnchor } from '../ui/battleFrame.ts';
import { unbowedRage, violetHidden } from '../game/combat.ts';
import { BURDEN_Y, encoreDark, IAIDO_PHASE, iaidoCharge, UNBOWED_MAX, unbowedStacks } from './clips.ts';
import { drawBanSign, drawCombo, drawEffect, drawMoonlight, drawGauge, drawHoldNote, drawKuji, drawLayerBass, drawParticles, drawProjectile, drawRainbowBack, drawRainbowFront, drawRootFx, drawSister, drawTexts, drawWheel, isLiteFx, UI_FONT, zoomAbout } from './fx.ts';
import { SAKIKO_BACK, SAKIKO_SCREEN_BACK } from './sakikoFx.ts';

/** Backing-store pixels per CSS pixel. The compositor then blits 1:1.
 *  Phones use the screen ratio too: a CSS pixel is several physical pixels, and a 1× store
 *  is filter-upscaled across the whole frame. Lite keeps its 44% pixel cut on that ratio.
 *  ponytail: no cap. A 3× phone is ~9× the fill of the old 1× store; if that misses frame
 *  budget, lite (sticky for the session) is the step down, not a lower default. */
export function backingScale(dpr: number, touch: boolean, lite: boolean): number {
  const native = dpr > 0 ? dpr : 1;
  return touch && lite ? native * .75 : native;
}

/** Pad-split portrait draws bodies and their effects 1.3×. The 960×540 stage stays put. */
export function portraitBodyScale(padSplit: boolean): number {
  return padSplit ? 1.3 : 1;
}

/** Hard 1px rim, yellow for the left team and green for the right. */
const TEAM_GLOW = SIDE;
/** Effects painted under every body: 和泉朋花's coffin and her spotlights. */
const BACK_FX = new Set(['coffin', 'stage-lights', 'spotlight', 'nagi-sea', 'encore-spot', 'family-lineup', 'family-zone', 'family-door', ...SAKIKO_BACK]);
/** Screen-space layers that ignore the body zoom: behind every body, and in front of them. */
const SCREEN_BACK = new Set(['encore-stage', 'family-dim', ...SAKIKO_SCREEN_BACK]);
const SCREEN_FRONT = new Set(['encore-rain', 'encore-crowd', 'encore-call', 'slap-flash']);
/** 安可是主唱的: the eye line on the 175 px body, measured up from the feet. */
const ENCORE_EYE_Y = 152;

/** 必杀聚焦 curve over the effect's life, 0..1: a fast snap in, a hold, then a smooth ease back out. */
export function superZoom(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  if (p < .14) { const k = p / .14; return 1 - (1 - k) * (1 - k); }
  if (p < .5) return 1;
  const k = (p - .5) / .5;
  return 1 - k * k * (3 - 2 * k);
}

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
  /** Cached HIT baseline. The chrome does not move during a round, so fighting frames skip the layout read. */
  private comboY = 205;
  private comboStamp = '';
  private comboHud: HTMLElement | null | undefined;

  constructor(canvas: HTMLCanvasElement, views: Map<string, FighterView>, stage: StageData, images: ImageCache) {
    // The stage covers every pixel, so the page never needs to blend through the bitmap.
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.canvas = canvas;
    this.views = views;
    this.stage = stage;
    this.images = images;
    this.resize();
  }

  /** Stage baseline whose 45px HIT face clears the HUD, including the ticket under a portrait.
   *  Layout is read only when the canvas box, `--hud`, or the HUD mode actually changes. */
  private comboBaseline(): number {
    const canvas = this.canvas;
    const hud = this.comboHud === undefined
      ? (this.comboHud = canvas.parentElement?.querySelector<HTMLElement>('.hud') ?? null)
      : this.comboHud;
    const stamp = `${canvas.clientHeight}|${canvas.style.top}|${canvas.style.height}|${canvas.parentElement?.parentElement?.style.getPropertyValue('--hud') ?? ''}|${hud?.className ?? ''}`;
    if (stamp === this.comboStamp) return this.comboY;
    this.comboStamp = stamp;
    const scale = canvas.clientHeight / H;
    if (!hud || !(scale > 0)) return this.comboY = 205;
    let bottom = hud.offsetTop + hud.offsetHeight;
    const avatar = hud.querySelector<HTMLElement>('.hud-avatar:not([hidden])');
    const host = avatar?.offsetParent as HTMLElement | null;
    if (avatar && host) {
      // The ticket hangs 22/96 of the face below the photo and does not grow the HUD box.
      bottom = Math.max(bottom, host.offsetTop + avatar.offsetTop + avatar.offsetHeight * (1 + 22 / 96));
    }
    return this.comboY = comboAnchor(bottom - canvas.offsetTop + 8, scale);
  }

  /** Size the backing store to the on-screen box × devicePixelRatio, so the compositor blits
      the canvas 1:1 and the fixed 960×540 world rasterises at screen resolution.
      Cheap to call every frame: a no-op unless the box, the zoom or the monitor's scale moved. */
  resize(): void {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = backingScale(window.devicePixelRatio || 1, document.body.classList.contains('touch'), isLiteFx());
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
    c.clearRect(0, 0, W, H);
    c.save();
    // Screen shake is a picture, not the match: it must not draw from the seeded sim random (online lockstep).
    if (g.shake > 0) c.translate((Math.random() - .5) * g.shake, (Math.random() - .5) * g.shake);
    // 必杀聚焦: a 'super-zoom' effect pulls the whole picture in on its point, then lets it go.
    const zoom = g.effects.find(e => e.type === 'super-zoom');
    if (zoom) {
      const s = 1 + ((zoom.radius ?? 1.12) - 1) * superZoom(1 - zoom.life / zoom.max);
      c.translate(zoom.x, zoom.y);
      c.scale(s, s);
      c.translate(-zoom.x, -zoom.y);
    }
    this.drawStage();

    const bodyScale = portraitBodyScale(document.body.classList.contains('pad-split'));

    // 领域: the active field's backdrop sits under every body.
    this.drawDomains(c, g);
    // 圆形地面影子：跳得越高影越小；中心比脚线高 7px（FLOOR+3 再上移 10），对齐成图的实际脚线。
    for (const f of g.fighters) {
      if (violetHidden(f)) continue;
      c.fillStyle = '#05050c40';
      c.beginPath();
      c.ellipse(f.x, FLOOR - 7, Math.max(0, 50 - (FLOOR - f.y) * .09) * bodyScale, 9 * bodyScale, 0, 0, Math.PI * 2);
      c.fill();
    }

    // 狼王来了: the dark veil and the moon pillar sit under every body, so the fighters stay lit.
    for (const e of g.effects) if (e.type === 'moonlight') drawMoonlight(c, e, 'back');
    // 寿来: the mark is painted on the floor, so it sits under every body.
    for (const e of g.effects) if (e.type === 'lifedraw-mark') zoomAbout(c, bodyScale, e.x, e.y, () => drawEffect(c, e, this.images));
    // 安可是主唱的: the house lights go down and the stage beams sweep behind every body.
    for (const e of g.effects) if (SCREEN_BACK.has(e.type)) drawEffect(c, e, this.images);
    // 康乃馨盛开之日 / 请成为主角吧♡: the coffin stands behind her and the spotlight falls behind the body it lights.
    for (const e of g.effects) if (BACK_FX.has(e.type)) zoomAbout(c, bodyScale, e.x, e.y, () => drawEffect(c, e, this.images));

    const lite = isLiteFx();
    // 人和挂在身上的特效绕脚放大。命中、弹道、粒子绕各自的落点放大，战场贴图不动。
    for (const e of g.effects) {
      if (e.type !== 'ghost' || e.fighter === undefined) continue;
      // Lite draws only the fresher half of each trail; picked by age, so nothing blinks.
      if (lite && e.life / e.max <= .5) continue;
      // By id: a summoned teammate can leave mid-effect, so index lookups would alias or miss.
      const f = g.fighters.find(x => x.id === e.fighter);
      if (!f) continue;
      // 梦想即力量！: ghosts stamped with a cell draw that frozen pose; the rest mirror the live one.
      const pose = e.sheet ? { sheet: e.sheet, col: e.col ?? 0, row: e.row ?? 0, facing: e.facing ?? f.facing } : undefined;
      zoomAbout(c, bodyScale, e.x, e.y, () => this.view(f.data.id).draw(c, f, e.x, e.y, (e.alpha ?? .3) * (e.life / e.max), e.tint, undefined, pose));
    }
    // 彩虹色: the wash and the far bokeh sit behind the body and follow her head.
    for (const e of g.effects) {
      if (e.type !== 'rainbow-pop' || e.fighter == null) continue;
      const f = g.fighterById(e.fighter);
      if (f) zoomAbout(c, bodyScale, f.x, f.y, () => drawRainbowBack(c, e, f));
    }
    const order = [...g.fighters].sort((a, b) => Number(a.hp > 0) - Number(b.hp > 0) || a.y - b.y);
    const teamRim = teamGlowOn(g);
    for (const f of order) {
      // 哭泣的紫罗兰: between the vanish and the reappear she does not exist on screen.
      if (violetHidden(f)) continue;
      const view = this.view(f.data.id);
      const outline = teamRim ? TEAM_GLOW[f.team] : undefined;
      // 舞台装置: a skill cast lifts the veil look for the length of the move, so the pose reads.
      // The veil mod itself stays: misses and targeting are untouched. Another live veil
      // (忍法·隐身术) keeps its transparency — only the device's own veil is lifted.
      let apparatusVeil = false, otherVeil = false;
      for (const m of f.mods) {
        if (m.kind !== 'veil' || m.left <= 0) continue;
        if (m.tag === 'apparatus') apparatusVeil = true; else otherVeil = true;
      }
      const veiled = (apparatusVeil || otherVeil)
        && !(apparatusVeil && !otherVeil && f.attack !== null && f.attack.index >= 2);
      const alpha = (f.hp <= 0 ? .3 : f.apparatus ? 1 : f.basic ? .55 : f.echo ? .45 : 1) * (veiled ? .4 : 1);
      const footY = f.hp <= 0 ? FLOOR : f.y;
      zoomAbout(c, bodyScale, f.x, footY, () => {
        if (f.attack?.skill.fx === 'wheel') drawWheel(c, f, this.images);
        view.draw(c, f, f.x, footY, alpha, undefined, outline);
        // 绝不退场: one lookup feeds the cheek, the aura and, at full stacks, a red rim pulsing round her
        // own silhouette (the sprite's hard rim, not a shape).
        const rage = f.hp > 0 ? unbowedRage(f) : undefined;
        const stacks = rage ? unbowedStacks(rage.v) : 0;
        if (rage && stacks >= unbowedStacks(UNBOWED_MAX)) {
          view.draw(c, f, f.x, footY, alpha * (.45 + .45 * Math.abs(Math.sin(g.age * 5))), undefined, '#ff3b5c');
        }
        // 安可是主唱的: from the third call through the run her face goes dark — a near-black wash over
        // the whole cell, and two points of light left where the eyes are.
        // 血月的奏鸣: she stays fully readable, only lit by the scene — a light wash of the moon's red over
        // the body and a soft red rim. The eye is pulled away by the moon, the staff and the notes, not by hiding her.
        if (f.attack?.skill.fx === 'blood-note' && f.hp > 0) {
          const s = f.attack.skill;
          const lit = Math.min(1, f.attack.t / .25, Math.max(0, s.duration - f.attack.t) / .3);
          if (lit > 0) {
            view.draw(c, f, f.x, footY, alpha * lit * (.28 + .12 * Math.sin(g.age * 6)), undefined, '#ff3048');
            view.draw(c, f, f.x, footY, alpha * lit * .16, '#ff4a5e');
          }
        }
        if (f.attack?.skill.fx === 'encore' && encoreDark(f.attack.mode)) {
          view.draw(c, f, f.x, footY, alpha * .82, '#0a0b14');
          drawEffect(c, { type: 'encore-eye', x: f.x + f.facing * 2, y: footY - ENCORE_EYE_Y, color: '#ffffff', life: 1, max: 1, dir: f.facing });
        }
        drawLayerBass(c, f, this.images, alpha);
        if (f.blocking) drawEffect(c, { type: 'shield', x: f.x + f.facing * 28, y: f.y - 80, color: '#a6eeff', life: .14, max: .22, radius: 58 });
        if (f.root > 0 && f.hp > 0) drawRootFx(c, f, g.age);
        // 剑道三连: the stance charges — a wide ring collapses into her as the meter fills.
        if (f.attack?.skill.fx === 'iaido' && (f.attack.mode ?? IAIDO_PHASE.pending) === IAIDO_PHASE.stance) {
          const q = iaidoCharge(f.attack.t);
          drawEffect(c, { type: 'charge-ring', x: f.x, y: f.y - 88, color: '#d9c6ff', life: 1 - q, max: 1, radius: 100, age: f.attack.t });
        }
        if (f.slow > 0 && f.hp > 0) {
          const bubble = f.mods.some(m => m.kind === 'slow' && m.left > 0 && m.mark === 'bubble');
          drawEffect(c, bubble
            ? { type: 'slow-bubble', x: f.x, y: f.y - 150, color: f.data.color, life: 1, max: 1, radius: 18, age: g.age }
            : { type: 'petal-aura', x: f.x, y: f.y - 105, color: '#EE0022', life: 1, max: 1, radius: 44, age: g.age });
        }
        // 我可是很脆弱的哦: white petals drift down around her while the reflect window holds.
        if (f.hp > 0 && f.mods.some(m => m.kind === 'reflect' && m.left > 0 && m.mark === 'lily')) {
          drawEffect(c, { type: 'petal-aura', x: f.x, y: f.y - 105, color: '#ffffff', life: 1, max: 1, radius: 44, age: g.age });
        }
        // 和泉朋花's curses: 飘了 bobs hearts round the head; 主角 keeps a thin spotlight on the body.
        if (f.hp > 0) for (const m of f.mods) {
          if (m.left <= 0) continue;
          if (m.mark === 'praise') drawEffect(c, { type: 'praise-aura', x: f.x, y: f.y - 182, color: '#ff8fd8', life: 1, max: 1, age: g.age });
          else if (m.mark === 'spotlight') drawEffect(c, { type: 'spot-aura', x: f.x, y: footY, color: '#fff2fb', life: 1, max: 1, age: g.age });
          // 祐天寺喵梦's hidden 麦子越踩越坚强: a warm gold shimmer while the cut holds.
          else if (m.mark === 'wheat') drawEffect(c, { type: 'wheat-aura', x: f.x, y: footY, color: '#ffd36a', life: Math.min(1, m.left / .3), max: 1, age: g.age });
          // 滨崎茉幌: the pile she carries over her head, the aftershocks at her feet.
          else if (m.kind === 'burden' && (m.v ?? 0) > 0) drawEffect(c, { type: 'burden', x: f.x, y: f.y - BURDEN_Y, color: f.data.color, life: 1, max: 1, n: m.v, age: g.age });
          else if (m.kind === 'quake') drawEffect(c, { type: 'quake-aura', x: f.x, y: FLOOR, color: f.data.color, life: 1, max: 1, n: m.acc ?? 1, age: g.age });
        }
        if (rage) drawEffect(c, { type: 'slap-aura', x: f.x, y: f.y - 150, color: '#ff6b7d', life: 1, max: 1, dir: f.facing, n: stacks, age: g.age });
        // 完全复活: the gold halo follows the head from the first frame of the window.
        if (f.hp > 0 && f.mods.some(m => m.kind === 'relapse' && m.left > 0 && m.mark === 'halo')) {
          drawEffect(c, { type: 'halo', x: f.x, y: f.y - 176, color: '#ffd54a', life: 1, max: 1, radius: 16 });
        }
        drawGauge(c, f);
        if (f.feast > 0 && f.hp > 0) drawEffect(c, { type: 'feast', x: f.x, y: f.y - 92, color: '#9ad4ff', life: 1, max: 1, radius: 40 });
        if (f.debt > 0 && f.hp > 0) {
          drawEffect(c, { type: 'debt', x: f.x, y: FLOOR, color: f.data.color, life: 1, max: 1, radius: 52 });
          if (f.debtDmg > 0) {
            c.save();
            c.font = `16px ${UI_FONT}`;
            c.textAlign = 'center';
            c.fillStyle = '#f4b4c8';
            c.fillText(String(Math.round(f.debtDmg * 0.8)), Math.round(f.x), Math.round(f.y - 156));
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
      });
    }
    // 彩虹色: the near bokeh floats in front of the body.
    for (const e of g.effects) {
      if (e.type !== 'rainbow-pop' || e.fighter == null) continue;
      const f = g.fighterById(e.fighter);
      if (f) zoomAbout(c, bodyScale, f.x, f.y, () => drawRainbowFront(c, e, f));
    }
    for (const f of g.fighters) if (f.attack?.skill.fx === 'change') zoomAbout(c, bodyScale, f.x, f.y, () => drawHoldNote(c, f, g.opponents(f)));
    for (const p of g.projectiles) {
      const owner = p.fx === 'sister' ? g.fighterById(p.owner) : undefined;
      zoomAbout(c, bodyScale, p.x, p.y, () => {
        if (owner) drawSister(c, p, owner, this.view(owner.data.id));
        else if (p.fx !== 'sister') drawProjectile(c, p, this.images);
      });
    }
    for (const f of g.fighters) if (f.ban > 0 && f.hp > 0) zoomAbout(c, bodyScale, f.x, f.y, () => drawBanSign(c, f));
    for (const e of g.effects) if (e.type !== 'ghost' && e.type !== 'lifedraw-mark' && e.type !== 'petal-rain' && e.type !== 'rainbow-pop' && e.type !== 'apparatus' && e.type !== 'moonlight' && !SCREEN_FRONT.has(e.type) && !SCREEN_BACK.has(e.type) && !BACK_FX.has(e.type)) zoomAbout(c, bodyScale, e.x, e.y, () => drawEffect(c, e, this.images));
    // Screen-space effects: the petal rain, the floor-to-sky pillar and the encore crowd must not grow with the body.
    for (const e of g.effects) if (e.type === 'petal-rain' || e.type === 'apparatus' || SCREEN_FRONT.has(e.type)) drawEffect(c, e, this.images);
    for (const e of g.effects) if (e.type === 'moonlight') drawMoonlight(c, e, 'front');
    drawParticles(c, g.particles, bodyScale);
    drawTexts(c, g.texts, bodyScale);
    drawKuji(c, g, bodyScale);
    if (g.mode === 'training') {
      c.textAlign = 'center'; c.font = `14px ${UI_FONT}`; c.fillStyle = '#ddd9ee';
      c.fillText('训练模式 · 无限能量 · 停手后对手恢复', W / 2, 520);
    }
    c.restore();
    // After the shake and the super zoom, so the line stays under the portraits instead of sliding into them.
    drawCombo(c, g, this.comboBaseline());

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
          if (!violetHidden(her)) zoomAbout(v, bodyScale, her.x, her.y, () => this.view(her.data.id).draw(v, her, her.x, her.y, 1));
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
      zoomAbout(c, bodyScale, gx, her ? her.y : FLOOR, () => {
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
      });
      c.restore();
    }
  }

  /** `?fps` readout for phone testing: the last sampled average frame gap, and the lite tier. */
  drawFps(avgMs: number): void {
    const c = this.ctx;
    c.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    c.font = `14px ${UI_FONT}`;
    c.textAlign = 'center';
    c.fillStyle = '#fff';
    const fps = avgMs ? `${Math.round(1000 / avgMs)} fps · ${avgMs.toFixed(1)} ms` : '-- fps';
    c.fillText(fps + (isLiteFx() ? ' · 精简' : ''), W / 2, 110);
  }

  private view(id: string): FighterView {
    const v = this.views.get(id);
    if (!v) throw Error('缺少角色视图：' + id);
    return v;
  }

  /** The art, resampled to the backing store with the stage shade on top, so each frame is one
      1:1 blit instead of a filtered upscale plus a second full-screen blend. Rebaked when the
      backing store resizes or the full art replaces the slow-link preview. */
  private stageBake: HTMLCanvasElement | undefined;
  private stageKey = '';

  /** 领域 backdrop: the last painted field and the one it is crossfading from. */
  private domainBg = '';
  private domainPrev = '';
  private domainSwitch = 0;
  /** Backdrops baked at the backing-store size, so a frame is one 1:1 blit instead of a
       full-screen filtered upscale. Cleared whenever the backing store resizes. */
  private domainBakes = new Map<string, HTMLCanvasElement>();
  private domainBakeSize = '';

  /** Paints the active domain's backdrop, crossfading on a cover, a resume or a lift. */
  private drawDomains(c: CanvasRenderingContext2D, g: FightGame): void {
    const next = g.domainBg;
    if (next !== this.domainBg) {
      this.domainPrev = this.domainBg;
      this.domainBg = next;
      this.domainSwitch = performance.now() / 1000;
    }
    const k = Math.min(1, Math.max(0, (performance.now() / 1000 - this.domainSwitch) / .25));
    if (this.domainPrev && k < 1) {
      const prev = this.bakeDomain(this.domainPrev);
      if (prev) {
        c.globalAlpha = 1 - k;
        c.drawImage(prev, 0, 0, W, H);
      }
    }
    if (this.domainBg) {
      const im = this.bakeDomain(this.domainBg);
      if (im) {
        c.globalAlpha = k;
        c.drawImage(im, 0, 0, W, H);
      }
    }
    c.globalAlpha = 1;
    if (k >= 1) this.domainPrev = '';
  }

  /** One filtered draw per backdrop size, not one per frame. */
  private bakeDomain(src: string): HTMLCanvasElement | null {
    const size = this.canvas.width + 'x' + this.canvas.height;
    if (size !== this.domainBakeSize) {
      this.domainBakes.clear();
      this.domainBakeSize = size;
    }
    const hit = this.domainBakes.get(src);
    if (hit) return hit;
    const im = this.images.get(src);
    if (!im?.naturalWidth) return null;
    const cv = document.createElement('canvas');
    cv.width = this.canvas.width;
    cv.height = this.canvas.height;
    const g = cv.getContext('2d');
    if (!g) return null;
    g.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, W, H);
    this.domainBakes.set(src, cv);
    return cv;
  }

  private drawStage(): void {
    const c = this.ctx, s = this.stage;
    // A slow link starts on the 480px preview; the cover math below only reads the aspect.
    const full = s.image ? this.images.get(s.image) : undefined;
    const bg = full?.naturalWidth || !s.image ? full : this.images.get(stageThumbSrc(s.image));
    const art = bg && bg.naturalWidth ? bg : undefined;
    const key = this.canvas.width + '|' + this.canvas.height + '|' + (art?.src ?? '');
    if (key !== this.stageKey || !this.stageBake) {
      const bake = this.stageBake ?? document.createElement('canvas');
      bake.width = this.canvas.width;
      bake.height = this.canvas.height;
      const g = bake.getContext('2d', { alpha: false });
      if (!g) return;
      g.setTransform(this.sx, 0, 0, this.sy, 0, 0);
      if (art) {
        g.imageSmoothingEnabled = true;
        this.paintBackdrop(g, art);
      } else {
        this.paintFlat(g);
      }
      g.fillStyle = s.shade ?? '#10101b20'; g.fillRect(0, 0, W, H);
      this.stageBake = bake;
      this.stageKey = key;
    }
    c.drawImage(this.stageBake, 0, 0, W, H);
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
