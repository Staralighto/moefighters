/* Headless rule check: runs the fixed-step engine without DOM or canvas. `npm run check`. */
import { FightGame } from '../src/game/game.ts';
import { drumShotTime, hit } from '../src/game/combat.ts';
import { vowBeatTime, VOW_BEATS } from '../src/render/clips.ts';
import { SHEET_SCALE } from '../src/render/proportions.ts';
import { ROSTER } from '../src/data/characters.ts';
import { STAGES } from '../src/data/stages.ts';
import { FLOOR, COMBO_DECAY, STEP } from '../src/game/constants.ts';
import { clipFor, drumRow } from '../src/render/clips.ts';
import { mortisAfterimage } from '../src/render/fx.ts';
import { previewFighter } from '../src/game/fighter.ts';
import { guideIndex, skillHTML } from '../src/ui/select.ts';
import { POOL, aggregatePicks, bestLabel, drawThree, readBest, rollEnemies, stageSetup } from '../src/ui/challenge.ts';
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

// blocking a projectile siphons the attacker's energy in proportion to the shot, silently
{
  const g = newGame(1, 2); const [p1, p2] = g.fighters; dummy(g); // 星火 U = 火球
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

// both slots CPU: nobody holds a pad, and both sides still walk in
{
  const g = new FightGame([ROSTER[0], ROSTER[1]], {
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
    const g = new FightGame([ROSTER[0], ROSTER[1]], { ...opts, difficulty });
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

// 2v2: ally takes no damage, one enemy down keeps the round, a wipe scores
{
  const g = new FightGame([ROSTER[0], ROSTER[1], ROSTER[2], ROSTER[3]], {
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
  const g = new FightGame([ROSTER[0], ROSTER[1], ROSTER[2]], {
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
  const setup = stageSetup('brawl', ROSTER[0], [], 1, [ROSTER[1], ROSTER[2]]);
  assert.equal(setup.characters.length, 3, 'a brawl stage fields the player plus two enemies');
  assert.equal(setup.characters[0].hp, ROSTER[0].hp * 2, 'brawl doubles base health');
  assert.equal(setup.characters[1].id, ROSTER[1].id, 'the pair shown before the fight joins the stage');
  assert.equal(setup.characters[2].id, ROSTER[2].id, 'the pair shown before the fight joins the stage');
  assert.equal(setup.characters[1].hp, ROSTER[1].hp, 'stage 1 enemies are ungrown');
  assert.equal(setup.difficulty, 2, 'challenge locks master');
  assert.deepEqual(setup.controllers, [0, null, null], 'solo human, CPU pair');
  assert.deepEqual(setup.mods, [{ baseDamage: 2 }, {}, {}], 'no picks keeps the pair neutral, the player carries only the mode base boost');
  assert.equal(setup.stageNumber, 1, 'the first stage is stage 1');
  const grown2 = stageSetup('brawl', ROSTER[0], [], 2, [ROSTER[1], ROSTER[2]]);
  assert.equal(grown2.characters[1].hp, Math.round(ROSTER[1].hp * 1.05), 'stage 2 enemies gain one step of health');
  assert.ok(Math.abs(grown2.mods![1].damage! - 1.03) < 1e-9, 'stage 2 enemies gain one step of damage');
  const grown3 = stageSetup('brawl', ROSTER[0], [], 3, [ROSTER[1], ROSTER[2]]);
  assert.equal(grown3.characters[1].hp, Math.round(ROSTER[1].hp * 1.1), 'enemy growth stacks linearly per stage');
  assert.ok(Math.abs(grown3.mods![2].damage! - 1.06) < 1e-9, 'enemy damage growth stacks linearly per stage');
  const lifebuoy = stageSetup('brawl', ROSTER[0], ['lifebuoy', 'lifebuoy'], 2, [ROSTER[1], ROSTER[2]]);
  assert.equal(lifebuoy.characters[0].hp, Math.round(ROSTER[0].hp * 2 * 1.4), 'lifebuoy stacks onto the doubled health');
  assert.equal(stageSetup('brawl', ROSTER[0], [], 2, [ROSTER[1], ROSTER[2]]).stageNumber, 2);
  const solo = stageSetup('climb', ROSTER[0], ['burn', 'lifebuoy'], 2, [ROSTER[1]]);
  assert.equal(solo.characters.length, 2, 'a climb stage fields the player plus one enemy');
  assert.deepEqual(solo.controllers, [0, null], 'climb is a plain 1v1');
  assert.equal(solo.characters[0].hp, Math.round(ROSTER[0].hp * 1.2), 'climb skips the doubled anchor, lifebuoy still stacks');
  assert.deepEqual(solo.mods![0], { damage: 1.2 }, 'climb arms no base damage boost, only the deck');
  assert.equal(solo.characters[1].hp, Math.round(ROSTER[1].hp * 1.05), 'climb enemies grow per stage too');
  assert.ok(Math.abs(solo.mods![1].damage! - 1.03) < 1e-9, 'climb enemy growth rides the same mods slot');
  const solo1 = stageSetup('climb', ROSTER[0], [], 1, [ROSTER[1]]);
  assert.equal(solo1.characters[0].hp, ROSTER[0].hp, 'climb stage 1 is raw values both ways');
  assert.deepEqual(solo1.mods, [{}, {}], 'climb stage 1 is raw values both ways');
  assert.equal(bestLabel(0), '0');
  assert.equal(bestLabel(99), '99');
  assert.equal(bestLabel(100), '99+');
  assert.equal(readBest('brawl'), 0, 'headless reads no cookie');
  assert.equal(readBest('climb'), 0, 'headless reads no cookie');
}

// card pool: fifteen unique ids, three-card draws, and the documented layer caps
{
  assert.equal(POOL.length, 15, 'the pool fields fifteen cards');
  assert.equal(new Set(POOL.map(c => c.id)).size, POOL.length, 'pool ids are unique');
  for (let i = 0; i < 40; i++) {
    const three = drawThree();
    assert.equal(new Set(three).size, 3, 'a draw deals three distinct cards');
    assert.ok(three.every(id => POOL.some(c => c.id === id)), 'draws come from the pool');
  }
  const m = aggregatePicks([
    'okay', 'okay', 'okay', 'okay', 'okay', 'okay',
    'sparkle', 'sparkle', 'sparkle',
    'band', 'band', 'band',
    'again', 'again', 'again', 'again',
    'latent', 'latent', 'latent',
    'dare', 'dare', 'dare',
    'fall', 'fall', 'fall',
    'ultimatum', 'ultimatum', 'ultimatum',
    'protect', 'protect', 'protect',
    'vain', 'vain', 'vain', 'vain',
    'human', 'human',
  ]);
  assert.equal(m.regen, .05, 'regen caps at 5%/s');
  assert.equal(m.crit, .5, 'crit caps at 50%');
  assert.equal(m.energyMul, 1.8, 'energy gain caps at +80%');
  assert.equal(m.cdMul, .6, 'cooldowns cap at -40%');
  assert.equal(m.lifesteal, .16, 'lifesteal caps at 16%');
  assert.equal(m.thorns, .3, 'thorns cap at 30%');
  assert.equal(m.lowHpDmg, .6, '堕天 caps at +60%');
  assert.equal(m.executeDmg, 1, '通牒 caps at +100%');
  assert.equal(m.stunMul, .6, 'hitstun caps at -40%');
  assert.equal(m.escapeCombo, 4, 'the escape threshold drops one per stack');
  assert.equal(m.vainDamage, .45, 'vain damage caps at +45%');
  assert.equal(m.vainEnergy, .75, 'vain energy caps at +75%');
  assert.equal(m.deathSave, 2, 'cheat-death charges stack one per copy');
  const echo = aggregatePicks(['echo', 'echo', 'echo', 'echo', 'echo']);
  assert.equal(echo.comboTimeBonus, 1, 'the combo window caps at +1s');
  assert.equal(echo.comboDecay, COMBO_DECAY / 32, 'combo decay halves per stack');
  const walk = aggregatePicks(['walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk']);
  assert.equal(walk.moveMul, 1.2, 'move speed caps at +20%');
  assert.equal(walk.dodgeCdMul, .5, 'the dodge cooldown caps at -50%');
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

// launch floats the target high and a jump attack juggles into a combo
{
  const g = newGame(1, 2); const [p1, p2] = g.fighters; dummy(g); // 星火 I = 焰柱上挑
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
  const g = newGame(0, 2); const [p1, cpu] = g.fighters; // fighters[1] is the AI
  cpu.guard = 10;
  let escaped = false;
  for (let i = 0; i < Math.round(2 / STEP); i++) {
    cpu.x = p1.x + 120; cpu.facing = -1; // pinned: threatened but out of light range
    if (!p1.attack) p1.attack = {
      skill: ROSTER[0].skills[0], index: 0, serial: ++p1.attackSerial,
      t: 0, emitted: false, shots: 0, hit: new Set(), burst: 0,
      endure: 0, liftAt: 0, tossAt: 0, hold: -1,
    };
    g.step(STEP);
    if (cpu.dodge > 0 || cpu.dodgeCd > 0 || cpu.y < FLOOR - 1) { escaped = true; break; }
  }
  assert.ok(escaped, 'CPU dodges or jumps out of block pressure');
}

// CPU jumps up to meet a floated victim with an air normal
{
  const g = newGame(2, 0); const [vic, cpu] = g.fighters; // fighters[1] is the AI
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

// mutsumi: 轮奏 breaks out of a super with 0.8s invuln, and grants it on a normal cast
{
  const mutsumi = ROSTER.findIndex(c => c.id === 'mutsumi');
  const data = ROSTER[mutsumi];
  assert.equal(data.skills[3].breakout, true, '轮奏 is a breakout');

  const escape = newGame(mutsumi, 2); const [e1, e2] = escape.fighters; dummy(escape);
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

  const normal = newGame(mutsumi, 2); const [n1] = normal.fighters; dummy(normal);
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
  assert.equal(data.skills[5].count, 16, '满场 drops sixteen notes');
  const super5 = data.skills[5];
  assert.ok(drumShotTime(super5, 8) - drumShotTime(super5, 7) > .4, '满场 falls in two waves');
  assert.ok(drumShotTime(super5, 15) < super5.duration, 'the second wave fits in the super');

  const g = newGame(nyamu, 2); const [p1, p2] = g.fighters; dummy(g);
  p1.energy = 100;
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

  const grab = newGame(soyo, 2); const [c1, c2] = grab.fighters; dummy(grab);
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

  const miss = newGame(soyo, 2); const [m1, m2] = miss.fighters; dummy(miss);
  m2.x = m1.x + 420;
  miss.keyDown('KeyU');
  run(miss, .8);
  assert.equal(m1.attack, null, 'a whiffed onegai ends early');
  assert.equal(m2.hp, m2.data.hp, 'the whiff deals nothing');

  const repel = newGame(soyo, 2); const [r1, r2] = repel.fighters; dummy(repel);
  r2.x = r1.x + 90; r2.facing = -1;
  const rx = r2.x;
  repel.keyDown('KeyI');
  run(repel, .6);
  assert.ok(r2.x > rx + 30, `resolve shoves nearby foes, moved ${r2.x - rx}`);

  const fren = newGame(soyo, 2); const [g1, g2] = fren.fighters; dummy(fren);
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
  const mash = newGame(soyo, 2); const [j1] = mash.fighters; dummy(mash);
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

  const sob = newGame(soyo, 2); const [b1, b2] = sob.fighters; dummy(sob);
  b2.x = 980;
  sob.keyDown('KeyO');
  run(sob, 1.5);
  const notes = sob.projectiles.filter(p => p.fx === 'sob');
  assert.equal(notes.length, 2, `two ground notes, saw ${notes.length}`);
  assert.ok(notes.every(p => p.y > FLOOR - 60), 'the notes hug the floor');
  assert.ok(Math.abs(notes[0].y - notes[1].y) > 10, 'the two notes ride different heights');

  const shout = newGame(soyo, 2); const [w1, w2] = shout.fighters; dummy(shout);
  w2.x = w1.x + 200; w2.facing = -1;
  w1.energy = 100;
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
  const far = newGame(soyo, 2); const [f1, f2] = far.fighters; dummy(far);
  f2.x = f1.x + 700; f2.invuln = 5;
  f1.energy = 100;
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
  pf.attack = { skill: data.skills[0], index: 0, serial: 1, t: .12, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1 };
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
    const g = newGame(tomori, 2); const [t1, t2] = g.fighters; dummy(g);
    t2.x = t1.x + 260; t2.facing = -1;
    const sx = t2.x;
    g.keyDown('KeyU');
    run(g, .8);
    assert.ok(t2.x > sx + 25, `the stone shoves, moved ${t2.x - sx}`);
    assert.ok(g.projectiles.every(p => p.fx !== 'stone'), 'the stone dies on the hit');
  }

  // I: the plaster shoves the crowd and braces her; a hit during the brace does not stop a move
  {
    const g = newGame(tomori, 2); const [p1, p2] = g.fighters; dummy(g);
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
    const g = newGame(tomori, 2); const [e1, e2] = g.fighters; dummy(g);
    e1.queue.push({ index: 3, ttl: .18 });
    hit(g, e2, e1, e2.data.skills[5], { hit: new Set() });
    assert.equal(e1.hitBySuper, true, 'a super marks the combo');
    assert.equal(e1.queue[0]?.index, 3, 'the plaster stays buffered through a super');
  }

  // grabs ignore the brace, but a plain hit does not flinch it
  {
    const g = newGame(tomori, 2); const [b1, b2] = g.fighters; dummy(g);
    b1.braced = 6;
    const hp = b1.hp;
    hit(g, b2, b1, b2.data.skills[0], { hit: new Set() });
    assert.ok(b1.hp < hp, 'the brace takes damage');
    assert.equal(b1.stun, 0, 'the brace does not flinch');
    hit(g, b2, b1, b2.data.skills[2], { hit: new Set() }); // 磐石 U = 熊抱 grab
    assert.ok(b1.knocked > 0, 'a grab still goes through the brace');
  }

  // O: the well spawns ahead, drags the dummy to its centre and ticks low damage
  {
    const g = newGame(tomori, 2); const [h1, h2] = g.fighters; dummy(g);
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
    const g = newGame(tomori, 2); const [s1, s2] = g.fighters; dummy(g);
    s1.energy = 100;
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
    s1.energy = 100;
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
    const g = newGame(tomori, 2); const [r1] = g.fighters; dummy(g);
    r1.energy = 100;
    g.keyDown('KeyL');
    run(g, 1.3);
    assert.equal(g.fighters.length, 3, 'a teammate is up');
    r1.hp = 0;
    run(g, STEP);
    assert.equal(g.phase, 'roundend', 'the round ignores the minion');
  }

  // team mode: the teammate id never collides with a real fighter slot
  {
    const g = new FightGame([ROSTER[tomori], ROSTER[0], ROSTER[2], ROSTER[1]], {
      mode: 'team', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7),
    });
    run(g, 2.3);
    const lead = g.fighters[0];
    lead.energy = 100;
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
  pf.attack = { skill: tomoriData.skills[5], index: 5, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1 };
  assert.deepEqual([clipFor(pf).col, clipFor(pf).row], [3, 0], 'the sing starts on the breath');
  pf.attack.t = tomoriData.skills[5].start - .6;
  assert.equal(clipFor(pf).row, 1, 'the sung note takes over 0.6s before the summon');
  pf.attack.t = tomoriData.skills[5].start - .01;
  assert.equal(clipFor(pf).row, 1, 'still singing at the summon');
  pf.attack.t = tomoriData.skills[5].start + .05;
  assert.equal(clipFor(pf).row, 2, 'the bow follows the summon');

  const pf2 = previewFighter(tomoriData, 0);
  pf2.attack = { skill: tomoriData.skills[2], index: 2, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1 };
  assert.deepEqual([clipFor(pf2).col, clipFor(pf2).row], [0, 0], 'the stone reads the U column');
}

{
  assert.equal(guideIndex([null, 0]), 1, 'solo 2P is the movelist');
  assert.equal(guideIndex([0, 1]), 0, 'earlier player wins when both are human');
  assert.equal(guideIndex([null, null, 1, 0]), 2, 'team uses the earliest player slot');
  assert.equal(guideIndex([null, null]), 0, 'all CPU stays on 1P');
  const first = skillHTML(ROSTER[3]);
  const second = skillHTML(ROSTER[3], 1);
  assert.ok(first.includes('<kbd>J</kbd>') && first.includes('<kbd>L</kbd>'), 'cpu and first player show letter keys');
  assert.ok(second.includes('<kbd>1</kbd>') && second.includes('<kbd>3</kbd>') && !second.includes('<kbd>J</kbd>'), 'later player shows numpad keys');
  assert.ok(second.includes('1 / 2') && !second.includes('J / K'), 'combo hint follows the numpad set');
  const touch = skillHTML(ROSTER[3], 0, true);
  assert.ok(touch.includes('<kbd>轻</kbd>') && touch.includes('<kbd>必</kbd>') && !touch.includes('<kbd>J</kbd>'), 'phone shows on-screen pad labels');
  assert.ok(touch.includes('轻 / 重') && !touch.includes('J / K'), 'combo hint follows the pad labels');
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
  const flurry = newGame(sakiko, 2); const [f1, f2] = flurry.fighters; dummy(flurry);
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
    const g = newGame(taki, 2); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 60; p2.facing = -1;
    g.keyDown('KeyJ'); run(g, .3);
    assert.equal(p1.beatStacks, 1, 'a clean hit adds a beat');
    hit(g, p2, p1, p2.data.skills[0], { hit: new Set() });
    assert.equal(p1.beatStacks, 0, 'taking a hit shakes two off');
  }

  // U: the bubble pops, drains meter and says so out loud
  {
    const g = newGame(taki, 2); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 260; p2.facing = -1;
    p2.energy = 50;
    g.keyDown('KeyU'); run(g, 1);
    assert.ok(p2.hp < p2.data.hp, 'the bubble connects');
    assert.ok(p2.energy < 50, `the abuse drains meter, left ${p2.energy}`);
    assert.ok(g.texts.some(t => t.text.includes('气')), 'the drain announces itself');
  }

  // I: 哈？shoves a fighter standing behind her, and breaks out of a super
  {
    const g = newGame(taki, 2); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 400; p2.x = p1.x - 180;
    const hp = p2.hp, bx = p2.x;
    g.keyDown('KeyI'); run(g, .5);
    assert.ok(p2.hp < hp, '哈？hits behind her');
    assert.ok(p2.x < bx - 40, `哈？knocks back, moved ${bx - p2.x}`);

    const escape = newGame(taki, 2); const [e1, e2] = escape.fighters; dummy(escape);
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
    const g = newGame(taki, 2); const [p1, p2] = g.fighters; dummy(g);
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
    const g = newGame(taki, 2); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 100;
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

    const low = newGame(taki, 2); const [l1, l2] = low.fighters; dummy(low);
    l1.energy = 100;
    l1.hp = l1.data.hp * .2;
    l2.x = l1.x + 70; l2.facing = -1;
    low.keyDown('KeyL');
    run(low, .5);
    assert.ok(low.texts.some(t => t.text.includes('祥子')), 'low health swaps the line');

    const miss = newGame(taki, 2); const [m1, m2] = miss.fighters; dummy(miss);
    m1.energy = 100;
    m2.x = m1.x + 900;
    miss.keyDown('KeyL');
    run(miss, 1);
    assert.equal(m1.attack, null, 'a whiffed vow ends early');
    assert.equal(m2.hp, m2.data.hp, 'the whiff deals nothing');
  }
}

// the figure scale has one home; the 128-era 0.58 must never come back (file scan lives in checkSheetScale)
assert.equal(SHEET_SCALE, 1.16, 'SHEET_SCALE fills a 256 cell');

console.log('selfcheck ok');
