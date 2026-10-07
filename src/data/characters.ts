import type { BandId } from './bands.ts';
import type { CharacterData, Trait } from './types.ts';
import { skill } from './skills.ts';

/* Roster order is band order (see bands.ts): members sit together, and the select screen walks
   this array emitting a group header whenever the primary band changes. gale, ember and boulder
   are the original placeholder cast (~7.3-head colour-block girls until img2img lands) —
   playable: false keeps them off the select screen while selfcheck still drills on them. */

const passives: Record<Trait, [string, string]> = {
  rush: ['追击节奏', '每第 3 次命中额外获得 14 气'],
  armor: ['硬派身躯', '受到的伤害降低 5%'],
  focus: ['远距专注', '飞行道具速度提高 15%'],
  beat: ['鼓点', '命中叠节拍（至多 8 层），每层冷却加快 6%、移速提高 2%；被击中掉 2 层'],
};

const stats = (trait: Trait) => ({
  trait,
  passive: passives[trait],
  hp: trait === 'armor' ? 1040 : 1000,
  speed: trait === 'rush' ? 248 : trait === 'armor' ? 195 : 225,
  power: 1,
});

export const ROSTER: CharacterData[] = [
  {
    id: 'uika', name: '三角初华', title: '忠犬 / 悲伤', quote: '我毋畏悲伤。', color: '#BB9955',
    bands: ['ave-mujica', 'sumimi'],
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/uika/common.png', special: '/sprites/uika/special.png', height: 181 },
    skills: [
      skill(0, 'light', '轻唤'),
      skill(1, 'heavy', '靴踢'),
      skill(2, 'dash', '爬行', { damage: 18, cd: 1.2, speed: 420, duration: .72, fx: 'crawl', reach: 'low', brief: '贴地前冲；只打站立目标', detail: '贴地前冲；只打站立目标' }),
      skill(3, 'projectile', '悲鸣', {
        damage: 26, interval: .12, start: .2, duration: .95, size: 36, fx: 'wail',
        brief: '远程音波；血越少枚数越多（1～4）', detail: '远程音波；血越少枚数越多（1～4）',
      }),
      skill(4, 'grab', '别走'),
      skill(5, 'grab', '推落', { fx: 'shove', hitbox: 'front', speed: 700, duration: 2.2, brief: '前冲抓取并甩飞', detail: '前冲抓取并甩飞' }),
    ],
  },
  {
    id: 'mutsumi', name: '若叶睦', title: '沉默 / 园艺', quote: '我弹得太差了……', color: '#779977',
    bands: ['ave-mujica'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/mutsumi/common.png', special: '/sprites/mutsumi/special.png', height: 181,
      extras: ['/sprites/mutsumi/cucumber.png', '/sprites/mutsumi/note.png', '/sprites/mutsumi/mortis.png'],
    },
    skills: [
      skill(0, 'light', '点拨'),
      skill(1, 'heavy', '拂踢'),
      skill(2, 'projectile', '回旋黄瓜', { fx: 'cucumber', speed: 420, size: 48, life: 2.4, brief: '飞到尽头折返', detail: '飞到尽头折返' }),
      skill(3, 'heavy', '轮奏', { range: 188, start: .16, duration: .7, cd: 5, knock: 320, breakout: true, invuln: .8, brief: '横扫击退身前；出招即无敌，可解控', detail: '横扫击退身前；出招即无敌 0.8 秒，可解控' }),
      skill(4, 'projectile', '三音', {
        damage: 28, count: 3, interval: .16, speed: 520, size: 36, start: .2, duration: .85, fx: 'mutsumi-note',
        brief: '向前连发三枚', detail: '向前连发三枚',
      }),
      skill(5, 'grab', '墨缇丝', {
        cost: 105, damage: 48, range: 280, start: .34, duration: 1.35, count: 4, interval: .12, fx: 'mortis',
        brief: '前冲抓取，连打四下', detail: '前冲抓取，连打四下',
      }),
    ],
  },
  {
    id: 'umiri', name: '八幡海铃', title: '雇佣 / 恐惧', quote: '我毋畏恐惧。', color: '#335566',
    bands: ['ave-mujica'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/umiri/common.png', special: '/sprites/umiri/special.png', height: 181,
      extras: ['/sprites/umiri/milk.png', '/sprites/umiri/bag.png'],
    },
    skills: [
      skill(0, 'light', '点指'),
      skill(1, 'heavy', '靴踢'),
      skill(2, 'projectile', '报价', {
        damage: 16, speed: 560, size: 36, life: 1.6, start: .12, duration: .45, fx: 'milk',
        motion: 'fall', floor: 'stick',
        brief: '抛物线过顶；落地可捡回气', detail: '抛物线，中段从头顶过；落地可捡回气',
      }),
      skill(3, 'projectile', '扫货', {
        damage: 9, count: 6, interval: .05, size: 40, start: .12, duration: .7, cd: 4.5, life: 1.5, fx: 'bag',
        motion: 'fall', floor: 'drop',
        knock: 0, knockOnBlock: true, react: { kind: 'stand', stun: .26 },
        brief: '抛物线六连发，落地消失；贴脸全中', detail: '抛物线六连发，落地消失；贴脸全中',
      }),
      skill(4, 'endure', '恐湖', {
        damage: 32, range: 300, start: .26, duration: .85, cd: 8, fx: 'ripple', breakout: true,
        knock: 620, knockOnBlock: true, holdEndure: true, hitbox: 'radial', reach: 'ground', hitAll: true,
        react: { kind: 'stand', stun: .35 },
        brief: '霸体震开，强击退；跳起可躲，可解控', detail: '霸体震开，强击退；跳起可躲，可解控',
      }),
      skill(5, 'grab', '信用', {
        cost: 110, damage: 175, range: 110, start: .16, duration: 1.15, speed: 220, fx: 'slam', hitbox: 'front',
        knock: 120, shake: 14, hitstop: .09,
        react: { kind: 'knockdown', vy: 0, knocked: 1, stun: .4, snapFloor: true },
        brief: '抓住向后摔', detail: '抓住向后摔',
      }),
    ],
  },
  {
    id: 'nyamu', name: '祐天寺喵梦', title: '鼓手 / 恋爱', quote: '我毋畏恋爱。', color: '#C6B4E3',
    bands: ['ave-mujica'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/nyamu/common.png', special: '/sprites/nyamu/special.png', height: 181,
      extras: ['/sprites/nyamu/kit.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'launch', '回旋踢', { range: 130, brief: '命中挑空，跳起追打可连段', detail: '命中挑空，跳起追打可连段' }),
      skill(3, 'sweep', '扫膛腿'),
      skill(4, 'heavy', '月牙踢', { range: 190, cd: 5, fx: 'arc-kick', brief: '大范围下砸', detail: '大范围下砸' }),
      skill(5, 'projectile', '满场', {
        cost: 125, damage: 36, count: 16, interval: .09, size: 36, start: .28, duration: 2.6, life: 2.4, fx: 'drums',
        brief: '持续震开近身；音符分两次铺满全场', detail: '持续震开近身；音符分两次铺满全场',
      }),
    ],
  },
  {
    id: 'sakiko', name: '丰川祥子', title: '近身 / 奏鸣', quote: '我毋畏遗忘。', color: '#7799CC',
    bands: ['ave-mujica'],
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/sakiko/common.png', special: '/sprites/sakiko/special.png', height: 181 },
    skills: [
      skill(0, 'light', '礼掌', { brief: '轻击；命中可接 J / K', detail: '轻击；命中可接 J / K' }),
      skill(1, 'heavy', '拂踢', { range: 132, brief: '重击；击退，轻击后可接', detail: '重击；击退，轻击后可接' }),
      skill(2, 'dash', '忘却步', { range: 120, brief: '前冲掌击', detail: '前冲掌击' }),
      skill(3, 'light', '轮舞', { damage: 22, range: 188, start: .08, duration: .64, cd: 3, count: 3, interval: .11, brief: '绕身连打三下', detail: '绕身连打三下' }),
      skill(4, 'launch', '月牙踢', { range: 126, fx: 'crescent', brief: '命中挑空，跳起追打可连段', detail: '命中挑空，跳起追打可连段' }),
      skill(5, 'projectile', '忘却奏鸣', {
        cost: 115, damage: 40, count: 8, interval: .075, speed: 540, size: 40, start: .3, duration: 1.2, life: 2.2, fx: 'note',
        brief: '连发八枚音符', detail: '连发八枚音符',
      }),
    ],
  },
  {
    id: 'tomori', name: '高松灯', title: '主唱 / 迷子', quote: '那……能陪我组一辈子的乐队吗？', color: '#77BBDD',
    bands: ['mygo'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/tomori/common.png', special: '/sprites/tomori/special.png', height: 181,
      extras: ['/sprites/tomori/stone.png', '/sprites/tomori/plaster.png'],
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '飞砾谱', {
        damage: 12, knock: 380, speed: 540, size: 44, start: .16, duration: .5, life: 1.5, cd: .8, fx: 'stone',
        brief: '小石头；命中强击退，专打断起手', detail: '小石头；命中强击退，专打断起手',
      }),
      skill(3, 'endure', '绊创膏', {
        damage: 0, start: .3, duration: .85, cd: 9, breakout: true, fx: 'plaster',
        onActive: [
          { op: 'mod', kind: 'brace', time: 6, set: true },
          { op: 'fx', life: 1.2, dir: true },
          { op: 'repel', range: 190, push: 500 },
        ],
        brief: '震开周围并霸体；可解控', detail: '震开周围敌人，6 秒内霸体、受伤降低 33%；可解控',
      }),
      skill(4, 'projectile', '奇独点', {
        damage: 8, knock: 0, interval: .2, start: .3, duration: .75, cd: 8, life: 1.4, size: 150, fx: 'blackhole',
        solid: false,
        brief: '黑洞吸住敌人；跳出可躲，冲刺可挣脱', detail: '前方生成黑洞，吸住敌人并多段低伤，1.4 秒后消失；出手后即可行动，跳出可躲伤害、冲刺可挣脱',
      }),
      skill(5, 'endure', '诗超绊', {
        cost: 120, damage: 0, start: 1.0, duration: 1.35, fx: 'poem',
        onActive: [{ op: 'summon', kind: 'ally' }],
        brief: '原地歌唱震退；召唤队友并肩，被击败提前退场', detail: '原地歌唱 1 秒震退对手，随后召唤 1 名 MyGO 队友并肩 12 秒；队友生命只有两成，被击败提前退场',
      }),
    ],
  },
  {
    id: 'anon', name: '千早爱音', title: '跑女 / 扫弦', quote: '是又怎样？', color: '#FF8899',
    bands: ['mygo'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/anon/common.png', special: '/sprites/anon/special.png', height: 181,
      extras: ['/sprites/anon/note.png', '/sprites/anon/heart.png', '/sprites/anon/guitar.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'dash', '羽丘跑女', {
        damage: 22, cd: 2.2, speed: 1450, start: .08, duration: .46, range: 100,
        brief: '超长距离冲刺', detail: '超长距离冲刺',
      }),
      skill(3, 'projectile', 'C和弦', {
        damage: 11, count: 12, interval: .11, speed: 420, size: 36, start: .16, duration: 1.64, cd: 5.5, life: 1.6, fx: 'chord',
        knock: 160, knockOnBlock: true,
        brief: '追踪音符；按住连发至十二发', detail: '追踪音符；按住连发至十二发',
      }),
      skill(4, 'projectile', '爱音之光', {
        damage: 28, speed: 460, size: 56, start: .35, duration: .9, cd: 7, life: 2.2, fx: 'heart',
        root: 3, rootPin: true, knock: 0, knockOnBlock: true, control: true,
        brief: '命中定身；再受击两次解除', detail: '命中定身 3 秒；再受击两次解除',
      }),
      skill(5, 'light', '不会再逃避了', {
        cost: 130, damage: 40, range: 300, start: .28, duration: 1.26, count: 6, interval: .14, fx: 'spin',
        hitbox: 'radial', knock: 0, knockOnBlock: true,
        react: { kind: 'pin', stun: .2 },
        finale: { knock: 340, knockOnBlock: false, react: { kind: 'knockdown', vy: -240, knocked: .72 } },
        brief: '一周身连打，最后击飞', detail: '一周身连打，最后击飞',
      }),
    ],
  },
  {
    id: 'rana', name: '要乐奈', title: '吉他 / 野良猫', quote: '有趣的女人。', color: '#77DD77',
    bands: ['mygo'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/rana/common.png', special: '/sprites/rana/special.png', height: 181,
      extras: ['/sprites/rana/parfait.png', '/sprites/rana/matcha.png'],
    },
    skills: [
      skill(0, 'light', '轻挠'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'light', '吉他激奏', {
        damage: 12, count: 10, interval: .42, range: 240, start: .35, duration: 4.6, cd: 2, knock: 240, fx: 'riff',
        hitbox: 'disc',
        brief: '环形音波，跳不掉；按住连弹，点按省冷却', detail: '以自身为中心的环形音波，跳不掉；按住一直弹，越弹越广也越疼；点按更省冷却',
      }),
      skill(3, 'dash', '来去如风', {
        damage: 0, range: 192, start: .1, duration: .34, cd: 2.4, invuln: .1, fx: 'wind',
        brief: '原地消失重现；穿过一切', detail: '原地消失重现；穿过一切',
      }),
      skill(4, 'launch', '高踢腿', { damage: 24, range: 180, cd: 4.5 }),
      skill(5, 'projectile', '抹茶大芭菲', {
        cost: 130, damage: 14, count: 22, interval: .28, start: .45, duration: .85, life: 6.5, size: 56, knock: 90, fx: 'parfait',
        motion: 'fall', solid: false,
        brief: '放下大芭菲喷发熔岩；自身可自由行动', detail: '放下大芭菲，持续喷发抹茶熔岩；放下后自身可自由行动',
      }),
    ],
  },
  {
    id: 'soyo', name: '长崎素世', title: '贝斯 / 假面', quote: '为什么要演奏春日影！', color: '#FFDD88',
    bands: ['mygo'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/soyo/common.png', special: '/sprites/soyo/special.png', height: 181,
      frenzy: '/sprites/soyo/frenzy.png',
      extras: ['/sprites/soyo/note.png'],
    },
    skills: [
      skill(0, 'light', '挥手'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'grab', '求你了！', {
        damage: 66, range: 130, start: .18, duration: 1.2, cd: 7, speed: 520, fx: 'onegai',
        knock: 360, shake: 10, hitstop: .08,
        react: { kind: 'knockdown', vy: -440, knocked: .72, stun: .5, clearRoot: true },
        brief: '冲刺抓住对方，停顿后头撞击飞', detail: '冲刺抓住对方，停顿后头撞击飞',
      }),
      skill(3, 'endure', '就由我来结束一切', {
        damage: 0, start: .42, duration: .9, cd: 10, fx: 'resolve',
        onActive: [
          { op: 'form' },
          { op: 'fx', life: .75, radius: 190 },
          { op: 'repel', range: 190, push: 540, stun: .22 },
        ],
        brief: '霸体震开周围；攻速大增，轻击三连后自动接重击', detail: '霸体震开周围敌人；8 秒内攻速大增，轻击三连后自动接重击',
      }),
      skill(4, 'projectile', '不甘的演奏', {
        damage: 30, count: 2, interval: .34, speed: 380, size: 52, start: .3, duration: 1.0, cd: 2, life: 2.2, fx: 'sob',
        brief: '两枚贴地音符', detail: '两枚贴地音符',
      }),
      skill(5, 'projectile', '为什么要演奏春日影', {
        cost: 115, damage: 72, speed: 430, size: 150, start: .34, duration: 1.15, life: .56, fx: 'shout', root: 4,
        knock: 110, knockOnBlock: true, control: true,
        brief: '音波推进；出手即可行动，命中定身', detail: '音波推进；出手即可行动；定身 4 秒，受击两次解除',
      }),
    ],
  },
  {
    id: 'taki', name: '椎名立希', title: '鼓手 / 护灯', quote: '我发誓，和灯在一起的话，一辈子也可以。', color: '#7777AA',
    bands: ['mygo'],
    ...stats('beat'),
    view: { kind: 'sprite', common: '/sprites/taki/common.png', special: '/sprites/taki/special.png', height: 181 },
    skills: [
      skill(0, 'light', '点打'),
      skill(1, 'heavy', '怪力横扫'),
      skill(2, 'projectile', '离灯远点', {
        damage: 14, speed: 520, size: 44, life: .5, start: .2, duration: .5, cd: 4, knock: 120, drain: 20, fx: 'abuse',
        brief: '毒舌气泡；命中削对方的气', detail: '毒舌气泡；命中削去对方 20 气',
      }),
      skill(3, 'endure', '哈？', {
        damage: 34, range: 280, start: .26, duration: .85, cd: 8, knock: 620, breakout: true, fx: 'huh',
        holdEndure: true, hitbox: 'radial', react: { stun: .35 },
        brief: '霸体震开，强击退；跳起可躲，可解控', detail: '一声「哈？」震开，强击退；跳起可躲，可解控',
      }),
      skill(4, 'dash', '我要拉黑他', {
        damage: 30, speed: 820, start: .1, duration: .45, range: 115, cd: 9, fx: 'ban', control: true,
        brief: '冲刺拉黑；禁足对方，期间受伤降低', detail: '冲刺拉黑：对方完全禁足 3 秒，期间受伤减半',
      }),
      skill(5, 'grab', '和灯在一起的话，一辈子也可以', {
        cost: 105, damage: 28, range: 200, start: .3, duration: 2.05, speed: 500, fx: 'vow',
        react: { kind: 'pin', stun: .3, holdStill: true },
        finale: { react: { kind: 'knockdown', vy: -240, knocked: .72 } },
        brief: '抓住对方连打七击，末击击倒', detail: '抓住手腕，把对方当鼓由慢到快连打七击，末击击倒；残血时换台词',
      }),
    ],
  },
  {
    id: 'arale', name: '仲町阿拉蕾', title: '主唱 / 梦想', quote: '夢はパワー！', color: '#FFEE55',
    bands: ['yumemita'],
    ...stats('focus'),
    frenzy: { rate: 1.18, rangeMul: 1.3, cdMul: 1, chain: false, time: 10, tint: '#ffe98a' },
    view: {
      kind: 'sprite', common: '/sprites/arale/common.png', special: '/sprites/arale/special.png', height: 181,
      frenzy: '/sprites/arale/frenzy.png',
    },
    skills: [
      skill(0, 'light', '拍拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'light', '高能量！', {
        damage: 14, count: 7, interval: .1, range: 160, start: .15, duration: 1.2, cd: 5,
        gain: 4, knock: 0, knockOnBlock: true, fx: 'flurry',
        react: { kind: 'pin', stun: .2 },
        finale: { knock: 560, knockOnBlock: false, react: { forceKnock: true } },
        brief: '七连快拳钉住对手；末拳强击退', detail: '七连快拳钉住对手；末拳强击退',
      }),
      skill(3, 'projectile', '高音量！', {
        damage: 13, count: 3, interval: .5, speed: 300, size: 150, life: 2.7,
        start: .25, duration: 1.5, cd: 7, knock: 120, fx: 'mega',
        contact: 'pass',
        brief: '慢速音波推进全场；跳起可躲', detail: '慢速音波推进全场，把人推着走；跳起可躲',
      }),
      skill(4, 'endure', '高肌肉！', {
        damage: 0, range: 190, start: .35, duration: .9, cd: 10, fx: 'muscle',
        onActive: [
          { op: 'mod', kind: 'muscle', time: 7 },
          { op: 'fx', life: .75, radius: 190 },
          { op: 'repel', push: 500 },
        ],
        brief: '震开周围；伤害提高', detail: '震开周围；7 秒内伤害提高 30%',
      }),
      skill(5, 'endure', '梦想即力量！', {
        cost: 105, damage: 0, range: 220, start: .5, duration: .9, fx: 'dream',
        onActive: [
          { op: 'form' },
          { op: 'mod', kind: 'brace' },
          { op: 'mod', kind: 'noGain' },
          { op: 'fx', life: .9, radius: 220 },
          { op: 'repel', push: 420 },
        ],
        brief: '狂化：J / K 更快更长，真霸体，无法获得气', detail: '狂化 10 秒：J / K 更快更长，真霸体，期间无法获得气',
      }),
    ],
  },
  {
    id: 'nonoka', name: '宫永野乃花', title: '吉他 / 国王', quote: '对半分！', color: '#FFBBCC',
    bands: ['yumemita'],
    ...stats('rush'),
    frenzy: { rate: 1, rangeMul: 1.65, cdMul: 2, damageMul: 1.55, chain: false, air: true, lock: true, time: 7, tint: '#ffd0dc' },
    view: {
      kind: 'sprite', common: '/sprites/nonoka/common.png', special: '/sprites/nonoka/special.png', height: 181,
      king: '/sprites/nonoka/king.png',
      // Staff fills the cell, so the body reads short. Playback only; feet stay on the cell bottom.
      kingScale: 1.1,
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'grab', '食兔者', {
        damage: 18, range: 175, start: .18, duration: 1.4, cd: 7, speed: 580, knock: 0, fx: 'rabbit',
        hold: { lunge: .3, reach: 52, beats: 3, gap: .2 },
        react: { kind: 'pin', stun: .25, holdStill: true },
        brief: '前冲贴脸连咬三口并锁住；不击倒', detail: '前冲贴脸连咬三口并锁住；不击倒',
      }),
      skill(3, 'grab', '抱抱还是亲亲', {
        damage: 10, range: 90, start: .16, duration: 2.05, cd: 9, speed: 420, knock: 110, fx: 'kiss',
        hold: { lunge: .24, reach: 48, beats: 5, gap: .3 },
        react: { kind: 'pin', stun: .28, holdStill: true },
        finale: { react: { kind: 'knockdown', vy: -120, knocked: .9, stun: .45 } },
        brief: '短冲抱住连亲五下，末下击倒', detail: '短冲抱住，1.5 秒内亲 5 下，末下击倒',
      }),
      skill(4, 'endure', '对半分', {
        damage: 0, range: 0, start: .35, duration: .85, cd: 10, fx: 'half',
        onActive: [{ op: 'summon', kind: 'half' }],
        brief: '敌人身后召出影子，只普攻', detail: '敌人身后召出半透明的自己：只普攻，伤害三成、血量两成，6 秒',
      }),
      skill(5, 'endure', 'Nono国王', {
        cost: 115, damage: 0, range: 160, start: .4, duration: .85, fx: 'king',
        onActive: [
          { op: 'form', king: true },
          { op: 'mod', kind: 'noGain' },
          { op: 'fx', life: .7, radius: 160 },
          { op: 'repel', push: 380 },
        ],
        brief: '变身国王：只剩普攻且强化，冷却加倍，无法获得气', detail: '发光后披风王冠权杖 7 秒：只剩普攻，范围和伤害提高，冷却加倍，无法获得气',
      }),
    ],
  },
  {
    id: 'ritsu', name: '峰月律', title: '节奏吉他 / 肉盾', quote: '10磅！七分熟！其中5磅配蒜香酱！剩下的配和风夏里亚宾酱！', color: '#4477CC',
    bands: ['yumemita'],
    ...stats('armor'),
    view: {
      kind: 'sprite', common: '/sprites/ritsu/common.png', special: '/sprites/ritsu/special.png', height: 181,
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'sweep', '超级带骨肉', {
        // Three sheet frames. A long hold on each one reads as a freeze, so the swing is short.
        damage: 64, range: 176, start: .2, duration: .5, cd: 8, knock: 520, fx: 'rib',
        brief: '砸下带骨肉，击倒；打不到空中的对手', detail: '朝地面砸下带骨肉，击倒；打不到空中的对手',
      }),
      skill(3, 'dash', '肉串刺击', {
        // 69 active frames at 668 px/s is 384px, four tenths of the 960-wide stage.
        damage: 36, range: 100, start: .12, duration: .78, cd: 6, speed: 668, knock: 160, fx: 'skewer', reach: 'ground',
        brief: '持肉串前冲穿过敌人；跳起可躲', detail: '持肉串前冲约半屏，穿过敌人；跳起可躲',
      }),
      skill(4, 'heavy', '大份牛排', {
        damage: 0, range: 0, start: .36, duration: .8, cd: 8, fx: 'steak',
        onActive: [
          { op: 'heal', hp: 40 },
          { op: 'mod', kind: 'brace', time: 4 },
          { op: 'fx', life: .55, y: -118, dir: true, color: '#6eb6ff' },
        ],
        brief: '啃牛排回血并霸体；前摇被打中则作废', detail: '啃牛排回复 40 并霸体 4 秒；前摇被打中则作废',
      }),
      skill(5, 'endure', '超恢复', {
        damage: 0, range: 0, start: .45, duration: .9, fx: 'feast',
        onActive: [
          { op: 'mod', kind: 'brace', time: 6 },
          { op: 'mod', kind: 'feast', time: 6 },
          { op: 'mod', kind: 'noGain', time: 6 },
          { op: 'fx', type: 'burst', life: .4, radius: 80, color: '#9ad4ff' },
        ],
        brief: '霸体回血；禁回气，不能用 J / K，技能照常', detail: '6 秒内霸体、每秒回复 18、无法获得气；期间不能用 J / K，技能照常',
      }),
    ],
  },
  {
    id: 'miyako', name: '藤都子', title: '键盘 / 阴角', quote: '临！兵！斗！者！皆！阵！烈！在！前！', color: '#9977CC',
    bands: ['yumemita'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/miyako/common.png', special: '/sprites/miyako/special.png', height: 181,
      extras: ['/sprites/miyako/seal.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'heavy', '巨羊羹砸击', {
        damage: 20, range: 186, start: .24, duration: .58, cd: .7, knock: 120, fx: 'yokan', reach: 'ground',
        frail: 2, frailBonus: .2,
        brief: '掏出羊羹下砸；打实后脆弱，跳起可躲', detail: '从背后掏出羊羹下砸；打实后脆弱 2 秒（受伤 +20%），跳起可躲',
      }),
      skill(3, 'heavy', '秋叶原马拉松', {
        damage: 0, range: 0, start: .28, duration: .65, cd: 9, fx: 'marathon',
        onFinish: [
          { op: 'mod', kind: 'sprint', time: 4.5 },
          { op: 'mod', kind: 'poise', time: 4.5 },
          { op: 'fx', life: .55, y: -70, radius: 80 },
        ],
        brief: '摆出架势；被打断则失效，完成后移速提高且霸体', detail: '摆出架势；被打断则失效，完成后 4.5 秒内移速提高且霸体',
      }),
      skill(4, 'heavy', '满月嚎叫', {
        damage: 70, range: 87, start: .4, duration: .72, cd: 7, knock: 580, fx: 'howl',
        hitbox: 'disc', superArmor: true,
        brief: '贴身音波，强击退；真霸体，跳到最高可出圈', detail: '贴身圆形音波，强击退；放出时真霸体，跳到最高可出圈',
      }),
      skill(5, 'projectile', '九字真言', {
        cost: 110,
        // focus multiplies shot speed by 1.15; 366 lands on about 421, and 0.7s of that is ~295px.
        damage: 36, count: 1, speed: 366, size: 140, life: .7, interval: .07,
        start: .55, duration: .9, knock: 0, fx: 'seal', hitstop: .09,
        solid: false,
        brief: '身前法阵穿透；打实后不能格挡和后撤', detail: '身前法阵穿透多段；打实后 3 秒不能格挡和后撤',
      }),
    ],
  },
  {
    id: 'yuno', name: '千石由乃', title: 'DJ / 音控', quote: '已经结束的事情，和不想结束的心情是两码事吧？', color: '#EE5577',
    bands: ['yumemita'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/yuno/common.png', special: '/sprites/yuno/special.png', height: 181,
      extras: ['/sprites/yuno/meat.png', '/sprites/yuno/note.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'light', '韵律直觉', {
        damage: 18, count: 6, interval: .42, range: 130, start: .22, duration: 2.75, cd: 3, knock: 460, gain: 4, fx: 'groove',
        hitbox: 'disc',
        brief: '点按击退；按住推开并射出追踪音符，起跳可躲', detail: '点按一圈击退；按住持续推开，并从第二拍起射出慢速追踪音符，起跳可躲',
      }),
      skill(3, 'projectile', '带骨肉之人', {
        damage: 30, speed: 340, size: 48, life: 999, start: .23, duration: .53, cd: 3.2, knock: 120, gain: 4, fx: 'meat',
        contact: 'pass', solid: false,
        brief: '两侧来回穿透，碰到才消失', detail: '旋转带骨肉在两侧来回穿透，直到由乃碰到才消失',
      }),
      skill(4, 'heavy', '高性能作曲AI', {
        damage: 28, count: 18, interval: .12, range: 0, start: .45, duration: 2.6, cd: 8, knock: 0, gain: 0, fx: 'compose',
        brief: '身前音符雨，不硬直；走开就停，不回气', detail: '身前音符雨，不硬直也不回气；站满约半血，走开就停',
      }),
      skill(5, 'endure', '直接无限大', {
        damage: 0, range: 0, start: .4, duration: .7, fx: 'infinite',
        onActive: [
          { op: 'mod', kind: 'debt', time: 4 },
          { op: 'mod', kind: 'noGain', time: 4, max: true },
          { op: 'fx', type: 'burst', life: .7, radius: 120 },
        ],
        brief: '霸体记账；期间不掉血且禁回气，结束时一起结算', detail: '4 秒霸体记账且禁回气：期间不掉血，结束时一次承受期间伤害的 150%',
      }),
    ],
  },
  {
    id: 'kasumi', name: '户山香澄', title: '主唱 / 邦高祖', quote: '一起キラキラドキドキ吧！', color: '#FF5522',
    bands: ['poppin-party'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/kasumi/common.png', special: '/sprites/kasumi/special.png', height: 181,
      extras: ['/sprites/kasumi/star.png'],
    },
    skills: [
      skill(0, 'light', '轻扫'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '小星星', {
        damage: 11, count: 10, interval: .12, size: 46, start: .2, duration: 1.6, cd: 2.5, life: 1.2,
        knock: 0, gain: 2, fx: 'star',
        floor: 'pop',
        brief: '星星从左上斜落进身前一片；没躲开会被下一颗接上', detail: '十颗星沿同一条斜线落进身前落点区，飞得很快；每颗都可被格挡，命中硬直会接上下一次',
      }),
      skill(3, 'heavy', 'PoPiPa！', {
        damage: 62, range: 135, knock: 520, start: .24, duration: .6, cd: 4.5, fx: 'poppa',
        brief: '圆阵预备动作；命中强击退', detail: '往后勾腿再往前伸手，像在喊大家围成一圈；命中把对面推得老远',
      }),
      skill(4, 'grab', '贴贴', {
        damage: 14, range: 95, speed: 520, start: .18, duration: 1.7, cd: 8,
        knock: 0, gain: 2, fx: 'hug',
        hold: { lunge: .3, reach: 50, beats: 6, gap: .16 },
        react: { kind: 'pin', stun: .22, holdStill: true },
        finale: { root: 2, rootPin: true },
        brief: '抱住贴脸连蹭；结束定身，受击两次解除', detail: '冲上去抱住贴脸六连蹭；最后一蹭定身 2 秒',
      }),
      skill(5, 'projectile', '星之鼓动', {
        cost: 125, damage: 195, size: 480, start: 1.0, duration: 1.4, life: 3, knock: 0, gain: 0, fx: 'wish',
        contact: 'pass', solid: false,
        root: 3, rootBreak: 0, rootPin: true,
        brief: '祈愿召下半屏宽的巨星砸落；命中眩晕，不受击解除', detail: '双手合十祈愿 1 秒并标记落点，巨星从画面左上斜落砸在标记点上：落点附近巨额伤害并眩晕 3 秒',
      }),
    ],
  },
  {
    id: 'arisa', name: '市谷有咲', title: '键盘 / 仓库大王', quote: '一开始以为你只是个脑袋空空的乐天家伙呢。', color: '#AA66DD',
    bands: ['poppin-party'],
    ...stats('armor'),
    // Neutral on purpose: the frenzy clock only drives the box form's king sheet swap.
    frenzy: { rate: 1, rangeMul: 1, cdMul: 1, chain: false, time: 7 },
    view: {
      kind: 'sprite', common: '/sprites/arisa/common.png', special: '/sprites/arisa/special.png', height: 181,
      box: '/sprites/arisa/box.png',
    },
    skills: [
      skill(0, 'light', '弹键盘'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'heavy', '认真模式', {
        damage: 0, range: 0, start: .35, duration: .75, cd: 9, fx: 'boost',
        onActive: [
          { op: 'mod', kind: 'muscle', time: 6 },
          { op: 'mod', kind: 'poise', time: 6 },
          { op: 'fx', life: .75, radius: 90 },
        ],
        brief: '摆架势；攻击提高且不被打断', detail: '摆出自信架势：完成后 6 秒内攻击提高 30% 且不受普攻打断；被打断则失效',
      }),
      skill(3, 'projectile', '才没有喜欢你呢', {
        damage: 28, speed: 460, size: 56, start: .35, duration: .9, cd: 7, life: 2.2, knock: 0, fx: 'bubble',
        root: 3, rootPin: true,
        brief: '娇羞射出气泡；命中定身', detail: '对话气泡：命中定身 3 秒，受击两次解除；可格挡可跳过',
      }),
      skill(4, 'endure', '脸靠的太近了', {
        damage: 34, range: 280, start: .26, duration: .85, cd: 8, knock: 620, breakout: true, fx: 'tsun',
        hitbox: 'radial',
        brief: '全方位傲娇音波；可解控', detail: '全方位傲娇音波，强击退；霸体挡一次，跳起可躲，被连段时可解控',
      }),
      skill(5, 'endure', '无敌仓库大王', {
        damage: 0, range: 200, start: .4, duration: .85, fx: 'box',
        onActive: [
          { op: 'form', king: true },
          { op: 'mod', kind: 'noGain' },
          { op: 'mod', kind: 'poise' },
          { op: 'mod', kind: 'box' },
          { op: 'fx', life: .6, floor: true, radius: 200 },
          { op: 'repel', push: 380 },
        ],
        brief: '变身仓库纸箱：减伤回血', detail: '变成仓库纸箱 7 秒：受伤减半、不受打断、每秒回复 15；只剩 J / K，无法获得气',
      }),
    ],
  },
  {
    id: 'yukina', name: '凑友希那', title: '主唱 / 顶点', quote: '目标只有一个，就是顶点。', color: '#4455BB',
    bands: ['roselia'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/yukina/common.png', special: '/sprites/yukina/special.png', height: 181,
      extras: ['/sprites/yukina/pillar.png'],
    },
    skills: [
      skill(0, 'light', '轻扫'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'launch', '火鸟', {
        // Four standing pillars, two ahead and two behind; each burns a body twice. The spawn
        // and the re-hit live in combat.ts under fx 'firebird'; count stays unset so the
        // melee-count caster never claims this move. knock 0 keeps the victim inside the
        // pillar for the second burn — the float is the whole knockback.
        damage: 18, start: .3, duration: 1.0, cd: 9, size: 110, life: .75, fx: 'firebird', knock: 0,
        brief: '张开双手，前后各召出两道火焰柱；命中挑空',
        detail: '四道火焰柱从地面喷发，每道至多烧两段；命中挑空，跳起追打可连段',
      }),
      skill(3, 'endure', '荆棘的蓝蔷薇', {
        damage: 0, range: 210, start: .3, duration: .85, cd: 10, fx: 'blue-rose',
        onActive: [
          { op: 'mod', kind: 'rose', time: 6, v: .3 },
          { op: 'fx', life: .75, radius: 210 },
          { op: 'repel', push: 520 },
        ],
        brief: '震开身周敌人；短时间近战反伤，蓝蔷薇花瓣飘落',
        detail: '震开近身的敌人；6 秒内近战攻击者受到所造成伤害 30% 的反伤，飞行道具不反弹',
      }),
      skill(4, 'endure', '顶点', {
        damage: 0, range: 520, start: .45, duration: .9, cd: 13, fx: 'summit',
        brief: '大喝一声，全屏音波把敌人轰飞；无伤害，跳不掉',
        detail: '前摇被打中则作废；以自身为中心的 360 度音波贯穿全场，把所有敌人轰飞出去',
      }),
      skill(5, 'endure', '漆黑呐喊', {
        cost: 115, damage: 0, range: 0, start: .55, duration: 1.1, fx: 'black-shout',
        onActive: [
          { op: 'mod', kind: 'shout', time: 8 },
          { op: 'mod', kind: 'noGain', time: 8 },
          { op: 'fx', life: .8, radius: 130, flash: .3, announce: { color: '#8fd8ff', life: .9, size: 19, y: -240 } },
        ],
        brief: '解除封印：攻击力大幅提升且禁回气，结束后反噬自伤',
        detail: '8 秒内攻击力提高 50% 且无法获得气；结束时固定受到 10% 最大生命值的反噬伤害，可以致死',
      }),
    ],
  },
  {
    id: 'kokoro', name: '弦卷心', title: '主唱 / 微笑', quote: '为世界带来笑容！', color: '#FFEE22',
    bands: ['hello-happy'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/kokoro/common.png', special: '/sprites/kokoro/special.png', height: 181,
      extras: ['/sprites/kokoro/ship.png', '/sprites/kokoro/ball.png', '/sprites/kokoro/wave.png'],
    },
    skills: [
      skill(0, 'light', '拍手'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'dash', '微笑大回旋', {
        damage: 40, range: 110, start: .1, duration: 1.0, cd: 5.5, speed: 820, knock: 300, fx: 'cartwheel',
        brief: '长距离大风车回旋突进；中途可转向一次，跳起可躲', detail: '大风车回旋突进约四分之三屏；中途可转向一次，跳起可躲',
      }),
      skill(3, 'projectile', '微笑号出航', {
        damage: 14, count: 12, interval: .12, speed: 400, size: 170, life: 2.6, start: .3, duration: .8, cd: 12, knock: 220, gain: 3, fx: 'smile-ship',
        solid: false,
        brief: '微笑号横穿全场，至多十二段，后段减伤；可格挡', detail: '微笑号横穿全场把人推着走，同一人至多吃十二段，第七段起每段只咬两成；可格挡',
      }),
      skill(4, 'projectile', '抛球杂耍', {
        damage: 12, speed: 650, size: 52, life: 6, start: .2, duration: .5, cd: 8.5, knock: 100, gain: 2, fx: 'juggle-ball',
        contact: 'pass',
        brief: '红白球全场乱飞，越弹越快；可格挡，可被弹幕击落', detail: '红白球高速反弹乱飞 6 秒，每次弹开都换方向并提速两成，至多翻倍；可格挡，可被弹幕击落',
      }),
      skill(5, 'projectile', '世界微笑', {
        cost: 110, damage: 26, count: 3, interval: .16, speed: 520, size: 100, life: 1.1, start: .3, duration: 1.2, knock: 350, root: 3, rootPin: true, fx: 'smile-wave',
        control: true,
        brief: '连发三枚笑脸波；命中定身，可格挡', detail: '连发三枚笑脸波击退；命中定身 3 秒，受击两次解除，可格挡',
      }),
    ],
  },
  {
    id: 'mana', name: '纯田真奈', title: '主唱 / 甜甜圈', quote: '我是获得全国歌唱大赛五连冠的纯田真奈！', color: '#BB9955',
    bands: ['sumimi'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/mana/common.png', special: '/sprites/mana/special.png', height: 181,
      world: '/sprites/mana/world.png',
      extras: ['/sprites/mana/donut-straw.png', '/sprites/mana/donut-choc.png', '/sprites/mana/heart.png'],
    },
    skills: [
      skill(0, 'light', '应援拍手'),
      skill(1, 'heavy', '裙摆回旋'),
      skill(2, 'projectile', '甜甜圈', {
        damage: 20, speed: 420, size: 96, start: .22, duration: .7, cd: 5.5, life: 2.2, fx: 'donut',
        brief: '随机投出甜甜圈：草莓定身，巧克力脆弱', detail: '随机投出一只大甜甜圈：草莓命中定身 2 秒，不受击解除；巧克力命中脆弱 3.5 秒，受伤 +25%',
      }),
      skill(3, 'light', '五冠王的威压', {
        damage: 14, count: 5, interval: .34, range: 230, start: .3, duration: 2.4, cd: 10, knock: 420, gain: 4, fx: 'crown',
        hitbox: 'disc',
        brief: '五波音波向四周扩散；越往后越广，强击退', detail: '原地唱跳，五波超大音波向四周扩散：越往后越广越疼，强击退',
      }),
      skill(4, 'projectile', '偶像魅力', {
        damage: 62, speed: 250, size: 130, start: .45, duration: 1.1, cd: 12, gain: 4, life: 4.2, knock: 0, knockOnBlock: true, fx: 'wink',
        control: true,
        root: 2.5, rootBreak: 0, rootPin: true,
        brief: '射出超大爱心；飞得很慢，命中定身不受击解除', detail: '射出超大爱心，飞得很慢：命中定身 2.5 秒，不受击解除',
      }),
      skill(5, 'endure', '此即世界', {
        cost: 125, damage: 0, range: 0, start: 1.2, duration: 1.7, fx: 'world',
        root: 3, rootBreak: 0, rootLevel: 'freeze',
        brief: '时停全场禁足；期间禁回气，无伤害，不受击解除', detail: '时停唱跳 1.2 秒，随后爱心脉冲让全场禁足 3 秒：无伤害，无法闪避，不受击解除；期间无法获得气',
      }),
    ],
  },
  {
    id: 'aya', name: '丸山彩', title: '主唱 / 偶像', quote: '丸山之上缤纷彩！丸山彩！', color: '#FF88BB',
    bands: ['pastel-palettes'],
    ...stats('rush'),
    gauge: { max: 100, onHitDealt: 1.5, onHitTaken: 5, onBlock: .75, label: '打气', color: '#FFB0D8', head: true },
    view: { kind: 'sprite', common: '/sprites/aya/common.png', special: '/sprites/aya/special.png', height: 181 },
    skills: [
      skill(0, 'light', '挥手'),
      skill(1, 'heavy', '冒失绊脚'),
      skill(2, 'heavy', '劈瓦手刀', {
        damage: 78, range: 120, start: .24, duration: .55, cd: 6, fx: 'chop',
        root: .5, rootBreak: 1,
        brief: '手刀下劈；命中定身，再受击一次解除', detail: '手刀下劈；命中定身 0.5 秒，再受击一次解除',
      }),
      // duration is the no-gauge upper bound: swing_sing rewrites it per cast to the last wave + settle.
      skill(3, 'endure', '这次是真的在唱！', {
        damage: 12, count: 16, interval: .30, range: 260, start: .35, duration: 5.4, cd: 12,
        knock: 200, hitbox: 'disc', holdEndure: true, fx: 'sing', jumpCancel: 1, noGauge: true,
        brief: '环形音波连打；跳不掉霸体，可跳取消，耗尽打气加速', detail: '环形音波十六连打；开唱耗尽全部打气，音波不回打气，越满音波越密（间隔 0.30～0.13 秒）；期间霸体，开唱 1 秒后按跳跃取消',
      }),
      skill(4, 'dash', '修车突进', {
        damage: 58, speed: 820, start: .12, duration: .34, cd: 4.5, hitstop: .06, shake: 4,
        react: { kind: 'knockdown', vy: -260, knocked: .6 },
        brief: '持扳手突进；命中击倒', detail: '短距离持扳手突进；命中击倒',
      }),
      skill(5, 'endure', '丸山闪光', {
        cost: 150, damage: 0, range: 0, start: .5, duration: 1.6, fx: 'flash',
        onActive: [
          { op: 'repel', range: 190, push: 300, stun: .2 },
          { op: 'fx', type: 'flashbulbs', life: 1.2, y: -140, flash: .25 },
          { op: 'mod', kind: 'encore', time: 6 },
          { op: 'mod', kind: 'noGain', time: 6 },
          { op: 'mod', kind: 'brace', time: 6 },
        ],
        brief: '震开周围；期间技能无冷却且禁回气，霸体', detail: '摆出 wink 姿势震开周围一圈；6 秒内所有技能无冷却、无法获得气，效果结束时全部技能一起进入完整冷却；期间霸体',
      }),
    ],
  },
  {
    id: 'mitake', name: '美竹兰', title: '主唱 / 挑染', quote: 'いつも通り、行こう。', color: '#EE0022',
    bands: ['afterglow'],
    ...stats('rush'),
    // 宣战布告: the frenzy clock drives the aggressive sheet swap; no king flag, so U I O L stay open.
    frenzy: { rate: 1.4, rangeMul: 1.15, cdMul: .6, damageMul: 1.25, chain: false, time: 8, tint: '#EE0022' },
    view: {
      kind: 'sprite', common: '/sprites/mitake/common.png', special: '/sprites/mitake/special.png', height: 181,
      frenzy: '/sprites/mitake/frenzy.png',
      extras: ['/sprites/mitake/guitar.png'],
    },
    skills: [
      skill(0, 'light', '拨弦'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '花道·缠', {
        damage: 22, speed: 520, size: 46, life: 1.8, start: .3, duration: .7, cd: 6, fx: 'hana',
        slow: 4, slowMul: .6, slowJump: .75,
        knock: 120, knockOnBlock: true,
        brief: '花枝命中走跳变钝并击退；可格挡或跳过',
        detail: '掷出花枝，命中后 4 秒移动降至 60%、跳跃高度约降至 56% 并击退；可格挡或跳过',
      }),
      skill(3, 'sweep', '不良主唱', {
        damage: 58, range: 170, start: .45, duration: .9, cd: 6.5, fx: 'guitar-smash', hitstop: .09,
        hitbox: 'radial', hitAll: true, reach: 'ground', knock: 480,
        brief: '抡吉他砸地，身周击倒；打不到空中',
        detail: '吉他从上砸向身周地面，范围内全部击倒；打不到空中的对手',
      }),
      skill(4, 'endure', '像以前一样', {
        damage: 0, range: 250, start: .26, duration: .85, cd: 8, breakout: true, fx: 'as-usual',
        holdEndure: true,
        onActive: [
          { op: 'fx', life: .55, radius: 250, dir: true },
          { op: 'repel', range: 250, push: 620, stun: .3 },
          { op: 'mod', kind: 'brace', time: 5 },
        ],
        brief: '无伤害震开并解控；随后霸体',
        detail: '无伤害震开并解控；随后 5 秒霸体，受伤降低 33%',
      }),
      skill(5, 'endure', '宣战布告', {
        cost: 115, damage: 0, range: 200, start: .5, duration: 1.0, fx: 'declaration',
        onActive: [
          { op: 'form' },
          { op: 'mod', kind: 'noGain' },
          { op: 'fx', type: 'declaration', life: .9, radius: 200, announce: { color: '#EE0022', life: .9, size: 19, y: -240 } },
          { op: 'repel', push: 420 },
        ],
        brief: '挑染亮起并震开，普攻变强变快；无法获得气',
        detail: '挑染亮起并震开；8 秒内普攻加快至 1.4 倍、伤害 +25%、范围 +15%、冷却降至 60%，期间无法获得气',
      }),
    ],
  },
  {
    id: 'layer', name: 'LAYER', title: '主唱 / 近战', quote: '准备好大闹一场了吗？', color: '#CC0000',
    bands: ['raise-a-suilen'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/layer/common.png', special: '/sprites/layer/special.png', height: 190,
      world: '/sprites/layer/riot.png',
      extras: ['/sprites/layer/bass.png'],
    },
    skills: [
      skill(0, 'light', '大姐头', { damage: 38, range: 110, start: .11, duration: .46 }),
      skill(1, 'heavy', '不败', { damage: 76, range: 148, start: .26, duration: .82, knock: 440 }),
      skill(2, 'dash', '入侵秀', {
        damage: 86, range: 70, start: .2, duration: .9, cd: 6, speed: 640, knock: 400, fx: 'invade',
        brief: '肩撞前冲；撞上收势，击退随距离，远段击倒',
        detail: '肩撞前冲；撞上就原地收势，打实击退随距离增加，最远一段才击倒，打空则跑完',
      }),
      skill(3, 'heavy', '燃尽', {
        damage: 100, range: 255, start: .48, duration: 1.1, cd: 8, knock: 520, fx: 'burnout',
        brief: '高举琴身砸下；被挡或空挥是大破绽',
        detail: '琴身从头顶砸下并击退；前摇很长，被格挡或空挥都是大破绽',
      }),
      skill(4, 'grab', '全力碰撞', {
        damage: 24, range: 100, start: .36, duration: 1.95, cd: 8, count: 5, interval: .22, gain: 3, fx: 'crash',
        brief: '近身连摔五次；释放期间不受普攻打断，跳开则空',
        detail: '近身抓住往地上连摔；释放期间受击不掉招，伤害和击退照常，抓取和必杀仍能打断。出手慢，跳开则打空',
      }),
      skill(5, 'grab', '大闹一场', {
        cost: 120,
        damage: 28, range: 120, speed: 55, start: .42, duration: 2.05, count: 7, interval: .16, fx: 'riot',
        knock: 0,
        react: { kind: 'pin', stun: .25, holdStill: true },
        finale: { damage: 48, knock: 420, react: { kind: 'knockdown', vy: -260, knocked: .75 } },
        brief: '每击向前一步并带走；禁回气，空挥走完，末击击倒',
        detail: '七下各向前踏一步，打中后钉在身前带走，末击击倒；打空也把步子走完，期间无法获得气',
      }),
    ],
  },
  {
    id: 'viola', name: '薇欧拉', title: '队长 / 恶德', quote: '火种燃尽之后会怎么样呢？', color: '#8E5AC8',
    ...stats('armor'),
    view: {
      kind: 'sprite', common: '/sprites/viola/common.png', special: '/sprites/viola/special.png', height: 181,
      extras: ['/sprites/viola/fuga-arrow.png', '/sprites/viola/fuga-burst.png'],
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '剪', {
        damage: 16, count: 4, interval: .15, range: 872, start: .5, duration: .95, cd: 7,
        life: .8, size: 105, knock: 480, fx: 'snip', noSiphon: true, noSparks: true,
        solid: false,
        brief: '锁定脚下连剪并钉住；离开标记，早跳或格挡可解', detail: '锁定全场敌人脚下，半秒后连剪四段并钉住，末段击退；抬手期离开标记，早跳或格挡可解；被挡不削气',
      }),
      skill(3, 'dash', '哭泣的紫罗兰', {
        damage: 45, range: 175, start: .22, duration: .8, cd: 13, invuln: .5, knock: 280, fx: 'violet',
        brief: '消失重现，两侧各爆开一次；消失期间无敌', detail: '化作花瓣消失并爆开一次，于战场另一侧边缘重现再爆一次；消失期间无敌',
      }),
      skill(4, 'heavy', '录音', {
        damage: 0, range: 0, start: .2, duration: .45, cd: 13, fx: 'record',
        brief: '影子重演行动，无法被击中；必杀不入带', detail: '录下 3.5 秒行动，原地留下影子照剧本重演一遍；影子伤害减半，无法被击中，必杀不入带',
      }),
      skill(5, 'projectile', '火的故事', {
        damage: 0, count: 1, speed: 300, size: 160, life: 6, start: .55, duration: .9, knock: 0, fx: 'fuga',
        solid: false,
        friendly: true, noSiphon: true,
        brief: '火焰箭命中或到边缘即引爆；敌我不分，满跳可躲', detail: '虚空巨弓射出缓慢火焰箭，命中或到边缘即引爆：范围 170 伤，敌我不分，贴身会炸到自己；满跳可躲，格挡付半管破防值',
      }),
    ],
  },
  {
    id: 'gale', name: '疾风', title: '快攻 / 连击', quote: '跟上我的速度。', color: '#7ee0ff',
    playable: false,
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/gale/common.png', special: '/sprites/gale/special.png', height: 181 },
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
    id: 'ember', name: '星火', title: '远程 / 牵制', quote: '保持距离，慢慢烧。', color: '#ffb35c',
    playable: false,
    ...stats('focus'),
    view: { kind: 'sprite', common: '/sprites/ember/common.png', special: '/sprites/ember/special.png', height: 181 },
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
    id: 'boulder', name: '磐石', title: '重装 / 压制', quote: '站稳了再说。', color: '#b7ff6e',
    playable: false,
    ...stats('armor'),
    view: { kind: 'sprite', common: '/sprites/boulder/common.png', special: '/sprites/boulder/special.png', height: 181 },
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

/** Select screen. playable: false holds the headless dummies (gale, ember, boulder) out;
 *  everyone else plays, band or not (薇欧拉 has no band). */
export const PLAYABLE = ROSTER.filter(c => c.playable !== false);

/** Roster members of a band, in roster order. `except` drops the caller from her own call (诗超绊). */
export function bandMembers(band: BandId, except?: string): CharacterData[] {
  return ROSTER.filter(c => c.bands?.includes(band) && c.id !== except);
}

export const ROSTER_BY_ID = new Map(ROSTER.map(c => [c.id, c]));
