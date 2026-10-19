/* Online lobby. The select screen shows this panel only while place is 联网. */

import { PLAYABLE, ROSTER_BY_ID } from '../data/characters.ts';
import { NET_BUILD, NET_HASH, cleanCode } from '../net/proto.ts';
import { acceptAnswer, createGuest, createHost, NetFail, type Link } from '../net/rtc.ts';
import { MailError, postMail, sleep } from '../net/signal.ts';
import { MAILBOX_URL, mailboxUsable } from '../net/endpoint.ts';
import { NET_MODE, iceList } from '../net/config.ts';

const ICE_FAIL = '连不上，请换同一个 WiFi 后再开一间';
const HOST = ['正在建立连接', '房间已打开', '等待对手加入', '正在接通', '正在核对版本', '进入对战'];
const JOIN = ['正在查找这个房间', '正在接通', '正在核对版本', '进入对战'];
const MATCH = ['正在排队', '已配上', '正在接通', '正在核对版本', '进入对战'];

const CODENAME_KEY = 'mf-codename';
export const READY_SECONDS = 10;

export const CODENAME_ADJS: readonly string[] = [
  '胆小的', '迷茫的', '热血的', '认真的', '贪吃的', '犯困的',
  '闪耀的', '傲娇的', '随性的', '社恐的', '元气的', '冷酷的',
  '温柔的', '倔强的', '呆萌的', '害羞的', '潇洒的', '悠闲的',
  '率真的', '神秘的', '直率的', '贪睡的', '爱笑的', '慢热的',
];

export const CODENAME_CHARS: readonly string[] = PLAYABLE.map(c => c.name);
const ADJ_SET = new Set<string>(CODENAME_ADJS);
const CHAR_SET = new Set<string>(CODENAME_CHARS);

/** Specific sensitive / prohibited 4-digit combinations that must never be allocated. */
export const BLOCKED_CODE_NUMS: ReadonlySet<string> = new Set([
  // Domestic historical / political sensitive dates
  '8964', '6489', '0604', '6400', '0064', '1989', '8906', '0427', '0535',
  '0425', '0720', '0314', '0705', '0301', '0522', '1028', '0913', '0723',
  '1013', '1124', '1126', '1127',

  // Memorial & anti-aggression war historical dates
  '0707', '0731', '7310', '0918', '9180', '1213',

  // Major disaster / national mourning dates
  '0512', '0404', '0807',

  // International terror & extremism hate codes
  '0911', '1488', '8814', '0419', '4190', '0420', '0315', '0722',

  // Vulgar / death homophones & harassment
  '0250', '2500', '0438', '4380', '0038', '3800', '9438', '5438',
  '7456', '7480', '0748', '7484', '5174', '5418', '5488', '5942',
  '0213', '2130',

  // Emergency service numbers
  '0110', '0119', '0120', '0122', '9110',

  // Sequential runs
  '0123', '1234', '2345', '3456', '4567', '5678', '6789',
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
]);

export function isBlockedCodeNum(num: string): boolean {
  if (!/^\d{4}$/.test(num)) return true;
  // All four digits identical (0000, 1111, ..., 9999)
  if (num[0] === num[1] && num[1] === num[2] && num[2] === num[3]) return true;
  if (BLOCKED_CODE_NUMS.has(num)) return true;
  if (num.includes('64') && num.includes('89')) return true;
  if (num.includes('731') || num.includes('250') || num.includes('438') || num.includes('748')) return true;
  return false;
}

export function rollCodeNum(rand: () => number = Math.random): string {
  for (let i = 0; i < 200; i++) {
    const n = Math.floor(rand() * 10000).toString().padStart(4, '0');
    if (!isBlockedCodeNum(n)) return n;
  }
  return '0923';
}

export interface Codename {
  adj: string;
  charName: string;
  num: string;
}

export function formatCodename(c: Codename): string {
  return `${c.adj}${c.charName}#${c.num}`;
}

