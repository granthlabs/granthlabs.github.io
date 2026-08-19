/**
 * The landing-page slider: does it cross-fade, and does it stay cheap.
 *
 * Both properties it asserts were shipped broken and neither was visible to any
 * other check — the page rendered, the links worked, the screenshots were there.
 *
 * 1. THE FADE. `visibility` was set on the inactive slides but left out of the
 *    transition, so on every switch the outgoing frame vanished on the first
 *    frame while the incoming one was still at opacity 0. For the whole 240ms
 *    you saw the panel background. Measured as the COMBINED opacity of every
 *    visible slide sampled across the switch: a real cross-fade holds it at ~1,
 *    and the broken version drops it to 0.
 *
 * 2. THE COST. The obvious way to fix (1) is to delete `visibility`, and that
 *    works and is worse: all six screenshots then composite permanently inside a
 *    rounded, clipped, shadowed container. At most two may be rendered at once.
 *
 * 3. THE WEIGHT. The frames were captured at deviceScaleFactor 2 — 2560x1640
 *    for a slot about 600px wide, six of them, 96 MB of decoded bitmap. Hovering
 *    the panel re-rasterised that whole subtree and stalled the main thread, so
 *    the site felt frozen and the search button felt dead. capture-showcase.mjs
 *    is a separate manual script, so nothing here would notice it going back.
 *
 * Runs against docs/.vitepress/dist, so `npm run docs:build` must have happened.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../docs/.vitepress/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'networkidle' });
await page.locator('.built__left').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);

const dots = await page.locator('.slides__dot').count();
check('the slider has its dots', dots >= 2, `${dots} dots`);

// Sampled on requestAnimationFrame, not in a loop that spins the main thread:
// blocking the thread stops style advancing, so every sample reads the same
// resolved value and a broken fade measures as a perfect one.
const trace = await page.evaluate(async () => {
  const items = [...document.querySelectorAll('.slides__item')];
  const out = [];
  const t0 = performance.now();
  document.querySelectorAll('.slides__dot')[1].click();
  await new Promise((done) => {
    const tick = () => {
      const vis = items.filter((e) => getComputedStyle(e).visibility === 'visible');
      out.push({
        sum: vis.reduce((n, e) => n + parseFloat(getComputedStyle(e).opacity), 0),
        vis: vis.length,
      });
      performance.now() - t0 < 500 ? requestAnimationFrame(tick) : done();
    };
    requestAnimationFrame(tick);
  });
  return out;
});

const minOpacity = Math.min(...trace.map((s) => s.sum));
const maxRendered = Math.max(...trace.map((s) => s.vis));
const atRest = trace[trace.length - 1].vis;

check(
  'the switch never dips to the panel background',
  minOpacity > 0.9,
  `lowest combined opacity ${minOpacity.toFixed(2)} across ${trace.length} frames`
);
check('at most two frames render at once', maxRendered <= 2, `peak ${maxRendered}`);
check('and one at rest', atRest === 1, `${atRest} visible when settled`);

// The dots have to say which frame you are on by more than colour alone.
const dotWidths = await page.evaluate(() =>
  [...document.querySelectorAll('.slides__dot')].map((d) => ({
    on: d.classList.contains('is-on'),
    w: Math.round(d.getBoundingClientRect().width),
  }))
);
const onW = dotWidths.find((d) => d.on)?.w ?? 0;
const offW = dotWidths.find((d) => !d.on)?.w ?? 0;
check('the active dot is distinguishable without colour', onW > offW * 1.5, `${onW}px vs ${offW}px`);

// Every slide frame, whether or not it has loaded yet.
const weight = await page.evaluate(() =>
  [...document.querySelectorAll('.slides__item img')].map((i) => ({
    src: i.currentSrc.split('/').pop(),
    w: i.naturalWidth,
    h: i.naturalHeight,
    shown: Math.round(i.getBoundingClientRect().width),
  }))
);
const totalMB = weight.reduce((n, i) => n + (i.w * i.h * 4) / 1048576, 0);
const worst = weight.reduce((a, b) => (a.w > b.w ? a : b), weight[0] ?? { w: 0 });
check(
  'the frames are not captured far larger than they are shown',
  worst.w > 0 && worst.w <= worst.shown * 2.5,
  `widest ${worst.w}px natural for a ${worst.shown}px slot`
);
check('total decoded bitmap stays modest', totalMB < 40, `${totalMB.toFixed(0)} MB across ${weight.length} frames`);

check('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
server.close();
console.log(`\nslider: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
