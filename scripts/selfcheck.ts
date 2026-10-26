/* Headless rule check: runs the fixed-step engine without DOM or canvas. `npm run check`. */
import { FightGame } from '../src/game/game.ts';
import { BUSHIDO_CREEP, BUSHIDO_LUNGE, BUSHIDO_SPAN, VEIL_NORMAL, VEIL_SHOT, clockRings, drumShotTime, hit, holdNoteSpan, outshines, violetHidden, withGuard } from '../src/game/combat.ts';
import { vowBeatTime, VOW_BEATS, PRACTICE_GAP1, PRACTICE_HITS, practiceBeat, practiceGap, practiceRow, practiceStrums } from '../src/render/clips.ts';
import { SHEET_SCALE } from '../src/render/proportions.ts';
import { PLAYABLE, ROSTER, bandMembers, guestsFor } from '../src/data/characters.ts';
import { BANDS, BAND_BY_ID } from '../src/data/bands.ts';
import { AIR_SKILLS, skill } from '../src/data/skills.ts';
import { STAGES } from '../src/data/stages.ts';
import { FLOOR, COMBO_DECAY, STEP, W, X_MAX, X_MIN } from '../src/game/constants.ts';
import { BUSHIDO_TAIL, bushidoClip, clipFor, crashRow, drumRow, flameFrame, IAIDO_DECIDE, IAIDO_GAP, IAIDO_RECOVER, riotCell } from '../src/render/clips.ts';
import { RIB_OX, SKEWER_OX, STEAK_OX } from '../src/render/ritsuSheet.ts';
import { kujiFlash, KUJI, KUJI_STEP, mortisAfterimage, sealSwell, shouldGoLite } from '../src/render/fx.ts';
import { backingScale, portraitBodyScale, teamGlowOn } from '../src/render/renderer.ts';
import { previewFighter, gainEnergy } from '../src/game/fighter.ts';
import { addMod, atkMul, clearMod, jumpMul, speedMul } from '../src/game/mods.ts';
import { assetUrl, easeLoad, imageSources, linkRate, liteFight, liteSrc, nextSrc, portraitSrc, SLOW_RATE, stageThumbSrc } from '../src/assets/loader.ts';
import { acceptBlank, isTouchJump, matchStickTouch, stickFingerGone, thumbBandTop, touchRelease, turnedStickDelta } from '../src/game/input.ts';
import { BIT_ATK, BIT_LEFT, BIT_SOFT, NET_BUILD, InputClock, RemotePad, TAP_SLOTS, applyRemoteBits, cleanCode, packBits, readEvents, readPad, tapSlot, type PadEvent } from '../src/net/proto.ts';
import { GAME_FIELDS, IdBook, NO_WIRE, PART_BYTES, applyState, captureState, diffState, partText, patchState, readPart, splitParts, type WireState } from '../src/net/state.ts';
import { iceList, parseIce } from '../src/net/config.ts';
import { HASH_EVERY, LockSession, Rng, SNAP_RTT_MS, TICK_MS, TICK_STEPS, dumpGame, hashGame, loadGame } from '../src/net/lock.ts';
import { EchoBook, HOST_LEAD_MS, applyClaimHit, coastHost, guestFrame, netAudio, queueGuestState, reconcileGuestPred, resetNetForTest, snapshotGuestPred, stepSoftOffset, syncHostGuestPos, type SoftOffset } from '../src/net/play.ts';
import { stateFor } from '../src/game/animState.ts';
import { decodeFrame, relayAddressCount, relaysCovered, sealCandidates, turnHosts, turnUrlHost } from '../src/net/rtc.ts';
import { swipeEdgeBlock, swipeEdgeHit, swipeEdgeSlide, swipeGuardPop, swipeGuardWanted, toyScriptWanted } from '../src/ui/swipeBack.ts';
import { battleFrame, pictureHud } from '../src/ui/battleFrame.ts';
import { TOUCH_LAYOUT } from '../src/ui/touchLayout.data.ts';
import { DEFAULT_ULT_ICON, ultIcon } from '../src/ui/touchIcons.ts';
import { assignSlotWho, guideIndex, skillHTML, stageCover } from '../src/ui/select.ts';
import { BLOCKED_CODE_HASHES, CODE_SALT, CODENAME_ADJS, CODENAME_CHARS, READY_SECONDS, formatCodename, hashCodeNum, isBlockedCodeNum, rollCodeNum, validCodenameText } from '../src/ui/online.ts';
import { placePick } from '../src/ui/settings.ts';
import { cycleMusicOrder, nextTrack, resolveMusicPrefs, shouldShuffleOnFight, shouldWarmNext, shuffleStartIndex, stepTrack } from '../src/audio/bgm.ts';
import { migrateLinearSlider, musicGain, MUSIC_CAP } from '../src/audio/mix.ts';
import { POOL, aggregatePicks, bestLabel, drawThree, readBest, rollEnemies, stageSetup } from '../src/ui/challenge.ts';
import { checkSpriteGuard } from './sprite-guard.ts';

/* `npm run check` runs this file through node's type stripping: no bundler, and no @types/node to type
   `import 'node:fs'` with. `process.getBuiltinModule` reaches the same builtin without an import. */
declare const process: { getBuiltinModule(name: 'fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { recursive: true }): string[];
  statSync(path: string): { size: number };
} };
const readFileSync = process.getBuiltinModule('fs').readFileSync;
const statSync = process.getBuiltinModule('fs').statSync;

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
function newGame(p1 = at('gale'), p2 = at('boulder'), mode: 'cpu' | 'training' = 'cpu', training?: { noCd: boolean; infiniteUlt: boolean }) {
  const g = new FightGame([ROSTER[p1], ROSTER[p2]], { mode, difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7), training });
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
  assert.deepEqual(runs, ['ave-mujica', 'mygo', 'yumemita', 'poppin-party', 'roselia', 'hello-happy', 'sumimi', 'pastel-palettes', 'afterglow', 'raise-a-suilen', 'morfonica', 'millsage', 'none'], 'roster order is the select-screen band order');
  assert.deepEqual(ROSTER[at('uika')].bands, ['ave-mujica', 'sumimi'], '初华 sings for two units');
  assert.deepEqual(bandMembers('mygo', 'tomori').map(c => c.id), ['anon', 'rana', 'soyo', 'taki'], 'the sing calls her bandmates, never herself');
  assert.deepEqual(guestsFor([ROSTER[at('tomori')]], 'mygo').map(c => c.id), ['anon', 'rana', 'soyo', 'taki'], 'a sing loads the bandmates who are not already in');
  for (const id of ['gale', 'ember', 'boulder']) {
    assert.ok(!PLAYABLE.some(c => c.id === id), id + ' stays off the select screen');
  }
  assert.ok(PLAYABLE.some(c => c.id === 'viola'), 'viola plays without a band');
}

// 削防 plans: multi-hit supers ramp the guard chip so the opening segments stay blockable and a
// later segment breaks the bar. Grabs and noBlock moves are exempt by design. Keep this table in
// step with docs/guard-damage.md when a super's numbers change.
{
  const breaksAt: Record<string, number> = {
    nyamu: 9, sakiko: 5, anon: 5, rana: 10, soyo: 3, kokoro: 3, miyako: 5,
    eve: 5, tsukushi: 5, kanata: 6, mashiro: 2, nagi: 5,
  };
  const segments: Record<string, number> = {
    nyamu: 16, sakiko: 8, anon: 6, rana: 22, soyo: 3, kokoro: 3, miyako: 6,
    eve: 7, tsukushi: 6, kanata: 10, mashiro: 2, nagi: 7,
  };
  for (const [id, breakAt] of Object.entries(breaksAt)) {
    const s = ROSTER[at(id)].skills[5];
    const plan = s.guardPlan;
    assert.ok(plan?.length, id + ': the super declares a guard plan');
    const total = (n: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += plan![Math.min(i, plan!.length - 1)];
      return sum;
    };
    assert.ok(total(breakAt - 1) < 100, `${id}: ${breakAt - 1} segments do not break the bar, ${total(breakAt - 1)}`);
    assert.ok(total(breakAt) >= 100, `${id}: segment ${breakAt} breaks the bar, ${total(breakAt)}`);
    assert.ok(total(segments[id]) >= 100, `${id}: the whole move can break the bar, ${total(segments[id])}`);
    const opening = s.fx === 'butterfly' ? plan![0] : total(2);
    assert.ok(opening < 40, `${id}: the opening stays under a chipped bar, ${opening}`);
    assert.equal(withGuard(s, breakAt + 99).guardDmg, plan![plan!.length - 1], id + ': a late segment repeats the last entry');
  }
  for (const id of ['uika', 'mutsumi', 'umiri', 'taki', 'layer', 'sayo', 'houka']) {
    const s = ROSTER[at(id)].skills[5];
    assert.ok(!s.guardPlan && !s.guardDmg, id + ': the unblockable super carries no guard value');
  }
}

// slow phones: a long frame gap catches up at most 6 steps; only a slow touch device goes lite
{
  const g = new FightGame([ROSTER[at('gale')], ROSTER[at('boulder')]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(7) });
  g.advance(1000);
  g.advance(2000);
  assert.ok(g.age > 0 && g.age <= 6 * STEP + 1e-9, 'a 1s hitch advances at most 6 steps, got ' + g.age / STEP);
  assert.equal(shouldGoLite(16, true), false, '60fps touch stays full');
  assert.equal(shouldGoLite(30, false), false, 'desktop never goes lite');
  assert.equal(shouldGoLite(30, true), true, 'a ~33fps touch device goes lite');
  assert.equal(backingScale(3, true, false), 3, 'a phone raster matches its screen');
  assert.equal(backingScale(3, true, true), 2.25, 'lite sheds pixels from the screen ratio');
  assert.equal(backingScale(2, false, true), 2, 'desktop keeps the monitor ratio');
  assert.equal(backingScale(0, true, false), 1, 'a missing ratio falls back to 1');
  assert.equal(portraitBodyScale(true), 1.3, 'a portrait split draws bodies at 1.3×');
  assert.equal(portraitBodyScale(false), 1, 'landscape and desktop keep body scale at 1');
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

// 完美格挡: an attack press while guarding, just before a melee hit, spends no guard, takes no chip,
// drains the swinger's meter and staggers them out of the swing
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('ArrowDown'); run(g, .1);
  p1.energy = 50;
  const hp = p2.hp;
  g.keyDown('KeyJ'); g.keyDown('Numpad1'); g.keyUp('Numpad1');
  run(g, .2); // the hit, its longer freeze-frame, then the stagger lands on the next step
  assert.equal(p2.guard, 100, 'a perfect block spends no guard');
  assert.equal(p2.hp, hp, 'a perfect block takes no chip from a normal');
  assert.ok(p1.energy < 45, `a perfect block drains the swinger's meter, saw ${p1.energy}`);
  assert.ok(p1.stun > 0 && !p1.attack, 'the swinger staggers out of the swing');
  assert.ok(g.texts.some(t => t.text === '完美格挡'), 'the perfect block is called out');
}

// 完美格挡: a window that closes on nothing locks the next press out, so mashing is a plain guard
{
  const g = newGame(); const [p1, p2] = g.fighters; dummy(g);
  p2.x = p1.x + 60; p2.facing = -1;
  g.keyDown('ArrowDown'); run(g, .1);
  g.keyDown('Numpad1'); g.keyUp('Numpad1'); run(g, .2);
  assert.ok(p2.parryLock > 0, 'a whiffed window arms the lockout');
  g.keyDown('Numpad1'); g.keyUp('Numpad1');
  assert.equal(p2.parry, 0, 'a press inside the lockout opens nothing');
  g.keyDown('KeyJ'); run(g, .15);
  assert.ok(p2.guard < 100, 'the hit is a normal block');
  assert.ok(!g.texts.some(t => t.text === '完美格挡'), 'and no perfect block');
}

