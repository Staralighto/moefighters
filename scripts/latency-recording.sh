#!/bin/sh
# Boot a local mailbox + vite dev server and record a ~300ms-RTT online match.
# Kernel qdisc "netem" is not required: if `tc qdisc add dev lo root netem` fails,
# scripts/latency-recording.mjs injects the delay through the dev-only window.__netChaos hook.
set -e
cd "$(dirname "$0")/.."
PORT_MAIL="${PORT_MAIL:-9000}"
PORT_VITE="${PORT_VITE:-5173}"
export DISPLAY="${DISPLAY:-:99}"
export E2E_URL="${E2E_URL:-http://127.0.0.1:$PORT_VITE/}"
export NODE_PATH="${NODE_PATH:-$HOME/pw/node_modules}"
export PLAYWRIGHT_PATH="${PLAYWRIGHT_PATH:-$HOME/pw/node_modules/playwright/index.mjs}"

if ! command -v Xvfb >/dev/null; then
  echo "Xvfb missing" >&2
  exit 1
fi
if ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
  Xvfb "$DISPLAY" -screen 0 2000x800x24 >/tmp/xvfb-latency.log 2>&1 &
  sleep 0.4
fi

# Probe only. This recording always injects delay in the dev datachannel hook, so a working
# netem qdisc must not stay armed or the RTT would be counted twice.
if command -v tc >/dev/null; then
  if sudo tc qdisc replace dev lo root netem delay 150ms 10ms >/tmp/tc-netem.log 2>&1; then
    echo "tc netem is available; not leaving it armed (the match uses __netChaos instead)"
    sudo tc qdisc del dev lo root >/dev/null 2>&1 || true
  else
    echo "tc netem unavailable ($(tr '\n' ' ' </tmp/tc-netem.log)); using window.__netChaos"
  fi
fi

if ! curl -sf --max-time 2 -o /dev/null -X POST "http://127.0.0.1:$PORT_MAIL/mailbox" -H 'content-type: application/json' -d '{"op":"open"}'; then
  node cloudbase/functions/mailbox/local.js >/tmp/mailbox-latency.log 2>&1 &
  echo $! >/tmp/mailbox-latency.pid
  sleep 0.3
fi
if ! curl -sf --max-time 2 -o /dev/null "$E2E_URL"; then
  VITE_MAILBOX_URL="http://127.0.0.1:$PORT_MAIL/mailbox" npx vite --host 127.0.0.1 --port "$PORT_VITE" --strictPort >/tmp/vite-latency.log 2>&1 &
  echo $! >/tmp/vite-latency.pid
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    curl -sf -o /dev/null "$E2E_URL" && break
    sleep 0.4
  done
fi

node scripts/latency-recording.mjs
