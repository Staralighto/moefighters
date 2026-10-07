/* Headless rule check: runs the fixed-step engine without DOM or canvas. `npm run check`. */
import { FightGame } from '../src/game/game.ts';
import { drumShotTime, hit, violetHidden } from '../src/game/combat.ts';
import { vowBeatTime, VOW_BEATS } from '../src/render/clips.ts';
import { SHEET_SCALE } from '../src/render/proportions.ts';
import { PLAYABLE, ROSTER, bandMembers } from '../src/data/characters.ts';
import { BANDS, BAND_BY_ID } from '../src/data/bands.ts';
import { AIR_SKILLS, skill } from '../src/data/skills.ts';
import { STAGES } from '../src/data/stages.ts';
import { FLOOR, COMBO_DECAY, STEP, X_MAX, X_MIN } from '../src/game/constants.ts';
import { clipFor, drumRow } from '../src/render/clips.ts';
import { RIB_OX, SKEWER_OX, STEAK_OX } from '../src/render/ritsuSheet.ts';
import { kujiFlash, KUJI, KUJI_STEP, mortisAfterimage, sealSwell } from '../src/render/fx.ts';
import { previewFighter, gainEnergy } from '../src/game/fighter.ts';
import { addMod, clearMod, jumpMul, speedMul } from '../src/game/mods.ts';
import { easeLoad, imageSources, nextSrc } from '../src/assets/loader.ts';
import { isTouchJump, matchStickTouch, stickFingerGone, thumbBandTop, touchRelease } from '../src/game/input.ts';
import { battleFrame } from '../src/ui/battleFrame.ts';
import { TOUCH_LAYOUT } from '../src/ui/touchLayout.data.ts';
import { DEFAULT_ULT_ICON, ultIcon } from '../src/ui/touchIcons.ts';
import { assignSlotWho, guideIndex, skillHTML, stageCover } from '../src/ui/select.ts';
import { POOL, aggregatePicks, bestLabel, drawThree, readBest, rollEnemies, stageSetup } from '../src/ui/challenge.ts';
import { checkSpriteGuard } from './sprite-guard.ts';

/* `npm run check` runs this file through node's type stripping: no bundler, and no @types/node to type
   `import 'node:fs'` with. `process.getBuiltinModule` reaches the same builtin without an import. */
declare const process: { getBuiltinModule(name: 'fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { recursive: true }): string[];
} };
const readFileSync = process.getBuiltinModule('fs').readFileSync;

checkSpriteGuard();

