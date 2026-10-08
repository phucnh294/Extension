// End-to-end test: loads the unpacked extension into Playwright's Chromium and opens real
// Markdown files from disk through file:// URLs, plus viewer.html with a picked file.
// Run with `npm test` (builds first). Set SCREENSHOTS=1 to also write store screenshots.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const FIXTURES = join(ROOT, 'test', 'fixtures');

// Real-world corpus: this repo's own docs and the READMEs of the installed libraries.
function corpus() {
  const files = [
    ...readdirSync(join(ROOT, '.claude', 'rules')).map((f) => join(ROOT, '.claude', 'rules', f)),
    ...readdirSync(join(ROOT, '.claude', 'skills')).map((d) => join(ROOT, '.claude', 'skills', d, 'SKILL.md')),
    join(ROOT, 'node_modules', 'marked', 'README.md'),
    join(ROOT, 'node_modules', 'dompurify', 'README.md'),
    join(ROOT, 'node_modules', 'playwright', 'README.md'),
  ];
  return files.filter((f) => existsSync(f) && f.endsWith('.md'));
}

let context;
let extensionId;
let userDataDir;

before(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'mdv-e2e-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  // Find our extension id and switch on "Allow access to file URLs" like a user would.
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  extensionId = await page.evaluate(async () => {
    const all = await chrome.management.getAll();
    return all.find((e) => e.name.startsWith('Readown')).id;
  });
  await page.goto(`chrome://extensions/?id=${extensionId}`);
  const toggle = page.locator('#allow-on-file-urls');
  if (!(await toggle.evaluate((el) => el.checked))) {
    await toggle.click();
    await page.waitForTimeout(500);
  }
  assert.equal(await toggle.evaluate((el) => el.checked), true, 'file URL access is off');
  await page.close();
});

