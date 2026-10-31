/* ============================================================
   Universe OS · 软件层 · trash.js
   废纸篓：移到废纸篓（重命名至 .trash/ 目录，保留数据可恢复）、
   恢复、清空；TrashApp 窗口列出废纸篓内容
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const createElement = NS.render.createElement;
  const { $, escapeHtml, formatSize, bindTap } = NS.core.utils;
  const { store, fs } = NS.core;
  const { confirmDialog, toast } = NS.render;

  function meta() { return store.get('trash.meta', []); }
  function saveMeta(m) { store.set('trash.meta', m); }

  /* 移到废纸篓：fs.rename 到 .trash/，记录原路径；返回是否成功 */
  async function trashItem(path, name) {
    try {
      const m = meta();
      let target = '.trash/' + name;
      let i = 1;
      try { const exists = await fs.readBlob(target); if (exists) { const dot = name.lastIndexOf('.'); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : ''; target = '.trash/' + base + '_' + i++ + ext; } } catch (e) {}
      await fs.moveEntry(path, target);
      const fname = target.slice('.trash/'.length);
      m.push({ name: fname, origPath: path, date: Date.now() });
      saveMeta(m);
      if (NS.system.layout.removeFileFromDesktop) NS.system.layout.removeFileFromDesktop(path);
      return true;
    } catch (err) { return false; }
  }

  /* 恢复：从 .trash/ 重命名回原路径（原路径不可用时回根目录） */
  async function restoreItem(name) {
    try {
      const m = meta();
      const it = m.find(x => x.name === name);
      const target = (it && it.origPath) ? it.origPath : name;
      await fs.moveEntry('.trash/' + name, target);
      saveMeta(m.filter(x => x.name !== name));
      return true;
    } catch (err) { return false; }
  }

  async function emptyTrash() {
    try { await fs.remove('.trash'); } catch (e) {}
    saveMeta([]);
    return true;
  }

  async function listItems() {
    let items = [];
    try { items = await fs.list('.trash'); } catch (e) {}
    const m = meta();
    return items.map(x => {
      const it = m.find(y => y.name === x.name);
      return { name: x.name, kind: x.kind, size: x.size || 0, origPath: it ? it.origPath : '', date: it ? it.date : 0 };
    }).sort((a, b) => (b.date || 0) - (a.date || 0));
  }

  NS.apps.trash = { trashItem, restoreItem, emptyTrash, listItems };

  /* ---------- 废纸篓窗口 ---------- */
  class TrashApp {
    mount(body) {
      this.body = body;
      body.innerHTML = '<div class="trash-body"></div>';
      this.listEl = body.querySelector('.trash-body');
      this.refresh();
      return this;
    }
    refresh() {
      listItems().then(items => {
        this.listEl.textContent = '';
        const kids = [h('div', { className: 'trash-head' }, [
          h('span', { className: 'trash-title' }, '废纸篓'),
          h('button', {
            className: 'trash-btn danger', disabled: !items.length,
            onclick: () => this.clearAll()
          }, '清空废纸篓')
        ])];
        if (!items.length) {
          kids.push(h('div', { className: 'trash-empty' }, '废纸篓是空的'));
        } else {
          items.forEach(it => kids.push(h('div', { className: 'trash-row' }, [
            h('span', { className: 'trash-ic' }, NS.render.icons.UI.trash),
            h('span', { className: 'trash-name' }, it.name),
            h('span', { className: 'trash-size' }, formatSize(it.size)),
            h('span', { className: 'trash-date' }, it.date ? new Date(it.date).toLocaleDateString() : ''),
            h('button', {
              className: 'trash-btn',
              onclick: () => this.restore(it)
            }, '恢复')
          ])));
        }
        kids.forEach(k => this.listEl.appendChild(createElement(k)));
      });
    }
    restore(it) {
      restoreItem(it.name).then(ok => {
        if (ok) { toast('已恢复「' + it.name + '」'); this.refresh(); }
        else toast('恢复失败');
      });
    }
    clearAll() {
      confirmDialog('确定清空废纸篓？此操作不可恢复。').then(ok => {
        if (!ok) return;
        emptyTrash().then(() => { toast('废纸篓已清空'); this.refresh(); });
      });
    }
  }
  NS.apps.TrashApp = TrashApp;
  NS.apps.buildTrash = (body) => new TrashApp().mount(body);
})(window);