// 完美格挡: a perfect-blocked shot siphons double and answers with one counter orb; the orb's cooldown holds
{
  const g = newGame(at('ember'), at('boulder')); const [p1, p2] = g.fighters; dummy(g); // 星火 U = 火球
  p2.x = p1.x + 300; p2.facing = -1;
  g.keyDown('ArrowDown'); run(g, .1);
  p1.energy = 50;
  const hp1 = p1.hp;
  g.keyDown('KeyU');
  for (let i = 0; i < 240 && !g.projectiles.some(p => p.owner === p1.id && Math.abs(p.x - p2.x) < 75); i++) g.step(STEP);
  g.keyDown('Numpad1'); g.keyUp('Numpad1');
  run(g, .15);
  assert.equal(p2.guard, 100, 'the shot is perfect-blocked');
  assert.ok(p1.energy < 35, `a perfect-blocked shot siphons more meter, saw ${p1.energy}`);
  assert.equal(g.projectiles.filter(p => p.owner === p2.id && p.skill.parryOrb).length, 1, 'one counter orb flies back');
  assert.ok(p2.parryOrbCd > 0, 'the orb goes on cooldown');
  assert.ok(g.projectiles.every(p => !p.skill.parryOrb || p.solid === false), 'the counter orb passes through enemy shots');
  run(g, .8);
  assert.ok(p1.hp < hp1, 'the counter orb lands on the shooter');
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

// training: no clock, skills have no cooldown, meter stays full, a target only refills at 0
{
  const g = newGame(at('gale'), at('boulder'), 'training'); const [p1, p2] = g.fighters;
  p1.energy = 10; p2.hp = 400; run(g, 1);
  assert.equal(g.time, 60, 'training clock frozen');
  assert.equal(p1.energy, 100, 'training energy pinned');
  assert.equal(p2.hp, 400, 'a hurt target stays at the damage');
  g.keyDown('KeyU');
  g.step(STEP);
  assert.equal(p1.attack?.index, 2, 'the skill comes out');
  assert.equal(p1.cooldowns[2], 0, 'training skills have no cooldown');
  p1.cooldowns[0] = .4;
  g.step(STEP);
  assert.ok(p1.cooldowns[0] > .3, `normals keep their cooldown, left ${p1.cooldowns[0]}`);
  p2.hp = 0;
  g.step(STEP);
  assert.equal(p2.hp, p2.data.hp, 'an empty target refills');
}
{
  const g = newGame(at('gale'), at('boulder'), 'training', { noCd: false, infiniteUlt: false }); const [p1, p2] = g.fighters;
  assert.ok(p1.energy < 100, 'training can start without a full meter');
  p2.x = X_MAX;
  p2.hp = 400;
  g.keyDown('KeyU');
  g.step(STEP);
  assert.ok(p1.cooldowns[2] > .5, `skills cool down when the option is off, left ${p1.cooldowns[2]}`);
  const energy = p1.energy;
  run(g, 1);
  assert.ok(p1.energy < 100 && p1.energy > energy, 'energy recovers on its own and is not pinned');
  assert.equal(p2.hp, 400, 'turning the switches off does not bring the regen back');
}
// training: the summoned ally gets a brain, the ordinary dummy stays frozen
{
  const g = newGame(at('hotaru'), at('boulder'), 'training');
  const v2 = g.fighters[1];
  g.keyDown('KeyI');
  run(g, .8);
  const ally = g.fighters.find(f => f.minion);
  assert.ok(ally, 'the device joins in training');
  const from = ally!.x;
  run(g, 2);
  assert.ok(Math.abs(ally!.x - from) > 1, 'the training ally moves on its own brain');
  assert.equal(v2.ai.move, 0, 'the ordinary training dummy still has no AI stick');
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

  const down = newGame(umiri, at('boulder')); const [d1, d2] = down.fighters; dummy(down);
  d2.x = d1.x + 80; d2.facing = -1;
  d2.invuln = .5;
  d2.attack = { skill: d2.data.skills[0], index: 0, serial: 1, t: .1, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: d2.x };
  d1.stun = .4; d1.knocked = 1; d1.vy = 0; d1.hitBySuper = true;
  d1.queue.push({ index: 0, ttl: .2 });
  down.keyDown('KeyO'); down.step(STEP);
  assert.equal(d1.attack?.skill.fx, 'ripple', '恐湖 escapes a knockdown');
  assert.equal(d1.knocked, 0, 'the escape clears the knockdown');
  assert.equal(d1.queue.length, 0, 'the escape replaces the buffered jab');
  assert.equal(d2.attack, null, 'the escape interrupts the foe on the press');
  assert.ok(d2.hp < d2.data.hp, 'the hit lands through cast invuln');

  const neutral = newGame(umiri, at('boulder')); const [n1] = neutral.fighters; dummy(neutral);
  neutral.keyDown('KeyJ');
  neutral.keyDown('KeyO');
  neutral.step(STEP);
  assert.equal(n1.attack?.skill.fx, 'ripple', '恐湖 jumps a buffered jab');
  assert.ok((n1.attack?.t ?? 1) < .05, 'buffering a jab does not skip 恐湖 startup');
  assert.equal(n1.queue.length, 0, 'the jab is not kept behind it');

  const clash = newGame(umiri, at('mashiro')); const [z1, z2] = clash.fighters; dummy(clash);
  z2.x = z1.x + 80; z2.facing = -1;
  z2.invuln = .4;
  z2.attack = { skill: z2.data.skills[4], index: 4, serial: 1, t: .3, emitted: true, shots: 0, burst: 0, hit: new Set(), endure: 1, liftAt: 0, tossAt: 0, hold: -1, anchor: z2.x, pierce: true };
  const clashHp = z2.hp;
  z1.stun = .3; z1.hitBySuper = true;
  clash.keyDown('KeyO');
  clash.step(STEP);
  assert.equal(z2.attack?.pierce, true, 'two reversals do not delete each other');
  assert.equal(z2.hp, clashHp, 'a reversal does not cut the other reversal');

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

// 削防: the spin's opening segments are still blocked on a beaten-down 40% bar; the later one
// breaks it and the rest land clean.
{
  const g = newGame(at('anon'), at('boulder')); const [a1, a2] = g.fighters; dummy(g);
  a1.energy = a1.energyMax;
  a2.x = a1.x + 100; a2.facing = -1; a2.guard = 40;
  g.keyDown('ArrowDown'); run(g, .1);
  assert.equal(a2.blocking, true, 'the dummy is guarding before the spin');
  const hp = a2.hp;
  g.keyDown('KeyL');
  let blocked = 0;
  let broke = false;
  for (let i = 0; i < Math.round(1.8 / STEP); i++) {
    const before = a2.guard;
    g.step(STEP);
    if (a2.guard < before) blocked++;
    if (g.texts.some(t => t.text === '破防!')) { broke = true; break; }
  }
  assert.ok(broke, 'the spin breaks a 40% bar');
  assert.ok(blocked >= 4, `three opening segments are blocked before the break, saw ${blocked - 1}`);
  assert.ok(a2.hp < hp, 'the segments after the break land clean');
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
  assert.equal(data.skills[5].cost, 200, 'the sing costs 200');
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
    assert.equal(mate.dmgMul, .3, 'the teammate hits for three tenths');
    assert.equal(mate.data.hp, 200, 'the health cap is 200, not a fraction');
    assert.equal(mate.hp, 200, 'the teammate spawns at full health on the lowered cap');
    assert.ok((mate.life ?? 0) > 11, `twelve seconds on the clock, left ${mate.life}`);
    assert.ok(s1.noGain > 0, 'the sing locks the meter while the teammate is up');
    const shut = s1.energy;
    const before = s2.hp;
    run(g, 2.5);
    assert.ok(Number.isFinite(g.totalHits[mate.id]), 'minion hits land in the score tables');
    assert.ok(s2.hp < before, 'the teammate swings on her own');
    assert.equal(s1.energy, shut, 'no energy while the teammate stands');
    mate.hp = 5;
    hit(g, s2, mate, s2.data.skills[0], { hit: new Set() });
    run(g, STEP * 16); // the hit's hitstop eats the first few steps
    assert.equal(g.fighters.length, 2, 'the teammate leaves when defeated');
    assert.equal(s1.noGain, 0, 'the meter opens when the teammate falls');
    const opened = s1.energy;
    run(g, .5);
    assert.ok(s1.energy > opened, 'energy returns after the teammate leaves');

    s2.hp = s2.data.hp; // the master-brain teammate could wear the dummy down; keep the round alive on purpose
    s1.energy = s1.energyMax;
    g.keyUp('KeyL');
    g.keyDown('KeyL');
    run(g, 1.3);
    assert.equal(g.fighters.length, 3, 'the teammate answers again');
    // Hitstop steals steps from the life clock, so bow-out needs a little more than twelve sim-seconds.
    for (let i = 0; i < Math.round(16 / STEP); i++) { g.step(STEP); if (g.fighters.length === 2) break; }
    assert.equal(g.fighters.length, 2, 'the teammate bows out when time is up');
    assert.equal(s1.noGain, 0, 'the meter opens when the teammate bows out');
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
  // Arrow keys belong to the page on the select screen; hijacking them broke laptop scrolling.
  const selectSrc = readFileSync('src/ui/select.ts', 'utf8');
  assert.ok(!selectSrc.includes('navigateRoster') && !selectSrc.includes('navigateGrid'), 'arrows never move the roster or stage picker');
  // Portraits render at the display's real pixel density. A fixed 1× canvas was filter-upscaled
  // by the compositor on HiDPI laptops and read as blur next to the arena's device-sized canvas.
  const fitSrc = readFileSync('src/ui/canvasFit.ts', 'utf8');
  assert.ok(fitSrc.includes('devicePixelRatio'), 'canvas backing stores follow the display scale');
  assert.ok(selectSrc.includes('fitCanvas') && readFileSync('src/ui/challenge.ts', 'utf8').includes('fitCanvas'), 'select portraits and buff-picker foes use the device-resolution fit');
  const uiCss = readFileSync('src/style.css', 'utf8');
  assert.ok(!/\.fighter-preview canvas \{[^}]*image-rendering/.test(uiCss) && !/\.buff-foe canvas \{[^}]*image-rendering/.test(uiCss), 'a device-sized canvas is never handed a nearest-neighbour filter');
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
  assert.equal(assetUrl('/sprites/aya/common.png', './'), './sprites/aya/common.png', 'a relative base keeps sheets inside the toy directory');
  assert.equal(assetUrl('/bgm/garupa-pico-instrumental.m4a', '/'), '/bgm/garupa-pico-instrumental.m4a', 'the dev server still requests from the site root');
  assert.ok(readFileSync('src/assets/loader.ts', 'utf8').includes('once().catch(() => once())'), 'a dropped image is requested once more before the block figure');
  const headers = readFileSync('public/_headers', 'utf8');
  const rules: [string, string][] = [];
  let cachePath = '';
  for (const line of headers.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('/')) { cachePath = t; continue; }
    const m = /^Cache-Control:\s*(.+)$/.exec(t);
    if (!m || !cachePath) throw Error('FAIL: public/_headers has a line the cache check cannot read');
    rules.push([cachePath, m[1]]);
    cachePath = '';
  }
  if (cachePath) throw Error('FAIL: public/_headers path without Cache-Control');
  const rule = (path: string) => rules.find(r => r[0] === path)?.[1];
  assert.equal(rule('/bgm/*'), 'public, max-age=2592000', 'bgm is cached for 30 days');
  assert.equal(rule('/sfx/*'), 'public, max-age=2592000', 'sfx is cached for 30 days');
  assert.equal(rule('/'), 'public, max-age=0, stale-while-revalidate=604800', 'the document can paint from cache while it revalidates');
  assert.equal(rule('/index.html'), 'public, max-age=0, stale-while-revalidate=604800', 'index.html uses the same document cache');
  const edge = JSON.parse(readFileSync('edgeone.json', 'utf8')) as { nodeVersion?: string; headers?: { source: string; headers: { key: string; value: string }[] }[] };
  assert.equal(edge.nodeVersion, '22.21.1', 'EdgeOne builds on preinstalled Node 22.21');
  assert.deepEqual(edge.headers?.map(h => [h.source, h.headers.length === 1 && h.headers[0].key === 'Cache-Control' ? h.headers[0].value : '']), rules, 'edgeone.json carries the same cache rules as public/_headers');
  assert.ok(!readFileSync('src/assets/loader.ts', 'utf8').includes('loadPortrait'), 'a failed idle crop does not download the full sheet');
  assert.ok(readFileSync('src/render/spriteView.ts', 'utf8').includes('missingImages.has(stand)'), 'a failed idle crop shows the block figure');
  assert.equal(portraitSrc('/sprites/aya/common.png', true), '/sprites/aya/idle.png', 'the select screen asks for the idle cell, not the whole sheet');
  assert.equal(portraitSrc('/sprites/aya/common.png', false), '/sprites/aya/common.png', 'dev has no idle crop and uses the sheet');
  assert.equal(portraitSrc('/sprites/aya/special.png', true), '/sprites/aya/special.png', 'only the common sheet has an idle crop');
  assert.equal(stageThumbSrc('/stages/ring.png', true), '/stages/ring-thumb.png', 'stage cards ask for the small preview');
  assert.equal(stageThumbSrc('/stages/ring.png', false), '/stages/ring.png', 'dev stage cards use the full backdrop');
  assert.ok(readFileSync('scripts/compress-images.ts', 'utf8').includes('const NEAR = 22'), 'webp stays at the near-lossless 22 baseline');
  assert.ok(readFileSync('scripts/compress-images.ts', 'utf8').includes('const STAGE_Q = 80'), 'stage backdrops stay lossy webp at quality 80');
  assert.ok(readFileSync('scripts/compress-images.ts', 'utf8').includes('idle.webp'), 'the build writes the 256px idle crop');
  assert.ok(readFileSync('scripts/compress-images.ts', 'utf8').includes("'-lite.webp'"), 'the build writes the half-size lite sheet');
  const packToy = readFileSync('scripts/pack-toy.py', 'utf8');
  assert.ok(packToy.includes('TOY_BGM_BITRATE = "64k"'), 'the toy zip re-encodes bgm to 64 kbps');
  assert.ok(packToy.includes('rel.startswith("bgm/") and rel.endswith(".m4a")'), '64 kbps applies only to bgm m4a');
  assert.ok(packToy.includes('z.write(tmp, rel)'), 'the 64 kbps encode is a zip entry and does not replace dist');
  assert.equal(liteSrc('/sprites/aya/common.png', true), '/sprites/aya/common-lite.webp', 'a sheet has a half-size lite copy');
  assert.equal(liteSrc('/sprites/aya/common.png', false), '/sprites/aya/common.png', 'dev has no lite copy');
  assert.equal(liteSrc('/stages/ring.png', true), '/stages/ring.png', 'stages use the thumb, not a lite copy');
  {
    // 30KB/s: two 60KB files that overlap for half their time are one 3s busy window.
    const slow = linkRate([{ transferSize: 60_000, responseStart: 0, responseEnd: 2000 }, { transferSize: 30_000, responseStart: 1000, responseEnd: 3000 }]);
    assert.ok(slow !== null && Math.abs(slow - 30_000) < 1, 'overlapping downloads share the link: 90KB over 3s is 30KB/s');
    assert.ok(slow! < SLOW_RATE, 'a few dozen KB/s is a slow link');
    assert.ok(linkRate([{ transferSize: 400_000, responseStart: 0, responseEnd: 200 }])! > SLOW_RATE, '2MB/s is a fast link');
    assert.equal(linkRate([{ transferSize: 0, responseStart: 0, responseEnd: 0 }, { transferSize: 10_000, responseStart: 0, responseEnd: 500 }]), null, 'cache hits and a few KB decide nothing');
    const aya = PLAYABLE.find(c => c.id === 'aya')!;
    const nonoka = PLAYABLE.find(c => c.id === 'nonoka')!;
    const stage = STAGES.find(s => s.image)!;
    const plan = liteFight([aya, nonoka], stage, () => false, true);
    assert.ok(plan.need.includes('/sprites/aya/common-lite.webp') && plan.need.includes('/sprites/aya/special-lite.webp'), 'a slow fight waits for the two lite main sheets');
    assert.ok(plan.need.includes(stageThumbSrc(stage.image!, true)), 'a slow fight waits for the stage preview, not the backdrop');
    assert.ok(plan.need.every(s => !s.endsWith('/common.png') && !s.endsWith('/special.png')), 'a slow fight does not wait for a full sheet');
    assert.ok(plan.rest.some(s => s.includes('/nonoka/') && s.endsWith('-lite.webp')) && plan.rest.every(s => !plan.need.includes(s)), 'form sheets follow during the fight');
    const warm = liteFight([aya], stage, s => s.includes('/aya/common'), true);
    assert.ok(!warm.need.some(s => s.includes('/aya/common')), 'a sheet already held in full needs no lite copy');
  }
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
  assert.equal(pictureHud(960), 1.2, 'a desktop-wide picture sits 1.2× above the base HUD');
  assert.equal(pictureHud(480), 0.6, 'a half-width portrait picture keeps that 1.2× on the smaller share');
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
    const dialogHtml = html.slice(start, end);
    const onlineGroup = dialogHtml.match(/<section class="setting-group" id="set-online-group">[\s\S]*?<\/section>/)?.[0] ?? '';
    assert.equal(onlineGroup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), '联机 联机代号 修改代号', 'online codename setting row has control name and button only');
    const visible = dialogHtml.replace(onlineGroup, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.equal(visible, '设置 × 名册 名册显示 直接排开 直接排开 按乐队分组 训练场 无技能冷却 开 开 关 无限大招 开 开 关 音乐 开打换曲 ? 只在随机播放时生效，其他时候不能改。 开 开 关', 'settings dialog keeps control names, plus the fight-shuffle tip (with #set-online-group exempted)');
    const css = readFileSync('src/style.css', 'utf8');
    assert.ok(css.includes('width: min(760px, calc(100% - 2rem))'), 'settings dialog width is reserved, not content-sized');
    assert.ok(css.includes('minmax(0, 1fr) min(16em, 46%)'), 'settings dropdowns share one column so their lengths stay aligned');
    assert.ok(css.includes('popover') || html.includes('popover'), 'settings menus are popovers so opening one does not grow the dialog');
    assert.ok(css.includes('inset: unset'), 'popover menus drop the browser centering that flashes mid-screen');
    assert.ok(!css.includes('100vw'), 'dialog width must not use 100vw; it includes the scrollbar and shifts the page');
    assert.ok(css.includes('color-scheme: dark'), ':root declares dark color-scheme so native controls and scrollbars never fall back to light OS white+grey');
    assert.ok(css.includes('*::-webkit-scrollbar {') && css.includes('*::-webkit-scrollbar-thumb { background: var(--line)'), 'global scrollbar uses site tokens (--line / --muted) by default for all scrollable containers');
    assert.ok(!/[^\s*(]::-webkit-scrollbar/.test(css), 'scrollbar styling lives only on the global * selector; panels do not invent separate scrollbar skins');
    assert.deepEqual(
      placePick({ right: 200, top: 40, bottom: 70 }, { width: 80, height: 60 }, { width: 400, height: 300 }),
      { top: 74, left: 120 },
      'a menu sits under the trigger, right edges aligned',
    );
    assert.deepEqual(
      placePick({ right: 200, top: 200, bottom: 240 }, { width: 80, height: 80 }, { width: 400, height: 300 }),
      { top: 116, left: 120 },
      'a menu flips above when it would leave the viewport',
    );
    assert.equal(
      placePick({ right: 30, top: 10, bottom: 40 }, { width: 100, height: 20 }, { width: 200, height: 200 }).left,
      8,
      'a menu that would hang off the left is pinned to the edge',
    );
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
  assert.ok(cssText.includes('body.touch.turned.in-battle') && cssText.includes('rotate(90deg)'), 'portrait phones turn the battle instead of waiting for the app to rotate');
  assert.ok(html.includes('class="arena-view"'), 'portrait splits the picture off the pad');
  assert.ok(!html.includes('rotate-hint'), 'portrait plays on the split pad instead of a turn-the-phone cover');
  assert.ok(cssText.includes('body.pad-split .touchpad') && cssText.includes('body.pad-split .tp-actions .atk'), 'a portrait fight puts a fan pad under the arena');
  assert.ok(!readFileSync('src/main.ts', 'utf8').includes('portraitHold'), 'portrait fights stay playable instead of force-pausing');
  assert.ok(cssText.includes('.game-banner .icon-btn .btn-label { display: inline; }'), 'a phone pause menu keeps the words next to the icons');
  // Stage rows follow the stage's own width. A short landscape phone is wide enough for one row;
  // tying the 2x2 to max-height put every phone landscape into two rows.
  const atRuleBody = (css: string, needle: string): string => {
    const start = css.indexOf(needle);
    if (start < 0) throw Error('FAIL: missing ' + needle);
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) return css.slice(open, i + 1);
      }
    }
    throw Error('FAIL: unclosed ' + needle);
  };
  const stageRows = atRuleBody(cssText, '@container stage (max-width: 36rem)');
  assert.ok(html.includes('class="stage-frame"') && cssText.includes('container-name: stage'), 'the stage container wraps the select stage');
  assert.ok(stageRows.includes('grid-area: 2 / 1'), 'a narrow stage uses the 2x2 team layout');
  assert.equal((cssText.match(/grid-area: 2 \/ 1/g) ?? []).length, 1, 'the 2x2 team placement lives only in the stage container');
  const shortLandscape = atRuleBody(cssText, '@media (orientation: landscape) and (max-height: 500px)');
  assert.ok(!shortLandscape.includes('grid-area'), 'short landscape does not choose stage rows');
  assert.ok(!shortLandscape.includes('/ 2)'), 'short landscape does not halve portrait height');
  assert.ok(stageRows.includes('(100dvh - 220px) / 2'), 'two-row portraits shrink only inside the narrow stage');
  // Visual alignment locks: .fighter-preview strictly uses 3 named grid tracks ("chip" / "art" / "name")
  // on both desktop and mobile so left/right slots share horizontal baselines and online overlays stack inside "art".
  assert.ok(cssText.includes('grid-template-areas: "chip" "art" "name"'), 'desktop fighter-preview locks 3-track grid-template-areas');
  assert.ok(cssText.includes('grid-template-areas: "art" "name" "chip"'), 'mobile fighter-preview locks 3-track grid-template-areas');
  assert.ok(cssText.includes('.select-stage.net .fighter-preview { grid-template-areas: "chip" "art" "name"; }'), 'mobile online fighter-preview keeps tag and codename above the character');
  assert.ok(/\.slot-head\s*\{[^}]*grid-area:\s*chip/.test(cssText), '.slot-head is pinned to grid-area: chip');
  assert.ok(/\.fighter-preview canvas\s*\{[^}]*grid-area:\s*art/.test(cssText), '.fighter-preview canvas is pinned to grid-area: art');
  assert.ok(/\.fighter-preview h1\s*\{[^}]*grid-area:\s*name/.test(cssText), '.fighter-preview h1 is pinned to grid-area: name');
  assert.ok(/\.net-mystery-badge\s*\{[^}]*grid-area:\s*art/.test(cssText), '.net-mystery-badge stacks in grid-area: art');
  assert.ok(/\.net-slot-card\s*\{[^}]*grid-area:\s*art/.test(cssText), '.net-slot-card stacks in grid-area: art');
  assert.ok(/\.net-slot-card\s*\{[^}]*background:\s*transparent/.test(cssText) && /\.net-slot-card\s*\{[^}]*border:\s*0/.test(cssText), '.net-slot-card is frameless over the silhouette');
  assert.ok(/<span id="net-status" hidden><\/span>/.test(html), '#net-status is hidden so #preview-right has strictly one visible name line matching #preview-left');
  assert.ok(!/class="[^"]*action-foot[^"]*"[^>]*id="net-actions"/.test(html), '#net-actions does not use .action-foot (display: contents) which would swap action-bar columns');
  assert.ok(/\.net-actions-foot\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/.test(cssText), '.net-actions-foot spans columns 2..-1 to stay on the right of .action-mode');
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
  assert.equal(swipeGuardWanted(true), true, 'a phone keeps the container back swipe off');
  assert.equal(swipeGuardWanted(false), false, 'a desktop visit does not trap back');
  assert.equal(swipeGuardPop(true, false), 'rearm', 'a back swipe on a phone stays on this page');
  assert.equal(swipeGuardPop(false, true), 'skip', 'leaving touch drops the extra history entry');
  assert.equal(swipeGuardPop(true, true), 'rearm', 'touch returning before that pop lands still stays');
  assert.equal(swipeGuardPop(false, false), 'idle', 'a desktop pop is not ours');
  assert.equal(swipeEdgeHit(0, 400), true, 'the left screen edge is the back swipe');
  assert.equal(swipeEdgeHit(24, 400), true, 'the back-swipe slop is inside the strip');
  assert.equal(swipeEdgeHit(25, 400), false, 'the stick past the strip is not a browser gesture');
  assert.equal(swipeEdgeHit(376, 400), true, 'the right screen edge is the forward swipe');
  assert.equal(swipeEdgeHit(10, 40), false, 'a viewport with no interior is not all edge');
  assert.equal(swipeEdgeBlock(0, 400, false), true, 'a blank or stick touch at the edge is refused');
  assert.equal(swipeEdgeBlock(0, 400, true), false, 'a button at the edge keeps its click');
  assert.equal(swipeEdgeSlide(12, 2), true, 'a sideways edge stroke is the swipe');
  assert.equal(swipeEdgeSlide(4, 0), false, 'a tap jitter is not a swipe');
  assert.equal(swipeEdgeSlide(10, 30), false, 'a vertical stroke at the edge still scrolls');
  assert.equal(toyScriptWanted('www.bilibili.com', true, false), true, 'the toy host loads its bridge script');
  assert.equal(toyScriptWanted('moefighters.com', true, false), false, 'a normal phone does not load the toy script');
  assert.equal(toyScriptWanted('www.bilibili.com', true, true), false, 'an existing bridge is called, not re-fetched');
  assert.equal(toyScriptWanted('notbilibili.com', true, false), false, 'a lookalike host does not load the toy script');
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
  assert.equal(acceptBlank(false, false), true, 'landscape blanks stay on the fight picture');
  assert.equal(acceptBlank(true, false), false, 'a portrait fight picture does not dodge');
  assert.equal(acceptBlank(true, true), true, 'portrait blanks land on the pad');
  // Band starts just below the attack top, so a ~390px phone exempts about the bottom fifth.
  const phoneBand = thumbBandTop(297, 87);
  assert.ok(phoneBand > 297 && phoneBand - 297 < 87 * .15, 'the band starts just below the attack top');
  assert.ok((390 - phoneBand) / 390 < .28, 'a phone no longer exempts the bottom half');
  const turnedRight = turnedStickDelta(0, 10);
  assert.equal(turnedRight.dx, 10);
  assert.equal(turnedRight.dy, 0);
  const turnedUp = turnedStickDelta(10, 0);
  assert.equal(turnedUp.dx, 0);
  assert.equal(turnedUp.dy, -10);
}

