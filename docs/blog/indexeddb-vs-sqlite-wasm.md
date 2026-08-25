---
title: "IndexedDB vs SQLite WASM: which browser database should you use in 2026?"
description: "A side-by-side of IndexedDB and SQLite compiled to WebAssembly — query power, bundle cost, multi-tab safety and browser support — plus the four questions that decide it for a real application."
date: "2026-08-25"
tags: ["IndexedDB", "SQLite", "comparison"]
---

# IndexedDB vs SQLite WASM: which browser database should you use?

Both store structured data on the user's device. Both work offline. Both survive
a reload. The difference is what happens when you *ask a question* about the
data — and the answer decides whether your list view stays fast at 50,000 rows
or falls over at 5,000.

Short version, before the detail:

- **IndexedDB** is built in, costs nothing to load, and gives you one index per
  query.
- **SQLite in WebAssembly** costs a few hundred kilobytes and gives you a query
  planner, real transactions and SQL.

If you never filter and sort at the same time, IndexedDB is the right answer and
you can stop reading.

## The comparison

| | IndexedDB | SQLite (WASM + OPFS) |
|---|---|---|
| Download cost | **0 — it is built in** | ~400–900 kB of WASM, cacheable |
| Query engine | one index per query, cursor-walked | a real planner |
| Filter on A, sort by B | not expressible — sort in JS | one statement |
| Aggregates | count via cursor iteration | `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` |
| Joins | none — do it in JS | yes |
| Transactions | yes, per object store | yes, full ACID |
| Runs off the main thread | the API is async, the work is not always | yes, in a Worker |
| Multi-tab writes | last writer wins | one elected writer |
| Browser support | universal | Chrome 108+, Safari 16.4+, Firefox 111+ |
| Typical use | key-value, simple lookups | querying a real dataset |

## The one difference that actually decides it

Everything above collapses into a single question: **do you filter on one field
and order by another?**

IndexedDB reads through a cursor, and a cursor walks exactly one index in that
index's order. Filtering by `status` means you get results in `status` order.
There is no second index to apply and no `ORDER BY` separate from the `WHERE`.

So this is not expressible:

```js
// "open issues, newest first" — pick one: the filter or the order
store.index('status').openCursor(IDBKeyRange.only('open'));
```

What you write instead is a fetch-and-sort:

```js
const all = await db.issues.where('status').equals('open').toArray();
all.sort((a, b) => b.updated - a.updated);
const page = all.slice(0, 25);
```

That is correct, and it is genuinely fine at a few hundred rows. What it does is
trade a bounded cost for an unbounded one: to display 25 rows it deserialises
every row that matched, across the structured clone boundary, into JavaScript
objects. At 1,199 matches you build 1,199 objects and discard 1,174.

The tell is that the cost scales with **how much matched**, not with how much
you display. A list that is instant on seed data and janky on a real account is
almost always this.

<figure>
 <svg viewBox="0 0 640 232" role="img" aria-label="An IndexedDB cursor opens one index, walks every matching row into JavaScript and sorts them there to show twenty-five, whereas a SQL planner seeks on one index, orders by a second index and returns only the twenty-five rows needed" style="width:100%;height:auto;color:var(--g-text)">
  <title>One index per query, versus a query planner</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">IndexedDB cursor</text>
  <rect x="16" y="30" width="128" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="80" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">open one index</text>
  <text x="80" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">status</text>
  <path d="M152 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="30" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="267" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">walk 1,199 rows</text>
  <text x="267" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">into JS objects</text>
  <path d="M350 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="30" width="234" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="406" y="47" fill="currentColor" font-size="11.5">sort in JavaScript, keep 25</text>
  <text x="406" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">1,174 objects discarded</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">SQLite planner</text>
  <rect x="16" y="122" width="128" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="80" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">seek</text>
  <text x="80" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">status = open</text>
  <path d="M152 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="122" width="150" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="267" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">order by updated</text>
  <text x="267" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">a second index</text>
  <path d="M350 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="122" width="234" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="406" y="139" fill="currentColor" font-size="11.5">return 25 rows</text>
  <text x="406" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">off the main thread</text>
  <text x="16" y="196" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">The difference is how many rows cross into JavaScript.</text>
  <text x="16" y="216" fill="currentColor" fill-opacity="0.55" font-size="11">One returns everything that matched. The other returns the page you asked for.</text>
 </svg>
 <figcaption>A cursor is not a slow planner — it is a different mechanism, with no way to apply a second ordering.</figcaption>
</figure>

## "Just add a compound index"

A compound index on `[status+updated]` handles that exact query beautifully. It
is the right fix when you have one such query.

It stops working when filters become optional. Add a label filter, a date range
and an assignee, and a compound index answers exactly one combination of them.
With `n` optional filters you cannot enumerate the combinations, and you are
back to fetching and sorting in JS for every combination you did not anticipate.

Picking the index at query time from the predicates you were actually given is
the entire job of a query planner. IndexedDB has none, so the picking has to
happen when you write the schema — before you know what you will need.

## What SQLite WASM actually costs

Being honest about this matters more than the feature table.

**The download.** Several hundred kilobytes of WebAssembly. It caches well, but
the first visit pays it. Notion measured that loading it *synchronously* made
their first page slower than the network it replaced, and shipped it fully
asynchronously with the first page served from the network. Do the same: the
local database should earn its cost on the second navigation, not the first.

**Async everywhere.** The queries run in a Worker, which is the point, but there
is no synchronous read. If your current code calls `localStorage.getItem` inside
a render path, that is a real refactor rather than a swap.

**Browser support is good but not universal.** Chrome 108+, Safari 16.4+,
Firefox 111+, and a secure context (HTTPS or localhost). Below that you need a
fallback path — [granthdb degrades to IndexedDB and then to memory](/storage)
so Safari private browsing gets a working database instead of an exception.

**One writer across tabs.** This is a consequence people miss. OPFS sync access
handles are exclusive, and two tabs writing one SQLite file is a corrupted file
rather than a lost update. Any serious implementation elects a single writer —
[here is how that works and why it is not optional](/blog/web-locks-leader-election).

## The four questions that decide it

1. **Do you filter and sort on different fields?** If no, IndexedDB is fine.
2. **Does the dataset grow past a few thousand rows?** Below that, fetch-and-sort
   in JS is genuinely fine and much less machinery.
3. **Do you need aggregates or joins?** Counting or summing without pulling every
   row into JavaScript needs a query engine.
4. **Can you afford the WASM on first load?** If your app is a landing page with
   a bit of state, no. If it is a workspace people keep open, easily.

Three noes and IndexedDB — or a thin wrapper over it — is the correct answer. It
is built in, it costs nothing, and "built in and sufficient" beats "powerful" on
every axis that matters.

## The middle option

You do not have to choose between IndexedDB's API and SQLite's engine.

[granthdb](/getting-started) is SQLite compiled to WebAssembly, stored in OPFS,
behind the API Dexie already established:

```js
const grownups = await db.friends
  .where('age').above(18)
  .orderBy('name')
  .toArray();
```

Filter on one index, order by another, in one statement, in a Worker. If you have
written Dexie you have already written this — the API is deliberately not the
interesting part.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Getting started](/getting-started)** — pick your framework and go
- **[Migrating from Dexie or IndexedDB](/migrating-from-dexie)** — a codemod, and
  an importer that infers your schema from the existing database
- **[Storage](/storage)** — OPFS, the fallbacks, quotas and eviction
- **[Which use case is yours](/use-cases)** — including the ones where this is
  the wrong tool

Or [write a query in the sandbox](/play/sandbox) without installing anything.
