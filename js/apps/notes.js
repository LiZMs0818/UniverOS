/* ============================================================
   Universe OS · 软件层 · notes.js
   备忘录（声明式 Component）：笔记列表/搜索/新建/删除/导出、
   Markdown 标题、绘画模式（canvas 画/橡皮/调色/撤销/保存）、
   自动保存 400ms 防抖
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const { fs } = NS.core;
  const { store } = NS.core;
  const { $, $$, escapeHtml, formatSize, blobToDataURL } = NS.core.utils;
  const { toast, confirmDialog, menu: Menu } = NS.render;

  const NOTES_DIR = 'Notes';

  class NotesApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = {
        list: [], active: null, query: '', mode: 'write', ready: false
      };
      this._meta = {};
      this._saveTimer = null;
      this._draw = null;
      this.taRef = null;
      this.bodyRef = null;
      this.sidebarRef = null;
      this.editorRef = null;
    }

    /* ---------- 数据 ---------- */
    async loadList() {
      let entries = [];
      try { entries = await fs.list(NOTES_DIR); } catch (e) { entries = []; }
      this._meta = {};
      for (const e of entries) {
        const k = NOTES_DIR + '/' + e.name;
        this._meta[k] = {
          name: e.name,
          isPng: e.name.toLowerCase().endsWith('.png'),
          size: e.size,
          lastModified: e.lastModified
        };
      }
      this.setState({ list: entries, ready: true });
      return entries;
    }

    async select(name) {
      if (this.state.active) await this.save();
      if (!name) { this.setState({ active: null, mode: 'write' }); return; }
      const key = NOTES_DIR + '/' + name;
      const isPng = this._meta[key] && this._meta[key].isPng;
      this.setState({ active: name, mode: isPng ? 'draw' : 'write' });
      try {
        const content = await fs.read(key);
        const raw = content != null ? String(content) : '';
        const title = isPng ? name.replace(/\.png$/i, '') : this.titleOf(raw);
        this.setState({ active: name, title, content: raw, ready: true });
      } catch (err) {
        this.setState({ title: name, content: '', ready: true });
      }
    }

    titleOf(raw) {
      const first = String(raw).split('\n').find(l => l.trim().startsWith('# '));
      if (first) return first.trim().replace(/^#\s+/, '');
      return '未命名';
    }

    async save() {
      const s = this.state;
      if (!s.active) return;
      const key = NOTES_DIR + '/' + s.active;
      try {
        if (s.mode === 'draw') {
          if (this._draw && this._draw.dirty) {
            const dataURL = this._draw.canvas.toDataURL('image/png');
            await fs.write(key, dataURL);
            this._draw.dirty = false;
            toast('绘画已保存');
          }
        } else {
          let content = this.taRef ? this.taRef.value : (s.content || '');
          const first = String(content).split('\n')[0];
          if (s.title && !first.trim().startsWith('# ')) {
            content = '# ' + s.title + '\n\n' + content;
          }
          await fs.write(key, content);
          toast('已保存');
        }
        await this.loadList();
        this.renderSidebar();
      } catch (err) {
        toast('保存失败：' + err.message);
      }
    }

    /* ---------- 渲染 ---------- */
    render() {
      const s = this.state;
      const draw = s.mode === 'draw';
      return h('div', { className: 'notes' }, [
        h('div', { className: 'notes-main' }, [
          h('input', {
            className: 'note-title' + (draw ? ' hide' : ''),
            value: s.title || '', placeholder: '标题',
            oninput: e => this.setState({ title: e.target.value })
          }),
          h('textarea', {
            className: 'note-body' + (draw ? ' hide' : ''),
            placeholder: '开始输入…', spellcheck: 'false',
            ref: el => (this.taRef = el), value: s.content || '',
            oninput: () => this.scheduleSave(),
            onkeydown: e => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.save();
              }
            }
          }),
          h('div', { className: 'notes-draw' + (draw ? ' on' : '') }, [
            this.renderDrawToolbar(),
            h('div', { className: 'draw-canvas-wrap', ref: el => (this._canvasWrap = el) }, [
              h('canvas', { className: 'draw-canvas', ref: el => (this._canvasEl = el) })
            ]),
            h('div', { className: 'draw-status' }, '拖动绘制 · 保存后可在文件应用查看')
          ])
        ])
      ]);
    }

    renderDrawToolbar() {
      const I = NS.render.icons.UI;
      const colors = ['#000000', '#ff3b30', '#34c759', '#0a84ff'];
      const cur = this._drawColor || '#000000';
      const size = this._drawSize || 3;
      const isPen = this._drawTool !== 'eraser';
      return h('div', { className: 'draw-toolbar' }, [
        h('button', {
          className: 'mini-btn' + (isPen ? ' primary' : ''), dataset: { drawTool: 'pen' },
          onclick: () => this.setTool('pen')
        }, [h('span', { className: 'tb-ic', html: I.pen }), ' 画笔']),
        h('button', {
          className: 'mini-btn' + (this._drawTool === 'eraser' ? ' primary' : ''), dataset: { drawTool: 'eraser' },
          onclick: () => this.setTool('eraser')
        }, [h('span', { className: 'tb-ic', html: I.eraser }), ' 橡皮']),
        colors.map(c => h('input', {
          type: 'color', className: 'draw-color' + (cur === c ? ' active' : ''),
          value: c, dataset: { drawColor: c }, onclick: () => this.setColor(c)
        })),
        h('div', { className: 'draw-size' }, [
          h('span', null, '粗细'),
          h('input', {
            type: 'range', min: '1', max: '20', step: '1', value: String(size),
            oninput: e => this.setSize(+e.target.value)
          }),
          h('span', null, String(size))
        ]),
        h('button', { className: 'mini-btn', onclick: () => this.undoDraw() },
          [h('span', { className: 'tb-ic', html: I.undo }), ' 撤销']),
        h('button', { className: 'mini-btn', onclick: () => this.clearDraw() }, '清空'),
        h('button', { className: 'mini-btn primary', onclick: () => this.save() }, '保存')
      ]);
    }

    renderSidebar() {
      const s = this.state;
      const I = NS.render.icons.UI;
      const q = s.query.trim().toLowerCase();
      const list = s.list.filter(e => !q || e.name.toLowerCase().indexOf(q) >= 0);
      const act = (icon, label, fn) => h('button', { className: 'sidebar-action-btn', onclick: fn }, [
        h('span', { className: 'sli-icon', html: icon }),
        h('span', { className: 'sli-text' }, label)
      ]);
      return h('div', null, [
        h('div', { className: 'sidebar-section-title' }, '备忘录'),
        h('input', {
          className: 'notes-search', placeholder: '搜索笔记…', value: s.query,
          oninput: e => this.setState({ query: e.target.value })
        }),
        act(I.doc, '新建文本', () => this.newNote()),
        act(I.pen, '新建绘画', () => this.newDrawNote()),
        act(I.import, '导入', () => this.importNote()),
        !list.length
          ? h('div', { className: 'sidebar-empty' }, q ? '没有匹配的笔记' : '还没有笔记')
          : h('div', null, list.map(e => {
              const key = NOTES_DIR + '/' + e.name;
              const isPng = (this._meta[key] && this._meta[key].isPng) || e.name.toLowerCase().endsWith('.png');
              const active = e.name === s.active;
              const display = e.name.replace(/\.(md|txt|png)$/i, '');
              return h('button', {
                className: 'sidebar-list-item' + (active ? ' active' : ''),
                dataset: { name: e.name },
                onclick: () => this.select(e.name),
                oncontextmenu: ev => this.onItemContextMenu(ev, e.name)
              }, [
                h('span', { className: 'sli-icon', html: isPng ? I.pen : I.doc }),
                h('span', { className: 'sli-text' }, escapeHtml(display)),
                h('span', { className: 'sli-meta' }, e.size != null ? formatSize(e.size) : '')
              ]);
            }))
      ]);
    }

    onItemContextMenu(e, name) {
      e.preventDefault();
      e.stopPropagation();
      Menu.showMenu(e.clientX, e.clientY, [
        { label: '打开', action: () => this.select(name) },
        { sep: true },
        { label: '删除', danger: true, action: () => this.deleteNote(name) }
      ]);
    }

    componentDidUpdate() {
      if (this._canvasWrap && this.state.mode === 'draw') {
        this.initDrawCanvas(this.state.content);
      }
    }

    /* ---------- 操作 ---------- */
    async newNote() {
      if (this.state.active) await this.save();
      let base = '未命名笔记';
      let i = 1;
      while (this._meta[NOTES_DIR + '/' + base + '.md']) { base = '未命名笔记 ' + i; i++; }
      try {
        await fs.write(NOTES_DIR + '/' + base + '.md', '# ' + base + '\n\n');
        await this.loadList();
        await this.select(base + '.md');
        setTimeout(() => { if (this.taRef) this.taRef.focus(); }, 120);
      } catch (err) {
        toast('创建失败：' + err.message);
      }
    }

    async newDrawNote() {
      if (this.state.active) await this.save();
      const name = 'draw-' + Date.now() + '.png';
      try {
        await fs.write(NOTES_DIR + '/' + name, '');
        await this.loadList();
        await this.select(name);
      } catch (err) {
        toast('创建失败：' + err.message);
      }
    }

    importNote() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.png';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const ext = f.name.toLowerCase().endsWith('.png') ? 'png' : 'md';
        const isPng = ext === 'png';
        const reader = new FileReader();
        reader.onload = async () => {
          let target = f.name;
          if (!target.toLowerCase().endsWith('.' + ext)) target = target + '.' + ext;
          if (this._meta[NOTES_DIR + '/' + target]) {
            const base = target.replace(/\.\w+$/, '');
            let i = 1;
            while (this._meta[NOTES_DIR + '/' + base + ' (' + i + ').' + ext]) i++;
            target = base + ' (' + i + ').' + ext;
          }
          try {
            await fs.write(NOTES_DIR + '/' + target, isPng ? reader.result : String(reader.result));
            await this.loadList();
            await this.select(target);
            toast('已导入');
          } catch (err) { toast('导入失败：' + err.message); }
        };
        if (isPng) reader.readAsDataURL(f);
        else reader.readAsText(f);
      };
      input.click();
    }

    async deleteNote(name) {
      const s = this.state;
      const target = name || s.active;
      if (!target) return;
      if (!(await confirmDialog('删除「' + target + '」？'))) return;
      try {
        await fs.remove(NOTES_DIR + '/' + target);
        if (target === s.active) this.setState({ active: null, mode: 'write', title: '', content: '' });
        await this.loadList();
        toast('已删除');
      } catch (err) {
        toast('删除失败：' + err.message);
      }
    }

    setTool(tool) {
      this._drawTool = tool;
      this.setState({});
      if (this._draw) {
        this._draw.strokeStyle = tool === 'eraser' ? '#ffffff' : (this._drawColor || '#000000');
        this._draw.lineWidth = tool === 'eraser' ? (this._drawSize || 3) * 3 : (this._drawSize || 3);
      }
    }

    scheduleSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.save(), 400);
    }

    /* ---------- 绘画 ---------- */
    setColor(c) {
      this._drawColor = c;
      this._drawTool = 'pen';
      store.set('draw.color', c);
      this.setState({});
      if (this._draw) {
        this._draw.strokeStyle = c;
        this._draw.lineWidth = this._drawSize || 3;
      }
    }
    setSize(sz) {
      this._drawSize = sz;
      store.set('draw.size', sz);
      this.setState({});
      if (this._draw) {
        this._draw.lineWidth = this._drawTool === 'eraser' ? sz * 3 : sz;
      }
    }

    initDrawCanvas(dataURL) {
      const canvas = this._canvasEl, wrap = this._canvasWrap;
      if (!canvas || !wrap) return;
      const defaultColor = store.get('draw.color', '#000000');
      const defaultSize = store.get('draw.size', 3);
      this._drawColor = defaultColor;
      this._drawSize = defaultSize;
      this._drawTool = 'pen';
      const ctx = canvas.getContext('2d');
      const setup = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, wrap.clientWidth) * dpr;
        canvas.height = Math.max(1, wrap.clientHeight) * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, wrap.clientWidth, wrap.clientHeight);
        ctx.strokeStyle = defaultColor;
        ctx.lineWidth = defaultSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      };
      if (!dataURL) {
        setup();
        if (!this._draw) this._bindDraw(canvas, ctx);
        this._draw.dirty = false;
        return;
      }
      const img = new Image();
      img.onload = () => {
        setup();
        ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
        if (!this._draw) this._bindDraw(canvas, ctx);
        this._draw.dirty = false;
      };
      img.src = dataURL;
    }

    _bindDraw(canvas, ctx) {
      this._draw = {
        canvas, ctx,
        drawing: false,
        undoStack: [],
        dirty: false,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth
      };
      const getPos = e => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        this._draw.drawing = true;
        this._draw.dirty = true;
        this._draw.undoStack.push(canvas.toDataURL());
        if (this._draw.undoStack.length > 30) this._draw.undoStack.shift();
        const p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        this._draw.last = p;
      });
      canvas.addEventListener('pointermove', e => {
        if (!this._draw.drawing) return;
        const p = getPos(e);
        ctx.strokeStyle = this._drawTool === 'eraser' ? '#ffffff' : (this._drawColor || '#000000');
        ctx.lineWidth = this._drawTool === 'eraser' ? (this._drawSize || 3) * 3 : (this._drawSize || 3);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
      canvas.addEventListener('pointerup', () => {
        this._draw.drawing = false;
        this._draw.dirty = true;
        this.scheduleSave();
      });
      canvas.addEventListener('pointercancel', () => { this._draw.drawing = false; });
    }

    undoDraw() {
      if (!this._draw || !this._draw.undoStack.length) return;
      const last = this._draw.undoStack.pop();
      const img = new Image();
      img.onload = () => {
        this._draw.ctx.fillStyle = '#ffffff';
        this._draw.ctx.fillRect(0, 0, this._canvasWrap.clientWidth, this._canvasWrap.clientHeight);
        this._draw.ctx.drawImage(img, 0, 0, this._canvasWrap.clientWidth, this._canvasWrap.clientHeight);
        this._draw.dirty = true;
      };
      img.src = last;
    }

    clearDraw() {
      if (!this._draw) return;
      const c = this._draw.canvas;
      const ctx = this._draw.ctx;
      this._draw.undoStack.push(c.toDataURL());
      if (this._draw.undoStack.length > 30) this._draw.undoStack.shift();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this._canvasWrap.clientWidth, this._canvasWrap.clientHeight);
      this._draw.dirty = true;
    }

    componentDidMount() {
      this.loadList().then(entries => {
        if (entries.length) this.select(entries[0].name);
        else this.newNote();
      });
    }
  }

  NS.apps.NotesApp = NotesApp;
  NS.apps.buildNotes = (body, sidebar) => new NotesApp().mount(body, sidebar);
})(window);
