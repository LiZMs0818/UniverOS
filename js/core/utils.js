/* ============================================================
   Universe OS · 系统层 · core/utils.js
   通用工具：选择器、转义、格式化、点击抑制、tap/双击、文件图标、坐标换算
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.core = NS.core || {};

  /* ---------- 全局交互抑制：禁止拖拽/选中、点击节流 ---------- */
  document.addEventListener('selectstart', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
  }, true);
  document.addEventListener('dragstart', e => {
    if (!e.target.closest('input, textarea')) e.preventDefault();
  }, true);

  let suppressClickUntil = 0;
  function suppressClicks(ms) {
    suppressClickUntil = Date.now() + (ms === undefined ? 350 : ms);
  }
  window.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- 基础工具 ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const compact = () => window.innerWidth < 760;
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function formatSize(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function blobToDataURL(blob) {
    return new Promise(function (res) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.readAsDataURL(blob);
    });
  }

  /* 强制横屏下的坐标换算 */
  function getLocalPoint(e) {
    if (!NS.core.theme.forcedLandscape) return { x: e.clientX, y: e.clientY };
    const W = window.innerWidth;
    return { x: e.clientY, y: W - e.clientX };
  }

  /* ---------- tap / 双击（兼容拖拽判定与全局点击抑制） ----------
     桌面端（鼠标 pointerType==='mouse'）：单击立即响应，无双击判定等待，
     双击操作由各处的 contextmenu（右键）承担；触摸端保留 380ms 双击判定。 */
  const TAP_DELAY = 380, DOUBLE_GAP = 300;
  function bindTap(el, opts) {
    opts = opts || {};
    let tapTimer = null, lastTapAt = 0, startP = null, moved = false;
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      moved = false;
      startP = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointermove', e => {
      if (!startP) return;
      if (Math.hypot(e.clientX - startP.x, e.clientY - startP.y) > 8) {
        moved = true;
        clearTimeout(tapTimer);
        tapTimer = null;
        lastTapAt = 0;
      }
    });
    el.addEventListener('pointerup', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!startP) return;
      startP = null;
      if (moved) return;
      if (opts.isDragging && opts.isDragging()) return;
      /* 桌面端鼠标：单击立即触发（无 300/380ms 双击判断等待） */
      if (e.pointerType === 'mouse') {
        if (opts.onSingle) opts.onSingle(e);
        return;
      }
      const now = Date.now();
      if (lastTapAt && now - lastTapAt < DOUBLE_GAP) {
        clearTimeout(tapTimer);
        tapTimer = null;
        lastTapAt = 0;
        suppressClicks();
        if (opts.onDouble) opts.onDouble(e);
      } else {
        lastTapAt = now;
        clearTimeout(tapTimer);
        if (opts.onSingle) {
          tapTimer = setTimeout(() => {
            tapTimer = null;
            if (Date.now() - lastTapAt >= DOUBLE_GAP - 20) { lastTapAt = 0; opts.onSingle(e); }
          }, TAP_DELAY);
        } else {
          tapTimer = setTimeout(() => { tapTimer = null; lastTapAt = 0; }, TAP_DELAY);
        }
      }
    });
    el.addEventListener('pointercancel', () => {
      clearTimeout(tapTimer);
      tapTimer = null;
      lastTapAt = 0;
      startP = null;
    });
  }

  /* ---------- 文件类型 SVG 图标 ---------- */
  function fileIconSvg(name, kind) {
    if (kind === 'directory') {
      return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 10a3 3 0 0 1 3-3h8l3 3h15a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#4da3ff"/>' +
        '<path d="M4 14h32v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#6db5ff"/></svg>';
    }
    const ext = name.split('.').pop().toLowerCase();
    const wrap = (inner, color) => '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M10 4h14l10 10v22a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="' + color + '"/>' +
      '<path d="M24 4v10h10" fill="rgba(255,255,255,.35)"/>' + inner + '</svg>';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].indexOf(ext) >= 0)
      return wrap('<circle cx="17" cy="21" r="3" fill="#fff"/><path d="M10 32l7-8 5 5 3-3 6 6z" fill="#fff" opacity=".85"/>', '#22c55e');
    if (['mp4', 'mov', 'webm', 'avi', 'mkv'].indexOf(ext) >= 0)
      return wrap('<path d="M16 19l9 5-9 5z" fill="#fff"/>', '#ef4444');
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].indexOf(ext) >= 0)
      return wrap('<circle cx="20" cy="26" r="3" fill="#fff"/><path d="M22 26V18l6-2v8" stroke="#fff" stroke-width="1.7" fill="none"/><circle cx="25" cy="24" r="3" fill="#fff"/>', '#a855f7');
    if (['zip', 'rar', '7z', 'tar', 'gz'].indexOf(ext) >= 0)
      return wrap('<path d="M20 12v16M17 15h6M17 19h6M17 23h6" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>', '#eab308');
    if (['js', 'ts', 'json', 'html', 'css', 'xml', 'yaml', 'yml', 'py', 'go', 'rs', 'c', 'cpp', 'sh'].indexOf(ext) >= 0)
      return wrap('<text x="20" y="29" font-family="monospace" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">&lt;/&gt;</text>', '#3b82f6');
    if (['pdf'].indexOf(ext) >= 0)
      return wrap('<text x="20" y="29" font-family="sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">PDF</text>', '#dc2626');
    if (['md', 'txt', 'log'].indexOf(ext) >= 0)
      return wrap('<path d="M14 18h12M14 22h12M14 26h8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>', '#64748b');
    return wrap('<path d="M14 18h12M14 22h12M14 26h8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>', '#94a3b8');
  }

  NS.core.utils = {
    $, $$, clamp, compact, escapeHtml, formatSize,
    getLocalPoint, bindTap, suppressClicks, blobToDataURL, fileIconSvg
  };

  /* 与原版一致：这些高频工具同时暴露为 window 全局（多文件共用全局命名空间） */
  G.$ = $;
  G.$$ = $$;
  G.clamp = clamp;
  G.compact = compact;
  G.escapeHtml = escapeHtml;
})(window);