export function validCodenameText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const hash = raw.lastIndexOf('#');
  if (hash <= 0) return '';
  const num = raw.slice(hash + 1);
  if (isBlockedCodeNum(num)) return '';
  const prefix = raw.slice(0, hash);
  for (const adj of CODENAME_ADJS) {
    if (prefix.startsWith(adj)) {
      const charName = prefix.slice(adj.length);
      if (CHAR_SET.has(charName)) return `${adj}${charName}#${num}`;
    }
  }
  return '';
}

let cachedCodename: Codename | null = null;

function readSavedCodename(): Codename | null {
  if (cachedCodename) return cachedCodename;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CODENAME_KEY) : null;
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Codename>;
    if (typeof p.adj === 'string' && ADJ_SET.has(p.adj) && typeof p.charName === 'string' && CHAR_SET.has(p.charName) && typeof p.num === 'string' && !isBlockedCodeNum(p.num)) {
      cachedCodename = { adj: p.adj, charName: p.charName, num: p.num };
      return cachedCodename;
    }
  } catch { /* private mode */ }
  return null;
}

function saveCodename(c: Codename): void {
  cachedCodename = c;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CODENAME_KEY, JSON.stringify(c));
  } catch { /* private mode */ }
}

/** Allocate a random codename on first online visit (or first open of the codename dialog) and persist it. */
export function ensureCodename(rand: () => number = Math.random): Codename {
  const existing = readSavedCodename();
  if (existing) return existing;
  const adj = CODENAME_ADJS[Math.floor(rand() * CODENAME_ADJS.length)] ?? CODENAME_ADJS[0];
  const charName = CODENAME_CHARS[Math.floor(rand() * CODENAME_CHARS.length)] ?? '高松灯';
  const num = rollCodeNum(rand);
  const created: Codename = { adj, charName, num };
  saveCodename(created);
  return created;
}

