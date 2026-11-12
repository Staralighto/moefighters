import type { Skill } from '../data/types.ts';
import { isInvulnerable, type Attack, type Fighter } from './fighter.ts';
import type { Effect, FightGame, Projectile } from './game.ts';
import { FLOOR, X_MAX, X_MIN, clamp } from './constants.ts';
import { attackHeld, foeAhead, hit, retainEscape, withFinale } from './combat.ts';
import { addMod, clearMod } from './mods.ts';
import { hasStatus } from './status.ts';
import { SCRIPTS, STEP_WATCHERS } from './scripts.ts';
import {
  BAKE, BAKE_DING, BAKE_LUNGE, BAKE_OVEN_AT, BAKE_PRESS, BAKE_PUSH, BAKE_PUSH_AT, BAKE_ROASTS, BAKE_ROAST_AT,
  BAKE_SPAN, BAKE_TAIL, BAKE_WHIFF, DOUGH_OUT, DOUGH_RISE, DOUGH_TOSS, FIRE, FIRE_MAX,
  FIRE_MOUTH, FIRE_REACH, FIRE_TAIL, FIRE_TICK, plumeAt, OVEN_GAP, OVEN_W, PAT, PAT_COUNT, PAT_GAP, PAT_LUNGE, PAT_TAIL,
} from '../render/clips.ts';

/* 山吹沙绫 — Poppin'Party 的鼓手。商店街「山吹烘焙坊」的看板娘、「面包圣女」，照顾弟妹的「PPP 的妈」（萌娘百科）。
   Four scripts, registered on SCRIPTS by fx name (combat.ts imports this module once for the side effect):
     saaya-pat    U 乖，摸摸头              a little step in, three pats on the head, and they nod off (定身, 'sleepy')
     saaya-dough  I 面团发酵中              a dough on the floor that rises and pops (a saaya-dough shot; fire bakes it early)
     saaya-fire   O 唐突喷火                a breath in, then fire out of her mouth while the key is held; 4 in a row 烧焦
     saaya-bake   L 山吹烘焙坊，营业中！    kneaded, rolled flat, pushed into the oven, 叮
   Shared numbers and the cell picks live in clips.ts, every picture in render/saayaFx.ts, the two status looks
   ('sleepy' 定身, 'saaya-toast' 烧焦 and the toasted look after the oven) in render/statusMarks.ts.
   Whatever belongs to a move while it runs (the cheeks, the fire, the warm light, the sign, the oven) is kept:
   the move refreshes a short life every tick, so a grab, a KO or the round ending lets it fade on its own.
   Nothing here is a closure on a body: the dough's state is on the shot, the fire's streak is a 'stoke' mod,
   the bake's squash a 'knead' mod whose `from` is the baker — a lockstep dump resumes all of them. */

const WARM = '#ffcf5a';
const DOUGH = '#fff1d6';
const FLOUR = '#fbf6ea';

