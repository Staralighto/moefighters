import type { Skill, SkillType } from './types.ts';

const KEYS = ['J', 'K', 'U', 'I', 'O', 'L'];

type Template = Omit<Skill, 'key' | 'name' | 'super' | 'type'>;

/* Numbers are the arcade baseline; per-character tweaks go through `extra`.
   Copy follows docs/skill-desc-guide.md: the two tiers never show at once, and the battle table
   opens on tier 2, so `brief` must stand on its own — action or type plus every mechanic that
   changes how the move is used or defended against, and no tunable numbers. `detail` states that
   same mechanic set with the numbers the nums line (damage / count / cooldown / cost) cannot show.
   Glossary-implied clauses (grabs pierce guard, 霸体 folds to grabs and supers) stay out. */
const templates: Record<SkillType, Template> = {
  light: { damage: 26, range: 98, start: .075, duration: .26, cd: .23, fx: 'slash', brief: '轻击；命中可接 J / K', detail: '轻击；命中可接 J / K' },
  heavy: { damage: 53, range: 126, start: .19, duration: .53, cd: .51, fx: 'slash', brief: '重击；击退', detail: '重击；击退' },
  projectile: { damage: 42, range: 900, start: .23, duration: .53, cd: 3.2, fx: 'orb', brief: '远程飞弹；可格挡或跳过', detail: '远程飞弹；可格挡或跳过', speed: 480, size: 62, life: 2.7 },
  dash: { damage: 51, range: 112, start: .12, duration: .47, cd: 4.2, fx: 'dash', brief: '突进并击退', detail: '突进并击退' },
  grab: { damage: 70, range: 90, start: .2, duration: .65, cd: 6, fx: 'grab', brief: '近身抓投', detail: '近身抓住对方摔出' },
  upper: { damage: 57, range: 115, start: .1, duration: .65, cd: 4.8, fx: 'upper', brief: '对空；起手无敌', detail: '对空；起手无敌 0.2 秒' },
  sweep: { damage: 48, range: 150, start: .26, duration: .62, cd: 4.4, fx: 'sweep', brief: '低扫击倒；打不到空中的对手', detail: '低扫击倒；打不到空中的对手' },
  endure: { damage: 60, range: 120, start: .42, duration: .8, cd: 5.5, fx: 'burst', brief: '霸体挡一次', detail: '霸体挡一次' },
  launch: { damage: 44, range: 110, start: .16, duration: .58, cd: 4.6, fx: 'launch', brief: '挑空；跳起追打可连段', detail: '挑空；跳起追打可连段' },
};

const superOverrides: Record<SkillType, Partial<Skill>> = {
  light: {},
  heavy: {},
  dash: { damage: 195, range: 145, start: .36, duration: 1.1, brief: '贯穿冲刺', detail: '贯穿冲刺' },
  projectile: { damage: 65, count: 3, interval: .14, speed: 650, size: 90, start: .25, duration: 1.16, brief: '连发三枚大弹幕', detail: '连发三枚大弹幕' },
  grab: { damage: 195, range: 120, start: .36, duration: 1.2, brief: '近身抓投', detail: '近身抓住对方摔出' },
  upper: { damage: 195, range: 150, start: .3, duration: 1.2, brief: '升龙击飞', detail: '升龙击飞' },
  sweep: { damage: 195, range: 200, start: .4, duration: 1.2, brief: '大范围击倒', detail: '大范围击倒' },
  endure: { damage: 195, range: 160, start: .6, duration: 1.3, brief: '霸体蓄力重击', detail: '霸体蓄力重击' },
  launch: { damage: 195, range: 150, start: .3, duration: 1.2, brief: '高空挑空', detail: '高空挑空' },
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
  { key: 'J', name: '空中轻击', type: 'light', air: true, super: false, damage: 24, range: 100, start: .07, duration: .3, cd: .3, fx: 'slash', brief: '空中轻击；打浮空目标上托', detail: '空中轻击；打浮空目标上托，可连段' },
  { key: 'K', name: '空中重踢', type: 'heavy', air: true, super: false, damage: 46, range: 120, start: .14, duration: .5, cd: .55, fx: 'slash', brief: '空中重踢下落；打浮空目标上托', detail: '空中重踢下落；打浮空目标上托' },
];
