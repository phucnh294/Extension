// Prepares docdown/ for "Load unpacked": vendor libraries (conversion + preview), Readown's renderer
// for the preview, icons, manifest validation.
import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, copyVendor, themedGithubCss, validateExtension, writeIcons } from './lib.mjs';

const EXT = join(ROOT, 'docdown');

// 1. vendor libraries (local copies — the Chrome Web Store forbids remotely hosted code)
const VENDOR = copyVendor(EXT, [
  // page → Markdown (injected into the clipped tab)
  ['@mozilla/readability/Readability.js', 'Readability.js'],
  ['turndown/lib/turndown.browser.umd.js', 'turndown.js'],
  ['turndown-plugin-gfm/dist/turndown-plugin-gfm.js', 'turndown-plugin-gfm.js'],
  // Markdown → preview (popup)
  ['marked/lib/marked.umd.js', 'marked.umd.js'],
  ['dompurify/dist/purify.min.js', 'purify.min.js'],
  ['@mozilla/readability/LICENSE.md', 'licenses/readability.LICENSE.txt'],
  ['turndown/LICENSE', 'licenses/turndown.LICENSE.txt'],
  ['turndown-plugin-gfm/LICENSE', 'licenses/turndown-plugin-gfm.LICENSE.txt'],
  ['marked/LICENSE', 'licenses/marked.LICENSE.txt'],
  ['dompurify/LICENSE', 'licenses/dompurify.LICENSE.txt'],
  ['github-markdown-css/license', 'licenses/github-markdown-css.LICENSE.txt'],
]);
writeFileSync(join(VENDOR, 'github-markdown.css'), themedGithubCss());
// The preview reuses Readown's sanitizing renderer (MDV.renderMarkdown) so both products render alike.
cpSync(join(ROOT, 'extension', 'src', 'render.js'), join(VENDOR, 'readown-render.js'));

// 2. icons: Readown's M↓ mark on a green tile, so the two extensions are told apart in the toolbar
writeIcons(EXT, { bg: [26, 127, 55] }); // #1a7f37

// 3. validate
const manifest = validateExtension(EXT);
console.log(`build: docdown/ ready (v${manifest.version}) — load it via chrome://extensions → Load unpacked`);