/** Keep `type` on her this tick, creating it the first time; it lingers `life` seconds once nobody keeps it. */
function keepOn(g: FightGame, f: Fighter, a: Attack, type: string, color: string, life: number, radius?: number, attached = true): Effect {
  let e = g.effects.find(x => x.type === type && x.fighter === f.id);
  if (!e) e = g.effect(type, f.x, f.y, color, life, { follow: attached ? f.id : undefined, ox: 0, oy: 0, radius, fighter: f.id });
  if (e.life < life) { e.max += life - e.life; e.life = life; }
  e.dir = f.facing;
  e.age = a.t;
  return e;
}
/** Hit variants of a skill, built once per skill object and shared by every cast. */
function derive<T>(cache: WeakMap<Skill, T>, s: Skill, build: (s: Skill) => T): T {
  let v = cache.get(s);
  if (!v) cache.set(s, v = build(s));
  return v;
}
function headOf(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
/** Hold a body still where a move put it. */
function pin(o: Fighter, stun: number): void {
  o.vx = 0;
  o.vy = 0;
  o.knocked = 0;
  o.stun = Math.max(o.stun, stun);
}
/** A guard up and facing her: hit() still returns true for it, so the callers that pay off clean hits ask first. */
function guarding(f: Fighter, o: Fighter): boolean {
  return o.blocking && o.guard > 0 && o.facing === -(o.x >= f.x ? 1 : -1);
}

/* ---- U 乖，摸摸头 ---- */

/** She stands this close for the pats; a body higher than PAT_AIR off the floor is out of reach (a jump clears it). */
const PAT_REACH = 56;
const PAT_AIR = 60;
/** 乖，摸摸头 (「PPP 的妈」: 照顾弟妹、乐队里最稳的人): a little step in, one hand up — and three soft pats on the head,
 *  a warm dot on each. Nothing lands until the third: then they nod off (定身, the 'sleepy' look). A grab, so no
 *  guard holds it; a jump clears the reach. a.mode walks PAT; a.hold the patted body, a.tossAt the first pat. */
function step_pat(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? PAT.reach;
  if (mode === PAT.reach) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && o.y >= FLOOR - PAT_AIR && !isInvulnerable(o)) {
      f.x = clamp(o.x - f.facing * PAT_REACH, X_MIN, X_MAX);
      a.hold = o.id;
      a.tossAt = a.t;
      a.shots = 0;
      a.mode = PAT.pat;
      o.attack = null;
      retainEscape(o);
      pin(o, .35);
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 300) * dt, X_MIN, X_MAX);
    if (a.t >= s.start + PAT_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = PAT.done;
      a.t = Math.max(a.t, s.duration - PAT_TAIL);
    }
    return;
  }
  if (mode !== PAT.pat) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0) {
    a.mode = PAT.done;
    a.hold = -1;
    a.t = Math.max(a.t, s.duration - PAT_TAIL);
    return;
  }
  pin(o, .3);
  while (a.shots < PAT_COUNT && a.t >= a.tossAt + a.shots * PAT_GAP) {
    const i = a.shots++;
    const h = headOf(o);
    g.effect('saaya-pat', o.x, o.y - h - 4, WARM, .42, { follow: o.id, ox: 0, oy: -h - 4, n: i, dir: f.facing });
    if (i < PAT_COUNT - 1) continue;
    a.hit.clear();
    if (hit(g, f, o, s, a)) {
      if (o.root > 0 && o.rootFx === s.fx) {
        o.rootMark = 'sleepy';
        g.effect('sleepy@apply', o.x, o.y, f.data.color, .6, { follow: o.id, ox: 0, oy: 0 });
      }
      g.text('乖～', f.x, f.y - headOf(f) - 30, f.data.color, .8, 17);
    }
    a.mode = PAT.done;
    a.hold = -1;
    a.t = Math.max(a.t, s.duration - PAT_TAIL);
  }
}
SCRIPTS['saaya-pat'] = Object.assign(SCRIPTS['saaya-pat'] ?? {}, { update: step_pat, noMelee: true });

/* ---- I 面团发酵中 ---- */

/** The dough leaves her hands this high over the floor and arcs this much higher on the way. */
const DOUGH_HAND = 92;
const DOUGH_ARC = 56;
/** The pop reaches bodies this far past its radius and no higher than this off the floor (ground only). */
const DOUGH_SLACK = 26;
const DOUGH_AIR = 40;
/** 烤熟爆开: what the fire turns it into. */
const DOUGH_BAKED_GROW = 3;
/** Baked, it swells golden this long before it pops (render/saayaFx.ts BAKE_SWELL). */
const DOUGH_BAKE_POP = .18;
const bakedDough = new WeakMap<Skill, Skill>();
/** 面团发酵中 (萌娘百科别号「发酵少女」, PICO 卡名「発酵少女 沙綾」): kneaded in her hands, thrown low, and it sticks to
 *  the floor ahead of her. For DOUGH_RISE it rises (saayaFx draws the swell) — then 噗, flour and crumbs, and
 *  whoever stands on it is thrown up. Ground only (a jump clears it), blockable, one on the field (oneShot). If her
 *  fire touches it (唐突喷火), it bakes golden and goes off at once, harder and wider. */
