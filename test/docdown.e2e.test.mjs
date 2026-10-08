// Docdown end-to-end: the real extension (popup, service worker, options page) in Playwright's
// Chromium, clipping real captured pages. See test/docdown-extension.mjs for why the test copy of the
// manifest adds <all_urls>.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fences, fixtures, openFixture } from './docdown-harness.mjs';
import { launchDocdown, openPopup } from './docdown-extension.mjs';

let ext;
const fixture = (id) => fixtures().find((f) => f.id === id);

before(async () => {
  ext = await launchDocdown();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
after(async () => ext?.close());

async function clippedPopup(id, setup) {
  const page = await openFixture(ext.context, fixture(id));
  if (setup) await setup(page);
  const popup = await openPopup(ext, page);
  await waitForClip(popup);
  return { page, popup };
}

async function waitForClip(popup) {
  await popup.waitForFunction(
    () => {
      const status = document.getElementById('status');
      const done = document.getElementById('markdown').value.length > 0;
      const failed = !status.hidden && status.classList.contains('error');
      return done || failed;
    },
    null,
    { timeout: 20_000 }
  );
}

const markdownOf = (popup) => popup.inputValue('#markdown');
// The Windows clipboard hands text back with CRLF line endings; compare content, not line endings.
const readClipboard = async (popup) => (await popup.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

test('manifest of the shipped extension asks for exactly activeTab, scripting, contextMenus, storage', async () => {
  const shipped = JSON.parse(readFileSync(join(ROOT, 'docdown', 'manifest.json'), 'utf8'));
  assert.deepEqual([...shipped.permissions].sort(), ['activeTab', 'contextMenus', 'scripting', 'storage']);
  assert.equal(shipped.host_permissions, undefined);
  assert.equal(shipped.content_scripts, undefined);
  assert.equal(shipped.commands._execute_action.suggested_key.default, 'Alt+Shift+M');
});

test('popup clips the MDN page (shadow DOM code) with basic front matter and a preview', async () => {
  const { page, popup } = await clippedPopup('mdn-array-map');
  const md = await markdownOf(popup);
  assert.match(md, /^---\ntitle: "Array\.prototype\.map\(\) - JavaScript \| MDN"\nsource: "https:\/\/developer\.mozilla\.org\/en-US\/docs\/Web\/JavaScript\/Reference\/Global_Objects\/Array\/map"\ndate: \d{4}-\d{2}-\d{2}\n---\n\n# /);
  assert.ok(fences(md).filter((f) => f.lang === 'js').length >= 15);
  assert.match(await popup.textContent('#stats'), /≈ [\d,]+ tokens · [\d,]+ characters/);
  assert.ok((await popup.locator('#preview pre code').count()) >= 15, 'preview renders the code blocks');
  assert.equal(await popup.getAttribute('[data-mode="article"]', 'aria-checked'), 'true');
  await popup.close();
  await page.close();
});

test('popup: whole page is longer, front matter none/custom, images off', async () => {
  const { page, popup } = await clippedPopup('python-json');
  const article = await markdownOf(popup);

  await popup.click('[data-mode="page"]');
  await popup.waitForFunction((n) => document.getElementById('markdown').value.length > n, article.length);
  const whole = await markdownOf(popup);
  assert.ok(whole.length > article.length);

  await popup.selectOption('#front-matter', 'none');
  assert.ok(!(await markdownOf(popup)).startsWith('---'));
  await popup.selectOption('#front-matter', 'custom');
  const custom = await markdownOf(popup);
  assert.match(custom, /^---\ntitle: .+\nsource: "https:\/\/docs\.python\.org\/3\/library\/json\.html"\ndomain: docs\.python\.org\nclipped: "\d{4}-\d{2}-\d{2}T[\d:]+Z"\nlang: en\ntags: \[\]\n---\n/);

  assert.match(whole, /!\[/, 'page mode keeps images by default');
  await popup.uncheck('#images');
  await popup.waitForFunction(() => {
    const v = document.getElementById('markdown').value;
    return v && !v.includes('![');
  });
  // Settings persist for the next popup.
  const saved = await popup.evaluate(() => chrome.storage.sync.get(['frontMatter', 'images']));
  assert.deepEqual(saved, { frontMatter: 'custom', images: false });
  await popup.evaluate(() => chrome.storage.sync.set({ frontMatter: 'basic', images: true }));
  await popup.close();
  await page.close();
});

test('popup: copy, copy as prompt, edited text, and download', async () => {
  const { page, popup } = await clippedPopup('github-readme-marked');
  const md = await markdownOf(popup);

  await popup.click('#copy');
  assert.equal(await readClipboard(popup), md);
  assert.equal(await popup.textContent('#copy'), 'Copied!');

  await popup.click('#copy-prompt');
  const prompt = await readClipboard(popup);
  assert.match(prompt, /^Source: .*markedjs\/marked.* — https:\/\/github\.com\/markedjs\/marked\n\n(`{4,})markdown\n/);
  assert.ok(prompt.includes(md.trimEnd()), 'prompt wraps the full Markdown');
  const fence = prompt.match(/\n(`{4,})markdown\n/)[1];
  assert.ok(prompt.trimEnd().endsWith(fence), 'outer fence is longer than the inner ``` fences and closed');

  // Edits in the Markdown tab are what gets copied.
  await popup.click('[data-tab="markdown"]');
  await popup.fill('#markdown', md + '\nEDITED BY TEST\n');
  await popup.click('#copy');
  assert.match(await readClipboard(popup), /EDITED BY TEST\n$/);

  const [download] = await Promise.all([popup.waitForEvent('download'), popup.click('#download')]);
  assert.equal(download.suggestedFilename(), 'markedjs-marked-a-markdown-parser-and-compiler-built-for-speed-github.md');
  const saved = readFileSync(await download.path(), 'utf8');
  assert.match(saved, /EDITED BY TEST\n$/);
  await popup.close();
  await page.close();
});

test('popup: Vietnamese title gives an ASCII file name; text keeps diacritics', async () => {
  const { page, popup } = await clippedPopup('vi-wikipedia-markdown');
  const md = await markdownOf(popup);
  assert.match(md, /Lịch sử/);
  const [download] = await Promise.all([popup.waitForEvent('download'), popup.click('#download')]);
  assert.equal(download.suggestedFilename(), 'markdown-wikipedia-tieng-viet.md');
  await popup.close();
  await page.close();
});

test('context-menu flow: pending selection mode is used once, with and without a selection', async () => {
  // background.js stores pendingMode before opening the popup; reproduce that hand-off.
  await ext.worker.evaluate(() => chrome.storage.session.set({ pendingMode: 'selection' }));
  const empty = await clippedPopup('python-json');
  assert.equal(await empty.popup.getAttribute('[data-mode="selection"]', 'aria-checked'), 'true');
  assert.match(await empty.popup.textContent('#status'), /Nothing is selected/);
  assert.equal(await ext.worker.evaluate(async () => (await chrome.storage.session.get('pendingMode')).pendingMode), undefined);
  await empty.popup.close();
  await empty.page.close();

  await ext.worker.evaluate(() => chrome.storage.session.set({ pendingMode: 'selection' }));
  const { page, popup } = await clippedPopup('python-json', (p) =>
    p.evaluate(() => {
      const table = [...document.querySelectorAll('table')].find((t) => t.textContent.includes('dict'));
      const range = document.createRange();
      range.selectNode(table);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    })
  );
  const md = await markdownOf(popup);
  assert.match(md, /\| JSON \| Python \|\n\| --- \| --- \|\n\| object \| dict \|/);
  assert.ok(md.length < 900);
  await popup.close();
  await page.close();
});

test('restricted pages show a clear message instead of failing silently', async () => {
  const page = await ext.context.newPage();
  await page.goto('chrome://version/');
  const popup = await openPopup(ext, page);
  await waitForClip(popup);
  assert.match(await popup.textContent('#status'), /Chrome does not allow extensions to read this page/);
  assert.equal(await popup.isDisabled('#copy'), true);
  await popup.close();
  await page.close();
});

test('options page: settings and template sample', async () => {
  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options.html`);
  assert.match(await options.textContent('#sample'), /^---\ntitle: "Array\.prototype\.map\(\) - JavaScript \| MDN"/);
  await options.fill('#template', '---\nsite: {site}\nunknown: {nope}\n---');
  assert.equal(await options.textContent('#sample'), '---\nsite: MDN Web Docs\nunknown: {nope}\n---');
  await options.waitForFunction(async () => (await chrome.storage.sync.get('template')).template?.includes('{site}'));
  await options.selectOption('#defaultMode', 'page');
  await options.waitForFunction(async () => (await chrome.storage.sync.get('defaultMode')).defaultMode === 'page');

  const { page, popup } = await clippedPopup('mkdocs-material-admonitions');
  assert.equal(await popup.getAttribute('[data-mode="page"]', 'aria-checked'), 'true', 'default mode applied');
  await popup.close();
  await page.close();

  await options.click('#reset');
  await options.selectOption('#defaultMode', 'article');
  await options.waitForFunction(async () => (await chrome.storage.sync.get('defaultMode')).defaultMode === 'article');
  await options.close();
});

test('preview renders GitHub alerts as alert boxes (Docusaurus admonitions)', async () => {
  const { page, popup } = await clippedPopup('docusaurus-admonitions');
  const kinds = await popup.$$eval('#preview .markdown-alert', (els) => [...new Set(els.map((e) => e.className.match(/markdown-alert-(\w+)/)[1]))]);
  assert.ok(kinds.includes('note') && kinds.includes('tip') && kinds.includes('warning'), `alert kinds: ${kinds}`);
  assert.equal(await popup.locator('#preview .markdown-alert-title').first().textContent(), 'Note');
  assert.equal(await popup.locator('#preview .markdown-alert', { hasText: '[!' }).count(), 0, 'marker text removed');
  assert.match(await markdownOf(popup), /^> \[!NOTE\]$/m, 'the Markdown itself keeps the GitHub alert syntax');
  await popup.close();
  await page.close();
});
