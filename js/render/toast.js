/* ============================================================
   Universe OS · 渲染层 · toast.js
   Toast 提示（挂到 body，#toast 惰性创建，行为与原版一致）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};

  let toastTimer = null;

  function toast(msg, ms) {
    ms = ms === undefined ? 1800 : ms;
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  NS.render.toast = toast;
})(window);
