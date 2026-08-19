---
title: Use cases
---

# Use cases

Three situations where a browser-side SQL database earns its download, and the
questions worth answering before you commit to one.

granthdb is a local storage engine, not a sync engine. It keeps no server copy
and resolves no conflicts between users, so every case below assumes your server
still owns the truth and the local database is a fast copy you can rebuild.

## Start from the symptom

| What you are seeing | Read |
|---|---|
| `JSON.parse` on a growing localStorage blob, every page load | [Replacing web storage](./replacing-web-storage) |
| `QuotaExceededError`, or a 5 MB ceiling you have already hit | [Replacing web storage](./replacing-web-storage) |
| A list you filter and sort in JavaScript because one cursor cannot | [Replacing web storage](./replacing-web-storage) |
| Storage reads showing up in a performance profile | [Replacing web storage](./replacing-web-storage) |
| A spinner on every navigation, for data you already fetched once | [Cache-first apps](./cache-first-apps) |
| Two tabs of your app disagreeing about the same records | [Cache-first apps](./cache-first-apps) |
| Someone else's notes, messages or client records on their disk in plaintext | [Encryption at rest](./encryption) |
| A session token you are trying to put somewhere "safer" | [Where tokens belong](./replacing-web-storage#where-auth-tokens-belong-read-this-first) — the answer is not a database |

## Replacing localStorage, sessionStorage and IndexedDB

**The situation.** You reached for `localStorage` because it was two lines, and
kept using it long after it stopped fitting. Now you are storing a list in a
string, parsing it on boot, and sorting it by hand.

**What changes.** Rows instead of a blob, so you stop loading the whole list to
read part of it. Filter on one index and order by another in one SQL statement.
And it is off the main thread — `localStorage` is synchronous, which is
invisible at 5 KB and a dropped frame at 5 MB.

**What it does not fix.** A theme preference. A dismissed banner. A feature
flag. Shipping a WASM SQLite build to store `{"theme":"dark"}` is worse
engineering, not better — that page says so before it says anything else.

→ [Replacing web storage](./replacing-web-storage)

## Cache-first apps

**The situation.** Your app re-fetches on every navigation and shows a spinner
for records the browser had a moment ago. This is the pattern Notion described
publicly when they moved page data into WASM SQLite.

**What changes.** Paint from the local database first, refresh from the network
behind it, and let `liveQuery` update the UI when the data lands — including
when the write happened in another tab.

**What it does not fix.** The tail. Notion measured roughly a 20% improvement in
navigation time, but on slow devices their p95 got *worse* before tuning, because
reading from a cheap disk can lose to a fast network. A local cache is faster on
average, and only measurement tells you about the users you hurt.

→ [Cache-first apps](./cache-first-apps)

## Encryption at rest

**The situation.** OPFS, IndexedDB and localStorage all sit on disk in
plaintext. If you cache someone's notes, messages, health records or client
data, anyone with the device profile can read them.

**What changes.** Field-level AES-GCM under a key derived from the user's
passphrase, applied before the write crosses into the Worker. Real protection
against device theft, disk forensics and backup extraction. The addon ships with
a test that reads the raw SQLite row and asserts the plaintext is genuinely
absent, rather than taking the claim on trust.

**What it does not fix.** XSS. Script running on your origin calls your decrypt
path and gets plaintext, exactly as it would read `localStorage`. No
browser-side encryption changes that, because the key has to be usable by your
code — so it is usable by anything running as your code.

→ [Encryption at rest](./encryption)

## When granthdb is the wrong tool

Stated here rather than left for you to discover:

- **The dataset is tiny.** A few hundred records read once does not justify a
  WASM download on first load.
- **The data changes constantly for everyone.** A live ticker has nothing to
  cache; you would be adding a database to display a websocket.
- **You need per-row authorisation.** A client-side database cannot enforce it,
  and a user can edit their own file. Enforce it server side and treat the local
  copy as a replica.
- **You need users to see each other's edits.** That is a sync engine. This is
  not one, and bolting one on is the larger project.

## Before you commit

Whichever case you are in, the same four things decide whether it works in
production rather than on your laptop:

1. **Measure p95 and p99, not the mean.** The mean hides the users you hurt.
2. **Test on a slow device.** That is where disk loses to network.
3. **Keep the rebuild path warm.** Browser storage is evictable — Safari clears
   script-writable storage after 7 days without interaction — so an app that
   cannot refetch is an app that breaks. Ask for
   `navigator.storage.persist()`, and ship a "reset local data" control.
4. **Read the limits first.**
   [Security & performance](./security-and-performance) is explicit about what
   this does not give you, with the measured numbers beside it.
