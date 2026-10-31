/* ============================================================
   Universe OS · 渲染层 · res.js
   极简声明式渲染引擎：h() 虚拟节点 + createElement + patch/mount
   （原生零依赖，ES module 在 file:// 下会被 CORS 拦截，故用传统 script + window 命名空间）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};

  /* ---------- h()：构建虚拟节点 VNode {tag, props, children} ----------
     h('div', {className:'a', onclick:fn}, '文本', [h('span'), ...])
     子节点数组递归拍平（支持多层嵌套，如 map(g => [标题, items.map(...)])） */
  function h(tag, props) {
    const children = [];
    const collect = function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(collect); return; }
      children.push(c);
    };
    Array.prototype.slice.call(arguments, 2).forEach(collect);
    return { tag: tag, props: props || {}, children: children };
  }

  /* ---------- 属性挂载（事件走 addEventListener，样式支持对象/字符串） ---------- */
  function setProp(el, key, val) {
    if (key === 'className' || key === 'class') { el.className = val; return; }
    if (key === 'html') { el.innerHTML = val; return; }
    if (key === 'text') { el.textContent = val; return; }
    if (key === 'style') {
      if (typeof val === 'string') el.style.cssText = val;
      else for (const k in val) el.style[k] = val[k];
      return;
    }
    if (key === 'dataset') {
      for (const k in val) {
        try { el.dataset[k] = val[k]; } catch (e) { el.setAttribute('data-' + k.toLowerCase(), String(val[k])); }
      }
      return;
    }
    if (key === 'ref') { if (typeof val === 'function') val(el); return; }
    if (key === 'key' || key === 'refEl') return;
    if (key === 'value' || key === 'checked') {
      try { el[key] = val; } catch (e) {}
      return;
    }
    if (key.slice(0, 2) === 'on' && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
      return;
    }
    if (val === true) { el.setAttribute(key, ''); return; }
    if (val === false || val == null) return;
    el.setAttribute(key, String(val));
  }

  /* ---------- 虚拟节点 → 真实 DOM ---------- */
  function createElement(vnode) {
    if (vnode == null || vnode === false) return document.createComment('empty');
    if (typeof vnode === 'string' || typeof vnode === 'number') return document.createTextNode(String(vnode));
    const el = vnode.tag === 'svg'
      ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      : document.createElement(vnode.tag);
    if (vnode.props) for (const k in vnode.props) setProp(el, k, vnode.props[k]);
    for (let i = 0; i < vnode.children.length; i++) el.appendChild(createElement(vnode.children[i]));
    return el;
  }

  /* ---------- 挂载 / 替换 / 列表重建 ---------- */
  function mount(parent, vnode) {
    const el = createElement(vnode);
    parent.appendChild(el);
    return el;
  }

  /* 用 vnode 渲染结果替换既有节点 el，返回新节点 */
  function render(el, vnode) {
    const parent = el.parentNode;
    const newEl = createElement(vnode);
    parent.replaceChild(newEl, el);
    return newEl;
  }

  /* 列表容器重建：清空后按 vnodes 全量插入，返回元素数组 */
  function renderList(container, vnodes, keyFn) {
    container.textContent = '';
    const els = [];
    for (let i = 0; i < vnodes.length; i++) {
      const el = createElement(vnodes[i]);
      if (keyFn) el.setAttribute('data-key', keyFn(vnodes[i], i));
      container.appendChild(el);
      els.push(el);
    }
    return els;
  }

  NS.render.h = h;
  NS.render.createElement = createElement;
  NS.render.mount = mount;
  NS.render.render = render;
  NS.render.renderList = renderList;
  NS.render.setProp = setProp;
})(window);
