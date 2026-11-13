import type { BandId } from './bands.ts';
import type { CharacterData, Trait } from './types.ts';
import { skill } from './skills.ts';

/* Roster order is work order, then band order (see bands.ts IPS and BANDS): members sit together, and the
   select screen walks this array emitting a group header whenever the group changes. The bandless of a work
   (薇欧拉) close that work's run, ahead of the next work's bands. gale, ember and boulder
   are the original placeholder cast (~7.3-head colour-block girls until img2img lands) —
   playable: false keeps them off the select screen while selfcheck still drills on them. */

const passives: Record<Trait, [string, string]> = {
  rush: ['追击节奏', '每第 3 次命中额外获得 14 气'],
  armor: ['硬派身躯', '受到的伤害降低 5%'],
  focus: ['远距专注', '飞行道具速度提高 15%'],
  beat: ['鼓点', '命中叠节拍（至多 8 层），每层冷却加快 6%、移速提高 2%；被击中掉 2 层'],
};

/** 和姐姐在一起：召来的是冰川纱夜。 */
export const HINA_PARTNER = 'sayo';

const stats = (trait: Trait) => ({
  trait,
  passive: passives[trait],
  hp: trait === 'armor' ? 1040 : 1000,
  speed: trait === 'rush' ? 248 : trait === 'armor' ? 195 : 225,
  power: 1,
});

/** 半速、捉弄、必杀 share this. The super adds the block flag and the bonus on top. */
const mocaSlow = {
  slow: 5, slowMul: .5, slowJump: .65, slowAtk: .7, slowMark: 'bubble',
};

/* LOCK（朝日六花）: the street-clothes list, and the costume's (frenzy.skills) — J K O L are the same moves,
   U becomes 戴回眼镜 and I the louder shout on the stage sheet's K cells (src/game/lock.ts). */
const LOCK_SKILLS = [
  // 先辈好！（对谁都叫「〇〇先辈」）: the bow is the headbutt; in costume the same press is a headbang.
  skill(0, 'light', '先辈好！'),
  // 幸运E（萌娘百科「饱尝艰辛的幸运E」）: she trips forward into them.
  skill(1, 'heavy', '幸运E', { range: 136 }),
  // 限制器解除（萌娘百科: 平常戴着的眼镜和发带是能力限制器）.
  skill(2, 'endure', '限制器解除', {
    damage: 20, range: 150, start: .3, duration: .78, cd: 1, knock: 320, fx: 'lock-unseal', react: { kind: 'stand', stun: .3 },
    brief: '摘眼镜发圈震开周围，换装狂化；倒地后放更久',
    detail: '摘下眼镜和发圈，震开身边的人 20 伤害，换上演出服狂化 8 秒：J / K 变成甩头，更快更痛，三下 J 自动接 K；I 变成更大的怒吼，U 变成戴回眼镜提前结束；被击倒后 3 秒内放，狂化 +3 秒且震开范围更大；狂化结束后 10 秒才能再放',
  }),
  // 给我安静听着（第三季: 最没自信的她在台上对着起哄的人吼了回去）.
  skill(3, 'heavy', '给我安静听着', {
    damage: 30, range: 175, start: .28, duration: .8, cd: 7, knock: 140, fx: 'lock-hush', react: { kind: 'stand', stun: .35 },
    status: [{ kind: 'silence', time: 2 }],
    brief: '对前方大吼，命中让对方沉默',
    detail: '对前方大吼 30 伤害，命中让对方沉默 2 秒（放不出 U / I / O / L，普通攻击和解控照常）；可格挡',
  }),
  // 护六出动（B 站「护六狂魔 mas王」）.
  skill(4, 'heavy', '护六出动', {
    damage: 52, range: 74, start: .2, duration: 1.1, cd: 9, knock: 380, fx: 'lock-rescue',
    react: { kind: 'knockdown', vy: -240, knocked: .7 },
    brief: '后跳，MASKING 骑摩托冲出撞人；跳起可躲',
    detail: '向后小跳（前半段无敌），MASKING 骑死亡银河号从身后冲过全场，撞到的人 52 伤害并击倒；可格挡，跳起可躲',
  }),
  // 少女乐团大时代（「这就是……这就是，大少女乐团时代呀！」，游戏里的鬼叫语音表情）.
  skill(5, 'light', '少女乐团大时代', {
    cost: 150, damage: 16, range: 640, start: .58, duration: 3.67, fx: 'lock-live', knock: 0, gain: 0, noBlock: true, holdEndure: true,
    finale: { damage: 85, knock: 520, react: { kind: 'knockdown', vy: -340, knocked: 1 } },
    brief: '鬼叫定住全场，甩头五连击，星星爆开击倒；不能格挡',
    detail: '鬼叫让全场对手定身约 2 秒（15 伤害，跳不掉），随后甩头五下，各 16 伤害，最后星星爆开 85 伤害并击倒；不能格挡；平时放会先摘眼镜，演出服时直接开唱；结束时戴回眼镜，狂化随之结束',
  }),
];
const LOCK_STAGE = [
  LOCK_SKILLS[0],
  LOCK_SKILLS[1],
  skill(2, 'endure', '戴回眼镜', {
    damage: 0, range: 0, start: .22, duration: .5, cd: 0, fx: 'lock-reseal',
    brief: '戴回眼镜，提前结束狂化',
    detail: '戴回眼镜，提前结束演出服狂化；之后 10 秒才能再次限制器解除',
  }),
  skill(3, 'heavy', '给我安静听着！', {
    damage: 44, range: 240, start: .22, duration: .66, cd: 7, knock: 400, fx: 'lock-roar',
    react: { kind: 'knockdown', vy: -200, knocked: .6 }, status: [{ kind: 'silence', time: 2 }],
    brief: '演出服怒吼：更远，击倒并沉默',
    detail: '演出服下的怒吼，更远更响：44 伤害并击倒，命中让对方沉默 2 秒；可格挡',
  }),
  LOCK_SKILLS[4],
  LOCK_SKILLS[5],
];

