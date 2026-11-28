import type { FightGame } from '../game/game.ts';
import type { MatchReport } from '../game/report.ts';
import type { MusouDirector } from './director.ts';
import { listBuild } from './upgrades.ts';

/** 音浪无双的结算海报数据：沿用主游 LIVE REPORT，左边主角，右边打倒的梦魇（一个没打倒就放最后那位）。 */
export function buildMusouReport(g: FightGame, m: MusouDirector): MatchReport {
  const lead = g.fighters[0];
  const clear = m.bossesDefeated >= 2;
  const foes = m.defeated.length ? m.defeated.slice(-2) : m.boss ? [m.boss.data.id] : [];
  const perMin = m.kills / Math.max(1, m.elapsed / 60);
  const rank = m.bossesDefeated >= 3 || (clear && perMin > 90) ? 'S' : clear ? 'A' : m.bossesDefeated >= 1 ? 'B' : 'C';
  return {
    win: clear,
    seal: 'musou',
    stage: m.played.map(s => s.title).join(' → '),
    winners: [{ id: lead.data.id, hp: 0 }],
    losers: foes.map(id => ({ id, hp: 0 })),
    winHp: 0,
    loseHp: 0,
    score: [m.bossesDefeated, 0],
    fin: '',
    finL: false,
    combo: g.maxCombo[lead.id] ?? 0,
    dmg: m.kills,
    ult: m.level,
    rank,
    tag: m.half >= 2 ? `安可 ${m.half - 1}` : '',
    musou: {
      kills: m.kills,
      streak: m.bestStreak,
      level: m.level,
      time: Math.round(m.elapsed),
      songs: m.played.map(s => s.title),
      bosses: m.bossesDefeated,
      build: listBuild(m.build).slice(0, 10).map(e => ({ id: e.id, name: e.name, glyph: e.glyph, cat: e.cat, lv: e.lv, evo: e.evo })),
    },
  };
}
