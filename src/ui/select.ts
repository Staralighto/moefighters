import type { CharacterData, StageData } from '../data/types.ts';
import type { Mode } from '../game/game.ts';
import type { FighterView } from '../render/view.ts';
import { previewFighter } from '../game/fighter.ts';
import { FLOOR, H, W } from '../game/constants.ts';

export interface MatchSetup { characters: CharacterData[]; mode: Mode; difficulty: number; controllers: (number | null)[] }

const RULES_KEY = 'moe-rules-seen';
const KEYS_1P = 'A D 移动 · W / 空格 跳跃 · 长按 S 格挡 · 点按 S 后闪 · J K 轻 / 重击（跳中为空击） · U I O 技能 · L 必杀';
const KEYS_2P = '玩家二：方向键移动 · 上跳 · 下格挡 · 小键盘 1 / 2 轻重击 · 4 / 5 / 6 技能 · 3 必杀';
const KEYS_TOUCH = '横屏开打 · 左下摇杆只左右移动 · 技能3上方跳跃 · 短按轻击、长按重击 · 点防也是格挡 · 手机只能一名玩家';
/** Same order as CONTROLS[].attacks. Index 0 is the earlier player slot, 1 the later one. */
const PAD_KEYS = [
  ['J', 'K', 'U', 'I', 'O', 'L'],
  ['1', '2', '4', '5', '6', '3'],
] as const;
/** On-screen pad labels, same order. */
const TOUCH_KEYS = ['轻', '重', '技1', '技2', '技3', '必'] as const;

/** body.touch is set once at boot from the coarse-pointer media query. */
export const isTouch = (): boolean => typeof document !== 'undefined' && document.body.classList.contains('touch');

/** Battle movelist follows the earliest player. All-CPU matches stay on 1P. */
export function guideIndex(controllers: (number | null)[]): number {
  const i = controllers.findIndex(c => c !== null);
  return i < 0 ? 0 : i;
}