/** Update only the adjective and character name; the 4-digit number is permanently locked. */
export function setCodenameWords(adj: string, charName: string): Codename {
  const cur = ensureCodename();
  const next: Codename = {
    adj: ADJ_SET.has(adj) ? adj : cur.adj,
    charName: CHAR_SET.has(charName) ? charName : cur.charName,
    num: cur.num,
  };
  saveCodename(next);
  readySendCode?.(formatCodename(next));
  return next;
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export interface OnlinePick { charId: string; stageId: string }
/** How the match runs: lockstep with this seed, or host snapshots (seed 0). The host decides. */
export interface NetPlan { mode: 'lock' | 'snap'; seed: number }

export interface OnlineStart {
  (role: 'host' | 'guest', hostChar: string, guestChar: string, stageId: string, link: Link, plan: NetPlan): void;
}

type Board = { labels: string[]; link: number; check: number; codeAt?: number; note?: string };

const HOST_BOARD: Board = { labels: HOST, link: 3, check: 4, codeAt: 1 };
const JOIN_BOARD: Board = { labels: JOIN, link: 1, check: 2, note: '场景由房主决定' };
const MATCH_BOARD: Board = { labels: MATCH, link: 2, check: 3 };

let job: AbortController | null = null;
let heldCode = '';
let heldKey = '';
let live: Link | null = null;
let probed = false;
let down = false;
let labels: string[] = [];
let step = 0;
let codeShown = '';
let codeAt = -1;
let startFight: OnlineStart = () => {};
let setLocked: (on: boolean) => void = () => {};
let setPeer: (charId: string, codename: string) => void = () => {};
let currentPick: () => OnlinePick = () => ({ charId: '', stageId: '' });
let readySendPick: ((charId: string) => void) | null = null;
let readySendCode: ((code: string) => void) | null = null;
let readyClickReady: (() => void) | null = null;
let turnCache: RTCIceServer[] | null = null;
let turnCacheAt = 0;

/** Called by SelectScreen when the local player changes character during the 10s ready countdown. */
export function notifyOnlinePick(charId: string): void {
  readySendPick?.(charId);
}

/** TURN credentials the mailbox mints (op 'turn') for a live room, or undefined to fall back
 *  to config's static ICE servers. Cached for 5 minutes (credentials live 10 minutes). */
async function turnIce(signal: AbortSignal, code: string, key?: string): Promise<RTCIceServer[] | undefined> {
  if (turnCache && Date.now() - turnCacheAt < 5 * 60 * 1000) return turnCache;
  try {
    const res = await postMail({ op: 'turn', code, ...(key ? { key } : {}) }, signal);
    const list = iceList(res.iceServers);
    if (list.length) {
      turnCache = list;
      turnCacheAt = Date.now();
    }
    return list.length ? list : undefined;
  } catch (err) {
    if (signal.aborted) throw err;
    return undefined;
  }
}

function cells(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.net-cells input')];
}

function typedCode(): string {
  return cleanCode(cells().map(el => el.value).join(''));
}

let timerId: number | null = null;
let timerStart = 0;
let lastWork: ((signal: AbortSignal, picked: OnlinePick) => Promise<void>) | null = null;
let currentBoard: Board | null = null;

function startTimer(): void {
  if (timerId !== null) return;
  timerStart = Date.now();
  updateTimer();
  timerId = window.setInterval(updateTimer, 1000);
}

function stopTimer(): void {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function updateTimer(): void {
  const el = document.getElementById('net-timer');
  if (!el) return;
  const elapsed = Math.floor((Date.now() - timerStart) / 1000);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

function idleLine(text: string): void {
  const el = document.getElementById('net-status');
  if (el) el.textContent = text;
}

function syncIdle(): void {
  const off = down;
  for (const id of ['net-host', 'net-join-btn', 'net-match']) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (el) el.disabled = off;
  }
  for (const el of cells()) el.disabled = off;
  const join = document.getElementById('net-join') as HTMLButtonElement | null;
  if (join) join.disabled = off || typedCode().length !== 4;
}

function clearReadyUi(): void {
  readySendPick = null;
  readySendCode = null;
  readyClickReady = null;
  if (typeof document !== 'undefined') document.body.classList.remove('net-ready-phase');
  const btnsReady = document.getElementById('net-btns-ready');
  if (btnsReady) btnsReady.hidden = true;
  setPeer('', '');
}

function showIdle(): void {
  stopTimer();
  clearReadyUi();
  currentBoard = null;

  const card = document.getElementById('net-slot-card');
  if (card) card.hidden = true;
  const mystery = document.getElementById('net-mystery-badge');
  if (mystery) mystery.hidden = false;

  const cardIdle = document.getElementById('net-card-idle');
  if (cardIdle) cardIdle.hidden = true;
  const cardActive = document.getElementById('net-card-active');
  if (cardActive) cardActive.hidden = true;
  const cardFail = document.getElementById('net-card-fail');
  if (cardFail) cardFail.hidden = true;

  idleLine('快速匹配或输入房间号');

  const note = document.getElementById('net-wait-note');
  if (note) { note.hidden = true; note.textContent = ''; }

  const btnsIdle = document.getElementById('net-btns-idle');
  if (btnsIdle) btnsIdle.hidden = false;
  const cancelBtn = document.getElementById('net-cancel');
  if (cancelBtn) {
    cancelBtn.hidden = true;
    cancelBtn.textContent = '取消';
  }

  syncIdle();
}

function draw(fail?: string, diag?: string): void {
  clearReadyUi();
  const card = document.getElementById('net-slot-card');
  if (card) card.hidden = false;
  const mystery = document.getElementById('net-mystery-badge');
  if (mystery) mystery.hidden = true;

  const cardIdle = document.getElementById('net-card-idle');
  if (cardIdle) cardIdle.hidden = true;

  const btnsIdle = document.getElementById('net-btns-idle');
  if (btnsIdle) btnsIdle.hidden = true;
  const cancelBtn = document.getElementById('net-cancel') as HTMLButtonElement | null;
  if (cancelBtn) cancelBtn.hidden = false;

  const cardActive = document.getElementById('net-card-active');
  const cardFail = document.getElementById('net-card-fail');

  if (fail) {
    stopTimer();
    if (cardActive) cardActive.hidden = true;
    if (cardFail) cardFail.hidden = false;

    const failDesc = document.getElementById('net-fail-desc');
    if (failDesc) failDesc.textContent = fail;

    if (cancelBtn) cancelBtn.textContent = '返回';
  } else {
    startTimer();
    if (cardFail) cardFail.hidden = true;
    if (cardActive) cardActive.hidden = false;
    if (cancelBtn) cancelBtn.textContent = '取消';

    const badge = document.getElementById('net-active-badge');
    const codeBox = document.getElementById('net-code-box');
    const codeText = document.getElementById('net-code-text');
    const copyBtn = document.getElementById('net-copy-btn');
    const stepDesc = document.getElementById('net-step-desc');

    if (currentBoard === HOST_BOARD) {
      if (badge) badge.textContent = '房间号';
      if (codeBox) codeBox.hidden = false;
      if (codeText) codeText.textContent = codeShown ? codeShown.split('').join(' ') : '···';
      if (copyBtn) copyBtn.hidden = !codeShown;

      if (stepDesc) {
        if (step === 0) stepDesc.textContent = '正在创建房间…';
        else if (step === 1 || step === 2) stepDesc.textContent = '等待对手加入…';
        else if (step === 3 || step === 4) stepDesc.textContent = '对手已加入，正在连接…';
        else stepDesc.textContent = '连接完成，进入对战！';
      }
    } else if (currentBoard === MATCH_BOARD) {
      if (badge) badge.textContent = '快速匹配';
      if (codeBox) codeBox.hidden = true;

      if (stepDesc) {
        if (step === 0) stepDesc.textContent = '正在寻找对手…';
        else if (step === 1) stepDesc.textContent = '已找到对手！';
        else if (step === 2 || step === 3) stepDesc.textContent = '对手就绪，正在连接…';
        else stepDesc.textContent = '连接完成，进入对战！';
      }
    } else {
      if (badge) badge.textContent = '加入房间';
      if (codeBox) codeBox.hidden = false;
      if (codeText) codeText.textContent = codeShown ? codeShown.split('').join(' ') : '····';
      if (copyBtn) copyBtn.hidden = true;

      if (stepDesc) {
        if (step === 0) stepDesc.textContent = '正在查找房间…';
        else if (step === 1 || step === 2) stepDesc.textContent = '已找到房间，正在接通…';
        else stepDesc.textContent = '连接完成，进入对战！';
      }
    }
  }

  const ol = document.getElementById('net-steps');
  if (ol) {
    ol.replaceChildren(...labels.map((label, i) => {
      const li = document.createElement('li');
      if (fail && i === step) li.className = 'fail';
      else if (i < step) li.className = 'done';
      else if (i === step) li.className = 'now';
      li.append((i < step ? '✓ ' : '') + label);
      if (codeShown && i === codeAt) {
        li.append(' · ' + codeShown);
      }
      if (fail && i === step) {
        const note = document.createElement('span');
        note.className = 'fail-note';
        note.textContent = fail;
        li.append(note);
      }
      return li;
    }));
  }
}

function show(board: Board, index: number, fail?: string): void {
  currentBoard = board;
  labels = board.labels;
  step = index;
  codeAt = board.codeAt ?? -1;
  const note = document.getElementById('net-wait-note');
  if (note) {
    note.hidden = !board.note;
    note.textContent = board.note ?? '';
  }
  draw(fail);
}

function failText(err: unknown): string {
  if (err instanceof MailError) return err.message;
  if (err instanceof Error && (err.message === ICE_FAIL || err.message === '房间号无效' || err.message === '版本不一致' || err.message === '对手已离开')) return err.message;
  return ICE_FAIL;
}

/** One line of ICE facts for a failed connect: from the error, or read off the live link. */
async function diagnose(err: unknown): Promise<string> {
  if (err instanceof NetFail && err.diag) return err.diag;
  const wire = live;
  if (!wire) return '';
  try { return await wire.diagnose(); } catch { return ''; }
}

export function noteOnlinePlace(on: boolean): void {
  if (on) ensureCodename();
  if (!on || !mailboxUsable(MAILBOX_URL)) return;
  if (probed) return;
  probed = true;
  probe();
}

function probe(): void {
  if (typeof RTCPeerConnection === 'undefined') { markDown(); return; }
  down = false;
  idleLine('可以开房');
  syncIdle();
}

function markDown(): void {
  down = true;
  idleLine('联机不可用');
  syncIdle();
}

function own(link: Link): void {
  if (live && live !== link) live.close();
  live = link;
}

export function cancelOnline(): void {
  const code = heldCode;
  const key = heldKey;
  heldCode = '';
  heldKey = '';
  codeShown = '';
  job?.abort();
  job = null;
  const wire = live;
  live = null;
  wire?.close();
  showIdle();
  setLocked(false);
  if (code) void postMail({ op: 'drop', code, ...(key ? { key } : {}) }).catch(() => {});
}

function ticket(): string {
  const a = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return a.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32).padEnd(8, 'a');
}

async function poll(
  signal: AbortSignal,
  ask: () => Promise<Record<string, unknown>>,
  ready: (res: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 60000;
  let wait = 1500;
  while (Date.now() < deadline) {
    if (signal.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
    const res = await ask();
    if (res.error === 'expired') throw new MailError('房间号无效');
    if (ready(res)) return res;
    // Gentle pacing to spare mailbox database reads.
    await sleep(wait, signal);
    wait = Math.min(3000, wait + 500);
  }
  throw new MailError('房间号无效');
}

function handshake(link: Link, role: 'host' | 'guest', picked: OnlinePick, board: Board, signal: AbortSignal): Promise<void> {
  show(board, board.check);
  return new Promise((resolve, reject) => {
    let settled = false;
    let inReady = false;
    let helloTimer = 0;
    let cdTimer = 0;
    let remain = READY_SECONDS;
    let myChar = currentPick().charId || picked.charId;
    let myCode = formatCodename(ensureCodename());
    let peerChar = '';
    let peerCode = '';
    let stageId = picked.stageId;
    let plan: NetPlan = { mode: NET_MODE, seed: NET_MODE === 'lock' ? (Math.random() * 2 ** 32) >>> 0 : 0 };
    let myReady = false;
    let peerReady = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(helloTimer);
      clearInterval(cdTimer);
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new MailError('握手超时'))), 8000);
    const stop = () => finish(() => reject(signal.reason ?? new DOMException('aborted', 'AbortError')));
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
    link.onDown(() => finish(() => reject(new MailError(inReady ? '对手已离开' : ICE_FAIL))));

    const syncReadyBtn = () => {
      const btn = document.getElementById('net-ready') as HTMLButtonElement | null;
      const textEl = document.getElementById('net-ready-text');
      const cdEl = document.getElementById('net-ready-cd');
      if (btn) btn.disabled = myReady;
      if (textEl) textEl.textContent = myReady ? '已准备' : '我准备好了';
      if (cdEl) cdEl.textContent = `(${Math.max(0, remain)}s)`;
    };

    const launchHost = () => {
      if (settled || role !== 'host') return;
      const finalHost = currentPick().charId || myChar;
      const finalGuest = peerChar || finalHost;
      link.sendRel({ t: 'go', build: NET_BUILD, hash: NET_HASH, hostChar: finalHost, guestChar: finalGuest, stageId, plan });
      finish(() => {
        live = null;
        showIdle();
        setLocked(false);
        startFight('host', finalHost, finalGuest, stageId, link, plan);
        resolve();
      });
    };

    const enterReady = () => {
      if (inReady || settled) return;
      inReady = true;
      clearTimeout(timer);
      clearInterval(helloTimer);
      stopTimer();

      const card = document.getElementById('net-slot-card');
      if (card) card.hidden = true;
      const mystery = document.getElementById('net-mystery-badge');
      if (mystery) mystery.hidden = true;
      const btnsIdle = document.getElementById('net-btns-idle');
      if (btnsIdle) btnsIdle.hidden = true;
      const cancelBtn = document.getElementById('net-cancel');
      if (cancelBtn) cancelBtn.hidden = true;
      const btnsReady = document.getElementById('net-btns-ready');
      if (btnsReady) btnsReady.hidden = false;

      setLocked(false);
      document.body.classList.add('net-ready-phase');
      setPeer(peerChar, peerCode);
      syncReadyBtn();

      readySendPick = (nextChar: string) => {
        if (settled || !ROSTER_BY_ID.has(nextChar)) return;
        myChar = nextChar;
        link.sendRel({ t: 'pick', charId: myChar });
      };
      readySendCode = (nextCode: string) => {
        if (settled) return;
        myCode = nextCode;
        link.sendRel({ t: 'code', code: myCode });
      };
      readyClickReady = () => {
        if (settled || myReady) return;
        myReady = true;
        syncReadyBtn();
        link.sendRel({ t: 'ready' });
        if (role === 'host' && peerReady) launchHost();
      };

      cdTimer = window.setInterval(() => {
        if (settled) return;
        remain--;
        syncReadyBtn();
        if (remain <= 0) {
          if (role === 'host') launchHost();
          else if (remain <= -4) finish(() => reject(new MailError('对手已离开')));
        }
      }, 1000);
    };

    link.onRel(msg => {
      if (msg.t === 'bad') { finish(() => reject(new MailError('版本不一致'))); return; }
      if (msg.t === 'leave') { finish(() => reject(new MailError('对手已离开'))); return; }
      if (msg.t === 'pick') {
        if (typeof msg.charId === 'string' && ROSTER_BY_ID.has(msg.charId)) {
          peerChar = msg.charId;
          if (inReady) setPeer(peerChar, peerCode);
        }
        return;
      }
      if (msg.t === 'code') {
        const clean = validCodenameText(msg.code);
        if (clean) {
          peerCode = clean;
          if (inReady) setPeer(peerChar, peerCode);
        }
        return;
      }
      if (msg.t === 'ready') {
        peerReady = true;
        if (role === 'host' && inReady && myReady) launchHost();
        return;
      }
      if (role === 'host' && msg.t === 'hello') {
        const guestChar = msg.charId;
        if (msg.build !== NET_BUILD || msg.hash !== NET_HASH || typeof guestChar !== 'string' || !ROSTER_BY_ID.has(guestChar)) {
          link.sendRel({ t: 'bad' });
          finish(() => reject(new MailError('版本不一致')));
          return;
        }
        if (settled) return;
        if (!inReady) {
          peerChar = guestChar;
          peerCode = validCodenameText(msg.code);
        }
        myChar = currentPick().charId || myChar;
        myCode = formatCodename(ensureCodename());
        link.sendRel({ t: 'welcome', build: NET_BUILD, hash: NET_HASH, hostChar: myChar, stageId, code: myCode, plan });
        if (myReady) link.sendRel({ t: 'ready' });
        enterReady();
        return;
      }
      if (role === 'guest' && msg.t === 'welcome') {
        const hostChar = msg.hostChar;
        const stg = msg.stageId;
        if (msg.build !== NET_BUILD || msg.hash !== NET_HASH || typeof hostChar !== 'string' || !ROSTER_BY_ID.has(hostChar) || typeof stg !== 'string') {
          finish(() => reject(new MailError('版本不一致')));
          return;
        }
        if (settled || inReady) return;
        peerChar = hostChar;
        peerCode = validCodenameText(msg.code);
        stageId = stg;
        const raw = (msg.plan ?? {}) as Partial<NetPlan>;
        plan = raw.mode === 'lock' && Number.isInteger(raw.seed) ? { mode: 'lock', seed: raw.seed! } : { mode: 'snap', seed: 0 };
        enterReady();
        return;
      }
      if (role === 'guest' && msg.t === 'go') {
        const hostChar = msg.hostChar;
        const guestChar = msg.guestChar;
        const stg = msg.stageId;
        if (msg.build !== NET_BUILD || msg.hash !== NET_HASH || typeof hostChar !== 'string' || typeof guestChar !== 'string' || typeof stg !== 'string') {
          finish(() => reject(new MailError('版本不一致')));
          return;
        }
        finish(() => {
          live = null;
          showIdle();
          setLocked(false);
          const raw = (msg.plan ?? {}) as Partial<NetPlan>;
          const goPlan: NetPlan = raw.mode === 'lock' && Number.isInteger(raw.seed) ? { mode: 'lock', seed: raw.seed! } : { mode: 'snap', seed: 0 };
          startFight('guest', hostChar, guestChar, stg, link, goPlan);
          resolve();
        });
      }
    });
    if (role === 'guest') {
      const sendHello = () => {
        myChar = currentPick().charId || myChar;
        myCode = formatCodename(ensureCodename());
        link.sendRel({ t: 'hello', build: NET_BUILD, hash: NET_HASH, charId: myChar, code: myCode, soft: document.body.classList.contains('touch') });
      };
      sendHello();
      // One dropped hello used to sit here until the 8s timeout. Keep knocking until welcome/go/bad.
      helloTimer = window.setInterval(sendHello, 1000);
    }
  });
}