function step_dough(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  if (a.t < s.start || a.shots) return;
  a.shots = 1;
  const x0 = f.x + f.facing * 26;
  const land = clamp(f.x + f.facing * DOUGH_OUT, X_MIN + 20, X_MAX - 20);
  g.projectiles.push({
    owner: f.id, x: x0, y: FLOOR - DOUGH_HAND, vx: (land - x0) / DOUGH_TOSS, vy: 0, life: DOUGH_TOSS + DOUGH_RISE + .05,
    skill: s, color: DOUGH, radius: 22, size: s.size ?? 90, fx: s.fx, attack: a, hit: new Set(), trail: [], age: 0, solid: false,
    aim: land, settled: false, wave: 0,
  });
}
/** 噗: the dough goes off. `wave` 1 is baked. */
function popDough(g: FightGame, p: Projectile): void {
  const baked = p.wave === 1;
  p.life = 0;
  const r = (p.size / 2) * (baked ? DOUGH_BAKED_GROW : 1);
  g.effect('saaya-pop', p.x, FLOOR, baked ? '#f2b544' : FLOUR, baked ? .8 : .65, { radius: r, hit: baked });
  g.shake = Math.max(g.shake, baked ? 7 : 4);
  const owner = g.fighterById(p.owner);
  if (!owner) return;
  const skill = baked ? derive(bakedDough, p.skill, k => ({ ...k, damage: k.damage * 2 })) : p.skill;
  for (const o of g.fighters) {
    if (!g.isEnemy(owner, o) || o.hp <= 0 || o.echo) continue;
    if (Math.abs(o.x - p.x) > r + DOUGH_SLACK || o.y < FLOOR - DOUGH_AIR) continue;
    hit(g, owner, o, skill, p, p.x);
  }
}
SCRIPTS['saaya-dough'] = Object.assign(SCRIPTS['saaya-dough'] ?? {}, {
  update: step_dough, noMelee: true, skipVolley: true, skipCount: true, oneShot: true, trail: 0,
  shot(g: FightGame, p: Projectile, dt: number): boolean {
    if (!p.settled) {
      const k = Math.min(1, p.age / DOUGH_TOSS);
      p.x += p.vx * dt;
      p.y = FLOOR - DOUGH_HAND * (1 - k) - DOUGH_ARC * 4 * k * (1 - k);
      if (k < 1) return true;
      p.settled = true;
      p.x = p.aim ?? p.x;
      p.y = FLOOR;
      p.vx = 0;
      g.effect('saaya-splat', p.x, FLOOR, FLOUR, .5, { radius: p.size / 2 });
      return true;
    }
    if (p.wave === 1 ? p.age >= (p.ticked ?? 0) + DOUGH_BAKE_POP : p.age >= DOUGH_TOSS + DOUGH_RISE) popDough(g, p);
    return true;
  },
});

/* ---- O 唐突喷火 ---- */

/** 4 clean ticks in a row on the same body 烧焦 it; the streak lapses if a tick goes by without one. */
const FIRE_BURN_AT = 4;
const FIRE_STREAK = FIRE_TICK * 2.2;
const FIRE_TICKS = Math.round(FIRE_MAX / FIRE_TICK);
const FIRE_MIN = .8;
const FIRE_HOLD_GATE = .25;
const FIRE_HOLD_CD = 8;
/** CPUs have no key: they breathe out this many ticks (rolled at the first). */
const CPU_TICKS = [5, 8] as const;
/** Once she stops, the plume shrinks back into her mouth over this long (saayaFx reads life / max). */
const FIRE_FADE = .2;
const coolFire = new WeakMap<Skill, Skill>();
const followFire = new WeakMap<Skill, Skill>();
/** The plume at `along` px in front of her mouth: its centre height and half-height, in world y (clips.ts plumeAt;
 *  the flame tongues on its edge reach a little past the half-height). */