export function matchName(setup: MatchSetup): string {
  const humans = setup.controllers.filter(c => c !== null).length;
  if (setup.mode === 'training') return '训练场';
  if (humans === 0) return '人机对打';
  if (setup.mode === 'team') return '人机 2V2';
  if (humans === 2) return '本地对打';
  return '人机 1V1';
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const PORTRAIT_SCALE = 1.3;
const PORTRAIT_FOOT = 276;

interface SlotView {
  slot: number; name: string; tag: string; portrait: string; facing: 1 | -1;
}

export function skillHTML(c: CharacterData, pad = 0, touch = isTouch()): string {
  const keys = touch ? TOUCH_KEYS : PAD_KEYS[pad] ?? PAD_KEYS[0];
  return c.skills.map((s, i) => {
    const dmg = (s.count ? s.count + ' × ' : '') + s.damage + ' 基础伤害';
    const cost = s.super ? ' · 100 气' : s.cd ? ' · ' + s.cd + 's 冷却' : '';
    const desc = touch ? s.desc.replaceAll('J / K', '轻 / 重') : pad ? s.desc.replaceAll('J / K', '1 / 2') : s.desc;
    return `<div class="skill ${s.super ? 'super' : ''}"><kbd>${keys[i]}</kbd><div><b>${s.name}</b><p>${dmg}${cost}<br>${desc}</p></div>${s.super ? '<span class="charge" aria-hidden="true"><i></i></span>' : ''}</div>`;
  }).join('');
}

export class SelectScreen {
  mode: Mode = 'cpu';
  difficulty = 1;
  private readonly roster: CharacterData[];
  private readonly views: Map<string, FighterView>;
  private readonly stage: StageData;
  private readonly onStart: (setup: MatchSetup) => void;
  private readonly onPick: () => void;
  private selected: number[] = [0, 1];
  /** Per slot, earlier player slots take the first key set. */
  private who: ('player' | 'cpu')[] = ['player', 'cpu'];
  private side = 0;
  private rulesSeen = false;
  private lastFrame = 0;
  private time = 0;

  constructor(roster: CharacterData[], views: Map<string, FighterView>, stage: StageData, onStart: (setup: MatchSetup) => void, onPick: () => void) {
    this.roster = roster;
    this.views = views;
    this.stage = stage;
    this.onStart = onStart;
    this.onPick = onPick;
    try { this.rulesSeen = localStorage.getItem(RULES_KEY) === '1'; } catch { /* private mode */ }
  }

  mount(): void {
    $('roster').innerHTML = this.roster.map((c, i) =>
      `<button class="character" data-index="${i}" title="${c.name} · ${c.title}" aria-label="选择${c.name}"><canvas width="96" height="96" aria-hidden="true"></canvas><span class="slot-tag" hidden></span><span class="char-name">${c.name}</span></button>`).join('');
    $('roster').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => this.pick(Number(b.dataset.index)));
    document.querySelectorAll<HTMLElement>('.fighter-preview').forEach(el => {
      el.onclick = e => {
        if ((e.target as HTMLElement).closest('.slot-control')) return;
        this.focus(Number(el.dataset.slot));
      };
    });
    document.querySelectorAll<HTMLButtonElement>('.slot-control button').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const lead = Number((b.closest('.slot-control') as HTMLElement).dataset.lead);
      const next = b.dataset.who as 'player' | 'cpu';
      if (next === 'player' && this.who[lead] !== 'player' && this.who.filter(w => w === 'player').length >= this.maxPlayers()) return;
      if (this.who[lead] === next) return;
      this.who[lead] = next;
      this.onPick();
      this.refresh();
    });
    $('random').onclick = () => this.pick(Math.floor(Math.random() * this.roster.length));
    $('rules-summary').onclick = () => this.toggleRules();
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => this.setMode(b.dataset.mode as Mode));
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => b.onclick = () => { this.difficulty = Number(b.dataset.difficulty); this.refresh(); });
    document.addEventListener('pointerdown', e => {
      const panel = $('rules-panel');
      if (panel.hidden) return;
      const t = e.target as Node;
      if ($('rules-summary').contains(t) || panel.contains(t)) return;
      panel.hidden = true;
      $('rules-summary').setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || $('selection').hidden || $('rules-panel').hidden) return;
      $('rules-panel').hidden = true;
      $('rules-summary').setAttribute('aria-expanded', 'false');
    });
    $('start').onclick = () => this.onStart(this.setup());
    this.refresh();
  }

  setup(): MatchSetup {
    return { characters: this.selected.map(i => this.roster[i]), mode: this.mode, difficulty: this.difficulty, controllers: this.controllers() };
  }

  startLabel(): string {
    const watch = this.mode !== 'training' && this.controllers().every(c => c === null);
    const label = watch ? '开始观战' : this.mode === 'training' ? '进入训练场' : '准备好了，开打！';
    return `${label} <span>↗</span>`;
  }

  private controllers(): (number | null)[] {
    let n = 0;
    return this.who.map(w => w === 'player' ? n++ : null);
  }

  /** One on-screen key set on phones; two keyboard sets otherwise. */
  private maxPlayers(): number { return isTouch() ? 1 : 2; }

  /** CPU slots show the first key set. A player slot shows whichever set P-order gave it. */
  private scheme(slot: number): number {
    return this.who[slot] === 'player' ? (this.controllers()[slot] ?? 0) : 0;
  }

  private focus(side: number): void {
    if (side === this.side) return;
    this.side = side;
    this.onPick();
    this.refresh();
  }

  private toggleRules(): void {
    const panel = $('rules-panel');
    panel.hidden = !panel.hidden;
    $('rules-summary').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden && !this.rulesSeen) {
      this.rulesSeen = true;
      try { localStorage.setItem(RULES_KEY, '1'); } catch { /* private mode */ }
      this.refresh();
    }
  }

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    if (mode === 'team' && this.who.length === 2) this.who = [this.who[0], 'cpu', this.who[1], 'cpu'];
    else if (mode !== 'team' && this.who.length === 4) this.who = [this.who[0], this.who[2]];
    if (mode === 'team' && this.selected.length === 2) {
      const used = new Set(this.selected);
      const extra: number[] = [];
      for (let i = 0; i < this.roster.length && extra.length < 2; i++) {
        if (!used.has(i)) { extra.push(i); used.add(i); }
      }
      while (extra.length < 2) extra.push(this.selected[0]);
      this.selected = [this.selected[0], extra[0], this.selected[1], extra[1]];
    } else if (mode !== 'team' && this.selected.length === 4) {
      this.selected = [this.selected[0], this.selected[2]];
      if (this.side > 1) this.side = 0;
    }
    this.mode = mode;
    if (this.side >= this.selected.length) this.side = 0;
    this.refresh();
  }

  private pick(index: number): void {
    this.selected[this.side] = index;
    this.onPick();
    this.refresh();
  }

  private slotMark(p: number): string {
    if (this.mode === 'team') return ['1P', '2P', '3P', '4P'][p] ?? '人机';
    return p === 0 ? '1P' : '2P';
  }

  private rosterTag(p: number): string {
    if (this.mode === 'team') return this.who[p] === 'player' ? this.slotMark(p) : '人机';
    if (this.who[p] === 'cpu') return '人机';
    return this.who.filter(w => w === 'player').length > 1 ? (p === 0 ? '1P' : '2P') : '1P';
  }

  private summary(): string {
    const diff = ['轻松', '标准', '大师'][this.difficulty] ?? '标准';
    if (this.mode === 'training') return '训练场 · 不计胜负';
    if (this.mode === 'team') return this.teamSummary(diff);
    const [l, r] = this.who;
    if (l === 'player' && r === 'cpu') return `1V1 · 你打人机 · ${diff}`;
    if (l === 'cpu' && r === 'player') return `1V1 · 人机打你 · ${diff}`;
    if (l === 'player') return '1V1 · 本地对打';
    return `1V1 · 人机对打 · ${diff}`;
  }

  private teamSummary(diff: string): string {
    const left = this.who.slice(0, 2).filter(w => w === 'player').length;
    const right = this.who.slice(2).filter(w => w === 'player').length;
    const humans = left + right;
    const shape = humans === 0 ? '人机对打'
      : left === 1 && right === 1 ? '各自带人机队友'
      : left === 2 || right === 2 ? '两人组队对人机'
      : '一人带人机队友';
    return `2V2 · ${shape} · ${diff}`;
  }

  private shown(): SlotView[] {
    const right: SlotView = { slot: this.mode === 'team' ? 2 : 1, name: 'name2', tag: 'p2tag', portrait: 'portrait2', facing: -1 };
    const slots: SlotView[] = [
      { slot: 0, name: 'name1', tag: 'p1tag', portrait: 'portrait1', facing: 1 },
      right,
    ];
    if (this.mode === 'team') {
      slots.splice(1, 0, { slot: 1, name: 'nameA', tag: 'pAtag', portrait: 'portraitA', facing: 1 });
      slots.push({ slot: 3, name: 'nameE', tag: 'pEtag', portrait: 'portraitE', facing: -1 });
    }
    return slots;
  }

  refresh(): void {
    const team = this.mode === 'team';
    const open = !$('rules-panel').hidden;
    $('select-stage').classList.toggle('team', team);
    $('preview-ally').hidden = !team;
    $('preview-enemy2').hidden = !team;
    $('preview-right').dataset.slot = String(team ? 2 : 1);
    $('control-right').dataset.lead = String(team ? 2 : 1);
    $('rules-panel').hidden = !open;
    $('rules-text').textContent = this.summary() + ' ›';
    $('rules-summary').classList.toggle('fresh', !this.rulesSeen);
    const aiFights = this.mode !== 'training' && (team || this.who.includes('cpu'));
    $('rules-panel').classList.toggle('dim-diff', !aiFights);
    document.querySelectorAll<HTMLElement>('.fighter-preview').forEach(el => {
      el.classList.toggle('active', !el.hidden && Number(el.dataset.slot) === this.side);
    });
    const max = this.maxPlayers();
    let players = 0;
    // Switching to a phone after two players were set keeps the earliest one.
    this.who = this.who.map(w => w === 'player' && ++players > max ? 'cpu' : w);
    const capped = Math.min(players, max) >= max;
    document.querySelectorAll<HTMLButtonElement>('.slot-control button').forEach(b => {
      const lead = Number((b.closest('.slot-control') as HTMLElement).dataset.lead);
      const who = this.who[lead];
      const on = who === b.dataset.who;
      b.classList.toggle('active', !!who && on);
      b.setAttribute('aria-pressed', String(!!who && on));
      b.title = capped && b.dataset.who === 'player' && !on ? (max === 1 ? '手机上只能一名玩家' : '玩家最多两名') : '';
    });
    for (const v of this.shown()) {
      const c = this.roster[this.selected[v.slot]];
      $(v.name).textContent = c.name;
      $(v.tag).textContent = this.slotMark(v.slot);
    }
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === this.mode));
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => b.classList.toggle('active', Number(b.dataset.difficulty) === this.difficulty));
    $('roster').querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => {
      const chosen = this.selected.flatMap((pick, p) => pick === i ? [p] : []);
      b.classList.toggle('p1', chosen.includes(0));
      b.classList.toggle('ally', team && chosen.includes(1));
      b.classList.toggle('p2', chosen.some(p => team ? p >= 2 : p === 1));
      b.setAttribute('aria-pressed', String(i === this.selected[this.side]));
      const tag = b.querySelector('.slot-tag') as HTMLElement;
      tag.hidden = !chosen.length;
      tag.textContent = [...new Set(chosen.map(p => this.rosterTag(p)))].join('/');
    });
    const c = this.roster[this.selected[this.side]];
    const scheme = this.scheme(this.side);
    $('skill-owner').textContent = this.slotMark(this.side) + ' · ' + c.name + (scheme ? ' · 小键盘' : '');
    $('flavor').textContent = c.title + ' · ' + c.quote;
    $('passive').textContent = c.passive[0] + '：' + c.passive[1];
    $('skills').innerHTML = skillHTML(c, scheme);
    $('round-rules').textContent = this.mode === 'training'
      ? '训练场 · 不计时 · 不计胜负 · 能量常满'
      : this.mode === 'team'
        ? '两胜制 · 一方全灭或超时比血量 · 60 秒 / 回合'
        : '两胜制 · 60 秒 / 回合';
    $('stage-caption').textContent = '练武场';
    $('start').innerHTML = this.startLabel();
    const humans = this.controllers().filter(x => x !== null).length;
    $('select-keys').textContent = humans === 0
      ? '两边都是人机，开始后只看不打 · ESC 暂停'
      : isTouch() ? KEYS_TOUCH : humans === 2 ? KEYS_1P + ' · ' + KEYS_2P : KEYS_1P;
  }

  /** Call from requestAnimationFrame while the select screen is visible. */
  animate(now: number): void {
    const dt = Math.min((now - this.lastFrame) / 1000, .05);
    this.lastFrame = now;
    this.time += dt;
    this.placeStage();
    for (const v of this.shown()) {
      this.portrait($(v.portrait) as HTMLCanvasElement, this.roster[this.selected[v.slot]], v.facing, PORTRAIT_SCALE, PORTRAIT_FOOT);
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

  /** One backdrop for the whole select panel. Floor of the stage meets the portrait foot line. */
  private placeStage(): void {
    const panel = $('select-stage');
    const canvas = $('portrait1') as HTMLCanvasElement;
    const panelBox = panel.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    if (!this.stage.image || !panelBox.height || !box.height) return;
    const fit = Math.min(box.width / canvas.width, box.height / canvas.height);
    const drawnH = canvas.height * fit;
    const footScreen = box.top + (box.height - drawnH) + PORTRAIT_FOOT * fit;
    const viewScale = PORTRAIT_SCALE * fit;
    const fromBottom = panelBox.bottom - footScreen - (H - FLOOR) * viewScale;
    panel.style.backgroundImage = `url("${this.stage.image}")`;
    panel.style.backgroundSize = `${W * viewScale}px ${H * viewScale}px`;
    panel.style.backgroundPosition = `center bottom ${fromBottom}px`;
  }
}
