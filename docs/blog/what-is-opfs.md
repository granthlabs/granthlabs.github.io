---
title: "What is OPFS? The origin private file system, explained"
description: "OPFS is a private, origin-scoped area the browser manages — not the user's disk. What sync access handles are, why SQLite needs them, and where OPFS is missing."
date: "2026-08-25"
tags: ["OPFS", "storage", "SQLite"]
---

# What is OPFS? The Origin Private File System, explained

The name is the problem. "Origin Private File System" sounds like a way to reach
the user's files. It is not. OPFS is a private storage area, scoped to your
origin, that the browser owns and the user never sees. No picker, no permission
prompt, nothing in Finder or Explorer to open.

What makes it interesting is not the "file system" part. It is one method —
`createSyncAccessHandle()` — that hands a Worker genuinely synchronous reads and
writes at byte offsets. That is the exact shape a database engine needs, and it
is the reason SQLite can run in a browser tab at all.

## What it actually is

One entry point, and it is on `navigator.storage`, not on `window`:

```js
const root = await navigator.storage.getDirectory();
const dir  = await root.getDirectoryHandle('db', { create: true });
const file = await dir.getFileHandle('app.sqlite3', { create: true });
```

From there you get directories, file handles, and real reads and writes at
offsets. It behaves like a filesystem because it has the shape of one — which is
exactly why a database can live there. But every property that matters is a
storage property, not a filesystem one:

- **Origin-scoped.** Another origin cannot see it or reach it. Yours is yours.
- **Invisible.** No prompt, no picker, no UI surface. The user cannot browse it.
- **Quota-bound.** It counts against the same origin quota as IndexedDB, and
  `navigator.storage.estimate()` reports it.
- **Browser-managed.** Clearing site data clears it. It is not a place you put
  something for the user to keep.
- **Secure context only.** HTTPS or `localhost`, enforced by the platform.

## The confusion: OPFS is not the File System Access API

These get conflated constantly, and there is a good reason: they are the same
spec and they share the `FileSystemFileHandle` interface. A handle you got from
`showOpenFilePicker()` and a handle you got from `getDirectoryHandle()` have the
same methods on them. Only where they came from differs — and that difference is
everything.

| | OPFS | The pickers |
|---|---|---|
| What it reaches | a private area only your origin sees | files the user chose, on their disk |
| How you get in | `navigator.storage.getDirectory()` | `showOpenFilePicker()` and friends |
| Needs a user gesture | no | yes — you cannot call one at startup |
| Chrome / Edge desktop | yes | yes |
| Safari, Firefox, Android | yes | **no** |

Safari ships OPFS and has never shipped the pickers. So "our web app edits files
on your machine" is honestly scoped to Chromium on desktop, while "our web app
stores a database locally" is available almost everywhere. Those are different
products and they are one table row apart.
[Files and binary data](/files-and-binary) has the full matrix and the
feature-detect.

## Two ways to write to an OPFS file

Given a file handle, there are two ways to put bytes in it, and they are not
variations on a theme.

`createWritable()` gives you a `FileSystemWritableFileStream`. It is
asynchronous, it works on the main thread and in a Worker, and it writes to a
temporary copy that is only swapped in when the stream closes cleanly — so an
interrupted write leaves the old file intact rather than a half-written one.
It streams, so `file.stream().pipeTo(w)` never materialises a large file in
memory.
For an avatar, a PDF, a video, an imported archive, this is the right call.

`createSyncAccessHandle()` gives you something else entirely: `read()`,
`write()`, `truncate()`, `getSize()` and `flush()` that return values rather than
promises, operating at a byte offset you specify. It is available only inside a
dedicated Worker, and it takes an exclusive lock on the file — a second one fails
while the first is open.

<figure>
 <svg viewBox="0 0 640 232" role="img" aria-label="Two ways to open the same OPFS file: createWritable works anywhere but is an asynchronous write-only stream that swaps a copy in on close, so it cannot back a database file, whereas createSyncAccessHandle is available only inside a dedicated Worker, takes an exclusive lock, and gives the synchronous reads and writes at byte offsets that a SQLite VFS requires." style="width:100%;height:auto;color:var(--g-text)">
  <title>Two handle types on one OPFS file</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">createWritable() — anywhere</text>
  <rect x="16" y="30" width="118" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="75" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">main thread</text>
  <text x="75" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">or a Worker</text>
  <path d="M142 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M174 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="182" y="30" width="196" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="280" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle" font-family="ui-monospace, monospace">createWritable()</text>
  <text x="280" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle">swaps a copy in on close</text>
  <path d="M386 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M418 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="426" y="30" width="198" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="442" y="47" fill="currentColor" font-size="11.5">async, and write-only</text>
  <text x="442" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">reads go via getFile()</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">createSyncAccessHandle() — Worker only</text>
  <rect x="16" y="122" width="118" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="75" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">dedicated Worker</text>
  <text x="75" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">not the window</text>
  <path d="M142 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M174 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="182" y="122" width="196" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="280" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle" font-family="ui-monospace, monospace">createSyncAccessHandle()</text>
  <text x="280" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle">exclusive: one per file</text>
  <path d="M386 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M418 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="426" y="122" width="198" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="442" y="139" fill="currentColor" font-size="11.5">sync read at an offset</text>
  <text x="442" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">what a VFS needs</text>
  <text x="16" y="196" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">Same file, same origin — the handle decides what can live in it.</text>
  <text x="16" y="216" fill="currentColor" fill-opacity="0.55" font-size="11">Only a dedicated Worker gets the synchronous one, and only one holder at a time.</text>
 </svg>
 <figcaption>The database ends up in a Worker because of a method signature, not because someone preferred it there.</figcaption>
