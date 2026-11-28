import type { StageData } from '../data/types.ts';
import type { Effect, FightGame } from '../game/game.ts';
import type { FighterView } from './view.ts';
import type { Fighter } from '../game/fighter.ts';
import { loadInto, stageThumbSrc, type ImageCache } from '../assets/loader.ts';
import { FLOOR, H, SIDE, W } from '../game/constants.ts';
import { comboAnchor } from '../ui/battleFrame.ts';
import { unbowedRage, violetHidden } from '../game/combat.ts';
import { BURDEN_Y, encoreDark, IAIDO_PHASE, iaidoCharge, RARE_TIME, RARE_Y, UNBOWED_MAX, unbowedStacks } from './clips.ts';
import { drawBanSign, drawCombo, drawEffect, drawMoonlight, drawGauge, drawHoldNote, drawKuji, drawLayerBass, drawParticles, drawProjectile, drawRainbowBack, drawRainbowFront, drawRootFx, drawSister, drawTexts, drawWheel, UI_FONT, zoomAbout } from './fx.ts';
import { cameraView } from '../ui/battleCamera.ts';
import { isLiteFx } from './fxQuality.ts';
import { drawFinale } from './finale.ts';
import { SAKIKO_BACK, SAKIKO_SCREEN_BACK } from './sakikoFx.ts';
import { MIKU_BACK, MIKU_SCREEN_BACK } from './mikuFx.ts';
import { drawStatusAuras, statusBodyOf } from './statusMarks.ts';
import { SHIZUKU_BACK } from './shizukuFx.ts';
import { CHIERI_BACK, CHIERI_SCREEN_FRONT } from './chieriFx.ts';
import { YOMOGI_BACK, YOMOGI_SCREEN_BACK, YOMOGI_SCREEN_FRONT, drawHeartBack, drawHeartFront } from './yomogiFx.ts';
import { MASKING_BACK, MASKING_SCREEN_BACK } from './maskingFx.ts';
import { TAE_BACK, TAE_SCREEN_BACK } from './taeFx.ts';
import { SAAYA_BACK, SAAYA_SCREEN_BACK } from './saayaFx.ts';
import { KANON_BACK, KANON_SCREEN_BACK } from './kanonFx.ts';
import { ANON_BACK } from './anonFx.ts';
import { UMIRI_BACK } from './umiriFx.ts';
import { AKO_BACK, AKO_SCREEN_BACK, AKO_SCREEN_FRONT } from './akoFx.ts';
import { RINKO_BACK, RINKO_SCREEN_BACK, RINKO_SCREEN_FRONT } from './rinkoFx.ts';
import { RIMI_BACK } from './rimiFx.ts';
import { HIMARI_BACK, HIMARI_SCREEN_BACK, HIMARI_SCREEN_FRONT } from './himariFx.ts';
import { TOMOE_BACK, TOMOE_SCREEN_BACK, TOMOE_SCREEN_FRONT } from './tomoeFx.ts';
import { TSUGUMI_BACK, TSUGUMI_SCREEN_BACK } from './tsugumiFx.ts';
import { NIJIKA_SCREEN_BACK, drawNijikaRollBack } from './nijikaFx.ts';
import { KITA_BACK, KITA_SCREEN_BACK, KITA_SCREEN_FRONT } from './kitaFx.ts';
import { SHIORI_BACK, drawShioriHover } from './shioriFx.ts';
import { hoverFull, hoverGlide, hoverLevel, hoverLift, hoverSpec, hoverTrailX, stepHover } from './hover.ts';
import { RYO_BACK, RYO_SCREEN_BACK } from './ryoFx.ts';
import { NINA_BACK, NINA_SCREEN_BACK, drawNinaBack } from './ninaFx.ts';
import { MOMOKA_BACK, MOMOKA_SCREEN_BACK } from './momokaFx.ts';
import { SUBARU_BACK, SUBARU_SCREEN_FRONT } from './subaruFx.ts';
import { TOMO_BACK, TOMO_SCREEN_BACK } from './tomoFx.ts';
import { RUPA_BACK, RUPA_SCREEN_BACK } from './rupaFx.ts';
import { TENSORA_BACK } from './tensoraFx.ts';
import { KAORU_BACK, KAORU_SCREEN_BACK } from './kaoruFx.ts';
import { HAGUMI_BACK, HAGUMI_SCREEN_BACK } from './hagumiFx.ts';
import { drawTokoSoloLight, TOKO_BACK } from './tokoFx.ts';
import { RUI_BACK } from './ruiFx.ts';
import { NANAMI_BACK } from './nanamiFx.ts';
import { PAREO_SCREEN_FRONT } from './pareoFx.ts';
import { CHISATO_BACK, CHISATO_SCREEN_BACK, CHISATO_SCREEN_FRONT } from './chisatoFx.ts';
import { MAYA_BACK, MAYA_SCREEN_BACK, MAYA_SCREEN_FRONT } from './mayaFx.ts';
import { MIZUHO_BACK, MIZUHO_SCREEN_BACK } from './mizuhoFx.ts';
import { BOCCHI_BACK, BOCCHI_SCREEN_BACK, drawBocchiSolo } from './bocchiFx.ts';
import { LOCK_BACK, LOCK_SCREEN_BACK } from './lockFx.ts';
import { heartTier } from './clips.ts';
import { clamp } from '../game/constants.ts';
import { getPlaceholderPack, MOB_BAKE_CELL, MOB_CELL, resolveCustomArt, STREET_ART, type MusouArtPack } from '../musou/placeholders.ts';
import type { MobDebris } from '../musou/director.ts';
import { drawMusouBack, drawMusouFront } from './musouFx.ts';
import { drawVaporStreet } from './musouStreet.ts';
import { drawBanner, drawHurtEdge, drawMusouUi } from './musouJuice.ts';
import { MusouCam, musouVisibility, type CamView, type MusouVisibility } from './musouCam.ts';
import { TAGS } from '../musou/songs.ts';
import { reducedMotion } from '../ui/motion.ts';
/** 音浪无双杂兵纵深：后排到前排往下错开的像素。 */
const MOB_DEPTH = 16;