function coneAt(f: Fighter, along: number): { cy: number; half: number } {
  const sc = headOf(f) / 181;
  const { dy, half } = plumeAt(along / (FIRE_REACH * sc), FIRE_REACH * sc);
  return { cy: f.y - FIRE_MOUTH.y * sc + dy, half: half * 1.12 + 6 };
}
/** One breath of fire: every body the cone touches, and her own dough if it lies in it. */
function fireTick(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  const sc = headOf(f) / 181;
  const mx = f.x + f.facing * FIRE_MOUTH.x * sc;
  const tag = String(f.id);
  const pulse = a.shots === 1 ? s : derive(followFire, s, k => ({ ...k, damage: 8 }));
  const plain = derive(coolFire, pulse, k => ({ ...k, status: undefined }));
  a.hit.clear();
  for (const o of g.fighters) {
    if (!g.isEnemy(f, o) || o.hp <= 0 || o.echo) continue;
    const along = (o.x - mx) * f.facing;
    if (along < -24 || along > FIRE_REACH + 24) continue;
    const { cy, half } = coneAt(f, along);
    if (o.y - headOf(o) > cy + half || o.y < cy - half) continue;
    const clean = !guarding(f, o) && !isInvulnerable(o);
    const streak = o.mods.find(m => m.kind === 'stoke' && m.left > 0 && m.from === f.id);
    const n = clean ? (streak?.v ?? 0) + 1 : 0;
    // Only the 4th in a row (and on) carries the 烧焦.
    const skill = n >= FIRE_BURN_AT ? pulse : plain;
    if (!hit(g, f, o, skill, a, mx)) continue;
    if (clean) addMod(o, 'stoke', FIRE_STREAK, { v: n, from: f.id, tag });
    else clearMod(o, 'stoke', tag);
  }
  for (const p of g.projectiles) {
    if (p.fx !== 'saaya-dough' || p.owner !== f.id || p.life <= 0 || !p.settled || p.wave === 1) continue;
    const along = (p.x - mx) * f.facing;
    if (along < -10 || along > FIRE_REACH + 30) continue;
    const { cy, half } = coneAt(f, along);
    // The dough stands up to about 35 px; the flames lick a little below the cone's edge.
    if (cy + half < FLOOR - 60) continue;
    p.wave = 1;
    p.ticked = p.age;
    // Its life must outlast the swell.
    p.life = Math.max(p.life, DOUGH_BAKE_POP + .05);
    g.text('烤熟了！', p.x, FLOOR - 90, '#ffd25a', .7, 16);
  }
}
/** 唐突喷火 (PICO 里在 live 上唐突喷火; B 站「在 live 上唐突喷火的山吹沙绫」、评论区「为了给家里省烤面包的燃料才学会喷火术」):
 *  a deep breath, cheeks puffed — then she leans in and fire pours out of her mouth for as long as the key is down,
 *  at most FIRE_MAX, a tick every FIRE_TICK; a little stage pyro goes off at her feet as it starts. She stands
 *  still while she breathes fire; a guard holds it. Four ticks in a row on the same body 烧焦 it in the
 *  'saaya-toast' look; a dough in the cone bakes and pops. It ends in a puff of black smoke and a smoke ring.
 *  a.mode walks FIRE; a.tossAt the first tick; a.burst the CPU's tick count; a.anchor latches tap (-1) or hold (1). */
function step_fire(g: FightGame, f: Fighter, a: Attack): void {
  const s = a.skill;
  a.emitted = true;
  f.vx = 0;
  if (a.mode === undefined) {
    a.mode = FIRE.breathe;
    a.anchor = 0;
  }
  if (!a.anchor) {
    if (f.controller !== null && !attackHeld(g, f)) a.anchor = -1;
    else if (a.t >= FIRE_HOLD_GATE) {
      a.anchor = 1;
      // Upgrade once without restarting the cooldown already running from cast.
      f.cooldowns[a.index] += (FIRE_HOLD_CD - s.cd) * f.cdMul;
    }
  }
  if (a.mode === FIRE.breathe) {
    keepOn(g, f, a, 'saaya-puff', '#ffb9a8', .1, headOf(f));
    if (a.t < s.start) return;
    a.mode = FIRE.fire;
    a.tossAt = a.t;
    a.shots = 0;
    if (f.controller === null) a.burst = CPU_TICKS[0] + Math.floor(g.random() * (CPU_TICKS[1] - CPU_TICKS[0] + 1));
    for (const side of [-1, 1]) g.effect('saaya-pyro', f.x + side * 34, FLOOR, '#ffe27a', .5, { dir: side, n: side > 0 ? 1 : 0 });
  }
  if (a.mode !== FIRE.fire) return;
  const el = a.t - a.tossAt;
  const fire = keepOn(g, f, a, 'saaya-fire', '#ffb43a', FIRE_FADE, headOf(f));
  fire.age = el;
  while (a.shots < FIRE_TICKS && el >= a.shots * FIRE_TICK - 1e-9) {
    a.shots++;
    fireTick(g, f, a);
    g.shake = Math.max(g.shake, 1.6);
  }
  const held = f.controller === null ? a.shots < a.burst : attackHeld(g, f);
  if (el + 1e-9 >= FIRE_MAX || (el + 1e-9 >= FIRE_MIN && (a.anchor !== 1 || !held))) {
    a.mode = FIRE.done;
    a.t = Math.max(a.t, s.duration - FIRE_TAIL);
    const sc = headOf(f) / 181;
    g.effect('saaya-smoke', f.x, f.y, '#2a2624', .9, { follow: f.id, ox: 0, oy: 0, dir: f.facing, radius: headOf(f), tx: FIRE_MOUTH.x * sc, ty: -FIRE_MOUTH.y * sc });
  }
}
SCRIPTS['saaya-fire'] = Object.assign(SCRIPTS['saaya-fire'] ?? {}, { update: step_fire, noMelee: true, skipVolley: true, skipCount: true });

/* ---- L 山吹烘焙坊，营业中！ ---- */

