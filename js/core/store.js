/* ============================================================
   Universe OS · 系统层 · core/store.js
   Store：localStorage 封装，键统一加 'webos.' 前缀（与旧版兼容）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.core = NS.core || {};

  const Store = {
    prefix: 'webos.',
    get(k, d) {
      try { const v = localStorage.getItem(Store.prefix + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(Store.prefix + k, JSON.stringify(v)); } catch (e) {}
    },
    remove(k) {
      try { localStorage.removeItem(Store.prefix + k); } catch (e) {}
    },
    clearAll() {
      try {
        Object.keys(localStorage)
          .filter(function (k) { return k.startsWith(Store.prefix); })
          .forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  NS.core.store = Store;
})(window);
