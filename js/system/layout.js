/* ============================================================
   Universe OS · 系统层 · layout.js
   布局核心：网格计算、桌面/Dock 持久化状态、增删/互移、relayout/resize
   （desktop.js / dock.js / launcher.js 共享这里的状态）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const { $, $$, clamp, compact } = NS.core.utils;
  const { store, config } = NS.core;

  /* ---------- 桌面元素与网格 ---------- */
  NS.system.deskEl = $('#desktop');
  NS.system.iconsLayer = $('#icons-layer');
  NS.system.ghostEl = $('#ghost');

  const GRID = { cw: 100, ch: 112, padX: 20, padY: 34, cols: 6, rows: 4 };

  function computeGrid() {
    const W = NS.system.deskEl.clientWidth, H = NS.system.deskEl.clientHeight;
    const cp = compact();
    GRID.cw = cp ? 82 : 100; GRID.ch = cp ? 94 : 112;
    GRID.padX = cp ? 10 : 20; GRID.padY = 34;
    const reserve = 104;
    GRID.cols = Math.max(1, Math.floor((W - GRID.padX * 2) / GRID.cw));
    GRID.rows = Math.max(1, Math.floor((H - GRID.padY - reserve) / GRID.ch));
  }

  /* ---------- 桌面/Dock 持久化 ---------- */
  let desktopIcons = store.get('desktop', null);
  if (!desktopIcons) { desktopIcons = config.DEFAULT_DESKTOP(); store.set('desktop', desktopIcons); }
  let dockApps = store.get('dock', null);
  if (!dockApps) { dockApps = config.DEFAULT_DOCK.slice(); store.set('dock', dockApps); }
  dockApps = dockApps.filter(id => NS.apps.APPS && NS.apps.APPS[id] ? true : false);

  /* 启动即按当前视口网格收敛 + 去重重叠图标，并写回（自愈旧布局） */
  computeGrid();
  clampIcons();
  persistDesktop();
  persistDock();

  function persistDesktop() { store.set('desktop', desktopIcons); }
  function persistDock() { store.set('dock', dockApps); }
  let lastDesktopApps = [], lastDockApps = [];

  function findEmptyCell() {
    for (let row = 0; row < GRID.rows; row++)
      for (let col = 0; col < GRID.cols; col++)
        if (!desktopIcons.some(i => i.col === col && i.row === row)) return { col, row };
    return null;
  }

  function addToDesktop(appId) {
    const APPS = NS.apps.APPS;
    if (!APPS[appId] || desktopIcons.some(i => i.appId === appId)) return false;
    const pos = findEmptyCell();
    if (!pos) return false;
    desktopIcons.push({ appId, col: pos.col, row: pos.row });
    persistDesktop(); NS.system.desktop.renderDesktop(); return true;
  }
  function addToDock(appId) {
    const APPS = NS.apps.APPS;
    if (!APPS[appId] || dockApps.indexOf(appId) >= 0) return false;
    dockApps.push(appId); persistDock(); NS.system.dock.renderDock(); return true;
  }
  /* 文件被移到废纸篓后，移除其桌面图标 */
  function removeFileFromDesktop(path) {
    const idx = desktopIcons.findIndex(i => i.file === path);
    if (idx < 0) return false;
    desktopIcons.splice(idx, 1);
    persistDesktop(); NS.system.desktop.renderDesktop();
    return true;
  }
  function addFileToDesktop(path, name) {
    const { toast } = NS.render;
    if (desktopIcons.some(i => i.file === path)) { toast('已在桌面'); return; }
    const pos = findEmptyCell();
    if (!pos) { toast('桌面已满'); return; }
    desktopIcons.push({ appId: 'fileitem', file: path, name, col: pos.col, row: pos.row });
    persistDesktop(); NS.system.desktop.renderDesktop(); toast('已添加到桌面');
  }
  function dragDesktopToDock(appId) {
    const idx = desktopIcons.findIndex(i => i.appId === appId);
    if (idx >= 0) {
      const el = NS.system.iconsLayer.children[idx];
      if (el) el.classList.add('desk-leaving');
      desktopIcons.splice(idx, 1); persistDesktop();
    }
    const added = dockApps.indexOf(appId) < 0;
    if (added) { dockApps.push(appId); persistDock(); }
    setTimeout(() => { NS.system.desktop.renderDesktop(); if (added) NS.system.dock.renderDock(); }, 240);
  }
  function dragDockToDesktop(appId) {
    const d = NS.system.dock.dockInner.querySelector('[data-app="' + appId + '"]');
    if (d) d.classList.add('dock-leaving');
    dockApps = dockApps.filter(a => a !== appId); persistDock();
    const added = !desktopIcons.some(i => i.appId === appId);
    if (added) {
      const pos = findEmptyCell();
      if (pos) { desktopIcons.push({ appId, col: pos.col, row: pos.row }); persistDesktop(); }
    }
    setTimeout(() => { NS.system.dock.renderDock(); if (added) NS.system.desktop.renderDesktop(); }, 240);
  }
  function iconPos(el, col, row) {
    el.style.left = (GRID.padX + col * GRID.cw) + 'px';
    el.style.top = (GRID.padY + row * GRID.ch) + 'px';
  }
  function clampIcons() {
    desktopIcons.forEach(it => {
      it.col = clamp(it.col, 0, GRID.cols - 1);
      it.row = clamp(it.row, 0, GRID.rows - 1);
    });
    /* 自愈重叠：同一格子只保留先到者，冲突项重排到空位（修复旧数据/紧凑视口遗留的"糊一坨"） */
    const seen = new Set();
    desktopIcons.forEach(it => {
      let k = it.col + ',' + it.row;
      if (seen.has(k)) {
        const p = findEmptyCell();
        if (p) { it.col = p.col; it.row = p.row; }
        else { it.col = 0; it.row = 0; }
        k = it.col + ',' + it.row;
      }
      seen.add(k);
    });
  }

  function resetLayout() {
    desktopIcons = config.DEFAULT_DESKTOP();
    dockApps = config.DEFAULT_DOCK.slice();
    persistDesktop(); persistDock();
    clampIcons();
    NS.system.desktop.renderDesktop(); NS.system.dock.renderDock();
  }

  function relayout() {
    computeGrid(); clampIcons(); persistDesktop();
    NS.system.desktop.renderDesktop(); NS.system.dock.renderDock();
    NS.system.winman.wins.forEach(w => {
      if (w.fullscreen) {
        w.el.style.left = '0px'; w.el.style.top = '0px';
        w.el.style.width = window.innerWidth + 'px';
        w.el.style.height = window.innerHeight + 'px';
      } else if (w.maxed) {
        w.el.style.top = '28px';
        w.el.style.width = NS.system.deskEl.clientWidth + 'px';
        w.el.style.height = (NS.system.deskEl.clientHeight - 28) + 'px';
      } else {
        w.el.style.left = clamp(w.el.offsetLeft, -w.el.offsetWidth + 90, NS.system.deskEl.clientWidth - 90) + 'px';
        w.el.style.top = clamp(w.el.offsetTop, 34, NS.system.deskEl.clientHeight - 46) + 'px';
        NS.system.winman.saveWindowRect(w);
      }
    });
    NS.system.dock.scheduleDockCheck();
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 140);
  });

  NS.system.layout = {
    GRID, computeGrid, persistDesktop, persistDock,
    lastDesktopApps, lastDockApps, findEmptyCell, addToDesktop, addToDock,
    addFileToDesktop, removeFileFromDesktop, dragDesktopToDock, dragDockToDesktop, iconPos, clampIcons,
    resetLayout, relayout
  };
  /* 用访问器暴露活状态：任何一处整体赋值都会同步内部闭包引用，
     避免 dock.js 拖拽重排 `NS.system.layout.dockApps = [...]` 后与本地变量失步 */
  Object.defineProperty(NS.system.layout, 'desktopIcons', {
    get: () => desktopIcons,
    set: v => { desktopIcons = v; },
    enumerable: true
  });
  Object.defineProperty(NS.system.layout, 'dockApps', {
    get: () => dockApps,
    set: v => { dockApps = v; },
    enumerable: true
  });
})(window);
