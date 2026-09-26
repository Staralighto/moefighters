import type { CharacterData } from '../data/types.ts';
import { PLAYABLE } from '../data/characters.ts';
import type { ChallengeMods } from '../game/game.ts';
import { COMBO_DECAY, COMBO_ESCAPE } from '../game/constants.ts';
import { previewFighter } from '../game/fighter.ts';
import type { FighterView } from '../render/view.ts';
import type { MatchSetup } from './select.ts';
import { ICONS } from './icons.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** One card of the challenge pool. Copies stack for the whole run; aggregatePicks does the math. */
export interface ChallengeCard {
  id: string;
  name: string;
  /** The one-line effect text shown on the card. */
  stat: string;
  /** Lucide icon name, resolved through ICONS. */
  icon: string;
}

/** The whole card pool: equal chance, no rarity, no weights. The same card can come back and stack. */
export const POOL: ChallengeCard[] = [
  { id: 'lifebuoy', name: '救生', stat: '生命上限 +20%', icon: 'life-buoy' },
  { id: 'burn', name: '焚音打', stat: '伤害 +20%', icon: 'flame' },
  { id: 'okay', name: '没问题的哦', stat: '每秒回复 1% 生命上限', icon: 'droplets' },
  { id: 'sparkle', name: '最喜欢闪闪发光的东西！', stat: '25% 概率造成 1.5 倍伤害', icon: 'sparkles' },
  { id: 'echo', name: '碧天伴走', stat: '连击窗口 +0.5s · 连击伤害衰减减半', icon: 'repeat' },
  { id: 'band', name: '来组乐队吧！', stat: '气力获取 +40%', icon: 'battery-charging' },
  { id: 'walk', name: '就算是迷子也要前进', stat: '移速 +8% · 后闪冷却 −25%', icon: 'wind' },
  { id: 'again', name: '再来一次', stat: '技能冷却 −15%', icon: 'fast-forward' },
  { id: 'fall', name: '堕天', stat: '生命低于一半时伤害 +30%', icon: 'moon' },
  { id: 'ultimatum', name: '这是最后通牒', stat: '敌人生命 <25% 时受到伤害 +50%', icon: 'skull' },
  { id: 'latent', name: '潜在表明', stat: '造成伤害的 8% 转为治疗', icon: 'heart-pulse' },
  { id: 'dare', name: '竟敢无视灯', stat: '被近战命中时反伤 15%', icon: 'drum' },
  { id: 'vain', name: '因为我爱慕虚荣', stat: '击杀一名敌人后：伤害 +15%、气力获取 +25%，直到本关结束', icon: 'crown' },
  { id: 'protect', name: '我会保护小睦', stat: '受击硬直 −20% · 连段脱离门槛 7→5', icon: 'shield' },
  { id: 'human', name: '想成为人类', stat: '每关一次：致死伤害改为留 1 点血 + 1.5s 无敌', icon: 'bird' },
];

const BEST_MAX_AGE = 31536000; // one year
/** 无尽激战 keeps the legacy keys, so pre-split saves and records land there untouched. */
const RUN_KEYS: Record<ChallengeKind, string> = { climb: 'mf-challenge-run-climb', brawl: 'mf-challenge-run' };
const BEST_KEYS: Record<ChallengeKind, string> = { climb: 'mf-challenge-best-climb', brawl: 'mf-challenge-best' };

/** The two challenge sub-modes: 无尽闯关 is a plain 1v1, 无尽激战 is the 1v2 with opening buffs. */
export type ChallengeKind = 'climb' | 'brawl';
export function challengeName(kind: ChallengeKind): string { return kind === 'climb' ? '无尽闯关' : '无尽激战'; }
/** How many random foes a sub-mode fields per stage. */
export function foeCount(kind: ChallengeKind): number { return kind === 'brawl' ? 2 : 1; }

/** The live endless run of one sub-mode, kept in localStorage so a refresh or crash resumes the current stage. */
export interface ChallengeRun {
  kind: ChallengeKind;
  stage: number;
  char: CharacterData;
  enemies: CharacterData[];
  /** Cards picked so far this run, in order. Copies stack; cleared when the run dies. */
  picks: string[];
  /** True once the current stage's card is picked and the fight may start. */
  armed: boolean;
  newBest: boolean;
}

function charById(id: string): CharacterData | undefined {
  return PLAYABLE.find(c => c.id === id);
}