after(async () => {
  await context?.close();
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

async function openRendered(file) {
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector('.mdv article.markdown-body', { timeout: 10_000 });
  return page;
}

test('renders every real Markdown file in the corpus', async () => {
  const files = corpus();
  assert.ok(files.length >= 10, `corpus too small: ${files.length}`);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const page = await openRendered(file);
    const info = await page.evaluate(() => ({
      plainPre: !!document.querySelector('body > pre'),
      headings: document.querySelectorAll('article.markdown-body :is(h1,h2,h3,h4,h5,h6)').length,
      ids: [...document.querySelectorAll('article.markdown-body :is(h1,h2,h3,h4,h5,h6)')].map((h) => h.id),
      tocLinks: document.querySelectorAll('.mdv-toc a').length,
      frontMatterShown: !document.querySelector('.mdv-frontmatter').hidden,
      scripts: document.querySelectorAll('article script').length,
      textLength: document.querySelector('article.markdown-body').textContent.trim().length,
    }));
    const name = file.slice(ROOT.length);
    assert.equal(info.plainPre, false, `${name}: plain text view still present`);
    assert.ok(info.textLength > 0, `${name}: empty render`);
    assert.equal(info.scripts, 0, `${name}: script element survived sanitizing`);
    assert.equal(new Set(info.ids).size, info.ids.length, `${name}: duplicate heading ids`);
    const atxHeadings = source.replace(/```[\s\S]*?```/g, '').match(/^#{1,6} \S/gm) || [];
    if (atxHeadings.length) assert.ok(info.headings >= atxHeadings.length, `${name}: headings missing`);
    if (info.headings >= 2) assert.ok(info.tocLinks >= 2, `${name}: TOC not built`);
    assert.equal(info.frontMatterShown, /^---\r?\n/.test(source), `${name}: front matter detection`);
    await page.close();
  }
});

test('features: highlighting, front matter, task list, sanitizer, slugs', async () => {
  const page = await openRendered(join(FIXTURES, 'features.md'));
  const info = await page.evaluate(() => ({
    title: document.title,
    hljs: document.querySelectorAll('pre code.hljs .hljs-keyword').length,
    unknownLangPlain: document.querySelector('pre[data-lang="unknownlang"] code').children.length,
    frontMatter: document.querySelector('.mdv-frontmatter pre').textContent,
    xss: window.__xss,
    imgOnerror: document.querySelector('article img')?.getAttribute('onerror'),
    jsLink: document.querySelector('article a[href^="javascript:"]'),
    details: !!document.querySelector('article details'),
    ids: [...document.querySelectorAll('article h2')].map((h) => h.id),
    copyButtons: document.querySelectorAll('.mdv-copy').length,
    relLink: document.querySelector('article a[href="vietnamese-utf8.md"]')?.href,
    iconWidths: [...document.querySelectorAll('.mdv-btn svg, .mdv-anchor svg')].map(
      (svg) => svg.namespaceURI === 'http://www.w3.org/2000/svg' && svg.getBBox().width > 0
    ),
  }));
  assert.ok(info.iconWidths.length >= 3 && info.iconWidths.every(Boolean), 'toolbar/anchor icons not rendered as SVG');
  assert.equal(info.title, 'Feature check · features.md');
  assert.ok(info.hljs > 0, 'JS keywords not highlighted');
  assert.equal(info.unknownLangPlain, 0, 'unknown language should stay plain');
  assert.match(info.frontMatter, /title: Feature check/);
  assert.equal(info.xss, undefined, 'injected script ran');
  assert.equal(info.imgOnerror, null);
  assert.equal(info.jsLink, null);
  assert.ok(info.details);
  assert.deepEqual(info.ids, ['code', 'sanitizer', 'duplicate', 'duplicate-1']);
  assert.equal(info.copyButtons, 2);
  assert.ok(info.relLink.startsWith('file:///'));

  // Relative links to other .md files open rendered too.
  await page.click('article a[href="vietnamese-utf8.md"]');
  await page.waitForSelector('.mdv article.markdown-body');
  assert.match(await page.textContent('article h1'), /Tiếng Việt có dấu/);
  await page.close();
});

test('UTF-8 file without BOM keeps Vietnamese characters', async () => {
  const page = await openRendered(join(FIXTURES, 'vietnamese-utf8.md'));
  const text = await page.textContent('article.markdown-body');
  assert.match(text, /Đây là file UTF-8 không có BOM/);
  assert.match(text, /ướt, đường, Nguyễn/);
  assert.equal(await page.locator('article input[type=checkbox]').count(), 2);
  await page.close();
});

test('web: raw hosts are rendered, charset repaired, HTML and other hosts left alone', async () => {
  const vietnamese = readFileSync(join(FIXTURES, 'vietnamese-utf8.md'));
  const page = await context.newPage();

  // UTF-8 bytes declared as windows-1252 on an allowed raw host (served by Playwright, not the network).
  const latin1 = 'https://raw.githubusercontent.com/example/repo/main/latin1.md';
  await page.route(latin1, (route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/plain; charset=windows-1252' }, body: vietnamese })
  );
  await page.goto(latin1);
  await page.waitForSelector('.mdv article.markdown-body');
  assert.equal(await page.evaluate(() => document.characterSet), 'windows-1252');
  assert.match(await page.textContent('article h1'), /Tiếng Việt có dấu/);

  // An HTML page on an allowed host whose URL ends in .md stays untouched.
  const html = 'https://gitlab.com/group/project/-/raw/main/README.md';
  await page.route(html, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<!doctype html><title>HTML</title><pre># not markdown to render</pre>',
    })
  );
  await page.goto(html);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.mdv').count(), 0, 'HTML page was rewritten');
  assert.equal(await page.textContent('pre'), '# not markdown to render');

  // Any other host is out of scope (no broad host permissions any more).
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(vietnamese);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/notes.md`);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.mdv').count(), 0, 'rendered on a host outside the manifest matches');
  } finally {
    server.close();
  }
  await page.close();
});

test('web: a real raw.githubusercontent.com README renders', { skip: !!process.env.OFFLINE }, async () => {
  const page = await context.newPage();
  await page.goto('https://raw.githubusercontent.com/markedjs/marked/master/README.md');
  await page.waitForSelector('.mdv article.markdown-body', { timeout: 15_000 });
  assert.ok((await page.locator('article.markdown-body h2').count()) >= 3);
  assert.ok((await page.locator('.mdv-toc a').count()) >= 3);
  await page.close();
});

test('theme button cycles and persists across pages', async () => {
  const page = await openRendered(join(FIXTURES, 'features.md'));
  const theme = () => page.getAttribute('.mdv', 'data-theme');
  assert.equal(await theme(), 'auto');
  await page.click('[data-action="theme"]');
  assert.equal(await theme(), 'light');
  await page.click('[data-action="theme"]');
  assert.equal(await theme(), 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.markdown-body')).getPropertyValue('--bgColor-default').trim());
  assert.equal(bg, '#0d1117', 'dark GitHub palette not applied');

  const other = await openRendered(join(FIXTURES, 'vietnamese-utf8.md'));
  assert.equal(await other.getAttribute('.mdv', 'data-theme'), 'dark');
  await page.click('[data-action="theme"]'); // back to auto for the other tests
  await other.waitForFunction(() => document.querySelector('.mdv').dataset.theme === 'auto');
  await other.close();
  await page.close();
});

test('font size slider: changes the text live, 12–28px, persists and resets', async () => {
  const file = join(ROOT, '.claude', 'rules', 'document-metadata.md');
  const page = await openRendered(file);
  const bodySize = () => page.evaluate(() => getComputedStyle(document.querySelector('.markdown-body p')).fontSize);
  const h1Size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.markdown-body h1')).fontSize));

  assert.equal(await page.textContent('[data-action="font-reset"]'), '16px');
  assert.equal(await bodySize(), '16px');
  const h1At16 = await h1Size();

  const slider = '[data-action="font-size"]';
  const value = () => page.textContent('[data-action="font-reset"]');

  // Keyboard on the slider (fires real input + change events): two steps up.
  await page.focus(slider);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.equal(await value(), '18px');
  assert.equal(await bodySize(), '18px');
  assert.ok((await h1Size()) > h1At16, 'headings should scale with the text');

  // Another open tab follows the saved setting.
  const other = await openRendered(join(FIXTURES, 'vietnamese-utf8.md'));
  await other.waitForFunction(() => getComputedStyle(document.querySelector('.markdown-body p')).fontSize === '18px');

  // Mouse: clicking the right end of the track jumps to the maximum, the left end to the minimum.
  const box = await page.locator(slider).boundingBox();
  await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
  assert.equal(await value(), '28px');
  assert.equal(await bodySize(), '28px');
  await page.mouse.click(box.x + 1, box.y + box.height / 2);
  assert.equal(await value(), '12px');

  await page.click('[data-action="font-reset"]');
  assert.equal(await bodySize(), '16px');
  await other.close();
  await page.close();
});

test('raw toggle shows the original source', async () => {
  const page = await openRendered(join(FIXTURES, 'features.md'));
  await page.click('[data-action="raw"]');
  assert.equal(await page.isVisible('.mdv-raw'), true);
  assert.equal(await page.isVisible('article.markdown-body'), false);
  assert.match(await page.textContent('.mdv-raw'), /^---\ntitle: Feature check/);
  await page.close();
});

test('viewer.html renders a picked file', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/viewer.html`);
  await page.waitForSelector('.mdv-empty');
  await page.setInputFiles('#file-input', join(FIXTURES, 'features.md'));
  await page.waitForSelector('article.markdown-body h1');
  assert.equal(await page.textContent('.mdv-bar-title'), 'features.md');
  assert.equal(await page.locator('.mdv-empty').count(), 0);
  await page.close();
});

