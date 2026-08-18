# Storage

## OPFS first, IndexedDB as fallback

Storage is an **ordered list of plugins**, not a mode string. The first available
one wins, and an `open()` failure falls through to the next — availability is a
prediction, opening is the proof.

```js
// db.worker.js
import { startGranthWorker } from 'granth-runtime-worker/entry';
import { opfsStorage } from 'granth-storage-opfs';
import { indexeddbStorage } from 'granth-storage-indexeddb';
import { memoryStorage } from 'granth-storage-memory';

startGranthWorker({
  sqlite3InitModule,
  filename: '/myapp.sqlite3',
  storage: [opfsStorage(), indexeddbStorage(), memoryStorage()],
});
```

```js
await db.storageKind(); // -> 'opfs' | 'indexeddb' | 'memory'
```

| Plugin | Persists | Works where |
|---|---|---|
| `granth-storage-opfs` | in place, fastest | a dedicated Worker + OPFS |
| `granth-storage-indexeddb` | debounced whole-file checkpoint | anywhere IndexedDB exists, incl. Safari private browsing |
| `granth-storage-memory` | not at all | absolutely everywhere: Node, SSR, tests, sandboxed frames |

Drop `memoryStorage()` from the list if you would rather fail loudly than run
against a store that silently forgets on reload.

OPFS is the fast path, but it is **not universally available**:

- **Safari private browsing has no OPFS at all** — a hard failure, not a slow path.
- Chrome incognito caps an OPFS database at ~100 MB, with surprising errors at the limit.
- iOS Capacitor apps lose access handles when backgrounded.

`'auto'` (the default) tries OPFS and falls back to IndexedDB, so your app keeps working in a
private window instead of throwing.

### The fallback is the same engine

Not a second implementation: the same SQLite build on an in-memory database, whose bytes are
checkpointed into IndexedDB. Every query, index, trigger and migration behaves identically.

Trade-offs worth knowing:

- checkpoints are **debounced and whole-file**, so cost is O(database size). Right for the
  fallback case (tens of MB); wrong as a primary store.
- writes since the last checkpoint are lost on a crash. `close()` flushes automatically; call
  `await db.flush()` before anything you cannot lose.

## The local database is a cache, never the source of truth

Browser storage is **evictable**:

- Safari evicts all script-writable storage after **7 days** without site interaction (ITP).
  Home-screen PWAs and `navigator.storage.persist()` are exempt.
- Cleanup tools delete OPFS as "Internet Cache"; Windows low-disk cleanup clears it.
- Field data across the ecosystem shows ~0.1–0.2% of users hit corruption anyway.

So:

```js
await navigator.storage.persist();            // ask to be exempt from eviction
const { quota, usage } = await navigator.storage.estimate();
const bytes = await db.size();                // what we actually occupy
```

**Always keep a rebuild-from-server path.**

## Multi-tab

