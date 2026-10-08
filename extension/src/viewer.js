/*
 * viewer.html: render a Markdown file the user picks or drops. Works without
 * "Allow access to file URLs". When the browser hands us a FileSystemFileHandle
 * (showOpenFilePicker / drag & drop), the file is re-rendered whenever it changes on disk.
 */
(async function () {
  'use strict';

  MDV.localize(document);
  const settings = await MDV.loadSettings();
  const viewer = MDV.createViewer(document.body, { settings });
  viewer.setTitle('Readown');

  const input = document.getElementById('file-input');
  const empty = document.getElementById('empty-state').content.firstElementChild.cloneNode(true);
  MDV.localize(empty);
  viewer.article.before(empty);
  viewer.article.hidden = true;

  const openBtn = viewer.button('open', 'raw', 'chooseFile', 'Open file…');
  openBtn.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: MDV.t('chooseFile', 'Open file…') })
  );
  openBtn.classList.add('mdv-primary');
  viewer.addAction(openBtn);

  let watchTimer = null;
  let lastModified = 0;

  async function show(file, handle) {
    clearInterval(watchTimer);
    const text = await file.text();
    empty.remove();
    viewer.article.hidden = false;
    viewer.setTitle(file.name);
    const { headings } = viewer.render(text);
    const firstH1 = headings.find((h) => h.level === 1);
    document.title = firstH1 ? `${firstH1.text} · ${file.name}` : file.name;
    window.scrollTo(0, 0);
    lastModified = file.lastModified;

    if (handle) {
      const title = viewer.root.querySelector('.mdv-bar-title');
      const live = document.createElement('span');
      live.className = 'mdv-live';
      live.textContent = MDV.t('liveReload', 'live');
      live.title = MDV.t('liveReloadHint', 'Re-renders automatically when the file changes.');
      title.appendChild(live);
      watchTimer = setInterval(async () => {
        try {
          const current = await handle.getFile();
          if (current.lastModified === lastModified) return;
          lastModified = current.lastModified;
          const y = window.scrollY;
          viewer.render(await current.text());
          window.scrollTo(0, y);
        } catch (_) {
          clearInterval(watchTimer); // file deleted or permission revoked
          live.remove();
        }
      }, 1000);
    }
  }

  async function pick() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Markdown',
              accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mkdn'], 'text/plain': ['.txt'] },
            },
          ],
        });
        await show(await handle.getFile(), handle);
      } catch (err) {
        if (err && err.name !== 'AbortError') input.click();
      }
    } else {
      input.click();
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-pick], [data-action="open"]')) pick();
  });
  input.addEventListener('change', () => {
    if (input.files[0]) show(input.files[0], null);
    input.value = '';
  });

  // Drag & drop anywhere on the page.
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++dragDepth === 1) viewer.root.classList.add('mdv-dragging');
  });
  document.addEventListener('dragleave', () => {
    if (--dragDepth === 0) viewer.root.classList.remove('mdv-dragging');
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    viewer.root.classList.remove('mdv-dragging');
    const item = [...e.dataTransfer.items].find((i) => i.kind === 'file');
    if (!item) return;
    const handlePromise = item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : null;
    const file = item.getAsFile();
    let handle = null;
    try {
      handle = handlePromise ? await handlePromise : null;
    } catch (_) {
      handle = null;
    }
    if (handle && handle.kind === 'file') await show(await handle.getFile(), handle);
    else if (file) await show(file, null);
  });
})();
