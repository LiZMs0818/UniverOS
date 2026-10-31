/* ============================================================
   Universe OS · 系统层 · spotlight.js
   全局搜索（Spotlight）：⌘/Ctrl+Space 或状态栏搜索图标唤起，
   检索应用 + 根目录文件，回车/点击打开
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const h = NS.render.h;
  const createElement = NS.render.createElement;
  const { $, escapeHtml } = NS.core.utils;

  let overlay = null, inputEl = null, listEl = null;
  let fileEntries = [];

  const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
  const TXT_EXT = ['txt', 'md', 'json', 'js', 'css', 'html', 'htm', 'xml', 'log', 'csv'];

  function pickApp(id) { close(); NS.system.winman.openApp(id); }
  function pickFile(f) {
    close();
    const ext = f.name.split('.').pop().toLowerCase();
    if (f.kind === 'directory') NS.system.winman.openApp('files');
    else if (IMG_EXT.indexOf(ext) >= 0) NS.system.winman.openApp('imageviewer', { path: f.path });
    else if (TXT_EXT.indexOf(ext) >= 0) NS.system.winman.openApp('texteditor', { path: f.path });
    else NS.system.winman.openApp('files');
  }

  function renderList(q) {
    q = (q || '').trim().toLowerCase();
    const apps = Object.keys(NS.apps.APPS)
      .map(id => ({ id, name: NS.apps.APPS[id].name, icon: NS.apps.APPS[id].icon }))
      .filter(a => a.name.toLowerCase().indexOf(q) >= 0)
      .slice(0, 8);
    const files = fileEntries.filter(f => f.name.toLowerCase().indexOf(q) >= 0).slice(0, 12);
    const kids = [];
    if (apps.length) {
      kids.push(h('div', { className: 'sp-group' }, '应用'));
      apps.forEach(a => kids.push(h('div', { className: 'sp-item', onclick: () => pickApp(a.id) }, [
        h('span', { className: 'sp-ic', html: a.icon }),
        h('span', { className: 'sp-name' }, a.name)
      ])));
    }
    if (files.length) {
      kids.push(h('div', { className: 'sp-group' }, '文件'));
      files.forEach(f => kids.push(h('div', { className: 'sp-item', onclick: () => pickFile(f) }, [
        h('span', { className: 'sp-ic', html: NS.core.utils.fileIconSvg(f.name, f.kind) }),
        h('span', { className: 'sp-name' }, f.name)
      ])));
    }
    if (!apps.length && !files.length) kids.push(h('div', { className: 'sp-empty' }, '无匹配结果'));
    listEl.textContent = '';
    kids.forEach(k => listEl.appendChild(createElement(k)));
  }

  function open() {
    if (overlay) return;
    overlay = createElement(h('div', { className: 'spotlight-overlay' }, [
      h('div', { className: 'sp-box' }, [
        h('div', { className: 'sp-input-wrap' }, [
          h('span', { className: 'sp-mag', html: NS.render.icons.UI.search }),
          h('input', {
            className: 'sp-input', placeholder: '搜索应用与文件…',
            oninput: e => renderList(e.target.value),
            onkeydown: e => {
              if (e.key === 'Escape') { e.preventDefault(); close(); }
              else if (e.key === 'Enter') {
                const q = e.target.value.trim().toLowerCase();
                const app = Object.keys(NS.apps.APPS).map(id => ({ id, name: NS.apps.APPS[id].name }))
                  .filter(a => a.name.toLowerCase().indexOf(q) >= 0)[0];
                if (app) pickApp(app.id);
                else if (fileEntries.filter(f => f.name.toLowerCase().indexOf(q) >= 0)[0]) pickFile(fileEntries.filter(f => f.name.toLowerCase().indexOf(q) >= 0)[0]);
              }
            }
          })
        ]),
        h('div', { className: 'sp-list' })
      ])
    ]));
    document.body.appendChild(overlay);
    inputEl = overlay.querySelector('.sp-input');
    listEl = overlay.querySelector('.sp-list');
    fileEntries = [];
    renderList('');
    inputEl.focus();
    NS.core.fs.list('').then(list => {
      if (!overlay) return;
      fileEntries = list.map(x => ({ name: x.name, kind: x.kind, path: x.name }));
      renderList(inputEl ? inputEl.value : '');
    }).catch(() => {});
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
  }

  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null; inputEl = null; listEl = null;
  }

  function toggle() { overlay ? close() : open(); }

  NS.system.spotlight = { open, close, toggle, get isOpen() { return !!overlay; } };
})(window);
