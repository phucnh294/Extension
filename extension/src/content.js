/*
 * Content script: turns a plain-text Markdown page (file:// or http(s) URL ending in .md)
 * into a rendered view. Pages that are already HTML (e.g. github.com/…/README.md) are left alone.
 */
(async function () {
  'use strict';

  if (window.__mdvLoaded) return;
  window.__mdvLoaded = true;

  const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown'];
  if (!TEXT_TYPES.includes(document.contentType)) return;

  // Chrome shows plain text as <body><pre>…</pre></body>.
  const pre = document.body && document.body.querySelector(':scope > pre');
  if (!pre) return;

  // Windows-1252 code points 0x80–0x9F; everything else in 0x00–0xFF maps to itself.
  const CP1252 = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
    0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
    0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };

  /**
   * A local file without a BOM can be decoded as windows-1252 instead of UTF-8, which turns
   * "Tiếng Việt" into "TiÃªÌng ViÃªÌ£t". If the text round-trips to valid UTF-8, use that.
   */
  function repairEncoding(text) {
    const charset = (document.characterSet || '').toLowerCase();
    if (charset === 'utf-8' || !/[\u0080-\uffff]/.test(text)) return text;
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const byte = code < 0x100 ? code : CP1252[code];
      if (byte === undefined) return text;
      bytes[i] = byte;
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_) {
      return text; // genuinely not UTF-8 — keep what the browser decoded
    }
  }

  const markdown = repairEncoding(pre.textContent);
  const fileName = decodeURIComponent(location.pathname.split('/').pop() || location.hostname);
  const settings = await MDV.loadSettings();

  if (!document.head) document.documentElement.prepend(document.createElement('head'));
  // Defense in depth on top of DOMPurify: the rendered page never needs page scripts.
  // (Content scripts are not subject to the page CSP.)
  const csp = document.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "script-src 'none'; object-src 'none'; base-uri 'none'";
  document.head.appendChild(csp);
  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  document.head.appendChild(viewport);

  document.body.replaceChildren();
  document.body.classList.add('mdv-page');

  const viewer = MDV.createViewer(document.body, { settings });
  let fullPath = location.href;
  try {
    fullPath = decodeURI(location.href);
  } catch (_) {
    /* keep encoded */
  }
  viewer.setTitle(fileName, fullPath);
  const { headings } = viewer.render(markdown);
  const firstH1 = headings.find((h) => h.level === 1);
  document.title = firstH1 ? `${firstH1.text} · ${fileName}` : fileName;
  viewer.scrollToHash(location.hash);
})();
