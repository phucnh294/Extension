// Docdown Chrome Web Store images → store/docdown/: 1280×800 screenshots (live page + the real popup
// laid over it where Chrome shows it) and promo tiles. Needs network access (live pages).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './lib.mjs';
import { launchDocdown, openPopup } from '../test/docdown-extension.mjs';

const OUT = join(ROOT, 'store', 'docdown');
const SHOTS = join(OUT, 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const icon = readFileSync(join(ROOT, 'docdown', 'icons', 'icon128.png')).toString('base64');
const b64 = (buf) => buf.toString('base64');

const SCENES = [
  { name: '1-mdn-article.png', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map', tab: 'preview' },
  { name: '2-python-markdown.png', url: 'https://docs.python.org/3/library/json.html', tab: 'markdown', frontMatter: 'custom' },
  { name: '3-docusaurus-alerts.png', url: 'https://docusaurus.io/docs/markdown-features/admonitions', tab: 'preview', scrollTo: '#preview .markdown-alert' },
];

function compose(pagePng, popupPng) {
  return `<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;position:relative;font-family:Segoe UI,sans-serif">
  <img src="data:image/png;base64,${b64(pagePng)}" style="position:absolute;inset:0;width:1280px;height:800px;filter:brightness(.92)">
  <img src="data:image/png;base64,${b64(popupPng)}" style="position:absolute;top:14px;right:24px;width:580px;height:560px;border-radius:10px;
    box-shadow:0 12px 40px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.12)">
  </body></html>`;
}

const ext = await launchDocdown();
for (const scene of SCENES) {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(scene.url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const pagePng = await page.screenshot();
  if (scene.frontMatter) await ext.worker.evaluate((fm) => chrome.storage.sync.set({ frontMatter: fm }), scene.frontMatter);
  const popup = await openPopup(ext, page);
  await popup.waitForFunction(() => document.getElementById('markdown').value.length > 0, null, { timeout: 30_000 });
  if (scene.tab === 'markdown') await popup.click('[data-tab="markdown"]');
  if (scene.scrollTo) await popup.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), scene.scrollTo);
  const popupPng = await popup.screenshot();
  await ext.worker.evaluate(() => chrome.storage.sync.set({ frontMatter: 'basic' }));
  const canvas = await ext.context.newPage();
  await canvas.setViewportSize({ width: 1280, height: 800 });
  await canvas.setContent(compose(pagePng, popupPng));
  await canvas.screenshot({ path: join(SHOTS, scene.name) });
  for (const p of [canvas, popup, page]) await p.close();
  console.log(`screenshot ${scene.name}`);
}

// Options page.
const options = await ext.context.newPage();
await options.setViewportSize({ width: 1280, height: 800 });
await options.goto(`chrome-extension://${ext.extensionId}/src/options.html`);
await options.screenshot({ path: join(SHOTS, '4-options.png') });
await options.close();
await ext.close();
console.log('screenshot 4-options.png');

// Promo tiles.
const tile = (w, h, s) => `<!doctype html><html><body style="margin:0">
<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${28 * s}px;
  background:linear-gradient(135deg,#0d1117 0%,#0f2e1c 100%);color:#f0f6fc;font-family:'Segoe UI',system-ui,sans-serif;
  box-sizing:border-box;padding:${24 * s}px">
  <img src="data:image/png;base64,${icon}" style="width:${104 * s}px;height:${104 * s}px">
  <div>
    <div style="font-size:${34 * s}px;font-weight:700;letter-spacing:-0.01em">Docdown</div>
    <div style="font-size:${16 * s}px;color:#9198a1;margin-top:${8 * s}px;line-height:1.4">
      Web page → clean Markdown<br>Code · Docs · LLM-ready</div>
  </div>
</div></body></html>`;
const browser = await chromium.launch({ channel: 'chromium' });
for (const [name, w, h, s] of [
  ['promo-small-440x280.png', 440, 280, 1],
  ['promo-marquee-1400x560.png', 1400, 560, 2.6],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(tile(w, h, s));
  await page.screenshot({ path: join(OUT, name) });
  await page.close();
}
await browser.close();
console.log('promo tiles written');
