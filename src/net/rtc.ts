/* Non-trickle WebRTC. One offer, one answer. ICE servers come from config.ts (STUN by default). */

import { ICE_SERVERS } from './config.ts';

// ICE servers come from config.ts, or per-match credentials the mailbox mints (op 'turn').
// A TURN here is the fix for two devices the router keeps apart (AP isolation, blocked mDNS,
// no hairpin NAT). One pooled candidate so the guest can gather before installing the offer.
function rtcConfig(ice: RTCIceServer[]): RTCConfiguration {
  return { iceServers: ice, iceCandidatePoolSize: 1 };
}

const ICE_FAIL = '连不上，请换同一个 WiFi 后再开一间';

/** A failed connect, plus one line of ICE facts to show on screen. */
export class NetFail extends Error {
  readonly diag: string;
  constructor(message: string, diag = '') {
    super(message);
    this.name = 'NetFail';
    this.diag = diag;
  }
}

/** Candidate kinds in an SDP: the token after `typ`, with a `.local` host shown as `mdns`. */
function candidateKinds(sdp: string | undefined): string {
  const n = new Map<string, number>();
  for (const line of (sdp ?? '').split(/\r?\n/)) {
    if (!line.startsWith('a=candidate:')) continue;
    const m = /\btyp\s+(\S+)/.exec(line);
    if (!m) continue;
    const kind = m[1] === 'host' && line.includes('.local') ? 'mdns' : m[1];
    n.set(kind, (n.get(kind) ?? 0) + 1);
  }
  return n.size ? [...n].map(([k, v]) => k + '×' + v).join(' ') : 'n/a';
}

/** One line of ICE facts for a failed connect: states, both sides' candidate kinds, pair states. */
export async function iceReport(pc: RTCPeerConnection): Promise<string> {
  const bits = [
    'gather=' + pc.iceGatheringState,
    'ice=' + pc.iceConnectionState,
    'conn=' + pc.connectionState,
    'local[' + candidateKinds(pc.localDescription?.sdp) + ']',
    'remote[' + candidateKinds(pc.remoteDescription?.sdp) + ']',
  ];
  try {
    const stats = await pc.getStats();
    // getStats is ground truth: the SDP can hide candidates the browser later dropped.
    const type = new Map<string, string>();
    stats.forEach(r => {
      if (r.type !== 'local-candidate' && r.type !== 'remote-candidate') return;
      const c = r as { candidateType?: string; address?: string };
      const kind = c.candidateType ?? '?';
      type.set(r.id, kind === 'host' && (c.address ?? '').endsWith('.local') ? 'mdns' : kind);
    });
    const pairs = new Map<string, number>();
    let seen = 0;
    stats.forEach(r => {
      seen++;
      if (r.type !== 'candidate-pair') return;
      const s = r as RTCIceCandidatePairStats;
      const key = (s.state ?? '?') + (s.nominated ? '*' : '') +
        ' ' + (type.get(s.localCandidateId ?? '') ?? '?') + '→' + (type.get(s.remoteCandidateId ?? '') ?? '?');
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    });
    bits.push('pairs[' + (pairs.size ? [...pairs].map(([k, v]) => k + '×' + v).join(' ') : 'none') + '/' + seen + ']');
  } catch { /* stats are gone once the connection is closed */ }
  return bits.join(' ');
}

/** Append candidate lines the browser fired but left out of localDescription. */
export function sealCandidates(sdp: string, seen: readonly string[]): string {
  let out = sdp;
  const nl = out.includes('\r\n') ? '\r\n' : '\n';
  for (const raw of seen) {
    const body = raw.trim().replace(/^a=/, '');
    if (!body.startsWith('candidate:')) continue;
    if (out.includes(body)) continue;
    const line = 'a=' + body;
    out += out.endsWith(nl) || out.length === 0 ? line + nl : nl + line + nl;
  }
  return out;
}

/** Data frames arrive as strings, or as binary when binaryType is blob / arraybuffer. */
export async function decodeFrame(data: unknown): Promise<Record<string, unknown> | null> {
  try {
    let text: string | null = null;
    if (typeof data === 'string') text = data;
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
    else if (typeof Blob !== 'undefined' && data instanceof Blob) text = await data.text();
    if (text == null) return null;
    const msg = JSON.parse(text) as unknown;
    return msg && typeof msg === 'object' && !Array.isArray(msg) ? msg as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function waitIce(pc: RTCPeerConnection, signal?: AbortSignal): Promise<string[]> {
  const seen: string[] = [];
  if (pc.iceGatheringState === 'complete') return Promise.resolve(seen);
  return new Promise((resolve, reject) => {
    let settled = false;
    let quiet: number | undefined;
    let early = 0;
    let hard = 0;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(early);
      clearTimeout(hard);
      clearTimeout(quiet);
      pc.removeEventListener('icegatheringstatechange', onState);
      pc.removeEventListener('icecandidate', onCand);
      signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(seen);
    };
    const has = () => seen.length > 0 || (pc.localDescription?.sdp ?? '').includes('a=candidate:');
    const arm = () => {
      if (!has()) return;
      clearTimeout(quiet);
      quiet = window.setTimeout(() => finish(), 1000);
    };
    const onState = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const onCand = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) { finish(); return; }
      if (e.candidate.candidate) seen.push(e.candidate.candidate);
      arm();
    };
    const onAbort = () => finish(signal?.reason ?? new DOMException('aborted', 'AbortError'));
    pc.addEventListener('icegatheringstatechange', onState);
    pc.addEventListener('icecandidate', onCand);
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort);
    arm();
    // ponytail: qq/miwifi STUN never reaches complete. Ship 1s after the last candidate so the
    // guest is not stuck checking for 5s before an answer exists. No candidate at 5s is not done.
    // Hard ceiling 20s — upgrade path is a STUN server that answers.
    early = window.setTimeout(() => { if (has()) finish(); }, 5000);
    hard = window.setTimeout(() => finish(), 20000);
  });
}