async function offerSide(signal: AbortSignal, picked: OnlinePick, code: string, key: string, link: Link, sdp: string, board: Board): Promise<void> {
  heldCode = code;
  heldKey = key;
  codeShown = board.codeAt === undefined ? '' : code;
  await postMail({ op: 'offer', code, key, sdp }, signal);
  show(board, board.link);
  const answer = await poll(signal, () => postMail({ op: 'poll', code }, signal), res => typeof res.sdp === 'string');
  show(board, board.link);
  await acceptAnswer(link.pc, String(answer.sdp));
  await link.ready(signal);
  heldCode = '';
  heldKey = '';
  void postMail({ op: 'drop', code, key }).catch(() => {});
  await handshake(link, 'host', picked, board, signal);
}

async function joinSide(signal: AbortSignal, picked: OnlinePick, code: string, board: Board, from: number): Promise<void> {
  show(board, from);
  const taken = await poll(signal, () => postMail({ op: 'take', code }, signal), res => typeof res.sdp === 'string');
  show(board, board.link);
  const guest = await createGuest(String(taken.sdp), signal, await turnIce(signal, code));
  own(guest.link);
  await postMail({ op: 'answer', code, sdp: guest.sdp }, signal);
  await guest.link.ready(signal);
  await handshake(guest.link, 'guest', picked, board, signal);
}