test('popup loads and saves settings', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await page.selectOption('select[name="width"]', 'wide');
  assert.equal(await page.isHidden('#file-access'), true, 'file access warning shown although enabled');
  const stored = await page.evaluate(() => chrome.storage.sync.get('width'));
  assert.equal(stored.width, 'wide');
  await page.selectOption('select[name="width"]', 'normal');

  // Font size slider shows the value live and saves it.
  assert.equal(await page.textContent('#font-size-value'), '16px');
  await page.fill('input[name="fontSize"]', '22');
  await page.dispatchEvent('input[name="fontSize"]', 'change');
  assert.equal(await page.textContent('#font-size-value'), '22px');
  assert.equal((await page.evaluate(() => chrome.storage.sync.get('fontSize'))).fontSize, 22);
  await page.evaluate(() => chrome.storage.sync.set({ fontSize: 16 }));

  // "Open a Markdown file…" opens the viewer page in a new tab.
  const [viewerTab] = await Promise.all([context.waitForEvent('page'), page.click('#open')]);
  await viewerTab.waitForSelector('.mdv-empty');
  assert.equal(viewerTab.url(), `chrome-extension://${extensionId}/src/viewer.html`);
  await viewerTab.close();
  if (!page.isClosed()) await page.close();
});

test('store screenshots', { skip: !process.env.SCREENSHOTS }, async () => {
  const out = join(ROOT, 'store', 'screenshots');
  mkdirSync(out, { recursive: true });
  const shots = [
    ['1-light.png', join(ROOT, 'node_modules', 'marked', 'README.md'), 'light'],
    ['2-dark.png', join(ROOT, '.claude', 'rules', 'document-metadata.md'), 'dark'],
    ['3-vietnamese.png', join(FIXTURES, 'vietnamese-utf8.md'), 'light'],
  ];
  for (const [name, file, theme] of shots) {
    const page = await openRendered(file);
    while ((await page.getAttribute('.mdv', 'data-theme')) !== theme) await page.click('[data-action="theme"]');
    await page.mouse.move(0, 400);
    await page.screenshot({ path: join(out, name) });
    while ((await page.getAttribute('.mdv', 'data-theme')) !== 'auto') await page.click('[data-action="theme"]');
    await page.close();
  }
});