// BGM contract: pure Web Audio only. iOS ignores a media element's volume property (the slider
// goes dead, the default attenuation is lost) and adopts a playing element as a Now Playing
// session — the Dynamic Island keeps it audible in the background past the page's suspend hooks.
{
  const bgm = readFileSync('src/audio/bgm.ts', 'utf8');
  assert.ok(!/\bnew Audio\b|createMediaElementSource/.test(bgm), 'BGM stays on Web Audio buffers: no media element, no element source node');
  assert.ok(bgm.includes("s.loop = order === 'one'"), 'only single-repeat loops the buffer');
  assert.ok(bgm.includes('gen !== loadGen'), 'a stale decode cannot replace the track the click already moved to');
  assert.equal(cycleMusicOrder('seq'), 'shuffle');
  assert.equal(cycleMusicOrder('shuffle'), 'one');
  assert.equal(cycleMusicOrder('one'), 'seq');
  assert.equal(stepTrack(0, -1, 6), 5, 'previous wraps to the last track');
  assert.equal(stepTrack(5, 1, 6), 0, 'next wraps to the first track');
  assert.equal(nextTrack('one', 2, 6, () => 0), 2, 'single-repeat stays on the current track');
  assert.equal(nextTrack('seq', 5, 6, () => 0), 0, 'sequential play wraps at the end');
  assert.equal(nextTrack('shuffle', 2, 6, () => 4), 4, 'shuffle uses the picked track');
  assert.equal(nextTrack('shuffle', 2, 6, () => 2), 3, 'shuffle does not replay the track that just ended');
  assert.equal(nextTrack('seq', 0, 1, () => 0), 0, 'a single-track list has nowhere to go');
  assert.equal(shouldShuffleOnFight('shuffle', true), true, 'a random fight can change tracks');
  assert.equal(shouldShuffleOnFight('shuffle', false), false, 'the switch stays off when the player turned it off');
  assert.equal(shouldShuffleOnFight('seq', true), false, 'sequential play does not change tracks on fight start');
  assert.equal(shouldShuffleOnFight('one', true), false, 'single repeat does not change tracks on fight start');
  assert.equal(shuffleStartIndex(6, () => 4), 4, 'a shuffle visit can open on a later track');
  assert.equal(shuffleStartIndex(6, () => 99), 0, 'an out-of-range roll falls back to the first track');
  assert.equal(shuffleStartIndex(1, () => 0), 0, 'one track has nothing to roll');
  const idle = { held: false, busy: false, slow: false, haveBuffer: true };
  assert.equal(shouldWarmNext({ ...idle, order: 'seq' }), true, 'sequential play warms the next track once this one is audible');
  assert.equal(shouldWarmNext({ ...idle, order: 'shuffle' }), true, 'shuffle warms one later track once this one is audible');
  assert.equal(shouldWarmNext({ ...idle, order: 'one' }), false, 'single repeat does not download another file');
  assert.equal(shouldWarmNext({ ...idle, order: 'seq', held: true }), false, 'a sheet download holds the music lookahead');
  assert.equal(shouldWarmNext({ ...idle, order: 'seq', busy: true }), false, 'an in-flight image holds the music lookahead');
  assert.equal(shouldWarmNext({ ...idle, order: 'seq', slow: true }), false, 'a slow link does not prefetch');
  assert.equal(shouldWarmNext({ ...idle, order: 'seq', haveBuffer: false }), false, 'the current track is fetched before any lookahead');
  assert.ok(readFileSync('src/audio/bgm.ts', 'utf8').includes("priority: 'low'"), 'lookahead fetch stays at the lowest priority');
  assert.ok(bgm.includes('localStorage'), 'BGM prefs persist in localStorage');
  assert.ok(!/sessionStorage\.setItem/.test(bgm), 'BGM does not keep writing the old session key');
  assert.ok(statSync('public/bgm/garupa-pico-instrumental.m4a').size < 3_400_000, 'bgm stays a 96 kbps encode under 3.4MB');
  const on = resolveMusicPrefs('{"enabled":true,"volume":0.4,"curve":"db"}', '{"enabled":false,"volume":0.9}');
  assert.deepEqual(on, { enabled: true, volume: 0.4, writeLocal: null, dropSession: true }, 'a log-fader record wins over a stale session');
  const moved = resolveMusicPrefs(null, '{"enabled":true,"volume":0.4}');
  assert.equal(moved.enabled, true, 'an old session record still turns music on');
  assert.equal(moved.volume, migrateLinearSlider(0.4), 'an old linear slider moves to the log detent with the same amplitude');
  assert.equal(moved.writeLocal, JSON.stringify({ enabled: true, volume: moved.volume, curve: 'db' }), 'the migrated record is what gets stored');
  assert.equal(moved.dropSession, true, 'the session record is dropped after the copy');
  const broken = resolveMusicPrefs('{', '{"enabled":true,"volume":0.5}');
  assert.equal(broken.enabled, true, 'broken local JSON falls through to the session record');
  assert.equal(broken.volume, migrateLinearSlider(0.5), 'broken local JSON does not drop the session volume');
  const fresh = resolveMusicPrefs(null, null);
  assert.deepEqual(fresh, { enabled: true, volume: migrateLinearSlider(0.15), writeLocal: null, dropSession: false }, 'a first visit leaves music on and does not store a choice');
  const junk = resolveMusicPrefs('null', 'nope');
  assert.deepEqual(junk, { enabled: true, volume: migrateLinearSlider(0.15), writeLocal: null, dropSession: false }, 'unreadable prefs fall back to defaults without throwing');
  const coerced = resolveMusicPrefs('{"enabled":"true","volume":"x"}', null);
  assert.equal(coerced.enabled, false, 'a non-boolean switch stays off');
  assert.equal(coerced.volume, migrateLinearSlider(0.15), 'a bad volume uses the default detent');
  assert.equal(coerced.writeLocal, JSON.stringify({ enabled: false, volume: coerced.volume, curve: 'db' }), 'a legacy record is rewritten instead of thrown');
  const step = 20 * Math.log10(musicGain(0.6) / musicGain(0.55));
  assert.ok(Math.abs(step - 2) < 1e-9, `one slider detent is 2 dB, got ${step}`);
  assert.equal(musicGain(1), MUSIC_CAP, 'full scale stays at the old linear cap');
  for (let p = 5; p <= 100; p += 5) {
    const t = p / 100;
    const next = musicGain(migrateLinearSlider(t));
    const prev = t * MUSIC_CAP;
    const err = Math.abs(20 * Math.log10(next / prev));
    assert.ok(err < 1, `migrated ${p}% stays within 1 dB of the old gain, got ${err}`);
  }
  const sfx = readFileSync('src/audio/sfx.ts', 'utf8');
  assert.ok(sfx.includes('setValueAtTime(.06, t)') && sfx.includes('exponentialRampToValueAtTime(.0001, t + duration)'), 'combat blips keep the original click envelope');
  assert.ok(!sfx.includes('sfxAmp'), 'sfx loudness is not reshaped by the music fader');
  const main = readFileSync('src/main.ts', 'utf8');
  assert.ok(/sfx\.unlock\(\);\s*\/\*[\s\S]*?\*\/\s*shuffleFightTrack\(\);\s*pokeMusic\(\)/.test(main), 'a fight start may reshuffle, then pokes music on the click');
  assert.equal((main.match(/pokeMusic\(\)/g) ?? []).length, 1, 'only the fight start forces music on');
  assert.equal((main.match(/shuffleFightTrack\(\)/g) ?? []).length, 1, 'only entering a fight reshuffles');
  assert.equal((main.match(/nudgeMusic\(\)/g) ?? []).length, 2, 'select-screen clicks and keys only reconnect music that is already allowed to play');
  assert.ok(main.includes("seq: '顺序播放', shuffle: '随机播放', one: '单曲循环'"), 'the order button cycles those three labels');
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
  assert.ok(s1.noGain > 7, `gains are locked, left ${s1.noGain}`);
  assert.ok(s1.debt > 7, `the bill window is open, left ${s1.debt}`);
  const full = s1.hp;
  hit(supe, s2, s1, s2.data.skills[1], { hit: new Set() });
  assert.equal(s1.hp, full, 'a hit during the window does not spend hp');
  assert.ok(s1.debtDmg > 40, `the hit is billed, saw ${s1.debtDmg}`);
  assert.equal(s1.energy, 0, 'the window does not refund energy');
  const owed = Math.round(s1.debtDmg * 0.8);
  run(supe, s1.debt + .05);
  assert.equal(s1.debt, 0, 'the window ends');
  assert.equal(s1.hp, full - owed, `the bill is 80%, wanted ${full - owed} got ${s1.hp}`);
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
  // L: a block takes 50% damage
  {
    const g = newGame(viola, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 100;
    p1.x = 200; p2.x = 480; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL');
    g.keyDown('ArrowDown');
    run(g, 1.8);
    const taken = hp - p2.hp;
    assert.ok(taken >= 75 && taken <= 85, `blocked fuga deals 50% damage, took ${taken}`);
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
    p2.x = p1.x + 80; p2.facing = -1;
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

// moca: slow bubble, a die that roots without a freeze, a two-poke grab, a dusk wave that slows a block
{
  const moca = at('moca');
  const data = ROSTER[moca];
  assert.equal(data.name, '青叶摩卡', 'moca display name');
  assert.deepEqual(data.bands, ['afterglow'], 'moca sits in Afterglow');
  assert.equal(ROSTER[moca - 1].id, 'mitake', 'moca follows mitake');
  assert.equal(data.trait, 'focus', 'moca keeps the ordinary walk');
  assert.equal(data.rootFx, 'moca-ring', 'the root wears an ankle ring');
  assert.equal(data.skills[2].cd, 4.5, '半速 cools in 4.5s');
  assert.equal(data.skills[2].slow, 5, '半速 slows for 5s');
  assert.equal(data.skills[2].slowMul, .5, '半速 halves the walk');
  assert.equal(data.skills[2].slowJump, .65, '半速 dulls the jump to 65%');
  assert.equal(data.skills[2].slowAtk, .7, '半速 cuts attack speed by 30%');
  assert.equal(data.skills[2].slowOnBlock, undefined, '半速 does not slow a block');
  assert.equal(data.skills[2].slowMark, 'bubble', '半速 wears the bubble');
  assert.equal(data.skills[3].cd, 6, '扣一点 cools in 6s');
  assert.equal(data.skills[3].root, 1.5, '扣一点 roots for 1.5s');
  assert.equal(data.skills[3].rootBreak, 0, '扣一点 holds until the clock');
  assert.equal(data.skills[3].slowAtk, undefined, '扣一点 does not cut attack speed');
  assert.equal(data.skills[4].cd, 7, '捉弄 cools in 7s');
  assert.equal(data.skills[4].count, 2, '捉弄 pokes twice');
  assert.equal(data.skills[4].range, 150, '捉弄 reaches half again past 100');
  assert.equal(data.skills[4].slow, 5, '捉弄 slows for 5s');
  assert.equal(data.skills[4].slowAtk, .7, '捉弄 cuts attack speed by 30%');
  assert.equal(data.skills[5].count, 1, '小摩卡要上了 is one wave');
  assert.equal(data.skills[5].slowOnBlock, true, '小摩卡要上了 slows a block');
  assert.equal(data.skills[5].cost ?? 100, 100, '小摩卡要上了 costs 100');
  assert.equal(data.skills[5].slowBonus, 100, '小摩卡要上了 adds 100 on an existing slow');
  assert.equal(data.skills[5].noBlockSlow, true, '小摩卡要上了 ignores a block while slowed');
  assert.equal(data.skills[5].slowAtk, .7, '小摩卡要上了 cuts attack speed by 30%');

  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 280; p2.facing = -1;
    g.keyDown('KeyU');
    let saw = false;
    for (let i = 0; i < Math.round(2 / STEP); i++) {
      g.step(STEP);
      if (g.projectiles.some(p => p.fx === 'moca-bubble')) saw = true;
    }
    assert.ok(saw, '半速 spawns a bubble');
    assert.ok(p2.slow > 0, '半速 slows the victim');
    assert.equal(speedMul(p2), .5, 'the walk drops to half');
    assert.equal(jumpMul(p2), .65, 'the jump launch drops to 65%');
    assert.equal(atkMul(p2), .7, 'J / K clocks run at 70%');
    assert.ok(p2.mods.some(m => m.kind === 'slow' && m.mark === 'bubble'), 'the slow wears the bubble mark');
    p2.cooldowns[0] = 1;
    p2.cooldowns[2] = 1;
    run(g, .5);
    assert.ok(Math.abs(p2.cooldowns[0] - .65) < .02, `J cooldown stretches, left ${p2.cooldowns[0]}`);
    assert.ok(Math.abs(p2.cooldowns[2] - .5) < .02, `U cooldown does not stretch, left ${p2.cooldowns[2]}`);
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 140; p2.facing = -1;
    g.keyDown('KeyI');
    for (let i = 0; i < Math.round(1.2 / STEP) && p2.root <= 0; i++) g.step(STEP);
    assert.ok(p2.root > 0, '扣一点 roots the victim');
    assert.equal(p2.rootLevel, 'move', 'the root leaves attacks open');
    assert.equal(p2.rootBreak, 0, 'hits do not shake the root off');
    run(g, .4);
    assert.ok(p2.root > 0 && p2.stun <= 0, 'the root outlasts the flinch');
    g.keyDown('Numpad1');
    run(g, .08);
    assert.equal(p2.attack?.skill.type, 'light', 'a rooted fighter can still jab');
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 70; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO');
    run(g, 1.2);
    assert.ok(hp - p2.hp > 20, `捉弄 lands both pokes, dealt ${hp - p2.hp}`);
    assert.ok(p2.slow > 0, '捉弄 leaves the slow');
    assert.equal(p2.knocked, 0, 'the pokes do not knock down');
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 140; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO');
    run(g, 1.2);
    assert.ok(hp - p2.hp > 20, `捉弄 still reaches at 140, dealt ${hp - p2.hp}`);
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 220; p2.facing = -1;
    p1.energy = p1.energyMax;
    g.keyDown('ArrowDown');
    run(g, .1);
    assert.ok(p2.blocking, 'the dummy is blocking');
    g.keyDown('KeyL');
    run(g, 1.4);
    assert.ok(p2.slow > 0, '小摩卡要上了 slows through a block');
    assert.equal(atkMul(p2), .7, 'a blocked wave still cuts attack speed');
    assert.equal(p2.root, 0, 'the wave does not root');
    assert.ok(p2.guard < 100, 'the block caught the wave');
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 220; p2.facing = -1;
    p1.energy = p1.energyMax;
    const hp = p2.hp;
    g.keyDown('KeyL');
    run(g, 1.4);
    const dealt = hp - p2.hp;
    assert.ok(dealt > 30 && dealt < 50, `a fresh slow takes only the wave, dealt ${dealt}`);
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 220; p2.facing = -1;
    p1.energy = p1.energyMax;
    addMod(p2, 'slow', 5, { v: .5, jump: .65, mark: 'bubble' });
    const hp = p2.hp;
    g.keyDown('KeyL');
    run(g, 1.4);
    const dealt = hp - p2.hp;
    assert.ok(dealt > 120 && dealt < 150, `an existing slow takes the extra chunk, dealt ${dealt}`);
  }
  {
    const g = newGame(moca, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 220; p2.facing = -1;
    p1.energy = p1.energyMax;
    addMod(p2, 'slow', 5, { v: .5, jump: .65, mark: 'bubble' });
    g.keyDown('ArrowDown');
    run(g, .1);
    assert.ok(p2.blocking, 'the slowed dummy is blocking');
    const hp = p2.hp;
    const guard = p2.guard;
    g.keyDown('KeyL');
    run(g, 1.4);
    const dealt = hp - p2.hp;
    assert.ok(dealt > 120 && dealt < 150, `a slowed block does not stop the wave, dealt ${dealt}`);
    assert.equal(p2.guard, guard, 'a slowed block does not spend guard');
  }
}

// mashiro: one whale on a 45° arc ticks several times; the butterfly is one shot and slows a block
{
  const mashiro = at('mashiro');
  const data = ROSTER[mashiro];
  assert.equal(data.name, '仓田真白', 'mashiro display name');
  assert.deepEqual(data.bands, ['morfonica'], 'mashiro fronts Morfonica');
  assert.equal(data.trait, 'focus', 'mashiro is a zoner');
  assert.equal(data.skills[3].count, 4, '巨鲸 is four ticks');
  assert.equal(data.skills[3].motion, 'fall', '巨鲸 rides the stock arc');
  assert.equal(data.skills[3].finale?.react?.kind, 'knockdown', 'the last tick knocks down');
  assert.equal(data.skills[5].count, 1, '蝶变 is one shot');
  assert.equal(data.skills[5].slowOnBlock, true, '蝶变 slows a block');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/mashiro/jelly.png'), 'the jellyfish is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/mashiro/whale.png'), 'the whale is preloaded');

  {
    const g = newGame(mashiro, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 320; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI');
    let whales = 0;
    let vx = 0, vy = 0;
    for (let i = 0; i < Math.round(1 / STEP); i++) {
      g.step(STEP);
      const live = g.projectiles.filter(p => p.fx === 'whale');
      if (live.length > whales) whales = live.length;
      if (live.length === 1 && vx === 0) { vx = live[0].vx; vy = live[0].vy; }
    }
    assert.equal(whales, 1, '巨鲸 is one body');
    assert.ok(vx > 0 && vy < 0 && Math.abs(Math.abs(vx) - Math.abs(vy)) < 40, `巨鲸 leaves at 45°, vx ${vx} vy ${vy}`);
    assert.ok(hp - p2.hp > 25, `巨鲸 ticks more than once, dealt ${hp - p2.hp}`);
  }
  {
    const g = newGame(mashiro, at('boulder')); const [p1] = g.fighters; dummy(g);
    p1.x = X_MAX; p1.facing = 1;
    g.keyDown('KeyI');
    let lived = 0;
    for (let i = 0; i < Math.round(1 / STEP); i++) {
      g.step(STEP);
      if (g.projectiles.some(p => p.fx === 'whale')) lived++;
    }
    assert.ok(lived > 40, `巨鲸 finishes the arc at the wall, frames ${lived}`);
  }
  {
    const g = newGame(mashiro, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 220; p2.facing = -1;
    p1.energy = p1.energyMax;
    const hp = p2.hp;
    g.keyDown('ArrowDown');
    g.keyDown('KeyL');
    let shots = 0;
    for (let i = 0; i < Math.round(1.2 / STEP); i++) {
      g.step(STEP);
      shots = Math.max(shots, g.projectiles.filter(p => p.fx === 'butterfly').length);
    }
    assert.equal(shots, 1, '蝶变 is one hitbox');
    assert.ok(p2.slow > 3, `a block still slows, left ${p2.slow}`);
    assert.ok(hp - p2.hp < 40, `the block chips instead of the full hit, dealt ${hp - p2.hp}`);
  }
  {
    const g = newGame(mashiro, at('boulder')); const [p1] = g.fighters; dummy(g);
    p1.x = X_MAX; p1.facing = 1;
    p1.energy = p1.energyMax;
    g.keyDown('ArrowDown');
    g.keyDown('KeyL');
    let turned = false;
    for (let i = 0; i < Math.round(1.6 / STEP); i++) {
      g.step(STEP);
      if (g.projectiles.some(p => p.fx === 'butterfly' && p.returned)) turned = true;
    }
    assert.ok(turned, '蝶变 still turns around from the wall');
  }
}

// Team rims: a side with two real fighters, or the same character on both sides. Mode is not an input.
{
  const body = (id: string, team: number, minion = false, echo = false) => ({ team, minion, echo, data: { id } });
  assert.equal(teamGlowOn({ fighters: [body('anon', 0), body('soyo', 1)] }), false, 'a 1v1 of different characters stays bare');
  assert.equal(teamGlowOn({ fighters: [body('anon', 0), body('anon', 1)] }), true, 'a 1v1 mirror match rims both sides');
  assert.equal(teamGlowOn({ fighters: [body('nonoka', 0), body('nonoka', 0, true), body('soyo', 1)] }), false, 'a same-side summon does not rim a 1v1');
  assert.equal(teamGlowOn({ fighters: [body('anon', 0), body('anon', 0, false, true), body('soyo', 1)] }), false, 'a same-side echo does not rim a 1v1');
  assert.equal(teamGlowOn({ fighters: [body('tomori', 0), body('anon', 0, true), body('anon', 1)] }), true, 'a summon that copies the foe rims both sides');
  assert.equal(teamGlowOn({ fighters: [body('anon', 0), body('soyo', 0), body('taki', 1), body('rana', 1)] }), true, 'two real fighters on a side rims the match');
  assert.equal(teamGlowOn({ fighters: [body('anon', 0), body('soyo', 1), body('taki', 1)] }), true, 'one side of two rims the match');
}

// layer: seven-hit super. Each strike steps forward, so a round-start gap still gets hit.
{
  assert.equal(crashRow(.2, 0, 0, .36, 1.95, .22), 0, '全力碰撞 reaches upright');
  assert.equal(crashRow(.45, .4, 0, .36, 1.95, .22), 0, 'the hoist is the upright cell');
  assert.equal(crashRow(.56, .4, 0, .36, 1.95, .22), 1, 'the drop is the slam cell');
  assert.equal(crashRow(.63, .4, 1, .36, 1.95, .22), 0, 'the next beat hoists again');
  assert.equal(crashRow(.5, -1, 0, .36, 1.95, .22), 2, 'a miss settles');
  assert.equal(riotCell(1, 1), 0, 'riot opens on the straight punch');
  assert.equal(riotCell(1.16, 1), 1, 'riot steps one cell per hit');
  assert.equal(riotCell(1.96, 1), 6, 'the seventh strike is the bass smash');
  assert.ok(riotCell(2.2, 1) >= 7 && riotCell(2.2, 1) <= 11, 'the tail walks the follow-through');
  const layer = at('layer');
  const data = ROSTER[layer];
  assert.equal(data.skills[2].superArmor, true, '入侵秀 has superArmor');
  assert.equal(data.skills[3].superArmor, true, '燃尽 has superArmor');
  assert.equal(data.skills[4].superArmor, true, '全力碰撞 has superArmor');
  assert.equal(data.skills[4].start, .28, '全力碰撞 starts faster');
  assert.equal(data.skills[4].range, 150, '全力碰撞 range is wider');
  assert.equal(data.skills[3].fx, 'burnout', '燃尽 owns its fx');
  assert.equal(data.skills[5].cost, 120, '大闹一场 costs 120');
  assert.equal(data.skills[5].fx, 'riot', 'the super is the riot');
  assert.equal(data.skills[5].count, 7, 'the riot is seven hits');
  assert.deepEqual(data.bands, ['raise-a-suilen'], 'layer fronts RAISE A SUILEN');
  assert.ok(data.view.kind === 'sprite' && data.view.world === '/sprites/layer/riot.png', 'the combo sheet is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/layer/bass.png'), 'the bass picture is preloaded');

  const g = newGame(layer, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
  p1.energy = p1.energyMax;
  p2.x = p1.x + 70; p2.facing = -1;
  const hp = p2.hp;
  g.keyDown('KeyL');
  run(g, .6);
  assert.equal(p1.attack?.hold, p2.id, '大闹一场 caught them');
  let hits = 0;
  let downed = false;
  let locked = -1;
  let ghost = false;
  for (let i = 0; i < Math.round(2.6 / STEP); i++) {
    g.step(STEP);
    if (p1.attack && p1.combo >= 3 && locked < 0) locked = p1.energy;
    if (g.effects.some(e => e.type === 'ghost' && e.tint === p1.data.color)) ghost = true;
    hits = Math.max(hits, p1.combo);
    if (p2.knocked > 0) downed = true;
  }
  assert.equal(hits, 7, '大闹一场 hits seven times');
  assert.ok(ghost, 'a cell change leaves the flat afterimage');
  assert.ok(downed, 'the last strike knocks down');
  assert.ok(hp - p2.hp > 140, `the route dealt damage, ${hp - p2.hp}`);
  assert.equal(p1.attack, null, '大闹一场 plays out');
  assert.equal(locked, p1.energyMax - (p1.data.skills[5].cost ?? 100), 'the combo grants no energy');
  assert.equal(p1.noGain, 0, '禁回气 ends with the pose');

  // Round-start spacing is about 430px. The steps have to arrive without a manual approach.
  const far = newGame(layer, at('boulder')); const [f1, f2] = far.fighters; dummy(far);
  f1.energy = f1.energyMax;
  f2.x = f1.x + 430;
  f2.facing = -1;
  const x0 = f1.x;
  const farHp = f2.hp;
  far.keyDown('KeyL');
  run(far, .5);
  const mid = f1.x - x0;
  assert.ok(mid > 20 && mid < 80, `the first stride is mid-slide, moved ${mid}`);
  run(far, 1.9);
  assert.ok(f1.x > x0 + 250, `the route stepped in, moved ${f1.x - x0}`);
  assert.ok(farHp - f2.hp > 40, `a round-start gap still took damage, ${farHp - f2.hp}`);

  const miss = newGame(layer, at('boulder')); const [m1, m2] = miss.fighters; dummy(miss);
  m1.energy = m1.energyMax;
  m2.x = X_MIN;
  m2.facing = 1;
  const mx = m1.x;
  const missHp = m2.hp;
  miss.keyDown('KeyL');
  run(miss, .8);
  assert.ok(m1.attack, 'a whiffed 大闹一场 keeps walking');
  assert.ok(m1.x > mx, 'the whiff still steps forward');
  run(miss, 1.6);
  assert.equal(m1.attack, null, 'the whiff route ends');
  assert.equal(m2.hp, missHp, 'someone behind takes nothing');

  const burn = newGame(layer, at('boulder')); const [n1] = burn.fighters; dummy(burn);
  burn.keyDown('KeyI');
  run(burn, .55);
  assert.equal(clipFor(n1).row, 1, '燃尽 holds the slam past the generic window');
  assert.ok(burn.effects.some(e => e.type === 'bass-burst'), 'the bass bursts where it lands');
  run(burn, .15);
  assert.equal(clipFor(n1).row, 2, '燃尽 settles after the extended slam');

  // 入侵秀: point-blank only shoves. A charge that has already run most of the dash knocks down.
  const bump = newGame(layer, at('boulder')); const [b1, b2] = bump.fighters; dummy(bump);
  b2.x = b1.x + 70; b2.facing = -1;
  bump.keyDown('KeyU');
  let bumped = false;
  for (let i = 0; i < Math.round(1.1 / STEP); i++) {
    bump.step(STEP);
    if (b2.knocked > 0) bumped = true;
  }
  assert.ok(b2.hp < b2.data.hp, 'a point-blank 入侵秀 connects');
  assert.equal(bumped, false, 'a point-blank 入侵秀 does not knock down');

  const charge = newGame(layer, at('boulder')); const [c1, c2] = charge.fighters; dummy(charge);
  c2.x = c1.x + 430; c2.facing = -1;
  charge.keyDown('KeyU');
  let charged = false;
  for (let i = 0; i < Math.round(1.1 / STEP); i++) {
    charge.step(STEP);
    if (c2.knocked > 0) charged = true;
  }
  assert.ok(charged, 'a long 入侵秀 knocks down');

  // 全力碰撞: a grab becomes five floor slams. The 120 is 24 a hit. A miss deals nothing.
  const slam = newGame(layer, at('boulder')); const [s1, s2] = slam.fighters; dummy(slam);
  s2.x = s1.x + 60; s2.facing = -1;
  const slamHp = s2.hp;
  slam.keyDown('KeyO');
  let slams = 0;
  let slammed = false;
  for (let i = 0; i < Math.round(2.2 / STEP); i++) {
    slam.step(STEP);
    slams = Math.max(slams, s1.combo);
    if (s2.knocked > 0) slammed = true;
  }
  assert.equal(slams, 5, '全力碰撞 slams five times');
  assert.ok(slammed, 'the last slam knocks down');
  assert.ok(slamHp - s2.hp > 70, `the five slams dealt damage, ${slamHp - s2.hp}`);
  assert.equal(s1.attack, null, '全力碰撞 plays out');

  const missO = newGame(layer, at('boulder')); const [o1, o2] = missO.fighters; dummy(missO);
  o2.x = o1.x + 280; o2.facing = -1;
  const missOHp = o2.hp;
  missO.keyDown('KeyO');
  run(missO, 1.3);
  assert.equal(o2.hp, missOHp, 'a missed 全力碰撞 deals nothing');
  assert.equal(o1.attack, null, 'a missed 全力碰撞 ends');

  const hold = newGame(layer, at('boulder')); const [h1, h2] = hold.fighters; dummy(hold);
  h2.x = h1.x + 70; h2.facing = -1;
  hold.keyDown('KeyO');
  run(hold, .12);
  assert.ok(h1.attack, '全力碰撞 has started');
  const heldHp = h1.hp;
  const jab = h2.data.skills[0];
  hit(hold, h2, h1, jab, { hit: new Set() });
  assert.equal(h1.attack?.skill.fx, 'crash', 'a jab does not drop 全力碰撞');
  assert.equal(h1.stun, 0, 'the jab does not flinch the slam');
  assert.ok(heldHp - h1.hp > 15, `the jab still hurts, took ${heldHp - h1.hp}`);
  assert.ok(Math.abs(h1.vx) > 40, `knockback is braced, vx ${h1.vx}`);
  assert.equal(h1.poise, 0, '抗打断 is the pose, not a poise buff');
  assert.equal(h1.attack?.skill.superArmor, true, 'the slam has 霸体');
  hit(hold, h2, h1, { ...jab, type: 'grab' }, { hit: new Set() });
  assert.equal(h1.attack, null, 'a grab still drops 全力碰撞');
}

// hina: fries is one melee that frails, 噜噜噜 is three light hits, the partner slot summons 冰川纱夜
{
  const data = ROSTER[at('hina')];
  assert.equal(data.skills[2].fx, 'fries', 'U is the fries');
  assert.equal(data.skills[2].frail, 2, '薯条 frails for 2 seconds');
  assert.equal(data.skills[3].count, 3, '噜噜噜 hits three times');
  assert.equal(data.skills[3].range, 220, '噜噜噜 reaches a longer stretch ahead');
  assert.equal(data.skills[3].finale?.root, 1, 'the last 噜 roots for one second');
  assert.equal(data.skills[5].cost, 200, '和姐姐在一起 costs 200');
  assert.equal(data.skills[5].onActive?.[0]?.op === 'summon' && data.skills[5].onActive[0].kind === 'named' && data.skills[5].onActive[0].id, 'sayo', 'the partner slot is sayo');
  {
    const guest = guestsFor([data], 'mygo');
    assert.deepEqual(guest.map(c => c.id), ['sayo'], '日菜 loads 纱夜, not a band roll');
    assert.ok(guest[0].view.kind === 'sprite' && guest[0].view.common === '/sprites/sayo/common.png', '纱夜的通用表跟着日菜进战斗');
    assert.ok(guest[0].view.kind === 'sprite' && guest[0].view.extras?.includes('/sprites/sayo/flame.png'), '纱夜的火舌跟着日菜进战斗');
  }
  {
    const g = newGame(at('hina'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 80; p2.facing = -1;
    g.keyDown('KeyU');
    run(g, .4);
    assert.ok(p2.frail > 0, '薯条 frails on a clean hit');
    assert.equal(g.projectiles.length, 0, '薯条 is one melee check');
    const fries = g.effects.find(e => e.type === 'fries');
    assert.ok(fries, 'the fries are drawn as an effect');
    assert.ok(fries!.y < p1.y - 100, 'the fries leave from the hand, not the floor');
  }
  {
    const g = newGame(at('hina'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 180; p2.facing = -1;
    const hp = p2.hp;
    const stamps: number[] = [];
    const seen = new Set<number>();
    const watch = () => {
      for (const e of g.effects) {
        if (e.type !== 'slash') continue;
        const rel = Math.round((e.x - p1.x) * p1.facing);
        if (seen.has(rel)) continue;
        seen.add(rel);
        stamps.push(rel);
        assert.equal(e.dir, p1.facing, 'the 噜 arc opens forward');
      }
    };
    g.keyDown('KeyI');
    for (let i = 0; i < Math.round(.24 / STEP); i++) { g.step(STEP); watch(); }
    assert.ok(p2.hp < hp, '噜噜噜 reaches past the old close range');
    assert.equal(p2.root, 0, 'the first 噜s do not root');
    for (let i = 0; i < Math.round(.5 / STEP); i++) { g.step(STEP); watch(); }
    assert.ok(p2.root > 0 && p2.root <= 1, `the last 噜 roots for one second, left ${p2.root}`);
    assert.equal(stamps.length, 3, `three 噜 stamps, saw ${stamps.join(',')}`);
    assert.ok(stamps.every(x => x > 40), `every 噜 stamp is in front, saw ${stamps.join(',')}`);
  }
  {
    const g = newGame(at('hina'), at('boulder')); const [p1] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    g.keyDown('KeyL');
    run(g, .6);
    const mate = g.fighters.find(f => f.minion);
    assert.ok(mate, 'the partner takes the stage');
    assert.equal(mate?.data.id, 'sayo', 'the partner is 冰川纱夜');
    assert.equal(mate?.dmgMul, .3, 'the partner hits for three tenths');
    assert.equal(mate?.hp, 200, 'the partner spawns at two tenths');
    assert.ok((mate?.life ?? 0) > 11, 'the partner stays twelve seconds');
    assert.equal(p1.energyMax, 200, 'the meter caps at the partner cost');
    assert.ok(p1.noGain > 0, '纱夜在场时日菜禁回气');
    const shut = p1.energy;
    run(g, .5);
    assert.equal(p1.energy, shut, '日菜在纱夜在场时不回气');
    mate!.hp = 0;
    run(g, STEP * 2);
    assert.equal(g.fighters.length, 2, '纱夜被击败后离场');
    assert.equal(p1.noGain, 0, '纱夜退场后日菜解开禁回气');
    const opened = p1.energy;
    run(g, .5);
    assert.ok(p1.energy > opened, '纱夜退场后日菜开始回气');
  }
}

// sayo: five rain lanes, a four-tick low string, a floor flame a jump clears
{
  const data = ROSTER[at('sayo')];
  assert.equal(data.skills[3].count, 5, '秋时雨 drops five');
  assert.equal(data.skills[4].count, 4, '忧伤节拍器 ticks four times');
  assert.equal(data.skills[4].reach, 'low', 'the metronome only meets a standing chest');
  assert.equal(data.skills[4].finale?.react?.kind, 'knockdown', 'the last tick knocks down');
  assert.equal(data.skills[5].count, 1, 'BRAVE JEWEL is one tongue');
  assert.deepEqual([0, .15, .3, .45].map(t => flameFrame(t, 1)[0]), [0, 1, 2, 3], 'the tongue grows through four lengths');
  assert.equal(flameFrame(.5, 1)[1], 1, 'after the grow the tail loops');
  assert.ok(data.view.kind === 'sprite' && data.view.specialScale === 1.1, 'the special sheet scales at playback');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/sayo/flame.png'), 'the flame sheet is preloaded');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/sayo/arrow.png'), 'the arrow is preloaded');
  {
    const g = newGame(at('sayo'), at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 180; p1.facing = 1;
    p2.x = p1.x + 240; p2.facing = -1;
    const xs: number[] = [];
    const seen = new Set<number>();
    g.keyDown('KeyI');
    for (let i = 0; i < Math.round(1.3 / STEP); i++) {
      g.step(STEP);
      for (const p of g.projectiles) {
        if (p.fx !== 'shigure') continue;
        const rel = Math.round(p.x - p1.x);
        if (seen.has(rel)) continue;
        seen.add(rel);
        xs.push(rel);
      }
    }
    assert.deepEqual(xs, [130, 240, 350, 460, 570], 'the five drops keep a 110 gap');
    assert.equal(p1.combo, 1, 'a body under one drop eats only that drop');
    assert.ok(p2.hp < 1000, 'the drop under her connects');
  }
  {
    const g = newGame(at('sayo'), at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 70; p2.facing = -1;
    g.keyDown('KeyO');
    run(g, 1.45);
    assert.equal(p1.combo, 4, 'the metronome lands all four ticks');
    assert.ok(p2.knocked > 0, 'the last tick knocks down');
  }
  {
    const g = newGame(at('sayo'), at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p2.x = p1.x + 70; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO');
    for (let i = 0; i < Math.round(1.45 / STEP); i++) {
      p2.y = FLOOR - 80; p2.vy = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'a real jump clears the metronome');
  }
  {
    const g = newGame(at('sayo'), at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p1.x = 200; p1.facing = 1;
    p2.x = 480; p2.facing = -1;
    g.keyDown('KeyL');
    let ring = false;
    for (let i = 0; i < Math.round(1 / STEP); i++) {
      g.step(STEP);
      if (g.effects.some(e => e.type === 'jewel-ring')) ring = true;
    }
    const flame = g.projectiles.find(p => p.fx === 'jewel');
    assert.ok(flame, 'the tongue is in flight');
    assert.ok(ring, 'a burst of flames leaves with the tongue');
    assert.equal(flame!.y, FLOOR, 'the tongue rides the floor');
    assert.ok(Math.abs(Math.abs(flame!.vx) - 828) < 1, `focus speeds the tongue, vx ${flame!.vx}`);
    assert.ok(p2.hp < 1000, 'a standing body eats the tongue');
    assert.ok(p2.knocked > 0, 'the tongue knocks down');
  }
  {
    const g = newGame(at('sayo'), at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p1.x = 200; p1.facing = 1;
    p2.x = 480; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL');
    for (let i = 0; i < Math.round(1.3 / STEP); i++) {
      p2.y = FLOOR - 50; p2.vy = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'leaving the floor clears the tongue');
  }
  {
    const g = newGame(at('sayo'), at('ember')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p1.x = 200; p1.facing = 1;
    p2.x = 480; p2.facing = -1;
    const guard = p2.guard;
    g.keyDown('ArrowDown');
    g.keyDown('KeyL');
    run(g, .5);
    assert.equal(p2.blocking, true, 'the guard is up before the tongue arrives');
    run(g, .7);
    assert.ok(p2.hp < 1000, 'a block does not stop the tongue');
    assert.ok(p2.knocked > 0, 'the tongue still knocks down through a block');
    assert.equal(p2.guard, guard, 'the tongue does not spend guard');
  }
  {
    const g = newGame(at('sayo'), at('ember')); const [p1] = g.fighters; dummy(g);
    p1.energy = p1.energyMax;
    p1.x = X_MIN; p1.facing = 1;
    g.keyDown('KeyL');
    let last = 0;
    let saw = false;
    for (let i = 0; i < Math.round(3 / STEP); i++) {
      g.step(STEP);
      const flame = g.projectiles.find(p => p.fx === 'jewel');
      if (flame) { saw = true; last = flame.x; }
      else if (saw) break;
    }
    assert.ok(saw, 'the tongue is born at the left wall');
    assert.ok(last > W + 256 - 40, `the tail clears the screen, last head ${last}`);
  }
}

// tsukushi: a creeping row of sprouts, five clocks that sometimes stay silent,
// a wheel that ticks four times, and the sisters' six-hit string
{
  const data = ROSTER[at('tsukushi')];
  assert.equal(data.name, '二叶筑紫', 'tsukushi display name');
  assert.deepEqual(data.bands, ['morfonica'], 'tsukushi sits with Morfonica');
  assert.equal(data.trait, 'beat', 'tsukushi keeps the drum passive');
  assert.equal(data.skills[2].fx, 'sprout', 'U is the horsetail');
  assert.equal(data.skills[2].count, 4, 'four sprouts');
  assert.equal(data.skills[3].fx, 'clock', 'I is the alarms');
  assert.equal(data.skills[3].count, 5, 'five clocks');
  assert.equal(data.skills[4].fx, 'wheel', 'O is the hamster wheel');
  assert.equal(data.skills[4].count, 4, 'the wheel ticks four times');
  assert.equal(data.skills[4].reach, 'low', 'the wheel only meets a standing body');
  assert.equal(data.skills[4].finale?.react?.kind, 'knockdown', 'the last wheel tick knocks down');
  assert.equal(data.skills[5].fx, 'sisters', 'L is the three sisters');
  assert.equal(data.skills[5].count, 6, 'the sisters hit six times');
  assert.equal(data.skills[5].finale?.react?.kind, 'knockdown', 'the last sister hit knocks down');
  assert.equal(clockRings(0), false, 'a low roll tips the clock');
  assert.equal(clockRings(.34), true, 'the rest of the rolls ring');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/tsukushi/sprout.png'), 'the sprout is preloaded');
  assert.ok(data.view.kind === 'sprite' && !data.view.extras?.some(src => src.includes('clock')), 'the clock has no sheet');
  assert.ok(data.view.kind === 'sprite' && data.view.extras?.includes('/sprites/tsukushi/wheel.png'), 'the wheel is preloaded');
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 200; p1.facing = 1;
    p2.x = p1.x + 700; p2.facing = -1;
    g.keyDown('KeyU');
    run(g, .8);
    const sprouts = g.projectiles.filter(p => p.fx === 'sprout');
    assert.equal(sprouts.length, 4, 'four sprouts are on the floor');
    assert.ok(sprouts.every(p => p.y === FLOOR), 'sprouts stay on the floor');
    assert.ok(g.effects.some(e => e.type === 'sprout-break'), 'a sprout breaks the soil');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 200; p1.facing = 1;
    p2.x = p1.x + 72; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU');
    run(g, .4);
    assert.ok(p2.hp < hp, 'a standing body eats a sprout');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 200; p1.facing = 1;
    p2.x = p1.x + 72; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyU');
    for (let i = 0; i < Math.round(1.1 / STEP); i++) {
      p2.y = FLOOR - 50; p2.vy = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'a jump clears the sprouts');
  }
  const clockGame = (roll: number) => {
    const g = new FightGame([ROSTER[at('tsukushi')], ROSTER[at('boulder')]], {
      mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: () => roll,
    });
    run(g, 2.3);
    dummy(g);
    return g;
  };
  {
    const g = clockGame(0); const [p1, p2] = g.fighters;
    p1.x = 180; p1.facing = 1;
    p2.x = p1.x + 130; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI');
    run(g, .45);
    const clocks = g.projectiles.filter(p => p.fx === 'clock');
    assert.equal(clocks.length, 5, 'five clocks are in the air');
    assert.ok(clocks.every(p => p.skill.damage === 0), 'a dud roll silences every clock');
    run(g, 2.4);
    assert.equal(p2.hp, hp, 'silent clocks do not hit');
    assert.equal(g.projectiles.filter(p => p.fx === 'clock').length, 0, 'silent clocks vanish after the wait');
  }
  {
    const g = clockGame(.99); const [p1, p2] = g.fighters;
    p1.x = 180; p1.facing = 1;
    p2.x = p1.x + 130; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI');
    run(g, 2);
    assert.equal(p1.combo, 0, 'clocks wait on the ground before they ring');
    assert.equal(p2.hp, hp, 'the wait itself does not hit');
    run(g, 1.8);
    assert.equal(p1.combo, 3, 'one ringing clock lands three pulses');
  }
  {
    const g = clockGame(.99); const [p1, p2] = g.fighters;
    p1.x = 180; p1.facing = 1;
    p2.x = p1.x + 185; p2.facing = -1;
    g.keyDown('KeyI');
    run(g, 3.8);
    assert.equal(p1.combo, 6, 'standing between two clocks eats both');
  }
  {
    const g = clockGame(.99); const [p1, p2] = g.fighters;
    p1.x = 180; p1.facing = 1;
    p2.x = p1.x + 130; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyI');
    for (let i = 0; i < Math.round(3.8 / STEP); i++) {
      p2.x = p1.x + 700; p2.vx = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'leaving during the wait avoids the rings');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 200; p1.facing = 1;
    p2.x = p1.x + 100; p2.facing = -1;
    g.keyDown('KeyO');
    run(g, 1);
    assert.equal(p1.combo, 4, 'the wheel lands all four ticks');
    assert.ok(p2.knocked > 0, 'the last tick knocks down');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 200; p1.facing = 1;
    p2.x = p1.x + 70; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyO');
    for (let i = 0; i < Math.round(1 / STEP); i++) {
      p2.y = FLOOR - 80; p2.vy = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'a jump clears the wheel');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 220; p1.facing = 1;
    p1.energy = p1.energyMax;
    p2.x = p1.x + 400; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL');
    run(g, .7);
    assert.equal(p2.hp, hp, 'a sister who has not arrived does not hit');
    for (let i = 0; i < Math.round(1.6 / STEP); i++) {
      const lead = g.projectiles.find(p => p.fx === 'sister');
      if (lead) { p2.x = lead.x; p2.y = FLOOR; p2.vy = 0; }
      g.step(STEP);
      if (p1.combo >= 6) break;
    }
    assert.equal(p1.combo, 6, 'overlapping a sister lands all six hits');
    assert.ok(p2.knocked > 0, 'the last sister hit knocks down');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 220; p1.facing = 1;
    p1.energy = p1.energyMax;
    p2.x = p1.x + 160; p2.facing = -1;
    const hp = p2.hp;
    g.keyDown('KeyL');
    for (let i = 0; i < Math.round(2 / STEP); i++) {
      p2.y = FLOOR - 80; p2.vy = 0;
      g.step(STEP);
    }
    assert.equal(p2.hp, hp, 'a jump clears the sisters');
  }
  {
    const g = newGame(at('tsukushi'), at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = X_MAX - 40; p1.facing = 1;
    p1.energy = p1.energyMax;
    p2.x = 80; p2.facing = -1;
    g.keyDown('KeyL');
    run(g, .8);
    const born = g.projectiles.filter(p => p.fx === 'sister');
    assert.equal(g.fighters.length, 2, 'the little sisters are not fighters');
    assert.equal(born.length, 2, 'two sisters take the field');
    assert.ok(born.every(p => p.vx < 0), 'they turn after the near edge');
    run(g, 4.2);
    assert.equal(g.projectiles.filter(p => p.fx === 'sister').length, 0, 'they leave past the far edge');
  }
}

// kanata: a marked burst whose siphon rides a return orb, a lily window, and a revival bill that can kill
{
  const kan = at('kanata');
  const data = ROSTER[kan];
  assert.equal(data.skills[2].fx, 'lifedraw', '寿来 marks and bursts');
  assert.equal(data.skills[2].drain, 28, '寿来 cuts the target bar');
  assert.equal(data.skills[3].fx, 'lily', '脆弱 wears the lily');
  assert.equal(data.skills[4].fx, 'revive', '复活 casts');
  assert.equal(data.skills[5].fx, 'happymusic', 'the super plays');
  assert.equal(data.skills[5].count, 10, 'ten notes');
  assert.equal(data.skills[5].jumpCancel, 1, 'the super hops out after one second');

  const lily = newGame(kan, at('boulder')); const [l1, l2] = lily.fighters; dummy(lily);
  l1.hp = 800;
  lily.keyDown('KeyI');
  run(lily, .4);
  assert.equal(l1.hp, 800, '脆弱 costs no health');
  assert.ok(l1.mods.some(m => m.kind === 'incoming' && m.left > 4), 'I marks her vulnerable');
  assert.ok(l1.mods.some(m => m.kind === 'reflect' && m.left > 4), 'I arms the reflect');

  const plain = newGame(kan, at('boulder')); const [p1, p2] = plain.fighters; dummy(plain);
  const plainHp = p1.hp;
  hit(plain, p2, p1, ROSTER[at('boulder')].skills[0], { hit: new Set() });
  const plainLoss = plainHp - p1.hp;
  const boulderHp = l2.hp;
  hit(lily, l2, l1, ROSTER[at('boulder')].skills[0], { hit: new Set() });
  assert.ok(Math.abs((800 - l1.hp) - plainLoss * 2) <= 2, `脆弱 doubles damage taken, ${800 - l1.hp} vs ${plainLoss}`);
  assert.ok(l2.hp < boulderHp, 'the reflect pays the attacker back');

  const draw = newGame(kan, at('boulder')); const [d1, d2] = draw.fighters; dummy(draw);
  d1.x = 500; d1.facing = 1; d2.x = 580; d2.facing = -1; d1.hp = 900; d2.energy = 60;
  draw.keyDown('KeyU');
  run(draw, .3);
  assert.ok(draw.effects.some(e => e.type === 'lifedraw-mark'), 'the circle marks the spot');
  run(draw, .3);
  assert.ok(draw.effects.some(e => e.type === 'soul-orb'), 'the orb leaves the target');
  assert.ok(d2.energy < 45, '寿来 cuts energy');
  run(draw, 1.2);
  assert.equal(d1.hp, 942, 'the orb heals 42 on arrival');

  const heal = newGame(kan, at('boulder')); const [h1, h2] = heal.fighters; dummy(heal);
  h1.hp = 700;
  heal.keyDown('KeyO');
  run(heal, .7);
  assert.equal(h1.hp, 900, '复活 heals 20% of max health');
  run(heal, 1.1);
  h1.hp = 900;
  const cutHp = h1.hp;
  hit(heal, h2, h1, ROSTER[at('boulder')].skills[0], { hit: new Set() });
  assert.ok(Math.abs((cutHp - h1.hp) - plainLoss * .5) <= 2, `the window halves damage taken, ${cutHp - h1.hp} vs ${plainLoss}`);
  h1.hp = 900;
  run(heal, 5);
  assert.equal(h1.hp, 650, 'the bill takes 25% of max health');

  const bill = newGame(kan, at('boulder')); const [b1] = bill.fighters; dummy(bill);
  bill.keyDown('KeyO');
  run(bill, .7);
  b1.hp = 100;
  run(bill, 6);
  assert.equal(b1.hp, 0, 'the revival bill can kill');

  const music = newGame(kan, at('boulder')); const [m1] = music.fighters; dummy(music);
  music.fighters[1].controller = null;
  m1.energy = m1.energyMax;
  music.keyDown('KeyL');
  run(music, 1.2);
  const notes = music.projectiles.filter(p => p.fx === 'music-note');
  assert.ok(notes.length > 0, '让大家幸福的音乐 sends notes');
  assert.ok(notes.every(p => p.life <= .9), 'a note fades before it can circle back');

  // A projectile super still promises 霸体: a normal hit lands but cannot drop the pose.
  const stand = newGame(kan, at('boulder')); const [s1, s2] = stand.fighters; dummy(stand);
  s1.energy = s1.energyMax;
  stand.keyDown('KeyL');
  run(stand, .1);
  const pose = s1.attack;
  hit(stand, s2, s1, ROSTER[at('boulder')].skills[0], { hit: new Set() });
  assert.equal(s1.attack, pose, 'the piano super holds its pose through a normal hit');
  assert.equal(s1.stun, 0, 'the piano super does not stagger');
}

// hotaru: the stage device stands in her veil, the rebirth notes come home to heal,
// the war window buffs her, and happy moments roll the rainbow
{
  const ho = at('hotaru');
  const data = ROSTER[ho];
  assert.equal(JSON.stringify(data.bands), JSON.stringify(['millsage']), 'she stands with millsage');
  assert.equal(data.trait, 'focus', 'she plays the long game');
  assert.equal(data.skills[2].fx, 'manju', '小馒头投喂 lobs cookies');
  assert.equal(data.skills[2].count, 3, 'three cookies');
  assert.equal(data.skills[3].fx, 'apparatus', '舞台装置 is the I slot');
  assert.equal(data.skills[3].cd, 10, 'the gated recast is ten seconds');
  assert.equal(data.skills[4].fx, 'rebirth', '重生之乐音 is the O slot');
  assert.equal(data.skills[4].count, 8, 'eight notes');
  assert.equal(data.skills[5].fx, 'war', '起死开战 is the super');
  assert.equal(data.skills[5].cost, 250, '起死开战 costs 250');
  assert.equal(data.skills[5].damage, 0, 'the super swings no damage itself');
  assert.equal(data.skills[5].domain?.background, '/stages/hotaru-war.png', 'the field swaps in the lily backdrop');
  assert.equal(data.skills[5].domain?.time, 6, 'the field lasts six seconds');
  assert.deepEqual(data.skills[5].domain?.buffs, [
    { kind: 'regen', v: 20 },
    { kind: 'speed', v: 1.3, atk: 1.25 },
    { kind: 'lifesteal', v: .25 },
  ], 'the field buffs match the copy');
  const kinds = data.skills[5].domain!.buffs.map(b => b.kind);
  assert.equal(new Set(kinds).size, kinds.length, 'one field buff per kind: addMod would merge duplicates');
  assert.equal(data.rainbow?.cooldown, 10, 'the rainbow has an internal cooldown');

  // The device: summoned once, veils her, pins the recast, and only its death starts the clock.
  const dev = newGame(ho, at('boulder')); const [v1, v2] = dev.fighters; dummy(dev);
  dev.keyDown('KeyI');
  run(dev, .6);
  const device = dev.fighters.find(f => f.minion);
  assert.ok(device, 'the device joins the field');
  assert.ok(device!.apparatus && device!.basic && device!.easyAI && device!.taunt, 'the device is a taunting easy basic');
  assert.equal(device!.hp, 50, 'the device holds five percent of her health');
  assert.ok(v1.mods.some(m => m.kind === 'veil' && m.left > 0), 'she wears the veil while it stands');
  assert.ok(v1.cooldowns[3] > 9, 'the I slot stays shut while it stands');
  dev.keyDown('KeyI');
  run(dev, .2);
  assert.equal(dev.fighters.filter(f => f.minion).length, 1, 'a second press does not summon twice');
  addMod(v1, 'nocd', 5);
  dev.keyDown('KeyI');
  run(dev, .2);
  assert.equal(dev.fighters.filter(f => f.minion).length, 1, '安可 cannot re-summon over the standing device');
  // A lockstep reload keeps the device's reduced sheet, not the 1000-hp base.
  {
    const r = new Rng(7);
    const copy = newGame(ho, at('boulder'));
    loadGame(copy, new Rng(1), dumpGame(dev, r));
    const kept = copy.fighters.find(f => f.apparatus);
    assert.equal(kept?.data.hp, 50, 'a reloaded device keeps its 50-hp sheet');
    assert.equal(kept?.hp, device!.hp, 'and its current hp');
  }
  // The device is frail, but four fifths of what hits it lands on her body.
  const before = v1.hp;
  const poke = { ...ROSTER[at('boulder')].skills[0], damage: 100 };
  hit(dev, v2, device!, poke, { hit: new Set() });
  assert.ok(Math.abs(device!.hp - 30) < 1e-6, `the device takes one fifth of the hit, ${device!.hp}`);
  assert.ok(Math.abs(v1.hp - (before - 80)) < 1e-6, `her body bears the other four fifths, ${v1.hp}`);
  device!.hp = 0;
  run(dev, .1);
  assert.ok(!dev.fighters.some(f => f.minion), 'the broken device leaves');
  assert.ok(!v1.mods.some(m => m.kind === 'veil' && m.left > 0), 'the veil dies with the device');
  assert.ok(v1.cooldowns[3] > 9.5 && v1.cooldowns[3] <= 10, 'the recast starts counting from ten');

  // The notes: eight fan out, turn once, and every clean connection heals her.
  const reb = newGame(ho, at('boulder')); const [b1, b2] = reb.fighters; dummy(reb);
  b1.hp = 700;
  b2.x = b1.x + 150; b2.facing = -1;
  reb.keyDown('KeyO');
  run(reb, .4);
  const notes = reb.projectiles.filter(p => p.fx === 'rebirth');
  assert.equal(notes.length, 8, 'eight notes fly at once');
  assert.ok(notes.every(p => !p.returned), 'they start outbound');
  run(reb, 1.0);
  assert.ok(reb.projectiles.some(p => p.fx === 'rebirth' && p.returned), 'the notes turn to seek');
  run(reb, 2.4);
  const left = reb.projectiles.filter(p => p.fx === 'rebirth');
  assert.ok(left.length === 0 || left.some(p => p.locked), 'a note commits to its straight line when close');
  const healed = Math.round(b1.hp);
  assert.ok(healed > 700, `a clean connection sings health back, ${healed}`);

  // The war: seated at the piano, then the six-second field.
  const war = newGame(ho, at('boulder')); const [w1, w2] = war.fighters; dummy(war);
  w1.energy = w1.energyMax;
  war.keyDown('KeyL');
  war.step(STEP);
  assert.ok(war.effects.some(e => e.type === 'war-piano'), 'the grand piano is on screen from the first frame');
  assert.equal(war.domains.length, 0, 'the field waits for its active frame');
  assert.ok(war.effects.some(e => e.type === 'petal-rain'), 'the white petal rain enters with the cast');
  run(war, .7);
  assert.equal(war.domains.length, 1, 'the field opens on the active frame');
  assert.equal(war.domains[0].background, '/stages/hotaru-war.png', 'the field swaps the backdrop');
  assert.ok(war.effects.some(e => e.type === 'war-piano'), 'the grand piano drops in');
  const warPose = w1.attack;
  hit(war, w2, w1, ROSTER[at('boulder')].skills[0], { hit: new Set() });
  assert.equal(w1.attack, warPose, 'the war pose holds through a normal hit');
  run(war, 1.6);
  assert.ok(w1.attack === null || w1.attack.skill.fx !== 'war', 'the playing ends');
  assert.ok(w1.mods.some(m => m.kind === 'regen' && m.left > 4), 'the window regenerates');
  assert.ok(w1.mods.some(m => m.kind === 'speed' && m.left > 4), 'the window lifts her pace');
  assert.ok(w1.mods.some(m => m.kind === 'lifesteal' && m.left > 4), 'the window steals life');
  assert.ok(Math.abs(speedMul(w1) - 1.3) < 1e-9, 'the walk runs at +30%');
  assert.ok(Math.abs(atkMul(w1) - 1.25) < 1e-9, 'the swings run at +25%');
  run(war, 4.6);
  assert.ok(!w1.mods.some(m => (m.kind === 'regen' || m.kind === 'speed' || m.kind === 'lifesteal') && m.left > 0), 'the window closes after six seconds');

  // The piano shoves far ahead, but only a short way behind.
  {
    const front = newGame(ho, at('boulder')); const [f1, f2] = front.fighters; dummy(front);
    f1.energy = f1.energyMax;
    f2.x = f1.x + 430; f2.facing = -1;
    front.keyDown('KeyL');
    run(front, .7);
    assert.ok(f2.stun > 0 && f2.x > 700, `the piano shoves a far-forward target, x ${f2.x}`);
    run(front, 1.2);
    assert.ok(f2.x > 880, `the playing pose keeps pressing the shove, x ${f2.x}`);
    const back = newGame(ho, at('boulder')); const [b1, b2] = back.fighters; dummy(back);
    b1.energy = b1.energyMax;
    b2.x = b1.x - 200; b2.facing = 1;
    const rear = b2.x;
    back.keyDown('KeyL');
    run(back, .7);
    assert.equal(b2.stun, 0, 'the short rear reach leaves a target behind untouched');
    assert.ok(Math.abs(b2.x - rear) < 1, 'nothing pushes it from behind');
  }

  // 领域: recency covers, the covered clock keeps running, and it returns with its remainder
  {
    const g = newGame(ho, at('boulder')); const [a, b] = g.fighters; dummy(g);
    const s = ROSTER[ho].skills[5];
    const buffed = (f: typeof a) => f.mods.some(m => m.tag === 'domain' && m.left > 0);
    g.beginDomain(a, s);
    run(g, .5);
    assert.equal(g.domains.length, 1, 'the first field opens');
    assert.ok(buffed(a), 'the owner gets the domain buffs');
    const short = { ...s, domain: { ...s.domain!, time: 2 } };
    g.beginDomain(b, short);
    run(g, .5);
    assert.equal(g.domains.length, 2, 'the later field stacks on top');
    assert.ok(!buffed(a), 'the covered field stops applying');
    assert.ok(buffed(b), 'the covering field applies to its owner');
    assert.ok(Math.abs(g.domains[1].remaining - 1) < .02, 'the covering clock burns at double rate');
    for (let i = 0; i < Math.round(1.5 / STEP) && g.domains.length > 1; i++) g.step(STEP);
    assert.equal(g.domains.length, 1, 'the covering field ends');
    assert.equal(g.domains[0].owner, a.id, 'the covered field returns');
    assert.ok(buffed(a), 'its buffs come back');
    assert.ok(g.domains[0].remaining > 4.3 && g.domains[0].remaining < 4.6, `with the remaining time, ${g.domains[0].remaining}`);
  }

  // The rainbow: a forced proc on her own block, then the internal cooldown holds.
  const bow = newGame(ho, at('boulder')); const [r1, r2] = bow.fighters; dummy(bow);
  const spec = data.rainbow!;
  const realChance = spec.chance;
  spec.chance = 1;
  r1.blocking = true; r1.guard = 100; r1.facing = -1;
  r2.x = r1.x - 80; r2.facing = 1;
  const foe = ROSTER[at('boulder')].skills[0];
  hit(bow, r2, r1, foe, { hit: new Set() }, r2.x);
  assert.ok(r1.rainbowCd > 9, 'a blocked hit rolls the rainbow');
  const pop = bow.effects.find(e => e.type === 'rainbow-pop');
  assert.equal(bow.effects.filter(e => e.type === 'rainbow-pop').length, 1, 'the wash blooms');
  assert.equal(pop?.fighter, r1.id, 'the halo follows the fighter');
  const cdAfter = r1.rainbowCd;
  hit(bow, r2, r1, foe, { hit: new Set() }, r2.x);
  assert.equal(r1.rainbowCd, cdAfter, 'the internal cooldown holds off a second roll');
  assert.equal(bow.effects.filter(e => e.type === 'rainbow-pop').length, 1, 'no second pop inside the cooldown');

  // The tenth clean hit guarantees a proc without the roll, but the shared cooldown still holds.
  {
    const g = newGame(ho, at('boulder')); const [a, b] = g.fighters; dummy(g);
    spec.chance = 0;
    a.combo = 9; a.comboTime = 1;
    hit(g, a, b, ROSTER[ho].skills[0], { hit: new Set() });
    assert.ok(a.rainbowCd > 9, 'the tenth clean hit pays without the roll');
    assert.equal(g.effects.filter(e => e.type === 'rainbow-pop').length, 1, 'the tenth hit blooms once');
    a.combo = 9; a.comboTime = 1;
    hit(g, a, b, ROSTER[ho].skills[0], { hit: new Set() });
    assert.equal(g.effects.filter(e => e.type === 'rainbow-pop').length, 1, 'the shared cooldown blocks the next guarantee');
    spec.chance = 1;
  }
  spec.chance = realChance;
}

// chuchu: three jerky, and the hold note clears only if you block the whole emission
{
  const chu = at('chuchu');
  const data = ROSTER[chu];
  assert.equal(data.skills[2].count, 3, '牛肉干 fires three');
  assert.equal(data.skills[5].fx, 'change', 'the super is the hold note');
  assert.equal(data.skills[5].start, .35, 'the note starts after the windup');
  assert.equal(data.skills[5].duration, 2.95, 'the note stays up long enough for ten hits');

  const held = newGame(chu, at('boulder')); const [h1, h2] = held.fighters; dummy(held);
  h1.energy = h1.energyMax;
  h2.x = h1.x + 200; h2.facing = -1;
  const heldHp = h2.hp;
  let hits = 0;
  const prev = held.audio.play.bind(held.audio);
  held.audio.play = (k) => { if (k === 'hit') hits++; prev(k); };
  held.keyDown('KeyL'); held.keyDown('ArrowDown');
  run(held, 3.2);
  held.audio.play = prev;
  assert.equal(h2.hp, heldHp, 'blocking the whole note resolves it');
  assert.ok(held.texts.some(t => t.text === 'Good'), 'a held note prints Good');
  assert.ok(hits >= 8, 'a held block ticks the hit sound');
  assert.ok(h2.guard > 45 && h2.guard < 55, 'a full block spends about half the guard');

  const low = newGame(chu, at('boulder')); const [n1, n2] = low.fighters; dummy(low);
  n1.energy = n1.energyMax;
  n2.x = n1.x + 200; n2.facing = -1; n2.guard = 20;
  const lowHp = n2.hp;
  let sawBad = false;
  low.keyDown('KeyL'); low.keyDown('ArrowDown');
  for (let i = 0; i < Math.round(2.4 / STEP); i++) {
    low.step(STEP);
    if (low.texts.some(t => t.text === 'Bad')) sawBad = true;
  }
  assert.ok(sawBad, 'running out of guard prints Bad');
  assert.ok(n2.hp < lowHp, 'a broken guard lets the note through');

  const cheek = newGame(chu, at('boulder')); const [c1, c2] = cheek.fighters; dummy(cheek);
  c1.energy = c1.energyMax;
  c2.x = c1.x + 70; c2.facing = -1;
  const cheekHp = c2.hp;
  cheek.keyDown('KeyL'); cheek.keyDown('ArrowDown');
  run(cheek, 3.2);
  assert.equal(c2.hp, cheekHp, 'a point-blank block still catches the note');

  const lap = newGame(chu, at('boulder')); const [u1, u2] = lap.fighters; dummy(lap);
  u1.energy = u1.energyMax;
  u2.x = u1.x + 10; u2.facing = -1;
  const lapHp = u2.hp;
  lap.keyDown('KeyL'); lap.keyDown('ArrowDown');
  run(lap, 3.2);
  assert.equal(u2.hp, lapHp, 'a block inside the note start still catches it');
  assert.ok(lap.texts.some(t => t.text === 'Good'), 'an overlapped block still resolves at the end');
  assert.ok(u2.guard > 45 && u2.guard < 55, 'an overlapped block still spends half the guard');

  const redo = newGame(chu, at('boulder')); const [v1, v2] = redo.fighters; dummy(redo);
  v1.energy = v1.energyMax;
  v2.x = v1.x + 400; v2.facing = -1;
  const redoHp = v2.hp;
  redo.keyDown('KeyL'); redo.keyDown('ArrowDown');
  run(redo, .9);
  redo.keyUp('ArrowDown');
  run(redo, .05);
  redo.keyDown('ArrowDown');
  run(redo, 2.4);
  assert.ok(v2.hp < redoHp, 'releasing an early block and pressing again still gets hit');
  assert.ok(!redo.texts.some(t => t.text === 'Good'), 'an early block cannot be recaught');

  const slip = newGame(chu, at('boulder')); const [w1, w2] = slip.fighters; dummy(slip);
  w1.energy = w1.energyMax;
  w2.x = w1.x + 240; w2.facing = -1; w2.guard = 5;
  const slipHp = w2.hp;
  slip.keyDown('KeyL'); slip.keyDown('ArrowDown');
  run(slip, 1.9);
  const slipMid = w2.hp;
  assert.ok(slipMid < slipHp, 'a thin guard breaks before the head arrives');
  run(slip, 1.3);
  assert.ok(w2.hp < slipMid, 'guard coming back does not catch the rest of the note');

  const early = newGame(chu, at('boulder')); const [e1, e2] = early.fighters; dummy(early);
  e1.energy = e1.energyMax;
  e2.x = e1.x + 400; e2.facing = -1;
  const earlyHp = e2.hp;
  early.keyDown('KeyL'); early.keyDown('ArrowDown');
  run(early, .5);
  assert.ok(early.texts.some(t => t.text === 'miss'), 'blocking early prints miss');
  run(early, 1.2);
  assert.ok(e2.hp < earlyHp, 'an early block is pierced');

  const dropped = newGame(chu, at('boulder')); const [d1, d2] = dropped.fighters; dummy(dropped);
  d1.energy = d1.energyMax;
  d2.x = d1.x + 200; d2.facing = -1;
  const dropHp = d2.hp;
  dropped.keyDown('KeyL'); dropped.keyDown('ArrowDown');
  run(dropped, 1.2);
  assert.equal(d2.hp, dropHp, 'the note waits while the block is held');
  const stopped = d1.attack && holdNoteSpan(d1.attack, d1, [d2]);
  assert.ok(stopped && Math.abs(stopped[1] - (d2.x - d1.x) * d1.facing) < 2, 'the head stops on their center');
  dropped.keyUp('ArrowDown');
  run(dropped, .2);
  assert.ok(d2.hp < dropHp, 'letting go of block eats the note');

  const air = newGame(chu, at('boulder')); const [a1, a2] = air.fighters; dummy(air);
  a1.energy = a1.energyMax;
  a2.facing = -1;
  const hp = a2.hp;
  air.keyDown('KeyL');
  for (let i = 0; i < Math.round(1.1 / STEP); i++) {
    a2.x = a1.x + 180;
    a2.y = FLOOR - 80;
    a2.vy = 0;
    air.step(STEP);
  }
  assert.ok(a2.hp < hp, 'a jump does not clear the note');

  const grind = newGame(chu, at('boulder')); const [g1, g2] = grind.fighters; dummy(grind);
  g1.energy = g1.energyMax;
  g2.facing = -1;
  grind.keyDown('KeyL');
  let ticks = 0;
  for (let i = 0; i < Math.round(4 / STEP); i++) {
    g2.x = g1.x + 200;
    g2.y = FLOOR;
    g2.vy = 0;
    g2.vx = 0;
    g2.facing = -1;
    grind.step(STEP);
    ticks = Math.max(ticks, g1.combo);
  }
  assert.equal(ticks, 10, 'a body that stays in the note eats ten hits');

  const far = newGame(chu, at('boulder')); const [r1, r2] = far.fighters; dummy(far);
  r1.energy = r1.energyMax;
  r1.x = 200;
  r2.facing = -1;
  const farHp = r2.hp;
  far.keyDown('KeyL');
  const until = (t: number) => {
    for (let i = 0; i < 600 && (r1.attack?.t ?? 0) < t; i++) { r2.x = r1.x + 440; far.step(STEP); }
  };
  until(.35 + .6);
  assert.equal(r2.hp, farHp, 'the far end is safe until the head flies there');
  until(.35 + 1.15);
  assert.ok(r2.hp < farHp, 'once the head is out the far end must hold too');

  const bin = newGame(chu, at('boulder')); const [b1] = bin.fighters; dummy(bin);
  bin.keyDown('KeyI');
  run(bin, .15);
  assert.equal(clipFor(b1).row, 0, 'the trash windup is the first cell');
  assert.equal(clipFor(b1).scale, 1.25, 'the trash column plays at 1.25');
  run(bin, .1);
  assert.equal(clipFor(b1).row, 1, 'the kick is the middle cell');
  assert.equal(bin.projectiles.filter(p => p.fx === 'trash').length, 1, 'the first wad leaves on the kick');
  run(bin, .55);
  assert.equal(clipFor(b1).row, 2, 'the last cell is still up');
  assert.ok((b1.attack?.t ?? 0) > .75 && (b1.attack?.t ?? 0) < .9, 'the last cell is still inside its 0.6s');
  run(bin, .12);
  assert.equal(b1.attack, null, 'the pose ends after the 0.6s last cell');
  const wads = bin.projectiles.filter(p => p.fx === 'trash');
  assert.equal(wads.length, 4, 'four paper wads roll out');
  assert.ok(wads.every(p => p.y === FLOOR && Math.sign(p.vx) === b1.facing), 'the wads stay on the floor and roll forward');
  const xs = wads.map(p => p.x * b1.facing).sort((a, b) => a - b);
  const gap = xs[1] - xs[0];
  assert.ok(gap > 30 && gap < 55 && xs[3] - xs[2] > 30, 'the wads leave one spot and pull apart');
}

// eve: tap is three cuts, a held key stances then waves, tea drains 30 and whiffs long,
// the cloak misses normals, bushido is seven cuts with no meter
{
  const eve = at('eve');
  const data = ROSTER[eve];
  assert.ok(data.view.kind === 'sprite' && data.view.specialScale === 0.95, 'the special sheet draws at 0.95 around the feet');
  assert.ok(data.view.kind === 'sprite' && data.view.worldScale === 1.1, 'the super sheet draws at 1.1 around the feet');
  assert.equal(data.bands?.[0], 'pastel-palettes', 'eve sits with Pastel*Palettes');
  assert.equal(ROSTER[eve - 1]?.id, 'hina', 'eve follows hina');
  assert.equal(data.trait, 'rush', 'eve is rush');
  assert.equal(data.skills[2].fx, 'iaido', 'U is the wooden trio');
  assert.equal(data.skills[3].drain, 10, 'each sip drains 10');
  assert.equal(data.skills[4].cd, 10, 'the cloak waits 10s');
  assert.equal(data.skills[4].breakout, true, 'the cloak is a breakout');
  assert.equal(data.skills[5].cost, 120, 'bushido costs 120');
  assert.equal(data.skills[5].count, 7, 'bushido is seven cuts');
  const ult = data.skills[5];
  assert.equal(bushidoClip(0, ult).sheet, 'special', 'the raise lives on the special sheet');
  assert.equal(bushidoClip(ult.start, ult).sheet, 'world', 'the flurry lives on the super sheet');
  assert.equal(bushidoClip(ult.duration - .05, ult).row, 2, 'the sheathe is the last special cell');

  // clip routing: the tap replays the whole cut column once per wooden beat, not one held pose
  const pf = previewFighter(data, 0);
  pf.attack = { skill: data.skills[2], index: 2, serial: 1, t: 0, emitted: false, shots: 0, burst: 0, hit: new Set(), endure: 0, liftAt: 0, tossAt: 0, hold: -1, anchor: 0, mode: 1 };
  assert.deepEqual([clipFor(pf).col, clipFor(pf).row], [0, 0], 'the tap starts on the windup cell');
  pf.attack.t = IAIDO_DECIDE + .03;
  assert.equal(clipFor(pf).row, 1, 'the middle cell lands on the first cut');
  pf.attack.t = IAIDO_DECIDE + IAIDO_GAP * 2 + .03;
  assert.equal(clipFor(pf).row, 1, 'the third cut plays the middle cell again');
  pf.attack.t = data.skills[2].duration - IAIDO_RECOVER;
  assert.equal(clipFor(pf).row, 2, 'the tail holds the recover cell');

  const tap = newGame(eve, at('boulder')); const [t1, t2] = tap.fighters; dummy(tap);
  t2.x = t1.x + 70; t2.facing = -1;
  const tapHp = t2.hp;
  tap.keyDown('KeyU');
  run(tap, .05);
  tap.keyUp('KeyU');
  run(tap, 1.2);
  assert.ok(t2.hp < tapHp, 'a tap connects the wooden combo');
  assert.equal(tap.projectiles.filter(p => p.fx === 'iaido').length, 0, 'a tap fires no waves');

  const held = newGame(eve, at('boulder')); const [h1] = held.fighters; dummy(held);
  held.fighters[1].x = h1.x + 420;
  held.keyDown('KeyU');
  run(held, IAIDO_DECIDE + .12);
  assert.equal(h1.attack?.mode, 2, 'holding past the window is the stance');
  held.keyUp('KeyU');
  run(held, .25);
  assert.equal(held.projectiles.filter(p => p.fx === 'iaido').length, 3, 'release fires three waves');

  const cut = newGame(eve, at('boulder')); const [c1, c2] = cut.fighters; dummy(cut);
  c2.x = c1.x + 70; c2.facing = -1;
  cut.keyDown('KeyU');
  run(cut, IAIDO_DECIDE + .08);
  assert.equal(c1.attack?.mode, 2, 'she is still in the stance');
  cut.keyDown('Numpad1');
  run(cut, .45);
  assert.equal(cut.projectiles.filter(p => p.fx === 'iaido').length, 0, 'a hit during the stance fires nothing');

  const tea = newGame(eve, at('boulder')); const [e1, e2] = tea.fighters; dummy(tea);
  e2.x = e1.x + 140; e2.facing = -1; e2.energy = 100;
  tea.keyDown('KeyI');
  tea.keyUp('KeyI');
  let sips = 0, prev = 0;
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    tea.step(STEP);
    const n = tea.texts.filter(t => t.text === '-10 气').length;
    if (n > prev) sips += n - prev;
    prev = n;
  }
  assert.equal(sips, 3, 'tea drains in three sips');
  assert.equal(e2.knocked, 0, 'tea does not knock down');

  const whiff = newGame(eve, at('boulder')); const [w1, w2] = whiff.fighters; dummy(whiff);
  w2.x = w1.x + 520;
  whiff.keyDown('KeyI');
  whiff.keyUp('KeyI');
  let whiffT = 0;
  for (let i = 0; i < Math.round(2 / STEP); i++) {
    whiff.step(STEP);
    if (w1.attack?.index === 3) whiffT = Math.max(whiffT, w1.attack.t);
  }
  assert.ok(whiffT > 1.5, `a tea whiff plays out, saw ${whiffT.toFixed(2)}`);

  const cloak = newGame(eve, at('boulder')); const [k1, k2] = cloak.fighters; dummy(cloak);
  cloak.keyDown('KeyO');
  cloak.keyUp('KeyO');
  run(cloak, .5);
  assert.ok(k1.mods.some(m => m.kind === 'veil' && m.left > 4), 'the cloak lasts about 5s');
  assert.ok(k1.braced > 4, 'the cloak is also brace');

  // 解控 shares one shockwave: the cloak has no melee of its own, yet still shoves and interrupts the ring
  const pulse = newGame(eve, at('boulder')); const [g1, g2] = pulse.fighters; dummy(pulse);
  g2.x = g1.x + 90; g2.facing = -1;
  const gx = g2.x;
  pulse.keyDown('KeyO');
  pulse.keyUp('KeyO');
  let stunSeen = 0, invAt = 0;
  for (let i = 0; i < Math.round(.5 / STEP); i++) {
    pulse.step(STEP);
    stunSeen = Math.max(stunSeen, g2.stun);
    invAt = Math.max(invAt, g1.invuln);
  }
  assert.ok(g2.x > gx + 40, `the shared escape shoves the ring, moved ${(g2.x - gx).toFixed(1)}`);
  assert.ok(stunSeen >= .28, `the shared escape interrupts, saw ${stunSeen}`);
  assert.ok(invAt >= .3, `a breakout cast grants the shared invuln, saw ${invAt}`);

  // the cloak cuts out of hitstun: the press comes out even while stunned, and clears it
  const bail = newGame(eve, at('boulder')); const [x1] = bail.fighters; dummy(bail);
  x1.stun = .5;
  x1.queue.push({ index: 4, ttl: .18 });
  let out = false;
  for (let i = 0; i < Math.round(.25 / STEP); i++) {
    bail.step(STEP);
    if (x1.attack?.index === 4) out = true;
  }
  assert.ok(out, 'the cloak comes out of hitstun');
  assert.equal(x1.stun, 0, 'the escape clears the stun');
  assert.ok(x1.mods.some(m => m.kind === 'veil'), 'the escape still veils her');
  const jab = k2.data.skills[0];
  const shot = { ...jab, type: 'projectile' as const, key: 'U', damage: 5 };
  const veiled = (roll: number) => {
    const g = new FightGame([ROSTER[eve], ROSTER[at('boulder')]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: () => roll });
    const [a, b] = g.fighters;
    addMod(a, 'veil', 5);
    return { g, a, b };
  };
  {
    const { g, a, b } = veiled(0);
    const hp = a.hp;
    assert.equal(hit(g, b, a, jab, { hit: new Set() }), false, 'a normal misses under 20%');
    assert.equal(a.hp, hp, 'the miss deals no damage');
    assert.equal(hit(g, b, a, shot, { hit: new Set() }), false, 'a shot misses under 90%');
  }
  {
    const { g, a, b } = veiled(VEIL_NORMAL);
    assert.equal(hit(g, b, a, jab, { hit: new Set() }), true, 'a normal connects at 20%');
    assert.equal(hit(g, b, a, shot, { hit: new Set() }), false, 'a shot still misses at 20%');
  }
  {
    const { g, a, b } = veiled(VEIL_SHOT);
    assert.equal(hit(g, b, a, shot, { hit: new Set() }), true, 'a shot connects at 90%');
  }
  const grab = { ...jab, type: 'grab' as const, key: 'I', damage: 10 };
  const rooted = { ...shot, root: 1 };
  const { g, a, b } = veiled(0);
  assert.equal(hit(g, b, a, grab, { hit: new Set() }), true, 'a grab connects through the veil');
  assert.equal(hit(g, b, a, rooted, { hit: new Set() }), true, 'a rooting shot connects through the veil');

  const bush = newGame(eve, at('boulder')); const [b1, b2] = bush.fighters; dummy(bush);
  b2.x = b1.x + 50; b2.facing = -1;
  b1.energy = b1.energyMax;
  const x0 = b1.x;
  bush.keyDown('KeyL');
  run(bush, BUSHIDO_LUNGE);
  assert.equal(b1.attack?.shots ?? 0, 0, 'the cuts wait until the lunge ends');
  assert.ok(Math.abs(b1.x - x0 - BUSHIDO_SPAN) < 1.5, `the lunge covers 15% of the stage, moved ${(b1.x - x0).toFixed(1)}`);
  const planted = b1.x;
  run(bush, .1);
  assert.equal(b1.attack?.shots ?? 0, 0, 'the cuts have not started');
  assert.ok(Math.abs(b1.x - planted) < 1, 'she plants after the lunge');
  let swings = 0, down = false, energyAt = -1, cutX = NaN, sheatheX = NaN;
  for (let i = 0; i < Math.round(2 / STEP); i++) {
    bush.step(STEP);
    if (b1.attack?.index === 5) {
      const a = b1.attack;
      if (Number.isNaN(cutX) && a.t >= a.skill.start) cutX = b1.x;
      if (Number.isNaN(sheatheX) && a.t >= a.skill.duration - BUSHIDO_TAIL) sheatheX = b1.x;
      swings = Math.max(swings, a.shots);
      if (swings === 7) energyAt = b1.energy;
    }
    if (b2.knocked > 0) down = true;
  }
  assert.ok(Math.abs(sheatheX - cutX - BUSHIDO_CREEP) < 2, `the cuts creep about 70px, moved ${(sheatheX - cutX).toFixed(1)}`);
  assert.equal(swings, 7, 'bushido swings seven times');
  assert.equal(energyAt, 0, 'bushido grants no meter');
  assert.ok(down, 'the last cut knocks down');
}

{
  assert.equal(cleanCode('k7qm'), 'K7QM', 'room codes uppercase');
  assert.equal(cleanCode('o0i1'), '', 'room codes drop ambiguous characters');
  assert.equal(packBits(new Set(['KeyA', 'KeyJ']), false), BIT_LEFT | BIT_ATK, 'held left and light pack to those bits');
  assert.equal(packBits(new Set(), true) & BIT_SOFT, BIT_SOFT, 'a touch pad sets the soft bit');
  const hello = JSON.stringify({ t: 'hello', build: NET_BUILD, charId: 'uika' });
  assert.deepEqual(await decodeFrame(hello), { t: 'hello', build: NET_BUILD, charId: 'uika' }, 'a text frame is a hello');
  assert.deepEqual(await decodeFrame(new TextEncoder().encode(hello).buffer), { t: 'hello', build: NET_BUILD, charId: 'uika' }, 'an arraybuffer frame is a hello');
  assert.deepEqual(await decodeFrame(new Blob([hello])), { t: 'hello', build: NET_BUILD, charId: 'uika' }, 'a blob frame is a hello');
  assert.equal(await decodeFrame(new Uint8Array([1, 2, 3])), null, 'a non-json frame is dropped');
  const base = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
  const line = 'candidate:1 1 udp 1 10.0.0.2 9 typ host';
  const sealed = sealCandidates(base, [line, 'a=' + line]);
  assert.equal(sealed, base + 'a=' + line + '\r\n', 'a gathered candidate is sealed once');
  assert.equal(sealCandidates(sealed, [line]), sealed, 'sealing again does not duplicate');
  assert.equal(relayAddressCount([
    'candidate:1 1 udp 1 139.59.106.152 50000 typ relay raddr 1.2.3.4 rport 9',
    'candidate:2 1 udp 1 139.59.106.152 50001 typ relay',
    'a=candidate:3 1 tcp 1 1.1.1.1 3478 typ relay',
  ]), 2, 'relay addresses count distinct TURN hosts');
  assert.deepEqual(turnHosts([
    { urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'] },
    { urls: ['turn:203.0.113.10:3478?transport=udp', 'turn:203.0.113.10:3478?transport=tcp'] },
  ]), ['turn.cloudflare.com', '203.0.113.10'], 'UDP and TCP on one TURN host count once');
  assert.equal(turnUrlHost('turn:user@203.0.113.10:3478'), '', 'a TURN URL with userinfo is not a host');
  const two = ['turn.cloudflare.com', '203.0.113.10'];
  assert.equal(relaysCovered(two, ['turn.cloudflare.com'], 2), false, 'two relay IPs from the fast TURN host do not cover the other host');
  assert.equal(relaysCovered(two, ['turn.cloudflare.com', '203.0.113.10'], 1), true, 'one relay from each TURN host is enough');
  assert.equal(relaysCovered(two, [], 2), true, 'missing candidate.url falls back to distinct relay addresses');
}

// online: the guest's normals and skills come out on the host, through the same pad the wire carries
{
  const pair = (soft: boolean) => {
    const opts = { mode: 'cpu' as const, difficulty: 1, stage: STAGES[0], audio: silent, random: rng(5) };
    const host = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], { ...opts, controllers: [0, 1], netRole: 'host' });
    const guest = new FightGame([ROSTER[at('gale')], ROSTER[at('ember')]], { ...opts, controllers: [null, null], netRole: 'guest' });
    const taps = new Array(TAP_SLOTS).fill(0);
    guest.onKey = code => { const i = tapSlot(code); if (i >= 0) taps[i] = (taps[i] + 1) % 256; };
    const remote = new RemotePad();
    let inbox: string[] = [];
    const book = new IdBook();
    const objs = new Map<string, object>();
    let painted: WireState | null = null;
    // One wire message per guest frame, JSON like the data channel; the host folds them all next frame.
    const send = () => inbox.push(JSON.stringify({ t: 'in', n: 0, bits: packBits(guest.keys, soft), taps: taps.slice() }));
    const hostFrame = () => {
      for (const raw of inbox) remote.apply(host, readPad(JSON.parse(raw))!);
      inbox = [];
      for (let i = 0; i < 2; i++) host.step(STEP);
      const cur = captureState(host, book);
      applyState(guest, cur, painted, objs);
      painted = cur;
    };
    run(host, 2.3);
    assert.equal(host.phase, 'fight', 'online host reaches the fight');
    const p2 = host.fighters[1];
    p2.cooldowns.fill(0);
    const settle = () => { for (let i = 0; i < 160; i++) { send(); hostFrame(); } p2.cooldowns.fill(0); p2.x = 700; host.fighters[0].x = 200; };
    const watch = (frames: number) => {
      let seen: { index: number; air: boolean } | null = null;
      for (let i = 0; i < frames && !seen; i++) {
        hostFrame();
        if (p2.attack) seen = { index: p2.attack.index, air: !!p2.attack.skill.air };
      }
      return seen;
    };
    return { host, guest, p2, send, hostFrame, settle, watch, drop: () => { inbox = []; } };
  };

  // Keyboard J, K, U held for a few frames.
  {
    const w = pair(false);
    for (const [code, index] of [['KeyJ', 0], ['KeyK', 1], ['KeyU', 2]] as const) {
      w.settle();
      w.guest.keyDown(code); w.send();
      const seen = w.watch(6);
      w.guest.keyUp(code); w.send();
      assert.equal(seen?.index, index, 'guest ' + code + ' fires slot ' + index + ' on the host');
      assert.equal(seen?.air, false, 'guest ' + code + ' is a ground move');
    }
    // A keyboard tap that presses and lets go between two host frames still lands.
    w.settle();
    w.guest.keyDown('KeyJ'); w.send(); w.guest.keyUp('KeyJ'); w.send();
    assert.equal(w.watch(6)?.index, 0, 'a press+release folded into one host frame is still a light');
    // The press packet is lost; the later one still carries the count.
    w.settle();
    w.guest.keyDown('KeyK'); w.send(); w.drop(); w.guest.keyUp('KeyK'); w.send();
    assert.equal(w.watch(6)?.index, 1, 'a lost press packet does not lose the heavy');
    // Jump, then J and K in the air.
    for (const [code, index] of [['KeyJ', 0], ['KeyK', 1]] as const) {
      w.settle();
      w.guest.keyDown('KeyW'); w.send(); w.hostFrame(); w.guest.keyUp('KeyW'); w.send();
      for (let i = 0; i < 6; i++) w.hostFrame();
      assert.ok(w.p2.y < FLOOR - 10, 'guest jump leaves the floor');
      w.guest.keyDown(code); w.send();
      const seen = w.watch(6);
      w.guest.keyUp(code); w.send();
      assert.equal(seen?.index, index, 'guest air ' + code + ' fires slot ' + index);
      assert.equal(seen?.air, true, 'guest air ' + code + ' is the air version');
    }
  }

  // Touch: a short tap is keyDown+keyUp in one call (light), a long press holds K (heavy).
  {
    const w = pair(true);
    w.settle();
    w.guest.keyDown('KeyJ'); w.guest.keyUp('KeyJ'); w.send();
    assert.equal(w.watch(6)?.index, 0, 'a touch tap is a light on the host');
    w.settle();
    w.guest.keyDown('KeyK'); w.send();
    for (let i = 0; i < 12; i++) w.send();
    const seen = w.watch(6);
    w.guest.keyUp('KeyK'); w.send();
    assert.equal(seen?.index, 1, 'a touch long press is a heavy on the host');
    // The held-bits-only wire this replaces never saw the tap.
    w.settle();
    w.guest.keyDown('KeyJ'); w.guest.keyUp('KeyJ');
    applyRemoteBits(w.host, packBits(w.guest.keys, true));
    let old = false;
    for (let i = 0; i < 6; i++) { w.host.step(STEP); if (w.p2.attack) old = true; }
    assert.equal(old, false, 'held bits alone drop a same-tick tap (the bug this fixes)');
  }

  // The host's own keyboard drives 1P only; 2P keys belong to the wire.
  {
    const w = pair(false);
    assert.equal(w.host.isLocalControl('KeyJ'), true, 'host J is local');
    assert.equal(w.host.isLocalControl('Numpad1'), false, 'host numpad is not local online');
    assert.equal(w.host.isLocalControl('ArrowLeft'), false, 'host arrows are not local online');
    assert.equal(newGame().isLocalControl('ArrowLeft'), true, 'offline every control is local');
    w.host.togglePause(true);
    assert.equal(w.host.paused, false, 'online pause never stops the match');
    assert.equal(w.host.netMenu, true, 'online pause opens the menu');
  }
  assert.equal(readPad({ bits: 1, taps: [1] }), null, 'a short tap list is refused');
}

// online wire: every fighter field the host has reaches the guest, deltas fit one packet, loss heals
{
  const opts = { mode: 'cpu' as const, difficulty: 2, stage: STAGES[0], audio: silent };
  const sample = rng(31);
  let maxPart = 0;
  let parts = 0;
  for (let a = 0; a < PLAYABLE.length; a++) {
    const b = (a + 7) % PLAYABLE.length;
    const host = new FightGame([PLAYABLE[a], PLAYABLE[b]], { ...opts, random: rng(a + 3), controllers: [null, null], netRole: 'host' });
    const guest = new FightGame([PLAYABLE[a], PLAYABLE[b]], { ...opts, random: rng(1), controllers: [null, null], netRole: 'guest' });
    const book = new IdBook();
    const sent = new Map<number, WireState>();
    const have = new Map<number, WireState>();
    const objs = new Map<string, object>();
    let painted: WireState | null = null;
    let ack = 0;
    let shownN = 0;
    for (let n = 1; n <= 240; n++) {
      for (let i = 0; i < 4; i++) host.step(STEP);
      const cur = captureState(host, book);
      const base = ack ? sent.get(ack)! : null;
      const { changes, gone } = diffState(base, cur);
      sent.set(n, cur);
      const texts = splitParts(n, ack, changes, gone).map((items, i, all) => partText({ t: 's', m: 0, n, b: ack, i, k: all.length }, items, gone));
      const got: ReturnType<typeof readPart>[] = [];
      for (const text of texts) {
        const size = new TextEncoder().encode(text).length;
        maxPart = Math.max(maxPart, size);
        parts++;
        // 20% loss, both ways.
        if (sample() < .2) continue;
        got.push(readPart(JSON.parse(text)));
      }
      if (got.length !== texts.length) continue;
      const b0 = got[0]!.b;
      const st = patchState(b0 ? have.get(b0)! : null, got.flatMap(p => p!.d), got[0]!.x);
      have.set(n, st);
      applyState(guest, st, painted, objs);
      painted = st;
      shownN = n;
      if (sample() >= .2) ack = shownN;
    }
    assert.ok(shownN > 200, PLAYABLE[a].id + ': the guest keeps up under 20% loss (' + shownN + ')');
    // The guest's own objects, captured the same way, must match the host's last painted state field for field.
    const back = captureState(guest, new IdBook());
    const want = sent.get(shownN)!;
    for (const [key, fields] of want) {
      if (key[0] !== 'f' && key !== 'g') continue;
      const mine = back.get(key);
      assert.ok(mine, PLAYABLE[a].id + ': guest has ' + key);
      for (const [k, v] of fields) {
        if (k === 'charId') continue;
        assert.equal(mine!.get(k), v, PLAYABLE[a].id + ' vs ' + PLAYABLE[b].id + ': ' + key + '.' + k + ' reaches the guest');
      }
    }
    const shotsHost = [...want.keys()].filter(k => k[0] === 'p' || k[0] === 'e').sort();
    const shotsGuest = [...objs.keys()].filter(k => k[0] === 'p' || k[0] === 'e').sort();
    assert.deepEqual(shotsGuest, shotsHost, PLAYABLE[a].id + ': the guest holds the same shots and effects, by id');
  }
  assert.ok(maxPart <= PART_BYTES, 'every snapshot message fits one packet, largest ' + maxPart + ' bytes');
  // NO_WIRE must name real Fighter fields, or it is hiding nothing and a rename slipped through.
  const f = newGame().fighters[0] as unknown as Record<string, unknown>;
  for (const k of NO_WIRE) assert.ok(k in f, 'NO_WIRE ' + k + ' is a Fighter field');
  for (const k of GAME_FIELDS) assert.ok(k in newGame(), 'GAME_FIELDS ' + k + ' is a FightGame field');
  const book = new IdBook();
  const o = {};
  assert.equal(book.of(o), book.of(o), 'an object keeps its wire id');
  assert.ok(book.of({}) !== book.of(o), 'two objects get two ids');
}

// online input: samples play on the guest's clock, so jitter does not change spacing or hold length
{
  const clock = new InputClock();
  const jit = rng(5);
  const idle = [0, 0, 0, 0, 0, 0, 0, 0];
  const taps = [0, 0, 0, 1, 0, 0, 0, 0];
  // A second of 30Hz heartbeats at 40–100ms one-way, then press K at 1000, still held at 1100, release at 1180.
  const sent: PadEvent[] = [];
  for (let i = 0; i < 30; i++) sent.push([i + 1, i * 33, 0, idle]);
  sent.push([31, 1000, BIT_ATK << 1, taps], [32, 1100, BIT_ATK << 1, taps], [33, 1180, 0, taps]);
  const arrivals = sent.map(e => [Math.round(e[1] + 40 + jit() * 60), e] as [number, PadEvent]);
  const played: [number, PadEvent][] = [];
  for (let now = 0; now < 1600; now++) {
    for (const [at, e] of arrivals) if (at === now) clock.push([e], now);
    for (const e of clock.due(now)) if (e[0] > 30) played.push([now, e]);
  }
  assert.equal(played.length, 3, 'all three samples play');
  const held = played[2][0] - played[0][0];
  assert.ok(Math.abs(held - 180) <= 8, 'a 180ms hold plays as ' + held + 'ms despite 40–100ms jitter');
  assert.ok(clock.jitter > 0 && clock.jitter <= 120, 'the jitter margin adapts (' + clock.jitter.toFixed(0) + 'ms)');
  // Redundancy: a packet repeating old samples adds nothing twice.
  clock.push([played[0][1], played[1][1]], 2000);
  assert.equal(clock.due(5000).length, 0, 'repeated samples do not replay');
  assert.deepEqual(readEvents([[1, 2, 3, [0, 0, 0, 0, 0, 0, 0, 0]], ['x'], [2, 3, 4, [1]]]), [[1, 2, 3, [0, 0, 0, 0, 0, 0, 0, 0]]], 'malformed samples are dropped');
  assert.equal(parseIce(undefined).length, 2, 'no ICE setting keeps the two STUN servers');
  assert.deepEqual(parseIce('[{"urls":"turn:t.example:3478","username":"u","credential":"c"}]').map(s => s.urls), ['turn:t.example:3478'], 'VITE_ICE_SERVERS takes a TURN');
  assert.equal(parseIce('not json').length, 2, 'a broken ICE setting falls back');
  assert.deepEqual(iceList([{ urls: 'turn:t.example:3478' }, {}, null, { urls: ['turn:a:3478'] }]).map(s => s.urls), ['turn:t.example:3478', ['turn:a:3478']], 'iceList keeps only entries with urls');
  const endpointSrc = readFileSync('src/net/endpoint.ts', 'utf8');
  assert.ok(!endpointSrc.includes('tcloudbase.com'), 'src/net/endpoint.ts must not hardcode the live CloudBase URL');
  const mailboxSrc = readFileSync('cloudbase/functions/mailbox/index.js', 'utf8');
  assert.ok(mailboxSrc.includes('const TURN_TTL = 600;'), 'mailbox TURN credentials must stay short-lived (600s)');
  assert.ok(mailboxSrc.includes('TURN_DAILY_MAX'), 'mailbox must enforce a daily TURN mint cap');
  assert.ok(mailboxSrc.includes('TURN_IP_DAILY_MAX') && mailboxSrc.includes('TURN_IP_CD_MS'), 'mailbox must enforce per-IP TURN cooldown and daily cap');
  assert.ok(mailboxSrc.includes('TURN_DAILY_BYTES_MAX') && mailboxSrc.includes('TURN_MONTHLY_BYTES_MAX') && mailboxSrc.includes('TURN_SPIKE_BYTES_MAX'), 'mailbox must enforce daily, monthly, and spike Cloudflare TURN byte caps');
  assert.ok(mailboxSrc.includes('callsTurnUsageAdaptiveGroups') && mailboxSrc.includes('/revoke'), 'mailbox must query Cloudflare GraphQL usage and actively revoke credentials on trip');
  assert.ok(mailboxSrc.includes('revokePending') && mailboxSrc.includes("op === 'patrol'"), 'mailbox must persist failed TURN revokes and patrol without a new mint');
  assert.ok(!mailboxSrc.includes('slice(-30)') && !mailboxSrc.includes('slice(-29)'), 'mailbox must not drop live TURN usernames before revoke');
  assert.ok(mailboxSrc.includes('QUEUE_MAX = 20') && mailboxSrc.includes('OPEN_MAX = 30'), 'mailbox must cap concurrent queue waiters and unjoined open rooms');
  assert.ok(mailboxSrc.includes('!room.joined'), 'mailbox turn endpoint must reject unjoined rooms');
  assert.ok(mailboxSrc.includes('secret.length >= 32'), 'self-hosted TURN secret must be at least 32 characters');
  assert.ok(mailboxSrc.includes('function sgHostOk'), 'self-hosted TURN host must be a bare hostname or IPv4');
  const onlineSrc = readFileSync('src/ui/online.ts', 'utf8');
  assert.ok(onlineSrc.includes('res.joined === true'), 'asHost must wait for a guest to join before minting TURN credentials');
}

// lockstep: the seeded sim is deterministic for every character, frame by frame, and an exact dump resumes it
{
  const pads = (seed: number) => {
    const r = rng(seed);
    const taps = [0, 0, 0, 0, 0, 0, 0, 0];
    let bits = 0;
    return () => {
      if (r() < .15) bits = Math.floor(r() * 1024) & ~(1 << 10);
      if (r() < .1) { const i = Math.floor(r() * 8); taps[i] = (taps[i] + 1) % 256; }
      return { bits, taps: taps.slice() };
    };
  };
  const make = (a: number, b: number, seed: number) => {
    const r = new Rng(seed);
    const g = new FightGame([PLAYABLE[a], PLAYABLE[b]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: r.next, controllers: [0, 1], netRole: 'lock' });
    return { g, r, p: [new RemotePad(0), new RemotePad(1)] };
  };
  let resumed = 0;
  for (let a = 0; a < PLAYABLE.length; a++) {
    const b = (a + 3) % PLAYABLE.length;
    const x = make(a, b, 1000 + a), y = make(a, b, 1000 + a);
    const p0 = pads(a * 7 + 1), p1 = pads(a * 7 + 2);
    let z: ReturnType<typeof make> | null = null;
    for (let t = 0; t < 1800; t++) {
      const i0 = p0(), i1 = p1();
      for (const w of z ? [x, y, z] : [x, y]) {
        w.p[0].apply(w.g, i0); w.p[1].apply(w.g, i1);
        for (let k = 0; k < TICK_STEPS; k++) w.g.step(STEP);
      }
      const hx = hashGame(x.g, x.r);
      assert.equal(hashGame(y.g, y.r), hx, PLAYABLE[a].id + ' vs ' + PLAYABLE[b].id + ': same seed and pads, same sim at tick ' + t);
      if (z && hashGame(z.g, z.r) === hx) resumed++;
      if (t === 600) {
        z = make(a, b, 1);
        loadGame(z.g, z.r, dumpGame(x.g, x.r));
        z.p[0].taps = x.p[0].taps.slice(); z.p[1].taps = x.p[1].taps.slice();
      }
    }
  }
  // A resync is exact when no closure-carrying mod is live; most pairs stay in step for the whole 20s after.
  assert.ok(resumed > PLAYABLE.length * 1199 * .9, 'an exact dump resumes the sim in step (' + resumed + ' of ' + PLAYABLE.length * 1199 + ' ticks)');
}

// lockstep sessions over a lossy, laggy link: in step, a forced desync resyncs, repeated ones fall back
{
  const run = (opts: { loss: number; delay: number; jitter: number; poisonAt?: number[]; seconds: number }) => {
    const r = rng(77);
    const seed = 4242;
    const logs: string[] = [];
    let fellBack = '';
    const muted = [0, 0];
    type Wire = { at: number; to: 0 | 1; text?: string; rel?: Record<string, unknown> };
    let wire: Wire[] = [];
    let now = 0;
    const sessions: LockSession[] = [];
    const pad = pads2(5);
    for (const side of [0, 1] as const) {
      const rr = new Rng(seed);
      const g = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rr.next, controllers: [0, 1], netRole: 'lock' });
      const other = (1 - side) as 0 | 1;
      sessions.push(new LockSession(g, rr, side, {
        sendFast: text => { if (r() >= opts.loss) wire.push({ at: now + opts.delay + r() * opts.jitter, to: other, text }); },
        sendRel: msg => wire.push({ at: now + opts.delay + opts.jitter, to: other, rel: JSON.parse(JSON.stringify(msg)) }),
        sample: () => pad[side](),
        mute: on => { muted[side] += on ? 1 : 0; },
        fallback: why => { fellBack = why; },
        log: t => logs.push(t),
      }));
    }
    for (let frame = 0; frame < opts.seconds * 60; frame++) {
      now += TICK_MS;
      const due = wire.filter(w => w.at <= now).sort((a, b) => a.at - b.at);
      wire = wire.filter(w => w.at > now);
      for (const w of due) {
        const msg = w.rel ?? JSON.parse(w.text!);
        if (msg.t === 'giveup') sessions[w.to].onGiveUp(String(msg.why));
        else sessions[w.to].onMessage(msg, now);
      }
      if (opts.poisonAt?.includes(frame)) sessions[1].poison();
      for (const s of sessions) s.frame(now);
      if (fellBack) break;
    }
    return { sessions, logs, fellBack, muted };
  };
  function pads2(seed: number) {
    const r = rng(seed);
    return [0, 1].map(() => {
      const taps = [0, 0, 0, 0, 0, 0, 0, 0];
      let bits = 0;
      return () => {
        if (r() < .1) bits = Math.floor(r() * 1024) & ~(1 << 10);
        if (r() < .08) { const i = Math.floor(r() * 8); taps[i] = (taps[i] + 1) % 256; }
        return { bits, taps: taps.slice() };
      };
    });
  }
  const clean = run({ loss: .2, delay: 50, jitter: 60, seconds: 20 });
  const [h, gst] = clean.sessions;
  assert.ok(h.tick > 20 * 60 * .7, 'lockstep keeps up under 20% loss and 50–110ms (tick ' + h.tick + ')');
  assert.ok(h.delay >= 3 && h.delay <= 8, 'input delay adapts within 3–8 ticks (' + h.delay + ')');
  assert.equal(clean.logs.filter(l => l.includes('resync')).length, 0, 'no desync on a clean run: ' + clean.logs.join(' | '));
  const k = Math.min(h.tick, gst.tick);
  assert.ok(Math.abs(h.tick - gst.tick) <= 10, 'the two sides stay within a few ticks');
  assert.equal(clean.fellBack, '', 'no fallback on a clean run');
  void k;
  const once = run({ loss: .1, delay: 40, jitter: 30, seconds: 12, poisonAt: [200] });
  assert.equal(once.logs.filter(l => l.includes('resync #')).length, 1, 'a poisoned guest is caught and resynced once: ' + once.logs.join(' | '));
  assert.ok(once.logs.some(l => l.includes('resynced to tick')), 'the guest restores from the host');
  assert.ok(once.muted[1] >= 1, 'the replay after a resync is muted');
  assert.equal(once.fellBack, '', 'one desync does not fall back');
  const many = run({ loss: .1, delay: 40, jitter: 30, seconds: 30, poisonAt: [200, 500, 800, 1100, 1400] });
  assert.ok(many.fellBack.length > 0, 'repeated desyncs hand the match to snapshots: ' + many.logs.join(' | '));
  const dead = run({ loss: .97, delay: 40, jitter: 30, seconds: 12 });
  assert.ok(dead.fellBack.length > 0, 'a link that cannot keep up falls back');
  // High-RTT links (> SNAP_RTT_MS = 230ms, e.g. China LAX TURN at 290–435ms or extreme 950ms) hand off within 3 RTT samples during the round intro
  assert.equal(SNAP_RTT_MS, 230, 'lockstep RTT ceiling is 230ms');
  for (const [label, oneWay, jitter, maxFrames] of [
    ['LAX fast 290ms', 145, 10, 70],
    ['LAX median 350ms', 160, 35, 75],
    ['LAX slow 435ms', 210, 15, 80],
    ['extreme 950ms', 465, 20, 100],
  ] as const) {
    const hi = run({ loss: .05, delay: oneWay, jitter, seconds: 3 });
    assert.equal(hi.fellBack, '高延迟直切快照', label + ' hands off within 3 RTT samples');
    assert.ok(hi.sessions[0].tick <= maxFrames, label + ' finishes handoff while still in ROUND 1 intro (< 135 ticks, got ' + hi.sessions[0].tick + ')');
  }

  {
    // A single spike (e.g. 1st sample 300ms, rest 25ms) does not trigger snapshot fallback
    const g = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(1), controllers: [0, 1], netRole: 'lock' });
    let fellBackWhy = '';
    const s = new LockSession(g, new Rng(1), 0, {
      sendFast: () => {}, sendRel: () => {}, sample: () => ({ bits: 0, taps: [0, 0, 0, 0, 0, 0, 0, 0] }),
      mute: () => {}, fallback: why => { fellBackWhy = why; }, log: () => {},
    });
    // Sample 1: 300ms (spike)
    s.onMessage({ t: 'L', et: 1000, ed: 0 }, 1300);
    assert.equal(fellBackWhy, '', 'first spike sample of 300ms does not cause immediate fallback');
    // Sample 2: 25ms
    s.onMessage({ t: 'L', et: 1300, ed: 0 }, 1325);
    assert.equal(fellBackWhy, '', 'second normal sample keeps lockstep active');
    // Sample 3: 25ms
    s.onMessage({ t: 'L', et: 1350, ed: 0 }, 1375);
    assert.equal(fellBackWhy, '', 'third normal sample keeps lockstep active (min of last 4 is 25ms <= 230ms)');
  }
}

// China LAX TURN (350ms RTT) local-first guest prediction + host soft snapshot reconciliation + lenient hit claim
{
  const hostGame = new FightGame([PLAYABLE[0], PLAYABLE[4]], {
    mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(101), controllers: [0, 1], netRole: 'host',
  });
  const guestGame = new FightGame([PLAYABLE[0], PLAYABLE[4]], {
    mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(101), controllers: [null, 0], netRole: 'guest',
  });
  hostGame.phase = 'fight'; guestGame.phase = 'fight';
  hostGame.phaseTime = 0; guestGame.phaseTime = 0;

  let lastClaim: [number, number, number] | null = null;
  guestGame.onClaimHit = (slot, gx, hx) => { lastClaim = [slot, gx, hx]; };

  const hostBook = new IdBook();
  const objs = new Map<string, object>();
  let hostSent: WireState | null = null;
  let guestWire: WireState | null = null;
  const softOffset: SoftOffset = { dx: 0, dy: 0 };

  const sendSnap = () => {
    const snap = captureState(hostGame, hostBook);
    const { changes, gone } = diffState(hostSent, snap);
    hostSent = snap;
    const next = patchState(guestWire, changes, gone);
    applyState(guestGame, next, guestWire, objs);
    guestWire = next;
  };

  // 1) Initial full snapshot syncs both sides
  sendSnap();
  reconcileGuestPred(guestGame, null, true, softOffset);

  const startX = guestGame.fighters[1].x;
  // 2) Guest presses walk left (KeyA) — responds on frame 1 (0ms network wait)
  guestGame.keyDown('KeyA');
  for (let i = 0; i < TICK_STEPS; i++) guestGame.stepGuestLocal(STEP);
  assert.ok(guestGame.fighters[1].x < startX, 'guest local step moves fighter[1] on the very first frame');
  assert.equal(guestGame.fighters[1].animState, 'run', 'guest local step switches animation to run immediately');

  // Advance guest locally for 10 ticks (~167ms, one-way LAX delay) while host has not yet received KeyA
  for (let t = 0; t < 10; t++) {
    for (let i = 0; i < TICK_STEPS; i++) {
      hostGame.step(STEP);
      guestGame.stepGuestLocal(STEP);
    }
  }
  const predictedX = guestGame.fighters[1].x;
  assert.ok(startX - predictedX > 40, 'guest walked >40px locally during the 175ms one-way window');

  // 3) Host sends a delta snapshot where host's fighter[1] is still at startX; guest preserves local prediction
  const predBeforeStale = snapshotGuestPred(guestGame.fighters[1]);
  sendSnap();
  reconcileGuestPred(guestGame, predBeforeStale, true, softOffset);
  assert.equal(guestGame.fighters[1].x, predictedX, 'stale host snapshot does not rubber-band guest back to 175ms-old position');
  assert.equal(guestGame.fighters[1].animState, 'run', 'stale host snapshot does not cancel guest run animation');
  guestGame.keyUp('KeyA');

  // 4) Soft host position sync + lenient hit claim across 350ms drift
  // Place host's p1 and p2 slightly apart on host (so host melee alone wouldn't connect yet), but within range on guest
  hostGame.fighters[0].x = 460; hostGame.fighters[1].x = 585;
  guestGame.fighters[0].x = 460; guestGame.fighters[1].x = 510;
  hostGame.fighters[1].facing = -1; guestGame.fighters[1].facing = -1;
  const hpBefore = hostGame.fighters[0].hp;

  guestGame.keyDown('KeyJ');
  guestGame.keyUp('KeyJ');
  for (let f = 0; f < 18; f++) {
    for (let i = 0; i < TICK_STEPS; i++) guestGame.stepGuestLocal(STEP);
  }
  assert.ok(lastClaim !== null, 'guest local melee hit triggers onClaimHit');
  assert.equal(guestGame.fighters[0].hp, hpBefore, 'guest local hit does not mutate host fighter[0].hp locally (avoids false resurrection)');
  assert.equal(guestGame.fighters[0].stun, 0, 'guest local hit does not put fighter[0] into fake local stun');
  assert.ok(guestGame.effects.some(e => e.local), 'guest local hit spawns immediate local hit sparks');

  // Host receives guest's attack + position + hit claim and honors it once (no double damage)
  syncHostGuestPos(hostGame, Math.round(guestGame.fighters[1].x));
  assert.ok(hostGame.fighters[1].x < 585, 'syncHostGuestPos pulls host p2 smoothly toward guest x');
  const [slot, gx, hx] = lastClaim!;
  assert.ok(applyClaimHit(hostGame, slot, gx, hx), 'applyClaimHit returns true for valid hit claim');
  const hpAfterOneClaim = hostGame.fighters[0].hp;
  assert.ok(hpAfterOneClaim < hpBefore, 'host honors guest lenient hit claim within drift tolerance');
  // Even if the claim is resent in the next packet, the same attack swing cannot deal double damage
  assert.equal(applyClaimHit(hostGame, slot, gx, hx), false, 'lenient hit claim is idempotent per attack swing (no double damage)');
  assert.equal(hostGame.fighters[0].hp, hpAfterOneClaim, 'hp unchanged on duplicate hit claim');

  // Snapshot echo arrives: onClaimHit does not fire again, hp does not drop again
  let echoClaimCount = 0;
  guestGame.onClaimHit = () => { echoClaimCount++; };
  sendSnap();
  for (let f = 0; f < 5; f++) {
    for (let i = 0; i < TICK_STEPS; i++) guestGame.stepGuestLocal(STEP);
  }
  assert.equal(echoClaimCount, 0, 'snapshot echo does not re-trigger onClaimHit on guest');
  assert.equal(hostGame.fighters[0].hp, hpAfterOneClaim, 'host hp only dropped once');

  // 5) When host hits guest (authoritative stun + knockback), guest accepts host state and blends via 8-tick softOffset
  hostGame.fighters[1].stun = 0.35;
  hostGame.fighters[1].x = 640;
  guestGame.fighters[1].x = 560;
  const predBeforeHit = snapshotGuestPred(guestGame.fighters[1]);
  sendSnap();
  reconcileGuestPred(guestGame, predBeforeHit, true, softOffset);
  assert.equal(guestGame.fighters[1].x, 640, 'authoritative stun overrides guest simulation x');
  assert.equal(Math.round(softOffset.dx), -80, 'softOffset absorbs the -80px jump so rendered x starts at 560 without a 1-frame snap');
  let prevVisualX = guestGame.fighters[1].x + softOffset.dx;
  for (let tick = 0; tick < 8; tick++) {
    stepSoftOffset(softOffset, TICK_MS / 1000);
    const curVisualX = guestGame.fighters[1].x + softOffset.dx;
    assert.ok(Math.abs(curVisualX - prevVisualX) <= 25, 'per-tick visual correction stays smooth (<= 25px/tick)');
    prevVisualX = curVisualX;
  }
  assert.ok(Math.abs(softOffset.dx) < 5, 'after 8 ticks (~133ms), softOffset has decayed >94% toward authoritative x');
}

// Snapshot fix assertions: jump landing ease, dead reckoning, monotonic clocks, audio & effect deduplication, and leak prevention
{
  // 1) 落地不再卡跳: 快照 A (下落) -> 8ms 快照 B (落地) -> 8ms 快照 C (相同) -> 20 帧 guestFrame
  {
    const hG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(123), controllers: [0, 1], netRole: 'host' });
    const gG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(123), controllers: [null, 0], netRole: 'guest' });
    hG.phase = 'fight'; gG.phase = 'fight';
    resetNetForTest(gG);

    const b = new IdBook();
    let sentSnap: WireState | null = null;
    let wire: WireState | null = null;
    const makeSnap = () => {
      const s = captureState(hG, b);
      const { changes, gone } = diffState(sentSnap, s);
      sentSnap = s;
      wire = patchState(wire, changes, gone);
      return wire;
    };

    hG.fighters[0].y = FLOOR - 40;
    hG.fighters[0].vy = 400;
    let snapA = makeSnap();
    let now = 1000;
    queueGuestState(1, snapA, now);
    guestFrame(gG, now);

    now += 8;
    hG.fighters[0].y = FLOOR;
    hG.fighters[0].vy = 0;
    hG.fighters[0].landing = 0;
    let snapB = makeSnap();
    queueGuestState(2, snapB, now);
    guestFrame(gG, now);

    now += 8;
    let snapC = makeSnap();
    queueGuestState(3, snapC, now);
    guestFrame(gG, now);

    for (let i = 0; i < 20; i++) {
      now += 16;
      guestFrame(gG, now);
    }
    const f0 = gG.fighters[0];
    assert.ok(Math.abs(f0.y - FLOOR) < 0.5, 'visual y smoothly reaches FLOOR (got ' + f0.y + ')');
    assert.ok(stateFor(f0) !== 'jump', 'f0 animation state is no longer jump');
  }

  // 2) 断包也落地: 只给快照 A，跑 0.5s，断言同上
  {
    const hG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(124), controllers: [0, 1], netRole: 'host' });
    const gG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(124), controllers: [null, 0], netRole: 'guest' });
    hG.phase = 'fight'; gG.phase = 'fight';
    resetNetForTest(gG);

    const b = new IdBook();
    let sentSnap: WireState | null = null;
    let wire: WireState | null = null;
    const makeSnap = () => {
      const s = captureState(hG, b);
      const { changes, gone } = diffState(sentSnap, s);
      sentSnap = s;
      wire = patchState(wire, changes, gone);
      return wire;
    };

    hG.fighters[0].y = FLOOR - 40;
    hG.fighters[0].vy = 400;
    let snapA = makeSnap();
    let now = 2000;
    queueGuestState(1, snapA, now);
    guestFrame(gG, now);

    for (let i = 0; i < 31; i++) {
      now += 16;
      guestFrame(gG, now);
    }
    const f0 = gG.fighters[0];
    assert.ok(Math.abs(f0.y - FLOOR) < 0.5, 'even with packet loss f0 lands at FLOOR (got ' + f0.y + ')');
    assert.ok(stateFor(f0) !== 'jump', 'f0 animation state is no longer jump on packet loss');
  }

  // 3) 停步不残留: x 先递增两包，再连续两包不变，200ms 后画面 x 与权威值相差小于 0.5
  {
    const hG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(125), controllers: [0, 1], netRole: 'host' });
    const gG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(125), controllers: [null, 0], netRole: 'guest' });
    hG.phase = 'fight'; gG.phase = 'fight';
    resetNetForTest(gG);

    const b = new IdBook();
    let sentSnap: WireState | null = null;
    let wire: WireState | null = null;
    const makeSnap = () => {
      const s = captureState(hG, b);
      const { changes, gone } = diffState(sentSnap, s);
      sentSnap = s;
      wire = patchState(wire, changes, gone);
      return wire;
    };

    let now = 3000;
    hG.fighters[0].x = 100;
    queueGuestState(1, makeSnap(), now);
    guestFrame(gG, now);

    now += 33;
    hG.fighters[0].x = 110;
    queueGuestState(2, makeSnap(), now);
    guestFrame(gG, now);

    now += 33;
    hG.fighters[0].x = 120;
    queueGuestState(3, makeSnap(), now);
    guestFrame(gG, now);

    // Two packets with x unchanged at 120
    now += 33;
    hG.fighters[0].x = 120;
    queueGuestState(4, makeSnap(), now);
    guestFrame(gG, now);

    now += 33;
    hG.fighters[0].x = 120;
    queueGuestState(5, makeSnap(), now);
    guestFrame(gG, now);

    // Run 200ms
    for (let i = 0; i < 13; i++) {
      now += 16;
      guestFrame(gG, now);
    }
    const f0 = gG.fighters[0];
    assert.ok(Math.abs(f0.x - 120) < 0.5, 'stopped opponent leaves no residual offset (got ' + f0.x + ', target 120)');
  }

  // 4) 攻击时钟推进: f0 的 attack.t = 0.05，两帧没有包 -> t 严格增加；再来一包同 serial、t = 0.06 的旧值 -> t 不回退
  {
    const hG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(126), controllers: [0, 1], netRole: 'host' });
    const gG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(126), controllers: [null, 0], netRole: 'guest' });
    hG.phase = 'fight'; gG.phase = 'fight';
    resetNetForTest(gG);

    const b = new IdBook();
    let sentSnap: WireState | null = null;
    let wire: WireState | null = null;
    const makeSnap = () => {
      const s = captureState(hG, b);
      const { changes, gone } = diffState(sentSnap, s);
      sentSnap = s;
      wire = patchState(wire, changes, gone);
      return wire;
    };

    hG.attack(hG.fighters[0], 0);
    assert.ok(hG.fighters[0].attack !== null, 'host starts an attack');
    hG.fighters[0].attack!.t = 0.05;
    const serial = hG.fighters[0].attack!.serial;

    let now = 4000;
    queueGuestState(1, makeSnap(), now);
    guestFrame(gG, now);

    now += 16;
    guestFrame(gG, now);
    const t1 = gG.fighters[0].attack?.t ?? 0;
    assert.ok(t1 > 0.05, 'attack clock advances on guestFrame without packet (t1 = ' + t1 + ')');

    now += 16;
    guestFrame(gG, now);
    const t2 = gG.fighters[0].attack?.t ?? 0;
    assert.ok(t2 > t1, 'attack clock advances monotonically (t2 = ' + t2 + ')');

    hG.fighters[0].attack!.t = 0.06;
    hG.fighters[0].attack!.serial = serial;
    now += 16;
    queueGuestState(2, makeSnap(), now);
    guestFrame(gG, now);
    const t3 = gG.fighters[0].attack?.t ?? 0;
    assert.ok(t3 >= t2, 'attack clock does not roll back on stale host packet (t3 = ' + t3 + ', was ' + t2 + ')');
  }

  // 5) 音效一次: EchoBook 记一次 light 后，第一次 take 为 true，第二次为 false；再通过 queueGuestState 加事件跑集成
  {
    const book = new EchoBook();
    const t = 1000;
    book.note('light', t);
    assert.equal(book.take('light', t + 50, 400), true, 'first take of noted sfx returns true');
    assert.equal(book.take('light', t + 60, 400), false, 'second take of noted sfx returns false');
    book.note('light@1', t);
    assert.equal(book.take('light@0', t + 20, 400), false, 'same kind from the other fighter is not swallowed');

    const sfxPlayed: string[] = [];
    const mockSfx = { play: (k: string) => { sfxPlayed.push(k); } };
    const hG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: mockSfx as any, random: rng(127), controllers: [0, 1], netRole: 'host' });
    const gG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: netAudio(mockSfx as any), random: rng(127), controllers: [null, 0], netRole: 'guest' });
    hG.phase = 'fight'; gG.phase = 'fight';
    resetNetForTest(gG);

    // Initial sync
    const b = new IdBook();
    const snap1 = captureState(hG, b);
    const { changes: c1, gone: g1 } = diffState(null, snap1);
    const wire1 = patchState(null, c1, g1);
    queueGuestState(1, wire1, 1000);
    guestFrame(gG, 1000);

    // Guest presses KeyJ: plays light sound once and records in sfxBook
    gG.keyDown('KeyJ');
    gG.keyUp('KeyJ');
    guestFrame(gG, 1016);
    const lightPlaysLocal = sfxPlayed.filter(s => s === 'light').length;
    assert.equal(lightPlaysLocal, 1, 'guest plays light sound locally once');

    // Host sends snapshot with echo event ['a', 'light']
    const snap2 = captureState(hG, b);
    const { changes: c2, gone: g2 } = diffState(snap1, snap2);
    const wire2 = patchState(wire1, c2, g2);
    queueGuestState(2, wire2, 1050, [[1, 'a', 'light', 1]]);
    guestFrame(gG, 1050);

    const lightPlaysTotal = sfxPlayed.filter(s => s === 'light').length;
    assert.equal(lightPlaysTotal, 1, 'echo is deduplicated by EchoBook (total light plays is 1)');
  }

  // 6 & 7) 挥砍特效一份与特效无泄漏: 客人本地 J 后，房主做同一招再 sendSnap，同 type、fighter=1 的特效只有 1 个；再跑 1s netVisuals 清零
  {
    const hG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(128), controllers: [0, 1], netRole: 'host' });
    const gG = new FightGame([PLAYABLE[0], PLAYABLE[4]], { mode: 'cpu', difficulty: 1, stage: STAGES[0], audio: silent, random: rng(128), controllers: [null, 0], netRole: 'guest' });
    hG.phase = 'fight'; gG.phase = 'fight';
    resetNetForTest(gG);

    const b = new IdBook();
    let sentSnap: WireState | null = null;
    let wire: WireState | null = null;
    const makeSnap = () => {
      const s = captureState(hG, b);
      const { changes, gone } = diffState(sentSnap, s);
      sentSnap = s;
      wire = patchState(wire, changes, gone);
      return wire;
    };

    queueGuestState(1, makeSnap(), 1000);
    guestFrame(gG, 1000);

    // Guest triggers attack locally
    gG.keyDown('KeyJ');
    gG.keyUp('KeyJ');
    let now = 1000;
    for (let f = 0; f < 12; f++) {
      now += 16;
      guestFrame(gG, now);
    }
    const slashEffectsBefore = gG.effects.filter(e => e.local);
    assert.ok(slashEffectsBefore.length >= 1, 'guest has local attack effect');
    const slashType = slashEffectsBefore[0].type;

    // Host executes same attack
    hG.attack(hG.fighters[1], 0);
    for (let f = 0; f < 12; f++) {
      for (let i = 0; i < TICK_STEPS; i++) hG.step(STEP);
    }
    const hostSnap = makeSnap();
    now += 16;
    queueGuestState(2, hostSnap, now);
    guestFrame(gG, now);

    const slashEffectsAfter = gG.effects.filter(e => e.type === slashType);
    assert.equal(slashEffectsAfter.length, 1, 'duplicate host slash effect is matched and pruned, leaving only 1 effect');

    // 7) Advance netVisuals by 1s: all local effects must expire and not leak
    for (let i = 0; i < 60; i++) {
      gG.netVisuals(1 / 60);
    }
    const remainingLocal = gG.effects.filter(e => e.local);
    assert.equal(remainingLocal.length, 0, 'local effects expire and do not leak in g.effects (remaining: ' + remainingLocal.length + ')');
  }
}

