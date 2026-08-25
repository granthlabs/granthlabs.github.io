/**
 * The blog: does every post render, and does every diagram survive the trip.
 *
 * Three failure modes this exists for, all of which have happened on this site:
 *
 * 1. AN SVG RENDERED AS LITERAL TEXT. Markdown ends an HTML block at a blank
 *    line and treats a 4-space indent as a code fence, so one stray blank line
 *    inside a <figure> dumps the raw markup onto the page. The build succeeds
 *    and the page 200s, so nothing else notices.
 * 2. A LABEL WIDER THAN ITS BOX. Only measurable after layout — the markup is
 *    valid either way. Two of these shipped before this check existed.
 * 3. AN EMPTY <text> NODE. A JSX-style expression in a label parses fine and
 *    renders nothing at all.
 *
 * Also asserts the index lists every post and that the per-post SEO the config
 * generates actually reaches the HTML, since a wrong canonical or a missing
 * JSON-LD block is invisible by construction.
 *
 * Runs against docs/.vitepress/dist, so `npm run docs:build` must have happened.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '../../docs/.vitepress/dist');
const POSTS_DIR = join(HERE, '../../docs/blog');
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
const base = `http://localhost:${server.address().port}`;

const slugs = readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'index.md' && !f.startsWith('_'))
  .map((f) => f.slice(0, -3));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// ---- the index lists every post
await page.goto(`${base}/blog/`, { waitUntil: 'networkidle' });
const listed = await page.evaluate(() =>
  [...document.querySelectorAll('.blog__item a')].map((a) =>
    new URL(a.href).pathname.replace(/\/$/, '').split('/').pop())
);
const missing = slugs.filter((s) => !listed.includes(s));
check('the index lists every post', missing.length === 0,
  `${listed.length} listed, ${slugs.length} on disk${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);

const filters = await page.evaluate(() => document.querySelectorAll('.blog__chip').length);
check('tag filters render', filters > 1, `${filters} chips`);

// ---- every post
for (const slug of slugs) {
  const errors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/blog/${slug}`, { waitUntil: 'networkidle' });

  const r = await page.evaluate(() => {
    const problems = [];
    const doc = document.querySelector('.vp-doc');

    // A figure that failed to parse leaves its own markup in the rendered text.
    if (/<svg|<figure|viewBox=/.test(doc?.innerText ?? '')) problems.push('SVG RENDERED AS LITERAL TEXT');

    const svgs = [...document.querySelectorAll('.vp-doc figure svg')];
    svgs.forEach((svg, i) => {
      const vb = svg.viewBox.baseVal;
      if (!svg.getAttribute('role')) problems.push(`d${i + 1}: no role`);
      if ((svg.getAttribute('aria-label') ?? '').length < 40) problems.push(`d${i + 1}: aria-label too short to stand alone`);
      if (!svg.querySelector('title')) problems.push(`d${i + 1}: no <title>`);
      const rects = [...svg.querySelectorAll('rect')].map((x) => ({
        x: x.x.baseVal.value, w: x.width.baseVal.value,
        y: x.y.baseVal.value, h: x.height.baseVal.value,
      }));
      svg.querySelectorAll('text').forEach((t) => {
        const bb = t.getBBox();
        if (!t.textContent.trim()) problems.push(`d${i + 1}: empty label`);
        if (bb.x < -1 || bb.x + bb.width > vb.width + 1) problems.push(`d${i + 1}: outside viewBox "${t.textContent.slice(0, 30)}"`);
        const host = rects.find((x) => bb.y > x.y && bb.y < x.y + x.h &&
          bb.x + bb.width / 2 > x.x && bb.x + bb.width / 2 < x.x + x.w);
        if (host && (bb.x < host.x + 2 || bb.x + bb.width > host.x + host.w - 2)) {
          const by = Math.ceil(Math.max(host.x - bb.x, bb.x + bb.width - (host.x + host.w)));
          problems.push(`d${i + 1}: overflows its box by ${by}px "${t.textContent.slice(0, 30)}"`);
        }
      });
    });
    if (!svgs.length) problems.push('no diagram');
    if (!document.querySelector('.vp-doc figcaption')) problems.push('no figcaption');

    // Byline and read-next come from the theme, not from the post.
    //
    // Their EXISTENCE is not the check. Both render in Layout's doc-before /
    // doc-after slots, which are siblings of .vp-doc rather than children — so a
    // stylesheet scoped under .vp-doc leaves the markup present and every rule
    // dead, and the byline collapses to an unstyled vertical stack. That shipped
    // once. Assert the layout actually applied.
    const meta = document.querySelector('.pmeta');
    const nav = document.querySelector('.pnav');
    if (!meta) problems.push('no byline');
    else if (getComputedStyle(meta).display !== 'flex') problems.push('byline is unstyled (CSS did not reach it)');
    if (!nav) problems.push('no read-next');
    else if (!nav.querySelector('.pnav__item')) problems.push('read-next has no items');

    // SEO the config hook is responsible for.
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent)['@type']);
    if (!ld.includes('BlogPosting')) problems.push('no BlogPosting JSON-LD');
    if (!document.querySelector('link[rel=canonical]')) problems.push('no canonical');
    if (!document.querySelector('meta[property="og:title"]')) problems.push('no og:title');

    const desc = document.querySelector('meta[name=description]')?.content ?? '';
    if (desc.length < 80 || desc.length > 200) problems.push(`meta description is ${desc.length} chars`);

    return { problems, diagrams: svgs.length, words: (doc?.innerText ?? '').split(/\s+/).length };
  });

  const ok = r.problems.length === 0 && errors.length === 0;
  check(slug, ok, ok ? `${r.diagrams} diagram, ~${r.words} words`
    : [...r.problems, ...errors.map((e) => 'page error: ' + e)].join(' | '));
}

await browser.close();
server.close();
console.log(`\nblog: ${pass} passed, ${fail} failed across ${slugs.length} posts`);
process.exit(fail ? 1 : 0);