/** The saved run of this sub-mode with characters resolved, or null when none is stored or the format is unknown. */
export function readRun(kind: ChallengeKind): ChallengeRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEYS[kind]);
    if (!raw) return null;
    const want = foeCount(kind);
    const s = JSON.parse(raw) as { stage: unknown; charId: unknown; enemyIds: unknown; picks: unknown; armed: unknown; newBest: unknown };
    const ok = typeof s.stage === 'number' && Number.isInteger(s.stage) && s.stage >= 1
      && typeof s.charId === 'string' && !!charById(s.charId)
      && Array.isArray(s.enemyIds) && s.enemyIds.length === want && s.enemyIds.every(id => typeof id === 'string' && !!charById(id))
      && Array.isArray(s.picks) && s.picks.every(id => typeof id === 'string' && POOL.some(c => c.id === id))
      && typeof s.armed === 'boolean'
      && typeof s.newBest === 'boolean';
    if (!ok) return null;
    return {
      kind,
      stage: s.stage as number,
      char: charById(s.charId as string)!,
      enemies: (s.enemyIds as string[]).map(id => charById(id)!),
      picks: s.picks as string[],
      armed: s.armed as boolean,
      newBest: s.newBest as boolean,
    };
  } catch { return null; }
}

/** Written whenever a stage starts or is won; null clears that sub-mode's run (player left, or lost the stage). */
export function writeRun(kind: ChallengeKind, run: ChallengeRun | null): void {
  try {
    if (!run) { localStorage.removeItem(RUN_KEYS[kind]); return; }
    const s = { stage: run.stage, charId: run.char.id, enemyIds: run.enemies.map(e => e.id), picks: run.picks, armed: run.armed, newBest: run.newBest };
    localStorage.setItem(RUN_KEYS[kind], JSON.stringify(s));
  } catch { /* private mode */ }
}

