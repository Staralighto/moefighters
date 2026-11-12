import type { Skill } from '../data/types.ts';
import { dropForm, isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame } from './game.ts';
import { FLOOR, H, W, X_MAX, X_MIN, clamp } from './constants.ts';
import { hit } from './combat.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import { clearMod, has } from './mods.ts';
import {
  BIKE_SEAT_X, BIKE_W, LOCK_BANG_HIT, LOCK_BAND_COLORS, LOCK_HOP, LOCK_LIVE, LOCK_LIVE_BANGS, LOCK_LIVE_BOW,
  LOCK_LIVE_SCREAM, LOCK_LIVE_STAR, LOCK_RIDE,
} from '../render/clips.ts';

/* LOCK（朝日六花）— RAS 的主音吉他。平时是戴眼镜、扎花发圈、礼貌到对谁都叫「先辈」的弱气打工妹；
   摘下眼镜和发圈（萌娘百科：「能力限制器」）就是吉他狂战士。Scripts registered on SCRIPTS by fx name
   (combat.ts imports this module once for the side effect):
     lock-unseal   U 限制器解除      glasses off, the scrunchie off, the costume: the king form (stage.png)
     lock-reseal   U（演出服）戴回眼镜  the form ends now
     lock-hush     I 给我安静听着     a shout ahead that leaves them 沉默 (the 'hush' look)
     lock-roar     I（演出服）         the same shout on the K cells of the stage sheet: wider, and it knocks back
     lock-rescue   O 护六出动        she hops back; MASKING rides the 死亡银河号 past her into whoever was after her
     lock-live     L 少女乐团大时代   the scream, Galaxy's lights, five headbangs, the star; glasses back on, a bow
   The costume is the king sheet plus `frenzy.skills` (characters.ts): while it is up, every key draws from
   common cells, so the stage outfit never needs a second special sheet. Every picture is render/lockFx.ts. */

const LIME = '#AAEE22';
const MASKING_GOLD = '#EEBB44';

/** Seconds a kept effect outlives the last tick that kept it (the same trick as masking.ts keepOn). */
const KEEP = .12;
function keepOn(g: FightGame, f: Fighter, a: Attack, type: string, color: string, life = KEEP, x = f.x, y = f.y): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, x, y, color, life, { fighter: f.id });
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  e.dir = f.facing;
  e.age = a.t;
  return e;
}
function* foes(g: FightGame, f: Fighter): Generator<Fighter> {
  for (const o of g.fighters) if (g.isEnemy(f, o) && o.hp > 0 && !o.echo) yield o;
}

/* ---- 不同意我就不回去 (第二次试音): knocked down, she gets up and comes back harder ---- */

/** Seconds after a knockdown during which 限制器解除 runs longer. */
export const LOCK_COMEBACK = 3;
/** Extra seconds of costume for the comeback, and the wider shove it opens with. */
export const LOCK_COMEBACK_TIME = 3;
STEP_WATCHERS.push((_g, f) => {
  if (f.knocked <= 0 || f.data.frenzy?.skills?.[2]?.fx !== 'lock-reseal') return;
  let m = f.mods.find(m => m.kind === 'comeback');
  if (!m) f.mods.push(m = { kind: 'comeback', left: 0 });
  m.left = LOCK_COMEBACK;
});
export function lockComeback(f: Fighter): boolean {
  return has(f, 'comeback');
}

/* ---- U 限制器解除 / 戴回眼镜 ---- */

const UNSEAL_R = 150;
const UNSEAL_R_COMEBACK = 200;
/** At the throw: the costume goes on (frenzy clock + king sheet) and a ring shoves the near ones back. */
function unseal(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const comeback = lockComeback(f);
  f.frenzy = (f.data.frenzy?.time ?? 8) + (comeback ? LOCK_COMEBACK_TIME : 0);
  f.king = true;
  f.jabChain = 0;
  clearMod(f, 'comeback');
  const r = comeback ? UNSEAL_R_COMEBACK : UNSEAL_R;
  for (const o of foes(g, f)) if (Math.abs(o.x - f.x) <= r && Math.abs(o.y - f.y) < 160) hit(g, f, o, s, a);
  g.effect('lock-unseal', f.x, f.y, LIME, 1, { follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: r, hit: comeback });
  g.text(comeback ? '不同意我就不回去！' : '限制器，解除！', f.x, f.y - 220, LIME, 1, comeback ? 20 : 19);
  g.flash = Math.max(g.flash, .12);
  g.shake = Math.max(g.shake, comeback ? 8 : 5);
}
SCRIPTS['lock-unseal'] = { emit: unseal };