function firstOf<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

function opened(ch: RTCDataChannel): Promise<void> {
  if (ch.readyState === 'open') return Promise.resolve();
  if (ch.readyState === 'closed' || ch.readyState === 'closing') return Promise.reject(new Error('channel'));
  return new Promise((resolve, reject) => {
    ch.addEventListener('open', () => resolve(), { once: true });
    ch.addEventListener('close', () => reject(new Error('channel')), { once: true });
  });
}

function liveSdp(pc: RTCPeerConnection, seen: string[]): string {
  const base = pc.localDescription?.sdp ?? '';
  if (!base) throw new Error(ICE_FAIL);
  const sdp = sealCandidates(base, seen);
  if (!sdp.includes('a=candidate:')) throw new Error(ICE_FAIL);
  return sdp;
}

export class Link {
  readonly pc: RTCPeerConnection;
  private rel: RTCDataChannel | null = null;
  private fast: RTCDataChannel | null = null;
  private relHandler: ((msg: Record<string, unknown>) => void) | null = null;
  private fastHandler: ((msg: Record<string, unknown>) => void) | null = null;
  private downHandler: (() => void) | null = null;
  private deadWait: (() => void) | null = null;
  private readonly relQueue: Record<string, unknown>[] = [];
  private readonly fastQueue: Record<string, unknown>[] = [];
  private relOut: string[] = [];
  private relChain: Promise<void> = Promise.resolve();
  private fastChain: Promise<void> = Promise.resolve();
  private downed = false;
  private readonly readyPromise: Promise<void>;

