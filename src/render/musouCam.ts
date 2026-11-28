import { FLOOR } from '../game/constants.ts';
import type { FightGame } from '../game/game.ts';
import type { MusouDirector } from '../musou/director.ts';

/* 音浪无双的镜头调度（纯画面，不碰模拟）。导演排事件（director.cams），这里按真实时间演：
   - 基础：FEVER 拉远、跟拍轻抖；平时略看向她面朝的一侧，并往威胁多的一侧偏一点（前瞻构图）。
   - shot：推近 / 拉远到某个点一会儿（进 0.12 秒、出 0.3 秒），带黑边的会在屏幕上下压出窄条、报名牌。
   - kick：往打击方向顶一下，弹回。
   输出一组变换：以 (fx, FLOOR) 为轴缩放 z，再整体平移 (ox, oy)。 */

const W = 960;

interface Shot { x: number; y: number; zoom: number; dur: number; t: number; lb: boolean; name?: string; sub?: string }

export interface CamView { z: number; fx: number; fy: number; ox: number; oy: number; lb: number; name: string; sub: string; nameK: number }

export type MusouVisibility = (x: number, y: number, rx: number, ry?: number) => boolean;

/** Convert the visible bitmap to world bounds once, after the shake and zoom transforms. */
export function musouVisibility({ a, d, e, f }: Pick<DOMMatrixReadOnly, 'a' | 'd' | 'e' | 'f'>, left: number, right: number, height: number): MusouVisibility {
  const x0 = (left - e) / a, x1 = (right - e) / a;
  const y0 = -f / d, y1 = (height - f) / d;
  return (x, y, rx, ry = rx) => x + rx >= x0 && x - rx <= x1 && y + ry >= y0 && y - ry <= y1;
}

export class MusouCam {
  private shots: Shot[] = [];
  private kx = 0; private ky = 0; private vx = 0; private vy = 0;
  private look = 0;
  private last = 0;
  private game: FightGame | null = null;
  view: CamView = { z: 1, fx: W / 2, fy: FLOOR, ox: 0, oy: 0, lb: 0, name: '', sub: '', nameK: 0 };

  update(g: FightGame, m: MusouDirector, reduced: boolean): CamView {
    if (this.game !== g) { this.game = g; this.shots.length = 0; this.kx = this.ky = this.vx = this.vy = this.look = 0; }
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(.05, Math.max(0, now - this.last)) : 1 / 60;
    this.last = now;
    for (const e of m.cams.splice(0)) {
      if (e.k === 'kick') { if (!reduced) { this.vx += e.dx * 40; this.vy += e.dy * 40; } continue; }
      this.shots.push({ x: e.x, y: e.y, zoom: e.zoom, dur: e.dur, t: 0, lb: !!e.lb, name: e.name, sub: e.sub });
    }
    // 弹簧：冲击顶出去再弹回来。
    const k = 520, damp = 26;
    this.vx += (-k * this.kx - damp * this.vx) * dt; this.kx += this.vx * dt;
    this.vy += (-k * this.ky - damp * this.vy) * dt; this.ky += this.vy * dt;

    const lead = g.fighters[0];
    // 前瞻：面朝的一侧多留一点空间；人多的一侧再偏一点（最多 40）。
    let bias = 0;
    if (lead) {
      let l = 0, r = 0;
      for (const f of g.fighters) if (f.mob && f.hp > 0) { if (f.x < lead.x) l++; else r++; }
      bias = -lead.facing * 22 - Math.max(-18, Math.min(18, (r - l) * .6));
    }
    this.look += (bias - this.look) * Math.min(1, dt * 2.5);

    const fk = m.feverK;
    let z = 1 - (m.feverBig ? .085 : .06) * fk;
    let fx = W / 2, fy = FLOOR;
    let lb = 0, name = '', sub = '', nameK = 0;
    let best = 0;
    for (const s of this.shots) {
      s.t += dt;
      const w = s.t < .12 ? ease(s.t / .12) : s.t < s.dur ? 1 : Math.max(0, 1 - (s.t - s.dur) / .3);
      if (w <= best) continue;
      best = w;
      z = z * (1 + (s.zoom - 1) * w);
      // 推近时把焦点挪到事件上（拉远时焦点不动，只是看得更宽）。
      if (s.zoom > 1) { fx = W / 2 + (s.x - W / 2) * w * .85; fy = FLOOR + (s.y - FLOOR) * w * .35; }
      if (s.lb) { lb = w; if (s.name) { name = s.name; sub = s.sub ?? ''; nameK = Math.min(1, s.t / .25) * (s.t < s.dur ? 1 : w); } }
    }
    this.shots = this.shots.filter(s => s.t < s.dur + .3);
    if (reduced) { z = 1 - .04 * fk; fx = W / 2; fy = FLOOR; }
    const beat = g.age * m.bpm / 60;
    const shakeX = reduced ? 0 : Math.sin(beat * Math.PI * 2) * 1.4 * fk;
    const shakeY = reduced ? 0 : Math.abs(Math.sin(beat * Math.PI)) * -1.6 * fk;
    this.view = { z, fx, fy, ox: (reduced ? 0 : this.look) + this.kx + shakeX, oy: this.ky + shakeY, lb, name, sub, nameK };
    return this.view;
  }
}

function ease(k: number): number { return 1 - (1 - k) ** 3; }