const assert = {
  ok(v: unknown, msg: string) { if (!v) throw Error('FAIL: ' + msg); },
  equal(a: unknown, b: unknown, msg = '') { if (a !== b) throw Error(`FAIL: ${msg} expected ${String(b)} got ${String(a)}`); },
  deepEqual(a: unknown, b: unknown, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`FAIL: ${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); },
};

const silent = { play() {} };
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
/** Roster position by id. Checks pick subjects by id, so reordering ROSTER (band order) cannot
 *  silently swap the characters a test drills on. */
function at(id: string): number {
  const i = ROSTER.findIndex(c => c.id === id);
  if (i < 0) throw Error('FAIL: ' + id + ' is on the roster');
  return i;
}
function newGame(p1 = at('gale'), p2 = at('boulder'), mode: 'cpu' | 'training' = 'cpu') {
  const g = new FightGame([ROSTER[p1], ROSTER[p2]], { mode, difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7) });
  run(g, 2.3);
  assert.equal(g.phase, 'fight', 'intro ends in fight');
  return g;
}
function run(g: FightGame, seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) g.step(STEP); }
/** Turn the CPU slot into a dummy human with no keys so the AI leaves it alone. */
function dummy(g: FightGame) { g.fighters[1].controller = 1; return g.fighters[1]; }

// band registry: ids resolve, no orphan bands, dual affiliation and the sing's bandmate pool hold
{
  for (const c of ROSTER) for (const b of c.bands ?? []) {
    assert.ok(BAND_BY_ID.has(b), c.id + ': band ' + b + ' is registered');
  }
  for (const b of BANDS) {
    assert.ok(ROSTER.some(c => c.bands?.includes(b.id)), 'band ' + b.id + ' has at least one member');
  }
  // Primary bands run down the roster in the display order (bands.ts): Ave Mujica > MyGO!!!!!
  // > 夢限大みゅーたいぷ > franchise debut order > sumimi > the bandless.
  const runs: string[] = [];
  for (const c of ROSTER) {
    const g = c.bands?.[0] ?? 'none';
    if (runs[runs.length - 1] !== g) runs.push(g);
  }
  assert.deepEqual(runs, ['ave-mujica', 'mygo', 'yumemita', 'poppin-party', 'roselia', 'hello-happy', 'sumimi', 'pastel-palettes', 'afterglow', 'none'], 'roster order is the select-screen band order');
  assert.deepEqual(ROSTER[at('uika')].bands, ['ave-mujica', 'sumimi'], '初华 sings for two units');
  assert.deepEqual(bandMembers('mygo', 'tomori').map(c => c.id), ['anon', 'rana', 'soyo', 'taki'], 'the sing calls her bandmates, never herself');
  for (const id of ['gale', 'ember', 'boulder']) {
    assert.ok(!PLAYABLE.some(c => c.id === id), id + ' stays off the select screen');
  }
  assert.ok(PLAYABLE.some(c => c.id === 'viola'), 'viola plays without a band');
}

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

// blocking a projectile siphons the attacker's energy in proportion to the shot, silently
{
  const g = newGame(at('ember'), at('boulder')); const [p1, p2] = g.fighters; dummy(g); // 星火 U = 火球
  p2.x = p1.x + 300; p2.facing = -1;
  g.keyDown('ArrowDown'); run(g, .1);
  p1.energy = 50;
  const before = p1.energy;
  g.keyDown('KeyU'); run(g, 1.1);
  assert.ok(p2.guard < 100, 'the fireball is blocked');
  // 42 damage: +4 block reward and ~2/s regen against a 12.6 drain, so the net is clearly negative
  assert.ok(p1.energy < before - 5, `blocked projectile drains energy, saw ${p1.energy}`);
  assert.ok(g.texts.every(t => !/气|能量|削减/.test(t.text)), 'the drain shows no text');
}

// blocking melee does not touch the attacker's energy
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('ArrowDown'); run(g, .1);
  p1.energy = 50;
  const before = p1.energy;
  g.keyDown('KeyJ'); run(g, .4);
  assert.ok(p2.guard < 100, 'melee is blocked');
  assert.ok(p1.energy >= before, 'blocking melee does not drain energy');
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

// a pricier super caps the meter at its own cost, and the cast spends exactly the bar
{
  const anon = ROSTER.findIndex(c => c.id === 'anon');
  assert.ok(anon >= 0, 'anon is on the roster');
  assert.equal(ROSTER[anon].skills[5].cost, 130, '爱音 pays 130');
  const g = newGame(anon, at('boulder')); const [p1] = g.fighters; dummy(g);
  assert.equal(p1.energyMax, 130, 'the meter caps at the super cost');
  p1.energy = 129;
  assert.equal(g.canAttack(p1, 5), false, 'the super stays locked below its own cost');
  gainEnergy(p1, 5);
  assert.equal(p1.energy, 130, 'gains clamp at the cap');
  g.keyDown('KeyL'); run(g, .05);
  assert.ok(p1.attack?.skill.super, 'the expensive super starts');
  assert.ok(p1.energy < 1, 'the cast spends the bar');
}

// projectile travels and connects at range
{
  const g = newGame(at('ember'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
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

// both slots CPU: nobody holds a pad, and both sides still walk in
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], {
    mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(11),
    controllers: [null, null],
  });
  assert.equal(g.fighters[0].controller, null, 'left slot is CPU');
  assert.equal(g.fighters[1].controller, null, 'right slot is CPU');
  run(g, 4);
  assert.ok(g.fighters[0].x > 290, `left CPU walked, x=${g.fighters[0].x}`);
  assert.ok(g.fighters[1].x < 670, `right CPU walked, x=${g.fighters[1].x}`);
}

// master reads a startup the standard CPU ignores, because the bodies are outside the active-threat range
{
  const opts = { mode: 'cpu' as const, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null] as (number | null)[] };
  function windup(difficulty: number) {
    const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], { ...opts, difficulty });
    g.phase = 'fight';
    const [human, cpu] = g.fighters;
    human.x = 400; cpu.x = 570;
    assert.ok(g.attack(human, 2), 'skill starts');
    const a = human.attack!;
    assert.ok(a.t < a.skill.start && Math.abs(human.x - cpu.x) > a.skill.range + 35, 'still winding up, outside the normal threat bubble');
    cpu.ai.wait = 0;
    g.step(STEP);
    return cpu;
  }
  const standard = windup(1);
  assert.equal(standard.dodge, 0, 'standard does not read the startup');
  assert.equal(standard.ai.block, 0, 'standard does not block the startup');
  const master = windup(2);
  assert.equal(master.dodge > 0 || master.ai.block > 0, true, 'master reads the startup');
}

// standard/master spend the first free frame. Easy still owes the reaction tax after hitstun.
{
  const opts = { mode: 'cpu' as const, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null] as (number | null)[] };
  function bank(difficulty: number) {
    const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], { ...opts, difficulty });
    g.phase = 'fight';
    const cpu = g.fighters[1];
    cpu.stun = .3;
    cpu.ai.wait = .4;
    g.step(STEP);
    return cpu.ai.wait;
  }
  assert.ok(bank(0) > 0, 'easy keeps waiting through hitstun');
  assert.equal(bank(2), 0, 'master banks the wakeup frame');
}

// a recovering swing is a jab, not an invincible super
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], {
    mode: 'cpu', difficulty: 2, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null],
  });
  g.phase = 'fight';
  const [human, cpu] = g.fighters;
  human.x = 400; cpu.x = 490;
  assert.ok(g.attack(human, 0), 'human swings');
  const a = human.attack!;
  a.t = a.skill.start + .05;
  a.emitted = true;
  cpu.ai.wait = 0;
  cpu.energy = cpu.energyMax;
  g.step(STEP);
  assert.equal(cpu.attack?.index, 0, 'master jabs the recovery');
}

// pinned to the left wall, the way out is a jump toward center, not a back-dodge into the wall
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], {
    mode: 'cpu', difficulty: 2, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null],
  });
  g.phase = 'fight';
  const [human, cpu] = g.fighters;
  cpu.x = X_MIN; human.x = 220;
  cpu.ai.wait = 0;
  g.step(STEP);
  assert.ok(cpu.vy < 0, 'cornered master jumps');
  assert.equal(cpu.ai.move, 1, 'the jump travels toward center');
  assert.equal(cpu.dodge, 0, 'no back-dodge into the wall');
}

// a full super bar in the corner still jumps; the zoning super waits behind that
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], {
    mode: 'cpu', difficulty: 2, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null],
  });
  g.phase = 'fight';
  const [human, cpu] = g.fighters;
  cpu.x = X_MIN; human.x = 220;
  cpu.energy = cpu.energyMax;
  cpu.ai.wait = 0;
  g.step(STEP);
  assert.ok(cpu.vy < 0, 'meter does not replace the corner jump');
  assert.ok(cpu.attack?.index !== 5, 'the zoning super stays unspent');
}

// low hp with nobody swinging still allows a far, safe super (the blast is not a panic button)
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('viola')]], {
    mode: 'cpu', difficulty: 2, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null],
  });
  g.phase = 'fight';
  const [human, cpu] = g.fighters;
  human.x = 100; cpu.x = 500;
  cpu.hp = 100;
  cpu.energy = cpu.energyMax;
  cpu.ai.wait = 0;
  g.step(STEP);
  assert.equal(cpu.attack?.index, 5, 'hurt viola still fuga from outside the blast');
}

// under a live swing, a close super whose invuln covers startup comes out; a point-blank self-blast does not
{
  const opts = { mode: 'cpu' as const, difficulty: 2, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null] as (number | null)[] };
  function press(cpuId: string) {
    const g = new FightGame([ROSTER[at('ember')], ROSTER[at(cpuId)]], { ...opts });
    g.phase = 'fight';
    const [human, cpu] = g.fighters;
    human.x = 400; cpu.x = 500;
    cpu.energy = cpu.energyMax;
    cpu.ai.wait = 0;
    assert.ok(g.attack(human, 0), 'human is swinging');
    g.step(STEP);
    return cpu;
  }
  assert.equal(press('gale').attack?.index, 5, 'gale supers through pressure');
  assert.equal(press('ritsu').attack?.index, 5, 'ritsu opens the heal buff under pressure');
  assert.ok(press('viola').attack?.index !== 5, 'viola does not fuga at point blank');
}
{
  const g = new FightGame([ROSTER[at('ember')], ROSTER[at('ritsu')]], {
    mode: 'cpu', difficulty: 2, stage: STAGES[0], audio: silent, random: () => 0, controllers: [0, null],
  });
  g.phase = 'fight';
  const [human, cpu] = g.fighters;
  human.x = 400; cpu.x = 500;
  cpu.energy = cpu.energyMax;
  cpu.feast = 2;
  cpu.ai.wait = 0;
  assert.ok(g.attack(human, 0), 'human is swinging');
  g.step(STEP);
  assert.ok(cpu.attack?.index !== 5, 'an already-running feast is not recast');
}

// 2v2: ally takes no damage, one enemy down keeps the round, a wipe scores
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')], ROSTER[at('boulder')], ROSTER[at('sakiko')]], {
    mode: 'team', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7),
  });
  const [p1, ally, e1, e2] = g.fighters;
  assert.equal(p1.team, 0);
  assert.equal(ally.team, 0);
  assert.equal(e1.team, 1);
  assert.equal(e2.team, 1);
  assert.equal(p1.controller, 0);
  assert.equal(ally.controller, null);
  assert.ok(ally.x < p1.x && p1.x < e1.x && e1.x < e2.x, 'teams spawn on opposite sides');
  for (const f of g.fighters) if (f !== p1) f.controller = 1;
  run(g, 2.3);
  assert.equal(g.phase, 'fight');
  const allyHp = ally.hp;
  assert.equal(hit(g, p1, ally, p1.data.skills[0], { hit: new Set() }), false, 'ally is not an enemy');
  assert.equal(ally.hp, allyHp, 'friendly hit deals no damage');
  p1.x = ally.x = 300;
  e1.x = e2.x = 700;
  run(g, STEP);
  assert.equal(p1.x, 300, 'teammates do not push each other');
  assert.equal(ally.x, 300, 'ally keeps the shared spot');
  assert.equal(e1.x, 700);
  assert.equal(e2.x, 700, 'enemy pair does not push each other');
  e1.x = 310;
  run(g, STEP);
  assert.ok(Math.abs(e1.x - p1.x) > 10, 'opponents still keep a gap');
  e1.hp = 0;
  run(g, STEP);
  assert.equal(g.phase, 'fight', 'one enemy down does not end the round');
  e2.hp = 0;
  run(g, STEP);
  assert.equal(g.phase, 'roundend');
  assert.deepEqual(g.wins, [1, 0]);
}

// challenge: solo human vs a master CPU pair on the right, single round decides, buffs arm
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')], ROSTER[at('boulder')]], {
    mode: 'challenge', difficulty: 2, stage: STAGES[0], audio: silent, random: rng(7),
    controllers: [0, null, null], roundsToWin: 1,
    mods: [{ baseDamage: 2, damage: 2.2, regen: .03 }, {}, {}],
  });
  const [p1, e1, e2] = g.fighters;
  e1.controller = 1; // dummy both CPUs so the stage stays scripted
  e2.controller = 1;
  assert.equal(p1.team, 0, 'the challenge solo is team 0');
  assert.equal(e1.team, 1, 'the challenge pair shares team 1');
  assert.equal(e2.team, 1);
  assert.equal(p1.controller, 0, 'the solo slot is the human');
  assert.ok(p1.x < e1.x && e1.x < e2.x, 'solo spawns left, CPU pair right');
  assert.equal(g.roundsToWin, 1, 'challenge is single round');
  assert.equal(p1.dmgMul, 2.2, 'damage buff armed');
  assert.equal(p1.baseDmgMul, 2, 'the mode base damage boost armed');
  assert.equal(p1.regen, .03, 'regen buff armed');
  assert.equal(e1.dmgMul, 1, 'enemies stay neutral');
  assert.equal(e1.baseDmgMul, 1, 'enemies stay neutral');
  assert.equal(e1.regen, 0, 'enemies stay neutral');
  run(g, 2.3);
  assert.equal(g.phase, 'fight', 'challenge intro ends in fight');

  p1.hp = 500;
  run(g, 1);
  assert.ok(Math.abs(p1.hp - 530) < .5, `regen heals 3% of max per second, hp ${p1.hp}`);
  p1.hp = 999;
  run(g, 1);
  assert.equal(p1.hp, 1000, 'regen stops at max health');

  const skill = p1.data.skills[0];
  p1.combo = 0; p1.comboTime = 0; p1.dmgMul = 1; p1.baseDmgMul = 1;
  const baseBefore = e2.hp;
  assert.equal(hit(g, p1, e2, skill, { hit: new Set() }), true, 'the hit connects');
  const base = baseBefore - e2.hp;
  p1.combo = 0; p1.comboTime = 0; p1.dmgMul = 2.2;
  const boostedBefore = e2.hp;
  hit(g, p1, e2, skill, { hit: new Set() });
  const boosted = boostedBefore - e2.hp;
  assert.ok(Math.abs(boosted - base * 2.2) < 1, `dmgMul multiplies final damage, ${base} -> ${boosted}`);
  // the mode's base boost is its own factor: (1+1) * (1+.2) = 2.4, not 1+1+.2 = 2.2
  p1.combo = 0; p1.comboTime = 0; p1.baseDmgMul = 2; p1.dmgMul = 1.2;
  const stackedBefore = e2.hp;
  hit(g, p1, e2, skill, { hit: new Set() });
  const stacked = stackedBefore - e2.hp;
  assert.ok(Math.abs(stacked - base * 2.4) < 1, `baseDamage multiplies deck buffs, ${base} -> ${stacked}`);
  run(g, .1); // drain the hit hitstop so the next step can actually reach the round check

  e1.hp = 0;
  run(g, STEP);
  assert.equal(g.phase, 'fight', 'one CPU down does not end the stage');
  e2.hp = 0;
  run(g, STEP);
  assert.equal(g.phase, 'roundend', 'wiping the pair ends the stage');
  let ended = 0;
  g.options.onEnd = () => ended++;
  run(g, 2.5);
  assert.equal(g.phase, 'finished', 'a single round finishes the challenge stage');
  assert.equal(g.winnerTeam, 0);
  assert.equal(ended, 1);
}

// challenge module: the shown foes join the stage, per-kind setup shape, growth, 99+ label
{
  const [a, b] = rollEnemies(2);
  assert.ok(a !== b, 'the two rolled enemies are distinct');
  assert.equal(rollEnemies(1).length, 1, '闯关 rolls a single foe');
  const setup = stageSetup('brawl', ROSTER[at('gale')], [], 1, [ROSTER[at('ember')], ROSTER[at('boulder')]], STAGES[0]);
  assert.equal(setup.characters.length, 3, 'a brawl stage fields the player plus two enemies');
  assert.equal(setup.characters[0].hp, ROSTER[at('gale')].hp * 2, 'brawl doubles base health');
  assert.equal(setup.characters[1].id, ROSTER[at('ember')].id, 'the pair shown before the fight joins the stage');
  assert.equal(setup.characters[2].id, ROSTER[at('boulder')].id, 'the pair shown before the fight joins the stage');
  assert.equal(setup.characters[1].hp, ROSTER[at('ember')].hp, 'stage 1 enemies are ungrown');
  assert.equal(setup.difficulty, 2, 'challenge locks master');
  assert.deepEqual(setup.controllers, [0, null, null], 'solo human, CPU pair');
  assert.deepEqual(setup.mods, [{ baseDamage: 2 }, {}, {}], 'no picks keeps the pair neutral, the player carries only the mode base boost');
  assert.equal(setup.stageNumber, 1, 'the first stage is stage 1');
  const grown2 = stageSetup('brawl', ROSTER[at('gale')], [], 2, [ROSTER[at('ember')], ROSTER[at('boulder')]], STAGES[0]);
  assert.equal(grown2.characters[1].hp, Math.round(ROSTER[at('ember')].hp * 1.05), 'stage 2 enemies gain one step of health');
  assert.ok(Math.abs(grown2.mods![1].damage! - 1.03) < 1e-9, 'stage 2 enemies gain one step of damage');
  const grown3 = stageSetup('brawl', ROSTER[at('gale')], [], 3, [ROSTER[at('ember')], ROSTER[at('boulder')]], STAGES[0]);
  assert.equal(grown3.characters[1].hp, Math.round(ROSTER[at('ember')].hp * 1.1), 'enemy growth stacks linearly per stage');
  assert.ok(Math.abs(grown3.mods![2].damage! - 1.06) < 1e-9, 'enemy damage growth stacks linearly per stage');
  const lifebuoy = stageSetup('brawl', ROSTER[at('gale')], ['lifebuoy', 'lifebuoy'], 2, [ROSTER[at('ember')], ROSTER[at('boulder')]], STAGES[0]);
  assert.equal(lifebuoy.characters[0].hp, Math.round(ROSTER[at('gale')].hp * 2 * 1.08), 'lifebuoy stacks onto the doubled health');
  const lifebuoyMax = stageSetup('brawl', ROSTER[at('gale')], Array(7).fill('lifebuoy'), 2, [ROSTER[at('ember')], ROSTER[at('boulder')]], STAGES[0]);
  assert.equal(lifebuoyMax.characters[0].hp, Math.round(ROSTER[at('gale')].hp * 2 * 1.2), 'lifebuoy stops stacking at its cap');
  assert.equal(stageSetup('brawl', ROSTER[at('gale')], [], 2, [ROSTER[at('ember')], ROSTER[at('boulder')]], STAGES[0]).stageNumber, 2);
  const solo = stageSetup('climb', ROSTER[at('gale')], ['burn', 'lifebuoy'], 2, [ROSTER[at('ember')]], STAGES[0]);
  assert.equal(solo.characters.length, 2, 'a climb stage fields the player plus one enemy');
  assert.deepEqual(solo.controllers, [0, null], 'climb is a plain 1v1');
  assert.equal(solo.characters[0].hp, Math.round(ROSTER[at('gale')].hp * 1.04), 'climb skips the doubled anchor, lifebuoy still stacks');
  assert.ok(Math.abs((solo.mods![0].damage ?? 1) - 1.05) < 1e-9, 'climb arms no base damage boost, only the deck');
  assert.equal(solo.characters[1].hp, Math.round(ROSTER[at('ember')].hp * 1.05), 'climb enemies grow per stage too');
  assert.ok(Math.abs(solo.mods![1].damage! - 1.03) < 1e-9, 'climb enemy growth rides the same mods slot');
  const solo1 = stageSetup('climb', ROSTER[at('gale')], [], 1, [ROSTER[at('ember')]], STAGES[0]);
  assert.equal(solo1.characters[0].hp, ROSTER[at('gale')].hp, 'climb stage 1 is raw values both ways');
  assert.deepEqual(solo1.mods, [{}, {}], 'climb stage 1 is raw values both ways');
  assert.equal(bestLabel(0), '0');
  assert.equal(bestLabel(99), '99');
  assert.equal(bestLabel(100), '99+');
  assert.equal(readBest('brawl'), 0, 'headless reads no cookie');
  assert.equal(readBest('climb'), 0, 'headless reads no cookie');
}

// card pool: fifteen unique ids, three-card draws that skip capped cards, caps priced per stage
{
  assert.equal(POOL.length, 15, 'the pool fields fifteen cards');
  assert.equal(new Set(POOL.map(c => c.id)).size, POOL.length, 'pool ids are unique');
  assert.ok(POOL.every(c => Number.isInteger(c.cap) && c.cap >= 1), 'every card declares a stack cap');
  for (let i = 0; i < 40; i++) {
    const three = drawThree();
    assert.equal(new Set(three).size, 3, 'a draw deals three distinct cards');
    assert.ok(three.every(id => POOL.some(c => c.id === id)), 'draws come from the pool');
  }
  const capped = POOL.flatMap(c => Array<string>(c.cap).fill(c.id));
  assert.ok(drawThree(capped).every(id => POOL.some(c => c.id === id)), 'the all-capped fallback still deals from the pool');
  assert.deepEqual(drawThree(capped.slice(0, -1)), ['human'], 'with one card left under its cap, the deal is just that card');
  const m = aggregatePicks([
    ...Array(6).fill('burn'),
    ...Array(6).fill('okay'),
    ...Array(4).fill('sparkle'),
    ...Array(4).fill('band'),
    ...Array(6).fill('again'),
    ...Array(4).fill('latent'),
    ...Array(4).fill('dare'),
    ...Array(4).fill('fall'),
    ...Array(4).fill('ultimatum'),
    ...Array(6).fill('protect'),
    ...Array(6).fill('vain'),
    ...Array(3).fill('human'),
  ]);
  assert.ok(Math.abs((m.damage ?? 1) - 1.2) < 1e-9, 'damage caps at +20%');
  assert.ok(Math.abs((m.regen ?? 0) - .01) < 1e-9, 'regen caps at 1%/s');
  assert.ok(Math.abs((m.crit ?? 0) - .45) < 1e-9, 'crit caps at 45%');
  assert.ok(Math.abs((m.energyMul ?? 1) - 1.75) < 1e-9, 'energy gain caps at +75%');
  assert.ok(Math.abs((m.cdMul ?? 1) - Math.pow(.9, 4)) < 1e-9, 'cooldowns cap at -34%');
  assert.ok(Math.abs((m.lifesteal ?? 0) - .15) < 1e-9, 'lifesteal caps at 15%');
  assert.ok(Math.abs((m.thorns ?? 0) - .3) < 1e-9, 'thorns cap at 30%');
  assert.ok(Math.abs((m.lowHpDmg ?? 0) - .45) < 1e-9, '堕天 caps at +45%');
  assert.ok(Math.abs((m.executeDmg ?? 0) - .75) < 1e-9, '通牒 caps at +75%');
  assert.ok(Math.abs((m.stunMul ?? 1) - Math.pow(.85, 4)) < 1e-9, 'hitstun caps at -48%');
  assert.equal(m.escapeCombo, 3, 'the escape threshold bottoms out at 3');
  assert.ok(Math.abs((m.vainDamage ?? 0) - .4) < 1e-9, 'vain damage caps at +40%');
  assert.ok(Math.abs((m.vainEnergy ?? 0) - .6) < 1e-9, 'vain energy caps at +60%');
  assert.equal(m.deathSave, 2, 'cheat-death charges stop at two');
  const echo = aggregatePicks(['echo', 'echo', 'echo', 'echo', 'echo']);
  assert.ok(Math.abs((echo.comboTimeBonus ?? 0) - 1) < 1e-9, 'the combo window caps at +1s');
  assert.ok(Math.abs((echo.comboDecay ?? 1) - COMBO_DECAY * Math.pow(.75, 4)) < 1e-9, 'combo decay drops 25% per stack');
  const walk = aggregatePicks(['walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk']);
  assert.ok(Math.abs((walk.moveMul ?? 1) - 1.18) < 1e-9, 'move speed caps at +18%');
  assert.ok(Math.abs((walk.dodgeCdMul ?? 1) - Math.pow(.8, 3)) < 1e-9, 'the dodge cooldown caps at -49%');
  assert.deepEqual(aggregatePicks([]), {}, 'no picks stays neutral');
}

// dare reflects melee damage silently
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.thorns = .3; p2.x = p1.x + 60; p2.facing = -1;
  const before = p1.hp;
  g.keyDown('KeyJ'); run(g, .3);
  assert.ok(p1.hp < before, 'dare reflects melee damage back at the attacker');
  assert.ok(g.texts.every(t => !/反伤/.test(t.text)), 'the reflection shows no text');
}

// latent heals the attacker by a cut of the damage dealt
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p1.lifesteal = .16; p1.hp = 500; p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('KeyJ'); run(g, .3);
  assert.ok(p1.hp > 500, `latent heals the attacker, hp ${p1.hp}`);
}

// human: lethal damage stops at 1 hp and spends the charge
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.deathSave = 1; p2.hp = 5;
  hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
  assert.equal(p2.hp, 1, 'lethal damage stops at 1 hp');
  assert.equal(p2.deathSave, 0, 'the charge is spent');
  assert.ok(p2.invuln >= 1.5, 'the save grants invulnerability');
  assert.equal(p2.stun, 0, 'the save clears hitstun');
}

// vain: a kill arms the damage and energy bonus once for the rest of the round
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p1.vainDmg = .15; p1.vainEnergy = .25; p2.hp = 1;
  hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
  assert.ok(Math.abs(p1.dmgMul - 1.15) < 1e-9, `a kill arms the vain damage bonus, saw ${p1.dmgMul}`);
  assert.ok(Math.abs(p1.energyMul - 1.25) < 1e-9, `a kill arms the vain energy bonus, saw ${p1.energyMul}`);
  p2.hp = 1;
  hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
  assert.ok(Math.abs(p1.dmgMul - 1.15) < 1e-9, 'the bonus does not re-arm within the round');
}

// protect: the combo escape fires at the lowered threshold
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.escapeCombo = 5; p2.x = p1.x + 60; p2.facing = -1;
  p1.combo = 4; p1.comboTime = 1;
  hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
  assert.equal(p1.combo, 5, 'the combo counts to the threshold');
  assert.ok(p2.invuln > 0 && Math.abs(p2.stun - .24) < 1e-9, `the escape fires at combo 5, stun ${p2.stun}`);
}

// training: no clock, energy pinned, target heals
{
  const g = newGame(at('gale'), at('boulder'), 'training'); const [p1, p2] = g.fighters;
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
  p1.x = 500; p2.x = p1.x + 60; p2.facing = -1;
  const x = p1.x, hp = p1.hp;
  g.keyDown('KeyS'); run(g, .05); g.keyUp('KeyS'); run(g, STEP);
  assert.ok(p1.dodge > 0, 'short tap starts a dodge');
  g.keyDown('Numpad4'); run(g, .6); // 磐石 U = 熊抱 grab
  assert.ok(x - p1.x > 280 && x - p1.x < 330, `dodge covers 35% of the stage, moved ${x - p1.x}`);
  assert.equal(p1.hp, hp, 'grab whiffs on the dodging fighter');
  assert.ok(p1.dodgeCd > 0, 'dodge goes on cooldown');
}

// holding S still blocks, and releasing after a hold is not a dodge
{
  const g = newGame(at('boulder'), at('ember')); const [p1, p2] = g.fighters; dummy(g); // 磐石 vs 星火
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
  assert.equal(p1.hp, ROSTER[at('gale')].hp, 'sweep misses an airborne target');
}

// launch floats the target high and a jump attack juggles into a combo
{
  const g = newGame(at('ember'), at('boulder')); const [p1, p2] = g.fighters; dummy(g); // 星火 I = 焰柱上挑
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('KeyI'); run(g, .2);
  assert.ok(p2.vy < -300 && g.airborne(p2), 'launch floats the target');
  assert.equal(p2.knocked, 0, 'launch is a float, not a knockdown');
  run(g, .35);
  g.keyDown('KeyW'); g.keyDown('KeyJ');
  let peak = 0, popped = false, popVy = 0;
  for (let i = 0; i < Math.round(.6 / STEP); i++) {
    g.step(STEP);
    peak = Math.max(peak, g.hitstop);
    if (!popped && p1.combo >= 2) { popped = true; popVy = p2.vy; }
  }
  assert.ok(p1.combo >= 2, `jump attack juggles, combo ${p1.combo}`);
  assert.ok(peak >= .08, `juggle hitstop, saw ${peak}`);
  assert.ok(popped && popVy < 0 && popVy > -200, `juggle pops slightly upward, saw ${popVy}`);
}

// CPU slips out of sustained block pressure instead of guard-breaking
{
  const g = newGame(at('gale'), at('boulder')); const [p1, cpu] = g.fighters; // fighters[1] is the AI
  cpu.guard = 10;
  let escaped = false;
  for (let i = 0; i < Math.round(2 / STEP); i++) {
    cpu.x = p1.x + 120; cpu.facing = -1; // pinned: threatened but out of light range
    if (!p1.attack) p1.attack = {
      skill: ROSTER[at('gale')].skills[0], index: 0, serial: ++p1.attackSerial,
      t: 0, emitted: false, shots: 0, hit: new Set(), burst: 0,
      endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0,
    };
    g.step(STEP);
    if (cpu.dodge > 0 || cpu.dodgeCd > 0 || cpu.y < FLOOR - 1) { escaped = true; break; }
  }
  assert.ok(escaped, 'CPU dodges or jumps out of block pressure');
}

// CPU jumps up to meet a floated victim with an air normal
{
  const g = newGame(at('boulder'), at('gale')); const [vic, cpu] = g.fighters; // fighters[1] is the AI
  cpu.x = 400; cpu.facing = -1;
  let jumped = false, airFired = false;
  for (let i = 0; i < Math.round(1.5 / STEP); i++) {
    vic.x = 370; vic.y = FLOOR - 120; vic.vy = 0; vic.stun = Math.max(vic.stun, .5); // pinned float
    g.step(STEP);
    if (cpu.y < FLOOR - 1) jumped = true;
    if (cpu.attack?.skill.air) airFired = true;
    if (jumped && airFired) break;
  }
  assert.ok(jumped, 'CPU jumps after a floated victim');
  assert.ok(airFired, 'CPU meets them with an air normal');
}

// sprite clip routing: loco / normals / air / special stay on the intended sheet
{
  const idle = clipFor(previewFighter(ROSTER[at('gale')], 0));
  assert.equal(idle.sheet, 'common', 'idle uses common sheet');
  assert.deepEqual([idle.col, idle.row], [0, 0], 'idle cell');
  const runner = previewFighter(ROSTER[at('gale')], 0);
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
  const g = newGame(at('ember'), at('boulder')); dummy(g);
  g.keyDown('KeyU'); run(g, STEP);
  const emberU = clipFor(g.fighters[0]);
  assert.equal(emberU.sheet, 'special', 'ember U uses special');
  assert.equal(emberU.col, 0, 'U is column 0');
}

// sakiko: 轮舞 connects three times; 忘却奏鸣 puts a volley of notes in the air
{
  const sakiko = ROSTER.findIndex(c => c.id === 'sakiko');
  assert.ok(sakiko >= 0, 'sakiko is on the roster');
  const g = newGame(sakiko, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 70; p2.facing = -1;
  g.keyDown('KeyI'); run(g, .8);
  assert.equal(p1.combo, 3, '轮舞 hits three times');
  p1.energy = p1.energyMax; p2.x = p1.x + 520;
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

  const notes = newGame(mutsumi, at('boulder')); dummy(notes);
  const [n1, n2] = notes.fighters;
  n2.x = n1.x + 640;
  notes.keyDown('KeyO');
  let volley = 0;
  for (let i = 0; i < Math.round(.8 / STEP); i++) { notes.step(STEP); volley = Math.max(volley, notes.projectiles.length); }
  assert.ok(volley >= 3, `三音 volley, saw ${volley}`);

  const g = newGame(mutsumi, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
  p2.x = 80;
  g.keyDown('KeyU');
  run(g, .4);
  const shot = g.projectiles.find(p => p.fx === 'cucumber');
  if (!shot) throw Error('FAIL: 回旋黄瓜 spawns');
  const outbound = shot.vx;
  run(g, 1.3);
  assert.ok(shot.returned && shot.vx === -outbound, '回旋黄瓜 turns around once');

  const superGame = newGame(mutsumi, at('boulder')); const [s1, s2] = superGame.fighters; dummy(superGame);
  s1.energy = s1.energyMax;
  s2.x = s1.x + 110; s2.facing = -1;
  superGame.keyDown('KeyL');
  run(superGame, 1.2);
  assert.equal(s1.combo, 4, '墨缇丝 hits four times');
  assert.deepEqual(mortisAfterimage(0.4), [1, 1], '墨缇丝 first hit keeps the previous pose');
  assert.deepEqual(mortisAfterimage(0.5), [2, 1], '墨缇丝 next hit swaps the ghost');
  assert.equal(mortisAfterimage(0.85), null, '墨缇丝 exit has no ghost');
}

// mutsumi: 轮奏 breaks out of a super with 0.8s invuln, and grants it on a normal cast
{
  const mutsumi = ROSTER.findIndex(c => c.id === 'mutsumi');
  const data = ROSTER[mutsumi];
  assert.equal(data.skills[3].breakout, true, '轮奏 is a breakout');

  const escape = newGame(mutsumi, at('boulder')); const [e1, e2] = escape.fighters; dummy(escape);
  e1.queue.push({ index: 3, ttl: .18 });
  hit(escape, e2, e1, e2.data.skills[5], { hit: new Set() });
  assert.equal(e1.hitBySuper, true, 'a super marks the combo');
  assert.equal(e1.queue[0]?.index, 3, '轮奏 stays buffered through a super');
  let escaped = false, invuln = 0;
  for (let i = 0; i < Math.round(.2 / STEP); i++) {
    escape.step(STEP);
    if (e1.attack?.skill.name === '轮奏') { escaped = true; invuln = Math.max(invuln, e1.invuln); }
  }
  assert.ok(escaped, '轮奏 comes out during the super');
  assert.ok(invuln > .7, `the breakout is invulnerable for 0.8s, saw ${invuln}`);

  const normal = newGame(mutsumi, at('boulder')); const [n1] = normal.fighters; dummy(normal);
  normal.keyDown('KeyI');
  run(normal, .05);
  assert.equal(n1.attack?.skill.name, '轮奏', '轮奏 casts normally');
  assert.ok(n1.invuln > .5, `轮奏 grants invuln on cast, saw ${n1.invuln}`);
}

// uika: wail scales with hp, the crawl misses a jump, the shove throws far
{
  const uika = ROSTER.findIndex(c => c.id === 'uika');
  assert.ok(uika >= 0, 'uika is on the roster');
  const FLOOR_Y = 443;

  const full = newGame(uika, at('boulder')); dummy(full);
  full.fighters[1].x = full.fighters[0].x + 700;
  full.keyDown('KeyI');
  let one = 0;
  for (let i = 0; i < Math.round(.9 / STEP); i++) { full.step(STEP); one = Math.max(one, full.projectiles.length); }
  assert.equal(one, 1, '满血悲鸣 fires one');

  const low = newGame(uika, at('boulder')); dummy(low);
  low.fighters[0].hp = 200;
  low.fighters[1].x = low.fighters[0].x + 700;
  low.keyDown('KeyI');
  let four = 0;
  for (let i = 0; i < Math.round(.9 / STEP); i++) { low.step(STEP); four = Math.max(four, low.projectiles.length); }
  assert.equal(four, 4, '残血悲鸣 fires four');

  const crawlSkill = ROSTER[uika].skills[2];
  assert.equal(crawlSkill.damage, 18, '爬行 damage');
  assert.equal(crawlSkill.cd, 1.2, '爬行 cooldown');

  const crawl = newGame(uika, at('boulder')); const [c1, c2] = crawl.fighters; dummy(crawl);
  c2.x = c1.x + 70; c2.facing = -1;
  const standHp = c2.hp;
  crawl.keyDown('KeyU'); run(crawl, .5);
  assert.ok(c2.hp < standHp, '爬行 hits a standing target');

  const hop = newGame(uika, at('boulder')); const [h1, h2] = hop.fighters; dummy(hop);
  h2.x = h1.x + 70; h2.facing = -1;
  const hopHp = h2.hp;
  hop.keyDown('KeyU');
  for (let i = 0; i < Math.round(.6 / STEP); i++) {
    h2.y = FLOOR_Y - 100; h2.vy = 0;
    hop.step(STEP);
  }
  assert.equal(h2.hp, hopHp, '爬行 misses a jump near the apex');

  const shove = newGame(uika, at('boulder')); const [s1, s2] = shove.fighters; dummy(shove);
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

  const whiff = newGame(uika, at('boulder')); const [w1] = whiff.fighters; dummy(whiff);
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
  assert.equal(data.skills[5].count, 16, '满场 drops sixteen notes');
  const super5 = data.skills[5];
  assert.ok(drumShotTime(super5, 8) - drumShotTime(super5, 7) > .4, '满场 falls in two waves');
  assert.ok(drumShotTime(super5, 15) < super5.duration, 'the second wave fits in the super');

  const g = newGame(nyamu, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
  p1.energy = p1.energyMax;
  p2.x = p1.x + 80; p2.facing = -1;
  const startX = p2.x;
  g.keyDown('KeyL');
  run(g, .2);
  assert.ok(p2.x > startX + 15, `满场 shoves, moved ${p2.x - startX}`);
  // Sustained repel: drag the foe back mid-super and it gets bounced again.
  p2.x = p1.x + 60; p2.vx = 0; p2.stun = 0; p2.invuln = 0;
  const backX = p2.x;
  run(g, .45);
  assert.ok(p1.attack, 'the super is still up');
  assert.ok(p2.x > backX + 15, `满场 keeps pushing, moved ${p2.x - backX}`);
  let span = 0;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    g.step(STEP);
    const notes = g.projectiles.filter(p => p.vy > 0);
    if (notes.length >= 2) span = Math.max(span, Math.max(...notes.map(p => p.x)) - Math.min(...notes.map(p => p.x)));
  }
  assert.ok(span > 400, `满场 notes span the stage, saw ${span}`);

  const beat = newGame(nyamu, at('boulder')); dummy(beat);
  beat.fighters[0].energy = beat.fighters[0].energyMax;
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

  const close = newGame(umiri, at('boulder')); const [c1, c2] = close.fighters; dummy(close);
  c2.x = c1.x + 55; c2.facing = -1;
  const closeHp = c2.hp;
  close.keyDown('KeyU'); run(close, .3);
  assert.ok(c2.hp < closeHp, '报价 hits point-blank');

  const mid = newGame(umiri, at('boulder')); const [m1, m2] = mid.fighters; dummy(mid);
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

  const far = newGame(umiri, at('boulder')); const [f1, f2] = far.fighters; dummy(far);
  f2.x = f1.x + 480; f2.facing = -1;
  const farHp = f2.hp;
  far.keyDown('KeyU'); run(far, 1.1);
  assert.ok(f2.hp < farHp, '报价 hits on the way down');

  const bags = newGame(umiri, at('boulder')); const [b1, b2] = bags.fighters; dummy(bags);
  b2.x = b1.x + 55; b2.facing = -1;
  bags.keyDown('KeyI');
  run(bags, .8);
  assert.equal(b1.combo, 6, '扫货 connects all six up close');
  const whiff = newGame(umiri, at('boulder')); const [w1, w2] = whiff.fighters; dummy(whiff);
  w2.x = w1.x - 200;
  whiff.keyDown('KeyI'); run(whiff, 1.6);
  assert.equal(whiff.projectiles.filter(p => p.fx === 'bag').length, 0, 'bags vanish on landing');

  const behind = newGame(umiri, at('boulder')); const [r1, r2] = behind.fighters; dummy(behind);
  r2.x = r1.x - 180;
  const behindX = r2.x, behindHp = r2.hp;
  behind.keyDown('KeyO'); run(behind, .5);
  assert.ok(r2.hp < behindHp, '恐湖 hits behind her');
  assert.ok(r2.x < behindX - 40, `恐湖 knocks back, moved ${behindX - r2.x}`);

  const hop = newGame(umiri, at('boulder')); const [h1, h2] = hop.fighters; dummy(hop);
  h2.x = h1.x + 80; h2.y = 443 - 100;
  const hopHp = h2.hp;
  hop.keyDown('KeyO'); run(hop, .5);
  assert.equal(h2.hp, hopHp, '恐湖 misses a jump');

  const escape = newGame(umiri, at('boulder')); const [e1, e2] = escape.fighters; dummy(escape);
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

  const down = newGame(umiri, at('boulder')); const [d1] = down.fighters; dummy(down);
  d1.stun = .4; d1.knocked = 1; d1.vy = 0; d1.hitBySuper = true;
  down.keyDown('KeyO'); down.step(STEP);
  assert.equal(d1.attack, null, '恐湖 does not escape a knockdown');

  const slam = newGame(umiri, at('boulder')); const [s1, s2] = slam.fighters; dummy(slam);
  s1.energy = s1.energyMax;
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

  const dash = newGame(anon, at('boulder')); const [d1, d2] = dash.fighters; dummy(dash);
  d2.x = 900; d2.invuln = 5;
  const x0 = d1.x;
  dash.keyDown('KeyU');
  run(dash, .5);
  assert.ok(d1.x - x0 > 400 && d1.x - x0 < 480, `羽丘跑女 crosses about half the stage, moved ${d1.x - x0}`);

  const tap = newGame(anon, at('boulder')); const [t1, t2] = tap.fighters; dummy(tap);
  t2.invuln = 5; t2.x = t1.x + 400;
  tap.keyDown('KeyI'); tap.keyUp('KeyI');
  let tapped = 0;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    tap.step(STEP);
    tapped = Math.max(tapped, t1.attack?.shots ?? tapped);
  }
  assert.equal(tapped, 3, 'a tap strums three notes');

  const held = newGame(anon, at('boulder')); const [h1, h2] = held.fighters; dummy(held);
  h2.invuln = 5; h2.x = h1.x + 400;
  held.keyDown('KeyI');
  let full = 0;
  for (let i = 0; i < Math.round(1.8 / STEP); i++) {
    held.step(STEP);
    full = Math.max(full, h1.attack?.shots ?? full);
  }
  held.keyUp('KeyI');
  assert.equal(full, 12, 'holding the key strums twelve notes');

  const home = newGame(anon, at('boulder')); const [n1, n2] = home.fighters; dummy(home);
  n2.invuln = 5; n2.x = n1.x - 220;
  home.keyDown('KeyI'); home.keyUp('KeyI');
  run(home, .3);
  const note = home.projectiles.find(p => p.fx === 'chord');
  assert.ok(note, 'C和弦 fires a note');
  run(home, .8);
  const turned = home.projectiles.find(p => p.fx === 'chord');
  assert.ok(turned && turned.vx < 0, `notes steer toward a target behind her, vx ${turned?.vx}`);

  const root = newGame(anon, at('boulder')); const [r1, r2] = root.fighters; dummy(root);
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

  const spin = newGame(anon, at('boulder')); const [s1, s2] = spin.fighters; dummy(spin);
  s1.energy = s1.energyMax;
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

// soyo: onegai catch-pause-launch, resolve shove and 8s frenzy, two trailed notes, a short shout
{
  const soyo = ROSTER.findIndex(c => c.id === 'soyo');
  assert.ok(soyo >= 0, 'soyo is on the roster');
  const data = ROSTER[soyo];
  assert.equal(data.name, '长崎素世', 'soyo uses the chosen display name');
  assert.equal(data.skills[2].name, '求你了！', 'U is 求你了！');
  assert.equal(data.skills[2].fx, 'onegai', 'U keeps the onegai fx');
  assert.equal(data.skills[4].count, 2, '不甘的演奏 fires two notes');
  assert.equal(data.skills[4].cd, 2, '不甘的演奏 cools in two seconds');
  assert.equal(data.skills[5].fx, 'shout', 'the super is the 春日影 shout');
  assert.ok((data.skills[5].life ?? 0) * (data.skills[5].speed ?? 0) < 260, 'the shout wave covers about a quarter of the stage');
  assert.ok(data.view.kind === 'sprite' && !!data.view.frenzy, 'soyo preloads a frenzy sheet');

  const grab = newGame(soyo, at('boulder')); const [c1, c2] = grab.fighters; dummy(grab);
  c2.x = c1.x + 100; c2.facing = -1;
  const grabHp = c2.hp;
  grab.keyDown('KeyU');
  run(grab, .35);
  assert.equal(c1.attack?.index, 2, 'onegai started');
  assert.equal(c1.attack?.hold, c2.id, 'onegai caught the wrist');
  let minY = c2.y, peakShake = 0;
  for (let i = 0; i < Math.round(1.0 / STEP); i++) {
    grab.step(STEP);
    minY = Math.min(minY, c2.y);
    peakShake = Math.max(peakShake, grab.shake);
  }
  assert.ok(c2.hp < grabHp - 50, `the headbutt connects, damage ${grabHp - c2.hp}`);
  assert.ok(minY < FLOOR - 40, `the headbutt launches, peak ${FLOOR - minY}`);
  assert.ok(c2.knocked > 0, 'the headbutt knocks down');
  assert.ok(peakShake >= 8, `the launch shakes the screen, saw ${peakShake}`);
  assert.equal(c1.attack, null, 'onegai plays out and ends');

  const miss = newGame(soyo, at('boulder')); const [m1, m2] = miss.fighters; dummy(miss);
  m2.x = m1.x + 420;
  miss.keyDown('KeyU');
  run(miss, .8);
  assert.equal(m1.attack, null, 'a whiffed onegai ends early');
  assert.equal(m2.hp, m2.data.hp, 'the whiff deals nothing');

  const repel = newGame(soyo, at('boulder')); const [r1, r2] = repel.fighters; dummy(repel);
  r2.x = r1.x + 90; r2.facing = -1;
  const rx = r2.x;
  repel.keyDown('KeyI');
  run(repel, .6);
  assert.ok(r2.x > rx + 30, `resolve shoves nearby foes, moved ${r2.x - rx}`);

  const fren = newGame(soyo, at('boulder')); const [g1, g2] = fren.fighters; dummy(fren);
  fren.keyDown('KeyI');
  run(fren, .55);
  assert.ok(g1.frenzy > 7, `resolve grants frenzy, left ${g1.frenzy}`);
  run(fren, .6);
  assert.ok(fren.attack(g1, 0), 'a light comes out after the resolve');
  assert.ok(g1.cooldowns[0] > 0 && g1.cooldowns[0] < .2, `frenzy light cooldown is cut, got ${g1.cooldowns[0]}`);
  run(fren, .3);
  assert.equal(g1.attack, null, 'the frenzy light plays out fast');
  run(fren, 8.1);
  assert.equal(g1.frenzy, 0, 'frenzy expires after eight seconds');

  // 狂化连招: mashing J loops light ×3 into an automatic heavy, and a pause beyond the window cools the chain
  const mash = newGame(soyo, at('boulder')); const [j1] = mash.fighters; dummy(mash);
  j1.energy = 100;
  mash.keyDown('KeyI');
  run(mash, 1.0);
  assert.ok(j1.frenzy > 6, 'frenzy is up for the chain');
  const presses: number[] = [];
  const jab = () => {
    mash.keyDown('KeyJ');
    run(mash, STEP);
    presses.push(j1.attack?.index ?? -1);
    mash.keyUp('KeyJ');
    run(mash, .4);
  };
  jab(); jab(); jab();
  assert.deepEqual(presses, [0, 0, 0], 'three jabs chain as lights');
  jab();
  assert.deepEqual(presses, [0, 0, 0, 1], 'the fourth press comes out as the heavy');
  jab();
  assert.deepEqual(presses, [0, 0, 0, 1, 0], 'the chain restarts after the auto-heavy');
  run(mash, .8);
  jab(); jab(); jab(); jab();
  assert.deepEqual(presses, [0, 0, 0, 1, 0, 0, 0, 0, 1], 'a pause beyond the window cools the chain, then it rebuilds');

  const sob = newGame(soyo, at('boulder')); const [b1, b2] = sob.fighters; dummy(sob);
  b2.x = 980;
  sob.keyDown('KeyO');
  run(sob, 1.5);
  const notes = sob.projectiles.filter(p => p.fx === 'sob');
  assert.equal(notes.length, 2, `two ground notes, saw ${notes.length}`);
  assert.ok(notes.every(p => p.y > FLOOR - 60), 'the notes hug the floor');
  assert.ok(Math.abs(notes[0].y - notes[1].y) > 10, 'the two notes ride different heights');

  const shout = newGame(soyo, at('boulder')); const [w1, w2] = shout.fighters; dummy(shout);
  w2.x = w1.x + 200; w2.facing = -1;
  w1.energy = w1.energyMax;
  shout.keyDown('KeyL');
  run(shout, .7);
  assert.ok(w2.root > 3, `the shout roots for four seconds, left ${w2.root}`);
  assert.equal(w1.attack, null, 'she is free the moment the wave leaves');
  hit(shout, w1, w2, w1.data.skills[0], { hit: new Set() });
  assert.ok(w2.root > 0, 'the first hit keeps the root');
  hit(shout, w1, w2, w1.data.skills[0], { hit: new Set() });
  assert.equal(w2.root, 0, 'the second hit clears the root');
  assert.ok(shout.attack(w1, 0), 'she acts immediately after the wave');

  // The wave itself dies of range with nothing in the way.
  const far = newGame(soyo, at('boulder')); const [f1, f2] = far.fighters; dummy(far);
  f2.x = f1.x + 700; f2.invuln = 5;
  f1.energy = f1.energyMax;
  far.keyDown('KeyL');
  let waveX0 = -1, waveMax = 0, waveGone = false;
  for (let i = 0; i < Math.round(1.4 / STEP); i++) {
    far.step(STEP);
    const wave = far.projectiles.find(p => p.fx === 'shout');
    if (wave) {
      if (waveX0 < 0) waveX0 = wave.x;
      waveMax = Math.max(waveMax, wave.x - waveX0);
    } else if (waveX0 >= 0) waveGone = true;
  }
  assert.ok(waveGone && waveMax < 260, `the shout dies of range, flew ${waveMax}`);

  const pf = previewFighter(data, 0);
  pf.attack = { skill: data.skills[0], index: 0, serial: 1, t: .12, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
  pf.frenzy = 5;
  assert.equal(clipFor(pf).sheet, 'frenzy', 'frenzy lights read the frenzy sheet');
  pf.attack = null;
  assert.equal(clipFor(pf).col, 0, 'frenzy idle stands on the stance cell');
  assert.equal(clipFor(pf).row, 2, 'frenzy idle uses row 2');
  pf.frenzy = 0;
  assert.equal(clipFor(pf).sheet, 'common', 'calm lights read the common sheet');
}

// tomori: the stone shoves, the plaster braces without flinching, the well drags and ticks, the sing summons a teammate
{
  const tomori = ROSTER.findIndex(c => c.id === 'tomori');
  assert.ok(tomori >= 0, 'tomori is on the roster');
  const data = ROSTER[tomori];
  assert.equal(data.name, '高松灯', 'tomori display name');
  assert.equal(data.skills[2].fx, 'stone', 'U is the stone');
  assert.equal(data.skills[2].damage, 12, 'the stone pokes for little');
  assert.ok((data.skills[2].knock ?? 0) >= 300, `the stone knocks back hard, saw ${data.skills[2].knock}`);
  assert.ok(data.skills[2].cd <= 1, 'the stone cools almost instantly');
  assert.equal(data.skills[3].breakout, true, 'the plaster is a breakout');
  assert.equal(data.skills[4].fx, 'blackhole', 'O is the well');
  assert.equal(data.skills[4].knock, 0, 'the well does not knock back, the pull owns the body');
  assert.equal(data.skills[5].fx, 'poem', 'the super is the sing');
  assert.ok(data.skills[5].start >= 1, 'the sing lasts a second');

  // U: the stone flies and shoves the dummy
  {
    const g = newGame(tomori, at('boulder')); const [t1, t2] = g.fighters; dummy(g);
    t2.x = t1.x + 260; t2.facing = -1;
    const sx = t2.x;
    g.keyDown('KeyU');
    run(g, .8);
    assert.ok(t2.x > sx + 25, `the stone shoves, moved ${t2.x - sx}`);
    assert.ok(g.projectiles.every(p => p.fx !== 'stone'), 'the stone dies on the hit');
  }

  // I: the plaster shoves the crowd and braces her; a hit during the brace does not stop a move
  {
    const g = newGame(tomori, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90; p2.facing = -1;
    const px = p2.x;
    g.keyDown('KeyI');
    run(g, .5);
    assert.ok(p1.braced > 5, `the plaster braces for six seconds, left ${p1.braced}`);
    assert.ok(g.effects.some(e => e.type === 'plaster' && e.max >= 1), 'the cast spawns the plaster pulse');
    assert.ok(p2.x > px + 30, `the plaster shoves, moved ${p2.x - px}`);
    run(g, .5);
    g.keyDown('KeyJ');
    run(g, STEP);
    const serial = p1.attack?.serial;
    assert.ok(serial !== undefined, 'her light started');
    const hp = p1.hp;
    hit(g, p2, p1, p2.data.skills[0], { hit: new Set() });
    const taken = hp - p1.hp;
    assert.ok(taken > 12 && taken < 22, `the brace blunts damage by a third, took ${taken}`);
    assert.equal(p1.stun, 0, 'braced does not flinch');
    assert.equal(p1.attack?.serial, serial, 'braced does not stop the move');
    run(g, .5);
    assert.equal(p1.attack, null, 'the light played out on its own clock');
    run(g, 5.4);
    assert.equal(p1.braced, 0, 'the brace expires');
  }

  // I is a breakout: buffered through a super like 轮奏
  {
    const g = newGame(tomori, at('boulder')); const [e1, e2] = g.fighters; dummy(g);
    e1.queue.push({ index: 3, ttl: .18 });
    hit(g, e2, e1, e2.data.skills[5], { hit: new Set() });
    assert.equal(e1.hitBySuper, true, 'a super marks the combo');
    assert.equal(e1.queue[0]?.index, 3, 'the plaster stays buffered through a super');
  }

  // grabs ignore the brace, but a plain hit does not flinch it
  {
    const g = newGame(tomori, at('boulder')); const [b1, b2] = g.fighters; dummy(g);
    addMod(b1, 'brace', 6, { v: .67 });
    const hp = b1.hp;
    hit(g, b2, b1, b2.data.skills[0], { hit: new Set() });
    assert.ok(b1.hp < hp, 'the brace takes damage');
    assert.equal(b1.stun, 0, 'the brace does not flinch');
    hit(g, b2, b1, b2.data.skills[2], { hit: new Set() }); // 磐石 U = 熊抱 grab
    assert.ok(b1.knocked > 0, 'a grab still goes through the brace');
  }

  // O: the well spawns ahead, drags the dummy to its centre and ticks low damage
  {
    const g = newGame(tomori, at('boulder')); const [h1, h2] = g.fighters; dummy(g);
    h2.x = h1.x + 300; h2.facing = -1;
    g.keyDown('KeyO');
    run(g, .5);
    const well = g.projectiles.find(p => p.fx === 'blackhole');
    assert.ok(well, 'the well spawns');
    const centre = h1.x + 320;
    assert.ok(Math.abs(h2.x - centre) < 40, `the well drags, off by ${Math.abs(h2.x - centre)}`);
    run(g, .9);
    const drained = h2.data.hp - h2.hp;
    assert.ok(drained > 20, `the well ticks, dealt ${drained}`);
    run(g, .8);
    assert.ok(g.projectiles.every(p => p.fx !== 'blackhole'), 'the well fades');
  }

  // L: the sing shoves, a teammate answers, fights, dies early, and a new one bows out on time
  {
    const g = newGame(tomori, at('boulder')); const [s1, s2] = g.fighters; dummy(g);
    s1.energy = s1.energyMax;
    s2.x = s1.x + 70; s2.facing = -1;
    const ex = s2.x;
    g.keyDown('KeyL');
    run(g, .2);
    assert.ok(s2.x > ex + 20, `the first note shoves, moved ${s2.x - ex}`);
    assert.equal(g.fighters.length, 2, 'no teammate during the sing');
    run(g, .95);
    assert.equal(g.fighters.length, 3, 'the teammate takes the stage');
    const mate = g.fighters[2];
    assert.equal(mate.minion, true, 'the ally is a minion');
    assert.equal(mate.data.hp, 200, 'the health cap is 200, not a fraction');
    assert.equal(mate.hp, 200, 'the teammate spawns at full health on the lowered cap');
    assert.ok((mate.life ?? 0) > 11, `twelve seconds on the clock, left ${mate.life}`);
    const before = s2.hp;
    run(g, 2.5);
    assert.ok(Number.isFinite(g.totalHits[mate.id]), 'minion hits land in the score tables');
    assert.ok(s2.hp < before, 'the teammate swings on her own');
    mate.hp = 5;
    hit(g, s2, mate, s2.data.skills[0], { hit: new Set() });
    run(g, STEP * 16); // the hit's hitstop eats the first few steps
    assert.equal(g.fighters.length, 2, 'the teammate leaves when defeated');

    s2.hp = s2.data.hp; // the master-brain teammate could wear the dummy down; keep the round alive on purpose
    s1.energy = s1.energyMax;
    g.keyUp('KeyL');
    g.keyDown('KeyL');
    run(g, 1.3);
    assert.equal(g.fighters.length, 3, 'the teammate answers again');
    // Hitstop steals steps from the life clock, so bow-out needs a little more than twelve sim-seconds.
    for (let i = 0; i < Math.round(16 / STEP); i++) { g.step(STEP); if (g.fighters.length === 2) break; }
    assert.equal(g.fighters.length, 2, 'the teammate bows out when time is up');
  }

  // the round ends even with a teammate standing
  {
    const g = newGame(tomori, at('boulder')); const [r1] = g.fighters; dummy(g);
    r1.energy = r1.energyMax;
    g.keyDown('KeyL');
    run(g, 1.3);
    assert.equal(g.fighters.length, 3, 'a teammate is up');
    r1.hp = 0;
    run(g, STEP);
    assert.equal(g.phase, 'roundend', 'the round ignores the minion');
  }

  // team mode: the teammate id never collides with a real fighter slot
  {
    const g = new FightGame([ROSTER[tomori], ROSTER[at('gale')], ROSTER[at('boulder')], ROSTER[at('ember')]], {
      mode: 'team', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7),
    });
    run(g, 2.3);
    const lead = g.fighters[0];
    lead.energy = lead.energyMax;
    assert.ok(g.attack(lead, 5), 'the sing starts in team mode');
    run(g, 1.15);
    assert.equal(g.fighters.length, 5, 'the teammate joins the team fight');
    assert.equal(new Set(g.fighters.map(f => f.id)).size, g.fighters.length, 'fighter ids stay unique');
  }
}

{
  const tomoriData = ROSTER[ROSTER.findIndex(c => c.id === 'tomori')];
  // L: the sung note holds for 0.6s before the summon, then the bow
  const pf = previewFighter(tomoriData, 0);
  pf.attack = { skill: tomoriData.skills[5], index: 5, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
  assert.deepEqual([clipFor(pf).col, clipFor(pf).row], [3, 0], 'the sing starts on the breath');
  pf.attack.t = tomoriData.skills[5].start - .6;
  assert.equal(clipFor(pf).row, 1, 'the sung note takes over 0.6s before the summon');
  pf.attack.t = tomoriData.skills[5].start - .01;
  assert.equal(clipFor(pf).row, 1, 'still singing at the summon');
  pf.attack.t = tomoriData.skills[5].start + .05;
  assert.equal(clipFor(pf).row, 2, 'the bow follows the summon');

  const pf2 = previewFighter(tomoriData, 0);
  pf2.attack = { skill: tomoriData.skills[2], index: 2, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
  assert.deepEqual([clipFor(pf2).col, clipFor(pf2).row], [0, 0], 'the stone reads the U column');
}

// arisa: 认真模式 buffs only on a clean pose, the bubble roots, the wave breaks out, the box halves damage and drips hp
{
  const arisa = ROSTER.findIndex(c => c.id === 'arisa');
  assert.ok(arisa >= 0, 'arisa is on the roster');
  assert.ok(PLAYABLE.some(c => c.id === 'arisa'), 'arisa is playable');
  const data = ROSTER[arisa];
  assert.equal(data.skills[3].root, 3, '气泡 roots for 3s');
  assert.equal(data.skills[3].knock, 0, '气泡 does not knock the victim away');
  assert.equal(data.skills[4].breakout, true, '傲娇音波 is a breakout');

  const pose = newGame(arisa, at('boulder')); const [s1] = pose.fighters; dummy(pose);
  pose.keyDown('KeyU');
  run(pose, .5);
  assert.ok(s1.muscle > 0 && s1.poise > 0, '认真模式 arms damage and poise once the pose lands');

  const hitWind = newGame(arisa, at('boulder')); const [w1, w2] = hitWind.fighters; dummy(hitWind);
  w2.x = w1.x + 60; w2.facing = -1;
  hitWind.keyDown('KeyU');
  run(hitWind, .1);
  hit(hitWind, w2, w1, w2.data.skills[0], { hit: new Set() });
  run(hitWind, .5);
  assert.equal(w1.muscle, 0, '被打断则失效: a hit during the windup cancels the buff');

  const bubble = newGame(arisa, at('boulder')); const [b1, b2] = bubble.fighters; dummy(bubble);
  b2.x = b1.x + 320; b2.facing = -1;
  bubble.keyDown('KeyI');
  let saw = false;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    bubble.step(STEP);
    if (bubble.projectiles.some(p => p.fx === 'bubble')) saw = true;
  }
  assert.ok(saw, '气泡 spawns');
  assert.ok(b2.root > 0, '气泡 roots the victim');

  const wave = newGame(arisa, at('boulder')); const [v1] = wave.fighters; dummy(wave);
  wave.keyDown('KeyO');
  run(wave, .4);
  assert.ok(v1.attack && clipFor(v1).row === 1, '傲娇音波 holds the scream cell past the generic .1s active window');
  run(wave, .4);
  assert.ok(v1.attack && clipFor(v1).row === 2, '傲娇音波 settles on the recover cell in the tail');

  const boxGame = newGame(arisa, at('boulder')); const [k1, k2] = boxGame.fighters; dummy(boxGame);
  k1.energy = 100;
  boxGame.keyDown('KeyL');
  run(boxGame, .6);
  assert.ok(k1.king && k1.box > 0 && k1.poise > 0, '纸箱 form is up with poise');
  k1.hp = k1.data.hp * .5;
  const healed = k1.hp;
  run(boxGame, 1);
  assert.ok(k1.hp > healed, '纸箱 drips hp');
  k1.queue.push({ index: 2, ttl: .18 });
  run(boxGame, .3);
  assert.ok(!k1.attack, '纸箱 keeps U I O L locked');
  boxGame.keyDown('KeyJ');
  run(boxGame, .12);
  assert.ok(k1.attack && clipFor(k1).sheet === 'common', '纸箱 keeps reading the common sheet so view.box can swap the picture');

  run(boxGame, .5);
  const before = k1.hp;
  hit(boxGame, k2, k1, k2.data.skills[0], { hit: new Set() });
  const loss = before - k1.hp;
  const plain = 26 * k2.data.power * .95; // armor trait cuts damage taken before the box does
  assert.ok(Math.abs(loss - plain * .5) < .01, `纸箱 halves damage taken, saw ${loss.toFixed(2)} vs ${(plain * .5).toFixed(2)}`);
}

{
  assert.equal(guideIndex([null, 0]), 1, 'solo 2P is the movelist');
  assert.equal(guideIndex([0, 1]), 0, 'earlier player wins when both are human');
  assert.equal(guideIndex([null, null, 1, 0]), 2, 'team uses the earliest player slot');
  assert.equal(guideIndex([null, null]), 0, 'all CPU stays on 1P');
  const first = skillHTML(ROSTER[at('sakiko')]);
  const second = skillHTML(ROSTER[at('sakiko')], 1);
  assert.ok(first.includes('<kbd>J</kbd>') && first.includes('<kbd>L</kbd>'), 'cpu and first player show letter keys');
  assert.ok(second.includes('<kbd>1</kbd>') && second.includes('<kbd>3</kbd>') && !second.includes('<kbd>J</kbd>'), 'later player shows numpad keys');
  assert.ok(second.includes('1 / 2') && !second.includes('J / K'), 'combo hint follows the numpad set');
  const touch = skillHTML(ROSTER[at('sakiko')], 0, true);
  assert.ok(touch.includes('<kbd>轻</kbd>') && touch.includes('<kbd>必</kbd>') && !touch.includes('<kbd>J</kbd>'), 'phone shows on-screen pad labels');
  assert.ok(touch.includes('轻 / 重') && !touch.includes('J / K'), 'combo hint follows the pad labels');
  assert.ok(
    first.includes('class="brief"') && first.includes('class="nums"') && first.includes('class="detail"')
    && !first.includes('undefined'), 'movelist carries the brief / nums / detail tiers with no missing field',
  );
  // 技能文案 (docs/skill-desc-guide.md): the battle table opens on tier 2 and the two tiers never
  // show at once, so a brief has to stand alone. These are the rules the copy pass has to keep.
  for (const s of [...ROSTER.flatMap(c => c.skills), ...AIR_SKILLS]) {
    const where = `${s.name}(${s.key})`;
    assert.ok(s.brief.trim().length > 0 && s.detail.trim().length > 0, `${where} carries both tiers`);
    assert.ok([...s.brief].length <= 24, `${where} brief stays within 24 chars: ${s.brief}`);
    assert.equal([...s.brief].filter(ch => ch === '；').length <= 1, true, `${where} brief uses at most one ；: ${s.brief}`);
    for (const [field, text] of [['brief', s.brief], ['detail', s.detail]] as const) {
      assert.ok(!/[,;:()]/.test(text), `${where} ${field} uses full-width punctuation: ${text}`);
      // The render layer swaps this exact string for the numpad / touch labels; J/K misses it.
      assert.ok(!text.includes('J/K'), `${where} ${field} writes J / K with spaces: ${text}`);
    }
  }
  const wide = stageCover(828, 199, 30);
  assert.ok(wide.width >= 828 && wide.height >= 199, 'a short wide stage still covers');
  assert.ok(wide.fromBottom < 0 && wide.fromBottom >= 199 - wide.height, 'wide stage keeps the floor in frame');
  const flush = stageCover(960, 540, 200);
  assert.equal(flush.fromBottom, 0, 'an exact-fit image stays flush instead of leaving a bar');
  const capped = stageCover(828, 199, -500);
  assert.equal(capped.fromBottom, 199 - capped.height, 'sliding past the top slack is clamped');
  assert.deepEqual(assignSlotWho(['player', 'cpu'], 1, 'player', false, 2), ['player', 'player']);
  assert.equal(assignSlotWho(['player', 'cpu'], 1, 'player', false, 1), null);
  assert.deepEqual(assignSlotWho(['player', 'cpu'], 1, 'cpu', true, 1), ['cpu', 'player']);
  assert.deepEqual(assignSlotWho(['player', 'cpu'], 0, 'player', true, 1), ['cpu', 'cpu']);
  assert.equal(assignSlotWho(['player', 'cpu'], 0, 'player', false, 2), null);
  assert.equal(easeLoad(0, 0, 0), 0, 'an empty load stays at the start');
  assert.ok(easeLoad(0, 0, 3000) > 0 && easeLoad(0, 0, 3000) <= 0.96, 'the bar creeps before the first file arrives');
  assert.ok(easeLoad(0.95, 0.5, 0) <= 0.96, 'a partial load cannot draw a full bar');
  assert.ok(easeLoad(0.9, 1, 0) > 0.9 && easeLoad(0.9, 1, 0) <= 1, 'a finished load is allowed to reach the end');
  const waiting = new Set<string>();
  assert.equal(nextSrc(['stage', 'a'], ['c', 'stage', 'a'], ['b'], waiting), 'stage', 'pinned files load before a jumped roster card');
  waiting.add('stage');
  assert.equal(nextSrc(['stage', 'a'], ['c', 'a'], ['b'], waiting), 'a', 'the next pin still beats the jumped card');
  waiting.add('a');
  assert.equal(nextSrc(['stage', 'a'], ['c'], ['b'], waiting), 'c', 'the queue falls through to jumped cards, then the rest');
  assert.equal(nextSrc(['stage'], ['c'], [], new Set()), 'c', 'a pin that was never queued is skipped');
  assert.equal(nextSrc([], [], ['b'], new Set()), 'b', 'the background queue runs once nothing is waiting ahead of it');
  assert.deepEqual(imageSources('/sprites/aya/special.png', true), ['/sprites/aya/special.webp', '/sprites/aya/special.png'], 'production tries webp, then the png');
  assert.deepEqual(imageSources('/sprites/aya/special.png', true, false), ['/sprites/aya/special.png'], 'a browser without webp never requests it');
  assert.deepEqual(imageSources('/sprites/aya/special.png', false), ['/sprites/aya/special.png'], 'dev keeps the single png');
  assert.deepEqual(imageSources('/icons/ult.svg', true), ['/icons/ult.svg'], 'a non-png url is unchanged');
  assert.ok(readFileSync('scripts/compress-images.ts', 'utf8').includes('const NEAR = 45'), 'webp stays at the Aya near-lossless 45 baseline');
  const phone = battleFrame(844, 390);
  assert.ok(phone.top < 0, 'a wide phone crops vertically instead of leaving side bars');
  assert.ok(Math.abs(phone.floorY / 390 - FLOOR / 540) < 1e-6, 'phone floor stays at the desktop ratio');
  assert.ok(Math.abs(phone.hud - (390 * 960) / (844 * 540)) < 1e-9, 'a short phone shrinks the top HUD to the desktop share');
  const widePhone = battleFrame(667, 375);
  assert.ok(Math.abs(widePhone.top) < 1, 'a 16:9 phone is barely cropped');
  assert.ok(Math.abs(widePhone.imageH - 375) < 1, 'a 16:9 phone already fills the height');
  assert.ok(widePhone.hud > 0.99 && widePhone.hud <= 1, 'a 16:9 phone keeps the desktop HUD size');
  const tablet = battleFrame(1024, 768);
  const tabletScale = 1024 / 960;
  const centered = (768 - 540 * tabletScale) / 2 + FLOOR * tabletScale;
  const ratio = 768 * FLOOR / 540;
  assert.ok(tablet.floorY > centered, 'tablet floor sits lower than the old centered picture');
  assert.ok(tablet.floorY - centered < 768 * 0.18, 'tablet floor is not much lower than centered');
  assert.ok(Math.abs(ratio - tablet.floorY) <= 768 * 0.04 + 1e-6, 'tablet floor never rises past 4% off the desktop ratio');
  assert.equal(tablet.hud, 1, 'a tall tablet does not shrink the HUD');
  // The landscape keys are placed by CSS: attack in the bottom-right, three skills in a row to its left,
  // guard above the attack, the ultimate to the left of the skills once it is ready. Jump is still the stick edge.
  assert.deepEqual(Object.keys(TOUCH_LAYOUT), ['stick'], 'only the stick keeps a hand-placed spot; the keys are laid out');
  assert.ok(TOUCH_LAYOUT.stick.x < 20 && TOUCH_LAYOUT.stick.y > 70, 'the stick stays in the bottom-left thumb zone');
  const html = readFileSync('index.html', 'utf8');
  // Settings dialog shows control names and option names only. Extra sentences fail this lock.
  {
    const start = html.indexOf('<dialog id="settings-dialog">');
    const end = html.indexOf('</dialog>', start);
    assert.ok(start >= 0 && end > start, 'settings dialog exists');
    const visible = html.slice(start, end).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.equal(visible, '设置 × 名册显示 直接排开 按乐队分组', 'settings dialog shows names only, no explanation');
    const css = readFileSync('src/style.css', 'utf8');
    assert.ok(css.includes('min-width: max-content'), 'settings options keep their full label');
    assert.ok(!css.includes('100vw'), 'dialog width must not use 100vw; it includes the scrollbar and shifts the page');
  }
  for (const gone of ['data-pad="jump"']) {
    assert.ok(!html.includes(gone), gone + ' is gone: jumping is the stick edge');
  }
  assert.ok(html.includes('data-guard'), 'the guard button blocks on press instead of dodging');
  for (const kept of ['data-pad="atk"', 'data-pad="guard"', 'data-pad="s1"', 'data-pad="s2"', 'data-pad="s3"', 'data-pad="ult"']) {
    assert.ok(html.includes(kept), kept + ' is still on the pad');
  }
  // Device adaptation contract (docs/device-adaptation.md): capability is ruled by ui/device.ts
  // with a hardware fallback, CSS owns layout only, viewport units carry old-browser fallbacks, and
  // wide mode never strips the movement controls from a touch device. A real phone was dropped into
  // the desktop UI by the pointer media query alone; these locks keep every signal alive.
  const readdirSync = process.getBuiltinModule('fs').readdirSync;
  const tsFiles = readdirSync('src', { recursive: true })
    .map(f => String(f).replaceAll('\\', '/'))
    .filter(f => f.endsWith('.ts'));
  for (const f of tsFiles) {
    const src = readFileSync('src/' + f, 'utf8');
    for (const cap of ['(pointer:', '(hover:', 'any-pointer']) {
      if (f !== 'ui/device.ts' && src.includes(cap)) {
        throw Error(`FAIL: capability media query ${cap} must live only in src/ui/device.ts (src/${f})`);
      }
    }
  }
  const deviceTs = readFileSync('src/ui/device.ts', 'utf8');
  assert.ok(deviceTs.includes('(pointer:') && deviceTs.includes('maxTouchPoints'), 'the touch ruling keeps both the media query and the hardware fallback');
  const cssText = readFileSync('src/style.css', 'utf8');
  let inComment = false;
  for (const raw of cssText.split('\n')) {
    let line = raw;
    if (inComment) {
      if (!line.includes('*/')) continue;
      inComment = false;
      line = line.slice(line.indexOf('*/') + 2);
    }
    line = line.replace(/\/\*.*?\*\//g, '').trim();
    if (line.startsWith('/*')) { inComment = true; continue; }
    assert.ok(!line.includes('(pointer:') && !line.includes('(hover:'), 'css owns layout only; capability queries go through body classes');
    if (line.includes('100dvh')) assert.ok(line.includes('100vh'), 'dvh needs a same-line vh fallback: ' + raw.trim());
    if (line.includes('cqw')) assert.ok(line.includes('vmin') || /(\d|\.)vw\b/.test(line), 'cqw needs a same-line vmin/vw fallback: ' + raw.trim());
  }
  assert.ok(!cssText.includes('body.wide .touchpad .tp-stick') && cssText.includes('body.wide:not(.touch) .touchpad .tp-stick'), 'wide mode must scope control stripping to :not(.touch)');
  assert.equal(ultIcon('gale'), '/icons/ult-gale.png', 'a drawn ultimate keeps its own icon');
  assert.equal(ultIcon('soyo'), DEFAULT_ULT_ICON, 'an ultimate without art uses the shared mark');
  for (const c of ROSTER) {
    try { readFileSync('public' + ultIcon(c.id), 'utf8'); }
    catch { throw Error('FAIL: ' + ultIcon(c.id) + ' is missing for ' + c.id); }
  }
  // Jump fires only at the strict outer edge, only with a mostly upward push, and only once until the stick returns.
  const up = (out: number) => ({ out, up: true });
  const side = (out: number) => ({ out, up: false });
  assert.ok(!isTouchJump(up(.6), false), 'a shallow up-push stays a walk');
  assert.ok(!isTouchJump(up(.71), false), 'just inside the outer edge still stays a walk');
  assert.ok(isTouchJump(up(.8), false), 'the strict outer edge jumps');
  assert.ok(!isTouchJump(side(.9), false), 'a sideways drag past the edge never jumps');
  assert.ok(isTouchJump(up(.8), true), 'holding at the edge does not cancel the jump');
  assert.ok(isTouchJump(up(.65), true), 'still out of the re-arm zone, the jump holds');
  assert.ok(!isTouchJump(up(.4), true), 'back inside the ring the jump re-arms');
  // A thumb at the rim leaves the stick box, and some phones never deliver pointerup. The lift still has to drop it.
  assert.equal(matchStickTouch(10, 10, { id: 3, x: 12, y: 11, t: 100 }, 130), 3, 'the touch that starts with the stick pairs by contact');
  assert.equal(matchStickTouch(10, 10, { id: 3, x: 12, y: 11, t: 100 }, 150), null, 'a leftover touch does not claim the next press');
  assert.equal(matchStickTouch(10, 10, { id: 3, x: 80, y: 10, t: 100 }, 110), null, 'a different finger does not claim the stick');
  assert.equal(touchRelease(3, [3], 1), 'stick', 'lifting the stick finger leaves another finger alone');
  assert.equal(touchRelease(3, [9], 0), 'all', 'the last finger up releases a stick whose pointerup never arrived');
  assert.equal(touchRelease(null, [1], 0), 'all', 'an unpaired stick still drops when the screen is clear');
  assert.equal(touchRelease(3, [9], 2), 'none', 'another finger lifting does not drop the stick');
  assert.equal(stickFingerGone(3, [3, 8]), false, 'a second finger does not retire the stick');
  assert.equal(stickFingerGone(3, [8]), true, 'a touch list without the stick finger means it already lifted');
  assert.equal(stickFingerGone(null, [8]), false, 'an unpaired stick is not cleared from a partial list');
  assert.equal(stickFingerGone(3, []), false, 'an empty touch list is not proof the finger lifted');
  const inputTs = readFileSync('src/game/input.ts', 'utf8');
  assert.ok(inputTs.includes("window.addEventListener('pointerup'") && inputTs.includes("window.addEventListener('pointercancel'"), 'a lift outside the stick still reaches the page');
  assert.ok(inputTs.includes("window.addEventListener('touchend'") && inputTs.includes("window.addEventListener('touchcancel'"), 'a touch the pointer stream dropped still releases the stick');
  assert.ok(inputTs.includes("window.addEventListener('blur'") && inputTs.includes('visibilitychange'), 'leaving the page cannot leave the stick latched');
  assert.ok(/\.tp-ring \{[^}]*pointer-events:\s*none/.test(cssText), 'the ring must not be the hit target');
  assert.ok(/\.tp-knob-move \{[^}]*pointer-events:\s*none/.test(cssText), 'knob travel must not move the hit target');
  assert.ok(/\.tp-knob \{[^}]*pointer-events:\s*none/.test(cssText), 'the knob face must not be the hit target');
  // Band starts just below the attack top, so a ~390px phone exempts about the bottom fifth.
  const phoneBand = thumbBandTop(297, 87);
  assert.ok(phoneBand > 297 && phoneBand - 297 < 87 * .15, 'the band starts just below the attack top');
  assert.ok((390 - phoneBand) / 390 < .28, 'a phone no longer exempts the bottom half');
}

// BGM contract: pure Web Audio only. iOS ignores a media element's volume property (the slider
// goes dead, the default attenuation is lost) and adopts a playing element as a Now Playing
// session — the Dynamic Island keeps it audible in the background past the page's suspend hooks.
{
  const bgm = readFileSync('src/audio/bgm.ts', 'utf8');
  assert.ok(!/\bnew Audio\b|createMediaElementSource/.test(bgm), 'BGM stays on Web Audio buffers: no media element, no element source node');
}

{
  const g = newGame(); const [p1] = g.fighters; dummy(g);
  p1.stun = .45;
  g.keyDown('KeyJ');
  g.keyDown('KeyW');
  run(g, .3);
  assert.equal(p1.attack, null, 'a light pressed in hitstun waits');
  assert.equal(p1.vy, 0, 'a jump pressed in hitstun waits');
  run(g, .25);
  assert.ok(p1.attack?.skill.air, 'holding jump and attack wakes up into an air normal');
  assert.ok(p1.vy < 0, 'holding jump leaves the ground when hitstun ends');
}

{
  const g = newGame(); const [p1] = g.fighters; dummy(g);
  g.keyDown('KeyJ'); run(g, STEP * 3);
  assert.ok(p1.attack && !p1.attack.skill.air, 'the light starts on the ground');
  g.keyDown('KeyW');
  g.step(STEP);
  assert.ok(p1.vy < 0, 'jump during a light leaves the ground');
  assert.ok(p1.attack?.skill.air, 'the light becomes an air attack');
  let hops = 0, rising = false;
  for (let i = 0; i < Math.round(1.6 / STEP); i++) {
    g.step(STEP);
    const up = p1.vy < 0 && p1.y < 442;
    if (up && !rising) hops++;
    rising = up;
  }
  assert.ok(hops >= 2, `held jump and attack hops again after landing, hops ${hops}`);

  const late = newGame(); const [a] = late.fighters; dummy(late);
  late.keyDown('KeyK');
  late.step(STEP);
  late.keyUp('KeyK');
  late.keyDown('KeyU');
  run(late, .4);
  assert.equal(a.attack?.index, 1, 'a skill pressed during a heavy stays buffered');
  run(late, .35);
  assert.equal(a.attack?.index, 2, 'the skill comes out when the heavy ends');

  const cool = newGame(); const [c] = cool.fighters; dummy(cool);
  c.cooldowns[2] = 2;
  cool.keyDown('KeyU');
  run(cool, .35);
  assert.equal(c.queue.length, 0, 'a press while already free still expires on cooldown');
  assert.equal(c.attack, null, 'cooldown does not release a stale skill');

  const skip = newGame(); const [s] = skip.fighters; dummy(skip);
  s.cooldowns[2] = 2;
  skip.keyDown('KeyU');
  skip.keyDown('KeyI');
  skip.step(STEP);
  assert.equal(s.attack?.index, 3, 'a ready skill skips a cooldown sitting in front of it');
  assert.ok(!s.queue.some(q => q.index === 2), 'the cooldown press does not stay queued behind it');

  const air = newGame(); const [jumper] = air.fighters; dummy(air);
  jumper.vy = -400;
  jumper.y = 443 - 200;
  air.step(STEP);
  air.keyDown('KeyJ'); air.keyUp('KeyJ');
  air.step(STEP);
  air.keyDown('KeyU');
  let dashed = false;
  for (let i = 0; i < Math.round(1.6 / STEP); i++) {
    air.step(STEP);
    if (jumper.attack?.index === 2) dashed = true;
  }
  assert.ok(dashed, 'a ground skill pressed during an air light waits until landing');

  const guard = newGame(); const [g1, g2] = guard.fighters; dummy(guard);
  g2.x = g1.x + 60; g2.facing = -1;
  const before = g2.hp;
  guard.keyDown('KeyJ'); guard.keyUp('KeyJ');
  guard.step(STEP);
  guard.keyDown('KeyS'); guard.keyUp('KeyS', false);
  let blocks = 0;
  for (let i = 0; i < Math.round(.4 / STEP); i++) {
    guard.step(STEP);
    if (g1.blocking) blocks++;
  }
  assert.ok(g2.hp < before, 'the light still connects before the block cancel');
  assert.ok(blocks >= 12, `a block tap during the light comes out, frames ${blocks}`);

  const sakiko = ROSTER.findIndex(c => c.id === 'sakiko');
  const flurry = newGame(sakiko, at('boulder')); const [f1, f2] = flurry.fighters; dummy(flurry);
  f2.x = f1.x + 50; f2.facing = -1;
  flurry.keyDown('KeyI');
  flurry.step(STEP);
  flurry.keyDown('KeyS'); flurry.keyUp('KeyS', false);
  let swings = 0, flurryBlocks = 0;
  for (let i = 0; i < Math.round(.8 / STEP); i++) {
    flurry.step(STEP);
    if (f1.attack?.index === 3) swings = Math.max(swings, f1.attack.shots);
    if (f1.blocking) flurryBlocks++;
  }
  assert.ok(swings >= 3, `block cancel waits for all three swings, saw ${swings}`);
  assert.ok(flurryBlocks > 0, 'block comes out after the flurry finishes hitting');

  const ult = newGame(); const [u] = ult.fighters; dummy(ult);
  u.energy = 100;
  ult.keyDown('KeyL');
  ult.step(STEP);
  ult.keyDown('KeyS'); ult.keyUp('KeyS', false);
  run(ult, .5);
  assert.equal(u.attack?.index, 5, 'a super does not cancel into block');
}

// taki: the abuse drains meter, 哈？breaks out and shoves behind, the ban freezes solid, the vow plays seven beats
{
  const taki = ROSTER.findIndex(c => c.id === 'taki');
  assert.ok(taki >= 0, 'taki is on the roster');
  const data = ROSTER[taki];
  assert.equal(data.trait, 'beat', 'taki keeps the beat');
  assert.equal(data.skills[2].fx, 'abuse', 'U is the abuse bubble');
  assert.equal(data.skills[2].drain, 20, 'the abuse drains 20');
  assert.equal(data.skills[3].fx, 'huh', 'I is 哈？');
  assert.equal(data.skills[3].breakout, true, '哈？ is a breakout');
  assert.equal(data.skills[4].fx, 'ban', 'O is the ban dash');
  assert.equal(data.skills[5].fx, 'vow', 'the super is the vow');
  assert.ok(.3 + .45 + vowBeatTime(VOW_BEATS - 1) <= data.skills[5].duration, 'the seven beats fit inside the vow');

  // beat: a clean jab stacks one, taking a hit shakes two
  {
    const g = newGame(taki, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 60; p2.facing = -1;
    g.keyDown('KeyJ'); run(g, .3);
    assert.equal(p1.beatStacks, 1, 'a clean hit adds a beat');
    hit(g, p2, p1, p2.data.skills[0], { hit: new Set() });
    assert.equal(p1.beatStacks, 0, 'taking a hit shakes two off');
  }

  // U: the bubble pops, drains meter and says so out loud
  {
    const g = newGame(taki, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 260; p2.facing = -1;
    p2.energy = 50;
    g.keyDown('KeyU'); run(g, 1);
    assert.ok(p2.hp < p2.data.hp, 'the bubble connects');
    assert.ok(p2.energy < 50, `the abuse drains meter, left ${p2.energy}`);
    assert.ok(g.texts.some(t => t.text.includes('气')), 'the drain announces itself');
  }

  // I: 哈？shoves a fighter standing behind her, and breaks out of a super
  {
    const g = newGame(taki, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 400; p2.x = p1.x - 180;
    const hp = p2.hp, bx = p2.x;
    g.keyDown('KeyI'); run(g, .5);
    assert.ok(p2.hp < hp, '哈？hits behind her');
    assert.ok(p2.x < bx - 40, `哈？knocks back, moved ${bx - p2.x}`);

    const escape = newGame(taki, at('boulder')); const [e1, e2] = escape.fighters; dummy(escape);
    e1.queue.push({ index: 3, ttl: .18 });
    hit(escape, e2, e1, e2.data.skills[5], { hit: new Set() });
    assert.equal(e1.hitBySuper, true, 'a super marks the combo');
    assert.equal(e1.queue[0]?.index, 3, '哈？stays buffered through a super');
    let escaped = false;
    for (let i = 0; i < Math.round(.2 / STEP); i++) {
      escape.step(STEP);
      if (e1.attack?.skill.fx === 'huh') escaped = true;
    }
    assert.ok(escaped, '哈？comes out during the super');
  }

  // O: the ban dash freezes the body — no action, no knockback, half damage, and only time lifts it
  {
    const g = newGame(taki, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90; p2.facing = -1;
    g.keyDown('KeyO'); run(g, .5);
    assert.ok(p2.ban > 2.5, `the ban applied, left ${p2.ban}`);
    assert.equal(g.attack(p2, 0), false, 'the banned fighter cannot act');
    const hp = p2.hp;
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    const taken = hp - p2.hp;
    assert.ok(taken > 9 && taken < 14, `banned damage halves, took ${taken}`);
    const x = p2.x;
    g.keys.add('ArrowRight'); run(g, .4); g.keys.delete('ArrowRight');
    assert.equal(p2.x, x, 'the banned body does not move');
    run(g, 2.6);
    assert.equal(p2.ban, 0, 'the ban expires');
    assert.equal(g.attack(p2, 0), true, 'the banned fighter acts again');
  }

  // L: the vow catches a wrist, says the line, beats seven times and launches
  {
    const g = newGame(taki, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p2.x = p1.x + 70; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL');
    run(g, .5);
    assert.equal(p1.attack?.hold, p2.id, 'the vow caught the wrist');
    assert.ok(g.texts.some(t => t.text.includes('一辈子')), 'the vow line reads');
    // Hitstop freezes the sim on every beat, so the move needs wall time beyond its 2.05s clock.
    run(g, 2.3);
    assert.equal(p1.combo, 7, 'the vow beats seven times');
    assert.ok(p2.knocked > 0, 'the last beat launches');
    assert.ok(hp - p2.hp > 120, `the solo dealt damage, ${hp - p2.hp}`);
    assert.equal(p1.attack, null, 'the vow plays out');

    const low = newGame(taki, at('boulder')); const [l1, l2] = low.fighters; dummy(low);
    l1.energy = l1.energyMax;
    l1.hp = l1.data.hp * .2;
    l2.x = l1.x + 70; l2.facing = -1;
    low.keyDown('KeyL');
    run(low, .5);
    assert.ok(low.texts.some(t => t.text.includes('祥子')), 'low health swaps the line');

    const miss = newGame(taki, at('boulder')); const [m1, m2] = miss.fighters; dummy(miss);
    m1.energy = m1.energyMax;
    m2.x = m1.x + 900;
    miss.keyDown('KeyL');
    run(miss, 1);
    assert.equal(m1.attack, null, 'a whiffed vow ends early');
    assert.equal(m2.hp, m2.data.hp, 'the whiff deals nothing');
  }
}

// rana: the riff grows per wave and stops when the key lifts, the blink passes through untouched, the parfait erupts blobs
{
  const rana = ROSTER.findIndex(c => c.id === 'rana');
  assert.ok(rana >= 0, 'rana is on the roster');
  const data = ROSTER[rana];
  assert.equal(data.trait, 'rush', 'rana is rush');
  assert.equal(data.skills[2].fx, 'riff', 'U is the riff');
  assert.equal(data.skills[2].count, 10, 'the riff caps at ten waves');
  assert.equal(data.skills[3].fx, 'wind', 'I is the blink');
  assert.equal(data.skills[3].damage, 0, 'the blink deals nothing');
  assert.equal(data.skills[4].type, 'launch', 'O is the high kick');
  assert.equal(data.skills[5].fx, 'parfait', 'the super is the parfait');

  // U: a tap strums one wave; holding the key keeps them coming
  const tap = newGame(rana, at('boulder')); const [t1, t2] = tap.fighters; dummy(tap);
  t2.invuln = 5; t2.x = t1.x + 120; t2.facing = -1;
  tap.keyDown('KeyU'); tap.keyUp('KeyU');
  let tapped = 0;
  for (let i = 0; i < Math.round(1 / STEP); i++) { tap.step(STEP); tapped = Math.max(tapped, t1.attack?.shots ?? 0); }
  assert.equal(tapped, 1, 'a tap strums one wave');
  assert.ok(Math.abs(t1.cooldowns[2] - 1) < .05, `a tap cools from 2s, saw ${t1.cooldowns[2].toFixed(2)}`);

  const held = newGame(rana, at('boulder')); const [h1, h2] = held.fighters; dummy(held);
  h2.invuln = 5; h2.x = h1.x + 120; h2.facing = -1;
  held.keyDown('KeyU');
  run(held, 4.5);
  held.keyUp('KeyU');
  assert.equal(h1.attack?.shots, 10, 'holding the key strums ten waves');
  assert.ok(Math.abs(h1.cooldowns[2] - 2.5) < .05, `a full channel cools from 7s — about 2.5s left, saw ${h1.cooldowns[2].toFixed(2)}`);

  // later waves reach past the first radius
  const far = newGame(rana, at('boulder')); const [f1, f2] = far.fighters; dummy(far);
  f2.x = f1.x + 210; f2.facing = -1;
  const fhp = f2.hp;
  far.keyDown('KeyU');
  run(far, 4.5);
  far.keyUp('KeyU');
  assert.ok(f2.hp < fhp, 'later waves reach past the first radius');

  // I: she vanishes and steps out ahead, through a body, touching nothing
  const blink = newGame(rana, at('boulder')); const [b1, b2] = blink.fighters; dummy(blink);
  b2.x = b1.x + 90; b2.facing = -1;
  const bx = b1.x, bhp = b2.hp;
  blink.keyDown('KeyI');
  run(blink, .5);
  assert.ok(b1.x - bx > 150 && b1.x - bx < 200, `the blink moves her about 192px, moved ${b1.x - bx}`);
  assert.ok(b1.x > b2.x, 'the blink passes through the body');
  assert.equal(b2.hp, bhp, 'the blink deals nothing');

  // the disc hits a jumper — the wave is a screen-facing circle, not a ground ring
  const air = newGame(rana, at('boulder')); const [a1, a2] = air.fighters; dummy(air);
  a2.x = a1.x + 100; a2.facing = -1;
  const ahp = a2.hp;
  air.keyDown('KeyU');
  for (let i = 0; i < Math.round(.8 / STEP); i++) {
    a2.y = FLOOR - 80; a2.vy = 0;
    air.step(STEP);
  }
  air.keyUp('KeyU');
  assert.ok(a2.hp < ahp, 'the wave disc hits a jumper');

  // L: the parfait stands, she is free right after, and the blobs erupt both ways
  const supe = newGame(rana, at('boulder')); const [s1, s2] = supe.fighters; dummy(supe);
  s1.energy = s1.energyMax;
  s2.x = s1.x + 260; s2.facing = -1;
  supe.keyDown('KeyL');
  run(supe, 1);
  assert.equal(s1.attack, null, 'she is free after placing the parfait');
  assert.ok(supe.projectiles.some(p => p.fx === 'parfait'), 'the parfait stands');
  run(supe, 2);
  const blobs = supe.projectiles.filter(p => p.fx === 'matcha');
  assert.ok(blobs.length >= 2, `the parfait erupts, ${blobs.length} blobs in flight`);
  assert.ok(blobs.some(p => p.vx > 0) && blobs.some(p => p.vx < 0), 'blobs fly both ways');
  const shp = s2.hp;
  run(supe, 4);
  assert.ok(s2.hp < shp, 'the blobs rain on a nearby foe');

  // clip routing: the strum loops while held, the parfait holds the arms-wide beat
  const pf = previewFighter(data, 0);
  pf.attack = { skill: data.skills[2], index: 2, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
  assert.deepEqual([clipFor(pf).col, clipFor(pf).row], [0, 0], 'the riff reads column U');
  pf.attack.t = .14;
  assert.equal(clipFor(pf).row, 1, 'strum cell one');
  pf.attack.t = .28;
  assert.equal(clipFor(pf).row, 2, 'strum cell two');
  pf.attack.t = .43;
  assert.equal(clipFor(pf).row, 0, 'the strum loops back to the reach');
  pf.attack.t = data.skills[2].duration - .3;
  assert.equal(clipFor(pf).row, 2, 'the release tail plays the recover');

  const pf2 = previewFighter(data, 0);
  pf2.attack = { skill: data.skills[5], index: 5, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
  pf2.attack.t = data.skills[5].start - .01;
  assert.equal(clipFor(pf2).row, 0, 'the parfait starts on the present');
  pf2.attack.t = data.skills[5].start + .05;
  assert.equal(clipFor(pf2).row, 1, 'arms wide');
  pf2.attack.t = data.skills[5].duration - .16;
  assert.equal(clipFor(pf2).row, 1, 'arms wide holds past 0.2s');
  pf2.attack.t = data.skills[5].duration - .1;
  assert.equal(clipFor(pf2).row, 2, 'the bow follows');
}

// arale: the flurry pins and the last punch shoves, the mega wave carries people, the flex buffs, the dream frenzies
{
  const arale = ROSTER.findIndex(c => c.id === 'arale');
  assert.ok(arale >= 0, 'arale is on the roster');
  const data = ROSTER[arale];
  assert.equal(data.trait, 'focus', 'arale is focus');
  assert.equal(data.skills[2].count, 7, '高能量 swings seven — an eighth hit can never land past the combo escape');
  assert.equal(data.skills[2].gain, 4, 'the flurry gains little meter per hit');
  assert.equal(data.skills[3].fx, 'mega', 'I is the mega wave');
  assert.equal(data.skills[3].cd, 7, '高音量 cools down in 7 seconds');
  assert.equal(data.skills[4].fx, 'muscle', 'O is the flex');
  assert.equal(data.skills[5].fx, 'dream', 'the super is the dream');
  assert.ok(data.view.kind === 'sprite' && !!data.view.frenzy, 'arale preloads a frenzy sheet');
  assert.ok(data.frenzy && data.frenzy.chain === false && data.frenzy.time === 10, 'the dream has its own frenzy config');

  // U: seven punches pin the victim, the eighth is the shove — and the meter barely moves
  {
    const g = newGame(arale, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 70; p2.facing = -1;
    const hp = p2.hp, e0 = p1.energy, x0 = p2.x;
    g.keyDown('KeyU'); run(g, 1.15);
    assert.equal(p1.combo, 7, 'the escape fires on the final punch');
    assert.ok(hp - p2.hp > 60, `the flurry dealt damage, ${hp - p2.hp}`);
    assert.equal(p2.knocked, 0, 'the shove is a knockback, not a knockdown');
    assert.ok(p2.x - x0 > 45, `the last punch shoves, moved ${p2.x - x0}`);
    assert.ok(p1.energy - e0 < 45, `the flurry gains little meter, saw ${p1.energy - e0}`);
  }

  // I: the slow wave reaches far and carries the victim with it
  {
    const g = newGame(arale, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 400; p2.facing = -1;
    const x0 = p2.x, hp = p2.hp;
    g.keyDown('KeyI'); run(g, 2.2);
    assert.ok(p2.hp < hp, 'the wave deals damage');
    assert.ok(p2.x - x0 > 150, `the wave carries them, moved ${p2.x - x0}`);
  }

  // O: the flex shoves the crowd and boosts damage ×1.3 while it holds
  {
    const g = newGame(arale, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90; p2.facing = -1;
    const px = p2.x;
    g.keyDown('KeyO'); run(g, .5);
    assert.ok(p1.muscle > 6, `the flex arms the buff, left ${p1.muscle}`);
    assert.ok(g.effects.some(e => e.type === 'muscle'), 'the flex plays its burst');
    assert.ok(p2.x > px + 30, `the flex shoves, moved ${p2.x - px}`);
    p1.combo = 0; p1.comboTime = 0;
    const boosted0 = p2.hp;
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    const boosted = boosted0 - p2.hp;
    p1.combo = 0; p1.comboTime = 0; clearMod(p1, 'dmgDealt', 'muscle');
    const base0 = p2.hp;
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    const base = base0 - p2.hp;
    assert.ok(Math.abs(boosted - base * 1.3) < 1, `the flex boosts damage ×1.3, ${base} -> ${boosted}`);
  }

  // L: the dream frenzies — faster J/K with cloned reach, no cooldown cut, no auto-heavy, gold ghosts
  {
    const g = newGame(arale, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    g.keyDown('KeyL'); run(g, .8);
    assert.ok(p1.frenzy > 9, `the dream grants frenzy, left ${p1.frenzy}`);
    assert.ok(p1.braced > 9, 'the brace runs with the frenzy');
    assert.ok(p1.noGain > 8, `the dream locks the meter for the window, left ${p1.noGain}`);
    run(g, .2); // the transformation pose plays out before the next press can come out
    g.keyDown('KeyJ'); run(g, STEP);
    assert.ok(p1.attack, 'a light comes out');
    assert.equal(p1.attack!.skill.range, Math.round(98 * 1.3), 'frenzy reach is cloned from the base skill');
    assert.ok(p1.cooldowns[0] > .2 && p1.cooldowns[0] < .25, `frenzy leaves the light cooldown alone, got ${p1.cooldowns[0]}`);
    assert.equal(clipFor(p1).sheet, 'frenzy', 'frenzy lights read the frenzy sheet');
    g.keys.add('KeyD'); run(g, .2); g.keys.delete('KeyD');
    assert.ok(g.effects.some(e => e.type === 'ghost' && e.tint === '#ffe98a'), 'walking trails the gold afterimage');

    // the true brace: supers and jabs never stagger her, the escape never fires, grabs still bite
    {
      const foe = ROSTER.findIndex(c => c.skills.some(s => s.type === 'grab')
        && c.skills.some(s => s.super && s.type !== 'grab' && !['heart', 'shout', 'ban'].includes(s.fx ?? '')));
      assert.ok(foe >= 0, 'a non-control super exists to test the brace against');
      const bg = newGame(arale, foe); const [b1, b2] = bg.fighters; dummy(bg);
      b1.energy = b1.energyMax;
      bg.keyDown('KeyL'); run(bg, 1); // cast and the transformation pose
      const superSkill = b2.data.skills.find(s => s.super)!;
      const jab = b2.data.skills[0];
      const grab = b2.data.skills.find(s => s.type === 'grab')!;
      hit(bg, b2, b1, superSkill, { hit: new Set() });
      assert.equal(b1.stun, 0, 'the brace eats a super without a flinch');
      assert.equal(b1.knocked, 0, 'the brace eats a super without a knockdown');
      assert.ok(bg.texts.some(t => t.text === '霸体'), 'the absorb pops the brace text');
      b2.combo = 30; b2.comboTime = 1;
      hit(bg, b2, b1, jab, { hit: new Set() });
      assert.equal(b1.stun, 0, 'the combo escape never fires through the brace');
      assert.equal(b1.invuln, 0, 'no escape invuln either');
      b2.combo = 0; b2.comboTime = 0; b1.braceFx = 0;
      hit(bg, b2, b1, grab, { hit: new Set() });
      assert.ok(b1.stun > 0 || b1.knocked > 0, 'a grab still locks the braced fighter');
      assert.ok(b1.energy < 2, `the gain lock holds the meter down while trading hits, got ${b1.energy}`);
    }

    const mash = newGame(arale, at('boulder')); const [j1] = mash.fighters; dummy(mash);
    j1.energy = j1.energyMax;
    mash.keyDown('KeyL');
    run(mash, 1.0);
    // the chain is off: four mashes come out as four lights, never the auto-heavy
    const presses: number[] = [];
    for (let i = 0; i < 4; i++) {
      mash.keyDown('KeyJ');
      run(mash, STEP);
      presses.push(j1.attack?.index ?? -1);
      mash.keyUp('KeyJ');
      run(mash, .4);
    }
    assert.deepEqual(presses, [0, 0, 0, 0], 'no auto-heavy: the chain stays off');
  }
}

// miyako: the yokan is a grounded poke, the marathon buffs only if the pose finishes,
// the howl is a short disc, the seal pierces and seals block plus the back-dodge
{
  const miyako = ROSTER.findIndex(c => c.id === 'miyako');
  assert.ok(miyako >= 0, 'miyako is on the roster');
  const data = ROSTER[miyako];
  assert.equal(data.trait, 'focus', 'miyako keeps the 225 walk speed');
  assert.equal(data.skills[2].fx, 'yokan', 'U is the yokan');
  assert.equal(data.skills[2].damage, 20, 'the yokan hits soft');
  assert.equal(data.skills[2].range, 186, 'the yokan reaches');
  assert.equal(data.skills[3].fx, 'marathon', 'I is the marathon');
  assert.equal(data.skills[4].fx, 'howl', 'O is the howl');
  assert.equal(data.skills[4].range, 87, 'the howl radius is a tenth of the playable stage');
  assert.equal(data.skills[5].fx, 'seal', 'the super is the seal');
  assert.equal(data.skills[5].count, 1, 'one circle, not the stock three-shot super');
  assert.equal(data.skills[5].speed, 366, 'focus brings the circle to about 421');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/miyako/seal.png'), 'the seal circle is preloaded');
  assert.equal(KUJI, '临兵斗者皆阵烈在前', 'the chant is the nine characters');
  assert.equal(kujiFlash(0.02)?.ch, '临', 'the chant opens on 临');
  assert.equal(kujiFlash(KUJI_STEP * 0.9), null, 'each character blanks before the next');
  assert.equal(kujiFlash(KUJI_STEP + 0.02)?.ch, '兵', 'the next character is 兵');
  assert.equal(kujiFlash(KUJI_STEP * 8 + 0.02)?.ch, '前', 'the chant ends on 前');
  assert.equal(kujiFlash(KUJI_STEP * KUJI.length), null, 'the chant ends once the nine have flashed');
  assert.ok(KUJI_STEP * KUJI.length < data.skills[5].duration, 'the nine flashes finish during the cast');

  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 150; p2.y = FLOOR - 8; p2.vy = -500;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, .5);
    assert.equal(p2.hp, hp, 'the smash misses a jump');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 150; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, .5);
    assert.ok(p2.hp < hp, 'the smash hits someone standing in its reach');
    assert.equal(p2.knocked, 0, 'the smash does not knock down');
    assert.ok(hp - p2.hp < 40, `the smash stays a poke, dealt ${hp - p2.hp}`);
    assert.ok(p2.frail > 1.5, `a clean smash leaves them frail, left ${p2.frail}`);
    assert.equal(p2.frailBonus, .2, 'the smash frail is +20%');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 40; p2.facing = -1; p2.blocking = true;
    hit(g, p1, p2, p1.data.skills[2], { hit: new Set() });
    assert.equal(p2.frail, 0, 'a blocked smash does not leave them frail');
    p2.blocking = false; p2.stun = 0; p2.invuln = 0;
    const jab = p1.data.skills[0];
    const hp0 = p2.hp;
    hit(g, p1, p2, jab, { hit: new Set() });
    const plain = hp0 - p2.hp;
    const reset = () => {
      p2.hp = hp0; p2.stun = 0; p2.invuln = 0; p2.frail = 0; p2.frailBonus = 0;
      p1.combo = 0; p1.comboTime = 0;
    };
    reset();
    p2.frail = 2; p2.frailBonus = .2;
    hit(g, p1, p2, jab, { hit: new Set() });
    const frail = hp0 - p2.hp;
    assert.ok(Math.abs(frail / plain - 1.2) < .02, `frail is +20%, ${plain} -> ${frail}`);
    reset();
    p1.dmgMul = 2;
    hit(g, p1, p2, jab, { hit: new Set() });
    const buffed = hp0 - p2.hp;
    reset();
    p1.dmgMul = 2;
    p2.frail = 2; p2.frailBonus = .2;
    hit(g, p1, p2, jab, { hit: new Set() });
    const both = hp0 - p2.hp;
    assert.ok(Math.abs(both / buffed - 1.2) < .02, `frail multiplies with other damage, ${buffed} -> ${both}`);
    p2.frail = 2;
    run(g, 2.15);
    assert.equal(p2.frail, 0, 'frail lasts 2 seconds');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 50; p2.facing = -1;
    g.keyDown('KeyI'); run(g, .15);
    assert.ok(p1.attack, 'the pose is playing');
    hit(g, p2, p1, p2.data.skills[1], { hit: new Set() });
    run(g, .7);
    assert.equal(p1.sprint, 0, 'an interrupted pose grants no speed');
    assert.equal(p1.poise, 0, 'an interrupted pose grants no poise');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    g.keyDown('KeyI'); run(g, .75);
    assert.ok(p1.sprint > 4, `the marathon speeds her up, left ${p1.sprint}`);
    assert.ok(p1.poise > 4, `the marathon keeps her from flinching, left ${p1.poise}`);
    const x0 = p1.x;
    g.keyDown('KeyD'); run(g, .4);
    const fast = p1.x - x0;
    clearMod(p1, 'speed');
    const x1 = p1.x;
    run(g, .4);
    const slow = p1.x - x1;
    assert.ok(fast > slow * 1.3, `the buff is about 1.45× walk, ${slow} -> ${fast}`);
    p2.x = p1.x + 50; p2.facing = -1;
    g.keyDown('KeyJ'); run(g, .05);
    const hp0 = p1.hp;
    hit(g, p2, p1, p2.data.skills[0], { hit: new Set() });
    const taken = hp0 - p1.hp;
    assert.ok(p1.attack, 'poise does not drop the jab');
    assert.equal(p1.stun, 0, 'poise does not flinch');
    assert.ok(taken > 20, `poise does not cut damage, took ${taken}`);
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 60; p2.facing = -1;
    const x0 = p2.x, hp = p2.hp;
    g.keyDown('KeyO'); run(g, .6);
    assert.ok(p2.hp < hp, 'the howl hits inside the circle');
    assert.ok(p2.x - x0 > 40, `the howl shoves, moved ${p2.x - x0}`);
    assert.equal(p2.knocked, 0, 'the howl does not knock down');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 130; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO'); run(g, .6);
    assert.equal(p2.hp, hp, 'the howl misses past its radius');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 40; p2.facing = -1;
    const jab = p2.data.skills[0];
    const hp0 = p1.hp;
    hit(g, p2, p1, jab, { hit: new Set() });
    const plain = hp0 - p1.hp;
    p1.hp = hp0; p1.stun = 0; p1.invuln = 0; p2.combo = 0; p2.comboTime = 0;
    g.keyDown('KeyO'); run(g, .05);
    assert.equal(p1.attack?.skill.fx, 'howl', 'the howl is out');
    hit(g, p2, p1, jab, { hit: new Set() });
    const taken = hp0 - p1.hp;
    assert.equal(p1.stun, 0, 'the howl brace does not flinch');
    assert.equal(p1.attack?.skill.fx, 'howl', 'a jab does not drop the howl');
    assert.ok(Math.abs(taken - plain * .67) < 1, `the howl brace cuts damage like the dream, ${plain} -> ${taken}`);
    hit(g, p2, p1, { ...jab, super: true }, { hit: new Set() });
    assert.equal(p1.stun, 0, 'a super does not drop the howl');
    assert.equal(p1.attack?.skill.fx, 'howl', 'the howl is still playing');
    assert.ok(g.texts.some(t => t.text === '霸体'), 'the howl pops the brace text');
    p2.combo = 30; p2.comboTime = 1;
    hit(g, p2, p1, jab, { hit: new Set() });
    assert.equal(p1.invuln, 0, 'the combo escape does not fire through the howl');
    hit(g, p2, p1, { ...jab, type: 'grab', fx: 'grab' }, { hit: new Set() });
    assert.ok(p1.stun > 0 || p1.knocked > 0, 'a grab still breaks the howl');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p2.x = p1.x + 90; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL'); run(g, 1.3);
    assert.ok(hp - p2.hp > 100, `the circle ticks more than once, dealt ${hp - p2.hp}`);
    assert.ok(p2.purge > 1, `a clean hit seals block and dodge, left ${p2.purge}`);
    assert.equal(p2.knocked, 0, 'the circle does not knock down');
    g.keyDown('ArrowDown'); run(g, .05); g.keyUp('ArrowDown'); run(g, .08);
    assert.equal(p2.dodge, 0, 'purge eats the back-dodge');
    assert.equal(p2.blocking, false, 'purge eats the block');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.blocking = true; p2.facing = -1; p2.x = p1.x + 40;
    hit(g, p1, p2, p1.data.skills[5], { hit: new Set() }, p1.x);
    assert.equal(p2.purge, 0, 'a blocked circle does not seal');
    p2.blocking = false; p2.invuln = 0; p2.stun = 0;
    hit(g, p1, p2, { ...p1.data.skills[5], knock: 280 }, { hit: new Set() }, p1.x);
    assert.ok(p2.purge > 2, 'a clean hit seals');
    assert.equal(p2.knocked, 0, 'even the last tick stays on their feet');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p2.x = p1.x + 500;
    g.keyDown('KeyL'); run(g, .7);
    const seal = g.projectiles.find(p => p.fx === 'seal');
    assert.ok(seal, 'the circle is in the air');
    g.projectiles.push({ ...seal!, owner: p2.id, fx: 'orb', vx: -(seal!.vx || 1), hit: new Set(), trail: [] });
    run(g, STEP);
    assert.ok(g.projectiles.some(p => p.fx === 'seal' && p.life > 0), 'a shot does not break the circle');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p2.x = p1.x + 400;
    g.keyDown('KeyL'); run(g, .7);
    const seal = g.projectiles.find(p => p.fx === 'seal');
    assert.ok(seal, 'the circle is in the air for the swell');
    assert.equal(seal!.swell ?? 0, 0, 'a miss stays at the resting size');
    p2.x = seal!.x; p2.y = FLOOR;
    run(g, STEP);
    assert.ok((seal!.swell ?? 0) > 0 && (seal!.swell ?? 0) < 1, 'the circle starts growing on contact');
    run(g, .15);
    assert.equal(seal!.swell, 1, 'the circle finishes growing while it is on a body');
    p2.x = seal!.x + 400;
    run(g, .15);
    assert.equal(seal!.swell ?? 0, 0, 'the circle eases back once it is on nobody');
    const size = 140;
    const right = sealSwell(size, 400, 1);
    assert.ok(Math.abs(right.scale - 1.7) < 1e-9, 'a hit grows the circle by about 70%');
    assert.ok(Math.abs((right.shift - size * right.scale / 2) - (-size / 2)) < 1e-6, 'flying right, the left edge stays');
    const left = sealSwell(size, -400, 1);
    assert.ok(Math.abs((left.shift + size * left.scale / 2) - (size / 2)) < 1e-6, 'flying left, the right edge stays');
    assert.equal(sealSwell(size, 400, 0).shift, 0, 'at rest the circle is centred');
  }
  {
    const g = newGame(miyako, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p1.facing = 1;
    p2.facing = -1;
    p2.x = X_MAX;
    const speed = 366 * 1.15;
    // The circle dies while still on the wall body, which used to cut the later ticks.
    p1.x = X_MAX - 53 - speed * 0.6;
    const hp = p2.hp;
    g.keyDown('KeyL');
    let born = 0;
    let far = 0;
    let left = false;
    for (let i = 0; i < Math.round(2.4 / STEP); i++) {
      g.step(STEP);
      const seal = g.projectiles.find(p => p.fx === 'seal');
      if (seal) {
        if (!born) born = seal.x;
        far = Math.max(far, seal.x);
      }
      if (!left && p2.hp < hp) { p2.y = 80; left = true; }
    }
    const taken = hp - p2.hp;
    const arm = p2.data.trait === 'armor' ? .95 : 1;
    let expect = 0;
    for (let n = 0; n < 6; n++) expect += 36 * arm * Math.max(.4, 1 - n * COMBO_DECAY);
    assert.ok(left, 'the wall circle connects');
    assert.ok(Math.abs(taken - expect) < .02, `a wall hit pays all six ticks, dealt ${taken}, wanted ${expect}`);
    assert.ok(far > born + speed * 0.7 * 0.9, `the circle still flies its distance, moved ${far - born}`);
  }
}

// 峰月律: the slam knocks down, the skewer passes through, the steak braces, the feast locks J/K and heals
{
  const ritsu = ROSTER.findIndex(c => c.id === 'ritsu');
  assert.ok(ritsu >= 0, 'ritsu is on the roster');
  const data = ROSTER[ritsu];
  assert.equal(data.trait, 'armor', 'ritsu is the armor tank');
  assert.equal(data.hp, 1040, 'armor hp');
  assert.equal(data.skills[2].fx, 'rib', 'U is the bone-in slam');
  assert.equal(data.skills[2].type, 'sweep', 'the slam only hits the ground');
  assert.equal(data.skills[3].fx, 'skewer', 'I is the skewer dash');
  assert.equal(data.skills[3].speed, 668, 'the dash speed is the four-tenths travel');
  assert.equal(data.skills[4].fx, 'steak', 'O is the steak');
  assert.equal(data.skills[5].fx, 'feast', 'the super is the feast');
  assert.equal(data.skills[5].super, true, 'L is the super');

  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = 80;
    g.keyDown('KeyU'); run(g, .1);
    assert.equal(clipFor(p1).ox, RIB_OX[0], 'the slam windup shifts back out');
    run(g, .15);
    assert.equal(clipFor(p1).ox, RIB_OX[1], 'the slam hit shifts back out');
    g.keyUp('KeyU');
    run(g, 1);
    g.keyDown('KeyI'); run(g, .05);
    assert.equal(clipFor(p1).ox, SKEWER_OX[0], 'the skewer windup shifts back out');
    g.keyUp('KeyI');
    run(g, 1);
    g.keyDown('KeyO'); run(g, .1);
    assert.equal(clipFor(p1).ox, STEAK_OX[0], 'the steak windup shifts back out');
  }

  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 80; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, .7);
    assert.ok(hp - p2.hp > 60, `the slam hurts, dealt ${hp - p2.hp}`);
    assert.ok(p2.knocked > 0, 'the slam knocks down');
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 70; p2.facing = -1;
    p2.y = FLOOR - 1; p2.vy = -600;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, .6);
    assert.equal(p2.hp, hp, 'a jump clears the slam');
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = 80;
    const x0 = p1.x;
    g.keyDown('KeyI'); run(g, .9);
    const moved = p1.x - x0;
    assert.ok(moved > 370 && moved < 400, `the skewer travels about 384px, moved ${moved}`);
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 70; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI'); run(g, .9);
    assert.ok(p2.hp < hp, 'the skewer hits someone on the path');
    assert.equal(p1.combo, 1, 'each body is hit once');
    assert.equal(p2.knocked, 0, 'the skewer does not knock down');
    assert.ok(p1.x > p2.x, 'the dash keeps going after the hit');
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 50; p2.facing = -1;
    p2.y = FLOOR - 1; p2.vy = -600;
    const hp = p2.hp;
    g.keyDown('KeyI'); run(g, .9);
    assert.equal(p2.hp, hp, 'a jump clears the skewer');
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 50; p2.facing = -1;
    p1.hp = 400;
    g.keyDown('KeyO'); run(g, .15);
    hit(g, p2, p1, p2.data.skills[0], { hit: new Set() });
    assert.ok(p1.hp < 400, 'the wind-up can be hit');
    assert.ok(p1.hp < 440, 'an interrupted bite does not heal');
    assert.equal(p1.braced, 0, 'an interrupted bite does not brace');
    assert.equal(p1.attack, null, 'the hit cancels the bite');
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1] = g.fighters; dummy(g);
    p1.hp = 400;
    g.keyDown('KeyO'); run(g, .5);
    assert.equal(p1.hp, 440, 'the bite heals 40');
    assert.ok(p1.braced > 3.4 && p1.braced <= 4, `the steak braces for 4 seconds, left ${p1.braced}`);
    const foe = g.fighters[1];
    foe.x = p1.x + 50; foe.facing = -1;
    hit(g, foe, p1, foe.data.skills[0], { hit: new Set() });
    assert.equal(p1.stun, 0, 'the steak brace does not flinch');
  }
  {
    const g = newGame(ritsu, at('gale')); const [p1] = g.fighters; dummy(g);
    p1.energy = 100;
    p1.hp = 400;
    g.keyDown('KeyL'); run(g, 1);
    assert.equal(p1.attack, null, 'the feast pose has finished');
    assert.ok(p1.feast > 5, `the feast lasts 6 seconds, left ${p1.feast}`);
    assert.ok(p1.braced > 5, `the feast braces for 6 seconds, left ${p1.braced}`);
    assert.ok(p1.noGain > 4, `the feast locks gains for the window, left ${p1.noGain}`);
    assert.ok(p1.energy < 1, `the lock holds the bar down, got ${p1.energy}`);
    assert.ok(p1.hp > 400, 'the feast has started healing');
    const hp = p1.hp;
    g.keyDown('KeyJ'); run(g, .3);
    assert.equal(p1.attack, null, 'J does nothing during the feast');
    g.keyUp('KeyJ');
    assert.ok(p1.hp > hp + 4, `the feast heals about 18 a second, gained ${p1.hp - hp}`);
    g.keyDown('KeyU'); run(g, .1);
    assert.equal(p1.attack?.skill.fx, 'rib', 'U still comes out during the feast');
  }
}

// nonoka: the bite pins without a knockdown, the fifth kiss knocks down,
// the copy stands behind the foe, and the king form is staff normals only
{
  const nonoka = ROSTER.findIndex(c => c.id === 'nonoka');
  assert.ok(nonoka >= 0, 'nonoka is on the roster');
  const data = ROSTER[nonoka];
  assert.equal(data.skills[2].fx, 'rabbit', 'U is the bite');
  assert.equal(data.skills[3].fx, 'kiss', 'I is the kiss');
  assert.equal(data.skills[4].fx, 'half', 'O is the copy');
  assert.equal(data.skills[5].fx, 'king', 'L is the king');
  assert.equal(data.frenzy?.time, 7, 'the king lasts 7 seconds');
  assert.equal(data.frenzy?.lock, true, 'the king locks the other skills');
  assert.ok(data.view.kind === 'sprite' && !!data.view.king, 'nonoka preloads the king common sheet');
  assert.equal(data.view.kind === 'sprite' && data.view.kingScale, 1.1, 'the king sheet is drawn 1.1× so the body matches');

  {
    const g = newGame(nonoka, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 120; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU');
    run(g, 1.6);
    assert.ok(hp - p2.hp > 45 && hp - p2.hp < 55, `three bites land, dealt ${hp - p2.hp}`);
    assert.equal(p2.knocked, 0, 'the bite does not knock down');
    assert.equal(p1.attack, null, 'the bite lets go');
    const x = p1.x;
    g.keyDown('KeyD'); run(g, .3);
    assert.ok(p1.x > x + 20, `she can walk after the bite, moved ${p1.x - x}`);
  }
  {
    const g = newGame(nonoka, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 50; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI');
    let hearts = 0;
    let fresh = 0;
    for (let i = 0; i < Math.round(1.7 / STEP); i++) {
      g.step(STEP);
      const born = g.effects.filter(e => e.type === 'kiss' && e.life === e.max).length;
      if (born > fresh) hearts += born - fresh;
      fresh = born;
    }
    assert.equal(hearts, 5, `five heart pulses on the kisses, saw ${hearts}`);
    assert.ok(hp - p2.hp > 38 && hp - p2.hp < 48, `the kisses land, dealt ${hp - p2.hp}`);
    assert.ok(p2.knocked > 0, 'the fifth kiss knocks down');
    run(g, .6);
    assert.equal(p1.attack, null, 'the kiss lets go');
    const x = p1.x;
    g.keyDown('KeyD'); run(g, .3);
    assert.ok(p1.x > x + 20, `she can walk after the kiss, moved ${p1.x - x}`);
  }
  {
    const g = newGame(nonoka, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 280; p2.facing = -1;
    g.keyDown('KeyO');
    run(g, .6);
    const copy = g.fighters.find(f => f.minion);
    assert.ok(copy, 'a copy takes the stage');
    assert.equal(copy!.data.hp, 200, 'the copy has a fifth of her health');
    assert.equal(copy!.hp, 200, 'the copy starts full');
    assert.equal(copy!.dmgMul, .3, 'the copy hits for three tenths');
    assert.equal(copy!.basic, true, 'the copy only has normals');
    assert.ok((copy!.life ?? 0) > 5, 'the copy lasts about 6 seconds');
    assert.ok(copy!.x > p2.x, `the copy stands behind a left-facing foe, at ${copy!.x} vs ${p2.x}`);
    assert.equal(g.attack(copy!, 2), false, 'the copy cannot bite');
    assert.equal(g.attack(copy!, 0), true, 'the copy can jab');
    copy!.attack = null;
    const hp = p2.hp;
    hit(g, copy!, p2, copy!.data.skills[0], { hit: new Set() });
    assert.ok(p2.hp < hp && hp - p2.hp < 14, `the jab is soft, dealt ${hp - p2.hp}`);
    run(g, .5);
    assert.equal(p1.attack, null, 'the summon lets go');
    const x = p1.x;
    g.keyDown('KeyD'); run(g, .3);
    assert.ok(p1.x > x + 20, `she can walk after the summon, moved ${p1.x - x}`);
  }
  {
    const g = newGame(nonoka, at('gale')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 100; p2.facing = -1;
    const px = p2.x;
    p1.energy = p1.energyMax;
    g.keyDown('KeyL');
    run(g, 1.05);
    assert.ok(p1.frenzy > 6, `the king lasts 7 seconds, left ${p1.frenzy}`);
    assert.ok(p1.noGain > 6, 'the king cannot gain meter');
    assert.equal(p1.king, true, 'the king sheet is on');
    assert.equal(p1.braced, 0, 'the king is not armoured');
    assert.ok(p2.x > px + 20, `the cape pushes, moved ${p2.x - px}`);
    assert.equal(g.attack(p1, 2), false, 'specials are locked');
    p1.cooldowns[0] = 0;
    assert.equal(g.attack(p1, 0), true, 'the staff jab comes out');
    assert.equal(p1.attack!.skill.range, Math.round(98 * 1.65), 'staff reach');
    assert.equal(p1.attack!.skill.damage, Math.round(26 * 1.55), 'staff damage');
    assert.ok(p1.cooldowns[0] > .4 && p1.cooldowns[0] < .55, `staff light cooldown is doubled, got ${p1.cooldowns[0]}`);
    assert.equal(clipFor(p1).sheet, 'common', 'the king swing stays on the common grid');
    run(g, .12);
    assert.ok(!g.effects.some(e => e.type === 'ghost'), 'the staff swing leaves no afterimage');
    p1.attack = null;
    p1.cooldowns[0] = 0;
    p1.y = FLOOR - 80;
    p1.vy = -40;
    assert.equal(g.attack(p1, 0), true, 'the air staff comes out');
    assert.equal(p1.attack!.skill.air, true, 'the air jab is the shared air normal');
    assert.equal(p1.attack!.skill.range, Math.round(100 * 1.65), 'air staff reach');
    assert.equal(p1.attack!.skill.damage, Math.round(24 * 1.55), 'air staff damage');
    p1.attack = null;
    p1.y = FLOOR;
    p1.vy = 0;
    const x = p1.x;
    g.keyDown('KeyD'); run(g, .3);
    assert.ok(p1.x > x + 20, `she can walk in the king form, moved ${p1.x - x}`);
    assert.ok(!g.effects.some(e => e.type === 'ghost'), 'walking in the king form leaves no afterimage');
  }
  {
    const g = newGame(nonoka, at('gale')); const [p1] = g.fighters; dummy(g);
    g.keyDown('KeyJ'); run(g, .5);
    assert.equal(p1.attack, null, 'the jab lets go');
    const x = p1.x;
    g.keyDown('KeyD'); run(g, .3);
    assert.ok(p1.x > x + 20, `she can walk after the jab, moved ${p1.x - x}`);
  }
}

// yuno: tap ring, held notes, piercing meat, a lane that does not stun, and a billed super that cannot regen
{
  const yuno = ROSTER.findIndex(c => c.id === 'yuno');
  assert.ok(yuno >= 0, 'yuno is on the roster');
  const data = ROSTER[yuno];
  assert.equal(data.skills[2].count, 6, '韵律直觉 caps at six pulses');
  assert.equal(data.skills[2].fx, 'groove', '韵律直觉 is the groove');
  assert.equal(data.skills[3].fx, 'meat', '带骨肉 is the meat');
  assert.equal(data.skills[3].gain, 4, 'meat does not feed the super');
  assert.equal(data.skills[4].count, 18, '作曲 rains eighteen ticks');
  assert.equal(data.skills[5].fx, 'infinite', '直接无限大 is the bill');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/yuno/meat.png'), 'the meat is preloaded');

  const tap = newGame(yuno, at('boulder')); const [t1] = tap.fighters; dummy(tap);
  tap.fighters[1].x = 80;
  tap.keyDown('KeyU');
  run(tap, .05);
  tap.keyUp('KeyU');
  run(tap, 1.2);
  assert.equal(tap.projectiles.filter(p => p.fx === 'groove-note').length, 0, 'a tap throws no notes');
  assert.ok(t1.cooldowns[2] > 1 && t1.cooldowns[2] < 3, `tap cooldown stays near 3s, left ${t1.cooldowns[2]}`);

  const held = newGame(yuno, at('boulder')); dummy(held);
  held.fighters[1].invuln = 9;
  held.fighters[1].x = 80;
  held.keyDown('KeyU');
  run(held, 2.4);
  const notes = held.projectiles.filter(p => p.fx === 'groove-note').length;
  assert.ok(notes >= 4, `holding the groove fires notes, saw ${notes}`);

  const g = newGame(yuno, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
  const hp = p2.hp;
  g.keyDown('KeyI');
  run(g, .4);
  const shot = g.projectiles.find(p => p.fx === 'meat');
  if (!shot) throw Error('FAIL: 带骨肉 spawns');
  const outbound = shot.vx;
  run(g, 1.6);
  assert.ok(shot.life > 0, 'meat stays up after a hit');
  assert.ok(p2.hp < hp, 'meat still hurts on the way through');
  assert.ok(outbound > 0 && shot.vx < 0, `meat bounces off the far side, vx ${shot.vx}`);
  // Stand behind the returning chunk so it cannot pick itself up before the cooldown ends.
  p1.x = X_MAX;
  run(g, 1.5);
  g.keyDown('KeyI');
  run(g, .3);
  assert.equal(g.projectiles.filter(p => p.fx === 'meat').length, 1, 'a second throw does not stack');
  p1.x = shot.x;
  p1.y = FLOOR;
  run(g, .05);
  assert.equal(g.projectiles.filter(p => p.fx === 'meat' && p.life > 0).length, 0, 'touching the meat picks it up');

  const rain = newGame(yuno, at('boulder')); const [r1, r2] = rain.fighters; dummy(rain);
  r2.x = r1.x + 140;
  r2.facing = -1;
  const before = r2.hp;
  const energy = r1.energy;
  rain.keyDown('KeyO');
  run(rain, 1);
  assert.ok(r2.hp < before - 100, `standing in the lane hurts, lost ${before - r2.hp}`);
  assert.equal(r2.stun, 0, 'the lane does not stun');
  assert.ok(r1.energy - energy < 4, `the lane grants no hit energy, gained ${r1.energy - energy}`);

  const supe = newGame(yuno, at('boulder')); const [s1, s2] = supe.fighters; dummy(supe);
  s1.energy = 100;
  s2.x = 80;
  supe.keyDown('KeyL');
  run(supe, .75);
  assert.equal(s1.energy, 0, 'the super spends the bar');
  assert.ok(s1.noGain > 3, `gains are locked, left ${s1.noGain}`);
  assert.ok(s1.debt > 3, `the bill window is open, left ${s1.debt}`);
  const full = s1.hp;
  hit(supe, s2, s1, s2.data.skills[1], { hit: new Set() });
  assert.equal(s1.hp, full, 'a hit during the window does not spend hp');
  assert.ok(s1.debtDmg > 40, `the hit is billed, saw ${s1.debtDmg}`);
  assert.equal(s1.energy, 0, 'the window does not refund energy');
  const owed = Math.round(s1.debtDmg * 1.5);
  run(supe, s1.debt + .05);
  assert.equal(s1.debt, 0, 'the window ends');
  assert.equal(s1.hp, full - owed, `the bill is 150%, wanted ${full - owed} got ${s1.hp}`);
}

// viola: the snip pins four cuts, a blocked snip does not siphon, the violet warps to the far edge,
// the echo replays the tape unhittable, and the arrow detonates a quarter of the stage
{
  const viola = ROSTER.findIndex(c => c.id === 'viola');
  assert.ok(viola >= 0, 'viola is on the roster');
  const data = ROSTER[viola];
  assert.equal(data.trait, 'armor', 'viola is armor');
  assert.equal(data.skills[2].fx, 'snip', 'U is the snip');
  assert.equal(data.skills[2].count, 4, 'the snip lands four cuts');
  assert.equal(data.skills[3].fx, 'violet', 'I is the violet');
  assert.equal(data.skills[4].fx, 'record', 'O is the record');
  assert.equal(data.skills[5].fx, 'fuga', 'the super is the fuga');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/viola/fuga-burst.png'), 'the blast sheet is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/viola/fuga-arrow.png'), 'the arrow is preloaded');

  // U: standing in the marked spot pays the whole string; the finale shoves without a knockdown
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 200; p2.facing = -1;
    const hp = p2.hp, x0 = p2.x;
    g.keyDown('KeyU'); run(g, 1.5);
    assert.equal(p1.combo, 4, 'the snip lands four cuts');
    assert.ok(hp - p2.hp > 50, `the volley dealt damage, ${hp - p2.hp}`);
    assert.equal(p2.knocked, 0, 'the cuts pin, the finale only shoves');
    assert.ok(Math.abs(p2.x - x0) > 20, `the finale shoves, moved ${Math.abs(p2.x - x0)}`);
  }
  // U: leave the marked spot during the wind-up — the field plants on the frozen spot and misses
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 200; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU');
    run(g, .2);
    g.keyDown('ArrowDown'); run(g, .05); g.keyUp('ArrowDown');
    run(g, .6);
    const field = g.projectiles.find(p => p.fx === 'snip');
    assert.ok(field, 'the field still plants where she read them');
    assert.ok(Math.abs(field!.x - (p1.x + 200)) < 2, `the field froze on the marked spot, at ${field!.x}`);
    run(g, .7);
    assert.equal(p2.hp, hp, 'leaving the marked spot dodges the cuts');
  }
  // U: the lock reaches across the whole stage
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = X_MAX; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, 1.5);
    assert.equal(p1.combo, 4, 'the cut reaches across the stage');
    assert.ok(hp - p2.hp > 50, `the far cut dealt damage, ${hp - p2.hp}`);
  }
  // U: blocking the cuts chips and grinds the guard, but her meter stays put
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 200; p2.facing = -1;
    g.keyDown('ArrowDown'); run(g, .1);
    assert.ok(p2.blocking, 'holding block');
    p1.energy = 50;
    const before = p1.energy, hp = p2.hp;
    g.keyDown('KeyU'); run(g, 1.5);
    assert.ok(hp - p2.hp < 20, `blocking the snip chips, took ${hp - p2.hp}`);
    assert.ok(p1.energy >= before, `a blocked snip does not siphon meter, saw ${p1.energy - before}`);
    assert.ok(p2.guard < 100, 'the cuts grind the guard');
  }
  // I: the departure burst catches a close foe and she reappears on the far edge
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = p1.x + 90; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI'); run(g, .35);
    assert.ok(p2.hp < hp, 'the departure burst caught the foe');
    assert.ok(g.effects.some(e => e.type === 'violet'), 'the petals played');
    run(g, .45);
    assert.ok(p1.x > 900, `she reappeared on the far edge, x=${p1.x}`);
    assert.ok(!violetHidden(p1), 'she is visible again');
  }
  {
    const g = newGame(viola, at('boulder')); const [p1] = g.fighters; dummy(g);
    g.keyDown('KeyI'); run(g, .4);
    assert.ok(violetHidden(p1), 'she is gone mid-warp');
  }
  // O: cast, walk, jab — the echo replays the walk and the jab, and nothing can touch it
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 220; p2.facing = -1;
    p2.invuln = 99;
    g.keyDown('KeyO'); run(g, .5);
    const echo = g.fighters.find(f => f.echo);
    assert.ok(echo, 'the stand-in is on stage');
    assert.ok(echo!.master === p1.id, 'the echo answers to her');
    g.keys.add('KeyD'); run(g, 1.0); g.keys.delete('KeyD');
    g.keyDown('KeyJ'); run(g, .3); g.keyUp('KeyJ');
    assert.ok(p1.recLeft > 0 && p1.recLeft < 3.5, 'the tape is rolling');
    assert.ok(p2.hp === p2.data.hp, 'the recorded jab whiffs on the untouchable dummy');
    p2.invuln = 0;
    run(g, 2.6);
    assert.ok(echo!.tape?.playing, 'the playback started');
    const hp = p2.hp;
    run(g, 2.5);
    assert.ok(p2.hp < hp, `the echo replayed the jab, dealt ${hp - p2.hp}`);
    assert.equal(hit(g, p2, echo!, p2.data.skills[0], { hit: new Set() }), false, 'the echo cannot be hit');
  }
  // O: a recorded hop and jab replay exactly once — the tape never loops back on itself
  {
    const g = newGame(viola, at('boulder')); const [p1] = g.fighters; dummy(g);
    g.fighters[1].invuln = 99;
    g.keyDown('KeyO'); run(g, .6);
    g.keyDown('KeyW'); run(g, .15); g.keyUp('KeyW');
    g.keyDown('KeyJ'); run(g, .3); g.keyUp('KeyJ');
    run(g, 3.0);
    const echo = g.fighters.find(f => f.echo)!;
    assert.ok(echo.tape?.playing, 'the playback started');
    let jumps = 0, wasAir = false, casts = 0;
    for (let i = 0; i < Math.round(4 / STEP); i++) {
      const serial = echo.attackSerial;
      g.step(STEP);
      if (echo.attackSerial > serial) casts++;
      const air = echo.y < FLOOR - .5;
      if (air && !wasAir) jumps++;
      wasAir = air;
    }
    assert.equal(jumps, 1, `one recorded hop replays once, saw ${jumps}`);
    assert.equal(casts, 1, `one recorded jab replays once, saw ${casts}`);
  }
  // L: the arrow flies level, she is free at once, and the blast eats a quarter of the stage
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 100;
    p1.x = 200; p2.x = 700; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL'); run(g, .9);
    assert.equal(p1.attack, null, 'she is free the moment the arrow leaves');
    const arrow = g.projectiles.find(p => p.fx === 'fuga');
    assert.ok(arrow, 'the arrow is in the air');
    assert.equal(arrow!.vx, 300, `the arrow flies at its own speed, vx ${arrow!.vx}`);
    // 300 px/s makes contact about 1.8s in; sample inside the blast's 0.6s effect window.
    run(g, 1.2);
    assert.ok(hp - p2.hp > 120, `the blast caught the standing foe, dealt ${hp - p2.hp}`);
    assert.ok(g.projectiles.every(p => p.fx !== 'fuga'), 'the arrow is gone');
    assert.ok(g.effects.some(e => e.type === 'fuga-burst'), 'the blast played');
  }
  // L: a full jump clears the arrow and stands outside the edge blast
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 100;
    p1.x = 200; p2.x = 640; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL'); run(g, .9);
    for (let i = 0; i < Math.round(3 / STEP); i++) {
      p2.y = FLOOR - 105; p2.vy = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'a full jump clears the arrow and the blast');
  }
  // L: the blast reads friends too — a mid-range catch blows her up along with the foe
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 100;
    p1.x = 200; p2.x = 400; p2.facing = -1;
    const hp1 = p1.hp, hp2 = p2.hp;
    g.keyDown('KeyL'); run(g, 1.3);
    assert.ok(hp2 - p2.hp > 100, `the blast caught the foe, dealt ${hp2 - p2.hp}`);
    assert.ok(hp1 - p1.hp > 100, `the blast catches her too, took ${hp1 - p1.hp}`);
  }
  // L: point-blank burns her as well — the fuse outlives the cast invuln
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 100;
    p2.x = p1.x + 60; p2.facing = -1;
    const hp1 = p1.hp, hp2 = p2.hp;
    g.keyDown('KeyL'); run(g, 1.2);
    assert.ok(hp2 - p2.hp > 100, `the point-blank blast caught the foe, dealt ${hp2 - p2.hp}`);
    assert.ok(hp1 - p1.hp > 100, `hugging the foe burns her too, took ${hp1 - p1.hp}`);
  }
  // clips: U/I/O/L columns, and the vanish hides mid-warp
  {
    const pf = previewFighter(data, 0);
    pf.attack = { skill: data.skills[2], index: 2, serial: 1, t: .2, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 0, 'the snip reads column U');
    pf.attack = { skill: data.skills[3], index: 3, serial: 2, t: data.skills[3].start + .1, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.ok(violetHidden(pf), 'she is hidden mid-warp');
    assert.equal(clipFor(pf).col, 1, 'the violet reads column I');
    pf.attack = { skill: data.skills[4], index: 4, serial: 3, t: .3, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 2, 'the record reads column O');
    pf.attack = { skill: data.skills[5], index: 5, serial: 4, t: .3, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 3, 'the fuga reads column L');
  }
}

// the figure scale has one home; the 128-era 0.58 must never come back (file scan lives in checkSheetScale)
assert.equal(SHEET_SCALE, 1.16, 'SHEET_SCALE fills a 256 cell');

// mana: the donut rolls two flavours (strawberry roots, chocolate frails), the crown sends five
// growing waves, the wink roots slowly, and the world super freezes the clock then roots everyone
{
  const mana = ROSTER.findIndex(c => c.id === 'mana');
  assert.ok(mana >= 0, 'mana is on the roster');
  const data = ROSTER[mana];
  assert.equal(data.trait, 'focus', 'mana is focus');
  assert.equal(data.skills[2].fx, 'donut', 'U is the donut');
  assert.equal(data.skills[3].fx, 'crown', 'I is the crown');
  assert.equal(data.skills[3].count, 5, 'the crown sends five waves');
  assert.equal(data.skills[4].fx, 'wink', 'O is the wink');
  assert.equal(data.skills[4].root, 2.5, 'the wink roots 2.5s');
  assert.equal(data.skills[4].rootBreak, 0, 'the wink root ignores clean hits');
  assert.equal(data.skills[5].fx, 'world', 'the super is the world');
  assert.equal(data.skills[5].root, 3, 'the pulse roots three seconds');
  assert.equal(data.skills[5].rootLevel, 'freeze', 'the super is the time-stop tier');
  assert.ok(data.view.kind === 'sprite' && data.view.world === '/sprites/mana/world.png', 'the dance sheet is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/mana/heart.png'), 'the heart is preloaded');

  // U: the rolled flavour decides the payoff — strawberry roots, chocolate frails
  {
    const g = newGame(mana, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 300; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, 1.4);
    assert.ok(g.projectiles.every(p => p.fx !== 'donut'), 'the donut flies with a rolled flavour');
    assert.ok(hp - p2.hp > 10, `the donut connected, dealt ${hp - p2.hp}`);
    if (p2.frail > 0) assert.ok(p2.frailBonus === .25 && p2.root === 0, 'the chocolate frail reads +25% and never roots');
    else assert.ok(p2.root > 0, `the strawberry root holds, left ${p2.root}`);
  }
  // U: direct hits pin the exact control numbers (the variant copies the root fields at the cast)
  {
    const g = newGame(mana, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    const straw = { ...data.skills[2], fx: 'donut-straw', knock: 0, root: 2, rootBreak: 0, rootPin: true };
    hit(g, p1, p2, straw, { hit: new Set() });
    assert.ok(p2.root > 1.9 && p2.root <= 2.01, `the strawberry roots two seconds, left ${p2.root}`);
    assert.equal(p2.rootBreak, 0, 'the strawberry root has no hit counter');
    assert.equal(p2.vx, 0, 'the strawberry does not knock back');
    hit(g, p1, p2, straw, { hit: new Set() });
    assert.ok(p2.root > 1.9, 'clean hits never break the strawberry root');
  }
  {
    const g = newGame(mana, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    hit(g, p1, p2, { ...data.skills[2], fx: 'donut-choc', frail: 3.5, frailBonus: .25, knock: 150 }, { hit: new Set() });
    assert.equal(p2.root, 0, 'the chocolate never roots');
    assert.ok(p2.frail > 3, `the chocolate frails 3.5s, left ${p2.frail}`);
    assert.equal(p2.frailBonus, .25, 'the chocolate frail is +25%');
  }
  // the frail bonus really boosts damage by its fraction
  {
    const clean = newGame(at('boulder'), at('boulder')); const [c1, c2] = clean.fighters; dummy(clean);
    const hp = c2.hp;
    hit(clean, c1, c2, c1.data.skills[0], { hit: new Set() });
    const base = hp - c2.hp;
    const frailed = newGame(at('boulder'), at('boulder')); const [f1, f2] = frailed.fighters; dummy(frailed);
    f2.frail = 3; f2.frailBonus = .25;
    const hp2 = f2.hp;
    hit(frailed, f1, f2, f1.data.skills[0], { hit: new Set() });
    assert.ok(Math.abs(hp2 - f2.hp - base * 1.25) < 1.5, `frail adds 25% damage, ${base} -> ${hp2 - f2.hp}`);
  }
  // I: five waves connect point-blank for medium damage and shove the victim out
  {
    const g = newGame(mana, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 60; p2.facing = -1;
    const hp = p2.hp, x0 = p2.x;
    g.keyDown('KeyI'); run(g, 2.6);
    assert.equal(p1.combo, 5, 'five waves connect');
    assert.ok(hp - p2.hp > 40 && hp - p2.hp < 95, `the waves land for medium damage, lost ${hp - p2.hp}`);
    assert.ok(p2.x > x0 + 100, `the waves shove hard, moved ${p2.x - x0}`);
  }
  // O: the wink crawls across the stage and roots on contact
  {
    const g = newGame(mana, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 420; p2.facing = -1;
    g.keyDown('KeyO'); run(g, 1.0);
    const shot = g.projectiles.find(p => p.fx === 'wink');
    assert.ok(shot, 'the wink is in the air');
    assert.ok(shot!.vx > 0 && shot!.vx < 300, `the wink crawls, vx ${shot!.vx}`);
    run(g, 1.6);
    assert.ok(p2.root > 0, `the wink roots on contact, left ${p2.root}`);
  }
  // L: the chant freezes the clock and the foe, the pulse roots everyone, two hits shake it off
  {
    const g = newGame(mana, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    g.keyDown('KeyL'); run(g, .1);
    assert.ok(g.timeStop !== null, 'the chant freezes the world');
    assert.ok(p1.noGain > 4, `the chant locks her gains through the freeze, left ${p1.noGain}`);
    assert.equal(p2.root, 0, 'the pulse waits for the chant');
    const clock = g.time;
    run(g, .5);
    assert.equal(g.time, clock, 'the round clock holds');
    const anim = p2.animTime;
    run(g, .2);
    assert.equal(p2.animTime, anim, 'the frozen foe holds its pose');
    run(g, .7);
    assert.equal(g.timeStop, null, 'the pulse ends the freeze');
    assert.ok(p2.root > 2.5, `the pulse roots three seconds, left ${p2.root}`);
    assert.equal(p2.rootLevel, 'freeze', 'the pulse is the time-stop tier');
    assert.ok(g.effects.some(e => e.type === 'world-heart'), 'the pulse heart shows');
    const pose = p2.animTime;
    run(g, .3);
    assert.equal(p2.animTime, pose, 'the frozen pose holds');
    // the pulse stagger has run out by now: the locks below are the root's, not the hit's
    assert.equal(g.canAttack(p2, 0), false, 'the freeze locks attacks');
    assert.equal(g.canAttack(p2, 2), false, 'the freeze locks specials');
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.ok(p2.root > 0, 'her root ignores clean hits until the clock lifts it');
  }
  // clips: the cast reads special L, the chant reads the dance sheet, the pulse holds the last pose
  {
    const pf = previewFighter(data, 0);
    pf.attack = { skill: data.skills[5], index: 5, serial: 1, t: .1, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).sheet, 'special', 'the cast reads the special sheet');
    assert.equal(clipFor(pf).col, 3, 'the cast reads column L');
    pf.attack = { skill: data.skills[5], index: 5, serial: 2, t: .7, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).sheet, 'world', 'the chant reads the dance sheet');
    assert.ok(clipFor(pf).row === 0 || clipFor(pf).row === 1, 'the chant cycles the dance rows');
    pf.attack = { skill: data.skills[5], index: 5, serial: 3, t: 1.4, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.deepEqual([clipFor(pf).sheet, clipFor(pf).col, clipFor(pf).row], ['world', 0, 2], 'the pulse holds the final pose');
    pf.attack = { skill: data.skills[4], index: 4, serial: 4, t: .6, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 2, 'the wink reads column O');
    pf.attack = { skill: data.skills[3], index: 3, serial: 5, t: .5, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 1, 'the crown reads column I');
  }
}

// aya: the gauge charges per the spec and the song spends it for tempo; the chop roots against
// one clean hit, the wrench dash knocks down, and the flash super refreshes cooldowns and halves them
{
  const aya = ROSTER.findIndex(c => c.id === 'aya');
  assert.ok(aya >= 0, 'aya is on the roster');
  const data = ROSTER[aya];
  assert.equal(data.trait, 'rush', 'aya is rush');
  assert.deepEqual(data.bands, ['pastel-palettes'], 'aya fronts Pastel*Palettes');
  assert.ok(data.gauge && data.gauge.max === 100 && data.gauge.head === true, 'the gauge floats over her head');
  assert.equal(data.skills[2].fx, 'chop', 'U is the chop');
  assert.equal(data.skills[2].rootBreak, 1, 'the chop root breaks on one clean hit');
  assert.equal(data.skills[3].fx, 'sing', 'I is the song');
  assert.equal(data.skills[4].fx, 'dash', 'O is the wrench dash');
  assert.equal(data.skills[5].fx, 'flash', 'the super is the flash');
  assert.equal(data.skills[5].cost, 150, 'the flash costs 150');
  const ayaGame = newGame(aya, at('boulder'));
  assert.equal(ayaGame.fighters[0].energyMax, 150, 'the meter caps at the super cost');

  // gauge: taking and blocking charge the defender, dealing charges the attacker
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90;
    hit(g, p2, p1, { ...data.skills[0], damage: 10 }, { hit: new Set() });
    assert.equal(p1.gauge, 5, `taking a hit charges 5, got ${p1.gauge}`);
    assert.equal(p2.gauge, 0, 'the attacker without a spec gains nothing');
  }
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x - 90; p1.facing = -1;
    g.keyDown('KeyS'); run(g, .1);
    hit(g, p2, p1, { ...data.skills[1], damage: 10 }, { hit: new Set() });
    assert.ok(p1.gauge === .75, `blocking charges .75, got ${p1.gauge}`);
    g.keyUp('KeyS');
  }
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90; p2.facing = 1;
    hit(g, p1, p2, { ...data.skills[0], damage: 10 }, { hit: new Set() });
    assert.equal(p1.gauge, 1.5, `dealing a hit charges 1.5, got ${p1.gauge}`);
    hit(g, p1, p2, { ...data.skills[3], damage: 10 }, { hit: new Set() });
    assert.equal(p1.gauge, 1.5, `the song itself never charges the gauge, got ${p1.gauge}`);
  }
  // the song: an empty bar keeps the slow tempo, a full bar doubles it; the bar is spent on the first swing
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 500;
    g.keyDown('KeyI'); run(g, .45);
    assert.ok(p1.attack?.skill.fx === 'sing', 'the song started');
    const emptyInterval = p1.attack?.skill.interval;
    assert.ok(Math.abs((emptyInterval ?? 0) - .30) < .001, `empty bar sings at .30, got ${emptyInterval}`);
    assert.equal(p1.gauge, 0, 'the song spends the whole gauge');
    run(g, 4.9);
    assert.ok(p1.attack === null, `the song releases with the last wave, t=5.35 attack=${p1.attack ? 'live' : 'done'}`);
    g.keyUp('KeyI');
  }
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.gauge = 100;
    p2.x = p1.x + 500;
    g.keyDown('KeyI'); run(g, .45);
    assert.ok(Math.abs((p1.attack?.skill.interval ?? 1) - .13) < .001, `a full bar sings at .13, got ${p1.attack?.skill.interval}`);
    g.keyUp('KeyI'); run(g, 6);
  }
  // the song can be jump-cancelled one second in, not before
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 500;
    g.keyDown('KeyI'); run(g, .8);
    g.keyDown('KeyW'); run(g, .1); g.keyUp('KeyW');
    assert.ok(p1.attack !== null && p1.attack.skill.fx === 'sing', 'a jump before one second does not cancel');
    run(g, .4);
    g.keyDown('KeyW'); run(g, .1); g.keyUp('KeyW');
    assert.ok(p1.attack === null, 'the jump past one second cancels the song');
    assert.ok(p1.vy < 0 || p1.y < FLOOR, 'the cancel hops');
  }
  // the flash: repel, a no-cooldown window that bans energy gains, full cooldowns when it ends
  {
    const g = newGame(aya, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 150;
    p2.x = p1.x + 120;
    p1.cooldowns[2] = 3;
    g.keyDown('KeyL'); run(g, 1.8); g.keyUp('KeyL');
    assert.ok(p1.attack === null || p1.attack.skill.fx !== 'flash', 'the flash played out');
    assert.ok(p2.x > p1.x + 150, `the flash repelled, foe at ${p2.x}`);
    assert.ok(p1.cooldowns[2] > 0, 'the window does not wipe cooldowns');
    assert.ok(g.canAttack(p1, 2), 'skills ignore cooldowns inside the window');
    assert.ok(p1.braced > 0, 'the encore braces her');
    assert.ok(g.flash < .4, `the flash is a blink, got ${g.flash}`);
    assert.ok(p1.energy < 5, `the cast spends the bar, got ${p1.energy}`);
    const banked = p1.energy;
    gainEnergy(p1, 30);
    assert.equal(p1.energy, banked, 'the window bans energy gains');
    g.keyDown('KeyU'); run(g, .3); g.keyUp('KeyU');
    assert.ok(p1.cooldowns[2] > 5.5, `a window cast still lands on its full cd, got ${p1.cooldowns[2]}`);
    run(g, 4.9);
    assert.ok(p1.cooldowns[2] > 5.4, `the window end starts full cooldowns, got ${p1.cooldowns[2]}`);
  }
}

// kokoro: the cartwheel flips once, the cruise caps at twelve segments with the tail at a
// fifth strength, the juggle ball is a
// mortal pinball that flies on two axes, and the smile waves root against two clean hits
{
  const kokoro = ROSTER.findIndex(c => c.id === 'kokoro');
  assert.ok(kokoro >= 0, 'kokoro is on the roster');
  const data = ROSTER[kokoro];
  assert.equal(data.trait, 'rush', 'kokoro is rush');
  assert.equal(data.skills[2].fx, 'cartwheel', 'U is the cartwheel');
  assert.equal(data.skills[2].speed, 820, 'the cartwheel runs the long-dash speed');
  assert.equal(data.skills[3].fx, 'smile-ship', 'I is the cruise');
  assert.equal(data.skills[3].count, 12, 'the cruise has twelve segments');
  assert.equal(data.skills[4].fx, 'juggle-ball', 'O is the juggle');
  assert.equal(data.skills[4].life, 6, 'the ball lives on its own clock');
  assert.equal(data.skills[5].fx, 'smile-wave', 'the super is the smile wave');
  assert.equal(data.skills[5].root, 3, 'the wave roots three seconds');
  assert.equal(data.skills[5].rootBreak, undefined, 'the root breaks on the default two clean hits');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/kokoro/ship.png'), 'the ship is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/kokoro/ball.png'), 'the ball is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/kokoro/wave.png'), 'the wave is preloaded');

  // U: holding the cast key keeps the line, the opposite key flips once, a second reversal is refused
  {
    const g = newGame(kokoro, at('boulder')); const [p1] = g.fighters; dummy(g);
    const facing = p1.facing;
    g.keyDown('KeyD'); g.keyDown('KeyU'); run(g, .25);
    assert.equal(p1.facing, facing, 'the cartwheel holds its line with the cast direction held');
    g.keyUp('KeyD'); g.keyDown('KeyA'); run(g, .2);
    assert.equal(p1.facing, -facing, 'the cartwheel flips against the held key');
    g.keyUp('KeyA'); g.keyDown('KeyD'); run(g, .35);
    assert.equal(p1.facing, -facing, 'the second reversal is refused');
    g.keyUp('KeyD');
  }
  // I: the cruise rides across, shoves the body along, and stops at twelve segments
  {
    const g = newGame(kokoro, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 240; p2.facing = -1;
    const hp = p2.hp, x0 = p2.x;
    g.keyDown('KeyI'); run(g, .4);
    const ship = g.projectiles.find(p => p.fx === 'smile-ship');
    assert.ok(ship, 'the cruise launches');
    // The string lands a dozen hitstop freezes on the way, so the exit needs extra wall time.
    run(g, 3);
    assert.equal(g.projectiles.filter(p => p.fx === 'smile-ship' && p.life > 0).length, 0, 'the cruise exits the stage');
    assert.ok(g.totalHits[p1.id] >= 2, `the cruise lands its segments, landed ${g.totalHits[p1.id]}`);
    assert.ok(g.totalHits[p1.id] <= 12, `twelve segments cap it, landed ${g.totalHits[p1.id]}`);
    assert.ok(hp - p2.hp > 20, `the segments deal damage, lost ${hp - p2.hp}`);
    assert.ok(p2.x > x0 + 60, `the hull shoves the body along, moved ${p2.x - x0}`);
  }
  // O: the toss leaves at an angle, a wall sends it back faster, and an enemy shot pops it
  {
    const g = newGame(kokoro, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    g.keyDown('KeyO'); run(g, .35);
    const ball = g.projectiles.find(p => p.fx === 'juggle-ball');
    assert.ok(ball, 'the ball is tossed');
    assert.ok(ball!.vy !== 0, `the toss leaves at an angle, vy ${ball!.vy}`);
    const vx0 = ball!.vx;
    const sp0 = Math.hypot(ball!.vx, ball!.vy);
    let turned = false;
    for (let i = 0; i < 240 && !turned; i++) {
      run(g, STEP);
      turned = Math.sign(ball!.vx) !== Math.sign(vx0);
    }
    assert.ok(turned, 'the ball comes back off a wall');
    const sp1 = Math.hypot(ball!.vx, ball!.vy);
    assert.ok(sp1 > sp0 * 1.19, `every bounce speeds the ball up 20%, ${sp0.toFixed(1)} -> ${sp1.toFixed(1)}`);
    // Drop a hostile shot just ahead of the ball's motion, inside the 25px cancel window.
    const hostile = {
      owner: p2.id, x: ball!.x + Math.sign(ball!.vx) * 8, y: ball!.y, vx: 0, vy: 0, life: 2, age: 0,
      skill: p2.data.skills[0], color: '#b7ff6e', radius: 17, size: 62, fx: 'orb',
      attack: { skill: p2.data.skills[0], index: 0, serial: 1, t: .1, emitted: false, shots: 0, burst: 0, hit: new Set<number>(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 },
      hit: new Set<number>(), trail: [] as { x: number; y: number }[],
    };
    g.projectiles.push(hostile);
    run(g, .1);
    assert.equal(g.projectiles.filter(p => p.fx === 'juggle-ball' && p.life > 0).length, 0, 'an enemy shot pops the ball');
  }
  // L: three waves hit, root, and the default break rule lifts the root on the second clean hit
  {
    const g = newGame(kokoro, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 260; p2.facing = -1;
    p1.energy = p1.energyMax;
    const hp = p2.hp;
    g.keyDown('KeyL'); run(g, .45);
    assert.ok(p1.energy < 1, `the super spends the bar, left ${p1.energy}`);
    // The first wave lands around .7 — catch the pulse while it is still swelling.
    run(g, .35);
    const pulse = g.effects.find(e => e.type === 'smile-pulse');
    assert.ok(pulse, 'a wave hit stamps a smile pulse on the victim');
    assert.ok(Math.abs((pulse!.radius ?? 0) - 271.5) < .01, `the pulse swells to 150% of her height, saw ${pulse!.radius}`);
    run(g, .6);
    assert.ok(p2.root > 0, `the wave roots on contact, left ${p2.root}`);
    assert.ok(p2.root <= 3.01, `the root is the three-second tier, left ${p2.root}`);
    assert.ok(hp - p2.hp > 20, `the waves deal damage too, lost ${hp - p2.hp}`);
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.ok(p2.root > 0, 'one clean hit does not break the root');
    run(g, .35);
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.equal(p2.root, 0, 'two clean hits break the root');
  }
  // clips: the four specials read their own special columns
  {
    const pf = previewFighter(data, 0);
    pf.attack = { skill: data.skills[2], index: 2, serial: 1, t: .5, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).sheet, 'special', 'the cartwheel reads the special sheet');
    assert.equal(clipFor(pf).col, 0, 'the cartwheel reads column U');
    pf.attack = { skill: data.skills[5], index: 5, serial: 2, t: .5, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 3, 'the wave reads column L');
  }
}

// kasumi: the star rain chains into itself, the beckon shoves hard, the hug roots for two
// clean-hit-breakable seconds, and the wish star stuns without a hit counter
{
  const kasumi = ROSTER.findIndex(c => c.id === 'kasumi');
  assert.ok(kasumi >= 0, 'kasumi is on the roster');
  const data = ROSTER[kasumi];
  assert.equal(data.trait, 'beat', 'kasumi is beat');
  assert.equal(data.skills[2].fx, 'star', 'U is the star rain');
  assert.equal(data.skills[2].count, 10, 'the rain drops ten stars');
  assert.equal(data.skills[3].fx, 'poppa', 'I is the beckon');
  assert.equal(data.skills[4].fx, 'hug', 'O is the hug');
  assert.equal(data.skills[5].fx, 'wish', 'the super is the wish');
  assert.equal(data.skills[5].root, 3, 'the wish stuns three seconds');
  assert.equal(data.skills[5].rootBreak, 0, 'the wish stun ignores clean hits');
  assert.ok(data.view.kind === 'sprite', 'kasumi is a sprite');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/kasumi/star.png'), 'the star prop is preloaded');

  // U: the lane catches a standing target many times — the stars chain, they do not knock back
  {
    const g = newGame(kasumi, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 180; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, 2.0);
    assert.ok(g.projectiles.every(p => p.fx !== 'star'), 'the stars are all gone after the rain');
    assert.ok(p1.combo >= 6, `the rain chains, combo ${p1.combo}`);
    assert.ok(hp - p2.hp > 45 && hp - p2.hp < 115, `the rain lands for chip damage, lost ${hp - p2.hp}`);
    // The stars carry no knockback; the only way out is the seven-hit combo escape, which pushes forward.
    assert.ok(p2.x >= p1.x + 170, 'the rain never drags the victim back');
  }
  // I: the beckon connects point-blank and shoves the victim far out
  {
    const g = newGame(kasumi, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 80; p2.facing = -1;
    const hp = p2.hp, x0 = p2.x;
    g.keyDown('KeyI'); run(g, 1.4);
    assert.ok(hp - p2.hp > 40 && hp - p2.hp < 80, `the beckon lands once, lost ${hp - p2.hp}`);
    assert.ok(p2.x > x0 + 50, `the beckon shoves hard, moved ${p2.x - x0}`);
  }
  // O: the hug pins six nuzzles, then roots for two seconds that two clean hits shake off
  {
    const g = newGame(kasumi, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO'); run(g, 1.6);
    assert.equal(p1.combo, 6, `six nuzzles connect, combo ${p1.combo}`);
    assert.ok(hp - p2.hp > 55, `the hug dealt ${hp - p2.hp}`);
    assert.ok(p2.root > 1.4 && p2.root <= 2.01, `the hug roots two seconds, left ${p2.root}`);
    assert.equal(p2.rootBreak, 2, 'the hug root breaks on two clean hits');
  }
  // the hug root itself shakes off after two clean hits (measured away from the cast, whose
  // seventh hit hands the victim the combo escape instead)
  {
    const g = newGame(kasumi, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 90; p2.facing = -1;
    hit(g, p1, p2, { ...data.skills[4], root: 2, rootPin: true }, { hit: new Set() });
    run(g, 1.4);
    assert.ok(p2.root > 0, `the hug root survives one clean hit, left ${p2.root}`);
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.ok(p2.root > 0, 'one hit does not break the hug root');
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.equal(p2.root, 0, 'two clean hits break the hug root');
  }
  // L: the prayer marks the spot, then the star stuns without a hit counter
  {
    const g = newGame(kasumi, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 200; p2.facing = -1;
    p1.energy = p1.energyMax;
    g.keyDown('KeyL'); run(g, .4);
    assert.ok(g.effects.some(e => e.type === 'wish-mark'), 'the prayer pins a landing tell');
    assert.equal(g.projectiles.some(p => p.fx === 'star-fall'), false, 'the star waits for the prayer');
    run(g, .65);
    const fall = g.projectiles.find(p => p.fx === 'star-fall');
    assert.ok(fall, 'the star drops after the prayer');
    assert.ok(fall!.vx > 0, `the star rides the rain's diagonal, vx ${fall!.vx}`);
    assert.ok(fall!.x < p2.x, 'the star enters up-left of the pinned spot');
    const hp = p2.hp;
    run(g, .8);
    const pulse = g.effects.find(e => e.type === 'star-pulse');
    assert.ok(pulse, 'the landing stamps an impact pulse');
    assert.ok(Math.abs((pulse!.radius ?? 0) - 336) < .01, `the pulse swells to 70% of the star, saw ${pulse!.radius}`);
    run(g, 1.15);
    assert.ok(g.projectiles.every(p => p.fx !== 'star-fall'), 'the star landed and burst');
    assert.ok(hp - p2.hp > 150, `the star dealt ${hp - p2.hp}`);
    assert.ok(p2.root > 1.2 && p2.root <= 3.01, `the stun holds three seconds, left ${p2.root}`);
    assert.equal(p2.rootLevel, 'move', 'the stun is the move tier, not the time stop');
    assert.equal(p2.rootBreak, 0, 'the stun has no hit counter');
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.ok(p2.root > 0, 'the stun ignores clean hits until the clock lifts it');
  }
  // clips: the strum cycles the U column, the hug reads O, the prayer reads L
  {
    const pf = previewFighter(data, 0);
    pf.attack = { skill: data.skills[2], index: 2, serial: 1, t: .3, emitted: false, shots: 1, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 0, 'the strum reads column U');
    pf.attack = { skill: data.skills[4], index: 4, serial: 2, t: .5, emitted: false, shots: 2, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 1, hold: 3, anchor: 0 };
    assert.equal(clipFor(pf).col, 2, 'the hug reads column O');
    pf.attack = { skill: data.skills[5], index: 5, serial: 3, t: .5, emitted: false, shots: 1, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).col, 3, 'the prayer reads column L');
  }
}

