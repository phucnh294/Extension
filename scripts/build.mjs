// Prepares extension/ (Readown) for "Load unpacked": copies the vendor libraries, builds the themed
// GitHub stylesheet, draws the icons and validates the manifest.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeIco, generateIcons } from './icons.mjs';
import { ROOT, copyVendor, themedGithubCss, validateExtension, writeIcons } from './lib.mjs';

const EXT = join(ROOT, 'extension');

// 1. vendor libraries (bundled locally: Chrome Web Store forbids remotely hosted code)
const VENDOR = copyVendor(EXT, [
  ['marked/lib/marked.umd.js', 'marked.umd.js'],
  ['dompurify/dist/purify.min.js', 'purify.min.js'],
  ['@highlightjs/cdn-assets/highlight.min.js', 'highlight.min.js'],
  ['marked/LICENSE', 'licenses/marked.LICENSE.txt'],
  ['dompurify/LICENSE', 'licenses/dompurify.LICENSE.txt'],
  ['@highlightjs/cdn-assets/LICENSE', 'licenses/highlight.js.LICENSE.txt'],
  ['github-markdown-css/license', 'licenses/github-markdown-css.LICENSE.txt'],
]);

// 2. GitHub stylesheet re-scoped for the viewer's theme switch (see lib.mjs).
writeFileSync(join(VENDOR, 'github-markdown.css'), themedGithubCss());

// 3. icons
writeIcons(EXT);
// File Explorer integration (windows/install.ps1) uses this icon for .md files and the menu entry.
writeFileSync(join(ROOT, 'windows', 'readown.ico'), encodeIco(generateIcons([16, 24, 32, 48, 64, 256])));

// 4. validate the manifest
const manifest = validateExtension(EXT);
console.log(`build: extension/ ready (v${manifest.version}) — load it via chrome://extensions → Load unpacked`);
