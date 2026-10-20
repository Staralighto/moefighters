/* Local mailbox for development and the online E2E run. Same index.js, an in-memory
   document database in place of CloudBase, and the CORS header the gateway would write.
   node cloudbase/functions/mailbox/local.js   (PORT, default 9000) */

const Module = require('module');
const http = require('http');
const crypto = require('crypto');

const tables = new Map();
const table = name => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
};
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const pathOf = (row, key) => String(key).split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);

function collection(name) {
  const rows = table(name);
  return {
    doc(id) {
      return {
        async get() { const row = rows.get(id); return { data: row ? [{ _id: id, ...clone(row) }] : [] }; },
        // Production set({ data }) stores that object under a field named data. get() does not unwrap it.
        async set({ data }) { rows.set(id, { data: clone(data) }); return {}; },
        async update({ data }) {
          const row = rows.get(id);
          if (!row) return {};
          const patch = clone(data);
          if (row.data && typeof row.data === 'object' && patch && typeof patch === 'object') Object.assign(row.data, patch);
          else Object.assign(row, patch);
          return {};
        },
        async remove() { rows.delete(id); return {}; },
      };
    },
    where(match) {
      let order = null;
      const query = {
        orderBy(key, dir) { order = [key, dir === 'desc' ? -1 : 1]; return query; },
        limit(n) {
          return {
            async get() {
              let out = [];
              for (const [id, row] of rows) {
                if (Object.entries(match).every(([k, v]) => pathOf(row, k) === v)) out.push({ _id: id, ...clone(row) });
              }
              if (order) out.sort((a, b) => (pathOf(a, order[0]) - pathOf(b, order[0])) * order[1]);
              return { data: out.slice(0, n) };
            },
          };
        },
      };
      return query;
    },
  };
}

const fakeSdk = {
  SYMBOL_CURRENT_ENV: Symbol('env'),
  init: () => ({
    database: () => ({
      collection,
      // One process, one event loop: writes go straight through, rollback is best effort.
      async startTransaction() { return { collection, async commit() {}, async rollback() {} }; },
    }),
  }),
};

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@cloudbase/node-sdk') return request;
  return resolve.call(this, request, ...rest);
};
require.cache['@cloudbase/node-sdk'] = { id: '@cloudbase/node-sdk', filename: '@cloudbase/node-sdk', loaded: true, exports: fakeSdk };

const https = require('https');
const { EventEmitter } = require('events');

const { main } = require('./index.js');

