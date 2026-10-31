/* ============================================================
   Universe OS · 软件层 · settings.js
   设置应用（声明式 Component）：8 个面板 + 侧栏导航
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const C = NS.render.controls;
  const { Switch, Slider, Seg, MiniButton, KVRow, SectionTitle } = C;
  const { store, config, theme, fs, quota } = NS.core;
  const { formatSize } = NS.core.utils;
  const { toast, confirmDialog } = NS.render;

  const NAV_GROUPS = [
    { group: '偏好', items: [
      { id: 'appearance', label: '外观', icon: NS.render.icons.NAV.appearance },
      { id: 'storage', label: '存储', icon: NS.render.icons.NAV.storage },
      { id: 'display', label: '显示', icon: NS.render.icons.NAV.display }
    ] },
    { group: '应用', items: [
      { id: 'files', label: '文件', icon: NS.render.icons.NAV.files },
      { id: 'notes', label: '备忘录', icon: NS.render.icons.NAV.notes },
      { id: 'default', label: '默认应用', icon: NS.render.icons.NAV.default }
    ] },
    { group: '高级', items: [
      { id: 'developer', label: '开发者', icon: NS.render.icons.NAV.developer },
      { id: 'about', label: '关于', icon: NS.render.icons.NAV.about }
    ] }
  ];

  class SettingsApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = {
        active: 'appearance',
        colorMode: theme.colorMode,
        wpIndex: theme.wpIndex,
        filesView: store.get('files.view', 'grid'),
        showHidden: store.get('files.showHidden', false),
        drawColor: store.get('draw.color', '#000000'),
        drawSize: store.get('draw.size', 3),
        res: innerWidth + ' × ' + innerHeight,
        devBackend: '—', backend: '—',
        browserQuota: '—', used: '—', limit: '—',
        stBarPct: 0, stBarWarn: false, stBarDanger: false,
        blur: store.get('blur', true)
      };
      this.sliderLabels = {};
    }

    renderSidebar() {
      return h('div', null, NAV_GROUPS.map(g => [
        h('div', { className: 'st-group-title' }, g.group),
        g.items.map(it => h('button', {
          className: 'st-nav' + (it.id === this.state.active ? ' active' : ''),
          onclick: () => this.setState({ active: it.id })
        }, [
          h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: it.icon }),
          h('span', null, it.label)
        ]))
      ]));
    }

    render() {
      const s = this.state;
      const panes = [
        { id: 'appearance', content: this.renderAppearance() },
        { id: 'storage', content: this.renderStorage() },
        { id: 'display', content: this.renderDisplay() },
        { id: 'files', content: this.renderFilesPane() },
        { id: 'notes', content: this.renderNotesPane() },
        { id: 'default', content: this.renderDefaultPane() },
        { id: 'developer', content: this.renderDeveloperPane() },
        { id: 'about', content: this.renderAboutPane() }
      ];
      return h('div', { className: 'st-panes' }, panes.map(p =>
        h('div', { className: 'st-pane' + (p.id === s.active ? ' active' : ''), dataset: { pane: p.id } }, p.content)
      ));
    }

    /* ---------- 外观 ---------- */
    renderAppearance() {
      return [
        h('h2', null, '外观'),
        SectionTitle('模式'),
        KVRow('颜色模式', '切换深浅色主题',
          Seg([
            { id: 'dark', label: '深色' }, { id: 'light', label: '浅色' }
          ], this.state.colorMode, m => {
            theme.applyColorMode(m);
            this.setState({ colorMode: theme.colorMode });
          })),
        SectionTitle('壁纸'),
        h('div', { className: 'wp-list' }, config.WALLPAPERS.map((bg, i) =>
          h('button', {
            className: 'wp-item' + (i === this.state.wpIndex ? ' active' : ''),
            style: { background: bg },
            onclick: () => {
              theme.wpIndex = i;
              store.set('wallpaper', i);
              theme.applyWallpaper();
              this.setState({ wpIndex: i });
            }
          })
        )),
        SectionTitle('效果'),
        KVRow('毛玻璃', '窗口和 Dock 的背景模糊',
          Switch(this.state.blur, v => {
            store.set('blur', v);
            document.querySelectorAll('.window, #dock, .ctxmenu-popup').forEach(el => {
              el.style.backdropFilter = v ? '' : 'none';
              el.style.webkitBackdropFilter = v ? '' : 'none';
            });
            this.setState({ blur: v });
          })),
        KVRow('界面缩放', '整体尺寸', this.renderScaleSlider()),
        SectionTitle('Dock'),
        KVRow('图标大小', null, this.renderDockSlider())
      ];
    }

    renderScaleSlider() {
      const uiScale = store.get('uiScale', 1);
      return h('div', { className: 'st-row-ctrl' }, [
        h('input', {
          type: 'range', className: 'st-slider', min: '0.85', max: '1.15', step: '0.05', value: uiScale,
          oninput: e => {
            const v = parseFloat(e.target.value);
            store.set('uiScale', v);
            document.documentElement.style.fontSize = (16 * v) + 'px';
            this.sliderLabels.scale.textContent = Math.round(v * 100) + '%';
          }
        }),
        h('span', { className: 'st-slider-val', ref: el => (this.sliderLabels.scale = el) }, Math.round(uiScale * 100) + '%')
      ]);
    }

    renderDockSlider() {
      const dockSize = store.get('dockSize', 52);
      return h('div', { className: 'st-row-ctrl' }, [
        h('input', {
          type: 'range', className: 'st-slider', min: '40', max: '60', step: '2', value: dockSize,
          oninput: e => {
            store.set('dockSize', +e.target.value);
            this.sliderLabels.dock.textContent = e.target.value;
            NS.system.dock.renderDock();
          }
        }),
        h('span', { className: 'st-slider-val', ref: el => (this.sliderLabels.dock = el) }, String(dockSize))
      ]);
    }

    /* ---------- 存储 ---------- */
    renderStorage() {
      const s = this.state;
      const opts = [128, 512, 1024, 2048, 5120, 10240].map(v => {
        const label = v >= 1024 ? (v / 1024) + ' GB' : v + ' MB';
        return h('button', {
          className: 'storage-opt' + (v * 1024 * 1024 === quota.getLimit() ? ' active' : ''),
          dataset: { v: String(v * 1024 * 1024) },
          onclick: () => {
            quota.setLimit(v * 1024 * 1024);
            this.setState({});
            toast('已设为 ' + label);
            this.refreshStorage();
          }
        }, label);
      });
      return [
        h('h2', null, '存储'),
        h('div', { className: 'storage-wrap' }, [
          h('div', { className: 'storage-label' }, [
            h('span', null, 'Universe 磁盘'),
            h('span', null, [
              h('b', { ref: el => (this._stUsed = el) }, s.used),
              ' / ',
              h('span', { ref: el => (this._stLimit = el) }, s.limit)
            ])
          ]),
          h('div', { className: 'storage-bar' }, [
            h('div', { className: 'storage-bar-fill' + (s.stBarDanger ? ' danger' : s.stBarWarn ? ' warn' : ''), style: { width: s.stBarPct + '%' }, ref: el => (this._stBar = el) })
          ]),
          h('div', { className: 'storage-hint', ref: el => (this._stBrowser = el) }, '浏览器实际可用：' + s.browserQuota),
          h('div', { className: 'storage-hint' + (this.state.backend && this.state.backend !== 'OPFS（持久化）' ? ' warn' : ''), ref: el => (this._stBackend = el) }, '存储后端：' + s.backend)
        ]),
        h('div', { className: 'storage-options' }, opts),
        h('div', { className: 'storage-hint' }, '软配额，达到后 Universe 内写入会被拒绝。'),
        h('div', { style: { marginTop: '16px' } }, [
          KVRow('清理会话数据', '重置桌面布局和 Dock 配置',
            MiniButton({ label: '清理', onClick: () => this.clearLayout() })),
          KVRow('申请持久化', '避免浏览器清理存储',
            MiniButton({ label: '申请', onClick: () => this.requestPersist() }))
        ])
      ];
    }

    async clearLayout() {
      if (!(await confirmDialog('重置桌面布局和 Dock 配置？'))) return;
      NS.system.layout.resetLayout();
      toast('已清理');
    }
    async requestPersist() {
      const ok = await fs.persist();
      toast(ok ? '已获得持久化权限' : '浏览器未授予持久化权限');
    }

    refreshStorage() {
      fs.backend().then(be => {
        const backendText = be === 'opfs' ? 'OPFS（持久化）' : '内存（沙箱环境，刷新后丢失）';
        this.setState({ backend: backendText });
        return quota.getUsage().then(used => {
          const limit = quota.getLimit();
          const pct = Math.min(100, used / limit * 100);
          this.setState({ used: formatSize(used), limit: formatSize(limit), stBarPct: pct, stBarWarn: pct >= 80 && pct < 95, stBarDanger: pct >= 95 });
          return fs.usage().then(u => this.setState({ browserQuota: formatSize(u.quota) }))
            .catch(() => this.setState({ browserQuota: '未知' }));
        });
      }).catch(() => {});
    }

    /* ---------- 显示 ---------- */
    renderDisplay() {
      return [
        h('h2', null, '显示'),
        SectionTitle('屏幕'),
        KVRow('屏幕分辨率', null, h('span', { style: { color: 'var(--text-dim)' } }, this.state.res)),
        KVRow('强制横屏', '保持 UI 横向',
          Switch(theme.forcedLandscape, v => {
            theme.forcedLandscape = v;
            store.set('forcedLandscape', v);
            theme.applyForcedLandscape();
            setTimeout(NS.system.layout.relayout, 400);
            this.setState({});
          })),
        SectionTitle('窗口'),
        KVRow('记住窗口位置', null,
          Switch(store.get('rememberWindows', true), v => store.set('rememberWindows', v))),
        KVRow('清除窗口记忆', null,
          MiniButton({ label: '清除', onClick: () => this.clearWindowMemory() }))
      ];
    }
    async clearWindowMemory() {
      if (!(await confirmDialog('清除所有窗口的位置记忆？'))) return;
      NS.system.winman.wins.forEach(w => {
        try { localStorage.removeItem('webos.rect.' + w.appId); } catch (e) {}
      });
      toast('已清除');
    }

    /* ---------- 文件 ---------- */
    renderFilesPane() {
      return [
        h('h2', null, '文件'),
        SectionTitle('默认视图'),
        KVRow('打开时的视图', null,
          Seg([
            { id: 'grid', label: '网格' }, { id: 'list', label: '列表' }
          ], this.state.filesView, v => {
            store.set('files.view', v);
            this.setState({ filesView: v });
            toast('已切换默认视图');
          })),
        SectionTitle('行为'),
        KVRow('显示隐藏文件', null,
          Switch(this.state.showHidden, v => {
            store.set('files.showHidden', v);
            this.setState({ showHidden: v });
          }))
      ];
    }

    /* ---------- 备忘录 ---------- */
    renderNotesPane() {
      return [
        h('h2', null, '备忘录'),
        SectionTitle('绘画'),
        KVRow('默认画笔颜色', null,
          h('input', {
            type: 'color', value: this.state.drawColor,
            style: 'width:40px;height:28px;border-radius:6px;border:1px solid var(--border-strong);padding:2px',
            onchange: (e, input) => { store.set('draw.color', input.value); this.setState({ drawColor: input.value }); }
          })),
        KVRow('默认画笔粗细', null,
          h('div', { className: 'st-row-ctrl' }, [
            h('input', {
              type: 'range', className: 'st-slider', min: '1', max: '20', step: '1', value: this.state.drawSize,
              oninput: e => {
                store.set('draw.size', +e.target.value);
                this.setState({ drawSize: +e.target.value });
              }
            }),
            h('span', { className: 'st-slider-val' }, String(this.state.drawSize))
          ]))
      ];
    }

    /* ---------- 默认应用 ---------- */
    renderDefaultPane() {
      return [
        h('h2', null, '默认应用'),
        SectionTitle('文件打开方式'),
        KVRow('文本文件', null, h('select', { className: 'st-select' }, h('option', null, '文本编辑'))),
        KVRow('图片', null, h('select', { className: 'st-select' }, h('option', null, '图片查看器')))
      ];
    }

    /* ---------- 开发者 ---------- */
    renderDeveloperPane() {
      return [
        h('h2', null, '开发者'),
        SectionTitle('调试'),
        KVRow('显示 FPS', null, Switch(false, v => v ? NS.system.fps.startFpsCounter() : NS.system.fps.stopFpsCounter())),
        SectionTitle('存储后端'),
        KVRow('后端类型', null, h('span', { style: { color: 'var(--text-dim)' } }, this.state.devBackend)),
        KVRow('清除所有 Universe 数据', '危险',
          MiniButton({ label: '清除', danger: true, onClick: () => this.clearAllData() }))
      ];
    }
    async clearAllData() {
      if (!(await confirmDialog('确认清除所有 Universe 数据？'))) return;
      try {
        Object.keys(localStorage).filter(k => k.startsWith('webos.')).forEach(k => localStorage.removeItem(k));
        toast('已清除，刷新后生效');
      } catch (e) {}
    }

    /* ---------- 关于 ---------- */
    renderAboutPane() {
      return [
        h('h2', null, '关于'),
        h('div', { className: 'st-about' }, [
          h('p', null, [h('b', null, 'Universe'), ' 是一个浏览器端的桌面式操作系统模拟。']),
          h('p', { style: { marginTop: '12px', color: 'var(--text-dim)', fontSize: '12px' } }, '版本 2.0.0 · 多文件 · 纯原生 · 零依赖')
        ]),
        SectionTitle('系统信息'),
        KVRow('分辨率', null, h('span', { style: { color: 'var(--text-dim)' } }, this.state.res)),
        KVRow('浏览器', null, h('span', { style: { color: 'var(--text-dim)' } }, navigator.userAgent.split(' ').slice(-2).join(' '))),
        KVRow('存储后端', null, h('span', { style: { color: 'var(--text-dim)' } }, this.state.devBackend === '—' ? '—' : this.state.devBackend))
      ];
    }

    componentDidMount() {
      this.refreshStorage();
      fs.backend().then(be => this.setState({ devBackend: be === 'opfs' ? 'OPFS' : '内存' }));
    }
  }

  NS.apps.SettingsApp = SettingsApp;
  NS.apps.buildSettings = (body, sidebar) => new SettingsApp().mount(body, sidebar);
})(window);
