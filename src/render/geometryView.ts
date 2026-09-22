import type { FighterView } from './view.ts';
import type { Fighter, Attack } from '../game/fighter.ts';
import { attackPhase, stateFor } from '../game/animState.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Build, type Dims } from './proportions.ts';

/* Colour-block bishoujo. Same poses a sprite sheet uses; proportions live in proportions.ts. */

/* Angles are radians from straight-down; positive swings toward the facing direction. */
type Limb = [number, number];
interface Pose { lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb; lying?: boolean; look?: number }

/* Fists forward-up so the facing direction reads at a glance. */
const IDLE: Pose = { lean: 0, crouch: 0, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
const BLOCK: Pose = { lean: -.05, crouch: 8, armF: [1.1, 1.5], armB: [.9, 1.7], legF: [.35, 0], legB: [-.2, 0] };
const HURT: Pose = { lean: -.3, crouch: 4, look: -.15, armF: [-.6, -.4], armB: [-.9, -.3], legF: [.4, 0], legB: [-.3, 0] };
const LYING: Pose = { ...HURT, crouch: 0, legF: [.1, 0], legB: [-.1, 0], lying: true };
const JUMP: Pose = { lean: .05, crouch: 0, armF: [2.4, -.4], armB: [-1.2, -.6], legF: [.9, -1.4], legB: [.3, -1.0] };
const PUNCH_WIND: Pose = { lean: -.08, crouch: 2, armF: [-.4, -1.9], armB: [.9, -1.6], legF: [.3, 0], legB: [-.3, 0] };
const PUNCH_HIT: Pose = { lean: .15, crouch: 2, look: .58, armF: [1.57, 0], armB: [.5, -1.8], legF: [.5, 0], legB: [-.4, 0] };
const KICK_WIND: Pose = { lean: -.1, crouch: 4, armF: [.5, -1.6], armB: [.8, -1.4], legF: [-.5, .8], legB: [0, 0] };
const KICK_HIT: Pose = { lean: -.25, crouch: 0, look: .5, armF: [-.3, -1.2], armB: [1.0, -1.2], legF: [1.5, .2], legB: [-.1, 0] };
const DASH_WIND: Pose = { lean: -.1, crouch: 10, armF: [-.9, -.8], armB: [-.7, -.7], legF: [.5, -.6], legB: [-.4, .3] };
const DASH: Pose = { lean: .45, crouch: 6, look: .6, armF: [-1.0, -.6], armB: [-1.3, -.5], legF: [1.1, -.3], legB: [-1.0, .6] };
const CAST_WIND: Pose = { lean: -.1, crouch: 2, armF: [-.3, -2.4], armB: [-.5, -2.3], legF: [.3, 0], legB: [-.3, 0] };
const CAST_HIT: Pose = { lean: .1, crouch: 2, armF: [1.4, 0], armB: [1.2, .15], legF: [.5, 0], legB: [-.35, 0] };
const GRAB_WIND: Pose = { lean: .1, crouch: 6, armF: [1.0, -.6], armB: [.8, -.4], legF: [.4, 0], legB: [-.3, 0] };
const GRAB_HIT: Pose = { lean: -.15, crouch: 0, armF: [2.6, -.6], armB: [2.4, -.5], legF: [.3, 0], legB: [-.3, 0] };
const UPPER_WIND: Pose = { lean: .1, crouch: 12, armF: [-.6, -.9], armB: [.3, -1.2], legF: [.5, -.5], legB: [-.3, .2] };
const UPPER_HIT: Pose = { lean: -.1, crouch: 0, armF: [3.0, .1], armB: [-.6, -.8], legF: [1.0, -1.6], legB: [.1, 0] };
const SWEEP_WIND: Pose = { lean: .1, crouch: 14, armF: [.6, -1.2], armB: [.4, -1.0], legF: [.3, -.4], legB: [-.4, .3] };
const SWEEP_HIT: Pose = { lean: .35, crouch: 22, armF: [-.2, -.9], armB: [-1.2, -.5], legF: [1.57, .1], legB: [-.4, .4] };
const ENDURE_WIND: Pose = { lean: -.2, crouch: 6, armF: [-1.4, -.6], armB: [.8, -1.5], legF: [.5, 0], legB: [-.4, 0] };
const ENDURE_HIT: Pose = { lean: .3, crouch: 4, armF: [1.57, 0], armB: [-.5, -1.0], legF: [.7, 0], legB: [-.5, 0] };
const LAUNCH_WIND: Pose = { lean: .15, crouch: 10, armF: [.3, .9], armB: [.6, -1.3], legF: [.4, 0], legB: [-.3, 0] };
const LAUNCH_HIT: Pose = { lean: -.1, crouch: 0, armF: [2.6, .2], armB: [-.4, -1.0], legF: [.5, 0], legB: [-.3, 0] };
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return { lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k), armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB), legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB) };
}

