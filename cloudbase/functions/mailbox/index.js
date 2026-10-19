/* Handshake mailbox. One POST, op picks the action. Game bytes never land here.
   Keep CODE_ALPH in sync with src/net/proto.ts. */

const crypto = require('crypto');
const https = require('https');
const cloudbase = require('@cloudbase/node-sdk');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TTL = 60 * 1000;
const SDP_MAX = 12000;
const QUEUE_MAX = 20;
const OPEN_MAX = 30;
const TURN_API = 'https://rtc.live.cloudflare.com/v1/turn/keys/';
const CF_GRAPHQL_API = 'https://api.cloudflare.com/client/v4/graphql';
const TURN_TTL = 600;
const TURN_DAILY_MAX = Number(process.env.TURN_DAILY_MAX) || 200;
const TURN_IP_DAILY_MAX = Number(process.env.TURN_IP_DAILY_MAX) || 20;
const TURN_IP_CD_MS = Number(process.env.TURN_IP_CD_MS) || 15000;
const TURN_DAILY_BYTES_MAX = Number(process.env.TURN_DAILY_BYTES_MAX) || 25 * 1000 * 1000 * 1000;
const TURN_MONTHLY_BYTES_MAX = Number(process.env.TURN_MONTHLY_BYTES_MAX) || 800 * 1000 * 1000 * 1000;
const TURN_SPIKE_BYTES_MAX = Number(process.env.TURN_SPIKE_BYTES_MAX) || 2 * 1000 * 1000 * 1000;
const TURN_USAGE_CHECK_MS = Number(process.env.TURN_USAGE_CHECK_MS) || 60 * 1000;
const QUOTA_DOC = '_turn_quota';

function originState(event) {
  const raw = event && event.headers && (event.headers.origin || event.headers.Origin);
  const origin = Array.isArray(raw) ? raw[0] : String(raw || '');
  if (!origin) return { ok: true, cors: '' };
  let host = '';
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return { ok: false, cors: '' }; }
  // Gateway already writes this header for loopback. A second value is rejected.
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return { ok: true, cors: '' };
  const extra = String(process.env.ALLOW_HOSTS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed =
    host === 'moefighters.com' ||
    host.endsWith('.moefighters.com') ||
    host === 'bilibili.com' ||
    host.endsWith('.bilibili.com') ||
    host === 'biligame.com' ||
    host.endsWith('.biligame.com') ||
    host === 'hdslb.com' ||
    host.endsWith('.hdslb.com') ||
    host.endsWith('.tcloudbaseapp.com') ||
    extra.includes(host);
  return allowed ? { ok: true, cors: origin } : { ok: false, cors: '' };
}

function clientIpOf(event) {
  const ctx = event && event.requestContext;
  const ctxIp = ctx && (ctx.sourceIp || ctx.ip);
  if (typeof ctxIp === 'string' && ctxIp.trim()) return ctxIp.trim();
  const h = (event && event.headers) || {};
  const real = h['x-real-ip'] || h['X-Real-IP'] || h['x-client-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return 'local';
}

function ipHash(ip, day) {
  return crypto.createHash('sha256').update(String(ip) + ':' + String(day)).digest('hex').slice(0, 12);
}

function headersFor(cors) {
  const headers = { 'Content-Type': 'application/json' };
  if (!cors) return headers;
  headers['Access-Control-Allow-Origin'] = cors;
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  headers.Vary = 'Origin';
  return headers;
}

function idOf(doc) {
  return doc && (doc._id || doc.id);
}

// The document database stores the SDK payload under data. get() does not unwrap it.
function peel(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const nested = doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data) ? doc.data : null;
  if (!nested) return doc;
  return { ...nested, _id: doc._id || doc.id };
}

