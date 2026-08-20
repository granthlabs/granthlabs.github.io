# Migrating from Dexie or IndexedDB

Two jobs: your **code** and your **data**.

## 1. Code

The API is matched against the real `dexie` package by a generated audit
(`compat-audit.mjs`) that fails the build on any regression:

| Class | Coverage | Not implemented |
|---|---|---|
| WhereClause | **18 / 18** | — |
| Table | 27 / 28 | `defineClass`, deprecated in Dexie itself |
| Collection | 26 / 28 | `clone`, `raw` — Dexie internals |
| Granth | 21 / 26 | `backendDB`, `idbdb`, `dynamicallyOpened`, `vip`, `unuse` |

Measured against dexie 4.4.5.

### The gaps, as data

Two exported constants, so a tool reads the same list CI asserts:

```js
import { DEXIE_WAIVERS, DEXIE_DIVERGENCES } from 'granthdb';
```

**`DEXIE_WAIVERS`** — the eight Dexie members granth deliberately does not
implement, each with its reason. Anything missing from granth and missing from
this list is a bug rather than a decision, and the audit fails the build on it.

**`DEXIE_DIVERGENCES`** — names that exist here but do not mean what they mean in
Dexie. A separate list because it is the more dangerous hazard: a missing method
throws immediately, while a name with a different contract accepts your call and
quietly does something else.

It holds one entry, `use`. Dexie's `use()` installs DBCore middleware; granth has
no DBCore layer, and `db.use(addon)` registers before/after hooks and returns a
handle with `dispose()`. See [Plugins](/plugins).

That entry is also why the second list exists. `use` sat among the waivers for a
long time, described as having no equivalent — while it had been implemented all
along. The audit could not catch it: it only inspects members Dexie has and
granth lacks, so a waiver for something present is never looked up and never
contradicted. The [MCP server](/mcp) checks both directions, and found this one.

### Run the codemod

```bash
npx granth-codemod ./src
```

It rewrites the imports, `new Dexie(...)` / `extends Dexie`, and the binding
imports; scaffolds a `db.worker.js` if one is missing; and **reports** everything
it cannot safely rewrite instead of guessing. Use `--dry` first.

The manual version is small:

```diff
- import Dexie from 'dexie';
- const db = new Dexie('myapp');
+ import Granth from 'granthdb';
+ const db = new Granth('myapp', {
+   worker: () => new Worker(new URL('./db.worker.js', import.meta.url), { type: 'module' }),
+ });

  db.version(1).stores({ friends: '++id, name, age, *tags' });   // unchanged
```

Your queries, schema strings, hooks and transactions stay as they are.

### Things to check

| Dexie | granth | Action |
|---|---|---|
| `db.transaction('rw', …, async fn)` | ✅ supported | none |
| `Table.hook(...)` | ✅ client-side | a hook can't veto an already-committed write |
| `Collection.modify(fn)` | ✅ atomic batch | none |
| `Collection.distinct()` | no-op | none — we never duplicate rows |
| `upgrade()` callbacks | ➡️ moved | put them in the worker's `upgrades: { 2: fn }` |
| `Dexie.use()` | ⚠️ same name, different thing | granth's `use()` is an addon hook, not DBCore middleware — see [Plugins](/plugins) |
| `Dexie.unuse()` | ❌ | not needed — `use()` returns a handle with `dispose()` |
| `db.backendDB()` / `idbdb` | ❌ | there is no IDBDatabase |
| `Dexie.Promise` / PSD zones | ❌ | **plain promises — always `await` your writes** |
| `Date`, `NaN`, `Infinity`, `BigInt` | ✅ preserved | a value codec keeps structured-clone fidelity that plain JSON would lose |
| Typed arrays, `ArrayBuffer`, `DataView` | ✅ preserved | with their constructor, so a `Float64Array` does not come back a `Uint8Array` |
| `Map`, `Set`, `RegExp` | ✅ preserved | recursively — a `Map` of `Date`s survives intact |
| `Blob`, `File` | ⚠️ throws | reading their bytes is async and the codec is not — pass `.arrayBuffer()`, see [Files and binary data](/files-and-binary) |
| `Error` | ❌ stores as `{}` | a round-tripped Error loses its stack and its prototype; store a message and a code |

**`Dexie.Promise` / PSD zones is the one real behavioural trap.** Dexie's zones let you fire
writes inside a transaction without awaiting them. Here you must `await`. (Named rather than
called "the last one" — it stopped being last the moment rows were added below it.)

## 2. Data

```js
import { suggestSchema, importFromIndexedDB } from 'granth-migrate-idb';

// Read the schema straight out of the old database
const schema = await suggestSchema('my-old-dexie-db');
db.version(1).stores(schema);
await db.open();

const counts = await importFromIndexedDB(db, {
  from: 'my-old-dexie-db',
  onProgress: ({ store, done, total }) => console.log(store, done, '/', total),
});
// -> { friends: 1240, notes: 88 }
```

- `suggestSchema()` derives the `stores({...})` object from the real object stores —
  auto-increment keys, unique, multiEntry and compound indexes.
- `inspectIndexedDB()` returns the schema plus row counts if you want to look first.
- The import **preserves primary keys** and rebuilds every index.
- It is **idempotent** (uses `bulkPut`), so a re-run overwrites rather than duplicating.
- It does **not** delete the source. Verify, then delete it yourself.

Stores with out-of-line keys throw a clear error — granth requires an inline `keyPath`.

## 3. What you gain

- **Filter on one index, order by another** in one statement — not expressible
  over a single IndexedDB cursor, so in Dexie it means fetching and sorting in JS.
- `sum()`, `avg()`, `min()`, `max()` evaluated in SQLite rather than by pulling
  every matching row across the worker boundary.
- `toMap()`, `for await` iteration, `clearAll()`, `size()`.
- Real SQL indexes and query planning instead of cursor walking.
- Queries run in a worker, off the main thread.
- No "first `toArray()` returns `[]`" ordering trap — queries auto-open.
