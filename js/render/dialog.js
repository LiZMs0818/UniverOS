/* ============================================================
   Universe OS · 渲染层 · dialog.js
   确认 / 输入对话框：统一走系统级对话框 API（NS.system.winman.openDialog），
   不再自绘遮罩弹窗——对话框是隶属于调用应用的系统窗口，无背景压暗。
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};

  function sysDialog() {
    const wm = NS.system && NS.system.winman;
    return (wm && typeof wm.openDialog === 'function') ? wm : null;
  }

  /* 确认对话框 → Promise<boolean> */
  function confirmDialog(title, opts) {
    opts = opts || {};
    const wm = sysDialog();
    if (!wm) return Promise.resolve(false);
    const danger = opts.danger !== false;
    return wm.openDialog({
      owner: opts.owner,
      title: opts.title || '确认操作',
      message: title,
      detail: opts.detail || '',
      width: opts.width || 380,
      danger: danger,
      buttons: [
        { label: opts.cancelLabel || '取消', value: false },
        { label: opts.okLabel || '确定', value: true, primary: true, danger: danger }
      ]
    }).then(function (v) { return v === true; });
  }

  /* 输入对话框 → Promise<string|null> */
  function promptDialog(title, def, opts) {
    opts = opts || {};
    const wm = sysDialog();
    if (!wm) return Promise.resolve(null);
    return wm.openDialog({
      owner: opts.owner,
      title: opts.title || title,
      message: opts.message || '',
      input: true,
      value: def === undefined ? '' : def,
      width: opts.width || 380,
      buttons: [
        { label: opts.cancelLabel || '取消', value: null },
        { label: opts.okLabel || '确定', value: true, primary: true }
      ]
    }).then(function (v) { return (typeof v === 'string') ? v : null; });
  }

  NS.render.promptDialog = promptDialog;
  NS.render.confirmDialog = confirmDialog;
})(window);
