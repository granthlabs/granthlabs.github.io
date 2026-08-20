# Cache-first apps: the Notion pattern

The clearest public case for a browser-side SQL database is Notion's, described
on their engineering blog. It is worth understanding because it includes the
part most write-ups leave out: the rollout initially made things *worse* for
some users.

## What they reported

Notion moved page data into a WASM build of SQLite in the browser, backed by
OPFS, with a single connection owned by one elected context. They measured
roughly a **20% improvement in navigation time** across modern browsers — and
much more where the network is the bottleneck: **28% in Australia, 31% in China,
33% in India**.

The instructive detail is the shape of the win. It moved the **median**
substantially, and on slow devices the **p95 got worse** before they tuned it —
because reading from disk on a low-end machine can be slower than fetching over
a fast network. A local cache is not automatically faster. It is faster *on
average*, and you have to measure the tail.

### What they actually built

Worth reading closely, because the constraints they hit are the ones anyone hits:

- **`opfs-sahpool`, not the plain OPFS VFS.** They tried the standard one first
  and abandoned it: it needs cross-origin isolation, which means COOP/COEP
  headers, which means every third-party embed on the page has to comply. They
  called that an unrealistic ask.
- **Corruption came first, not the fix.** Multiple tabs writing concurrently
  produced duplicate rows with the same id and different content — surfacing to
  users as a comment attributed to the wrong colleague. The single-writer design
  is what that bug bought.
- **A SharedWorker holds the election.** Each tab has its own dedicated Worker,
  but only one tab may write. The SharedWorker tracks which tab is active using
  Web Locks — when a tab closes its lock drops and a new tab is designated — and
  routes every tab's queries to whichever one holds write access.
- **The WASM never blocks page load.** Loading it synchronously made the first
  page slower, and the gain from serving that first page locally did not cover
  the cost of downloading several hundred kilobytes of library to do it. It
  loads fully asynchronously; the first page comes from the network.

### Their fix for the p95 regression, which is worth stealing

On slow devices they stopped choosing between local and network and **raced
them**, taking whichever answered first:

```js
const rows = await Promise.any([
  db.pages.where('workspace').equals(id).toArray().then((r) => r.length ? r : Promise.reject()),
  fetch(`/api/pages?workspace=${id}`).then((r) => r.json()),
]);
```

A local read is usually faster, so it usually wins and costs nothing. When the
disk is slow it loses, and the user gets the network answer instead of waiting
for the cache to lose slowly. `Promise.any` rather than `Promise.race` so an
empty or failed local read does not win by returning nothing.

## How granthdb compares

The two designs converged, which is the point of the table below rather than a
claim of novelty — the platform leaves very little choice:

| | Notion | granthdb |
|---|---|---|
| VFS | `opfs-sahpool` | `opfs-sahpool` |
| COOP/COEP required | no | no |
| Writers | one tab, elected | one tab, elected |
| Election | SharedWorker + Web Locks | Web Locks + BroadcastChannel |
| Query routing | through the SharedWorker | through the leader |
| Fallback when OPFS is unavailable | — | IndexedDB, then memory |
| Racing local against network | hand-rolled | your call — the snippet above |

The one real difference is the election topology. A SharedWorker is a single
coordinator; granthdb elects a leader directly over Web Locks and announces
changes on a BroadcastChannel, which means no SharedWorker dependency — it is
still unsupported in some mobile contexts — at the cost of the leader being a
tab that can vanish. That is what [`LeaderLostError`](/errors) exists to tell you
about.

## Why the topology matters

Their design and granthdb's converge on the same constraints, because the
platform imposes them:

| Constraint | Why | In granthdb |
|---|---|---|
| One connection | OPFS sync access handles are exclusive; two writers corrupt the file | Web Locks election, one writer tab |
| Off the main thread | SQL on the UI thread janks rendering | dedicated Worker |
| No COOP/COEP | those headers break third-party embeds | `opfs-sahpool` VFS needs neither |
| A rebuild path | browsers evict storage | `deleteDatabase()` plus your server |

The multi-tab part is not a nicety. Two tabs writing one SQLite file over OPFS
is a corrupted database, which is why [the leader election](/runtimes) exists
rather than being an optional extra.

## The pattern, concretely

Render from the local database immediately; refresh from the network in the
background; let the UI update itself when the data changes.

```js
db.version(1).stores({ pages: 'id, workspace, updated', meta: 'key' });

// 1. Paint from local data. No spinner if we have anything at all.
const cached = await db.pages.where('workspace').equals(id).orderBy('updated').toArray();
render(cached);

// 2. Refresh in the background, asking only for what changed.
const since = (await db.meta.get('lastSync'))?.value ?? 0;
const fresh = await fetch(`/api/pages?since=${since}`).then((r) => r.json());

// 3. One transaction: either the whole update lands or none of it does.
await db.transaction('rw', [db.pages, db.meta], async () => {
  await db.pages.bulkPut(fresh.pages);
  await db.meta.put({ key: 'lastSync', value: fresh.serverTime });
});
```

The UI does not need step 3 wired to it by hand — `liveQuery` re-runs on change,
including changes made in another tab:

```js
db.pages.where('workspace').equals(id).orderBy('updated')
  .liveQuery()
  .subscribe(render);
```

See [liveQuery](/live-query).

## Do this before you claim it is faster

Notion's own numbers are the argument for measuring rather than assuming:

- **Measure p95 and p99, not the mean.** The mean hides the users you hurt.
- **Test on a slow device**, not your laptop. That is where disk loses to network.
- **Keep the network path warm.** A cache-first app that cannot fall back to the
  network is an app that breaks when storage is evicted — and Safari evicts
  script-writable storage after 7 days without interaction.
- **Ask to persist**: `await navigator.storage.persist()`.
- **Ship a reset.** `deleteDatabase()` behind a "reset local data" control turns
  a corrupted store into a click instead of a support ticket. Corruption happens
  in the field across this whole ecosystem at roughly 0.1–0.2% of users, from
  browser crashes and third-party cleanup tools.

## When this pattern is wrong

- **The data is not yours to cache.** Local storage is not encrypted and the
  user can read it. See [Encryption](/encryption).
- **The data changes constantly for everyone.** A live ticker has nothing to
  cache; you are adding a database to display a websocket.
- **The dataset is tiny.** A few hundred records read once is not worth a WASM
  download on first load.
- **You need server-enforced authorisation per row.** A client-side database
  cannot enforce that, and a user can edit their own file. Enforce it server
  side and treat the local copy as a replica.

Sources: Notion's engineering write-up on their WASM SQLite rollout, and the
measurements in [Security & performance](/security-and-performance).

## Where to next

- [Replacing web storage](/replacing-web-storage) — if some of that cache is still a localStorage blob
- [Encryption at rest](/encryption) — if what you are caching is not yours to leave readable
- [Use cases](/use-cases) — the map, including when this is the wrong tool