/** She kneads from this close; a body higher than BAKE_AIR is out of reach (a jump clears the lunge). */
const BAKE_REACH = 70;
const BAKE_AIR = 60;
const BAKE_PRESS_DMG = 12;
const BAKE_ROAST_DMG = 12;
/** 「回炉加热」: a body already 烧焦 when caught takes this much more from the whole bake. */
const BAKE_HOT = 1.25;
/** How long the oven, the sign and the warm light take to go once the move lets go of them. */
const OVEN_LINGER = .35;
const SIGN_LINGER = .3;
const WARM_LINGER = .35;
/** The toasted look on the way out of the oven (a look only, no burn). */
const TOAST_LOOK = 1.6;
type BakeParts = { press: Skill; roast: Skill; ding: Skill };
const bakeParts = new WeakMap<Skill, { cold: BakeParts; hot: BakeParts }>();
function partsOf(s: Skill, hot: boolean): BakeParts {
  const both = derive(bakeParts, s, k => {
    const build = (mul: number): BakeParts => {
      const ding = withFinale(k, true);
      return {
        // Quiet: the body is already held (pinned every tick), so the presses and the roast do not count into the
        // combo and 叮 lands at full weight.
        press: { ...k, finale: undefined, damage: Math.round(BAKE_PRESS_DMG * mul), knock: 0, react: { kind: 'none' } },
        roast: { ...k, finale: undefined, damage: Math.round(BAKE_ROAST_DMG * mul), knock: 0, noSparks: true, react: { kind: 'none' } },
        ding: { ...ding, damage: Math.round(ding.damage * mul) },
      };
    };
    return { cold: build(1), hot: build(BAKE_HOT) };
  });
  return hot ? both.hot : both.cold;
}
function letGo(o: Fighter | undefined): void {
  if (o) clearMod(o, 'knead');
}
function bakeDone(a: Attack, tail: number): void {
  a.mode = BAKE.done;
  a.hold = -1;
  a.t = Math.max(a.t, a.skill.duration - tail);
}
/** 山吹烘焙坊，营业中！ (自家面包店「山吹烘焙坊」, 别号「面包圣女」; 萌娘百科题头「用擀面杖代替鼓棒？」): she dashes in and
 *  catches them, the light goes warm and the shop's sign comes up behind her. Three presses of both palms knead them
 *  (squashed and springing back, flour flying), the third rolls them flat; the brick oven slides in from behind
 *  them, she pushes them in, the fire roars in its mouth — 叮 — and they pop back out toasted and knocked down.
 *  Already 烧焦 when caught: everything hits BAKE_HOT harder (回炉加热). A grab (no guard holds it); a jump clears
 *  the lunge; a miss leaves her open. a.mode walks BAKE; a.hold the body; a.tossAt the catch; a.anchor the oven;
 *  a.burst 1 when hot. The squash is the 'knead' mod on the body (render/clips.ts kneadSquash). */
