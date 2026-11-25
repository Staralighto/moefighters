/* 剧情闯关一关的流程：战前演出 → 战斗（main.ts 的 startGame）→ 战后演出 → 记进度、发碎片 → 回地图。
   main.ts 只管战斗那一段；这里把关卡数据翻成 MatchSetup，打完按 FightGame 的结果判附加目标。 */

import { ROSTER_BY_ID } from '../data/characters.ts';
import { STAGES } from '../data/stages.ts';
import type { FightGame } from '../game/game.ts';
import type { MatchSetup } from '../ui/select.ts';
import { earn } from '../save/wallet.ts';
import { toast } from '../ui/toast.ts';
import { ALL_STAGES, HEROES, chapterOf, difficultyOf, stageById, storyFoes, type Goal, type StoryStage } from './chapters.ts';
import { recordClear, starCount, storyProgress } from './progress.ts';
import { idOf, loadScript, type Script } from './script.ts';
import { chineseNo, closeTheatre, play } from './theatre.ts';

/** 正在打的剧情关（战斗中、战后演出中）。null = 不在剧情里。 */
export interface StoryFight { stage: StoryStage; script: Script; preview: boolean }
let current: StoryFight | null = null;
export const storyFight = (): StoryFight | null => current;

const label = (s: StoryStage) => `${s.id}　${s.title}`;
const copiesOf = (s: StoryStage) => s.copies ?? {};
/** 开场大幕上的「第一章 · 第三幕」+ 关名；章末关落幕后的「第一章 梦幻泡影 · 完」。 */
function cardsOf(s: StoryStage): { card: { kicker: string; title: string }; endCard?: { kicker: string; title: string } } {
  const ch = chapterOf(s.id);
  const no = ch ? `第${chineseNo(ch.no)}章` : '';
  const act = ch ? ch.stages.indexOf(s) + 1 : 0;
  return {
    card: { kicker: `${no} · 第${chineseNo(act)}幕${s.type === 'Boss' ? ' · BOSS' : ''}`, title: s.title },
    endCard: s.type === '章末' && ch ? { kicker: no, title: `${ch.name} · 完` } : undefined,
  };
}

/** 剧情战斗单回合决胜，给 99 秒：容错更多，不至于被对面的数值优势拖到时间到判负。 */
const STORY_TIME = 99;

export function setupFor(s: StoryStage): MatchSetup {
  const b = s.battle!;
  const lead = storyProgress().lead;
  const ids = b.us ?? (lead ? [HEROES[1], HEROES[0]] : [...HEROES]);
  const us = ids.map(id => ROSTER_BY_ID.get(id)!);
  // 对面的体力、伤害、词条按剧情难度标准（chapters.ts storyFoes）。
  const std = storyFoes(s);
  const foes = std.map(f => { const c = ROSTER_BY_ID.get(f.id)!; return f.hp !== 1 ? { ...c, hp: Math.round(c.hp * f.hp) } : c; });
  const scene = STAGES.find(x => x.id === s.scene) ?? STAGES[0];
  // 一对一走普通对局（标准 1V1 站位和头像血条），人多走 team（二打一 / 一打二 / 二打二）。
  const duo = us.length + foes.length === 2;
  return {
    characters: [...us, ...foes],
    mode: duo ? 'cpu' : 'team',
    difficulty: difficultyOf(s),
    controllers: [0, ...us.slice(1).map(() => null), ...foes.map(() => null)],
    stage: scene,
    mods: [b.usMods ?? {}, ...us.slice(1).map(() => ({})), ...std.map(f => f.mods)],
    story: s.id,
    allies: duo ? undefined : us.length,
    survive: b.survive,
    roundTime: STORY_TIME,
  };
}

function goalMet(g: Goal, game: FightGame, s: StoryStage): boolean {
  const me = game.fighters[0];
  const ours = game.fighters.filter(f => f.team === 0 && !f.minion && !f.echo);
  switch (g.k) {
    case 'win': return game.winnerTeam === 0;
    case 'hp': return me.hp > 0 && me.hp / me.data.hp * 100 >= g.v;
    case 'ally': return ours.every(f => f.hp > 0);
    case 'time': return (s.battle?.survive ?? STORY_TIME) - game.time <= g.v;
    // 必杀状态里打出的最后一下（ult.ts）：状态类、变身类、召唤类的 L 也判得到。
    case 'finL': return !!game.roundLog[game.roundLog.length - 1]?.ult;
    case 'combo': return ours.some(f => (game.maxCombo[f.id] ?? 0) >= g.v);
    case 'useL': return (game.ultsBy[me.id] ?? 0) > 0;
  }
}

