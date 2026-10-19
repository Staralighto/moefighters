/* Side-by-side online match under a China-TURN-like ~300ms RTT.
   The kernel in this environment has no sch_netem (tc qdisc kind "netem" is unknown),
   so the delay is the dev-only hook in src/net/rtc.ts: window.__netChaos on both peers.
   delay/jitter are one-way milliseconds added before the fast datachannel send.
   Mean RTT ≈ 2*delay + jitter.

   Prereq: mailbox + vite dev server, then:
     PLAYWRIGHT_PATH=$HOME/pw/node_modules/playwright/index.mjs DISPLAY=:99 node scripts/latency-recording.mjs
   See scripts/latency-recording.sh for the full boot. */
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const chromium = pw.chromium ?? pw.default?.chromium;
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const URL = process.env.E2E_URL || 'http://127.0.0.1:5173/';
const DELAY = Number(process.env.LAT_DELAY ?? 140);
const JITTER = Number(process.env.LAT_JITTER ?? 20);
const SECONDS = Number(process.env.LAT_SECONDS ?? 48);
const SKIP_VIDEO = process.env.SKIP_VIDEO === '1';
const OUT_DIR = process.env.LAT_OUT_DIR || '/opt/cursor/artifacts';
const DISPLAY = process.env.DISPLAY || ':99';
const W = 960;
const H = 640;

const chaos = { drop: 0, delay: DELAY, jitter: JITTER };
console.log('url', URL, 'chaos', chaos, 'fightSeconds', SECONDS, 'display', DISPLAY, 'video', SKIP_VIDEO ? 'off' : 'on');

const initChaos = () => {
  window.__netChaos = { drop: 0, delay: window.__latDelay, jitter: window.__latJitter };
  window.__pcs = [];
  const Orig = window.RTCPeerConnection;
  function Wrapped(cfg) {
    const pc = new Orig(cfg);
    window.__pcs.push(pc);
    return pc;
  }
  Wrapped.prototype = Orig.prototype;
  Object.assign(Wrapped, Orig);
  window.RTCPeerConnection = Wrapped;
};

function launchOpts(x) {
  return {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-infobars',
      `--window-position=${x},0`,
      `--window-size=${W + 16},${H + 88}`,
      '--force-device-scale-factor=1',
    ],
  };
}

async function open(browser, name, videoDir) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: SKIP_VIDEO ? undefined : { dir: videoDir, size: { width: W, height: H } },
  });
  await ctx.addInitScript({ content: `window.__latDelay=${DELAY};window.__latJitter=${JITTER};` });
  await ctx.addInitScript(initChaos);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(name, 'pageerror', e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('[data-place="net"]'), null, { timeout: 30000 });
  await page.evaluate(role => {
    const style = document.createElement('style');
    style.textContent = `
      #rec-badge { position: fixed; z-index: 90; left: 10px; bottom: 10px; max-width: calc(100% - 20px);
        background: #07060ccc; color: #fff; font: 700 16px/1.35 ui-sans-serif, system-ui, sans-serif;
        padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; pointer-events: none; }
      #rec-badge.host { border: 2px solid #FDE979; }
      #rec-badge.guest { border: 2px solid #C8F181; }
      #battle-mode { font-size: 18px; font-weight: 800; color: #76e7ff; }
      body.in-battle header, body.in-battle .site-foot, body.in-battle #battle > footer,
      body.in-battle #battle-skills, body.in-battle #battle-skills-bar { display: none !important; }
      body.in-battle #battle { padding: 8px 12px 12px; }
    `;
    document.head.append(style);
    const badge = document.createElement('div');
    badge.id = 'rec-badge';
    badge.className = role;
    badge.textContent = role === 'host' ? '房主 HOST' : '客人 GUEST';
    document.body.append(badge);
  }, name);
  return { ctx, page, name };
}

async function toNet(page) {
  await page.click('[data-place="net"]');
  await page.waitForFunction(() => document.getElementById('net-status')?.textContent === '可以开房', null, { timeout: 20000 });
}

