---
title: "Electing one writer across browser tabs with the Web Locks API"
description: "How the Web Locks API elects a single writer across browser tabs with no heartbeat and no timeout to tune — and the one failure mode you still have to handle."
date: "2026-08-25"
tags: ["concurrency", "OPFS", "storage"]
---

# Electing one writer across browser tabs with Web Locks

SQLite in a browser tab is one file on disk, and the fastest OPFS VFS —
`opfs-sahpool`, which needs no COOP/COEP headers — allows exactly **one
connection** to it. Open your app in three tabs and three agents want the same
file. Two of them writing it is not a lost update, it is a corrupt database.
That is what happened to [Notion's first WASM-SQLite rollout](/storage).

So something has to pick one tab. The browser already ships the primitive, and
it is better than the one you would have written.

## The election you would have written

The obvious design is a heartbeat. Every tab stamps `leader-alive` into
`localStorage` once a second; a tab that sees a stale stamp claims leadership.

It nearly works, and every part of it is a knob:

- **Pick the staleness threshold.** Too short and a leader doing a three-second
  bulk import gets deposed while it still holds the file open — two writers,
  which is the exact outcome you built this to prevent. Too long and every tab
  stalls for that duration after a crash.
- **`localStorage` is synchronous and racy.** Two tabs can read the same stale
  value in the same tick and both claim.
- **The heartbeat has to keep beating.** That is a timer in every tab, and
  browsers throttle timers in background tabs — so the mechanism that proves
  liveness is the one the browser slows down first.
- **A heartbeat measures liveness by proxy.** A frozen tab is not a dead tab,
  but it looks identical from the outside.

Every one of those is tuning. Web Locks has none of them, because it does not
infer liveness at all.

## What Web Locks actually does

`navigator.locks.request(name, callback)` holds a named lock for exactly as long
as the callback's promise stays pending. Requests for the same name queue in
order; the next one runs when the holder settles.

The part that matters for election: **the lock is bound to the agent, not to a
lease.** Close the tab, crash the renderer, force-quit the browser — the lock is
released, because the browser *is* the lock manager and it already knows the tab
is gone. There is nothing to renew and no expiry to pick. The failure detector
is the same code that reaps the tab.

## The pattern

```js
const LOCK = 'granth/myapp';

// Every tab runs this at startup. For a follower it never returns.
navigator.locks.request(LOCK, async () => {
  await openTheDatabase();       // only the holder ever touches the file
  serveQueriesFromOtherTabs();
  await new Promise(() => {});   // hold the lock for the life of this tab
});
```

Two things are doing quiet work there.

**The never-resolving promise.** A normal `request` callback finishes and
releases. Leadership is not a critical section with an end — you hold it until
you die. A promise nobody will settle expresses "until this agent goes away"
exactly, and costs nothing at runtime: it is not a spin loop, it is a pending
job the event loop never revisits.

**The queue is the failover.** Followers are not polling to check whether the
leader is still there. They are already sitting in FIFO order behind it. When
the holder's tab dies the browser releases the lock and runs the next callback,
which opens the file and becomes the leader. No election round, no term number,
no code you wrote, and nothing to test with a fake clock.

If a tab wants to observe who holds the lock without queueing for it, ask:

```js
const { held } = await navigator.locks.query();
const leader = held.find((l) => l.name === LOCK);
```

Followers still need a way to reach the leader with their queries — a
`BroadcastChannel` to the holding tab's worker, one hop, described in
[Storage](/storage). Election decides *who*; the channel is *how*.

## The failure that actually matters

Leader election answers who writes. It does not answer what happens to a call
that was in flight when the writer vanished.

A follower posts "insert this row" and the leader's tab closes a millisecond
later. The call times out. What do you tell the caller?

There are two genuinely different situations, and they want opposite responses:

- **Nothing ran.** Retry. It cannot double-write.
- **Something may have run.** Do not retry. You could be inserting twice.

If you cannot tell them apart you must assume the dangerous one for both, and
then every transient hiccup — a tab closed at the wrong moment, which users do
constantly — becomes a manual recovery.

The distinction is not free. What creates it is **an acknowledgement sent before
execution, not after.** The leader receives the message, immediately posts back
"mine, I have it", and only then compiles and runs the statement.

- No acknowledgement ever arrived → no live leader picked the message up, so
  nothing crossed into SQLite. In granthdb this is `NoLeaderError`, and it is
  safe to retry.
- An acknowledgement arrived and then the tab went silent → it started. Whether
  the transaction committed before the process died is genuinely unknowable from
  outside. That is `LeaderLostError`, and granthdb never retries it for you.

SQLite itself is fine either way: the connection dies, the open transaction
rolls back. The uncertainty is not about the file, it is about which side of the
commit the tab died on — see [Transaction](/transaction).

<figure>
 <svg viewBox="0 0 640 232" role="img" aria-label="A call whose leader disappeared before acknowledging it never ran and is safe to retry, whereas a call the leader acknowledged before dying may or may not have committed and must be verified instead of retried." style="width:100%;height:auto;color:var(--g-text)">
  <title>Two ways a leader can vanish, and why only one is safe to retry</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">vanished before acknowledging</text>
  <rect x="16" y="30" width="128" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="80" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">call sent</text>
  <text x="80" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">deadline attached</text>
  <path d="M152 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="30" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="267" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">no acknowledgement</text>
  <text x="267" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">never reached SQLite</text>
  <path d="M350 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="30" width="234" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="406" y="47" fill="currentColor" font-size="11.5">NoLeaderError — retry is safe</text>
  <text x="406" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">nothing was written</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">vanished after acknowledging</text>
  <rect x="16" y="122" width="128" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="80" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">call sent</text>
  <text x="80" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">deadline attached</text>
  <path d="M152 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="122" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="267" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">acknowledged</text>
  <text x="267" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">then the tab died</text>
  <path d="M350 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="122" width="234" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="406" y="139" fill="currentColor" font-size="11.5">LeaderLostError — verify first</text>
  <text x="406" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">commit state unknown</text>
  <text x="16" y="196" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">The acknowledgement is sent before the query runs, not after.</text>
  <text x="16" y="216" fill="currentColor" fill-opacity="0.55" font-size="11">Remove it and every timeout collapses into the second, dangerous case.</text>
 </svg>
 <figcaption>granthdb retries the first case for you — three attempts with a short backoff — and never retries the second, with open() the single exception.</figcaption>
</figure>

## The frozen tab is what makes this hard

Here is the wrinkle that turns a tidy rule into real work.

**A frozen tab still holds its lock.** Freezing is not dying, so the browser
does not release, and nothing re-elects. Meanwhile `postMessage` queues messages
for it rather than dropping them. So "nobody acknowledged within five seconds"
does not by itself mean "nothing ran" — it can equally mean "will run later,
whenever that tab thaws".

The fix is a **deadline carried in every call**. A leader that reads a call
whose deadline has already passed refuses it instead of running it. Without that
fence, a thawing tab executes work the caller gave up on and retried, and the
write lands twice — the precise bug the two error types existed to prevent.

The leader's cutoff is set slightly *earlier* than the caller's, leaving room
for the acknowledgement to travel, so a call the leader accepted is never
reported back as un-accepted. Both errors are described in
[Errors](/errors).

## What Web Locks does not give you

- **It is one origin, one browser profile.** Nothing here coordinates across
  devices, or even across browsers on the same machine. That is a sync engine,
  and it is a much larger project — [use cases](/use-cases) says so plainly.
- **Secure context only.** HTTPS or `localhost`, the same requirement OPFS
  carries. Below that you need a different topology entirely.
- **`steal: true` exists and is wrong here.** It is for recovering a wedged
  holder in a cooperative protocol. Stealing the writer lock is a supported API
  call whose direct result is two connections to one SQLite file.
- **One writer is not one transaction.** Election stops two tabs opening the
  file; it does not stop two tabs interleaving a read-modify-write through the
  same leader. That still needs [a transaction](/transaction).

The honest summary: Web Locks removes the entire class of bugs that come from
guessing whether a peer is alive, and removes none of the bugs that come from
not knowing whether a message was executed. The first is the browser's job. The
second is yours, and one extra message is what separates a safe retry from a
dangerous one.

## In granthdb

One elected writer, [`BroadcastChannel`](/storage) routing, and the two typed
errors are the default behaviour of the worker runtime — there is no
configuration for it beyond `timeoutMs`.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Storage](/storage)** — the single-writer topology, and how it differs from
  Notion's SharedWorker version
- **[Errors](/errors)** — `NoLeaderError`, `LeaderLostError`, and when to retry
- **[Runtimes](/runtimes)** — why only the worker runtime can hold the file
- **[IndexedDB vs SQLite WASM](/blog/indexeddb-vs-sqlite-wasm)** — whether you
  need any of this in the first place