export const ROSTER: CharacterData[] = [
  {
    id: 'uika', name: '三角初华', title: '忠犬 / 悲伤', quote: '我毋畏悲伤。', color: '#BB9955',
    bands: ['ave-mujica', 'sumimi'],
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/uika/common.png', special: '/sprites/uika/special.png', height: 181, lift: 5 },
    skills: [
      skill(0, 'light', '轻唤'),
      skill(1, 'heavy', '靴踢'),
      skill(2, 'dash', '爬行', { damage: 18, cd: 1.2, speed: 420, duration: .72, fx: 'crawl', reach: 'low', brief: '贴地前冲；只打站立目标', detail: '贴地前冲；只打站立目标' }),
      skill(3, 'projectile', '悲鸣', {
        damage: 26, interval: .12, start: .2, duration: .95, size: 36, fx: 'wail',
        brief: '远程音波；血越少枚数越多（1～4）', detail: '远程音波；血越少枚数越多（1～4）',
      }),
      skill(4, 'grab', '别走'),
      skill(5, 'grab', '推落', { cost: 150, damage: 175, fx: 'shove', hitbox: 'front', speed: 700, duration: 2.2, brief: '前冲抓取并甩飞', detail: '前冲抓取并甩飞' }),
    ],
  },
  {
    id: 'mutsumi', name: '若叶睦', title: '沉默 / 园艺', quote: '我弹得太差了……', color: '#779977',
    bands: ['ave-mujica'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/mutsumi/common.png', special: '/sprites/mutsumi/special.png', height: 181, lift: 5, specialScale: .95,
      extras: ['/sprites/mutsumi/cucumber.png', '/sprites/mutsumi/note.png', '/sprites/mutsumi/mortis.png'],
    },
    skills: [
      skill(0, 'light', '点拨'),
      skill(1, 'heavy', '拂踢'),
      skill(2, 'projectile', '回旋黄瓜', { fx: 'cucumber', speed: 420, size: 48, life: 2.4, brief: '飞到尽头折返', detail: '飞到尽头折返' }),
      skill(3, 'heavy', '轮奏', { range: 188, start: .16, duration: .7, cd: 5, knock: 320, breakout: true, brief: '横扫击退身前；出招即无敌，可解控', detail: '横扫击退身前；出招即无敌 0.8 秒，可解控' }),
      skill(4, 'projectile', '三音', {
        damage: 28, count: 3, interval: .16, speed: 520, size: 36, start: .2, duration: .85, fx: 'mutsumi-note',
        brief: '向前连发三枚', detail: '向前连发三枚',
      }),
      skill(5, 'grab', '墨缇丝', {
        cost: 180, damage: 48, range: 280, start: .34, duration: 1.35, count: 4, interval: .12, fx: 'mortis',
        brief: '前冲抓取，连打四下', detail: '前冲抓取，连打四下',
      }),
    ],
  },
  {
    id: 'umiri', name: '八幡海铃', title: '雇佣 / 恐惧', quote: '我毋畏恐惧。', color: '#335566',
    bands: ['ave-mujica'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/umiri/common.png', special: '/sprites/umiri/special.png', height: 170, lift: 5,
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
    id: 'nyamu', name: '祐天寺喵梦', title: '鼓手 / 喵姆亲', quote: '我毋畏恋爱。', color: '#AA4477',
    bands: ['ave-mujica'],
    ...stats('beat'),
    // Hidden: 「我的若麦写作年轻的麦子，麦子被踩只会更加坚强」.
    wheat: { window: 1.5, share: .1, chance: .5, heal: .03, cut: .4, time: 2 },
    view: {
      kind: 'sprite', common: '/sprites/nyamu/common.png', special: '/sprites/nyamu/special.png', height: 172, lift: 2,
      extras: ['/sprites/nyamu/kit.png'],
    },
    skills: [
      skill(0, 'light', '猫爪'),
      skill(1, 'heavy', '高跟踢'),
      // 左右开弓 (combat.ts step_stick_roll): ambidextrous sticks on their head, faster while held; the stick flies
      // on release. Held to the end she drums herself out (「打鼓打似了」).
      skill(2, 'light', '左右开弓', {
        damage: 20, range: 112, start: .14, duration: 3, cd: 5, fx: 'stick-roll', knock: 0, gain: 3, guardDmg: 5,
        react: { kind: 'pin', stun: .32, holdStill: true },
        brief: '按住双棒连敲越敲越快，松手鼓棒飞出；按满会力竭',
        detail: '贴身左右交替连敲，按住越敲越快，至多 12 下；松手掷出鼓棒击倒；敲满 12 下后力竭倒地 0.6 秒',
      }),
      // 蹭热度 (combat.ts step_selfie): the selfie-stick lunge and the photo; their 气 is her 热度. A foe with no
      // meter to borrow leaves the view count at 0 (「怎么一点热度都没有」).
      skill(3, 'grab', '蹭热度', {
        damage: 30, range: 74, speed: 860, start: .12, duration: 1.2, cd: 8, fx: 'selfie', knock: 0, gain: 4,
        react: { kind: 'pin', stun: .65, holdStill: true },
        brief: '突进合影抓取，随机偷走对方的气；没气就白蹭',
        detail: '自拍杆突进，抓住对方合影定住 0.56 秒，拍下时随机偷走 10～40 气；对方不足 5 气时一点也偷不到',
      }),
      // 喵姆喵姆 (combat.ts step_nyamu_paw): 「扣你几喵姆喵姆～」 — the paws at her cheeks throw a heart; whoever it
      // charms takes four paws on the four syllables. holdEndure: armour for the cast, grabs and supers still cut it.
      skill(4, 'light', '喵姆喵姆', {
        damage: 11, range: 160, start: .3, duration: 1.15, cd: 6, fx: 'nyamu-paw', count: 4, knock: 0, gain: 4,
        holdEndure: true,
        react: { kind: 'pin', stun: .3, holdStill: true },
        finale: { damage: 24, knock: 440, react: { kind: 'stand', stun: .4 } },
        brief: '霸体卖萌定住身前对手后四连爪，末爪击退；被挡落空',
        detail: '霸体卖萌放出爱心，命中定住对方 0.75 秒后左右爪连挠四下，末下击退；爱心被挡或落空则四爪全部挥空',
      }),
      // 双踩地狱 (combat.ts step_drums / spawnRain): the mask comes off, she takes the stool facing the crowd; the
      // bass drums keep shoving anyone close. Four waves of note rain, each slid sideways a little: three light
      // ones that never interrupt, so there is room to move, then big notes that knock down. The last beat
      // drums her out. superArmor: true super armour for the whole cast.
      skill(5, 'projectile', '双踩地狱', {
        cost: 125, damage: 22, count: 32, interval: .05, size: 36, start: .28, duration: 3.2, life: 2.4, fx: 'drums',
        superArmor: true,
        finale: { damage: 60, knock: 380, react: { kind: 'knockdown', vy: -300, knocked: .8, stun: .5 } },
        // One entry per wave: a guard under the rain meets about one note a wave and breaks on the big one.
        guardPlan: [8, 12, 16, 70],
        brief: '真霸体坐鼓震开；四波音符雨，末波大音符击倒',
        detail: '真霸体坐上架子鼓，底鼓持续震开近身的对方；音符雨分四波落满全场，每波位置略有错开；前三波不打断，末波大音符击倒并破防',
      }),
    ],
  },
  {
    id: 'sakiko', name: '丰川祥子', title: '近身 / 奏鸣', quote: '我毋畏遗忘。', color: '#7799CC',
    bands: ['ave-mujica'],
    ...stats('rush'),
    // The goddess walks: each footfall rings faintly on the floor, each J / K leaves a thin silver moon.
    aura: { step: 'saki-step', swing: 'saki-swing' },
    view: {
      kind: 'sprite', common: '/sprites/sakiko/common.png', special: '/sprites/sakiko/special.png', height: 165, lift: 2,
      extras: ['/sprites/sakiko/shiro.png'],
    },
    skills: [
      skill(0, 'light', '礼掌', { brief: '轻击；命中可接 J / K', detail: '轻击；命中可接 J / K' }),
      skill(1, 'heavy', '拂踢', { range: 132, brief: '重击；击退，轻击后可接', detail: '重击；击退，轻击后可接' }),
      skill(2, 'dash', '忘却之影', {
        damage: 24, range: 140, start: .2, duration: .62, cd: 9, knock: 380, fx: 'oblivion',
        react: { kind: 'stand', stun: .32 },
        brief: '前闪霸体，起落点震开；原地残影随后爆炸击倒',
        detail: '向前闪现，释放时霸体；起点和落点各震开周围一次，原地留下残影，1.2 秒后大范围爆炸 60 伤害并击倒',
      }),
      skill(3, 'launch', '神威', {
        damage: 55, range: 300, start: .38, duration: .9, cd: 8, fx: 'divine',
        hitbox: 'radial', reach: 'ground', hitAll: true, noSparks: true,
        brief: '跺地震波挑空周围；霸体，跳起可躲',
        detail: '优雅跺地，以自身为中心的大范围地震波挑空周围对手；全程霸体，只打地面，跳起可躲',
      }),
      skill(4, 'dash', '双月轮舞', {
        damage: 34, range: 110, start: .12, duration: 1.3, cd: 6, speed: 950, knock: 160, fx: 'twin-moon',
        react: { kind: 'stand', stun: .4 }, frail: 4, frailBonus: .2,
        brief: '冲刺折返，去回各打一次；打实后脆弱',
        detail: '向前冲刺后折返，越过出发点再滑一段；去程回程各判定一次，打实后脆弱 4 秒（受伤 +20%）',
      }),
      skill(5, 'projectile', '血月的奏鸣', {
        cost: 150, damage: 28, count: 16, interval: .13, speed: 300, size: 40, start: .4, duration: 2.8, life: 3.6,
        knock: 120, gain: 0, fx: 'blood-note', holdEndure: true, solid: false,
        guardPlan: [4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 24, 28, 33, 38, 44, 52],
        finale: { knock: 380, react: { kind: 'knockdown', vy: -320, knocked: .7 } },
        brief: '弹奏霸体震开不回气；十六枚随机角度，末枚击倒',
        detail: '全场熄灯，原地弹奏 2.4 秒，期间霸体，开场震开近身；向前发射十六枚随机角度的慢速音符，末枚击倒，音符消失前无法获得气',
      }),
    ],
  },
  {
    id: 'tomori', name: '高松灯', title: '主唱 / 迷子', quote: '那……能陪我组一辈子的乐队吗？', color: '#77BBDD',
    bands: ['mygo'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/tomori/common.png', special: '/sprites/tomori/special.png', height: 181, lift: 5,
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
        ],
        brief: '震开周围并霸体；可解控', detail: '震开周围敌人，6 秒内霸体、受伤降低 33%；可解控',
      }),
      skill(4, 'projectile', '奇独点', {
        damage: 8, knock: 0, interval: .2, start: .3, duration: .75, cd: 8, life: 1.4, size: 150, fx: 'blackhole',
        solid: false,
        brief: '黑洞吸住敌人；跳出可躲，冲刺可挣脱', detail: '前方生成黑洞，吸住敌人并多段低伤，1.4 秒后消失；出手后即可行动，跳出可躲伤害、冲刺可挣脱',
      }),
      skill(5, 'endure', '诗超绊', {
        cost: 200, damage: 0, start: 1.0, duration: 1.35, fx: 'poem',
        onActive: [{ op: 'summon', kind: 'ally' }],
        brief: '震退并召唤队友；在场禁回气，被击败退场', detail: '原地歌唱 1 秒震退对手，随后召唤 1 名 MyGO 队友并肩 12 秒；生命两成、伤害三成，队友在场时无法获得气，被击败提前退场',
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
        guardPlan: [8, 12, 18, 32, 50, 75],
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
        damage: 24, count: 10, interval: .42, range: 240, start: .35, duration: 4.6, cd: 2, knock: 240, fx: 'riff',
        hitbox: 'disc',
        brief: '环形音波，跳不掉；按住连弹，点按省冷却', detail: '以自身为中心的环形音波，跳不掉；按住一直弹，越弹越广也越疼；点按更省冷却',
      }),
      skill(3, 'dash', '来去如风', {
        damage: 0, range: 192, start: .1, duration: .34, cd: 2.4, invuln: .1, fx: 'wind',
        brief: '原地消失重现；穿过一切', detail: '原地消失重现；穿过一切',
      }),
      skill(4, 'launch', '高踢腿', { damage: 48, range: 180, cd: 4.5 }),
      skill(5, 'projectile', '抹茶芭菲', {
        cost: 130, damage: 14, count: 22, interval: .28, start: .45, duration: .85, life: 6.5, size: 56, knock: 90, fx: 'parfait',
        // After the tenth blob the bar is gone; the tail is capped so a late re-block cannot be
        // erased by an ever-growing number.
        guardPlan: [3, 4, 5, 7, 9, 11, 14, 18, 23, 29, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
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
        guardPlan: [10, 25, 70],
        knock: 110, knockOnBlock: true, control: true,
        brief: '音波推进；出手即可行动，命中定身', detail: '音波推进；出手即可行动；定身 4 秒，受击两次解除',
      }),
    ],
  },
  {
    id: 'taki', name: '椎名立希', title: '鼓手 / 护灯', quote: '我发誓，和灯在一起的话，一辈子也可以。', color: '#7777AA',
    bands: ['mygo'],
    ...stats('beat'),
    view: { kind: 'sprite', common: '/sprites/taki/common.png', special: '/sprites/taki/special.png', height: 170, lift: 3 },
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
    // damageMul 2.1 is +110%: the old +55% boost, doubled.
    frenzy: { rate: 1, rangeMul: 1.65, cdMul: 2, damageMul: 2.1, chain: false, air: true, lock: true, time: 7, tint: '#ffd0dc' },
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
        frail: 2, frailBonus: .2, holdEndure: true,
        brief: '霸体掏出羊羹下砸；打实后脆弱，跳起可躲', detail: '释放时霸体，从背后掏出羊羹下砸；打实后脆弱 2 秒（受伤 +20%），跳起可躲',
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
        damage: 70, range: 180, start: .4, duration: .72, cd: 7, knock: 580, fx: 'howl',
        hitbox: 'disc', superArmor: true,
        brief: '大范围音波，强击退；真霸体', detail: '大范围圆形音波，强击退；放出时真霸体',
      }),
      skill(5, 'projectile', '九字真言', {
        cost: 110,
        // focus multiplies shot speed by 1.15; 366 lands on about 421, and 0.7s of that is ~295px.
        // .09 keeps each seal tick outside the .075s blockstun, so holding guard really can
        // carry the early segments and only the later ones break through.
        damage: 36, count: 1, speed: 366, size: 140, life: .7, interval: .09,
        // Six seal segments run off stepSealVolleys; count 1 here only shapes the projectile.
        guardPlan: [8, 12, 18, 32, 50, 75],
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
        damage: 36, count: 6, interval: .42, range: 130, start: .22, duration: 2.75, cd: 3, knock: 460, gain: 4, fx: 'groove',
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
          { op: 'mod', kind: 'debt', time: 8 },
          { op: 'mod', kind: 'noGain', time: 8, max: true },
          { op: 'fx', type: 'burst', life: .7, radius: 120 },
        ],
        brief: '霸体记账；期间不掉血且禁回气，结束时一起结算', detail: '8 秒霸体记账且禁回气：期间不掉血，结束时一次承受期间伤害的 80%',
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
      kind: 'sprite', common: '/sprites/arisa/common.png', special: '/sprites/arisa/special.png', height: 175,
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
    id: 'tae', name: '花园多惠', title: '吉他 / 花园警察', quote: '喜欢就没问题，吉他是给喜欢弹的人弹的。', color: '#0077DD',
    bands: ['poppin-party'],
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/tae/common.png', special: '/sprites/tae/special.png', height: 174, specialScale: 1.07 },
    // 花园多惠（萌娘百科）: Poppin'Party 的主音吉他，天然、电波，黑长直，每天晨跑；家里至少 23 只兔子，最爱异色瞳的小欧。
    // 称号取别号「花园警察」（官方四格「花园 land」）。全部空手；兔子都由代码画（taeFx.ts），没有外置图。
    skills: [
      // 天然 (萌娘百科: 天然、电波).
      skill(0, 'light', '天然'),
      // 兔子蹬: a rabbit's kick with the hind legs.
      skill(1, 'heavy', '兔子蹬'),
      // 神出鬼没 (combat.ts step_burrow): 「瞬移怪」 — down a rabbit hole, up out of one under the foe.
      skill(2, 'launch', '神出鬼没', {
        damage: 52, range: 110, start: .22, duration: 1.35, cd: 7, knock: 30, noBlock: true, fx: 'tae-burrow',
        brief: '钻地无敌从脚下挑空；不能格挡，兔耳冒头时走开可躲',
        detail: '钻进兔子洞消失并无敌 0.36 秒，从出手时最近对手所站位置的洞里冒出挑空；兔耳先冒头预警，走开或跳起可躲，不能格挡',
      }),
      // 花园警察，出动！ (combat.ts step_police): the cap, the lunge, the cuffs; caught mid-move is 现行犯.
      skill(3, 'grab', '花园警察，出动！', {
        damage: 30, range: 96, speed: 560, start: .2, duration: 1, cd: 9, knock: 0, fx: 'tae-police',
        root: 2, rootPin: true,
        brief: '戴上警帽短冲抓人定身；抓到正在出招的人定身更久',
        detail: '戴上警帽短冲抓取，命中定身 2 秒，受击两次解除；抓到正在出招的对手定身 3 秒',
      }),
      // 欢迎来到兔子王国 (combat.ts step_hop): five rabbits hop out of a hole at her feet, 小欧 last.
      skill(4, 'projectile', '欢迎来到兔子王国', {
        damage: 12, count: 5, interval: .2, speed: 380, size: 60, start: .3, duration: 1.3, cd: 8, life: 2, knock: 40,
        fx: 'tae-hop', solid: false,
        finale: { damage: 28, knock: 260, react: { kind: 'knockdown', vy: -180, knocked: .6 } },
        brief: '五只兔子贴地冲向对手，末只击倒；可格挡，跳起可躲',
        detail: '身前的洞里依次蹦出五只兔子贴地冲向对手，末只是小欧并击倒；只打地面附近，跳起可躲，每只可格挡',
      }),
      // 花园兔王 (combat.ts step_warren): the warren erupts round the foe, 小欧 throws them up, her rabbit kick.
      skill(5, 'launch', '花园兔王', {
        cost: 130, damage: 10, range: 200, start: .55, duration: 3.2, knock: 0, gain: 2, fx: 'tae-warren',
        guardPlan: [5, 6, 10, 16, 26, 40],
        finale: { damage: 100, knock: 480, react: { kind: 'knockdown', vy: -280, knocked: 1 } },
        brief: '兔群上托，小欧接兔子蹬击倒；霸体，只有兔群能格挡',
        detail: '在最近对手脚下开出兔子洞，八只兔子依次蹦出，第一只顶中 14 伤害后其余每只上托 10 伤害；格挡可挡兔群但会被削防；随后小欧从正中大洞蹦出 30 伤害把人顶到高处，多惠钻地从旁冒出，空中兔子蹬 100 伤害并击倒；全程霸体，小欧和兔子蹬不能格挡',
      }),
    ],
  },
  {
    id: 'saaya', name: '山吹沙绫', title: '鼓手 / 面包圣女', quote: '用擀面杖代替鼓棒？开玩笑的！', color: '#FFCC11',
    bands: ['poppin-party'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/saaya/common.png', special: '/sprites/saaya/special.png', height: 181, lift: 5,
      extras: ['/sprites/saaya/oven.png'],
    },
    // 山吹沙绫（萌娘百科）: Poppin'Party 的鼓手，商店街「山吹烘焙坊」的看板娘，照顾弟妹的「PPP 的妈」；茶发单马尾、蓝瞳。
    // 称号取别号「面包圣女」，quote 是萌百题头。全部空手：面团、火、面包屑都由代码画（saayaFx.ts），只有 L 的砖窑是外置图。
    skills: [
      // 欢迎光临: the shop counter greeting.
      skill(0, 'light', '欢迎光临'),
      // 擀面杖代替鼓棒 (萌娘百科题头): both palms pressed forward and pushed, like rolling dough — empty-handed.
      skill(1, 'heavy', '擀面杖代替鼓棒'),
      // 乖，摸摸头 (game/saaya.ts step_pat): 「PPP 的妈」 — three soft pats on the head and they nod off (定身, 'sleepy').
      skill(2, 'grab', '乖，摸摸头', {
        damage: 24, range: 90, speed: 900, start: .22, duration: 1.25, cd: 9, knock: 0, fx: 'saaya-pat',
        root: 2, rootPin: true,
        brief: '快速远距突进抓取，摸头三下定身；跳起可躲',
        detail: '快速远距突进抓取，摸头三下后定身 2 秒，受击两次解除；跳起可躲',
      }),
      // 面团发酵中 (game/saaya.ts step_dough): 「发酵少女」(萌百别号、PICO 卡名) — a dough on the floor that rises and pops.
      skill(3, 'projectile', '面团发酵中', {
        damage: 30, start: .25, duration: .6, cd: 8, life: 1.5, size: 90, knock: 80, fx: 'saaya-dough', reach: 'ground', solid: false,
        react: { kind: 'launch', vy: -520, knocked: .8 },
        brief: '面团延时挑空，遇火增伤扩圈；仅地面、限一团',
        detail: '抛下面团，落地 1.2 秒后爆开挑空；被唐突喷火烤到提前爆开，伤害翻倍至 60、爆炸半径为普通面团的 3 倍；只打地面，同屏至多一团',
      }),
      // 唐突喷火 (game/saaya.ts step_fire): PICO 里在 live 上突然喷火; B 站「在 live 上唐突喷火的山吹沙绫」.
      skill(4, 'projectile', '唐突喷火', {
        damage: 30, range: 260, start: .3, duration: 1.85, cd: 2, knock: 0, fx: 'saaya-fire', solid: false, hitstop: .012, shake: 1,
        status: [{ kind: 'burn', time: 3, dmg: 6, tick: .5, mark: 'saaya-toast' }],
        brief: '原地喷火，长按延时增冷却；连中烧焦引爆面团',
        detail: '点按喷锥形火焰 0.8 秒；按住超过 0.25 秒进入长按档，冷却改为 8 秒、喷火至多 1.2 秒；首段 30 伤害，后续每 0.15 秒一段、每段 8 伤害；连中同一对手 4 段烧焦 3 秒，每跳 6 伤害；喷火时不能移动，火会引爆面团',
      }),
      // 山吹烘焙坊，营业中！ (game/saaya.ts step_bake): 自家面包店 — knead them, roll them flat, into the oven, 叮.
      skill(5, 'grab', '山吹烘焙坊，营业中！', {
        cost: 130, damage: 12, range: 100, speed: 520, start: .3, duration: 3.2, knock: 0, gain: 2, fx: 'saaya-bake',
        finale: { damage: 100, knock: 140, react: { kind: 'knockdown', vy: -520, knocked: .9 } },
        brief: '前冲抓住揉面进窑烤熟；已烧焦伤害更高，跳起可躲',
        detail: '前冲抓取，揉面三下擀平、进窑烤两段，每段 12 伤害，出炉 100 伤害并击倒；已烧焦时伤害 +25%；跳起可躲，打空有破绽',
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
          { op: 'mod', kind: 'poise', time: 8 },
          { op: 'mod', kind: 'noGain', time: 8 },
          { op: 'fx', life: .8, radius: 130, flash: .3, announce: { color: '#8fd8ff', life: .9, size: 19, y: -240 } },
        ],
        brief: '解除封印：攻击提升、霸体、禁回气，结束反噬',
        detail: '8 秒内攻击力提高 120% 且霸体，无法获得气；结束时固定受到 10% 最大生命值的反噬伤害，可以致死',
      }),
    ],
  },
  {
    id: 'sayo', name: '冰川纱夜', title: '吉他 / 节拍器', quote: '像正式演出那样练习，像练习那样正式演出。', color: '#00AABB',
    bands: ['roselia'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/sayo/common.png', special: '/sprites/sayo/special.png', height: 181,
      // common 半表放大后 special 没跟着放大，格内再放会出界。播放时绕脚线放大。
      specialScale: 1.1,
      extras: ['/sprites/sayo/arrow.png', '/sprites/sayo/flame.png'],
    },
    skills: [
      skill(0, 'light', '指正'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '百发百中', {
        damage: 36, cd: 4, start: .26, duration: .8, speed: 700, life: .95, size: 28, knock: 160, fx: 'arrow',
        brief: '一发笔直音矢；看见前摇跳起可躲',
        detail: '一发笔直音矢，飞得很快，判定很细。看见前摇跳起能过。出手后还要收完招。',
      }),
      skill(3, 'projectile', '秋时雨', {
        // Five drops at the release frame. interval 0 dumps the volley in one step, then a short tail.
        damage: 40, count: 5, interval: 0, cd: 4.5, start: .32, duration: .44, knock: 40, size: 36, life: 1.1,
        motion: 'fall', floor: 'splash', solid: false, fx: 'shigure',
        brief: '五道雨打不掉；间隙躲且可行动',
        detail: '五道雨在出手时一起从身前直直落下，间距比人宽，站定只吃到一道。走到两道之间躲过。这些雨打不掉。出手后可行动。',
      }),
      skill(4, 'light', '忧伤节拍器', {
        damage: 24, count: 4, interval: .22, cd: 7, start: .36, duration: 1.3, range: 156, reach: 'low', fx: 'metronome',
        finale: { knock: 340, react: { kind: 'knockdown', vy: -200, knocked: .72 } },
        brief: '四下等间隔；跳起可躲，中了连到击倒',
        detail: '四下等间隔扫弦，判定只到站立胸口，跳起躲过整段。第一下命中后硬直接上下面三下，最后一下击倒。',
      }),
      skill(5, 'projectile', '冰川打火姬', {
        // count 1 keeps the super projectile template from firing three shots. emit owns the tongue
        // and keeps it until the tail leaves the screen.
        damage: 160, count: 1, start: .45, duration: 1.15, speed: 720, knock: 380, size: 220, fx: 'jewel',
        contact: 'pass', solid: false, noBlock: true,
        brief: '贴地火舌；无法格挡，跳起可躲，命中击倒',
        detail: '一道贴地火舌向前烧过身前，无法格挡，跳起躲过；每人只烧一次，命中击倒',
      }),
    ],
  },
  {
    id: 'lisa', name: '今井莉莎', title: '贝斯 / 慈母', quote: '有我在呢，交给莉莎姐吧☆', color: '#DD2200',
    bands: ['roselia'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/lisa/common.png', special: '/sprites/lisa/special.png', height: 177,
      extras: ['/sprites/lisa/cat.png'],
    },
    // 今井莉莎（萌娘百科）: Roselia 的贝斯，外表辣妹、内里人妻，R 团的精神支柱；理解力满级，友希那不开口她也全懂。
    // 称号取注释「R 组慈母」。全部空手；猫是外置图 cat.png，曲奇、花草茶、线和星星都由代码画（lisaFx.ts）。
    skills: [
      // 贴心 (萌娘百科: 会照顾人).
      skill(0, 'light', '贴心'),
      // 辣妹踢 (萌娘百科萌点: 辣妹).
      skill(1, 'heavy', '辣妹踢'),
      // 元气辣妹☆ (lisa.ts step_gal): the stock dash, a trail of little stars, a hair flick on the hit.
      skill(2, 'dash', '元气辣妹☆', {
        damage: 38, range: 100, start: .12, duration: .72, cd: 5, speed: 880, knock: 240, fx: 'lisa-gal',
        brief: '滑步突进约半屏，甩发扫击并击退',
        detail: '滑步突进约半屏，到点甩发横扫并击退',
      }),
      // 银猫扑脸 (lisa.ts, PICO Fever 第 18 话): a silver cat runs along the floor and clings to the face it reaches.
      skill(3, 'projectile', '银猫扑脸', {
        damage: 16, speed: 460, size: 56, life: 1.6, start: .28, duration: .8, cd: 9, knock: 0, fx: 'lisa-cat',
        status: [{ kind: 'confuse', time: 2, mark: 'lisa-cat' }],
        react: { kind: 'stand', stun: .3 },
        brief: '银猫贴地扑脸，挂头上挠并混乱；可挡可跳',
        detail: '银猫贴地冲出，扑脸 2 秒并混乱 2 秒，期间再挠 4 下各 6 伤害；被击倒则提前跳开；可格挡，跳起可躲',
      }),
      // 不用说我也懂 (lisa.ts, PICO Fever 第 24 话): a read on her; the first U / I / O a foe starts is cut off.
      skill(4, 'endure', '不用说我也懂', {
        damage: 30, range: 0, start: .2, duration: .45, cd: 14, knock: 70, fx: 'lisa-read',
        brief: '弹额打断 U、I、O，解控和全程无敌除外',
        detail: '4 秒内读招打断对手第一次放出的 U、I、O，对手照样进冷却。莉莎瞬移弹额头，造成 0.8 秒硬直。解控和全程无敌的招式除外，期间照常行动',
      }),
      // 特制曲奇·隐藏风味 (lisa.ts, 萌娘百科名场面「莉莎在饼干里加芥末」): a cookie into the mouth; the mustard goes off later.
      skill(5, 'projectile', '特制曲奇·隐藏风味', {
        cost: 120, damage: 20, count: 1, start: .5, duration: 1.1, knock: 0, gain: 2, fx: 'lisa-cookie', solid: false,
        finale: { damage: 100, knock: 380, react: { kind: 'knockdown', vy: -300, knocked: 1 } },
        brief: '曲奇抛进嘴里，稍后爆辣击倒并烧焦；跳起可躲',
        detail: '向最近对手抛出心形曲奇，入口 20 伤害。1.5 秒后芥末发作，造成 100 伤害、击倒并烧焦 4 秒。不能格挡，跳起可躲。遇到全程无敌的招式，芥末在无敌结束后发作',
      }),
    ],
  },
  {
    id: 'ako', name: '宇田川亚子', title: '鼓手 / 大魔姬', quote: '吾乃暗之大魔姬……呃、那个……总之就是超——帅的！', color: '#DD0088',
    bands: ['roselia'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/ako/common.png', special: '/sprites/ako/special.png', height: 171, lift: 5,
      extras: ['/sprites/ako/rinko.png', '/sprites/himari/friends.png'],
    },
    // 宇田川亚子（萌娘百科）: Roselia 的鼓手，别号「暗之大魔姬」；极度中二，但中二台词总卡壳，要燐子「提词姬」救场；
    // 自称姐姐巴之下的「世界第二强鼓手」；和燐子在网游 NFO 认识（官方小游戏「邪灵大法师-宇田川亚子」）；
    // 《元祖！BanG Dream Chan》#25「宇田川催眠波」。全部空手；燐子是 rinko.png 一张，巴复用绯玛丽的 friends.png，
    // 其余由 akoFx.ts 绘制（src/game/ako.ts）。
    skills: [
      // 暗之…呃: a chuuni hand sign, and the line never finishes.
      skill(0, 'light', '暗之…呃'),
      // 堕天之踵 (圣堕天使): the little one jumps into a downward heel.
      skill(1, 'heavy', '堕天之踵'),
      // 宇田川催眠波 (元祖！BanG Dream Chan #25「你会越来越困～」): a spiral wave that puts them to sleep.
      skill(2, 'projectile', '宇田川催眠波', {
        damage: 18, speed: 520, size: 90, life: 1.2, start: .3, duration: .55, cd: 8, knock: 0,
        fx: 'ako-hypno', solid: false, root: 1,
        brief: '放出螺旋催眠波，命中让对手睡着定身；跳起可躲',
        detail: '向前放出紫粉螺旋波，命中让对手睡着，定身 1 秒；可格挡，跳起可躲',
      }),
      // 暗黑咏唱·提词版 (中二台词卡壳，燐子提词): stuck mid-line, then 燐子 slips her the rest.
      skill(3, 'projectile', '暗黑咏唱·提词版', {
        damage: 48, speed: 600, size: 110, life: 1.3, start: .95, duration: 1.3, cd: 10, knock: 320,
        fx: 'ako-chant', solid: false,
        react: { kind: 'knockdown', vy: -220, knocked: .8 },
        brief: '卡壳时挨打会失败；燐子提词后放魔弹击倒',
        detail: '咏唱中途卡壳 0.4 秒，这时没有霸体，受击则技能失败、冷却返还一半；撑过去后燐子提词，获得霸体并放出暗之魔弹，命中击倒；可格挡，跳起可躲',
      }),
      // 世界第二强 (自称姐姐之下的「世界第二强鼓手」): two little hits, then 巴 throws the big one.
      skill(4, 'heavy', '世界第二强', {
        damage: 10, count: 3, interval: .2, range: 150, start: .18, duration: .95, cd: 8, knock: 40,
        fx: 'ako-sister', solid: false,
        finale: { damage: 36, knock: 420, react: { kind: 'knockdown', vy: -260, knocked: .9 } },
        brief: '打两下，命中后姐姐巴补一记重拳击飞',
        detail: '亚子先打两下，各 10 伤害；任一下命中，姐姐巴的剪影在身后出现，补一记重拳击飞；可格挡',
      }),
      // 邪灵大法师·降临 (NFO 小游戏「邪灵大法师-宇田川亚子」;「用 ako 通过第一关最难」): spirits, then the big one.
      skill(5, 'projectile', '邪灵大法师·降临', {
        damage: 6, count: 8, interval: .12, size: 60, life: 1.4, start: .5, duration: 2.3, knock: 0, gain: 1,
        fx: 'ako-nfo', solid: false, contact: 'pass',
        finale: { damage: 90, knock: 320, react: { kind: 'knockdown', vy: -260, knocked: 1, stun: .5 }, shake: 10 },
        guardPlan: [6, 6, 8, 10, 12, 14, 16, 18, 30],
        brief: '灵体追向对手不打断；大灵体扑下击倒',
        detail: '进入 NFO 网游画面，召唤 8 只小灵体追向对手，不打断，可走位躲开；预警后大灵体从上方扑下并击倒，跳不过；可格挡',
      }),
    ],
  },
  {
    id: 'rinko', name: '白金燐子', title: '键盘 / 提词姬', quote: '我……真的可以吗？', color: '#BBBBBB',
    bands: ['roselia'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/rinko/common.png', special: '/sprites/rinko/special.png', height: 177, lift: 5,
      extras: ['/sprites/rinko/tent.png'],
    },
    // 白金燐子（萌娘百科）: Roselia 的键盘手，别号「燐燐」「亚子的提词姬」；社恐，平时说话 0.5 倍速、满口「……」（官方统计
    // 2018 年说了 2521 次），网游 NFO 里却打字飞快、颜文字满天飞；一个人上街就带着帐篷才不怕生；小时候钢琴比赛失利留下阴影，
    // 后来以同一首曲子重回赛场。全部空手；帐篷是外置图 tent.png，对话框、颜文字、琴键和白玫瑰都由代码画（rinkoFx.ts、game/rinko.ts）。
    skills: [
      // 那个…… (语速 0.5 倍).
      skill(0, 'light', '那个……'),
      // 请、请让开…… (社恐的一推).
      skill(1, 'heavy', '请、请让开……'),
      // 帐篷出行 (萌娘百科: 带着帐篷到街上就不会怕生; 莉莎: 反而更显眼了): in the tent she plods on, takes a fifth of every
      // hit and cannot be staggered; when it runs out she flings the whole tent.
      skill(2, 'endure', '帐篷出行', {
        damage: 30, speed: 560, size: 120, life: .6, start: .16, duration: .34, cd: 11, knock: 300, fx: 'rinko-tent',
        react: { kind: 'knockdown', vy: -260, knocked: .7 },
        brief: '躲进帐篷减伤霸体；结束时甩出帐篷击倒',
        detail: '钻进帐篷 1.8 秒：移动减半、受到伤害减 80%、霸体，不能出招；结束时帐篷翻滚着甩向前方，命中 30 伤害并击倒；可格挡，跳起可躲',
      }),
      // 键盘手有话要说 (2521 次「……」;「注意！我们伟大的键盘手有话要说：……」): three dots out of a speech bubble,
      // the last one leaves them with nothing to say.
      skill(3, 'projectile', '键盘手有话要说', {
        damage: 10, count: 3, interval: .26, speed: 380, size: 54, life: 2.2, start: .42, duration: 1.15, cd: 9, knock: 40,
        fx: 'rinko-dots', solid: false,
        react: { kind: 'stand', stun: .3 },
        finale: { damage: 18, size: 78, knock: 160, react: { kind: 'stand', stun: .5 }, status: [{ kind: 'silence', time: 2, mark: 'rinko-hush' }] },
        brief: '飞出三个「……」；第三个命中沉默',
        detail: '依次放出三颗慢速「……」，各 10 / 10 / 18 伤害；第三颗命中沉默 2 秒（只能用 J、K）；可格挡，跳起可躲',
      }),
      // 线上话痨模式 (0.5 倍速的她在网游里打字飞快、满屏颜文字): a chat window, and a barrage of kaomoji out of it.
      skill(4, 'projectile', '线上话痨模式', {
        damage: 5, count: 8, interval: .1, speed: 760, size: 46, life: 1.2, start: .3, duration: 1.25, cd: 8, knock: 0,
        fx: 'rinko-chat', solid: false,
        react: { kind: 'stand', stun: .16 },
        finale: { damage: 9, knock: 160, react: { kind: 'stand', stun: .4 } },
        brief: '聊天窗口连射颜文字；最后一发击退',
        detail: '站定打字 1 秒，连射 8 发颜文字，各 5 伤害，最后一发 9 伤害并击退；可格挡，跳起可躲',
      }),
      // 燐燐开花 (Ringing Bloom;「再次演出的序曲」里以同一首曲子重回钢琴比赛; 代表色白玫瑰): the spotlight and the
      // stillness of the crowd, then keys of light run along the floor; whoever they reach is held while white roses open
      // round them, and the last, great rose throws them.
      skill(5, 'projectile', '燐燐开花', {
        damage: 8, count: 6, interval: .14, speed: 1100, size: 70, life: .9, start: .9, duration: 2.75, knock: 0, gain: 1,
        fx: 'rinko-bloom', solid: false, contact: 'pass', holdEndure: true,
        finale: { damage: 72, knock: 260, react: { kind: 'launch', vy: -760, knocked: 1 }, shake: 10 },
        guardPlan: [6, 8, 16, 20, 26, 30, 40],
        brief: '琴键贴地奔出可跳躲；踩中被玫瑰连击击飞',
        detail: '0.9 秒后光之琴键贴地冲出，跳起可躲；琴键命中 8 伤害并定住对手，随后 5 朵白玫瑰各 8 伤害，最后一朵大玫瑰 72 伤害并击飞；可格挡；全程霸体',
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
        guardPlan: [10, 25, 70],
        control: true,
        brief: '连发三枚笑脸波；命中定身，可格挡', detail: '连发三枚笑脸波击退；命中定身 3 秒，受击两次解除，可格挡',
      }),
    ],
  },
  {
    id: 'kanon', name: '松原花音', title: '鼓手 / 迷宫水母', quote: '呼诶诶……这、这里是哪里？', color: '#44DDFF',
    bands: ['hello-happy'],
    ...stats('beat'),
    passive: ['鼓点 · 越慌越稳', '命中叠节拍，每层冷却加快、移速提高，被击中掉 2 层；血量不高于 30% 时 U I O 霸体，伤害提高 10%'],
    view: {
      kind: 'sprite', common: '/sprites/kanon/common.png', special: '/sprites/kanon/special.png', height: 187, lift: 5, specialScale: .95,
      extras: ['/sprites/kanon/jellyfish.png'],
    },
    // 松原花音（萌娘百科）: HHW 的鼓手，别号「迷宫水母」，十米之内都能迷路的路痴，口癖「呼诶诶」（Roselia×『シャルル』的
    // 空耳「雲のふぇぇ」），水母痴；心说她平时战战兢兢惯了，关键时刻反而最有胆量（越慌越稳）。全部空手；水母是
    // jellyfish.png 一张，其余由 kanonFx.ts 绘制（src/game/kanon.ts）。
    skills: [
      // 慌慌张张: eyes shut, flailing.
      skill(0, 'light', '慌慌张张'),
      // 对、对不起！: she is always apologising — the bow is the headbutt.
      skill(1, 'heavy', '对、对不起！'),
      // 十米迷路 (路痴, 别号迷宫水母): wanders a looping trail of footprints to a random spot; stepping on it is getting lost too.
      skill(2, 'dash', '十米迷路', {
        damage: 0, range: 0, start: .1, duration: .62, cd: 8, knock: 0, fx: 'kanon-lost', noSparks: true,
        status: [{ kind: 'confuse', time: 1.5, mark: 'kanon-maze' }],
        brief: '乱走到随机落点，途中无敌；踩到脚印的对手混乱',
        detail: '沿绕圈脚印乱走，随机落在对手身后、原地附近或远处，途中无敌；脚印留 3 秒，对手踩到混乱 1.5 秒（左右颠倒）',
      }),
      // 云之呼诶 (『シャルル』空耳「雲のふぇぇ」): a string of ふぇぇ pushed across the stage.
      skill(3, 'projectile', '云之呼诶', {
        damage: 9, count: 4, interval: .09, speed: 620, size: 80, life: 1.4, start: .3, duration: .66, cd: 7, knock: 40,
        fx: 'kanon-fuee', solid: false,
        brief: '喊出一串「ふぇぇ」推过全场；跳起可躲',
        detail: '喊出一串「ふぇぇ」大字推过全场，末字推开对手；可格挡，跳起可躲',
      }),
      // 迷宫水母 (水母痴): a jellyfish bobbing in front of her; touch it and it stings.
      skill(4, 'projectile', '迷宫水母', {
        damage: 22, speed: 0, size: 80, life: 4, start: .28, duration: .5, cd: 9, knock: 40, fx: 'kanon-jelly',
        root: .8, solid: false,
        brief: '身前漂浮一只水母，碰到电麻定身；限一只',
        detail: '在身前放一只上下漂浮的水母，持续 4 秒，对手碰到即定身 0.8 秒；场上限一只，可格挡',
      }),
      // 水母之海 (迷宫水母; 生日收到水母坐垫当场睡着): the night aquarium — little jellyfish rise, the big one drops.
      skill(5, 'projectile', '水母之海', {
        cost: 120, damage: 6, count: 12, interval: .1, size: 60, life: 2.4, start: .45, duration: 2.5,
        knock: 0, gain: 1, fx: 'kanon-sea', solid: false, contact: 'pass',
        finale: { damage: 100, knock: 300, react: { kind: 'knockdown', vy: -260, knocked: .9, stun: .5 }, shake: 10 },
        guardPlan: [5, 8, 12, 16, 20, 24, 30, 40],
        brief: '小水母从地面浮起不打断；巨型水母罩下击倒',
        detail: '小水母从地面随机浮起，不打断，可走位躲开；预警后巨型水母罩住对手并击倒，跳不过；可格挡',
      }),
    ],
  },
  {
    // 一人二役: 米歇尔 is the base form (the bear on stage, where every match starts); 美咲 is the alt.
    // Each O swaps to the other form; the pair shares one wait (combat.ts swapForm).
    id: 'misaki', name: '奥泽美咲', title: 'DJ / 熊熊侠', quote: '不会飞的熊，就只是普通的熊！', color: '#DD33CC',
    bands: ['hello-happy'],
    ...stats('armor'),
    view: {
      // 米歇尔 is the bigger body (193, lifted 5); 美咲's own size is on the alt form (168, lifted 6).
      kind: 'sprite', common: '/sprites/misaki/michelle.png', special: '/sprites/misaki/michelle-special.png', height: 193, lift: 5,
      extras: ['/sprites/misaki/head.png'],
    },
    forms: {
      // 米歇尔, the big unit: J / K 20% above the arcade normals, and the price is paid when she is hit or misses,
      // never on her own swing — walking 30% under the arcade 225, a wider body to hit, a lower jump, a slower
      // back-dodge, and a missed J / K that does not stop on time.
      base: { name: '米歇尔', speed: .81, girth: 12, jump: .85, dodgeCd: 1.4, whiff: .1 },
      alt: {
        name: '美咲', speed: 1.27, dmgDealt: .85,
        common: '/sprites/misaki/common.png', special: '/sprites/misaki/special.png', height: 168, lift: 6, specialScale: 1.05,
        skills: [
          skill(0, 'light', '喂', { start: .065 }),
          skill(1, 'heavy', '节能主义', { damage: 48 }),
          skill(2, 'dash', '不要跳过我的问题', {
            damage: 40, speed: 900, range: 100, start: .1, duration: .5, cd: 6, knock: 120, fx: 'tsukkomi',
            brief: '吐槽突进；打中前摇中的对手则打断该招并让它冷却',
            detail: '吐槽突进小击退；打中出招前摇中的对手时打断那一招并补满它的冷却，对手僵住 0.5 秒',
          }),
          skill(3, 'light', '会长猜拳', {
            damage: 30, range: 112, start: .35, duration: .7, cd: 6, fx: 'janken',
            brief: '头顶先亮手势再出拳：石头击倒、剪刀定身、布推远',
            detail: '随机出拳，头顶先亮手势：石头 55 伤害并击倒，剪刀 30 伤害并定身 1.2 秒，布 25 伤害并大幅推远',
          }),
          skill(4, 'sweep', '黑衣人，拜托了', {
            damage: 24, range: 200, start: .3, duration: .9, cd: 6, knock: 360, fx: 'black-suits',
            hitbox: 'radial', hitAll: true, reach: 'low',
            react: { kind: 'stand', stun: .3 },
            brief: '黑衣人围成帘子推开对手；换上米歇尔，换装中无敌',
            detail: '黑衣人围成帘子推开身边对手；同时换上米歇尔，换装中无敌；与米歇尔的换装共用冷却',
          }),
          skill(5, 'grab', '明明我才是米歇尔！', {
            cost: 100, damage: 35, range: 120, speed: 760, start: .3, duration: 1.9, fx: 'withdrawal',
            finale: { damage: 110, knock: 340, react: { kind: 'knockdown', vy: -260, knocked: .85, stun: .5 } },
            brief: '套纸袋冲去抓人当成米歇尔猛扯头套；末下击倒',
            detail: '冲刺抓取；连扯三下各 35 伤害，最后扯飞熊头 110 伤害并击倒',
          }),
        ],
      },
    },
    skills: [
      skill(0, 'light', '熊掌', { damage: 31, range: 108 }),
      skill(1, 'heavy', '熊的力气', { damage: 64, range: 132, knock: 300 }),
      skill(2, 'grab', '快乐飞行模式', {
        damage: 83, range: 130, start: .22, duration: 1.75, cd: 8, fx: 'happy-flight',
        react: { kind: 'knockdown', vy: -160, knocked: .8, stun: .45 },
        brief: '喷射抓人公主抱飞过烟花后击倒；抓空则飞过去压人',
        detail: '喷射起飞抓住对手，穿过三朵烟花后放下，击倒；抓空则向前飞出一段，落地压到落点的对手造成 33 伤害，可格挡',
      }),
      skill(3, 'projectile', '快乐火力模式', {
        damage: 18, count: 4, interval: .12, size: 48, start: .3, duration: .75, cd: 9, knock: 90, gain: 3, fx: 'happy-missile',
        solid: false,
        brief: '四发导弹砸向锁定的落点；离开准星可躲，可格挡',
        detail: '锁定对手脚下，导弹升空后依次落在准星附近；离开准星可躲，可格挡',
      }),
      skill(4, 'projectile', '请叫我本名', {
        damage: 33, speed: 400, size: 90, life: 2.2, start: .3, duration: .7, cd: 6, knock: 220, fx: 'bear-head',
        contact: 'pass', solid: false,
        brief: '摘下熊头扔出，弹地后滚动；变回美咲',
        detail: '摘下熊头扔出，弹地两次后滚动，同一人只打一次；同时变回美咲；与美咲的换装共用冷却',
      }),
      skill(5, 'projectile', '米歇尔乐园', {
        cost: 120, damage: 10, count: 11, interval: .1, speed: 560, size: 70, life: 2.8, start: .4, duration: 1.95,
        knock: 0, gain: 1, fx: 'michelle-land', solid: false, contact: 'pass',
        finale: { damage: 132, knock: 420, react: { kind: 'knockdown', vy: -280, knocked: .9, stun: .5 }, shake: 10 },
        guardPlan: [6, 8, 20, 30, 40],
        brief: '小米歇尔跑过全场不打断可跳过；巨型米歇尔压过击倒',
        detail: '十只小米歇尔接连跑过全场，各 10 伤害且不打断，可跳过；最后一只巨型米歇尔 132 伤害并击倒，跳不过；可格挡',
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
    id: 'hina', name: '冰川日菜', title: '吉他 / 天才', quote: '谁都不跟我一样！所以才有趣！', color: '#55DDEE',
    bands: ['pastel-palettes'],
    // 官网：「Pastel＊Palettesのギターを務める、天才少女。」
    genius: true,
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/hina/common.png', special: '/sprites/hina/special.png', height: 181 },
    skills: [
      skill(0, 'light', '扫弦'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'heavy', '薯条', {
        damage: 36, range: 160, start: .22, duration: .55, cd: 5, knock: 140, fx: 'fries',
        frail: 2, frailBonus: .2,
        brief: '挥手撒出；打实后脆弱', detail: '身前一小段挥手撒出，打一次；打实后脆弱 2 秒（受伤 +20%）',
      }),
      skill(3, 'light', '噜噜噜', {
        damage: 16, count: 3, interval: .12, range: 220, start: .08, duration: .55, cd: 4, knock: 70, fx: 'lulu',
        finale: { root: 1, rootPin: true },
        brief: '前方三下；末击定身，受击两次解除', detail: '前方较长距离打三下；最后一下定身 1 秒，受击两次解除',
      }),
      skill(4, 'dash', '好近哦', {
        damage: 48, speed: 760, start: .1, duration: .32, cd: 4.5, knock: 160, fx: 'dash',
        brief: '短距离贴到面前打一下', detail: '短距离突进，贴到面前打一下',
      }),
      skill(5, 'endure', '和姐姐在一起', {
        cost: 200, damage: 0, range: 0, start: .4, duration: .9, fx: 'burst',
        onActive: [{ op: 'summon', kind: 'named', id: HINA_PARTNER }],
        brief: '召唤纱夜到身侧；在场禁回气，被击败退场', detail: '召唤冰川纱夜到身侧并肩 12 秒，生命两成、伤害三成；纱夜在场时无法获得气，被击败提前退场',
      }),
    ],
  },
  {
    id: 'eve', name: '若宫伊芙', title: '键盘 / 武士道', quote: '武士道！', color: '#DDBBFF',
    bands: ['pastel-palettes'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/eve/common.png', special: '/sprites/eve/special.png', height: 177,
      world: '/sprites/eve/super.png',
      specialScale: 0.95,
      worldScale: 1.1,
    },
    skills: [
      skill(0, 'light', '拨弦'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'heavy', '剑道三连', {
        damage: 20, range: 128, start: .12, duration: 1.55, cd: 5.5, knock: 100, fx: 'iaido',
        brief: '点按三连；架势不能走，被打作废可挡跳',
        detail: '点按三连斩每下 20 伤害；按住居合不能移动，松手或蓄满 0.7 秒放出三道剑气各 16 伤害，可格挡或跳过，被击中则作废',
      }),
      skill(3, 'grab', '请你喝茶', {
        damage: 8, count: 3, range: 90, start: .18, duration: 1.7, cd: 7, drain: 10, knock: 0, fx: 'tea',
        react: { kind: 'pin', stun: .3, holdStill: true },
        brief: '前冲抓住钉住；三段削气，不击倒，抓空更久',
        detail: '前冲抓住并钉住，三段各削去 10 气共 30 气，不击倒；跳起或离远则抓空且收招更长',
      }),
      skill(4, 'heavy', '忍法·隐身术', {
        damage: 0, range: 0, start: .34, duration: .9, cd: 10, knock: 0, fx: 'cloak', breakout: true,
        brief: '出招解控；隐身减伤，普攻少空，飞弹多空，其余必中',
        detail: '出招即解控，可脱出硬直、击倒、定身与封锁；结印后半透明 5 秒，普攻 20% 打空，飞弹 90% 打空，抓投、必杀和带定身的招必中；同时霸体 5 秒，受伤降低 33%',
      }),
      skill(5, 'heavy', '武士道', {
        cost: 120, damage: 24, count: 7, interval: .12, range: 190, start: .32, duration: 1.55,
        guardPlan: [8, 12, 18, 26, 38, 52, 70],
        knock: 40, hitbox: 'disc', hitAll: true, fx: 'bushido', gain: 0,
        shake: 3, hitstop: .03,
        react: { kind: 'stand', stun: .16 },
        finale: { damage: 28, shake: 8, hitstop: .1, react: { kind: 'knockdown', vy: -280, knocked: .72 } },
        brief: '前冲后边斩边移；末击击倒，期间无法回气',
        detail: '先向前冲 15% 战场，斩击时再前移 70，七段乱斩并命中身周所有人，前六段各 24 伤害，末段 28 伤害并击倒、震屏和击停；期间无法获得气',
      }),
    ],
  },
  {
    id: 'chisato', name: '白鹭千圣', title: '贝斯 / 铁假面', quote: '有必要好好说教一下吧？', color: '#FFEEAA',
    bands: ['pastel-palettes'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/chisato/common.png', special: '/sprites/chisato/special.png', height: 175,
      extras: ['/sprites/chisato/jennifer.png', '/sprites/chisato/glare-cutin.png'],
    },
    // 白鹭千圣（萌娘百科）: Pastel*Palettes 的贝斯，童星出身的女演员；PICO 官方称号「微笑的铁假面」，不愉快时露出著名的
    // 「看垃圾的眼神」，题头原话「お説教が必要かしら？」；画伯，画的狗被彩认成谜之生物（珍妮弗）。全部空手（U 列手持素描本）；
    // 珍妮弗和眼神特写各用一张 PNG，其余特效由 chisatoFx.ts 绘制。
    skills: [
      // 彩排 (童星出身的女演员).
      skill(0, 'light', '彩排'),
      // NG！ (片场).
      skill(1, 'heavy', 'NG！'),
      // 这明明是狗 (chisato.ts, 画伯·珍妮弗; 彩：「这是狗啊！？」): the doodle hops off the page along the floor.
      skill(2, 'projectile', '这明明是狗', {
        damage: 26, speed: 360, size: 70, life: 1.9, start: .34, duration: .62, cd: 7, knock: 60, fx: 'chisato-jennifer',
        status: [{ kind: 'confuse', time: 1.2, mark: 'chisato-doodle' }],
        brief: '画出珍妮弗蹦跳去咬；命中混乱，可格挡可跳过',
        detail: '画出珍妮弗贴地蹦跳前进，命中混乱 1.2 秒（左右颠倒）；可格挡，跳起可躲',
      }),
      // 铁壁微笑 (chisato.ts, PICO「微笑的铁假面」): armour and less damage while she keeps moving; the third vein, she glares.
      skill(3, 'endure', '铁壁微笑', {
        damage: 0, range: 0, start: .3, duration: .55, cd: 14, knock: 0, fx: 'chisato-smile', noSparks: true,
        brief: '营业微笑：霸体减伤可行动；受击三次自动回瞪',
        detail: '保持微笑 3.5 秒：霸体，受到伤害降低 40%，期间可自由行动；第 3 次掉血时提前结束，对最近的对手放一次 O',
      }),
      // 垃圾分拣 (chisato.ts, 「看垃圾的眼神」): one look along the floor ahead of her.
      skill(4, 'projectile', '垃圾分拣', {
        damage: 8, range: 520, start: .28, duration: .6, cd: 11, knock: 0, fx: 'chisato-glare',
        noBlock: true, noSparks: true, frail: 4, frailBonus: .2, react: { kind: 'stand', stun: .25 },
        brief: '冷眼一扫：打实脆弱并驱邪；挡不住，跳起可躲',
        detail: '视线扫过身前远距的第一个对手，打实脆弱 4 秒（受伤 +20%）并驱邪 2 秒；不能格挡，跳起或后撤可躲',
      }),
      // 有必要说教一下呢 (chisato.ts, 题头原话「お説教が必要かしら？」): beckoned over, sat down, lectured, 花丸.
      skill(5, 'grab', '有必要说教一下呢', {
        cost: 150, damage: 18, count: 7, range: 300, start: .5, duration: 3.25, knock: 0, gain: 2, fx: 'chisato-lecture',
        react: { kind: 'pin', stun: .3, holdStill: true },
        finale: { damage: 90, knock: 380, react: { kind: 'knockdown', vy: -300, knocked: 1 } },
        brief: '抓投：拽来按坐说教连打，末击击倒；跳起可躲',
        detail: '招手把身前对手拽到面前按坐，说教六段各 18 伤害，末段 90 伤害并击倒；跳起或后撤可躲；抓空则独自说教片刻',
      }),
    ],
  },
  {
    id: 'mitake', name: '美竹兰', title: '主唱 / 挑染', quote: 'いつも通り、行こう。', color: '#EE0022',
    bands: ['afterglow'],
    ...stats('rush'),
    // 宣战布告: the frenzy clock drives the aggressive sheet swap; no king flag, so U I O L stay open.
    // cdMul .2: normals' cooldown drops to 20% (an 80% cut). Was .6, a drop to 60%.
    frenzy: { rate: 1.4, rangeMul: 1.15, cdMul: .2, damageMul: 1.25, chain: false, time: 8, tint: '#EE0022' },
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
        damage: 58, range: 170, start: .45, duration: .9, cd: 4.5, fx: 'guitar-smash', hitstop: .09,
        hitbox: 'radial', hitAll: true, reach: 'ground', knock: 480,
        brief: '抡吉他砸地，身周击倒；打不到空中',
        detail: '吉他从上砸向身周地面，范围内全部击倒；打不到空中的对手',
      }),
      skill(4, 'endure', '像以前一样', {
        damage: 45, range: 250, start: .26, duration: .85, cd: 8, breakout: true, fx: 'as-usual',
        holdEndure: true,
        onActive: [
          { op: 'fx', life: .55, radius: 250, dir: true },
          { op: 'mod', kind: 'brace', time: 5 },
        ],
        brief: '震开并解控；随后霸体',
        detail: '震开并解控；随后 5 秒霸体，受伤降低 33%',
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
        detail: '挑染亮起并震开；8 秒内普攻加快至 1.4 倍、伤害 +25%、范围 +15%、冷却降至 20%，期间无法获得气',
      }),
    ],
  },
  {
    id: 'moca', name: '青叶摩卡', title: '吉他 / 半速', quote: 'モカちゃんやっちゃうよ～', color: '#00CCAA',
    bands: ['afterglow'],
    ...stats('focus'),
    rootFx: 'moca-ring',
    view: { kind: 'sprite', common: '/sprites/moca/common.png', special: '/sprites/moca/special.png', height: 175 },
    skills: [
      skill(0, 'light', '懒拨'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '半速', {
        ...mocaSlow,
        damage: 32, speed: 174, size: 78, life: 2.5, start: .34, duration: .72, cd: 4.5, knock: 50, fx: 'moca-bubble',
        holdEndure: true,
        brief: '霸体慢气泡打实减速；可挡可跳，拖慢 J / K',
        detail: '出手时霸体。横躺气泡慢速平飞，打实后减速 5 秒，移动降至 50%、跳跃高度约降至 42%，J / K 攻速降至 70%、冷却延长至约 143%；可格挡或跳过',
      }),
      skill(3, 'projectile', '扣一点', {
        damage: 48, speed: 226, size: 36, life: .75, start: .3, duration: .7, cd: 6, knock: 0, fx: 'moca-die',
        root: 1.5, rootBreak: 0, rootPin: true, holdEndure: true,
        brief: '霸体，贴地骰子命中定身；可格挡或跳过',
        detail: '出手时霸体。贴地骰子短距离滚出，命中定身 1.5 秒，不受击解除；可格挡或跳过',
      }),
      skill(4, 'grab', '捉弄', {
        damage: 40, count: 2, interval: .28, range: 150, start: .24, duration: 1.1, cd: 7, knock: 0, fx: 'slash',
        hitbox: 'front', holdEndure: true,
        react: { kind: 'stand', stun: .3 },
        ...mocaSlow,
        brief: '霸体近身连戳两下；打实减速，拖慢 J / K',
        detail: '出手时霸体。近身连戳两下，打实后减速 5 秒，移动降至 50%、跳跃高度约降至 42%，J / K 攻速降至 70%、冷却延长至约 143%',
      }),
      skill(5, 'projectile', '小摩卡要上了', {
        damage: 108, count: 1, speed: 243, size: 140, life: 3.2, start: .4, duration: .9, knock: 40, fx: 'moca-dusk',
        contact: 'pass', solid: false,
        react: { kind: 'stand', stun: .2 },
        ...mocaSlow, slowOnBlock: true, slowBonus: 100, noBlockSlow: true,
        brief: '拖 J / K 可跳；减速挡不住加伤，挡也减速',
        detail: '贴地夕阳慢波爬过，打实减速 5 秒，移动降至 50%、跳跃高度约降至 42%，J / K 攻速降至 70%、冷却延长至约 143%；未减速时格挡也减速，已减速时无法格挡并额外 100 伤害，跳起可躲',
      }),
    ],
  },
  {
    id: 'himari', name: '上原绯玛丽', title: '贝斯 / 一呼零应', quote: 'えい、えい、おー！……诶？大家怎么不跟着喊？', color: '#FF9999',
    bands: ['afterglow'],
    ...stats('armor'),
    view: {
      kind: 'sprite', common: '/sprites/himari/common.png', special: '/sprites/himari/special.png', height: 178,
      // 一呼百应: the four friends on one sheet (鸫 / 巴 / 摩卡 / 兰 × rise / shout / after).
      extras: ['/sprites/himari/friends.png'],
    },
    // 上原绯玛丽（萌娘百科）: Afterglow 的贝斯，自封的队长，乐队的开心果；一喊「えい、えい、おー！」就没人跟（一呼零应），
    // 第三章大家终于应了。全部空手；体重秤、咖啡奶泡、乌鸦和夕阳由代码画（himariFx.ts），四位队友是一张 friends.png。
    skills: [
      // 打气 (萌娘百科: 乐队的开心果).
      skill(0, 'light', '打气'),
      // 队长踢 (萌娘百科: 自愿担当乐团的队长，乐队名差点变成 ひまりBand).
      skill(1, 'heavy', '队长踢'),
      // 摇匀一杯摩卡 (himari.ts, B 站「绯玛丽只是在摇摩卡」): a lunge, both hands on their shoulders, four hard shakes.
      skill(2, 'grab', '摇匀一杯摩卡', {
        damage: 7, count: 4, range: 70, speed: 560, start: .14, duration: 1.3, cd: 8, fx: 'himari-shake', knock: 0, gain: 4,
        react: { kind: 'pin', stun: .3, holdStill: true },
        finale: { damage: 14, knock: 180, react: { kind: 'stand', stun: .4 }, status: [{ kind: 'confuse', time: 1.5, mark: 'himari-shake' }] },
        brief: '前冲抓住双肩猛摇四下，松手后对手混乱',
        detail: '前冲抓取，抓住双肩猛摇四下：前三下各 7 伤害，末下 14 伤害并混乱 1.5 秒（左右颠倒）',
      }),
      // 一呼零应 (himari.ts, 萌娘百科别号; 元祖丧尸绯玛丽用 AAO 硬控): nobody answers; everyone in front is frozen, and so is she.
      skill(3, 'endure', '一呼零应', {
        damage: 0, range: 320, root: 1.6, start: .45, duration: 1.25, cd: 12, knock: 0, fx: 'himari-aao',
        noBlock: true, noSparks: true, control: true, gain: 4,
        rootLevel: 'freeze', rootBreak: 2, rootPin: true, react: { kind: 'stand', stun: .1 },
        brief: '霸体禁足身前含空中，不能格挡，自己也僵；积委屈',
        detail: '霸体喊出 A！A！O！，身前对手禁足 1.6 秒，空中也算，再受击两次解除；不能格挡；自己僵住 0.8 秒；每次积一层委屈（最多 3 层），强化必杀',
      }),
      // 热量全部送给你 (himari.ts, 摩卡「把脂肪都送给绯玛丽酱吧」反着用): a bathroom scale slid along the floor.
      skill(4, 'projectile', '热量全部送给你', {
        damage: 18, speed: 430, size: 60, life: 1.5, start: .3, duration: .7, cd: 10, knock: 0, fx: 'himari-scale',
        slow: 4, slowMul: .65, slowJump: .8, slowAtk: .8, slowMark: 'himari-calorie',
        brief: '体重秤贴地滑出：对手减速，自己加速；可挡可跳',
        detail: '体重秤贴地滑出，命中 18 伤害并减速 4 秒，移动降至 65%、跳跃变低，J / K 攻速降至 80%；自己移速提高 20% 持续 4 秒；可格挡，跳起可躲',
      }),
      // 一呼百应 (himari.ts, 乐队故事第三章第 14 话): at sunset all four of them answer at last.
      skill(5, 'endure', '一呼百应', {
        cost: 180, damage: 16, range: 470, start: .5, duration: 2.55, knock: 30, gain: 2, fx: 'himari-call', holdEndure: true,
        noBlock: true, react: { kind: 'stand', stun: .5 },
        finale: { damage: 130, knock: 420, react: { kind: 'knockdown', vy: -320, knocked: 1 } },
        brief: '队友应答连打击倒；不能格挡，前两下可跳，委屈加伤',
        detail: '霸体喊两声 A！各 16 伤害，跳起可躲；四位队友依次应答各 16 伤害，最后五色声浪 130 伤害并击倒；不能格挡；每层委屈末击加 15 伤害，用后清空',
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
        superArmor: true,
        brief: '肩撞前冲；霸体，撞上收势，击退随距离，半程击倒',
        detail: '肩撞前冲；释放时霸体，撞上就原地收势，打实击退随距离增加，冲过 50% 距离即击倒，打空则跑完',
      }),
      skill(3, 'heavy', '燃尽', {
        damage: 100, range: 255, start: .48, duration: 1.1, cd: 8, knock: 520, fx: 'burnout',
        superArmor: true,
        brief: '高举琴身砸下；霸体，被挡或空挥是大破绽',
        detail: '琴身从头顶砸下并击退；释放时霸体，前摇很长，被格挡或空挥都是大破绽',
      }),
      skill(4, 'grab', '全力碰撞', {
        damage: 24, range: 150, start: .28, duration: 1.95, cd: 8, count: 5, interval: .22, gain: 3, fx: 'crash',
        superArmor: true,
        brief: '近身连摔五次；释放期间霸体，跳开则空',
        detail: '近身抓住往地上连摔；释放期间霸体，抓取和必杀仍能打断。出手略快，范围扩大，跳开则打空',
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
    id: 'chuchu', name: 'CHU²', title: '制作人 / DJ', quote: 'Change The World！', color: '#00BBFF',
    bands: ['raise-a-suilen'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/chuchu/common.png', special: '/sprites/chuchu/special.png', height: 170, lift: 5,
      extras: ['/sprites/chuchu/jerky.png', '/sprites/chuchu/cake.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '牛肉干', {
        damage: 16, count: 3, interval: .12, speed: 500, size: 36, life: 1.6,
        start: .2, duration: .65, cd: 3.2, fx: 'jerky',
        brief: '连甩三根肉干；可格挡或跳过',
        detail: '连甩三根肉干；可格挡或跳过',
      }),
      skill(3, 'projectile', '垃圾桶', {
        damage: 14, count: 4, interval: .22, speed: 160, size: 32, life: 2.4,
        start: .2, duration: .9, cd: 5, fx: 'trash',
        brief: '四团纸贴地慢滚；可格挡或跳过',
        detail: '四团纸球从身前同一点依次贴地滚出；可格挡或跳过',
      }),
      skill(4, 'projectile', '草莓蛋糕', {
        damage: 52, speed: 220, size: 96, life: 2.4, knock: 280,
        start: .28, duration: .7, cd: 6.5, fx: 'cake',
        brief: '抛出慢速蛋糕；击退且可挡可跳',
        detail: '一整只蛋糕慢速飞过，击退 280；可格挡或跳过',
      }),
      skill(5, 'light', '改变世界', {
        damage: 24, count: 10, interval: .1, range: 480, knock: 180,
        start: .35, duration: 2.95, fx: 'change',
        brief: '圆点靠近才挡；按早显示miss',
        detail: '身前蓝色长条发出 2.6 秒并停在对方身上；圆点靠近后再格挡才算，按早会被击穿并显示 miss，全程格挡均匀削去一半破防，归零被击中显示 Bad，不挡至多挨 10 下，跳不掉',
      }),
    ],
  },
  {
    id: 'masking', name: 'MASKING', title: '鼓手 / mas王', quote: '你……挺可爱的嘛。', color: '#EEBB44',
    bands: ['raise-a-suilen'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/masking/common.png', special: '/sprites/masking/special.png', height: 180, lift: 0,
      extras: ['/sprites/masking/bike.png', '/sprites/masking/lock.png'],
    },
    // 佐藤益木（萌娘百科）: 凶脸金发、可爱控、料理达人，骑一辆叫「死亡银河号」的红黑摩托。称号取 B 站「mas王」二创
    // （护六狂魔 mas王 等）；「狂犬」不吉利，不进招名。全部空手，摩托（bike.png）和后座的 LOCK（lock.png）是仅有的外置图。
    skills: [
      // 只是近视 (社区吐槽: 凶脸其实只是近视看不清).
      skill(0, 'light', '只是近视'),
      // 人情派 (萌娘百科别号「无赖鼓手人情派」).
      skill(1, 'heavy', '人情派'),
      // 死亡银河号 (combat.ts step_galaxy_ride): kick start, flat out across the screen through bodies, the skid.
      skill(2, 'dash', '死亡银河号', {
        damage: 42, range: 80, speed: 760, start: .22, duration: 1.2, cd: 7, fx: 'galaxy-ride', superArmor: true, noSparks: true,
        finale: { damage: 40, knock: 380, react: { kind: 'knockdown', vy: -240, knocked: .7 } },
        brief: '骑摩托穿过对手，急刹甩尾击倒；霸体，跳起可躲',
        detail: '骑上摩托全速横冲，路上每人被撞一次并穿过；冲过第一个人后急刹甩尾（没撞到人则跑完再甩），扫中前后的人 40 伤害并击倒；全程霸体，跳起可躲',
      }),
      // 可爱鉴定 (combat.ts step_cute_check): 「你……挺可爱的嘛。」 — she pinches their cheeks, pats their head, and they wander off blushing.
      skill(3, 'grab', '可爱鉴定', {
        damage: 12, count: 3, range: 84, speed: 420, start: .2, duration: 1.45, cd: 8, fx: 'cute-check', knock: 0, gain: 4,
        finale: { damage: 34, knock: 220, react: { kind: 'stand', stun: .3 } },
        status: [{ kind: 'confuse', time: 1.5, mark: 'blush' }],
        brief: '前扑捏住对方的脸，摸头推开，对方混乱',
        detail: '前扑抓取，捏脸三下，末下摸头推开 34 伤害并让对方混乱 1.5 秒',
      }),
      // 即兴加花 (combat.ts step_fill): an off-grid string of jabs and a crash on the floor.
      skill(4, 'light', '即兴加花', {
        damage: 13, count: 6, range: 124, start: .16, duration: 1.4, cd: 8, fx: 'fill-in', knock: 30, gain: 3,
        react: { kind: 'stand', stun: .3 },
        finale: { damage: 46, range: 150, knock: 420, react: { kind: 'knockdown', vy: -220, knocked: .7 } },
        brief: '切分节奏乱打难抓格挡；末下砸地击倒并霸体',
        detail: '六拳按随机的切分节奏打出，格挡时机难以抓准；末下双拳砸地 46 伤害并击倒，砸地前 0.14 秒起霸体',
      }),
      // 银河流星踢 (combat.ts step_meteor): LOCK on the back, the bike carries them to the wall, then the kick from the seat.
      skill(5, 'dash', '银河流星踢', {
        cost: 180, damage: 30, range: 124, start: .5, duration: 3.3, fx: 'meteor-kick', knock: 0, gain: 2, noBlock: true, noSparks: true,
        finale: { damage: 140, knock: 460, react: { kind: 'knockdown', vy: -300, knocked: 1 } },
        brief: '摩托把人顶到版边再飞踢击倒；不能格挡，跳起可躲',
        detail: '起步后摩托冲锋，撞上第一个人并顶着一路推到画面边缘，途中每 0.13 秒 10 伤害；到边后跃起飞踢 140 伤害并击倒；没撞到人则在前方踢地 77 伤害；不能格挡，跳起可躲',
      }),
    ],
  },
  {
    id: 'lock', name: 'LOCK', title: '吉他 / 吉他狂战士', quote: '这就是……这就是，大少女乐团时代呀！', color: '#AAEE22',
    bands: ['raise-a-suilen'],
    ...stats('rush'),
    // 朝日六花（萌娘百科）: 岐阜出身、住在澡堂旭汤、Popipa 铁粉、幸运E。眼镜和发圈是「能力限制器」，摘下就是吉他狂战士。
    // The costume is the king sheet (stage.png) and frenzy.skills: in it every key draws from common cells.
    frenzy: {
      rate: 1.25, rangeMul: 1.2, cdMul: .7, damageMul: 1.3, chain: true, time: 8, tint: '#AAEE22', swingFx: 'lock-hair',
      skills: LOCK_STAGE, recast: { slot: 2, time: 10 },
    },
    view: {
      kind: 'sprite', common: '/sprites/lock/common.png', special: '/sprites/lock/special.png', height: 171, lift: 5,
      king: '/sprites/lock/stage.png', kingScale: 176 / 171,
      // 护六出动 draws MASKING from her own sheet on her own bike.
      extras: ['/sprites/masking/special.png', '/sprites/masking/bike.png'],
    },
    skills: LOCK_SKILLS,
  },
  {
    id: 'mashiro', name: '仓田真白', title: '主唱 / 幻视', quote: '如果平凡的我也能找到属于我的“特别”就好了', color: '#6677CC',
    bands: ['morfonica'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/mashiro/common.png', special: '/sprites/mashiro/special.png', height: 181,
      extras: ['/sprites/mashiro/jelly.png', '/sprites/mashiro/whale.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '拂踢'),
      skill(2, 'projectile', '幻海', {
        damage: 28, speed: 260, size: 56, life: 2.8, start: .22, duration: .55, cd: 1.5, fx: 'jelly',
        brief: '水母慢速平飞；可格挡或跳过', detail: '水母慢速平飞，留在路上；可格挡或跳过',
      }),
      skill(3, 'projectile', '巨鲸', {
        damage: 16, count: 4, interval: .14, gain: 4, size: 512, life: 1.2,
        start: .28, duration: .73, cd: 7, knock: 0, knockOnBlock: true, fx: 'whale', solid: false,
        motion: 'fall',
        react: { kind: 'stand', stun: .28 },
        finale: { knock: 420, knockOnBlock: false, react: { kind: 'knockdown', vy: -280, knocked: .72 } },
        brief: '巨鲸四段抛物线；末段击倒，满跳可躲',
        detail: '身前斜上跃出再抛物线落下，至多四段；前三段不击退，末段击倒，满跳可躲',
      }),
      skill(4, 'endure', '暗玉', {
        damage: 36, range: 220, start: .3, duration: .85, cd: 8, fx: 'shade', breakout: true,
        knock: 480, knockOnBlock: true, holdEndure: true, hitbox: 'radial', reach: 'ground', hitAll: true,
        react: { kind: 'stand', stun: .35 },
        brief: '霸体震开身边；跳起可躲，可解控', detail: '霸体震开身边地面；跳起可躲，可解控',
      }),
      skill(5, 'projectile', '蝶变', {
        damage: 72, count: 1, speed: 520, size: 80, life: 2.2, start: .3, duration: .8, fx: 'butterfly',
        // Boomerang: the outbound pass is cheap, the turn back is what breaks the bar.
        guardPlan: [30, 75],
        knock: 90, react: { kind: 'stand', stun: .22 },
        slow: 4, slowMul: .6, slowJump: .75, slowOnBlock: true, solid: false,
        brief: '闪蝶折返；挡住也减速，回程转向',
        detail: '一群闪蝶平飞并折返，去程回程各打一次；打实或格挡都减速 4 秒，移动降至 60%、跳跃高度约降至 56%',
      }),
    ],
  },
  {
    id: 'toko', name: '桐谷透子', title: '吉他 / 辣妹', quote: '放到地球规模来看，这点事只是微米啦！', color: '#EE6666',
    bands: ['morfonica'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/toko/common.png', special: '/sprites/toko/special.png', height: 181, lift: 5,
      // 师父示范一下: 纱夜 steps in off her own sheet with her own arrow, so both are preloaded here.
      extras: ['/sprites/sayo/special.png', '/sprites/sayo/arrow.png'],
    },
    // 桐谷透子（萌娘百科）: Morfonica 的吉他，学校和 SNS 上的万人迷辣妹，老字号和服店千金；因为吉他最显眼才选的吉他，
    // 起步弹得糊，拜了纱夜为师。全部空手（I 是空气吉他）；相框、糊音、「哈」和聚光灯由代码画（tokoFx.ts）。
    skills: [
      // 超顺手 / 超用力 (萌娘百科: 说话时偶尔会加上「超」来强调语气).
      skill(0, 'light', '超顺手'),
      skill(1, 'heavy', '超用力'),
      // 这张必火 (toko.ts, B 站「乐队辣妹」/ 走到哪自拍到哪): a lunge, an arm round their shoulders, the phone up, one flash.
      skill(2, 'grab', '这张必火', {
        damage: 45, range: 70, speed: 560, start: .14, duration: .95, cd: 7, fx: 'toko-selfie', knock: 60,
        root: .6, react: { kind: 'stand', stun: .3 },
        brief: '前冲搂肩自拍，闪光定身；命中后自己增伤',
        detail: '前冲抓取，搂住对手自拍：45 伤害并定身 0.6 秒；命中后自己造成的伤害提高 15% 持续 4 秒',
      }),
      // 师父示范一下 (toko.ts, B 站「邦邦前三菜的吉他」+ 纱夜师徒): her own muddy note, then 纱夜 behind her with the real arrow.
      skill(3, 'projectile', '师父示范一下', {
        damage: 8, speed: 220, size: 52, life: .8, start: .28, duration: 1.05, cd: 8, knock: 0, fx: 'toko-mud',
        slow: 1.5, slowMul: .6, slowOnBlock: true, slowMark: 'toko-mud',
        brief: '糊音被挡仍减速；纱夜随后补一发音矢',
        detail: '空气吉他弹出一颗慢速糊音，8 伤害并减速 1.5 秒，移动降至 60%，被格挡也减速；随后纱夜现身射出一发笔直音矢，30 伤害，可格挡，跳起可躲',
      }),
      // 笑到你破防 (toko.ts, B 站「正在嘲笑你的辣妹」): pointing and laughing; whoever it reaches takes more from everything.
      skill(4, 'light', '笑到你破防', {
        damage: 10, range: 300, start: .3, duration: .75, cd: 6, knock: 40, fx: 'toko-laugh',
        frail: 4, frailBonus: .25, react: { kind: 'stand', stun: .25 },
        brief: '指着大笑，身前对手脆弱；可挡可跳',
        detail: '指着对手大笑，身前较长距离 10 伤害并脆弱 4 秒（受伤 +25%）；可格挡，跳起可躲',
      }),
      // 天上天下 本小姐独尊 (toko.ts, 官方二つ名「天上天下あたし独尊」): one hand to the sky, one to the floor; at the
      // end the one light is five (从「只有本小姐」到五个人的声音).
      skill(5, 'endure', '天上天下 本小姐独尊', {
        cost: 120, damage: 20, range: 460, start: .6, duration: 2.2, knock: 30, gain: 2, fx: 'toko-solo', holdEndure: true,
        guardPlan: [8, 12, 22, 66, 75],
        react: { kind: 'stand', stun: .4 },
        finale: { damage: 60, knock: 420, react: { kind: 'knockdown', vy: -300, knocked: .9 } },
        brief: '天降光柱接贴地光浪，五色光击倒；光浪可跳',
        detail: '霸体，一道光柱从天而降 20 伤害，三道贴地光浪各 20 伤害，跳起可躲；最后五色光 60 伤害并击倒',
      }),
    ],
  },
  {
    id: 'tsukushi', name: '二叶筑紫', title: '鼓手 / 班长', quote: '以成为坚定可靠的人为目标。', color: '#EE7788',
    bands: ['morfonica'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/tsukushi/common.png', special: '/sprites/tsukushi/special.png', height: 170,
      extras: ['/sprites/tsukushi/sprout.png', '/sprites/tsukushi/wheel.png'],
    },
    skills: [
      skill(0, 'light', '点拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '土笔', {
        damage: 14, count: 4, interval: .12, gain: 3, speed: 150, size: 44, life: 1.5,
        start: .26, duration: .78, cd: 6.5, knock: 60, solid: false, fx: 'sprout',
        brief: '四株贴地推进；可格挡或跳过',
        detail: '四株笔头菜依次从身前冒出并向前推进；可格挡或跳过',
      }),
      skill(3, 'projectile', '五个闹钟', {
        damage: 12, count: 5, interval: 0, gain: 2, size: 48, life: 4.2,
        start: .3, duration: .55, cd: 8, knock: 0, solid: false, motion: 'fall', fx: 'clock',
        brief: '五只落地等待后连响三次；等待时走开可避',
        detail: '五只闹钟落到身前五个点并在地面等待1.5秒。不响的随后消失，会响的在1.5秒内连放三圈白波，每圈打一段。站在两只中间会同时挨打。等待时离开可避',
      }),
      skill(4, 'dash', '仓鼠队长', {
        damage: 16, count: 4, interval: .1, range: 150, start: .12, duration: .86, cd: 5.5,
        speed: 280, knock: 0, gain: 3, reach: 'low', fx: 'wheel',
        finale: { knock: 380, react: { kind: 'knockdown', vy: -240, knocked: .72 } },
        brief: '滚轮连打四下；只打站立目标',
        detail: '滚轮向前连打四下，末击击倒；只打站立目标',
      }),
      skill(5, 'light', '二叶三姐妹', {
        cost: 110, damage: 22, count: 6, interval: .11, range: 160, start: .3, duration: 1.22,
        guardPlan: [8, 12, 18, 32, 50, 75],
        knock: 0, gain: 2, fx: 'sisters',
        react: { kind: 'pin', stun: .22 },
        finale: { knock: 420, react: { kind: 'knockdown', vy: -260, knocked: .72 } },
        brief: '妹妹撞上才连打，末击倒；跳起可躲',
        detail: '两个妹妹跑向面前的场边，碰到后折返，再走出另一边。撞上才连打，末击击倒。跳起可躲',
      }),
    ],
  },
  {
    id: 'kanata', name: '泽海奏多', title: '键盘 / 白月光', quote: '我这人可是很脆弱的哦？', color: '#9DB9B9',
    bands: ['millsage'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/kanata/common.png', special: '/sprites/kanata/special.png', height: 172,
      extras: ['/sprites/kanata/piano.png'],
    },
    skills: [
      skill(0, 'light', '轻弹'),
      skill(1, 'heavy', '琴凳踢'),
      skill(2, 'projectile', '寿来', {
        damage: 46, range: 520, start: .5, duration: .95, cd: 6, fx: 'lifedraw',
        drain: 28, knock: 180, size: 110, life: .5, solid: false, noSiphon: true, noSparks: true,
        brief: '锁定引爆；削气并回血，离开可躲，被挡不削气',
        detail: '锁定最近敌人脚下，半秒后引爆；命中削去对方 28 气，气团飞回奏多时回复 42 生命；离开标记可躲，可格挡，被挡不削气',
      }),
      skill(3, 'endure', '我可是很脆弱的哦', {
        damage: 0, range: 0, start: .28, duration: .7, cd: 9, fx: 'lily',
        onActive: [
          { op: 'mod', kind: 'vulnerable', time: 5, v: 2 },
          { op: 'mod', kind: 'reflect', time: 5, v: .5 },
          { op: 'fx', life: .6, radius: 92 },
        ],
        brief: '起手霸体挡一次；自身脆弱，反伤所有伤害',
        detail: '起手霸体挡一次；5 秒内自身脆弱（受到伤害 +100%），同时反伤所有伤害的 50%',
      }),
      skill(4, 'endure', '完全复活', {
        damage: 0, range: 0, start: .5, duration: .95, cd: 14, breakout: true, holdEndure: true, fx: 'revive',
        onActive: [
          { op: 'heal', hp: 200 },
          { op: 'fx', life: 1 },
          { op: 'mod', kind: 'guard', time: 6, v: .5 },
          { op: 'mod', kind: 'relapse', time: 6, v: 250, mark: 'halo' },
        ],
        brief: '解控并回血；期间霸体，随后减伤，结束时反噬自身',
        detail: '解控并回复 20% 最大生命；期间霸体，6 秒内受伤降低 50%，结束后承受 25% 最大生命的反噬',
      }),
      skill(5, 'projectile', '让大家幸福的音乐', {
        cost: 120, damage: 34, count: 10, interval: .28, size: 34, life: .9,
        guardPlan: [6, 9, 13, 18, 25, 34, 45, 58, 74, 92],
        start: .4, duration: 3, fx: 'happymusic',
        holdEndure: true, jumpCancel: 1, knock: 150, gain: 2,
        brief: '原地弹奏并霸体；周期震开近身，追踪音符飞一段即散',
        detail: '原地弹奏 3 秒，期间霸体，每 0.3 秒震开近身；其间发射十枚追踪音符，飞约 0.9 秒后消散。1 秒后可后跳取消',
      }),
    ],
  },
  {
    id: 'hotaru', name: '汐见萤', title: '主唱兼键盘 / 装置', quote: '让millsage，就此结束。', color: '#99FF99',
    bands: ['millsage'],
    // 官网：「心優しき音楽の天才。」
    genius: true,
    ...stats('focus'),
    rainbow: { chance: .12, cooldown: 10 },
    view: {
      kind: 'sprite', common: '/sprites/hotaru/common.png', special: '/sprites/hotaru/special.png', height: 170,
      extras: ['/sprites/hotaru/piano.png', '/sprites/hotaru/cookie.png'],
    },
    skills: [
      skill(0, 'light', '指尖'),
      skill(1, 'heavy', '踏板'),
      skill(2, 'projectile', '小馒头投喂', {
        damage: 10, count: 3, interval: .18, range: 400, start: .22, duration: .85, cd: 5,
        life: 1.2, size: 34, knock: 60, fx: 'manju', motion: 'fall', floor: 'splash',
        brief: '弧线连投三枚小馒头；落地即碎，可挡可跳',
        detail: '向前上方弧线投出三枚小馒头饼干，每枚 10 伤害，飞行约半秒落地即碎；可格挡或跳过',
      }),
      skill(3, 'endure', '舞台装置', {
        damage: 0, range: 140, start: .4, duration: .9, cd: 10, fx: 'apparatus',
        onActive: [
          { op: 'summon', kind: 'apparatus' },
        ],
        brief: '装置替身只会普攻；自身隐身，其被击败才计冷却',
        detail: '召唤一台舞台装置（生命半成、攻击三成、只会普攻），受到伤害的八成由萤承担，不会自行退场，电脑对手会优先攻击它；装置在场时萤半透明隐身：敌方普攻两成打空、飞行道具九成打空，抓投和必杀仍必中；装置被击败后才进入 10 秒冷却',
      }),
      skill(4, 'projectile', '重生之乐音', {
        damage: 7, count: 8, range: 520, start: .3, duration: 1.05, cd: 9,
        life: 10, size: 34, knock: 90, gain: 2, fx: 'rebirth',
        brief: '八枚音符折返持续追踪；贴近转直线可躲，命中回血',
        detail: '向八方旋出八枚音符，外扩后折返并远距离持续追踪对手，每枚 7 伤害，命中任一发回复萤 5 生命；贴近对手时转为直线冲出、可侧移或跳跃躲避，可格挡，至多持续 10 秒或飞出场地即消散',
      }),
      skill(5, 'projectile', '起死开战', {
        cost: 250, damage: 0, count: 0, range: 480, start: .55, duration: 2.05, fx: 'war',
        holdEndure: true,
        domain: {
          background: '/stages/hotaru-war.png',
          time: 6,
          buffs: [
            { kind: 'regen', v: 20 },
            { kind: 'speed', v: 1.3, atk: 1.25 },
            { kind: 'lifesteal', v: .25 },
          ],
        },
        brief: '霸体弹奏换幕并震开近身；数秒内回复提速附吸血',
        detail: '坐到巨大三角琴前霸体弹奏约 2 秒，起手震开近身，舞台切换为起死开战专属幕景；其后 6 秒每秒回复 20 生命、移动速度提高 30%、攻击速度提高 25%，攻击附带 25% 吸血',
      }),
    ],
  },
  {
    id: 'natsume', name: '伊泽枣', title: '吉他 / 狼王', quote: '我就在这里，拼命赚钱……！', color: '#FF4444',
    bands: ['millsage'],
    ...stats('rush'),
    // 狼王来了: the form rides the king sheet (every cell is a wolf), so the common cells are the wolf's too.
    frenzy: { rate: 1.2, rangeMul: 1.35, cdMul: .75, damageMul: 1.3, chain: true, lock: true, air: true, time: 9.25, tint: '#FF4444', swingFx: 'claw', heavyLunge: 90 },
    view: {
      kind: 'sprite', common: '/sprites/natsume/common.png', special: '/sprites/natsume/special.png', height: 175,
      king: '/sprites/natsume/wolf.png', kingScale: 1,
      extras: ['/sprites/natsume/claw.png'],
    },
    skills: [
      skill(0, 'light', '啧', { damage: 24, start: .065, cd: .2 }),
      skill(1, 'heavy', '高年级的教育', { range: 132 }),
      skill(2, 'dash', '专业工种', {
        damage: 26, speed: 900, start: .1, duration: .78, cd: 5.5, range: 100, reach: 'ground', fx: 'sandwich', knock: 60,
        react: { kind: 'stand', stun: .32 },
        finale: { knock: 300, react: { kind: 'knockdown', vy: -220, knocked: .7 } },
        brief: '贴地穿身往返，回程背后打；转身才能挡，末击击倒',
        detail: '前冲穿过对手再折回，往返各打一下；回程从背后来，不转身挡不住，末击击倒；贴地，跳起可躲',
      }),
      skill(3, 'endure', '状态不好，这次不算！', {
        damage: 0, range: 0, start: .2, duration: .6, cd: 14, breakout: true, fx: 'excuse',
        brief: '解控并回血，回复量取决于刚挨的伤害',
        detail: '解控并回复最近 2 秒内所受伤害的 50%；没挨打时只解控',
      }),
      skill(4, 'upper', '天台是我的', {
        damage: 58, range: 120, start: .55, duration: 1.0, cd: 7, fx: 'rooftop',
        hitbox: 'disc', knock: 260, react: { kind: 'knockdown', vy: -180, knocked: .7 },
        brief: '跳出画面无敌，从标记处踩下击倒；离开标记可躲',
        detail: '跳出画面上方并锁定对手脚下，空中无敌 0.45 秒；0.4 秒后从标记处踩下，击倒；离开标记可躲，可格挡',
      }),
      skill(5, 'endure', '狼王来了', {
        // Kneel .35s, howl about 1s under the moonlight (white rings every .15s shove the field
        // back), then rise. The form and its mods start at the howl, so 9.25s leaves 8s of wolf
        // after the 1.25s still to play.
        cost: 200, damage: 0, range: 220, start: .35, duration: 1.6, fx: 'wolf', holdEndure: true,
        onActive: [
          { op: 'form', king: true },
          { op: 'mod', kind: 'noGain', time: 9.25 },
          { op: 'mod', kind: 'sprint', time: 9.25 },
          { op: 'mod', kind: 'lifesteal', time: 9.25, v: .2 },
          { op: 'mod', kind: 'undying', time: 9.25 },
          // True super armour (the frenzy brace) without the damage cut: only grabs and control stagger her.
          { op: 'mod', kind: 'brace', time: 9.25, v: 1 },
          { op: 'mod', kind: 'relapse', time: 9.25, v: 200 },
          { op: 'fx', type: 'howl-ring', life: .5, radius: 220, y: -120, announce: { color: '#BFD8FF', life: 1, size: 19, y: -240 } },
        ],
        brief: '嚎叫震开后狼化：J / K、吸血不倒；结束反噬',
        detail: '月光下嚎叫约 1 秒，持续震开周围；随后变身狼人 8 秒：只剩 J / K，三下 J 后扑咬「枣到你了」；移速提高，吸血 20%，真霸体，生命不低于 1；结束反噬 20% 最大生命，可致死；无法获得气',
      }),
    ],
  },
  {
    id: 'houka', name: '和泉朋花', title: '鼓手 / 天才控', quote: '我最喜欢天才了♡', color: '#EE99EE',
    bands: ['millsage'],
    ...stats('beat'),
    view: {
      kind: 'sprite', common: '/sprites/houka/common.png', special: '/sprites/houka/special.png', height: 175,
      extras: ['/sprites/houka/coffin.png'],
    },
    skills: [
      skill(0, 'light', '失礼了♡'),
      skill(1, 'heavy', '长靴'),
      // 天才♡ (combat.ts outshines): the foe has a larger share of health left, or a genius stands on their side.
      skill(2, 'dash', '您真是天才呢♡', {
        damage: 40, cd: 6, fx: 'praise',
        curse: { kind: 'dmgDealt', time: 5, v: .75, mark: 'praise', text: '飘了♡' },
        brief: '突进；打实后对方伤害降低，对方是天才时回气',
        detail: '突进；打实后对方飘了 5 秒，造成的伤害降低 25%；对方血量比例高于自己或对方队伍有天才时，额外回 20 气',
      }),
      skill(3, 'endure', '好痛……♡', {
        damage: 35, range: 120, start: .8, duration: 1.1, cd: 8, fx: 'feign',
        root: 1.5, rootPin: true, rootBreak: 0, knock: 0, react: { kind: 'stand' },
        brief: '装弱倒地；近身打她则被绕背定身，飞弹可破',
        detail: '装弱倒地 0.8 秒；期间被近身攻击打中则免伤，绕到对方背后反击并定身 1.5 秒，对方是天才时 2.2 秒；飞弹照常命中；没人上当会留下破绽',
      }),
      skill(4, 'sweep', '请成为主角吧♡', {
        damage: 36, range: 200, start: .3, duration: .7, cd: 9, fx: 'spotlight',
        root: .6, rootPin: true, knock: 0, react: { kind: 'stand' },
        curse: { kind: 'incoming', time: 4, v: 1.2, mark: 'spotlight', text: '主角♡' },
        brief: '身前聚光灯定身并增伤，自身半透明；跳起可躲',
        detail: '身前落下聚光灯；打实则定身 0.6 秒，对手成为主角 4 秒，受到的伤害提高 20%；自身半透明 4 秒，J / K 有 20% 打空、飞弹 90% 打空；跳起可躲',
      }),
      // The rings' clocks live in clips.ts (RING_SMALL / RING_BIG). `damage` is the big ring; each
      // small ring chips RING_CHIP (combat.ts). The coffin holds until 3.0s.
      skill(5, 'endure', '康乃馨盛开之日', {
        cost: 180, damage: 85, range: 460, start: .15, duration: 3.5, fx: 'coffin', noBlock: true, control: true,
        knock: 380, react: { kind: 'knockdown', vy: -320, knocked: .9 },
        brief: '入棺无敌；对手身边落七小圈一大圈，大圈可闪避',
        detail: '躲进自己的棺材，期间无敌；对手所在处接连落下七个小粉圈和一个大粉圈，各自收缩到最小后炸开；小圈伤害低、不打断对手，大圈打中即击倒；无法格挡，跑出圈外或抓准时机闪避可躲',
      }),
    ],
  },
  {
    id: 'nagi', name: '琴平凪', title: '吉他 / 摆烂王', quote: '我会选择有你在的地狱。', color: '#5555FF',
    bands: ['millsage'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/nagi/common.png', special: '/sprites/nagi/special.png', height: 181,
    },
    skills: [
      skill(0, 'light', '啊哈', { range: 104 }),
      skill(1, 'heavy', '茉幌骑士', { range: 140 }),
      // 打水漂 (combat.ts step_skip): the hop count is rolled; the run ends on contact and the die face decides the strike.
      skill(2, 'dash', '打水漂', {
        damage: 60, speed: 760, range: 100, start: .12, duration: 1.17, cd: 4, fx: 'skip', reach: 'ground',
        knock: 100, react: { kind: 'stand', stun: .3 },
        brief: '贴地连跳碰到即结算；奇数速冷却偶数双倍，五击倒',
        detail: '贴地随机连跳 3～5 下，骰子随跳数加点；碰到对手或跳完即出手结算：奇数冷却降为 1 秒，偶数伤害翻倍，5 点额外击倒；打空不结算冷却；跳起可躲',
      }),
      skill(3, 'upper', '把月亮扣下来', {
        damage: 58, range: 120, cd: 6, fx: 'dunk', knock: 120,
        brief: '对空起手无敌；空中对手扣倒，地面对手挑空',
        detail: '原地起跳，起手无敌 0.2 秒；打中空中的对手则往下扣，击倒；打中地面的对手则挑空，跳起追打可连段',
      }),
      skill(4, 'endure', '稍好一些的地狱', {
        damage: 40, range: 120, start: .15, duration: .6, cd: 14, breakout: true, holdEndure: true, fx: 'numb', knock: 280,
        brief: '解控并霸体肩撞；之后记账不掉血，到时一起结算',
        detail: '解控并霸体肩撞击退；随后 4 秒记账，期间不掉血也不硬直，结束时一次承受期间伤害的 80% 并硬直 0.35 秒；抓投照常生效',
      }),
      // 七下是近战必杀的上限：同一串连段的第 7 下会让对手脱离连段（立希、LAYER 同为 7 段）。
      skill(5, 'endure', '……来练习吧', {
        damage: 32, count: 7, interval: .16, range: 150, start: .45, duration: 1.75, fx: 'practice', holdEndure: true, knock: 60,
        guardPlan: [6, 12, 18, 26, 40, 52, 64],
        finale: { damage: 95, knock: 380, react: { kind: 'knockdown', vy: -240, knocked: .9 } },
        brief: '霸体扫弦七下，越弹越快，末下击倒',
        detail: '霸体原地前压扫弦七下，间隔从 0.22 秒缩到 0.09 秒，末下全力下扫击倒；可格挡，第 5 段破防',
      }),
    ],
  },
  {
    id: 'mahoro', name: '滨崎茉幌', title: '贝斯 / 不退场', quote: '再痛，也不能退场。', color: '#77FFFF',
    bands: ['millsage'],
    ...stats('armor'),
    view: {
      kind: 'sprite', common: '/sprites/mahoro/common.png', special: '/sprites/mahoro/special.png', height: 175,
    },
    skills: [
      skill(0, 'light', '外场王牌'),
      skill(1, 'heavy', '玛丽珍', { range: 132 }),
      // 精准踩雷 (combat.ts step_landmine): the pat is the grab; the mine under their feet is the real hit.
      skill(2, 'grab', '精准踩雷', {
        damage: 45, range: 110, start: .2, duration: .9, cd: 7, fx: 'landmine', hitbox: 'front', knock: 120,
        holdEndure: true,
        brief: '霸体拍肩抓取，脚下地雷挑空；引爆增益追加伤害',
        detail: '释放时霸体。前冲拍肩抓取，0.35 秒后对方脚下地雷炸开挑空，可追打；对方每有一个增益状态就引爆清除并追加 15 伤害，至多 3 个；挂账、不死和变身不受影响',
      }),
      skill(3, 'endure', '绝不退场', {
        damage: 0, range: 0, start: .2, duration: .6, cd: 14, breakout: true, holdEndure: true, fx: 'slap',
        brief: '解控拍脸自扣血；随后减伤且每挨一下伤害提高',
        detail: '解控并双手拍脸，自扣 30 生命；随后 6 秒受到伤害降低 20%，每被打中一次造成伤害提高 6%，至多 30%',
      }),
      skill(4, 'endure', '一肩扛下', {
        damage: 0, range: 0, start: .25, duration: .55, cd: 12, fx: 'burden',
        brief: '头顶三样各挡一下；扛到最后转为余震，全碎则崩盘',
        detail: '头顶麦克风、贝斯、歌词本，6 秒内各挡一次伤害，抓投和必杀除外；时间到时每剩一个，下一次命中追加 20 伤害；三个全碎则硬直 0.8 秒',
      }),
      // 安可是主唱的 (combat.ts step_encore): the light roots, then three blows on the run through, then off the frame.
      skill(5, 'endure', '安可是主唱的', {
        damage: 55, range: 340, start: .5, duration: 3.9, fx: 'encore', holdEndure: true, noBlock: true, control: true,
        finale: { damage: 90, knock: 380, react: { kind: 'knockdown', vy: -220, knocked: 1, clearRoot: true } },
        brief: '霸体定身后冲穿击倒；跳起可躲，不能格挡，离场无敌',
        detail: '霸体；台下喊安可，聚光灯落在最近的对方身上定身 1.2 秒；随后黑脸冲刺穿过对方三段，末段击倒，冲出画面后无敌 1 秒，再从另一侧冲回原位；聚光灯落下时跳起或闪避可躲，不能格挡',
      }),
    ],
  },
  {
    id: 'raika', name: '须贺蕾叶', title: '吉他 / Family 笨蛋', quote: '来，上吧，My Family！', color: '#FF7700',
    bands: ['ikka-dumb-rock'],
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/raika/common.png', special: '/sprites/raika/special.png', height: 179,
      extras: ['/sprites/raika/family.png'],
    },
    // 只攻不守: no breakout anywhere. U I O wear armour for the whole cast instead (holdEndure).
    skills: [
      skill(0, 'light', '啊哈哈，抱歉！'),
      // 恶鬼退散 (combat.ts oni-out): 「恶鬼～滚出去！福气～进门来！」 — a palm shove that scatters beans.
      skill(1, 'heavy', '恶鬼退散', { range: 124, knock: 300, fx: 'oni-out' }),
      // 我背你！ (combat.ts step_piggyback): she catches them on her back and runs until a wall or the clock.
      skill(2, 'dash', '我背你！', {
        damage: 40, speed: 820, range: 70, start: .12, duration: 1.45, cd: 7, fx: 'piggyback', holdEndure: true,
        knock: 380, react: { kind: 'knockdown', vy: -260, knocked: .8 },
        brief: '霸体突进背起对手跑，撞墙或跑完扔出；被挡摔倒',
        detail: '霸体冲刺，命中背起对手往前跑，撞到画面边缘或跑满 0.75 秒扔出击倒，共 48 伤害；被挡则硬直 0.5 秒',
      }),
      // 爱之拥抱 (combat.ts step_bear_hug): a lunge, the hug, four squeezes that get tighter.
      skill(3, 'grab', '爱之拥抱', {
        damage: 10, count: 4, range: 66, speed: 520, start: .14, duration: 1.45, cd: 8, fx: 'bear-hug', holdEndure: true,
        knock: 0, gain: 4,
        finale: { damage: 16, knock: 200, react: { kind: 'stand', stun: .45 } },
        brief: '霸体扑上去熊抱勒紧连打，末下对手硬直',
        detail: '霸体前扑抓取，熊抱勒紧四下：前三下各 10 伤害，末下 16 伤害并使对手硬直 0.45 秒',
      }),
      // 我开动了！ (combat.ts emit_itadakimasu): 「一日之计在于和 Family 一起吃早饭」.
      skill(4, 'endure', '我开动了！', {
        damage: 0, range: 0, start: .6, duration: .8, cd: 15, fx: 'itadakimasu', holdEndure: true,
        brief: '霸体站着吃饭；吃完 J / K 更快、移速提高',
        detail: '霸体站定 0.6 秒吃完一碗饭；之后 6 秒 J / K 冷却加快 25%，移速提高 15%',
      }),
      // 上吧，My Family！ (combat.ts step_family): the grab, four family silhouettes in turn, her own strum last.
      skill(5, 'grab', '上吧，My Family！', {
        cost: 140, damage: 26, count: 6, range: 70, speed: 520, start: .35, duration: 2.8, fx: 'my-family', knock: 0, gain: 2,
        finale: { damage: 110, knock: 380, react: { kind: 'knockdown', vy: -240, knocked: .9 } },
        brief: '前冲抓人，家人轮流连打；没抓到就打身前一片',
        detail: '前冲抓取，家人剪影轮流打五段，末段扫弦 110 伤害并击倒；没抓到则在身前一片区域照样连打，每段 18、末段 50，可格挡',
      }),
    ],
  },
  {
    id: 'miku', name: '马桥心玖', title: '吉他 / 腹黑', quote: '把我带回有你们在的那个家……！！', color: '#22CCFF',
    bands: ['ikka-dumb-rock'],
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/miku/common.png', special: '/sprites/miku/special.png', height: 176, lift: 11, specialScale: .95 },
    // 纯输出: no breakout, no heal. U holds poise for the pose. Every move smiles first and does the damage after.
    skills: [
      // 好啦好啦 (视角 2: 「好啦好啦，所有人都去客厅——」): said once a round, on the first jab that lands.
      skill(0, 'light', '好啦好啦', { fx: 'hai-hai' }),
      // 先敲门！ (视角 2: 「都说了进门先敲门啊！」): a push kick with two small knocks where it lands.
      skill(1, 'heavy', '先敲门！', { range: 128, knock: 260, fx: 'knock-knock' }),
      // 表面烤得很漂亮 (combat.ts step_puff): the smiling glide and the pat; a beat later the cut.
      skill(2, 'dash', '表面烤得很漂亮', {
        damage: 8, speed: 780, range: 84, start: .1, duration: .82, cd: 4, fx: 'puff-cut', noSparks: true,
        finale: { damage: 46, knock: 160, react: { kind: 'stand', stun: .4 } },
        brief: '霸体闪现轻拍翻脸横切，可接连段；被挡收手',
        detail: '释放时霸体。化作星光闪现到前方对手面前先轻拍 8 伤害，0.12 秒后翻脸横切 46 伤害并硬直 0.4 秒，可接连段；轻拍被挡则不出第二刀并硬直 0.35 秒；前方没人则闪现一小段',
      }),
      // 珍稀动物认证: the tag is the curse — only her own hits collect on it; a second hit upgrades it.
      skill(3, 'heavy', '珍稀动物认证', {
        damage: 30, range: 197, start: .16, duration: .5, cd: 7, fx: 'rare-tag', knock: 140, noSparks: true,
        curse: { kind: 'incoming', time: 12, v: 1.12, mark: 'rare', own: true, up: { v: 1.25, mark: 'beast' }, upBy: 'specials' },
        brief: '劈击挂珍稀动物标牌，受她伤害提高；技能再中升级',
        detail: '命中挂珍稀动物标牌 12 秒，期间受心玖伤害 +12%；标牌在时被心玖的 U、I、O、L 任一技能命中则升级为奇葩神兽，加成 +25% 并重新计时 12 秒，只升一级；只对心玖自己的伤害生效',
      }),
      // 才没有在撒谎 (combat.ts step_earlobe / counter_earlobe): tap is the far four palms.
      // Holding past the decide locks the ear-touch; a whiff still pushes, at this range. damage × count = 80.
      skill(4, 'endure', '才没有在撒谎', {
        damage: 20, count: 4, range: 118, start: 1.8, duration: 2.45, cd: 6, fx: 'earlobe', knock: 280, noSparks: true,
        react: { kind: 'stand', stun: .3 },
        brief: '点按远距四连推掌；长按反击否则也推',
        detail: '点按四连推掌，比长按推掌远四成，每下 20 伤害，末下击退。长按摸耳垂，前摇 1.8 秒内被近身攻击则不受伤，反击掌底 60 加膝撞 64 伤害并击倒；到点没挨打则同样四连推掌。飞行道具、抓投和必杀照常命中',
      }),
      // 过家家到此为止 (combat.ts step_playhouse): the bow, the cut through them, the walk away, 再见.
      skill(5, 'grab', '过家家到此为止', {
        cost: 120, damage: 40, range: 84, speed: 900, start: .5, duration: 3.65, fx: 'playhouse', knock: 0, gain: 2, noSparks: true,
        finale: { damage: 90, knock: 360, react: { kind: 'knockdown', vy: -220, knocked: .9 } },
        brief: '鞠躬后穿身横斩背对对手，斩痕迟到爆开后击倒',
        detail: '鞠躬 0.5 秒后前冲横斩穿过对手并定住；她背对对手站定，斩痕三次爆开各 28 伤害，说再见时末下 90 伤害击倒；不能格挡，没斩到则无伤害',
      }),
    ],
  },
  {
    id: 'shizuku', name: '四宫宁月', title: '键盘 / 公主', quote: '往后余生，还请对四宫宁月多加关照。', color: '#9999FF',
    bands: ['ikka-dumb-rock'],
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/shizuku/common.png', special: '/sprites/shizuku/special.png', height: 150, lift: 5,
      extras: ['/sprites/shizuku/foil.png', '/sprites/shizuku/popsicle.png', '/sprites/shizuku/microwave.png', '/sprites/shizuku/fridge.png', '/sprites/shizuku/washer.png'],
    },
    // 状态异常: 「家团最危险、最不稳定、最容易爆炸的成员」(B 站). Every special is a household accident and lays a
    // different status (src/game/status.ts); the super pays out on the ones they already carry.
    skills: [
      // 实在抱歉 (第 6 话醒来第一句: 「承蒙各位如此费心照顾，实在抱歉」).
      skill(0, 'light', '实在抱歉'),
      // 请多关照 (第 7 话: 「往后余生，还请对四宫宁月多加关照」): polite, and stronger than she looks.
      skill(1, 'heavy', '请多关照', { fx: 'bow-push' }),
      // 锡纸加热实验 (萌百: 锡纸放进微波炉差点点着房子): the foil crackles in flight and lights them.
      skill(2, 'projectile', '锡纸加热实验', {
        damage: 18, speed: 520, size: 40, life: .9, start: .22, duration: .55, cd: 5, knock: 60, fx: 'foil-spark', noSparks: true,
        status: [{ kind: 'burn', time: 4, dmg: 6, tick: .5, onBlock: .5 }],
        brief: '锡纸团命中烧焦持续掉血；被挡也烧焦但较短',
        detail: '弹出锡纸团，命中 18 伤害并烧焦 4 秒，每 0.5 秒 6 伤害，烧焦掉血格挡挡不住；再中刷新时间不叠加；被挡也烧焦 2 秒；完美格挡则不烧焦',
      }),
      // 一人一半 (第 15、20 话的棒棒冰): she throws half and eats half. Already 冻僵 → 冻住 instead.
      skill(3, 'projectile', '一人一半', {
        damage: 22, speed: 380, size: 48, life: 1.1, start: .3, duration: .7, cd: 6, knock: 40, fx: 'popsicle', noSparks: true,
        status: [
          { kind: 'freeze', time: 2, ifHas: 'chill' },
          { kind: 'chill', time: 4, move: .6, jump: .75, atk: .75, onBlock: .5 },
        ],
        brief: '扔棒棒冰冻僵再中冻住并回血；被挡也短冻僵',
        detail: '掰开棒棒冰扔出一半，略微下坠；命中 22 伤害并冻僵 4 秒，移速、跳跃、攻速变慢；对手已冻僵时改为冻住 2 秒，期间完全无法行动；被挡也冻僵 2 秒但不会冻住；完美格挡则无效；出手即吃掉另一半回 30 生命',
      }),
      // 社交派对的微笑 (第 12 话的公主假笑; combat.ts step_smile / counter_smile): no damage, only 混乱.
      skill(4, 'endure', '社交派对的微笑', {
        damage: 0, range: 110, start: .5, duration: .85, cd: 12, fx: 'princess-smile', knock: 220,
        status: [{ kind: 'confuse', time: 1.5 }],
        counterStatus: [{ kind: 'confuse', time: 3.5 }],
        statusExtend: 1,
        brief: '假笑接招不受伤或屈膝推开都混乱；已有异常延长一倍',
        detail: '公主假笑站定 0.5 秒，期间被近身攻击则不受伤，攻击者身上已有的异常剩余时间延长一倍并混乱 3.5 秒，她不还手；没人攻击则屈膝礼推开身前近身对手，同样把其已有异常延长一倍并混乱 1.5 秒，无伤害；混乱时左右方向颠倒；飞行道具、抓投和必杀照常命中',
      }),
      // 世界如此广阔 (combat.ts step_wideWorld): the three accidents lay the three statuses in this order;
      // the finale counts the kinds they carried when she caught them.
      skill(5, 'grab', '世界如此广阔', {
        damage: 25, range: 100, speed: 820, start: .4, duration: 3, fx: 'wide-world', knock: 0, noSparks: true,
        status: [
          { kind: 'burn', time: 4, dmg: 6, tick: .5 },
          { kind: 'chill', time: 4, move: .6, jump: .75, atk: .75 },
          { kind: 'confuse', time: 3 },
        ],
        statusBonus: { per: 20 },
        finale: { damage: 50, knock: 340, react: { kind: 'launch', vy: -520, knocked: .9 } },
        brief: '前方家电接连出事挂三种异常；按先前异常数加伤',
        detail: '合十后短冲，抓到对手则定住；没抓到则在冲刺尽头前方展开，走进范围的人同样会被波及；依次出现微波炉、冰箱、洗衣机，各 25 伤害并挂烧焦 4 秒、冻僵 4 秒、混乱 3 秒；最后泡沫炸开击飞 50 伤害，对手在抓住或第一次被波及时身上每有一种异常再加 20；不能格挡',
      }),
    ],
  },
  {
    id: 'chieri', name: '梅里千樱梨', title: '鼓手 / 头号人物', quote: '千樱梨，就是很厉害的！！', color: '#FF55AA',
    bands: ['ikka-dumb-rock'],
    ...stats('beat'),
    view: { kind: 'sprite', common: '/sprites/chieri/common.png', special: '/sprites/chieri/special.png', height: 163, lift: 8 },
    // 出风头: 「舞台灯光千樱梨要一个人独占！」(第 2 话). U takes the cheers, I makes a 部下 who trots behind her,
    // O blows up round herself (樱桃炸弹 — her twin buns are the cherries), and the super calls the league in.
    // Every move but the super is empty-handed; the sticks are only in the L column.
    skills: [
      // 千·樱·梨！ (第 3 话: 「不是千梨，是千·樱·梨！」): one syllable a jab; the round's first hit is hers.
      skill(0, 'light', '千·樱·梨！', { fx: 'chieri-name' }),
      // 惊叹号 (萌百题头: 「什么……！！」): the loudest voice in the house.
      skill(1, 'heavy', '惊叹号', { fx: 'chieri-bang' }),
      // 千樱梨登场 (combat.ts step_entrance): the leap onto the stage, the cymbal, then five seconds of their cheers.
      skill(2, 'dash', '千樱梨登场', {
        damage: 36, range: 112, start: .2, duration: 1.15, cd: 10, knock: 220, fx: 'chieri-entrance', noSparks: true,
        react: { kind: 'stand', stun: .35 },
        brief: '霸体跃起砸落震地；之后对手的气全归她',
        detail: '霸体高跳砸向前方对手，落地震波 36 伤害并击退，只打地面、左右都打；落地后 5 秒内所有对手获得的气全部归千樱梨，被打也不会中断',
      }),
      // 千樱梨收编令 (第 8 话: 「千樱梨会把你收归麾下的」): the handshake makes them a 部下 who walks behind her.
      skill(3, 'grab', '千樱梨收编令', {
        damage: 20, range: 96, start: .2, duration: .6, cd: 9, knock: 0, fx: 'chieri-recruit', noSparks: true,
        react: { kind: 'stand', stun: .2 },
        status: [{ kind: 'follow', time: 1.8 }],
        brief: '近身握手收编对手为跟班；之后留部下徽章',
        detail: '近身握手 20 伤害并让对手跟班 1.8 秒：失去控制，自动跟在她身后，不能出招、格挡、闪避和跳跃，挨打照常；被击倒则提前结束；结束后 4 秒内不能再次跟班；对手留下部下徽章 6 秒',
      }),
      // 千樱梨樱桃炸弹 (combat.ts step_cherry): the buns turn into a pair of cherries; the fuse burns, and the
      // more they hit her while it burns, the bigger she goes off. Holding the key keeps her lit up to 2.1 s.
      skill(4, 'heavy', '千樱梨樱桃炸弹', {
        damage: 40, range: 130, start: .7, duration: 1.15, cd: 8, knock: 260, fx: 'cherry-bomb', noSparks: true,
        react: { kind: 'stand', stun: .35 },
        finale: { damage: 80, knock: 380, react: { kind: 'knockdown', vy: -300, knocked: .9 } },
        brief: '霸体蓄力自爆不可格挡；挨打和长按满都加层',
        detail: '原地蓄力 0.7 秒，期间霸体、受到伤害减半，每挨一下蓄力加一层，至多 3 层；长按可把引爆推迟到出招后至多 2.1 秒，期间同样霸体、减伤、加层，松手即爆，按满 2.1 秒额外加一层但不超过 3 层；以自身为中心爆炸，不能格挡，0 层 40 伤害，每层伤害和范围都变大，3 层 80 伤害并击倒',
      }),
      // 千樱梨联盟集合 (第 20 话家规: 「千樱梨联盟一旦发出集结令，无论何时何地都必须全员到齐！」): the call pulls
      // the nearest foe to her from anywhere, five drum heads and the cymbal; the 部下 count rolls to 100,000,000.
      skill(5, 'grab', '千樱梨联盟集合', {
        cost: 150, damage: 30, count: 5, interval: .2, range: 900, start: .45, duration: 2.6, fx: 'chieri-assemble', knock: 0, gain: 2, noSparks: true,
        finale: { damage: 90, knock: 300, react: { kind: 'launch', vy: -560, knocked: .9 } },
        brief: '全屏拽到面前连打挑空；闪避有一半拽不到',
        detail: '大喊集结令，把最近的对手从任何位置拽到面前，五记鼓点各 30 伤害，最后镲片 90 伤害挑空；不能格挡；对手无敌或闪避中有 50% 拽不到；对手正在跟班或带着部下徽章时必定拽到，伤害 +15%',
      }),
    ],
  },
  {
    id: 'yomogi', name: '矢仓蓬咲', title: '贝斯 / 脑内番长', quote: '总有一天我会蜕变，变成强强的我给你看！！', color: '#448888',
    bands: ['ikka-dumb-rock'],
    ...stats('armor'),
    // 硬派身躯 is the trait's own name — the 硬派 she worships in 《鬼时雨》 and does not have. The heart is hers.
    passive: ['硬派身躯 · 心跳计', '受到伤害降低 5%；对手靠近、正对她或打中她时心跳加快，满了自动炸开击倒周围；心跳失控时朝她走来的对手会腿软'],
    // 心跳计 (第 1、8、11 话: 「心脏都要扭成一团」「像抹布一样被拧紧」「要被吓得蹦出来了」「快要炸开了」): the gauge is
    // her heart rate. combat.ts stepHeart raises and calms it, beats it, puts the dread on foes and bursts it.
    gauge: { max: 100, onHitTaken: 5, label: '心跳', color: '#ff5a78' },
    heart: { near: 180, nearRate: 8, gaze: 300, gazeRate: 3, calm: 360, calmRate: 10, dread: 260, dreadMul: .85, burstR: 150, burstDamage: 35, reset: 30, rest: 4 },
    view: { kind: 'sprite', common: '/sprites/yomogi/common.png', special: '/sprites/yomogi/special.png', height: 177, lift: 6 },
    // 脑子里是番长，身体是底层人类. The look is 不良漫画 (yomogiFx.ts): halftone, speed lines, ゴゴゴ, a heart that
    // will not calm down. Every move is empty-handed; the oxygen can at the end of L is the only prop.
    skills: [
      // 请不要看我 (第 3 话: 「请不要看我这种底层小人物～～！！」): hands over her face, flailing.
      skill(0, 'light', '请不要看我', { fx: 'yomogi-shy' }),
      // 怪叫 (萌百萌点; B 站「像被电了」): the scream comes out as a zigzag of current, wider the faster her heart.
      skill(1, 'heavy', '怪叫', {
        fx: 'yomogi-shriek',
        brief: '重击击退；心跳越快范围越大',
        detail: '重击击退；心跳每升一档范围扩大 10%；用一次心跳上升 6',
      }),
      // 躲到你身后 (第 3、11、17、20 话; 宁月「大半个身子都露出来了哦」): through them to their back, a crouch, and the
      // scare of her own heartbeat throws the punch. Turn round first and she is caught — the punch comes early and light.
      skill(2, 'dash', '躲到你身后', {
        damage: 40, range: 110, start: .1, duration: 1.4, cd: 7, knock: 260, invuln: .34, fx: 'yomogi-hide', noSparks: true,
        react: { kind: 'stand', stun: .45 },
        brief: '无敌穿身绕后一拳；对手先转身则伤害降低',
        detail: '无敌穿过身前对手停在其背后蹲下 0.4 秒再反手一拳并击退，心跳上升 15；期间对手先转身则立刻出拳但伤害 ×0.6；心跳每升一档伤害 +10%；身前没有对手则向前躲一小段后挥空',
      }),
      // 拳化为掌 (第 11 话《鬼时雨》第 14 卷: 「既可以出石头，也可以出布哦」「轰堂的必杀技就变成了打耳光」): a tap opens the
      // fist into a slap that spins them; held, it stays a fist. On the beat of her heart it lands harder.
      skill(3, 'heavy', '拳化为掌', {
        damage: 45, range: 118, start: .24, duration: .72, cd: 5, knock: 140, fx: 'yomogi-palm', noSparks: true,
        react: { kind: 'stand', stun: .7 },
        finale: { damage: 55, knock: 440, react: { kind: 'stand', stun: .4 } },
        brief: '点按耳光眩晕，长按重拳击退；踩心跳加伤',
        detail: '点按打出耳光 45 伤害并眩晕 0.7 秒；长按打出重拳 55 伤害并强击退；出手落在心跳那一拍伤害 +30%',
      }),
      // 人体感应雷达 (第 1 话: 「我的人体感应雷达没有反应……！」): she curls up and her heart races; whoever comes near
      // or hits her sets it off early. Nobody comes, and she stands up with her heart still pounding.
      skill(4, 'endure', '人体感应雷达', {
        damage: 40, range: 150, start: .06, duration: 1.75, cd: 8, knock: 360, fx: 'yomogi-radar', noSparks: true,
        react: { kind: 'knockdown', vy: -280, knocked: .8 },
        finale: { damage: 80 },
        brief: '霸体蹲下心跳飙升；有人靠近或挨打即炸开',
        detail: '霸体抱头蹲下至多 1 秒，心跳每秒上升 60；对手靠近或打中她即提前炸开心脏，以自身为中心击倒且不能格挡，心跳越快伤害越高 40～80，之后心跳回落；1 秒内无人靠近则什么都不发生，心跳留在高位',
      }),
      // 想象吧，变强的我 (第 3 话意象训练; 第 18 话「想象……变强的我……！」「等着吧，兄弟」、氧气罐、「矢仓蓬咲，奇迹生还！！！」;
      // B 站「看到自己影子的蓬咲」): her shadow stands up as the 番长 in her head. It scares her first; then it punches
      // on her heartbeat, faster and faster, and the last blow opens into the slap. The oxygen can, and she lives.
      skill(5, 'endure', '想象吧，变强的我', {
        cost: 180, damage: 18, count: 5, range: 560, start: .55, duration: 3.8, knock: 40, fx: 'yomogi-shadow', gain: 2, noSparks: true,
        react: { kind: 'stand', stun: .55 },
        guardPlan: [8, 14, 20, 30, 30],
        finale: { damage: 70, knock: 520, react: { kind: 'launch', vy: -480, knocked: .9 } },
        brief: '影子番长连打五拳接耳光；结束回血心跳清零',
        detail: '心跳拉满，影子化作番长冲向身前对手，五拳随心跳加速各 18 伤害，停顿后一记耳光 70 伤害并挑空；可格挡，第五拳破防；结束时吸氧回复 20 并清零心跳',
      }),
    ],
  },
  {
    // 丰川瑞穗 (game/mizuho.ts, render/mizuhoFx.ts): 祥子的母亲。招式全取自女儿那一套，再做成温柔的那一面。
    id: 'mizuho', name: '丰川瑞穗', title: '母亲 / 守望', quote: '小祥，妈妈一直看着你哦。', color: '#A9BEE8',
    hidden: true,
    ...stats('focus'),
    hp: 900,
    passive: ['还想再看看你', '每局一次，被击倒的那一击只会留下 1 点体力，随后在柔光中恢复 30% 体力并推开近身；飞行道具速度提高 15%'],
    // 礼仪是她教的：J / K 留下和祥子一样的银月。
    aura: { swing: 'saki-swing' },
    view: {
      kind: 'sprite', common: '/sprites/mizuho/common.png', special: '/sprites/mizuho/special.png', height: 181,
      extras: ['/sprites/sakiko/shiro.png', '/sprites/mizuho/doll.png'],
    },
    skills: [
      skill(0, 'light', '摸摸头', { brief: '轻击；命中可接 J / K', detail: '轻击；命中可接 J / K' }),
      skill(1, 'heavy', '拂袖', { brief: '重击；击退，轻击后可接', detail: '重击；击退，轻击后可接' }),
      // 再抱一会儿（《小祥猫的时候》：「她只想和妈妈多抱一会儿」）
      skill(2, 'grab', '再抱一会儿', {
        damage: 14, count: 4, range: 100, start: .24, duration: 1.75, cd: 8, knock: 0, fx: 'mizuho-hug',
        react: { kind: 'pin', stun: .3, holdStill: true },
        finale: { damage: 22, knock: 300, react: { kind: 'stand', stun: .45 } },
        brief: '抓投：抱住连打并回复自身，末段推开；跳起可躲',
        detail: '抱住身前对手四段共 64 伤害，每段回复自身 12 体力，末段推开；跳起或后撤可躲',
      }),
      // 留给你的人偶（祥子珍藏的西洋人偶是她的遗物）
      skill(3, 'endure', '留给你的人偶', {
        damage: 52, range: 150, start: .7, duration: 1.2, cd: 9, knock: 340, fx: 'mizuho-doll',
        react: { kind: 'knockdown', vy: -300, knocked: .8 },
        brief: '举起人偶反击近战，未触发反击则回复 40 体力',
        detail: '举起人偶 0.7 秒，期间近战打来由人偶代受，并放出光环 52 伤害击倒周围对手；架势结束时若未触发反击，回复 40 体力；飞行道具照常命中',
      }),
      // 妈妈的小祥（忘却之影丢下的白祥，会跑回妈妈身边）
      skill(4, 'projectile', '妈妈的小祥', {
        damage: 36, speed: 560, size: 70, life: 1.15, start: .3, duration: .62, cd: 7, knock: 200, fx: 'mizuho-shiro',
        frail: 4, frailBonus: .2, react: { kind: 'stand', stun: .4 },
        brief: '白祥的幻影贴地奔出；打实后脆弱，跳起可躲',
        detail: '白祥的幻影贴地向前奔出 36 伤害，打实后脆弱 4 秒（受伤 +20%）；可格挡，跳起可躲',
      }),
      // 化作星星（「人死后会变成星星」；收尾两轮月是《ふたつの月》）
      skill(5, 'projectile', '化作星星', {
        damage: 30, count: 9, interval: .17, speed: 660, size: 110, start: .5, duration: 2.3, life: 1.6,
        knock: 60, gain: 0, fx: 'mizuho-star', holdEndure: true, solid: false,
        react: { kind: 'stand', stun: .3 },
        guardPlan: [6, 10, 14, 18, 24, 30, 34, 38, 42],
        finale: { damage: 70, knock: 360, react: { kind: 'knockdown', vy: -320, knocked: .8 } },
        brief: '祈祷霸体；九颗星星落向对手所在位置，末星击倒',
        detail: '合十祈祷 1.8 秒，期间霸体；九颗星星从天而降落向对手所在位置，前八颗各 30 伤害，末星 70 伤害并击倒',
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
        damage: 45, range: 175, start: .22, duration: .8, cd: 13, invuln: 'cast', knock: 280, fx: 'violet',
        brief: '消失重现，两侧各爆开一次。起手到收招全程无敌',
        detail: '化作花瓣消失并爆开一次，于战场另一侧边缘重现再爆一次。起手到收招全程无敌，持续 0.8 秒',
      }),
      skill(4, 'heavy', '录音', {
        damage: 0, range: 0, start: .2, duration: .45, cd: 13, fx: 'record',
        brief: '影子重演行动，无法被击中；必杀不入带', detail: '录下 3.5 秒行动，原地留下影子照剧本重演一遍；影子伤害减半，无法被击中，必杀不入带',
      }),
      skill(5, 'projectile', '火的故事', {
        damage: 0, count: 1, speed: 300, size: 160, life: 6, start: .55, duration: .9, knock: 0, fx: 'fuga',
        solid: false,
        friendly: true, noSiphon: true, blockMul: .5, guardDmg: 50,
        brief: '火焰箭命中或到边缘即引爆；敌我不分，满跳可躲', detail: '虚空巨弓射出缓慢火焰箭，命中或到边缘即引爆：范围 170 伤，敌我不分，贴身会炸到自己；满跳可躲，格挡也承受 50% 伤害并付半管破防值',
      }),
    ],
  },
  {
    // 后藤一里 (game/bocchi.ts, render/bocchiFx.ts): 孤独摇滚！的波奇，第一位 BanG Dream! 以外的角色。
    // U I O 都不是用人形出招（纸箱、槌子蛇、怪兽皮套），只有 L 是全场唯一帅的时刻。
    id: 'bocchi', name: '后藤一里', title: '吉他 / 吉他英雄', quote: '社会好可怕！！', color: '#F5A9C0',
    bands: ['kessoku-band'],
    ...stats('focus'),
    passive: ['一个人才行 · 崩坏', 'U I O 出招时对手在远处伤害 +20%，贴身则 −15%；被击倒落地时原地崩坏，无敌 0.8 秒后复原并霸体 0.6 秒，冷却 12 秒，抓投与必杀无效'],
    view: {
      kind: 'sprite', common: '/sprites/bocchi/common.png', special: '/sprites/bocchi/special.png', height: 176, lift: 5,
      extras: ['/sprites/bocchi/box.png', '/sprites/bocchi/tsuchinoko.png', '/sprites/bocchi/kaiju.png', '/sprites/bocchi/crumble.png'],
    },
    skills: [
      // 开口前一定会加上一声「啊…」
      skill(0, 'light', '啊…那个…'),
      skill(1, 'heavy', '对不起对不起'),
      // 完熟芒果（街头演出前她只敢缩在芒果纸箱里弹琴）
      skill(2, 'dash', '完熟芒果', {
        damage: 40, range: 92, start: .2, duration: .98, cd: 6, speed: 430, knock: 320, fx: 'bocchi-box',
        react: { kind: 'knockdown', vy: -260, knocked: .7 },
        brief: '钻进纸箱滑撞并击倒；箱内霸体且受伤降低',
        detail: '钻进纸箱向前滑撞 40 伤害并击倒；箱内 0.56 秒霸体，受伤降低 40%',
      }),
      // 下北泽槌子蛇（出没在脚边、喜欢潮湿阴暗狭窄处的不明生物）
      skill(3, 'dash', '下北泽槌子蛇', {
        damage: 30, range: 78, start: .16, duration: .8, cd: 8, speed: 640, knock: 60, reach: 'ground', fx: 'bocchi-tsuchi',
        slow: 3, slowMul: .6, react: { kind: 'stand', stun: .35 },
        brief: '变成槌子蛇贴地爬行并无敌；咬中减速，跳起可躲',
        detail: '变成槌子蛇贴地爬行，期间无敌；咬中脚踝 30 伤害并减速 3 秒（移速 −40%）；跳起可躲',
      }),
      // 给我点赞（承认欲求怪兽：双手竖拇指，喷着热线喊「给我点赞」）
      skill(4, 'projectile', '给我点赞', {
        damage: 9, count: 6, interval: .09, speed: 640, size: 44, life: .95, start: .34, duration: 1.08, cd: 7,
        knock: 40, gain: 5, guardDmg: 6, solid: false, fx: 'bocchi-like', react: { kind: 'stand', stun: .22 },
        brief: '怪兽喷出六枚点赞；每枚命中回气',
        detail: '承认欲求怪兽喷出六枚点赞，每枚 9 伤害，命中回复 5 气；可格挡或跳过',
      }),
      // 吉他英雄（投稿名义「吉他英雄」；文化祭的飞扑没人接）
      skill(5, 'projectile', '吉他英雄', {
        damage: 26, count: 6, interval: .15, speed: 820, size: 60, start: .5, duration: 2.55, life: 2,
        cost: 120, knock: 0, gain: 0, fx: 'bocchi-hero', holdEndure: true, solid: false, contact: 'pass',
        react: { kind: 'stand', stun: .3 },
        guardPlan: [6, 10, 18, 28, 40],
        finale: { damage: 60, knock: 480, react: { kind: 'knockdown', vy: -340, knocked: .9 } },
        brief: '独奏：六条弹幕横穿全场，随后飞扑击倒；落地趴下',
        detail: '独奏 1.2 秒，六条弹幕从身后横穿全场各 26 伤害；随后扑向身前对手 60 伤害并击倒，落地后趴下 0.55 秒；可格挡，第五段破防',
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
export const PLAYABLE_BY_ID = new Map(PLAYABLE.map(c => [c.id, c]));
export const PUBLIC_ROSTER = PLAYABLE.filter(c => !c.hidden);

/** Roster members of a band, in roster order. `except` drops the caller from her own call (诗超绊). */
export function bandMembers(band: BandId, except?: string): CharacterData[] {
  return PUBLIC_ROSTER.filter(c => c.bands?.includes(band) && c.id !== except);
}

export const ROSTER_BY_ID = new Map(ROSTER.map(c => [c.id, c]));

/** People this cast can call who are not already standing there.
 *  诗超绊 borrows the rest of her band. 和姐姐在一起 names one roster id. */
export function guestsFor(characters: CharacterData[], allyBand: BandId): CharacterData[] {
  const have = new Set(characters.map(c => c.id));
  const out: CharacterData[] = [];
  const add = (c: CharacterData | undefined) => {
    if (!c || have.has(c.id)) return;
    have.add(c.id);
    out.push(c);
  };
  for (const c of characters) {
    for (const s of c.skills) {
      for (const op of s.onActive ?? []) {
        if (op.op !== 'summon') continue;
        if (op.kind === 'ally') for (const m of bandMembers(allyBand, c.id)) add(m);
        else if (op.kind === 'named') add(ROSTER_BY_ID.get(op.id));
      }
    }
  }
  return out;
}
