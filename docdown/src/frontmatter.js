/*
 * Front matter templates and settings shared by the popup and the options page. Exposes
 * globalThis.DocdownFM.
 */
(function () {
  'use strict';

  const TEMPLATES = {
    basic: ['---', 'title: {title}', 'source: {url}', 'date: {date}', '---'].join('\n'),
    custom: ['---', 'title: {title}', 'source: {url}', 'domain: {domain}', 'clipped: {datetime}', 'lang: {lang}', 'tags: []', '---'].join('\n'),
  };

  const DEFAULT_SETTINGS = Object.freeze({
    defaultMode: 'article', // article | page | selection
    frontMatter: 'basic', // none | basic | custom
    template: TEMPLATES.custom,
    images: true,
  });

  const PLACEHOLDERS = ['title', 'url', 'domain', 'date', 'datetime', 'lang', 'excerpt', 'site', 'byline'];

  /** A value that is safe as a YAML scalar: plain when harmless, otherwise a JSON (= YAML) double-quoted string. */
  function yamlScalar(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return '""';
    const plain = /^[A-Za-z0-9_./][^:#{}[\],&*!|>'"%@`]*$/.test(text) && !/^(true|false|null|yes|no|on|off|~|-?\d[\d._]*)$/i.test(text);
    return plain ? text : JSON.stringify(text);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** Placeholder values for a clip result (`result` from DocdownClip.run). */
  function values(result, now = new Date()) {
    let domain = '';
    try {
      domain = new URL(result.url).hostname.replace(/^www\./, '');
    } catch (_) {
      /* not a URL */
    }
    return {
      title: result.title || '',
      url: result.url || '',
      domain,
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      datetime: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      lang: result.lang || '',
      excerpt: result.excerpt || '',
      site: result.siteName || domain,
      byline: result.byline || '',
    };
  }

  function fill(template, result, now) {
    const v = values(result, now);
    return template.replace(/\{(\w+)\}/g, (match, key) => (PLACEHOLDERS.includes(key) ? yamlScalar(v[key]) : match));
  }

  /** Front matter block (with trailing blank line) for the chosen setting, or ''. */
  function build(settings, result, now) {
    if (settings.frontMatter === 'none') return '';
    const template = settings.frontMatter === 'custom' ? settings.template || TEMPLATES.custom : TEMPLATES.basic;
    const text = fill(template, result, now).trim();
    return text ? `${text}\n\n` : '';
  }

  async function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)) };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(patch) {
    return chrome.storage.sync.set(patch).catch(() => {});
  }

  globalThis.DocdownFM = { TEMPLATES, DEFAULT_SETTINGS, PLACEHOLDERS, yamlScalar, values, fill, build, loadSettings, saveSettings };
})();
