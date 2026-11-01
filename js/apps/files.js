/* ============================================================
   Universe OS · 软件层 · files.js
   文件管理（声明式 Component）：
   导航/面包屑/搜索/排序/视图切换/多选/剪贴板/导入导出/
   双击与右键菜单/拖到桌面/系统文件拖入
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const { fs } = NS.core;
  const { store } = NS.core;
  const { config } = NS.core;
  const { $, $$, escapeHtml, formatSize, bindTap, fileIconSvg } = NS.core.utils;
  const { toast, confirmDialog, promptDialog, menu: Menu } = NS.render;

  class FilesApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = {
        cwd: '', view: store.get('files.view', 'grid'),
        sortKey: 'name', sortDir: 1,
        selecting: false, selection: [],
        query: '', entries: [],
        ready: false, error: null
      };
      this._history = [''];
      this._historyIdx = 0;
      this._clipboard = null;
      this._entryMap = new Map();
      this._dragDepth = 0;
      this.fileInputRef = null;
      this.listRef = null;
      this.mainRef = null;
    }

    componentWillUnmount() { this._destroyUv(); }

    /* ---------- 路径工具 ---------- */
    joinPath(b, n) { return b ? b + '/' + n : n; }

    navigateTo(path, push) {
      if (push === undefined) push = true;
      path = path || '';
      this.setState({ cwd: path, selection: [], selecting: false });
      if (push) {
        this._history = this._history.slice(0, this._historyIdx + 1);
        this._history.push(path);
        this._historyIdx = this._history.length - 1;
      }
      this.refresh();
    }

    refresh() {
      const s = this.state;
      return fs.list(s.cwd).then(entries => {
        const showHidden = store.get('files.showHidden', false);
        if (!showHidden) entries = entries.filter(e => !e.name.startsWith('.'));
        if (s.query) {
          const q = s.query.toLowerCase();
          entries = entries.filter(e => e.name.toLowerCase().indexOf(q) >= 0);
        }
        entries.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
          let av, bv;
          if (s.sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
          else if (s.sortKey === 'size') { av = a.size || 0; bv = b.size || 0; }
          else if (s.sortKey === 'time') { av = a.lastModified || 0; bv = b.lastModified || 0; }
          else { av = a.name.split('.').pop(); bv = b.name.split('.').pop(); }
          if (av < bv) return -s.sortDir;
          if (av > bv) return s.sortDir;
          return 0;
        });
        this.setState({ entries, ready: true, error: null });
      }).catch(err => {
        this.setState({ error: err.message || String(err), ready: true });
      });
    }

    /* ---------- 渲染 ---------- */
    render() {
      const s = this.state;
      const selCount = s.selection.length;
      const I = NS.render.icons.UI;
      return h('div', { className: 'fm' }, [
        h('div', { className: 'fm-toolbar' }, [
          h('button', { className: 'fm-btn', dataset: { act: 'back' }, disabled: this._historyIdx <= 0, onclick: () => this.back(), html: I.left }),
          h('button', { className: 'fm-btn', dataset: { act: 'forward' }, disabled: this._historyIdx >= this._history.length - 1, onclick: () => this.forward(), html: I.right }),
          h('button', { className: 'fm-btn', dataset: { act: 'home' }, onclick: () => this.navigateTo(''), html: I.home }),
          this.renderPath(),
          h('input', {
            className: 'fm-search', placeholder: '搜索', dataset: { search: '' },
            value: s.query,
            oninput: e => { this.setState({ query: e.target.value }); this.refresh(); }
          }),
          h('button', {
            className: 'fm-btn', dataset: { act: 'view' },
            title: '视图：' + (s.view === 'grid' ? '网格' : '列表'),
            onclick: () => this.setView(s.view === 'grid' ? 'list' : 'grid'),
            html: s.view === 'grid' ? I.list : I.grid
          }),
          h('button', { className: 'fm-btn', title: '导入', dataset: { act: 'import' }, onclick: () => this.fileInputRef && this.fileInputRef.click(), html: I.import }),
          h('button', { className: 'fm-btn', dataset: { act: 'refresh' }, onclick: () => this.refresh(), html: I.refresh })
        ]),
        h('div', { className: 'fm-selection-bar' + (s.selecting ? ' on' : ''), dataset: { selectionBar: '' } }, [
          h('span', null, '已选 ' + selCount + ' 项'),
          h('span', { className: 'grow' }),
          h('button', { className: 'mini-btn', onclick: () => this.selectAll() }, '全选'),
          h('button', { className: 'mini-btn', onclick: () => this.compressSelected() }, '压缩'),
          h('button', { className: 'mini-btn', onclick: () => this.deleteSelected() }, '删除'),
          h('button', { className: 'mini-btn', onclick: () => this.cancelSelect() }, '取消')
        ]),
        h('div', {
          className: 'fm-main', ref: el => (this.mainRef = el),
          onpointerup: e => this.onMainPointerUp(e),
          oncontextmenu: e => this.onMainContextMenu(e),
          ondragenter: e => this.onDragEnter(e),
          ondragover: e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; },
          ondragleave: e => this.onDragLeave(e),
          ondrop: e => this.onDrop(e)
        }, [
          h('div', { className: 'fm-list ' + s.view, ref: el => (this.listRef = el) }, this.renderList()),
          h('div', { className: 'fm-drop-hint' }, '松开以导入到当前文件夹')
        ]),
        h('input', { type: 'file', multiple: true, style: 'display:none', ref: el => (this.fileInputRef = el), onchange: e => this.importFiles(e.target.files) })
      ]);
    }

    renderPath() {
      const s = this.state;
      const crumbs = [];
      crumbs.push(h('span', { className: 'fm-crumb', onclick: () => this.navigateTo('') }, 'Universe'));
      const parts = s.cwd ? s.cwd.split('/') : [];
      parts.forEach((p, i) => {
        crumbs.push(h('span', { className: 'fm-sep' }, '/'));
        const target = parts.slice(0, i + 1).join('/');
        crumbs.push(h('span', { className: 'fm-crumb', onclick: () => this.navigateTo(target) }, p));
      });
      return h('div', { className: 'fm-path', dataset: { path: '' } }, crumbs);
    }

    renderList() {
      const s = this.state;
      if (s.error != null) {
        return h('div', { className: 'fm-empty' }, '读取失败：' + escapeHtml(s.error));
      }
      if (!s.entries.length) {
        return h('div', { className: 'fm-empty' }, s.query ? '没有匹配的文件' : '此文件夹为空<br>双击空白处可新建，或点 ＋ 导入文件');
      }
      this._entryMap = new Map();
      return s.entries.map(e => {
        const path = this.joinPath(s.cwd, e.name);
        this._entryMap.set(path, e);
        return h('div', {
          className: 'fm-item' + (s.selection.indexOf(path) >= 0 ? ' selected' : ''),
          dataset: { path },
          oncontextmenu: ev => { ev.preventDefault(); this.showFileMenu(ev.clientX, ev.clientY, e, path); }
        }, [
          h('div', { className: 'fm-ic', html: fileIconSvg(e.name, e.kind) }),
          h('div', { className: 'fm-name' }, escapeHtml(e.name)),
          s.view === 'list'
            ? h('div', { className: 'fm-meta' }, [
                h('span', null, e.size != null ? formatSize(e.size) : '—'),
                h('span', null, e.lastModified ? new Date(e.lastModified).toLocaleDateString() : '—')
              ])
            : null
        ]);
      });
    }

    /* ---------- 列表绑定（渲染后执行：tap / 拖到桌面） ---------- */
    componentDidUpdate() {
      const s = this.state;
      if (!this.listRef) return;
      const items = this.listRef.querySelectorAll('[data-path]');
      items.forEach(el => {
        const path = el.dataset.path;
        const e = this._entryMap.get(path);
        if (!e) return;
        bindTap(el, {
          onSingle: () => {
            if (s.selecting) {
              let sel = s.selection;
              if (sel.indexOf(path) >= 0) sel = sel.filter(p => p !== path);
              else sel = sel.concat([path]);
              this.setState({ selection: sel });
              return;
            }
            if (e.kind === 'directory') this.navigateTo(path);
            else this.openFile(path);
          },
          onDouble: ev => this.showFileMenu(ev.clientX, ev.clientY, e, path)
        });
        /* 文件项拖到桌面 */
        if (e.kind !== 'directory') this.wireFileDrag(el, path);
      });
    }

    wireFileDrag(el, path) {
      el.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        /* pointer capture：指针移出元素后仍持续收到 move/up，避免拖动中途卡住 */
        try { el.setPointerCapture(ev.pointerId); } catch (err) {}
        const startX = ev.clientX, startY = ev.clientY;
        let started = false, holdArmed = false, holdTimer = null;
        /* 与主屏幕一致：长按 400ms 后才解锁拖动，防误触 */
        holdTimer = setTimeout(function () { holdArmed = true; }, 400);
        function onMove(mv) {
          if (!holdArmed) return;
          if (!started && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 10) return;
          if (!started) {
            started = true;
            el.classList.add('dragging');
          }
          el.style.position = 'fixed';
          el.style.left = (mv.clientX - 30) + 'px';
          el.style.top = (mv.clientY - 30) + 'px';
          el.style.zIndex = '99999';
          el.style.opacity = '0.7';
          el.style.pointerEvents = 'none';
          if (el.closest('.fm-main')) el.closest('.fm-main').classList.toggle('drag-over', false);
        }
        function onUp(up) {
          clearTimeout(holdTimer);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
          if (!started) return;
          el.classList.remove('dragging');
          el.style.cssText = '';
          const deskRect = NS.system.deskEl.getBoundingClientRect();
          if (up.clientX >= deskRect.left && up.clientX <= deskRect.right &&
              up.clientY >= deskRect.top && up.clientY <= deskRect.bottom) {
            NS.system.layout.addFileToDesktop(path, el.dataset.path.split('/').pop());
          }
        }
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
      });
    }

    /* ---------- 文件操作 ---------- */
    openFile(path) {
      const ext = path.split('.').pop().toLowerCase();
      if (ext === 'zip') { this.extractZip(path); return; }
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].indexOf(ext) >= 0) NS.system.winman.openApp('imageviewer', { path });
      else NS.system.winman.openApp('texteditor', { path });
    }

    /* ---------- ZIP 压缩 / 解压 ---------- */
    async extractZip(path) {
      const name = path.split('/').pop() || 'archive.zip';
      try {
        const blob = await fs.readBlob(path);
        const entries = await NS.core.zip.unzip(blob);
        const files = entries.filter(e => !e.isDirectory);
        const dirs = entries.filter(e => e.isDirectory);
        const existing = await fs.list(this.state.cwd);
        const names = new Set(existing.map(e => e.name));
        /* 取不重名的目标名（文件保留扩展名，目录直接加后缀） */
        const uniqueName = (n) => {
          let c = n, i = 1;
          while (names.has(c)) {
            const dot = n.lastIndexOf('.');
            if (dot > 0) c = n.slice(0, dot) + ' (' + (++i) + ')' + n.slice(dot);
            else c = n + ' (' + (++i) + ')';
          }
          return c;
        };
        const writeTree = async (basePath, stripTop) => {
          let count = 0;
          for (const e of entries) {
            let rel = e.name;
            if (stripTop) rel = rel.split('/').slice(1).join('/');
            if (!rel) continue;
            if (e.isDirectory) { await fs.mkdir(this.joinPath(basePath, rel.replace(/\/+$/, ''))); continue; }
            const parts = rel.split('/');
            const fname = parts.pop();
            const parent = parts.join('/');
            if (parent) await fs.mkdir(this.joinPath(basePath, parent));
            await fs.write(this.joinPath(basePath, parent ? parent + '/' + fname : fname), new Blob([e.data]));
            count++;
          }
          return count;
        };
        let count;
        /* 形态判断：单个顶层文件 → 直接释放为文件；顶层唯一目录 → 剥掉该层建同名文件夹；其余 → 建同名文件夹保持原结构 */
        if (files.length === 1 && dirs.length === 0 && files[0].name.indexOf('/') < 0) {
          const destFile = this.joinPath(this.state.cwd, uniqueName(files[0].name));
          await fs.write(destFile, new Blob([files[0].data]));
          count = 1;
        } else {
          const topDirs = new Set(files.map(e => e.name.split('/')[0]));
          let stripTop = false, destName;
          if (topDirs.size === 1 && dirs.every(e => e.name.split('/')[0] === Array.from(topDirs)[0])) {
            stripTop = true;
            destName = uniqueName(Array.from(topDirs)[0]);
          } else {
            destName = uniqueName(name.replace(/\.zip$/i, '') || 'extracted');
          }
          count = await writeTree(this.joinPath(this.state.cwd, destName), stripTop);
        }
        toast('已解压 ' + count + ' 项');
        this.refresh();
      } catch (err) { toast('解压失败：' + err.message); }
    }

    async compressOne(path, entry) {
      const src = entry ? entry.name : (path.split('/').pop() || 'archive');
      const name = src.replace(/\.zip$/i, '') + '.zip';
      try {
        const blob = await NS.core.zip.zipFromFS([path], { FS: fs });
        await fs.write(this.joinPath(this.state.cwd, name), blob);
        toast('已压缩为 ' + name);
        this.refresh();
      } catch (err) { toast('压缩失败：' + err.message); }
    }

    async compressSelected() {
      const sel = this.state.selection;
      if (!sel.length) return;
      try {
        const blob = await NS.core.zip.zipFromFS(sel, { FS: fs });
        const src = sel.length === 1 ? (sel[0].split('/').pop() || 'archive') : 'archive';
        const name = src.replace(/\.zip$/i, '') + '.zip';
        await fs.write(this.joinPath(this.state.cwd, name), blob);
        this.setState({ selection: [], selecting: false });
        toast('已压缩 ' + sel.length + ' 项');
        this.refresh();
      } catch (err) { toast('压缩失败：' + err.message); }
    }

    async importFiles(fileList) {
      if (!fileList || !fileList.length) return;
      const s = this.state;
      let ok = 0, fail = 0;
      const existing = await fs.list(s.cwd);
      const names = new Set(existing.map(e => e.name));
      for (const file of Array.from(fileList)) {
        try {
          let name = file.name;
          if (names.has(name)) {
            const base = name.replace(/\.[^.]+$/, '');
            const ext = name.indexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '';
            let i = 1;
            while (names.has(base + ' (' + i + ')' + ext)) i++;
            name = base + ' (' + i + ')' + ext;
          }
          await fs.write(this.joinPath(s.cwd, name), file);
          names.add(name);
          ok++;
        } catch (err) { fail++; }
      }
      if (ok) toast('已导入 ' + ok + ' 个文件' + (fail ? '，' + fail + ' 个失败' : ''));
      else toast('导入失败');
      this.refresh();
    }

    /* 系统文件拖入 */
    onDragEnter(e) {
      e.preventDefault();
      if (this._dragDepth === undefined) this._dragDepth = 0;
      this._dragDepth++;
      if (this.mainRef) this.mainRef.classList.add('drag-over');
    }
    onDragLeave(e) {
      if (this._dragDepth === undefined) this._dragDepth = 0;
      this._dragDepth--;
      if (this._dragDepth <= 0) {
        this._dragDepth = 0;
        if (this.mainRef) this.mainRef.classList.remove('drag-over');
      }
    }
    onDrop(e) {
      e.preventDefault();
      this._dragDepth = 0;
      if (this.mainRef) this.mainRef.classList.remove('drag-over');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) this.importFiles(files);
    }

    /* 空白区双击 → 新建菜单 */
    onMainPointerUp(e) {
      if (e.target.closest('.fm-item')) return;
      if (e.target.closest('.fm-toolbar')) return;
      if (e.target.closest('.fm-selection-bar')) return;
      const now = Date.now();
      if (this._blankLastTap && now - this._blankLastTap < 300) {
        clearTimeout(this._blankTimer);
        this._blankTimer = null;
        this._blankLastTap = 0;
        this.showBlankMenu(e.clientX, e.clientY);
      } else {
        this._blankLastTap = now;
        clearTimeout(this._blankTimer);
        this._blankTimer = setTimeout(() => { this._blankLastTap = 0; }, 380);
      }
    }

    /* 桌面端：空白区右键直接出新建菜单（免去 300ms 双击判定）；文件项右键由各自 handler 处理 */
    onMainContextMenu(e) {
      if (e.target.closest('.fm-item')) return;
      e.preventDefault();
      e.stopPropagation();
      this._blankLastTap = 0;
      clearTimeout(this._blankTimer);
      this.showBlankMenu(e.clientX, e.clientY);
    }

    showFileMenu(x, y, entry, path) {
      const isDir = entry.kind === 'directory';
      const ext = entry.name.split('.').pop().toLowerCase();
      const items = [];
      if (isDir) items.push({ label: '打开', action: () => this.navigateTo(path) });
      else {
        const openSubs = [{ label: '文本编辑器', action: () => NS.system.winman.openApp('texteditor', { path }) }];
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].indexOf(ext) >= 0) {
          openSubs.unshift({ label: '图片查看器', action: () => NS.system.winman.openApp('imageviewer', { path }) });
        }
        items.push({ label: '打开', children: openSubs });
        items.push({
          label: '导出到本地', action: async () => {
            try {
              const blob = await fs.readBlob(path);
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = entry.name;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
              toast('已导出');
            } catch (err) { toast('导出失败：' + err.message); }
          }
        });
      }
      if (ext === 'zip') {
        items.push({ label: '解压到当前文件夹', action: () => this.extractZip(path) });
      } else {
        items.push({ label: '压缩为 ZIP', action: () => this.compressOne(path, entry) });
      }
      items.push({ label: '重命名', action: () => this.renameEntry(path, entry.name) });
      items.push({ label: '复制', action: () => { this._clipboard = { path, mode: 'copy', name: entry.name }; toast('已复制'); } });
      items.push({ label: '剪切', action: () => { this._clipboard = { path, mode: 'cut', name: entry.name }; toast('已剪切'); } });
      items.push({
        label: '移到废纸篓', danger: true, action: async () => {
          const ok = await NS.apps.trash.trashItem(path, entry.name);
          if (ok) { toast('已移到废纸篓'); this.refresh(); }
          else toast('移入废纸篓失败');
        }
      });
      items.push({
        label: '永久删除', danger: true, action: async () => {
          if (!(await confirmDialog('永久删除「' + entry.name + '」？此操作不可恢复。'))) return;
          try { await fs.remove(path); toast('已删除'); this.refresh(); }
          catch (err) { toast('删除失败：' + err.message); }
        }
      });
      items.push({ sep: true });
      items.push({
        label: '复制路径', action: () => {
          navigator.clipboard.writeText('/' + path).catch(() => {});
          toast('路径已复制');
        }
      });
      items.push({
        label: '属性', action: () => {
          const size = entry.size != null ? formatSize(entry.size) : '—';
          const m = entry.lastModified ? new Date(entry.lastModified).toLocaleString() : '—';
          toast(entry.name + '\n' + size + ' · ' + m, 3000);
        }
      });
      items.push({ sep: true });
      items.push({
        label: '选择', action: () => {
          const sel = this.state.selection.indexOf(path) >= 0 ? this.state.selection : this.state.selection.concat([path]);
          this.setState({ selecting: true, selection: sel });
        }
      });
      Menu.showMenu(x, y, items);
    }

    showBlankMenu(x, y) {
      Menu.showMenu(x, y, [
        {
          label: '新建', children: [
            { label: '文件夹', action: () => this.createFolder() },
            { label: '文本文件 (.txt)', action: () => this.createFile('txt') },
            { label: 'Markdown (.md)', action: () => this.createFile('md') },
            { label: 'HTML 文件', action: () => this.createFile('html') },
            { label: 'JSON 文件', action: () => this.createFile('json') },
            { label: 'JavaScript', action: () => this.createFile('js') },
            { label: 'CSS', action: () => this.createFile('css') },
            { label: 'SVG', action: () => this.createFile('svg') }
          ]
        },
        { label: '导入文件…', action: () => this.fileInputRef && this.fileInputRef.click() },
        {
          label: this._clipboard ? '粘贴「' + this._clipboard.name + '」' : '粘贴',
          disabled: !this._clipboard,
          action: () => this.pasteClipboard()
        },
        { sep: true },
        {
          label: '排序', children: [
            { label: (this.state.sortKey === 'name' ? '✓ ' : '') + '名称', action: () => this.setSort('name', 1) },
            { label: (this.state.sortKey === 'size' ? '✓ ' : '') + '大小', action: () => this.setSort('size', 1) },
            { label: (this.state.sortKey === 'type' ? '✓ ' : '') + '类型', action: () => this.setSort('type', 1) },
            { label: (this.state.sortKey === 'time' ? '✓ ' : '') + '修改时间', action: () => this.setSort('time', -1) }
          ]
        },
        {
          label: '视图', children: [
            { label: (this.state.view === 'grid' ? '✓ ' : '') + '网格', action: () => this.setView('grid') },
            { label: (this.state.view === 'list' ? '✓ ' : '') + '列表', action: () => this.setView('list') }
          ]
        },
        { label: '全选', action: () => this.selectAll() },
        { label: '刷新', action: () => this.refresh() }
      ]);
    }

    setView(v) {
      this.setState({ view: v });
      store.set('files.view', v);
      this.refresh();
    }
    setSort(key, dir) {
      this.setState({ sortKey: key, sortDir: dir });
      this.refresh();
    }
    selectAll() {
      const all = this._entryMap.size ? Array.from(this._entryMap.keys()) : [];
      this.setState({ selecting: true, selection: all });
    }
    cancelSelect() {
      this.setState({ selection: [], selecting: false });
    }

    back() {
      if (this._historyIdx > 0) {
        this._historyIdx--;
        this.navigateTo(this._history[this._historyIdx], false);
      }
    }
    forward() {
      if (this._historyIdx < this._history.length - 1) {
        this._historyIdx++;
        this.navigateTo(this._history[this._historyIdx], false);
      }
    }

    async createFolder() {
      const name = await promptDialog('文件夹名称', '新建文件夹');
      if (!name) return;
      try { await fs.mkdir(this.joinPath(this.state.cwd, name)); toast('已创建'); this.refresh(); }
      catch (err) { toast('创建失败：' + err.message); }
    }
    async createFile(ext) {
      const name = await promptDialog('文件名', '新文件.' + ext);
      if (!name) return;
      try {
        const content = config.FILE_TEMPLATES[ext] || '';
        await fs.write(this.joinPath(this.state.cwd, name), content);
        toast('已创建');
        this.refresh();
      } catch (err) { toast('创建失败：' + err.message); }
    }
    async renameEntry(oldPath, oldName) {
      const name = await promptDialog('重命名', oldName);
      if (!name || name === oldName) return;
      try { await fs.rename(oldPath, this.joinPath(this.state.cwd, name)); toast('已重命名'); this.refresh(); }
      catch (err) { toast('重命名失败：' + err.message); }
    }
    async pasteClipboard() {
      const cb = this._clipboard;
      if (!cb) return;
      try {
        const target = this.joinPath(this.state.cwd, cb.name);
        if (cb.mode === 'copy') {
          const blob = await fs.readBlob(cb.path);
          await fs.write(target, blob);
        } else {
          await fs.rename(cb.path, target);
          this._clipboard = null;
        }
        toast('已粘贴');
        this.refresh();
      } catch (err) { toast('粘贴失败：' + err.message); }
    }
    async deleteSelected() {
      const sel = this.state.selection;
      if (!sel.length) return;
      if (!(await confirmDialog('删除 ' + sel.length + ' 项？'))) return;
      for (const p of sel.slice()) {
        try { await fs.remove(p); } catch (e) {}
      }
      this.setState({ selection: [], selecting: false });
      toast('已删除');
      this.refresh();
    }

    /* ---------- 侧栏 ---------- */
    renderSidebar() {
      const I = NS.render.icons.UI;
      return h('div', null, [
        h('div', { className: 'sidebar-section-title' }, '位置'),
        h('button', { className: 'sidebar-list-item', dataset: { loc: '' }, onclick: () => this.navigateTo('') }, [
          h('span', { className: 'sli-icon', html: I.home }),
          h('span', { className: 'sli-text' }, '根目录')
        ]),
        h('button', { className: 'sidebar-list-item', dataset: { loc: 'Notes' }, onclick: () => this.navigateTo('Notes') }, [
          h('span', { className: 'sli-icon', html: I.note }),
          h('span', { className: 'sli-text' }, '备忘录')
        ]),
        h('button', { className: 'sidebar-list-item', dataset: { loc: 'Downloads' }, onclick: () => this.navigateTo('Downloads') }, [
          h('span', { className: 'sli-icon', html: I.download }),
          h('span', { className: 'sli-text' }, '下载')
        ]),
        h('div', { className: 'sidebar-section-title' }, '快捷操作'),
        h('button', { className: 'sidebar-action-btn', onclick: () => this.fileInputRef && this.fileInputRef.click() }, '导入文件'),
        h('button', { className: 'sidebar-action-btn', style: 'background:var(--bg-input);color:var(--text)', onclick: () => this.createFolder() }, '新建文件夹')
      ]);
    }

    componentDidMount() {
      this.refresh();
    }
  }

  NS.apps.FilesApp = FilesApp;
  NS.apps.buildFiles = (body, sidebar) => new FilesApp().mount(body, sidebar);
})(window);