// Online codename & 10s ready phase invariants
{
  assert.equal(READY_SECONDS, 10, 'online ready phase lasts 10 seconds');
  assert.ok(CODENAME_ADJS.length >= 16, 'codename adjective pool has moe personality/mood words');
  assert.equal(CODENAME_CHARS.length, PLAYABLE.length, 'codename character pool matches playable roster');
  // Malformed numbers (non-4-digit strings)
  for (const malformed of ['', '123', '12345', 'abcd', '12a4', '-123']) {
    assert.equal(isBlockedCodeNum(malformed), true, `malformed number ${malformed} is rejected`);
  }
  // Repeated digits (0000..9999)
  for (let d = 0; d <= 9; d++) {
    const rep = String(d).repeat(4);
    assert.equal(isBlockedCodeNum(rep), true, `repeated digit ${rep} is rejected`);
  }
  // Salted hash filter verification across all 10,000 candidate numbers
  assert.ok(BLOCKED_CODE_HASHES.size >= 155, 'blocked hash table covers sensitive numbers');
  let hashHits = 0;
  for (let i = 0; i < 10000; i++) {
    const num = String(i).padStart(4, '0');
    if (BLOCKED_CODE_HASHES.has(hashCodeNum(num))) {
      assert.equal(isBlockedCodeNum(num), true, `hash-matched number ${num} is rejected`);
      hashHits++;
    }
  }
  assert.equal(hashHits, 155, 'all 155 hashed 4-digit numbers trigger rejection');
  assert.equal(isBlockedCodeNum('0923'), false, 'normal number 0923 is allowed');
  assert.equal(isBlockedCodeNum('2024'), false, 'normal year 2024 is allowed');
  const r = rng(42);
  for (let i = 0; i < 200; i++) {
    const num = rollCodeNum(r);
    assert.ok(/^\d{4}$/.test(num) && !isBlockedCodeNum(num), 'rollCodeNum never emits a blocked or malformed number');
  }
  const sample = formatCodename({ adj: '胆小的', charName: '高松灯', num: '0923' });
  assert.equal(sample, '胆小的' + '高松灯#0923', 'formatCodename concatenates adj + charName + #num');
  assert.equal(validCodenameText(sample), sample, 'validCodenameText accepts registered adj + playable char + safe 4-digit num');
  assert.equal(validCodenameText('胆小的高松灯#0000'), '', 'validCodenameText rejects blocked 4-digit numbers');
  assert.equal(validCodenameText('自定义的随便写#0923'), '', 'validCodenameText rejects arbitrary free-text names');
}

