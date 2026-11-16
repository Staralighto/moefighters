import { CAST_WATCHERS, SCRIPTS } from './scripts.ts';

/* 八幡海铃 — Ave Mujica 的贝斯手 Timoris（萌娘百科：贝斯雇佣兵、征信机器人、扫货时袋子挂满双臂如同光翼展开）。
   Visual-only hooks: no damage, timing, hitbox or status number changes here. Every picture is in
   render/umiriFx.ts. combat.ts imports this module once for the side effect; its own Object.assign of
   'milk' / 'bag' / 'ripple' / 'slam' merges on top of these. */

CAST_WATCHERS.push((g, f, _slot, skill) => {
  if (f.data.id !== 'umiri') return;
  // 扫货: golden wings open behind her, shopping bags fanned off both arms (the 光翼 scene).
  if (skill.fx === 'bag') g.effect('umiri-wings', f.x - f.facing * 6, f.y - 112, f.data.color, .65, { follow: f.id, ox: -f.facing * 6, oy: -112, dir: f.facing });
  // 信用: the lake-blue rush behind her.
  else if (skill.fx === 'slam') g.effect('umiri-rush', f.x, f.y, f.data.color, .62, { follow: f.id, dir: f.facing });
});

SCRIPTS['milk'] = Object.assign(SCRIPTS['milk'] ?? {}, { landFx: 'umiri-milk-land' });
SCRIPTS['bag'] = Object.assign(SCRIPTS['bag'] ?? {}, {
  landFx: 'umiri-bag-land',
  pulse(g, p) { g.effect('umiri-receipt', p.x, p.y, p.color, .7, { dir: Math.sign(p.vx) || 1 }); },
} satisfies Partial<import('./scripts.ts').MoveScript>);
