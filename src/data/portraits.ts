/* 全身立绘（快切 ui/ultCut.ts、开打过场 ui/versusCut.ts 用）。

   文件管理：
   · 素材/fighter-portraits/<id>/<id>-vN.png …… 制作稿：每轮版本、绿底源图、提示词、验收记录都留在这里（本地，不进游戏）。
   · 素材/fighter-portraits/INDEX.md ………………… 最终交付表，唯一来源：每个角色 ID 当前用哪一版。
   · public/portraits/<id>.webp …………………………… 游戏资源，文件名只有角色 ID、没有版本号；由脚本生成，不手放。
   · src/data/portraits.gen.ts ……………………………… 脚本生成的清单：版本、指纹（URL 的 ?v=，换图后缓存自动失效）、自动估计的脸位置。
   · 本文件 ……………………………………………………………………… 手写部分：脸位置的人工修正（FACE_FIX）和查询函数。
   换图 / 加新角色：改交付表 → npm run portraits → 看 素材/fighter-portraits/_check/faces.png 的粉圈是否落在脸上，
   不准的在下面 FACE_FIX 里写正确值。交付表里没有的角色返回 null，两处界面各自退回无立绘的样子。

   规格（docs/fighter-portrait-sop-v1.md）：2:3 透明图，人物占画高 85–90%，脚底大约在 93%。
   face 是脸中心在整张图里的比例坐标（0–1），快切按它对位，VS 过场按它居中。 */
import { PORTRAITS } from './portraits.gen.ts';

export interface Portrait {
  src: string;
  id: string;
  face: { x: number; y: number };
}

/** 自动估计不准的脸位置（戴高帽、玩偶头这类轮廓最上沿不是头顶的）。 */
const FACE_FIX: Record<string, readonly [number, number]> = {
  tensora: [.58, .415],
  kokoro: [.70, .267],
  kaoru: [.48, .21],
  hagumi: [.49, .255],
  kanon: [.49, .245],
  misaki: [.55, .255],
  nagi: [.77, .199],
  raika: [.478, .187],
  nijika: [.498, .232],
  kita: [.484, .184],
  ryo: [.495, .179],
  nina: [.521, .168],
  momoka: [.477, .204],
  subaru: [.545, .192],
  tomo: [.534, .187],
};

export function portraitOf(characterId: string): Portrait | null {
  const p = PORTRAITS[characterId];
  if (!p) return null;
  const [x, y] = FACE_FIX[characterId] ?? p.face;
  return { src: `/portraits/${characterId}.webp?v=${p.h}`, id: characterId, face: { x, y } };
}
