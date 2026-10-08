/*
 * Shared Markdown viewer used by the content script (file:// and http pages)
 * and by viewer.html (files opened from the popup). Exposes `window.MDV`.
 * Depends on vendor globals: marked, DOMPurify, hljs.
 */
(function () {
  'use strict';

  const DEFAULTS = Object.freeze({ theme: 'auto', toc: true, width: 'normal', fontSize: 16 });
  const THEMES = ['auto', 'light', 'dark'];
  const FONT_MIN = 12;
  const FONT_MAX = 28;

  function clampFontSize(value) {
    const size = Math.round(Number(value));
    if (!Number.isFinite(size)) return DEFAULTS.fontSize;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, size));
  }
  const hasChrome = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);

  // ---------- i18n & settings ----------

  function t(key, fallback) {
    try {
      return (hasChrome && chrome.i18n.getMessage(key)) || fallback || key;
    } catch (_) {
      return fallback || key;
    }
  }

  function localize(root) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n, el.textContent);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle, el.title);
    });
  }

  async function loadSettings() {
    if (!hasChrome || !chrome.storage) return { ...DEFAULTS };
    try {
      return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  async function saveSettings(patch) {
    if (!hasChrome || !chrome.storage) return;
    try {
      await chrome.storage.sync.set(patch);
    } catch (_) {
      /* storage unavailable (e.g. extension reloaded) — keep the in-page state */
    }
  }

  function onSettingsChanged(callback) {
    if (!hasChrome || !chrome.storage) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const patch = {};
      for (const key of Object.keys(changes)) {
        if (key in DEFAULTS) patch[key] = changes[key].newValue;
      }
      if (Object.keys(patch).length) callback(patch);
    });
  }

  // ---------- Markdown → sanitized DOM ----------

  const FRONT_MATTER = /^(---|\+\+\+)[ \t]*\r?\n([\s\S]*?)\r?\n(?:\1|\.\.\.)[ \t]*(?:\r?\n|$)/;

  function splitFrontMatter(text) {
    const source = text.replace(/^\uFEFF/, '');
    const match = FRONT_MATTER.exec(source);
    if (!match) return { frontMatter: null, body: source };
    return { frontMatter: match[2], body: source.slice(match[0].length) };
  }

  /** GitHub-style heading slugs: lower-case, punctuation dropped, spaces → '-', duplicates get -1, -2 … */
  function createSlugger() {
    const seen = new Set();
    return (text) => {
      const base =
        text
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
          .replace(/ /g, '-') || 'section';
      let slug = base;
      for (let i = 1; seen.has(slug); i++) slug = `${base}-${i}`;
      seen.add(slug);
      return slug;
    };
  }

  function renderMarkdown(markdown) {
    const { frontMatter, body } = splitFrontMatter(markdown);
    const html = marked.parse(body, { gfm: true, async: false });
    // Sanitize to a STRING. RETURN_DOM_FRAGMENT is unsafe in a content-script isolated world:
    // an <img onerror> handler still fired once the fragment was inserted (see test/e2e.test.mjs).
    const clean = DOMPurify.sanitize(html);
    const template = document.createElement('template');
    template.innerHTML = clean;
    return { frontMatter, fragment: template.content };
  }

  // ---------- post-processing ----------

  const ICONS = {
    toc: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm.75 3.5h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5Z"/></svg>',
    raw: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L13.94 8l-3.72-3.72a.75.75 0 0 1 1.06-1.06Zm-6.56 0a.75.75 0 0 1 0 1.06L1.06 8l3.72 3.72a.75.75 0 0 1-1.06 1.06L-.53 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"/></svg>',
    auto: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5v13a6.5 6.5 0 0 0 0-13Z"/></svg>',
    light: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm9.193 9.193a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM16 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm10.657-5.657a.75.75 0 0 1 0 1.061l-1.061 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.061 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0Z"/></svg>',
    dark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Z"/></svg>',
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/></svg>',
  };

  function svgIcon(name) {
    // Static, trusted markup — parsed with DOMParser so no page HTML is ever assigned via innerHTML.
    const markup = ICONS[name].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  }

  function addHeadingAnchors(article) {
    const slug = createSlugger();
    const headings = [];
    article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      const text = h.textContent;
      h.id = slug(text);
      const anchor = document.createElement('a');
      anchor.className = 'mdv-anchor';
      anchor.href = `#${encodeURIComponent(h.id)}`;
      anchor.setAttribute('aria-label', text);
      anchor.appendChild(svgIcon('link'));
      h.prepend(anchor);
      headings.push({ level: Number(h.tagName[1]), text: text.trim(), id: h.id, el: h });
    });
    return headings;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function enhanceCodeBlocks(article) {
    article.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      const langClass = [...code.classList].find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.slice('language-'.length).toLowerCase() : '';
      if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
        hljs.highlightElement(code);
      }
      pre.classList.add('mdv-code');
      if (lang) pre.dataset.lang = lang;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mdv-copy';
      button.textContent = t('copy', 'Copy');
      button.addEventListener('click', () => {
        copyText(code.textContent).then(() => {
          button.textContent = t('copied', 'Copied!');
          setTimeout(() => (button.textContent = t('copy', 'Copy')), 1500);
        });
      });
      pre.appendChild(button);
    });
  }

  function enhanceLinks(article) {
    article.querySelectorAll('a[href]').forEach((a) => {
      if (/^https?:/i.test(a.getAttribute('href'))) a.rel = 'noopener noreferrer';
    });
    article.querySelectorAll('li > input[type="checkbox"]').forEach((box) => {
      box.parentElement.classList.add('task-list-item');
      box.closest('ul, ol')?.classList.add('contains-task-list');
    });
  }

  function buildToc(headings) {
    const items = headings.filter((h) => h.level <= 4);
    if (items.length < 2) return null;
    const minLevel = Math.min(...items.map((h) => h.level));
    const list = document.createElement('ul');
    for (const h of items) {
      const li = document.createElement('li');
      li.style.setProperty('--depth', h.level - minLevel);
      const a = document.createElement('a');
      a.href = `#${encodeURIComponent(h.id)}`;
      a.textContent = h.text;
      a.dataset.target = h.id;
      li.appendChild(a);
      list.appendChild(li);
    }
    return list;
  }

  // ---------- viewer UI ----------

  function button(action, icon, labelKey, fallback) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mdv-btn';
    b.dataset.action = action;
    b.title = t(labelKey, fallback);
    b.appendChild(svgIcon(icon));
    const label = document.createElement('span');
    label.textContent = t(labelKey, fallback);
    b.appendChild(label);
    return b;
  }

  /**
   * Builds the viewer chrome inside `host` and returns { render(markdown), setTitle(), addAction() }.
   * `options.settings` is the initial settings object (see DEFAULTS).
   */
  function createViewer(host, options = {}) {
    let settings = { ...DEFAULTS, ...(options.settings || {}) };
    let showRaw = false;
    let headings = [];
    let source = '';

    const root = document.createElement('div');
    root.className = 'mdv';

    const bar = document.createElement('header');
    bar.className = 'mdv-bar';
    const title = document.createElement('div');
    title.className = 'mdv-bar-title';
    const actions = document.createElement('div');
    actions.className = 'mdv-bar-actions';
    const tocBtn = button('toc', 'toc', 'toc', 'Contents');
    const rawBtn = button('raw', 'raw', 'raw', 'Raw');
    const themeBtn = button('theme', 'auto', 'themeAuto', 'Auto');

    // Font size: small "A" [slider] big "A" [16px] (clicking the value resets it to the default).
    const fontGroup = document.createElement('div');
    fontGroup.className = 'mdv-font';
    fontGroup.title = t('fontSize', 'Font size');
    const glyph = (cls) => Object.assign(document.createElement('span'), { className: cls, textContent: 'A' });
    const fontRange = document.createElement('input');
    fontRange.type = 'range';
    fontRange.className = 'mdv-font-range';
    fontRange.dataset.action = 'font-size';
    fontRange.min = String(FONT_MIN);
    fontRange.max = String(FONT_MAX);
    fontRange.step = '1';
    fontRange.setAttribute('aria-label', t('fontSize', 'Font size'));
    const fontValue = document.createElement('button');
    fontValue.type = 'button';
    fontValue.className = 'mdv-font-value';
    fontValue.dataset.action = 'font-reset';
    fontValue.title = t('fontReset', 'Reset text size');
    fontGroup.append(glyph('mdv-font-a-small'), fontRange, glyph('mdv-font-a-large'), fontValue);

    actions.append(fontGroup, tocBtn, rawBtn, themeBtn);
    bar.append(title, actions);

    const layout = document.createElement('div');
    layout.className = 'mdv-layout';
    const toc = document.createElement('nav');
    toc.className = 'mdv-toc';
    toc.setAttribute('aria-label', t('contents', 'Contents'));
    const main = document.createElement('main');
    main.className = 'mdv-main';
    const front = document.createElement('details');
    front.className = 'mdv-frontmatter';
    front.hidden = true;
    const frontSummary = document.createElement('summary');
    frontSummary.textContent = t('frontMatter', 'Front matter');
    const frontPre = document.createElement('pre');
    front.append(frontSummary, frontPre);
    const article = document.createElement('article');
    article.className = 'markdown-body';
    const raw = document.createElement('pre');
    raw.className = 'mdv-raw';
    raw.hidden = true;
    main.append(front, article, raw);
    layout.append(toc, main);
    root.append(bar, layout);
    host.appendChild(root);

    function applySettings() {
      root.dataset.theme = THEMES.includes(settings.theme) ? settings.theme : 'auto';
      root.dataset.width = settings.width;
      root.dataset.toc = settings.toc && toc.childElementCount ? 'on' : 'off';
      const fontSize = clampFontSize(settings.fontSize);
      root.style.setProperty('--mdv-font-size', `${fontSize}px`);
      fontValue.textContent = `${fontSize}px`;
      fontRange.value = String(fontSize);
      fontRange.style.setProperty('--fill', `${((fontSize - FONT_MIN) / (FONT_MAX - FONT_MIN)) * 100}%`);
      document.documentElement.dataset.mdvTheme = root.dataset.theme;
      const themeKey = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' }[root.dataset.theme];
      const themeLabel = t(themeKey, root.dataset.theme);
      themeBtn.replaceChildren(svgIcon(root.dataset.theme), Object.assign(document.createElement('span'), { textContent: themeLabel }));
      themeBtn.title = `${t('theme', 'Theme')}: ${themeLabel}`;
      tocBtn.setAttribute('aria-pressed', String(root.dataset.toc === 'on'));
      tocBtn.disabled = !toc.childElementCount;
      rawBtn.setAttribute('aria-pressed', String(showRaw));
      article.hidden = showRaw;
      raw.hidden = !showRaw;
    }

    tocBtn.addEventListener('click', () => {
      settings.toc = !(root.dataset.toc === 'on');
      applySettings();
      saveSettings({ toc: settings.toc });
    });
    rawBtn.addEventListener('click', () => {
      showRaw = !showRaw;
      applySettings();
    });
    // The page follows the slider live; the value is saved when it is released
    // (chrome.storage.sync allows only a limited number of writes per minute).
    fontRange.addEventListener('input', () => {
      settings.fontSize = clampFontSize(fontRange.value);
      applySettings();
    });
    fontRange.addEventListener('change', () => saveSettings({ fontSize: clampFontSize(fontRange.value) }));
    fontValue.addEventListener('click', () => {
      settings.fontSize = DEFAULTS.fontSize;
      applySettings();
      saveSettings({ fontSize: settings.fontSize });
    });
    themeBtn.addEventListener('click', () => {
      settings.theme = THEMES[(THEMES.indexOf(root.dataset.theme) + 1) % THEMES.length];
      applySettings();
      saveSettings({ theme: settings.theme });
    });
    onSettingsChanged((patch) => {
      settings = { ...settings, ...patch };
      applySettings();
    });

    // Highlight the TOC entry of the section currently at the top of the viewport.
    let ticking = false;
    function updateActiveToc() {
      ticking = false;
      if (!headings.length || root.dataset.toc !== 'on') return;
      let current = headings[0];
      for (const h of headings) {
        if (h.el.getBoundingClientRect().top <= 90) current = h;
        else break;
      }
      toc.querySelectorAll('a.active').forEach((a) => a.classList.remove('active'));
      const link = toc.querySelector(`a[data-target="${CSS.escape(current.id)}"]`);
      if (link) {
        link.classList.add('active');
        const r = link.getBoundingClientRect();
        const box = toc.getBoundingClientRect();
        if (r.top < box.top || r.bottom > box.bottom) link.scrollIntoView({ block: 'nearest' });
      }
    }
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateActiveToc);
        }
      },
      { passive: true }
    );

    function render(markdown) {
      source = markdown;
      const { frontMatter, fragment } = renderMarkdown(markdown);
      article.replaceChildren(fragment);
      headings = addHeadingAnchors(article);
      enhanceCodeBlocks(article);
      enhanceLinks(article);

      front.hidden = frontMatter === null;
      frontPre.textContent = frontMatter || '';
      raw.textContent = source;

      const list = buildToc(headings);
      toc.replaceChildren();
      if (list) {
        const heading = document.createElement('div');
        heading.className = 'mdv-toc-title';
        heading.textContent = t('contents', 'Contents');
        toc.append(heading, list);
      }
      applySettings();
      updateActiveToc();
      return { headings, frontMatter };
    }

    function setTitle(text, tooltip) {
      title.textContent = text;
      title.title = tooltip || text;
    }

    function addAction(el) {
      actions.prepend(el);
    }

    function scrollToHash(hash) {
      if (!hash || hash.length < 2) return;
      let id = hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch (_) {
        /* keep raw */
      }
      const target = document.getElementById(id);
      if (target) target.scrollIntoView();
    }

    applySettings();
    return { root, article, render, setTitle, addAction, scrollToHash, button };
  }

  window.MDV = {
    DEFAULTS,
    FONT_MIN,
    FONT_MAX,
    clampFontSize,
    t,
    localize,
    loadSettings,
    saveSettings,
    splitFrontMatter,
    createSlugger,
    renderMarkdown,
    createViewer,
    button,
  };
})();
