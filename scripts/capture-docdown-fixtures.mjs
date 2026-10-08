// Captures real pages as Docdown test fixtures: the rendered DOM (after the site's JavaScript ran),
// with <script> elements removed so tests never execute site code, plus meta.json (URL, date, title).
// Usage: node scripts/capture-docdown-fixtures.mjs [id ...]   (no ids = all)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './lib.mjs';

// Stack Overflow is not included: it answers automated browsers with a Cloudflare challenge page.
export const FIXTURES = [
  { id: 'mdn-array-map', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map', license: 'CC-BY-SA 2.5 (MDN contributors)' },
  { id: 'react-thinking-in-react', url: 'https://react.dev/learn/thinking-in-react', license: 'CC-BY 4.0 (react.dev)' },
  { id: 'docusaurus-admonitions', url: 'https://docusaurus.io/docs/markdown-features/admonitions', license: 'CC-BY 4.0 (Docusaurus docs)' },
  { id: 'mkdocs-material-admonitions', url: 'https://squidfunk.github.io/mkdocs-material/reference/admonitions/', license: 'MIT (mkdocs-material)' },
  { id: 'github-readme-marked', url: 'https://github.com/markedjs/marked', license: 'MIT (marked README)' },
  { id: 'python-json', url: 'https://docs.python.org/3/library/json.html', license: 'PSF Documentation License' },
  { id: 'vi-wikipedia-markdown', url: 'https://vi.wikipedia.org/wiki/Markdown', license: 'CC-BY-SA 4.0 (Wikipedia)' },
];

const OUT = join(ROOT, 'test', 'fixtures', 'docdown', 'real');
const wanted = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });

for (const fixture of FIXTURES.filter((f) => !wanted.length || wanted.includes(f.id))) {
  const page = await context.newPage();
  try {
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    // Scroll through the page so lazily rendered content and images are present in the DOM.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    const { html, title, shadowRoots } = await page.evaluate(() => {
      // Open shadow roots hold real content on some sites (MDN puts every code example inside
      // <mdn-code-example>'s shadow root). Serialize them as declarative shadow DOM so a fixture
      // reloads with the same composed tree.
      const roots = [];
      const collect = (root) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            roots.push(el.shadowRoot);
            collect(el.shadowRoot);
          }
        }
      };
      collect(document);
      for (const root of [document, ...roots]) root.querySelectorAll('script').forEach((s) => s.remove());
      const html = document.documentElement;
      const attrs = [...html.attributes].map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
      return {
        html: `<!doctype html>\n<html${attrs}>${html.getHTML({ shadowRoots: roots })}</html>`,
        title: document.title,
        shadowRoots: roots.length,
      };
    });
    const dir = join(OUT, fixture.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'page.html'), html);
    const meta = { ...fixture, title, capturedAt: new Date().toISOString(), bytes: Buffer.byteLength(html), shadowRoots };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(`captured ${fixture.id}: ${title} (${Math.round(meta.bytes / 1024)} KB, ${shadowRoots} shadow roots)`);
  } catch (err) {
    console.error(`FAILED ${fixture.id}: ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}
await browser.close();