/** Back into street clothes at the flash; the recast wait starts (fighter.ts dropForm). */
function reseal(g: FightGame, f: Fighter): void {
  dropForm(f);
  g.effect('lock-reseal', f.x, f.y, LIME, .7, { follow: f.id, ox: 0, oy: 0, dir: f.facing });
}
SCRIPTS['lock-reseal'] = { emit: reseal };

/* ---- I 给我安静听着 (第三季: 最没自信的她在台上对着起哄的观众吼回去) ---- */

/** The shout leaves her mouth here (body px above the feet); the graphic and the stock melee share it. */
const MOUTH = 146;
function shout(roar: boolean) {
  return (g: FightGame, f: Fighter, a: Attack) => {
    g.effect('lock-shout', f.x + f.facing * 22, f.y - MOUTH, LIME, roar ? .6 : .5, {
      dir: f.facing, radius: a.skill.range, heavy: roar, hit: a.hit.size > 0,
    });
    if (roar) g.shake = Math.max(g.shake, 6);
  };
}
SCRIPTS['lock-hush'] = { flash: shout(false) };
SCRIPTS['lock-roar'] = { flash: shout(true) };

/* ---- O 护六出动 (B 站「护六狂魔 mas王」: 谁欺负六花，MASKING 就揍谁) ---- */

const HOP_BACK = 110;
const HOP_HIGH = 46;
/** a.mode: 0 the hop, 1 the ride, 2 gone. a.anchor is where the bike is (it does not ride on her). */
function step_rescue(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? 0;
  if (a.t < LOCK_HOP) {
    // A scared little hop backwards, out of reach for its first half.
    if (a.shots === 0) { a.shots = 1; a.anchor = f.x; f.invuln = Math.max(f.invuln, LOCK_HOP * .6); }
    const k = a.t / LOCK_HOP;
    f.x = clamp(f.x - f.facing * HOP_BACK * dt / LOCK_HOP, X_MIN, X_MAX);
    f.y = FLOOR - HOP_HIGH * Math.sin(Math.PI * k);
    f.vx = 0;
    f.vy = 0;
  } else if (f.y !== FLOOR) f.y = FLOOR;
  if (mode === 0 && a.t >= s.start) {
    a.mode = 1;
    a.tossAt = a.t;
    a.anchor = clamp(f.x - f.facing * LOCK_RIDE.back, X_MIN - 260, X_MAX + 260);
    g.text('谁敢欺负LOCK！', f.x, f.y - 230, MASKING_GOLD, 1, 19);
    g.audio.play('engine', f.id);
  }
  if (a.mode !== 1) return;
  const x = a.anchor + f.facing * LOCK_RIDE.speed * (a.t - a.tossAt);
  const ride = keepOn(g, f, a, 'lock-rescue-ride', MASKING_GOLD, KEEP, x, FLOOR);
  ride.x = x;
  ride.y = FLOOR;
  // The red tail light and the dust are MASKING's own (render/maskingFx.ts).
  const bucket = Math.floor(a.t * 30);
  if (bucket !== Math.floor((a.t - dt) * 30)) {
    g.effect('masking-tail', x + f.facing * (BIKE_SEAT_X - BIKE_W * .46), FLOOR - 52, '#ff2a3a', .26, { dir: f.facing });
    if (bucket % 2 === 0) g.effect('masking-dust', x - f.facing * (BIKE_W * .4), FLOOR, '#d9cbb4', .4, { dir: f.facing, radius: 12 });
  }
  for (const o of foes(g, f)) {
    if (a.hit.has(o.id) || Math.abs(o.x - x) > LOCK_RIDE.reach || o.y < FLOOR - 96) continue;
    if (hit(g, f, o, s, a, x - f.facing * 60)) {
      g.effect('masking-clip', o.x, o.y - 70, MASKING_GOLD, .3, { dir: f.facing, radius: 44 });
      g.shake = Math.max(g.shake, 6);
    }
  }
  const gone = (x - f.x) * f.facing > 0 && (x < X_MIN - 200 || x > X_MAX + 200);
  if (gone || a.t >= a.tossAt + LOCK_RIDE.time) a.mode = 2;
}
SCRIPTS['lock-rescue'] = { update: step_rescue, noMelee: true };

/* ---- L 少女乐团大时代 ---- */

