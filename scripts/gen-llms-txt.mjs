/**
 * Generate /llms.txt and /llms-full.txt from the docs that actually exist.
 *
 * llmstxt.org's convention: a plain-markdown file at the site root that gives a
 * language model the shape of the site without asking it to parse navigation,
 * scripts and chrome out of rendered HTML.
 *
 * GENERATED, not hand-written, for the same reason the docs-coverage snapshot is
 * generated: a curated list of pages is true the day it is written and quietly
 * wrong three commits later, and nothing would ever fail to tell you. This walks
 * docs/*.md, so a page that exists is listed and a page that is deleted stops
 * being listed, without anyone remembering.
 *
 * Two files, because they answer different questions:
 *   llms.txt      — the map. Titles, one-line summaries, links.
 *   llms-full.txt — the territory. Every page inlined, for a model that would
 *                   otherwise make N requests to read the same thing.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOCS = join(ROOT, 'docs');
const OUT = join(DOCS, 'public');
const SITE = 'https://granthlabs.github.io';

/** Order matters to a reader arriving cold, so it is stated rather than alphabetical. */
const SECTIONS = [
  { title: 'Start here', pages: ['getting-started', 'tutorial', 'docs'] },
  { title: 'Guides', pages: ['frameworks', 'state-libraries', 'migrating-from-dexie'] },
  { title: 'Use cases', pages: ['use-cases', 'replacing-web-storage', 'cache-first-apps', 'encryption'] },
  { title: 'Architecture', pages: ['storage', 'runtimes', 'plugins', 'security-and-performance'] },
  { title: 'API reference', pages: ['granth', 'table', 'collection', 'where-clause', 'transaction', 'live-query', 'errors'] },
];

const stripFrontmatter = (s) => s.replace(/^---\n[\s\S]*?\n---\n/, '');

function read(slug) {
  const body = stripFrontmatter(readFileSync(join(DOCS, `${slug}.md`), 'utf8'));
  const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? slug;
  // First real paragraph: skip headings, HTML blocks, code fences and tables.
  const summary = body
    .split('\n\n')
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('<') && !b.startsWith('```') && !b.startsWith('|'))
    ?.replace(/\s+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`]/g, '')
    .slice(0, 190) ?? '';
  return { slug, title, summary, body };
}

const known = new Set(SECTIONS.flatMap((s) => s.pages));
const onDisk = readdirSync(DOCS)
  .filter((f) => f.endsWith('.md'))
  .map((f) => basename(f, '.md'))
  .filter((s) => s !== 'index');

// A page nobody listed still gets listed. The failure mode this exists to stop
// is a new doc that is invisible to every model reading the site.
const extra = onDisk.filter((s) => !known.has(s));
const sections = extra.length
  ? [...SECTIONS, { title: 'Other pages', pages: extra }]
  : SECTIONS;

const head = `# granthdb

> SQLite in the browser with a Dexie-compatible API. Data is stored on the user's
> own device in OPFS (with an IndexedDB fallback), queries run in a Web Worker off
> the main thread, and one tab owns the database so multiple tabs cannot corrupt
> it. Install with \`npm install granthdb @sqlite.org/sqlite-wasm\`, or load it from
> a CDN with no build step.

granthdb is a local storage engine, not a sync engine: it keeps no server copy and
resolves no conflicts between users. Browser storage is evictable, so it is a fast
local copy and never the only copy.

- Source: https://github.com/granthlabs/granth
- Package: https://www.npmjs.com/package/granthdb
- Requires: Chrome 108+, Safari 16.4+, Firefox 111+, over HTTPS or localhost
`;

const lines = [head];
const full = [head];

for (const section of sections) {
  lines.push(`\n## ${section.title}\n`);
  for (const slug of section.pages) {
    let page;
    try { page = read(slug); } catch { continue; }
    lines.push(`- [${page.title}](${SITE}/${slug}): ${page.summary}`);
    full.push(`\n\n---\n\n# ${page.title}\n\nSource: ${SITE}/${slug}\n\n${page.body.replace(/^#\s+.+$/m, '').trim()}`);
  }
}

writeFileSync(join(OUT, 'llms.txt'), lines.join('\n') + '\n');
writeFileSync(join(OUT, 'llms-full.txt'), full.join('\n') + '\n');

const listed = lines.filter((l) => l.startsWith('- [')).length;
console.log(`llms.txt: ${listed} pages listed${extra.length ? ` (${extra.length} unlisted page(s) appended)` : ''}`);
console.log(`llms-full.txt: ${(full.join('\n').length / 1024).toFixed(0)} kB inlined`);
