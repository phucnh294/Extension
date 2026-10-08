(async function () {
  'use strict';

  MDV.localize(document);
  const settings = await MDV.loadSettings();

  const fontOutput = document.getElementById('font-size-value');
  const fontRange = document.querySelector('input[name="fontSize"]');
  fontRange.min = String(MDV.FONT_MIN);
  fontRange.max = String(MDV.FONT_MAX);
  settings.fontSize = MDV.clampFontSize(settings.fontSize);
  const showFontSize = () => (fontOutput.textContent = `${fontRange.value}px`);
  // Label follows the slider live; the setting is saved on release (storage.sync has a write quota).
  fontRange.addEventListener('input', showFontSize);

  for (const field of document.querySelectorAll('fieldset [name]')) {
    const key = field.name;
    if (field.type === 'checkbox') field.checked = !!settings[key];
    else field.value = String(settings[key]);
    field.addEventListener('change', () => {
      let value = field.type === 'checkbox' ? field.checked : field.value;
      if (key === 'fontSize') value = Number(value);
      MDV.saveSettings({ [key]: value });
    });
  }

  showFontSize();

  const isExtension = typeof chrome !== 'undefined' && !!(chrome.tabs && chrome.runtime && chrome.runtime.id);

  document.getElementById('open').addEventListener('click', () => {
    if (isExtension) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/viewer.html') });
      window.close();
    } else {
      // Opened as a plain web page (e.g. a file preview), not as the installed extension's popup.
      window.open('viewer.html', '_blank');
    }
  });

  if (isExtension && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    document.getElementById('file-access').hidden = false;
    document.getElementById('open-settings').addEventListener('click', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
      window.close();
    });
  }
})();
