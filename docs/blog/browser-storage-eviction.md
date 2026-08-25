---
title: "Browser storage eviction: quota, Safari, and the rebuild path"
description: "How browser storage eviction actually works — quota, navigator.storage.persist(), Safari's 7-day rule — and why a local database must be rebuildable."
date: "2026-08-25"
tags: ["storage", "OPFS", "offline"]
---

# Browser storage eviction: quota, Safari, and the rebuild path

A support ticket that begins "all my data is gone" is usually not a bug in your
code. The browser deleted it, deliberately, and told nobody — not your app, not
the user. The next `open()` succeeds against an empty database and everything
downstream behaves as though the account is new.

This is the part of browser-side storage that gets skipped, because it does not
show up on a laptop with a full disk and a site you visit every day. It shows up
in production, on somebody's iPhone, three weeks later.

## Three ways local data disappears

**Quota pressure.** Everything your origin stores — OPFS, IndexedDB, Cache
Storage, `localStorage` — shares one budget, and that budget is a share of the
device's free disk rather than a fixed allowance. When the device runs low the
browser evicts, and it evicts by origin: not your largest table, not your oldest
rows, the whole origin at once. Least recently used goes first, which means the
users most likely to lose data are exactly the ones who use your app least.

**Time.** Safari's tracking prevention clears script-writable storage after seven
days of browser use without interaction with your site. Not seven days of wall
clock — seven days of Safari being used while your site is not. A user who opens
your app every second Monday can lose their local database in between, forever,
without ever doing anything unusual. Two things are exempt: sites installed to
the home screen, and origins that were granted persistence.

Because this rule belongs to WebKit rather than to the Safari badge, on iOS it
is closer to a platform rule than a browser one. Private browsing is harsher
still: [there is no OPFS in a Safari private window at all](/storage) — a hard
failure at open time, not a slow path. And iOS apps wrapping a web view through
Capacitor lose their OPFS access handles when the app is backgrounded, which is a
different failure with the same shape.

**Everything else.** Cleanup utilities delete OPFS as "Internet Cache". Windows
low-disk cleanup clears it. Chrome's incognito mode caps an OPFS database well
below the normal quota and produces surprising errors at the ceiling. And
underneath all
of that, field data across this whole ecosystem shows roughly **0.1–0.2% of
users** hitting outright corruption from browser crashes and third-party
software — no eviction policy involved, just a file that no longer opens.

<figure>
 <svg viewBox="0 0 640 300" role="img" aria-label="A diagram showing that Safari's seven-day rule, disk pressure and cleanup tools or corruption all lead to the same outcome — a missing local database — which is unrecoverable data loss when the local store was the only copy and merely a refetch when it was a cache." style="width:100%;height:auto;color:var(--g-text)">
  <title>Three causes of eviction, one outcome, two consequences</title>
  <text x="16" y="20" fill="currentColor" fill-opacity="0.7" font-size="11.5" font-family="ui-monospace, monospace">three ways it disappears</text>
  <rect x="16" y="30" width="196" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="114" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">Safari clears it</text>
  <text x="114" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">7 days, no interaction</text>
  <rect x="222" y="30" width="196" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="320" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">the disk fills up</text>
  <text x="320" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">origin evicted whole</text>
  <rect x="428" y="30" width="196" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="526" y="47" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">cleanup tool, crash</text>
  <text x="526" y="62" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">0.1–0.2% of users</text>
  <path d="M114 70 v22 h176 v10" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M290 110 l-5 -8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <path d="M320 70 v32" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M320 110 l-5 -8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <path d="M526 70 v22 h-176 v10" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M350 110 l-5 -8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="190" y="110" width="260" height="40" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.3" />
  <text x="320" y="127" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">the local database is gone</text>
  <text x="320" y="142" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">next open() sees an empty file</text>
  <path d="M320 150 v12 h-159 v10" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M161 180 l-5 -8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <path d="M320 150 v12 h159 v10" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
  <path d="M479 180 l-5 -8 h10 z" fill="currentColor" fill-opacity="0.4" />
  <rect x="16" y="180" width="290" height="56" rx="5" fill="#ef4444" fill-opacity="0.14" stroke="#ef4444" stroke-opacity="0.5" />
  <text x="161" y="205" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">it was the only copy</text>
  <text x="161" y="222" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">the user's data is gone</text>
  <rect x="334" y="180" width="290" height="56" rx="5" fill="#10b981" fill-opacity="0.16" stroke="#10b981" stroke-opacity="0.55" />
  <text x="479" y="205" fill="currentColor" font-size="11.5" font-weight="600" text-anchor="middle">it was a cache</text>
  <text x="479" y="222" fill="currentColor" fill-opacity="0.6" font-size="10.5" text-anchor="middle" font-family="ui-monospace, monospace">refetch, reindex, carry on</text>
  <text x="16" y="262" fill="currentColor" fill-opacity="0.75" font-size="11.5" font-weight="600">Eviction is not a failure you get to prevent.</text>
  <text x="16" y="282" fill="currentColor" fill-opacity="0.55" font-size="11">It is the ordinary end of a browser store's life. Only the branch below it is yours.</text>
 </svg>
 <figcaption>The causes are unrelated to each other, which is why hardening against any one of them changes nothing — the branch at the bottom is the only design decision here.</figcaption>
