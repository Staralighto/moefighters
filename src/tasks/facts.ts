/* 一场比赛结束时，任务判定需要的事实。从 FightGame + 结算数据整理出来，任务定义只读这个，不碰战斗内核。 */

import type { FightGame } from '../game/game.ts';
import { humanTeam, type MatchReport } from '../game/report.ts';

export type MatchKind = 'cpu' | 'team' | 'challenge' | 'pvp' | 'online' | 'watch' | 'training';

export interface MatchFacts {
  kind: MatchKind;
  /** 从玩家这一侧看；本地双人、观战为 null。 */
  win: boolean | null;
  /** 人机难度 0 轻松 / 1 标准 / 2 大师；不是打人机为 null。 */
  diff: number | null;
  /** 玩家一侧的正式角色 id（2V2 两位）；无法确定玩家一侧时为空。 */
  mine: string[];
  foes: string[];
  /** 玩家一侧结束时的剩余血量百分比（整队）。 */
  hp: number;
  combo: number;
  ults: number;
  /** 终结这一场的招式的键位（J K U I O L），只在玩家赢时记；时间到或没记到为空。 */
  finKey: string;
  /** 玩家一个回合都没丢。 */
  shutout: boolean;
  rank: MatchReport['rank'];
  /** 无尽模式本关序号。 */
  stage: number;
}

export function matchFacts(g: FightGame, report: MatchReport, opts: { online?: boolean; stage?: number } = {}): MatchFacts {
  const seal = report.seal;
  const kind: MatchKind = g.mode === 'training' ? 'training'
    : opts.online || seal === 'online' ? 'online'
    : seal === 'pvp' ? 'pvp' : seal === 'watch' ? 'watch'
    : g.mode === 'challenge' ? 'challenge' : g.mode === 'team' ? 'team' : 'cpu';
  const me = opts.online ? (report.win === true ? 'winners' : 'losers') : null;
  const side = me ? me : report.win === true ? 'winners' : report.win === false ? 'losers' : null;
  const mine = side ? report[side].map(f => f.id) : [];
  const foes = side ? report[side === 'winners' ? 'losers' : 'winners'].map(f => f.id) : [];
  let finKey = '';
  // 必杀收尾按必杀状态判（状态类、召唤类、异常跳伤的 L 也算），招式名对不上也不要紧。
  if (report.win === true && report.finL) finKey = 'L';
  else if (report.win === true && report.fin) {
    const team = humanTeam(g);
    for (const f of g.fighters) {
      if (team != null && f.team !== team) continue;
      const s = f.data.skills.find(k => k.name === report.fin);
      if (s) { finKey = s.key; break; }
    }
  }
  return {
    kind,
    win: report.win,
    diff: typeof seal === 'number' ? seal : null,
    mine,
    foes,
    hp: report.win === true ? report.winHp : report.win === false ? report.loseHp : 0,
    combo: report.combo,
    ults: report.ult,
    finKey,
    shutout: report.win === true && report.score[1] === 0,
    rank: report.rank,
    stage: opts.stage ?? 0,
  };
}
