---
title: Docdown — web page to Markdown extension, implementation flow and step log
date: 2026-10-07
last_updated: 2026-10-07
type: functionality
project: ut-support
area: docdown-extension
status: in-progress
subtype: plan
files: [docdown/manifest.json, scripts/lib.mjs, scripts/build-docdown.mjs, scripts/build.mjs, scripts/package.mjs, scripts/icons.mjs, package.json]
version: 1
extraction_method: runtime-observation
tags: [ui, testing, playwright, process]
keywords: [Docdown, activeTab, scripting, contextMenus, Readability, Turndown, turndown-plugin-gfm, build-docdown.mjs, lib.mjs, copyVendor, validateExtension, writeIcons, themedGithubCss]
related: [rag-ai-local/functionality-docs/10072026/01_readown-build-architecture-gotchas.md, README.md]
---

# Docdown — web page to Markdown extension, implementation flow and step log

## TL;DR
- **What:** Docdown ("Docdown – Web page to Markdown") is the second extension in this repo: it turns the current page, the main article or a selection into clean, LLM-ready Markdown (code languages kept, absolute links, front matter), with a preview before copying.
- **Why:** companion to Readown (which reads `.md`); developers paste docs into LLMs, notes and RAG corpora, and plain copy-paste breaks code blocks and links.
- **Where:** `docdown/` (shipped), `scripts/build-docdown.mjs`, shared `scripts/lib.mjs`, tests in `test/docdown.e2e.test.mjs`, real fixtures in `test/fixtures/docdown/`.
- **Impact:** this doc records every implemented step (what, how, how it was verified) so progress can be followed commit by commit on https://github.com/phucnh294/Extension.

## Docdown step plan and status
| Step | Content | Status |
|---|---|---|
| 0 | Setup: shared build helpers, `docdown/` scaffold, npm scripts | done |
| 1 | Real-input corpus: capture real pages as fixtures | todo |
| 2 | Conversion engine `src/clip.js` | todo |
| 3 | Popup (preview, copy, download), options page, context menu, shortcut | todo |
| 4 | End-to-end tests on every fixture | todo |
| 5 | Store assets, listing, privacy policy, zip | todo |
| 6 | Final architecture doc + README | todo |

## Docdown step 0 — setup (shared build helpers and scaffold)
**What was done**
- `scripts/lib.mjs` (new): helpers shared by both extensions —
  `copyVendor(extDir, pairs)` (wipes and refills `<ext>/vendor/` from `node_modules`, fails if a file is missing),
  `writeIcons(extDir, { bg })`, `validateExtension(extDir)`, `themedGithubCss()`.
  `validateExtension` checks every file the manifest references (icons, popup, options page, service
  worker, content scripts), Unicode noncharacters in **every** `.js` of the extension (Chrome rejects them
  as "isn't UTF-8 encoded"), and `extName` ≤ 75 / `extDescription` ≤ 132 for every locale.
- `scripts/build.mjs` (Readown) now calls those helpers; output is identical to before.
- `scripts/icons.mjs`: `generateIcons(sizes, { bg })` — tile colour parameter. Docdown uses green
  `#1a7f37`, Readown keeps blue `#0969da`.
- `scripts/package.mjs`: `--ext <folder>`; zip name = `<short_name lowercased>-<version>.zip`
  (`readown-1.0.0.zip`, `docdown-1.0.0.zip`).
- `scripts/build-docdown.mjs` (new): copies `Readability.js`, `turndown.js` (browser UMD),
  `turndown-plugin-gfm.js`, `marked.umd.js`, `purify.min.js` + licenses into `docdown/vendor/`, writes the
  themed GitHub CSS, copies Readown's `extension/src/render.js` to `docdown/vendor/readown-render.js`
  (preview uses the same sanitizing renderer), draws icons, validates.
- `docdown/manifest.json`: MV3, `minimum_chrome_version` 127 (needed for `chrome.action.openPopup()` from
  the context menu), permissions exactly `activeTab, scripting, contextMenus, storage`, service worker
  `src/background.js`, options page `src/options.html`, command `_execute_action` = `Alt+Shift+M`.
- `docdown/_locales/en|vi/messages.json`: all UI strings (EN/VI); `$1` placeholders use the Chrome
  `placeholders` format.
- npm scripts: `build:docdown`, `test:docdown`, `package:docdown`. `docdown/vendor/` is git-ignored.

**Why these choices**
- Separate `build-docdown.mjs` instead of one script with many flags: each extension's vendor list and
  extras (Readown's `.ico`, Docdown's renderer copy) stay readable; the shared rules live in one place.
- No host permissions at all: `activeTab` gives temporary access to the tab the user clicked on (toolbar,
  context menu or shortcut). This avoids the "Broad Host Permissions" review Readown hit.

**Verified**
- `npm run build` and `npm test` (Readown): 10 pass, 0 fail after the refactor; `npm run package` still
  produces `dist/readown-1.0.0.zip` (24 files).
- `npm run build:docdown`; Chromium loads `docdown/` with name "Docdown – Web page to Markdown",
  permissions `activeTab, contextMenus, scripting, storage`, service worker running.
