/* 比赛结束的统一出口：发碎片、推进任务、提示新完成的任务。每场只跑一次（按 game 对象去重）。 */

import type { FightGame } from '../game/game.ts';
import type { MatchReport } from '../game/report.ts';
import { awardMatch } from '../save/wallet.ts';
import { toast } from '../ui/toast.ts';
import { matchFacts } from './facts.ts';
import { recordMatch } from './progress.ts';

const seen = new WeakSet<object>();

export function afterMatch(g: FightGame, report: MatchReport | null, opts: { online?: boolean; stage?: number } = {}): void {
  if (!report || seen.has(g)) return;
  seen.add(g);
  awardMatch(g, report, g.mode === 'training');
  if (g.mode === 'training') return;
  const done = recordMatch(matchFacts(g, report, opts));
  if (done.length === 1) setTimeout(() => toast(`任务完成：${done[0].name}`), 900);
  else if (done.length > 1) setTimeout(() => toast(`完成 ${done.length} 个任务，去「任务」领取奖励`), 900);
}