// natsume: the wolf cannot be killed by a hit but can by its own relapse, the sandwich's return comes
// from behind, and the excuse pays back half of the last two seconds
{
  const na = at('natsume');
  const data = ROSTER[na];
  assert.deepEqual(data.bands, ['millsage'], 'natsume stands with millsage');
  assert.equal(data.skills[5].cost, 200, 'the wolf costs 200');
  // undying clamps hits at 1 hp; the relapse at the end is not a hit, so it still kills
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.energy = 200;
    p2.x = p1.x + 120;
    g.keyDown('KeyL'); run(g, 1.1);
    assert.ok(p2.x - p1.x > 200, 'the howl rings shove a close foe away');
    assert.ok(p1.king && p1.mods.some(m => m.kind === 'undying' && m.left > 0), 'the wolf form is up and undying');
    p1.hp = 20;
    p1.invuln = 0;
    hit(g, p2, p1, { ...ROSTER[at('boulder')].skills[0], damage: 500 }, { hit: new Set() });
    assert.equal(p1.hp, 1, 'a lethal hit stops at 1 hp while undying holds');
    p1.hp = 400;
    run(g, 9);
    assert.equal(p1.hp, 100, 'the relapse takes 300 once undying ends');
    p1.hp = 200;
    p1.mods.length = 0;
    hit(g, p2, p1, { ...ROSTER[at('boulder')].skills[0], damage: 500 }, { hit: new Set() });
    assert.equal(p1.hp, 0, 'without undying the same hit kills');
  }
  {
    const g = newGame(na, at('boulder')); const [p1] = g.fighters; dummy(g);
    p1.energy = 200;
    g.keyDown('KeyL'); run(g, 1.1);
    p1.hp = 150;
    const relapse = p1.mods.find(m => m.kind === 'relapse')!;
    relapse.left = .05;
    run(g, .2);
    assert.equal(p1.hp <= 0, true, 'the relapse can kill the wolf');
  }
  // U: the return pass lands from behind; a defender holding block toward her blocks the first pass only
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 440; p1.facing = 1; p2.facing = -1;
    g.keyDown('ArrowDown');
    const guard0 = p2.guard;
    g.keyDown('KeyU');
    let max = 0;
    for (let i = 0; i < Math.round(.9 / STEP); i++) { g.step(STEP); max = Math.max(max, p2.stun); }
    assert.ok((p1.facing as number) === -1, 'she turned round at the far side');
    assert.ok(p2.guard < guard0, 'the first pass hit the guard');
    assert.ok(p2.hp < p2.data.hp - 20 && p2.knocked > 0, 'the return pass got through the block and knocked down');
  }
  // O: she leaves the frame untouchable, comes down on the mark, and the disc knocks down whoever stayed
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 520; p1.facing = 1;
    g.keyDown('KeyO'); run(g, .35);
    assert.ok(p1.y < 0 && p1.invuln > 0, 'she is above the frame and untouchable');
    run(g, .3);
    assert.equal(p1.y, FLOOR, 'she is back on the floor');
    assert.ok(Math.abs(p1.x - 520) < 30, 'she landed on the mark');
    assert.ok(p2.hp < p2.data.hp && p2.knocked > 0, 'the stomp knocked the one who stayed down');
  }
  // I: half of what the last two seconds cost comes back
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.invuln = 0;
    hit(g, p2, p1, { ...ROSTER[at('boulder')].skills[0], damage: 100 }, { hit: new Set() });
    const lost = p1.data.hp - p1.hp;
    assert.ok(lost > 90, 'the hit is on the books');
    p1.stun = 0; p1.knocked = 0;
    g.keyDown('KeyI'); run(g, .5);
    assert.ok(Math.abs((p1.data.hp - p1.hp) - lost / 2) < 1.5, 'half of the ledger came back');
    assert.equal(p1.dmgLog.length, 0, 'the refund clears the ledger');
  }
}

