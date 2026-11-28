import type { Fighter } from '../game/fighter.ts';
import type { FightGame } from '../game/game.ts';
import { FLOOR } from '../game/constants.ts';

/* 乐器武器与自动武器：每步自己出手，命中一律走 director.strike（即原版 hit()，杂兵走轻量分支、Boss 照常吃伤害）。
   这里只有模拟；画法在 render/musouFx.ts，读 fx / shots / orbs。 */

export type WeaponId = 'fan' | 'ring' | 'quake' | 'beam' | 'cone' | 'orbit' | 'notes' | 'homing' | 'rig' | 'aura';

/** 称号里没写乐器的人（Ave Mujica 的称号是人设）按实际担当补上。 */
const PART: Record<string, string> = { mutsumi: '吉他', umiri: '贝斯', sakiko: '键盘', anon: '吉他', rui: '吉他', tensora: '贝斯', uika: '主唱' };

/** 角色乐器 → 开局自带的武器。 */
export function instrumentWeapon(title: string, id = ''): WeaponId {
  const t = PART[id] ?? title.split('/').map(x => x.trim()).join(' ');
  if (t.includes('DJ')) return 'orbit';
  if (t.includes('吉他')) return 'fan';
  if (t.includes('鼓')) return 'ring';
  if (t.includes('贝斯')) return 'quake';
  if (t.includes('键盘')) return 'beam';
  return 'cone';
}

export const WEAPON_NAME: Record<WeaponId, string> = {
  fan: '音符扇射', ring: '节拍冲击', quake: '低频地震', beam: '贯穿光束', cone: '声波锥',
  orbit: '环绕唱片', notes: '环绕音符', homing: '追踪拨片', rig: '落雷灯架', aura: '应援光环',
};

export interface WFx { k: string; x: number; y: number; r: number; dir: number; life: number; max: number; lv: number; evo: boolean; w?: number }
export interface WShot { k: 'note' | 'pick' | 'boom'; x: number; y: number; vx: number; vy: number; life: number; pierce: number; hit: Set<number>; dmg: number; target: number; evo: boolean; spin: number }
export interface WOrb { k: 'disc' | 'note'; x: number; y: number; evo: boolean }
export interface WArm { id: WeaponId; lv: number; evo: boolean; cd: number }

export interface ArmsHost {
  strike(g: FightGame, target: Fighter, dmg: number, opts?: { dir?: number; up?: number; knock?: number; heavy?: boolean }): void;
  bpm: number;
  /** 范围爆炸也打得到巨型障碍物（音浪无双导演接）。 */
  blastAt?(g: FightGame, x: number, r: number, dmg: number): void;
}

const enemies = (g: FightGame, lead: Fighter, out: Fighter[]): Fighter[] => {
  out.length = 0;
  for (const f of g.fighters) if (f.team !== lead.team && f.hp > 0 && !f.echo) out.push(f);
  return out;
};
const scratch: Fighter[] = [];
const bodyY = (f: Fighter) => f.y - (f.mob ? 45 : 85);

export class Arsenal {
  arms: WArm[] = [];
  fx: WFx[] = [];
  shots: WShot[] = [];
  orbs: WOrb[] = [];
  private orbitT = 0;
  private touch = new Map<string, number>();
  private clock = 0;

  set(id: WeaponId, lv: number, evo: boolean): void {
    const a = this.arms.find(w => w.id === id);
    if (a) { a.lv = lv; a.evo = evo; } else this.arms.push({ id, lv, evo, cd: .4 });
  }
  get(id: WeaponId): WArm | undefined { return this.arms.find(w => w.id === id); }

  step(g: FightGame, lead: Fighter, host: ArmsHost, dt: number): void {
    this.clock += dt;
    this.orbitT += dt;
    this.orbs.length = 0;
    const foes = enemies(g, lead, scratch);
    for (const a of this.arms) {
      a.cd -= dt * (2 - Math.min(1.6, lead.cdMul)) ;
      this.continuous(g, lead, host, a, foes);
      if (a.cd > 0) continue;
      a.cd = this.fire(g, lead, host, a, foes);
    }
    this.stepShots(g, lead, host, foes, dt);
    let w = 0;
    for (const e of this.fx) { e.life -= dt; if (e.life > 0) this.fx[w++] = e; }
    this.fx.length = w;
  }

