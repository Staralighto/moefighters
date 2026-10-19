/* Two-browser online run against a local dev server and mailbox. Not part of `npm run check`.
   npx vite --port 5173 with VITE_MAILBOX_URL=http://127.0.0.1:9000/mailbox,
   node cloudbase/functions/mailbox/local.js, then: node scripts/online-e2e.mjs
   Needs `npm i playwright` and `npx playwright install chromium`. */
import { chromium } from 'playwright';

const URL = process.env.E2E_URL || 'http://127.0.0.1:5173/';
/** 'lock' (default build) or 'snap' (a build with VITE_NET_MODE=snapshot). */
const MODE = process.env.E2E_MODE || 'lock';
console.log('mode', MODE, URL);
const fails = [];
const ok = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) fails.push(what); };

const browser = await chromium.launch();
async function open(name, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(name, 'pageerror', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => !!document.querySelector('[data-place="net"]'));
  await page.waitForTimeout(800);
  return page;
}

async function toNet(page) {
  await page.click('[data-place="net"]');
  await page.waitForFunction(() => document.getElementById('net-status')?.textContent === '可以开房', null, { timeout: 15000 });
}

async function connect(host, guest) {
  await host.click('#net-host');
  await host.waitForFunction(() => /· [A-Z0-9]{4}/.test(document.getElementById('net-steps')?.textContent || ''), null, { timeout: 30000 });
  const code = (await host.textContent('#net-steps')).match(/· ([A-Z0-9]{4})/)[1];
  await guest.click('#net-join-btn');
  const cells = await guest.$$('.net-cells input');
  for (let i = 0; i < 4; i++) await cells[i].fill(code[i]);
  await guest.click('#net-join');
  for (const p of [host, guest]) await p.waitForFunction(() => window.__mf?.game()?.phase === 'fight', null, { timeout: 30000 }).catch(async e => {
    for (const q of [host, guest]) console.log('connect state:', await q.evaluate(() => ({ phase: window.__mf?.game()?.phase, status: document.getElementById('net-status')?.textContent, steps: document.getElementById('net-steps')?.textContent, log: window.__mf?.log?.().slice(-5) })));
    throw e;
  });
  return code;
}

