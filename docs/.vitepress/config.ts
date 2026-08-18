import { defineConfig } from 'vitepress';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The pages were `Tutorial.md`, `WhereClause.md`, `MigratingFromDexie.md`, so the
 * URLs carried capitals — unconventional, case-sensitive on a static host, and
 * easy to mistype. They are lowercase and kebab-cased now.
 *
 * Those old URLs were already live, so they get redirect stubs rather than a
 * 404. A static host has no redirect rules, hence meta-refresh plus
 * `rel=canonical`, so a search engine follows the move instead of indexing two
 * copies of every page.
 */
const MOVED: Record<string, string> = {
  CacheFirstApps: 'cache-first-apps',
  Collection: 'collection',
  Encryption: 'encryption',
  Errors: 'errors',
  Frameworks: 'frameworks',
  Granth: 'granth',
  MigratingFromDexie: 'migrating-from-dexie',
  Plugins: 'plugins',
  ReplacingWebStorage: 'replacing-web-storage',
  Runtimes: 'runtimes',
  SecurityAndPerformance: 'security-and-performance',
  StateLibraries: 'state-libraries',
  Storage: 'storage',
  Table: 'table',
  Transaction: 'transaction',
  Tutorial: 'tutorial',
  WhereClause: 'where-clause',
  liveQuery: 'live-query',
};

