---
title: Files and binary data
---

# Files and binary data

Two questions get tangled together here, and separating them decides everything
that follows:

1. **Can a web app read and write files on the user's actual disk?** Sometimes,
   in some browsers, and OPFS is not how.
2. **Where should a PDF, an image or a model weight live in a local-first app?**
   Not inside a database row.

## OPFS is not "files on the device"

granthdb stores its database in the **Origin Private File System**, and the name
misleads people constantly. OPFS is a private, origin-scoped area the browser
manages. The user cannot see it in Finder or Explorer, no other origin can read
it, and nothing outside the browser can open it. It behaves like a filesystem
because it has directories and real file handles with `read()`/`write()` at
offsets — which is exactly why SQLite can live there — but it is storage, not
the user's documents.

Reading and writing the user's *real* files is a different API entirely:

| | Origin Private File System | File System Access API |
|---|---|---|
| What it reaches | a private area only your origin sees | files the user picks, anywhere on disk |
| Visible to the user | no | yes — it is their file |
| Survives clearing site data | no | the file does; your permission does not |
| Entry point | `navigator.storage.getDirectory()` | `showOpenFilePicker()`, `showSaveFilePicker()`, `showDirectoryPicker()` |
| Chrome / Edge | yes | **yes** |
| Safari | yes | **no** |
| Firefox | yes | **no** |
| Android | yes | **no** |

The pickers are Chromium-only, on desktop only, and they require a secure
context and a real user gesture — you cannot call one during startup. Safari has
shipped OPFS since 15.2 and has never shipped the pickers. So if the plan is
"our web app edits files on your machine", the honest scope is Chrome and Edge
on desktop, with a `<input type="file">` and a download link everywhere else.

None of that is a granthdb limitation and none of it is something a library can
fix. Feature-detect and branch:

```js
if ('showOpenFilePicker' in window) {
  const [handle] = await window.showOpenFilePicker();   // Chromium
} else {
  // everyone else: <input type="file"> in, <a download> out
}
```

## Binary inside granthdb

`ArrayBuffer`, every typed array and `DataView` round-trip exactly, keeping
their type:

```js
const bytes = new Uint8Array(await file.arrayBuffer());
await db.files.add({ name: file.name, type: file.type, size: file.size, bytes });

const row = await db.files.get(id);
row.bytes instanceof Uint8Array;   // true
```

The constructor is stored alongside the data, because a `Float64Array` and a
`Uint8Array` over identical bytes are different values and decoding to the wrong
one is a silent numeric change rather than an error.

**`Blob` and `File` throw.** Reading their bytes is asynchronous and the codec
runs inside the write path, so they cannot be encoded there. The error names the
fix — call `.arrayBuffer()` first. This is deliberate: they used to encode to
`{}`, which meant the file was gone with nothing raised.

### The cost, stated plainly

Bytes are stored base64-encoded inside the row's JSON document. That means:

- **+33% size.** 1 MB of bytes occupies 1.33 MB in the row — measured, not
  estimated.
- **The whole document is parsed on every read of that row.** Reading the `name`
  column is cheap, but `get()` re-parses the base64 too.

That is the right trade for an avatar, a signature, a thumbnail or an icon. It
is the wrong trade for a PDF, a video or a model file.

## The pattern for large files

Keep the bytes in OPFS and the metadata in granthdb. This is what the apps that
do this well converge on, and it is the same split as the database itself: one
place that is good at queries, one that is good at bytes.

```js
db.version(1).stores({ docs: '++id, name, folder, updated, size' });

async function store(file) {
  const key = crypto.randomUUID();
  // Bytes go to OPFS, whole, with no encoding step.
  const root = await navigator.storage.getDirectory();
  const blobs = await root.getDirectoryHandle('blobs', { create: true });
  const handle = await blobs.getFileHandle(key, { create: true });
  const w = await handle.createWritable();
  await file.stream().pipeTo(w);          // never held in memory entire

  // The row is small, indexed, and queryable.
  return db.docs.add({ key, name: file.name, type: file.type,
                       size: file.size, folder: 'inbox', updated: Date.now() });
}

async function open(id) {
  const row = await db.docs.get(id);
  const root = await navigator.storage.getDirectory();
  const blobs = await root.getDirectoryHandle('blobs');
  return (await blobs.getFileHandle(row.key)).getFile();   // a real File
}
```

What this buys:

- **No base64, no JSON.** The bytes are written straight to a file.
- **Streaming.** `pipeTo` never materialises the whole file in memory, so a
  500 MB import does not allocate 500 MB.
- **Real queries over the metadata** — `where('folder').equals('inbox')`,
  `orderBy('updated')`, `sum('size')` — because that is a row, not a blob.

Two things to get right:

- **Delete both.** Removing the row and leaving the file is how an OPFS
  directory quietly fills up. Delete the file first, then the row: an orphaned
  file is recoverable by sweeping the directory against the table, an orphaned
  row points at nothing.
- **The fast path is worker-only.** `createSyncAccessHandle()` — the synchronous
  one — is not exposed on the main thread. `createWritable()` works anywhere and
  is asynchronous. Note that it writes to a temporary copy and only swaps it in
  when the stream closes cleanly, so an interrupted write leaves the old file
  intact rather than a half-written one.

::: tip Not shipped in granthdb
This is a documented pattern, not an API. If you would rather granthdb owned
the sidecar — `db.docs.attach(id, file)` and `db.docs.blob(id)` — that is a
reasonable thing to want; it is a design decision that has not been made yet.
:::

## Quota and eviction

The bytes count against the same origin quota as the database.

```js
const { quota, usage } = await navigator.storage.estimate();
await navigator.storage.persist();     // ask not to be evicted
```

Safari clears script-writable storage after 7 days without interaction, and iOS
is the most aggressive about it, so a cache-first design must be able to refetch.
See [Storage](/storage).