async function connect(host, guest) {
  await host.page.click('#net-host');
  await host.page.waitForFunction(() => /· [A-Z0-9]{4}/.test(document.getElementById('net-steps')?.textContent || ''), null, { timeout: 30000 });
  const code = (await host.page.textContent('#net-steps')).match(/· ([A-Z0-9]{4})/)[1];
  await guest.page.click('#net-join-btn');
  await guest.page.waitForSelector('.net-cells input', { timeout: 10000 });
  const cells = await guest.page.$$('.net-cells input');
  for (let i = 0; i < 4; i++) await cells[i].fill(code[i]);
  await guest.page.click('#net-join');
  const poke = async page => {
    for (let i = 0; i < 80; i++) {
      const phase = await page.evaluate(() => window.__mf?.game()?.phase ?? '');
      if (phase === 'fight') return;
      const btn = page.locator('#net-ready');
      if (await btn.count() && await btn.isVisible() && await btn.isEnabled().catch(() => false)) {
        await btn.click().catch(() => {});
      }
      await page.waitForTimeout(250);
    }
  };
  await Promise.all([
    poke(host.page),
    poke(guest.page),
    ...[host, guest].map(p => p.page.waitForFunction(() => window.__mf?.game()?.phase === 'fight', null, { timeout: 45000 })),
  ]).catch(async err => {
    for (const p of [host, guest]) {
      console.log(p.name, 'state', await p.page.evaluate(() => ({
        phase: window.__mf?.game()?.phase,
        status: document.getElementById('net-status')?.textContent,
        steps: document.getElementById('net-steps')?.textContent,
        log: window.__mf?.log?.().slice(-6),
      })));
    }
    throw err;
  });
  return code;
}

async function iceSnapshot(page) {
  return page.evaluate(async () => {
    const pcs = window.__pcs || [];
    const out = [];
    for (const pc of pcs) {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach(s => {
        if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded')) {
          if (!pair || s.nominated) pair = s;
        }
      });
      const cand = id => {
        let hit = null;
        stats.forEach(s => { if (s.id === id) hit = s; });
        return hit;
      };
      const local = pair ? cand(pair.localCandidateId) : null;
      const remote = pair ? cand(pair.remoteCandidateId) : null;
      out.push({
        ice: pc.iceConnectionState,
        pair: pair?.state ?? null,
        nominated: !!pair?.nominated,
        rttMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
        localType: local?.candidateType ?? null,
        remoteType: remote?.candidateType ?? null,
      });
    }
    return out;
  });
}

function armSampler(page) {
  return page.evaluate(() => {
    window.__samples = [];
    const tick = () => {
      const g = window.__mf?.game?.();
      const lock = window.__mf?.lock?.();
      const log = window.__mf?.log?.() ?? [];
      const mode = document.getElementById('battle-mode')?.textContent ?? '';
      const badge = document.getElementById('rec-badge');
      if (badge) {
        const role = badge.className === 'host' ? '房主 HOST' : '客人 GUEST';
        const tail = log.length ? log[log.length - 1] : '';
        badge.textContent = role + '\n' + (mode || '…') + (lock ? `\nlock ${Math.round(lock.rtt)}ms · 延迟 ${lock.delay} 帧 · stall ${Math.round(lock.stallMs)}ms` : '') + (tail ? '\n' + tail.slice(0, 96) : '');
      }
      if (g) {
        window.__samples.push({
          wall: Date.now(),
          mode,
          phase: g.phase,
          role: g.netRole,
          rtt: lock ? lock.rtt : null,
          delay: lock ? lock.delay : null,
          stall: lock ? lock.stallMs : null,
          fallen: lock ? lock.fallen : null,
          x: g.fighters.map(f => Math.round(f.x)),
          hp: g.fighters.map(f => Math.round(f.hp)),
          atk: g.fighters.map(f => f.attack ? f.attack.serial : 0),
          log: log.slice(-2),
        });
      }
      window.__sampleTimer = setTimeout(tick, 50);
    };
    document.getElementById('arena')?.scrollIntoView({ block: 'center' });
    tick();
  });
}

/** Both seats drive the 1P keys on their own machine. Host walks right to close; guest walks left. */
function fightRoutine(seconds) {
  return page => page.evaluate(async sec => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    const up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
    const tap = async (code, ms = 70) => { down(code); await sleep(ms); up(code); };
    const hold = async (code, ms) => { down(code); await sleep(ms); up(code); };
    const side = document.getElementById('rec-badge')?.className === 'host' ? 'host' : 'guest';
    const approach = side === 'host' ? 'KeyD' : 'KeyA';
    const retreat = side === 'host' ? 'KeyA' : 'KeyD';
    const skills = ['KeyU', 'KeyI', 'KeyO'];
    const end = performance.now() + sec * 1000;
    let i = 0;
    while (performance.now() < end) {
      await hold(approach, 800);
      await tap('KeyJ', 50);
      await sleep(160);
      await tap('KeyW', 40);
      await sleep(110);
      await tap(i % 2 ? 'KeyK' : 'KeyJ', 60);
      await sleep(180);
      if (i % 3 === 0) await hold('KeyS', 420);
      else if (i % 3 === 1) await tap('KeyS', 30);
      else { down(approach); await tap('KeyJ', 40); up(approach); }
      await sleep(140);
      await tap(skills[i % skills.length], 80);
      await sleep(220);
      await hold(retreat, 420);
      await sleep(120);
      // Both sides fire on the same cadence so the recording shows a simultaneous exchange.
      await tap('KeyJ', 40);
      await sleep(90);
      await tap('KeyK', 90);
      await sleep(200);
      if (i % 4 === 3) await tap('KeyL', 60);
      i++;
    }
    return i;
  }, seconds);
}

