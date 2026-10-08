(async function () {
  'use strict';

  MDV.localize(document);
  const $ = (id) => document.getElementById(id);
  const settings = await DocdownFM.loadSettings();
  const SAMPLE = {
    title: 'Array.prototype.map() - JavaScript | MDN',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
    lang: 'en',
    excerpt: 'The map() method creates a new array populated with the results of calling a function.',
    siteName: 'MDN Web Docs',
    byline: '',
  };

  $('defaultMode').value = settings.defaultMode;
  $('frontMatter').value = settings.frontMatter;
  $('template').value = settings.template;
  $('images').checked = settings.images;

  function showSample() {
    $('sample').textContent = DocdownFM.fill($('template').value, SAMPLE);
  }

  let savedTimer;
  async function save(patch) {
    await DocdownFM.saveSettings(patch);
    $('saved').hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('saved').hidden = true), 1500);
  }

  $('defaultMode').addEventListener('change', () => save({ defaultMode: $('defaultMode').value }));
  $('frontMatter').addEventListener('change', () => save({ frontMatter: $('frontMatter').value }));
  $('images').addEventListener('change', () => save({ images: $('images').checked }));
  let typingTimer;
  $('template').addEventListener('input', () => {
    showSample();
    // storage.sync allows a limited number of writes per minute: save when typing pauses.
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => save({ template: $('template').value }), 600);
  });
  $('reset').addEventListener('click', () => {
    $('template').value = DocdownFM.TEMPLATES.custom;
    showSample();
    save({ template: $('template').value });
  });
  showSample();
})();
