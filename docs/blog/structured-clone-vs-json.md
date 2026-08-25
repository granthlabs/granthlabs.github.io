---
title: "Structured clone vs JSON.stringify: what survives storage"
description: "JSON.stringify silently loses Date, NaN, undefined, typed arrays, Map, Set and RegExp. Structured clone keeps them all. Here is a table of what each preserves."
date: "2026-08-25"
tags: ["storage", "IndexedDB", "comparison"]
---

# Structured clone vs JSON.stringify: what survives a write

You write an object to a browser store. Later you read it back. The interesting
question is not whether the write succeeded — it is whether the value you get
back is the value you put in.

For a row of strings and numbers, always. For a row holding a `Date`, a
`Uint8Array`, a `Map` or a `NaN`, it depends entirely on how the store
serialises, and when it goes wrong nothing is raised. You get back something
that looks approximately right and behaves differently.

## Two serialisation contracts

The browser has two, and they are not close to each other.

**JSON** is a text format with six types: string, number, boolean, null, array,
object. Anything else has to be squeezed into one of those or dropped.
`JSON.stringify` does the squeezing on your behalf, quietly.

**The structured clone algorithm** is the platform's own contract for moving a
value between realms. It is what `postMessage` uses, what `structuredClone()`
uses, and — the part that matters here — what IndexedDB uses to store a value.
It knows about roughly twenty types beyond JSON's six, and it preserves cyclic
references.

If you have been storing values in IndexedDB, directly or through Dexie, you
have had structured clone fidelity for free and probably never noticed.

## What each one keeps

| Value | `JSON.stringify` | Structured clone | granthdb |
|---|---|---|---|
| string, number, boolean, null | kept | kept | kept |
| `undefined` in an object | **key removed** | kept | kept |
| `Date` | an ISO string | `Date` | `Date` |
| `NaN`, `Infinity` | **`null`** | kept | kept |
| `BigInt` | throws `TypeError` | kept | kept |
| `Uint8Array`, `Float64Array`, … | `{"0":37,"1":80}` | kept, with its type | kept, with its constructor |
| `ArrayBuffer`, `DataView` | `{}` | kept | kept |
| `Map`, `Set` | `{}` | kept | kept, recursively |
| `RegExp` | `{}` | kept | kept |
| `Blob`, `File` | `{}` | kept | **throws** — call `.arrayBuffer()` |
| `Error` | `{}` | kept | stored as `{}`, deliberately |
| a circular reference | throws `TypeError` | kept | — |
| functions, DOM nodes, `WeakMap` | dropped, or `{}` | `DataCloneError` | not stored |
| a class instance | own properties, plain object | own properties, plain object | own properties, plain object |

Two rows deserve to be read twice. `BigInt` and a circular reference are the
**only** two things in that column that raise anything at all. Every other JSON
row is a silent downgrade.

## The failure is silent, which is the whole problem

```js
const row = {
  bytes: new Uint8Array([37, 80]),
  when: new Date(),
  tags: new Set(['draft']),
  score: NaN,
  note: undefined,
};

JSON.parse(JSON.stringify(row));
// bytes: a plain object with keys '0' and '1'
// when:  '2026-08-25T09:14:22.108Z'  — a string
// tags:  an empty object
// score: null
// note:  the key is gone
```

Five values in, five values out, no error, and four of them are now a different
type. The `Uint8Array` is the worst of them, because it survives in a way that
fools you: the bytes are all still there, in order, under numeric string keys.
`row.bytes[0]` is `37` either way. What changed is that
`row.bytes instanceof Uint8Array` is now false, `.byteLength` is undefined, and
the representation costs several times the space.

A `Float64Array` degrades the same way. Restore those bytes into the wrong
typed-array constructor and you have not lost data — you have changed the
numbers, which is worse, because a wrong number propagates and an exception does
not.

<figure>
 <svg viewBox="0 0 640 232" role="img" aria-label="A Uint8Array passed through JSON.stringify comes back as a plain object of numeric keys with no error raised, whereas a codec that stores the constructor alongside the bytes returns a real Uint8Array." style="width:100%;height:auto;color:var(--g-text)">
  <title>JSON.stringify versus a structured-clone codec</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">JSON.stringify</text>
  <rect x="16" y="30" width="128" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="80" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">Uint8Array</text>
  <text x="80" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">[37, 80]</text>
  <path d="M152 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="30" width="150" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="267" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">serialise to text</text>
  <text x="267" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">raises nothing</text>
  <path d="M350 50 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 50 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="30" width="234" height="40" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="406" y="47" fill="currentColor" font-size="11.5">back as a plain object</text>
  <text x="406" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">&#123;"0":37,"1":80&#125;</text>
  <text x="16" y="112" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">a type-preserving codec</text>
  <rect x="16" y="122" width="128" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="80" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">Uint8Array</text>
  <text x="80" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">[37, 80]</text>
  <path d="M152 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M184 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="192" y="122" width="150" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="267" y="139" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">store the type too</text>
  <text x="267" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">not just the bytes</text>
  <path d="M350 142 h32" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M382 142 l-8 -5 v10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="390" y="122" width="234" height="40" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="406" y="139" fill="currentColor" font-size="11.5">back as a Uint8Array</text>
  <text x="406" y="154" fill="currentColor" fill-opacity="0.6" font-size="10.5" font-family="ui-monospace, monospace">instanceof still true</text>
  <text x="16" y="196" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">Neither path raises an error.</text>
  <text x="16" y="216" fill="currentColor" fill-opacity="0.55" font-size="11">Only one of them gives back the value you stored.</text>
 </svg>
 <figcaption>The size increase is the harmless half of this. The type change is the half that reaches production.</figcaption>
