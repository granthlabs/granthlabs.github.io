---
title: "The localStorage size limit, and what to use instead"
description: "localStorage is capped near 5 MB, stores only strings, and blocks the main thread on every read. When that is fine, when it is not, and what to move to."
date: "2026-08-25"
tags: ["storage", "performance"]
---

# The localStorage size limit — and what to use instead

The 5 MB is what people search for. It is the least interesting of the three
limits, and the only one you can fix by storing less.

The one that decides whether you should still be using it is that
`localStorage` is **synchronous**. Not "slow" — synchronous. Every read happens
on the main thread, in the middle of whatever frame you were rendering, and
there is no version of the call that yields.

## Limit one: roughly 5 MB, per origin

Not per key. The quota is shared across every key your origin has ever set, and
the key names count towards it too. So the blob you are watching is not the only
thing spending your budget.

Two details that catch people:

- **It is measured against the stored string.** JavaScript strings are UTF-16,
  so in the browsers that count the quota in bytes, a 5 MB budget buys roughly
  2.5 million characters rather than 5 million. A document that looks like 4 MB
  of text can be over.
- **`QuotaExceededError` throws mid-write.** Each `setItem` is its own
  operation; there is no transaction spanning two keys. A quota failure on the
  third of four writes leaves the first two applied and your state
  half-committed, and you find out synchronously, from inside whatever function
  was doing the saving.

You can push this out for a while — prune old entries, compress, split across
keys. All of it is work spent to keep using the wrong store.

## Limit two: strings only

Everything is serialised on the way in and parsed on the way out. That is not
just overhead, it is lossy: `JSON.stringify` turns a `Date` into a string, drops
`undefined`, and cannot represent a `Map`, a `Set`, a typed array, `NaN`,
`Infinity` or a `BigInt` at all. Values come back as something adjacent to what
you stored, and the bugs surface later, somewhere else.
[Structured clone versus JSON](/blog/structured-clone-vs-json) covers exactly
what goes missing.

The other consequence is that reads have no granularity. To learn one field you
parse the whole blob, because the blob is the unit. Cost scales with the size of
what you stored, never with the size of what you asked for.

## Limit three: it is synchronous, and you cannot move it

This is the one worth the article.

`localStorage.getItem` returns the value. That contract requires the thread to
wait — for the read, and then for your `JSON.parse` of the result. There is no
callback form, no promise form, nothing to `await`. And `localStorage` is not
exposed inside a Worker at all, so the usual escape hatch of pushing the work
off-thread is closed by the platform, not by your architecture.

At 5 KB this is invisible and you should not think about it. At 5 MB it is a
dropped frame, and it lands in the worst possible place: boot. Storage reads
cluster in the startup path, which is the frame you can least afford to spend.

<figure>
 <svg viewBox="0 0 640 296" role="img" aria-label="A localStorage read and its JSON parse occupy the main thread as one blocking segment that delays the next render, whereas a granthdb query is posted to a worker so the main thread keeps rendering while SQLite runs the query on another thread." style="width:100%;height:auto;color:var(--g-text)">
  <title>A blocking read versus a query on another thread</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">localStorage</text>
  <rect x="110" y="30" width="514" height="44" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="16" y="57" fill="currentColor" fill-opacity="0.6" font-size="11.5" font-family="ui-monospace, monospace">main thread</text>
  <rect x="118" y="38" width="96" height="28" rx="4" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="166" y="56" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">render</text>
  <rect x="222" y="38" width="250" height="28" rx="4" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="347" y="56" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">getItem + JSON.parse</text>
  <rect x="480" y="38" width="136" height="28" rx="4" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="548" y="56" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">render (late)</text>
  <text x="110" y="92" fill="currentColor" fill-opacity="0.55" font-size="11">One thread, one queue. Nothing else runs, and nothing can be moved.</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">granthdb</text>
  <rect x="110" y="122" width="514" height="44" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="16" y="149" fill="currentColor" fill-opacity="0.6" font-size="11.5" font-family="ui-monospace, monospace">main thread</text>
  <rect x="118" y="130" width="96" height="28" rx="4" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="166" y="148" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">render</text>
  <rect x="222" y="130" width="110" height="28" rx="4" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="277" y="148" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">postMessage</text>
  <rect x="340" y="130" width="276" height="28" rx="4" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="478" y="148" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">render, animate, respond</text>
  <path d="M277 168 V182" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M277 186 l-5 -8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <path d="M430 186 V172" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M430 168 l-5 8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="110" y="188" width="514" height="44" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="16" y="215" fill="currentColor" fill-opacity="0.6" font-size="11.5" font-family="ui-monospace, monospace">worker</text>
  <rect x="222" y="196" width="250" height="28" rx="4" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="347" y="214" fill="currentColor" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">SELECT ... LIMIT 25</text>
  <text x="16" y="256" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">The size limit is the one you can work around. The blocking is not.</text>
  <text x="16" y="276" fill="currentColor" fill-opacity="0.55" font-size="11">Storing less makes the read smaller. It never makes it asynchronous.</text>
 </svg>
 <figcaption>localStorage is not exposed inside a Worker, so there is no version of the top lane where the work moves somewhere else.</figcaption>