// houka: 天才♡ reads health share or an official genius on the other side; U lays 飘了 and pays a
// genius meter; I eats a melee swing, reappears behind and roots, but a shot lands; O roots, lays
// 主角 and fades her; L hides her in the coffin while seven small rings chip the foe and a big one bursts.
{
  const ho = at('houka');
  const data = ROSTER[ho];
  assert.deepEqual(data.bands, ['millsage'], 'houka stands with millsage');
  assert.ok(ROSTER[at('hina')].genius && ROSTER[at('hotaru')].genius, 'hina and hotaru are the official geniuses');
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    assert.equal(outshines(g, p1, p2), false, 'even health is not a genius');
    p1.hp = 500;
    assert.equal(outshines(g, p1, p2), true, 'a foe with more health left shines brighter');
    const h = newGame(ho, at('hina')); dummy(h);
    assert.equal(outshines(h, h.fighters[0], h.fighters[1]), true, 'an official genius always shines');
  }
  // U: the dash lays 飘了 — a quarter off the defender's damage — and a genius pays 20 more meter
  {
    const gain = (hurt: boolean) => {
      const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
      p1.x = 300; p2.x = 420; p1.facing = 1; p1.energy = 0;
      if (hurt) p1.hp = 400;
      g.keyDown('KeyU'); run(g, .5);
      assert.ok(p2.hp < p2.data.hp, 'the praise landed');
      assert.ok(p2.mods.some(m => m.kind === 'dmgDealt' && m.left > 0 && Math.abs((m.v ?? 0) + .25) < 1e-9), '飘了 cuts a quarter of their damage');
      return p1.energy;
    };
    assert.ok(gain(true) - gain(false) >= 19, 'praising a genius pays extra meter');
  }
  // I: a melee swing into the act deals nothing; she comes up behind and roots them
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 380; p1.facing = 1; p2.facing = -1;
    g.keyDown('KeyI'); g.step(STEP); g.keyUp('KeyI'); run(g, .2);
    const hp = p1.hp;
    g.attack(p2, 0);
    run(g, .3);
    assert.equal(p1.hp, hp, 'the swing into the act deals nothing');
    assert.ok(p1.x > p2.x, 'she came up behind the one who swung');
    assert.ok(p2.root > 0 && p2.hp < p2.data.hp, 'the counter roots and hurts');
    assert.ok(p2.root > 1 && p2.root <= 1.5, 'an even fight roots for 1.5 seconds');
  }
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 380; p1.facing = 1; p2.facing = -1; p1.hp = 400;
    g.keyDown('KeyI'); g.step(STEP); g.keyUp('KeyI'); run(g, .2);
    g.attack(p2, 0);
    run(g, .3);
    assert.ok(p2.root > 1.6, 'a genius stays pinned longer');
  }
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    g.keyDown('KeyI'); g.step(STEP); g.keyUp('KeyI'); run(g, .2);
    p1.invuln = 0;
    const hp = p1.hp;
    hit(g, p2, p1, { ...ROSTER[at('boulder')].skills[0], type: 'projectile', damage: 40 }, { hit: new Set() });
    assert.ok(p1.hp < hp && p1.attack === null, 'a shot catches her for real and drops the act');
  }
  // O: the beam roots a grounded foe, lays 主角 (+20% taken), and fades her
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 430; p1.facing = 1;
    g.keyDown('KeyO'); run(g, .4);
    assert.ok(p2.root > 0 && p2.hp < p2.data.hp, 'the spotlight roots the one it lands on');
    assert.ok(p2.mods.some(m => m.kind === 'incoming' && m.mark === 'spotlight' && m.v === 1.2), 'the protagonist takes a fifth more');
    assert.ok(p1.mods.some(m => m.kind === 'veil' && m.left > 3), 'she fades out of the light');
  }
  // L: in the coffin she is untouchable and unseen; seven small rings chip the foe without a stagger,
  // then the big ring's burst knocks down whoever is still inside; running clear or a timed dodge gets out
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 520; p1.facing = 1; p1.energy = 100;
    g.keyDown('KeyL'); g.step(STEP); g.keyUp('KeyL'); run(g, .6);
    assert.ok(violetHidden(p1) && p1.invuln > 0, 'she is inside the coffin, untouchable');
    let staggered = false;
    for (let i = 0; i < Math.round(2 / STEP); i++) { g.step(STEP); if (p2.stun > 0 || p2.knocked > 0) staggered = true; }
    const chip = p2.data.hp - p2.hp;
    assert.ok(chip > 55 && chip < 80, 'seven small rings chip about 70: ' + chip);
    assert.ok(!staggered, 'the small rings never stagger');
    run(g, .5);
    const lost = p2.data.hp - p2.hp - chip;
    assert.ok(lost > 150 && lost < 200 && p2.knocked > 0, 'the big ring hits once and knocks down: ' + lost);
    run(g, .6);
    assert.ok(!violetHidden(p1), 'she steps out again');
  }
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 450; p1.facing = 1; p1.energy = 100;
    g.keyDown('KeyL'); g.step(STEP); g.keyUp('KeyL'); run(g, 2.1);
    p2.x = 450 + 290;
    run(g, 1.6);
    assert.ok(p2.data.hp - p2.hp < 80 && p2.knocked <= 0, 'clear of the big ring, only the chip landed');
  }
  {
    const g = newGame(ho, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 520; p1.facing = 1; p1.energy = 100;
    g.keyDown('KeyL'); g.step(STEP); g.keyUp('KeyL'); run(g, 2.8);
    p2.invuln = .2;
    run(g, 1);
    assert.ok(p2.data.hp - p2.hp < 80 && p2.knocked <= 0, 'a dodge timed on the big burst slips through it');
  }
}

