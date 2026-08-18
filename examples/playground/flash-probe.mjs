/**
 * Proves what the browser paints BEFORE the stylesheet arrives.
 *
 * The docs site and the /play/ pages are separate documents, so moving between
 * them is a full browser navigation. If the dark background only arrives in an
 * external stylesheet, the browser paints its default WHITE canvas first and the
 * user sees a flash on every hop.
 *
 * Two earlier versions of this file passed while the flash was real:
 * page.screenshot() waits for a stable frame and cannot see a two-frame flash,
 * and a CDP screencast started on the previous document delivers almost nothing
 * across a cross-document navigation. So this stops trying to catch a transient:
 * it HOLDS the stylesheet, commits the navigation, and looks at the page in
 * exactly the state every visitor sees while CSS is in flight. Deterministic,
 * and it fails loudly when the fix is reverted.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../docs/.vitepress/dist');
// The site is an ORG SITE now (granthlabs/granthlabs.github.io), served from
// the root. One constant so a future move is one edit.
const BASE = process.env.DOCS_BASE ?? '/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.startsWith(BASE)) rel = rel.slice(BASE.length);
  rel = rel.replace(/^\/+/, '');
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
const origin = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });

// Drop every stylesheet. What the document reports now IS the first paint —
// screenshotting this state is not possible, because Playwright's screenshot
// waits for the network to settle and we are deliberately holding it.
await ctx.route('**/*.css', (r) => r.abort());

let failures = 0;

/**
 * The canvas colour with no stylesheet is decided by exactly two things: the
 * used `color-scheme`, and any background painted by the document itself. If
 * the scheme is `normal` and nothing paints a background, the canvas is WHITE —
 * which is the flash, stated as a fact about the document rather than guessed
 * at from a screenshot.
 */
async function probe(label, path) {
  const page = await ctx.newPage();
  // 'commit' resolves as soon as the document starts, long before CSS applies.
  await page.goto(origin + path, { waitUntil: 'commit', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const painted = (c) => c && c !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(c);
    // Same question asked of the icon: an inline <svg> carrying only a viewBox
    // has NO intrinsic size, so with no stylesheet it lays out at the default
    // replaced-element box and stretches to its container — measured at 1264px,
    // a full-viewport database icon flashing on every navigation before ui.css
    // shrank it to 18. width/height attributes give it a size CSS is not needed
    // for. Belongs here because it is the same defect as the white canvas: what
    // the document is worth on its own, before anything decorates it.
    const svg = document.querySelector('.topbar__brand svg');
    const iconW = svg ? Math.round(svg.getBoundingClientRect().width) : null;
    return {
      scheme: html.colorScheme,
      htmlBg: html.backgroundColor,
      bodyBg: body.backgroundColor,
      dark: html.colorScheme.includes('dark') || painted(html.backgroundColor) || painted(body.backgroundColor),
      iconW,
    };
  }).catch(() => null);
  await page.close();

  if (!state) { failures++; console.log(`FAIL  ${label} — could not read the document`); return; }
  if (!state.dark) failures++;
  // 40px: comfortably above any legitimate brand mark, far below the 1264 the
  // unsized element produced. A threshold, not an exact size, so restyling the
  // icon does not make this fail for the wrong reason.
  const iconBad = state.iconW != null && state.iconW > 40;
  if (iconBad) failures++;
  console.log(
    `${state.dark && !iconBad ? 'PASS' : 'FAIL'}  ${label} — color-scheme: ${state.scheme}, ` +
      `html bg ${state.htmlBg}${state.iconW == null ? '' : `, brand icon ${state.iconW}px`}` +
      `${iconBad ? '  <-- ICON FLASHES OVERSIZED' : ''}`
  );
}

await probe('/play/sandbox', `${BASE}play/sandbox`);
await probe('/play/demos/', `${BASE}play/demos/`);
await probe('/play/demos/react', `${BASE}play/demos/react`);
await probe('/play/ (verify)', `${BASE}play/`);
await probe('/tutorial (docs)', `${BASE}tutorial`);

await browser.close();
server.close();
console.log(
  failures
    ? `\n${failures} problem(s) in the pre-CSS frame — a light canvas, an oversized icon, or both`
    : `\nevery page paints dark, with a correctly sized icon, before CSS loads`
);
process.exit(failures ? 1 : 0);
