/* 结算海报（LIVE REPORT）的数据。纯数据，不碰 DOM：本地、联机房主、挑战模式都从这里取，
   联机时房主替客人算好一份随 netEnd 发过去。渲染在 ui/report.ts。 */

import { ROSTER_BY_ID } from '../data/characters.ts';
import type { FightGame } from './game.ts';

export interface ReportFighter { id: string; hp: number }

export interface MatchReport {
  /** 从观看者座位看：true 赢、false 输。本地双人或无人操作时为 null，标题只说谁获胜。 */
  win: boolean | null;
  /** 印章：人机难度 0-2，或 'pvp' 本地对战 / 'online' 联机 / 'watch' 全员人机的观战。 */
  seal: number | 'pvp' | 'online' | 'watch';
  stage: string;
  /** 胜方在前。hp 是各自剩余血量百分比（整数）。 */
  winners: ReportFighter[];
  losers: ReportFighter[];
  /** 胜方血量百分比（整队合计），给大号数字用。 */
  winHp: number;
  loseHp: number;
  /** 胜方回合数在前。 */
  score: [number, number];
  /** 最后一回合的终结技，空串表示不显示（时间到、或没有记到）。 */
  fin: string;
  /** 观看者一方（中立时为胜方）的数据。 */
  combo: number;
  dmg: number;
  ult: number;
  rank: 'S' | 'A' | 'B' | 'C';
  /** 飘带：「首次 · 难度」「无伤」「绝境安可」「新纪录」或空。 */
  tag: string;
  /** 挑战模式：本关序号、历史最远、是否刷新纪录。 */
  tour?: { stage: number; best: number; newBest: boolean };
}

/** 有真人操作的一方。两边都有人（本地双打）或都没人时返回 null。 */
export function humanTeam(g: FightGame): number | null {
  const teams = new Set(g.fighters.filter(f => !f.minion && !f.echo && f.controller != null).map(f => f.team));
  return teams.size === 1 ? [...teams][0] : null;
}

/** S/A/B/C：剩余血量、己方/对方回合数、最高连击、对手强度。输了最高 B。 */
export function rankOf(win: boolean, hp: number, score: [number, number], combo: number, foeBonus: number): MatchReport['rank'] {
  if (!win) return hp > 0 || score[0] > 0 ? 'B' : 'C';
  const pts = 40 + hp * .3 + (score[1] === 0 ? 15 : 0) + Math.min(combo, 30) * .5 + foeBonus;
  return pts >= 85 ? 'S' : pts >= 70 ? 'A' : pts >= 50 ? 'B' : 'C';
}

/** `viewer`: 观看者所在队伍；null 为中立视角。`online` 时印章写联机。 */
export function buildReport(g: FightGame, viewer: number | null, online = false): MatchReport {
  const winTeam = g.winnerTeam < 0 ? 0 : g.winnerTeam;
  const loseTeam = 1 - winTeam;
  const body = (team: number) => g.fighters.filter(f => f.team === team && !f.minion && !f.echo);
  // 活着就至少 1%：赢家剩 0.4% 不能写成 0%。
  const pct = (hp: number, max: number) => hp <= 0 || !(max > 0) ? 0 : Math.max(1, Math.min(100, Math.round(hp / max * 100)));
  const side = (team: number): ReportFighter[] => body(team).map(f => ({ id: f.data.id, hp: pct(f.hp, f.data.hp) }));
  const teamPct = (team: number) => {
    const b = body(team);
    const max = b.reduce((n, f) => n + f.data.hp, 0);
    return max > 0 ? pct(b.reduce((n, f) => n + Math.max(0, f.hp), 0), max) : 0;
  };
  const me = viewer ?? winTeam;
  const win = viewer == null ? null : viewer === winTeam;
  const combo = Math.max(0, ...body(me).map(f => g.maxCombo[f.id] ?? 0));
  const myHp = teamPct(me);
  const cpuFoe = !online && humanTeam(g) === me && body(1 - me).every(f => f.controller == null);
  const nobody = g.fighters.every(f => f.minion || f.echo || f.controller == null);
  const seal: MatchReport['seal'] = online ? 'online' : cpuFoe ? g.difficulty : nobody ? 'watch' : 'pvp';
  const foeBonus = typeof seal === 'number' ? [-20, 0, 15][seal] : 15;
  const rank = rankOf(win !== false, myHp, [g.wins[me] ?? 0, g.wins[1 - me] ?? 0], combo, foeBonus);
  const winHp = teamPct(winTeam);
  const tag = win === false ? '' : winHp >= 100 ? '无伤' : winHp <= 10 ? '绝境安可' : '';
  return {
    win,
    seal,
    stage: g.options.stage.name,
    winners: side(winTeam),
    losers: side(loseTeam),
    winHp,
    loseHp: teamPct(loseTeam),
    score: [g.wins[winTeam], g.wins[loseTeam]],
    fin: g.roundLog[g.roundLog.length - 1]?.fin ?? '',
    combo,
    dmg: Math.round(g.dealt[me] ?? 0),
    ult: g.ults[me] ?? 0,
    rank,
    tag,
  };
}

const RANKS: readonly MatchReport['rank'][] = ['S', 'A', 'B', 'C'];
const TAGS = new Set(['', '无伤', '绝境安可', '新纪录', '首次 · 轻松', '首次 · 标准', '首次 · 大师']);
const SEALS = new Set<unknown>([0, 1, 2, 'pvp', 'online', 'watch']);

/** 联机时客人收到的结算来自对端，按不可信数据处理：字段逐个校验、数字夹到合理范围、
 *  角色必须在名册里。任何一项不对就整份丢掉，回落到纯文字结算。 */
export function sanitizeReport(v: unknown): MatchReport | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const int = (x: unknown, max: number) => typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : null;
  const text = (x: unknown, max: number) => typeof x === 'string' && x.length <= max ? x : null;
  const side = (x: unknown): ReportFighter[] | null => {
    if (!Array.isArray(x) || x.length < 1 || x.length > 4) return null;
    const out: ReportFighter[] = [];
    for (const f of x) {
      const id = f && typeof f === 'object' ? (f as Record<string, unknown>).id : null;
      const hp = f && typeof f === 'object' ? int((f as Record<string, unknown>).hp, 100) : null;
      if (typeof id !== 'string' || !ROSTER_BY_ID.has(id) || hp == null) return null;
      out.push({ id, hp });
    }
    return out;
  };
  const winners = side(o.winners), losers = side(o.losers);
  const score = Array.isArray(o.score) && o.score.length === 2 ? o.score.map(n => int(n, 99)) : null;
  const win = o.win === true || o.win === false || o.win === null ? o.win : undefined;
  const r = {
    win, seal: o.seal, stage: text(o.stage, 40), winners, losers,
    winHp: int(o.winHp, 100), loseHp: int(o.loseHp, 100), fin: text(o.fin ?? '', 40),
    combo: int(o.combo, 9999), dmg: int(o.dmg, 9999999), ult: int(o.ult, 999),
    rank: o.rank, tag: o.tag ?? '',
  };
  if (r.win === undefined || !SEALS.has(r.seal) || r.stage == null || !winners || !losers || !score || score.some(n => n == null)
    || r.winHp == null || r.loseHp == null || r.fin == null || r.combo == null || r.dmg == null || r.ult == null
    || !RANKS.includes(r.rank as MatchReport['rank']) || !TAGS.has(r.tag as string)) return null;
  return { ...r, score: score as [number, number], winners, losers } as MatchReport;
}
