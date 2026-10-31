/* ============================================================
   Universe OS · 系统层 · launcher.js
   启动台：搜索过滤、Dock/桌面高亮、右键菜单、点空白关闭
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const $ = NS.core.utils.$;
  const { escapeHtml, suppressClicks } = NS.core.utils;

  const launcherEl = $('#launcher');
  const launcherGrid = $('#launcherGrid');
  const launcherInput = $('#launcherInput');
  let launcherOpen = false;

  function renderLauncher(q) {
    q = (q || '').trim().toLowerCase();
    launcherGrid.textContent = '';
    const APPS = NS.apps.APPS;
    const list = Object.entries(APPS).filter(pair => {
      const id = pair[0], a = pair[1];
      return !a.hidden && (!q || a.name.toLowerCase().indexOf(q) >= 0 || id.indexOf(q) >= 0);
    });
    if (!list.length) {
      launcherGrid.innerHTML = '<div class="launcher-empty">没有匹配的应用</div>';
      return;
    }
    list.forEach(pair => {
      const id = pair[0], app = pair[1];
      const b = document.createElement('button');
      b.className = 'launcher-item';
      if (NS.system.layout.dockApps.indexOf(id) >= 0) b.classList.add('in-dock');
      if (NS.system.layout.desktopIcons.some(i => i.appId === id)) b.classList.add('on-desk');
      b.innerHTML = '<div class="ic" style="background:' + app.bg + ';color:' + app.fg + '">' + app.icon + '</div><span>' + escapeHtml(app.name) + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        closeLauncher();
        NS.system.winman.openApp(id);
      });
      b.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showLauncherMenu(e.clientX, e.clientY, id, b);
      });
      launcherGrid.appendChild(b);
    });
  }

  function showLauncherMenu(x, y, appId, anchorEl) {
    const app = NS.apps.APPS[appId];
    const inDock = NS.system.layout.dockApps.indexOf(appId) >= 0;
    const onDesk = NS.system.layout.desktopIcons.some(i => i.appId === appId);
    const items = [];
    if (!onDesk) items.push({
      label: '添加到主屏幕',
      action: () => { const ok = NS.system.layout.addToDesktop(appId); if (!ok) NS.render.toast('主屏幕已满'); renderLauncher(launcherInput.value); }
    });
    else items.push({ label: '已添加到主屏幕', disabled: true });
    if (!inDock) items.push({ label: '添加到 Dock', action: () => { NS.system.layout.addToDock(appId); renderLauncher(launcherInput.value); } });
    else items.push({ label: '已添加到 Dock', disabled: true });
    items.push({ sep: true });
    items.push({ label: '打开「' + app.name + '」', action: () => { closeLauncher(); NS.system.winman.openApp(appId); } });
    NS.render.menu.showMenu(x, y, items, anchorEl);
  }

  function openLauncher() {
    launcherOpen = true;
    launcherEl.classList.add('open');
    launcherInput.value = '';
    renderLauncher('');
    if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => launcherInput.focus(), 120);
  }
  function closeLauncher() {
    launcherOpen = false;
    launcherEl.classList.remove('open');
  }
  function toggleLauncher() {
    launcherOpen ? closeLauncher() : openLauncher();
  }

  const launchBtn = $('#launchBtn');
  if (launchBtn) launchBtn.addEventListener('click', toggleLauncher);
  launcherInput.addEventListener('input', () => renderLauncher(launcherInput.value));
  launcherEl.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.launcher-item') || e.target.closest('.launcher-search') || e.target.closest('.ctxmenu-popup')) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClicks();
    closeLauncher();
  });

  NS.system.launcher = { launcherEl, launcherGrid, launcherInput, get launcherOpen() { return launcherOpen; }, renderLauncher, openLauncher, closeLauncher, toggleLauncher };
})(window);
