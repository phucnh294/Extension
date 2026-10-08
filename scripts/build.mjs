// Prepares extension/ (Readown) for "Load unpacked": copies the vendor libraries, builds the themed
// GitHub stylesheet, draws the icons and validates the manifest.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeIco, generateIcons } from './icons.mjs';
import { NM, ROOT, copyVendor, fail, validateExtension, writeIcons } from './lib.mjs';

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

// 2. github-markdown.css switches light/dark only by prefers-color-scheme. Re-scope the two
//    colour blocks so the viewer's theme setting (data-theme on .mdv) can force either one.
export function themedGithubCss() {
  const css = readFileSync(join(NM, 'github-markdown-css/github-markdown.css'), 'utf8');
  const blocks = {};
  const stripped = css.replace(
    /@media \(prefers-color-scheme: (dark|light)\) \{\s*\.markdown-body, \[data-theme="\1"\] \{([\s\S]*?)\n  \}\n\}\n?/g,
    (_, scheme, body) => {
      blocks[scheme] = body.replace(/^ {2}/gm, '');
      return '';
    }
  );
  if (!blocks.dark || !blocks.light) fail('github-markdown.css layout changed: colour blocks not found');
  if (/prefers-color-scheme|\[data-theme/.test(stripped)) fail('github-markdown.css: unexpected leftover theme rules');
  return [
    '/* github-markdown-css, re-scoped by scripts/build.mjs for the viewer theme switch */',
    `.markdown-body {${blocks.light}\n}`,
    `.mdv[data-theme="dark"] .markdown-body {${blocks.dark}\n}`,
    `@media (prefers-color-scheme: dark) {\n.mdv[data-theme="auto"] .markdown-body {${blocks.dark}\n}\n}`,
    stripped,
  ].join('\n');
}
writeFileSync(join(VENDOR, 'github-markdown.css'), themedGithubCss());

// 3. icons
writeIcons(EXT);
// File Explorer integration (windows/install.ps1) uses this icon for .md files and the menu entry.
writeFileSync(join(ROOT, 'windows', 'readown.ico'), encodeIco(generateIcons([16, 24, 32, 48, 64, 256])));

// 4. validate the manifest
const manifest = validateExtension(EXT);
console.log(`build: extension/ ready (v${manifest.version}) — load it via chrome://extensions → Load unpacked`);