/** Pixels per CSS pixel. Lite reduces the effective scale after the mobile cap. */
export function backingScale(dpr: number, touch: boolean, lite: boolean, musou = false): number {
  const native = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  if (!touch) return native;
  return Math.min(native, musou ? 1.5 : 2) * (lite ? .75 : 1);
}

/** Pad-split portrait draws bodies and their effects 1.3×. The 960×540 stage stays put. */
export function portraitBodyScale(padSplit: boolean): number {
  return padSplit ? 1.3 : 1;
}

/** Hard 1px rim, yellow for the left team and green for the right. */
const TEAM_GLOW = SIDE;
/** 剧情闯关的梦魇（复制体）：紫描边 + 深紫压暗。和纸板背面揭晓时的紫色裂纹同一个紫。 */
const NIGHTMARE_RIM = '#9a5cff';
const NIGHTMARE_TINT = '#170a2c';
const NIGHTMARE_DIM = .42;
/** Effects painted under every body: 和泉朋花's coffin and her spotlights. */
/** 悬浮 looks by view.hover.aura: drawn under the bodies every frame while she floats. */
const HOVER_AURA: Record<string, (c: CanvasRenderingContext2D, f: Fighter, lift: number, level: number, age: number, lite: boolean) => void> = {
  'shiori-hover': drawShioriHover,
};
const BACK_FX = new Set([...SHIORI_BACK, 'coffin', 'stage-lights', 'spotlight', 'nagi-sea', 'encore-spot', 'family-lineup', 'family-zone', 'family-door', ...SAKIKO_BACK, ...MIZUHO_BACK, ...MIKU_BACK, ...SHIZUKU_BACK, ...CHIERI_BACK, ...YOMOGI_BACK, ...MASKING_BACK, ...TAE_BACK, ...SAAYA_BACK, ...HIMARI_BACK, ...TOMOE_BACK, ...TSUGUMI_BACK, ...KAORU_BACK, ...HAGUMI_BACK, ...TOKO_BACK, ...RUI_BACK, ...NANAMI_BACK, ...CHISATO_BACK, ...MAYA_BACK, ...BOCCHI_BACK, ...LOCK_BACK, ...KANON_BACK, ...AKO_BACK, ...RINKO_BACK, ...RIMI_BACK, ...ANON_BACK, ...UMIRI_BACK, ...NINA_BACK, ...MOMOKA_BACK, ...SUBARU_BACK, ...TOMO_BACK, ...RUPA_BACK, ...TENSORA_BACK, ...KITA_BACK, ...RYO_BACK]);
/** Screen-space layers that ignore the body zoom: behind every body, and in front of them. */
const SCREEN_BACK = new Set(['encore-stage', 'family-dim', ...SAKIKO_SCREEN_BACK, ...MIZUHO_SCREEN_BACK, ...MIKU_SCREEN_BACK, ...YOMOGI_SCREEN_BACK, ...MASKING_SCREEN_BACK, ...TAE_SCREEN_BACK, ...SAAYA_SCREEN_BACK, ...HIMARI_SCREEN_BACK, ...TOMOE_SCREEN_BACK, ...TSUGUMI_SCREEN_BACK, ...NIJIKA_SCREEN_BACK, ...KITA_SCREEN_BACK, ...RYO_SCREEN_BACK, ...NINA_SCREEN_BACK, ...MOMOKA_SCREEN_BACK, ...TOMO_SCREEN_BACK, ...RUPA_SCREEN_BACK, ...KAORU_SCREEN_BACK, ...HAGUMI_SCREEN_BACK, ...CHISATO_SCREEN_BACK, ...MAYA_SCREEN_BACK, ...BOCCHI_SCREEN_BACK, ...LOCK_SCREEN_BACK, ...KANON_SCREEN_BACK, ...AKO_SCREEN_BACK, ...RINKO_SCREEN_BACK]);
const SCREEN_FRONT = new Set(['encore-rain', 'encore-crowd', 'encore-call', 'slap-flash', ...CHIERI_SCREEN_FRONT, ...YOMOGI_SCREEN_FRONT, ...HIMARI_SCREEN_FRONT, ...TOMOE_SCREEN_FRONT, ...CHISATO_SCREEN_FRONT, ...MAYA_SCREEN_FRONT, ...AKO_SCREEN_FRONT, ...RINKO_SCREEN_FRONT, ...PAREO_SCREEN_FRONT, ...PAREO_SCREEN_FRONT, ...KITA_SCREEN_FRONT, ...SUBARU_SCREEN_FRONT]);
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
export function teamGlowOn(g: { fighters: { team: number; minion?: boolean; echo?: boolean; mob?: unknown; data: { id: string } }[] }): boolean {
  const n = [0, 0];
  const side = new Map<string, number>();
  for (const f of g.fighters) {
    if (f.mob) continue;
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
  private musouPack: MusouArtPack | null = null;
  private musouCam = new MusouCam();

  constructor(canvas: HTMLCanvasElement, views: Map<string, FighterView>, stage: StageData, images: ImageCache) {
    // The stage covers every pixel, so the page never needs to blend through the bitmap.
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.canvas = canvas;
    this.views = views;
    this.stage = stage;
    this.images = images;
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

  /** 切到界面坐标并返回界面的宽高（世界单位）。没有跟随镜头时就是 960×540 的世界坐标。
   *  有镜头时：屏幕 = tx + z × 画布；界面点 u 要落在屏幕 k·u，所以画布上的世界坐标 = (u − tx/k) / z。 */
  private uiSpace(): { w: number; h: number } {
    const cam = cameraView();
    const c = this.ctx;
    if (!cam) { c.setTransform(this.sx, 0, 0, this.sy, 0, 0); return { w: W, h: H }; }
    c.setTransform(this.sx / cam.z, 0, 0, this.sy / cam.z, -cam.tx / cam.k / cam.z * this.sx, -cam.ty / cam.k / cam.z * this.sy);
    return { w: cam.w / cam.k, h: cam.h / cam.k };
  }

  /** Size the backing store just before drawing the fixed 960×540 world. */
  private resize(musou: boolean): void {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    const touch = document.body.classList.contains('touch');
    const dpr = backingScale(window.devicePixelRatio, touch, isLiteFx(), musou);
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
    this.resize(g.mode === 'musou');
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
    // 音浪无双的镜头调度（musouCam.ts）：FEVER 拉远跟拍抖、事件推拉、打击冲击、前瞻构图。纯画面，不碰模拟。
    let visible: MusouVisibility | undefined;
    if (g.mode === 'musou' && g.musou) {
      const cam = this.musouCam.update(g, g.musou, reducedMotion());
      c.translate(W / 2 + cam.ox, cam.fy + cam.oy);
      c.scale(cam.z, cam.z);
      c.translate(-cam.fx, -cam.fy);
      const outer = cameraView();
      const toRaster = outer ? this.sx / (outer.k * outer.z) : 0;
      const left = outer ? Math.max(0, -outer.tx * toRaster - 2) : 0;
      const right = outer ? Math.min(this.canvas.width, (outer.w - outer.tx) * toRaster + 2) : this.canvas.width;
      visible = musouVisibility(c.getTransform(), left, right, this.canvas.height);
      if (!drawVaporStreet(c, g.musou, cam, g.age, this.images)) this.drawMusouStreet(c, g.musou.scrollX, cam);
      drawMusouBack(c, g, g.musou);
    }
    else this.drawStage();

    const bodyScale = portraitBodyScale(document.body.classList.contains('pad-split'));
    // 悬浮 (hover.ts): an effect that follows a floating body rides up with her drawn body.
    const fx = (e: Effect) => {
      const who = e.follow != null ? g.fighterById(e.follow) : undefined;
      const up = who ? hoverLift(who) : 0;
      if (!up) { drawEffect(c, e, this.images); return; }
      c.save();
      c.translate(0, -up);
      drawEffect(c, e, this.images);
      c.restore();
    };

    // 领域: the active field's backdrop sits under every body.
    this.drawDomains(c, g);
    // 圆形地面影子：跳得越高影越小；中心比脚线高 7px（FLOOR+3 再上移 10），对齐成图的实际脚线。
    // 悬浮 (hover.ts): step the float once a frame on the game clock, before anything reads it.
    // A KO win sends a floating winner up out of the frame.
    const over = g.phase === 'roundend' || g.phase === 'finished';
    for (const f of g.fighters) stepHover(f, g.age, over && f.hp > 0 && g.opponents(f).length === 0);
    // 满气威压: a floating fighter with a full meter draws nearby foes' shadows toward her.
    const pullOf = (f: Fighter): number => {
      let dx = 0;
      for (const h of g.fighters) {
        const d = hoverSpec(h)?.dread;
        if (!d || h.hp <= 0 || !g.isEnemy(f, h)) continue;
        const full = hoverFull(h);
        const gap = h.x - f.x, near = 1 - Math.abs(gap) / d;
        if (full > .01 && near > 0) dx += Math.sign(gap) * full * Math.min(1, near * 1.6) * 18;
      }
      return dx;
    };
    for (const f of g.fighters) {
      if (violetHidden(f)) continue;
      if (f.mob) {
        const air = Math.max(0, FLOOR - f.y);
        const k = Math.max(.35, 1 - air / 260) * (.9 + f.mob.depth * .16) * (f.mob.elite ? 1.6 : 1);
        const y = FLOOR - 6 + f.mob.depth * MOB_DEPTH;
        const rx = 26 * bodyScale * k, ry = 5.5 * bodyScale * k;
        if (visible && !visible(f.x, y, rx + 1, ry + 1)) continue;
        c.fillStyle = '#05050c38';
        c.beginPath();
        c.ellipse(f.x, y, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
        continue;
      }
      // 梦魇：影子深得几乎看不见地面（剧本里唯一的识别线索），也稍大一圈。
      const deep = f.nightmare && f.hp > 0;
      // 悬浮：影子更淡更小，随浮动一起呼吸。
      const hv = deep ? 0 : hoverLift(f);
      c.fillStyle = deep ? '#020104d9' : hv > 1 ? '#05050c2a' : '#05050c40';
      const pull = deep ? 0 : pullOf(f);
      c.beginPath();
      c.ellipse(f.x + pull * .5 * bodyScale, FLOOR - 7, Math.max(0, (deep ? 60 : 50) - (FLOOR - f.y) * .09 - hv * .35 + Math.abs(pull) * .6) * bodyScale, (deep ? 12 : 9) * bodyScale, 0, 0, Math.PI * 2);
      c.fill();
    }
    // 悬浮: her own look under her feet (a light pool on the floor, a few motes), behind every body.
    for (const f of g.fighters) {
      const aura = hoverSpec(f)?.aura;
      if (!aura || violetHidden(f) || f.hp <= 0) continue;
      const draw = HOVER_AURA[aura];
      if (draw) zoomAbout(c, bodyScale, f.x, f.y, () => draw(c, f, hoverLift(f), hoverLevel(f), g.age, isLiteFx()));
    }

    // 狼王来了: the dark veil and the moon pillar sit under every body, so the fighters stay lit.
    for (const e of g.effects) if (e.type === 'moonlight') drawMoonlight(c, e, 'back');
    // 寿来: the mark is painted on the floor, so it sits under every body.
    for (const e of g.effects) if (e.type === 'lifedraw-mark') zoomAbout(c, bodyScale, e.x, e.y, () => drawEffect(c, e, this.images));
    // 安可是主唱的: the house lights go down and the stage beams sweep behind every body.
    for (const e of g.effects) if (SCREEN_BACK.has(e.type)) drawEffect(c, e, this.images);
    // 康乃馨盛开之日 / 请成为主角吧♡: the coffin stands behind her and the spotlight falls behind the body it lights.
    for (const e of g.effects) if (BACK_FX.has(e.type)) zoomAbout(c, bodyScale, e.x, e.y, () => fx(e));

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
      zoomAbout(c, bodyScale * (e.scale ?? 1), e.x, e.y, () => this.view(f.data.id).draw(c, f, e.x, e.y, (e.alpha ?? .3) * (e.life / e.max), e.tint, undefined, pose));
    }
    // 彩虹色: the wash and the far bokeh sit behind the body and follow her head.
    for (const e of g.effects) {
      if (e.type !== 'rainbow-pop' || e.fighter == null) continue;
      const f = g.fighterById(e.fighter);
      if (f) zoomAbout(c, bodyScale, f.x, f.y, () => drawRainbowBack(c, e, f));
    }
    // 滑行残影: a floating fighter gliding leaves two faint tinted copies of her glide cell where she just was.
    for (const f of g.fighters) {
      const tint = hoverSpec(f)?.trail;
      const k = tint && f.hp > 0 && !violetHidden(f) ? hoverGlide(f) : 0;
      if (k <= .02) continue;
      const view = this.view(f.data.id);
      const pose = { sheet: 'common', col: 1, row: 0, facing: f.facing };
      for (const [ago, a] of [[.16, .14], [.08, .24]] as const) {
        const x = hoverTrailX(f, ago);
        if (Math.abs(x - f.x) < 8) continue;
        zoomAbout(c, bodyScale, x, f.y, () => view.draw(c, f, x, f.y, a * k, tint, undefined, pose));
      }
    }
    // 音浪无双：杂兵按纵深先画（主角永远压在人群上面），飞出去的残骸夹在杂兵和角色之间。
    const order = [...g.fighters].sort((a, b) => Number(!a.mob) - Number(!b.mob) || (a.mob && b.mob ? a.mob.depth - b.mob.depth : 0) || Number(a.hp > 0) - Number(b.hp > 0) || a.y - b.y);
    let debrisDrawn = !(g.mode === 'musou' && g.musou);
    const teamRim = teamGlowOn(g);
    for (const f of order) {
      // 哭泣的紫罗兰: between the vanish and the reappear she does not exist on screen.
      if (violetHidden(f)) continue;
      // 音浪无双 Q版杂兵：跳过 SpriteView / hardRim，直接从 128×128 预烘焙图集 drawImage。
      if (f.mob) {
        this.drawMusouMob(c, f, g.age, bodyScale, visible);
        continue;
      }
      if (!debrisDrawn) { debrisDrawn = true; this.drawMusouDebris(c, g.musou!.debris, bodyScale, visible); this.drawMusouCharges(c, g, bodyScale); }
      const view = this.view(f.data.id);
      // 梦魇的紫描边盖过队伍描边：镜像对局里一眼分得清谁是谁。
      // 音浪无双 FEVER：主角身上勾一圈本曲风的灯光色（背景同时压暗了一层），一眼就落在她身上。
      const feverRim = g.musou && g.musou.feverK > .3 && f === g.fighters[0] ? TAGS[g.musou.song.tag].mood.f2 : undefined;
      const outline = f.nightmare ? NIGHTMARE_RIM : feverRim ?? (teamRim ? TEAM_GLOW[f.team] : undefined);
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
        // 异常 that change the body (冻住's ice sculpture): its outline takes the rim's place, then washes of the
        // sprite's own silhouette and a light band clipped to it. All of it is the view's cached tint / rim.
        const look = f.hp > 0 ? statusBodyOf(f) : undefined;
        // 心跳计 (矢仓蓬咲): ゴゴゴ and the closing dark behind her once her heart is out of control.
        if (f.data.heart) drawHeartBack(c, f, g.age, lite);
        // 虹色神速滚奏: the rainbow halo and the extra arms sit behind her own body.
        if (f.attack?.skill.fx === 'nijika-roll' && f.hp > 0) drawNijikaRollBack(c, f, view, footY, alpha, lite);
        // 正义之刺: her body splits red / cyan for a beat behind itself.
        if (f.attack?.skill.fx === 'nina-thorns') drawNinaBack(c, f, view, footY, alpha, lite);
        view.draw(c, f, f.x, footY, alpha, undefined, look?.outline ?? outline);
        // 梦魇：整身压一层深紫，像本人被抽走了光。状态异常的着色照常叠在上面。
        if (f.nightmare) view.draw(c, f, f.x, footY, alpha * NIGHTMARE_DIM, NIGHTMARE_TINT);
        drawTokoSoloLight(c, f, view, footY, alpha);
        if (f.attack?.skill.fx === 'bocchi-hero' && f.hp > 0) drawBocchiSolo(c, f, lite);
        // 帝王引擎式误会: from 失控 up a shadow falls over the top of her face — killing intent, to anyone watching.
        if (f.data.heart && f.hp > 0 && heartTier(f.gauge) >= 2) {
          const vh = f.data.view.kind === 'sprite' ? f.data.view.height : 181;
          c.save();
          c.beginPath();
          c.rect(f.x - 100, footY - vh - 40, 200, vh * .2 + 40);
          c.clip();
          view.draw(c, f, f.x, footY, alpha * (heartTier(f.gauge) === 3 ? .5 : .36), '#04090b');
          c.restore();
        }
        if (look) {
          for (const w of look.washes) {
            c.save();
            c.globalCompositeOperation = w.mode ?? 'source-over';
            view.draw(c, f, f.x, footY, alpha * w.alpha, w.tint);
            c.restore();
          }
          if (look.shine) {
            // A slanted band rises across the body once every `every` seconds, clipped to a strip; the
            // sprite's tint draws only where the body is, so the band reads as light on ice.
            const s = look.shine;
            const k = (g.age % s.every) / s.every;
            const h = 200, y = footY - k * (h + 60) + 30;
            c.save();
            c.beginPath();
            c.moveTo(f.x - 80, y + 40); c.lineTo(f.x + 80, y - 40); c.lineTo(f.x + 80, y - 40 - s.width); c.lineTo(f.x - 80, y + 40 - s.width);
            c.closePath();
            c.clip();
            c.globalCompositeOperation = 'lighter';
            view.draw(c, f, f.x, footY, alpha * s.alpha * Math.sin(k * Math.PI), s.tint);
            c.restore();
          }
        }
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
        // 千樱梨樱桃炸弹: through the fuse she flushes cherry red from the feet up, a little more with every stack.
        if (f.attack?.skill.fx === 'cherry-bomb' && f.hp > 0 && f.attack.t < f.attack.skill.start + .08) {
          const a = f.attack, s = a.skill;
          const k = Math.min(1, a.t / s.start);
          const vh = f.data.view.kind === 'sprite' ? f.data.view.height : 181;
          c.save();
          c.beginPath();
          c.rect(f.x - 130, footY - (vh + 30) * k, 260, (vh + 40) * k + 8);
          c.clip();
          view.draw(c, f, f.x, footY, alpha * (.32 + .07 * Math.min(a.shots, 3) + .08 * Math.sin(g.age * 15)), '#ff2346');
          c.restore();
        }
        // 独占欢呼 (千樱梨登场): their light was taken — a dim wash while it lasts.
        if (f.hp > 0 && f.mods.some(m => m.kind === 'cheer' && m.left > 0)) view.draw(c, f, f.x, footY, alpha * .28, '#120a1c');
        if (f.attack?.skill.fx === 'encore' && encoreDark(f.attack.mode)) {
          view.draw(c, f, f.x, footY, alpha * .82, '#0a0b14');
          drawEffect(c, { type: 'encore-eye', x: f.x + f.facing * 2, y: footY - ENCORE_EYE_Y, color: '#ffffff', life: 1, max: 1, dir: f.facing });
        }
        drawLayerBass(c, f, this.images, alpha);
        // Holding guard: the generic cyan shield, or her own guard look held steady (aura.guard, n: 1), on her drawn body.
        if (f.blocking) {
          const own = f.data.aura?.guard;
          if (own) drawEffect(c, { type: own, x: f.x + f.facing * 28, y: f.y - hoverLift(f) - 82, color: f.data.color, life: 1, max: 1, radius: 58, dir: f.facing, n: 1, age: g.age });
          else drawEffect(c, { type: 'shield', x: f.x + f.facing * 28, y: f.y - 80, color: '#a6eeff', life: .14, max: .22, radius: 58 });
        }
        // 异常: every status wears its mark's drawing (statusMarks.ts). A slow or a root whose mark is not in
        // that table keeps the older look below.
        const marked = f.hp > 0 ? drawStatusAuras(c, f, g.age, this.images) : { slow: false, root: false };
        if (f.root > 0 && f.hp > 0 && !marked.root) drawRootFx(c, f, g.age);
        // 剑道三连: the stance charges — a wide ring collapses into her as the meter fills.
        if (f.attack?.skill.fx === 'iaido' && (f.attack.mode ?? IAIDO_PHASE.pending) === IAIDO_PHASE.stance) {
          const q = iaidoCharge(f.attack.t);
          drawEffect(c, { type: 'charge-ring', x: f.x, y: f.y - 88, color: '#d9c6ff', life: 1 - q, max: 1, radius: 100, age: f.attack.t });
        }
        if (f.slow > 0 && f.hp > 0 && !marked.slow) {
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
          // 宇田川巴's 爱之深，责之切: a little grey cloud of drizzle over the scolded head.
          // 香农栞's 恕难从命: two loose pages drifting down beside the weakened.
          else if (m.mark === 'shiori-weak') drawEffect(c, { type: 'shiori-weak-aura', x: f.x, y: f.y, color: '#fff4dc', life: 1, max: 1, age: g.age });
          else if (m.mark === 'tomoe-scold') drawEffect(c, { type: 'tomoe-scold-aura', x: f.x, y: f.y - (f.data.view.kind === 'sprite' ? f.data.view.height : 181) - 30, color: '#9a9aa8', life: 1, max: 1, age: g.age });
          else if (m.mark === 'spotlight') drawEffect(c, { type: 'spot-aura', x: f.x, y: footY, color: '#fff2fb', life: 1, max: 1, age: g.age });
          // 马桥心玖's 珍稀动物认证: the tag over their head; the upgrade flips it over to 奇葩神兽.
          else if (m.mark === 'rare' || m.mark === 'beast') drawEffect(c, { type: 'rare-tag', x: f.x, y: f.y - RARE_Y, color: '#22CCFF', life: m.left, max: RARE_TIME, n: m.mark === 'beast' ? 1 : 0, age: RARE_TIME - m.left });
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
        if (f.data.heart) drawHeartFront(c, f, g.age, this.images);
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
    for (const e of g.effects) if (e.type !== 'ghost' && e.type !== 'lifedraw-mark' && e.type !== 'petal-rain' && e.type !== 'rainbow-pop' && e.type !== 'apparatus' && e.type !== 'moonlight' && !SCREEN_FRONT.has(e.type) && !SCREEN_BACK.has(e.type) && !BACK_FX.has(e.type)) zoomAbout(c, bodyScale, e.x, e.y, () => fx(e));
    // Screen-space effects: the petal rain, the floor-to-sky pillar and the encore crowd must not grow with the body.
    for (const e of g.effects) if (e.type === 'petal-rain' || e.type === 'apparatus' || SCREEN_FRONT.has(e.type)) drawEffect(c, e, this.images);
    for (const e of g.effects) if (e.type === 'moonlight') drawMoonlight(c, e, 'front');
    if (g.musou && visible) drawMusouFront(c, g, g.musou, visible);
    drawParticles(c, g.particles, bodyScale);
    drawTexts(c, g.texts, bodyScale);
    drawKuji(c, g, bodyScale);
    c.restore();
    // 界面层：连击数、训练提示是贴在屏幕上的，不跟镜头走、不跟震屏和必杀聚焦走。
    // 跟随镜头开着时把镜头的位移和缩放反着乘回去，界面坐标就是「屏幕 ÷ 画面倍率」。
    const ui = this.uiSpace();
    if (g.mode === 'training') {
      c.textAlign = 'center'; c.font = `14px ${UI_FONT}`; c.fillStyle = '#ddd9ee';
      c.fillText('训练模式 · 无限能量 · 停手后对手恢复', ui.w / 2, ui.h - 20);
    }
    // After the shake and the super zoom, so the line stays under the portraits instead of sliding into them.
    drawCombo(c, g, this.comboBaseline(), ui.w);
    if (g.mode === 'musou' && g.musou) {
      drawHurtEdge(c, g.musou, g.fighters[0], ui.w, ui.h);
      drawMusouUi(c, g.musou, this.musouCam.view, ui.w, ui.h, g);
    }
    c.setTransform(this.sx, 0, 0, this.sy, 0, 0);

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

  /** 终幕: paint (or hide) the cut-in overlay. Its canvas covers the visible arena whatever the layout;
   *  the picture is letterboxed inside it (render/finale.ts). */
  drawFinaleCut(cv: HTMLCanvasElement, g: FightGame): void {
    const on = g.phase === 'finale' && g.finaleBy !== null;
    if (cv.hidden !== !on) cv.hidden = !on;
    if (!on) return;
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (!cw || !ch) return;
    const dpr = backingScale(window.devicePixelRatio || 1, document.body.classList.contains('touch'), isLiteFx());
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    // The killing frame as it sits on screen, in the overlay's pixels: the cut-in opens by freezing it.
    const gr = this.canvas.getBoundingClientRect(), or = cv.getBoundingClientRect();
    const k = w / (or.width || 1);
    drawFinale(c, w, h, g, this.images, { img: this.canvas, x: (gr.left - or.left) * k, y: (gr.top - or.top) * k, w: gr.width * k, h: gr.height * k });
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

  private getMusouPack(): MusouArtPack {
    return this.musouPack ??= getPlaceholderPack();
  }

  private drawMusouStreet(c: CanvasRenderingContext2D, scrollX: number, cam: CamView): void {
    const pack = this.getMusouPack();
    // 镜头推拉、平移以后画面能看到的世界范围：横向按这个范围取长街，纵向拉远时把整层轻轻拉高盖住上下的空隙。
    const x0 = cam.fx - (W / 2 + cam.ox) / cam.z - 4, vw = W / cam.z + 8;
    const y0 = cam.fy - (cam.fy + cam.oy) / cam.z, y1 = cam.fy + (H - cam.fy - cam.oy) / cam.z;
    const top = Math.min(0, y0 - 4), vh = Math.max(H, y1 + 4) - top;
    const drawLayer = (customSrc: string, fallback: HTMLCanvasElement, ox: number) => {
      const custom = resolveCustomArt(this.images, customSrc);
      const img: CanvasImageSource = custom ?? fallback;
      const iw = custom ? custom.naturalWidth : fallback.width;
      const sw = Math.min(iw, vw);
      const sx = clamp(ox + x0, 0, Math.max(0, iw - sw));
      c.drawImage(img, sx, 0, sw, H, sx - ox, top, sw, vh);
    };
    drawLayer(STREET_ART[0], pack.bgFar, scrollX * 0.25);
    drawLayer(STREET_ART[1], pack.bgMid, scrollX * 0.6);
    drawLayer(STREET_ART[2], pack.bgNear, scrollX);
  }

  private mobSheet(kind: string): { sheet: CanvasImageSource; cell: number } {
    const src = `/musou/mobs/${kind}.png`;
    const custom = resolveCustomArt(this.images, src);
    // 图集不在缓存里就按需拉一次（loadInto 自带去重；被内存回收后下一帧会自动重新拉）。到手前先用程序化占位。
    if (!custom) void loadInto(this.images, src, 1);
    return custom ? { sheet: custom, cell: MOB_CELL } : { sheet: this.getMusouPack().mobs[kind as keyof MusouArtPack['mobs']], cell: MOB_BAKE_CELL };
  }

  /** 一只杂兵：纵深往下错开并略放大；离地时按受击方向打转；挨打闪白。 */
  private drawMusouMob(c: CanvasRenderingContext2D, f: Fighter, age: number, bodyScale: number, visible?: MusouVisibility): void {
    const mob = f.mob;
    if (!mob) return;
    const k = (.9 + mob.depth * .16) * bodyScale * (mob.elite ? 1.55 : 1);
    const h = (mob.kind === 'guard' ? 108 : 112) * k;
    const y = f.y + mob.depth * MOB_DEPTH - h * .45;
    const air = FLOOR - f.y;
    // 离地才转；落地慢慢回正，不会突然弹直。
    if (air > 6) mob.spin += (mob.lastDir || -f.facing) * .32;
    else mob.spin *= .7;
    // Leave room for the rotated sheet and its rim. Keep in-flight spin for the debris pose.
    if (visible && !visible(f.x, y, h)) return;
    const { sheet, cell } = this.mobSheet(mob.kind);
    const hurt = f.stun > 0 || f.knocked > 0;
    const col = hurt ? 2 : Math.floor(age * 5.5 + mob.phase) % 2;
    c.save();
    c.translate(f.x, y);
    if (mob.spin) c.rotate(mob.spin);
    if (f.facing < 0) c.scale(-1, 1);
    // 挨打的一瞬间往受力方向压扁一下再弹回。
    if (f.hitFlash > 0) { const q = Math.min(1, f.hitFlash * 7.7); c.scale(1 + .2 * q, 1 - .16 * q); }
    // 精英：一圈金色描边（预警时转红），描边是预先烘好的纯色剪影错位画八次。
    if (mob.elite) {
      const warn = mob.elite.windup > 0;
      const rim = this.mobRim(sheet, warn ? '#ff5a5a' : '#FDE979');
      const d = Math.max(2, h * .028);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        c.drawImage(rim, col * cell, 0, cell, cell, -h / 2 + Math.cos(a) * d, -h * .55 + Math.sin(a) * d, h, h);
      }
    }
    c.drawImage(sheet, col * cell, 0, cell, cell, -h / 2, -h * .55, h, h);
    // 保安的盾：面朝方向一道青色弧，几层盾就几道。黄牛抢到经验：头顶一个金色小袋。
    if (mob.kind === 'guard' && mob.shield > 0) {
      c.strokeStyle = 'rgba(118,231,255,.85)';
      for (let i = 0; i < mob.shield; i++) {
        c.lineWidth = 3;
        c.beginPath(); c.arc(h * .05, -h * .05, h * (.42 + i * .07), -.9, .9); c.stroke();
      }
    }
    if (mob.kind === 'scalper' && mob.stolen > 0) {
      c.fillStyle = '#E9C46A';
      c.beginPath(); c.arc(0, -h * .62, h * .11, 0, Math.PI * 2); c.fill();
    }
    if (f.hitFlash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(1, f.hitFlash * 6) * .7;
      c.drawImage(sheet, col * cell, 0, cell, cell, -h / 2, -h * .55, h, h);
    }
    // 音箱怪残血：一闪一闪地泛红，提醒「别用普攻把它打死在身边」。
    if (mob.kind === 'amp' && !mob.elite && f.hp < f.data.hp * .55 && f.hp > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = .35 + .3 * Math.sin(age * 16);
      c.drawImage(this.mobRim(sheet, '#ff4a6a'), col * cell, 0, cell, cell, -h / 2, -h * .55, h, h);
    }
    c.restore();
  }

  /** 横幅冲锋队：五个粉丝一排举着横幅（走路两格交替，跑起来更快），撕开后人已经变成残骸飞走，只剩横幅两半。 */
  private drawMusouCharges(c: CanvasRenderingContext2D, g: FightGame, bodyScale: number): void {
    const m = g.musou;
    if (!m) return;
    for (const ch of m.charges) {
      const n = 5, gap = 34;
      const back = ch.x - ch.dir * (n - 1) * gap;
      const h = 112 * bodyScale;
      if (ch.broken < 0) {
        const { sheet, cell } = this.mobSheet('fan');
        const rate = ch.phase === 'run' ? 14 : 4;
        for (let i = n - 1; i >= 0; i--) {
          const x = ch.x - ch.dir * i * gap;
          const col = Math.floor(g.age * rate + i * .7 + ch.seed) % 2;
          c.save();
          c.translate(x, FLOOR - 4 + (i % 2) * 4 - h * .45);
          if (ch.dir < 0) c.scale(-1, 1);
          if (ch.phase === 'run') c.rotate(.12);
          c.drawImage(sheet, col * cell, 0, cell, cell, -h / 2, -h * .55, h, h);
          c.restore();
        }
      }
      drawBanner(c, m, ch, back - ch.dir * 18, ch.x + ch.dir * 18, FLOOR - 4 - h * .62, g.age);
    }
  }

  private rims = new Map<CanvasImageSource, Map<string, HTMLCanvasElement>>();
  /** 一张杂兵图集的纯色剪影（精英描边用），每张图每种颜色只烘一次。 */
  private mobRim(sheet: CanvasImageSource, color: string): HTMLCanvasElement {
    let byColor = this.rims.get(sheet);
    if (!byColor) { byColor = new Map(); this.rims.set(sheet, byColor); }
    let cv = byColor.get(color);
    if (cv) return cv;
    const sw = (sheet as HTMLImageElement).naturalWidth || (sheet as HTMLCanvasElement).width;
    const sh = (sheet as HTMLImageElement).naturalHeight || (sheet as HTMLCanvasElement).height;
    cv = document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    const x = cv.getContext('2d');
    if (x) {
      x.drawImage(sheet, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color;
      x.fillRect(0, 0, sw, sh);
    }
    byColor.set(color, cv);
    return cv;
  }

  /** 被打死的杂兵：用倒地格旋转着飞出去，最后半秒淡出。 */
  private drawMusouDebris(c: CanvasRenderingContext2D, list: readonly MobDebris[], bodyScale: number, visible?: MusouVisibility): void {
    for (const d of list) {
      const k = (.9 + d.depth * .16) * bodyScale * (d.big ? 1.55 : 1);
      const h = (d.kind === 'guard' ? 108 : 112) * k;
      const y = d.y + d.depth * MOB_DEPTH - h * .45;
      if (visible && !visible(d.x, y, h)) continue;
      const { sheet, cell } = this.mobSheet(d.kind);
      c.save();
      c.globalAlpha = Math.min(1, d.life * 2.2);
      c.translate(d.x, y);
      c.rotate(d.spin);
      if (d.facing < 0) c.scale(-1, 1);
      c.drawImage(sheet, 3 * cell, 0, cell, cell, -h / 2, -h * .55, h, h);
      c.restore();
    }
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