/** Record every host frame's 2P attack; also what the guest paints for its own fighter. */
const record = page => page.evaluate(() => {
  window.__log = [];
  const tick = () => {
    const g = window.__mf.game();
    const f = g?.fighters[1];
    if (f?.attack) window.__log.push({ index: f.attack.index, air: !!f.attack.skill.air, serial: f.attack.serial });
    window.__rec = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(window.__rec);
  tick();
});
const took = page => page.evaluate(() => { const l = window.__log; window.__log = []; return l; });
const readyP2 = host => host.evaluate(() => {
  const g = window.__mf.game();
  const f = g.fighters[1];
  f.cooldowns.fill(0); f.x = 700; f.hp = f.data.hp; g.fighters[0].x = 200; g.fighters[0].hp = g.fighters[0].data.hp;
  // Lockstep: a test edit on one side is a desync; hand the guest the edited state (uncounted).
  window.__mf.lock()?.resync('e2e', false);
});

async function expectAttack(host, guest, what, index, air, act) {
  await readyP2(host);
  await host.waitForTimeout(500);
  await readyP2(host);
  await took(host); await took(guest);
  await act();
  await host.waitForTimeout(450);
  const h = await took(host);
  const g = await took(guest);
  ok(h.some(a => a.index === index && a.air === air), `${what}: host 2P fires slot ${index}${air ? ' (air)' : ''} [${[...new Set(h.map(a => a.index + (a.air ? 'a' : '')))]}]`);
  ok(g.some(a => a.index === index), `${what}: guest paints it`);
  await host.waitForTimeout(600);
}

// ---- match 1: desktop guest on the keyboard, then round end, match end, leaving ----
{
  const host = await open('H', { viewport: { width: 1280, height: 720 } });
  const guest = await open('G', { viewport: { width: 1280, height: 720 } });
  await toNet(host); await toNet(guest);
  const code = await connect(host, guest);
  ok(true, 'room ' + code + ' created and joined, both in the fight');
  const lockOn = await Promise.all([host, guest].map(p => p.evaluate(() => !!window.__mf.lock())));
  ok(lockOn.every(v => v === (MODE === 'lock')), 'both sides run ' + MODE);
  await record(host); await record(guest);
  const tap = (k, ms = 60) => async () => { await guest.keyboard.down(k); await guest.waitForTimeout(ms); await guest.keyboard.up(k); };
  await expectAttack(host, guest, 'keyboard J', 0, false, tap('KeyJ'));
  await expectAttack(host, guest, 'keyboard K', 1, false, tap('KeyK'));
  await expectAttack(host, guest, 'keyboard U', 2, false, tap('KeyU'));
  await expectAttack(host, guest, 'keyboard quick J (5ms)', 0, false, tap('KeyJ', 5));
  await expectAttack(host, guest, 'air J', 0, true, async () => { await tap('KeyW')(); await guest.waitForTimeout(120); await tap('KeyJ')(); });
  await expectAttack(host, guest, 'air K', 1, true, async () => { await tap('KeyW')(); await guest.waitForTimeout(120); await tap('KeyK')(); });
  // movement and the host's arrows not stealing 2P
  await readyP2(host);
  const x0 = await host.evaluate(() => window.__mf.game().fighters[1].x);
  await guest.keyboard.down('KeyA'); await guest.waitForTimeout(400); await guest.keyboard.up('KeyA');
  await host.waitForTimeout(300);
  const x1 = await host.evaluate(() => window.__mf.game().fighters[1].x);
  ok(x1 < x0 - 40, `guest A walks 2P left on the host (${Math.round(x0)} → ${Math.round(x1)})`);
  await host.keyboard.down('ArrowRight'); await host.waitForTimeout(300); await host.keyboard.up('ArrowRight');
  const x2 = await host.evaluate(() => window.__mf.game().fighters[1].x);
  ok(Math.abs(x2 - x1) < 5, 'host arrow keys do not move 2P');
  // pause is a menu, the match keeps running
  await guest.keyboard.press('Escape');
  const t0 = await host.evaluate(() => window.__mf.game().age);
  await host.waitForTimeout(400);
  const t1 = await host.evaluate(() => window.__mf.game().age);
  ok(await guest.isVisible('#pause-quit') && t1 > t0 + .2, 'guest ESC opens the menu, host sim keeps running');
  await guest.keyboard.press('Escape');
  // round end: KO the host's fighter twice
  for (let r = 1; r <= 2; r++) {
    await host.waitForFunction(() => window.__mf.game().phase === 'fight', null, { timeout: 15000 });
    await host.evaluate(() => { window.__mf.game().fighters[0].hp = 0; window.__mf.lock()?.resync('e2e', false); });
    if (r === 1) {
      await guest.waitForFunction(() => window.__mf.game().wins[1] === 1, null, { timeout: 10000 }).then(() => ok(true, 'round end reaches the guest (wins 0-1)'), () => ok(false, 'round end reaches the guest'));
    }
  }
  await host.waitForSelector('#end:not([hidden])', { timeout: 15000 }).then(() => ok(true, 'host sees the match end'), () => ok(false, 'host sees the match end'));
  await guest.waitForSelector('#end:not([hidden])', { timeout: 15000 }).then(() => ok(true, 'guest sees the match end'), () => ok(false, 'guest sees the match end'));
  const titles = [await host.textContent('#end-title'), await guest.textContent('#end-title')];
  ok(titles[0] === '你输了' && titles[1] === '你赢了', 'result titles from each seat: ' + titles.join(' | '));
  ok(/联机 · .+ · (\d+ms|连接不稳)/.test(await guest.textContent('#battle-mode')) || /\d+ms/.test(await host.textContent('#battle-mode')), 'the HUD shows the link: ' + await host.textContent('#battle-mode'));
  // rematch on the same link
  await guest.click('#rematch');
  await guest.waitForTimeout(300);
  ok((await host.textContent('#rematch')).includes('对手想再来一局'), 'host sees the guest asked for a rematch');
  await host.click('#rematch');
  const fresh = p => p.waitForFunction(() => window.__mf.game()?.phase === 'fight' && window.__mf.game().wins[1] === 0, null, { timeout: 20000 }).then(() => true, () => false);
  const started = [await fresh(host), await fresh(guest)];
  if (!started.every(Boolean)) console.log('rematch state', JSON.stringify(await Promise.all([host, guest].map(p => p.evaluate(() => { const g = window.__mf.game(); return { role: g?.netRole, phase: g?.phase, wins: g?.wins, end: !document.getElementById('end').hidden, title: document.getElementById('end-title').textContent, log: window.__mf.log().slice(-8), btn: document.getElementById('rematch').textContent }; })))));
  ok(started.every(Boolean), 'rematch starts on both sides');
  await record(host); await record(guest);
  await expectAttack(host, guest, 'rematch keyboard J', 0, false, tap('KeyJ'));
  // hit sounds and sparks reach the guest
  await guest.evaluate(() => { const g = window.__mf.game(); const inner = g.audio.play.bind(g.audio); window.__sounds = []; g.audio.play = k => { window.__sounds.push(k); inner(k); }; });
  await host.evaluate(() => { const g = window.__mf.game(); g.fighters[1].x = g.fighters[0].x + 60; g.fighters[1].facing = -1; g.fighters[1].cooldowns.fill(0); window.__mf.lock()?.resync('e2e', false); });
  await tap('KeyJ')();
  await guest.waitForTimeout(600);
  const sounds = await guest.evaluate(() => window.__sounds);
  ok(sounds.includes('hit') || sounds.includes('block'), 'guest hears the hit: ' + [...new Set(sounds)].join(','));
  for (let r = 1; r <= 2; r++) {
    await host.waitForFunction(() => window.__mf.game().phase === 'fight', null, { timeout: 15000 });
    await host.evaluate(() => { window.__mf.game().fighters[1].hp = 0; window.__mf.lock()?.resync('e2e', false); });
    await host.waitForTimeout(300);
  }
  await guest.waitForSelector('#end:not([hidden])', { timeout: 15000 });
  ok((await host.textContent('#end-title')) === '你赢了' && (await guest.textContent('#end-title')) === '你输了', 'rematch result titles flip');
  await guest.click('#reselect');
  await guest.waitForFunction(() => !document.body.classList.contains('in-battle'), null, { timeout: 5000 }).then(() => ok(true, 'guest leaves the end screen for select'), () => ok(false, 'guest leaves the end screen'));
  await host.click('#reselect');
  await host.waitForFunction(() => !document.body.classList.contains('in-battle'), null, { timeout: 5000 }).then(() => ok(true, 'host leaves too'), () => ok(false, 'host leaves too'));
  // rematch with the same pages: a second room from the select screen
  ok(!(await guest.isHidden('#net-panel')), 'guest is back on the online panel');
  await connect(host, guest);
  ok(true, 'second room on the same pages connects');
  // mid-match leave: the guest closes its tab
  await guest.context().close();
  await host.waitForSelector('#end:not([hidden])', { timeout: 15000 }).then(() => ok(true, 'host is told the guest left'), () => ok(false, 'host is told the guest left'));
  console.log('host end:', await host.textContent('#end-title'));
  await host.context().close();
}

// ---- match 3 (run first): 20% loss, 60–120ms one-way delay on both sides ----
{
  const host = await open('HC', { viewport: { width: 1280, height: 720 } });
  const guest = await open('GC', { viewport: { width: 1280, height: 720 } });
  await toNet(host); await toNet(guest);
  await connect(host, guest);
  for (const p of [host, guest]) await p.evaluate(() => { window.__netChaos = { drop: .2, delay: 60, jitter: 60 }; });
  await record(host); await record(guest);
  const tap = (k, ms = 60) => async () => { await guest.keyboard.down(k); await guest.waitForTimeout(ms); await guest.keyboard.up(k); };
  for (const [k, i] of [['KeyJ', 0], ['KeyK', 1], ['KeyU', 2]]) await expectAttack(host, guest, 'lossy ' + k, i, false, tap(k));
  await expectAttack(host, guest, 'lossy quick J (5ms)', 0, false, tap('KeyJ', 5));
  // Hold A for 500ms: the host must hold it about as long, whatever the jitter.
  await readyP2(host);
  await host.evaluate(() => { window.__held = []; const t = () => { const g = window.__mf.game(); window.__held.push([performance.now(), g.keys.has('ArrowLeft')]); window.__ht = requestAnimationFrame(t); }; t(); });
  await guest.keyboard.down('KeyA'); await guest.waitForTimeout(500); await guest.keyboard.up('KeyA');
  await host.waitForTimeout(800);
  const held = await host.evaluate(() => { cancelAnimationFrame(window.__ht); const on = window.__held.filter(h => h[1]); return on.length ? on[on.length - 1][0] - on[0][0] : 0; });
  ok(Math.abs(held - 500) < 70, 'a 500ms hold lasts ' + Math.round(held) + 'ms on the host under loss and jitter');
  const label = await guest.textContent('#battle-mode');
  ok(/\d+ms|连接不稳/.test(label), 'guest HUD shows the link: ' + label);
  const pos = await Promise.all([host, guest].map(p => p.evaluate(() => window.__mf.game().fighters.map(f => Math.round(f.x)))));
  ok(pos[0].every((x, i) => Math.abs(x - pos[1][i]) < 60), 'guest positions track the host under loss: ' + JSON.stringify(pos));
  await guest.evaluate(() => document.getElementById('back')?.click());
  if (await guest.isVisible('#quit-yes')) await guest.click('#quit-yes');
  await host.waitForSelector('#end:not([hidden])', { timeout: 15000 }).then(() => ok(true, 'host is told when the guest quits'), () => ok(false, 'host is told when the guest quits'));
  ok((await host.textContent('#end-title')) === '对手已离开', 'quit reads 对手已离开');
  await host.context().close(); await guest.context().close();
}

// ---- match 4 (lockstep only): forced desync resyncs, forced repeat desyncs fall back to snapshots ----
if (MODE === 'lock') {
  const host = await open('HD', { viewport: { width: 1280, height: 720 } });
  const guest = await open('GD', { viewport: { width: 1280, height: 720 } });
  await toNet(host); await toNet(guest);
  await connect(host, guest);
  await host.waitForTimeout(1000);
  await guest.evaluate(() => window.__mf.lock().poison());
  await host.waitForFunction(() => window.__mf.log().some(l => l.includes('resync #1')), null, { timeout: 8000 }).then(() => ok(true, 'host catches a poisoned guest by hash'), () => ok(false, 'host catches a poisoned guest by hash'));
  await guest.waitForFunction(() => window.__mf.log().some(l => l.includes('resynced to tick')), null, { timeout: 5000 }).then(() => ok(true, 'guest restores from the host state'), () => ok(false, 'guest restores from the host state'));
  await host.waitForTimeout(2500);
  const hp = await Promise.all([host, guest].map(p => p.evaluate(() => window.__mf.game().fighters.map(f => f.hp))));
  ok(JSON.stringify(hp[0]) === JSON.stringify(hp[1]), 'after the resync both sims agree: ' + JSON.stringify(hp));
  ok(!(await host.evaluate(() => window.__mf.log().some(l => l.includes('resync #2')))), 'one resync was enough');
  // Desync it again and again: the host gives up on lockstep and runs snapshots.
  for (let i = 0; i < 4; i++) { await guest.evaluate(() => window.__mf.lock()?.poison()); await host.waitForTimeout(2300); }
  await guest.waitForFunction(() => window.__mf.game().netRole === 'guest', null, { timeout: 8000 }).then(() => ok(true, 'repeated desyncs fall back: guest now paints host snapshots'), () => ok(false, 'repeated desyncs fall back'));
  ok(await host.evaluate(() => window.__mf.game().netRole === 'host'), 'host now runs the match alone');
  console.log('host log:', (await host.evaluate(() => window.__mf.log())).join(' | '));
  await record(host); await record(guest);
  const tap = (k, ms = 60) => async () => { await guest.keyboard.down(k); await guest.waitForTimeout(ms); await guest.keyboard.up(k); };
  await expectAttack(host, guest, 'after fallback J', 0, false, tap('KeyJ'));
  await expectAttack(host, guest, 'after fallback K', 1, false, tap('KeyK'));
  await host.context().close(); await guest.context().close();
}

// ---- match 2: phone guest on the touch pad, host quits mid-match ----
{
  const host = await open('H2', { viewport: { width: 1280, height: 720 } });
  const guest = await open('T', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  ok(await guest.evaluate(() => document.body.classList.contains('touch')), 'phone guest is in touch mode');
  await toNet(host); await toNet(guest);
  await connect(host, guest);
  await record(host); await record(guest);
  const cdp = await guest.context().newCDPSession(guest);
  const atk = async () => {
    const box = await guest.locator('[data-atk]').first().boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const press = async ms => {
    const p = await atk();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await guest.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await expectAttack(host, guest, 'touch tap (light)', 0, false, () => press(60));
  await expectAttack(host, guest, 'touch long press (heavy)', 1, false, () => press(420));
  const skill = guest.locator('[data-key="KeyU"]').first();
  if (await skill.count()) {
    await expectAttack(host, guest, 'touch U', 2, false, async () => {
      const b = await skill.boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }] });
      await guest.waitForTimeout(80);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });
  }
  // host leaves through the quit confirm
  await host.evaluate(() => document.getElementById('back')?.click());
  if (await host.isVisible('#quit-yes')) await host.click('#quit-yes');
  await guest.waitForSelector('#end:not([hidden])', { timeout: 15000 }).then(() => ok(true, 'guest is told the host left'), () => ok(false, 'guest is told the host left'));
  console.log('guest end:', await guest.textContent('#end-title'));
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nonline e2e ok');
process.exit(fails.length ? 1 : 0);
