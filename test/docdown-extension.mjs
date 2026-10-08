// Loads Docdown into Playwright's Chromium for end-to-end tests. Tests have no real toolbar click to
// grant activeTab, so they run a temporary copy whose manifest adds <all_urls> host access; the
// shipped manifest is unchanged.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './docdown-harness.mjs';

export async function launchDocdown() {
  const extDir = mkdtempSync(join(tmpdir(), 'docdown-ext-'));
  cpSync(join(ROOT, 'docdown'), extDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest));
  const userDataDir = mkdtempSync(join(tmpdir(), 'docdown-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    worker,
    extensionId,
    async close() {
      await context.close();
      rmSync(extDir, { recursive: true, force: true });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/** Opens popup.html in a tab, pointed at `targetPage` (the tab to clip) through ?tabId=. */
export async function openPopup(ext, targetPage, size = { width: 580, height: 560 }) {
  // tabs.query({ url }) cannot match chrome:// pages, so look the tab up by URL and fall back to the
  // newest non-extension tab.
  const tabId = await ext.worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((t) => t.url === url || t.pendingUrl === url);
    if (match) return match.id;
    return Math.max(...tabs.filter((t) => !(t.url || '').startsWith('chrome-extension://')).map((t) => t.id));
  }, targetPage.url());
  const popup = await ext.context.newPage();
  await popup.setViewportSize(size);
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup.html?tabId=${tabId}`);
  return popup;
}
