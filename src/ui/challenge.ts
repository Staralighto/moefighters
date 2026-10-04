import type { CharacterData, StageData } from '../data/types.ts';
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
  /** Copies that still stack; past this the card leaves the deal and adds nothing. */
  cap: number;
}

/** The whole card pool: equal chance, no rarity, no weights. The same card stacks up to `cap`
    copies, then stops being dealt. Per-copy values are priced against the per-stage enemy growth
    (+5% health, +3% damage) while the player gains exactly one card per stage: an always-on
    multiplier sits at that budget line, a conditional effect pays a premium, and one capped card
    covers roughly 2–5 stages of growth. See aggregatePicks. */
export const POOL: ChallengeCard[] = [
  { id: 'lifebuoy', name: '救生', stat: '生命上限 +4%', icon: 'life-buoy', cap: 5 },
  { id: 'burn', name: '焚音打', stat: '伤害 +5%', icon: 'flame', cap: 4 },
  { id: 'okay', name: '没问题的哦', stat: '每秒回复 0.5% 生命上限', icon: 'droplets', cap: 2 },
  { id: 'sparkle', name: '最喜欢闪闪发光的东西！', stat: '15% 概率造成 1.5 倍伤害', icon: 'sparkles', cap: 3 },
  { id: 'echo', name: '碧天伴走', stat: '连击窗口 +0.25s · 连击伤害衰减 −25%', icon: 'repeat', cap: 4 },
  { id: 'band', name: '来组乐队吧！', stat: '气力获取 +25%', icon: 'battery-charging', cap: 3 },
  { id: 'walk', name: '就算是迷子也要前进', stat: '移速 +6% · 后闪冷却 −20%', icon: 'wind', cap: 3 },
  { id: 'again', name: '再来一次', stat: '技能冷却 −10%', icon: 'fast-forward', cap: 4 },
  { id: 'fall', name: '堕天', stat: '生命低于一半时伤害 +15%', icon: 'moon', cap: 3 },
  { id: 'ultimatum', name: '这是最后通牒', stat: '敌人生命 <25% 时受到伤害 +25%', icon: 'skull', cap: 3 },
  { id: 'latent', name: '潜在表明', stat: '造成伤害的 5% 转为治疗', icon: 'heart-pulse', cap: 3 },
  { id: 'dare', name: '竟敢无视灯', stat: '被近战命中时反伤 10%', icon: 'drum', cap: 3 },
  { id: 'vain', name: '因为我爱慕虚荣', stat: '击杀一名敌人后：伤害 +10%、气力获取 +15%，直到本关结束', icon: 'crown', cap: 4 },
  { id: 'protect', name: '我会保护小睦', stat: '受击硬直 −15% · 连段脱离门槛 7→3', icon: 'shield', cap: 4 },
  { id: 'human', name: '想成为人类', stat: '每关一次：致死伤害改为留 1 点血 + 1.5s 无敌', icon: 'bird', cap: 2 },
];

/** Stack cap per card id, for the clamps in aggregatePicks and stageSetup. */
const CAP: Record<string, number> = Object.fromEntries(POOL.map(c => [c.id, c.cap]));

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

/** Three distinct cards dealt uniformly from the pool, minus cards already at their stack cap —
    a capped copy would be a dead pick. When every card is capped the deal falls back to the full
    pool so a stage can always start; the over-cap pick then adds nothing (aggregatePicks clamps).
    ponytail: no reroll or pity weighting — capped cards simply leave the bag. */
export function drawThree(picks: string[] = []): string[] {
  const open = POOL.filter(c => countPicks(picks, c.id) < c.cap);
  const bag = (open.length ? open : POOL).map(c => c.id);
  const out: string[] = [];
  while (out.length < 3 && bag.length) out.push(...bag.splice(Math.floor(Math.random() * bag.length), 1));
  return out;
}

/** How many copies of a card the run holds. */
export function countPicks(picks: string[], id: string): number {
  return picks.reduce((n, p) => p === id ? n + 1 : n, 0);
}

/** Copies of a card that still count: the stack cap clamps old saves that hold more. */
function stackOf(picks: string[], id: string): number {
  return Math.min(countPicks(picks, id), CAP[id] ?? 0);
}

/** Every card number lives here: stack counts go in, per-fighter mod fields come out.
    Copies of one card add up inside each field; different cards multiply in the engine.
    Pricing rides the pool's per-stage anchor; stackOf clamps every count at the card's cap. */
export function aggregatePicks(picks: string[]): ChallengeMods {
  const n = (id: string) => stackOf(picks, id);
  const mods: ChallengeMods = {};
  if (n('burn')) mods.damage = 1 + .05 * n('burn');
  if (n('okay')) mods.regen = .005 * n('okay');
  if (n('sparkle')) mods.crit = .15 * n('sparkle');
  if (n('echo')) {
    mods.comboTimeBonus = .25 * n('echo');
    mods.comboDecay = COMBO_DECAY * Math.pow(.75, n('echo'));
  }
  if (n('band')) mods.energyMul = 1 + .25 * n('band');
  if (n('walk')) {
    mods.moveMul = 1 + .06 * n('walk');
    mods.dodgeCdMul = Math.pow(.8, n('walk'));
  }
  if (n('again')) mods.cdMul = Math.pow(.9, n('again'));
  if (n('fall')) mods.lowHpDmg = .15 * n('fall');
  if (n('ultimatum')) mods.executeDmg = .25 * n('ultimatum');
  if (n('latent')) mods.lifesteal = .05 * n('latent');
  if (n('dare')) mods.thorns = .1 * n('dare');
  if (n('vain')) {
    mods.vainDamage = .1 * n('vain');
    mods.vainEnergy = .15 * n('vain');
  }
  if (n('protect')) {
    mods.stunMul = Math.pow(.85, n('protect'));
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
export function stageSetup(kind: ChallengeKind, player: CharacterData, picks: string[], stage: number, enemies: CharacterData[], scene: StageData): MatchSetup {
  const anchor = kind === 'brawl' ? 2 : 1;
  const data = { ...player, hp: Math.round(player.hp * anchor * (1 + .04 * stackOf(picks, 'lifebuoy'))) };
  const growth = stage - 1;
  const grown = growth > 0 ? { damage: 1 + .03 * growth } : {};
  const deck = aggregatePicks(picks);
  return {
    characters: [data, ...enemies.map(e => ({ ...e, hp: Math.round(e.hp * (1 + .05 * growth)) }))],
    mode: 'challenge',
    difficulty: 2,
    controllers: [0, ...enemies.map(() => null)],
    stage: scene,
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
  $('buff-cards').innerHTML = drawThree(picks).map(id => {
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
      const waiting = !!view.idleReady && !view.idleReady();
      canvas.classList.toggle('pending', waiting);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (waiting) return;
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
