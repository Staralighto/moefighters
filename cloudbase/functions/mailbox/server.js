const http = require('http');
const { main } = require('./index.js');

const BODY_MAX = 32768;
const port = Number(process.env.PORT) || 9000;
http.createServer(async (req, res) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end('{"error":"sdp"}');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  }
  const out = await main({
    httpMethod: req.method,
    headers: req.headers,
    body: Buffer.concat(chunks).toString('utf8'),
    isBase64Encoded: false,
    path: req.url,
  });
  res.writeHead(out.statusCode || 200, out.headers || {});
  res.end(out.body || '');
}).listen(port);

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
setInterval(kickPatrol, 60 * 1000).unref();
kickPatrol();
