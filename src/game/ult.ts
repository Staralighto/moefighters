/* 必杀状态：判定「这一下算不算 L 打出来的」的唯一入口。

   只比对招式名会漏掉很多大招——状态类（狼王来了变身后用 J / K 收尾）、召唤类（召唤出的队友打死人）、
   挂异常类（大招点的烧焦跳死人）、反伤类（大招开的反伤把人弹死）。所以改成一个窗口：
   - 起手：放 L 时打开，至少覆盖这一招本身的时长；
   - 延长：L 期间自己身上加的状态 / 变身、L 给对手挂的异常，都把窗口拉到它们结束；
   - 召唤：L 期间召出来的队友，整段存在期间都算；
   - 领域：L 开的领域（起死开战）还在场上（含被别人领域暂时覆盖），领域主人打出的伤害都算；
   - 收尾：窗口在效果结束后再留 ULT_TAIL 秒，接住最后一下的飞行物和延迟伤害。
   窗口里自己（或自己召唤 / 录下的分身）造成的任何伤害，都算必杀攻击。 */

import type { Skill } from '../data/types.ts';
import type { Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';

/** 效果结束后，窗口再留这么久。 */
export const ULT_TAIL = .6;
/** 超过这个时长的「状态」其实是常驻标记（召唤锁 1e6 秒这类），不拿来延长窗口。 */
export const ULT_CAP = 30;

/** 正在放 L：招式本身还在播。 */
export const castingUlt = (f: Fighter): boolean => f.attack?.index === 5;

/** 处在必杀状态里：正在放 L，或 L 带来的效果还没结束。 */
export const inUlt = (f: Fighter): boolean => f.ultLeft > 0 || castingUlt(f) || !!f.ultSpawn;

/** 把必杀窗口至少延长到 t 秒后（再加收尾）。 */
export function holdUlt(f: Fighter, t: number): void {
  if (!(t > 0) || t > ULT_CAP) return;
  f.ultLeft = Math.max(f.ultLeft, t + ULT_TAIL);
}

/** 这个人有没有一个 L 开出来、还没结束的领域。 */
const ownsUltDomain = (g: FightGame, f: Fighter): boolean => g.domains.some(d => d.ult && d.owner === f.id && d.remaining > 0);

/** 这一下伤害如果是必杀攻击，返回「这是谁的 L」——召唤物、录音分身往上找到本人；不是必杀攻击返回 undefined。
 *  skill 缺省时（反伤、弹伤）只看来源是否处在必杀状态。终幕特写、剧情星标、任务都从这里判。 */
export function ultSource(g: FightGame, attacker: Fighter, skill?: Skill): Fighter | undefined {
  const chain: Fighter[] = [];
  let f: Fighter | undefined = attacker;
  for (let n = 0; f && n < 4; n++) {
    chain.push(f);
    const up: number | undefined = f.summoner ?? f.master;
    f = up != null ? g.fighterById(up) : undefined;
  }
  const root = chain.find(x => !x.minion && !x.echo) ?? chain[chain.length - 1];
  if (skill && (skill.super || skill.key === 'L')) return root;
  return chain.some(x => inUlt(x) || ownsUltDomain(g, x)) ? root : undefined;
}

export const ultBlow = (g: FightGame, attacker: Fighter, skill?: Skill): boolean => !!ultSource(g, attacker, skill);
