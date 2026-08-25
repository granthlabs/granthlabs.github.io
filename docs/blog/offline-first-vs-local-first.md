---
title: "Offline-first vs local-first: which one do you actually need?"
description: "Cache-first, offline-first and local-first are three different amounts of work. Which one your app needs, and why the local copy owning the truth costs most."
date: "2026-08-25"
tags: ["offline", "storage", "comparison"]
---

# Offline-first vs local-first: which one do you actually need?

The three terms get used interchangeably in job ads, README files and
architecture docs, and they describe three genuinely different amounts of work —
somewhere between a week and a year of it.

The whole distinction reduces to one question: **when the local copy and the
server copy disagree, which one is right?**

- **Cache-first** — the server is right. The local copy exists to avoid a
  spinner, and you can delete it at any time.
- **Offline-first** — the server is still right. The local copy accumulates
  writes while the network is gone and replays them later; the server may reject
  them.
- **Local-first** — the local copy is right. There may be no server at all, or
  only a relay. Two devices that diverge have to be merged, and something has to
  decide how.

Everything else — OPFS, service workers, WASM, CRDTs — is downstream of that
answer.

## The three patterns side by side

| | Cache-first | Offline-first | Local-first |
|---|---|---|---|
| Who owns the truth | the server | the server | the local copy |
| Writes while offline | usually blocked | queued, replayed later | just writes, always |
| When copies disagree | discard the local one | server decides | merge — your problem |
| What you must build | a read cache | a durable write queue | a sync engine |
| Deleting local data | safe, refetch | loses queued writes | loses user data |
| Realistic scope | days | weeks | months, and ongoing |

The last two rows are the ones that decide projects. In a cache-first app,
`deleteDatabase()` behind a "reset local data" button is a complete recovery
story. In a local-first app, the same button is data loss, because there is
nowhere to refetch from.

That matters because browser storage is evictable no matter which pattern you
pick. Safari clears script-writable storage after 7 days without site
interaction, cleanup tools delete OPFS as "Internet Cache", and corruption
shows up in the field at roughly 0.1–0.2% of users from browser crashes alone.
An architecture where eviction is a refetch is a different animal from one where
eviction is a support ticket. See [Storage](/storage) for the specifics.

<figure>
 <svg viewBox="0 0 640 326" role="img" aria-label="A three-row comparison showing that a cache-first app keeps a rebuildable local read model while the server owns the truth, an offline-first app adds a queue of local writes replayed on reconnect while the server still owns the truth, and only a local-first app makes the local copy authoritative and therefore has to merge divergent copies and resolve the conflicts itself" style="width:100%;height:auto;color:var(--g-text)">
  <title>Where the truth lives in each of the three patterns</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">cache-first</text>
  <rect x="16" y="30" width="150" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="91" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">local read model</text>
  <text x="91" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">rebuildable</text>
  <path d="M174 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M206 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="214" y="30" width="190" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="309" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">refresh from the network</text>
  <text x="309" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">one direction</text>
  <path d="M412 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M444 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="452" y="30" width="172" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="538" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">server owns the truth</text>
  <text x="538" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">nothing to merge</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">offline-first</text>
  <rect x="16" y="122" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="91" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">local writes queue</text>
  <text x="91" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">replayed later</text>
  <path d="M174 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M206 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="214" y="122" width="190" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="309" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">sync when back online</text>
  <text x="309" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">still one direction</text>
  <path d="M412 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M444 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="452" y="122" width="172" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="538" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">server still owns truth</text>
  <text x="538" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">it can reject yours</text>
  <text x="16" y="204" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">local-first</text>
  <rect x="16" y="214" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="91" y="231" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">local copy is truth</text>
  <text x="91" y="246" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">peers, not clients</text>
  <path d="M174 234 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M206 234 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="214" y="214" width="190" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="309" y="231" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">merge divergent copies</text>
  <text x="309" y="246" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">CRDTs, vector clocks</text>
  <path d="M412 234 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M444 234 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="452" y="214" width="172" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="538" y="231" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">conflict resolution</text>
  <text x="538" y="246" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">you build this</text>
  <text x="16" y="288" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">Only the bottom row needs a sync engine. granthdb is not one.</text>
  <text x="16" y="308" fill="currentColor" fill-opacity="0.55" font-size="11">The top two need a local store and a rebuild path — which is the smaller project.</text>
 </svg>
 <figcaption>Most products described as local-first sit in the top two rows: the label travelled faster than the architecture did.</figcaption>
</figure>