async function check() {
  const validSdp = 'v=0\r\na=ice-ufrag:ufrag1\r\na=ice-pwd:pwd12345678901234567890\r\na=candidate:1 1 UDP 2122260223 192.168.1.2 50000 typ host\r\n';
  let simNow = Date.parse('2026-10-18T12:00:00Z');
  let cfDayBytes = 10 * 1000 * 1000;
  let cfMonthBytes = 100 * 1000 * 1000;
  let cfMintCalls = 0;
  let cfGraphqlCalls = 0;
  let revokedUsers = [];
  let userSeq = 0;
  let failRevoke = false;
  let failGraphql = false;
  let failMint = false;
  let plantTripDuringMint = false;

  // Intercept https.request so `postJsonIpv4` tests real request construction, URL filtering, GraphQL, and /revoke.
  const origHttpsRequest = https.request;
  https.request = (opts, cb) => {
    const req = new EventEmitter();
    let reqBody = '';
    req.write = chunk => { reqBody += String(chunk); };
    req.destroy = err => { if (err) req.emit('error', err); };
    req.end = () => {
      // Only respond on the primary hostname leg of postJsonIpv4 so counts are exact (1 per postJsonIpv4 call).
      if (opts.host !== opts.servername) {
        setImmediate(() => req.emit('error', new Error('skip-backup-leg')));
        return;
      }
      const res = new EventEmitter();
      const path = String(opts.path || '');
      let status = 200;
      let respText = '{}';
      if (path.endsWith('/credentials/generate-ice-servers')) {
        cfMintCalls++;
        const uname = 'cf-user-' + (++userSeq);
        if (failMint) {
          status = 500;
          respText = '{}';
        } else {
          status = 201;
          respText = JSON.stringify({
            iceServers: [
              { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
              {
                urls: [
                  'turn:turn.cloudflare.com:3478?transport=udp',
                  'turn:turn.cloudflare.com:53?transport=udp',
                  'turn:turn.cloudflare.com:3478?transport=tcp',
                  'turns:turn.cloudflare.com:5349?transport=tcp',
                ],
                username: uname,
                credential: 'secret-' + uname,
              },
            ],
          });
          if (plantTripDuringMint) {
            plantTripDuringMint = false;
            const row = table('rooms').get('_turn_quota');
            if (row && row.data) {
              row.data.trippedDay = new Date(simNow).toISOString().slice(0, 10);
              const extra = { u: 'already-live', exp: simNow + 600 * 1000 };
              row.data.activeUsers = Array.isArray(row.data.activeUsers) ? row.data.activeUsers.concat([extra]) : [extra];
            }
          }
        }
      } else if (path === '/client/v4/graphql') {
        cfGraphqlCalls++;
        if (failGraphql) {
          status = 500;
          respText = '{}';
        } else respText = JSON.stringify({
          data: {
            viewer: {
              accounts: [{
                month: [{ sum: { egressBytes: cfMonthBytes } }],
                day: [{ sum: { egressBytes: cfDayBytes } }],
              }],
            },
          },
        });
      } else if (path.includes('/credentials/') && path.endsWith('/revoke')) {
        if (failRevoke) {
          status = 500;
          respText = '{}';
        } else {
          const m = /\/credentials\/([^/]+)\/revoke$/.exec(path);
          if (m) revokedUsers.push(decodeURIComponent(m[1]));
          status = 204;
          respText = '';
        }
      }
      res.statusCode = status;
      setImmediate(() => {
        cb(res);
        if (respText) res.emit('data', Buffer.from(respText, 'utf8'));
        res.emit('end');
      });
    };
    return req;
  };

  try {
    process.env.TURN_KEY_ID = 'test-turn-key-id';
    process.env.TURN_KEY_SECRET = 'test-turn-key-secret';
    process.env.CF_ACCOUNT_ID = 'test-cf-account-id';
    process.env.CF_ANALYTICS_TOKEN = 'test-cf-analytics-token';

    const rawPost = async (body, headers = {}, ip = '198.51.100.1') => {
      const out = await main({
        httpMethod: 'POST',
        headers: { 'x-real-ip': ip, ...headers },
        requestContext: { sourceIp: ip },
        body: JSON.stringify(body),
        isBase64Encoded: false,
        __now: simNow,
      });
      return { status: out.statusCode, headers: out.headers || {}, body: JSON.parse(out.body) };
    };
    const post = async (body, ip = '198.51.100.1') => (await rawPost(body, {}, ip)).body;

    // 1. Cross-build dead queue row cleanup & normal pairing
    const rows = table('queue');
    for (let i = 0; i < 10; i++) {
      // Inject dead rows across 10 DIFFERENT builds to verify cross-build corpse sweeping
      rows.set('old' + i + 'xxxx', { data: { build: i + ':dead', at: i, seen: 1, expireAt: 2, status: 'wait' } });
    }
    const first = await post({ op: 'queue', ticket: 'live1111', build: 9, hash: 'dead' });
    const second = await post({ op: 'queue', ticket: 'live2222', build: 9, hash: 'dead' });
    const host = await post({ op: 'queue', ticket: 'live1111', build: 9, hash: 'dead' });
    const other = await post({ op: 'queue', ticket: 'live3333', build: 9, hash: 'else' });
    const gone = [...Array(10).keys()].filter(i => !rows.has('old' + i + 'xxxx')).length;
    if (first.wait !== true) throw new Error('first ticket should wait');
    if (second.role !== 'guest' || typeof second.code !== 'string') throw new Error('second ticket should pair');
    if (host.role !== 'host' || host.code !== second.code || typeof host.key !== 'string') throw new Error('first ticket should become host with key');
    const initialSeen = rows.get('live3333')?.data?.seen;
    const pollAgain = await post({ op: 'queue', ticket: 'live3333', build: 9, hash: 'else' });
    if (pollAgain.wait !== true) throw new Error('subsequent poll should keep waiting');
    if (rows.get('live3333')?.data?.seen !== initialSeen) throw new Error('rapid queue poll should throttle seen updates');
    if (gone !== 10) throw new Error('expired waits across different builds must be swept');

    // 2. Attack simulation: Queue stuffing with random builds hits QUEUE_MAX (20) -> 429 busy
    for (let i = 0; i < 19; i++) {
      const r = await rawPost({ op: 'queue', ticket: 'flood_' + String(i).padStart(4, '0'), build: 100 + i, hash: 'h' + i });
      if (r.status !== 200 || r.body.wait !== true) throw new Error('queue slot ' + (i + 2) + ' should wait');
    }
    const overflowQueue = await rawPost({ op: 'queue', ticket: 'flood_over', build: 999, hash: 'over' });
    if (overflowQueue.status !== 429 || overflowQueue.body.error !== 'busy') {
      throw new Error('21st concurrent queue waiter must be rejected with 429 busy');
    }
    // Even when queue is 20/20 full, a legitimate player matching an existing waiter's build still pairs!
    const matchWhenFull = await rawPost({ op: 'queue', ticket: 'legit_pair', build: 9, hash: 'else' });
    if (matchWhenFull.status !== 200 || matchWhenFull.body.role !== 'guest') {
      throw new Error('matching an existing waiter when queue is full must still succeed');
    }
    rows.clear();

    // A failed search leaves a live waiter. Retrying with a new ticket must not pair with it.
    await post({ op: 'queue', ticket: 'ghost1111', build: 7, hash: 'same' });
    const dropped = await post({ op: 'queue', ticket: 'ghost1111', drop: true });
    const alone = await post({ op: 'queue', ticket: 'ghost2222', build: 7, hash: 'same' });
    if (dropped.ok !== true || rows.has('ghost1111')) throw new Error('leaving the queue must remove that ticket');
    if (alone.role || alone.wait !== true) throw new Error('a new ticket must not pair with the waiter that just left');
    rows.clear();

    // 3. Origin whitelist enforcement
    const evil = await rawPost({ op: 'ping' }, { origin: 'https://evil.example' });
    if (evil.status !== 403 || evil.headers['Access-Control-Allow-Origin']) throw new Error('evil origin should be rejected');
    const goodOrigin = await rawPost({ op: 'ping' }, { origin: 'https://moefighters.com' });
    if (goodOrigin.status !== 200 || goodOrigin.headers['Access-Control-Allow-Origin'] !== 'https://moefighters.com') throw new Error('allowed origin should pass');
    const hdslbOrigin = await rawPost({ op: 'ping' }, { origin: 'https://activity.hdslb.com' });
    if (hdslbOrigin.status !== 200 || hdslbOrigin.headers['Access-Control-Allow-Origin'] !== 'https://activity.hdslb.com') throw new Error('hdslb origin should pass');
    const biligameOrigin = await rawPost({ op: 'ping' }, { origin: 'https://game.biligame.com' });
    if (biligameOrigin.status !== 200 || biligameOrigin.headers['Access-Control-Allow-Origin'] !== 'https://game.biligame.com') throw new Error('biligame origin should pass');

    // 4. Attack simulation: Single-player `open` -> `turn` farming & fake SDP injection
    const bareTurn = await rawPost({ op: 'turn' });
    if (bareTurn.status !== 403) throw new Error('bare turn without room must be rejected');
    const opened = await post({ op: 'open' });
    if ((await rawPost({ op: 'answer', code: opened.code, sdp: validSdp })).status !== 403) throw new Error('answer before offer must be rejected');
    if ((await rawPost({ op: 'offer', code: opened.code, sdp: validSdp })).status !== 403) throw new Error('offer without key must be rejected');
    if ((await rawPost({ op: 'offer', code: opened.code, key: opened.key, sdp: 'v=0\r\nfake' })).status !== 400) {
      throw new Error('malformed SDP without candidate/ufrag/pwd must be rejected with 400');
    }
    if ((await rawPost({ op: 'turn', code: opened.code })).status !== 403) throw new Error('guest turn before join/offer must be rejected');
    // Crucial valve: Host cannot mint TURN right after `open` before any guest calls `take`!
    const prematureTurn = await rawPost({ op: 'turn', code: opened.code, key: opened.key });
    if (prematureTurn.status !== 403 || cfMintCalls !== 0) {
      throw new Error('single-player host turn before guest take must be rejected with 403');
    }
    const pollBeforeJoin = await post({ op: 'poll', code: opened.code });
    if (pollBeforeJoin.joined) throw new Error('room must not be marked joined before guest takes');

    // Guest knocks via `take` -> marks room joined
    const firstTake = await post({ op: 'take', code: opened.code });
    if (firstTake.wait !== true || firstTake.joined !== true) throw new Error('first take before offer should mark room joined');
    const pollAfterJoin = await post({ op: 'poll', code: opened.code });
    if (pollAfterJoin.joined !== true) throw new Error('host poll must observe joined: true after guest take');

    // Now host turn with key passes, strips port 53, preserves UDP/TCP/TURNS, and caches credentials on room
    const hostTurn = await rawPost({ op: 'turn', code: opened.code, key: opened.key }, {}, '198.51.100.1');
    if (hostTurn.status !== 200 || cfMintCalls !== 1) throw new Error('joined host turn with key must mint once');
    const flatUrls = hostTurn.body.iceServers.flatMap(s => s.urls);
    if (flatUrls.some(u => u.includes(':53?') || u.endsWith(':53'))) {
      throw new Error('Port 53 TURN URLs must be stripped');
    }
    if (!flatUrls.includes('turn:turn.cloudflare.com:3478?transport=udp')) {
      throw new Error('UDP 3478 TURN URL must be preserved');
    }
    if (!flatUrls.includes('turn:turn.cloudflare.com:3478?transport=tcp') || !flatUrls.includes('turns:turn.cloudflare.com:5349?transport=tcp')) {
      throw new Error('TCP and TLS (turns:) TURN URLs must be preserved for VPN/proxy players');
    }

    const offered = await post({ op: 'offer', code: opened.code, key: opened.key, sdp: validSdp });
    if ((await rawPost({ op: 'offer', code: opened.code, key: opened.key, sdp: validSdp })).status !== 403) throw new Error('second offer must be rejected');
    // Guest on the SAME IP (same Wi-Fi) gets the cached room TURN credentials without triggering a 2nd mint or hitting IP cooldown!
    const guestTurn = await rawPost({ op: 'turn', code: opened.code }, {}, '198.51.100.1');
    if (guestTurn.status !== 200 || guestTurn.body.iceServers.length !== 2 || cfMintCalls !== 1) {
      throw new Error('guest turn after offer must reuse room cache without extra Cloudflare call');
    }
    const taken = await post({ op: 'take', code: opened.code });
    if (offered.ok !== true || taken.sdp !== validSdp) throw new Error('offer did not round-trip');
    if ((await rawPost({ op: 'answer', code: opened.code, sdp: validSdp })).status !== 200) throw new Error('first answer must pass');
    if ((await rawPost({ op: 'answer', code: opened.code, sdp: validSdp })).status !== 403) throw new Error('second answer must be rejected');
    if ((await rawPost({ op: 'turn', code: opened.code })).status !== 403) throw new Error('guest turn after answer must be rejected');
    if ((await rawPost({ op: 'drop', code: opened.code })).status !== 403) throw new Error('drop without key must be rejected');
    if ((await rawPost({ op: 'drop', code: opened.code, key: opened.key })).status !== 200) throw new Error('drop with key must pass');

    // 5. Attack simulation: `open` room flood hits OPEN_MAX (30) -> 429 busy, and expired open rooms are swept
    const roomRows = table('rooms');
    for (let i = 0; i < 5; i++) {
      roomRows.set('EXP' + i, { data: { offer: '', answer: '', key: 'k', joined: false, expireAt: simNow - 1000 } });
    }
    const openBatch = [];
    for (let i = 0; i < 30; i++) {
      const r = await rawPost({ op: 'open' });
      if (r.status !== 200) throw new Error('open #' + (i + 1) + ' should succeed');
      openBatch.push(r.body);
    }
    if ([0, 1, 2, 3, 4].some(i => roomRows.has('EXP' + i))) {
      throw new Error('expired unjoined rooms must be garbage-collected on open');
    }
    const open31 = await rawPost({ op: 'open' });
    if (open31.status !== 429 || open31.body.error !== 'busy') {
      throw new Error('31st unjoined open room must be rejected with 429 busy');
    }
    for (const r of openBatch) await post({ op: 'drop', code: r.code, key: r.key });

    // 6. Attack simulation: Single-IP rapid TURN farming (15s cooldown + 20/day per-IP cap)
    const attackerIp = '203.0.113.66';
    const openAndJoin = async ip => {
      const rm = await post({ op: 'open' }, ip);
      await post({ op: 'take', code: rm.code }, ip);
      return rm;
    };
    // First mint by attackerIp succeeds
    const r1 = await openAndJoin(attackerIp);
    const t1 = await rawPost({ op: 'turn', code: r1.code, key: r1.key }, {}, attackerIp);
    if (t1.body.iceServers.length === 0 || cfMintCalls !== 2) throw new Error('first mint from attackerIp should succeed');
    // Immediate 2nd mint 2 seconds later by same attackerIp is blocked by 15s per-IP cooldown
    simNow += 2000;
    const r2 = await openAndJoin(attackerIp);
    const t2 = await rawPost({ op: 'turn', code: r2.code, key: r2.key }, {}, attackerIp);
    if (t2.body.iceServers.length !== 0 || cfMintCalls !== 2) {
      throw new Error('rapid 2nd TURN request from same IP within 15s cooldown must be blocked');
    }
    // Mint remaining 19 credentials for attackerIp spaced by 16s (total 20 for attackerIp)
    for (let i = 2; i <= 20; i++) {
      simNow += 16000;
      const rm = await openAndJoin(attackerIp);
      const tr = await rawPost({ op: 'turn', code: rm.code, key: rm.key }, {}, attackerIp);
      if (tr.body.iceServers.length === 0) throw new Error('attackerIp mint #' + i + ' after cooldown should succeed');
    }
    // 21st mint from attackerIp on the same day is blocked by TURN_IP_DAILY_MAX (20)
    simNow += 16000;
    const r21 = await openAndJoin(attackerIp);
    const t21 = await rawPost({ op: 'turn', code: r21.code, key: r21.key }, {}, attackerIp);
    if (t21.body.iceServers.length !== 0) {
      throw new Error('21st TURN mint from same IP must be blocked by TURN_IP_DAILY_MAX');
    }
    // Meanwhile, a normal player on a different IP (`198.51.100.88`) is completely unaffected!
    const normalPlayerRoom = await openAndJoin('198.51.100.88');
    const normalTurn = await rawPost({ op: 'turn', code: normalPlayerRoom.code, key: normalPlayerRoom.key }, {}, '198.51.100.88');
    if (normalTurn.body.iceServers.length === 0) {
      throw new Error('legitimate player on a different IP must not be blocked by attacker IP cap');
    }

    // 7. Attack simulation: 1 Gbps bandwidth flood triggers GraphQL Circuit Breaker + active `/revoke` + next-day recovery
    simNow += 61 * 1000; // Advance past 60s TURN_USAGE_CHECK_MS window
    cfDayBytes = 3.5 * 1000 * 1000 * 1000; // Simulate 3.5 GB traffic spike (> 2 GB spike threshold)
    cfMonthBytes = 3.6 * 1000 * 1000 * 1000;
    const mintsBeforeTrip = cfMintCalls;
    const tripRoom = await openAndJoin('198.51.100.99');
    const tripTurn = await rawPost({ op: 'turn', code: tripRoom.code, key: tripRoom.key }, {}, '198.51.100.99');
    if (tripTurn.body.iceServers.length !== 0 || cfMintCalls !== mintsBeforeTrip) {
      throw new Error('GraphQL traffic spike must trip circuit breaker and refuse new TURN credentials');
    }
    if (revokedUsers.length === 0 || !revokedUsers.includes('cf-user-' + userSeq)) {
      throw new Error('Circuit breaker trip must actively call /revoke on all unexpired TURN credentials');
    }
    // Subsequent requests on the same day short-circuit immediately without even calling GraphQL again
    const gqlBefore = cfGraphqlCalls;
    const afterTripRoom = await openAndJoin('198.51.100.100');
    const afterTripTurn = await rawPost({ op: 'turn', code: afterTripRoom.code, key: afterTripRoom.key }, {}, '198.51.100.100');
    if (afterTripTurn.body.iceServers.length !== 0 || cfGraphqlCalls !== gqlBefore) {
      throw new Error('tripped day breaker must block immediately without extra GraphQL calls');
    }

    // Advance to the next UTC day -> circuit breaker automatically recovers without touching TURN_KEY_ID!
    simNow += 24 * 3600 * 1000;
    cfDayBytes = 0;
    const nextDayRoom = await openAndJoin('198.51.100.101');
    const nextDayTurn = await rawPost({ op: 'turn', code: nextDayRoom.code, key: nextDayRoom.key }, {}, '198.51.100.101');
    if (nextDayTurn.body.iceServers.length === 0) {
      throw new Error('circuit breaker must automatically recover on the next UTC day');
    }

    // 8. Attack simulation: Monthly 800 GB cap trips for the remainder of the UTC month and auto-recovers on the 1st of next month
    simNow += 61 * 1000;
    cfDayBytes = 100 * 1000 * 1000;
    cfMonthBytes = 805 * 1000 * 1000 * 1000; // 805 GB (>= 800 GB monthly limit)
    const monthTripRoom = await openAndJoin('198.51.100.102');
    const monthTripTurn = await rawPost({ op: 'turn', code: monthTripRoom.code, key: monthTripRoom.key }, {}, '198.51.100.102');
    if (monthTripTurn.body.iceServers.length !== 0) {
      throw new Error('monthly 800GB threshold must trip circuit breaker');
    }
    // Even the next day within the SAME month (2026-10-20) stays blocked!
    simNow += 24 * 3600 * 1000;
    const sameMonthNextDay = await openAndJoin('198.51.100.103');
    const sameMonthTurn = await rawPost({ op: 'turn', code: sameMonthNextDay.code, key: sameMonthNextDay.key }, {}, '198.51.100.103');
    if (sameMonthTurn.body.iceServers.length !== 0) {
      throw new Error('tripped monthly breaker must stay tripped across days within the same UTC month');
    }
    // Roll over to next UTC month (2026-11-01) -> automatically recovers!
    simNow = Date.parse('2026-11-01T00:05:00Z');
    cfDayBytes = 0;
    cfMonthBytes = 0;
    const nextMonthRoom = await openAndJoin('198.51.100.104');
    const nextMonthTurn = await rawPost({ op: 'turn', code: nextMonthRoom.code, key: nextMonthRoom.key }, {}, '198.51.100.104');
    if (nextMonthTurn.body.iceServers.length === 0) {
      throw new Error('tripped monthly breaker must automatically recover on the 1st of the next UTC month');
    }

    // 9. Probe blip must not strip a cached credential, and must still refuse a new mint.
    simNow += 61 * 1000;
    cfDayBytes = 0;
    cfMonthBytes = 0;
    const cacheRoom = await openAndJoin('198.51.100.110');
    const cacheTurn = await rawPost({ op: 'turn', code: cacheRoom.code, key: cacheRoom.key }, {}, '198.51.100.110');
    if (cacheTurn.body.iceServers.length === 0) throw new Error('setup mint for cache must succeed');
    const mintsAtCache = cfMintCalls;
    // Room TTL is 60s, so move the clock and keep the room. Memory and checkedAt both go stale.
    simNow += 61 * 1000;
    table('rooms').get(cacheRoom.code).data.expireAt = simNow + 60 * 1000;
    const quotaRow = table('rooms').get('_turn_quota');
    failGraphql = true;
    const stillCached = await rawPost({ op: 'turn', code: cacheRoom.code, key: cacheRoom.key }, {}, '198.51.100.110');
    if (stillCached.body.iceServers.length === 0 || cfMintCalls !== mintsAtCache) {
      throw new Error('graphql blip must not strip a room that already has TURN');
    }
    const blockedNew = await openAndJoin('198.51.100.111');
    const blockedTurn = await rawPost({ op: 'turn', code: blockedNew.code, key: blockedNew.key }, {}, '198.51.100.111');
    if (blockedTurn.body.iceServers.length !== 0 || cfMintCalls !== mintsAtCache) {
      throw new Error('graphql blip must fail-closed on a new mint');
    }
    failGraphql = false;

    // 10. A room cache must not hide a usage trip, and the live username must be revoked.
    quotaRow.data.checkedAt = simNow - 61 * 1000;
    cfDayBytes = 3.5 * 1000 * 1000 * 1000;
    cfMonthBytes = 3.6 * 1000 * 1000 * 1000;
    const revokedBeforeCut = revokedUsers.length;
    const cut = await rawPost({ op: 'turn', code: cacheRoom.code, key: cacheRoom.key }, {}, '198.51.100.110');
    if (cut.body.iceServers.length !== 0 || revokedUsers.length <= revokedBeforeCut) {
      throw new Error('usage trip must refuse cached TURN and revoke the live credential');
    }

    // 11. A mint that finishes after the breaker trips must not clear trippedDay, and must revoke both sides.
    simNow += 24 * 3600 * 1000;
    cfDayBytes = 1000 * 1000;
    cfMonthBytes = 1000 * 1000;
    plantTripDuringMint = true;
    const raceRoom = await openAndJoin('198.51.100.112');
    const raceTurn = await rawPost({ op: 'turn', code: raceRoom.code, key: raceRoom.key }, {}, '198.51.100.112');
    if (raceTurn.body.iceServers.length !== 0 || !revokedUsers.includes('already-live')) {
      throw new Error('in-flight mint must revoke the new credential and any username planted during the mint');
    }
    const raced = table('rooms').get('_turn_quota');
    const racedDay = new Date(simNow).toISOString().slice(0, 10);
    if (!raced || raced.data.trippedDay !== racedDay) throw new Error('in-flight mint must not clear trippedDay');
    const stayRoom = await openAndJoin('198.51.100.113');
    const stayTurn = await rawPost({ op: 'turn', code: stayRoom.code, key: stayRoom.key }, {}, '198.51.100.113');
    if (stayTurn.body.iceServers.length !== 0 || table('rooms').get('_turn_quota').data.trippedDay !== racedDay) {
      throw new Error('trippedDay must stay set after the racing mint writes back');
    }

    // 12. Failed /revoke stays pending, including usernames past the old 30 cap, and patrol retries.
    simNow += 24 * 3600 * 1000;
    cfDayBytes = 1000 * 1000;
    cfMonthBytes = 1000 * 1000;
    const seedRoom = await openAndJoin('198.51.100.114');
    const seedTurn = await rawPost({ op: 'turn', code: seedRoom.code, key: seedRoom.key }, {}, '198.51.100.114');
    if (seedTurn.body.iceServers.length === 0) throw new Error('retry setup mint must succeed');
    const seeded = table('rooms').get('_turn_quota');
    seeded.data.activeUsers = Array.from({ length: 35 }, (_, i) => ({ u: 'bulk-' + i, exp: simNow + 600 * 1000 }));
    seeded.data.checkedAt = simNow - 61 * 1000;
    simNow += 61 * 1000;
    failRevoke = true;
    cfDayBytes = 3.5 * 1000 * 1000 * 1000;
    cfMonthBytes = 4 * 1000 * 1000 * 1000;
    const patrolTrip = await rawPost({ op: 'patrol' });
    const pending = table('rooms').get('_turn_quota').data.revokePending || [];
    if (patrolTrip.body.ok !== true || !pending.includes('bulk-0') || !pending.includes('bulk-34')) {
      throw new Error('failed revoke must keep every live username pending');
    }
    failRevoke = false;
    await rawPost({ op: 'patrol' });
    const pendingAfter = table('rooms').get('_turn_quota').data.revokePending || [];
    if (pendingAfter.length !== 0 || !revokedUsers.includes('bulk-0') || !revokedUsers.includes('bulk-34')) {
      throw new Error('patrol must retry revoke until the pending list is empty');
    }

    // 13. A quiet sample is remembered. Unchanged egress is re-checked and not written back.
    simNow += 24 * 3600 * 1000;
    cfDayBytes = 1000;
    cfMonthBytes = 4 * 1000 * 1000 * 1000;
    const quiet = await openAndJoin('198.51.100.115');
    const quietTurn = await rawPost({ op: 'turn', code: quiet.code, key: quiet.key }, {}, '198.51.100.115');
    if (quietTurn.body.iceServers.length === 0) throw new Error('quiet mint must succeed');
    const stamped = table('rooms').get('_turn_quota').data.checkedAt;
    const gql = cfGraphqlCalls;
    await rawPost({ op: 'patrol' });
    if (cfGraphqlCalls !== gql || table('rooms').get('_turn_quota').data.checkedAt !== stamped) {
      throw new Error('patrol inside the window must not re-query usage or rewrite quota');
    }
    simNow += 61 * 1000;
    await rawPost({ op: 'patrol' });
    if (cfGraphqlCalls !== gql + 1 || table('rooms').get('_turn_quota').data.checkedAt !== stamped) {
      throw new Error('unchanged egress must be re-checked without rewriting quota');
    }
    cfDayBytes = 5000;
    simNow += 61 * 1000;
    await rawPost({ op: 'patrol' });
    const moved = table('rooms').get('_turn_quota');
    if (moved.data.checkedAt !== simNow || moved.data.dayBytes !== 5000) {
      throw new Error('changed egress must record the new sample');
    }

    // Singapore coturn is prepended only when configured, and its username stays out of /revoke.
    const sgSecret = 'sg-test-secret-0123456789abcdef01';
    process.env.SG_TURN_HOST = '203.0.113.10';
    process.env.SG_TURN_SECRET = sgSecret;
    const sgEarly = await post({ op: 'open' });
    const sgDenied = await rawPost({ op: 'turn', code: sgEarly.code, key: sgEarly.key }, {}, '198.51.100.120');
    if (sgDenied.status !== 403 || (sgDenied.body.iceServers || []).length !== 0) {
      throw new Error('Singapore TURN must stay behind the joined-room gate');
    }
    const sgRoom = await post({ op: 'open' });
    await post({ op: 'take', code: sgRoom.code });
    const beforeSg = cfMintCalls;
    const sgTurn = await rawPost({ op: 'turn', code: sgRoom.code, key: sgRoom.key }, {}, '198.51.100.120');
    const expiry = Math.floor(simNow / 1000) + 600;
    const sgUser = expiry + ':room-' + sgRoom.code;
    const sgPass = crypto.createHmac('sha1', sgSecret).update(sgUser).digest('base64');
    const sgFirst = sgTurn.body.iceServers[0];
    if (sgTurn.status !== 200 || cfMintCalls !== beforeSg + 1 || !sgFirst || sgFirst.username !== sgUser || sgFirst.credential !== sgPass) {
      throw new Error('configured Singapore TURN must be minted locally and placed first');
    }
    if (!sgFirst.urls.includes('turn:203.0.113.10:3478?transport=udp') || !sgFirst.urls.includes('turn:203.0.113.10:3478?transport=tcp')) {
      throw new Error('Singapore TURN must offer UDP and TCP on 3478');
    }
    const sgUsers = (table('rooms').get('_turn_quota').data.activeUsers || []).map(x => x.u);
    if (sgUsers.includes(sgUser)) throw new Error('Singapore username must not be queued for Cloudflare revoke');
    await post({ op: 'offer', code: sgRoom.code, key: sgRoom.key, sdp: validSdp });
    const sgGuest = await rawPost({ op: 'turn', code: sgRoom.code }, {}, '198.51.100.121');
    if (sgGuest.body.iceServers.length !== sgTurn.body.iceServers.length || cfMintCalls !== beforeSg + 1) {
      throw new Error('guest must reuse the cached list including Singapore');
    }
    if (sgGuest.body.iceServers[0].credential !== sgPass) {
      throw new Error('guest must reuse the cached Singapore credential');
    }

    const quotaRowSg = table('rooms').get('_turn_quota');
    const prevTripDay = quotaRowSg.data.trippedDay;
    quotaRowSg.data.trippedDay = new Date(simNow).toISOString().slice(0, 10);
    const held = await rawPost({ op: 'turn', code: sgRoom.code, key: sgRoom.key }, {}, '198.51.100.120');
    quotaRowSg.data.trippedDay = prevTripDay;
    if (held.status !== 200 || held.body.iceServers.length !== 0 || cfMintCalls !== beforeSg + 1) {
      throw new Error('a tripped breaker must not return cached Singapore credentials');
    }
    simNow += 61 * 1000;

    failGraphql = true;
    const probeRoom = await post({ op: 'open' });
    await post({ op: 'take', code: probeRoom.code });
    const beforeProbe = cfMintCalls;
    const probeTurn = await rawPost({ op: 'turn', code: probeRoom.code, key: probeRoom.key }, {}, '198.51.100.140');
    failGraphql = false;
    if (probeTurn.body.iceServers.length !== 0 || cfMintCalls !== beforeProbe) {
      throw new Error('graphql blip must not mint Singapore TURN either');
    }

    failMint = true;
    const downRoom = await post({ op: 'open' });
    await post({ op: 'take', code: downRoom.code });
    const beforeDown = cfMintCalls;
    const downTurn = await rawPost({ op: 'turn', code: downRoom.code, key: downRoom.key }, {}, '198.51.100.130');
    failMint = false;
    const downUser = Math.floor(simNow / 1000) + 600 + ':room-' + downRoom.code;
    const downPass = crypto.createHmac('sha1', sgSecret).update(downUser).digest('base64');
    const downFirst = downTurn.body.iceServers[0];
    if (downTurn.status !== 200 || cfMintCalls !== beforeDown + 1 || downTurn.body.iceServers.length !== 1 || !downFirst || downFirst.username !== downUser || downFirst.credential !== downPass) {
      throw new Error('Cloudflare mint failure must still return the self-hosted TURN');
    }
    await post({ op: 'offer', code: downRoom.code, key: downRoom.key, sdp: validSdp });
    const downGuest = await rawPost({ op: 'turn', code: downRoom.code }, {}, '198.51.100.131');
    if (downGuest.body.iceServers.length !== 1 || cfMintCalls !== beforeDown + 1) {
      throw new Error('guest must reuse the self-hosted TURN cached after a Cloudflare failure');
    }

    process.env.SG_TURN_HOST = '203.0.113.10:3478';
    const badRoom = await post({ op: 'open' });
    await post({ op: 'take', code: badRoom.code });
    const badTurn = await rawPost({ op: 'turn', code: badRoom.code, key: badRoom.key }, {}, '198.51.100.132');
    const badUrls = (badTurn.body.iceServers || []).flatMap(s => s.urls || []);
    if (badTurn.body.iceServers.length === 0 || badUrls.some(u => String(u).includes('203.0.113.10:3478:3478') || String(u).includes('@'))) {
      throw new Error('a TURN host with a port must not be written into the credential URL');
    }
    process.env.SG_TURN_HOST = '203.0.113.10';

    process.env.SG_TURN_SECRET = 'short-secret';
    const weakRoom = await post({ op: 'open' });
    await post({ op: 'take', code: weakRoom.code });
    const weakTurn = await rawPost({ op: 'turn', code: weakRoom.code, key: weakRoom.key }, {}, '198.51.100.133');
    const weakUsers = (weakTurn.body.iceServers || []).map(s => s.username).filter(Boolean);
    if (weakTurn.body.iceServers.length === 0 || weakUsers.some(u => String(u).includes(':room-'))) {
      throw new Error('a short self-hosted TURN secret must not mint a forgeable credential');
    }

    console.log('mailbox pair & all 8 security valve attack simulations ok');
  } finally {
    https.request = origHttpsRequest;
    delete process.env.SG_TURN_HOST;
    delete process.env.SG_TURN_SECRET;
  }
}

if (process.argv.includes('--check')) {
  check().catch(err => { console.error(err); process.exit(1); });
} else {
const port = Number(process.env.PORT) || 9000;
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const out = await main({
    httpMethod: req.method,
    headers: req.headers,
    body: Buffer.concat(chunks).toString('utf8'),
    isBase64Encoded: false,
    path: req.url,
  });
  const headers = { ...(out.headers || {}) };
  // The CloudBase gateway writes this for loopback origins; index.js leaves it out on purpose.
  if (req.headers.origin && !headers['Access-Control-Allow-Origin']) {
    headers['Access-Control-Allow-Origin'] = req.headers.origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  res.writeHead(out.statusCode || 200, headers);
  res.end(out.body || '');
}).listen(port, () => console.log('mailbox on http://127.0.0.1:' + port));
}