function step_bake(g: FightGame, f: Fighter, a: Attack, dt: number): void {
  const s = a.skill;
  const mode = a.mode ?? BAKE.lunge;
  if (mode === BAKE.lunge) {
    if (a.t < s.start) return;
    const o = foeAhead(g, f, s.range);
    if (o && o.y >= FLOOR - BAKE_AIR && !isInvulnerable(o) && !o.mods.some(m => m.kind === 'knead' && m.left > 0)) {
      a.hold = o.id;
      a.tossAt = a.t;
      a.shots = 0;
      a.burst = hasStatus(o, 'burn') ? 1 : 0;
      a.mode = BAKE.bake;
      a.anchor = clamp(o.x + f.facing * OVEN_GAP, X_MIN + OVEN_W * .3, X_MAX - OVEN_W * .3);
      o.attack = null;
      retainEscape(o, true);
      pin(o, .4);
      addMod(o, 'knead', BAKE_SPAN, { from: f.id });
      f.x = clamp(o.x - f.facing * BAKE_REACH, X_MIN, X_MAX);
      g.hitstop = Math.max(g.hitstop, .05);
      if (a.burst) g.text('回炉加热！', o.x, o.y - headOf(o) - 30, '#ffb04a', .8, 17);
      return;
    }
    f.x = clamp(f.x + f.facing * (s.speed ?? 520) * dt, X_MIN, X_MAX);
    if (a.t >= s.start + BAKE_LUNGE || f.x <= X_MIN || f.x >= X_MAX) {
      a.mode = BAKE.whiff;
      a.t = Math.max(a.t, s.duration - BAKE_WHIFF);
    }
    return;
  }
  if (mode === BAKE.whiff || mode === BAKE.done) return;
  const o = g.fighterById(a.hold);
  if (!o || o.hp <= 0) { letGo(o); bakeDone(a, BAKE_TAIL); return; }
  const el = a.t - a.tossAt;
  // The warm light and the sign stay up while she bakes; the oven from the moment it slides in.
  keepOn(g, f, a, 'saaya-warm', WARM, WARM_LINGER, undefined, false).age = el;
  const sign = keepOn(g, f, a, 'saaya-sign', '#8a5a32', SIGN_LINGER, undefined, false);
  sign.x = f.x - f.facing * 78;
  sign.y = FLOOR;
  sign.age = el;
  if (el >= BAKE_OVEN_AT) {
    const oven = keepOn(g, f, a, 'saaya-oven', '#b5654a', OVEN_LINGER, undefined, false);
    oven.x = a.anchor;
    oven.y = FLOOR;
    oven.age = el - BAKE_OVEN_AT;
    // The mouth faces her; tx is the roast clock (negative until the fire is lit).
    oven.dir = -f.facing;
    oven.tx = el - BAKE_ROAST_AT;
  }
  const seat = clamp(f.x + f.facing * BAKE_REACH, X_MIN, X_MAX);
  if (el < BAKE_PUSH_AT) o.x = seat;
  else {
    // Pushed in: from where she kneaded them to the oven's middle (the oven is drawn over them).
    const k = Math.min(1, (el - BAKE_PUSH_AT) / BAKE_PUSH);
    o.x = seat + (a.anchor - seat) * (1 - (1 - k) ** 2);
  }
  o.y = FLOOR;
  o.facing = (-f.facing) as 1 | -1;
  pin(o, .4);
  const parts = partsOf(s, a.burst === 1);
  while (a.shots < BAKE_PRESS.length && el >= BAKE_PRESS[a.shots]) {
    a.shots++;
    a.hit.clear();
    if (!hit(g, f, o, parts.press, a)) { letGo(o); bakeDone(a, BAKE_TAIL); return; }
    g.effect('saaya-flour', o.x, FLOOR - 26, FLOUR, .55, { radius: 46, n: a.shots, hit: a.shots === BAKE_PRESS.length });
    g.shake = Math.max(g.shake, 3);
  }
  while (a.shots >= BAKE_PRESS.length && a.shots < BAKE_PRESS.length + BAKE_ROASTS.length && el >= BAKE_ROAST_AT + BAKE_ROASTS[a.shots - BAKE_PRESS.length]) {
    a.shots++;
    a.hit.clear();
    if (!hit(g, f, o, parts.roast, a)) { letGo(o); bakeDone(a, BAKE_TAIL); return; }
    g.shake = Math.max(g.shake, 2);
  }
  if (el < BAKE_DING) return;
  // 叮: out of the oven's mouth, toasted.
  letGo(o);
  o.x = clamp(a.anchor - f.facing * OVEN_W * .42, X_MIN, X_MAX);
  a.hit.clear();
  const landed = hit(g, f, o, parts.ding, a, a.anchor);
  if (landed) addMod(o, 'look', TOAST_LOOK, { mark: 'saaya-toast' });
  g.text('叮！', a.anchor, FLOOR - 170, '#fff2b0', .8, 24);
  g.effect('saaya-ding', o.x, FLOOR - 50, '#ffd25a', .9, { dir: -f.facing, radius: 70, hit: landed });
  g.flash = Math.max(g.flash, .1);
  g.shake = Math.max(g.shake, 8);
  g.hitstop = Math.max(g.hitstop, .06);
  bakeDone(a, BAKE_TAIL);
}
SCRIPTS['saaya-bake'] = Object.assign(SCRIPTS['saaya-bake'] ?? {}, {
  update: step_bake, noMelee: true, skipCount: true,
  placesHold: [BAKE.bake],
});

/** A body left kneaded by a bake that is no longer running (she was hit, KO'd, the round reset) springs back. */
STEP_WATCHERS.push((g, f) => {
  const m = f.mods.find(x => x.kind === 'knead' && x.left > 0);
  if (!m) return;
  const baker = m.from != null ? g.fighterById(m.from) : undefined;
  const a = baker?.attack;
  if (!baker || baker.hp <= 0 || !a || a.skill.fx !== 'saaya-bake' || a.hold !== f.id) clearMod(f, 'knead');
});
