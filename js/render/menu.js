/* ============================================================
   Universe OS · 渲染层 · menu.js
   右键菜单系统：showMenu / hideMenu / isMenuOpen（支持多级子菜单、锚点高亮、越界翻折）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const esc = s => NS.core.utils.escapeHtml(s);

  let menuLayers = [], menuAnchorEl = null;

  function clearMenuAnchor() {
    if (menuAnchorEl && menuAnchorEl.isConnected) menuAnchorEl.classList.remove('menu-anchor');
    menuAnchorEl = null;
  }
  function isMenuOpen() { return menuLayers.length > 0; }
  function hideMenu() {
    menuLayers.forEach(el => el.remove());
    menuLayers = [];
    clearMenuAnchor();
  }

  function buildMenuLayer(items, x, y, parentRect) {
    const el = document.createElement('div');
    el.className = 'ctxmenu-popup';
    el.style.zIndex = 20000 + menuLayers.length;

    items.forEach(it => {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'ctx-sep';
        el.appendChild(s);
        return;
      }
      const b = document.createElement('div');
      b.className = 'ctx-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
      const inner = NS.render.h('span', { html: esc(it.label) });
      b.appendChild(NS.render.createElement(inner));
      if (it.children) {
        const arrow = document.createElement('span');
        arrow.className = 'sub-arrow';
        arrow.textContent = '›';
        b.appendChild(arrow);
        if (!it.disabled) {
          const open = ev => {
            ev.stopPropagation();
            const r = b.getBoundingClientRect();
            const idx = menuLayers.indexOf(el);
            if (idx >= 0) { menuLayers.slice(idx + 1).forEach(n => n.remove()); menuLayers.length = idx + 1; }
            buildMenuLayer(it.children, r.right + 4, r.top, r);
          };
          b.addEventListener('mouseenter', open);
          b.addEventListener('click', open);
        }
      } else if (!it.disabled && it.action) {
        b.addEventListener('click', ev => { ev.stopPropagation(); hideMenu(); it.action(); });
      }
      el.appendChild(b);
    });

    document.body.appendChild(el);
    let left = x, top = y;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (parentRect) {
      if (left + w > innerWidth - 8) left = parentRect.left - w - 4;
      if (top + h > innerHeight - 8) top = innerHeight - h - 8;
    } else {
      if (left + w > innerWidth - 8) left = innerWidth - w - 8;
      if (top + h > innerHeight - 8) top = innerHeight - h - 8;
    }
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, top) + 'px';
    menuLayers.push(el);
    return el;
  }

  function showMenu(x, y, items, anchorEl) {
    hideMenu();
    if (anchorEl && anchorEl.isConnected) { anchorEl.classList.add('menu-anchor'); menuAnchorEl = anchorEl; }
    buildMenuLayer(items, x, y, null);
  }

  document.addEventListener('pointerdown', function (e) {
    if (!isMenuOpen()) return;
    if (e.target.closest('.ctxmenu-popup')) return;
    hideMenu();
  }, true);

  NS.render.menu = { showMenu, hideMenu, isMenuOpen, clearMenuAnchor };
})(window);