  /** 每步都在的武器（环绕、光环）。 */
  private continuous(g: FightGame, lead: Fighter, host: ArmsHost, a: WArm, foes: Fighter[]): void {
    if (a.id === 'orbit' || a.id === 'notes') {
      const n = (a.id === 'orbit' ? 1 : 1) + a.lv + (a.evo ? a.lv : 0);
      const base = a.id === 'orbit' ? 100 : 135;
      const r = base + (a.evo ? Math.sin(this.orbitT * 2.4) * 40 : 0);
      const spin = (a.id === 'orbit' ? 3.4 : -2.6) * (a.evo ? 1.3 : 1);
      const cy = lead.y - 70;
      for (let i = 0; i < n; i++) {
        const ang = this.orbitT * spin + i * Math.PI * 2 / n;
        const x = lead.x + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * .42;
        this.orbs.push({ k: a.id === 'orbit' ? 'disc' : 'note', x, y, evo: a.evo });
        for (const f of foes) {
          if (Math.abs(f.x - x) > 34 || Math.abs(bodyY(f) - y) > 60) continue;
          const key = a.id + f.id;
          if ((this.touch.get(key) ?? 0) > this.clock) continue;
          this.touch.set(key, this.clock + .4);
          host.strike(g, f, (a.id === 'orbit' ? 11 : 9) + a.lv * 3 + (a.evo ? 8 : 0), { dir: Math.sign(f.x - lead.x) || 1, knock: 120 });
        }
      }
      if (this.touch.size > 600) this.touch.clear();
    } else if (a.id === 'aura') {
      const r = 95 + a.lv * 16;
      if (!this.fx.some(e => e.k === 'aura')) this.fx.push({ k: 'aura', x: lead.x, y: lead.y, r, dir: 1, life: 1e9, max: 1e9, lv: a.lv, evo: a.evo });
      for (const e of this.fx) if (e.k === 'aura') { e.x = lead.x; e.y = lead.y; e.r = r; e.lv = a.lv; }
      if (a.cd > 0) return;
      for (const f of foes) if (Math.abs(f.x - lead.x) < r && Math.abs(f.y - lead.y) < 120) host.strike(g, f, 6 + a.lv * 2, { dir: Math.sign(f.x - lead.x) || 1, knock: 60 });
    }
  }

  /** 到点出手，返回下一次的冷却。 */
  private fire(g: FightGame, lead: Fighter, host: ArmsHost, a: WArm, foes: Fighter[]): number {
    const lv = a.lv, evo = a.evo, face = lead.facing;
    const cx = lead.x, cy = lead.y - 70;
    switch (a.id) {
      case 'fan': {
        const n = evo ? 16 : 3 + lv;
        const spread = evo ? Math.PI : .22 + lv * .05;
        for (let i = 0; i < n; i++) {
          const ang = evo ? i / n * Math.PI * 2 : (n === 1 ? 0 : -spread + i / (n - 1) * spread * 2);
          const vx = Math.cos(ang) * 640 * (evo ? 1 : face), vy = Math.sin(ang) * 640 * .55;
          this.shots.push({ k: 'note', x: cx + face * 30, y: cy, vx, vy, life: .75, pierce: 1 + (lv >> 1) + (evo ? 2 : 0), hit: new Set(), dmg: (13 + lv * 4) * (evo ? 1.5 : 1), target: -1, evo, spin: 0 });
        }
        return 1.15 - lv * .08;
      }
      case 'ring': {
        const R = (140 + lv * 20) * (evo ? 1.25 : 1);
        this.blast(g, lead, host, cx, lead.y, R, 16 + lv * 5, 'ring', a, 280);
        if (evo) this.fx.push({ k: 'ring2', x: cx, y: lead.y, r: R * 1.45, dir: 1, life: .55, max: .55, lv, evo });
        const beat = 60 / Math.max(80, host.bpm);
        return Math.max(.55, beat * (lv >= 4 ? 2 : 3));
      }
      case 'quake': {
        const dirs = evo ? [-1, 1, -1, 1] : [-1, 1];
        for (let i = 0; i < dirs.length; i++) this.fx.push({ k: 'quake', x: cx, y: FLOOR, r: 0, dir: dirs[i], life: .55 + (i >> 1) * .15, max: .55 + (i >> 1) * .15, lv, evo, w: 0 });
        const reach = 380 + lv * 40;
        for (const f of foes) {
          const d = Math.abs(f.x - cx);
          if (d > reach || f.y < FLOOR - 30) continue;
          host.strike(g, f, (18 + lv * 5) * (evo ? 1.4 : 1), { dir: Math.sign(f.x - cx) || 1, up: 520, knock: 60, heavy: true });
        }
        return 1.75 - lv * .1;
      }
      case 'beam': {
        const len = 600 + lv * 50, h = (34 + lv * 5) * (evo ? 1.6 : 1);
        const dirs = evo ? [-1, 1] : [face];
        for (const d of dirs) {
          this.fx.push({ k: 'beam', x: cx, y: cy, r: len, dir: d, life: .3, max: .3, lv, evo, w: h });
          for (const f of foes) {
            const dx = (f.x - cx) * d;
            if (dx < -10 || dx > len || Math.abs(bodyY(f) - cy) > h + 30) continue;
            host.strike(g, f, (22 + lv * 6), { dir: d, knock: 160 });
          }
        }
        return 1.6 - lv * .1;
      }
      case 'cone': {
        const range = 220 + lv * 22, half = evo ? Math.PI : .62;
        this.fx.push({ k: 'cone', x: cx, y: cy, r: range, dir: face, life: .32, max: .32, lv, evo, w: half });
        for (const f of foes) {
          const dx = f.x - cx, dy = bodyY(f) - cy;
          const dist = Math.hypot(dx, dy * 1.6);
          if (dist > range) continue;
          const ang = Math.atan2(dy, dx * face);
          if (Math.abs(ang) > half) continue;
          host.strike(g, f, (12 + lv * 4) * (evo ? 1.3 : 1), { dir: Math.sign(dx) || face, knock: 320 });
        }
        return .95 - lv * .06;
      }
      case 'homing': {
        const n = lv;
        for (let i = 0; i < n; i++) {
          const t = foes.length ? foes[Math.floor(g.random() * foes.length)] : undefined;
          const ang = -Math.PI / 2 + (g.random() - .5) * 1.6;
          this.shots.push({ k: 'pick', x: cx, y: cy - 20, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380, life: 1.6, pierce: 1, hit: new Set(), dmg: (16 + lv * 4) * (evo ? 1.3 : 1), target: t?.id ?? -1, evo, spin: g.random() * 6 });
        }
        return 1.25 - lv * .08;
      }
      case 'rig': {
        const n = Math.min(foes.length, lv + (evo ? 2 : 0));
        for (let i = 0; i < n; i++) {
          const t = foes[Math.floor(g.random() * foes.length)];
          this.fx.push({ k: 'rig', x: t.x, y: FLOOR, r: 72, dir: 1, life: .55, max: .55, lv, evo, w: 0 });
        }
        return 2.6 - lv * .2;
      }
      case 'aura': return .5;
      case 'orbit': case 'notes': return 9;
    }
  }