</figure>

## Why the synchronous one is what unlocked SQLite

SQLite is C, and its storage layer is a VFS: a struct of callbacks named
`xRead`, `xWrite`, `xTruncate`, `xSync`, `xFileSize`. They are synchronous. A
synchronous C function cannot await a promise, and compiling it to WebAssembly
does not change that.

So before sync access handles, the options were both compromises. Keep the whole
database in WASM linear memory and lose it on reload. Or suspend the WASM stack —
Asyncify, and later JSPI — so C can wait on a JavaScript promise, which works but
costs size and complexity for every call that touches the file.

`createSyncAccessHandle()` removes the mismatch instead of papering over it. The
handle's `read` and `write` really are synchronous, at an offset, on a real file,
so the VFS is a thin shim rather than a stack-suspension machine. That is the
whole trick: not a performance optimisation, an impedance match.

It is also why a browser-side SQLite is a recent thing rather than an obvious old
one, and why "why not just use IndexedDB" has a different answer now than it did
in 2020 — see [IndexedDB vs SQLite WASM](/blog/indexeddb-vs-sqlite-wasm).

## Worker-only is a design constraint, not a footnote

Sync access handles are dedicated-worker-only. Not the window. That means an
OPFS-backed database cannot be a drop-in for something you call inline during a
render — the database lives in a Worker and you talk to it over `postMessage`.

Two consequences worth taking seriously:

- **Every read is async from your code's point of view**, even though the file
  I/O underneath is synchronous. If you currently call `localStorage.getItem` in
  a render path, that is a refactor, not a swap.
- **SQL is off the main thread by construction.** A slow scan cannot stutter an
  animation, because it is not on your thread. granthdb makes this explicit
  rather than silently degrading: a worker runtime that cannot build a worker
  raises an error instead of quietly moving SQL onto your main thread. See
  [Runtimes](/runtimes).

## Exclusive is the other half, and it costs you a design

The lock is per file and it is exclusive. One tab holds the handle; another tab
asking for the same file does not get a second connection, it gets a failure.

`opfs-sahpool` — the OPFS VFS that needs no COOP/COEP headers — allows exactly
one connection for exactly this reason. So multi-tab is not a feature you add
later; it is a topology you choose up front. The working
answer is to elect one tab via Web Locks, let its Worker be the only thing that
opens the file, and route every other tab's queries to it.

This is not theoretical tidiness. Two tabs writing one OPFS file is what
corrupted Notion's first WASM-SQLite rollout — the fix is election, not a
mitigation. [How the election works, and why it is not optional](/blog/web-locks-leader-election).

## Where OPFS is not

An OPFS-only design has holes in it, and they are not edge cases:

- **Safari private browsing has no OPFS at all.** A hard failure, not a slow
  path.
- **Chrome incognito gives an OPFS database far less room**, with surprising
  errors at the limit.
- **iOS Capacitor apps lose access handles when backgrounded.**
- **Version support.** Running SQLite on OPFS wants Chrome 108+, Safari 16.4+,
  Firefox 111+ and a secure context. Safari shipped bare OPFS earlier than that,
  but not the parts that make a database work.

Which is why treating storage as a single mode is the wrong shape. granthdb takes
an ordered list and falls through OPFS → IndexedDB → memory, so a private window
gets a working database rather than an exception —
[the fallback chain is on the Storage page](/storage).

## "Private" does not mean any of the things you want it to

Three claims the name invites, all of them false:

**It is not durable.** Safari evicts all script-writable storage after 7 days
without site interaction; home-screen PWAs and `navigator.storage.persist()` are
exempt. Cleanup tools delete OPFS as "Internet Cache", and Windows low-disk
cleanup clears it. Field data across this whole ecosystem shows roughly 0.1–0.2%
of users hitting corruption anyway. Always keep a rebuild-from-server path, and
exercise it.

**It is not encrypted.** The bytes sit on disk in plaintext. Anyone with the
device profile can read them. If you cache someone's notes, messages or client
records, encrypt the values before they are written.

**It is not private from your own page.** "Origin private" means private from
*other origins*. Script running on your origin has exactly the access your app
has, so XSS reads everything, and no browser-side encryption changes that because
the key must be usable by your code.
[Security and performance](/security-and-performance) states the limits with the
measured numbers beside them.

## If you want SQLite on OPFS without writing the VFS

[granthdb](/getting-started) is the official sqlite.org WASM build on
`opfs-sahpool`, in a Worker, with one tab elected via Web Locks, behind the API
Dexie already established — and it degrades to IndexedDB and then to memory where
OPFS is missing.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Storage](/storage)** — the fallback chain, quotas, eviction and multi-tab
- **[Runtimes](/runtimes)** — why the worker runtime is the only one that gets OPFS
- **[Files and binary data](/files-and-binary)** — the pattern for keeping large
  bytes in OPFS beside the database rather than inside it
- **[Security and performance](/security-and-performance)** — what this does not
  give you, stated first
