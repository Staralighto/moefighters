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

export const CODE_SALT = 'mf_codename_salt_v1';

export function hashCodeNum(num: string): string {
  let h = 0x811c9dc5;
  const s = CODE_SALT + num;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const BLOCKED_CODE_HASHES: ReadonlySet<string> = new Set([
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

export function isBlockedCodeNum(num: string): boolean {
  if (!/^\d{4}$/.test(num)) return true;
  // All four digits identical (0000, 1111, ..., 9999)
  if (num[0] === num[1] && num[1] === num[2] && num[2] === num[3]) return true;
  return BLOCKED_CODE_HASHES.has(hashCodeNum(num));
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

/** Ticket still sitting in the match queue. Cleared once the server has been asked to remove it. */
let queueTicket = '';
/** Stable per-page id: a stale queue row from this page must never pair with its retry. */
let queueSid = '';
/** In-flight removal. The next match waits for this, or a retry pairs with the ticket it just abandoned. */
let dropping: Promise<void> = Promise.resolve();

function releaseTicket(): Promise<void> {
  const id = queueTicket;
  queueTicket = '';
  if (!id) return dropping;
  // A hung mailbox request must not wedge every later search; the server TTL cleans up a
  // drop that really did not make it.
  dropping = postMail({ op: 'queue', ticket: id, drop: true }, AbortSignal.timeout(3000)).then(() => {}, () => {});
  return dropping;
}

export function cancelOnline(): Promise<void> {
  const gate = releaseTicket();
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
  return gate;
}

function ticket(): string {
  const a = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return a.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32).padEnd(8, 'a');
}

async function poll(
  signal: AbortSignal,
  ask: () => Promise<Record<string, unknown>>,
  ready: (res: Record<string, unknown>) => boolean,
  pace = 0,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 60000;
  // SDP waits ramp 1.5s → 3s. The room-code wait passes a flat pace; a person types slower than that.
  let wait = pace || 1500;
  while (Date.now() < deadline) {
    if (signal.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
    const res = await ask();
    if (res.error === 'expired') throw new MailError('房间号无效');
    if (ready(res)) return res;
    await sleep(wait, signal);
    if (!pace) wait = Math.min(3000, wait + 500);
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
  await poll(signal, () => postMail({ op: 'poll', code }, signal), res => res.joined === true || typeof res.sdp === 'string', 5000);
  show(HOST_BOARD, HOST_BOARD.link);
  const host = await createHost(signal, await turnIce(signal, code, key));
  own(host.link);
  await offerSide(signal, picked, code, key, host.link, host.sdp, HOST_BOARD);
}

async function matched(signal: AbortSignal, picked: OnlinePick): Promise<void> {
  show(MATCH_BOARD, 0);
  const id = ticket();
  queueSid ||= ticket();
  queueTicket = id;
  const deadline = Date.now() + 45000;
  let role: 'host' | 'guest' | '' = '';
  let code = '';
  let key = '';
  let waiting = true;
  try {
    while (Date.now() < deadline) {
      if (signal.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
      const res = await postMail({ op: 'queue', ticket: id, sid: queueSid, build: NET_BUILD, hash: NET_HASH }, signal);
      if ((res.role === 'host' || res.role === 'guest') && typeof res.code === 'string') {
        role = res.role;
        code = res.code;
        key = typeof res.key === 'string' ? res.key : '';
        break;
      }
      await sleep(5000, signal);
    }
    if (!role || !code) throw new MailError('没有对手');
    waiting = false;
    show(MATCH_BOARD, MATCH_BOARD.link);
    if (role === 'host') {
      heldCode = code;
      heldKey = key;
      const host = await createHost(signal, await turnIce(signal, code, key));
      own(host.link);
      await offerSide(signal, picked, code, key, host.link, host.sdp, MATCH_BOARD);
    } else await joinSide(signal, picked, code, MATCH_BOARD, 2);
  } finally {
    // Cancel already took the id and is removing it. A matched ticket is already gone on the server.
    if (waiting && queueTicket === id) void releaseTicket();
    else if (queueTicket === id) queueTicket = '';
  }
}

function run(work: (signal: AbortSignal, picked: OnlinePick) => Promise<void>): void {
  const gate = cancelOnline();
  lastWork = work;
  const picked = currentPick();
  if (!picked.charId) return;
  const ac = new AbortController();
  job = ac;
  setLocked(true);
  // The previous queue row has to be gone before this ticket is created, or a fast retry pairs with it.
  gate.then(() => {
    if (job !== ac) return;
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
