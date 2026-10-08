/*
 * Docdown clipping engine. Injected into the clipped tab (content-script isolated world) after
 * vendor/Readability.js, vendor/turndown.js and vendor/turndown-plugin-gfm.js.
 *
 *   DocdownClip.run({ mode: 'article' | 'page' | 'selection', images: true })
 *     → { ok: true, markdown, title, url, lang, excerpt, siteName, byline, mode, fallback, stats }
 *     → { ok: false, error: 'no-selection' | 'empty' | 'exception', message }
 *   options.debug = true also returns { debug: { cloneHtml, articleHtml } } for tracing a bad result.
 *
 * Flow: live DOM → composed clone (light + shadow DOM, hidden/noise removed, URLs absolute, code and
 * admonitions normalised) → [article mode: Readability] → Turndown with Docdown rules → tidy Markdown.
 * Safe to inject more than once (guarded by globalThis.DocdownClip).
 */
(function () {
  'use strict';
  if (globalThis.DocdownClip) return;

  // ---------- constants ----------

  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'template', 'link', 'meta', 'base', 'button', 'select', 'option',
    'optgroup', 'datalist', 'textarea', 'canvas', 'iframe', 'object', 'embed', 'svg', 'math-field',
    'dialog', 'source', 'track', 'audio', 'video', 'map', 'area',
  ]);
  const SKIP_SELECTOR =
    '.sr-only, .visually-hidden, .screen-reader-text, [aria-hidden="true"], [hidden], .mw-editsection, .editsection';
  // Inside code blocks: line numbers, copy buttons, headers that repeat the language name.
  const CODE_NOISE_SELECTOR = [
    '.line-number', '.line-numbers-rows', '.linenumber', '.lineno', '.linenos', '.gutter', '.hljs-ln-numbers',
    '.react-syntax-highlighter-line-number', '.code-line-number', '[data-line-number]', '.example-header',
    'mdn-copy-button', '.copy-button', '.clipboard-copy', '.copy', 'button',
  ].join(',');
  const KEEP_ATTRS = ['id', 'class', 'role', 'title', 'alt', 'lang', 'dir', 'colspan', 'rowspan', 'start', 'datetime', 'cite'];
  const LANG_PATTERNS = [
    /(?:^|\s)(?:language|lang)-([\w+#.-]+)/,
    /(?:^|\s)highlight-(?:source|text)-([\w+#.-]+)/,
    /(?:^|\s)brush:\s*([\w+#.-]+)/,
    /(?:^|\s)highlight-([\w+#.-]+)/,
    /(?:^|\s)sourceCode\s+([\w+#.-]+)/,
    // Sandpack (react.dev): <pre class="sp-cm sp-pristine sp-javascript">
    /(?:^|\s)sp-(javascript|typescript|jsx|tsx|css|html|json|markdown|python)(?:\s|$)/,
  ];
  const LANG_IGNORE = new Set(['default', 'none', 'text', 'plain', 'plaintext', 'nohighlight', 'notranslate', 'txt', 'source', 'container']);
  const LANG_ALIASES = {
    python3: 'python', py3: 'python', py: 'python', pycon: 'python', 'shell-session': 'console', sh: 'shell', zsh: 'shell',
    'html-basic': 'html', 'source-js': 'js', 'text-html-basic': 'html',
  };
  const ALERT_TYPES = {
    NOTE: ['note', 'info', 'abstract', 'summary', 'tldr', 'todo', 'seealso', 'question', 'help', 'faq', 'example', 'quote', 'cite', 'secondary', 'callout'],
    TIP: ['tip', 'hint', 'success', 'check', 'done'],
    IMPORTANT: ['important'],
    WARNING: ['warning', 'attention', 'deprecated', 'experimental'],
    CAUTION: ['caution', 'danger', 'error', 'failure', 'fail', 'missing', 'bug', 'secure'],
  };
  const ALERT_TITLE_SELECTOR = '.admonition-title, [class*="admonitionHeading"], .markdown-alert-title';
  const ALERT_MARKER = 'DOCDOWNALERT';
  // Characters some sites put in heading permalinks: zero-width space, BOM, pilcrow, section sign.
  const PERMALINK_CHARS = new RegExp(
    '^[\\s#' + String.fromCharCode(0x200b, 0xfeff, 0xb6, 0xa7) + ']*$'
  );
  const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');

  // ---------- composed-tree clone ----------

  function shadowRootOf(el) {
    if (el.shadowRoot) return el.shadowRoot;
    try {
      // Content scripts can also read closed shadow roots.
      return globalThis.chrome && chrome.dom && chrome.dom.openOrClosedShadowRoot
        ? chrome.dom.openOrClosedShadowRoot(el)
        : null;
    } catch (_) {
      return null;
    }
  }

  /** Children as rendered: shadow root content (slots replaced by their assigned nodes) or light DOM. */
  function composedChildren(el) {
    const root = shadowRootOf(el);
    return root ? [...root.childNodes] : [...el.childNodes];
  }

  function slotChildren(slot) {
    const assigned = slot.assignedNodes({ flatten: true });
    return assigned.length ? assigned : [...slot.childNodes];
  }

  function isHidden(el) {
    if (el.matches(SKIP_SELECTOR)) return true;
    const style = getComputedStyle(el);
    return style.display === 'none';
  }

  function detectLanguage(pre) {
    const candidates = [pre.querySelector('code'), pre];
    for (let el = pre.parentElement, i = 0; el && i < 4 && el !== document.body; el = el.parentElement, i++) {
      candidates.push(el);
    }
    for (const el of candidates) {
      if (!el) continue;
      const data = el.getAttribute('data-language') || el.getAttribute('data-lang') || el.getAttribute('data-code-language');
      const hints = data ? [` language-${data}`] : [];
      hints.push(' ' + (typeof el.className === 'string' ? el.className : ''));
      for (const hint of hints) {
        for (const re of LANG_PATTERNS) {
          const m = re.exec(hint);
          if (!m) continue;
          let lang = m[1].toLowerCase().replace(/[^\w+#.-]/g, '');
          lang = LANG_ALIASES[lang] || lang;
          if (lang && !LANG_IGNORE.has(lang)) return lang;
        }
      }
    }
    return '';
  }

  function isBlockLike(el) {
    const display = getComputedStyle(el).display;
    return /^(block|flex|grid|list-item|table|table-row)$/.test(display);
  }

  /** Plain text of a code block as the reader sees it: no line numbers, buttons or prompts. */
  function codeText(root, ctx) {
    let out = '';
    const walk = (node) => {
      for (const child of node.nodeType === 1 ? composedChildren(node) : node.childNodes) {
        if (child.nodeType === 3) {
          if (ctx.range && !ctx.range.intersectsNode(child)) continue;
          out += sliceForRange(child, ctx.range);
        } else if (child.nodeType === 1) {
          const tag = child.localName;
          if (tag === 'br') {
            out += '\n';
            continue;
          }
          if (tag === 'slot') {
            for (const n of slotChildren(child)) walk({ nodeType: 0, childNodes: [n] });
            continue;
          }
          if (child.matches(CODE_NOISE_SELECTOR) || child.matches(SKIP_SELECTOR)) continue;
          const style = getComputedStyle(child);
          if (style.display === 'none' || style.userSelect === 'none') continue;
          const block = isBlockLike(child);
          if (block && out && !out.endsWith('\n')) out += '\n';
          walk(child);
          if (block && out && !out.endsWith('\n')) out += '\n';
        }
      }
    };
    walk(root);
    return out.replace(NBSP, ' ').replace(/\n+$/, '').replace(/^\n+/, '');
  }

  function sliceForRange(textNode, range) {
    let text = textNode.data;
    if (!range) return text;
    const start = textNode === range.startContainer ? range.startOffset : 0;
    const end = textNode === range.endContainer ? range.endOffset : text.length;
    return text.slice(start, end);
  }

  function alertType(el) {
    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (!cls) return null;
    let kind = null;
    let m;
    if ((m = /theme-admonition-([a-z]+)/.exec(cls))) kind = m[1];
    else if ((m = /markdown-alert-([a-z]+)/.exec(cls)) && m[1] !== 'title') kind = m[1];
    else if (/(?:^|\s)(admonition|notecard|callout)(?:\s|$)/.test(cls)) {
      const words = cls.split(/\s+/);
      kind = words.find((w) => Object.values(ALERT_TYPES).some((list) => list.includes(w))) || 'note';
    }
    if (!kind) return null;
    for (const [type, list] of Object.entries(ALERT_TYPES)) if (list.includes(kind)) return type;
    return 'NOTE';
  }

  function absoluteUrl(value) {
    try {
      return new URL(value, document.baseURI).href;
    } catch (_) {
      return '';
    }
  }

  function imageSource(img) {
    const candidates = [img.currentSrc, img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('data-original')];
    for (const c of candidates) {
      if (!c) continue;
      if (c.startsWith('data:') && c.length > 2048) continue; // inline blobs and lazy-load placeholders
      if (c.startsWith('data:image/gif') || c.startsWith('data:image/svg')) continue;
      return absoluteUrl(c);
    }
    return '';
  }

  /** Clones `node` into ctx.doc following the composed tree. Returns a node, a fragment or null. */
  function cloneComposed(node, ctx) {
    if (node.nodeType === 3) {
      if (ctx.range && !ctx.range.intersectsNode(node)) return null;
      return ctx.doc.createTextNode(sliceForRange(node, ctx.range));
    }
    if (node.nodeType !== 1) return null;
    const el = node;
    const tag = el.localName;
    if (SKIP_TAGS.has(tag)) return null;
    if (ctx.range && !ctx.range.intersectsNode(el)) return null;

    if (tag === 'slot') {
      const fragment = ctx.doc.createDocumentFragment();
      for (const child of slotChildren(el)) {
        const copy = cloneComposed(child, ctx);
        if (copy) fragment.appendChild(copy);
      }
      return fragment;
    }
    if (tag === 'input') {
      if (el.type !== 'checkbox') return null;
      const box = ctx.doc.createElement('input');
      box.setAttribute('type', 'checkbox');
      if (el.checked) box.setAttribute('checked', '');
      return box;
    }
    if (isHidden(el)) return null;

    if (tag === 'pre') {
      const pre = ctx.doc.createElement('pre');
      const code = ctx.doc.createElement('code');
      code.textContent = codeText(el, ctx);
      if (!code.textContent.trim()) return null;
      const lang = detectLanguage(el);
      if (lang) pre.setAttribute('data-docdown-lang', lang);
      pre.appendChild(code);
      ctx.stats.codeBlocks++;
      return pre;
    }
    if (tag === 'img') {
      if (!ctx.images) return null;
      const src = imageSource(el);
      if (!src) return null;
      const img = ctx.doc.createElement('img');
      img.setAttribute('src', src);
      if (el.alt) img.setAttribute('alt', el.alt);
      if (el.title) img.setAttribute('title', el.title);
      ctx.stats.images++;
      return img;
    }

    const alert = alertType(el);
    const copy = ctx.doc.createElement(alert ? 'blockquote' : /^[a-z][a-z0-9-]*$/.test(tag) ? tag : 'div');
    for (const name of KEEP_ATTRS) {
      const value = el.getAttribute(name);
      if (value !== null) copy.setAttribute(name, value);
    }
    if (tag === 'a' && el.hasAttribute('href')) {
      const href = el.getAttribute('href');
      if (!/^\s*javascript:/i.test(href)) copy.setAttribute('href', absoluteUrl(href));
    }
    if (alert) ctx.stats.alerts++;

    for (const child of composedChildren(el)) {
      const c = cloneComposed(child, ctx);
      if (c) copy.appendChild(c);
    }
    // Links left without text (icon-only permalinks once their SVG is dropped) carry nothing for
    // Markdown, and Readability treats a heading next to one as link-only boilerplate and deletes it.
    if (tag === 'a' && !copy.textContent.trim() && !copy.querySelector('img')) return null;

    if (alert) {
      // GitHub alerts have no custom title: keep a custom one as a bold first line, drop the default.
      const titleEl = copy.querySelector(ALERT_TITLE_SELECTOR);
      if (titleEl) {
        const text = titleEl.textContent.trim();
        const isDefault = !text || Object.values(ALERT_TYPES).flat().includes(text.toLowerCase().replace(/[:.]$/, ''));
        if (isDefault) titleEl.remove();
        else {
          const p = ctx.doc.createElement('p');
          const strong = ctx.doc.createElement('strong');
          strong.textContent = text;
          p.appendChild(strong);
          titleEl.replaceWith(p);
        }
      }
      const marker = ctx.doc.createElement('p');
      marker.textContent = ALERT_MARKER + alert;
      copy.prepend(marker);
    }
    return copy;
  }

  // ---------- Markdown conversion ----------

  function tableToMarkdown(table, service) {
    const rows = [...table.rows].filter((r) => r.closest('table') === table);
    if (!rows.length) return '';
    const grid = rows.map((row) => {
      const cells = [];
      for (const cell of row.cells) {
        const md = service
          .turndown(cell.innerHTML || '')
          .replace(/\n+/g, ' ')
          .replace(/\|/g, '\\|')
          .trim();
        cells.push(md);
        const span = Math.min(Number(cell.getAttribute('colspan')) || 1, 20);
        for (let i = 1; i < span; i++) cells.push('');
      }
      return cells;
    });
    const width = Math.max(...grid.map((r) => r.length));
    if (width === 0) return '';
    const line = (cells) => '| ' + [...cells, ...Array(width - cells.length).fill('')].join(' | ') + ' |';
    const [head, ...body] = grid;
    return '\n\n' + [line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n') + '\n\n';
  }

  function createService(stats) {
    const service = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
    });
    const gfm = globalThis.turndownPluginGfm;
    service.use([gfm.strikethrough, gfm.taskListItems]);

    service.addRule('docdownCode', {
      filter: (node) => node.nodeName === 'PRE',
      replacement: (_content, node) => {
        const lang = node.getAttribute('data-docdown-lang') || '';
        const code = node.textContent.replace(/\n+$/, '');
        const longest = Math.max(0, ...(code.match(/`+/g) || []).map((s) => s.length));
        const fence = '`'.repeat(Math.max(3, longest + 1));
        return `\n\n${fence}${lang}\n${code}\n${fence}\n\n`;
      },
    });
    service.addRule('docdownTable', {
      filter: 'table',
      replacement: (_content, node) => {
        stats.tables++;
        return tableToMarkdown(node, service);
      },
    });
    service.addRule('docdownPermalink', {
      // Heading permalinks (#, ¶, zero-width text) and other links without visible text.
      filter: (node) => node.nodeName === 'A' && !node.querySelector('img') && PERMALINK_CHARS.test(node.textContent),
      replacement: () => '',
    });
    return service;
  }

  function tidy(markdown) {
    return markdown
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join('\n')
      // Alert blockquotes start with a marker paragraph: "> DOCDOWNALERTNOTE", ">", "> text"
      // (or "> > …" when nested). GitHub alert syntax wants "> [!NOTE]" directly followed by the text.
      .replace(/^((?:> )+)DOCDOWNALERT([A-Z]+)\n>(?: >)*\n/gm, (_, quote, type) => `${quote}[!${type}]\n`)
      .replace(/^((?:> )+)DOCDOWNALERT([A-Z]+)$/gm, (_, quote, type) => `${quote}[!${type}]`)
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
  }

  // ---------- modes ----------

  function newContext(options, range) {
    const doc = document.implementation.createHTMLDocument(document.title);
    return {
      doc,
      range: range || null,
      images: options.images !== false,
      stats: { codeBlocks: 0, alerts: 0, tables: 0, images: 0 },
    };
  }

  function composedBody(ctx) {
    const body = cloneComposed(document.body, ctx) || ctx.doc.createElement('body');
    return body;
  }

  function clipArticle(options) {
    const ctx = newContext(options);
    ctx.doc.documentElement.setAttribute('lang', document.documentElement.lang || '');
    ctx.doc.body.replaceWith(composedBody(ctx));
    const cloneHtml = options.debug ? ctx.doc.body.outerHTML : undefined;
    const article = new Readability(ctx.doc, { charThreshold: 200 }).parse();
    if (!article || !article.content || article.textContent.trim().length < 80) return null;
    const content = new DOMParser().parseFromString(article.content, 'text/html').body;
    // Stats are recounted on the extracted article, not the whole page.
    const stats = {
      codeBlocks: content.querySelectorAll('pre').length,
      alerts: (content.textContent.match(new RegExp(ALERT_MARKER, 'g')) || []).length,
      tables: 0,
      images: content.querySelectorAll('img').length,
    };
    let markdown = tidy(createService(stats).turndown(content));
    const title = (article.title || document.title || '').trim();
    if (title && !/^#\s/.test(markdown)) markdown = `# ${title}\n\n${markdown}`;
    return {
      markdown,
      title,
      lang: article.lang || document.documentElement.lang || '',
      excerpt: (article.excerpt || '').trim(),
      siteName: article.siteName || '',
      byline: article.byline || '',
      stats,
      debug: options.debug ? { cloneHtml, articleHtml: article.content } : undefined,
    };
  }

  function clipPage(options) {
    const ctx = newContext(options);
    const body = composedBody(ctx);
    const markdown = tidy(createService(ctx.stats).turndown(body));
    return { markdown, title: document.title.trim(), lang: document.documentElement.lang || '', stats: ctx.stats };
  }

  function clipSelection(options) {
    const selection = getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return { error: 'no-selection' };
    const range = selection.getRangeAt(0);
    let root = range.commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentElement;
    const pre = root.closest('pre');
    if (pre) root = pre; // selection inside a code block → keep it a code block
    const ctx = newContext(options, range);
    const copy = cloneComposed(root, ctx);
    const wrapper = ctx.doc.createElement('div');
    if (copy) wrapper.appendChild(copy);
    const markdown = tidy(createService(ctx.stats).turndown(wrapper));
    return { markdown, title: document.title.trim(), lang: document.documentElement.lang || '', stats: ctx.stats };
  }

  function run(options = {}) {
    const requested = ['article', 'page', 'selection'].includes(options.mode) ? options.mode : 'article';
    try {
      let mode = requested;
      let fallback = false;
      let result;
      if (requested === 'selection') {
        result = clipSelection(options);
        if (result.error) return { ok: false, error: result.error };
      } else if (requested === 'article') {
        result = clipArticle(options);
        if (!result) {
          result = clipPage(options);
          mode = 'page';
          fallback = true;
        }
      } else {
        result = clipPage(options);
      }
      if (!result.markdown.trim()) return { ok: false, error: 'empty' };
      return {
        ok: true,
        url: location.href,
        mode,
        fallback,
        excerpt: '',
        siteName: '',
        byline: '',
        ...result,
        stats: { ...result.stats, chars: result.markdown.length },
      };
    } catch (err) {
      return { ok: false, error: 'exception', message: String((err && err.message) || err) };
    }
  }

  globalThis.DocdownClip = { run, detectLanguage, alertType };
})();