const liveParts = new WeakMap<Skill, { scream: Skill; bang: Skill; star: Skill }>();
function liveOf(s: Skill): { scream: Skill; bang: Skill; star: Skill } {
  let parts = liveParts.get(s);
  if (!parts) {
    parts = {
      // The scream holds them for the whole set; the bangs do not count into the combo.
      scream: { ...s, finale: undefined, damage: 15, knock: 0, react: { kind: 'stand', stun: 2.1 } },
      bang: { ...s, finale: undefined, damage: 16, knock: 0, react: { kind: 'none' } },
      star: { ...s, ...s.finale, finale: undefined },
    };
    liveParts.set(s, parts);
  }
  return parts;
}
/** Reach of the headbang waves ahead of her; the scream is the whole stage. */
const BANG_REACH = 640;
const DIM_FADE = .35;
/** Cast in costume, the glasses are already off: skip the intro. */
function cast_live(_g: FightGame, f: Fighter): void {
  if (f.king && f.attack) f.attack.t = LOCK_LIVE.intro;
}
/** a.shots counts what has gone off: 1 the scream, 2..6 the bangs, 7 the star, 8 the bow. */
function step_live(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const parts = liveOf(s);
  const t = a.t;
  // The intro from street clothes: the glasses go up in a flash, the same picture as 限制器解除.
  if (t >= LOCK_LIVE.intro * .55 && t < LOCK_LIVE.intro && !a.liftAt) {
    a.liftAt = t;
    g.effect('lock-unseal', f.x, f.y, LIME, .8, { follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: 120 });
  }
  if (t < LOCK_LIVE_BOW) {
    f.invuln = Math.max(f.invuln, .05);
    keepOn(g, f, a, 'lock-dim', '#05040a', DIM_FADE, W / 2, H / 2);
    if (t >= LOCK_LIVE_SCREAM) keepOn(g, f, a, 'lock-galaxy', LIME, DIM_FADE, W / 2, H / 2);
  }
  if (a.shots === 0 && t >= LOCK_LIVE_SCREAM) {
    a.shots = 1;
    a.hit.clear();
    for (const o of foes(g, f)) hit(g, f, o, parts.scream, a);
    g.effect('lock-scream', f.x + f.facing * 24, f.y - MOUTH, LIME, LOCK_LIVE.scream + .5, { dir: f.facing, radius: 900 });
    g.flash = Math.max(g.flash, .16);
    g.shake = Math.max(g.shake, 12);
    g.audio.play('super', f.id);
  }
  // Five headbangs: each comes down on the beat and sends a wave in one band's colour.
  while (a.shots >= 1 && a.shots <= LOCK_LIVE.bangs && t >= LOCK_LIVE_BANGS + (a.shots - 1 + LOCK_BANG_HIT) * LOCK_LIVE.bang) {
    const i = a.shots - 1;
    a.shots++;
    a.hit.clear();
    for (const o of foes(g, f)) {
      if ((o.x - f.x) * f.facing < -60 || Math.abs(o.x - f.x) > BANG_REACH) continue;
      if (hit(g, f, o, parts.bang, a)) o.stun = Math.max(o.stun, .45);
    }
    g.effect('lock-bang', f.x + f.facing * 40, f.y - 110, LOCK_BAND_COLORS[i], .55, { dir: f.facing, radius: BANG_REACH, n: i });
    g.shake = Math.max(g.shake, 5 + i);
  }
  if (a.shots === LOCK_LIVE.bangs + 1 && t >= LOCK_LIVE_STAR) {
    a.shots++;
    a.hit.clear();
    let landed = false;
    for (const o of foes(g, f)) {
      if ((o.x - f.x) * f.facing < -60 || Math.abs(o.x - f.x) > BANG_REACH || isInvulnerable(o)) continue;
      if (hit(g, f, o, parts.star, a)) landed = true;
    }
    const foe = g.nearestEnemyTo(f, f.x);
    const sx = foe && Math.abs(foe.x - f.x) <= BANG_REACH ? foe.x : f.x + f.facing * 220;
    g.effect('lock-star', clamp(sx, X_MIN, X_MAX), FLOOR - 110, '#FF5522', 1.1, { dir: f.facing, radius: 170, hit: landed });
    g.flash = Math.max(g.flash, landed ? .2 : .1);
    g.shake = Math.max(g.shake, landed ? 14 : 8);
    g.audio.play('slam', f.id);
  }
  if (a.shots === LOCK_LIVE.bangs + 2 && t >= LOCK_LIVE_BOW) {
    // Glasses back on, a bow to whoever is lying there. The costume comes off with them.
    a.shots++;
    dropForm(f);
    g.effect('lock-reseal', f.x, f.y, LIME, .7, { follow: f.id, ox: 0, oy: 0, dir: f.facing });
    g.text('辛苦了！', f.x, f.y - 210, '#ffffff', .9, 18);
  }
}
SCRIPTS['lock-live'] = { update: step_live, cast: cast_live, noMelee: true, skipCount: true };