// yukina: the firebird burns twice per pillar and floats, the rose reflects melee for a window,
// the summit wave flings the whole stage without damage, and the shout pays on expiry
{
  const yukina = ROSTER.findIndex(c => c.id === 'yukina');
  assert.ok(yukina >= 0, 'yukina is on the roster');
  const data = ROSTER[yukina];
  // U: four pillars, two ahead and two behind, each burning a standing body twice
  {
    const g = newGame(yukina, at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 170; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU'); run(g, .5);
    const pillars = g.projectiles.filter(p => p.fx === 'firebird');
    assert.equal(pillars.length, 4, 'four pillars erupt');
    assert.equal(pillars.filter(p => p.x > p1.x).length, 2, 'two pillars ahead');
    assert.equal(pillars.filter(p => p.x < p1.x).length, 2, 'two pillars behind');
    run(g, .5);
    assert.ok(hp - p2.hp >= 30, `two burns landed, dealt ${hp - p2.hp}`);
    assert.ok(p2.y < FLOOR - 1 || p2.stun > 0, 'the burn floats the victim');
  }
  // I: the bloom shoves, arms the thorns, melee comes back at the attacker, then lifts
  {
    const g = newGame(yukina, at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 120; p2.facing = -1;
    g.keyDown('KeyI'); run(g, .55);
    assert.ok(p1.rose > 5, `the thorn window is armed, left ${p1.rose}`);
    assert.ok(Math.abs(p1.thorns - .3) < 1e-9, `the thorns reflect 30%, saw ${p1.thorns}`);
    assert.ok(Math.abs(p2.x - p1.x) > 120, `the bloom shoves, gap ${Math.abs(p2.x - p1.x)}`);
    const hp2 = p2.hp;
    hit(g, p2, p1, p2.data.skills[0], { hit: new Set() });
    assert.ok(p2.hp < hp2, 'melee against the thorns costs the attacker');
    run(g, 6.2);
    assert.equal(p1.rose, 0, 'the petal window expires');
    assert.equal(p1.thorns, 0, 'the thorns lift with the petals');
  }
  // O: the wave flings everyone to the wall and deals nothing
  {
    const g = newGame(yukina, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 400; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO'); run(g, .7);
    assert.ok(p2.x > X_MAX - 40, `the wave flings to the wall, x ${p2.x}`);
    assert.equal(hp - p2.hp, 0, 'the wave deals no damage');
    assert.ok(p2.knocked > 0 || p2.y < FLOOR - 1, 'the fling knocks down');
  }
  // L: the buff boosts the jab, then the backlash bills 10% of max health
  {
    const g = newGame(yukina, at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    g.keyDown('KeyL'); run(g, .8);
    assert.ok(p1.shout > 6.5, `the buff is running, left ${p1.shout}`);
    assert.ok(p1.noGain > 6, `the seal locks gains for the window, left ${p1.noGain}`);
    const hp2 = p2.hp;
    hit(g, p1, p2, p1.data.skills[0], { hit: new Set() });
    assert.equal(hp2 - p2.hp, Math.round(26 * 1.5), `the shout boosts the jab, dealt ${hp2 - p2.hp}`);
    const hp1 = p1.hp;
    run(g, 8);
    assert.equal(p1.shout, 0, 'the seal snaps shut');
    assert.equal(hp1 - p1.hp, 100, `the backlash costs 10% max health, lost ${hp1 - p1.hp}`);
  }
}

// A pin + control move is only data. The kernel does not grow a branch for the new fx name.
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 80; p2.facing = -1;
  addMod(p2, 'debt', 2, { acc: 0 });
  const pin = skill(2, 'heavy', '假钉', {
    damage: 10, range: 200, fx: 'probe-pin',
    react: { kind: 'pin', holdStill: true, stun: .3 },
    control: true,
  });
  const hp = p2.hp;
  hit(g, p1, p2, pin, { hit: new Set() });
  assert.equal(p2.vy, 0, 'a data pin keeps the body standing');
  assert.equal(p2.knocked, 0, 'a data pin does not knock down');
  assert.equal(p2.vx, 0, 'a data pin holds still');
  assert.ok(p2.hp < hp, 'control damage lands during a debt window');
  assert.equal(p2.debtDmg, 0, 'control damage is not billed');
  run(g, 2);
  assert.equal(g.phase, 'fight', 'the round keeps running after a data-only move');
}

// mitake: 花道·缠 slows walk and jump, 不良主唱 is a radial ground smash, 像以前一样 breaks out
// into a shove + brace, and 宣战布告 opens the frenzy sheet without locking the specials
{
  const mitake = ROSTER.findIndex(c => c.id === 'mitake');
  assert.ok(mitake >= 0, 'mitake is on the roster');
  assert.ok(PLAYABLE.some(c => c.id === 'mitake'), 'mitake is playable');
  const data = ROSTER[mitake];
  assert.equal(data.skills[2].slow, 4, '花道·缠 slows for 4s');
  assert.equal(data.skills[2].slowMul, .6, '花道·缠 dulls the walk to 60%');
  assert.equal(data.skills[2].slowJump, .75, '花道·缠 dulls the jump to 75%');
  assert.equal(data.skills[3].hitbox, 'radial', '不良主唱 is radial');
  assert.equal(data.skills[3].hitAll, true, '不良主唱 hits everyone in the ring');
  assert.equal(data.skills[3].reach, 'ground', '不良主唱 stays on the ground');
  assert.equal(data.skills[4].breakout, true, '像以前一样 is a breakout');
  assert.equal(data.skills[5].cost, 115, '宣战布告 costs 115');
  assert.deepEqual(data.bands, ['afterglow'], 'mitake fronts Afterglow');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/mitake/guitar.png'), 'the guitar is preloaded');
  assert.ok(data.frenzy && data.frenzy.time === 8, 'the form runs 8s');

  // U: the blossom lands, the victim is slowed, and the debuff lifts on its own clock
  {
    const g = newGame(mitake, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 300; p2.facing = -1;
    g.keyDown('KeyU');
    let saw = false;
    for (let i = 0; i < Math.round(1 / STEP); i++) {
      g.step(STEP);
      if (g.projectiles.some(p => p.fx === 'hana')) saw = true;
    }
    assert.ok(saw, '花道·缠 spawns a blossom');
    assert.ok(p2.slow > 0, '花道·缠 slows the victim');
    assert.ok(speedMul(p2) < 1, 'the slow dulls the walk');
    assert.ok(jumpMul(p2) < 1, 'the slow dulls the jump');
    run(g, 4.2);
    assert.equal(p2.slow, 0, 'the slow expires');
    assert.equal(speedMul(p2), 1, 'the walk returns to normal');
    assert.equal(jumpMul(p2), 1, 'the jump returns to normal');
  }
  // I: a radial ground smash hits in front and behind, and deals damage
  {
    const g = newGame(mitake, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 150; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI'); run(g, .6);
    assert.ok(hp - p2.hp > 0, `不良主唱 deals damage, dealt ${hp - p2.hp}`);
    assert.ok(p2.knocked > 0 || p2.y < FLOOR - 1, 'the smash knocks down');
    const behind = newGame(mitake, at('boulder')); const [q1, q2] = behind.fighters; dummy(behind);
    q2.x = q1.x - 150; q2.facing = 1;
    const hp2 = q2.hp;
    behind.keyDown('KeyI'); run(behind, .6);
    assert.ok(hp2 - q2.hp > 0, 'the smash reaches behind her too');
  }
  // O: no damage, a shove, and a brace armed for the window
  {
    const g = newGame(mitake, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 120; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO'); run(g, .4);
    assert.equal(p2.hp, hp, '像以前一样 deals no damage');
    assert.ok(Math.abs(p2.x - p1.x) > 120, `像以前一样 shoves the ring, gap ${Math.abs(p2.x - p1.x)}`);
    assert.ok(p1.braced > 4, `the brace is armed, left ${p1.braced}`);
  }
  // L: the form boosts the jab, locks gains, and swaps the common sheet without a king lock
  {
    const g = newGame(mitake, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    g.keyDown('KeyL'); run(g, .8);
    assert.ok(p1.frenzy > 6, `宣战布告 opens the form, left ${p1.frenzy}`);
    assert.ok(p1.noGain > 6, `the form locks gains, left ${p1.noGain}`);
    assert.ok(!p1.king, 'the form does not lock the specials');
    p2.x = p1.x + 60; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyJ'); run(g, .3);
    // boosted jab is round(26 * 1.25) = 33, and the armor dummy takes 95% → 31.35
    assert.ok(hp - p2.hp > 25, `the form boosts the jab, dealt ${hp - p2.hp}`);
    const pf = previewFighter(data, 0);
    pf.frenzy = 8;
    pf.attack = { skill: data.skills[0], index: 0, serial: 1, t: .2, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0 };
    assert.equal(clipFor(pf).sheet, 'frenzy', 'the form reads the frenzy sheet');
  }
}

console.log('selfcheck ok');
