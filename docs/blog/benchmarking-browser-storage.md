---
title: "How to benchmark browser storage without fooling yourself"
description: "How to benchmark IndexedDB and SQLite WASM in the browser: measure p95 and p99, test on a slow device, assert ratios rather than millisecond thresholds."
date: "2026-08-25"
tags: ["performance", "testing", "IndexedDB"]
---

# How to benchmark browser storage without fooling yourself

A storage benchmark is one of the easiest things in web development to get a
wrong answer out of, because the wrong answer is usually the flattering one. You
swap the storage layer, run a script in a tab, watch a number go down, and ship.
Weeks later there is a small cluster of tickets from people on cheap Android
phones saying the app feels slower — and the benchmark still says it got faster.

Both are correct. The benchmark measured something real; it just wasn't the
thing those users experience. Here are the five ways it happens, and what to
measure instead.

## The mean hides the users you hurt

The clearest public example is Notion's. Moving page data into a WASM build of
SQLite gave them roughly a **20% improvement in navigation time**, and much more
where the network was the bottleneck: **28% in Australia, 31% in China, 33% in
India**. It is a genuinely good result.

It is also the result where, on slow devices, the **p95 got worse** before they
tuned it — because reading from a cheap disk can lose to a fast network.

A mean is a summary of a distribution, and it moves when the bulk of the
distribution moves. The users who got slower are still inside that number,
arithmetically cancelled out by the users who got faster. Nothing about
computing an average is capable of surfacing them.

So sort your samples and read the tail:

```js
const sorted = samples.slice().sort((a, b) => a - b);
const p = (q) => sorted[Math.ceil(q * sorted.length) - 1];
console.log(p(0.5), p(0.95), p(0.99), sorted.length);
```

Report p50, p95, p99 and `n` together, always. A change that improves the median
and regresses p99 has traded your worst-served users for your best-served ones.
That is sometimes the right trade. It is never a trade worth making by accident.

<figure>
 <svg viewBox="0 0 640 232" role="img" aria-label="The same ten thousand navigation timings produce two opposite conclusions: summarised as a mean the change looks twenty per cent faster and ships, while the ninety-fifth percentile of the identical samples shows that slow devices got slower and catches the regression before rollout." style="width:100%;height:auto;color:var(--g-text)">
  <title>One set of timings, two summaries, two conclusions</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">summarised as a mean</text>
  <rect x="16" y="30" width="128" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="80" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">10,000 timings</text>
  <text x="80" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">one rollout</text>
  <path d="M152 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="30" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="267" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">average them</text>
  <text x="267" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">one number</text>
  <path d="M350 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="30" width="234" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="406" y="47" fill="currentColor" font-size="11.5">20% faster — ship it</text>
  <text x="406" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">regression is invisible</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">summarised as p95</text>
  <rect x="16" y="122" width="128" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="80" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">10,000 timings</text>
  <text x="80" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">the same ones</text>
  <path d="M152 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="122" width="150" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="267" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">sort, take p95</text>
  <text x="267" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">and p99</text>
  <path d="M350 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="122" width="234" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="406" y="139" fill="currentColor" font-size="11.5">slow devices got slower</text>
  <text x="406" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">caught before rollout</text>
  <text x="16" y="196" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">The same run, summarised two ways, disagrees about whether it worked.</text>
  <text x="16" y="216" fill="currentColor" fill-opacity="0.55" font-size="11">One of those summaries has a user behind it. The other has arithmetic.</text>
 </svg>
 <figcaption>A mean can tell you a change was net positive. It never tells you who paid for it.</figcaption>
</figure>

## Your laptop is not the device you are optimising for

The numbers in [Security & performance](/security-and-performance) were
measured in Chrome on an M-series Mac, and they say so, because that context is
half the measurement. On that machine a local read beats the network every single
time. The regression Notion found is not *small* on hardware like that — it is
unobservable. There is no sample where the disk loses.

CPU throttling in devtools does not fix this. It throttles the CPU, and what you
changed was storage I/O. A 6× CPU slowdown on an NVMe SSD is still an NVMe SSD.

The only measurement that tells you about slow devices is one taken on a slow
device: a cheap Android phone over remote debugging, or the oldest machine
anyone in the company still has. One real device beats any amount of simulated
throttling, because the thing you need to observe is the disk.

## Assert a ratio, not a millisecond

This is the assertion almost every storage benchmark starts with:

```js
expect(elapsed).toBeLessThan(50);
```

What it actually asserts is which CI runner you got. The measurements in the
granth repo vary by roughly ±3× on a single machine depending on load, so a
threshold tight enough to catch a real regression is loose enough to flake on a
busy afternoon. Someone bumps it to 200, and now it catches nothing at all.

