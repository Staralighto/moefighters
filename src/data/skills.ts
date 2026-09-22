import type { Skill, SkillType } from './types.ts';

const KEYS = ['J', 'K', 'U', 'I', 'O', 'L'];

type Template = Omit<Skill, 'key' | 'name' | 'super' | 'type'>;

/* Numbers are the arcade baseline; per-character tweaks go through `extra`. */
const templates: Record<SkillType, Template> = {
  light: { damage: 26, range: 98, start: .075, duration: .26, cd: .23, fx: 'slash', desc: '近身快击；命中可接 J / K' },
  heavy: { damage: 53, range: 126, start: .19, duration: .53, cd: .51, fx: 'slash', desc: '重击击退；可接在轻击后' },
  projectile: { damage: 42, range: 900, start: .23, duration: .53, cd: 3.2, fx: 'orb', desc: '远程飞弹；可格挡或跳过', speed: 480, size: 62, life: 2.7 },
  dash: { damage: 51, range: 112, start: .12, duration: .47, cd: 4.2, fx: 'dash', desc: '快速突进并击退对手' },
  grab: { damage: 70, range: 90, start: .2, duration: .65, cd: 6, fx: 'grab', desc: '近身抓投；无视格挡' },
  upper: { damage: 57, range: 115, start: .1, duration: .65, cd: 4.8, fx: 'upper', desc: '升空对空，起手短暂无敌；空挥后摇长' },
  sweep: { damage: 48, range: 150, start: .26, duration: .62, cd: 4.4, fx: 'sweep', desc: '低扫击倒；打不到空中的对手' },
  endure: { damage: 60, range: 120, start: .42, duration: .8, cd: 5.5, fx: 'burst', desc: '蓄力期间霸体，硬吃一次打击不被打断；抓投与必杀仍能打断' },
  launch: { damage: 44, range: 110, start: .16, duration: .58, cd: 4.6, fx: 'launch', desc: '命中挑空，落地前可追一记轻击' },
};

const superOverrides: Record<SkillType, Partial<Skill>> = {
  light: {},
  heavy: {},
  dash: { damage: 195, range: 145, start: .36, duration: 1.1, desc: '超高速贯穿冲刺；消耗 100 气' },
  projectile: { damage: 65, count: 3, interval: .14, speed: 650, size: 90, start: .25, duration: 1.16, desc: '三连大弹幕必杀；消耗 100 气' },
  grab: { damage: 195, range: 120, start: .36, duration: 1.2, desc: '近身必杀抓投，无视格挡；消耗 100 气' },
  upper: { damage: 195, range: 150, start: .3, duration: 1.2, desc: '必杀升龙，大幅击飞；消耗 100 气' },
  sweep: { damage: 195, range: 200, start: .4, duration: 1.2, desc: '必杀扫腿，长距击倒；消耗 100 气' },
  endure: { damage: 195, range: 160, start: .6, duration: 1.3, desc: '霸体蓄力重击；消耗 100 气' },
  launch: { damage: 195, range: 150, start: .3, duration: 1.2, desc: '必杀上挑，高空挑飞；消耗 100 气' },
};

export function skill(index: number, type: SkillType, name: string, extra: Partial<Skill> = {}): Skill {
  const isSuper = index === 5;
  return {
    key: KEYS[index],
    name,
    type,
    super: isSuper,
    ...templates[type],
    ...(isSuper ? { ...superOverrides[type], cd: 0 } : {}),
    ...extra,
  };
}

/* Everyone shares these while airborne: J / K in the air read from here, never from the character. */
export const AIR_SKILLS: Skill[] = [
  { key: 'J', name: '空中轻击', type: 'light', air: true, super: false, damage: 24, range: 100, start: .07, duration: .3, cd: .3, fx: 'slash', desc: '跳中 J，平砍' },
  { key: 'K', name: '空中重踢', type: 'heavy', air: true, super: false, damage: 46, range: 120, start: .14, duration: .5, cd: .55, fx: 'slash', desc: '跳中 K，向下踢并加速落地' },
];