// The site is built directly from the docs/ folder, so the published site and
// the docs you read on GitHub cannot drift apart.
export default defineConfig({
  buildEnd(site) {
    for (const [from, to] of Object.entries(MOVED)) {
      // A DIRECTORY, not `${from}.html`. macOS is case-insensitive, so writing
      // `Tutorial.html` overwrote the real `tutorial.html` and every one-word
      // page became a stub redirecting to itself — while a Linux CI runner,
      // being case-sensitive, would have built it correctly and deployed happily.
      // `Tutorial/index.html` collides with nothing on either filesystem.
      const dir = join(site.outDir, from);
      if (existsSync(dir)) {
        throw new Error(`granth docs: redirect stub "${from}" collides with a real build output`);
      }
      mkdirSync(dir, { recursive: true });
      const url = `${site.site.base}${to}`;
      writeFileSync(
        join(dir, 'index.html'),
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
          `<title>Moved — granthdb</title>` +
          `<link rel="canonical" href="${url}">` +
          `<meta name="robots" content="noindex">` +
          `<meta http-equiv="refresh" content="0; url=${url}">` +
          `</head><body>This page moved to <a href="${url}">${url}</a>.</body></html>\n`
      );
    }
  },
  title: 'granthdb',
  description: 'SQLite in the browser with a Dexie-compatible API. OPFS-backed, runs in a Web Worker, safe across tabs.',
  lang: 'en-GB',
  cleanUrls: true,
  // /play/ is built by Vite into the same output, so VitePress does not know
  // those routes and calls every link to them dead. Scoped to that prefix rather
  // than disabling the check — link-check.mjs then verifies these for real,
  // against the built files, which is the check that actually matters.
  ignoreDeadLinks: [/^\/play\//],
  // Dark only. A single surface to design against means the palette, the code
  // panels and the section patterns are all tuned once instead of twice — and a
  // half-tuned light mode is worse than none.
  appearance: 'force-dark',
  lastUpdated: true,
  // The repo is granthlabs/granthlabs.github.io — an ORG SITE, so Pages serves
  // it from the root and there is no path prefix to get wrong. Kept as a flag so
  // a future custom domain or a move back under a path is one variable.
  base: process.env.DOCS_BASE ?? '/',
  // Needed for the generated sitemap to carry absolute URLs.
  sitemap: { hostname: 'https://granthlabs.github.io/' },
  head: [
    // FIRST, before any stylesheet. `appearance: force-dark` is applied by
    // VitePress's own CSS, which is an external file — so until it arrived the
    // browser painted its default WHITE canvas, and every navigation flashed.
    // The meta makes the UA canvas dark immediately; the inline background makes
    // it the brand dark, so there is no black-to-navy step either.
    ['meta', { name: 'color-scheme', content: 'dark' }],
    ['style', {}, 'html{background:#14161c;background:oklch(16.5% 0.014 260);color-scheme:dark}'],
    ['meta', { name: 'theme-color', content: '#3b5b7a' }],
    ['meta', { property: 'og:title', content: 'granth — SQLite in the browser' }],
    ['meta', { property: 'og:description', content: 'A Dexie-compatible API over SQLite/WASM on OPFS. Real indexes, a real query planner, off the main thread.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://granthlabs.github.io/' }],
    ['meta', { property: 'og:image', content: 'https://granthlabs.github.io/showcase.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'granthdb — SQLite in the browser' }],
    ['meta', { name: 'twitter:description', content: 'A Dexie-compatible API over SQLite/WASM on OPFS. Real indexes, a real query planner, off the main thread.' }],
    ['meta', { name: 'twitter:image', content: 'https://granthlabs.github.io/showcase.png' }],
    // Structured data. Stated in the vocabulary a crawler already parses, so the
    // facts it extracts are the ones we assert rather than ones it infers from
    // prose — including the honest one, that this is storage and not a sync engine.
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'granthdb',
      description:
        'SQLite in the browser with a Dexie-compatible API. OPFS-backed with an IndexedDB fallback, ' +
        'runs in a Web Worker, single-writer across tabs. A local storage engine, not a sync engine.',
      url: 'https://granthlabs.github.io/',
      codeRepository: 'https://github.com/granthlabs/granth',
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Web browser',
      license: 'https://opensource.org/licenses/MIT',
      keywords: 'sqlite, wasm, opfs, indexeddb, dexie, local-first, offline-first, browser database',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      installUrl: 'https://www.npmjs.com/package/granthdb',
    })],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'granthdb',
    // Nine top-level items plus a "GitHub" entry duplicating the social icon
    // overflowed into the "..." menu, and what got pushed in there was the
    // social row — so the npm link existed and no visitor could see it. The
    // three /play/ destinations are one idea, so they became one menu, and the
    // GitHub text item went: the icon beside it already says GitHub.
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Docs', link: '/docs' },
      { text: 'API', link: '/granth' },
      { text: 'Use cases', link: '/replacing-web-storage' },
      { text: 'Migrate', link: '/migrating-from-dexie' },
      {
        text: 'Playground',
        items: [
          // target _self on every one: these are real documents outside the
          // VitePress router, and letting it handle the click serves its own
          // 404 without ever requesting the file.
          { text: 'Sandbox', link: '/play/sandbox', target: '_self' },
          { text: 'Examples', link: '/play/demos/', target: '_self' },
          { text: 'Showcase', link: '/play/showcase/', target: '_self' },
          { text: 'Verify', link: '/play/', target: '_self' },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Start here', link: '/getting-started' },
          { text: 'All documentation', link: '/docs' },
          { text: 'Tutorial', link: '/tutorial' },
          { text: 'Migrating from Dexie', link: '/migrating-from-dexie' },
          { text: 'Frameworks', link: '/frameworks' },
          { text: 'TanStack, RxJS, Zustand', link: '/state-libraries' },
        ],
      },
      {
        text: 'Use cases',
        items: [
          { text: 'Replacing web storage', link: '/replacing-web-storage' },
          { text: 'Cache-first apps', link: '/cache-first-apps' },
          { text: 'Encryption at rest', link: '/encryption' },
        ],
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Storage', link: '/storage' },
          { text: 'Runtimes', link: '/runtimes' },
          { text: 'Plugins', link: '/plugins' },
          { text: 'Security & performance', link: '/security-and-performance' },
        ],
      },
      {
        text: 'API reference',
        items: [
          { text: 'Granth', link: '/granth' },
          { text: 'Table', link: '/table' },
          { text: 'Collection', link: '/collection' },
          { text: 'WhereClause', link: '/where-clause' },
          { text: 'Transaction', link: '/transaction' },
          { text: 'liveQuery', link: '/live-query' },
          { text: 'Errors', link: '/errors' },
        ],
      },
    ],
    // GitHub points at the LIBRARY, not at this repo: someone clicking it from a
    // library's own docs wants the source, not the site that documents it. npm
    // sits beside it because "where do I install this from" is the other thing a
    // header gets asked, and the site had no answer to it anywhere.
    socialLinks: [
      { icon: 'github', link: 'https://github.com/granthlabs/granth' },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>npm</title><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>',
        },
        link: 'https://www.npmjs.com/package/granthdb',
        ariaLabel: 'granthdb on npm',
      },
    ],
    search: { provider: 'local' },
    // Stays on THIS repo, deliberately: the markdown lives here, so "edit this
    // page" has to open the file the reader is actually looking at.
    editLink: {
      pattern: 'https://github.com/granthlabs/granthlabs.github.io/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