`opfs-sahpool` is the fastest OPFS VFS and needs no COOP/COEP headers, at the cost of allowing
exactly one connection. [`opfs-leader`](https://www.npmjs.com/package/opfs-leader) elects one tab
via Web Locks; its worker is the only thing that opens the file, and every other tab routes
queries to it. When that tab dies the browser releases the lock and another takes over.

Two tabs writing one OPFS file is what corrupted Notion's first WASM-SQLite rollout. This is the
fix, not a mitigation.

<figure class="arch">
<svg class="arch__svg" viewBox="0 0 760 290" role="img" aria-labelledby="arch-t arch-d">
 <title id="arch-t">Single-writer tab topology</title>
 <desc id="arch-d">Every tab runs its own worker, but only the tab holding the Web Lock opens the database file. Other tabs send queries to that tab over a BroadcastChannel. If the holding tab closes, the browser releases the lock and another tab takes over.</desc>
 <defs>
  <marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
   <path d="M0 0l8 4-8 4z" fill="var(--g-text-3)" />
  </marker>
 </defs>
 <rect x="8" y="16" width="286" height="94" rx="12" fill="var(--g-bg-panel)" stroke="var(--g-accent-dim)" />
 <text x="24" y="40" font-size="11" letter-spacing=".08em" fill="var(--g-accent)">TAB 1 — HOLDS THE LOCK</text>
 <rect x="24" y="54" width="112" height="40" rx="8" fill="var(--g-bg-sunk)" stroke="var(--g-line-soft)" />
 <text x="80" y="79" font-size="13" text-anchor="middle" fill="var(--g-text-2)">main thread</text>
 <path d="M142 74h18" stroke="var(--g-text-3)" stroke-width="1.5" marker-end="url(#ah)" />
 <rect x="168" y="54" width="110" height="40" rx="8" fill="var(--g-bg-sunk)" stroke="var(--g-accent-dim)" />
 <text x="223" y="79" font-size="13" text-anchor="middle" fill="var(--g-text)">worker</text>
 <rect x="8" y="132" width="286" height="58" rx="12" fill="var(--g-bg-soft)" stroke="var(--g-line-soft)" />
 <text x="24" y="156" font-size="11" letter-spacing=".08em" fill="var(--g-text-3)">TAB 2</text>
 <rect x="168" y="141" width="110" height="40" rx="8" fill="var(--g-bg-sunk)" stroke="var(--g-line-soft)" />
 <text x="223" y="166" font-size="13" text-anchor="middle" fill="var(--g-text-3)">idle worker</text>
 <rect x="8" y="208" width="286" height="58" rx="12" fill="var(--g-bg-soft)" stroke="var(--g-line-soft)" />
 <text x="24" y="232" font-size="11" letter-spacing=".08em" fill="var(--g-text-3)">TAB 3</text>
 <rect x="168" y="217" width="110" height="40" rx="8" fill="var(--g-bg-sunk)" stroke="var(--g-line-soft)" />
 <text x="223" y="242" font-size="13" text-anchor="middle" fill="var(--g-text-3)">idle worker</text>
 <path d="M294 161h20a12 12 0 0 0 12-12v-37" fill="none" stroke="var(--g-text-3)" stroke-width="1.4" stroke-dasharray="4 4" />
 <path d="M294 237h20a12 12 0 0 0 12-12v-113" fill="none" stroke="var(--g-text-3)" stroke-width="1.4" stroke-dasharray="4 4" />
 <path d="M326 112v-12a12 12 0 0 0-12-12h-28" fill="none" stroke="var(--g-text-3)" stroke-width="1.4" stroke-dasharray="4 4" marker-end="url(#ah)" />
 <text x="330" y="180" font-size="12" fill="var(--g-text-3)">queries routed over</text>
 <text x="330" y="197" font-size="12" fill="var(--g-text-3)">a BroadcastChannel</text>
 <path d="M282 68h84" stroke="var(--g-text-3)" stroke-width="1.5" marker-end="url(#ah)" />
 <ellipse cx="456" cy="40" rx="66" ry="13" fill="var(--g-bg-panel)" stroke="var(--g-accent)" />
 <path d="M390 40v64c0 7.2 29.6 13 66 13s66-5.8 66-13V40" fill="var(--g-bg-panel)" stroke="var(--g-accent)" />
 <path d="M390 72c0 7.2 29.6 13 66 13s66-5.8 66-13" fill="none" stroke="var(--g-accent)" opacity=".45" />
 <text x="456" y="139" font-size="13" text-anchor="middle" fill="var(--g-text)">one OPFS file</text>
 <text x="456" y="157" font-size="12" text-anchor="middle" fill="var(--g-text-3)">one connection</text>
 <text x="566" y="40" font-size="12" fill="var(--g-text-2)">Web Locks decides who</text>
 <text x="566" y="58" font-size="12" fill="var(--g-text-2)">holds it. If that tab dies,</text>
 <text x="566" y="76" font-size="12" fill="var(--g-text-2)">the browser releases the</text>
 <text x="566" y="94" font-size="12" fill="var(--g-text-2)">lock and another takes</text>
 <text x="566" y="112" font-size="12" fill="var(--g-text-2)">over.</text>
</svg>
<figcaption>Every tab runs a worker; only the lock holder opens the file.</figcaption>
</figure>

<style scoped>
.arch { margin: 28px 0; }
.arch__svg {
  width: 100%; height: auto; display: block;
  border: 1px solid var(--g-line-soft);
  border-radius: var(--g-radius-lg);
  background: var(--g-bg-soft);
  padding: var(--g-space-4);
}
.arch figcaption {
  margin-top: var(--g-space-2);
  font-size: var(--g-text-sm);
  color: var(--g-text-3);
}
</style>

### How this compares to Notion's

Same shape, arrived at from the same constraint — `opfs-sahpool` allows one connection, so
something has to decide who holds it. Two deliberate differences:

| | Notion (2024) | granth |
|---|---|---|
| SQLite build | official `sqlite.org` WASM | same |
| VFS | `opfs-sahpool`, to avoid COOP/COEP | same, same reason |
| Worker per tab | yes | yes |
| Who elects the writer | a **SharedWorker** | **Web Locks** directly — no SharedWorker |
| Hops per query from a follower | two (main → SharedWorker → worker) | one (main → the holding worker) |
| Failover | Web Locks | Web Locks |
| If the browser can't do it | cache is optional, app carries on | falls back OPFS → IndexedDB → memory |
| Writer dies mid-transaction | noted as an open caveat | two typed errors, see below |

That last row is the one worth reading. Roy Hashimoto — whose design Notion credits — flagged
that if the active worker dies mid-transaction the caller **cannot know whether it committed**.
granth answers it explicitly: `NoLeaderError` means nothing ran and retrying is safe, while
`LeaderLostError` means the outcome is genuinely unknown and is never retried for you. Making
that distinction *true* rather than merely documented needed a deadline on every call, because a
frozen tab keeps its lock and the browser queues its messages — so "nobody acknowledged it"
does not by itself mean "nothing ran". See [Errors](./errors).

What granth deliberately does **not** do, both of which Notion needed: it does not race the
local read against your network fetch (their fix for a p95 regression on slow Android devices —
a local read is not automatically faster than the network), and it is not a sync engine. Those
stay your application's job.

## Worker options

```js
startGranthWorker({
  sqlite3InitModule,
  filename: '/myapp.sqlite3',
  storage: [opfsStorage(), indexeddbStorage(), memoryStorage()],
  checkpointMs: 250,                 // IndexedDB checkpoint debounce
  pragmas: { cache_size: -8000 },    // optional
  upgrades: { 2: (engine) => { /* data migration */ } },
});
```

`PRAGMA synchronous = NORMAL` was measured and made **no meaningful difference**, so it is not
recommended — single-row write cost is the durable commit itself, not fsync tuning. Batch your
writes instead.
