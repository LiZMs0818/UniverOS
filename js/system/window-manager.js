/* ============================================================
   Universe OS · 系统层 · window-manager.js
   窗口管理器：wins/zTop/activeWin、openApp、createWindow、焦点/最小化/关闭/全屏/循环
   （窗口骨架与拖拽缩放见 render/window-frame.js，通过 hooks 注入本层行为）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const { $, clamp, compact, escapeHtml } = NS.core.utils;
  const { store } = NS.core;

  const winLayer = $('#win-layer');
  const wins = [];
  let zTop = 10, activeWin = null;

  /* 最近一次指针位置：窗口从“点下去的地方”弹出，而不是从远处的桌面图标弹出 */
  let lastPointer = null;
  window.addEventListener('pointerdown', function (e) {
    lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, true);
  function freshPointer() {
    if (!lastPointer) return null;
    return (Date.now() - lastPointer.t > 1500) ? null : { x: lastPointer.x, y: lastPointer.y };
  }
  function winCenter(w) {
    const wx = parseFloat(w.el.style.left) || 0, wy = parseFloat(w.el.style.top) || 0;
    return { x: wx + (parseFloat(w.el.style.width) || 0) / 2, y: wy + (parseFloat(w.el.style.height) || 0) / 2 };
  }

  /* 同一应用可能同时有桌面图标和 Dock 图标：按给定位置取最近的那个 */
  function iconElsFor(appId) {
    const out = [];
    const idx = NS.system.layout.desktopIcons.findIndex(i => i.appId === appId);
    if (idx >= 0) {
      const el = NS.system.iconsLayer.children[idx];
      if (el) out.push(el);
    }
    const d = NS.system.dock.dockInner.querySelector('[data-app="' + appId + '"]');
    if (d) out.push(d);
    return out;
  }
  function findIconEl(appId, point) {
    const els = iconElsFor(appId);
    if (!els.length) return null;
    if (!point) return els[0];
    let best = els[0], bestD = Infinity;
    els.forEach(function (el) {
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - point.x, dy = r.top + r.height / 2 - point.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = el; }
    });
    return best;
  }
  function popIcon(el, mode) {
    if (!el) return;
    const cls = mode === 'out' ? 'icon-pop-out' : 'icon-pop-in';
    el.classList.remove('icon-pop-out', 'icon-pop-in');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 560);
  }
  function animateIcon(appId, mode, point) {
    popIcon(findIconEl(appId, point), mode);
  }

  /* 关闭/最小化的收缩目标：Dock 图标优先，其次主屏幕图标，都没有就落到屏幕正下方（Dock 所在带） */
  function findCloseEl(appId) {
    const d = NS.system.dock.dockInner.querySelector('[data-app="' + appId + '"]');
    if (d) return d;
    const idx = NS.system.layout.desktopIcons.findIndex(i => i.appId === appId);
    if (idx >= 0) {
      const el = NS.system.iconsLayer.children[idx];
      if (el) return el;
    }
    return null;
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function closeAnchorFor(appId) {
    const el = findCloseEl(appId);
    if (el) return centerOf(el);
    const W = NS.system.deskEl.clientWidth, H = NS.system.deskEl.clientHeight;
    return { x: W / 2, y: H + 10 };
  }

  /* ---------- 系统级对话框窗口（隶属于调用它的应用） ----------
     openDialog({owner,title,message,detail,input,value,width,height,modal,danger,buttons})
     返回 Promise，值为所点按钮的 value（关闭/✕ 为 null，确认类为 true/false）。
     modal:true 的对话框未处理完时，所属应用窗口不允许关闭/最小化（会闪烁提示）。 */
  function buildDialogBody(body, args) {
    const h = NS.render.h;
    const kids = [];
    if (args.message) kids.push(h('div', { className: 'dlg-msg' }, args.message));
    if (args.detail) kids.push(h('div', { className: 'dlg-detail' }, args.detail));
    let inputEl = null;
    if (args.input) {
      kids.push(h('input', {
        className: 'dlg-input', type: 'text', value: args.value || '', spellcheck: 'false',
        ref: el => (inputEl = el)
      }));
    }
    const btns = (args.buttons || []).map(function (b) {
      return h('button', {
        className: 'mini-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''),
        onclick: () => args.onChoice(b.value)
      }, b.label);
    });
    kids.push(h('div', { className: 'dlg-actions' }, btns));
    body.appendChild(NS.render.createElement(h('div', { className: 'dlg' }, kids)));
    args.getInput = () => (inputEl ? inputEl.value.trim() : '');
    if (inputEl) {
      setTimeout(() => { try { inputEl.focus(); inputEl.select(); } catch (e) {} }, 60);
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); args.onChoice(true); }
        if (e.key === 'Escape') { e.preventDefault(); args.onChoice(null); }
      });
    }
  }
  function ensureDialogApp() {
    if (!NS.apps || !NS.apps.APPS) return false;
    if (NS.apps.APPS.__dialog) return true;
    NS.apps.APPS.__dialog = {
      id: '__dialog', name: '提示', hidden: true, multi: true,
      build: function (body, args) { buildDialogBody(body, args); }
    };
    return true;
  }
  function flashDialog(w) {
    if (!w) return;
    w.el.classList.remove('attention');
    void w.el.offsetWidth;
    w.el.classList.add('attention');
    clearTimeout(w._attTimer);
    w._attTimer = setTimeout(() => w.el.classList.remove('attention'), 1300);
    focusWin(w);
  }
  function closeDialog(w, value) {
    if (!w || w._dlgDone) return;
    w._dlgDone = true;
    const i = wins.indexOf(w);
    if (i >= 0) wins.splice(i, 1);
    if (activeWin === w) activeWin = null;
    w.el.classList.remove('entering', 'minimizing', 'attention');
    w.el.classList.add('closing');
    setTimeout(() => { if (w.el.parentNode) w.el.remove(); }, 320);
    if (w.resolve) { try { w.resolve(value); } catch (e) {} }
    NS.system.dock.scheduleDockCheck();
    const back = w.owner && wins.find(x => x.appId === w.owner && !x.min);
    if (back) setTimeout(() => focusWin(back), 80);
  }
  function modalChildrenOf(appId) {
    return wins.filter(x => x.owner === appId && x.dialog && x.modal && !x._dlgDone);
  }
  /* 级联关闭隶属的对话框：只回收 dialog 子窗，普通子窗（预览等）保持独立 */
  function cascadeClose(appId) {
    wins.filter(x => x.owner === appId && x.dialog && !x._dlgDone).forEach(function (k) {
      cascadeClose(k.appId);
      closeDialog(k, null);
    });
  }
  function openDialog(opts) {
    if (!ensureDialogApp()) return Promise.resolve(null);
    const o = opts || {};
    const caller = (activeWin && !activeWin.dialog && activeWin.appId !== '__dialog') ? activeWin : null;
    const owner = o.owner !== undefined ? o.owner : (caller ? caller.appId : null);
    let resolveFn = null;
    const promise = new Promise(function (r) { resolveFn = r; });
    const args = {
      title: o.title || '提示',
      message: o.message || '',
      detail: o.detail || '',
      input: !!o.input,
      value: o.value || '',
      buttons: o.buttons || [
        { label: '取消', value: false },
        { label: '确定', value: true, primary: true, danger: !!o.danger }
      ],
      onChoice: function (v) {
        const out = (v === true && args.input && args.getInput) ? args.getInput() : v;
        closeDialog(dlgW, out);
      }
    };
    const dlgW = openApp('__dialog', args);
    if (!dlgW) return promise;
    dlgW.dialog = true;
    dlgW.modal = o.modal !== false;
    dlgW.owner = owner || null;
    dlgW.resolve = resolveFn;
    dlgW.el.classList.add('dialog');

    const tEl = dlgW.el.querySelector('.win-title');
    if (tEl) tEl.textContent = args.title;

    const W = NS.system.deskEl.clientWidth, H = NS.system.deskEl.clientHeight;
    const dw = Math.min(o.width || 380, W - 32);
    const dh = o.height || (args.input ? 196 : 172);
    let dx = (W - dw) / 2, dy = (H - dh) / 3;
    const ow = owner && wins.find(x => x.appId === owner && !x.dialog && !x._dlgDone);
    if (ow) {
      const ol = parseFloat(ow.el.style.left) || 0, ot = parseFloat(ow.el.style.top) || 0;
      const owW = parseFloat(ow.el.style.width) || 0, owH = parseFloat(ow.el.style.height) || 0;
      dx = ol + (owW - dw) / 2;
      dy = ot + Math.min(150, Math.max(48, owH * 0.22));
    }
    dx = clamp(dx, 16, Math.max(16, W - dw - 16));
    dy = clamp(dy, 34, Math.max(34, H - dh - 24));
    dlgW.el.style.left = dx + 'px';
    dlgW.el.style.top = dy + 'px';
    dlgW.el.style.width = dw + 'px';
    dlgW.el.style.height = dh + 'px';
    dlgW.el.style.minWidth = '0';
    dlgW.el.style.minHeight = '0';
    focusWin(dlgW);
    return promise;
  }
  function collapseAllTraffic(except) {
    wins.forEach(x => {
      const t = x.el.querySelector('.traffic');
      if (t && t !== except) { t.classList.remove('expanded'); clearTimeout(t._collapseTimer); }
    });
  }
  function saveWindowRect(w) {
    if (w.fullscreen) return;
    if (store.get('rememberWindows', true) === false) return;
    store.set('rect.' + w.appId, {
      left: parseInt(w.el.style.left) || 0,
      top: parseInt(w.el.style.top) || 0,
      width: parseInt(w.el.style.width) || 0,
      height: parseInt(w.el.style.height) || 0
    });
  }
  function findAnchorFor(appId, point) {
    const el = findIconEl(appId, point);
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }
  function getOriginForAnchor(a, w) {
    const wx = parseFloat(w.el.style.left) || 0, wy = parseFloat(w.el.style.top) || 0;
    if (!NS.core.theme.forcedLandscape) return { x: a.x - wx, y: a.y - wy };
    const W = window.innerWidth;
    return { x: a.y - wx, y: W - a.x - wy };
  }

  /* ---------- 打开应用 ---------- */
  function openApp(appId, args, opts) {
    NS.system.launcher.closeLauncher();
    const def = NS.apps.APPS[appId];
    if (!def) return;
    if (!def.multi) {
      const exist = wins.find(w => w.appId === appId);
      if (exist) {
        if (exist.min) restoreWin(exist);
        focusWin(exist);
        return exist;
      }
    } else if (args && args.path) {
      const exist = wins.find(w => w.appId === appId && w.args && w.args.path === args.path);
      if (exist) {
        if (exist.min) restoreWin(exist);
        focusWin(exist);
        return exist;
      }
    }
    const pt = freshPointer();
    animateIcon(appId, 'out', pt);
    const w = createWindow(appId, args, pt);
    if (opts && opts.owner) { w.owner = opts.owner; w.dependent = true; }
    wins.push(w);
    focusWin(w);
    NS.system.dock.updateDockRunning();
    NS.system.dock.scheduleDockCheck();
    return w;
  }

  /* ---------- 创建窗口 ---------- */
  function createWindow(appId, args, anchorPoint) {
    const app = NS.apps.APPS[appId];
    const { createWindowFrame } = NS.render.windowFrame;

    const hooks = {
      focusWin, minimizeWin, toggleMax, closeWin,
      saveWindowRect, scheduleDockCheck: () => NS.system.dock.scheduleDockCheck(),
      showMenu: NS.render.menu.showMenu,
      eachWin: fn => wins.forEach(fn),
      showSnapPreview, hideSnapPreview, snapWin, unsnapWin
    };

    const frame = createWindowFrame(app, hooks);
    const el = frame.el;
    const w = { appId, el, args: args || null, min: false, maxed: false, fullscreen: false, restore: null, frame };
    frame.w = w;

    const deskEl = NS.system.deskEl;
    const W = deskEl.clientWidth, H = deskEl.clientHeight;
    const mobile = compact();
    const TOP_MIN = 34;
    let ww, wh, wx, wy;

    const saved = store.get('rect.' + appId, null);
    const MINW = Math.min(400, W - 16), MINH = Math.min(280, H - TOP_MIN - 20);
    if (saved && saved.width > 0 && saved.height > 0) {
      ww = clamp(saved.width, MINW, W - 16); wh = clamp(saved.height, MINH, H - TOP_MIN - 20);
      wx = clamp(saved.left, -ww + 90, W - 90); wy = clamp(saved.top, TOP_MIN, H - 46);
    } else if (mobile) {
      ww = Math.min(W - 16, 620); wh = Math.min(H - 104, 620);
      wx = (W - ww) / 2; wy = Math.max(TOP_MIN, (H - 104 - wh) / 2 + TOP_MIN / 2);
    } else {
      ww = Math.min(680, W * 0.58); wh = Math.min(560, H * 0.68);
      const n = wins.length % 6;
      wx = (W - ww) / 2 + (n - 2.5) * 26; wy = (H - wh) / 2 + (n - 2.5) * 20 - 20;
      wx = clamp(wx, 20, W - ww - 20); wy = clamp(wy, TOP_MIN, H - wh - 100);
    }
    el.style.left = wx + 'px'; el.style.top = wy + 'px';
    el.style.width = ww + 'px'; el.style.height = wh + 'px';
    winLayer.appendChild(el);

    const anchor = anchorPoint || findAnchorFor(appId);
    if (anchor) {
      const o = getOriginForAnchor(anchor, w);
      el.style.transformOrigin = o.x + 'px ' + o.y + 'px';
    }
    void el.offsetWidth;
    el.classList.add('entering');
    setTimeout(() => el.classList.remove('entering'), 450);

    /* 应用挂载：同步/异步异常统一进错误兜底，避免空窗 */
    const mountApp = (buildFn, container, extra) => {
      let p;
      try { p = Promise.resolve(buildFn(container, extra)); } catch (err) { p = Promise.reject(err); }
      return p.catch(err => {
        container.innerHTML = '<div style="padding:20px;color:var(--danger);font-size:13px">应用加载失败：' + escapeHtml(err.message || String(err)) + '</div>';
      });
    };
    if (app.withSidebar) {
      mountApp(app.build, frame.bodyEl, frame.sidebarEl);
    } else {
      mountApp(app.build, frame.bodyEl, args);
    }

    return w;
  }

  /* ---------- 焦点 / 最小化 / 恢复 / 关闭 / 全屏 ---------- */
  function focusWin(w) {
    if (!w) return;
    if (w.min) restoreWin(w);
    /* 隶属的模态对话框未处理完时，焦点强制留在对话框上 */
    if (!w.dialog) {
      const mod = wins.find(x => x.owner === w.appId && x.dialog && x.modal && !x._dlgDone);
      if (mod) { focusWin(mod); return; }
    }
    w.el.style.zIndex = ++zTop;
    wins.forEach(x => {
      x.el.classList.toggle('focused', x === w);
      if (x !== w) {
        const t = x.el.querySelector('.traffic');
        if (t) { t.classList.remove('expanded'); clearTimeout(t._collapseTimer); }
      }
    });
    activeWin = w;
    const app = NS.apps.APPS[w.appId];
    if (app) NS.system.statusbar.updateStatusBarAppName(w.dialog ? ((w.args && w.args.title) || app.name) : app.name);
  }
  function minimizeWin(w) {
    if (w.min || w.dialog) return;
    const minBlockers = modalChildrenOf(w.appId);
    if (minBlockers.length) { minBlockers.forEach(flashDialog); return; }
    if (w.snapped) { document.body.classList.remove('snap-active'); hideSnapPreview(); }
    w.min = true;
    if (w.fullscreen) exitFullscreen(w);
    const ptMin = closeAnchorFor(w.appId);
    const a = ptMin;
    if (a) {
      const o = getOriginForAnchor(a, w);
      w.el.style.transformOrigin = o.x + 'px ' + o.y + 'px';
    }
    w.el.classList.remove('entering');
    void w.el.offsetWidth;
    w.el.classList.add('minimizing');
    popIcon(findCloseEl(w.appId), 'in');
    setTimeout(() => { if (w.min) { w.el.style.display = 'none'; w.el.classList.remove('minimizing'); } }, 310);
    if (activeWin === w) {
      const r = wins.filter(x => x !== w && !x.min);
      activeWin = r.length ? r[r.length - 1] : null;
      if (activeWin) focusWin(activeWin);
    }
    NS.system.dock.scheduleDockCheck();
  }
  function restoreWin(w) {
    if (!w.min) return;
    w.min = false;
    w.el.style.display = '';
    w.el.classList.remove('minimizing', 'entering');
    const ptRestore = freshPointer() || winCenter(w);
    const a = findAnchorFor(w.appId, ptRestore);
    if (a) {
      const o = getOriginForAnchor(a, w);
      w.el.style.transformOrigin = o.x + 'px ' + o.y + 'px';
    }
    void w.el.offsetWidth;
    w.el.classList.add('entering');
    setTimeout(() => w.el.classList.remove('entering'), 450);
    animateIcon(w.appId, 'out', ptRestore);
    NS.system.dock.scheduleDockCheck();
  }
  function closeWin(w) {
    if (!w) return;
    if (w.dialog) { closeDialog(w, null); return; }
    /* 隶属的模态对话框未处理完：拒绝关闭，闪烁对话框提示 */
    const blockers = modalChildrenOf(w.appId);
    if (blockers.length) { blockers.forEach(flashDialog); return; }
    /* 关闭应用前，先把它隶属的窗口（预览窗等）一起关掉 */
    cascadeClose(w.appId);
    if (w.snapped) { document.body.classList.remove('snap-active'); hideSnapPreview(); }
    const i = wins.indexOf(w);
    if (i >= 0) wins.splice(i, 1);
    if (w.fullscreen) exitFullscreen(w);
    saveWindowRect(w);
    const ptClose = closeAnchorFor(w.appId);
    popIcon(findCloseEl(w.appId), 'in');
    const a = ptClose;
    if (a) {
      const o = getOriginForAnchor(a, w);
      w.el.style.transformOrigin = o.x + 'px ' + o.y + 'px';
    }
    void w.el.offsetWidth;
    w.el.classList.remove('entering', 'minimizing');
    w.el.classList.add('closing');
    setTimeout(() => w.el.remove(), 320);
    if (activeWin === w) {
      const r = wins.filter(x => !x.min);
      activeWin = r.length ? r[r.length - 1] : null;
      if (activeWin) focusWin(activeWin);
    }
    NS.system.dock.updateDockRunning();
    NS.system.dock.scheduleDockCheck();
    if (wins.length === 0) NS.system.statusbar.updateStatusBarAppName('Universe');
  }
  function toggleMax(w) {
    const el = w.el;
    if (!w.fullscreen) {
      w.restore = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
      el.classList.add('fullscreen');
      el.style.left = '0px'; el.style.top = '0px';
      el.style.width = '100vw'; el.style.height = '100vh';
      el.style.borderRadius = '0';
      w.fullscreen = true;
      if (el.querySelector('.title-menu-btn')) el.querySelector('.title-menu-btn').style.display = 'inline-block';
      if (el.querySelector('.win-bar')) el.querySelector('.win-bar').style.display = 'flex';
      /* 侧栏窗口全屏：侧栏保持常规布局（交通灯/侧栏均可见），无需特殊处理 */
    } else {
      exitFullscreen(w);
    }
    focusWin(w);
    if (!w.fullscreen) saveWindowRect(w);
    NS.system.dock.scheduleDockCheck();
  }
  function exitFullscreen(w) {
    const el = w.el;
    el.classList.remove('fullscreen');
    if (w.restore) {
      el.style.left = w.restore.left; el.style.top = w.restore.top;
      el.style.width = w.restore.width; el.style.height = w.restore.height;
    } else {
      el.style.left = '80px'; el.style.top = '80px';
      el.style.width = '600px'; el.style.height = '500px';
    }
    el.style.borderRadius = '';
    w.fullscreen = false;
    NS.system.dock.scheduleDockCheck();
  }

  function cycleWindows(back) {
    const a = wins.filter(w => !w.min);
    if (a.length < 2) return;
    const i = a.indexOf(activeWin);
    focusWin(a[(i + (back ? -1 : 1) + a.length) % a.length]);
  }

  /* ---------- 分屏（拖拽边缘悬停出预览，松手开启；隐藏菜单栏与 Dock） ---------- */
  let snapPreviewEl = null;
  function showSnapPreview(side) {
    if (snapPreviewEl) snapPreviewEl.remove();
    snapPreviewEl = document.createElement('div');
    snapPreviewEl.className = 'snap-preview' + (side === 'left' ? ' left' : ' right');
    document.body.appendChild(snapPreviewEl);
  }
  function hideSnapPreview() {
    if (snapPreviewEl) { snapPreviewEl.remove(); snapPreviewEl = null; }
  }
  function snapWin(w, side) {
    if (!w || w.min) return;
    if (w.fullscreen) exitFullscreen(w);
    if (!w.snapRestore) {
      w.snapRestore = { width: w.el.style.width, height: w.el.style.height };
    }
    const desk = NS.system.deskEl;
    const W = desk.clientWidth, H = desk.clientHeight;
    const half = Math.floor(W / 2);
    w.el.classList.add('snapped');
    w.el.style.left = (side === 'left' ? 0 : half) + 'px';
    w.el.style.top = '0px';
    w.el.style.width = half + 'px';
    w.el.style.height = H + 'px';
    w.el.style.borderRadius = '0';
    w.snapped = side;
    document.body.classList.add('snap-active');
    focusWin(w);
    NS.system.dock.scheduleDockCheck();
  }
  function unsnapWin(w) {
    if (!w || !w.snapped) return;
    const r = w.snapRestore || {};
    const nw = parseFloat(r.width) || 600, nh = parseFloat(r.height) || 480;
    const W = NS.system.deskEl.clientWidth;
    const curL = parseFloat(w.el.style.left) || 0, curT = parseFloat(w.el.style.top) || 0;
    w.el.classList.remove('snapped');
    w.el.style.width = nw + 'px';
    w.el.style.height = nh + 'px';
    /* 原地还原：位置基本不动，只把尺寸缩回原大小；右半屏略收避免溢出，顶部避开状态栏 */
    w.el.style.left = Math.min(curL, W - nw) + 'px';
    w.el.style.top = Math.max(curT, 40) + 'px';
    w.el.style.borderRadius = '';
    w.snapped = null;
    w.snapRestore = null;
    document.body.classList.remove('snap-active');
    NS.system.dock.scheduleDockCheck();
  }

  /* ---------- App 切换器（⌘Tab / Alt+Tab） ---------- */
  let switcher = null;
  function openSwitcher(back) {
    if (switcher) { cycleSwitcher(back); return; }
    const seen = [], arr = [];
    wins.forEach(w => {
      if (w.min) return;
      if (seen.indexOf(w.appId) >= 0) return;
      seen.push(w.appId); arr.push(w);
    });
    if (!arr.length) return;
    let idx = Math.max(0, arr.findIndex(w => w === activeWin));
    const overlay = document.createElement('div');
    overlay.className = 'switcher-overlay';
    const row = document.createElement('div');
    row.className = 'switcher-row';
    arr.forEach((w, i) => {
      const app = NS.apps.APPS[w.appId];
      const item = document.createElement('div');
      item.className = 'switcher-item' + (i === idx ? ' active' : '');
      item.dataset.i = i;
      item.innerHTML = '<span class="switcher-ic" style="background:' + (app ? app.bg : '#333') + ';color:' + (app ? app.fg : '#fff') + '">' + (app ? app.icon : '') + '</span><span class="switcher-name">' + (app ? app.name : w.appId) + '</span>';
      row.appendChild(item);
    });
    overlay.appendChild(row);
    document.body.appendChild(overlay);
    switcher = { el: overlay, list: arr, idx };
    overlay.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); });
  }
  function cycleSwitcher(back) {
    if (!switcher) return;
    const n = switcher.list.length;
    switcher.idx = (switcher.idx + (back ? -1 : 1) + n) % n;
    const items = switcher.el.querySelectorAll('.switcher-item');
    items.forEach((it, i) => it.classList.toggle('active', i === switcher.idx));
  }
  function closeSwitcher(pick) {
    if (!switcher) return;
    const w = switcher.list[switcher.idx];
    switcher.el.remove(); switcher = null;
    if (pick && w) focusWin(w);
  }
  document.addEventListener('keydown', function (e) {
    if (!switcher) return;
    if (e.key === 'Tab') { e.preventDefault(); cycleSwitcher(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSwitcher(false); }
  });
  document.addEventListener('keyup', function (e) {
    if (!switcher) return;
    if (e.key === 'Tab' || e.key === 'Escape') return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta && !e.altKey) closeSwitcher(true);
  });

  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.traffic')) collapseAllTraffic(null);
  }, true);

  NS.system.winman = {
    winLayer, wins, activeWin, zTop,
    openApp, createWindow, focusWin, minimizeWin, restoreWin, closeWin,
    openDialog, closeDialog, modalChildrenOf, flashDialog,
    toggleMax, exitFullscreen, cycleWindows, saveWindowRect, findAnchorFor, animateIcon,
    snapWin, unsnapWin, openSwitcher, cycleSwitcher, closeSwitcher
  };
})(window);