function alignLag(hostSamples, guestSamples) {
  const t0 = Math.min(hostSamples[0]?.wall ?? 0, guestSamples[0]?.wall ?? 0);
  const bin = 50;
  const series = (samples, idx) => {
    const map = new Map();
    for (const s of samples) {
      if (!s.x) continue;
      map.set(Math.round((s.wall - t0) / bin), s.x[idx]);
    }
    return map;
  };
  const lagOf = (a, b) => {
    let best = 0;
    let bestErr = Infinity;
    for (let lag = -8; lag <= 24; lag++) {
      let err = 0;
      let n = 0;
      for (const [t, x] of a) {
        const y = b.get(t + lag);
        if (y == null || x == null) continue;
        err += Math.abs(x - y);
        n++;
      }
      if (n > 20 && err / n < bestErr) { bestErr = err / n; best = lag; }
    }
    return { lagMs: best * bin, meanAbsPx: Number.isFinite(bestErr) ? Math.round(bestErr) : null };
  };
  return {
    hostFighterOnGuest: lagOf(series(hostSamples, 0), series(guestSamples, 0)),
    guestFighterOnHost: lagOf(series(guestSamples, 1), series(hostSamples, 1)),
  };
}

function summarize(samples) {
  const modes = samples.map(s => s.mode).filter(Boolean);
  const rtts = samples.map(s => s.rtt).filter(n => typeof n === 'number' && n > 0);
  const roles = [...new Set(samples.map(s => s.role).filter(Boolean))];
  const logs = [];
  for (const s of samples) for (const line of s.log ?? []) if (!logs.includes(line)) logs.push(line);
  const hudMs = modes.map(m => {
    const hit = /(\d+)ms/.exec(m);
    return hit ? Number(hit[1]) : null;
  }).filter(n => n != null);
  const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  return {
    samples: samples.length,
    roles,
    lockRttMin: rtts.length ? Math.round(Math.min(...rtts)) : null,
    lockRttMax: rtts.length ? Math.round(Math.max(...rtts)) : null,
    lockRttMean: avg(rtts.map(Math.round)),
    hudMsMin: hudMs.length ? Math.min(...hudMs) : null,
    hudMsMax: hudMs.length ? Math.max(...hudMs) : null,
    hudMsMean: avg(hudMs),
    hudLast: modes.at(-1) ?? '',
    logs,
  };
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => code === 0 ? resolve(undefined) : reject(new Error(err.slice(-800))));
  });
}

