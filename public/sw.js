/* 萌趣格斗 · 资源缓存（Service Worker）。设计见项目文档「后台资源下载与缓存策略-设计」。
   只管 asset-manifest.json 里列出的那些目录：cache-first，未命中走网络、核对 hash 后写入 Cache Storage。
   什么时候下、下哪个不归这里管（src/assets/prefetch.ts）；这里只负责「存得住、存得对、换版只换变了的」。
   · index.html 不经过这里：发版照旧靠 max-age=0 + SWR 更新。
   · 带 Range 的请求（音乐库读时长的 <audio>）直接放行，不伪造 206。
   · 清单里 sw:false 时自行注销并删掉缓存（kill switch：MF_NO_SW=1 npm run build）。 */
const CACHE = 'mf-assets-v1';
const META = 'mf-meta';
const TRACK = /^(sprites|avatars|portraits|stages|finale|bgm|sfx|frames|albums|fonts|icons|assets|musou)\//;
const SCOPE = new URL(self.registration.scope);

/** rel path → hash, from the newest manifest the page handed over (kept in META across restarts). */
let want = null;
let wantLoad = null;
let build = '';
let killed = false;
/** Background downloads (x-mf-bg) on the wire, by url. The page aborts them by message when it gives way to a
 *  foreground image: a page-side abort does not reach this fetch in every browser, and the point is to free the link. */
const bg = new Map();
/** Network downloads on the wire, by url → settles once the copy is stored (or given up). A second request for the
 *  same file (a foreground image the background lane is already fetching) waits for it instead of downloading twice. */
const inflight = new Map();

function relOf(url) {
  const u = new URL(url);
  if (u.origin !== SCOPE.origin || !u.pathname.startsWith(SCOPE.pathname)) return null;
  let path;
  try { path = decodeURIComponent(u.pathname.slice(SCOPE.pathname.length)); } catch { return null; }
  const rel = path + u.search;
  return TRACK.test(rel) ? rel : null;
}

function apply(m) {
  const map = new Map();
  for (const f of [...(m.files || []), ...(m.extra || [])]) if (Array.isArray(f) && typeof f[0] === 'string') map.set(f[0], typeof f[2] === 'string' ? f[2] : '');
  want = map;
  build = typeof m.build === 'string' ? m.build : '';
}

function loadWant() {
  if (want) return Promise.resolve(want);
  wantLoad ??= caches.open(META).then(c => c.match('manifest')).then(r => r ? r.json() : null)
    .then(m => { if (m && !want) apply(m); return want; }).catch(() => null);
  return wantLoad;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Keep the bytes only when they are the bytes the manifest names. A CDN edge still serving last deploy's file
 *  is handed to the page as-is (better than nothing), but not stored: the next request asks again. */
async function store(url, res, w, t0, clientId) {
  const buf = await res.arrayBuffer();
  // 页面那边经 worker 的条目只看得到响应头的字节数：真实吞吐由这里量了发回去（src/assets/loader.ts noteLinkSample）。
  // 太快的（no-cache 校验后 304、实际读的是 HTTP 缓存）和太小的量不准，不报：报上去会把慢网算成快网。
  const t1 = performance.timeOrigin + performance.now();
  if (clientId && buf.byteLength >= 16384 && t1 - t0 >= 15) {
    void self.clients.get(clientId).then(c => c?.postMessage({ t: 'rate', b: buf.byteLength, s: t0, e: t1 })).catch(() => {});
  }
  // The hash is recorded even when no manifest has arrived yet, so the first sweep keeps a copy that turns out right.
  const h = hex(await crypto.subtle.digest('SHA-256', buf)).slice(0, 8);
  if (w && h !== w) return;
  // Only the headers a cached body still means: the body is already decoded, so content-encoding must not carry over.
  const headers = new Headers({ 'x-mf-h': h });
  const type = res.headers.get('content-type');
  if (type) headers.set('content-type', type);
  await (await caches.open(CACHE)).put(url, new Response(buf, { status: 200, headers }));
}

async function serve(event, rel) {
  const req = event.request;
  const map = await loadWant();
  const w = map?.get(rel);
  const cache = await caches.open(CACHE);
  const fresh = r => r && (w === undefined || r.headers.get('x-mf-h') === w);
  let hit = await cache.match(req.url);
  if (fresh(hit)) return hit;
  const pending = inflight.get(req.url);
  if (pending) {
    await pending;
    const again = await cache.match(req.url);
    if (fresh(again)) return again;
    hit = again ?? hit;
  }
  let res;
  let t0 = 0;
  const ctl = new AbortController();
  req.signal?.addEventListener?.('abort', () => ctl.abort());
  const background = req.headers.get('x-mf-bg') === '1';
  if (background) bg.set(req.url, ctl);
  let settle;
  const mine = new Promise(r => { settle = r; });
  inflight.set(req.url, mine);
  const done = () => {
    if (bg.get(req.url) === ctl) bg.delete(req.url);
    if (inflight.get(req.url) === mine) inflight.delete(req.url);
    settle();
  };
  try {
    // no-cache: an HTTP-cached copy from before a deploy must not be stored under the new hash.
    // assets/ names are content hashes, so the HTTP cache is always right there.
    res = await fetch(req.url, { cache: rel.startsWith('assets/') ? 'default' : 'no-cache', credentials: 'same-origin', signal: ctl.signal });
    t0 = performance.timeOrigin + performance.now();
  } catch (err) {
    done();
    if (hit) return hit;
    throw err;
  }
  if (res.status === 200 && res.type === 'basic') {
    event.waitUntil(store(req.url, res.clone(), w, t0, event.clientId).catch(() => {}).finally(done));
    return res;
  }
  done();
  // A server error with a copy in hand (older bytes): the old copy beats a broken image.
  return hit && !res.ok ? hit : res;
}

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (killed || req.method !== 'GET' || req.headers.has('range')) return;
  const rel = relOf(req.url);
  if (!rel) return;
  event.respondWith(serve(event, rel));
});

/** Drop what the manifest no longer lists or lists with other bytes. Cheap: a few hundred header reads. */
async function sweep() {
  const cache = await caches.open(CACHE);
  for (const key of await cache.keys()) {
    const rel = relOf(key.url);
    const w = rel && want.get(rel);
    if (w === undefined || w === null || w === false) { await cache.delete(key); continue; }
    const r = await cache.match(key);
    if (!r || r.headers.get('x-mf-h') !== w) await cache.delete(key);
  }
}

async function kill() {
  killed = true;
  await Promise.all([caches.delete(CACHE), caches.delete(META)]);
  await self.registration.unregister();
}

self.addEventListener('message', event => {
  const msg = event.data;
  if (msg?.t === 'abort' && typeof msg.url === 'string') { bg.get(msg.url)?.abort(); bg.delete(msg.url); return; }
  if (!msg || msg.t !== 'manifest' || !msg.m) return;
  const m = msg.m;
  if (m.sw === false) { event.waitUntil(kill()); return; }
  const before = build;
  apply(m);
  event.waitUntil((async () => {
    await (await caches.open(META)).put('manifest', new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } }));
    if (build !== before || !build) await sweep();
    event.source?.postMessage?.({ t: 'swept' });
  })().catch(() => {}));
});
