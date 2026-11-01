/* ============================================================
   Universe OS · 系统层 · boot.js
   启动：竖屏提示 toast、init()（壁纸/网格/持久化/桌面/Dock/启动台/缩放）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};

  /* 移动端竖屏提示 */
  (function () {
    const portrait = innerHeight > innerWidth;
    const coarse = matchMedia('(pointer:coarse)').matches;
    if (coarse && portrait) {
      const el = $('#startup-toast');
      setTimeout(() => {
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3200);
      }, 600);
    }
  })();

  function init() {
    NS.core.theme.applyWallpaper();
    NS.system.layout.computeGrid();
    NS.system.layout.clampIcons();
    NS.system.layout.persistDesktop();
    NS.system.layout.persistDock();
    NS.system.layout.lastDesktopApps = NS.system.layout.desktopIcons.map(i => i.appId + (i.file || ''));
    NS.system.layout.lastDockApps = NS.system.layout.dockApps.slice();
    NS.system.desktop.renderDesktop();
    NS.system.dock.renderDock();
    NS.system.launcher.renderLauncher();
    NS.system.dock.scheduleDockCheck();
    const uiScale = NS.core.store.get('uiScale', 1);
    document.documentElement.style.fontSize = (16 * uiScale) + 'px';
    NS.core.fs.backend().then(be => {
      if (be !== 'opfs') {
        setTimeout(() => NS.render.toast('沙箱环境，文件保存在内存中。部署后自动启用持久化。', 4000), 1200);
      }
    });
    /* 扫描 /apps/ 目录，加载 Universe Studio 保存的动态应用（应用只是数据，注册即用） */
    NS.core.fs.backend().then(() => {
      (async () => {
        try {
          await NS.core.fs.mkdir('/apps');
          const list = await NS.core.fs.list('/apps');
          for (const it of list) {
            if (it.kind !== 'file' || !it.name.endsWith('.uapp')) continue;
            const blob = await NS.core.fs.readBlob('/apps/' + it.name);
            const def = JSON.parse(await blob.text());
            if (!def || typeof def.code !== 'string') continue;
            NS.apps.registerDynamic(def);
          }
        } catch (e) { /* 目录不存在或读取失败时静默跳过 */ }
        NS.system.dock.renderDock();
        NS.system.launcher.renderLauncher();
      })();
    });
  }

  NS.system.boot = { init };
  init();
})(window);
