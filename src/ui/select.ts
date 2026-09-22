import type { CharacterData } from '../data/types.ts';
import type { Mode } from '../game/game.ts';
import type { FighterView } from '../render/view.ts';
import { previewFighter } from '../game/fighter.ts';

export interface MatchSetup { characters: [CharacterData, CharacterData]; mode: Mode; difficulty: number }

export const MODE_NAMES: Record<Mode, string> = { cpu: '人机 1V1', training: '训练场' };

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export function skillHTML(c: CharacterData): string {
  return c.skills.map(s => {
    const dmg = (s.count ? s.count + ' × ' : '') + s.damage + ' 基础伤害';
    const cost = s.super ? ' · 100 气' : s.cd ? ' · ' + s.cd + 's 冷却' : '';
    return `<div class="skill ${s.super ? 'super' : ''}"><kbd>${s.key}</kbd><div><b>${s.name}</b><p>${dmg}${cost}<br>${s.desc}</p></div></div>`;
  }).join('');
}

export class SelectScreen {
  mode: Mode = 'cpu';
  difficulty = 1;
  private readonly roster: CharacterData[];
  private readonly views: Map<string, FighterView>;
  private readonly onStart: (setup: MatchSetup) => void;
  private readonly onPick: () => void;
  private selected: [number, number] = [0, 1];
  private side: 0 | 1 = 0;
  private lastFrame = 0;
  private time = 0;

  constructor(roster: CharacterData[], views: Map<string, FighterView>, onStart: (setup: MatchSetup) => void, onPick: () => void) {
    this.roster = roster;
    this.views = views;
    this.onStart = onStart;
    this.onPick = onPick;
  }

  mount(): void {
    $('roster').innerHTML = this.roster.map((c, i) =>
      `<button class="character" data-index="${i}" title="${c.name} · ${c.title}" aria-label="选择${c.name}"><canvas width="96" height="96" aria-hidden="true"></canvas><span class="slot-tag" hidden></span><span class="char-name">${c.name}</span></button>`).join('');
    $('roster').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => this.pick(Number(b.dataset.index)));
    $('choose1').onclick = () => { this.side = 0; this.refresh(); };
    $('choose2').onclick = () => { this.side = 1; this.refresh(); };
    $('random').onclick = () => this.pick(Math.floor(Math.random() * this.roster.length));
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => { this.mode = b.dataset.mode as Mode; this.refresh(); });
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => b.onclick = () => { this.difficulty = Number(b.dataset.difficulty); this.refresh(); });
    $('start').onclick = () => this.onStart(this.setup());
    this.refresh();
  }

  setup(): MatchSetup {
    return { characters: [this.roster[this.selected[0]], this.roster[this.selected[1]]], mode: this.mode, difficulty: this.difficulty };
  }

  private pick(index: number): void {
    this.selected[this.side] = index;
    this.onPick();
    this.refresh();
  }

  private slotLabel(p: number): string { return p === 0 ? 'PLAYER 1' : this.mode === 'training' ? '训练对手' : 'CPU'; }

  refresh(): void {
    for (const p of [0, 1] as const) {
      const c = this.roster[this.selected[p]], n = p + 1;
      $('name' + n).textContent = c.name;
      $('style' + n).textContent = c.title;
      $('quote' + n).textContent = c.quote;
      $('p' + n + 'tag').textContent = this.slotLabel(p);
      const btn = $('choose' + n);
      btn.textContent = (p === 0 ? '1P' : this.slotLabel(1)) + ' 选人';
      btn.classList.toggle('active', this.side === p);
      btn.setAttribute('aria-pressed', String(this.side === p));
    }
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === this.mode));
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => b.classList.toggle('active', Number(b.dataset.difficulty) === this.difficulty));
    (document.querySelector('.difficulty') as HTMLElement).style.opacity = this.mode === 'training' ? '.45' : '1';
    $('roster').querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => {
      const chosen = ([0, 1] as const).filter(p => this.selected[p] === i);
      b.classList.toggle('p1', chosen.includes(0));
      b.classList.toggle('p2', chosen.includes(1));
      b.setAttribute('aria-pressed', String(i === this.selected[this.side]));
      const tag = b.querySelector('.slot-tag') as HTMLElement;
      tag.hidden = !chosen.length;
      tag.textContent = chosen.map(p => p === 0 ? '1P' : this.mode === 'training' ? '靶' : 'CPU').join('/');
    });
    const c = this.roster[this.selected[this.side]];
    $('skill-owner').textContent = (this.side === 0 ? '1P' : this.slotLabel(1)) + ' · ' + c.name;
    $('passive').textContent = c.passive[0] + '：' + c.passive[1];
    $('skills').innerHTML = skillHTML(c);
    $('round-rules').textContent = this.mode === 'training' ? '训练场 · 不计时 · 不计胜负 · 能量常满' : '两胜制 · 60 秒 / 回合';
    $('stage-caption').textContent = '练武场';
  }

  /** Call from requestAnimationFrame while the select screen is visible. */
  animate(now: number): void {
    const dt = Math.min((now - this.lastFrame) / 1000, .05);
    this.lastFrame = now;
    this.time += dt;
    for (const p of [0, 1] as const) {
      this.portrait($('portrait' + (p + 1)) as HTMLCanvasElement, this.roster[this.selected[p]], p === 0 ? 1 : -1, 1.3, 276);
    }
    $('roster').querySelectorAll<HTMLCanvasElement>('canvas').forEach((canvas, i) => this.portrait(canvas, this.roster[i], 1, .46, 93));
  }

  private portrait(canvas: HTMLCanvasElement, c: CharacterData, facing: 1 | -1, scale: number, baseY: number): void {
    const ctx = canvas.getContext('2d');
    const view = this.views.get(c.id);
    if (!ctx || !view) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, baseY);
    ctx.scale(scale, scale);
    view.draw(ctx, previewFighter(c, this.time, facing), 0, 0, 1);
    ctx.restore();
  }
}
