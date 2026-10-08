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
| 1 | Real-input corpus: capture real pages as fixtures | done |
| 2 | Conversion engine `src/clip.js` | done |
| 3 | Popup (preview, copy, download), options page, context menu, shortcut | done |
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

## Docdown step 1 — real-input corpus (fixtures from real pages)
**What was done**
- `scripts/capture-docdown-fixtures.mjs`: opens each URL in Playwright Chromium, waits for network idle,
  scrolls the whole page (lazy content), removes every `<script>` (also inside shadow roots) and saves
  `test/fixtures/docdown/real/<id>/page.html` + `meta.json` (`url`, `license`, `title`, `capturedAt`,
  `bytes`, `shadowRoots`). `SOURCES.txt` lists source URL and licence per fixture.
  Re-run: `node scripts/capture-docdown-fixtures.mjs [id ...]`.
- Corpus (7 pages, 1.7 MB), each chosen for a conversion problem:

| Fixture | Why it is in the corpus |
|---|---|
| `mdn-array-map` | code examples live in **shadow DOM** (`<mdn-code-example>`), `brush: js` language class, notecards, a table |
| `react-thinking-in-react` | React/Next SSR page, Sandpack code blocks, heavy SPA markup |
| `docusaurus-admonitions` | Prism code blocks (`language-md` on `pre` and wrapper, one `<span class="token-line">` + `<br>` per line, Copy button), Docusaurus admonitions `theme-admonition-note` |
| `mkdocs-material-admonitions` | `div.language-yaml.highlight > pre > code`, admonitions `div.admonition.note` + `p.admonition-title`, tabbed blocks |
| `github-readme-marked` | GitHub README: `div.highlight.highlight-source-shell > pre`, heading anchor links with SVG, a table, GitHub UI chrome around the article |
| `python-json` | Sphinx: `div.highlight-python3 > div.highlight > pre`, `¶` header links, tables, `div.admonition` |
| `vi-wikipedia-markdown` | Vietnamese text (diacritics), Wikipedia tables, references |

**Findings that shape the engine (step 2)**
- **MDN code is inside open shadow roots.** The server HTML has 18 `<pre class="brush: js">`, but MDN's
  scripts move them into `<mdn-code-example>` shadow roots; `outerHTML` then shows empty elements. The
  capture now serializes open shadow roots with `Element.getHTML({ shadowRoots })` as
  `<template shadowrootmode="open">`, which the browser turns back into shadow roots on load (MDN: 87
  shadow roots, 17 `pre` restored). **The clipper must read the composed tree (light + shadow DOM).**
- Language hints differ per site: `language-*` (Prism/Docusaurus/MkDocs), `highlight-source-*`
  (GitHub), `highlight-<lang>` on an ancestor (Sphinx), `brush: <lang>` (MDN).
- Admonition markup differs per site: `theme-admonition-<type>` (Docusaurus), `admonition <type>` +
  `admonition-title` (MkDocs, Sphinx), `notecard <type>` (MDN), `markdown-alert-<type>` (GitHub).
- **Stack Overflow is not in the corpus**: automated browsers get a Cloudflare challenge page
  ("Just a moment..."). Bot protection is not bypassed; Stack Overflow is verified manually later.

**Verified**
- Every fixture has the expected content: MDN 17 `pre` after reload of the serialized shadow DOM,
  GitHub 8 `pre` + 1 table, Python 15 `pre` + 2 tables, Docusaurus 13 `pre`, MkDocs 17 `pre`.

## Docdown step 2 — conversion engine (docdown/src/clip.js)
**Entry point:** `DocdownClip.run({ mode, images, debug })`, injected into the clipped tab after
`vendor/Readability.js`, `vendor/turndown.js`, `vendor/turndown-plugin-gfm.js`. Guarded by
`globalThis.DocdownClip`, so a second injection (second click) is a no-op.
Returns `{ ok: true, markdown, title, url, lang, excerpt, siteName, byline, mode, fallback, stats }`
or `{ ok: false, error: 'no-selection' | 'empty' | 'exception', message }`.
`debug: true` adds `{ cloneHtml, articleHtml }` — the input and output of Readability — for tracing.

