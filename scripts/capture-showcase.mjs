/**
 * Screenshot the REAL Signals app in several states, for the slider on the home
 * page.
 *
 *     node scripts/capture-showcase.mjs        # after `npm run docs:build`
 *
 * Driven, not mocked. Each frame is produced by clicking the actual controls
 * against a real 5,000-row OPFS database, so a slide cannot show behaviour the
 * app does not have — which is the whole risk with a marketing carousel. If a
 * capture stops being reachable, this fails instead of quietly shipping a stale
 * picture of a feature that moved.
 *
 * Needs the network only for Playwright's browser, and is NOT part of `npm test`.
 * Re-run it when the showcase UI changes.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'docs/.vitepress/dist');
const OUT = join(ROOT, 'docs/public/showcase');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

if (!existsSync(DIST)) {
  console.error('no build found — run `npm run docs:build` first');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  for (const c of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const f = join(DIST, c);
    if (f.startsWith(DIST) && existsSync(f) && statSync(f).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      return res.end(readFileSync(f));
    }
  }
  res.writeHead(404).end('not found');
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
// deviceScaleFactor 1, not 2.
//
// At 2 these came out 2560x1640 for a slot that renders about 600 CSS px wide —
// roughly nineteen times the pixels needed. Six of them is 96 MB of decoded
// bitmap sitting inside one rounded, clipped, shadowed container, which is
// enough to stall the main thread on a hover and make the whole page feel
// frozen. At 1 it is 1280x820: still above 1:1 device pixels on a retina screen
// at this size, and 25 MB instead of 96.
//
// The viewport stays 1280 because that is the layout the app is being
// photographed IN — shrinking it would photograph a different, narrower UI.
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('  page error:', e.message));

/** Wait for an app to be genuinely ready, not merely loaded. */
async function open(path, ready) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(ready, null, { timeout: 120_000 });
  await page.waitForTimeout(600);
}

const rowsOn = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

const APPS = [
  {
    name: 'Signals',
    path: '/play/showcase/',
    rows: '#rows tr',
    ready: () => /issues/i.test(document.getElementById('env')?.textContent ?? ''),
    frames: [
      { file: 'signals-all.png', act: async () => {} },
      { file: 'signals-filtered.png', act: async () => { await page.click('#facets button'); } },
      { file: 'signals-faceted.png', act: async () => { await page.click('#facets button'); await page.click('#labels button'); } },
    ],
  },
  {
    name: 'Ledger',
    path: '/play/ledger/',
    rows: '#rows tr',
    ready: () => window.__READY__ === true,
    frames: [
      { file: 'ledger-all.png', act: async () => {} },
      { file: 'ledger-narrow.png', act: async () => { await page.fill('#from', '2026-06-01'); } },
      { file: 'ledger-category.png', act: async () => { await page.selectOption('#category', 'food'); } },
    ],
  },
];

let captured = 0, expected = 0;
for (const app of APPS) {
  await open(app.path, app.ready);
  for (const frame of app.frames) {
    expected++;
    await frame.act();
    await page.waitForTimeout(500);
    const rows = await rowsOn(app.rows);
    if (!rows) {
      console.error(`FAIL  ${frame.file} — no rows on screen; the control it drives may have moved`);
      continue;
    }
    await page.screenshot({ path: join(OUT, frame.file) });
    captured++;
    console.log(`${frame.file.padEnd(22)} ${app.name} · ${rows} rows`);
  }
}

await browser.close();
server.close();
console.log(captured === expected
  ? `\ncaptured ${captured} frames from ${APPS.length} apps into docs/public/showcase/`
  : `\nonly ${captured}/${expected} frames captured`);
process.exit(captured === expected ? 0 : 1);
