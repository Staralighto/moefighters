/* 角色短称：界面里放不下全名时用（横屏作战页的名册、导航站点的「灯 VS 爱音」）。
   规则：日本人名取「名」（家族名在前），按日文原名切分姓和名，不按字数截——「高松灯」是 高松 / 灯，不是 高 / 松灯。
   艺名、外文名、原创角色用本名全称。对照表和出处见 docs/character-short-names.md；新增角色必须补一行（npm run check 会拦）。 */

import type { CharacterData } from './types.ts';

export const SHORT_NAMES: Readonly<Record<string, string>> = {
  // Ave Mujica
  uika: '初华', mutsumi: '睦', umiri: '海铃', nyamu: '喵梦', sakiko: '祥子',
  // MyGO!!!!!
  tomori: '灯', anon: '爱音', rana: '乐奈', soyo: '素世', taki: '立希',
  // 梦限大MewType
  arale: '阿拉蕾', nonoka: '野乃花', ritsu: '律', miyako: '都子', yuno: '由乃',
  // Poppin'Party
  kasumi: '香澄', arisa: '有咲', tae: '多惠', saaya: '沙绫', rimi: '里美',
  // Roselia
  yukina: '友希那', sayo: '纱夜', lisa: '莉莎', ako: '亚子', rinko: '燐子',
  // Hello, Happy World!
  kokoro: '心', kaoru: '薰', hagumi: '育美', kanon: '花音', misaki: '美咲',
  // sumimi
  mana: '真奈',
  // Pastel*Palettes
  aya: '彩', hina: '日菜', eve: '伊芙', chisato: '千圣', maya: '麻弥',
  // Afterglow
  mitake: '兰', moca: '摩卡', himari: '绯玛丽', tomoe: '巴', tsugumi: '鸫',
  // RAISE A SUILEN（游戏里用艺名）
  layer: 'LAYER', chuchu: 'CHU²', masking: 'MASKING', lock: 'LOCK', pareo: 'PAREO',
  // Morfonica
  mashiro: '真白', toko: '透子', nanami: '七深', tsukushi: '筑紫', rui: '瑠唯',
  // millsage
  kanata: '奏多', hotaru: '萤', natsume: '枣', houka: '朋花', nagi: '凪', mahoro: '茉幌',
  // 一家Dumb Rock!
  raika: '蕾叶', miku: '心玖', shizuku: '宁月', chieri: '千樱梨', yomogi: '蓬咲',
  // 其他
  mizuho: '瑞穗', viola: '薇欧拉', bocchi: '一里', nijika: '虹夏', gale: '疾风', ember: '星火', boulder: '磐石',
};

/** 短称；表里没有（不该发生，selfcheck 会拦）时退回全名，绝不按字数截。 */
export function shortName(c: Pick<CharacterData, 'id' | 'name'>): string {
  return SHORT_NAMES[c.id] ?? c.name;
}