/** Highest stage ever cleared in this sub-mode, kept in a cookie. Private mode or a cleared jar just reads as 0. */
export function readBest(kind: ChallengeKind): number {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${BEST_KEYS[kind]}=(\\d+)`));
    return m ? Math.min(9999, Number(m[1])) : 0;
  } catch { return 0; }
}

/** Written the moment a stage is cleared, so closing the tab mid-run keeps the record. */
export function writeBest(kind: ChallengeKind, best: number): void {
  try { document.cookie = `${BEST_KEYS[kind]}=${best}; path=/; SameSite=Lax; max-age=${BEST_MAX_AGE}`; } catch { /* private mode */ }
}

/** The record rolls over to 99+ once it reaches 100. */
export function bestLabel(best: number): string { return best >= 100 ? '99+' : String(best); }

/** `count` distinct random opponents from the finished roster, rerolled every stage. */
export function rollEnemies(count = 2): CharacterData[] {
  const bag = PLAYABLE.map(c => c.id);
  const out: CharacterData[] = [];
  while (out.length < count && bag.length) out.push(charById(bag.splice(Math.floor(Math.random() * bag.length), 1)[0])!);
  return out;
}

/** Three distinct cards dealt uniformly from the pool. The bag refills every stage. */
export function drawThree(): string[] {
  const bag = POOL.map(c => c.id);
  const out: string[] = [];
  while (out.length < 3 && bag.length) out.push(...bag.splice(Math.floor(Math.random() * bag.length), 1));
  return out;
}

/** How many copies of a card the run holds. */
export function countPicks(picks: string[], id: string): number {
  return picks.reduce((n, p) => p === id ? n + 1 : n, 0);
}

/** Every card number lives here: stack counts go in, per-fighter mod fields come out.
    Copies of one card add up inside each field; different cards multiply in the engine. */
export function aggregatePicks(picks: string[]): ChallengeMods {
  const n = (id: string) => countPicks(picks, id);
  const mods: ChallengeMods = {};
  if (n('burn')) mods.damage = 1 + .2 * n('burn');
  if (n('okay')) mods.regen = Math.min(.01 * n('okay'), .05);
  if (n('sparkle')) mods.crit = Math.min(.25 * n('sparkle'), .5);
  if (n('echo')) {
    mods.comboTimeBonus = Math.min(.5 * n('echo'), 1);
    mods.comboDecay = COMBO_DECAY * Math.pow(.5, n('echo'));
  }
  if (n('band')) mods.energyMul = Math.min(1 + .4 * n('band'), 1.8);
  if (n('walk')) {
    mods.moveMul = Math.min(1 + .08 * n('walk'), 1.2);
    mods.dodgeCdMul = Math.max(Math.pow(.75, n('walk')), .5);
  }
  if (n('again')) mods.cdMul = Math.max(Math.pow(.85, n('again')), .6);
  if (n('fall')) mods.lowHpDmg = Math.min(.3 * n('fall'), .6);
  if (n('ultimatum')) mods.executeDmg = Math.min(.5 * n('ultimatum'), 1);
  if (n('latent')) mods.lifesteal = Math.min(.08 * n('latent'), .16);
  if (n('dare')) mods.thorns = Math.min(.15 * n('dare'), .3);
  if (n('vain')) {
    mods.vainDamage = Math.min(.15 * n('vain'), .45);
    mods.vainEnergy = Math.min(.25 * n('vain'), .75);
  }
  if (n('protect')) {
    mods.stunMul = Math.max(Math.pow(.8, n('protect')), .6);
    mods.escapeCombo = Math.max(COMBO_ESCAPE - n('protect'), 3);
  }
  if (n('human')) mods.deathSave = n('human');
  return mods;
}

/** The deck line for the pause menu, e.g. 卡组：救生×2 · 焚音打×1. Empty while nothing is held. */
export function deckLabel(picks: string[]): string {
  const order: string[] = [];
  const count = new Map<string, number>();
  for (const id of picks) {
    if (!count.has(id)) order.push(id);
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  if (!order.length) return '';
  return '卡组：' + order.map(id => `${POOL.find(c => c.id === id)!.name}×${count.get(id)}`).join(' · ');
}

/** One challenge stage: the player plus the foes shown before the fight, with the whole deck armed.
    无尽闯关 fields one foe and no opening buffs; 无尽激战 anchors on doubled health and the ×2 base
    damage boost, and 救生 stacks onto that anchor. Every other card rides the mods. From stage 2
    the foes grow linearly per stage (+5% health, +3% damage); only the rules text says so. */
export function stageSetup(kind: ChallengeKind, player: CharacterData, picks: string[], stage: number, enemies: CharacterData[]): MatchSetup {
  const anchor = kind === 'brawl' ? 2 : 1;
  const data = { ...player, hp: Math.round(player.hp * anchor * (1 + .2 * countPicks(picks, 'lifebuoy'))) };
  const growth = stage - 1;
  const grown = growth > 0 ? { damage: 1 + .03 * growth } : {};
  const deck = aggregatePicks(picks);
  return {
    characters: [data, ...enemies.map(e => ({ ...e, hp: Math.round(e.hp * (1 + .05 * growth)) }))],
    mode: 'challenge',
    difficulty: 2,
    controllers: [0, ...enemies.map(() => null)],
    mods: [kind === 'brawl' ? { ...deck, baseDamage: 2 } : deck, ...enemies.map(() => grown)],
    stageNumber: stage,
  };
}

/** The pool's 24px stroke icon, wrapped with the shared stroke defaults. */
function iconSvg(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

let pickerRaf = 0;

/** Three cards dealt for this stage, alongside the opponents rolled for it. A pick joins the deck for good. */
export function showBuffPicker(stage: number, enemies: CharacterData[], views: Map<string, FighterView>, picks: string[], onPick: (cardId: string) => void): void {
  $('buff-title').textContent = `第 ${stage} 关 · 选择一个强化`;
  $('buff-foes').innerHTML = enemies.map(e =>
    `<div class="buff-foe"><canvas width="110" height="140"></canvas><b>${e.name}</b></div>`).join('');
  $('buff-cards').innerHTML = drawThree().map(id => {
    const card = POOL.find(c => c.id === id)!;
    const held = countPicks(picks, id);
    return `<button type="button" class="buff-card" data-card="${id}">`
      + `<span class="buff-head"><span class="buff-icon">${iconSvg(card.icon)}</span><b>${card.name}</b></span>`
      + `<span class="buff-stat">${card.stat}</span>`
      + (held ? `<i class="buff-owned">×${held}</i>` : '')
      + '</button>';
  }).join('');
  $('buff-picker').hidden = false;
  const t0 = performance.now();
  cancelAnimationFrame(pickerRaf);
  const draw = (now: number) => {
    $('buff-foes').querySelectorAll<HTMLCanvasElement>('canvas').forEach((canvas, i) => {
      const c = enemies[i];
      if (!c) return;
      const ctx = canvas.getContext('2d');
      const view = views.get(c.id);
      if (!ctx || !view) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height - 6);
      ctx.scale(.55, .55);
      view.draw(ctx, previewFighter(c, (now - t0) / 1000, -1), 0, 0, 1);
      ctx.restore();
    });
    pickerRaf = requestAnimationFrame(draw);
  };
  pickerRaf = requestAnimationFrame(draw);
  $('buff-cards').querySelectorAll<HTMLButtonElement>('.buff-card').forEach(b => b.onclick = () => {
    hideBuffPicker();
    onPick(b.dataset.card!);
  });
}

export function hideBuffPicker(): void {
  $('buff-picker').hidden = true;
  cancelAnimationFrame(pickerRaf);
}
