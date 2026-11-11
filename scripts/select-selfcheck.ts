import { PLAYABLE, PUBLIC_ROSTER } from '../src/data/characters.ts';
import { readRun, writeRun } from '../src/ui/challenge.ts';
import { SelectScreen } from '../src/ui/select.ts';

/** Count DOM work on the real selection path; this does not emulate browser layout or paint. */
export function checkSelect(): void {
  const names = ['document', 'window', 'localStorage', 'matchMedia', 'getComputedStyle'] as const;
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const check = (ok: boolean, message: string) => { if (!ok) throw Error('FAIL: ' + message); };
  let writes = 0, reads = 0, skillBuilds = 0;
  let cards: Node[] = [];
  class Node {
    dataset: Record<string, string> = {};
    classes = new Set<string>();
    classList = {
      contains: (s: string) => this.classes.has(s),
      add: (s: string) => { this.classes.add(s); },
      remove: (s: string) => { this.classes.delete(s); },
      toggle: (s: string, on: boolean) => { if (on) this.classes.add(s); else this.classes.delete(s); },
    };
    attrs = new Map<string, string>();
    style = { setProperty() {}, removeProperty() {}, backgroundImage: '' };
    children = new Map<string, Node>();
    parentElement: Node | null = null;
    onclick?: () => void;
    private text = '';
    private html = '';
    private invisible = false;
    readonly id: string;
    constructor(id: string) { this.id = id; }
    get textContent() { return this.text; }
    set textContent(v: string) { writes++; this.text = v; }
    get innerHTML() { return this.html; }
    set innerHTML(v: string) {
      writes++;
      if (this.id === 'skills') skillBuilds++;
      if (this.id === 'roster') cards = Array.from(v.matchAll(/data-index="(\d+)"/g), ([, i]) => {
        const card = new Node('card' + i);
        card.dataset.index = i;
        card.children.set('.slot-tag', new Node('tag' + i));
        card.children.set('canvas', new Node('canvas' + i));
        return card;
      });
      this.html = v;
    }
    get hidden() { return this.invisible; }
    set hidden(v: boolean) { writes++; this.invisible = v; }
    get offsetWidth() { reads++; return 100; }
    get clientWidth() { reads++; return 100; }
    get clientHeight() { reads++; return 100; }
    getBoundingClientRect() { reads++; return { left: 0, top: 0, bottom: 100, width: 100, height: 100 }; }
    setAttribute(k: string, v: string) { writes++; this.attrs.set(k, v); }
    querySelector(selector: string): Node | null {
      if (this.id === 'roster') return cards[Number(selector.match(/data-index="(\d+)"/)?.[1])] ?? null;
      return this.children.get(selector) ?? null;
    }
    querySelectorAll() { return this.id === 'roster' ? cards : []; }
    closest() { return this.parentElement; }
    listeners = new Map<string, Set<(ev: { target: Node; animationName: string }) => void>>();
    addEventListener(name: string, fn: (ev: { target: Node; animationName: string }) => void) {
      let list = this.listeners.get(name);
      if (!list) this.listeners.set(name, list = new Set());
      list.add(fn);
    }
    removeEventListener(name: string, fn: (ev: { target: Node; animationName: string }) => void) {
      this.listeners.get(name)?.delete(fn);
    }
    endAnimation(animationName: string, target: Node = this) {
      for (const fn of [...this.listeners.get('animationend') ?? []]) fn({ target, animationName });
    }
    focus() {}
  }
  const nodes = new Map<string, Node>();
  const node = (id: string) => {
    let n = nodes.get(id);
    if (!n) nodes.set(id, n = new Node(id));
    return n;
  };
  for (const suffix of ['1', '2', 'A', 'E']) node('portrait' + suffix).parentElement = node('preview' + suffix);
  const install = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true });
  try {
    install('document', { getElementById: node, querySelectorAll: () => [], body: node('body') });
    install('window', { setTimeout: () => 0, setInterval: () => 0, addEventListener() {} });
    const storage = new Map<string, string>();
    install('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
    install('matchMedia', () => ({ matches: true }));
    install('getComputedStyle', () => { reads++; return { display: 'block' }; });
    let shown = 0;
    const views = new Map([[PLAYABLE[0].id, { draw() {}, idleReady: () => false }]]);
    const select = new SelectScreen(PLAYABLE, views, () => {}, () => {}, () => { shown++; });
    // Private methods are intentionally exercised through a test-only structural view.
    const screen = select as unknown as {
      selected: number[]; side: number; who: ('player' | 'cpu')[];
      place: 'local' | 'net'; netLocked: boolean; netPeerCharId: string;
      pick(i: number): void; refreshSelection(indices?: Iterable<number>): void;
      load(i: number): void; wantFace(i: number): Promise<void>;
      near: Set<number>; portrait(...args: unknown[]): void; rosterCanvases: Node[];
    };
    select.mount();
    writes = reads = skillBuilds = 0;
    const before = shown;
    screen.pick(2);
    check(!cards[2].classes.has('picked'), 'reduced motion never leaves an animation class waiting for a disabled animation');
    console.log(`select work: ${cards.length} cards, pick writes=${writes}, layout reads=${reads}, skill builds=${skillBuilds}`);
    check(cards[2].attrs.get('aria-pressed') === 'true' && cards[0].attrs.get('aria-pressed') === 'false', 'picking moves the pressed state');
    check(node('name1').textContent === PLAYABLE[2].name && node('flavor').textContent.includes(PLAYABLE[2].title), 'picking updates the portrait name and move details');
    check(shown === before + 1, 'a changed cast requests its portraits');
    // Budget counts operations, not machine-dependent milliseconds.
    check(writes < 30 && reads <= 1, 'a pick only updates affected cards, with at most one active entrance restart');
    writes = reads = skillBuilds = 0;
    screen.pick(2);
    check(skillBuilds === 0 && shown === before + 1, 'reselecting the same character keeps the skill DOM and image queue');
    select.refresh();
    check(skillBuilds === 0, 'unchanged full refresh keeps the skill DOM');
    node('body').classList.add('touch');
    select.refresh();
    check(skillBuilds === 1 && node('skills').innerHTML.includes('<kbd>轻</kbd>'), 'changing controls invalidates cached move labels');
    node('body').classList.remove('touch');
    select.mode = 'team';
    screen.selected = [2, 2, 2, 3];
    screen.who = ['player', 'cpu', 'player', 'cpu'];
    select.refresh();
    check(['p1', 'ally', 'p2'].every(c => cards[2].classes.has(c)), 'one character can carry all team markers');
    screen.side = 2;
    screen.pick(4);
    check(cards[2].classes.has('p1') && cards[2].classes.has('ally') && !cards[2].classes.has('p2'), 'changing one team slot retains the other slots on the old card');
    check(cards[4].classes.has('p2') && node('name2').textContent === PLAYABLE[4].name, 'the right team slot updates');
    select.mode = 'challenge';
    screen.side = 0;
    screen.selected = [2, 3];
    select.refresh();
    screen.pick(4);
    check(cards[4].classes.has('p1') && !cards[3].classes.has('p2'), 'challenge highlights only the player pick');
    screen.netLocked = true;
    screen.pick(5);
    check(screen.selected[0] === 4, 'a locked selection still rejects changes');
    screen.netLocked = false;
    screen.place = 'net';
    screen.refreshSelection();
    screen.pick(6);
    check(node('name2').textContent === '等待对手' && node('p1tag').textContent === '你', 'a network pick keeps the unknown peer blank and local labels correct');
    screen.netPeerCharId = PLAYABLE[7].id;
    screen.pick(8);
    check(node('name2').textContent === PLAYABLE[7].name && node('p2tag').textContent === '对手', 'local network picks preserve the peer portrait');
    install('matchMedia', () => ({ matches: false }));
    screen.pick(8);
    cards[8].endAnimation('card-pop');
    check(cards[8].classes.has('picked'), 'the shorter card pop must not cut off the avatar shutter or sheen');
    cards[8].endAnimation('face-shutter', new Node('image'));
    check(cards[8].classes.has('picked'), 'a child animation cannot finish the whole pick effect');
    cards[8].endAnimation('card-sheen');
    check(!cards[8].classes.has('picked'), 'the last pick effect releases its class');
    install('matchMedia', () => ({ matches: true }));
    screen.place = 'local';
    // Avatars also warm the idle crop through the existing bounded background queue.
    const requested: [string, boolean | undefined][] = [];
    select.onNeedSprite = (c, background) => { requested.push([c.id, background]); };
    screen.wantFace = () => Promise.resolve();
    select.setRosterThumb('face');
    screen.load(0);
    check(requested.some(([id, background]) => id === PLAYABLE[0].id && background), 'face cards start the idle crop with the avatar, before a click');
    let clears = 0;
    const waitingCanvas = Object.assign(new Node('waiting'), {
      width: 96, height: 96, getContext: () => ({ clearRect: () => { clears++; } }),
    });
    screen.portrait(waitingCanvas, PLAYABLE[0], 1, .46, 93);
    screen.portrait(waitingCanvas, PLAYABLE[0], 1, .46, 93);
    check(clears === 1 && waitingCanvas.classes.has('pending'), 'a pending portrait clears once while waiting for its image');
    const painted: Node[] = [];
    screen.rosterCanvases = cards;
    screen.near.clear();
    screen.near.add(1);
    cards[1].dataset.view = 'sprite';
    cards[2].dataset.view = 'sprite';
    screen.portrait = canvas => { painted.push(canvas as Node); };
    select.animate(100);
    check(painted.includes(cards[1]) && !painted.includes(cards[2]) && !painted.includes(cards[0]), 'roster drawing visits only nearby sprite cards');

    const mizuho = PLAYABLE.findIndex(c => c.id === 'mizuho');
    const viola = PLAYABLE.findIndex(c => c.id === 'viola');
    storage.set('mf-select-state', JSON.stringify({ mode: 'cpu', selected: [viola, mizuho], who: ['player', 'cpu'], difficulty: 1, side: 0 }));
    let started = 0;
    const legacy = new SelectScreen(PLAYABLE, views, () => { started++; }, () => {});
    legacy.mount();
    check(!legacy.showsHidden && cards.length === PUBLIC_ROSTER.length && !node('roster').innerHTML.includes('丰川瑞穗'), 'the hidden character is absent by default');
    check(legacy.setup().characters[0].id === 'viola' && !legacy.setup().characters[1].hidden, 'legacy indices preserve public picks and replace hidden picks');
    legacy.setShowHidden(true);
    check(cards.length === PLAYABLE.length && node('roster').innerHTML.includes('丰川瑞穗'), 'the preference reveals the hidden card');
    const rand = Math.random;
    try {
      for (let i = 0; i < PLAYABLE.length; i++) {
        Math.random = () => (i + .5) / PLAYABLE.length;
        node('random').onclick?.();
        check(!legacy.setup().characters[0].hidden, 'random never picks a revealed hidden character');
      }
    } finally { Math.random = rand; }
    cards[mizuho].onclick?.();
    const restored = new SelectScreen(PLAYABLE, views, () => {}, () => {});
    check(restored.showsHidden && restored.setup().characters[0].id === 'mizuho', 'opt-in and manual hidden picks survive reload');
    const reordered = new SelectScreen([...PLAYABLE].reverse(), views, () => {}, () => {});
    check(reordered.setup().characters[0].id === 'mizuho', 'saved character IDs survive roster reorder');

    const lobby = legacy as unknown as typeof screen;
    legacy.mode = 'team';
    lobby.who = ['cpu', 'player', 'cpu', 'cpu'];
    lobby.selected = [mizuho, viola, 0, 1];
    lobby.place = 'net';
    lobby.netPeerCharId = PLAYABLE[viola].id;
    lobby.refreshSelection();
    check(legacy.onlinePick().charId === 'mizuho' && node('name2').textContent === PLAYABLE[viola].name, 'online uses its two displayed seats even after a local team selection');
    node('body').classList.add('net-ready-phase');
    const removedCard = cards[mizuho];
    legacy.setShowHidden(false);
    check(!legacy.setup().characters[0].hidden && cards.length === PUBLIC_ROSTER.length, 'turning the setting off removes the card and replaces the active pick');
    check(!node('body').classList.contains('net-ready-phase'), 'removing a hidden pick cancels an already-unlocked online ready phase');
    const fallback = legacy.onlinePick().charId;
    removedCard.onclick?.();
    check(legacy.onlinePick().charId === fallback, 'a removed card cannot select a different fighter at its old index');
    lobby.place = 'net';
    lobby.netPeerCharId = 'mizuho';
    lobby.refreshSelection();
    check(node('name2').textContent === PLAYABLE[mizuho].name && legacy.onlinePick().charId !== 'mizuho', 'a peer can still deliberately pick a hidden fighter');
    lobby.place = 'local';
    restored.setRosterThumb('face');
    check(!new SelectScreen(PLAYABLE, views, () => {}, () => {}).showsHidden, 'a stale tab saving ordinary selection state cannot overwrite the hidden preference');

    storage.set('mf-challenge-run', JSON.stringify({ stage: 3, charId: 'mizuho', enemyIds: ['mizuho', PUBLIC_ROSTER[0].id], picks: ['burn'], armed: true, newBest: true }));
    const run = readRun('brawl');
    check(run?.stage === 3 && run.picks[0] === 'burn' && run.enemies[1] === PUBLIC_ROSTER[0] && !run.enemies[0].hidden && run.enemies[0] !== run.enemies[1] && !run.newBest, 'a legacy run replaces only the hidden foe and retains its deck and stage');
    legacy.mode = 'challenge';
    lobby.selected = lobby.selected.slice(0, 2);
    lobby.who = ['player', 'cpu', 'cpu'];
    legacy.refresh();
    node('start').onclick?.();
    check(started === 0 && node('start').attrs.get('aria-disabled') === 'true' && !legacy.setup().characters[0].hidden, 'a saved hidden lead waits off the select stage when the preference is off');
    legacy.setShowHidden(true);
    node('start').onclick?.();
    check(started === 1 && legacy.setup().characters[0].id === 'mizuho', 're-enabling the setting restores access to the saved run');
    if (!run) throw Error('missing challenge fixture');
    install('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } });
    writeRun('brawl', { ...run, stage: 4 });
    check(readRun('brawl')?.stage === 4, 'a failed challenge save keeps the current stage in this tab');
    writeRun('brawl', null);
    check(readRun('brawl') === null, 'a failed removal does not revive the previous challenge');
    install('localStorage', { getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => storage.delete(k) });
    writeRun('brawl', null);
  } finally {
    names.forEach((name, i) => {
      const descriptor = originals[i];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}
