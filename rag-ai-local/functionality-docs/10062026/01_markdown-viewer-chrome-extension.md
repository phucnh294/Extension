---
title: Markdown Viewer Chrome extension — design, build and publishing
date: 2026-10-06
last_updated: 2026-10-07
type: functionality
project: ut-support
area: md-viewer-extension
status: superseded
subtype: design
files: [windows/install.ps1, extension/manifest.json, extension/src/render.js, extension/src/content.js, extension/src/viewer.js, extension/src/popup.js, scripts/build.mjs, scripts/package.mjs, scripts/icons.mjs, scripts/store-assets.mjs, test/e2e.test.mjs]
version: 1
extraction_method: runtime-observation
tags: [ui, security, testing, playwright]
keywords: [Readown, Readown.Document, Markdown Viewer, Manifest V3, DOMPurify, RETURN_DOM_FRAGMENT, isolated world, allow-on-file-urls, windows-1252, "isn't UTF-8 encoded", chrome.storage.sync, showOpenFilePicker]
related: [README.md, rag-ai-local/functionality-docs/10072026/01_readown-build-architecture-gotchas.md]
---

# Markdown Viewer Chrome extension — design, build and publishing

> **Superseded** by `rag-ai-local/functionality-docs/10072026/01_readown-build-architecture-gotchas.md`
> (extension renamed to Readown, host scope narrowed, font-size slider, current build and release steps).

## TL;DR
- **What:** a Manifest V3 Chrome extension that renders `.md` files (local `file://` and web URLs) with GitHub styling, TOC, code highlighting, themes, plus a "pick / drop a file" page with live reload.
- **Why:** Chrome shows Markdown as plain text; the extension had to run locally ("Load unpacked") and be publishable on the Chrome Web Store (no remote code, minimal permissions).
- **Where:** `extension/` (shipped), `scripts/` (build, zip, icons, store art), `test/e2e.test.mjs` (Playwright, real extension).
- **Impact:** `npm test` passes 8/8 against the real corpus; `npm run package` produces `dist/markdown-viewer-1.0.0.zip` ready to upload.

## Product name: Readown (renamed 2026-10-07)
- Store name is "Readown – Markdown file viewer" (`extName` in `_locales`), `short_name` "Readown", package `dist/readown-<version>.zip`, Explorer ProgID `Readown.Document`, verb `Readown`, icon `windows/readown.ico`.
- "Markdown Viewer" (several store items) and "Markdown Reader" (~100k users, plus "Markdown Reader Premium") are taken on the Chrome Web Store; "Readown", "Mdora", "Markora" and "MD Glance" returned no store results on 2026-10-07. Sections below still say "Markdown Viewer" for the same extension.

## Host scope narrowed in v1.0.1 (Web Store "Broad Host Permissions" warning)
- The dashboard flagged `http(s)://*/*.md` content-script matches as **Broad Host Permissions** (in-depth review). v1.0.1 matches only local `file:///*.md…` plus raw files on `raw.githubusercontent.com`, `gist.githubusercontent.com`, `gitlab.com/*/-/raw/*` and `bitbucket.org/*/raw/*` (`.md`, `.md?*`, `.markdown`).
- The e2e test serves allowed-host responses with `page.route` (to control the charset), checks that a `127.0.0.1/*.md` page is NOT rendered, and loads one real raw GitHub README (`OFFLINE=1` skips it).

## What the Markdown Viewer extension does
- A content script on URLs ending in `.md` / `.markdown` (file and http/https) replaces Chrome's plain-text view with a rendered page. It only acts when `document.contentType` is `text/plain`, `text/markdown` or `text/x-markdown` and the body is a `<pre>`, so an HTML page whose URL ends in `.md` (github.com blob view) is left alone.
- Toolbar: Contents (TOC), Raw, theme cycle Auto → Light → Dark. Settings (theme, width, font size, TOC) live in `chrome.storage.sync` and update open tabs through `storage.onChanged`.
- `src/viewer.html` (opened from the popup) renders a picked or dropped file. When the browser gives a `FileSystemFileHandle` (`showOpenFilePicker`, drag & drop `getAsFileSystemHandle`), it polls `lastModified` every second and re-renders on save.
- UI strings are in `_locales/en` and `_locales/vi`.