## Cache-first: the one most apps mean

You already fetched these records. The user navigates back and you fetch them
again, with a spinner in between. Cache-first removes the spinner: paint from
the local copy, refresh from the network behind it, update the view when the
fresh data lands.

This is what Notion shipped when they moved page data into a WASM build of
SQLite — roughly a **20% improvement in navigation time**, and more where the
network is the bottleneck: **28% in Australia, 31% in China, 33% in India**.

It is also the pattern with the most honest failure mode. Their p95 got *worse*
on slow devices before tuning, because reading from a cheap disk can lose to a
fast network. The fix was to stop choosing and race the two, taking whichever
answered first. [Cache-first apps](/cache-first-apps) has the details and the
snippet.

What you build: a schema, a read path, a background refresh, a "reset local
data" button. What you do not build: any notion of a write that has not reached
the server, because there isn't one.

## Offline-first: writes that survive the tunnel

Offline-first adds one thing — the user can *change* data with no network, and
those changes must not evaporate.

That one addition is where the work is:

- A durable queue of pending operations, ordered, that survives a reload and a
  crash.
- Idempotent replay, because you will retry an operation whose response you
  never saw.
- A UI that distinguishes "saved" from "saved on this device", so the user is
  not lied to.
- A rejection path. The server can refuse a queued write — stale version,
  deleted record, revoked permission — and something has to tell the user
  long after they typed it.

The server still owns the truth, which is what keeps this tractable. There is no
merge algorithm: there is a queue, and a server that accepts or rejects each
item.

Note the trap in the middle of that list. A queue of pending writes is data with
no server copy, which means it is the one part of a local cache you cannot
casually rebuild. If you queue writes, `db.export()` snapshots and a flush before
unload stop being optional.

## Local-first: the expensive one

Local-first means the local copy is authoritative. Two devices edit while
partitioned, both are correct, and the system must converge them without asking
a server to arbitrate — usually with CRDTs, an operational-transform engine, or a
per-field merge policy you designed yourself and now have to defend at 3am.

It is the right answer for a real class of products — collaborative editors,
field-work tools with no reliable connection, anything where the user's data
should outlive your company. It is not a storage decision. It is an application
architecture, a data model built around merge semantics, and a permanent
maintenance commitment. If you adopt it, adopt a sync engine built for it rather
than assembling one.

## How to tell which one you need

1. **Can the user change data while offline?** If no, you want cache-first and
   the rest of this does not apply.
2. **If two devices change the same record while both offline, does one of them
   have to lose?** If the server can just pick, you want offline-first.
3. **Would the user reasonably expect both edits to survive?** Two people typing
   in the same paragraph — that is local-first, and only then.
4. **Would you ship this product if the data existed only on one device?** If the
   answer is no, you have a server, and if you have a server it can arbitrate.

Most teams answer no to (3) and build for it anyway, because "local-first" is the
term that circulates. The cost is not the storage layer; it is a merge model
threaded through every feature you add afterwards.

## Where granthdb sits

granthdb is a **local storage engine, not a sync engine**. It is SQLite compiled
to WebAssembly, kept in OPFS, behind a Dexie-compatible API, with one elected
writer so that multiple tabs cannot corrupt the file. That is the whole job.

Concretely, it does not:

- keep a server copy, or know your server exists
- resolve conflicts between users or between devices
- queue writes for later replay
- guarantee your data survives — the browser can evict it, and
  [Security & performance](/security-and-performance) says so plainly

So it is a good fit for the top two rows of that diagram: the local half of a
cache-first app, and the durable store underneath an offline-first queue you
write. For the bottom row it is at most the storage layer beneath a sync engine
you bring — and bolting sync on is the larger project, larger than the database
under it.

There are also cases where none of the three justify a WASM download: a tiny
dataset, data that changes constantly for everyone, or anything needing per-row
authorisation. [Use cases](/use-cases) lists those before it lists the good
fits. And if your problem is really "one cursor cannot filter and sort at once",
that is a query-engine question, not a sync one —
[IndexedDB vs SQLite WASM](/blog/indexeddb-vs-sqlite-wasm) is the post for it.

## Trying it

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Use cases](/use-cases)** — which pattern you are in, including when this is the wrong tool
- **[Cache-first apps](/cache-first-apps)** — the Notion pattern, with the p95 regression and the fix
- **[Storage](/storage)** — OPFS, the IndexedDB and memory fallbacks, eviction and the rebuild path
- **[Security & performance](/security-and-performance)** — the measured numbers and the hard limits