</figure>

## This reaches you even if you never call `JSON.stringify`

Almost every browser store that is not IndexedDB serialises to JSON somewhere,
usually out of sight:

- `localStorage` and `sessionStorage` hold **strings only**, so something called
  `JSON.stringify` on your way in — see
  [Replacing web storage](/replacing-web-storage) and
  [the limits of localStorage](/blog/localstorage-limits).
- A wrapper that keeps rows as documents in a SQL `TEXT` column has to encode
  them somehow, and JSON is the obvious choice.
- Anything that logs, diffs or caches "the same object" via JSON has quietly
  changed it.

The hazard has a specific shape at migration time. Code that worked for years on
IndexedDB — where the platform handled fidelity — moves to a store that
`JSON.stringify`s into a column, and a `Date` starts arriving as a string. The
tests pass, because fixtures are usually strings and numbers. See
[Migrating from Dexie or IndexedDB](/migrating-from-dexie) for the row-by-row
version, and
[IndexedDB vs SQLite WASM](/blog/indexeddb-vs-sqlite-wasm) for why you would be
making that move at all.

## Getting a codec right is three things, not one

The tempting shortcut is one predicate:

```js
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
```

That single line destroys `ArrayBuffer`, every typed array, `DataView`, `Blob`,
`File`, `Map`, `Set`, `RegExp` and `Error`. All of them answer `'object'`. None
of them keep their data in enumerable own properties, so walking them as plain
objects finds nothing to copy.

granthdb's codec was written specifically to prevent this class of bug and still
had the hole, because it enumerated `Date`, `NaN`, `Infinity`, `BigInt` and
`undefined` and stopped there. **A type-preserving codec is only as complete as
its type list, and the gap fails in the direction of silence.** The reference
list is not a matter of taste: for anything claiming IndexedDB compatibility,
structured clone is the contract, so that is the list to enumerate against.

Closing it properly takes three separate changes, and missing any one leaves it
broken:

1. **Store the constructor, not just the payload.** A `Float64Array` and a
   `Uint8Array` over identical bytes are different values.
2. **Exclude the type from the "plain object" predicate.** Adding a branch to
   the leaf encoder is not enough — if `isPlain` still claims the value, the
   walker recurses into it and the leaf branch is never reached. A `Blob` check
   that raised a clear error did nothing at all until `isPlain` also knew about
   `Blob`.
3. **Recurse into containers.** A `Map` whose entries are not themselves encoded
   fixes the container and leaves the identical bug one level down.

Two traps live inside the encoding itself. A view onto a slice —
`new Uint8Array(buf, 8, 4)` — must store its own four bytes; encoding `.buffer`
persists the whole backing buffer, so a `subarray` of a 10 MB buffer writes
10 MB. And `btoa(String.fromCharCode(...bytes))` spreads every byte as a
function argument and blows the call stack once the array is large enough: it
passes every test written against a small fixture and throws on the first real
file.

## Where granthdb deliberately diverges

Matching structured clone is the goal, not a religion. Two types are handled
differently on purpose, and both are documented rather than discovered:

**`Blob` and `File` throw.** Their bytes only come out through
`await blob.arrayBuffer()`, and the codec runs synchronously inside the write
path, so it cannot await anything. They used to encode to `{}` — the file was
gone and nothing was raised. Throwing with a message that names the fix replaces
silent total loss with a failure at the line that caused it. Pass
`.arrayBuffer()` yourself, where `await` is available. Details in
[Files and binary data](/files-and-binary).

**`Error` is not restored.** It is structured-cloneable, but a round-tripped
Error loses its stack and comes back with a different prototype. Handing you
something that says `Error` and is not one is a half-truth; it stores as `{}`.
Store a message and a code instead.

One implementation detail worth borrowing: these checks are duck-typed
(`typeof v.arrayBuffer === 'function'`) rather than `instanceof`. A value that
has crossed a worker boundary is not always an instance of the receiving realm's
constructor, and `instanceof` quietly says no.

## What fidelity costs

Bytes are stored base64-encoded inside the row's JSON document, which means
**+33% size** — 1 MB of bytes occupies 1.33 MB — and the whole document is
parsed on every read of that row.

That is the right trade for an avatar, a signature, a thumbnail or an icon. It
is the wrong trade for a PDF, a video or a model file; those belong in OPFS with
only their metadata in a row. [Files and binary data](/files-and-binary) has the
pattern, including the part where you delete the file and the row in the right
order.

## When JSON is the right answer

If your values are strings, numbers, booleans, arrays and plain objects — which
describes most application data — `JSON.stringify` is correct, faster and
smaller, and a codec buys you nothing. The question is not "is JSON bad", it is
"does my data contain a type JSON cannot spell". Run the list above against a
real row. If nothing on it appears, stop here.

The trouble is that the answer changes without anyone noticing. Someone adds an
avatar, a signature capture, a `Set` of tags, and the store starts losing them
on a code path nobody edited.

## granthdb

granthdb is SQLite compiled to WebAssembly, in OPFS, behind the Dexie API — and
its value codec targets structured clone rather than JSON, so `Date`, `NaN`,
`Infinity`, `BigInt`, `undefined`, typed arrays, `ArrayBuffer`, `DataView`,
`Map`, `Set` and `RegExp` come back as themselves.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Files and binary data](/files-and-binary)** — what round-trips, the +33%,
  and the OPFS sidecar pattern for anything large
- **[Migrating from Dexie or IndexedDB](/migrating-from-dexie)** — the full
  fidelity table, the waivers, and the codemod
- **[Storage](/storage)** — OPFS, the IndexedDB and memory fallbacks, eviction
- **[Use cases](/use-cases)** — including the cases where this is the wrong tool
