import { GATE_DELAY_MS, GATE_MAX_WAIT_MS, GATE_MIN_SHOW_MS } from '../src/ui/loadGate.ts';

const check = (ok: unknown, message: string) => { if (!ok) throw Error('hub: ' + message); };
const box = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };

class Node extends EventTarget {
  hidden = true;
  inert = false;
  complete = false;
  loading = 'lazy';
  parentElement: Node | null = null;
  dataset: Record<string, string> = {};
  styles = new Map<string, string>();
  style = {
    setProperty: (name: string, value: string) => this.styles.set(name, value),
    removeProperty: (name: string) => this.styles.delete(name),
  };
  attrs = new Map<string, string>();
  nodes = new Map<string, Node>();
  classes = new Set<string>();
  images: Node[] = [];
  classList = {
    add: (...names: string[]) => names.forEach(n => this.classes.add(n)),
    remove: (...names: string[]) => names.forEach(n => this.classes.delete(n)),
    toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  querySelector(sel: string): Node {
    if (!this.nodes.has(sel)) this.nodes.set(sel, new Node());
    return this.nodes.get(sel)!;
  }
  querySelectorAll() { return this.images; }
  append(el: Node) { el.parentElement = this; this.nodes.set('child', el); }
  getBoundingClientRect() { return box; }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  toggleAttribute(name: string, on: boolean) { if (on) this.setAttribute(name, ''); else this.removeAttribute(name); }
  focus() {}
}

export async function checkHub(): Promise<void> {
  const doc = new Node();
  const hub = doc.querySelector('hub'), scroll = doc.querySelector('hub-scroll'), lobby = doc.querySelector('lobby');
  const preparing = () => hub.classes.has('preparing');
  const bar = () => hub.nodes.get('child');
  let now = 0, next = 0;
  const jobs = new Map<number, { at: number; run: () => void }>();
  const later = (run: () => void, ms = 0) => { jobs.set(++next, { at: now + ms, run }); return next; };
  const cancel = (id: number) => { jobs.delete(id); };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const pending = [...jobs].sort(([, a], [, b]) => a.at - b.at)[0];
      if (!pending || pending[1].at > end) break;
      const [id, job] = pending;
      cancel(id);
      now = Math.max(now, job.at);
      job.run();
    }
    now = Math.max(now, end);
  };
  const globals = {
    document: Object.assign(doc, { documentElement: new Node(), body: new Node(), getElementById: (id: string) => doc.querySelector(id), createElement: () => new Node() }),
    window: { addEventListener() {}, innerWidth: 1280, innerHeight: 720, visualViewport: { width: 1280, height: 720, offsetTop: 0 } },
    matchMedia: () => ({ matches: true }),
    performance: { now: () => now },
    setTimeout: later,
    clearTimeout: cancel,
    requestAnimationFrame: (run: () => void) => later(run, 16),
    cancelAnimationFrame: cancel,
  };
  const saved = Object.entries(globals).map(([key, value]) => {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    return [key, old] as const;
  });
  try {
    const { openHub, closeHub, registerHubPage, hubSignal, appendHubItems } = await import('../src/ui/hub.ts');
    const { settleAppHeight } = await import('../src/ui/appHeight.ts');
    const { window: view } = globals;
    const viewport = view.visualViewport;
    const styles = globals.document.documentElement.styles;
    view.innerWidth = viewport.width = 390;
    view.innerHeight = 844;
    viewport.height = 780;
    viewport.offsetTop = 32;
    settleAppHeight();
    check(styles.get('--app-pin-h') === '780px' && styles.get('--app-top') === '32px', 'a matching, shorter visual viewport pins the shell');
    view.innerWidth = 844;
    view.innerHeight = 390;
    advance(16);
    check(!styles.has('--app-pin-h') && styles.get('--app-top') === '0px', 'rotation clears the old portrait pin on the next frame without a resize event');
    Object.assign(viewport, { width: 770, height: 330, offsetTop: 0 });
    advance(16);
    check(!styles.has('--app-pin-h'), 'a stale width cannot pin the shell even when both measurements are landscape');
    viewport.width = 844;
    advance(16);
    check(styles.get('--app-pin-h') === '330px', 'a settled shorter viewport pins the shell once its width agrees');
    view.innerHeight = 330;
    advance(16);
    check(styles.get('--app-h') === '330px' && !styles.has('--app-pin-h'), 'an equal numeric height still releases the pin when viewport clipping ends');
    view.innerWidth = 390;
    view.innerHeight = 844;
    advance(16);
    check(styles.get('--app-h') === '844px' && !styles.has('--app-pin-h'), 'rotating back discards the shorter landscape viewport');
    const chunks: string[] = [];
    const list = { insertAdjacentHTML: (_where: string, html: string) => chunks.push(html) } as unknown as HTMLElement;
    const items = appendHubItems(list, ['a', 'b', 'c', 'd', 'e'], (item, i) => `${i}${item}`);
    items.next();
    check(chunks.join('|') === '0a1b2c3d', 'a list yields after the first four items');
    items.next();
    check(chunks.join('|') === '0a1b2c3d|4e' && items.next().done, 'resuming preserves list order and indices');
    let fastReady = 0;
    registerHubPage('music', { title: 'music', en: '', mount() {}, ready() { fastReady++; } });
    openHub('music');
    check(preparing() && scroll.inert && !hub.hidden && fastReady === 0, 'shell and return are available before construction');
    advance(16);
    check(fastReady === 1 && !preparing() && !scroll.inert && !bar(), 'fast content does not wait for a status bar');
    closeHub();

    let visits = 0, builds = 0, ready = 0;
    registerHubPage('locker', { title: 'locker', en: '', mount() { builds++; }, *enter() {
      visits++;
      for (let i = 0; i < 7; i++) { now += 20; yield; }
    }, ready() { ready++; } });
    openHub('locker');
    advance(GATE_DELAY_MS + 20);
    check(preparing() && bar()?.hidden === false && ready === 0, 'cold CPU work alone shows feedback between batches');
    const previous = hubSignal();
    closeHub();
    check(previous?.aborted && hub.hidden && !lobby.attrs.has('inert') && bar()?.hidden, 'return cancels the old visit immediately');
    openHub('locker');
    advance(GATE_DELAY_MS + 7 * 50 + GATE_MIN_SHOW_MS);
    check(visits === 2 && builds === 1 && ready === 1 && !preparing(), 'reopening the same page commits only the latest visit');
    closeHub();

    const img = new Node();
    img.setAttribute('src', '/first-screen.webp');
    let imageReady = 0;
    registerHubPage('shop', { title: 'shop', en: '', mount(host) { (host as unknown as Node).images = [img]; }, ready() { imageReady++; } });
    openHub('shop');
    advance(GATE_DELAY_MS);
    check(img.loading === 'eager' && bar()?.hidden === false && preparing(), 'pending visible image uses the same status bar');
    img.dispatchEvent(new Event('error'));
    advance(GATE_MIN_SHOW_MS);
    check(imageReady === 1 && !preparing(), 'image failure allows the first screen to open with fallback art');
    closeHub();
    openHub('shop');
    advance(16);
    img.dispatchEvent(new Event('load'));
    advance(GATE_DELAY_MS);
    check(imageReady === 2 && bar()?.hidden && !preparing(), 'a first-screen resource that loads quickly never flashes the status bar');
    closeHub();
    openHub('shop');
    advance(GATE_MAX_WAIT_MS + GATE_MIN_SHOW_MS);
    check(imageReady === 3 && !preparing(), 'a stalled image cannot block the page indefinitely');
    closeHub();
  } finally {
    for (const [key, old] of saved) {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