/** 赢了才有星；输了一颗都没有（目标只在获胜时结算）。 */
export function goalsOf(s: StoryStage, game: FightGame): number {
  if (!s.battle || game.winnerTeam !== 0) return 0;
  return s.battle.goals.reduce((m, g, i) => goalMet(g, game, s) ? m | 1 << i : m, 0);
}

function reward(s: StoryStage, mask: number, preview = false): void {
  if (preview) { toast(`预览 · ${s.id} 演完（不记进度）`); return; }
  const fresh = recordClear(s.id, mask);
  const n = s.battle ? starCount(fresh) * 15 : fresh ? 20 : 0;
  if (n > 0) { earn(n); toast(`${s.id} ${s.battle ? `新达成 ${starCount(fresh)} 个目标` : '首次观看'} · 星之碎片 +${n}`); }
}

export interface StoryHooks {
  /** 开打（main.ts 的 startGame）。 */
  fight(setup: MatchSetup): Promise<void>;
  /** 回剧情地图并选中这一关。 */
  back(select: string): void;
}
let hooks: StoryHooks | null = null;
export function bindStory(h: StoryHooks): void { hooks = h; }

const nextOf = (id: string) => { const i = ALL_STAGES.findIndex(s => s.id === id); return ALL_STAGES[i + 1]?.id ?? id; };

/** 从地图点「开演 / 观看」。preview（地址栏 ?story=1-03）：不看解锁、不记进度不发碎片，写剧本时逐关看效果用。 */
export async function playStage(id: string, preview = false): Promise<void> {
  const s = stageById(id);
  if (!s || !hooks || staging) return;
  // 演出期间再点「开演」（连点、地图和预览同时触发）不能再开一场：两场会抢同一个舞台。
  staging = true;
  try {
    const script = await loadScript(id);
    if (!script) { toast('这一关的剧本还没有导入'); return; }
    // 预览跳行：?story=3-01&at=27 从定稿第 27 行开演（之前的瞬间演完）；行号落在战后段就不打，直接演战后。
    const at = preview ? Number(new URLSearchParams(location.search).get('at')) || 0 : 0;
    const postFrom = script.post[0]?.ln;
    if (at && postFrom !== undefined && at >= postFrom) {
      await play(script, script.post, { copies: copiesOf(s), warm: script.pre, idOf, label: label(s), at });
      closeTheatre();
      hooks.back(nextOf(id));
      return;
    }
    await play(script, script.pre, { copies: copiesOf(s), toBattle: !!s.battle, idOf, label: label(s), at, ...cardsOf(s) });
    if (!s.battle) {
      reward(s, 7, preview);
      closeTheatre();
      hooks.back(nextOf(id));
      return;
    }
    current = { stage: s, script, preview };
    closeTheatre();
  } catch (e) {
    // 剧本读坏、演出出错：收起舞台回地图，不把玩家卡在幕布里。
    console.error(e);
    current = null;
    closeTheatre();
    toast('这一关的演出出错了，已返回地图');
    hooks.back(id);
    return;
  } finally {
    staging = false;
  }
  try { await hooks.fight(setupFor(s)); }
  catch (e) { current = null; console.error(e); hooks.back(id); }
}
let staging = false;

/** 战斗赢了：先记进度（战后演出中途关掉页面也不丢），再演战后，回地图。返回时战斗画面已经被调用方收起。 */
export async function afterWin(game: FightGame): Promise<void> {
  const run = current;
  if (!run || !hooks) return;
  current = null;
  reward(run.stage, goalsOf(run.stage, game), run.preview);
  try {
    await play(run.script, run.script.post, { copies: copiesOf(run.stage), warm: run.script.pre, idOf, label: label(run.stage) });
  } catch (e) {
    console.error(e);
  } finally {
    closeTheatre();
    hooks.back(nextOf(run.stage.id));
  }
}

/** 输了之后离开（不重试）。 */
export function leaveStory(): string | null {
  const id = current?.stage.id ?? null;
  current = null;
  return id;
}
