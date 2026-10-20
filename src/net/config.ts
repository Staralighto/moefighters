/* Online knobs that are deployment decisions, not code: set them at build time.
   VITE_ICE_SERVERS   JSON RTCIceServer[] (a static TURN, if the mailbox cannot mint one).
   VITE_NET_SILENT_MS no word from the other side for this long ends the match (default 10000).
   VITE_NET_SHAKY_MS  past this gap the HUD shows 连接不稳 (default 500).
   VITE_NET_MODE      'lock' (default: deterministic lockstep) or 'snapshot' (host snapshots only). */

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const STUN_ONLY: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.qq.com:3478'] },
  { urls: 'stun:stun.miwifi.com:3478' },
];

/** Keeps only the entries an RTCPeerConnection will accept: an object with urls (string or array). */
export function iceList(list: unknown): RTCIceServer[] {
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is RTCIceServer => !!s && typeof s === 'object' &&
    (typeof (s as RTCIceServer).urls === 'string' || Array.isArray((s as RTCIceServer).urls)));
}

export function parseIce(raw: string | undefined): RTCIceServer[] {
  if (!raw) return STUN_ONLY;
  try {
    const ok = iceList(JSON.parse(raw) as unknown);
    return ok.length ? ok : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  }
}

function ms(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const ICE_SERVERS = parseIce(env.VITE_ICE_SERVERS);
export const SILENT_MS = ms(env.VITE_NET_SILENT_MS, 10000);
export const SHAKY_MS = ms(env.VITE_NET_SHAKY_MS, 500);

function snapshotFromUrl(): boolean {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  const snap = q.get('snap');
  return q.get('net') === 'snap' || q.get('mode') === 'snapshot' ||
    (snap !== null && snap !== '0' && snap !== 'false');
}

export const NET_MODE: 'lock' | 'snap' = env.VITE_NET_MODE === 'snapshot' || snapshotFromUrl() ? 'snap' : 'lock';