function attackPose(a: Attack): Pose {
  const s = a.skill;
  const { phase, k } = attackPhase(a);
  if (s.type === 'dash') {
    if (a.t < s.start) return mix(IDLE, DASH_WIND, ease(a.t / Math.max(.03, s.start)));
    if (a.t < s.duration - .08) return DASH;
    return mix(DASH, IDLE, ease((a.t - (s.duration - .08)) / .08));
  }
  const rest = s.air ? JUMP : IDLE;
  const [wind, impact] =
    s.type === 'light' ? [s.air ? JUMP : PUNCH_WIND, PUNCH_HIT] :
    s.type === 'heavy' ? (s.air ? [AIR_KICK_WIND, AIR_KICK_HIT] : [KICK_WIND, KICK_HIT]) :
    s.type === 'grab' ? [GRAB_WIND, GRAB_HIT] :
    s.type === 'upper' ? [UPPER_WIND, UPPER_HIT] :
    s.type === 'sweep' ? [SWEEP_WIND, SWEEP_HIT] :
    s.type === 'endure' ? [ENDURE_WIND, ENDURE_HIT] :
    s.type === 'launch' ? [LAUNCH_WIND, LAUNCH_HIT] : [CAST_WIND, CAST_HIT];
  if (phase === 'windup') return mix(rest, wind, ease(k));
  if (phase === 'active') return impact;
  return mix(impact, rest, ease(k));
}

function runPose(walk: number): Pose {
  const w = Math.sin(walk);
  return {
    lean: .1, crouch: 6, look: .55,
    armF: [-w * .85, w >= 0 ? -1.15 : 1.15], armB: [w * .85, w >= 0 ? 1.15 : -1.15],
    legF: [w * .55, -w * .4], legB: [-w * .55, w * .45],
  };
}

function poseFor(f: Fighter): Pose {
  switch (stateFor(f)) {
    case 'ko': case 'down': return f.y < 442.5 || f.vy < 0 ? HURT : LYING;
    case 'hurt': return HURT;
    case 'block': return BLOCK;
    case 'dodge': return mix(DODGE, IDLE, ease(Math.max(0, 1 - f.dodge / .1)));
    case 'jump': return f.landing > 0 ? mix(IDLE, BLOCK, .4) : JUMP;
    case 'run': return runPose(f.walk);
    case 'idle': { const b = Math.sin(f.animTime * 3) * 1.5; return { ...IDLE, crouch: 1.5 + b, armF: [IDLE.armF[0] + b * .02, IDLE.armF[1]], armB: [IDLE.armB[0], IDLE.armB[1] + b * .02] }; }
    default: return f.attack ? attackPose(f.attack) : IDLE;
  }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${ch(n >> 16 & 255)},${ch(n >> 8 & 255)},${ch(n & 255)})`;
}

const OUTLINE = '#151222';

export class GeometryView implements FighterView {
  private readonly color: string;
  private readonly dark: string;
  private readonly light: string;
  private readonly dims: Dims;

  constructor(color: string, build: Build) {
    this.color = color;
    this.dark = shade(color, .6);
    this.light = shade(color, 1.35);
    this.dims = DIMS[build];
  }

  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number): void {
    const d = this.dims, pose = poseFor(f);
    ctx.save();
    try {
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(f.facing, 1);
      ctx.globalAlpha = alpha;
      if (f.hitFlash > 0) ctx.filter = 'brightness(2.1)';
      else if (f.invuln > .1) ctx.filter = 'brightness(1.25)';
      if (pose.lying) { ctx.translate(-10, -d.torsoW / 2 - 4); ctx.rotate(-Math.PI / 2); }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const legLen = d.thigh + d.shin;
      const hip = { x: 0, y: -legLen + pose.crouch };
      const shoulder = { x: hip.x + Math.sin(pose.lean) * d.torsoH, y: hip.y - Math.cos(pose.lean) * d.torsoH };
      // ponytail: crouch drops the hip without inverse kinematics; feet sink a few px, invisible at arcade scale.
      const bend = pose.crouch * .03;

      this.limb(ctx, hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh, d.shin, this.dark);
      this.limb(ctx, shoulder, pose.armB, d.upperArm, d.foreArm, this.dark);
      this.torso(ctx, hip, shoulder);
      this.head(ctx, shoulder, pose);
      this.limb(ctx, hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh, d.shin, this.color);
      this.limb(ctx, shoulder, pose.armF, d.upperArm, d.foreArm, this.color);
    } finally {
      ctx.restore();
    }
  }

  private torso(ctx: CanvasRenderingContext2D, hip: { x: number; y: number }, shoulder: { x: number; y: number }): void {
    const radii = torsoRadii(this.dims.torsoW);
    for (const [pad, c] of [[2, OUTLINE], [0, this.color]] as [number, string][]) {
      const pts = torsoPoints(hip, shoulder, radii, pad);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private head(ctx: CanvasRenderingContext2D, shoulder: { x: number; y: number }, pose: Pose): void {
    const r = this.dims.headR;
    const cx = shoulder.x + Math.sin(pose.lean) * (r + NECK), cy = shoulder.y - Math.cos(pose.lean) * (r + NECK);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.light; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .28 + pose.lean));
    const ex = cx + r * gaze, ey = cy - r * .08, er = Math.max(2.4, r * .42);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.light; ctx.beginPath(); ctx.arc(ex + er * .35, ey - er * .2, er * .38, 0, Math.PI * 2); ctx.fill();
  }

  private limb(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, [a1, a2]: Limb, l1: number, l2: number, color: string): void {
    const mid = { x: from.x + Math.sin(a1) * l1, y: from.y + Math.cos(a1) * l1 };
    const end = { x: mid.x + Math.sin(a1 + a2) * l2, y: mid.y + Math.cos(a1 + a2) * l2 };
    for (const [w, c] of [[this.dims.limb + 4, OUTLINE], [this.dims.limb, color]] as [number, string][]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(mid.x, mid.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    }
  }
}
