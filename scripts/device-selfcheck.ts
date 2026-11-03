/** Exercise the real device watcher without a browser; every replaced global is restored. */
export async function checkDevice(): Promise<void> {
  const names = ['window', 'document', 'screen', 'navigator', 'matchMedia'] as const;
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const classes = new Set<string>();
  const queries = new Map<string, { matches: boolean; addListener(fn: () => void): void }>();
  const changes: (() => void)[] = [];
  const win = new EventTarget();
  const display = { width: 1024, height: 768 };
  const hardware = { maxTouchPoints: 5 };
  const check = (ok: boolean, message: string) => { if (!ok) throw Error('FAIL: ' + message); };
  const install = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true });
  try {
    install('window', win);
    install('document', { documentElement: {}, body: { classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, on: boolean) => { if (on) classes.add(name); else classes.delete(name); },
    } } });
    install('screen', display);
    install('navigator', hardware);
    install('matchMedia', (query: string) => {
      const q = { matches: false, addListener: (fn: () => void) => { changes.push(fn); } };
      queries.set(query, q);
      return q;
    });
    const device = await import('../src/ui/device.ts');
    const fine = [...queries.entries()].find(([query]) => query.includes('pointer: fine'))![1];
    fine.matches = true;
    device.applyTouchDevice();
    check(classes.has('keys') && !classes.has('touch'), 'a large hybrid starts with keyboard controls');
    let calls = 0;
    device.watchTouch(() => { calls++; });
    check(changes.length === 4, 'all capability queries subscribe through legacy listeners');
    changes.forEach(fn => fn());
    check(calls === 0, 'unchanged capability does not notify');
    display.width = 390;
    display.height = 844;
    win.dispatchEvent(new Event('resize'));
    check(classes.has('touch') && !classes.has('keys'), 'hardware recovers a phone with false pointer queries');
    display.width = 1024;
    display.height = 768;
    win.dispatchEvent(new Event('resize'));
    check(classes.has('keys'), 'resizing without contact keeps the hybrid keyboard policy');
    fine.matches = false;
    changes.forEach(fn => fn());
    check(classes.has('touch'), 'hardware recovers a tablet without a positive fine pointer');
    fine.matches = true;
    changes.forEach(fn => fn());
    win.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse' }));
    check(classes.has('keys'), 'a mouse press does not claim touchscreen input');
    // Even all hardware and media signals lying cannot overrule an actual finger.
    hardware.maxTouchPoints = 0;
    win.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' }));
    check(classes.has('touch') && !classes.has('keys'), 'a real finger recovers a misreported large device');
    win.dispatchEvent(new Event('resize'));
    win.dispatchEvent(new Event('pageshow'));
    changes.forEach(fn => fn());
    check(classes.has('touch'), 'resize, resume and hotplug cannot take a used touchscreen away');
    const before = calls;
    win.dispatchEvent(new Event('touchstart'));
    check(calls === before, 'a second touch signal does not repeat the refresh');
  } finally {
    names.forEach((name, i) => {
      const descriptor = originals[i];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}