  /** 环形冲击：范围内向外推。 */
  blast(g: FightGame, lead: Fighter, host: ArmsHost, x: number, y: number, R: number, dmg: number, k: string, a: { lv: number; evo: boolean }, knock = 260): void {
    this.fx.push({ k, x, y, r: R, dir: 1, life: .4, max: .4, lv: a.lv, evo: a.evo });
    host.blastAt?.(g, x, R, dmg);
    for (const f of scratch.length ? scratch : enemies(g, lead, scratch)) {
      if (Math.abs(f.x - x) > R || Math.abs(f.y - y) > R * .6 + 40) continue;
      host.strike(g, f, dmg, { dir: Math.sign(f.x - x) || 1, knock, up: 220 });
    }
  }

  /** 外部（普攻形变、技能改造）借用发音符扇。 */
  fanBurst(lead: Fighter, n: number, dmg: number): void {
    const face = lead.facing;
    for (let i = 0; i < n; i++) {
      const ang = n === 1 ? 0 : -.35 + i / (n - 1) * .7;
      this.shots.push({ k: 'note', x: lead.x + face * 30, y: lead.y - 70, vx: Math.cos(ang) * 700 * face, vy: Math.sin(ang) * 380, life: .6, pierce: 2, hit: new Set(), dmg, target: -1, evo: false, spin: 0 });
    }
  }

  private stepShots(g: FightGame, lead: Fighter, host: ArmsHost, foes: Fighter[], dt: number): void {
    // 落雷灯架：落地那一刻砸。
    for (const e of this.fx) {
      if (e.k !== 'rig' || e.w) continue;
      if (e.life <= e.max - .32) {
        e.w = 1;
        for (const f of foes) if (Math.abs(f.x - e.x) < e.r && f.y > FLOOR - 160) host.strike(g, f, (30 + e.lv * 8) * (e.evo ? 1.4 : 1), { dir: Math.sign(f.x - e.x) || 1, up: 300, knock: 140, heavy: true });
      }
    }
    let w = 0;
    for (const s of this.shots) {
      s.life -= dt;
      s.spin += dt * 14;
      if (s.k === 'pick' && s.target >= 0) {
        const t = g.fighterById(s.target);
        if (t && t.hp > 0) {
          const dx = t.x - s.x, dy = bodyY(t) - s.y, d = Math.hypot(dx, dy) || 1;
          const sp = 560;
          s.vx += (dx / d * sp - s.vx) * Math.min(1, dt * 6);
          s.vy += (dy / d * sp - s.vy) * Math.min(1, dt * 6);
        } else s.target = foes.length ? foes[Math.floor(g.random() * foes.length)].id : -1;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (const f of foes) {
        if (f.hp <= 0 || s.hit.has(f.id)) continue;
        if (Math.abs(f.x - s.x) > 30 || Math.abs(bodyY(f) - s.y) > 55) continue;
        s.hit.add(f.id);
        host.strike(g, f, s.dmg, { dir: Math.sign(s.vx) || 1, knock: 130 });
        if (s.k === 'pick' && s.evo) this.blast(g, lead, host, s.x, f.y, 80, s.dmg * .6, 'pop', { lv: 1, evo: true }, 180);
        if (--s.pierce <= 0) { s.life = 0; break; }
      }
      if (s.life > 0 && s.x > -200 && s.x < 1160) this.shots[w++] = s;
    }
    this.shots.length = w;
  }

  shift(dx: number): void {
    for (const e of this.fx) e.x -= dx;
    for (const s of this.shots) s.x -= dx;
  }
}