</figure>

## What `estimate()` actually tells you

```js
const { quota, usage } = await navigator.storage.estimate();
```

Useful, with three caveats worth knowing before you build a storage meter on it.

`quota` is derived from free disk space, so it moves. It is not an allowance the
browser has set aside for you; it is a ceiling computed from conditions that
change while your app is open. `usage` covers everything the origin stores, so it
is not a measure of your database — `await db.size()` is the number that answers
"are we the problem". And both are deliberately imprecise, padded and rounded so
that one origin cannot fingerprint a device by measuring another's footprint.
Treat them as orders of magnitude.

The important part is what `estimate()` does *not* tell you. Being comfortably
under quota does not mean your data will be there tomorrow. Quota governs whether
a write succeeds now; none of the three causes above is a quota violation.

## `persist()` is a request, not a setting

```js
const persisted = await navigator.storage.persist();
```

Ask, always — it is one line and it is what exempts you from Safari's seven-day
rule. Then read the boolean and design for `false`.

Chrome decides silently from engagement signals and may simply say no, with no
prompt and no recourse. A `false` is a normal answer, not an error to retry.
Even a `true` is narrower than it sounds: persisted storage still goes when the
user clears site data, when a cleanup tool sweeps the disk, or when the file
corrupts. Persistence removes one deletion path out of several.

So `persist()` is worth calling and not worth branching on. If your app behaves
differently depending on its result, you have built two code paths and you only
ever test one.

## The consequence: rebuildable, or a single copy in the worst place

Here is the whole design rule, and everything else on this page is supporting
detail.

**If losing the local store loses user data, you have put the only copy of that
data in the least durable storage available to you.** Not the second-least. The
disk in a browser profile is the one thing on the device that other software is
actively designed to delete.

Three shapes, and only one of them is comfortable:

- **A cache of server truth.** Eviction costs a refetch and a spinner. This is
  the shape [granthdb is built for](/use-cases), and it is fine.
- **Local-first with a working sync engine.** Also fine — the server copy exists,
  sync just has to actually run. Note that "we will add sync later" means you are
  in the third shape until later arrives. That distinction is the subject of
  [offline-first versus local-first](/blog/offline-first-vs-local-first).
- **User-authored data that never leaves the device.** This is the dangerous one,
  and it is usually arrived at by accident — a draft, an unsent edit, a form the
  user filled in offline. If you are here deliberately, periodic `db.export()`
  snapshots are the only backup the platform gives you.

Then exercise the rebuild path. Delete the database in a test and boot cold, on
every release. A recovery path whose first real execution happens on the day a
user is evicted is not a recovery path; it is untested code with a very bad
audience.

## Ship a reset control

Eviction is at least clean — you get an empty database. Corruption is worse: the
file exists, the open fails or the reads come back wrong, and no amount of
reloading fixes it. At 0.1–0.2% of users, a hundred thousand people means one to
two hundred whose app is broken in a way that support cannot talk them out of.

So put `deleteDatabase()` behind a visible **"reset local data"** control. Not a
debug flag, not a support macro someone pastes into the console — a control the
user can find while the app is behaving badly.

The wording is doing real work, because you are asking someone to delete
something. Say what goes and what comes back: *this removes the copy stored on
this device and downloads it again; anything not yet synced will be lost*. If
nothing can be lost, say that too — it turns a frightening button into an obvious
one.

## The short checklist

1. Call `navigator.storage.persist()` on first run. Log the result, do not branch
   on it.
2. Treat the local database as a cache. Every table needs an answer to "where
   does this come back from".
3. Test the cold-start rebuild in CI by deleting the database first.
4. Ship a reset control, worded honestly.
5. If the data is genuinely user-authored, take `export()` snapshots and store
   them somewhere that is not this disk.

None of that is specific to SQLite in the browser. It applies to `localStorage`,
to IndexedDB, to Cache Storage and to [OPFS](/blog/what-is-opfs) equally — the
eviction rules are per-origin, not per-API. What changes with a larger local
store is only the size of the loss.

## Where granthdb sits in this

granthdb makes the rebuild path something you can call rather than something you
have to write: `export()` and `import()` for snapshots, `delete()` for the reset
control, `size()` for what you actually occupy, and an OPFS → IndexedDB → memory
fallback so a Safari private window gets a working database instead of an
exception. It does not pretend to be durable, and the docs say so on the page
where you would look for a durability guarantee.

```
npm install granthdb @sqlite.org/sqlite-wasm
```

- **[Storage](/storage)** — OPFS, the fallback chain, quotas and eviction
- **[Security & performance](/security-and-performance)** — the explicit list of
  what browser-local storage does not give you
- **[Granth API](/granth)** — `export()`, `import()`, `delete()`, `size()`
- **[Use cases](/use-cases)** — including the ones where this is the wrong tool
