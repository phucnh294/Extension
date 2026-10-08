/*
 * Docdown service worker: right-click menu items. A menu click grants activeTab for that tab; the
 * worker stores the requested mode and opens the popup, which does the clipping and the preview.
 * The toolbar button and the Alt+Shift+M command (_execute_action) open the popup directly.
 */
const MENU = {
  'docdown-selection': { mode: 'selection', title: 'menuSelection', contexts: ['selection'] },
  'docdown-page': { mode: 'article', title: 'menuPage', contexts: ['page'] },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, item] of Object.entries(MENU)) {
      chrome.contextMenus.create({ id, title: chrome.i18n.getMessage(item.title), contexts: item.contexts });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const item = MENU[info.menuItemId];
  if (!item || !tab) return;
  await chrome.storage.session.set({ pendingMode: item.mode });
  try {
    await chrome.action.openPopup({ windowId: tab.windowId });
  } catch (_) {
    // openPopup can fail (e.g. the window lost focus): flag the toolbar button instead; the stored
    // mode is used the next time the popup opens.
    await chrome.action.setBadgeBackgroundColor({ color: '#1a7f37', tabId: tab.id });
    await chrome.action.setBadgeText({ text: '1', tabId: tab.id });
  }
});
