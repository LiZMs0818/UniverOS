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
    "      h('div', { style: 'display:flex;gap:10px;' }, [",
    "        h('button', { className: 'as-btn', onclick: () => this.setState({ n: this.state.n + 1 }) },",
    "          '点我 · 已点 ' + this.state.n + ' 次'),",
    "        h('button', { onclick: () => { if (typeof navigate === 'function') navigate('页面2'); } }, '打开页面2')",
    "      ])",
    '    ]);',
    '  }',
    '}'
  ].join('\n');

  /* M5 · 新增页面模板：演示 navigate 页面跳转（navigate 由多页运行时注入） */
  const PAGE_TEMPLATE = [
    'class Page2 extends Component {',
    '  constructor(props) {',
    '    super(props);',
    '  }',
    '  render() {',
    "    return h('div', { style: 'padding:20px;' }, [",
    "      h('h1', { style: 'margin:0 0 12px;font-size:20px;' }, '新页面'),",
    "      h('p', { style: 'margin:0 0 14px;color:var(--text-dim);' }, '这是应用的第二个页面'),",
    "      h('button', { className: 'as-btn', onclick: () => { if (typeof navigate === 'function') navigate('页面1'); } }, '回到首页')",
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
    return out.split('\n').map(l => '<span class="hl-line">' + (l || '') + '</span>').join('');
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
      this._statusText = null;
      this._gutter = null;
      this._hl = null;
      this._mode = 'home';          // home | editor
      this._apps = [];              // {id, name, pages:[{id,name,code}], startPageId}
      this._current = null;         // 当前编辑的应用名
      this._currentId = null;       // 当前编辑的应用 id（保存改名时清理旧注册）
      this._pages = [];             // M5 · 当前应用的页面数组
      this._curPage = null;         // M5 · 当前编辑的页面对象
      this._startPageId = null;     // M5 · 开始页 id
      this._pageMenu = null;        // M5 · 页面标签的右键菜单
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
            if (!def) continue;
            if (Array.isArray(def.pages) && def.pages.length) {
              /* M5 · 多页面格式（v2）；M6 · 页面可带 mode/ui（可视化构建器） */
              this._apps.push({
                id: def.id || 'userapp-' + def.name,
                name: def.name,
                pages: def.pages.map(p => ({
                  id: p.id, name: p.name, code: p.code,
                  mode: p.mode === 'ui' ? 'ui' : 'code',
                  ui: Array.isArray(p.ui) ? p.ui : []
                })),
                startPageId: def.startPageId || def.pages[0].id
              });
            } else if (typeof def.code === 'string') {
              /* 旧单页格式：迁移为单页面结构 */
              this._apps.push({
                id: def.id || 'userapp-' + def.name,
                name: def.name,
                pages: [{ id: 'p1', name: '页面1', code: def.code, mode: 'code', ui: [] }],
                startPageId: 'p1'
              });
            }
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
      this._closePageMenu();
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
        +   '<span class="as-app-meta">' + (a.pages.length > 1 ? a.pages.length + ' 页面 · ' : '') + 'Component 应用 · 点击打开</span>'
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
        app.pages.forEach(p => NS.apps.compileApp(p.code)); /* 逐页校验有效性 */
        NS.system.winman.wins.slice().forEach(w => { if (w.appId === app.id) NS.system.winman.closeWin(w); });
        await NS.core.fs.remove('/apps/' + app.name + '.uapp');
        const def = {
          id: 'userapp-' + name, name, v: 2,
          pages: app.pages.map(p => ({
            id: p.id, name: p.name, code: p.code,
            mode: p.mode === 'ui' ? 'ui' : 'code',
            ui: Array.isArray(p.ui) ? p.ui : []
          })),
          startPageId: app.startPageId, updatedAt: Date.now()
        };
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
      this._pages = [{ id: 'p1', name: '页面1', code: TEMPLATE, mode: 'code', ui: [] }];
      this._startPageId = 'p1';
      this._curPage = this._pages[0];
      this._buildEditor();
    }

    _openApp(i) {
      const app = this._apps[i];
      if (!app) return;
      this._current = app.name;
      this._currentId = app.id;
      this._pages = app.pages.map(p => {
        const pg = {
          id: p.id, name: p.name, code: p.code,
          mode: p.mode === 'ui' ? 'ui' : 'code',
          ui: Array.isArray(p.ui) ? p.ui : []
        };
        if (pg.mode === 'ui') {
          const parsed = NS.apps.appstudioUI.parseCode(pg.code || '');
          if (parsed.ok) {
            pg.uiSrc = parsed.uiSrc;
            if (!pg.ui.length) pg.ui = parsed.nodes;
          }
        }
        return pg;
      });
      this._startPageId = app.startPageId || this._pages[0].id;
      this._curPage = this._pages.find(p => p.id === this._startPageId) || this._pages[0];
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
        + '<div class="as-modes">'
        +   '<button class="as-mode" data-mode="code">代码</button>'
        +   '<button class="as-mode" data-mode="ui">可视化</button>'
        + '</div>'
        + '<span style="flex:1"></span>'
        + '<button class="as-snip-open">代码块</button>'
        + '<button class="as-back">返回</button>'
        + '<button class="as-run">运行</button>'
        + '<button class="as-save">保存</button>';
      main.innerHTML = ''
        + '<div class="as-pagetabs"></div>'
        + '<div class="as-codebox">'
        +   '<pre class="as-gutter"></pre>'
        +   '<div class="as-editwrap">'
        +     '<pre class="as-highlight" aria-hidden="true"></pre>'
        +     '<textarea class="as-editor" spellcheck="false" wrap="off"></textarea>'
        +   '</div>'
        + '</div>'
        + '<div class="as-ub"></div>';

      this._ta = main.querySelector('.as-editor');
      this._nameInput = bar.querySelector('.as-name');
      this._gutter = main.querySelector('.as-gutter');
      this._hl = main.querySelector('.as-highlight');
      this._tabsEl = main.querySelector('.as-pagetabs');
      this._ta.value = (this._curPage ? this._curPage.code : TEMPLATE);

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
      bar.querySelectorAll('.as-mode').forEach(btn => {
        btn.addEventListener('click', () => this._setPageMode(btn.dataset.mode));
      });
      bar.querySelector('.as-back').addEventListener('click', () => this._buildHome());
      bar.querySelector('.as-run').addEventListener('click', () => this.run());
      bar.querySelector('.as-save').addEventListener('click', () => this.save());
      this._renderPageTabs();
      this._applyMode();
    }

    /* ---------- M6 · 页面模式：代码 / 可视化 ---------- */
    async _setPageMode(mode) {
      const page = this._curPage;
      if (!page || page.mode === mode) return;
      this._syncCurrentPage();
      if (mode === 'ui') {
        /* 反向读回：把 render() 里的 h(...) 变成组件树，读不出的片段原样保留，
           不清空、不弹确认框，代码只在被改动时才重排 */
        const parsed = NS.apps.appstudioUI.parseCode(page.code || '');
        if (!parsed.ok) {
          NS.render.toast('这页代码暂时读不回画布：' + (parsed.reason || '结构不识别') + '（代码没动）');
          this.setStatus('as-err', '✕ 无法读回画布 · 代码保持原样');
          return;
        }
        page.ui = parsed.nodes;
        page.uiSrc = parsed.uiSrc;
        page.mode = 'ui';
      } else {
        page.mode = 'code';
      }
      this._applyMode();
      this._renderPageTabs();
      const rawCount = page.mode === 'ui' ? page.ui.filter(n => n.type === 'raw').length : 0;
      this.setStatus('as-ok', mode === 'ui'
        ? ('可视化模式 · ' + page.ui.length + ' 个组件' + (rawCount ? ' · ' + rawCount + ' 段原代码保留' : ''))
        : ('代码模式 · 页面「' + page.name + '」'));
    }

    /* 按当前页模式切换主区，并挂载可视化构建器 */
    _applyMode() {
      const page = this._curPage;
      if (!page || !this._root) return;
      const mode = page.mode === 'ui' ? 'ui' : 'code';
      const codebox = this._root.querySelector('.as-codebox');
      const ubBox = this._root.querySelector('.as-ub');
      const snipBtn = this._root.querySelector('.as-snip-open');
      const holders = this._root.querySelectorAll('.as-mode');
      holders.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      if (codebox) codebox.style.display = mode === 'ui' ? 'none' : 'flex';
      if (ubBox) ubBox.style.display = mode === 'ui' ? 'flex' : 'none';
      if (snipBtn) snipBtn.style.display = mode === 'ui' ? 'none' : '';
      this._ubHandle = null;
      if (mode === 'ui') {
        if (!page.uiSrc) {
          const parsed = NS.apps.appstudioUI.parseCode(page.code || '');
          if (parsed.ok) page.uiSrc = parsed.uiSrc;
        }
        page.code = NS.apps.appstudioUI.genCode(page);
        if (this._ta) { this._ta.readOnly = true; this._ta.value = page.code; }
        this._syncEditor();
        if (ubBox) {
          this._ubHandle = NS.apps.appstudioUI.mount(ubBox, {
            page: page,
            pages: this._pages,
            onChange: (p) => {
              if (this._ta) { this._ta.value = p.code; }
              this._syncEditor();
              this.setStatus('as-ok', '✓ 已更新「' + p.name + '」· 点「运行」看效果');
            }
          });
        }
      } else {
        if (this._ta) {
          this._ta.readOnly = false;
          this._ta.value = page.code;
          this._syncEditor();
        }
      }
    }

    /* ---------- M5 · 页面标签栏 ---------- */
    _syncCurrentPage() {
      if (this._ta && this._curPage && this._curPage.mode !== 'ui') this._curPage.code = this._ta.value;
    }

    _renderPageTabs() {
      const box = this._tabsEl;
      if (!box) return;
      box.innerHTML = this._pages.map(p =>
        '<div class="as-ptab' + (p.id === this._curPage.id ? ' active' : '') + '" data-pid="' + escAttr(p.id) + '">'
        + (p.id === this._startPageId ? '<span class="as-ptab-dot" title="开始页"></span>' : '')
        + '<span class="as-ptab-name">' + escAttr(p.name) + '</span>'
        + '</div>'
      ).join('') + '<button class="as-ptab-add" title="新建页面">+</button>';
      box.querySelectorAll('.as-ptab').forEach(tab => {
        const pid = tab.dataset.pid;
        tab.addEventListener('click', () => {
          if (this._lpAt && Date.now() - this._lpAt < 700) return; /* 长按已弹菜单，不再切页 */
          this._switchPage(pid);
        });
        /* 桌面右键 / 移动长按 → 页面操作菜单 */
        tab.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (this._lpAt && Date.now() - this._lpAt < 700) return;
          this._openPageMenu(tab, pid, e.clientX, e.clientY);
        });
        tab.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse') return;
          this._clearLp();
          this._lpStart = { x: e.clientX, y: e.clientY };
          this._lpTimer = setTimeout(() => {
            this._lpTimer = null;
            this._lpAt = Date.now();
            this._openPageMenu(tab, pid, this._lpStart.x, this._lpStart.y);
          }, 480);
        });
        tab.addEventListener('pointermove', (e) => {
          if (!this._lpTimer || !this._lpStart) return;
          if (Math.abs(e.clientX - this._lpStart.x) > 10 || Math.abs(e.clientY - this._lpStart.y) > 10) this._clearLp();
        });
        tab.addEventListener('pointerup', () => this._clearLp());
        tab.addEventListener('pointercancel', () => this._clearLp());
        tab.addEventListener('pointerleave', () => this._clearLp());
      });
      box.querySelector('.as-ptab-add').addEventListener('click', () => this._addPage());
    }

    _clearLp() {
      if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
    }

    _switchPage(pid) {
      if (this._curPage.id === pid) return;
      const target = this._pages.find(p => p.id === pid);
      if (!target) return;
      this._syncCurrentPage();
      this._curPage = target;
      this._applyMode();
      this._renderPageTabs();
      this.setStatus('as-ok', '已切换到页面「' + target.name + '」');
    }

    async _addPage() {
      const defaultName = '页面' + (this._pages.length + 1);
      const name = await NS.render.promptDialog('新页面名称', defaultName);
      if (!name) return;
      if (this._pages.some(p => p.name === name)) { NS.render.toast('已存在同名页面'); return; }
      const id = 'p' + Date.now().toString(36);
      const mode = (this._curPage && this._curPage.mode === 'ui') ? 'ui' : 'code';
      const page = { id, name, code: PAGE_TEMPLATE, mode: mode, ui: [] };
      if (mode === 'ui') page.code = NS.apps.appstudioUI.genCode(page);
      this._syncCurrentPage();
      this._pages.push(page);
      this._curPage = page;
      this._applyMode();
      this._renderPageTabs();
      this.setStatus('as-ok', '已新建页面「' + name + '」' + (mode === 'ui' ? ' · 空画布，从左侧加组件' : ' · 点「运行」可测试页面跳转'));
    }

    async _renamePage(pid) {
      const page = this._pages.find(p => p.id === pid);
      if (!page) return;
      const name = await NS.render.promptDialog('重命名页面', page.name);
      if (!name || name === page.name) return;
      if (this._pages.some(p => p.name === name && p.id !== pid)) { NS.render.toast('已存在同名页面'); return; }
      /* 同步改写其它页面里的跳转代码，避免改名后 navigate('旧名') 失效 */
      let patched = 0;
      const oldKeys = ["navigate('" + page.name + "'", 'navigate("' + page.name + '"'];
      const newVals = ["navigate('" + name + "'", 'navigate("' + name + '"'];
      this._syncCurrentPage();
      this._pages.forEach(p => {
        oldKeys.forEach((k, ki) => {
          if (p.code.indexOf(k) >= 0) { p.code = p.code.split(k).join(newVals[ki]); patched++; }
        });
      });
      page.name = name;
      if (this._curPage.id === pid) this._applyMode();
      this._renderPageTabs();
      this.setStatus('as-ok', '页面已重命名为「' + name + '」' + (patched ? ' · 已同步跳转代码' : ''));
    }

    _setStartPage(pid) {
      const page = this._pages.find(p => p.id === pid);
      if (!page) return;
      this._startPageId = pid;
      this._renderPageTabs();
      this.setStatus('as-ok', '开始页已设为「' + page.name + '」');
    }

    async _deletePage(pid) {
      if (this._pages.length <= 1) { NS.render.toast('至少保留一个页面'); return; }
      const page = this._pages.find(p => p.id === pid);
      if (!page) return;
      if (!(await NS.render.confirmDialog('删除页面「' + page.name + '」？'))) return;
      const idx = this._pages.indexOf(page);
      this._pages.splice(idx, 1);
      if (this._startPageId === pid) this._startPageId = this._pages[0].id;
      if (this._curPage.id === pid) {
        this._curPage = this._pages[Math.max(0, idx - 1)];
        this._ta.value = this._curPage.code;
        this._syncEditor();
      }
      this._renderPageTabs();
      this.setStatus('as-ok', '已删除页面「' + page.name + '」');
    }

    /* 页面操作菜单（复用系统 ctxmenu-popup）；x/y 为指针位置，缺省时贴标签右下角 */
    _openPageMenu(btn, pid, x, y) {
      this._closePageMenu();
      const r = btn.getBoundingClientRect();
      const menu = NS.render.createElement(NS.render.h('div', { className: 'ctxmenu-popup as-pagemenu' }));
      document.body.appendChild(menu);
      this._pageMenu = menu;
      const items = [
        ['重命名页面', () => this._renamePage(pid)],
        ['设为开始页', () => this._setStartPage(pid)],
        ['删除页面', () => this._deletePage(pid)]
      ];
      items.forEach(([label, action]) => {
        const row = NS.render.createElement(NS.render.h('div', {
          className: 'ctx-item' + (label === '删除页面' ? ' as-pagemenu-del' : ''),
          onclick: action
        }, label));
        menu.appendChild(row);
      });
      menu.style.left = '0px'; menu.style.top = '0px';
      const w = menu.offsetWidth, h = menu.offsetHeight;
      let left = (typeof x === 'number') ? x : r.left;
      let top = (typeof y === 'number') ? y + 6 : r.bottom + 4;
      if (left + w > innerWidth - 8) left = innerWidth - w - 8;
      if (top + h > innerHeight - 8) top = ((typeof y === 'number') ? y : r.top) - h - 6;
      menu.style.left = Math.max(8, left) + 'px';
      menu.style.top = Math.max(8, top) + 'px';
      this._pageMenuDismiss = e => {
        if (this._pageMenu && !this._pageMenu.contains(e.target)) this._closePageMenu();
      };
      setTimeout(() => document.addEventListener('pointerdown', this._pageMenuDismiss, true), 0);
    }

    _closePageMenu() {
      if (this._pageMenu) { this._pageMenu.remove(); this._pageMenu = null; }
      if (this._pageMenuDismiss) {
        document.removeEventListener('pointerdown', this._pageMenuDismiss, true);
        this._pageMenuDismiss = null;
      }
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
      /* 语法错误优先用源码定位：stack 里的 <anonymous>:N 可能是调用方，不是出错行 */
      if (e instanceof SyntaxError) return NS.sandbox.findSyntaxLine(code) || 1;
      const s = String(e.stack || '');
      const m = s.match(/<anonymous>:(\d+):\d+/);
      if (m) {
        /* compileApp 用 new Function('Component','h',...)：函数签名占 2 行 */
        const total = String(code).split('\n').length;
        const ln = Number(m[1]) - 2;
        if (ln >= 1 && ln <= total) return ln;
        return NS.sandbox.findSyntaxLine(code) || 1;
      }
      return 0;
    }

    /* ---------- 动作 · 运行（预览独立成窗口） ---------- */
    _ensurePreviewApp() {
      const id = 'appstudio-preview';
      const APPS = NS.apps.APPS;
      if (APPS[id]) return APPS[id];
      const def = {
        id: id, name: '预览', hidden: true, multi: true,
        icon: NS.render.icons.APPS.appstudio || NS.render.icons.UI.window || null,
        build: function (body, args) {
          body.textContent = '';
          const wrap = document.createElement('div');
          wrap.className = 'as-pvw';
          const frameBox = document.createElement('div');
          frameBox.className = 'as-pvw-frame';
          const log = document.createElement('div');
          log.className = 'as-pvw-log';
          wrap.appendChild(frameBox);
          wrap.appendChild(log);
          body.appendChild(wrap);
          const push = function (lv, text) {
            const row = document.createElement('div');
            row.className = 'as-debug-item lv-' + (lv === 'error' ? 'error' : 'log');
            row.textContent = (lv === 'error' ? '✕ ' : '· ') + String(text);
            if (log.childNodes.length >= 200) log.removeChild(log.firstChild);
            log.appendChild(row);
            log.scrollTop = log.scrollHeight;
          };
          const pages = (args && args.pages) || [];
          const startName = (args && args.startName) || (pages[0] && pages[0].name);
          frameBox.__pvHandle = NS.sandbox.mountMultiApp(frameBox, pages, startName, {
            log: function (i) { push('log', i.text); },
            error: function (i) {
              push('error', (i.page ? '[' + i.page + '] ' : '') + (i.line ? '第 ' + i.line + ' 行 · ' : '') + i.text);
            },
            fatal: function (i) {
              push('error', (i.page ? '[' + i.page + '] ' : '') + (i.line ? '第 ' + i.line + ' 行 · ' : '') + (i.message || '运行失败'));
            }
          }, NS.sandbox.readTheme());
          push('log', '沙箱已启动 · ' + pages.length + ' 个页面 · 隔离运行');
        }
      };
      APPS[id] = def;
      return def;
    }

    run() {
      if (!this._ta) return;
      this._syncCurrentPage();
      this._closePageMenu();
      /* M6 · 可视化页先按当前 UI 树重算代码 */
      this._pages.forEach(p => { if (p.mode === 'ui') p.code = NS.apps.appstudioUI.genCode(p); });
      if (this._curPage.mode === 'ui' && this._ta) { this._ta.value = this._curPage.code; this._syncEditor(); }
      /* 语法预检：错误直接标在编辑器行号上，不弹预览窗口 */
      for (const p of this._pages) {
        try { NS.apps.compileApp(p.code); }
        catch (e) {
          if (this._curPage.id !== p.id) this._switchPage(p.id);
          const ln = this._errLine(e, p.code) || NS.sandbox.findSyntaxLine(p.code) || 1;
          this._showErr(ln);
          this.setStatus('as-err', '✕ 页面「' + p.name + '」· ' + e.message);
          NS.render.toast('页面「' + p.name + '」语法错误');
          return;
        }
      }
      this._clearErr();
      const pages = this._pages.map(p => ({ name: p.name, code: p.code }));
      const startPage = this._pages.find(p => p.id === this._startPageId) || this._pages[0];
      this._openPreview(pages, startPage.name);
      this.setStatus('as-ok', '✓ 预览窗口已打开 · ' + this._pages.length + ' 页面');
    }

    _openPreview(pages, startName) {
      const def = this._ensurePreviewApp();
      const appName = (this._nameInput && this._nameInput.value.trim()) || this._current || '应用';
      def.name = '预览 · ' + appName;
      this._killRun();
      NS.system.winman.openApp('appstudio-preview', { pages: pages, startName: startName });
    }

    _killRun() {
      const list = NS.system.winman.wins.filter(w => w.appId === 'appstudio-preview');
      list.forEach(w => {
        const f = w.el.querySelector('.as-pvw-frame');
        if (f && f.__pvHandle) { try { f.__pvHandle.kill(); } catch (e) {} f.__pvHandle = null; }
        NS.system.winman.closeWin(w);
      });
    }

    async save() {
      const name = (this._nameInput ? this._nameInput.value.trim() : '') || '我的应用';
      this._syncCurrentPage();
      this._pages.forEach(p => { if (p.mode === 'ui') p.code = NS.apps.appstudioUI.genCode(p); });
      if (this._pages.some(p => !p.code.trim())) { NS.render.toast('有页面代码为空，先写点东西再保存'); return; }
      let bad = null;
      for (const p of this._pages) {
        try { NS.apps.compileApp(p.code); }
        catch (e) { bad = { p: p, e: e }; break; }
      }
      if (bad) {
        NS.render.toast('页面「' + bad.p.name + '」语法错误，无法保存：' + bad.e.message);
        this.setStatus('as-err', '✕ 页面「' + bad.p.name + '」· ' + bad.e.message);
        if (this._curPage.id !== bad.p.id) this._switchPage(bad.p.id);
        this._showErr(this._errLine(bad.e, bad.p.code) || NS.sandbox.findSyntaxLine(bad.p.code) || 1);
        return;
      }
      const oldId = this._currentId;
      const id = 'userapp-' + name;
      const startPage = this._pages.find(p => p.id === this._startPageId) || this._pages[0];
      const def = {
        id, name, v: 2,
        pages: this._pages.map(p => ({
          id: p.id, name: p.name, code: p.code,
          mode: p.mode === 'ui' ? 'ui' : 'code',
          ui: Array.isArray(p.ui) ? p.ui : []
        })),
        startPageId: startPage.id, startPageName: startPage.name,
        updatedAt: Date.now()
      };
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

    componentWillUnmount() {
      this._killRun();
      this._ta = this._nameInput = this._statusText = this._gutter = this._hl = null;
    }
  }

  NS.apps.AppStudioApp = AppStudioApp;
  NS.apps.buildAppStudio = body => new AppStudioApp().mount(body);
})(window);
