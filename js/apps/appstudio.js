/* ============================================================
   Universe OS · 软件层 · appstudio.js
   Universe Studio：Swift Playgrounds 式原生应用开发工具
   M1 · 持久化 + 启动台注册：保存为 /apps/<名>.uapp → 动态注册 → 开机扫描加载
   M2 · 编辑器：行号 + 语法高亮（透明 textarea 叠高亮层）+ 报错定位到行
   M3 · 沙箱运行时 + 四通道调试（见 js/core/sandbox.js）
   M4 · 代码块系统：内置代码块 / 自定义代码块（选中代码存为代码块）插入到光标处
   全手动 DOM 构建（同 terminal.js 先例）：编辑器/预览不进渲染树
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;

  const TEMPLATE = [
    'class HelloApp extends Component {',
    '  constructor(props) {',
    '    super(props);',
    '    this.initialState = { n: 0 };',
    '  }',
    '  render() {',
    "    return h('div', { style: 'padding:20px;' }, [",
    "      h('h1', { style: 'margin:0 0 10px;font-size:20px;' }, '你好，UniverOS'),",
    "      h('p', { style: 'margin:0 0 14px;color:var(--text-dim);' }, '这是你在 Universe Studio 里的第一个应用'),",
    "      h('button', { className: 'as-btn', onclick: () => this.setState({ n: this.state.n + 1 }) },",
    "        '点我 · 已点 ' + this.state.n + ' 次')",
    '    ]);',
    '  }',
    '}'
  ].join('\n');

  /* ---------- M4 · 内置代码块：开发构件（插入 render() 的返回数组中使用） ---------- */
  const BUILTIN_SNIPPETS = [
    {
      name: '按钮组',
      code: [
        '/* 按钮组：主按钮 + 次按钮 */',
        '[',
        "  h('button', { className: 'as-btn', onclick: () => console.log('主操作') }, '主按钮'),",
        "  h('button', { style: 'padding:6px 16px;border:1px solid var(--text-dim);border-radius:8px;background:none;color:var(--text);cursor:pointer;', onclick: () => console.log('次操作') }, '次按钮')",
        '],'
      ].join('\n')
    },
    {
      name: '横向菜单',
      code: [
        '/* 横向菜单：链接导航 */',
        "[",
        "  '首页', '应用', '设置'",
        "].map(t => h('a', { style: 'margin-right:14px;color:var(--text-dim);cursor:pointer;text-decoration:none;',",
        "  onclick: () => console.log('打开 ' + t) }, t)),"
      ].join('\n')
    },
    {
      name: '输入行',
      code: [
        '/* 输入行：输入 + 提交 */',
        '[',
        "  h('input', { placeholder: '输入内容…', style: 'flex:1;' }),",
        "  h('button', { className: 'as-btn', onclick: () => {",
        "    const v = this._root.querySelector('input').value.trim();",
        "    if (v) console.log('提交：' + v);",
        '  } }, \'提交\')',
        '],'
      ].join('\n')
    },
    {
      name: '数据列表',
      code: [
        '/* 数据列表：来自 state.items */',
        '[',
        "  (this.state.items || ['条目一', '条目二']).map(it =>",
        "    h('div', { style: 'padding:6px 8px;border-bottom:1px solid var(--border);' }, it)),",
        ']'
      ].join('\n')
    },
    {
      name: '信息卡片',
      code: [
        '/* 信息卡片 */',
        "h('div', { style: 'border:1px solid var(--border-strong);border-radius:10px;padding:14px;' }, [",
        "  h('div', { style: 'font-weight:600;margin-bottom:6px;' }, '卡片标题'),",
        "  h('div', { style: 'color:var(--text-dim);font-size:12px;line-height:1.6;' }, '卡片描述：放一句说明文字。')",
        ']),'
      ].join('\n')
    },
    {
      name: '状态标签',
      code: [
        '/* 状态标签组 */',
        '[',
        "  { t: '进行中', c: '#ffb340' },",
        "  { t: '已完成', c: '#34c759' },",
        "  { t: '出错', c: '#ff6b61' }",
        "].map(s => h('span', { style: 'display:inline-block;margin-right:6px;padding:2px 10px;border-radius:10px;font-size:11px;color:' + s.c + ';border:1px solid ' + s.c + ';' }, s.t)),"
      ].join('\n')
    }
  ];

  /* ---------- 轻量 JS 语法高亮 ---------- */
  const TOK_RE = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(class)\s+([A-Za-z_$][\w$]*)|\b(class|extends|constructor|super|return|this|new|function|const|let|var|if|else|for|while|typeof|in|of|instanceof|import|export|from|async|await|yield|delete|void|do|switch|case|break|continue|throw|try|catch|finally|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;

  function highlight(src) {
    const esc = String(src).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let out = '', last = 0, m;
    TOK_RE.lastIndex = 0;
    while ((m = TOK_RE.exec(esc))) {
      out += esc.slice(last, m.index);
      if (m[1]) out += '<span class="tok-com">' + m[1] + '</span>';
      else if (m[2]) out += '<span class="tok-str">' + m[2] + '</span>';
      else if (m[3]) out += '<span class="tok-kw">class</span><span class="tok-cls"> ' + m[4] + '</span>';
      else if (m[5]) out += '<span class="tok-kw">' + m[5] + '</span>';
      else if (m[6]) out += '<span class="tok-num">' + m[6] + '</span>';
      last = TOK_RE.lastIndex;
    }
    out += esc.slice(last);
    return out.split('\n').map(l => '<span class="hl-line">' + (l || '') + '</span>').join('\n');
  }

  function escAttr(v) {
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ---------- 语法错误行定位（V8 不给 new Function 的 SyntaxError 行号，自行扫描结构） ---------- */
  /* 语法定位由 js/core/sandbox.js 提供（NS.sandbox.findSyntaxLine） */

  class AppStudioApp extends Component {
    constructor(props) {
      super(props);
      this._ta = null;
      this._nameInput = null;
      this._previewEl = null;
      this._statusText = null;
      this._gutter = null;
      this._hl = null;
      this._mode = 'home';          // home | editor
      this._apps = [];              // {id, name, code}
      this._current = null;         // 当前编辑的应用名
      this._currentId = null;       // 当前编辑的应用 id（保存改名时清理旧注册）
      this._runHandle = null;       // 当前沙箱句柄（kill 用）
      this._selStart = 0;           // M4 · 编辑器光标选区快照（代码块插入点）
      this._selEnd = 0;
      this._snipBtn = null;         // M4 · 代码块面板
      this._snipPanel = null;
    }

    render() { return h('div', { className: 'as' }); }

    componentDidMount() {
      const root = this._root;
      if (!root) return;
      root.innerHTML = '<div class="as-toolbar"></div><div class="as-main"></div><div class="as-status"></div>';
      this._statusText = document.createElement('span');
      this._statusText.className = 'as-status-text as-ok';
      root.querySelector('.as-status').appendChild(this._statusText);
      this._loadApps().then(() => this._buildHome());
    }

    /* ---------- 磁盘加载 ---------- */
    async _loadApps() {
      try {
        const list = await NS.core.fs.list('/apps');
        this._apps = [];
        for (const it of list) {
          if (it.kind !== 'file' || !it.name.endsWith('.uapp')) continue;
          try {
            const blob = await NS.core.fs.readBlob('/apps/' + it.name);
            const def = JSON.parse(await blob.text());
            if (def && typeof def.code === 'string') this._apps.push({ id: def.id || 'userapp-' + def.name, name: def.name, code: def.code });
          } catch (e) { /* 跳过损坏文件 */ }
        }
      } catch (e) { this._apps = []; }
    }

    setStatus(cls, text) {
      if (!this._statusText) return;
      this._statusText.className = 'as-status-text ' + cls;
      this._statusText.textContent = text;
    }

    /* ---------- 工作台主界面 ---------- */
    _buildHome() {
      this._mode = 'home';
      this._closeSnip();
      const root = this._root;
      const bar = root.querySelector('.as-toolbar');
      const main = root.querySelector('.as-main');
      bar.innerHTML = '<span style="flex:1"></span>';
      main.innerHTML = ''
        + '<div class="as-home">'
        +   '<div class="as-hero"><div class="as-hero-sub">在 UniverOS 里制作你自己的原生应用 · 保存后即注册进启动台</div></div>'
        +   '<div class="as-section">'
        +     '<div class="as-sec-title">我的应用</div>'
        +     '<div class="as-apps"></div>'
        +     '<button class="as-new">新建应用</button>'
        +   '</div>'
        + '</div>';
      root.querySelector('.as-new').addEventListener('click', () => this._newApp());
      this._renderCards(main.querySelector('.as-apps'));
      this.setStatus('as-ok', '✓ 就绪 · ' + (this._apps.length > 0 ? this._apps.length + ' 个应用 · ' : '') + '新建或打开一个应用开始开发');
    }

    _renderCards(container) {
      if (this._apps.length === 0) {
        container.innerHTML = '<div class="as-apps-empty">还没有应用 · 点击「新建应用」开始第一个</div>';
        return;
      }
      container.innerHTML = this._apps.map((a, i) =>
        '<div class="as-app-card" data-i="' + i + '">'
        + '<button class="as-card-main">'
        +   '<span class="as-app-name">' + escAttr(a.name) + '</span>'
        +   '<span class="as-app-meta">Component 应用 · 点击打开</span>'
        + '</button>'
        + '<span class="as-card-ops">'
        +   '<button class="as-card-op" data-op="rename">重命名</button>'
        +   '<button class="as-card-op as-card-op-del" data-op="del">删除</button>'
        + '</span>'
        + '</div>'
      ).join('');
      container.querySelectorAll('.as-app-card').forEach(card => {
        const i = Number(card.dataset.i);
        card.querySelector('.as-card-main').addEventListener('click', () => this._openApp(i));
        card.querySelector('[data-op="rename"]').addEventListener('click', () => this._renameApp(i));
        card.querySelector('[data-op="del"]').addEventListener('click', () => this._deleteApp(i));
      });
    }

    /* ---------- 卡片操作 ---------- */
    async _renameApp(i) {
      const app = this._apps[i];
      if (!app) return;
      const name = await NS.render.promptDialog('重命名应用', app.name);
      if (!name || name === app.name) return;
      try {
        NS.apps.compileApp(app.code); /* 代码无需重编译，仅校验有效性 */
        NS.system.winman.wins.slice().forEach(w => { if (w.appId === app.id) NS.system.winman.closeWin(w); });
        await NS.core.fs.remove('/apps/' + app.name + '.uapp');
        const def = { id: 'userapp-' + name, name, code: app.code, updatedAt: Date.now() };
        await NS.core.fs.write('/apps/' + name + '.uapp', new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' }));
        NS.apps.unregisterDynamic(app.id);
        NS.apps.registerDynamic(def);
        NS.system.dock.renderDock();
        NS.system.launcher.renderLauncher();
        NS.render.toast('已重命名为「' + name + '」');
        await this._loadApps();
        this._buildHome();
      } catch (e) {
        NS.render.toast('重命名失败：' + e.message);
      }
    }

    async _deleteApp(i) {
      const app = this._apps[i];
      if (!app) return;
      if (!(await NS.render.confirmDialog('删除「' + app.name + '」？此操作会移除启动台注册。'))) return;
      try {
        NS.system.winman.wins.slice().forEach(w => { if (w.appId === app.id) NS.system.winman.closeWin(w); });
        await NS.core.fs.remove('/apps/' + app.name + '.uapp');
        NS.apps.unregisterDynamic(app.id);
        NS.system.dock.renderDock();
        NS.system.launcher.renderLauncher();
        NS.render.toast('已删除「' + app.name + '」');
        await this._loadApps();
        this._buildHome();
      } catch (e) {
        NS.render.toast('删除失败：' + e.message);
      }
    }

    _newApp() {
      this._current = '我的应用';
      this._currentId = null;
      this._editingCode = TEMPLATE;
      this._buildEditor();
    }

    _openApp(i) {
      const app = this._apps[i];
      if (!app) return;
      this._current = app.name;
      this._currentId = app.id;
      this._editingCode = app.code;
      this._buildEditor();
      this.setStatus('as-ok', '已打开「' + app.name + '」· 修改后点「保存」');
    }

    /* ---------- 编辑器界面 ---------- */
    _buildEditor() {
      this._mode = 'editor';
      const root = this._root;
      const bar = root.querySelector('.as-toolbar');
      const main = root.querySelector('.as-main');
      bar.innerHTML = ''
        + '<input class="as-name" placeholder="应用名称" value="' + escAttr(this._current || '') + '" spellcheck="false">'
        + '<span style="flex:1"></span>'
        + '<button class="as-snip-open">代码块</button>'
        + '<button class="as-back">返回</button>'
        + '<button class="as-run">运行</button>'
        + '<button class="as-save">保存</button>';
      main.innerHTML = ''
        + '<div class="as-pane">'
        +   '<div class="as-pane-head"><span>代码</span><button class="as-reset">重置模板</button></div>'
        +   '<div class="as-codebox">'
        +     '<pre class="as-gutter"></pre>'
        +     '<div class="as-editwrap">'
        +       '<pre class="as-highlight" aria-hidden="true"></pre>'
        +       '<textarea class="as-editor" spellcheck="false"></textarea>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<div class="as-pane">'
        +   '<div class="as-pane-head"><span>实时预览</span><button class="as-debug-toggle">调试</button></div>'
        +   '<div class="as-preview"><div class="as-empty">点击「运行」生成预览</div></div>'
        +   '<div class="as-debug" hidden>'
        +     '<div class="as-debug-head"><span>运行日志</span>'
        +       '<span style="flex:1"></span>'
        +       '<button class="as-debug-clear">清空</button>'
        +       '<button class="as-debug-kill">终止</button></div>'
        +     '<div class="as-debug-list"></div>'
        +   '</div>'
        + '</div>';

      this._ta = main.querySelector('.as-editor');
      this._nameInput = bar.querySelector('.as-name');
      this._previewEl = main.querySelector('.as-preview');
      this._debugBox = main.querySelector('.as-debug');
      this._debugList = main.querySelector('.as-debug-list');
      this._gutter = main.querySelector('.as-gutter');
      this._hl = main.querySelector('.as-highlight');
      this._ta.value = this._editingCode || TEMPLATE;
      this._editingCode = null;

      this._ta.addEventListener('input', () => this._syncEditor());
      this._ta.addEventListener('scroll', () => {
        this._hl.scrollTop = this._ta.scrollTop;
        this._hl.scrollLeft = this._ta.scrollLeft;
        this._gutter.scrollTop = this._ta.scrollTop;
      });
      this._ta.addEventListener('click', () => this._syncSel());
      this._ta.addEventListener('keyup', () => this._syncSel());
      this._ta.addEventListener('mouseup', () => this._syncSel());
      this._snipBtn = bar.querySelector('.as-snip-open');
      if (this._snipBtn) this._snipBtn.addEventListener('click', () => this._toggleSnippets());
      bar.querySelector('.as-back').addEventListener('click', () => this._buildHome());
      bar.querySelector('.as-run').addEventListener('click', () => this.run());
      bar.querySelector('.as-save').addEventListener('click', () => this.save());
      main.querySelector('.as-reset').addEventListener('click', () => this.reset());
      main.querySelector('.as-debug-toggle').addEventListener('click', () => { if (this._debugBox) this._debugBox.hidden = !this._debugBox.hidden; });
      main.querySelector('.as-debug-clear').addEventListener('click', () => { if (this._debugList) this._debugList.innerHTML = ''; });
      main.querySelector('.as-debug-kill').addEventListener('click', () => {
        this._killRun();
        if (this._previewEl) this._previewEl.innerHTML = '<div class="as-empty">已终止 · 点击「运行」重新启动</div>';
        this.setStatus('as-ok', '已终止沙箱运行');
      });
      this._syncEditor();
      this.setStatus('as-ok', '✓ 就绪 · 点击「运行」生成预览');
    }

    /* ---------- 编辑器同步（行号 + 高亮） ---------- */
    _syncEditor() {
      const code = this._ta.value;
      const lines = code.split('\n');
      this._gutter.innerHTML = lines.map((_, i) => '<span>' + (i + 1) + '</span>').join('');
      this._hl.innerHTML = highlight(code);
      this._hl.scrollTop = this._ta.scrollTop;
      this._hl.scrollLeft = this._ta.scrollLeft;
      this._gutter.scrollTop = this._ta.scrollTop;
    }

    /* ---------- M4 · 代码块：内置 + 自定义，插入到光标 ---------- */
    _syncSel() {
      if (!this._ta) return;
      this._selStart = this._ta.selectionStart;
      this._selEnd = this._ta.selectionEnd;
    }

    _customSnippets() {
      const list = NS.core.store.get('appstudio.snippets', []);
      return Array.isArray(list) ? list : [];
    }

    _saveCustomSnippets(list) {
      NS.core.store.set('appstudio.snippets', list.slice());
    }

    _toggleSnippets() {
      if (this._snipPanel) { this._closeSnip(); return; }
      const btn = this._snipBtn;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const panel = NS.render.createElement(NS.render.h('div', { className: 'ctxmenu-popup as-snip' }));
      document.body.appendChild(panel);
      this._snipPanel = panel;
      this._placeSnip(r);
      this._renderSnipPanel();
      this._snipDismiss = e => {
        if (this._snipPanel && !this._snipPanel.contains(e.target)) this._closeSnip();
      };
      setTimeout(() => document.addEventListener('pointerdown', this._snipDismiss, true), 0);
    }

    _placeSnip(r) {
      const panel = this._snipPanel;
      if (!panel) return;
      panel.style.left = '0px'; panel.style.top = '0px';
      const w = panel.offsetWidth, h = panel.offsetHeight;
      let left = r.left, top = r.bottom + 6;
      if (left + w > innerWidth - 8) left = innerWidth - w - 8;
      if (top + h > innerHeight - 8) top = r.top - h - 6;
      panel.style.left = Math.max(8, left) + 'px';
      panel.style.top = Math.max(8, top) + 'px';
    }

    _closeSnip() {
      if (this._snipPanel) { this._snipPanel.remove(); this._snipPanel = null; }
      if (this._snipDismiss) { document.removeEventListener('pointerdown', this._snipDismiss, true); this._snipDismiss = null; }
    }

    _renderSnipPanel() {
      const panel = this._snipPanel;
      if (!panel) return;
      panel.textContent = '';
      const hh = NS.render.h;
      const row = (label, action) => hh('div', { className: 'ctx-item', onclick: action }, label);
      const children = [];
      children.push(hh('div', { className: 'ctx-item disabled as-snip-title' }, '内置代码块'));
      BUILTIN_SNIPPETS.forEach(s => children.push(row(s.name, () => this._insertSnippet(s.code, s.name))));
      children.push(hh('div', { className: 'ctx-sep' }));
      children.push(hh('div', { className: 'ctx-item disabled as-snip-title' }, '我的代码块'));
      const customs = this._customSnippets();
      if (customs.length === 0) {
        children.push(hh('div', { className: 'ctx-item disabled as-snip-hint' }, '还没有 · 选中代码后点「存选中为代码块」'));
      }
      customs.forEach((s, i) => {
        children.push(hh('div', {
          className: 'ctx-item as-snip-row',
          onclick: () => this._insertSnippet(s.code, s.name)
        }, [
          hh('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, s.name),
          hh('span', {
            className: 'as-snip-del',
            onclick: (e) => { e.stopPropagation(); this._deleteCustomSnippet(i); }
          }, '✕')
        ]));
      });
      children.push(hh('div', { className: 'ctx-sep' }));
      children.push(hh('div', {
        className: 'ctx-item as-snip-save',
        onclick: () => this._saveSnippetFromSelection()
      }, '存选中为代码块'));
      children.forEach(c => panel.appendChild(NS.render.createElement(c)));
    }

    _insertSnippet(code, name) {
      if (!this._ta) return;
      const cur = this._ta.value;
      const a = Math.min(this._selStart, this._selEnd, cur.length);
      const b = Math.min(Math.max(this._selStart, this._selEnd), cur.length);
      let ins = code;
      /* 保证代码块与前后代码不粘行（独立 class 声明需要换行分隔） */
      if (a > 0 && !/\n$/.test(cur.slice(0, a))) ins = '\n' + ins;
      if (b < cur.length && !/^\n/.test(cur.slice(b))) ins = ins + '\n';
      const pos = a + ins.length;
      this._ta.focus();
      this._ta.value = cur.slice(0, a) + ins + cur.slice(b);
      this._ta.selectionStart = this._ta.selectionEnd = pos;
      this._selStart = this._selEnd = pos;
      this._syncEditor();
      this.setStatus('as-ok', '已插入代码块「' + (name || '') + '」');
      this._closeSnip();
    }

    async _saveSnippetFromSelection() {
      if (!this._ta) return;
      const cur = this._ta.value;
      const a = Math.min(this._selStart, this._selEnd, cur.length);
      const b = Math.min(Math.max(this._selStart, this._selEnd), cur.length);
      const code = cur.slice(a, b);
      if (!code.trim()) { NS.render.toast('请先在编辑器里选中一段代码'); return; }
      const name = await NS.render.promptDialog('代码块名称', '我的代码块 ' + (this._customSnippets().length + 1));
      if (!name) return;
      const list = this._customSnippets();
      list.push({ name: name, code: code });
      this._saveCustomSnippets(list);
      NS.render.toast('已保存代码块「' + name + '」');
      this._renderSnipPanel();
    }

    async _deleteCustomSnippet(i) {
      const list = this._customSnippets();
      const sn = list[i];
      if (!sn) return;
      if (!(await NS.render.confirmDialog('删除代码块「' + sn.name + '」？'))) return;
      list.splice(i, 1);
      this._saveCustomSnippets(list);
      NS.render.toast('已删除代码块「' + sn.name + '」');
      this._renderSnipPanel();
    }

    _clearErr() {
      const hl = this._hl;
      if (hl) hl.querySelectorAll('.hl-line.err').forEach(el => el.classList.remove('err'));
      const g = this._gutter;
      if (g) g.querySelectorAll('.ln-err').forEach(el => el.classList.remove('ln-err'));
    }

    _showErr(line) {
      this._clearErr();
      if (!line || line < 1) return;
      const hl = this._hl;
      if (hl) {
        const row = hl.querySelectorAll('.hl-line')[line - 1];
        if (row) row.classList.add('err');
      }
      const g = this._gutter;
      if (g) {
        const row = g.querySelectorAll('span')[line - 1];
        if (row) row.classList.add('ln-err');
      }
    }

    _errLine(e, code) {
      const s = String(e.stack || '');
      const m = s.match(/<anonymous>:(\d+):\d+/);
      if (m) {
        /* compileApp 用 new Function('Component','h',...)：函数签名占 2 行，
           stack 行号比编辑器行号多 2（V8 实测校准） */
        const ln = Number(m[1]) - 2;
        return ln >= 1 ? ln : 1;
      }
      if (e instanceof SyntaxError) return NS.sandbox.findSyntaxLine(code) || 1;
      return 0;
    }

    /* ---------- 动作 ---------- */
    run() {
      const code = this._ta ? this._ta.value : TEMPLATE;
      const pv = this._previewEl;
      if (!pv) return;
      this._killRun(); /* 先终止旧沙箱 */
      const self = this;
      const handle = NS.sandbox.mountApp(pv, code, {
        log: (item) => self._pushLog(item.level, item.text),
        error: (item) => {
          self._pushLog('error', (item.line ? '第 ' + item.line + ' 行 · ' : '') + item.text);
          self._showErr(item.line);
        },
        fatal: (item) => {
          const d = document.createElement('div');
          d.className = 'as-error';
          d.textContent = (item.line ? '第 ' + item.line + ' 行 · ' : '') + (item.message || '运行失败');
          pv.textContent = '';
          pv.appendChild(d);
          self.setStatus('as-err', '✕ 第 ' + item.line + ' 行 · ' + item.message);
        }
      }, NS.sandbox.readTheme());
      if (!handle) return;
      this._runHandle = handle;
      this._clearErr();
      this._pushLog('log', '已在沙箱中启动 · ' + (this._current || '应用') + ' · 隔离运行');
      this.setStatus('as-ok', '✓ 沙箱运行中 · 预览已更新 · 日志见下方调试面板');
    }

    _killRun() {
      if (this._runHandle) {
        this._runHandle.kill();
        this._runHandle = null;
      }
    }

    _pushLog(level, text) {
      if (!this._debugList) return;
      if (this._debugList.childNodes.length >= 200) this._debugList.removeChild(this._debugList.firstChild);
      const row = document.createElement('div');
      row.className = 'as-debug-item lv-' + (level === 'error' || level === 'warn' ? level : 'log');
      const tag = document.createElement('span');
      tag.className = 'as-debug-lvl';
      tag.textContent = level === 'error' ? '✕' : level === 'warn' ? '!' : '·';
      row.appendChild(tag);
      row.appendChild(document.createTextNode(' ' + String(text)));
      this._debugList.appendChild(row);
      this._debugList.scrollTop = this._debugList.scrollHeight;
    }

    async save() {
      const name = (this._nameInput ? this._nameInput.value.trim() : '') || '我的应用';
      const code = this._ta ? this._ta.value : TEMPLATE;
      if (!code.trim()) { NS.render.toast('代码为空，先写点东西再保存'); return; }
      try { NS.apps.compileApp(code); }
      catch (e) { NS.render.toast('语法错误，无法保存：' + e.message); this.setStatus('as-err', '✕ 第 ' + this._errLine(e, code) + ' 行 · ' + e.message); return; }
      const oldId = this._currentId;
      const id = 'userapp-' + name;
      const def = { id, name, code, updatedAt: Date.now() };
      try {
        /* 改名时清理旧注册与旧文件 */
        if (oldId && oldId !== id) {
          NS.apps.unregisterDynamic(oldId);
          try { await NS.core.fs.remove('/apps/' + this._current + '.uapp'); } catch (e2) {}
        }
        await NS.core.fs.write('/apps/' + name + '.uapp', new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' }));
        NS.apps.registerDynamic(def);
        NS.system.dock.renderDock();
        NS.system.launcher.renderLauncher();
        NS.render.toast('已保存「' + name + '」并注册进启动台');
        await this._loadApps();
        this._buildHome();
      } catch (e) {
        NS.render.toast('保存失败：' + e.message);
      }
    }

    reset() {
      this._killRun();
      if (this._debugList) this._debugList.innerHTML = '';
      if (this._ta) { this._ta.value = TEMPLATE; this._syncEditor(); }
      if (this._previewEl) this._previewEl.innerHTML = '<div class="as-empty">点击「运行」生成预览</div>';
      this._clearErr();
      this.setStatus('as-ok', '✓ 就绪 · 点击「运行」生成预览');
    }

    componentWillUnmount() {
      this._killRun();
      this._ta = this._nameInput = this._previewEl = this._statusText = this._gutter = this._hl = this._debugList = this._debugBox = null;
    }
  }

  NS.apps.AppStudioApp = AppStudioApp;
  NS.apps.buildAppStudio = body => new AppStudioApp().mount(body);
})(window);
