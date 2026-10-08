// Renders the Chrome Web Store promo tiles (440×280 small, 1400×560 marquee) into store/.
// Also runs the e2e "store screenshots" test, which writes store/screenshots/*.png (1280×800).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const icon = readFileSync(join(ROOT, 'extension', 'icons', 'icon128.png')).toString('base64');

const tile = (width, height, scale) => `<!doctype html><html><body style="margin:0">
<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;gap:${28 * scale}px;
  background:linear-gradient(135deg,#0d1117 0%,#1b2a41 100%);color:#f0f6fc;
  font-family:'Segoe UI',system-ui,sans-serif;box-sizing:border-box;padding:${24 * scale}px">
  <img src="data:image/png;base64,${icon}" style="width:${104 * scale}px;height:${104 * scale}px">
  <div>
    <div style="font-size:${34 * scale}px;font-weight:700;letter-spacing:-0.01em">Readown</div>
    <div style="font-size:${16 * scale}px;color:#9198a1;margin-top:${8 * scale}px;line-height:1.4">
      Markdown file viewer<br>GitHub style · TOC · Dark mode</div>
  </div>
</div></body></html>`;

const shots = spawnSync(process.execPath, ['--test', '--test-name-pattern=store screenshots', join(ROOT, 'test', 'e2e.test.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, SCREENSHOTS: '1' },
});
if (shots.status !== 0) process.exit(shots.status ?? 1);

mkdirSync(join(ROOT, 'store'), { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
for (const [name, w, h, s] of [
  ['promo-small-440x280.png', 440, 280, 1],
  ['promo-marquee-1400x560.png', 1400, 560, 2.6],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(tile(w, h, s));
  await page.screenshot({ path: join(ROOT, 'store', name) });
  await page.close();
}
await browser.close();
console.log('store-assets: promo tiles written to store/');