**Pipeline**
1. **Composed clone** (`cloneComposed`) — walks the live page as rendered and copies it into a fresh
   `document.implementation.createHTMLDocument()`:
   - follows **shadow roots** (`el.shadowRoot`, or `chrome.dom.openOrClosedShadowRoot` in a content
     script for closed ones) and replaces `<slot>` with its assigned nodes;
   - drops `script, style, svg, button, iframe, video, form controls…`, elements with `display:none`,
     `[hidden]`, `[aria-hidden=true]`, screen-reader-only text, Wikipedia `.mw-editsection`;
   - keeps only `id, class, role, title, alt, lang, dir, colspan, rowspan, start, datetime, cite`;
     `class`/`id` are kept because Readability scores on them;
   - **links** → absolute `href` (`javascript:` removed); **links left without text are dropped**;
   - **images** → absolute `src` from `currentSrc`/`src`/`data-src` (skips GIF/SVG data URIs and
     inline blobs > 2 KB); removed entirely with `images: false`;
   - **code blocks** (`pre`) → `<pre data-docdown-lang="…"><code>plain text</code></pre>`. Text is
     read from the live element: `<br>` and block children become line breaks; line numbers, copy
     buttons, MDN's example header, `user-select:none` parts (gutters, shell prompts) are skipped.
     Language: `data-language`/`data-lang`, then classes on `code`, `pre` and up to 4 ancestors:
     `language-x`/`lang-x`, `highlight-source-x`/`highlight-text-x` (GitHub), `brush: x` (MDN),
     `highlight-x` (Sphinx), `sourceCode x`, `sp-javascript` (Sandpack). Aliases: `python3→python`,
     `html-basic→html`, `sh→shell`…; ignored: `default, text, plain, none, notranslate…`;
   - **admonitions** → `<blockquote>` starting with a marker paragraph `DOCDOWNALERT<TYPE>`; the
     default title (`Note`, `Warning`…) is removed, a custom title is kept as a bold first line.
     Detected: `theme-admonition-<t>` (Docusaurus), `admonition <t>` (MkDocs/Sphinx),
     `notecard <t>` (MDN), `markdown-alert-<t>` (GitHub), `callout`. Types map to GitHub's
     `NOTE / TIP / IMPORTANT / WARNING / CAUTION`.
2. **Mode**
   - `article`: Readability (`charThreshold: 200`) on the clone. If it finds no article (or < 80 chars)
     → falls back to `page` and returns `fallback: true`. Adds `# <title>` when the text has none.
   - `page`: the whole composed body.
   - `selection`: first range of `getSelection()`; clones only nodes the range intersects and slices
     the boundary text nodes; a selection inside a `pre` stays a code block. No selection →
     `error: 'no-selection'`.
3. **Turndown** (`atx` headings, `-` bullets, fenced code, `_em_`, `**strong**`, inlined links) +
   GFM `strikethrough` and `taskListItems`, plus Docdown rules:
   `docdownCode` (fence longer than any backtick run inside the code, language from the attribute),
   `docdownTable` (own converter — every table, first row = header, `colspan` padded, cell newlines →
   space, `|` escaped), `docdownPermalink` (drops `#`, `¶`, `§`, zero-width permalink links).
4. **Tidy**: trailing spaces removed, `DOCDOWNALERT<TYPE>` → `[!TYPE]` at any quote depth (nested
   admonitions), max one blank line, single trailing newline.