// nagi: 打水漂 rolls 3～5 hops, ends on contact and strikes by the die face — odd cuts the cooldown
// to a second, even doubles the damage, five also knocks down. I dunks a body in
// the air and lifts one on the floor. O breaks out, shoulders, and puts four seconds of damage on the
// bill. L is seven strums whose gaps shrink, ending in a knockdown.
{
  const na = at('nagi');
  const data = ROSTER[na];
  assert.deepEqual(data.bands, ['millsage'], 'nagi stands with millsage');
  assert.equal(data.title, '吉他 / 摆烂王', 'nagi wears the slacker title');
  const roll = (g: FightGame, v: number) => { (g as unknown as { random: () => number }).random = () => v; };
  // U: the run ends at the first landing near a grounded foe (or when the roll runs out), and the
  // face decides the strike. She starts at 60; each hop carries her about 122, so the foe's distance
  // picks the face. Roll 0.9 = five hops available.
  const skim = (foeX: number, v = .9) => {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 60; p2.x = foeX; p1.facing = 1; p2.facing = -1;
    roll(g, v);
    assert.ok(g.attack(p1, 2), 'the skim comes out');
    let stood = 0, down = false;
    for (let i = 0; i < Math.round(1.3 / STEP); i++) { g.step(STEP); if (p2.stun > .35 && p2.knocked <= 0) stood++; if (p2.knocked > 0) down = true; }
    return { g, p1, p2, lost: p2.data.hp - p2.hp, stood, down, cd: p1.cooldowns[2] };
  };
  {
    const one = skim(200);
    assert.ok(one.lost > 25 && one.lost < 35 && !one.down, 'one: the base strike, lost ' + one.lost);
    assert.ok(one.cd <= 1, 'odd: the cooldown drops to a second, left ' + one.cd);
    assert.equal(one.g.totalHits[one.p1.id], 1, 'one strike per run');
    const two = skim(330);
    assert.ok(two.lost > 55 && two.lost < 65, 'even: double damage, lost ' + two.lost);
    assert.ok(two.stood > 0 && !two.down && two.cd > 4, 'even: they stay standing and the cooldown is the full one');
    const three = skim(450);
    assert.ok(three.lost > 25 && three.lost < 35 && three.cd <= 1, 'three is odd too');
    const four = skim(580);
    assert.ok(four.lost > 55 && four.lost < 65 && four.cd > 4, 'four doubles');
    const five = skim(700);
    assert.ok(five.down && five.lost > 25 && five.cd <= 1, 'five knocks down and is odd: lost ' + five.lost);
  }
  {
    // A roll of three that never reaches them: the strike whiffs and the cooldown stays.
    const miss = skim(900, 0);
    assert.ok(miss.lost === 0 && miss.cd > 4 && miss.p1.attack === null, 'a whiffed run leaves the cooldown alone');
  }
  {
    // A blocked odd strike still counts as touching them.
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 60; p2.x = 200; p1.facing = 1; p2.facing = -1;
    roll(g, .9);
    g.attack(p1, 2);
    for (let i = 0; i < Math.round(1.3 / STEP); i++) { p2.blocking = true; g.step(STEP); }
    assert.ok(p2.data.hp - p2.hp < 10 && p1.cooldowns[2] <= 1, 'blocked odd: chip only, and the quick cooldown');
  }
  // I: in the air they are dunked into the floor; on the floor they go up
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 380; p1.facing = 1;
    p2.y = FLOOR - 120; p2.vy = -200;
    g.attack(p1, 3);
    let slammed = false;
    for (let i = 0; i < Math.round(.4 / STEP); i++) { g.step(STEP); if (p2.knocked > 0 && p2.vy > 0) slammed = true; }
    assert.ok(slammed && p2.hp < p2.data.hp, 'a body in the air is dunked');
  }
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 380; p1.facing = 1;
    g.attack(p1, 3);
    let lifted = false;
    for (let i = 0; i < Math.round(.5 / STEP); i++) { g.step(STEP); if (p2.y < FLOOR - 40 && p2.knocked <= 0) lifted = true; }
    assert.ok(lifted && p2.hp < p2.data.hp, 'a body on the floor goes up, not down');
  }
  // O: the shoulder lands, then what she takes goes on the bill and is paid at the end
  {
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 400; p1.facing = 1;
    g.attack(p1, 4);
    run(g, .5);
    assert.ok(p2.hp < p2.data.hp, 'the shoulder lands');
    assert.ok(p1.mods.some(m => m.kind === 'debt' && m.left > 3), 'the numbing runs four seconds');
    p1.invuln = 0;
    const hp = p1.hp;
    hit(g, p2, p1, { ...ROSTER[at('boulder')].skills[1], damage: 60 }, { hit: new Set() });
    assert.equal(p1.hp, hp, 'a hit under the numbing does not take health yet');
    assert.ok(p1.stun <= 0 || p1.stun < .1, 'nor does it flinch');
    run(g, 4);
    assert.ok(p1.hp < hp, 'the bill comes due');
  }
  // L: seven strums, gaps shrinking and never under 0.09s, ending in a knockdown
  {
    assert.equal(data.skills[5].count, PRACTICE_HITS, 'the count shown is the strum count');
    for (let i = 1; i < PRACTICE_HITS - 1; i++) assert.ok(practiceGap(i) < practiceGap(i - 1), 'each gap is shorter than the last');
    assert.ok(practiceGap(PRACTICE_HITS - 2) >= .09 - 1e-9 && PRACTICE_GAP1 >= .09, 'no gap under the blockstun');
    assert.ok(data.skills[5].start + practiceBeat(PRACTICE_HITS - 1) < data.skills[5].duration - .2, 'the last strum lands inside the move');
    for (let i = 0, sum = 0; i < PRACTICE_HITS; sum += practiceGap(i++)) {
      assert.ok(Math.abs(practiceBeat(i) - sum) < 1e-9, 'the beat table is the summed gaps at strum ' + i);
      assert.equal(practiceStrums(practiceBeat(i)), i + 1, 'a strum counts from its own beat');
    }
    assert.equal(practiceStrums(-.01), 0, 'nothing struck before the start');
    assert.equal(practiceRow(0, .45), 0, 'wind-up first');
    assert.equal(practiceRow(.46, .45), 1, 'a strum shows the downstroke');
    const g = newGame(na, at('boulder')); const [p1, p2] = g.fighters; dummy(g);
    p1.x = 300; p2.x = 400; p1.facing = 1; p1.energy = 100;
    g.attack(p1, 5);
    run(g, 2.2);
    const lost = p2.data.hp - p2.hp;
    assert.ok(g.totalHits[p1.id] >= PRACTICE_HITS, 'all seven strums land: ' + g.totalHits[p1.id]);
    assert.ok(lost > 170 && lost < 260, 'the strums add up to a super: ' + lost);
    assert.ok(p2.knocked > 0 || p2.downTime > 0, 'the last strum knocks down');
  }
}

console.log('selfcheck ok');
