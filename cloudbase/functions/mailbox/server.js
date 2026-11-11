const http = require('http');
const { main } = require('./index.js');

const BODY_MAX = 32768;
function createMailboxServer(dispatch = main) {
  return http.createServer(async (req, res) => {
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > BODY_MAX) {
          res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
          res.end('{"error":"sdp"}');
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      res.destroy();
      return;
    }
    const out = await dispatch({
      httpMethod: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
      isBase64Encoded: false,
      path: req.url,
    });
    res.writeHead(out.statusCode || 200, out.headers || {});
    res.end(out.body || '');
  });
}

module.exports = { createMailboxServer };

// ponytail: while this process is warm, patrol TURN egress every 60s even if nobody is
// minting. A scaled-to-zero instance stops the timer; TURN_TTL (600s) is the backstop.
// Upgrade path: a platform timer that POSTs { op: 'patrol' }.
let patrolBusy = false;
function kickPatrol() {
  if (patrolBusy) return;
  patrolBusy = true;
  main({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ op: 'patrol' }),
    isBase64Encoded: false,
  }).catch(() => {}).finally(() => { patrolBusy = false; });
}
if (require.main === module) {
  const port = Number(process.env.PORT) || 9000;
  createMailboxServer().listen(port);
  setInterval(kickPatrol, 60 * 1000).unref();
  kickPatrol();
}
