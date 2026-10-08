// Shared helpers for Docdown tests: serve a captured fixture under its real URL (network blocked),
// inject the vendor libraries + clip.js, run the engine.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE_DIR = join(ROOT, 'test', 'fixtures', 'docdown', 'real');
export const ENGINE_FILES = ['vendor/Readability.js', 'vendor/turndown.js', 'vendor/turndown-plugin-gfm.js', 'src/clip.js'].map(
  (f) => join(ROOT, 'docdown', f)
);

export function fixtures() {
  return readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const meta = JSON.parse(readFileSync(join(FIXTURE_DIR, d.name, 'meta.json'), 'utf8'));
      return { ...meta, html: readFileSync(join(FIXTURE_DIR, d.name, 'page.html'), 'utf8') };
    });
}

/** Opens the fixture at its original URL; every other request is aborted (offline, deterministic). */
export async function openFixture(context, fixture) {
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.request().url() === fixture.url
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture.html })
      : route.abort()
  );
  await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
  return page;
}

/** Injects the engine into the page's main world (the extension injects the same files into its isolated world). */
export async function injectEngine(page) {
  for (const path of ENGINE_FILES) await page.addScriptTag({ path });
}

export function clip(page, options) {
  return page.evaluate((o) => globalThis.DocdownClip.run(o), options);
}

/** Markdown with fenced code blocks removed (so code samples don't trip prose checks). */
export function withoutFences(markdown) {
  return markdown.replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}

/** [{ lang, code }] for every fenced block. */
export function fences(markdown) {
  const out = [];
  const re = /^(`{3,})([^\n`]*)\n([\s\S]*?)\n\1\s*$/gm;
  let m;
  while ((m = re.exec(markdown))) out.push({ lang: m[2].trim(), code: m[3] });
  return out;
}
