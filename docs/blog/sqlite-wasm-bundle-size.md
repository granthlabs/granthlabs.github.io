---
title: "SQLite WASM bundle size: what it costs and when it pays back"
description: "SQLite compiled to WebAssembly costs several hundred kilobytes. What actually downloads, why loading it synchronously makes your first page slower, and the fix."
date: "2026-08-25"
tags: ["SQLite", "performance"]
---

# SQLite WASM bundle size: what it costs and when it pays back

The thing people want first is the size: SQLite compiled to WebAssembly is
**several hundred kilobytes**, varying with the build and with whether your
server compresses it. That is a real cost, it lands on your first visit, and
nobody should pretend otherwise.

It is also, on its own, the wrong thing to optimise. Notion shipped exactly this
and measured it, and their first page got *slower* — not because the bundle was
too large, but because of where they put it in the loading sequence. Same bytes,
different position, opposite outcome.

## What actually downloads

Two files, not one:

- **`sqlite3.mjs`** — the JavaScript glue. Module loader, the C API bindings, the
  object-oriented wrappers, the VFS registrations.
- **`sqlite3.wasm`** — the compiled engine.

On top of that, whatever wrapper you use. granthdb's client and worker are small
by comparison and carry [zero runtime dependencies](/security-and-performance) —
sqlite-wasm is a peer dependency, so you install it yourself and it is the same
official build either way.

Three properties of those bytes matter more than the total:

**It is compiled, not parsed.** A JavaScript bundle has to be parsed and executed
on the main thread before it does anything. WebAssembly goes through
`WebAssembly.compileStreaming`, which compiles as the bytes arrive, and in
granthdb's case it happens inside a Worker rather than on the thread that paints.
A kilobyte of WASM and a kilobyte of application JavaScript are not the same
kilobyte.

**It never changes.** Your application code churns on every deploy. The SQLite
build changes when you upgrade SQLite — which is a decision you make, not
something that happens to you. Content-hash it, serve it with a long
`Cache-Control: immutable`, and the returning visitor downloads nothing. Some
browsers cache the compiled module as well as the bytes.

**It is only on the critical path if you put it there.** Which is the rest of
this post.

### One bundler setting to check

If your bundler inlines `.wasm` assets as base64 data URIs — some do this below a
size threshold, and a few hundred kilobytes is above most thresholds but not all
— undo it. Base64 is four characters per three bytes, so the asset arrives about
a third larger, it lands inside your main JavaScript chunk, and it can no longer
be compiled while streaming because the bytes only exist once that chunk has
parsed. Serve the `.wasm` as a file with its own URL.

## The mistake, and it is the interesting one

Notion moved page data into a WASM SQLite database backed by OPFS. Their first
attempt loaded the library synchronously, before the first page rendered. The
result: **the first page was slower than the network it replaced**. Serving that
page from local storage saved less time than downloading several hundred
kilobytes of library in order to serve it.

They shipped it fully asynchronously instead, with the first page coming from the
network and the WASM loading behind it. That is the whole fix, and it generalises
into one rule:

> A local database earns its cost on the **second** navigation, not the first.

If your users arrive, do one thing and leave, there is no second navigation and
the maths never closes. That is not a tuning problem. It is a reason to use
[IndexedDB or `localStorage`](/blog/indexeddb-vs-sqlite-wasm) instead.

<figure>
 <svg viewBox="0 0 640 232" role="img" aria-label="Loading the WebAssembly build before first paint pushes the first page behind a several-hundred-kilobyte download and makes it slower than the network, whereas loading it asynchronously lets the first page come from the network while the WASM loads behind it and the local database serves the second navigation." style="width:100%;height:auto;color:var(--g-text)">
  <title>Where the WASM sits in the loading sequence</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">synchronous</text>
  <rect x="16" y="30" width="176" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="104" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">load the WASM</text>
  <text x="104" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">sqlite3.wasm + glue</text>
  <path d="M200 50 h24" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M224 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="232" y="30" width="176" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="320" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">open the database</text>
  <text x="320" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">compile + OPFS</text>
  <path d="M416 50 h24" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M440 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="448" y="30" width="176" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="536" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">first paint</text>
  <text x="536" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">loses to the network</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">asynchronous</text>
  <rect x="16" y="122" width="176" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="104" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">first paint</text>
  <text x="104" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">from the network</text>
  <path d="M200 142 h24" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M224 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="232" y="122" width="176" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="320" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">WASM loads behind it</text>
  <text x="320" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">in a Worker</text>
  <path d="M416 142 h24" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M440 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="448" y="122" width="176" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="536" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">2nd navigation</text>
  <text x="536" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">served locally</text>
  <text x="16" y="196" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">Identical bytes. The only change is the ordering.</text>
  <text x="16" y="216" fill="currentColor" fill-opacity="0.55" font-size="11">Notion shipped the top row first and their first page got slower.</text>
 </svg>
 <figcaption>Nothing here is a size optimisation — the download is the same either way, and shrinking it would not have saved the top row.</figcaption>
