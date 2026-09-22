/* Headless rule check: runs the fixed-step engine without DOM or canvas. `npm run check`. */
import { FightGame } from '../src/game/game.ts';
import { hit } from '../src/game/combat.ts';
import { ROSTER } from '../src/data/characters.ts';
import { STAGES } from '../src/data/stages.ts';
import { STEP } from '../src/game/constants.ts';
import { clipFor, drumRow } from '../src/render/clips.ts';
import { mortisAfterimage } from '../src/render/fx.ts';
import { previewFighter } from '../src/game/fighter.ts';
import { checkSpriteGuard } from './sprite-guard.ts';

checkSpriteGuard();

const assert = {
  ok(v: unknown, msg: string) { if (!v) throw Error('FAIL: ' + msg); },
  equal(a: unknown, b: unknown, msg = '') { if (a !== b) throw Error(`FAIL: ${msg} expected ${String(b)} got ${String(a)}`); },
  deepEqual(a: unknown, b: unknown, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`FAIL: ${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); },
};

const silent = { play() {} };
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
function newGame(p1 = 0, p2 = 2, mode: 'cpu' | 'training' = 'cpu') {
  const g = new FightGame([ROSTER[p1], ROSTER[p2]], { mode, difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7) });
  run(g, 2.3);
  assert.equal(g.phase, 'fight', 'intro ends in fight');
  return g;
}
function run(g: FightGame, seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) g.step(STEP); }
/** Turn the CPU slot into a dummy human with no keys so the AI leaves it alone. */
function dummy(g: FightGame) { g.fighters[1].controller = 1; return g.fighters[1]; }

// light attack lands and builds energy
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  const hp = p2.hp, energy = p1.energy;
  g.keyDown('KeyJ'); run(g, .3);
  assert.ok(p2.hp < hp, 'light attack deals damage');
  assert.ok(p1.energy > energy, 'attacker gains energy on hit');
  assert.equal(p1.combo, 1);
}

// front block cuts damage, grab ignores it
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('ArrowDown'); run(g, .1);
  assert.ok(p2.blocking, 'holding block key blocks');
  const hp = p2.hp, guard = p2.guard;
  g.keyDown('KeyJ'); run(g, .3);
  assert.ok(hp - p2.hp < 10, `blocked light does chip damage, got ${hp - p2.hp}`);
  assert.ok(p2.guard < guard, 'block drains guard');
  run(g, .3);
  const hp2 = p2.hp;
  g.keyDown('KeyO'); run(g, .5); // 疾风 O = 缠抱摔 grab
  assert.ok(hp2 - p2.hp > 50, `grab ignores block, got ${hp2 - p2.hp}`);
  assert.ok(p2.knocked > 0 || p2.y < 443, 'grab knocks down');
}

// super needs 100 energy and spends it
{
  const g = newGame(); const [p1] = g.fighters; dummy(g);
  p1.energy = 50;
  assert.equal(g.canAttack(p1, 5), false, 'super locked below 100');
  p1.energy = 100;
  g.keyDown('KeyL'); run(g, .05);
  assert.ok(p1.attack?.skill.super, 'super started');
  assert.ok(p1.energy < 1, 'super spends energy (then trickles back at 2/s)');
}

// projectile travels and connects at range
{
  const g = newGame(1, 2); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 400; p2.facing = -1;
  const hp = p2.hp;
  g.keyDown('KeyU'); run(g, 1.5); // 星火 U = 火球
  assert.ok(p2.hp < hp, 'projectile hits at range');
}

// timeout resolves the round by health ratio
{
  const g = newGame(); const [, p2] = g.fighters; dummy(g);
  p2.hp -= 100; g.time = .05; run(g, .1);
  assert.equal(g.phase, 'roundend');
  assert.deepEqual(g.wins, [1, 0]);
  run(g, 2.5);
  assert.equal(g.round, 2, 'next round starts');
}

// two wins finish the match
{
  const g = newGame(); dummy(g);
  let ended = 0; g.options.onEnd = () => ended++;
  for (let r = 0; r < 2; r++) { run(g, 2.3); g.fighters[1].hp = 0; run(g, STEP); run(g, 2.5); }
  assert.equal(g.phase, 'finished');
  assert.equal(g.winnerTeam, 0);
  assert.equal(ended, 1);
}

// training: no clock, energy pinned, target heals
{
  const g = newGame(0, 2, 'training'); const [p1, p2] = g.fighters;
  p1.energy = 10; p2.hp = 500; run(g, 1);
  assert.equal(g.time, 60, 'training clock frozen');
  assert.equal(p1.energy, 100, 'training energy pinned');
  assert.ok(p2.hp > 500, 'training target regenerates');
}

// CPU fights back, and a player who faces it can hit it
{
  const g = newGame(); run(g, 20);
  assert.ok(g.totalHits[1] > 0, 'AI lands hits on an idle player');
  const [p1] = g.fighters;
  for (let i = 0; i < 15 * 120; i++) {
    const o = g.targetFor(p1);
    if (o) { g.keys.delete('KeyA'); g.keys.delete('KeyD'); g.keys.add(o.x > p1.x ? 'KeyD' : 'KeyA'); }
    if (i % 40 === 0) g.keyDown(['KeyJ', 'KeyU', 'KeyI'][(i / 40) % 3]);
    else if (i % 40 === 6) ['KeyJ', 'KeyU', 'KeyI'].forEach(k => g.keyUp(k));
    g.step(STEP);
  }
  assert.ok(g.totalHits[0] > 0, 'player lands hits on the CPU');
}

// pause freezes the sim
{
  const g = newGame(); const t = g.time;
  g.togglePause(true); run(g, 1);
  assert.equal(g.time, t, 'paused clock');
}

// air normals: J in the air reads the shared air skill; skills are grounded only
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 70; p2.facing = -1;
  g.keyDown('KeyW'); run(g, .15);
  assert.ok(g.airborne(p1), 'jumped');
  assert.equal(g.canAttack(p1, 2), false, 'no skills in the air');
  const hp = p2.hp;
  g.keyDown('KeyJ'); run(g, STEP);
  assert.ok(p1.attack?.skill.air, 'J in the air is the air normal');
  run(g, .3);
  assert.ok(p2.hp < hp, 'air light hits a grounded target');
}

// tapping S dodges backward through a grab
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  const x = p1.x, hp = p1.hp;
  g.keyDown('KeyS'); run(g, .05); g.keyUp('KeyS'); run(g, STEP);
  assert.ok(p1.dodge > 0, 'short tap starts a dodge');
  g.keyDown('Numpad4'); run(g, .6); // 磐石 U = 熊抱 grab
  assert.ok(p1.x < x - 60, `dodge moved back, ${x} -> ${p1.x}`);
  assert.equal(p1.hp, hp, 'grab whiffs on the dodging fighter');
  assert.ok(p1.dodgeCd > 0, 'dodge goes on cooldown');
}

// holding S still blocks, and releasing after a hold is not a dodge
{
  const g = newGame(2, 1); const [p1, p2] = g.fighters; dummy(g); // 磐石 vs 星火
  p2.x = p1.x + 300; p2.facing = -1;
  g.keyDown('KeyS'); run(g, .3);
  assert.ok(p1.blocking && p1.dodge === 0, 'holding S blocks, no dodge');
  const hp = p1.hp;
  g.keyDown('Numpad4'); run(g, 1.2); // 星火 U = 火球
  assert.ok(hp - p1.hp > 0 && hp - p1.hp < 10, `projectile chipped through block, got ${hp - p1.hp}`);
  g.keyUp('KeyS'); run(g, STEP);
  assert.equal(p1.dodge, 0, 'long hold release does not dodge');
}

// upper catches a jumper and knocks it down
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 70; p2.facing = -1;
  g.keyDown('ArrowUp'); run(g, .2);
  assert.ok(g.airborne(p2), 'target airborne');
  const hp = p2.hp;
  g.keyDown('KeyI'); run(g, .5); // 疾风 I = 旋风升龙
  assert.ok(p2.hp < hp, 'upper catches the jumper');
  assert.ok(p2.knocked > 0, 'upper knocks down');
}

// endure absorbs one strike during wind-up, then lands; a grab still breaks it
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('Numpad5'); run(g, .05); // 磐石 I = 磐石冲肩 endure
  const serial = p2.attack?.serial;
  assert.equal(p2.attack?.endure, 1, 'endure move armed');
  const hp2 = p2.hp, hp1 = p1.hp;
  g.keyDown('KeyJ'); run(g, .2);
  assert.ok(p2.hp < hp2, 'light attack still damages the armoured fighter');
  assert.equal(p2.attack?.serial, serial, 'endure move not interrupted');
  assert.equal(p2.attack?.endure, 0, 'one hit absorbed');
  run(g, .6);
  assert.ok(p1.hp < hp1, 'the endure strike then lands');
}
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('Numpad5'); run(g, .05);
  g.keyDown('KeyO'); run(g, .3); // 疾风 O = 缠抱摔
  assert.equal(p2.attack, null, 'grab interrupts the endure move');
  assert.ok(p2.knocked > 0, 'and knocks down');
}

// sweep out-ranges a heavy and knocks down, but only touches the ground
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 140; p2.facing = -1;
  const hp = p1.hp;
  g.keyDown('Numpad6'); run(g, .4); // 磐石 O = 地裂扫腿
  assert.ok(p1.hp < hp, 'sweep reaches past heavy range');
  assert.ok(p1.knocked > 0, 'sweep knocks down');
}
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 140; p2.facing = -1;
  g.keyDown('Numpad6'); g.keyDown('KeyW'); run(g, .4);
  assert.equal(p1.hp, ROSTER[0].hp, 'sweep misses an airborne target');
}

// launch floats the target and a light connects before it lands
{
  const g = newGame(1, 2); const [p1, p2] = g.fighters; dummy(g); // 星火 I = 焰柱上挑
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('KeyI'); run(g, .2);
  assert.ok(p2.vy < -300 && g.airborne(p2), 'launch floats the target');
  assert.equal(p2.knocked, 0, 'launch is a float, not a knockdown');
  const hp = p2.hp;
  run(g, .4);
  g.keyDown('KeyJ'); run(g, .2);
  assert.ok(p2.hp < hp, 'a light follows up before the target lands');
  assert.equal(p1.combo, 2, 'follow-up counts as a combo');
}

// sprite clip routing: loco / normals / air / special stay on the intended sheet
{
  const idle = clipFor(previewFighter(ROSTER[0], 0));
  assert.equal(idle.sheet, 'common', 'idle uses common sheet');
  assert.deepEqual([idle.col, idle.row], [0, 0], 'idle cell');
  const runner = previewFighter(ROSTER[0], 0);
  runner.walk = 1;
  const run0 = clipFor(runner);
  assert.deepEqual([run0.sheet, run0.col, run0.row], ['common', 1, 0], 'run0');
  runner.animTime = 1 / 8;
  assert.deepEqual([clipFor(runner).col, clipFor(runner).row], [2, 0], 'run1');
  runner.animTime = 2 / 8;
  assert.deepEqual([clipFor(runner).col, clipFor(runner).row], [3, 0], 'run2');
  runner.animTime = 3 / 8;
  assert.deepEqual([clipFor(runner).col, clipFor(runner).row], [4, 0], 'run3');
  const g = newGame(); dummy(g);
  g.keyDown('KeyJ'); run(g, STEP);
  const light = clipFor(g.fighters[0]);
  assert.equal(light.sheet, 'common', 'ground J uses common');
  assert.equal(light.row, 1, 'ground light on row 1');
  assert.ok(light.col >= 2 && light.col <= 4, 'light phase col');
}
{
  const g = newGame(); dummy(g);
  g.keyDown('KeyW'); run(g, .15);
  g.keyDown('KeyJ'); run(g, STEP);
  const air = clipFor(g.fighters[0]);
  assert.equal(air.sheet, 'common', 'air J uses common');
  assert.equal(air.row, 2, 'air light on row 2');
}
{
  const g = newGame(); dummy(g);
  g.keyDown('KeyU'); run(g, STEP);
  const galeU = clipFor(g.fighters[0]);
  assert.equal(galeU.sheet, 'special', 'gale U uses special');
  assert.equal(galeU.col, 0, 'U is column 0');
}
{
  const g = newGame(1, 2); dummy(g);
  g.keyDown('KeyU'); run(g, STEP);
  const emberU = clipFor(g.fighters[0]);
  assert.equal(emberU.sheet, 'special', 'ember U uses special');
  assert.equal(emberU.col, 0, 'U is column 0');
}

// sakiko: 轮舞 connects three times; 忘却奏鸣 puts a volley of notes in the air
{
  const sakiko = ROSTER.findIndex(c => c.id === 'sakiko');
  assert.ok(sakiko >= 0, 'sakiko is on the roster');
  const g = newGame(sakiko, 2); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 70; p2.facing = -1;
  g.keyDown('KeyI'); run(g, .8);
  assert.equal(p1.combo, 3, '轮舞 hits three times');
  p1.energy = 100; p2.x = p1.x + 520;
  g.keyDown('KeyL');
  let notes = 0;
  for (let i = 0; i < Math.round(1.1 / STEP); i++) { g.step(STEP); notes = Math.max(notes, g.projectiles.length); }
  assert.ok(notes >= 6, `忘却奏鸣 fires a volley, saw ${notes}`);
}

// mutsumi: three notes, a four-hit grab, and a cucumber that turns around once
{
  const mutsumi = ROSTER.findIndex(c => c.id === 'mutsumi');
  assert.ok(mutsumi >= 0, 'mutsumi is on the roster');
  const data = ROSTER[mutsumi];
  assert.equal(data.skills[4].count, 3, '三音 fires three');
  assert.equal(data.skills[5].type, 'grab', '墨缇丝 is a grab');
  assert.equal(data.skills[5].count, 4, '墨缇丝 hits four times');

  const notes = newGame(mutsumi, 2); dummy(notes);
  const [n1, n2] = notes.fighters;
  n2.x = n1.x + 640;
  notes.keyDown('KeyO');
  let volley = 0;
  for (let i = 0; i < Math.round(.8 / STEP); i++) { notes.step(STEP); volley = Math.max(volley, notes.projectiles.length); }
  assert.ok(volley >= 3, `三音 volley, saw ${volley}`);

  const g = newGame(mutsumi, 2); const [p1, p2] = g.fighters; dummy(g);
  p2.x = 80;
  g.keyDown('KeyU');
  run(g, .4);
  const shot = g.projectiles.find(p => p.fx === 'cucumber');
  if (!shot) throw Error('FAIL: 回旋黄瓜 spawns');
  const outbound = shot.vx;
  run(g, 1.3);
  assert.ok(shot.returned && shot.vx === -outbound, '回旋黄瓜 turns around once');

  const superGame = newGame(mutsumi, 2); const [s1, s2] = superGame.fighters; dummy(superGame);
  s1.energy = 100;
  s2.x = s1.x + 110; s2.facing = -1;
  superGame.keyDown('KeyL');
  run(superGame, 1.2);
  assert.equal(s1.combo, 4, '墨缇丝 hits four times');
  assert.deepEqual(mortisAfterimage(0.4), [1, 1], '墨缇丝 first hit keeps the previous pose');
  assert.deepEqual(mortisAfterimage(0.5), [2, 1], '墨缇丝 next hit swaps the ghost');
  assert.equal(mortisAfterimage(0.85), null, '墨缇丝 exit has no ghost');
}

// uika: wail scales with hp, the crawl misses a jump, the shove throws far
{
  const uika = ROSTER.findIndex(c => c.id === 'uika');
  assert.ok(uika >= 0, 'uika is on the roster');
  const FLOOR_Y = 443;

  const full = newGame(uika, 2); dummy(full);
  full.fighters[1].x = full.fighters[0].x + 700;
  full.keyDown('KeyI');
  let one = 0;
  for (let i = 0; i < Math.round(.9 / STEP); i++) { full.step(STEP); one = Math.max(one, full.projectiles.length); }
  assert.equal(one, 1, '满血悲鸣 fires one');

  const low = newGame(uika, 2); dummy(low);
  low.fighters[0].hp = 200;
  low.fighters[1].x = low.fighters[0].x + 700;
  low.keyDown('KeyI');
  let four = 0;
  for (let i = 0; i < Math.round(.9 / STEP); i++) { low.step(STEP); four = Math.max(four, low.projectiles.length); }
  assert.equal(four, 4, '残血悲鸣 fires four');

  const crawlSkill = ROSTER[uika].skills[2];
  assert.equal(crawlSkill.damage, 18, '爬行 damage');
  assert.equal(crawlSkill.cd, 1.2, '爬行 cooldown');

  const crawl = newGame(uika, 2); const [c1, c2] = crawl.fighters; dummy(crawl);
  c2.x = c1.x + 70; c2.facing = -1;
  const standHp = c2.hp;
  crawl.keyDown('KeyU'); run(crawl, .5);
  assert.ok(c2.hp < standHp, '爬行 hits a standing target');

  const hop = newGame(uika, 2); const [h1, h2] = hop.fighters; dummy(hop);
  h2.x = h1.x + 70; h2.facing = -1;
  const hopHp = h2.hp;
  hop.keyDown('KeyU');
  for (let i = 0; i < Math.round(.6 / STEP); i++) {
    h2.y = FLOOR_Y - 100; h2.vy = 0;
    hop.step(STEP);
  }
  assert.equal(h2.hp, hopHp, '爬行 misses a jump near the apex');

  const shove = newGame(uika, 2); const [s1, s2] = shove.fighters; dummy(shove);
  s1.energy = 100;
  s2.x = s1.x + 180; s2.facing = 1;
  const startX = s2.x;
  const startHp = s2.hp;
  shove.keyDown('KeyL');
  let peak = 0, minY = s2.y, maxX = s2.x, grabbed = -1, pauseY = FLOOR_Y, heldFacing = 0, ghosts = 0;
  for (let i = 0; i < Math.round(2.2 / STEP); i++) {
    shove.step(STEP);
    ghosts = Math.max(ghosts, shove.effects.filter(e => e.type === 'ghost' && e.tint === '#ffe7a8').length);
    if (grabbed < 0 && s2.hp < startHp) grabbed = i * STEP;
    const since = grabbed < 0 ? -1 : i * STEP - grabbed;
    if (since > .03 && since < .09) { pauseY = Math.min(pauseY, s2.y); heldFacing = s2.facing; }
    peak = Math.max(peak, Math.abs(s2.vx));
    minY = Math.min(minY, s2.y);
    maxX = Math.max(maxX, s2.x);
  }
  assert.ok(ghosts >= 2, `推落 leaves gold afterimages, saw ${ghosts}`);
  assert.equal(heldFacing, -1, '推落 turns them to face her');
  assert.ok(pauseY > FLOOR_Y - 15, `推落 pauses, feet at ${pauseY}`);
  assert.ok(s2.knocked > 0, '推落 knocks down');
  assert.ok(minY < FLOOR_Y - 60, `推落 throws up, feet at ${minY}`);
  assert.ok(maxX - startX > 200, `推落 travels, moved ${maxX - startX}`);
  const thrown = 3200 * Math.exp(-9 * STEP);
  assert.ok(Math.abs(peak - thrown) < 1, `推落 throws hard, saw ${peak}`);

  const whiff = newGame(uika, 2); const [w1] = whiff.fighters; dummy(whiff);
  w1.energy = 100;
  whiff.fighters[1].x = w1.x + 900;
  whiff.keyDown('KeyL');
  run(whiff, .5);
  assert.ok(w1.attack, '推落 whiff is still lunging');
  run(whiff, .7);
  assert.equal(w1.attack, null, '推落 whiff ends with the clip');
  whiff.keyDown('KeyJ');
  run(whiff, .12);
  assert.equal(w1.attack?.index, 0, '推落 whiff can act again');
}

// nyamu: spin kick launches, crescent reaches, the super shoves then rains notes
{
  const nyamu = ROSTER.findIndex(c => c.id === 'nyamu');
  assert.ok(nyamu >= 0, 'nyamu is on the roster');
  const data = ROSTER[nyamu];
  assert.equal(data.skills[2].type, 'launch', '回旋踢 launches');
  assert.ok(data.skills[4].range > 160, '月牙踢 reaches');
  assert.equal(data.skills[4].fx, 'arc-kick', '月牙踢 arc');
  assert.equal(data.skills[5].fx, 'drums', '满场 is the kit');
  assert.ok((data.skills[5].count ?? 0) >= 6, '满场 drops a volley');

  const g = newGame(nyamu, 2); const [p1, p2] = g.fighters; dummy(g);
  p1.energy = 100;
  p2.x = p1.x + 80; p2.facing = -1;
  const startX = p2.x;
  g.keyDown('KeyL');
  run(g, .2);
  assert.ok(p2.x > startX + 15, `满场 shoves, moved ${p2.x - startX}`);
  let span = 0;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    g.step(STEP);
    const notes = g.projectiles.filter(p => p.vy > 0);
    if (notes.length >= 2) span = Math.max(span, Math.max(...notes.map(p => p.x)) - Math.min(...notes.map(p => p.x)));
  }
  assert.ok(span > 400, `满场 notes span the stage, saw ${span}`);

  const beat = newGame(nyamu, 2); dummy(beat);
  beat.fighters[0].energy = 100;
  beat.fighters[1].invuln = 5;
  beat.keyDown('KeyL');
  let strikes = 0;
  let prev = -1;
  let waves = 0;
  let waveSeen = 0;
  const dur = data.skills[5].duration;
  for (let i = 0; i < Math.round(dur / STEP); i++) {
    beat.step(STEP);
    const row = beat.fighters[0].attack ? clipFor(beat.fighters[0]).row : prev;
    if (row === 1 && prev !== 1) strikes++;
    prev = row;
    const n = beat.effects.filter(e => e.type === 'drum-wave').length;
    if (n > waveSeen) waves += n - waveSeen;
    waveSeen = n;
  }
  assert.equal(strikes, 4, '满场 plays the drum loop four times');
  assert.equal(waves, 8, 'each hit puts a wave on both sides');
  assert.equal(drumRow(0, dur), 0, 'drum loop starts raised');
  assert.equal(drumRow(dur, dur), 2, 'drum loop ends on the return');
}

// umiri: lobbed milk, six bags, a ripple behind her, a super escape, a back slam
{
  const umiri = ROSTER.findIndex(c => c.id === 'umiri');
  assert.ok(umiri >= 0, 'umiri is on the roster');
  const data = ROSTER[umiri];
  assert.equal(data.skills[3].count, 6, '扫货 throws six');
  assert.equal(data.skills[4].fx, 'ripple', '恐湖 is the ripple');
  assert.equal(data.skills[5].fx, 'slam', '信用 is the slam');

  const close = newGame(umiri, 2); const [c1, c2] = close.fighters; dummy(close);
  c2.x = c1.x + 55; c2.facing = -1;
  const closeHp = c2.hp;
  close.keyDown('KeyU'); run(close, .3);
  assert.ok(c2.hp < closeHp, '报价 hits point-blank');

  const mid = newGame(umiri, 2); const [m1, m2] = mid.fighters; dummy(mid);
  m2.x = m1.x + 220; m2.facing = -1;
  const midHp = m2.hp;
  mid.keyDown('KeyU'); run(mid, 1.2);
  assert.equal(m2.hp, midHp, '报价 flies over the middle');
  const carton = mid.projectiles.find(p => p.fx === 'milk' && p.settled);
  if (!carton) throw Error('FAIL: 报价 lands as a pickup');
  const before = m1.energy;
  m1.x = carton.x;
  mid.step(STEP);
  assert.ok(m1.energy >= before + 26, 'picking up the milk restores 26 energy');

  const far = newGame(umiri, 2); const [f1, f2] = far.fighters; dummy(far);
  f2.x = f1.x + 480; f2.facing = -1;
  const farHp = f2.hp;
  far.keyDown('KeyU'); run(far, 1.1);
  assert.ok(f2.hp < farHp, '报价 hits on the way down');

  const bags = newGame(umiri, 2); const [b1, b2] = bags.fighters; dummy(bags);
  b2.x = b1.x + 55; b2.facing = -1;
  bags.keyDown('KeyI');
  run(bags, .8);
  assert.equal(b1.combo, 6, '扫货 connects all six up close');
  const whiff = newGame(umiri, 2); const [w1, w2] = whiff.fighters; dummy(whiff);
  w2.x = w1.x - 200;
  whiff.keyDown('KeyI'); run(whiff, 1.6);
  assert.equal(whiff.projectiles.filter(p => p.fx === 'bag').length, 0, 'bags vanish on landing');

  const behind = newGame(umiri, 2); const [r1, r2] = behind.fighters; dummy(behind);
  r2.x = r1.x - 180;
  const behindX = r2.x, behindHp = r2.hp;
  behind.keyDown('KeyO'); run(behind, .5);
  assert.ok(r2.hp < behindHp, '恐湖 hits behind her');
  assert.ok(r2.x < behindX - 40, `恐湖 knocks back, moved ${behindX - r2.x}`);

  const hop = newGame(umiri, 2); const [h1, h2] = hop.fighters; dummy(hop);
  h2.x = h1.x + 80; h2.y = 443 - 100;
  const hopHp = h2.hp;
  hop.keyDown('KeyO'); run(hop, .5);
  assert.equal(h2.hp, hopHp, '恐湖 misses a jump');

  const escape = newGame(umiri, 2); const [e1, e2] = escape.fighters; dummy(escape);
  e1.queue.push({ index: 4, ttl: .18 });
  hit(escape, e2, e1, e2.data.skills[5], { hit: new Set() });
  assert.equal(e1.hitBySuper, true, 'a super marks the combo');
  assert.equal(e1.queue[0]?.index, 4, '恐湖 stays buffered through a super');
  let escaped = false, invuln = 0;
  for (let i = 0; i < Math.round(.2 / STEP); i++) {
    escape.step(STEP);
    if (e1.attack?.skill.fx === 'ripple') { escaped = true; invuln = Math.max(invuln, e1.invuln); }
  }
  assert.ok(escaped, '恐湖 comes out during the super');
  assert.ok(invuln > .3, 'the escape is invulnerable');

  const down = newGame(umiri, 2); const [d1] = down.fighters; dummy(down);
  d1.stun = .4; d1.knocked = 1; d1.vy = 0; d1.hitBySuper = true;
  down.keyDown('KeyO'); down.step(STEP);
  assert.equal(d1.attack, null, '恐湖 does not escape a knockdown');

  const slam = newGame(umiri, 2); const [s1, s2] = slam.fighters; dummy(slam);
  s1.energy = 100;
  s2.x = s1.x + 70; s2.facing = -1;
  const slamHp = s2.hp;
  slam.keyDown('KeyL');
  let slammed = false;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    slam.step(STEP);
    if (slam.effects.some(e => e.type === 'slam')) slammed = true;
  }
  assert.ok(s2.hp < slamHp, '信用 deals damage');
  assert.ok(s2.x < s1.x, '信用 slams the other way');
  assert.ok(slammed, '信用 plays the impact');
}

// anon: long dash, tap vs held chord, homing, root broken by two hits, spin hits behind without an early launch
{
  const anon = ROSTER.findIndex(c => c.id === 'anon');
  assert.ok(anon >= 0, 'anon is on the roster');
  const data = ROSTER[anon];
  assert.equal(data.skills[3].count, 12, 'C和弦 caps at twelve');
  assert.equal(data.skills[5].count, 6, '不会再逃避了 swings six times');
  assert.equal(data.skills[5].fx, 'spin', 'the super is the guitar spin');

  const dash = newGame(anon, 2); const [d1, d2] = dash.fighters; dummy(dash);
  d2.x = 900; d2.invuln = 5;
  const x0 = d1.x;
  dash.keyDown('KeyU');
  run(dash, .5);
  assert.ok(d1.x - x0 > 400 && d1.x - x0 < 480, `羽丘跑女 crosses about half the stage, moved ${d1.x - x0}`);

  const tap = newGame(anon, 2); const [t1, t2] = tap.fighters; dummy(tap);
  t2.invuln = 5; t2.x = t1.x + 400;
  tap.keyDown('KeyI'); tap.keyUp('KeyI');
  let tapped = 0;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    tap.step(STEP);
    tapped = Math.max(tapped, t1.attack?.shots ?? tapped);
  }
  assert.equal(tapped, 3, 'a tap strums three notes');

  const held = newGame(anon, 2); const [h1, h2] = held.fighters; dummy(held);
  h2.invuln = 5; h2.x = h1.x + 400;
  held.keyDown('KeyI');
  let full = 0;
  for (let i = 0; i < Math.round(1.8 / STEP); i++) {
    held.step(STEP);
    full = Math.max(full, h1.attack?.shots ?? full);
  }
  held.keyUp('KeyI');
  assert.equal(full, 12, 'holding the key strums twelve notes');

  const home = newGame(anon, 2); const [n1, n2] = home.fighters; dummy(home);
  n2.invuln = 5; n2.x = n1.x - 220;
  home.keyDown('KeyI'); home.keyUp('KeyI');
  run(home, .3);
  const note = home.projectiles.find(p => p.fx === 'chord');
  assert.ok(note, 'C和弦 fires a note');
  run(home, .8);
  const turned = home.projectiles.find(p => p.fx === 'chord');
  assert.ok(turned && turned.vx < 0, `notes steer toward a target behind her, vx ${turned?.vx}`);

  const root = newGame(anon, 2); const [r1, r2] = root.fighters; dummy(root);
  r2.x = r1.x + 90; r2.facing = -1;
  root.keyDown('KeyO');
  run(root, .8);
  assert.ok(r2.root > 2, `爱音之光 roots, left ${r2.root}`);
  const locked = r2.x;
  root.keys.add('ArrowRight');
  run(root, .4);
  assert.ok(Math.abs(r2.x - locked) < 8, `rooted fighter stays put, moved ${r2.x - locked}`);
  hit(root, r1, r2, r1.data.skills[0], { hit: new Set() });
  assert.ok(r2.root > 0, 'the first extra hit keeps the root');
  hit(root, r1, r2, r1.data.skills[0], { hit: new Set() });
  assert.equal(r2.root, 0, 'the second extra hit clears the root');

  const spin = newGame(anon, 2); const [s1, s2] = spin.fighters; dummy(spin);
  s1.energy = 100;
  s2.x = s1.x - 70; s2.facing = 1;
  const spinHp = s2.hp;
  spin.keyDown('KeyL');
  let earlyKnock = 0;
  for (let i = 0; i < Math.round(2 / STEP); i++) {
    spin.step(STEP);
    if ((s1.attack?.t ?? 9) < .9) earlyKnock = Math.max(earlyKnock, s2.knocked);
  }
  assert.ok(s2.hp < spinHp - 60, `spin hits from behind, damage ${spinHp - s2.hp}`);
  assert.equal(earlyKnock, 0, 'early spins do not launch');
  assert.ok(s2.knocked > 0, 'the last spin launches');
}

console.log('selfcheck ok');
