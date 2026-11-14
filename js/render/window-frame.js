/* ============================================================
   Universe OS · 渲染层 · window-frame.js
   窗口骨架：声明式构建窗口 DOM（标题栏/侧栏/红绿灯/缩放柄），
   并绑定拖拽、缩放、红绿灯展开、标题菜单等窗口级交互。
   系统层的窗口管理器通过 hooks 注入行为，实现渲染/系统解耦。
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const h = NS.render.h;

  function createWindowFrame(app, hooks) {
    const useSidebar = !!app.withSidebar;
    const useToolbar = !!app.toolbar;
    const frame = {
      app: app, useSidebar: useSidebar, useToolbar: useToolbar, chromeless: false,
      el: null, bodyEl: null, sidebarEl: null,
      traffic: null, dragHandle: null, resizeEl: null,
      titleMenuBtn: null, toolbarSlot: null, toolbarEl: null,
      createdAt: Date.now()
    };

    /* 交通灯图标：指针靠近整组时三枚同时浮现（macOS 行为） */
    const SVG = (d) => '<svg class="tl-glyph" viewBox="0 0 12 12" fill="none" stroke="currentColor"'
      + ' stroke-width="1.3" stroke-linecap="round">' + d + '</svg>';
    const trafficBtns = [
      h('button', { className: 'tl close', ref: el => (frame.btnClose = el),
        html: SVG('<path d="M3.6 3.6 L8.4 8.4"/><path d="M8.4 3.6 L3.6 8.4"/>') }),
      h('button', { className: 'tl min', ref: el => (frame.btnMin = el),
        html: SVG('<path d="M3.2 6 H8.8"/>') }),
      h('button', { className: 'tl max', ref: el => (frame.btnMax = el),
        html: SVG('<path d="M6.6 6.6 L8.9 4.3"/><path d="M6.6 4.3 H8.9 V6.6"/>'
          + '<path d="M5.4 5.4 L3.1 7.7"/><path d="M5.4 7.7 H3.1 V5.4"/>') })
    ];

    let vnode;
    if (useSidebar) {
      vnode = h('div', { className: 'window with-sidebar', dataset: { app: app.id } }, [
        h('div', { className: 'sidebar-float' }, [
          h('div', { className: 'sidebar-head', ref: el => (frame.dragHandle = el) }, [
            h('div', { className: 'traffic', ref: el => (frame.traffic = el) }, trafficBtns),
            h('div', { className: 'sidebar-title' }, app.name)
          ]),
          h('div', { className: 'sidebar-body', ref: el => (frame.sidebarEl = el) })
        ]),
        h('div', { className: 'win-content' }, [
          h('div', { className: 'win-body', ref: el => (frame.bodyEl = el) })
        ]),
        h('div', { className: 'win-resize', ref: el => (frame.resizeEl = el) })
      ]);
    } else if (useToolbar) {
      /* 无标题栏窗口：红绿灯浮在内容左上角，整窗交给内容；工具走窗口外缘的卫星条 */
      frame.chromeless = true;
      vnode = h('div', { className: 'window chromeless', dataset: { app: app.id } }, [
        h('div', { className: 'win-float' }, [
          h('div', { className: 'traffic', ref: el => (frame.traffic = el) }, trafficBtns)
        ]),
        h('div', { className: 'win-body', ref: el => (frame.bodyEl = el) }),
        h('div', { className: 'win-resize', ref: el => (frame.resizeEl = el) })
      ]);
    } else {
      vnode = h('div', { className: 'window', dataset: { app: app.id } }, [
        h('div', { className: 'win-bar', ref: el => (frame.dragHandle = el) }, [
          h('div', { className: 'traffic', ref: el => (frame.traffic = el) }, trafficBtns),
          h('div', { className: 'win-title' }, [
            h('span', { className: 'title-text' }, app.name),
            h('span', { className: 'title-menu-btn', ref: el => (frame.titleMenuBtn = el) }, '▾')
          ])
        ]),
        h('div', { className: 'win-body', ref: el => (frame.bodyEl = el) }),
        h('div', { className: 'win-resize', ref: el => (frame.resizeEl = el) })
      ]);
    }

    frame.el = NS.render.createElement(vnode);
    if (frame.chromeless) frame.dragHandle = frame.el;

    /* ---------- 声明式工具栏：应用声明，系统渲染成窗口外缘的卫星条 ----------
       卫星条挂在窗口之外的锚盒里（窗口自带 backdrop-filter，子元素会被裁到窗口内），
       锚盒与窗口同位置同尺寸，靠 ResizeObserver / MutationObserver 跟随拖动与缩放 */
    if (useToolbar) {
      frame.satellite = NS.render.toolbar.create(frame.el, 'left');
      frame.toolbarEl = frame.satellite.el;
    }
    frame.mountSatellite = function () {
      if (frame.satAnchor || !useToolbar) return;
      if (!frame.el.parentNode) { setTimeout(frame.mountSatellite, 0); return; }
      const anchor = NS.render.createElement(h('div', { className: 'win-sat-anchor', dataset: { app: app.id } }));
      anchor.appendChild(frame.satellite.el);
      frame.el.parentNode.appendChild(anchor);
      frame.satAnchor = anchor;
      frame.syncSat();
      if (G.ResizeObserver) {
        frame._satRO = new ResizeObserver(frame.syncSat);
        frame._satRO.observe(frame.el);
      }
      if (G.MutationObserver) {
        frame._satMO = new MutationObserver(frame.syncSat);
        frame._satMO.observe(frame.el, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    };
    frame.syncSat = function () {
      if (!frame.satAnchor) return;
      const el = frame.el, a = frame.satAnchor.style;
      const hidden = el.style.display === 'none'
        || el.classList.contains('closing') || el.classList.contains('minimizing');
      a.display = hidden ? 'none' : '';
      if (hidden) return;
      a.left = el.offsetLeft + 'px';
      a.top = el.offsetTop + 'px';
      a.width = el.offsetWidth + 'px';
      a.height = el.offsetHeight + 'px';
      a.zIndex = String((parseInt(el.style.zIndex, 10) || 1) + 1);
    };
    frame.destroySat = function () {
      if (frame._satRO) frame._satRO.disconnect();
      if (frame._satMO) frame._satMO.disconnect();
      if (frame.satAnchor) frame.satAnchor.remove();
      frame.satAnchor = null;
    };
    frame.setToolbar = function (items) {
      if (!frame.satellite) return;
      frame._lastToolbar = items;
      frame.mountSatellite();
      NS.render.toolbar.render(items, frame.satellite);
    };
    frame.refreshToolbarWidth = function () {
      if (frame.setToolbar && frame.satellite) frame.setToolbar(frame._lastToolbar || []);
    };

    /* ---------- 红绿灯：移动端 tap 展开 + 防误触守卫 ---------- */
    const isMobile = () => matchMedia('(pointer:coarse)').matches || window.innerWidth <= 760;
    const collapseAllTraffic = except => {
      hooks.eachWin(x => {
        const t = x.el.querySelector('.traffic');
        if (t && t !== except) { t.classList.remove('expanded'); clearTimeout(t._collapseTimer); }
      });
    };
    frame.traffic.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.tl')) return;
      if (!isMobile()) return;
      if (frame.traffic.classList.contains('expanded')) return;
      e.preventDefault(); e.stopPropagation();
      collapseAllTraffic(frame.traffic);
      frame.traffic.classList.add('expanded');
      clearTimeout(frame.traffic._collapseTimer);
      frame.traffic._collapseTimer = setTimeout(() => frame.traffic.classList.remove('expanded'), 3000);
      NS.core.utils.suppressClicks(300);
    }, true);
    frame.el.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.traffic')) { frame.traffic.classList.remove('expanded'); clearTimeout(frame.traffic._collapseTimer); }
      hooks.focusWin(frame.w);
    }, true);

    const guard = fn => ev => {
      ev.stopPropagation();
      if (Date.now() - frame.createdAt < 400) return;
      fn();
      frame.traffic.classList.remove('expanded');
      clearTimeout(frame.traffic._collapseTimer);
    };
    frame.btnClose.onclick = guard(() => hooks.closeWin(frame.w));
    frame.btnMin.onclick = guard(() => hooks.minimizeWin(frame.w));
    frame.btnMax.onclick = guard(() => hooks.toggleMax(frame.w));

    /* 标题菜单（全屏时使用） */
    if (frame.titleMenuBtn) {
      frame.titleMenuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const r = frame.titleMenuBtn.getBoundingClientRect();
        hooks.showMenu(r.left, r.bottom + 4, [
          { label: '最小化', action: () => hooks.minimizeWin(frame.w) },
          { label: '全屏切换', action: () => hooks.toggleMax(frame.w) },
          { sep: true },
          { label: '关闭', danger: true, action: () => hooks.closeWin(frame.w) }
        ]);
      });
    }

    /* ---------- 拖拽（含边缘悬停分屏：抵住屏幕边缘出预览，松手开启） ---------- */
    const U = NS.core.utils;
    const TOP_MIN = 34;
    /* 无标题栏窗口没有可拖的条：顶部 44px 空白即为拖拽区（按钮与红绿灯除外） */
    const inChromeBand = function (e) {
      if (!frame.chromeless) return true;
      if (e.target.closest('.tl') || e.target.closest('.win-satellite')) return false;
      const r = frame.el.getBoundingClientRect();
      return e.clientY - r.top <= 44;
    };
    frame.dragHandle.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.tl')) return;
      if (!inChromeBand(e)) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      hooks.focusWin(frame.w);
      if (frame.w.maxed || frame.w.fullscreen) return;
      /* 分屏态拖标题栏即还原窗口（原地缩回原尺寸） */
      if (frame.w.snapped) hooks.unsnapWin(frame.w);
      const p0 = U.getLocalPoint(e);
      const ox = frame.el.offsetLeft, oy = frame.el.offsetTop;
      frame.dragHandle.setPointerCapture && (() => { try { frame.dragHandle.setPointerCapture(e.pointerId); } catch (err) {} })();
      let snapSide = null, snapTimer = null, previewShown = false;
      const clearSnap = () => {
        clearTimeout(snapTimer); snapTimer = null; snapSide = null;
        if (previewShown) { previewShown = false; hooks.hideSnapPreview(); }
      };
      const onMove = ev => {
        const p = U.getLocalPoint(ev);
        let nx = ox + p.x - p0.x, ny = oy + p.y - p0.y;
        const W = NS.system.deskEl.clientWidth;
        nx = U.clamp(nx, 0, W - frame.el.offsetWidth);
        ny = U.clamp(ny, TOP_MIN, NS.system.deskEl.clientHeight - 46);
        frame.el.style.left = nx + 'px'; frame.el.style.top = ny + 'px';
        /* 边缘悬停：贴住左/右边缘且不再移动，抵住一段时间显示分屏预览 */
        const nearL = nx <= 3, nearR = nx >= W - frame.el.offsetWidth - 3;
        if (nearL || nearR) {
          const side = nearL ? 'left' : 'right';
          if (snapSide !== side) {
            clearTimeout(snapTimer);
            snapTimer = setTimeout(() => { previewShown = true; hooks.showSnapPreview(side); }, 600);
          }
          snapSide = side;
        } else clearSnap();
        hooks.scheduleDockCheck();
      };
      const onUp = () => {
        frame.dragHandle.removeEventListener('pointermove', onMove);
        frame.dragHandle.removeEventListener('pointerup', onUp);
        frame.dragHandle.removeEventListener('pointercancel', onUp);
        const side = snapSide;
        const wasPreview = previewShown;
        clearSnap();
        if (side && wasPreview) hooks.snapWin(frame.w, side);
        else hooks.saveWindowRect(frame.w);
        hooks.scheduleDockCheck();
      };
      frame.dragHandle.addEventListener('pointermove', onMove);
      frame.dragHandle.addEventListener('pointerup', onUp);
      frame.dragHandle.addEventListener('pointercancel', onUp);
    });
    frame.dragHandle.addEventListener('dblclick', function (e) {
      if (e.target.closest('.tl')) return;
      if (!inChromeBand(e)) return;
      hooks.toggleMax(frame.w);
    });

    /* ---------- 缩放 ---------- */
    frame.resizeEl.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (frame.w.maxed || frame.w.fullscreen) return;
      hooks.focusWin(frame.w);
      const p0 = U.getLocalPoint(e);
      const ow = frame.el.offsetWidth, oh = frame.el.offsetHeight;
      frame.resizeEl.setPointerCapture(e.pointerId);
      const onMove = ev => {
        const p = U.getLocalPoint(ev);
        frame.el.style.width = Math.max(400, ow + p.x - p0.x) + 'px';
        frame.el.style.height = Math.max(280, oh + p.y - p0.y) + 'px';
        hooks.scheduleDockCheck();
      };
      const onUp = () => {
        frame.resizeEl.removeEventListener('pointermove', onMove);
        frame.resizeEl.removeEventListener('pointerup', onUp);
        frame.resizeEl.removeEventListener('pointercancel', onUp);
        hooks.saveWindowRect(frame.w);
        hooks.scheduleDockCheck();
      };
      frame.resizeEl.addEventListener('pointermove', onMove);
      frame.resizeEl.addEventListener('pointerup', onUp);
      frame.resizeEl.addEventListener('pointercancel', onUp);
    });

    return frame;
  }

  NS.render.windowFrame = { createWindowFrame };
})(window);