</figure>

## Lazy initialisation, concretely

Three things can be deferred, and they cost roughly in this order: constructing
the Worker, fetching and compiling the WASM, and opening the database file.

granthdb defers all three by default, and it is worth knowing *why* so you do not
accidentally undo it. The `worker` option is a **factory**, not a Worker:

```js
// db.js — importing this file constructs nothing
export const db = new Granth('myapp', {
  worker: () => new Worker(new URL('./db.worker.js', import.meta.url), { type: 'module' }),
});

db.version(1).stores({ pages: 'id, workspace, updated' });
```

And there is no `open()` call — **the first query opens the database**. So
`import { db } from './db'` at the top of your entry file costs one module import
and nothing else. The Worker spins up, sqlite-wasm downloads and the OPFS file
opens the first time something actually asks a question.

Which means the deferral is a policy decision rather than a plumbing one. The one
way to break it is to put a query in a route loader or a top-level `await` that
gates first paint:

```js
// Wrong: first paint now waits on several hundred kB of WASM.
const cached = await db.pages.where('workspace').equals(id).toArray();
render(cached);
```

Render from the network first on a cold start, then let the local read take over.
The [cache-first pattern](/cache-first-apps) has the full shape of it, including
the `liveQuery` subscription that updates the UI when the background refresh
lands.

## The cost that is not bytes

Bundle size is the cost everyone measures, and it is not the one that bit Notion
hardest. Their rollout improved navigation time by roughly **20%** overall, and
much more where the network is the bottleneck: **28% in Australia, 31% in China,
33% in India**. On slow devices the **p95 got worse**.

Not the download — the *read*. A low-end phone reading from its own disk can lose
to a fast network. A local cache is faster on average and it is not faster for
everybody, and the mean will hide the users you hurt.

Their fix was to stop choosing and race the two, taking whichever answers first:

```js
const rows = await Promise.any([
  db.pages.where('workspace').equals(id).toArray().then((r) => r.length ? r : Promise.reject()),
  fetch(`/api/pages?workspace=${id}`).then((r) => r.json()),
]);
```

`Promise.any` rather than `Promise.race`, so an empty or failed local read cannot
win by returning nothing. The local read usually wins and costs nothing; when the
disk is slow it loses, and the user gets the network answer instead of waiting
for the cache to lose slowly.

granthdb deliberately does not do this for you. Racing a database read against
your own API is an application decision — it needs to know which endpoint,
which staleness is acceptable, and what an empty result means — so it stays in
your code, as four lines you can read.

## When the download is simply not worth it

Stated plainly, because the honest cases are the useful ones:

- **A preferences object.** Shipping a WASM SQLite build to store a theme string
  is worse engineering, not better. `localStorage` is two lines.
- **A few hundred records, read once.** Below a few thousand rows, fetching and
  sorting in JavaScript over IndexedDB is genuinely fine and far less machinery.
- **A landing page.** No second navigation, no payback.
- **Browsers below the floor.** OPFS needs Chrome 108+, Safari 16.4+, Firefox
  111+ and a secure context. granthdb degrades to
  [IndexedDB and then to memory](/storage), but a fallback is a working app, not
  a fast one.

And whichever side you land on, measure it on a slow device rather than your
laptop — [benchmarking browser storage](/blog/benchmarking-browser-storage) is
about the tail, not the median, for exactly this reason.

## If you want to try it

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Getting started](/getting-started)** — the three files, one of which is the worker
- **[Cache-first apps](/cache-first-apps)** — the Notion pattern, including the p95 caveat
- **[Security & performance](/security-and-performance)** — measured numbers, and what is explicitly not faster
- **[Use cases](/use-cases)** — including the ones where this is the wrong tool
