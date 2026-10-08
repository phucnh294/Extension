---
title: Handoff — Readown published, Docdown v1.0.0 built and ready to submit
date: 2026-10-08
last_updated: 2026-10-08
type: session-handoff
project: ut-support
area: docdown-extension
status: complete
branch: main
commit: 359ddc4
next_action: Owner loads docdown/ unpacked in Chrome and tries it on a few doc pages (incl. Stack Overflow), then publishes the privacy policy Gist and submits dist/docdown-1.0.0.zip.
supersedes:
tags: [process, ui, testing, playwright]
keywords: [Readown, Docdown, daijgajeokdjadflfcchplafdiaffoab, docdown-1.0.0.zip, readown-1.0.0.zip, npm run test:all, build:docdown, package:docdown, store-assets:docdown, capture-docdown-fixtures.mjs, phucnh294/Extension, noreply]
related: [README.md, rag-ai-local/functionality-docs/10072026/01_readown-build-architecture-gotchas.md, rag-ai-local/functionality-docs/10072026/02_docdown-implementation-log.md, store/docdown/listing.txt, store/docdown/privacy-policy.txt, store/listing.txt, store/privacy-policy.txt]
session_id: 28573ed0-317b-4111-bee5-a464157dabd3
duration: 2 days
---

# Handoff — Readown published, Docdown v1.0.0 built and ready to submit

## TL;DR
- **What:** two Chrome MV3 extensions in one repo — **Readown** (`extension/`, Markdown file viewer, live on the Chrome Web Store) and **Docdown** (`docdown/`, web page → Markdown, v1.0.0 finished, not yet submitted).
- **Why:** this session is being compacted; this file lets the next session resume without questions.
- **Where:** repo `D:\AI\CLAUDE\MD Chrome Extension`, GitHub https://github.com/phucnh294/Extension (public, branch `main`).
- **Impact:** all work committed and pushed (`359ddc4`); tests green; Docdown zip ready.

## Current status
- `npm run test:all` → Readown **10/10 pass**, Docdown **18/18 pass** (9 engine on 7 real pages + 9 extension e2e).
- Readown v1.0.0 published: https://chromewebstore.google.com/detail/daijgajeokdjadflfcchplafdiaffoab (publisher "Marzi"; was not yet in store search on 2026-10-07 — indexing delay, or check Distribution → Visibility = Public).
- Docdown: `dist/docdown-1.0.0.zip` (28 files, `activeTab, scripting, contextMenus, storage`, no host permissions) — **not submitted**.

## COMPLETED
| Item | Evidence (test / build state) |
|---|---|
| Readown: viewer, TOC, highlight, themes, font-size slider, live-reload viewer page, VI/EN, File Explorer menu (`windows/install.ps1`) | `npm test` 10 pass; published v1.0.0 |
| Readown host scope narrowed to local files + raw GitHub/Gist/GitLab/Bitbucket (store "Broad Host Permissions" warning) | e2e "web: raw hosts…" test |
| Readown privacy policy Gist updated | https://gist.github.com/phucnh294/258714b81c39c899f3ae0dd4194a2148 |
| Docdown steps 0–6 (setup, fixtures, engine, UI, e2e, store assets, docs) | commits `2bedac3` … `359ddc4`; `npm run test:docdown` 18 pass |
| Docs | `10072026/01_readown-build-architecture-gotchas.md`, `10072026/02_docdown-implementation-log.md`, README |

## NOT DONE / STILL OPEN
| Item | Where (`file:line`) | Suspected cause / note |
|---|---|---|
| Docdown not submitted to the store | `dist/docdown-1.0.0.zip`, `store/docdown/` | needs the owner: Gist for `store/docdown/privacy-policy.txt`, then dashboard New item |
| Docdown never tried by the owner in real Chrome | — | only automated Chromium + live-site screenshots |
| Stack Overflow not covered by tests | `scripts/capture-docdown-fixtures.mjs` comment | Cloudflare challenge for automated browsers; do NOT bypass — test manually |
| Readown not visible in store search | dashboard | check Visibility; new items take days to be indexed |
| Readown "friendly URL" (`open.html` + omnibox keyword `md`) proposed, not done | `extension/src/viewer.html` | user did not confirm; would need version 1.0.1 |
| Readown v1.1 ideas (Mermaid, KaTeX, export) and Docdown v1.1 (site recipes, multi-tab, Obsidian) | plan file `C:\Users\phucn\.claude\plans\give-me-the-idea-hidden-acorn.md` | backlog |

## NEXT ACTION
Owner tries Docdown locally, then submits it.

```
npm run build:docdown
```
then `chrome://extensions` → Developer mode → Load unpacked → `docdown/`; open any docs page → M↓ (green) icon or Alt+Shift+M.

## CONTEXT THE NEXT SESSION CANNOT DERIVE FROM CODE
- **Decisions and why:**
  - Git identity for this repo is local config `phucnh294 <4629416+phucnh294@users.noreply.github.com>`; the user refused the global work email `mnguyen@videobankdigital.com` — never use it.
  - Readown keeps version **1.0.0** (user asked); 1.0.1 was never uploaded. If a version was already uploaded, the store refuses equal/lower versions → bump.
  - Name "Readown" chosen because "Markdown Viewer" and "Markdown Reader" are taken; "Docdown" checked free on 2026-10-07 (recheck before submitting).
  - Docdown uses activeTab only (no host permissions) to avoid the in-depth review Readown triggered; tests add `<all_urls>` to a temporary copy of the manifest only.
  - User communicates in Vietnamese (sometimes English); answers in the user's language.
- **Traps:**
  - The file-writing tools turn `\uXXXX` escape text into literal characters, and `\\` / `$'` inside heredoc + JS `replace` corrupt code. Use the Edit tool for code with escapes; `String.fromCharCode(92)` when generating; build fails on Unicode noncharacters.
  - Branded Chrome ignores `--load-extension` (since 137): automation uses Playwright's Chromium; the owner must Load unpacked by hand.
  - `--load-extension` already enables "Allow access to file URLs" — clicking the toggle turns it OFF.
  - DOMPurify `RETURN_DOM_FRAGMENT` lets `onerror` fire in a content-script isolated world — always sanitize to a string.
  - Readability deletes headings next to empty links and rewrites single-paragraph divs (attributes lost) — see the Docdown log, step 2.
  - Windows clipboard returns CRLF; `New-Item -Force` on an existing registry key wipes its values.
- **Ground truth:**
  - Installed Chrome 154 shows a local `.md` as `text/markdown` in `<pre>` (verified with Playwright `channel: 'chrome'`).
  - MDN code examples live in open shadow roots of `<mdn-code-example>` (server HTML has 18 `<pre>`).
  - Store requirements met for Readown: contact email verified, privacy URL = Gist above.

## Verification
| Command | Actual result |
|---|---|
| `npm test` | 10 pass, 0 fail |
| `npm run test:docdown` | 18 pass, 0 fail |
| `npm run package` | `dist/readown-1.0.0.zip` (24 files) |
| `npm run package:docdown` | `dist/docdown-1.0.0.zip` (28 files), `unzip -t` clean |
| `git log -1` | `359ddc4` pushed to `origin/main` |
