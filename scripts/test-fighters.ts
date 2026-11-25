import { skill } from '../src/data/skills.ts';
import type { CharacterData, Trait } from '../src/data/types.ts';

const stats = (trait: Trait) => ({
  trait,
  passive: ['', ''] as [string, string],
  hp: trait === 'armor' ? 1040 : 1000,
  speed: trait === 'rush' ? 248 : trait === 'armor' ? 195 : 225,
  power: 1,
});

/** Fighter profiles for headless tests. No production assets or roster entry. */
export const TEST_FIGHTERS: readonly CharacterData[] = [
  {
    id: 'test-fast', name: '快攻样本', title: '快攻 / 连击', quote: '跟上我的速度。', color: '#7ee0ff',
    ...stats('rush'),
    view: { kind: 'sprite', common: '', special: '', height: 181 },
    skills: [
      skill(0, 'light', '快拳'),
      skill(1, 'heavy', '回旋踢'),
      skill(2, 'dash', '疾步突进'),
      skill(3, 'upper', '旋风升龙'),
      skill(4, 'grab', '缠抱摔'),
      skill(5, 'dash', '风暴穿刺'),
    ],
  },
  {
    id: 'test-ranged', name: '远程样本', title: '远程 / 牵制', quote: '保持距离，慢慢烧。', color: '#ffb35c',
    ...stats('focus'),
    view: { kind: 'sprite', common: '', special: '', height: 181 },
    skills: [
      skill(0, 'light', '拨火'),
      skill(1, 'heavy', '重杖'),
      skill(2, 'projectile', '火球'),
      skill(3, 'launch', '焰柱上挑'),
      skill(4, 'dash', '焰步', { damage: 44, brief: '短距离突进', detail: '短距离突进' }),
      skill(5, 'projectile', '三连星火'),
    ],
  },
  {
    id: 'test-heavy', name: '重装样本', title: '重装 / 压制', quote: '站稳了再说。', color: '#b7ff6e',
    ...stats('armor'),
    view: { kind: 'sprite', common: '', special: '', height: 181 },
    skills: [
      skill(0, 'light', '重拳'),
      skill(1, 'heavy', '砸拳'),
      skill(2, 'grab', '熊抱'),
      skill(3, 'endure', '磐石冲肩'),
      skill(4, 'sweep', '地裂扫腿'),
      skill(5, 'grab', '大地抱摔'),
    ],
  },
];