  constructor(pc: RTCPeerConnection, waitChannels: Promise<[RTCDataChannel, RTCDataChannel]>) {
    this.pc = pc;
    this.readyPromise = waitChannels.then(([rel, fast]) => {
      this.rel = rel;
      this.fast = fast;
      this.listen();
      return Promise.all([opened(rel), opened(fast)]);
    }).then(() => undefined);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'closed') this.down();
      // A false `failed` while the reliable channel is open still delivers hello/go.
      // The channel's own close is what ends the link.
      else if (pc.connectionState === 'failed' && this.rel?.readyState !== 'open') this.down();
    });
  }

  private listen(): void {
    const arm = (ch: RTCDataChannel, kind: 'rel' | 'fast') => {
      ch.binaryType = 'arraybuffer';
      ch.addEventListener('message', e => this.pump(kind, e.data));
      ch.addEventListener('close', () => this.down());
      if (kind === 'rel') ch.addEventListener('open', () => this.flushOut());
    };
    arm(this.rel!, 'rel');
    arm(this.fast!, 'fast');
    this.flushOut();
  }

  private pump(kind: 'rel' | 'fast', data: unknown): void {
    const run = () => this.takeFrame(kind, data);
    if (kind === 'rel') this.relChain = this.relChain.then(run, run);
    else this.fastChain = this.fastChain.then(run, run);
  }

  private async takeFrame(kind: 'rel' | 'fast', data: unknown): Promise<void> {
    const msg = await decodeFrame(data);
    if (!msg) return;
    const fn = kind === 'rel' ? this.relHandler : this.fastHandler;
    if (fn) fn(msg);
    else (kind === 'rel' ? this.relQueue : this.fastQueue).push(msg);
  }

  ready(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.deadWait = null;
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const fail = () => finish(() => reject(new NetFail(ICE_FAIL)));
      const timer = setTimeout(fail, 20000);
      const onAbort = () => finish(() => reject(signal?.reason ?? new DOMException('aborted', 'AbortError')));
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener('abort', onAbort);
      if (this.downed) { fail(); return; }
      this.deadWait = fail;
      this.readyPromise.then(() => finish(() => resolve()), fail);
    });
  }

  onRel(fn: (msg: Record<string, unknown>) => void): void {
    this.relHandler = fn;
    for (const msg of this.relQueue) fn(msg);
    this.relQueue.length = 0;
  }

  onFast(fn: (msg: Record<string, unknown>) => void): void {
    this.fastHandler = fn;
    for (const msg of this.fastQueue) fn(msg);
    this.fastQueue.length = 0;
  }

  onDown(fn: () => void): void {
    this.downHandler = fn;
    if (this.downed) fn();
  }

  /** What ICE managed for this failed connect, for the on-screen diagnostic line. */
  diagnose(): Promise<string> {
    return iceReport(this.pc);
  }

  sendRel(msg: unknown): void {
    this.relOut.push(JSON.stringify(msg));
    this.flushOut();
  }

  private flushOut(): void {
    const ch = this.rel;
    if (!ch || ch.readyState !== 'open') return;
    const pending = this.relOut;
    this.relOut = [];
    for (let i = 0; i < pending.length; i++) {
      try { ch.send(pending[i]); }
      catch {
        this.relOut = pending.slice(i).concat(this.relOut);
        return;
      }
    }
  }

  sendFast(msg: unknown): void {
    this.sendFastText(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /** Already-encoded frame. Dev builds can drop or delay it through window.__netChaos (the E2E run does). */
  sendFastText(text: string): void {
    const ch = this.fast;
    if (!ch || ch.readyState !== 'open' || ch.bufferedAmount > 65536) return;
    // Opt-in only: a dev run must not silently behave like a 300ms RTT link unless the
    // E2E harness explicitly installs window.__netChaos.
    const chaos = import.meta.env?.DEV
      ? (globalThis as { __netChaos?: { drop?: number; delay?: number; jitter?: number } }).__netChaos
      : undefined;
    if (!chaos) { ch.send(text); return; }
    if (Math.random() < (chaos.drop ?? 0)) return;
    const wait = (chaos.delay ?? 0) + Math.random() * (chaos.jitter ?? 0);
    setTimeout(() => { if (ch.readyState === 'open') ch.send(text); }, wait);
  }

  private down(): void {
    if (this.downed) return;
    this.downed = true;
    this.downHandler?.();
    this.deadWait?.();
  }

  close(): void {
    if (this.downed) {
      try { this.pc.close(); } catch { /* already closed */ }
      return;
    }
    try { this.sendRel({ t: 'bye' }); } catch { /* already gone */ }
    this.downed = true;
    try { this.pc.close(); } catch { /* already closed */ }
  }
}

export async function createHost(signal?: AbortSignal, ice: RTCIceServer[] = ICE_SERVERS): Promise<{ sdp: string; link: Link }> {
  const pc = new RTCPeerConnection(rtcConfig(ice));
  try {
    const gathering = waitIce(pc, signal);
    const rel = pc.createDataChannel('rel');
    const fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
    rel.binaryType = 'arraybuffer';
    fast.binaryType = 'arraybuffer';
    await pc.setLocalDescription(await pc.createOffer());
    const sdp = liveSdp(pc, await gathering);
    return { sdp, link: new Link(pc, Promise.resolve([rel, fast])) };
  } catch (err) {
    const diag = await iceReport(pc).catch(() => '');
    try { pc.close(); } catch { /* already closed */ }
    throw err instanceof Error && err.message === ICE_FAIL ? new NetFail(ICE_FAIL, diag) : err;
  }
}

export async function acceptAnswer(pc: RTCPeerConnection, sdp: string): Promise<void> {
  await pc.setRemoteDescription({ type: 'answer', sdp });
}

export async function createGuest(offer: string, signal?: AbortSignal, ice: RTCIceServer[] = ICE_SERVERS): Promise<{ sdp: string; link: Link }> {
  const pc = new RTCPeerConnection(rtcConfig(ice));
  let rel: RTCDataChannel | null = null;
  let fast: RTCDataChannel | null = null;
  let have: (pair: [RTCDataChannel, RTCDataChannel]) => void = () => {};
  const channels = new Promise<[RTCDataChannel, RTCDataChannel]>(resolve => { have = resolve; });
  const gathering = waitIce(pc, signal);
  pc.ondatachannel = e => {
    e.channel.binaryType = 'arraybuffer';
    if (e.channel.label === 'rel') rel = e.channel;
    if (e.channel.label === 'fast') fast = e.channel;
    if (rel && fast) have([rel, fast]);
  };
  try {
    // Checks start at setRemoteDescription. Finish the pool first when it is fast,
    // so those checks are not left unanswered for the whole gather.
    let seen = await firstOf(gathering, 1500);
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
    } catch {
      throw new Error('房间号无效');
    }
    await pc.setLocalDescription(await pc.createAnswer());
    if (!seen) seen = await gathering;
    const sdp = liveSdp(pc, seen);
    return { sdp, link: new Link(pc, channels) };
  } catch (err) {
    const diag = await iceReport(pc).catch(() => '');
    try { pc.close(); } catch { /* already closed */ }
    throw err instanceof Error && err.message === ICE_FAIL ? new NetFail(ICE_FAIL, diag) : err;
  }
}