</figure>

## When localStorage is still the right answer

Often. A theme preference, a dismissed banner, a feature flag — a few keys of a
few bytes each. The read is too small to show up in a profile, and the API is
two lines with no build step.

And for one class of value, being synchronous is the *feature*: anything you
must know before first paint. Reading the theme synchronously in a blocking
script is how you avoid a flash of the wrong colours. No asynchronous store can
give you that, because the first paint does not wait for a promise. Keep those
keys where they are.

Shipping a WASM SQLite build to store one preferences object is worse
engineering, not better. The [use cases page](/use-cases) says so before it says
anything else, and [security and performance](/security-and-performance) is
explicit that for a few hundred key-value reads the difference is noise.

## When it stops being the right answer

Any one of these is enough:

- more than a megabyte or two
- you store a **list** and filter or sort it in JavaScript
- you `JSON.parse` the same blob on every page load
- you have hit `QuotaExceededError`
- two tabs of your app can disagree about the data
- storage reads show up in a performance profile

## The multi-tab failure nobody plans for

The usual shape is read–modify–write: parse the blob, change one item,
stringify, `setItem`. Two tabs doing that concurrently do not lose one field —
the second write replaces the whole string, so the first tab's entire change
disappears.

The `storage` event does not save you. It fires in *other* tabs and never in the
tab that wrote, so it can tell you something changed after the fact but cannot
serialise your writes. Coordinating writers across tabs needs a lock, which is a
[separate problem with a real answer](/blog/web-locks-leader-election).

## Migrating: from a blob to rows

The change is mechanical. Before:

```js
const todos = JSON.parse(localStorage.getItem('todos') ?? '[]');
const open = todos.filter((t) => !t.done).sort((a, b) => a.created - b.created);
```

After — declare the shape, move the data once, then stop parsing blobs:

```js
db.version(1).stores({ todos: '++id, done, created' });

const legacy = JSON.parse(localStorage.getItem('todos') ?? '[]');
if (legacy.length) {
  await db.todos.bulkAdd(legacy);
  localStorage.removeItem('todos');
}

const open = await db.todos.where('done').equals(false).orderBy('created').toArray();
```

The second version stops getting slower as the list grows, because it stops
loading the whole list to read part of it. Full walkthrough on
[replacing web storage](/replacing-web-storage).

## Auth tokens do not belong in any of these

Worth stating plainly, because "move the token somewhere safer" is a common
reason people go looking for a localStorage alternative, and it is the wrong
reason.

A token in a database is not safer than a token in `localStorage`. The threat is
XSS, and any script running on your origin can call `db.tokens.get()` exactly as
easily as `localStorage.getItem('token')`. Encrypting it changes nothing — the
script calls your decrypt path. Moving a token between JS-readable stores is
motion, not progress.

The actual answer is a cookie JavaScript cannot read:

```
Set-Cookie: session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600
```

That is a boundary the browser enforces, not a convention your code maintains.
If you are on a bearer-token flow, hold the access token in a module-scoped
variable — gone on reload, never serialised — and pair it with a refresh token
in an `httpOnly` cookie.

## Picking the replacement

| What you have | Where it belongs |
|---|---|
| A few small keys, needed before first paint | Stay on `localStorage` |
| A bag of key-value pairs you never query | IndexedDB — built in, costs nothing to load |
| A list you filter, sort, count or paginate | A query engine |

If you land on the third row, the honest costs are: a few hundred kilobytes of
WebAssembly on first load, a secure context, and Chrome 108+, Safari 16.4+ or
Firefox 111+. [IndexedDB vs SQLite WASM](/blog/indexeddb-vs-sqlite-wasm) is the
long version of that decision.

One thing does not improve, whichever row you pick. Browser storage is
evictable: Safari clears script-writable storage after 7 days without site
interaction, cleanup tools delete OPFS as "Internet Cache", and roughly 0.1–0.2%
of users across this ecosystem hit corruption anyway. That was true of your
localStorage blob too. Call `navigator.storage.persist()`, keep a
rebuild-from-server path, and treat the local copy as a cache — see
[Storage](/storage).

## If rows are what you want

[granthdb](/getting-started) is SQLite compiled to WebAssembly, stored in OPFS,
behind the Dexie API, running in a Worker — so the read that used to block your
frame is not on your thread at all.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Replacing web storage](/replacing-web-storage)** — the full comparison, and where tokens go
- **[Storage](/storage)** — OPFS, the IndexedDB and memory fallbacks, quotas and eviction
- **[Security and performance](/security-and-performance)** — measured numbers, and what this does not give you
- **[Use cases](/use-cases)** — including the ones where a database is the wrong tool
