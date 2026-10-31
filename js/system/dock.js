/* ============================================================
   Universe OS · 系统层 · dock.js
   Dock：渲染、hover 放大、拖拽重排/移除、running 圆点、
   窗口入侵检测（docked + home-indicator）、全屏隐藏
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const { $, $$, clamp, bindTap } = NS.core.utils;
  const { store } = NS.core;

  const dockEl = $('#dock');
  const dockInner = $('#dockInner');
  const homeIndicator = $('#home-indicator');

  function updateDockScale() {
    const baseSize = store.get('dockSize', 52);
    const count = NS.system.layout.dockApps.length + 2;
    if (count <= 0) return;
    const maxWidth = window.innerWidth - 16;
    const gap = count > 6 ? 4 : (count > 4 ? 6 : 8);
    const padding = count > 6 ? 16 : 20;
    const sepWidth = 11;
    const available = maxWidth - padding - sepWidth - (count - 1) * gap;
    let size = Math.min(baseSize, Math.floor(available / count));
    size = clamp(size, 32, baseSize);
    const iconSize = Math.round(size * 0.92);
    const radius = Math.max(Math.round(size * 0.27), 18);
    const padY = count > 6 ? 6 : 8;
    document.documentElement.style.setProperty('--dock-item-size', size + 'px');
    document.documentElement.style.setProperty('--dock-icon-size', iconSize + 'px');
    document.documentElement.style.setProperty('--dock-radius', radius + 'px');
    document.documentElement.style.setProperty('--dock-gap', gap + 'px');
    document.documentElement.style.setProperty('--dock-pad-y', padY + 'px');
  }

  function renderDock() {
    const APPS = NS.apps.APPS;
    const oldSet = new Set(NS.system.layout.lastDockApps);
    dockInner.textContent = '';
    NS.system.layout.dockApps.forEach(appId => {
      const app = APPS[appId];
      if (!app) return;
      const el = document.createElement('div');
      el.className = 'dock-item';
      if (!oldSet.has(appId)) el.classList.add('dock-new');
      el.dataset.app = appId;
      el.title = app.name;
      el.innerHTML = '<span class="di-ic" style="background:' + app.bg + ';color:' + app.fg + '">' + app.icon + '</span>';

      let dragging = false, startP = null;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startP = { x: e.clientX, y: e.clientY };
        dragging = false;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', function (e) {
        if (!startP) return;
        const dx = e.clientX - startP.x, dy = e.clientY - startP.y;
        if (!dragging && Math.hypot(dx, dy) < 8) return;
        dragging = true;
        el.classList.add('dragging');
        const sibs = Array.from(dockInner.children).filter(x => x !== el);
        let placed = false;
        for (const s of sibs) {
          const r = s.getBoundingClientRect();
          if (e.clientX < r.left + r.width / 2) { dockInner.insertBefore(el, s); placed = true; break; }
        }
        if (!placed) dockInner.appendChild(el);
        const dr = dockEl.getBoundingClientRect();
        const dist = Math.max(dr.left - e.clientX, e.clientX - dr.right, dr.top - e.clientY, e.clientY - dr.bottom, 0);
        el.classList.toggle('removing', dist > 55);
      });
      el.addEventListener('pointerup', function (e) {
        const wasDragging = dragging;
        el.classList.remove('dragging', 'removing');
        el.style.pointerEvents = 'none';
        setTimeout(() => { el.style.pointerEvents = ''; }, 50);
        if (startP && wasDragging) {
          const dr = dockEl.getBoundingClientRect();
          const dist = Math.max(dr.left - e.clientX, e.clientX - dr.right, dr.top - e.clientY, e.clientY - dr.bottom, 0);
          if (dist > 55) NS.system.layout.dragDockToDesktop(appId);
          else {
            NS.system.layout.dockApps = Array.from(dockInner.children)
              .map(x => x.dataset.app)
              .filter(a => a && APPS[a] && a !== 'trash');
            NS.system.layout.persistDock();
          }
        }
        startP = null;
        dragging = false;
      });
      el.addEventListener('pointercancel', function () {
        if (startP) {
          startP = null;
          dragging = false;
          el.classList.remove('dragging', 'removing');
          renderDock();
        }
      });

      bindTap(el, {
        onSingle: () => NS.system.winman.openApp(appId),
        onDouble: ev => showDockMenu(ev.clientX, ev.clientY, appId, el),
        isDragging: () => dragging
      });
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showDockMenu(e.clientX, e.clientY, appId, el);
      });
      dockInner.appendChild(el);
    });

    /* Dock 尾部固定分隔线 + 废纸篓（mac 风格，不可拖拽重排） */
    const sep = document.createElement('div');
    sep.className = 'dock-sep';
    dockInner.appendChild(sep);
    const trashApp = APPS.trash;
    if (trashApp) {
      const tr = document.createElement('div');
      tr.className = 'dock-item dock-trash';
      tr.title = '废纸篓';
      tr.innerHTML = '<span class="di-ic" style="background:' + trashApp.bg + ';color:' + trashApp.fg + '">' + trashApp.icon + '</span>';
      bindTap(tr, { onSingle: () => NS.system.winman.openApp('trash'), isDragging: () => false });
      tr.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        NS.render.menu.showMenu(e.clientX, e.clientY, [
          { label: '打开废纸篓', action: () => NS.system.winman.openApp('trash') },
          { sep: true },
          { label: '清空废纸篓', danger: true, action: () => NS.apps.trash.emptyTrash().then(() => NS.render.toast('废纸篓已清空')) }
        ]);
      });
      dockInner.appendChild(tr);
    }
    NS.system.layout.lastDockApps = NS.system.layout.dockApps.slice();
    updateDockScale();
    updateDockRunning();
  }

  function updateDockRunning() {
    $$('.dock-item', dockInner).forEach(el => {
      el.classList.toggle('running', NS.system.winman.wins.some(w => w.appId === el.dataset.app));
    });
  }

  function showDockMenu(x, y, appId, el) {
    const app = NS.apps.APPS[appId];
    const onDesk = NS.system.layout.desktopIcons.some(i => i.appId === appId);
    NS.render.menu.showMenu(x, y, [
      { label: '打开「' + app.name + '」', action: () => NS.system.winman.openApp(appId) },
      { label: onDesk ? '已在主屏幕' : '添加到主屏幕', disabled: onDesk, action: () => NS.system.layout.addToDesktop(appId) },
      { sep: true },
      { label: '从 Dock 移除', danger: true, action: () => NS.system.layout.dragDockToDesktop(appId) }
    ], el);
  }

  /* ---------- Dock 图标悬停放大 ---------- */
  (function () {
    let rafId = null;
    let mx = 0, my = 0, inside = false, inDock = false;
    function clearDockHover() {
      inside = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      $$('.dock-item', dockInner).forEach(el => { el.style.transform = ''; });
    }
    /* 以 dock 元素进出为准：离开 dock 立即还原，杜绝放大残留 */
    dockEl.addEventListener('pointerenter', function () { inDock = true; });
    dockEl.addEventListener('pointerleave', function () { inDock = false; clearDockHover(); });
    document.addEventListener('pointermove', function (e) {
      if (!inDock) { clearDockHover(); return; }
      const dr = dockEl.getBoundingClientRect();
      inside = e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top - 6 && e.clientY <= dr.bottom + 6;
      if (inside) {
        mx = e.clientX; my = e.clientY;
        if (!rafId) rafId = requestAnimationFrame(applyDockHover);
      } else {
        clearDockHover();
      }
    });
    document.addEventListener('pointerleave', clearDockHover);
    function applyDockHover() {
      rafId = null;
      if (!inside) return;
      const items = $$('.dock-item', dockInner);
      const RANGE = 120;
      items.forEach(el => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const dist = Math.abs(mx - cx);
        let scale = 1;
        if (dist < RANGE) {
          const t = 1 - dist / RANGE;
          scale = 1 + 0.5 * t * t;
        }
        el.style.transform = 'scale(' + scale.toFixed(3) + ') translateY(' + (-8 * (scale - 1)).toFixed(1) + 'px)';
      });
    }
  })();

  /* ---------- 窗口入侵 → docked + home indicator ---------- */
  let dockManual = false, dockManualTimer = null, manualHidden = false;
  function isAnyWindowIntruding() {
    const wins = NS.system.winman.wins;
    if (wins.length === 0) return false;
    const INTRUDE_LINE = 140;
    const vp = window.innerHeight;
    const dr = dockEl.getBoundingClientRect();
    return wins.some(w => {
      if (w.min || w.el.style.display === 'none' || w.fullscreen) return false;
      const r = w.el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (vp - r.bottom > INTRUDE_LINE) return false;
      return r.left < dr.right && r.right > dr.left;
    });
  }
  function updateDockVisibility() {
    const wins = NS.system.winman.wins;
    const anyFullscreen = wins.some(w => w.fullscreen && !w.min);
    if (anyFullscreen) {
      /* Dock 保持可见可用（用户可从中启动其他应用），仅隐藏状态栏与桌面图标 */
      document.body.classList.add('win-fullscreen');
      $('#statusbar').classList.add('ui-hidden');
      $('#icons-layer').classList.add('ui-hidden');
      homeIndicator.classList.remove('visible');
      return;
    }
    document.body.classList.remove('win-fullscreen');
    $('#statusbar').classList.remove('ui-hidden');
    $('#icons-layer').classList.remove('ui-hidden');
    if (manualHidden) {
      dockEl.classList.add('ui-hidden');
      homeIndicator.classList.remove('visible');
      return;
    }
    dockEl.classList.remove('ui-hidden');
    const intrude = isAnyWindowIntruding();
    if (intrude && !dockManual) {
      dockEl.classList.add('docked');
      homeIndicator.classList.add('visible');
    } else if (intrude && dockManual) {
      dockEl.classList.remove('docked');
      homeIndicator.classList.remove('visible');
    } else {
      dockManual = false;
      clearTimeout(dockManualTimer);
      dockEl.classList.remove('docked');
      homeIndicator.classList.remove('visible');
    }
  }
  /* 菜单栏「显示 → 隐藏/显示 Dock」：手动隐藏标志，优先于自动显示逻辑 */
  function toggleManualHidden() {
    manualHidden = !manualHidden;
    updateDockVisibility();
    return manualHidden;
  }
  let dockCheckPending = false;
  function scheduleDockCheck() {
    if (dockCheckPending) return;
    dockCheckPending = true;
    requestAnimationFrame(() => {
      dockCheckPending = false;
      updateDockVisibility();
    });
  }
  homeIndicator.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!dockEl.classList.contains('docked')) return;
    dockManual = true;
    dockEl.classList.remove('docked');
    homeIndicator.classList.remove('visible');
    clearTimeout(dockManualTimer);
    dockManualTimer = setTimeout(() => { dockManual = false; updateDockVisibility(); }, 3000);
  });
  document.addEventListener('pointerdown', function (e) {
    if (!dockManual) return;
    if (e.target.closest('#dock') || e.target === homeIndicator) return;
    dockManual = false;
    clearTimeout(dockManualTimer);
    updateDockVisibility();
  }, true);

  NS.system.dock = {
    dockEl, dockInner, homeIndicator,
    renderDock, updateDockRunning, updateDockScale,
    isAnyWindowIntruding, updateDockVisibility, scheduleDockCheck, toggleManualHidden
  };
})(window);