## How the Markdown Viewer rendering pipeline works
1. `content.js` reads the `<pre>` text, repairs the encoding if needed, loads settings.
2. `render.js` `renderMarkdown`: front matter is split off (`---`/`+++`), `marked.parse` with GFM, then `DOMPurify.sanitize` **to a string**, parsed through a `<template>`.
3. Post-processing in the DOM: GitHub-style heading slugs (`-1`, `-2` for duplicates) and anchors, highlight.js only for known `language-*` classes, Copy buttons, task-list classes, TOC from h1–h4.
4. The content script also injects a `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; ...">` as a second layer.
5. CSS is injected statically through `content_scripts.css` (bypasses page CSP such as raw.githubusercontent.com's `default-src 'none'`). Every selector is scoped to `.mdv` / `.markdown-body` because the CSS is injected on every matching URL.

## Key decisions and why
| Decision | Alternative rejected | Reason |
|---|---|---|
| Vendor libs copied from `node_modules` by `scripts/build.mjs`, no bundler | CDN links / webpack | Web Store forbids remote code; plain files keep review easy |
| Re-scope `github-markdown.css` colour blocks to `.mdv[data-theme=…]` at build time | `<link>` swapping via `web_accessible_resources` | Page CSP can block injected `<link>`; static content-script CSS cannot be blocked |
| Own highlight.js colour rules with CSS variables | Shipping two hljs theme files | One stylesheet, themes switch with the same `data-theme` attribute |
| Only permission `storage`; no `scripting`, no `tabs` | Programmatic injection | Smaller permission surface for review |
| Dependency-free PNG and ZIP writers (`node:zlib` deflate + `crc32`) | `sharp`, `archiver` | Nothing to install for packaging |

## Configuration of the Markdown Viewer extension
| Setting | Default | What it actually changes at runtime |
|---|---|---|
| `theme` | `auto` | `data-theme` on `.mdv` and `html[data-mdv-theme]`; `auto` follows `prefers-color-scheme` |
| `width` | `normal` | max content width 900 / 1200 px / full |
| `fontSize` | `16` | `--mdv-font-size` on `.markdown-body` and Raw view |
| `toc` | `true` | TOC sidebar (only when the document has ≥ 2 headings) |

## Gotchas found while building the Markdown Viewer extension
- **DOMPurify `RETURN_DOM_FRAGMENT` is not safe in a content-script isolated world.** The returned fragment had no `onerror` attribute, yet `<img src=x onerror=…>` fired its handler in the page's main world once the fragment was inserted. `DOMPurify.sanitize()` to a string, then parsing, does not fire. Found by the e2e test (`window.__xss`), isolated with CDP `Runtime.evaluate` in the isolated context. Never switch back to fragment mode.
- **"Could not load file 'src/content.js' for content script. It isn't UTF-8 encoded."** The file was valid UTF-8 but contained the noncharacter U+FFFF (the file-writing tool turned the escape text into the literal character). Chrome then silently skips the whole extension with `--load-extension`. `build.mjs` now fails on noncharacters in content scripts; keep `\u` escapes in regexes, never literal characters.
- **"Allow access to file URLs" is already ON for an extension loaded with `--load-extension`.** Clicking `#allow-on-file-urls` turns it OFF. The test checks `.checked` before clicking. For a normal user install it is OFF and must be turned on in `chrome://extensions` (the popup shows a notice via `chrome.extension.isAllowedFileSchemeAccess()`).
- **SVG markup parsed with `DOMParser('image/svg+xml')` needs `xmlns`**, otherwise the elements are not SVG and the toolbar icons render with zero size.
- Chrome decodes a BOM-less UTF-8 local file correctly in the test environment; the windows-1252 repair path is exercised through an HTTP server that declares `charset=windows-1252`.
- The 132-character limit applies to the manifest `description` (checked in `build.mjs`).
- Chrome cannot re-read a `file://` page from a content script (fetch does not support `file:`), so live reload exists only on `viewer.html`.

## File Explorer integration of the Markdown Viewer extension (added 2026-10-07)
- `windows/install.ps1` (wrappers `install.cmd` / `uninstall.cmd`) writes only under `HKCU\Software\Classes`: ProgID `MarkdownViewer.Document`, a `SystemFileAssociations\<ext>\shell\MarkdownViewer` context-menu verb and an `OpenWithProgids` value for `.md .markdown .mdown .mkd .mkdn`. The command is `"chrome.exe" "%1"`; the extension does the rendering.
- A Chrome extension cannot register as a Windows file handler, so Explorer → Chrome → content script is the only path. Installed Chrome 154 serves a local `.md` as `text/markdown` inside `<pre>`, which `content.js` accepts.
- Never `New-Item -Force` on an existing registry key: it recreates the key and drops its values (here `.md\OpenWithProgids` holds VS Code, Cursor …). The script creates keys only when missing.
- Windows will not let a script set the default app (UserChoice is hash-protected); the user picks "Markdown Viewer → Always" once.
- Branded Chrome ignores `--load-extension` (since Chrome 137), so loading the unpacked extension stays a manual step; `install.ps1` detects it by searching the Chrome profile `Preferences` files for the extension path.
- User-reported symptom "Open a Markdown file does nothing": the extension was not loaded in any Chrome profile; the button had been clicked in a plain preview of `popup.html`, where `chrome.tabs` is undefined. `popup.js` now falls back to `window.open('viewer.html')`.

## Verification of the Markdown Viewer extension
```
npm test
```
Expected output: `# pass 8`, `# fail 0` (the store-screenshot test is skipped unless `SCREENSHOTS=1`). The corpus test renders every `.claude/rules/*.md`, every `.claude/skills/*/SKILL.md` and three library READMEs.

```
npm run package
```
Expected output: `package: dist\markdown-viewer-1.0.0.zip (24 files)`; `unzip -t` reports no errors.
