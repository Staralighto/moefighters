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
    // Clients send JSON as text/plain. The gateway still hands over the raw text.
    try { body = body ? JSON.parse(body) : {}; } catch { body = {}; }
  }
  if (body && typeof body === 'object') return body;
  if (event.op) return event;
  return {};
}

const CODE_SALT = 'mf_codename_salt_v1';

function hashCode(code) {
  let h = 0x811c9dc5;
  const s = CODE_SALT + code;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const BLOCKED_CODE_HASHES = new Set([
  '018e58cf', '01bc6a07', '02bc6b9a', '03413659', '03bc6d2d', '03f87ba6', '04879fb1', '0513806a',
  '0b731c16', '0e0a8796', '0e21a452', '0f6a4e51', '12a260f3', '133ab92f', '135f359b', '139c32b2',
  '14bc87f0', '153cfaec', '15bc8983', '163cfc7f', '166a4102', '16bc8b16', '17bc8ca9', '183cffa5',
  '18bc8e3c', '19ab46ae', '19bc8fcf', '1abc9162', '1b10c382', '1b82b9a1', '1bbc92f5', '1dddf64b',
  '1f4187d8', '1f628d35', '21418afe', '2281e45e', '22bc9dfa', '22d90dee', '23bc9f8d', '24dca54e',
  '2520c2e0', '284b7418', '29e825aa', '29fbb882', '2a674dbb', '2ae729c4', '2d43a01e', '2dfe25f0',
  '3135194e', '360d3d12', '38d36e33', '3a5d2b3c', '3a7f69a4', '3b676a22', '3c58ff59', '3c77305d',
  '3e3357eb', '3fd37938', '3fd546b8', '412511c7', '41e3c806', '4216aa92', '43575c69', '454c4191',
  '49285aa0', '494c1582', '4ad70a3e', '4b894226', '4c6a61aa', '4df29802', '4e8ca795', '4f124f12',
  '52004cb2', '52b88703', '582ab0d4', '5879a6b3', '58cfeeed', '58dfdf6f', '5a1916ff', '5b98dfb1',
  '5cd0ff36', '5d75b6b0', '5ea4d8f6', '5f65e2e0', '5fa4da89', '603019f6', '6065e473', '6165e606',
  '6265e799', '6365e92c', '63bbd265', '6465eabf', '6466b202', '6565ec52', '6665ede5', '66741d70',
  '66eb27eb', '67076cbf', '6765ef78', '67a725b8', '6865f10b', '68fc5916', '698b0a97', '69e8ee0d',
  '6c56a972', '6d3e8d46', '6fb48374', '6fe0f53e', '7124f9ed', '71eb4d38', '7305b08e', '733084b7',
  '73c254d0', '74591b52', '76757072', '78a29bdc', '7989b92d', '7bd62c7b', '7d5b6814', '7e5b69a7',
  '7e5c30ea', '7f585e1e', '7f5b6b3a', '82a9675f', '855987c2', '86ddc0d4', '87821b1b', '87b11252',
  '881bf2cd', '897313b7', '89a18123', '8dba7027', '8e849d4e', '8fb2d3b6', '90080660', '910807f3',
  '9180a8be', '92080986', '93080b19', '94080cac', '9437b2ab', '95080e3f', '96080fd2', '965cb310',
  '97081165', '975cb4a3', '98171d82', '985cb636', '98a77d03', '98f6057f', '995cb7c9', '9991fe77',
  '9a5cb95c', '9aa78029', '9b5cbaef', '9c081944', '9c5cbc82', '9d081ad7', '9d5cbe15', '9e1eccf3',
  '9fa78808', 'a05cc2ce', 'a0e0923a', 'a15cc461', 'a1aa2340', 'a289f002', 'a2ca8f6c', 'a2d75b7a',
  'a444ed4c', 'a4c25625', 'a82e94ab', 'abe42dbe', 'ad0b87c9', 'af9d93e4', 'b00838c0', 'b04c06d5',
  'b1083a53', 'b1dae873', 'b2083be6', 'b2daea06', 'b3083d79', 'b33fa541', 'b3daeb99', 'b4083f0c',
  'b508409f', 'b6084232', 'b669d552', 'b6e360ea', 'b70843c5', 'b86a64da', 'ba33c6cd', 'ba612e1a',
  'bc084ba4', 'bc6cb263', 'bd084d37', 'bf08505d', 'bfc0b927', 'c00851f0', 'c05c312e', 'c1085383',
  'c2085516', 'c30856a9', 'c408583c', 'c49ef9b6', 'c5851425', 'c6085b62', 'c7085cf5', 'c72f508c',
  'c73e5b16', 'c7beecce', 'c8085e88', 'c908144d', 'c908601b', 'cb086341', 'cb6f0897', 'cb7f6f3e',
  'cc0ebcf6', 'cd086667', 'cdf86cf6', 'ce0867fa', 'ceeb1450', 'cf08698d', 'd0ac32b9', 'd20bdb0b',
  'd4027dbe', 'd60ad4d2', 'd7fe06dc', 'd93c38d5', 'da158ec5', 'db4609aa', 'dee244f6', 'df0151a7',
  'dffc7834', 'e0c40ede', 'e0d7c792', 'e1fe169a', 'e2e0b57c', 'e4bc3c60', 'e5bc3df3', 'e615b0b5',
  'e6bc3f86', 'e7bc4119', 'e8bc42ac', 'e9bc443f', 'eaaf0163', 'eabc45d2', 'ec0c873c', 'ed120470',
  'ed615cd5', 'ed771442', 'edbc4a8b', 'eebc4c1e', 'efbc4db1', 'f063a025', 'f0bc4f44', 'f1bc50d7',
  'f3bc53fd', 'f4bc5590', 'f534d602', 'f5bc5723', 'f6854b10', 'f6bc58b6', 'f7bc5a49', 'f7d8d442',
  'f853754a', 'f8bc5bdc', 'f9bc5d6f', 'fa4a3e8a', 'fabc5f02', 'fb8552ef', 'fbbc6095', 'fd855615',
  'fe81ec28', 'fe89d4d6', 'ff8c1500',
]);

function isBlockedCode(code) {
  if (typeof code !== 'string' || code.length !== 4) return true;
  if (code[0] === code[1] && code[1] === code[2] && code[2] === code[3]) return true;
  return BLOCKED_CODE_HASHES.has(hashCode(code));
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
async function pair(ticket, build, now, sid) {
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
  // A stale row from the same page can outlive its drop request. Never pair a retry with it.
  const other = liveWaiters.find(d => idOf(d) !== ticket && sameBuild(d.build, build) && (!sid || d.sid !== sid));
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
  const sid = typeof body.sid === 'string' && /^[a-zA-Z0-9_-]{8,40}$/.test(body.sid) ? body.sid : '';
  // The page stopped waiting. A live row here would pair with the next ticket from the same browser.
  if (body.drop === true) {
    if (!/^[a-zA-Z0-9_-]{8,40}$/.test(ticket)) return reply(400, { error: 'ticket' });
    // ponytail: a queue call that already read this doc as missing can set() a waiter after this remove.
    // A finished search has no such call in flight, and the page waits for this drop before the next ticket.
    // Ceiling is one request that started before the drop; the upgrade is a conditional set.
    try { await db.collection('queue').doc(ticket).remove(); } catch { /* already gone */ }
    return reply(200, { ok: true });
  }
  // build + source hash: two pages only pair when they run the same game.
  const hash = typeof body.hash === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(body.hash) ? body.hash : '';
  if (!/^[a-zA-Z0-9_-]{8,40}$/.test(ticket) || !Number.isInteger(body.build)) return reply(400, { error: 'ticket' });
  const build = hash ? body.build + ':' + hash : body.build;
  const me = peel(one(await db.collection('queue').doc(ticket).get()));
  if (me && me.role && ms(me.expireAt) > now) {
    try { await db.collection('queue').doc(ticket).remove(); } catch { /* best effort cleanup */ }
    return reply(200, { role: me.role, code: me.code, ...(me.key ? { key: me.key } : {}) });
  }
  const paired = await pair(ticket, build, now, sid);
  if (paired && paired.busy) return reply(429, { error: 'busy' });
  if (paired) return reply(200, paired);
  // ponytail: if a match lands on this ticket during pair(), this request still says wait.
  // The next poll (5s) reads the role at the top. Ceiling is one client interval; the upgrade is a conditional update.
  if (!me || me.status !== 'wait' || ms(me.expireAt) <= now) {
    await db.collection('queue').doc(ticket).set({
      data: { build, sid, at: now, seen: now, expireAt: now + TTL, status: 'wait' },
    });
  } else if (now - ms(me.seen) >= SEEN_THROTTLE) {
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
// Quiet sample on this instance. Skips quota reads until the check window ends.
// A trip written by another instance is noticed on the next window, same as the GraphQL lag.
let patrolMemo = null;
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

function notePatrol(now, day, blocked, needDrain) {
  patrolMemo = { at: now, day, blocked: Boolean(blocked), needDrain: Boolean(needDrain) };
}

/* Query Cloudflare egress when the last sample is stale. On a trip, move every live
   username into revokePending BEFORE calling /revoke, so a 5s kill mid-revoke retries
   on the next patrol. Probe errors fail closed only for a brand-new mint.
   An unchanged byte sample is not written back: the warm timer used to rewrite the
   whole quota doc every minute. */
async function patrolTurn(now) {
  const id = (process.env.TURN_KEY_ID || '').trim();
  const secret = (process.env.TURN_KEY_SECRET || '').trim();
  const cfAccount = (process.env.CF_ACCOUNT_ID || '').trim();
  const cfToken = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  if (!id || !secret || !cfAccount || !cfToken) return { blocked: false, probeError: false, usage: null };
  const day = new Date(now).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  if (
    patrolMemo &&
    patrolMemo.day === day &&
    !patrolMemo.needDrain &&
    now - patrolMemo.at < TURN_USAGE_CHECK_MS
  ) {
    return { blocked: patrolMemo.blocked, probeError: false, usage: null };
  }
  let q = await readQuota();
  if (pendingNames(q).length) {
    await drainRevokes(id, secret, now);
    q = await readQuota();
  }
  const stillPending = pendingNames(q).length > 0;
  if (tripped(q, day, month)) {
    notePatrol(now, day, true, stillPending);
    return { blocked: true, probeError: false, usage: null };
  }
  const last = ms(q && q.checkedAt);
  if (last && q.usageDay === day && now - last < TURN_USAGE_CHECK_MS) {
    notePatrol(now, day, false, stillPending);
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
    const saved = await writeQuota(now, fresh => {
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
    const after = await readQuota();
    if (saved || tripped(after, day, month)) notePatrol(now, day, true, pendingNames(after).length > 0);
    return { blocked: true, probeError: false, usage: null };
  }
  if (
    q &&
    q.usageDay === day &&
    ms(q.dayBytes) === usage.dayBytes &&
    ms(q.monthBytes) === usage.monthBytes
  ) {
    notePatrol(now, day, false, stillPending);
    return { blocked: false, probeError: false, usage: null };
  }
  const saved = await writeQuota(now, fresh => {
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
  if (saved) notePatrol(now, day, false, stillPending);
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
  // A tripped breaker must not hand back a credential already cached on the room. The memo
  // above can belong to another instance's window, so re-read the trip flag before the cache.
  const freshQ = await readQuota();
  if (tripped(freshQ, day, month)) {
    notePatrol(now, day, true, pendingNames(freshQ).length > 0);
    return reply(200, { iceServers: [] });
  }
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
      const q = peel(one(await tx.collection('rooms').doc(QUOTA_DOC).get())) || {};
      if (tripped(q, day, month)) {
        await tx.rollback();
        return { stop: 'tripped' };
      }
      if (Array.isArray(fresh.iceServers) && fresh.iceServers.length > 0) {
        await tx.rollback();
        return { stop: 'cache', iceServers: fresh.iceServers };
      }
      if (fresh.turnMinted) {
        await tx.rollback();
        return { stop: 'minted' };
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
  if (reserved.stop === 'tripped') notePatrol(now, day, true, true);
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