async function transcode(src, dest) {
  await ffmpeg(['-y', '-i', src, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', dest]);
  let size = statSync(dest).size;
  if (size > 14_500_000) {
    await ffmpeg(['-y', '-i', src, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '36', '-vf', 'scale=iw*3/4:ih*3/4', '-movflags', '+faststart', dest]);
    size = statSync(dest).size;
  }
  return size;
}

const videoDir = path.join(tmpdir(), 'lat-rec-' + Date.now());
mkdirSync(videoDir, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const hostBrowser = await chromium.launch(launchOpts(0));
const guestBrowser = await chromium.launch(launchOpts(W + 8));
const hostOpened = Date.now();
const host = await open(hostBrowser, 'host', videoDir);
const guestOpened = Date.now();
const guest = await open(guestBrowser, 'guest', videoDir);
await toNet(host.page);
await toNet(guest.page);
const code = await connect(host, guest);
const fightAt = Date.now();
console.log('room', code, 'fight after', fightAt - hostOpened, 'ms');
await armSampler(host.page);
await armSampler(guest.page);
await host.page.waitForTimeout(600);
const early = {
  hostHud: await host.page.textContent('#battle-mode'),
  guestHud: await guest.page.textContent('#battle-mode'),
  hostIce: await iceSnapshot(host.page),
  guestIce: await iceSnapshot(guest.page),
  hostLock: await host.page.evaluate(() => {
    const l = window.__mf.lock();
    return l ? { rtt: l.rtt, delay: l.delay, fallen: l.fallen, stall: l.stallMs } : null;
  }),
};
console.log('early', JSON.stringify(early));

let grab = null;
const grabPath = path.join(videoDir, 'screen.mp4');
if (!SKIP_VIDEO) {
  grab = spawn('ffmpeg', [
    '-y', '-f', 'x11grab', '-video_size', '2000x800', '-framerate', '30', '-i', DISPLAY,
    '-t', String(SECONDS + 3), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30',
    grabPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

const rounds = await Promise.all([fightRoutine(SECONDS)(host.page), fightRoutine(SECONDS)(guest.page)]);
console.log('script loops', rounds);
await host.page.waitForTimeout(400);
const lateIce = { host: await iceSnapshot(host.page), guest: await iceSnapshot(guest.page) };
const hostSamples = await host.page.evaluate(() => window.__samples);
const guestSamples = await guest.page.evaluate(() => window.__samples);
const hostLog = await host.page.evaluate(() => window.__mf.log());
const guestLog = await guest.page.evaluate(() => window.__mf.log());

const report = {
  method: 'dev __netChaos on both peers (kernel sch_netem unavailable)',
  chaos,
  expectedMeanRttMs: 2 * DELAY + JITTER,
  room: code,
  fightStartDelayMs: fightAt - hostOpened,
  early,
  lateIce,
  host: summarize(hostSamples),
  guest: summarize(guestSamples),
  visualLag: alignLag(hostSamples, guestSamples),
  hostLog,
  guestLog,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(path.join(OUT_DIR, 'netplay-300ms-report.json'), JSON.stringify(report, null, 2));

if (grab) {
  await new Promise(resolve => grab.on('close', resolve));
}

const hostVideo = await host.page.video()?.path();
const guestVideo = await guest.page.video()?.path();
await host.ctx.close();
await guest.ctx.close();
await hostBrowser.close();
await guestBrowser.close();

if (!SKIP_VIDEO && hostVideo && guestVideo) {
  const hostMp4 = path.join(OUT_DIR, 'netplay-300ms-host.mp4');
  const guestMp4 = path.join(OUT_DIR, 'netplay-300ms-guest.mp4');
  const sideMp4 = path.join(OUT_DIR, 'netplay-300ms-side-by-side.mp4');
  // Trim the lobby: fight starts (fightAt - tOpen) after the first navigation.
  const dur = String(SECONDS + 1.2);
  const hostSs = Math.max(0, (fightAt - hostOpened) / 1000 - 0.4);
  const guestSs = Math.max(0, (fightAt - guestOpened) / 1000 - 0.4);
  console.log('trim', { hostSs, guestSs, dur });
  await ffmpeg(['-y', '-ss', String(hostSs), '-i', hostVideo, '-t', dur, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', hostMp4]);
  await ffmpeg(['-y', '-ss', String(guestSs), '-i', guestVideo, '-t', dur, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', guestMp4]);
  await ffmpeg([
    '-y', '-i', hostMp4, '-i', guestMp4,
    '-filter_complex', '[0:v][1:v]hstack=inputs=2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text=\'HOST 1P\':x=16:y=14:fontsize=28:fontcolor=black:box=1:boxcolor=#FDE979@0.9:boxborderw=6,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text=\'GUEST 2P\':x=(w/2)+16:y=14:fontsize=28:fontcolor=black:box=1:boxcolor=#C8F181@0.9:boxborderw=6',
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', sideMp4,
  ]);
  for (const file of [hostMp4, guestMp4, sideMp4]) {
    let size = statSync(file).size;
    if (size > 14_500_000) {
      const tmp = file + '.tmp.mp4';
      await ffmpeg(['-y', '-i', file, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '36', '-vf', 'scale=iw*3/4:ih*3/4', '-movflags', '+faststart', tmp]);
      rmSync(file);
      const { renameSync } = await import('node:fs');
      renameSync(tmp, file);
      size = statSync(file).size;
    }
    console.log('wrote', file, Math.round(size / 1000) + 'kB');
  }
  if (statSync(grabPath).size > 0) {
    const screenMp4 = path.join(OUT_DIR, 'netplay-300ms-screen.mp4');
    const size = await transcode(grabPath, screenMp4);
    console.log('wrote', screenMp4, Math.round(size / 1000) + 'kB');
  }
}