function num(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const raw = v.$numberLong ?? v.$numberInt ?? v.$numberDouble;
    if (raw != null) return Number(raw);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function ms(v) {
  const n = num(v);
  return Number.isFinite(n) ? n : 0;
}

// A build with no source hash is stored as a number, and get() may hand it back as BSON.
function sameBuild(a, b) {
  if (a === b) return true;
  const x = num(a);
  const y = num(b);
  return Number.isFinite(x) && x === y;
}

function one(res) {
  const data = res && res.data;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

const BODY_MAX = 32768;

function readBody(event) {
  if (!event || typeof event !== 'object') return {};
  let body = event.body;
  if (typeof body === 'string') {
    if (body.length > BODY_MAX) return {};
    if (event.isBase64Encoded) {
      try { body = Buffer.from(body, 'base64').toString('utf8'); } catch { body = ''; }
      if (body.length > BODY_MAX) return {};
    }
    try { body = body ? JSON.parse(body) : {}; } catch { body = {}; }
  }
  if (body && typeof body === 'object') return body;
  if (event.op) return event;
  return {};
}

const BLOCKED_CODES = new Set([
  '8964', '6489', '0604', '6400', '0064', '1989', '8906', '0427', '0535',
  '0425', '0720', '0314', '0705', '0301', '0522', '1028', '0913', '0723',
  '1013', '1124', '1126', '1127',
  '0707', '0731', '7310', '0918', '9180', '1213',
  '0512', '0404', '0807',
  '0911', '1488', '8814', '0419', '4190', '0420', '0315', '0722',
  '0250', '2500', '0438', '4380', '0038', '3800', '9438', '5438',
  '7456', '7480', '0748', '7484', '5174', '5418', '5488', '5942',
  '0213', '2130',
  '0110', '0119', '0120', '0122', '9110',
  '0123', '1234', '2345', '3456', '4567', '5678', '6789',
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
]);

function isBlockedCode(code) {
  if (typeof code !== 'string' || code.length !== 4) return true;
  if (code[0] === code[1] && code[1] === code[2] && code[2] === code[3]) return true;
  if (BLOCKED_CODES.has(code)) return true;
  if (code.includes('64') && code.includes('89')) return true;
  if (code.includes('731') || code.includes('250') || code.includes('438') || code.includes('748')) return true;
  return false;
}

function codeOk(code) {
  return typeof code === 'string' && code.length === 4 && [...code].every(c => ALPH.includes(c)) && !isBlockedCode(code);
}

function makeCode() {
  for (let i = 0; i < 200; i++) {
    let s = '';
    for (let j = 0; j < 4; j++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
    if (!isBlockedCode(s)) return s;
  }
  return 'K7QM';
}

function makeKey() {
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

function sdpOk(sdp) {
  return (
    typeof sdp === 'string' &&
    sdp.length >= 20 &&
    sdp.length <= SDP_MAX &&
    sdp.startsWith('v=0') &&
    sdp.includes('a=ice-ufrag:') &&
    sdp.includes('a=ice-pwd:') &&
    sdp.includes('a=candidate:')
  );
}

async function freshRoom(now) {
  const waiting = await db.collection('rooms').where({ 'data.joined': false }).limit(OPEN_MAX + 10).get();
  const rows = (Array.isArray(waiting.data) ? waiting.data : []).map(peel).filter(Boolean);
  let liveOpen = 0;
  for (const r of rows) {
    if (ms(r.expireAt) <= now) {
      try { await db.collection('rooms').doc(idOf(r)).remove(); } catch { /* best effort cleanup */ }
    } else {
      liveOpen++;
    }
  }
  if (liveOpen >= OPEN_MAX) return { busy: true };
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    const prev = peel(one(await db.collection('rooms').doc(code).get()));
    if (prev && ms(prev.expireAt) > now) continue;
    const key = makeKey();
    await db.collection('rooms').doc(code).set({ data: { offer: '', answer: '', key, joined: false, expireAt: now + TTL } });
    return { code, key };
  }
  return null;
}

async function liveRoom(code, now) {
  if (!codeOk(code)) return null;
  const room = peel(one(await db.collection('rooms').doc(code).get()));
  if (!room) return null;
  if (ms(room.expireAt) <= now) {
    try { await db.collection('rooms').doc(code).remove(); } catch { /* best effort cleanup */ }
    return null;
  }
  return room;
}

/* A waiting ticket that has not polled for this long belongs to a closed page. */
const LIVE = 15000;
/* Throttle heartbeat writes to the database so polling does not spam DB writes. */
const SEEN_THROTTLE = 10000;

/* Fields are stored under data, so a top-level status/build query matches nothing.
   Sweep expired waiters globally across all builds so fake builds cannot bloat the queue. */
async function pair(ticket, build, now) {
  const liveRow = d => d && ms(d.expireAt) > now && now - ms(d.seen || d.at) < LIVE;
  const found = await db.collection('queue').where({
    'data.status': 'wait',
  }).orderBy('data.at', 'asc').limit(QUEUE_MAX + 10).get();
  const allRows = (Array.isArray(found.data) ? found.data : []).map(peel).filter(Boolean);
  for (const d of allRows) {
    if (liveRow(d)) continue;
    try { await db.collection('queue').doc(idOf(d)).remove(); } catch { /* the next poll tries again */ }
  }
  const liveWaiters = allRows.filter(liveRow);
  const other = liveWaiters.find(d => idOf(d) !== ticket && sameBuild(d.build, build));
  if (!other) {
    const alreadyIn = liveWaiters.some(d => idOf(d) === ticket);
    if (!alreadyIn && liveWaiters.length >= QUEUE_MAX) return { busy: true };
    return null;
  }
  const code = makeCode();
  const clash = peel(one(await db.collection('rooms').doc(code).get()));
  if (clash && ms(clash.expireAt) > now) return null;
  const key = makeKey();
  const tx = await db.startTransaction();
  try {
    const fresh = peel(one(await tx.collection('queue').doc(idOf(other)).get()));
    if (!fresh || fresh.status !== 'wait' || !sameBuild(fresh.build, build)) {
      await tx.rollback();
      return null;
    }
    const row = { build, at: now, expireAt: now + TTL, status: 'gone', code };
    await tx.collection('rooms').doc(code).set({ data: { offer: '', answer: '', key, joined: true, expireAt: now + TTL } });
    await tx.collection('queue').doc(idOf(other)).update({ data: { ...row, role: 'host', key } });
    await tx.collection('queue').doc(ticket).remove();
    await tx.commit();
    return { role: 'guest', code };
  } catch {
    try { await tx.rollback(); } catch { /* already finished */ }
    return null;
  }
}

async function queue(body, now, reply) {
  const ticket = typeof body.ticket === 'string' ? body.ticket : '';
  // build + source hash: two pages only pair when they run the same game.
  const hash = typeof body.hash === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(body.hash) ? body.hash : '';
  if (!/^[a-zA-Z0-9_-]{8,40}$/.test(ticket) || !Number.isInteger(body.build)) return reply(400, { error: 'ticket' });
  const build = hash ? body.build + ':' + hash : body.build;
  const me = peel(one(await db.collection('queue').doc(ticket).get()));
  if (me && me.role && ms(me.expireAt) > now) {
    try { await db.collection('queue').doc(ticket).remove(); } catch { /* best effort cleanup */ }
    return reply(200, { role: me.role, code: me.code, ...(me.key ? { key: me.key } : {}) });
  }
  const paired = await pair(ticket, build, now);
  if (paired && paired.busy) return reply(429, { error: 'busy' });
  if (paired) return reply(200, paired);
  // Only re-read if `me` existed before `pair()`, in case a concurrent caller paired with us.
  const again = me ? peel(one(await db.collection('queue').doc(ticket).get())) : null;
  if (again && again.role && ms(again.expireAt) > now) {
    try { await db.collection('queue').doc(ticket).remove(); } catch { /* best effort cleanup */ }
    return reply(200, { role: again.role, code: again.code, ...(again.key ? { key: again.key } : {}) });
  }
  if (!again || again.status !== 'wait' || ms(again.expireAt) <= now) {
    await db.collection('queue').doc(ticket).set({
      data: { build, at: now, seen: now, expireAt: now + TTL, status: 'wait' },
    });
  } else if (now - ms(again.seen) >= SEEN_THROTTLE) {
    await db.collection('queue').doc(ticket).update({ data: { seen: now } });
  }
  return reply(200, { wait: true });
}

function postJsonOnce(host, urlStr, token, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = payload == null ? '' : JSON.stringify(payload);
    const headers = {
      Host: u.hostname,
      Authorization: 'Bearer ' + token,
      'Content-Length': Buffer.byteLength(body),
    };
    if (payload != null) headers['Content-Type'] = 'application/json';
    const req = https.request({
      host,
      port: 443,
      servername: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      family: 4,
      timeout: 3500,
      headers,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (!ok) reject(new Error('http-' + (res.statusCode || 0)));
        else resolve({ status: res.statusCode || 0, ok: true, data: json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('ETIMEDOUT')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ponytail: domestic DNS in ap-shanghai can poison or blackhole 104.18.x.x for rtc.live.cloudflare.com.
// Race the hostname against two clean Cloudflare anycast prefixes with full TLS SNI verification.
function postJsonIpv4(urlStr, token, payload) {
  const u = new URL(urlStr);
  const hosts = [u.hostname, '172.64.154.105', '162.159.135.42'];
  return Promise.any(hosts.map(h => postJsonOnce(h, urlStr, token, payload)));
}

async function queryTurnUsage(accountId, analyticsToken, monthStart, day) {
  const query = `{
    viewer {
      accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) {
        month: callsTurnUsageAdaptiveGroups(limit: 10, filter: { date_geq: ${JSON.stringify(monthStart)}, date_leq: ${JSON.stringify(day)} }) {
          sum { egressBytes }
        }
        day: callsTurnUsageAdaptiveGroups(limit: 10, filter: { date_geq: ${JSON.stringify(day)}, date_leq: ${JSON.stringify(day)} }) {
          sum { egressBytes }
        }
      }
    }
  }`;
  const res = await postJsonIpv4(CF_GRAPHQL_API, analyticsToken, { query });
  const data = res && res.data;
  if (!data || (Array.isArray(data.errors) && data.errors.length > 0)) {
    throw new Error('graphql-error');
  }
  const acc = data.data && data.data.viewer && Array.isArray(data.data.viewer.accounts)
    ? data.data.viewer.accounts[0]
    : null;
  if (!acc) throw new Error('graphql-empty');
  const sumBytes = rows => (Array.isArray(rows) ? rows : []).reduce(
    (s, r) => s + (Number(r && r.sum && r.sum.egressBytes) || 0),
    0,
  );
  return {
    monthBytes: sumBytes(acc.month),
    dayBytes: sumBytes(acc.day),
  };
}

function tripped(q, day, month) {
  return Boolean(q && (q.trippedMonth === month || (q.day === day && q.trippedDay === day)));
}

function liveUsers(list, now) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x.u !== 'string' || !x.u || ms(x.exp) <= now || seen.has(x.u)) continue;
    seen.add(x.u);
    out.push({ u: x.u, exp: ms(x.exp) });
  }
  // Daily mint cap is the most usernames that can still be inside TURN_TTL.
  return out.slice(-TURN_DAILY_MAX);
}

function pendingNames(q) {
  const raw = Array.isArray(q && q.revokePending) ? q.revokePending : [];
  return [...new Set(raw.filter(u => typeof u === 'string' && u))].slice(-TURN_DAILY_MAX);
}

function quotaBase(q, now) {
  const ips = q && q.ips && typeof q.ips === 'object' ? { ...q.ips } : {};
  return {
    day: (q && q.day) || '',
    count: ms(q && q.count),
    ips,
    checkedAt: ms(q && q.checkedAt),
    usageDay: (q && q.usageDay) || '',
    dayBytes: ms(q && q.dayBytes),
    monthBytes: ms(q && q.monthBytes),
    trippedDay: (q && q.trippedDay) || '',
    trippedMonth: (q && q.trippedMonth) || '',
    activeUsers: liveUsers(q && q.activeUsers, now),
    revokePending: pendingNames(q),
    expireAt: ms(q && q.expireAt) || now + 32 * 86400 * 1000,
  };
}

async function readQuota() {
  try { return peel(one(await db.collection('rooms').doc(QUOTA_DOC).get())); }
  catch { return null; }
}

// Same instance serializes quota writes. Two CloudBase instances can still interleave;
// ponytail: upgrade path is a conditional update if that lost-update ever shows up in logs.
let quotaWrite = Promise.resolve();
function withQuota(fn) {
  const job = quotaWrite.then(fn, fn);
  quotaWrite = job.then(() => {}, () => {});
  return job;
}

function writeQuota(now, mutator) {
  return withQuota(async () => {
    const tx = await db.startTransaction();
    try {
      const q = peel(one(await tx.collection('rooms').doc(QUOTA_DOC).get())) || {};
      const next = mutator(q);
      await tx.collection('rooms').doc(QUOTA_DOC).set({ data: next });
      await tx.commit();
      return next;
    } catch {
      try { await tx.rollback(); } catch { /* already finished */ }
      return null;
    }
  });
}

async function drainRevokes(id, secret, now) {
  const list = pendingNames(await readQuota());
  if (!list.length) return;
  const results = await Promise.all(list.map(async u => {
    try {
      await postJsonIpv4(
        TURN_API + encodeURIComponent(id) + '/credentials/' + encodeURIComponent(u) + '/revoke',
        secret,
        null,
      );
      return true;
    } catch (err) {
      const msg = String(err && err.message || '');
      // Already gone. Retrying it forever would keep the list stuck.
      return msg === 'http-404' || msg === 'http-410';
    }
  }));
  const done = new Set(list.filter((_, i) => results[i]));
  if (!done.size) return;
  await writeQuota(now, fresh => {
    const base = quotaBase(fresh, now);
    return { ...base, revokePending: base.revokePending.filter(u => !done.has(u)) };
  });
}

/* Query Cloudflare egress when the last sample is stale. On a trip, move every live
   username into revokePending BEFORE calling /revoke, so a 5s kill mid-revoke retries
   on the next patrol. Probe errors fail closed only for a brand-new mint. */
async function patrolTurn(now) {
  const id = (process.env.TURN_KEY_ID || '').trim();
  const secret = (process.env.TURN_KEY_SECRET || '').trim();
  const cfAccount = (process.env.CF_ACCOUNT_ID || '').trim();
  const cfToken = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  if (!id || !secret || !cfAccount || !cfToken) return { blocked: false, probeError: false, usage: null };
  const day = new Date(now).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  let q = await readQuota();
  if (pendingNames(q).length) await drainRevokes(id, secret, now);
  q = await readQuota();
  if (tripped(q, day, month)) return { blocked: true, probeError: false, usage: null };
  const last = ms(q && q.checkedAt);
  if (last && q.usageDay === day && now - last < TURN_USAGE_CHECK_MS) {
    return { blocked: false, probeError: false, usage: null };
  }
  let usage;
  try {
    usage = await queryTurnUsage(cfAccount, cfToken, month + '-01', day);
  } catch {
    return { blocked: false, probeError: true, usage: null };
  }
  const prev = q && q.usageDay === day ? ms(q.dayBytes) : 0;
  const spikeBytes = Math.max(0, usage.dayBytes - prev);
  const tripMonth = usage.monthBytes >= TURN_MONTHLY_BYTES_MAX;
  const tripDay = usage.dayBytes >= TURN_DAILY_BYTES_MAX || spikeBytes >= TURN_SPIKE_BYTES_MAX;
  if (tripMonth || tripDay) {
    await writeQuota(now, fresh => {
      const base = quotaBase(fresh, now);
      if (!tripMonth && !tripDay) return base;
      const pending = new Set(base.revokePending);
      for (const x of base.activeUsers) pending.add(x.u);
      return {
        ...base,
        checkedAt: now,
        usageDay: day,
        dayBytes: usage.dayBytes,
        monthBytes: usage.monthBytes,
        trippedDay: tripDay ? day : base.trippedDay,
        trippedMonth: tripMonth ? month : (base.trippedMonth === month ? month : ''),
        activeUsers: [],
        revokePending: [...pending].slice(-TURN_DAILY_MAX),
        expireAt: now + 32 * 86400 * 1000,
      };
    });
    await drainRevokes(id, secret, now);
    return { blocked: true, probeError: false, usage: null };
  }
  await writeQuota(now, fresh => {
    const base = quotaBase(fresh, now);
    if (tripped(fresh, day, month)) return base;
    return {
      ...base,
      checkedAt: now,
      usageDay: day,
      dayBytes: usage.dayBytes,
      monthBytes: usage.monthBytes,
      expireAt: ms(fresh && fresh.expireAt) || now + 32 * 86400 * 1000,
    };
  });
  return { blocked: false, probeError: false, usage };
}

async function noteMintedUsers(mintedUsers, now, day, month) {
  if (!mintedUsers.length) return false;
  const next = await writeQuota(now, q => {
    const base = quotaBase(q, now);
    if (tripped(q, day, month)) {
      const pending = new Set(base.revokePending);
      for (const x of base.activeUsers) pending.add(x.u);
      for (const u of mintedUsers) pending.add(u);
      return {
        ...base,
        activeUsers: [],
        revokePending: [...pending].slice(-TURN_DAILY_MAX),
      };
    }
    return {
      ...base,
      activeUsers: liveUsers([
        ...base.activeUsers,
        ...mintedUsers.map(u => ({ u, exp: now + TURN_TTL * 1000 })),
      ], now),
    };
  });
  if (next && tripped(next, day, month)) {
    const id = (process.env.TURN_KEY_ID || '').trim();
    const secret = (process.env.TURN_KEY_SECRET || '').trim();
    if (id && secret) await drainRevokes(id, secret, now);
    return true;
  }
  return false;
}

/* Short-lived TURN credentials (600s, UDP only), bound to a joined room, cached per room,
   rate-limited per IP, and guarded by a daily/monthly Cloudflare GraphQL egress circuit breaker
   that actively revokes in-flight credentials on abnormal traffic spikes. */
async function turn(body, now, reply, event) {
  const room = await liveRoom(body.code, now);
  if (!room || !room.joined) return reply(403, { error: 'auth', iceServers: [] });
  const isHost = Boolean(room.key && typeof body.key === 'string' && body.key === room.key);
  const isGuest = Boolean(room.offer && !room.answer);
  if (!isHost && !isGuest) return reply(403, { error: 'auth', iceServers: [] });
  const day = new Date(now).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const gate = await patrolTurn(now);
  // A tripped breaker must not hand back a credential already cached on the room.
  if (gate.blocked) return reply(200, { iceServers: [] });
  if (Array.isArray(room.iceServers) && room.iceServers.length > 0) {
    return reply(200, { iceServers: room.iceServers });
  }
  if (room.turnMinted) return reply(200, { iceServers: [] });
  const id = (process.env.TURN_KEY_ID || '').trim();
  const secret = (process.env.TURN_KEY_SECRET || '').trim();
  if (!id || !secret) return reply(200, { iceServers: [] });
  // Fail closed only when this call would mint. A probe blip must not strip a cached credential.
  if (gate.probeError) return reply(200, { iceServers: [] });
  const ipKey = ipHash(clientIpOf(event), day);

  const reserved = await withQuota(async () => {
    const tx = await db.startTransaction();
    try {
      const fresh = peel(one(await tx.collection('rooms').doc(body.code).get()));
      if (!fresh || !fresh.joined || ms(fresh.expireAt) <= now) {
        await tx.rollback();
        return { stop: 'auth' };
      }
      if (Array.isArray(fresh.iceServers) && fresh.iceServers.length > 0) {
        await tx.rollback();
        return { stop: 'cache', iceServers: fresh.iceServers };
      }
      if (fresh.turnMinted) {
        await tx.rollback();
        return { stop: 'minted' };
      }
      const q = peel(one(await tx.collection('rooms').doc(QUOTA_DOC).get())) || {};
      if (tripped(q, day, month)) {
        await tx.rollback();
        return { stop: 'tripped' };
      }
      const sameDay = q.day === day;
      const used = sameDay ? ms(q.count) : 0;
      if (used >= TURN_DAILY_MAX) {
        await tx.rollback();
        return { stop: 'cap' };
      }
      const ips = sameDay && q.ips && typeof q.ips === 'object' ? { ...q.ips } : {};
      const ipEntry = ips[ipKey] || { c: 0, t: 0 };
      if (ms(ipEntry.c) >= TURN_IP_DAILY_MAX || (ms(ipEntry.t) > 0 && now - ms(ipEntry.t) < TURN_IP_CD_MS)) {
        await tx.rollback();
        return { stop: 'ip' };
      }
      ips[ipKey] = { c: ms(ipEntry.c) + 1, t: now };
      const patch = { day, count: used + 1, ips, expireAt: now + 32 * 86400 * 1000 };
      if (gate.usage) {
        patch.checkedAt = now;
        patch.usageDay = day;
        patch.dayBytes = gate.usage.dayBytes;
        patch.monthBytes = gate.usage.monthBytes;
      }
      await tx.collection('rooms').doc(QUOTA_DOC).set({ data: { ...quotaBase(q, now), ...patch } });
      await tx.collection('rooms').doc(body.code).update({ data: { turnMinted: true } });
      await tx.commit();
      return { stop: '' };
    } catch {
      try { await tx.rollback(); } catch { /* already finished */ }
      return { stop: 'fail' };
    }
  });
  if (reserved.stop === 'auth') return reply(403, { error: 'auth', iceServers: [] });
  if (reserved.stop === 'cache') return reply(200, { iceServers: reserved.iceServers });
  if (reserved.stop) return reply(200, { iceServers: [] });
  try {
    const res = await postJsonIpv4(
      TURN_API + encodeURIComponent(id) + '/credentials/generate-ice-servers',
      secret,
      { ttl: TURN_TTL, customIdentifier: 'room-' + body.code },
    );
    const data = res.data;
    const rows = Array.isArray(data && data.iceServers) ? data.iceServers : [];
    // Browsers block port 53; also strip TCP/TLS TURN so credentials only relay UDP game traffic.
    const badUrl = u =>
      typeof u !== 'string' ||
      u.includes(':53?') ||
      u.endsWith(':53') ||
      u.startsWith('turns:') ||
      u.includes('transport=tcp');
    const iceServers = rows.map(s => {
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !badUrl(u));
      if (!urls.length) return null;
      return s.username ? { urls, username: s.username, credential: s.credential } : { urls };
    }).filter(Boolean);
    const mintedUsers = rows.map(s => s && s.username).filter(u => typeof u === 'string' && u.length > 0);
    // Re-read the quota doc. A trip written while Cloudflare was minting must stick,
    // and this username has to be revoked instead of wiping trippedDay.
    if (await noteMintedUsers(mintedUsers, now, day, month)) return reply(200, { iceServers: [] });
    if (iceServers.length > 0) {
      try { await db.collection('rooms').doc(body.code).update({ data: { iceServers } }); } catch { /* best effort cache */ }
    }
    return reply(200, { iceServers });
  } catch {
    return reply(200, { iceServers: [] });
  }
}

exports.main = async (event) => {
  const origin = originState(event);
  const headers = headersFor(origin.cors);
  const reply = (status, obj) => ({ isBase64Encoded: false, statusCode: status, headers, body: JSON.stringify(obj) });
  if (!origin.ok) return reply(403, { error: 'origin' });
  const method = String((event && (event.httpMethod || event.method)) || 'POST').toUpperCase();
  if (method === 'OPTIONS') return reply(204, {});
  const body = readBody(event);
  const now = typeof event.__now === 'number' ? event.__now : Date.now();
  try {
    if (body.op === 'ping') return reply(200, { ok: true });
    if (body.op === 'patrol') {
      try { await patrolTurn(now); } catch { /* a patrol failure must not take down the mailbox */ }
      return reply(200, { ok: true });
    }
    if (body.op === 'open') {
      const opened = await freshRoom(now);
      if (opened && opened.busy) return reply(429, { error: 'busy' });
      return opened ? reply(200, opened) : reply(500, { error: 'code' });
    }
    if (body.op === 'offer') {
      const room = await liveRoom(body.code, now);
      if (!room) return reply(200, { error: 'expired' });
      if (room.offer) return reply(403, { error: 'locked' });
      if (room.key && body.key !== room.key) return reply(403, { error: 'auth' });
      if (!sdpOk(body.sdp)) return reply(400, { error: 'sdp' });
      await db.collection('rooms').doc(body.code).update({ data: { offer: body.sdp } });
      return reply(200, { ok: true });
    }
    if (body.op === 'answer') {
      const room = await liveRoom(body.code, now);
      if (!room) return reply(200, { error: 'expired' });
      if (!room.offer) return reply(403, { error: 'order' });
      if (room.answer) return reply(403, { error: 'locked' });
      if (!sdpOk(body.sdp)) return reply(400, { error: 'sdp' });
      await db.collection('rooms').doc(body.code).update({ data: { answer: body.sdp } });
      return reply(200, { ok: true });
    }
    if (body.op === 'take') {
      const room = await liveRoom(body.code, now);
      if (!room) return reply(200, { error: 'expired' });
      if (!room.joined) {
        await db.collection('rooms').doc(body.code).update({ data: { joined: true, expireAt: now + TTL } });
      }
      return reply(200, room.offer ? { sdp: room.offer } : { wait: true, joined: true });
    }
    if (body.op === 'poll') {
      const room = await liveRoom(body.code, now);
      if (!room) return reply(200, { error: 'expired' });
      return reply(200, room.answer ? { sdp: room.answer } : { wait: true, ...(room.joined ? { joined: true } : {}) });
    }
    if (body.op === 'drop') {
      if (typeof body.key !== 'string' || !body.key) return reply(403, { error: 'auth' });
      const room = await liveRoom(body.code, now);
      if (!room) return reply(200, { ok: true });
      if (room.key && body.key !== room.key) return reply(403, { error: 'auth' });
      await db.collection('rooms').doc(body.code).remove();
      return reply(200, { ok: true });
    }
    if (body.op === 'queue') return await queue(body, now, reply);
    if (body.op === 'turn') return await turn(body, now, reply, event);
    return reply(400, { error: 'op' });
  } catch {
    return reply(500, { error: 'fail' });
  }
};