**Bugs found on the real corpus and how they were traced** (agent-troubleshooting method: check each
stage's input and output, walking backwards)
| Symptom | Stage with correct input → wrong output | Fix |
|---|---|---|
| GitHub README lost all `##` headings in article mode | Clone had 15 `h2`, Readability output 0. Experiments on the clone: removing **empty links** restored them. GitHub's permalink `<a>` only holds an SVG; once the SVG is dropped the link is empty and Readability deletes the heading block as link-only boilerplate | drop text-less links while cloning |
| Python/MkDocs admonitions lost in article mode (6→0, 21→6) | Clone had the `data-docdown-alert` attribute, Readability output had none: Readability rewrites a `div` holding one paragraph into a `p`, losing attributes | admonitions become `<blockquote>` + marker text (survives Readability) |
| Wikipedia headings lost in article mode | Heading blocks contained `[sửa | sửa mã nguồn]` edit links → link-dense → removed | skip `.mw-editsection` |
| `> [!NOTE]` followed by an empty `>` line | Turndown writes `"> "` with a trailing space; the marker regex ran before trailing spaces were trimmed | trim first, then replace |
| Nested admonitions kept `DOCDOWNALERT` | Marker line was `> > DOCDOWN…` | regex accepts any quote depth |
| React code blocks without language | Sandpack puts `sp-javascript` on `pre` | Sandpack pattern |

**Tests:** `test/docdown.engine.test.mjs` + `test/docdown-harness.mjs`. Each fixture is served under its
original URL with all other requests aborted (offline, deterministic), the engine files are injected,
and article + page mode are checked against invariants:
no relative links outside code, no `script/style`, no leftover marker, no "Copy" or `1\n2\n3` line
numbers inside code blocks, minimum code blocks / languages / tables / alerts / headings per fixture
(recorded after reading the output by hand), article shorter than page, no Readability fallback.
Selection tests: no selection → `no-selection`; selecting the Python JSON table → exactly that table;
selecting part of a Python code block → a ```` ```python ```` block with exactly the selected text.
Also: `images: false`, double injection, synthetic tiny page → article falls back to page.
Outputs are written to `test/output/docdown/<fixture>.<mode>.md` (git-ignored) for reading by hand.

**Verified:** `npm run test:docdown` → 9 pass, 0 fail.
Measured on the corpus (article mode): MDN 17 ```` ```js ```` blocks from shadow DOM, Python 15 blocks +
2 tables + 6 alerts, MkDocs 17 blocks + 21 alerts, Docusaurus 13 blocks + 14 alerts (nested ones
included), GitHub README 8 blocks + 10 headings, React 6 ```` ```javascript ```` blocks, Wikipedia 2
tables + Vietnamese text intact. Clipping takes 50–320 ms per page.

## Docdown step 3 — popup, options page, context menu, shortcut
**User flow**
1. The user triggers Docdown on a tab in one of three ways — each one grants **activeTab** for that tab:
   - toolbar button → popup opens;
   - **Alt+Shift+M** → manifest command `_execute_action` → popup opens;
   - right-click → "Clip selection to Markdown" (only when text is selected) or "Clip page to
     Markdown" → `src/background.js` stores `pendingMode` (`selection` / `article`) in
     `chrome.storage.session` and calls `chrome.action.openPopup()` (Chrome ≥ 127). If opening fails
     (window not focused), it puts a green "1" badge on the button; the stored mode is used next time.
2. `src/popup.js` starts: loads settings (`DocdownFM.loadSettings`), takes `pendingMode` if present
   (then deletes it), finds the target tab (active tab; `?tabId=N` for tests), and clips:
   `chrome.scripting.executeScript({ files: [Readability, turndown, gfm, clip.js] })` then
   `executeScript({ func: (o) => DocdownClip.run(o), args: [{ mode, images }] })`.
3. Result handling: errors → message in the status box (`restricted` for chrome://, Web Store, PDF
   viewer — detected from the `executeScript` error text; `no-selection`; `empty`; `exception`). Article
   fallback → info note and the "Whole page" mode highlighted.
4. Output = `DocdownFM.build(settings, result)` (front matter) + `result.markdown`.
   - **Preview** tab: `MDV.renderMarkdown()` from Readown's renderer (`vendor/readown-render.js`:
     marked + DOMPurify string mode) inside `.mdv[data-theme=auto] .markdown-body` (GitHub CSS).
   - **Markdown** tab: editable textarea; edits are what Copy/Download use; changing the front-matter
     select only rebuilds the text while it is unedited.
   - Footer: `≈ N tokens` (characters / 4, labelled approximate) and character count.
5. Actions: **Copy** (`navigator.clipboard.writeText` — allowed because it follows a click in the
   popup), **Copy as prompt** (`Source: <title> — <url>` + the Markdown in a ```` ```markdown ````
   fence longer than any backtick run inside), **Download .md** (Blob + `<a download>`, no `downloads`
   permission; file name = title transliterated to ASCII, `đ→d`, lowercase, `-` separated, ≤ 80 chars).
6. Changing mode or the Images checkbox re-clips; Images and Front matter choices are saved.

**Front matter** (`src/frontmatter.js`, `globalThis.DocdownFM`, shared by popup and options)
- `none` / `basic` (`title`, `source`, `date`) / `custom` (user template; default adds `domain`,
  `clipped`, `lang`, `tags: []`).
- Placeholders `{title} {url} {domain} {date} {datetime} {lang} {excerpt} {site} {byline}`; unknown
  `{x}` is left as is. Every value goes through `yamlScalar()`: plain when harmless, otherwise a JSON
  double-quoted string (valid YAML) — titles with `:` or `|` and URLs stay valid YAML.

**Options page** (`src/options.html/js`, opens in a tab from the ⚙ button or chrome://extensions):
default mode, front matter choice, template editor with a live sample (filled with an MDN example),
reset button, images checkbox, shortcut note. Template saves are debounced 600 ms because
`storage.sync` limits writes per minute.

**Engine fixes found while looking at the real popup output (MDN)**
- Headings wrapped in a link to themselves (`## [Syntax](…#syntax)`) → the link is unwrapped when an
  `<a>` inside `h1–h6` points to the same page (same origin, path and query, with a `#hash`).
- A `js` line before every MDN code block → MDN's `.example-header` (language label + copy button,
  outside the `pre`) is skipped everywhere.
- Both are now engine-test invariants for every fixture.

**Verified**
- Popup screenshot on the real MDN fixture: preview renders, Markdown tab shows YAML-safe front matter
  (`title: "Array.prototype.map() - JavaScript | MDN"`), footer `≈ 3,520 tokens · 14,080 characters`.
- `npm run test:docdown` → 9 pass.
- End-to-end tests of the popup, menu and options follow in step 4 (`test/docdown-extension.mjs`
  launches a temporary copy of the extension with `<all_urls>` added, because automated tests have no
  real click to grant activeTab; the shipped manifest is unchanged).