Hold the work constant, vary the one thing that should not matter, and assert
the **ratio** between them:

```js
const oneAtATime = await time(() => insertIndividually(rows));
const batched = await time(() => db.items.bulkAdd(rows));

expect(batched).toBeLessThan(oneAtATime / 10);
```

Both halves ran on the same machine within the same second, so the machine
cancels out. `bulkAdd` measures around 200× the throughput of the same rows
added one at a time — each individual write is its own durable commit — so
asserting a mere 10× leaves generous room for a loaded runner while still
failing loudly the day someone removes the chunking.

The same shape covers the regressions actually worth catching:

- **Same query, 5,000 rows against 50,000.** Assert the time grows far less
  than 10×. Linear growth means the index stopped being used.
- **Indexed against unindexed column**, same table, same predicate.
- **`bulkGet(500)` against 500 `get()` calls** — one round trip against 500,
  measured at roughly 35×.

Each of those is a question about your code. "Under 50 ms" is a question about
your laptop, and you already know the answer.

## Warm, cold, and which one your users actually get

A benchmark that runs the same query 200 times and averages is measuring the
200th run. By then SQLite's page cache is warm, the OS is holding the file, the
WASM module is compiled, the connection is open and the statement is prepared.

The first navigation of a session pays for none of that being true. It pays for
the WASM download — several hundred kilobytes, cached after the first visit —
plus instantiation, opening the OPFS file, and planning the query cold. That
cost is exactly why Notion loads the module fully asynchronously and serves the
first page from the network; loading it synchronously made first paint slower
than the network it was replacing.

Both numbers are real, and averaging them produces a number that describes
nobody. Measure and report them separately:

- **Cold:** a fresh profile or private window, timed from `open()` to first row.
  This is once per session, and it is the one a warm-only benchmark cannot see.
- **Warm:** discard the first handful of runs, then measure. This is every other
  query the user makes.

If your benchmark only ever measures warm queries, it is structurally incapable
of noticing the cost you just added to first load. See
[storage and its fallbacks](/storage) for what "open" involves on each path.

## A query duration is not a jank measurement

`performance.now()` around an `await` gives you the same 26 ms whether that scan
ran on the main thread or in a Worker. To the user those are completely
different events: one drops two frames, the other drops none.

So record long tasks alongside durations:

```js
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) console.log('long task', e.duration);
}).observe({ entryTypes: ['longtask'] });
```

The honest converse also matters. If your storage work is a few hundred
key-value reads, none of this will show up anywhere, and the correct conclusion
from a well-run benchmark is to keep using `localStorage` or IndexedDB.
Shipping a WASM SQLite build to store a preferences object is worse engineering,
not better — the [comparison post](/blog/indexeddb-vs-sqlite-wasm) is fairly
blunt about where the line sits.

## When the measurement says "it depends"

Sometimes the honest reading of a good benchmark is that neither path wins for
everyone. Notion's answer to their p95 regression was to stop choosing and race:

```js
const rows = await Promise.any([
  db.pages.where('workspace').equals(id).toArray().then((r) => r.length ? r : Promise.reject()),
  fetch(`/api/pages?workspace=${id}`).then((r) => r.json()),
]);
```

`Promise.any` rather than `Promise.race`, so an empty or failed local read
cannot win by returning nothing. On a fast device the local read wins and the
fetch costs you a request. On a slow one it loses, and the user gets an answer
instead of waiting for the cache to lose slowly.

Racing is itself measurable, and worth measuring: log which side won, bucketed
by device class. If local wins nearly always, you are paying for a wasted fetch
you could drop for most users. If it only wins half the time, you have learned
something uncomfortable and useful about your cache.

## The short version

- Sort the samples. Report p50, p95, p99 and `n` — never a bare mean.
- Run it on a slow device, because that is the only place the interesting
  failure exists.
- Assert ratios between two runs on the same machine, not absolute milliseconds.
- Separate cold from warm, and never average them together.
- Record long tasks, not just query durations.
- Be willing to conclude that the thing you were about to adopt is not needed.

## Trying it against granthdb

granthdb is SQLite compiled to WebAssembly, stored in OPFS, behind a
Dexie-compatible API. The repo ships the benchmark that produced the published
numbers, so you can run it on your own hardware rather than trusting one Mac.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Security & performance](/security-and-performance)** — the measured
  table, the machine it came from, and what is explicitly *not* faster
- **[Cache-first apps](/cache-first-apps)** — the Notion pattern in full,
  including the p95 regression and the race that fixed it
- **[Use cases](/use-cases)** — including the ones where this is the wrong tool
- **[Sandbox](/play/sandbox)** — run a query without installing anything
