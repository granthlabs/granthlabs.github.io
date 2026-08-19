---
title: MCP server
---

# MCP server

`granth-mcp` gives a coding assistant two things it cannot get by reading:
a database to run your query against, and the API surface read off the live
objects rather than off a page that may have aged.

```bash
npx granth-mcp
```

## Why this exists, given llms.txt already does

The whole documentation set is published as
[`llms-full.txt`](https://granthlabs.github.io/llms-full.txt) — every page
inlined, one request. Any assistant with a fetch tool already has all of it. A
server that only served documentation would add an install step and hand back
what a URL hands back for free.

What a fetch cannot do is **run the code**, and that is where the actual failure
is. granthdb is Dexie-compatible, so an assistant writes granthdb by
pattern-matching Dexie — and granthdb deliberately does not implement eight Dexie
members, with one more that shares a name and not a contract. Reading does not
prevent that. The code failing does.

## Configure it

Claude Code:

```bash
claude mcp add granth -- npx -y granth-mcp
```

Anything else that speaks MCP over stdio:

```json
{
  "mcpServers": {
    "granth": { "command": "npx", "args": ["-y", "granth-mcp"] }
  }
}
```

Node 22.5+, because the scratch database is `node:sqlite`. Nothing else is
required — no browser, no OPFS, no build.

## The two tools

### `granth_run`

Executes a snippet against a real, throwaway granthdb backed by in-memory
SQLite, and returns what it produced.

```
stores: { "friends": "++id, name, age, *tags" }
code:   await db.friends.bulkAdd([{ name: 'Ada', age: 36, tags: ['math'] }]);
        return db.friends.where('age').above(18).orderBy('name').toArray();
```

The database is empty at the start of every call and discarded at the end, so a
snippet never sees the one before it. That is deliberate: an assistant probing
the API should get the same answer regardless of what it tried previously.

**Errors come back verbatim.** For this tool the error is the product as often as
the value is — an assistant that reached for `Collection.clone()` learns more
from the real `TypeError` than from any wrapper around it.

### `granth_api`

The methods that exist on `Granth`, `Table`, `Collection` and `WhereClause`, read
by walking the live prototype chains, plus:

- `notImplemented` — the eight waived Dexie members and why each was waived
- `sameNameDifferentContract` — names that exist here and mean something else

Both come from
[`DEXIE_WAIVERS` and `DEXIE_DIVERGENCES`](/migrating-from-dexie#the-gaps-as-data),
the same constants the parity audit asserts in CI, so the server cannot drift
from the library.

A listing tool and a probing tool answer different questions. Without the
listing, an assistant discovers the API by guessing forty times.

## What it is not

**It is not a sandbox.** The snippet runs in a worker thread of the server
process, which is a *termination* boundary and not a security one: a runaway
snippet can be killed, but `node:fs` and `process` are still reachable from
inside it. Run this locally, against code you asked it to run. Do not point it at
input from somewhere you do not control.

The worker is there because the alternative does not work. Racing a snippet
against a timer on the main thread cannot interrupt a synchronous loop — the
event loop is already blocked, so the timer never fires, and the server wedges
with every later call hanging and nothing to explain it. `terminate()` actually
stops it. The deadline is 15 seconds.

**It is not a replacement for the docs.** It answers "does this run" and "what
can I call". For "how should I model this", `llms-full.txt` is still the thing to
read, and the server points at it.

## What it caught

The divergence list exists because of a bug this server's test found on its first
run. `use` had been sitting in the waiver list for a long time, described as
having no equivalent — while `db.use(addon)` had been the plugin hook all along.

The parity audit could not see it. It compares members Dexie has against members
granth lacks, so a waiver claiming something is missing that is actually present
is never looked up and never contradicted. The audit passed every time.

The server's test checks both directions: every waived name must really be
absent, and every divergent name must really be present. That second loop is what
went red.
