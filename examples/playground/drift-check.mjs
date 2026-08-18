/**
 * The pages that exist in BOTH repos must not drift apart.
 *
 * Splitting the code from the site duplicated a handful of files by necessity:
 * the library repo needs them to run its browser tests before publishing, and
 * this repo needs them to host. Duplication that nothing watches is duplication
 * that silently diverges — the site would demo one behaviour while CI proved
 * another, and neither would complain.
 *
 * So this compares each shared file against granthlabs/granth on GitHub. No
 * token: both repos are public. It fails loudly rather than warning, because a
 * warning in CI is a thing people learn to scroll past.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = 'https://raw.githubusercontent.com/granthlabs/granth/main/examples/playground/';

/** Files that legitimately live in both places. Anything else should not. */
const SHARED = [
  'main.js',
  'db.worker.js',
  'sandbox.js',
  'sandbox.worker.js',
  'ui.css',
  'demos/todo-db.js',
  'demos/todo.worker.js',
  'demos/style.css',
  'demos/vanilla.js',
  'demos/react.jsx',
  'demos/vue.js',
  'demos/solid.jsx',
  'demos/Todo.svelte',
  'demos/svelte.js',
  'demos/no-worker.js',
  'showcase/app.js',
  'showcase/db.js',
  'showcase/showcase.worker.js',
];

const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);

let drifted = 0;
let missing = 0;
let checked = 0;

for (const rel of SHARED) {
  const local = join(HERE, rel);
  if (!existsSync(local)) { missing++; console.log(`MISSING here   ${rel}`); continue; }
  const res = await fetch(RAW + rel);
  if (!res.ok) { missing++; console.log(`MISSING upstream ${rel} (${res.status})`); continue; }
  const theirs = await res.text();
  const ours = readFileSync(local, 'utf8');
  checked++;
  if (sha(ours) !== sha(theirs)) {
    drifted++;
    console.log(`DRIFTED  ${rel}  site=${sha(ours)} code=${sha(theirs)}`);
  }
}

console.log(
  drifted || missing
    ? `\n${drifted} file(s) drifted, ${missing} missing — the site and the library disagree`
    : `\n${checked} shared files are identical in granthlabs/granth`
);
process.exit(drifted || missing ? 1 : 0);
