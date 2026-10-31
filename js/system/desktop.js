/* ============================================================
   Universe OS · 系统层 · desktop.js
   桌面图标：渲染、拖拽占位/互换、拖到 Dock、双击/右键菜单、文件项
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const { $, $$, clamp, getLocalPoint, bindTap, fileIconSvg, escapeHtml } = NS.core.utils;

  const iconsLayer = NS.system.iconsLayer;
  const ghostEl = NS.system.ghostEl;

  function renderDesktop() {
    const APPS = NS.apps.APPS;
    const { GRID, desktopIcons, lastDesktopApps, iconPos, persistDesktop } = NS.system.layout;
    const oldSet = new Set(lastDesktopApps);
    iconsLayer.textContent = '';
    ghostEl.classList.remove('on');
    desktopIcons.forEach((it, i) => {
      let app, iconHtml, label;
      if (it.appId === 'fileitem') {
        app = { name: it.name };
        iconHtml = '<img src="" style="display:none">';
        label = it.name;
      } else {
        app = APPS[it.appId];
        if (!app) return;
        iconHtml = app.icon;
        label = app.name;
      }
      const el = document.createElement('div');
      el.className = 'desk-icon';
      if (!oldSet.has(it.appId + (it.file || ''))) el.classList.add('desk-new');
      el.style.width = GRID.cw + 'px';
      el.style.height = GRID.ch + 'px';
      if (it.appId === 'fileitem') {
        el.innerHTML = '<div class="ic" style="background:#64748b;color:#fff">' + fileIconSvg(it.name, 'file') + '</div><div class="lb">' + escapeHtml(label) + '</div>';
      } else {
        el.innerHTML = '<div class="ic" style="background:' + app.bg + ';color:' + app.fg + '">' + app.icon + '</div><div class="lb">' + escapeHtml(label) + '</div>';
      }
      iconPos(el, it.col, it.row);

      let dragging = false, dragTarget = null, startP = null, startLeft = 0, startTop = 0;
      let dragTimer = null, holdArmed = false;
      const HOLD_MS = 400;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        startP = getLocalPoint(e);
        startLeft = parseFloat(el.style.left) || 0;
        startTop = parseFloat(el.style.top) || 0;
        dragging = false;
        holdArmed = false;
        clearTimeout(dragTimer);
        /* 长按解锁拖动，防单击/短移误触 */
        dragTimer = setTimeout(function () { holdArmed = true; }, HOLD_MS);
      });
      el.addEventListener('pointermove', function (e) {
        if (!startP || !holdArmed) return;
        const p = getLocalPoint(e);
        const dx = p.x - startP.x, dy = p.y - startP.y;
        if (!dragging && Math.hypot(dx, dy) < 8) return;
        dragging = true;
        el.classList.add('dragging');
        ghostEl.classList.add('on');
        let nl = startLeft + dx, nt = startTop + dy;
        nl = clamp(nl, -GRID.cw * 0.4, NS.system.deskEl.clientWidth - GRID.cw * 0.6);
        nt = clamp(nt, -GRID.ch * 0.4, NS.system.deskEl.clientHeight - GRID.ch * 0.6);
        el.style.left = nl + 'px';
        el.style.top = nt + 'px';
        const col = clamp(Math.round((nl - GRID.padX) / GRID.cw), 0, GRID.cols - 1);
        const row = clamp(Math.round((nt - GRID.padY) / GRID.ch), 0, GRID.rows - 1);
        dragTarget = { col, row };
        ghostEl.style.left = (GRID.padX + col * GRID.cw) + 'px';
        ghostEl.style.top = (GRID.padY + row * GRID.ch) + 'px';
        ghostEl.style.width = GRID.cw + 'px';
        ghostEl.style.height = GRID.ch + 'px';
        const dr = NS.system.dock.dockEl.getBoundingClientRect();
        NS.system.dock.dockEl.classList.toggle('dock-target', e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom);
      });
      el.addEventListener('pointerup', function (e) {
        const wasDragging = dragging;
        clearTimeout(dragTimer);
        if (startP) {
          el.classList.remove('dragging');
          ghostEl.classList.remove('on');
          NS.system.dock.dockEl.classList.remove('dock-target');
          if (wasDragging) {
            const dr = NS.system.dock.dockEl.getBoundingClientRect();
            const willToDock = e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom;
            if (willToDock && it.appId !== 'fileitem') NS.system.layout.dragDesktopToDock(it.appId);
            else if (dragTarget) dropIcon(i, dragTarget.col, dragTarget.row, el);
            else renderDesktop();
          }
          startP = null;
          dragging = false;
          dragTarget = null;
          holdArmed = false;
        }
      });
      el.addEventListener('pointercancel', function () {
        clearTimeout(dragTimer);
        if (startP) {
          startP = null;
          dragging = false;
          holdArmed = false;
          el.classList.remove('dragging');
          ghostEl.classList.remove('on');
          renderDesktop();
        }
      });

      bindTap(el, {
        onSingle: function () {
          if (it.appId === 'fileitem') openFileItem(it.file);
          else NS.system.winman.openApp(it.appId);
        },
        onDouble: function (ev) {
          if (it.appId === 'fileitem') showFileItemMenu(ev.clientX, ev.clientY, it);
          else showIconMenu(ev.clientX, ev.clientY, i);
        },
        isDragging: () => dragging || holdArmed
      });
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (it.appId === 'fileitem') showFileItemMenu(e.clientX, e.clientY, it);
        else showIconMenu(e.clientX, e.clientY, i);
      });
      iconsLayer.appendChild(el);
    });
    NS.system.layout.lastDesktopApps = desktopIcons.map(i => i.appId + (i.file || ''));
  }

  function openFileItem(path) {
    const ext = path.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].indexOf(ext) >= 0) NS.system.winman.openApp('imageviewer', { path });
    else NS.system.winman.openApp('texteditor', { path });
  }

  function showFileItemMenu(x, y, it) {
    NS.render.menu.showMenu(x, y, [
      { label: '打开', action: () => openFileItem(it.file) },
      { sep: true },
      {
        label: '从桌面移除', danger: true, action: () => {
          const idx = NS.system.layout.desktopIcons.indexOf(it);
          if (idx >= 0) {
            NS.system.layout.desktopIcons.splice(idx, 1);
            NS.system.layout.persistDesktop();
            renderDesktop();
          }
        }
      }
    ]);
  }

  function showIconMenu(x, y, idx) {
    const it = NS.system.layout.desktopIcons[idx];
    if (!it) return;
    const app = NS.apps.APPS[it.appId];
    if (!app) return;
    const inDock = NS.system.layout.dockApps.indexOf(it.appId) >= 0;
    NS.render.menu.showMenu(x, y, [
      { label: '打开「' + app.name + '」', action: () => NS.system.winman.openApp(it.appId) },
      { label: inDock ? '已在 Dock' : '添加到 Dock', disabled: inDock, action: () => NS.system.layout.addToDock(it.appId) },
      { sep: true },
      {
        label: '从桌面移除', danger: true, action: () => {
          const el = iconsLayer.children[idx];
          if (el) el.classList.add('desk-leaving');
          setTimeout(() => {
            NS.system.layout.desktopIcons.splice(idx, 1);
            NS.system.layout.persistDesktop();
            renderDesktop();
          }, 240);
        }
      }
    ], iconsLayer.children[idx]);
  }

  function dropIcon(fromIdx, col, row, el) {
    const { desktopIcons, iconPos, persistDesktop } = NS.system.layout;
    const from = desktopIcons[fromIdx];
    if (!from) return;
    const occ = desktopIcons.findIndex((x, i) => i !== fromIdx && x.col === col && x.row === row);
    if (occ >= 0) {
      desktopIcons[occ].col = from.col;
      desktopIcons[occ].row = from.row;
    }
    from.col = col;
    from.row = row;
    persistDesktop();
    const children = Array.from(iconsLayer.children);
    el.classList.remove('dragging');
    void el.offsetWidth;
    desktopIcons.forEach((it, i) => {
      const c = children[i];
      if (c) iconPos(c, it.col, it.row);
    });
  }

  /* 点桌面空白：隐藏菜单、清理 pressed 态 */
  NS.system.deskEl.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.ctxmenu-popup') || e.target.closest('.modal-overlay')) return;
    if (!e.target.closest('.desk-icon')) $$('.desk-icon', iconsLayer).forEach(n => n.classList.remove('pressed'));
    NS.render.menu.hideMenu();
  }, true);

  /* 全局右键：未落在图标/条目上时隐藏菜单 */
  window.addEventListener('contextmenu', function (e) {
    if (!e.target.closest('.desk-icon') && !e.target.closest('.dock-item') &&
        !e.target.closest('.launcher-item') && !e.target.closest('.fm-item')) {
      e.preventDefault();
      NS.render.menu.hideMenu();
    }
  });

  NS.system.desktop = { renderDesktop, openFileItem, showFileItemMenu, showIconMenu, dropIcon };
})(window);
