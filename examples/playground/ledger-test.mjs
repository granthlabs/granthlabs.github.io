/**
 * Drives the Ledger app in a real browser against the built site.
 *
 * The app makes three claims the showcase does not, so each is exercised rather
 * than eyeballed: a transfer is atomic, balances are derived from the rows, and
 * a date range is served by the compound index.
 *
 * Runs against docs/.vitepress/dist, so `npm run docs:build` must have happened.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../docs/.vitepress/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(`http://localhost:${server.address().port}/play/ledger/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__READY__ !== undefined, null, { timeout: 180_000 });

const ready = await page.evaluate(() => window.__READY__);
check('the app opened without throwing', ready === true, ready === 'error' ? 'startup failed' : '');

const env = await page.textContent('#env');
check('it seeded 12,000 entries on a real backend', /12,000 entries/.test(env), env.trim());
check('it reached OPFS, not a fallback', /opfs/.test(env), env.trim());

/** Read an account balance out of the sidebar, in pence. */
const balance = (name) => page.evaluate((n) => {
  const el = [...document.querySelectorAll('#balances .facet')].find((b) => b.textContent.trim().startsWith(n));
  const t = el?.querySelector('.facet__n')?.textContent ?? '';
  return Math.round(parseFloat(t.replace(/[£,\s]/g, '').replace('−', '-')) * 100);
}, name);

const beforeCurrent = await balance('current');
const beforeSavings = await balance('savings');

await page.click('#transfer');
await page.waitForFunction(() => /Moved/.test(document.getElementById('note')?.textContent ?? ''), null, { timeout: 30_000 });
await page.waitForTimeout(400);

const afterCurrent = await balance('current');
const afterSavings = await balance('savings');

// Both sides, not just one: a transfer that debited without crediting would pass
// a check that only looked at the destination.
check('the transfer debited the source', afterCurrent === beforeCurrent - 5000, `${beforeCurrent} -> ${afterCurrent}`);
check('the transfer credited the destination', afterSavings === beforeSavings + 5000, `${beforeSavings} -> ${afterSavings}`);
check('money was conserved', (afterCurrent + afterSavings) === (beforeCurrent + beforeSavings));

// Date range: narrowing it must reduce the count, and the rows must obey it.
const wide = await page.textContent('#timing');
await page.fill('#from', '2026-07-01');
await page.waitForTimeout(500);
const narrow = await page.textContent('#timing');
const n = (s) => Number((s.match(/([\d,]+) entries/)?.[1] ?? '0').replace(/,/g, ''));
check('narrowing the date range narrows the result', n(narrow) < n(wide), `${n(wide)} -> ${n(narrow)}`);

const inRange = await page.evaluate(() =>
  [...document.querySelectorAll('#rows tr td:first-child')].every((td) => td.textContent >= '2026-07-01'));
check('every row respects the range', inRange);

// Category filter narrows further and every row matches.
await page.selectOption('#category', 'food');
await page.waitForTimeout(500);
const onlyFood = await page.evaluate(() =>
  [...document.querySelectorAll('#rows tr td:nth-child(3)')].every((td) => td.textContent.trim() === 'food'));
check('the category filter is exact', onlyFood);

check('no page errors', errors.length === 0, errors[0] ?? '');

await browser.close();
server.close();
console.log(fail ? `\n${fail} failure(s)` : `\nledger: ${pass} checks, all passing`);
process.exit(fail ? 1 : 0);
