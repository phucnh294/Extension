/*
 * Docdown popup: clips the active tab (activeTab grant from the toolbar click, the Alt+Shift+M command
 * or a context-menu item), shows a preview / editable Markdown, and copies or downloads the result.
 */
(async function () {
  'use strict';

  const ENGINE_FILES = ['vendor/Readability.js', 'vendor/turndown.js', 'vendor/turndown-plugin-gfm.js', 'src/clip.js'];
  const $ = (id) => document.getElementById(id);
  const t = (key, sub) => chrome.i18n.getMessage(key, sub) || key;

  MDV.localize(document);
  const settings = await DocdownFM.loadSettings();
  const state = { mode: settings.defaultMode, tab: 'preview', result: null, text: '', edited: false };

  // A context-menu click stores the requested mode just before opening this popup.
  try {
    const { pendingMode } = await chrome.storage.session.get('pendingMode');
    if (pendingMode) {
      state.mode = pendingMode;
      await chrome.storage.session.remove('pendingMode');
    }
  } catch (_) {
    /* session storage unavailable */
  }

  $('front-matter').value = settings.frontMatter;
  $('images').checked = settings.images;

  async function targetTab() {
    // ?tabId=N lets the end-to-end tests point the popup page at a specific tab.
    const fromQuery = Number(new URLSearchParams(location.search).get('tabId'));
    if (fromQuery) return chrome.tabs.get(fromQuery);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function showStatus(message, kind = 'info') {
    const box = $('status');
    box.hidden = !message;
    box.textContent = message || '';
    box.className = `status ${kind}`;
  }

  function errorMessage(error, detail) {
    if (error === 'restricted') return t('errRestricted');
    if (error === 'no-selection') return t('errNoSelection');
    if (error === 'empty') return t('errEmpty');
    return t('errGeneric', [detail || error]);
  }

  async function runClip(tab, options) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ENGINE_FILES });
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (o) => globalThis.DocdownClip.run(o),
        args: [options],
      });
      return injection.result || { ok: false, error: 'exception', message: 'no result' };
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      // chrome://, the Web Store, the PDF viewer and other extensions cannot be scripted.
      if (/cannot access|cannot be scripted|extensions gallery|chrome:\/\/|edge:\/\/|missing host permission/i.test(message)) {
        return { ok: false, error: 'restricted', message };
      }
      return { ok: false, error: 'exception', message };
    }
  }

  function outputText() {
    if (!state.result) return '';
    return DocdownFM.build({ ...settings, frontMatter: $('front-matter').value }, state.result) + state.result.markdown;
  }

  function updateStats() {
    const text = state.text;
    // ≈ 4 characters per token for English prose and code (a rough, model-independent estimate).
    const tokens = Math.ceil(text.length / 4).toLocaleString();
    $('stats').textContent = text ? `${t('tokens', [tokens])} · ${t('chars', [text.length.toLocaleString()])}` : '';
    for (const id of ['copy', 'copy-prompt', 'download']) $(id).disabled = !text;
  }

  function renderPreview() {
    const article = $('preview').querySelector('article');
    if (!state.text) {
      article.replaceChildren();
      return;
    }
    const { fragment } = MDV.renderMarkdown(state.text);
    article.replaceChildren(fragment);
  }

  function showTab(tab) {
    state.tab = tab;
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    $('preview').hidden = tab !== 'preview';
    $('markdown').hidden = tab !== 'markdown';
    if (tab === 'preview') renderPreview();
  }

  function setText(text) {
    state.text = text;
    $('markdown').value = text;
    updateStats();
    if (state.tab === 'preview') renderPreview();
  }

  async function clip() {
    for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
    showStatus(t('clipping'));
    state.result = null;
    setText('');
    const tab = await targetTab();
    const result = tab ? await runClip(tab, { mode: state.mode, images: $('images').checked }) : { ok: false, error: 'restricted' };
    if (!result.ok) {
      showStatus(errorMessage(result.error, result.message), 'error');
      return;
    }
    state.result = result;
    state.edited = false;
    showStatus(result.fallback ? t('errEmpty') : '');
    if (result.fallback) {
      for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === 'page'));
    }
    setText(outputText());
  }

  function fenceFor(text) {
    const longest = Math.max(0, ...(text.match(/`+/g) || []).map((s) => s.length));
    return '`'.repeat(Math.max(3, longest + 1));
  }

  function promptText() {
    const r = state.result || {};
    const fence = fenceFor(state.text);
    return `Source: ${r.title || ''} — ${r.url || ''}\n\n${fence}markdown\n${state.text.trimEnd()}\n${fence}\n`;
  }

  async function copy(button, text) {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = t('copied');
    setTimeout(() => (button.textContent = label), 1200);
  }

  function fileName() {
    const base = (state.result?.title || 'page')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return `${base || 'page'}.md`;
  }

  function download() {
    const blob = new Blob([state.text], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  // ---------- events ----------

  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      clip();
    });
  }
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('images').addEventListener('change', () => {
    DocdownFM.saveSettings({ images: $('images').checked });
    clip();
  });
  $('front-matter').addEventListener('change', () => {
    DocdownFM.saveSettings({ frontMatter: $('front-matter').value });
    if (state.result && !state.edited) setText(outputText());
  });
  $('markdown').addEventListener('input', () => {
    state.edited = true;
    state.text = $('markdown').value;
    updateStats();
  });
  $('copy').addEventListener('click', (e) => copy(e.currentTarget, state.text));
  $('copy-prompt').addEventListener('click', (e) => copy(e.currentTarget, promptText()));
  $('download').addEventListener('click', download);
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  showTab('preview');
  await clip();
})();