async function asHost(signal: AbortSignal, picked: OnlinePick): Promise<void> {
  show(HOST_BOARD, 0);
  const opened = await postMail({ op: 'open' }, signal);
  const code = typeof opened.code === 'string' ? opened.code : '';
  const key = typeof opened.key === 'string' ? opened.key : '';
  if (!cleanCode(code) || cleanCode(code) !== code || !key) throw new MailError('联机不可用');
  heldCode = code;
  heldKey = key;
  codeShown = code;
  show(HOST_BOARD, 2);
  await poll(signal, () => postMail({ op: 'poll', code }, signal), res => res.joined === true || typeof res.sdp === 'string');
  show(HOST_BOARD, HOST_BOARD.link);
  const host = await createHost(signal, await turnIce(signal, code, key));
  own(host.link);
  await offerSide(signal, picked, code, key, host.link, host.sdp, HOST_BOARD);
}

async function matched(signal: AbortSignal, picked: OnlinePick): Promise<void> {
  show(MATCH_BOARD, 0);
  const id = ticket();
  const deadline = Date.now() + 45000;
  let role: 'host' | 'guest' | '' = '';
  let code = '';
  let key = '';
  while (Date.now() < deadline) {
    if (signal.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
    const res = await postMail({ op: 'queue', ticket: id, build: NET_BUILD, hash: NET_HASH }, signal);
    if ((res.role === 'host' || res.role === 'guest') && typeof res.code === 'string') {
      role = res.role;
      code = res.code;
      key = typeof res.key === 'string' ? res.key : '';
      break;
    }
    await sleep(3500, signal);
  }
  if (!role || !code) throw new MailError('没有对手');
  show(MATCH_BOARD, MATCH_BOARD.link);
  if (role === 'host') {
    heldCode = code;
    heldKey = key;
    const host = await createHost(signal, await turnIce(signal, code, key));
    own(host.link);
    await offerSide(signal, picked, code, key, host.link, host.sdp, MATCH_BOARD);
  } else await joinSide(signal, picked, code, MATCH_BOARD, 2);
}

function run(work: (signal: AbortSignal, picked: OnlinePick) => Promise<void>): void {
  cancelOnline();
  lastWork = work;
  const picked = currentPick();
  if (!picked.charId) return;
  const ac = new AbortController();
  job = ac;
  setLocked(true);
  work(ac.signal, picked).catch(async err => {
    if (ac.signal.aborted) return;
    console.error(err);
    setLocked(true);
    const diag = await diagnose(err);
    if (diag) console.info('[联机诊断] ' + diag);
    draw(failText(err), diag);
  }).finally(() => {
    if (job === ac) job = null;
  });
}

export function bindOnline(
  pick: () => OnlinePick,
  start: OnlineStart,
  lock: (on: boolean) => void,
  onPeer: (charId: string, codename: string) => void = () => {},
): void {
  currentPick = pick;
  startFight = start;
  setLocked = lock;
  setPeer = onPeer;
  $('net-host').onclick = () => run(asHost);
  $('net-match').onclick = () => run(matched);
  const joinBtn = document.getElementById('net-join-btn');
  if (joinBtn) {
    joinBtn.onclick = () => {
      const dlg = document.getElementById('net-join-dialog') as HTMLDialogElement | null;
      if (!dlg) return;
      for (const el of cells()) el.value = '';
      syncIdle();
      dlg.showModal();
      const first = cells()[0];
      if (first) setTimeout(() => first.focus(), 50);
    };
  }
  const closeJoin = document.getElementById('close-net-join');
  if (closeJoin) closeJoin.onclick = () => (document.getElementById('net-join-dialog') as HTMLDialogElement | null)?.close();
  const cancelJoin = document.getElementById('cancel-net-join');
  if (cancelJoin) cancelJoin.onclick = () => (document.getElementById('net-join-dialog') as HTMLDialogElement | null)?.close();

  const joinSubmit = document.getElementById('net-join');
  if (joinSubmit) {
    joinSubmit.onclick = () => {
      const code = typedCode();
      if (code.length !== 4) return;
      (document.getElementById('net-join-dialog') as HTMLDialogElement | null)?.close();
      run((signal, picked) => joinSide(signal, picked, code, JOIN_BOARD, 0));
    };
  }
  $('net-cancel').onclick = () => cancelOnline();
  const leaveBtn = document.getElementById('net-leave');
  if (leaveBtn) {
    leaveBtn.onclick = () => {
      live?.sendRel({ t: 'leave' });
      cancelOnline();
    };
  }
  const readyBtn = document.getElementById('net-ready');
  if (readyBtn) {
    readyBtn.onclick = () => readyClickReady?.();
  }

  const retryBtn = document.getElementById('net-retry-btn');
  if (retryBtn) retryBtn.onclick = () => { if (lastWork) run(lastWork); };
  const backBtn = document.getElementById('net-back-btn');
  if (backBtn) backBtn.onclick = () => cancelOnline();
  const copyBtn = document.getElementById('net-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      if (!codeShown) return;
      void navigator.clipboard?.writeText(codeShown).then(() => {
        copyBtn.textContent = '✓ 已复制';
        setTimeout(() => { copyBtn.textContent = '复制'; }, 1800);
      }).catch(() => {});
    };
  }

  const boxes = cells();
  boxes.forEach((el, i) => {
    el.addEventListener('input', () => {
      const next = cleanCode(el.value).slice(-1);
      if (el.value !== next) el.value = next;
      if (next && boxes[i + 1]) boxes[i + 1].focus();
      syncIdle();
    });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Backspace' && !el.value && boxes[i - 1]) boxes[i - 1].focus();
      if (ev.key === 'Enter' && typedCode().length === 4) {
        const joinBtn = document.getElementById('net-join') as HTMLButtonElement | null;
        if (joinBtn && !joinBtn.disabled) joinBtn.click();
      }
    });
    el.addEventListener('paste', ev => {
      const text = cleanCode(ev.clipboardData?.getData('text') ?? '').slice(0, 4);
      if (!text) return;
      ev.preventDefault();
      boxes.forEach((box, n) => { box.value = text[n] ?? ''; });
      (boxes[Math.min(text.length, 3)]).focus();
      syncIdle();
    });
  });
  syncIdle();
}
