/* Permanent browser regression for adaptation. Start npm run dev, then npm run check:adaptation.
   Uses the same optional Playwright install as online-e2e.mjs; no application dependency.
   E2E_URL selects the dev server; E2E_BROWSERS selects a comma-separated subset of engines.
   PLAYWRIGHT_MODULE and E2E_CHROMIUM_PATH allow an existing test runtime/browser to be reused. */
import assert from 'node:assert/strict';

const { chromium, firefox, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.E2E_URL || 'http://127.0.0.1:5173/';
const engines = (process.env.E2E_BROWSERS || 'chromium,firefox,webkit').split(',');
const sizes = [[240, 320], [320, 240], [390, 844], [844, 390], [800, 800], [834, 1194], [1194, 834], [1366, 1024], [1280, 220], [640, 360], [390, 844]];

async function controls(page) {
  const result = await page.evaluate(() => {
    const els = [document.querySelector('.tp-stick'), ...document.querySelectorAll('.tp-actions button')];
    return els.filter(el => getComputedStyle(el).display !== 'none').map(el => {
      const r = el.getBoundingClientRect();
      return { name: el.dataset.pad, x: r.x, y: r.y, w: r.width, h: r.height, width: innerWidth, height: innerHeight };
    });
  });
  assert.ok(result.some(r => r.name === 'stick'), 'the stick is visible');
  for (const r of result) {
    assert.ok([r.x, r.y, r.w, r.h].every(Number.isFinite), `finite geometry: ${r.name}`);
    assert.ok(r.w > 2 && r.h > 2 && r.x >= -1 && r.y >= -1 && r.x + r.w <= r.width + 1 && r.y + r.h <= r.height + 1, `control fits: ${JSON.stringify(r)}`);
  }
}

for (const name of engines) {
  const type = { chromium, firefox, webkit }[name];
  assert.ok(type, `unknown engine: ${name}`);
  const browser = await type.launch({ headless: true, ...(name === 'chromium' && process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}) });
  try {
    for (const fixture of ['normal', 'legacy', 'misreported']) {
      const viewport = fixture === 'misreported' ? { width: 1024, height: 768 } : { width: 390, height: 844 };
      const context = await browser.newContext({ viewport, screen: viewport, hasTouch: true, ...(name !== 'firefox' ? { isMobile: true } : {}) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(fixture => {
        Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: undefined });
        Object.defineProperty(HTMLElement.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
        if (fixture === 'normal') return;
        const match = window.matchMedia.bind(window);
        window.matchMedia = query => {
          const q = match(query);
          if (fixture === 'legacy') Object.defineProperty(q, 'addEventListener', { value: undefined });
          else if (/pointer|hover/.test(query)) Object.defineProperty(q, 'matches', { value: query.includes('pointer: fine') });
          return q;
        };
        if (fixture === 'legacy') {
          window.ResizeObserver = undefined;
          delete HTMLElement.prototype.showPopover;
          delete HTMLElement.prototype.hidePopover;
          delete HTMLDialogElement.prototype.showModal;
          delete HTMLDialogElement.prototype.close;
          // Prevent modern UA defaults from concealing a broken fallback in this fixture.
          document.addEventListener('click', e => { if (e.target.closest?.('[popovertarget]')) e.preventDefault(); }, true);
          const matches = Element.prototype.matches;
          Element.prototype.matches = function(selector) {
            if (selector.includes(':popover-open')) throw new DOMException('unsupported selector', 'SyntaxError');
            return matches.call(this, selector);
          };
        }
      }, fixture);
      if (fixture === 'legacy') await page.route('**/src/style.css*', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replaceAll('cqw', 'unsupported-unit').replaceAll('dvh', 'unsupported-height')
          .replaceAll('color-mix(', 'unsupported-mix(').replaceAll('oklch(', 'unsupported-oklch(')
          .replaceAll('container-type', 'unsupported-container-type').replaceAll('@container', '@unsupported-container').replaceAll(':has(', ':unsupported-has(');
        await route.fulfill({ response, body });
      });
      try {
        await page.goto(url);
        await page.locator('#roster button').first().waitFor();
        assert.equal(await page.locator('vite-error-overlay').count(), 0);
        if (fixture === 'legacy') {
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).touchAction), 'pan-y');
          await page.locator('#settings').click();
          await page.locator('[popovertarget="set-roster-menu"]').click();
          await page.locator('#set-roster-menu [data-value="band"]').click();
          assert.ok(await page.locator('.band-head').count() > 0, 'fallback menu applies its choice');
          await page.locator('#close-settings').click();
        }
        await page.locator('[data-mode="training"]').tap();
        await page.locator('#start').tap();
        await page.waitForFunction(() => window.__mf?.game()?.phase === 'fight');
        await page.evaluate(() => document.fonts?.ready);
        await controls(page);
        if (fixture !== 'misreported') {
          await page.locator('#fullscreen').click();
          await page.waitForTimeout(150);
          await controls(page);
          for (const [width, height] of sizes) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(150);
            await controls(page);
          }
          assert.ok(await page.evaluate(() => document.body.classList.contains('pad-split')), 'returning to portrait restores the split pad');
        }
        const ring = await page.locator('.tp-ring').boundingBox();
        await page.mouse.move(ring.x + ring.width / 2, ring.y + ring.height / 2);
        await page.mouse.down();
        await page.mouse.move(ring.x + ring.width * .8, ring.y + ring.height / 2);
        await page.waitForFunction(() => window.__mf.game().keys.has('KeyD'));
        await page.mouse.up();
        await page.waitForFunction(() => !window.__mf.game().keys.has('KeyD'));
        await page.evaluate(() => {
          window.__layoutMutations = 0;
          new MutationObserver(list => { window.__layoutMutations += list.length; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
          for (let i = 0; i < 200; i++) window.dispatchEvent(new Event('resize'));
        });
        await page.waitForTimeout(250);
        const first = await page.evaluate(() => window.__layoutMutations);
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => window.__layoutMutations), first, 'layout settles instead of observing its own temporary measurements');
        assert.ok(first < 20, 'resize storm is coalesced');
        if (fixture === 'legacy') assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('.energy span')).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'old engines retain the energy fill');
        assert.deepEqual(errors, [], 'no runtime exceptions');
        console.log(`PASS ${name} ${browser.version()} ${fixture}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
