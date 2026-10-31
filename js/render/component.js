/* ============================================================
   Universe OS · 渲染层 · component.js
   Component 基类：声明式组件生命周期（state / render / mount / unmount）
   所有应用组件继承它；窗口创建时把 win-body 容器交给 component.mount()
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const { render, mount } = NS.render;

  class Component {
    constructor(props) {
      this.props = props || {};
      this._state = null;   // 延迟初始化：子类在 super() 之后才赋值 initialState
      this._root = null;      // 组件根节点
      this._container = null; // 外部注入的容器（win-body）
      this._sidebarRoot = null;
      this._sidebarEl = null;
      this._mounted = false;
    }

    get state() {
      if (this._state == null) this._state = Object.assign({}, this.initialState || {});
      return this._state;
    }
    set state(v) { this._state = v; }

    /* 声明式入口：子类必须实现，返回 VNode */
    render() { return NS.render.h('div'); }
    /* 可选：带侧栏的应用实现此方法，渲染进 sidebar-body */
    renderSidebar() { return null; }

    setState(partial, cb) {
      if (this._state == null) this._state = Object.assign({}, this.initialState || {});
      Object.assign(this._state, partial);
      if (!this._mounted) { if (cb) cb(); return; }
      this._refresh(cb);
    }

    _refresh(cb) {
      if (this._root && this._root.parentNode) {
        this._root = render(this._root, this.render());
      } else if (this._container) {
        this._container.textContent = '';
        this._root = mount(this._container, this.render());
      }
      this._renderSidebar();
      if (this.componentDidUpdate) this.componentDidUpdate(this._state);
      if (cb) cb();
    }

    _renderSidebar() {
      if (!this._sidebarEl || !this.renderSidebar) return;
      const vnode = this.renderSidebar();
      if (vnode == null) return;
      if (this._sidebarRoot && this._sidebarRoot.parentNode) {
        this._sidebarRoot = render(this._sidebarRoot, vnode);
      } else {
        this._sidebarEl.textContent = '';
        this._sidebarRoot = mount(this._sidebarEl, vnode);
      }
    }

    /* 由窗口管理器调用：把组件装进容器（可带侧栏容器） */
    mount(container, sidebarEl) {
      this._container = container;
      this._sidebarEl = sidebarEl || null;
      container.textContent = '';
      if (this._sidebarEl) this._sidebarEl.textContent = '';
      this._root = mount(container, this.render());
      this._renderSidebar();
      this._mounted = true;
      if (this.componentDidMount) this.componentDidMount();
      return this._root;
    }

    unmount() {
      this._mounted = false;
      if (this.componentWillUnmount) this.componentWillUnmount();
      if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
      if (this._sidebarRoot && this._sidebarRoot.parentNode) this._sidebarRoot.parentNode.removeChild(this._sidebarRoot);
      this._root = null;
      this._sidebarRoot = null;
      this._container = null;
      this._sidebarEl = null;
    }

    /* 便捷：让某个后代节点获得焦点（如输入框） */
    focus(selector) {
      const n = this._root ? this._root.querySelector(selector) : null;
      if (n) n.focus();
    }
  }

  NS.render.Component = Component;
})(window);
