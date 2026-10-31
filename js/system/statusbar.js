/* ============================================================
   Universe OS · 系统层 · statusbar.js
   状态栏：应用名 / 时间（15s）/ 电池；搜索与 Wi-Fi 图标；
   左上角菜单栏（文件/显示/窗口/帮助）——下拉菜单均执行真实动作
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const $ = NS.core.utils.$;
  const h = NS.render.h;
  const { MiniButton } = NS.render.controls;

  function updateStatusBarAppName(n) {
    const el = $('#sbAppName');
    if (el) el.textContent = n || 'Universe';
  }
  function updateStatusBarTime() {
    const el = $('#sbTime');
    if (el) el.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  async function updateBatteryStatus() {
    if (!navigator.getBattery) return;
    try {
      const b = await navigator.getBattery();
      const upd = () => {
        const pct = Math.round(b.level * 100);
        const fill = $('#sbBatteryFill'), label = $('#sbBatteryPct');
        if (label) label.textContent = pct + '%';
        if (fill) {
          fill.setAttribute('width', Math.max(2, Math.round(12 * b.level)));
          fill.setAttribute('opacity', pct <= 20 ? '0.55' : '1');
        }
      };
      upd();
      b.addEventListener('levelchange', upd);
      b.addEventListener('chargingchange', upd);
    } catch (e) {}
  }

  setInterval(updateStatusBarTime, 15000);
  updateStatusBarTime();
  updateBatteryStatus();

  /* ---------- 左上角菜单栏 ---------- */

  /* 宿主浏览器全屏：把承载本 WebOS 的浏览器窗口（地址栏/标签栏等）切到全屏，
     让 WebOS 界面铺满屏幕；退出用 Esc 或再次点击菜单项 */
  function toggleHostFullscreen() {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (document.documentElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  const MENU_DEFS = {
    file: () => [
      { label: '搜索 Spotlight… (Ctrl+Alt+Space)', action: () => NS.system.spotlight.toggle() },
      { sep: true },
      { label: '新建备忘录', action: () => NS.system.winman.openApp('notes') },
      { label: '打开文件', action: () => NS.system.winman.openApp('files') },
      { label: '打开浏览器', action: () => NS.system.winman.openApp('browser') },
      { label: '打开文本编辑器', action: () => NS.system.winman.openApp('text-editor') },
      { sep: true },
      {
        label: '退出全屏',
        disabled: !(NS.system.winman.activeWin && NS.system.winman.activeWin.fullscreen),
        action: () => { if (NS.system.winman.activeWin && NS.system.winman.activeWin.fullscreen) NS.system.winman.exitFullscreen(NS.system.winman.activeWin); }
      }
    ],
    view: () => {
      const mode = NS.core.theme.colorMode;
      const dockHidden = NS.system.dock.dockEl.classList.contains('ui-hidden');
      return [
        {
          label: '外观',
          children: [
            { label: (mode === 'light' ? '✓ ' : '') + '浅色外观', action: () => NS.core.theme.applyColorMode('light') },
            { label: (mode === 'dark' ? '✓ ' : '') + '深色外观', action: () => NS.core.theme.applyColorMode('dark') }
          ]
        },
        { sep: true },
        { label: dockHidden ? '显示 Dock' : '隐藏 Dock', action: () => NS.system.dock.toggleManualHidden() },
        { sep: true },
        {
          label: document.fullscreenElement ? '退出全屏' : '进入全屏',
          action: () => toggleHostFullscreen()
        }
      ];
    },
    win: () => {
      const wm = NS.system.winman;
      const items = wm.wins.filter(w => !w.min).map(w => {
        const app = NS.apps.APPS[w.appId];
        return {
          label: (w === wm.activeWin ? '✓ ' : '') + (app ? app.name : w.appId),
          action: () => wm.focusWin(w)
        };
      });
      const mins = wm.wins.filter(w => w.min).map(w => {
        const app = NS.apps.APPS[w.appId];
        return { label: '恢复「' + (app ? app.name : w.appId) + '」', action: () => wm.restoreWin(w) };
      });
      const list = [{ label: '切换应用… (Alt+`)', action: () => wm.openSwitcher(false) }, { sep: true }].concat(items, mins);
      if (list.length === 0) list.push({ label: '无打开窗口', disabled: true });
      list.push({ sep: true });
      list.push({ label: '关闭全部窗口', action: () => wm.wins.slice().forEach(w => wm.closeWin(w)) });
      return list;
    },
    help: () => [
      { label: '关于 Universe OS', action: showAbout }
    ]
  };

  function showAbout() {
    const overlay = NS.render.createElement(h('div', { className: 'modal-overlay' }, [
      h('div', { className: 'modal-box' }, [
        h('div', { className: 'modal-title' }, '关于 Universe OS'),
        h('div', { className: 'modal-msg' }, 'Universe OS 2.0.0\n声明式渲染 · 多文件工程（系统 / 渲染 / 软件 三部分）\n共 38 个文件 · 双击打开与 GitHub Pages 均可用'),
        h('div', { className: 'modal-actions' }, [
          MiniButton({ label: '好', primary: true, onClick: () => overlay.remove() })
        ])
      ])
    ]));
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) overlay.remove(); });
  }

  function openMenu(name, anchorEl) {
    const def = MENU_DEFS[name];
    if (!def) return;
    const r = anchorEl.getBoundingClientRect();
    NS.render.menu.showMenu(r.left, r.bottom + 3, def(), null);
  }

  (function wireMenus() {
    const sbMenus = document.querySelector('.sb-menus');
    if (!sbMenus) return;
    sbMenus.addEventListener('pointerdown', e => {
      const item = e.target.closest('.sb-menu-item');
      if (!item) return;
      e.stopPropagation();
      openMenu(item.dataset.menu, item);
    });
    /* 菜单已打开时，鼠标划过其他菜单项直接切换 */
    sbMenus.addEventListener('mouseenter', e => {
      if (!NS.render.menu.isMenuOpen()) return;
      const item = e.target.closest('.sb-menu-item');
      if (item) openMenu(item.dataset.menu, item);
    });
    /* 状态栏左侧 logo → 系统设置 */
    const apple = document.querySelector('.sb-apple');
    if (apple) apple.onclick = () => NS.system.winman.openApp('settings');
  })();

  const sbSearch = $('#sbSearch');
  if (sbSearch) sbSearch.onclick = () => NS.system.spotlight.toggle();
  const sbWifi = $('#sbWifi');
  if (sbWifi) sbWifi.onclick = () => NS.render.toast('Wi-Fi 已连接');

  NS.system.statusbar = { updateStatusBarAppName, updateStatusBarTime, updateBatteryStatus };
})(window);
