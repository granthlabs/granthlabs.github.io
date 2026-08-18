# granthlabs.github.io

The website for **[granthdb](https://github.com/granthlabs/granth)** — docs, the query sandbox,
the framework examples and the Signals showcase app.

**Live: https://granthlabs.github.io**

## What lives here

```
docs/                     the documentation site (VitePress)
examples/playground/      the hosted pages: sandbox, demos, showcase, verification
```

The library itself is **not** here. It lives in
**[granthlabs/granth](https://github.com/granthlabs/granth)** — issues, pull requests and the
packages all belong there.

## It builds against the published library

This repo installs `granthdb` from npm rather than from a workspace. That is deliberate: the
hosted sandbox, demos and showcase run the **published** package, so what you try on the site is
what `npm install granthdb` gives you.

The trade is that unreleased changes cannot be demoed here until they ship, and a few page
sources exist in both repos — the library needs them for its browser tests. `drift-check.mjs`
compares those against granthlabs/granth on every build and fails if they disagree, because
duplication nothing watches is duplication that quietly diverges.

## Running it

```bash
npm install && npm install --prefix examples/playground
npm run dev          # the docs site
npm run play         # the sandbox, demos and showcase at :5178
```

```bash
npm run docs:build   # build everything into docs/.vitepress/dist
npm test             # drift, links, SPA exits, the built pages, first paint
```

## Licence

[MIT](./LICENSE)
