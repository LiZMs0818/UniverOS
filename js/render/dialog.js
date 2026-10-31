/* ============================================================
   Universe OS · 渲染层 · dialog.js
   模态对话框：promptDialog / confirmDialog（声明式构建，Promise 返回）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const h = NS.render.h;
  const { MiniButton } = NS.render.controls;

  function promptDialog(title, def) {
    def = def === undefined ? '' : def;
    return new Promise(resolve => {
      let inputEl = null;
      const overlay = NS.render.createElement(h('div', { className: 'modal-overlay' }, [
        h('div', { className: 'modal-box' }, [
          h('div', { className: 'modal-title' }, title),
          h('input', { className: 'modal-input', type: 'text', value: def, spellcheck: 'false', ref: el => (inputEl = el) }),
          h('div', { className: 'modal-actions' }, [
            MiniButton({ label: '取消', onClick: () => close(null) }),
            MiniButton({ label: '确定', primary: true, onClick: () => close(inputEl.value.trim()) })
          ])
        ])
      ]));
      document.body.appendChild(overlay);
      const close = v => { overlay.remove(); resolve(v); };
      setTimeout(() => { inputEl.focus(); inputEl.select(); }, 60);
      overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(null); });
      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); close(inputEl.value.trim()); }
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
    });
  }

  function confirmDialog(title) {
    return new Promise(resolve => {
      const overlay = NS.render.createElement(h('div', { className: 'modal-overlay' }, [
        h('div', { className: 'modal-box' }, [
          h('div', { className: 'modal-msg' }, title),
          h('div', { className: 'modal-actions' }, [
            MiniButton({ label: '取消', onClick: () => close(false) }),
            MiniButton({ label: '确定', primary: true, onClick: () => close(true) })
          ])
        ])
      ]));
      document.body.appendChild(overlay);
      const close = v => { overlay.remove(); resolve(v); };
      overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(false); });
    });
  }

  NS.render.promptDialog = promptDialog;
  NS.render.confirmDialog = confirmDialog;
})(window);
