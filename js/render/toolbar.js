/* ============================================================
   Universe OS · 渲染层 · toolbar.js
   声明式工具栏（Satellite 卫星条）：应用只声明「要哪些工具」，
   系统在窗口外缘渲染一条悬浮工具条，不占内容区。
   声明项：
     { icon, title, onClick, active, disabled }   工具按钮（26px 正圆）
     { primary: true, icon, title, onClick }      收尾主操作（36px 实心强调色圆钮）
     '|'                                          分组分隔线
   应用在 Component 上实现 getToolbar() 返回声明数组；
   窗口层负责挂载（frame.setToolbar），应用 setState 后自动刷新。
   位置：data-position ∈ left / right / top / bottom，拖动后吸附到最近一侧；
   无交互 1.5s 自动收纳成 36px 方块，hover 即展开。
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const h = NS.render.h;

  const COLLAPSE_DELAY = 1500;   /* 与参考文件一致：无交互 1.5s 收纳 */

  function iconMarkup(icon) {
    if (!icon) return '';
    if (icon.charAt(0) === '<') return icon;             /* 直接给 SVG 源码 */
    const UI = NS.render.icons.UI;
    return UI[icon] || '';
  }

  function buildButton(item) {
    const btn = NS.render.createElement(h('button', {
      type: 'button',
      className: 'tool-btn' + (item.active ? ' on' : ''),
      title: item.title || '',
      'aria-label': item.title || '',
      disabled: !!item.disabled,
      html: iconMarkup(item.icon)
    }));
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (btn.disabled) return;
      if (typeof item.onClick === 'function') item.onClick(e);
    });
    return btn;
  }

  function buildPrimary(item) {
    const btn = NS.render.createElement(h('button', {
      type: 'button',
      className: 'primary-action',
      title: item.title || '',
      'aria-label': item.title || '',
      disabled: !!item.disabled,
      html: iconMarkup(item.icon)
    }));
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (btn.disabled) return;
      if (typeof item.onClick === 'function') item.onClick(e);
    });
    return btn;
  }

  function render(items, sat) {
    if (!sat || !sat.pillEl) return;
    const list = (items || []).filter(Boolean);
    const pill = sat.pillEl;
    pill.textContent = '';

    let count = 0;
    let primaryItem = null;

    list.forEach(function (it) {
      if (!it) return;
      if (it.primary) { primaryItem = it; return; }
      if (it === '|' || it === '-') {
        if (!count) return;                              /* 跳过开头的分隔线 */
        pill.appendChild(NS.render.createElement(h('div', { className: 'toolbar__divider' })));
        return;
      }
      pill.appendChild(buildButton(it));
      count++;
    });

    /* 结尾多余的分隔线 */
    while (pill.lastChild && pill.lastChild.className === 'toolbar__divider') {
      pill.removeChild(pill.lastChild);
    }

    /* 主操作：整条卫星条的收尾，独立于胶囊 */
    const oldPrimary = sat.primaryEl;
    if (primaryItem) {
      const btn = buildPrimary(primaryItem);
      if (oldPrimary) oldPrimary.replaceWith(btn);
      else sat.contentEl.appendChild(btn);
      sat.primaryEl = btn;
    } else if (oldPrimary) {
      oldPrimary.remove();
      sat.primaryEl = null;
    }

    const empty = !count && !primaryItem;
    pill.classList.toggle('is-empty', count === 0);
    sat.el.classList.toggle('is-empty', empty);
  }

  /* ---------- 行为：收纳 / 拖动吸附 ---------- */
  function bindBehavior(sat) {
    let drag = null;
    let timer = null;

    const expand = function () {
      clearTimeout(timer);
      sat.el.classList.remove('collapsed');
    };
    const scheduleCollapse = function () {
      clearTimeout(timer);
      if (drag) return;
      timer = setTimeout(function () { sat.el.classList.add('collapsed'); }, COLLAPSE_DELAY);
    };

    sat.el.addEventListener('pointerenter', expand);
    sat.el.addEventListener('pointerleave', scheduleCollapse);
    sat.triggerEl.addEventListener('click', function (e) {
      e.stopPropagation();
      expand();
    });

    sat.el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.tool-btn, .primary-action')) return;
      if (e.target.closest('.win-satellite__trigger')) expand();
      const wr = sat.winEl.getBoundingClientRect();
      const r = sat.el.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, l: r.left - wr.left, t: r.top - wr.top };
      sat.el.classList.add('dragging');
      clearTimeout(timer);
      try { sat.el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      e.preventDefault();
    });

    sat.el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      sat.el.style.left = (drag.l + e.clientX - drag.x) + 'px';
      sat.el.style.top = (drag.t + e.clientY - drag.y) + 'px';
      sat.el.style.right = 'auto';
      sat.el.style.bottom = 'auto';
    });

    const endDrag = function (e) {
      if (!drag) return;
      drag = null;
      sat.el.classList.remove('dragging');
      try {
        if (e && sat.el.hasPointerCapture(e.pointerId)) sat.el.releasePointerCapture(e.pointerId);
      } catch (err) { /* noop */ }
      snap();
      scheduleCollapse();
    };
    sat.el.addEventListener('pointerup', endDrag);
    sat.el.addEventListener('pointercancel', endDrag);

    /* 松手后吸附到最近的一侧：清掉行内偏移，交回 CSS 定位 */
    function snap() {
      const wr = sat.winEl.getBoundingClientRect();
      const r = sat.el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - wr.left;
      const cy = r.top + r.height / 2 - wr.top;
      const dist = {
        left: Math.abs(cx),
        right: Math.abs(wr.width - cx),
        top: Math.abs(cy),
        bottom: Math.abs(wr.height - cy)
      };
      let best = 'left';
      Object.keys(dist).forEach(function (k) { if (dist[k] < dist[best]) best = k; });
      sat.el.style.left = '';
      sat.el.style.top = '';
      sat.el.style.right = '';
      sat.el.style.bottom = '';
      sat.el.dataset.position = best;
    }

    sat.setPosition = function (pos) {
      sat.el.style.left = '';
      sat.el.style.top = '';
      sat.el.style.right = '';
      sat.el.style.bottom = '';
      sat.el.dataset.position = pos;
    };
    sat.expand = expand;
    sat.collapse = function () { sat.el.classList.add('collapsed'); };

    /* 挂载即开始计时：1.5s 无交互自动收纳 */
    scheduleCollapse();
  }

  /* 挂到窗口元素上：卫星条是窗口的子元素，但用绝对定位悬在窗口外缘 */
  function create(winEl, position) {
    const trigger = NS.render.createElement(h('button', {
      type: 'button',
      className: 'win-satellite__trigger',
      'aria-label': '展开工具条'
    }, [
      h('span', { className: 'bar' }),
      h('span', { className: 'bar' }),
      h('span', { className: 'bar' })
    ]));

    const pill = NS.render.createElement(h('div', { className: 'toolbar-pill' }));
    const content = NS.render.createElement(h('div', { className: 'win-satellite__content' }));
    content.appendChild(pill);
    const inner = NS.render.createElement(h('div', { className: 'win-satellite__inner' }));
    inner.appendChild(content);

    const el = NS.render.createElement(h('div', {
      className: 'win-satellite',
      dataset: { position: position || 'left' }
    }));
    el.appendChild(inner);
    el.appendChild(trigger);

    const sat = {
      el: el,
      winEl: winEl,
      pillEl: pill,
      contentEl: content,
      triggerEl: trigger,
      primaryEl: null
    };
    bindBehavior(sat);
    render([], sat);
    return sat;
  }

  NS.render.toolbar = { create: create, render: render };
})(window);
