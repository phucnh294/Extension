// Docdown conversion engine on REAL captured pages (test/fixtures/docdown/real), no extension needed:
// each fixture is served under its original URL with the network blocked, the engine is injected and
// the Markdown is checked against stable invariants (not exact wording).
// Run: node --test test/docdown.engine.test.mjs   (npm run test:docdown runs it with the e2e suite)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, clip, fences, fixtures, injectEngine, openFixture, withoutFences } from './docdown-harness.mjs';

// Per-fixture expectations, verified by reading the converted output by hand (2026-10-07).
const EXPECT = {
  'mdn-array-map': { fences: 15, langs: ['js'], tables: 1, headings: 10 }, // code lives in shadow DOM
  'react-thinking-in-react': { fences: 5, langs: ['javascript'], headings: 5 },
  'docusaurus-admonitions': { fences: 10, langs: ['md'], alerts: 5, headings: 3 },
  'mkdocs-material-admonitions': { fences: 15, langs: ['yaml'], alerts: 10, headings: 8 },
  'github-readme-marked': { fences: 6, langs: ['shell', 'js'], headings: 8 },
  'python-json': { fences: 12, langs: ['python'], tables: 2, alerts: 4, headings: 8 },
  'vi-wikipedia-markdown': { tables: 1, headings: 3, text: ['Lịch sử', 'ngôn ngữ'] },
};
const OUT = join(ROOT, 'test', 'output', 'docdown');

let browser;
let context;
before(async () => {
  browser = await chromium.launch({ channel: 'chromium' });
  context = await browser.newContext();
  mkdirSync(OUT, { recursive: true });
});
after(async () => browser?.close());

function checkInvariants(name, markdown) {
  const prose = withoutFences(markdown);
  assert.ok(markdown.length > 1000, `${name}: suspiciously short (${markdown.length} chars)`);
  assert.doesNotMatch(prose, /\]\((?:\/|\.\.?\/)/, `${name}: relative link left in prose`);
  assert.doesNotMatch(prose, /<(script|style)\b/i, `${name}: script/style markup leaked`);
  assert.doesNotMatch(markdown, /DOCDOWNALERT/, `${name}: alert marker not converted`);
  for (const { code } of fences(markdown)) {
    assert.doesNotMatch(code, /^(Copy|Copied!?|Copy code)$/m, `${name}: copy-button text inside a code block`);
    assert.doesNotMatch(code, /^1\n2\n3\n/, `${name}: line numbers inside a code block`);
  }
}

for (const fixture of fixtures()) {
  const expect = EXPECT[fixture.id];
  test(`engine: ${fixture.id}`, { skip: !expect && 'no expectations recorded' }, async () => {
    const page = await openFixture(context, fixture);
    await injectEngine(page);
    for (const mode of ['article', 'page']) {
      const result = await clip(page, { mode });
      assert.equal(result.ok, true, `${fixture.id}/${mode}: ${JSON.stringify(result)}`);
      writeFileSync(join(OUT, `${fixture.id}.${mode}.md`), result.markdown);
      const name = `${fixture.id}/${mode}`;
      checkInvariants(name, result.markdown);
      assert.equal(result.url, fixture.url);

      const md = result.markdown;
      const blocks = fences(md);
      if (expect.fences) assert.ok(blocks.length >= expect.fences, `${name}: ${blocks.length} code blocks < ${expect.fences}`);
      for (const lang of expect.langs || []) {
        assert.ok(blocks.some((b) => b.lang === lang), `${name}: no \`\`\`${lang} block (got ${[...new Set(blocks.map((b) => b.lang))]})`);
      }
      const tables = (md.match(/^\| ---/gm) || []).length;
      if (expect.tables) assert.ok(tables >= expect.tables, `${name}: ${tables} tables < ${expect.tables}`);
      const alerts = (md.match(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/gm) || []).length;
      if (expect.alerts) assert.ok(alerts >= expect.alerts, `${name}: ${alerts} alerts < ${expect.alerts}`);
      if (mode === 'article') {
        assert.equal(result.fallback, false, `${name}: Readability found no article`);
        const headings = (md.match(/^#{1,6} \S/gm) || []).length;
        if (expect.headings) assert.ok(headings >= expect.headings, `${name}: ${headings} headings < ${expect.headings}`);
        assert.ok(md.length < (await clip(page, { mode: 'page' })).markdown.length, `${name}: article not smaller than page`);
      }
      for (const text of expect.text || []) assert.ok(md.includes(text), `${name}: missing "${text}"`);
    }
    await page.close();
  });
}

test('engine: selection of a table, of text inside a code block, and no selection', async () => {
  const page = await openFixture(context, fixtures().find((f) => f.id === 'python-json'));
  await injectEngine(page);

  assert.deepEqual(await clip(page, { mode: 'selection' }), { ok: false, error: 'no-selection' });

  // Select the whole JSON → Python conversion table.
  await page.evaluate(() => {
    const table = [...document.querySelectorAll('table')].find((t) => t.textContent.includes('JSON') && t.textContent.includes('dict'));
    const range = document.createRange();
    range.selectNode(table);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  const table = await clip(page, { mode: 'selection' });
  assert.equal(table.ok, true);
  assert.match(table.markdown, /^\| JSON \| Python \|\n\| --- \| --- \|\n\| object \| dict \|/m);
  assert.ok(table.markdown.length < 600, 'selection should contain only the table');

  // Select part of the first Python code block: result stays a fenced python block with just that text.
  const selected = await page.evaluate(() => {
    const pre = document.querySelector('div.highlight-python3 pre');
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    let last = first;
    for (let i = 0; i < 6 && walker.nextNode(); i++) last = walker.currentNode;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.data.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return range.toString();
  });
  const code = await clip(page, { mode: 'selection' });
  assert.equal(code.ok, true);
  const [block] = fences(code.markdown);
  assert.equal(block.lang, 'python');
  assert.equal(block.code, selected.replace(/\n+$/, ''));
  await page.close();
});

test('engine: images option, re-injection, and article fallback on a page without an article', async () => {
  const fixture = fixtures().find((f) => f.id === 'github-readme-marked');
  const page = await openFixture(context, fixture);
  await injectEngine(page);
  await injectEngine(page); // injecting twice (second click) must not throw
  const withImages = await clip(page, { mode: 'article' });
  const noImages = await clip(page, { mode: 'article', images: false });
  assert.match(withImages.markdown, /!\[[^\]]*\]\(https:\/\//);
  assert.doesNotMatch(noImages.markdown, /!\[/);
  await page.close();

  // Supplementary synthetic case (edge logic real pages don't hit): almost no text → page-mode fallback.
  const tiny = await context.newPage();
  await tiny.setContent('<!doctype html><title>Tiny</title><body><p>Just a line.</p></body>');
  await injectEngine(tiny);
  const result = await clip(tiny, { mode: 'article' });
  assert.equal(result.ok, true);
  assert.equal(result.fallback, true);
  assert.equal(result.mode, 'page');
  assert.match(result.markdown, /Just a line\./);
  await tiny.close();
});
